/**
 * PropertyPro - Who a property may be assigned to
 *
 * `managerId` is not decoration: per-property visibility keys off it
 * (lib/auth/property-scope.ts), so assigning a property is granting someone
 * access to it. Only an admin may direct that — the route handlers already
 * enforce who may *set* the field. This decides who may legitimately *receive*
 * it.
 *
 * Rejects:
 *   - ids that match no user, or a soft-deleted / deactivated one
 *   - ADMINS. Admins already see every property, so assigning one grants
 *     nothing while making the property read as though its access were
 *     restricted to that person. The property form deliberately leaves them out
 *     of the dropdown; without this the rule lived only in the UI and a direct
 *     API call sailed past it.
 *   - TENANTS. A tenant is the subject of a property, never its manager.
 *
 * Deliberately NOT restricted to the literal `manager` role: custom roles
 * (agent, manual_manager, …) resolve to `manager` via `inheritsFrom`, and those
 * are legitimate assignees. Resolution is used rather than string matching on
 * the raw name so a role named "site_manager" and one named "agent" are judged
 * by what they actually inherit.
 */

import mongoose from "mongoose";
import { User } from "@/models";
import { resolveUserRole } from "@/lib/auth/resolve-role";
import { UserRole } from "@/types";

// mongoose's own validator rather than the one in lib/api-utils: that module
// imports next-auth at load time, and a pure validation helper has no business
// pulling the whole auth stack (or being untestable outside a request).
const isObjectId = (v: string) => mongoose.Types.ObjectId.isValid(v);

export interface AssignmentCheck {
  ok: boolean;
  /** Present when ok is false — safe to return to the caller. */
  message?: string;
}

export async function validateAssignedManager(
  managerId: unknown
): Promise<AssignmentCheck> {
  // Clearing the assignment is always allowed.
  if (managerId === null || managerId === undefined || managerId === "") {
    return { ok: true };
  }

  const id = String(managerId);

  if (!isObjectId(id)) {
    return { ok: false, message: "Invalid assigned user" };
  }

  // Raw driver: the model's pre-find hook hides soft-deleted users, and one of
  // those must be reported as "not assignable" rather than "does not exist".
  const target: any = await User.collection.findOne({
    _id: new mongoose.Types.ObjectId(id),
  });

  if (!target) {
    return { ok: false, message: "Assigned user not found" };
  }

  if (target.deletedAt || target.isActive === false) {
    return {
      ok: false,
      message: "That user is deactivated and cannot be assigned",
    };
  }

  const resolved = await resolveUserRole(target.role);

  if (resolved.effectiveRole === UserRole.ADMIN || target.role === "admin") {
    return {
      ok: false,
      message:
        "Admins already see every property, so they cannot be set as the assigned user",
    };
  }

  if (resolved.effectiveRole === UserRole.TENANT) {
    return { ok: false, message: "A tenant cannot be assigned a property" };
  }

  return { ok: true };
}
