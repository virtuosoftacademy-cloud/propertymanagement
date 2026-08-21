/**
 * PropertyPro - Plan unit allowance
 *
 * MANAGER_PLANS carries a `unitLimit` per plan, but until now it was only ever
 * rendered — nothing enforced it, so a Free account could hold any number of
 * units. This is the single place that decides whether one more unit may be
 * created, so the two write paths that add units (creating a property, and
 * adding a unit to a multi-unit property) cannot drift apart.
 *
 * SERVER ONLY — it reads the database.
 */

import { Property, Subscription } from "@/models";
import { propertyScopeFilter, canViewAllProperties } from "@/lib/auth/property-scope";
import { MANAGER_PLANS, resolvePlan, DEFAULT_PLAN_ID } from "./plans";
import { getPlan, getPlans } from "./plan-store";

/** Machine-readable so the UI can tell this apart from a generic 403. */
export const UNIT_LIMIT_CODE = "UNIT_LIMIT_REACHED";

export interface UnitAllowance {
  planId: string;
  planName: string;
  /** null = unlimited. */
  limit: number | null;
  used: number;
  /** How many units the caller was trying to add. */
  requested: number;
  /** Whether `requested` more units may be created. */
  allowed: boolean;
}

type ScopeUser = {
  id: string;
  role: string;
  assignedRole?: string;
  permissions?: string[];
};

/**
 * Which plan governs this user.
 *
 * The subscription record is authoritative — it is what the client is actually
 * paying for. `assignedRole` is the fallback because registration sets the
 * user's role to the plan id, so it agrees with the account in the normal case
 * and is still right when no account row exists yet.
 */
async function planIdFor(user: ScopeUser): Promise<string> {
  const account: any = await Subscription.findOne({
    userId: user.id,
    deletedAt: null,
    status: { $in: ["active", "pending", "past_due"] },
  })
    .sort({ createdAt: -1 })
    .select("planId")
    .lean();

  if (account?.planId && (await getPlan(account.planId))) return account.planId;

  const role = user.assignedRole || "";
  if (role && (await getPlan(role))) return role;

  return DEFAULT_PLAN_ID;
}

/**
 * How many units this user already holds: the sum of `totalUnits` across every
 * property in their scope. `totalUnits` is maintained by the Property model
 * (units.length, or 1 for a single-unit property), so it counts both shapes
 * without special-casing.
 */
async function unitsUsed(user: ScopeUser): Promise<number> {
  // null means "sees everything" (admins). They are exempt above, so this is
  // only reached by scoped users; `?? {}` keeps the type honest either way.
  const filter = propertyScopeFilter(user as any) ?? {};
  const rows: any[] = await Property.find(filter).select("totalUnits").lean();
  return rows.reduce((sum, p) => sum + (p.totalUnits || 1), 0);
}

/**
 * Whether `wanted` more units may be created. Admins are exempt: they are the
 * vendor of these plans, not a subscriber to one.
 */
export async function getUnitAllowance(
  user: ScopeUser,
  wanted = 1
): Promise<UnitAllowance> {
  if (canViewAllProperties(user as any)) {
    return {
      planId: "admin",
      planName: "Admin",
      limit: null,
      used: 0,
      requested: wanted,
      allowed: true,
    };
  }

  const planId = await planIdFor(user);
  // Reads the role-backed catalogue, falling back to the const — see plan-store.
  let plan: { name: string; unitLimit: number | null } | undefined =
    await getPlan(planId);

  // Fail CLOSED. `plan?.unitLimit ?? null` reads an unresolvable plan as
  // "unlimited", so a stale or renamed plan id silently removes the ceiling
  // for everyone it applies to. Fall back to the most restrictive real plan
  // instead, and say so — a wrongly-restricted user complains, a wrongly
  // unlimited one never does.
  if (!plan) {
    console.error(
      `[billing] Unknown plan "${planId}" for user ${user.id} — falling back to the most restrictive plan.`
    );
    const all = await getPlans();
    plan = [...all]
      .filter((p) => p.unitLimit !== null)
      .sort((a, b) => (a.unitLimit as number) - (b.unitLimit as number))[0];
  }

  const limit = plan?.unitLimit ?? null;

  // Unlimited plans still report `used`, so the UI can show a count.
  if (limit === null) {
    return {
      planId,
      planName: plan?.name ?? planId,
      limit: null,
      used: await unitsUsed(user),
      requested: wanted,
      allowed: true,
    };
  }

  const used = await unitsUsed(user);

  return {
    planId,
    planName: plan?.name ?? planId,
    limit,
    used,
    requested: wanted,
    allowed: used + wanted <= limit,
  };
}

/** Message shown to the user when they hit the ceiling. */
export function unitLimitMessage(a: UnitAllowance): string {
  const cap = `${a.limit} unit${a.limit === 1 ? "" : "s"}`;

  // Two genuinely different refusals. Reporting only current usage said
  // "you're using 0" to someone adding two units on a one-unit plan, which
  // reads as though they had room and the refusal was a mistake.
  if (a.used >= (a.limit ?? 0)) {
    return `Your ${a.planName} plan includes ${cap}, and you're already using ${a.used}. Upgrade to add more.`;
  }

  const total = a.used + a.requested;
  return `Your ${a.planName} plan includes ${cap}. Adding ${a.requested} would take you to ${total}. Upgrade to add more.`;
}
