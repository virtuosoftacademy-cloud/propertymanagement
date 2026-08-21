/**
 * Prints a snapshot of the subscriptions collection. Payments are embedded, so
 * there is no second collection to count — the total is summed across arrays.
 */
import dotenv from "dotenv";
import path from "path";
dotenv.config({ path: path.resolve(process.cwd(), ".env.local") });

async function main() {
  const connectDB = (await import("../lib/mongodb")).default;
  await connectDB();
  const User = (await import("../models/User")).default;
  const Subscription = (await import("../models/Subscription")).default;

  const subs: any[] = await Subscription.find({}).lean();
  const payments = subs.reduce((n, s) => n + (s.payments?.length ?? 0), 0);

  console.log("  users         :", await User.countDocuments({}));
  console.log("  subscriptions :", subs.length);
  console.log("  payments      :", payments, "(embedded)");
  console.log();
  subs.forEach((s) =>
    console.log(
      "   ",
      String(s.planId).padEnd(6),
      String(s.status).padEnd(9),
      "£" + s.amount,
      "|",
      s.contactEmail,
      "| payments:",
      s.payments?.length ?? 0
    )
  );
  process.exit(0);
}
main().catch((e) => { console.error("  ERROR:", e?.message || e); process.exit(1); });
