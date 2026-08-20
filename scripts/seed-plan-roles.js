/**
 * PropertyPro - Seed the plan-named roles
 *
 * Registration sets a new user's role to their plan id (free / starter /
 * growth). resolveUserRole() maps a custom role name to a base role via the
 * `roles` collection and FAILS CLOSED TO TENANT when it finds nothing — so
 * without these documents a paying customer would silently get a tenant's
 * permissions. These must exist before registration can assign them.
 *
 * Permissions follow each plan's advertised features in lib/billing/plans.ts:
 *
 *   free    (1 unit)    tenant and lease records, maintenance requests
 *   starter (25 units)  + rent tracking and invoicing, compliance records
 *   growth  (150 units) + financial/occupancy analytics, bulk invoicing
 *
 * All three inherit from `manager`, never `admin` — these are self-registered
 * accounts and must not reach admin-only surfaces (role management, user
 * management, maintenance assignment).
 *
 * Deliberately NOT granted at any tier: `property_view_all`. That permission
 * bypasses per-property scoping and would let one customer see another's
 * portfolio. Paying more must never mean seeing other tenants' data.
 *
 * The unit limits are enforced by the subscription (ManagerAccount.unitLimit),
 * not by permissions — permissions decide which features are reachable.
 *
 * USAGE
 *   node scripts/seed-plan-roles.js            # dry run, writes nothing
 *   APPLY=1 node scripts/seed-plan-roles.js    # create/update the roles
 *
 * Re-runnable: an existing role of the same name is updated, not duplicated.
 */

const mongoose = require("mongoose");
require("dotenv").config({ path: ".env.local", quiet: true });

const APPLY = process.env.APPLY === "1";

// Records a tenancy: who lives where, under what lease, and what needs fixing.
const FREE = [
  "property_view",
  "property_create",
  "property_edit",
  "tenant_management",
  "tenant_view",
  "tenant_create",
  "tenant_edit",
  "lease_management",
  "lease_view",
  "lease_create",
  "lease_edit",
  "maintenance_view",
  "maintenance_create",
  "maintenance_requests",
];

// Everything Free has, plus the professional tier: money in, the compliance
// certificates a UK landlord must hold, HMO management, the tenant portal and
// reporting across the portfolio.
const PRO = [
  ...FREE,
  "payment_history",
  "payment_processing",
  "financial_management",
  "compliance_view",
  "compliance_create",
  "compliance_edit",
  "compliance_management",
  "compliance_delete",
  "property_delete",
  "maintenance_management",
  "maintenance_assign",
  "financial_reports",
  "reports_own",
  "reports_property",
];

const ROLES = [
  {
    name: "free",
    label: "Free",
    description: "Trial manager account for a single property.",
    color: "secondary",
    permissions: FREE,
  },
  {
    name: "pro",
    label: "Pro",
    description: "For professional landlords and property managers.",
    color: "default",
    permissions: PRO,
  },
];

// Plan roles this script created that no longer match a plan. Deactivated
// rather than deleted: a user may already carry the name, and resolveUserRole()
// falls back to `tenant` for a role it cannot find — deleting would silently
// downgrade them, whereas an inactive role is visible and reversible.
const RETIRED = ["starter", "growth"];

async function main() {
  await mongoose.connect(process.env.MONGODB_URI);
  const roles = mongoose.connection.collection("roles");

  for (const r of ROLES) {
    const existing = await roles.findOne({ name: r.name });
    const doc = {
      ...r,
      inheritsFrom: "manager",
      isSystem: false,
      isActive: true,
      updatedAt: new Date(),
    };

    console.log(
      `  ${r.name}: ${existing ? "update" : "create"} — ` +
        `${r.permissions.length} permissions, inherits manager` +
        (APPLY ? "" : " (dry)")
    );

    if (!APPLY) continue;

    if (existing) {
      await roles.updateOne({ _id: existing._id }, { $set: doc });
    } else {
      await roles.insertOne({ ...doc, createdAt: new Date() });
    }
  }

  for (const name of RETIRED) {
    const stale = await roles.findOne({ name });
    if (!stale) continue;

    const holders = await mongoose.connection
      .collection("users")
      .countDocuments({ role: name, deletedAt: null });

    console.log(
      `  ${name}: retire — ${holders} user(s) still hold it` +
        (APPLY ? "" : " (dry)")
    );

    if (APPLY) {
      await roles.updateOne(
        { _id: stale._id },
        { $set: { isActive: false, updatedAt: new Date() } }
      );
    }
  }

  if (!APPLY) {
    console.log("\nDRY RUN — nothing written. Re-run with APPLY=1.");
    return;
  }

  const names = (await roles.find({}, { projection: { name: 1 } }).toArray())
    .map((r) => r.name)
    .sort();
  console.log(`\nroles now: ${names.join(", ")}`);
}

main()
  .catch((e) => {
    console.error(e.message);
    process.exitCode = 1;
  })
  .finally(() => mongoose.disconnect());
