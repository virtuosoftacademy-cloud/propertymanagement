import dotenv from "dotenv";
import path from "path";
dotenv.config({ path: path.resolve(process.cwd(), ".env.local") });

async function main() {
  const connectDB = (await import("../lib/mongodb")).default;
  const User = (await import("../models/User")).default;
  const ManagerAccount = (await import("../models/ManagerAccount")).default;
  const ManagerPayment = (await import("../models/ManagerPayment")).default;

  await connectDB();

  console.log("=== counts (baseline was 30 / 1 / 0) ===");
  console.log("  users           :", await User.countDocuments({}));
  console.log("  managerAccounts :", await ManagerAccount.countDocuments({}));
  console.log("  managerPayments :", await ManagerPayment.countDocuments({}));

  console.log("\n=== newest manager account ===");
  const acc: any = await ManagerAccount.findOne({}).sort({ createdAt: -1 }).lean();
  if (!acc) { console.log("  none found"); process.exit(0); }

  console.log("  clientName    :", acc.clientName);
  console.log("  contactEmail  :", acc.contactEmail);
  console.log("  planId        :", acc.planId);
  console.log("  status        :", acc.status);
  console.log("  amount        : £" + acc.amount, "/", acc.billingCycle);
  console.log("  paymentMethod :", acc.paymentMethod);
  console.log("  stripeCustomer:", acc.stripeCustomerId || "— none");
  console.log("  stripeSub     :", acc.stripeSubscriptionId || "— none");
  console.log("  stripePrice   :", acc.stripePriceId || "— none");
  console.log("  renewsAt      :", acc.renewsAt ? new Date(acc.renewsAt).toISOString().slice(0,10) : "— none");
  console.log("  lastPaymentAt :", acc.lastPaymentAt ? new Date(acc.lastPaymentAt).toISOString().slice(0,10) : "— none");

  console.log("\n=== DUPLICATE CHECK (the fix) ===");
  const dupes = await ManagerAccount.countDocuments({ contactEmail: acc.contactEmail });
  console.log("  accounts for " + acc.contactEmail + " :", dupes, dupes === 1 ? "✓ exactly one" : "✗ DUPLICATED");
  if (dupes > 1) {
    const all: any[] = await ManagerAccount.find({ contactEmail: acc.contactEmail }).lean();
    all.forEach((a) => console.log("    -", a.status, "| sub:", a.stripeSubscriptionId || "none", "| method:", a.paymentMethod));
  }

  console.log("\n=== user + role promotion ===");
  const u: any = acc.managerUserId
    ? await User.findById(acc.managerUserId).select("email firstName lastName role isActive").lean()
    : await User.findOne({ email: acc.contactEmail }).select("email firstName lastName role isActive").lean();
  if (!u) console.log("  NO USER LINKED");
  else {
    console.log("  email    :", u.email);
    console.log("  name     :", u.firstName, u.lastName);
    console.log("  role     :", u.role, u.role === acc.planId ? "✓ promoted to plan role" : "✗ expected " + acc.planId);
    console.log("  isActive :", u.isActive);
  }

  console.log("\n=== payment ledger ===");
  const pays: any[] = await ManagerPayment.find({ accountId: acc._id }).sort({ receivedOn: -1 }).lean();
  if (!pays.length) console.log("  NO PAYMENT ROW — invoice.paid did not land");
  pays.forEach((p) => {
    console.log("  £" + p.amount, "|", p.method, "| by", p.recordedBy,
                "|", new Date(p.receivedOn).toISOString().slice(0,10),
                "| invoice:", p.stripeInvoiceId || "— none");
  });
  process.exit(0);
}
main().catch((e) => { console.error("  ERROR:", e?.message || e); process.exit(1); });
