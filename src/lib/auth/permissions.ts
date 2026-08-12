/**
 * PropertyPro - Permission predicate (pure)
 *
 * Deliberately dependency-free apart from the UserRole enum: importing
 * api-utils here would pull in the whole auth stack, which makes the logic
 * impossible to exercise outside the Next runtime. The response-building
 * wrapper lives in require-permission.ts.
 *
 * See require-permission.ts for the reasoning behind the three-way rule.
 */

import { UserRole } from "@/types";

export interface PermissionUser {
  role: UserRole;
  isCustomRole?: boolean;
  permissions?: string[];
}

/**
 * A `<group>_management` permission implies every finer permission in that
 * group — "compliance_management" covers compliance_view/create/edit/delete.
 * Mirrors how the roles UI groups them.
 */
export function impliedBy(permission: string): string[] {
  const group = permission.split("_")[0];
  return [permission, `${group}_management`];
}

/**
 * - ADMIN            → always allowed (built-in superuser)
 * - built-in role    → allowed; the route's withRoleAndDB list is the authority
 * - custom role      → must hold the permission (or its *_management parent)
 *
 * The built-in branch matters: resolveUserRole() returns `permissions: []` for
 * the three built-in roles, so requiring a permission outright would lock a
 * built-in MANAGER out of routes they can use today.
 */
export function hasActionPermission(
  user: PermissionUser | null | undefined,
  permission: string
): boolean {
  if (user?.role === UserRole.ADMIN) return true;
  if (!user?.isCustomRole) return true;

  const held = user.permissions ?? [];
  return impliedBy(permission).some((p) => held.includes(p));
}
