/**
 * PropertyPro - Demo billing data
 *
 * Fills the admin billing screens with something to look at: subscriptions
 * across every status, on real plans, each with a month-by-month payment
 * history so the revenue trend has an actual curve rather than a single point.
 *
 * Everything it creates uses the @demo.propertypro.test domain, which is what
 * makes cleanup exact — it never touches a record it did not create.
 *
 *   npx tsx src/scripts/seed-billing-demo.ts          seed (replaces its own data)
 *   npx tsx src/scripts/seed-billing-demo.ts --clean  remove it, seed nothing
 *
 * Deliberately deterministic — no random amounts or dates — so re-running gives
 * the same figures and a screenshot taken today matches one taken tomorrow.
 */

import dotenv from "dotenv";
import path from "path";
dotenv.config({ path: path.resolve(process.cwd(), ".env.local") });

const DOMAIN = "demo.propertypro.test";

/** Whole months back from the first of the current month. */
function monthsAgo(n: number): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - n, 8));
}

interface Spec {
  first: string;
  last: string;
  company?: string;
  planId: string;
  status: "active" | "past_due" | "cancelled" | "pending";
  cycle: "monthly" | "annual";
  /** How many months ago the subscription started. */
  startedMonthsAgo: number;
  /** Months of payments to record. 0 = never paid. */
  paidMonths: number;
  method: "card" | "cash";
}

const SPECS: Spec[] = [
  { first: "Priya",  last: "Raman",     company: "Harrow Lettings Ltd",  planId: "pro",  status: "active",    cycle: "monthly", startedMonthsAgo: 9, paidMonths: 9, method: "card" },
  { first: "Daniel", last: "Okafor",    company: "Northgate Residential", planId: "pro",  status: "active",    cycle: "monthly", startedMonthsAgo: 7, paidMonths: 7, method: "card" },
  { first: "Marta",  last: "Kessler",   company: "Kessler Estates",       planId: "pro",  status: "active",    cycle: "annual",  startedMonthsAgo: 6, paidMonths: 1, method: "card" },
  { first: "Helen",  last: "Bramley",   company: "Bramley & Co",          planId: "pro",  status: "past_due",  cycle: "monthly", startedMonthsAgo: 5, paidMonths: 3, method: "card" },
  { first: "Syed",   last: "Toseef",                                       planId: "pro",  status: "cancelled", cycle: "monthly", startedMonthsAgo: 8, paidMonths: 4, method: "card" },
  { first: "Aisha",  last: "Bello",     company: "Bello Lettings",        planId: "free", status: "active",    cycle: "monthly", startedMonthsAgo: 4, paidMonths: 0, method: "card" },
  { first: "Callum", last: "Fraser",    company: "Fraser Property Group", planId: "free", status: "pending",   cycle: "monthly", startedMonthsAgo: 0, paidMonths: 0, method: "cash" },
  { first: "Rosa",   last: "Alvarez",                                      planId: "free", status: "active",    cycle: "monthly", startedMonthsAgo: 2, paidMonths: 0, method: "cash" },
];

