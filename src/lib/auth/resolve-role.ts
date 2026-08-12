/**
 * PropertyPro - Custom role resolution
 *
 * Bridges the gap between the admin-created roles in the `roles` collection and
 * the three-value UserRole enum that every API guard is written against.
 *
 * Before this existed, an admin could create a role, give it permissions and
 * assign it to a user — and that user was then refused by all 83 guarded API
 * routes, because withRoleAndDB compares against the enum and had never heard
 * of "agent". The role feature wrote to a system nothing read.
 *
 * A custom role declares `inheritsFrom` (admin | manager | tenant), which is
 * the access level it behaves as. Its `permissions` array is carried through
 * to handlers so routes can make finer checks where they want to.
 */

import { Role } from "@/models";
import { UserRole } from "@/types";

export interface ResolvedRole {
  /** What the guards compare against. */
  effectiveRole: UserRole;
  /** The raw value stored on the user, e.g. "agent". */
  assignedRole: string;
  /** True when the assigned role is not one of the three built-ins. */
  isCustom: boolean;
  permissions: string[];
}

const BASE_ROLES = new Set<string>([
  UserRole.ADMIN,
  UserRole.MANAGER,
  UserRole.TENANT,
]);

/**
 * Short-lived cache. withRoleAndDB runs on every API request, and role
 * definitions change rarely; without this, each request by a custom-role user
 * would add a database round trip. Kept deliberately brief so a permission
 * change takes effect quickly.
 */
const CACHE_TTL_MS = 30_000;
const cache = new Map<string, { value: ResolvedRole; expires: number }>();

/** Called after a role is edited or deleted so the next request re-reads it. */
export function invalidateRoleCache(roleName?: string) {
  if (roleName) cache.delete(roleName);
  else cache.clear();
}

export async function resolveUserRole(
  assignedRole: string | undefined | null
): Promise<ResolvedRole> {
  const name = (assignedRole ?? "").trim();

  // Built-in roles resolve without touching the database — this is the common
  // path and must stay as cheap as it was before.
  if (!name || BASE_ROLES.has(name)) {
    const effective = (BASE_ROLES.has(name) ? name : UserRole.TENANT) as UserRole;
    return {
      effectiveRole: effective,
      assignedRole: name || UserRole.TENANT,
      isCustom: false,
      permissions: [],
    };
  }

  const cached = cache.get(name);
  if (cached && cached.expires > Date.now()) return cached.value;

  let resolved: ResolvedRole;

  try {
    const role: any = await Role.findOne({
      name,
      isActive: true,
      deletedAt: null,
    })
      .select("name inheritsFrom permissions")
      .lean();

    resolved = role
      ? {
          effectiveRole: (role.inheritsFrom ?? UserRole.TENANT) as UserRole,
          assignedRole: name,
          isCustom: true,
          permissions: Array.isArray(role.permissions) ? role.permissions : [],
        }
      : {
          // An unknown or deactivated role falls back to tenant rather than
          // failing open. The user keeps minimal access instead of none, and
          // instead of everything.
          effectiveRole: UserRole.TENANT,
          assignedRole: name,
          isCustom: true,
          permissions: [],
        };
  } catch {
    // A lookup failure must not hand out elevated access.
    resolved = {
      effectiveRole: UserRole.TENANT,
      assignedRole: name,
      isCustom: true,
      permissions: [],
    };
  }

  cache.set(name, { value: resolved, expires: Date.now() + CACHE_TTL_MS });
  return resolved;
}

/**
 * Every role NAME that resolves to staff-level access (admin or manager).
 *
 * For queries that look users up BY ROLE, e.g. finding someone to auto-assign
 * or escalate to. `User.role` stores the raw assigned name, so a query like
 * `{ role: { $in: [ADMIN, MANAGER] } }` silently excludes every custom role —
 * including one created specifically to do the work.
 *
 * Returns the three built-ins plus the names of active custom roles inheriting
 * from admin or manager. Falls back to the built-ins alone if the lookup fails,
 * which preserves current behaviour rather than returning nothing.
 */
export async function staffRoleNames(): Promise<string[]> {
  const builtIn = [UserRole.ADMIN, UserRole.MANAGER] as string[];

  try {
    const custom = await Role.find({
      inheritsFrom: { $in: ["admin", "manager"] },
      isActive: true,
      deletedAt: null,
    })
      .select("name")
      .lean();

    return [...builtIn, ...(custom as any[]).map((r) => r.name)];
  } catch {
    return builtIn;
  }
}

/** Permission check for routes that need finer granularity than a role. */
export function hasPermission(
  resolved: Pick<ResolvedRole, "effectiveRole" | "permissions">,
  permission: string
): boolean {
  // Admin is unconditional — it is the built-in superuser.
  if (resolved.effectiveRole === UserRole.ADMIN) return true;
  return resolved.permissions.includes(permission);
}
