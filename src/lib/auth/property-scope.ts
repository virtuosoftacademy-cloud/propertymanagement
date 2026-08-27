/**
 * PropertyPro - Per-property visibility scope
 *
 * A user sees a property they CREATED or one an admin ASSIGNED to them.
 * Everything else is admin-only.
 *
 * `Property` has no `createdBy` field — `ownerId` is set to the creating user
 * on every create (src/app/api/properties/route.ts), so `ownerId` *is*
 * "created by". Assignment is expressed by `managerId`.
 *
 * The scope is driven by a PERMISSION, not a role check. Roles are
 * admin-creatable: `resolveUserRole()` maps a custom role onto a base role and
 * returns its `permissions` on every request, so `user.role === MANAGER` would
 * lump every custom manager-ish role together with no way to vary it. Granting
 * `property_view_all` from the Roles UI lifts the scope with no code change.
 *
 * Built-in roles resolve with `permissions: []`, so a built-in MANAGER is
 * scoped by default.
 */

import mongoose from "mongoose";
import { Property } from "@/models";
import { UserRole } from "@/types";
import type { AuthenticatedUser } from "@/lib/api-utils";

/** The permission that lifts the scope. Mirrors SYSTEM_PERMISSIONS in Role.ts. */
export const VIEW_ALL_PROPERTIES = "property_view_all";

/**
 * True when the user may see every property.
 *
 * Accepts a loose shape so it works with both auth styles in this codebase —
 * `withRoleAndDB` handlers get an AuthenticatedUser, while the routes that call
 * `auth()` directly have only `session.user` (which carries `permissions` since
 * the session callback resolves the role).
 */
export function canViewAllProperties(
  user: Pick<AuthenticatedUser, "role"> & { permissions?: string[] }
): boolean {
  if (user?.role === UserRole.ADMIN) return true;
  return Boolean(user?.permissions?.includes(VIEW_ALL_PROPERTIES));
}

/**
 * A Mongo filter fragment restricting Property queries to the user's own.
 *
 * Returns `null` when the user is unrestricted — callers must treat null as
 * "add nothing", NOT as "match nothing".
 *
 * Merge it into an existing query rather than replacing it, and never drop
 * `deletedAt`: naming that field opts a query OUT of the soft-delete pre-find
 * hook (src/models/Property.ts).
 */
export function propertyScopeFilter(
  user: Pick<AuthenticatedUser, "id" | "role"> & { permissions?: string[] }
): Record<string, any> | null {
  if (canViewAllProperties(user)) return null;

  // Match on an ObjectId, not the raw string.
  //
  // Mongoose casts a string against an ObjectId path automatically, but
  // `Property.collection.find()` — used on the admin/includeDeleted path in
  // properties/route.ts and in the bulk delete — is the RAW driver and does no
  // casting. A string id there matches nothing, which would fail open or
  // closed depending on the call site. Emitting an ObjectId works for both.
  const id = mongoose.Types.ObjectId.isValid(user.id)
    ? new mongoose.Types.ObjectId(user.id)
    : user.id;

  return {
    $or: [
      { ownerId: id }, // created it
      { managerId: id }, // assigned as manager
    ],
  };
}

/**
 * Merge the scope into a query without clobbering an existing `$or`.
 *
 * A bare `query.$or = scope.$or` would silently drop a status/search `$or` that
 * the caller had already built, widening the result set — so combine through
 * `$and` when one is present.
 */
export function applyPropertyScope(
  query: Record<string, any>,
  user: Pick<AuthenticatedUser, "id" | "role"> & { permissions?: string[] }
): Record<string, any> {
  const scope = propertyScopeFilter(user);
  if (!scope) return query;

  if (query.$or) {
    query.$and = [...(query.$and ?? []), { $or: query.$or }, scope];
    delete query.$or;
  } else {
    Object.assign(query, scope);
  }

  return query;
}

/**
 * The property ids a user may act on, for scoping data that hangs off a
 * property (leases, maintenance, invoices…) and for validating a
 * caller-supplied `?propertyId=`.
 *
 * Returns `null` when unrestricted — again, null means "no restriction", not
 * "no properties".
 */
export async function accessiblePropertyIds(
  user: Pick<AuthenticatedUser, "id" | "role"> & { permissions?: string[] }
): Promise<string[] | null> {
  const scope = propertyScopeFilter(user);
  if (!scope) return null;

  const docs = await Property.find({ ...scope, deletedAt: null })
    .select("_id")
    .lean();

  return (docs as any[]).map((d) => d._id.toString());
}

/**
 * Restrict a query on a property-DERIVED collection (leases, maintenance,
 * invoices, compliance…) to the properties the caller may see.
 *
 * Also validates a caller-supplied `?propertyId=`. Scoping the dropdowns that
 * feed these filters is not enough on its own — a hand-written query string
 * would otherwise sail straight through. An out-of-scope id yields a filter
 * matching nothing, rather than being quietly dropped (which would widen the
 * result set to everything the user can see).
 *
 * Emits ObjectIds so it is safe in aggregation pipelines and raw-driver calls,
 * where Mongoose does no casting.
 */
export async function applyDerivedPropertyScope(
  query: Record<string, any>,
  user: Pick<AuthenticatedUser, "id" | "role"> & { permissions?: string[] },
  field: string = "propertyId"
): Promise<Record<string, any>> {
  const ids = await accessiblePropertyIds(user);
  if (ids === null) return query; // unrestricted

  const toId = (v: any) =>
    mongoose.Types.ObjectId.isValid(v) ? new mongoose.Types.ObjectId(v) : v;

  const requested = query[field];
  if (requested) {
    const requestedStr = requested.toString();
    query[field] = ids.includes(requestedStr)
      ? toId(requestedStr)
      : { $in: [] }; // out of scope -> match nothing
    return query;
  }

  query[field] = { $in: ids.map(toId) };
  return query;
}

/**
 * Scope check against an ALREADY-FETCHED property document.
 *
 * Prefer this in `[id]` routes over a second query — the handler has the doc in
 * hand. Works with lean objects, hydrated documents, and populated refs (a
 * populated ownerId is an object with `_id`, not an ObjectId).
 */
export function isPropertyInScope(
  user: Pick<AuthenticatedUser, "id" | "role"> & { permissions?: string[] },
  property: any
): boolean {
  if (canViewAllProperties(user)) return true;
  if (!property) return false;

  const idOf = (v: any): string => {
    if (!v) return "";
    if (typeof v === "string") return v;
    // populated ref, or an ObjectId
    return (v._id ?? v).toString();
  };

  return [property.ownerId, property.managerId].some(
    (field) => idOf(field) === user.id
  );
}

/**
 * Whether the user may act on one specific property.
 *
 * Use for `[id]` routes — prefer replying 404 over 403 so the endpoint does not
 * confirm that an out-of-scope property exists.
 */
export async function canAccessProperty(
  user: Pick<AuthenticatedUser, "id" | "role"> & { permissions?: string[] },
  propertyId: string
): Promise<boolean> {
  const scope = propertyScopeFilter(user);
  if (!scope) return true;

  const found = await Property.findOne({
    _id: propertyId,
    deletedAt: null,
    ...scope,
  })
    .select("_id")
    .lean();

  return Boolean(found);
}
