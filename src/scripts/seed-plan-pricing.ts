/**
 * PropertyPro - Move the built-in plan catalogue onto its roles
 *
 * A plan is a role (see src/models/Role.ts). This copies the pricing from the
 * MANAGER_PLANS const onto the matching role documents and marks them
 * `isPlan: true`, which is what makes them show up in the catalogue.
 *
 * Idempotent: re-running only refreshes the pricing fields. It never touches
 * permissions, and never creates a role — a plan with no role would break
 * sign-up, so a missing one is reported rather than invented.
 *
 *   npx tsx src/scripts/seed-plan-pricing.ts
 */

import dotenv from "dotenv";
import path from "path";
dotenv.config({ path: path.resolve(process.cwd(), ".env.local") });

async function main() {
  const connectDB = (await import("../lib/mongodb")).default;
  await connectDB();

  const Role = (await import("../models/Role")).default;
  const { MANAGER_PLANS } = await import("../lib/billing/plans");

  console.log(`  seeding ${MANAGER_PLANS.length} plan(s) onto roles\n`);

  for (const plan of MANAGER_PLANS) {
    const role: any = await Role.findOne({ name: plan.id });

    if (!role) {
      console.log(
        `  ✗ ${plan.id.padEnd(10)} no role of that name — create it first, ` +
          `otherwise sign-up returns "Sign-up is not available yet"`
      );
      continue;
    }

    // $set, not save(): these role documents predate the required createdBy
    // field, so a full-document save fails validation on data this script has
    // no business inventing. A targeted update writes only the plan fields.
    const set: Record<string, unknown> = {
      isPlan: true,
      monthlyPrice: plan.monthlyPrice,
      annualPrice: plan.annualPrice,
      unitLimit: plan.unitLimit,
      pricePerUnit: plan.pricePerUnit ?? null,
      features: plan.features,
      popular: Boolean(plan.popular),
      custom: Boolean(plan.custom),
    };
    if (!role.label) set.label = plan.name;
    if (!role.description) set.description = plan.description;

    // Carry across any Stripe Price already configured in env, so an existing
    // paid plan keeps working without being re-saved through the UI.
    const envKey = `STRIPE_PRICE_${plan.id.toUpperCase()}`;
    set.stripePriceIdMonthly =
      role.stripePriceIdMonthly || process.env[`${envKey}_MONTHLY`] || null;
    set.stripePriceIdAnnual =
      role.stripePriceIdAnnual || process.env[`${envKey}_ANNUAL`] || null;

    await Role.updateOne({ _id: role._id }, { $set: set });

    const price =
      plan.monthlyPrice === null ? "negotiated" : `£${plan.monthlyPrice}/mo`;
    const stripe = set.stripePriceIdMonthly
      ? String(set.stripePriceIdMonthly).slice(0, 20) + "…"
      : plan.monthlyPrice ? "NO PRICE — checkout will fail" : "n/a";
    console.log(
      `  ✓ ${plan.id.padEnd(10)} ${price.padEnd(12)} units:${String(
        plan.unitLimit ?? "∞"
      ).padEnd(4)} stripe:${stripe}`
    );
  }

  const total = await Role.countDocuments({ isPlan: true, isActive: true });
  console.log(`\n  ${total} role(s) now marked as plans`);
  process.exit(0);
}

main().catch((e) => {
  console.error("  ERROR:", e?.message || e);
  process.exit(1);
});
