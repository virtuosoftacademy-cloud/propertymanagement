/**
 * PropertyPro - Seed the base roles and an admin login
 *
 * Brings an empty database back to a usable state: one admin user, and the
 * `member` custom role for everyone else.
 *
 * WHY NO `admin` ROLE DOCUMENT
 * `admin`, `manager` and `tenant` are built in (BASE_ROLES in
 * lib/auth/resolve-role.ts). For those, resolveUserRole() returns immediately
 * with isCustom:false and permissions:[] — it never reads the database — and
 * hasActionPermission() short-circuits to true for admin. A row named "admin"
 * would be inert, so it is deliberately not created. Admin capability comes
 * from users.role === "admin" alone.
 *
 * ORDER MATTERS
 * The admin user is created first because Role.createdBy is required and must
 * point at a real user.
 *
 * The user is created through the Mongoose model, never the raw driver, so the
 * pre-save hook hashes the password. A raw insert would store it in plain text
 * and sign-in would fail against the bcrypt comparison.
 *
 * USAGE
 *   npx tsx src/scripts/seed-roles-and-admin.ts           dry run, writes nothing
 *   APPLY=1 npx tsx src/scripts/seed-roles-and-admin.ts   create them
 *
 *   ADMIN_EMAIL / ADMIN_PASSWORD override the defaults below.
 *
 * Re-runnable: an existing admin or role is reported and left untouched rather
 * than duplicated or overwritten.
 */

import dotenv from "dotenv";
import path from "path";
dotenv.config({ path: path.resolve(process.cwd(), ".env.local") });

const APPLY = process.env.APPLY === "1";
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || "admin@propertypro.com";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "Admin@12345";

/**
 * Day-to-day work, no administration.
 *
 * Every id must exist in SYSTEM_PERMISSIONS (see the roles page) or it renders
 * as nothing in the edit dialog and is dropped on the next save.
 *
 * Deliberately absent: user_management, role_management, system_settings,
 * company_settings, audit_logs, backup_restore, data_export, bulk_operations,
 * reports_all — and property_view_all, which bypasses per-property scoping
 * (lib/auth/property-scope.ts) and would let a member see every property.
 */
const MEMBER_PERMISSIONS = [
  "property_view",
  "property_create",
  "property_edit",
  "tenant_view",
  "tenant_create",
  "tenant_edit",
  "lease_view",
  "lease_create",
  "lease_edit",
  "maintenance_view",
  "maintenance_create",
  "maintenance_requests",
  "document_access",
  "profile_management",
];

async function main() {
  const connectDB = (await import("../lib/mongodb")).default;
  await connectDB();
  const { User, Role } = await import("../models");

  console.log(APPLY ? "  APPLY — writing" : "  DRY RUN — nothing will be written");
  console.log("");

  // ---------------------------------------------------------------- admin
  // Raw driver: the model hides soft-deleted users, and a soft-deleted row
  // still occupies the unique email index — so a plain findOne would report
  // "no admin", then create() would fail on E11000.
  const existingAdmin: any = await User.collection.findOne({
    email: ADMIN_EMAIL.toLowerCase(),
  });

  let adminId: any = existingAdmin?._id;

  if (existingAdmin) {
    console.log(
      `  admin   EXISTS  ${ADMIN_EMAIL}` +
        (existingAdmin.deletedAt ? "  (soft-deleted — restore it by hand)" : "")
    );
  } else if (APPLY) {
    const admin: any = await User.create({
      email: ADMIN_EMAIL.toLowerCase(),
      firstName: "Admin",
      lastName: "User",
      role: "admin",
      isActive: true,
      password: ADMIN_PASSWORD,
    });
    adminId = admin._id;
    console.log(`  admin   CREATED ${ADMIN_EMAIL}`);
  } else {
    console.log(`  admin   would create ${ADMIN_EMAIL}`);
  }

  // ---------------------------------------------------------------- member
  const existingRole = await Role.collection.findOne({ name: "member" });

  if (existingRole) {
    console.log("  member  EXISTS  (left untouched)");
  } else if (APPLY) {
    if (!adminId) {
      console.log("  member  SKIPPED — no admin id available for createdBy");
    } else {
      await Role.create({
        name: "member",
        label: "Member",
        description:
          "Standard user. Day-to-day property, tenant, lease and maintenance work. No administration.",
        permissions: MEMBER_PERMISSIONS,
        // Mandatory. Without it resolveUserRole() falls back to `tenant`, so
        // every manager-gated route 404s while the role still looks right.
        inheritsFrom: "manager",
        isActive: true,
        isSystem: false,
        createdBy: adminId,
        updatedBy: adminId,
      });
      console.log(
        `  member  CREATED (${MEMBER_PERMISSIONS.length} permissions, inherits manager)`
      );
    }
  } else {
    console.log(
      `  member  would create (${MEMBER_PERMISSIONS.length} permissions, inherits manager)`
    );
  }

  console.log("");
  if (!APPLY) {
    console.log("  re-run with APPLY=1 to write.");
  } else {
    console.log("  Restart the dev server: resolveUserRole() caches roles in-process.");
  }

  process.exit(0);
}

main().catch((e) => {
  console.error("  ERROR:", e?.message || e);
  process.exit(1);
});
