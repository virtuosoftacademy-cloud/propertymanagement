/**
 * PropertyPro - Reference lookups that can see soft-deleted documents
 *
 * Several models validate a reference in a pre("save") hook with
 * `Model.findById(id)`. Most of those models carry a `pre(/^find/)` soft-delete
 * hook, so findById cannot see a soft-deleted document — and the save fails
 * with "<X> not found" even though the record is right there.
 *
 * That is wrong for REFERENCE VALIDATION: fields like createdBy, ownerId,
 * managerId and assignedTo record who something belongs to. Requiring the
 * target to still be active means deleting a user retroactively breaks every
 * document that points at them. The check should assert the referenced record
 * EXISTS, not that it is currently live.
 *
 * Naming `deletedAt` in the filter is what escapes the hook. Two queries are
 * used rather than one `$exists` test so documents written before the field
 * existed are still matched.
 *
 * Takes the model as an argument, so this never imports the models and cannot
 * create a cycle.
 */

import mongoose, { type Model } from "mongoose";

/** The three built-in roles. Anything else is an admin-created custom role. */
const BUILT_IN = ["admin", "manager", "tenant"] as const;
export type BuiltInRole = (typeof BUILT_IN)[number];

/**
 * Resolve a user's stored role name to the built-in role it behaves as.
 *
 * Model hooks validate roles with checks like
 * `["admin","manager"].includes(user.role)`. `user.role` holds the RAW assigned
 * name, so a custom role such as "agent" fails every one of them — even though
 * it declares `inheritsFrom: "manager"`. That is the same defect that was fixed
 * in withRoleAndDB; these hooks were missed.
 *
 * Resolves through `mongoose.model("Role")` at runtime rather than importing
 * resolve-role.ts, which imports @/models and would create a cycle when pulled
 * into a model file.
 *
 * Fails closed: an unknown, inactive, deleted or unresolvable role reports
 * "tenant", the least-privileged value, so a lookup failure cannot widen access.
 */
export async function effectiveRoleOf(
  rawRole: string | undefined | null
): Promise<BuiltInRole> {
  const name = (rawRole ?? "").trim();
  if (!name) return "tenant";
  if ((BUILT_IN as readonly string[]).includes(name)) return name as BuiltInRole;

  try {
    const Role = mongoose.model("Role");
    const doc: any = await Role.findOne({
      name,
      isActive: true,
      deletedAt: null,
    }).lean();
    const inherits = doc?.inheritsFrom;
    return (BUILT_IN as readonly string[]).includes(inherits)
      ? (inherits as BuiltInRole)
      : "tenant";
  } catch {
    // Role model not registered, or the lookup failed.
    return "tenant";
  }
}

/** findById that also matches soft-deleted documents. */
export async function findByIdIncludingDeleted(
  model: Model<any>,
  id: unknown
): Promise<any | null> {
  const live = await model.findOne({ _id: id, deletedAt: null });
  if (live) return live;
  return model.findOne({ _id: id, deletedAt: { $ne: null } });
}

/** find({ _id: { $in } }) that also matches soft-deleted documents. */
export async function findByIdsIncludingDeleted(
  model: Model<any>,
  ids: unknown[]
): Promise<any[]> {
  const [live, removed] = await Promise.all([
    model.find({ _id: { $in: ids }, deletedAt: null }),
    model.find({ _id: { $in: ids }, deletedAt: { $ne: null } }),
  ]);
  return [...live, ...removed];
}