async function main() {
  const clean = process.argv.includes("--clean");

  const connectDB = (await import("../lib/mongodb")).default;
  await connectDB();
  const mongoose = (await import("mongoose")).default;
  const db = mongoose.connection.db!;

  const emailRe = new RegExp(`@${DOMAIN.replace(/\./g, "\\.")}$`);

  // Always clear first, so seeding twice does not double the data.
  const users = db.collection("users");
  const subs = db.collection("subscriptions");
  const removedSubs = await subs.deleteMany({ contactEmail: emailRe });
  const removedUsers = await users.deleteMany({ email: emailRe });
  console.log(
    `  cleared ${removedSubs.deletedCount} subscription(s), ${removedUsers.deletedCount} user(s)`
  );

  if (clean) {
    console.log("  --clean: nothing seeded");
    process.exit(0);
  }

  // Price the demo off the REAL catalogue, so the figures match what the plans
  // page shows. A spec naming a plan that no longer exists is skipped rather
  // than invented, since an unknown planId breaks the unit ceiling.
  const roles = await db
    .collection("roles")
    .find({ isPlan: true, isActive: true })
    .toArray();
  const priceOf = new Map(
    roles.map((r: any) => [r.name, { monthly: r.monthlyPrice ?? 0, annual: r.annualPrice ?? 0 }])
  );

  let created = 0;
  let payments = 0;
  let revenue = 0;

  for (const s of SPECS) {
    const price = priceOf.get(s.planId);
    if (!price) {
      console.log(`  ✗ ${s.first} ${s.last} — no plan "${s.planId}", skipped`);
      continue;
    }

    const amount = s.cycle === "annual" ? price.annual || price.monthly * 10 : price.monthly;
    const email = `${s.first}.${s.last}`.toLowerCase() + `@${DOMAIN}`;
    const startedAt = monthsAgo(s.startedMonthsAgo);

    const user = await users.insertOne({
      email,
      firstName: s.first,
      lastName: s.last,
      // The role IS the plan — that is what the app reads for permissions.
      role: s.planId,
      isActive: true,
      companyName: s.company ?? null,
      deletedAt: null,
      createdAt: startedAt,
      updatedAt: new Date(),
    });

    // One payment per elapsed cycle, walking forward from the start date, so
    // the ledger explains the account rather than drifting from it.
    const rows: any[] = [];
    const step = s.cycle === "annual" ? 12 : 1;
    for (let i = 0; i < s.paidMonths; i++) {
      const on = monthsAgo(s.startedMonthsAgo - i * step);
      if (on > new Date()) break;
      rows.push({
        _id: new mongoose.Types.ObjectId(),
        amount,
        receivedOn: on,
        method: s.method,
        recordedBy: s.method === "card" ? "Stripe" : "Demo Admin",
        periodLabel: on.toLocaleDateString("en-GB", {
          month: "short",
          year: "numeric",
          timeZone: "UTC",
        }),
        stripeInvoiceId:
          s.method === "card" ? `in_demo_${s.first.toLowerCase()}_${i}` : null,
      });
      payments++;
      revenue += amount;
    }

    const last = rows.length ? rows[rows.length - 1].receivedOn : null;

    await subs.insertOne({
      clientName: `${s.first} ${s.last}`,
      companyName: s.company ?? null,
      contactEmail: email,
      userId: user.insertedId,
      planId: s.planId,
      status: s.status,
      amount,
      billingCycle: s.cycle,
      startedAt,
      // A cancelled account has nothing left to renew.
      renewsAt:
        s.status === "cancelled" || s.status === "pending"
          ? null
          : monthsAgo(-1),
      lastPaymentAt: last,
      paymentMethod: s.method,
      stripeCustomerId: s.method === "card" ? `cus_demo_${s.first.toLowerCase()}` : null,
      stripeSubscriptionId: s.method === "card" ? `sub_demo_${s.first.toLowerCase()}` : null,
      stripePriceId: null,
      cancelAtPeriodEnd: false,
      payments: rows,
      deletedAt: null,
      createdAt: startedAt,
      updatedAt: new Date(),
    });

    created++;
    console.log(
      `  ✓ ${(s.first + " " + s.last).padEnd(16)} ${s.planId.padEnd(6)} ` +
        `${s.status.padEnd(10)} £${String(amount).padEnd(5)} ${s.cycle.padEnd(8)} ` +
        `${rows.length} payment(s)`
    );
  }

  console.log(
    `\n  ${created} subscription(s), ${payments} payment(s), £${revenue.toLocaleString(
      "en-GB"
    )} total recorded`
  );
  console.log(`  remove with: npx tsx src/scripts/seed-billing-demo.ts --clean`);
  process.exit(0);
}

main().catch((e) => {
  console.error("  ERROR:", e?.message || e);
  process.exit(1);
});
