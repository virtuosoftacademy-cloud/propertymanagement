/**
 * PropertyPro - Fine-grained permission gate
 *
 * Refines a route that is already role-gated. `withRoleAndDB([...])` decides
 * WHICH ROLES may reach a handler; this decides whether a specific
 * admin-created role may perform that particular action.
 *
 * The important subtlety: `resolveUserRole()` returns `permissions: []` for the
 * three BUILT-IN roles — only admin-created roles carry a permission array. So
 * requiring a permission outright would lock out a built-in MANAGER from routes
 * they can use today. Instead:
 *
 *   - ADMIN            → always allowed (built-in superuser)
 *   - built-in MANAGER → allowed; the route's role list is the authority
 *   - custom role      → must hold the permission (or its *_management parent)
 *
 * So granting a custom role "compliance_view" but not "compliance_delete" now
 * actually means something, while nothing changes for the built-in roles.
 *
 * The predicate itself lives in ./permissions so it stays free of the auth
 * stack and can be tested directly.
 */

import { createErrorResponse } from "@/lib/api-utils";
import { hasActionPermission, type PermissionUser } from "@/lib/auth/permissions";
import type { NextResponse } from "next/server";

export { hasActionPermission } from "@/lib/auth/permissions";

/**
 * Returns a 403 response when the action is not permitted, otherwise null.
 *
 *   const denied = requirePermission(user, "compliance_delete");
 *   if (denied) return denied;
 */
export function requirePermission(
  user: PermissionUser,
  permission: string
): NextResponse<any> | null {
  if (hasActionPermission(user, permission)) return null;

  return createErrorResponse(
    `Your role does not have the "${permission}" permission`,
    403
  );
}
