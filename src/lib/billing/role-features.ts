/**
 * PropertyPro - Readable features from a role's permissions
 *
 * A plan IS a role, so the honest answer to "what does this plan include?" is
 * "whatever its role permits". But a permission list is not a feature list: it
 * is granular (`compliance_view`, `compliance_create`, `compliance_edit`, …)
 * and long — the `agent` role holds 34, against a 20-feature cap on the plan
 * form. Listing them one per bullet would both overflow the form and read like
 * a database dump on the pricing page.
 *
 * So permissions are grouped by capability area, and each area is described at
 * the level of access actually granted: being able to read compliance records
 * is a different promise to being able to manage them.
 *
 * These are a STARTING POINT for the admin, not a contract. The plan form
 * pre-fills them and the admin edits freely — marketing copy is a human job.
 */

interface Area {
  /** Permission prefix, e.g. "property" for property_view/_create/… */
  prefix: string;
  /** Shown when the role can change things in this area. */
  full: string;
  /** Shown when the role can only look. */
  readOnly: string;
  /**
   * Permissions that mean "can change things". A role holding none of these
   * but holding something in the area is treated as read-only.
   */
  writeSuffixes?: string[];
}

const AREAS: Area[] = [
  { prefix: "property", full: "Property management", readOnly: "View properties" },
  { prefix: "tenant", full: "Tenant management", readOnly: "View tenants" },
  { prefix: "lease", full: "Lease management", readOnly: "View leases" },
  { prefix: "maintenance", full: "Maintenance and work orders", readOnly: "View maintenance requests" },
  { prefix: "compliance", full: "Compliance tracking and certificates", readOnly: "View compliance records" },
  { prefix: "payment", full: "Rent collection and payments", readOnly: "View payment history" },
  { prefix: "financial", full: "Financial management and reporting", readOnly: "View financial reports" },
  { prefix: "reports", full: "Reporting", readOnly: "Reporting" },
  { prefix: "document", full: "Document storage and management", readOnly: "Document access" },
  { prefix: "screening", full: "Tenant screening", readOnly: "Tenant screening" },
  { prefix: "application", full: "Application processing", readOnly: "Application processing" },
  { prefix: "advanced", full: "Advanced analytics", readOnly: "Advanced analytics" },
  { prefix: "work", full: "Work orders", readOnly: "Work orders" },
];

/** Suffixes that imply the holder can change something, not merely read it. */
const DEFAULT_WRITE_SUFFIXES = [
  "create",
  "edit",
  "delete",
  "management",
  "assign",
  "processing",
];

/**
 * Group a role's permissions into a short, readable feature list.
 *
 * Order follows AREAS rather than the permission array, so two roles with the
 * same capabilities produce the same list regardless of how they were stored.
 */
export function featuresFromPermissions(permissions: string[]): string[] {
  const held = new Set(permissions ?? []);
  if (held.size === 0) return [];

  const features: string[] = [];

  for (const area of AREAS) {
    const inArea = [...held].filter(
      (p) => p === area.prefix || p.startsWith(`${area.prefix}_`)
    );
    if (inArea.length === 0) continue;

    const writes = area.writeSuffixes ?? DEFAULT_WRITE_SUFFIXES;
    const canWrite = inArea.some((p) =>
      writes.some((suffix) => p.endsWith(`_${suffix}`))
    );

    features.push(canWrite ? area.full : area.readOnly);
  }

  // `profile_management` is on essentially every role and says nothing about
  // what was bought, so it is deliberately not an area above. If grouping
  // produced nothing at all, say so rather than returning an empty list the
  // form would reject.
  return features.length > 0 ? features : ["Basic account access"];
}

/**
 * Turn a role name into something presentable — role names are stored as
 * lowercase with underscores (`manual_manager`), which is not a plan name.
 */
export function prettifyRoleName(name: string): string {
  const words = name.replace(/[_-]+/g, " ").trim();
  return words.charAt(0).toUpperCase() + words.slice(1);
}
