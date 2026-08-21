/**
 * PropertyPro - Stripe subscription webhook
 *
 * The ONLY thing that provisions a manager account from a self-serve purchase.
 * The browser is never trusted to say "I paid" — it only starts a Checkout
 * session; this endpoint is what Stripe tells the truth to.
 *
 * Separate from /api/stripe/webhook, which handles tenant rent payments. They
 * are different money flows with different secrets, so keep them apart: a
 * shared handler would have to guess which flow an event belongs to.
 *
 * Set STRIPE_SUBSCRIPTION_WEBHOOK_SECRET to this endpoint's signing secret.
 *
 * Stripe retries on any non-2xx, so every handler here must be idempotent —
 * hence the unique index on Subscription.stripeSubscriptionId and the
 * conditional push used for embedded payments, which make a double delivery a
 * no-op rather than a second subscription or double-counted revenue.
 */

// Aliased: the local `mongoose` in this file is a connection cache, not the
// mongoose module.
import { model as dbModel } from "mongoose";
import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import connectDB from "@/lib/mongodb";
import { Subscription, User } from "@/models";

import {
  createPasswordResetToken,
  SEVEN_DAYS_MS,
} from "@/lib/invitation-utils";
import { emailService } from "@/lib/email-service";
import { getPlan, planForPriceId } from "@/lib/billing/plan-store";

export const dynamic = "force-dynamic";

function appUrl(): string {
  return (
    process.env.NEXT_PUBLIC_APP_URL ||
    process.env.APP_URL ||
    process.env.NEXTAUTH_URL ||
    "http://localhost:3000"
  );
}

/** Stripe amounts are in minor units; our records are GBP major units. */
const toMajor = (minor: number | null | undefined) => (minor ?? 0) / 100;

function periodLabel(date: Date): string {
  return date.toLocaleDateString("en-GB", {
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}

/**
 * The subscription an invoice belongs to.
 *
 * `invoice.subscription` was REMOVED in the 2025-x API versions and lives on
 * `invoice.parent.subscription_details.subscription` now. Reading the old field
 * returned undefined on every delivery, so handleInvoicePaid bailed at its
 * first line: no payment was ever recorded and nobody was ever promoted off
 * `free` after paying. Both shapes are read so this keeps working whichever
 * API version an event was created under — old events replayed from the
 * dashboard still carry the flat field.
 */
function invoiceSubscriptionId(invoice: Stripe.Invoice): string | undefined {
  const legacy = (invoice as any).subscription;
  if (legacy)
    return typeof legacy === "string" ? legacy : (legacy.id as string);

  const current = (invoice as any).parent?.subscription_details?.subscription;
  if (!current) return undefined;
  return typeof current === "string" ? current : (current.id as string);
}

/**
 * When the current billing period ends — i.e. the renewal date.
 *
 * Also moved: it is per-item now rather than on the subscription. Left
 * unhandled this silently made every renewsAt null, which is what the admin
 * billing list reads for "Renews".
 */
function subscriptionPeriodEnd(
  subscription: Stripe.Subscription
): number | undefined {
  return (
    ((subscription as any).current_period_end as number | undefined) ??
    ((subscription.items?.data?.[0] as any)?.current_period_end as
      | number
      | undefined)
  );
}

/**
 * Put the buyer on the role their plan grants.
 *
 * Sign-up deliberately creates paid-plan users on `free` (see auth/register),
 * which is what stops someone granting themselves Pro by filling in a form —
 * so until this runs, someone who has paid still has Free's permissions and
 * Free's one-unit ceiling.
 *
 * Called from BOTH checkout.session.completed and invoice.paid. Those two
 * events are emitted within the same second and Stripe does not guarantee
 * their order, so whichever lands first must be able to do this; running it
 * twice writes the same value, so the duplicate is harmless.
 *
 * Best-effort by design: a failure here must not make Stripe retry a payment
 * that was already recorded. The subscription is on the right plan either way,
 * so a missed promotion is recoverable by replaying the event.
 */
async function promoteUserToPlan(
  userId: unknown,
  planId: string
): Promise<void> {
  if (!userId || !planId) return;

  try {
    const planRole = await dbModel("Role").findOne({
      name: planId,
      isActive: true,
    });

    if (!planRole) {
      console.error(
        `[billing] paid ${planId} but no active role of that name — user left on free`
      );
      return;
    }

    await dbModel("User").updateOne(
      { _id: userId as any },
      { $set: { role: planId } }
    );
  } catch (promotionError) {
    console.error(
      `[billing] failed to promote user ${userId} to ${planId}:`,
      promotionError
    );
  }
}

/**
 * Provision a manager login for a paying customer. Idempotent: an existing user
 * with this email is reused rather than duplicated, which matters because
 * Stripe may deliver checkout.session.completed more than once.
 */
async function provisionManagerUser(
  email: string,
  name: string | null | undefined,
  planId: string,
  planName: string
): Promise<{ userId: string; created: boolean }> {
  const existing = await User.findOne({ email: email.toLowerCase() });
  if (existing) return { userId: String(existing._id), created: false };

  const [firstName, ...rest] = (name || email.split("@")[0]).split(" ");

  const user = await User.create({
    email: email.toLowerCase(),
    firstName: firstName || "New",
    lastName: rest.join(" ") || "Manager",
    // The role IS the plan (see lib/billing/plan-store) — that is what the
    // unit ceiling and the permission checks read. A literal "manager" here
    // matched no plan, so a buyer with no prior account landed on a role the
    // plan lookup could not resolve and fell closed to no units at all.
    role: planId || "manager",
    isActive: true,
    // No password is set here. The customer receives a set-password link;
    // inventing one and emailing it would be worse than making them choose.
    password: undefined,
  });

  const displayName = [user.firstName, user.lastName]
    .filter(Boolean)
    .join(" ")
    .trim();

  // Seven days, not the one-hour reset default: someone who just paid may not
  // open their inbox today, and an expired link is their first impression.
  const invite = await createPasswordResetToken(
    String(user._id),
    user.email,
    SEVEN_DAYS_MS
  );

  if (invite.success && invite.token) {
    const sent = await emailService.sendManagerWelcome(
      user.email,
      displayName || user.email,
      invite.token,
      planName
    );

    if (!sent) {
      // Do NOT throw: the subscription is paid and the account exists, so
      // failing the webhook would make Stripe retry and duplicate nothing
      // useful. Log loudly enough that the link can be resent by hand.
      console.error(
        `[billing] Welcome email FAILED for ${user.email}. ` +
          `Send this link manually: ${appUrl()}/auth/reset-password?token=${invite.token}`
      );
    }
  } else {
    console.error(
      `[billing] Could not create a set-password token for ${user.email}: ${invite.error}`
    );
  }

  return { userId: String(user._id), created: true };
}

async function handleCheckoutCompleted(
  stripe: Stripe,
  session: Stripe.Checkout.Session
) {
  if (session.mode !== "subscription") return;

  const subscriptionId =
    typeof session.subscription === "string"
      ? session.subscription
      : session.subscription?.id;
  if (!subscriptionId) return;

  // Already provisioned — a retried delivery, not a second sale.
  const existing = await Subscription.findOne({
    stripeSubscriptionId: subscriptionId,
    deletedAt: null,
  });
  if (existing) return;

  const subscription = await stripe.subscriptions.retrieve(subscriptionId);
  const priceId = subscription.items.data[0]?.price?.id;

  // The Price that was actually paid is the authority — it comes from Stripe,
  // whereas metadata was written by whoever started the session. Metadata is
  // only the fallback for a Price we no longer recognise (a plan renamed or
  // retired between checkout and this delivery).
  const mapped = priceId ? await planForPriceId(priceId) : null;

  const planId = mapped?.plan.id ?? session.metadata?.planId ?? "";
  const cycle =
    mapped?.cycle ??
    ((session.metadata?.cycle as "monthly" | "annual") || "monthly");

  if (!planId) {
    throw new Error(
      `Checkout ${session.id} paid Price ${priceId} which matches no plan, and carried no planId metadata`
    );
  }

  const plan = mapped?.plan ?? (await getPlan(planId));

  // The address they REGISTERED with, not the one typed on Stripe's page.
  // Those differ often — Stripe prefills but the buyer can overwrite it, and
  // people pay with a personal card under a different address. Matching on the
  // Stripe email alone left the pending subscription unclaimed and created a
  // duplicate account under the paying address.
  const signupEmail = session.metadata?.signupEmail || undefined;
  const signupUserId = session.metadata?.userId || undefined;

  const email =
    signupEmail ||
    session.customer_details?.email ||
    session.customer_email ||
    undefined;
  if (!email) {
    // Nothing to provision against. Fail loudly so Stripe retries rather than
    // recording a paid subscription nobody can log into.
    throw new Error(`Checkout ${session.id} completed with no customer email`);
  }

  const name = session.customer_details?.name;
  const { userId } = await provisionManagerUser(
    email,
    name,
    planId,
    plan?.name ?? planId
  );

  const currentPeriodEnd = subscriptionPeriodEnd(subscription);

  const paidFields = {
    contactEmail: email,
    userId: userId,
    planId,
    status: "active" as const,
    amount:
      toMajor(subscription.items.data[0]?.price?.unit_amount) ||
      (cycle === "annual"
        ? (plan?.annualPrice ?? 0)
        : (plan?.monthlyPrice ?? 0)),
    billingCycle: cycle,
    startedAt: new Date(subscription.start_date * 1000),
    renewsAt: currentPeriodEnd ? new Date(currentPeriodEnd * 1000) : null,
    paymentMethod: "card" as const,
    stripeCustomerId:
      typeof session.customer === "string"
        ? session.customer
        : session.customer?.id,
    stripeSubscriptionId: subscriptionId,
    stripePriceId: priceId,
  };

  // A self-serve sign-up has ALREADY opened a `pending` account for this user
  // (see /api/auth/register) carrying no Stripe ids. The lookup at the top of
  // this function only matches on stripeSubscriptionId, and that unique index
  // is sparse so nulls never collide — so without claiming that row here we
  // would leave it orphaned and insert a SECOND account for the same customer,
  // double-counting them on the admin billing page.
  //
  // Newest first: if a customer somehow has more than one unclaimed row, the
  // one they just signed up with is the one this payment belongs to.
  const unclaimed = await Subscription.findOne({
    stripeSubscriptionId: null,
    deletedAt: null,
    // Card only. An admin-sold account is recorded as `cash`, and claiming one
    // of those would silently convert a negotiated cash arrangement into a
    // Stripe subscription and lose the record of how that client actually pays.
    paymentMethod: "card",
    // signupUserId first: it is the only identifier that survives the buyer
    // changing their email on Stripe's page.
    $or: [
      ...(signupUserId ? [{ userId: signupUserId }] : []),
      { userId: userId },
      { contactEmail: email.toLowerCase() },
      ...(signupEmail ? [{ contactEmail: signupEmail.toLowerCase() }] : []),
    ],
  }).sort({ createdAt: -1 });

  if (unclaimed) {
    unclaimed.set(paidFields);
    // Stripe does not always collect a name. Keep the one registration
    // captured rather than replacing a real name with an email address.
    if (name) unclaimed.clientName = name;
    // A concurrent duplicate delivery can reach here twice; the unique index
    // on stripeSubscriptionId makes the loser throw, the webhook returns 500,
    // and Stripe retries — by which time the check at the top matches instead.
    await unclaimed.save();
    await promoteUserToPlan(userId, planId);
    return;
  }

  await Subscription.create({ ...paidFields, clientName: name || email });
  await promoteUserToPlan(userId, planId);
}

async function handleInvoicePaid(invoice: Stripe.Invoice) {
  const subscriptionId = invoiceSubscriptionId(invoice);
  if (!subscriptionId) return;

  const account = await Subscription.findOne({
    stripeSubscriptionId: subscriptionId,
    deletedAt: null,
  });
  // The subscription's first invoice can arrive before checkout.session
  // .completed. Throwing makes Stripe retry, by which time the account exists.
  if (!account) {
    throw new Error(
      `invoice.paid for unknown subscription ${subscriptionId} — retrying`
    );
  }

  await promoteUserToPlan(account.userId, account.planId);

  const receivedOn = new Date(
    (invoice.status_transitions?.paid_at ?? invoice.created) * 1000
  );

  // The line item's period, NOT invoice.period_end. On a subscription's FIRST
  // invoice those differ: the invoice's own window collapses to the moment of
  // issue, so using it set renewsAt to today and the billing list showed an
  // account renewing the day it was bought. The line is what states the period
  // actually paid for.
  const periodEnd =
    ((invoice.lines?.data?.[0] as any)?.period?.end as number | undefined) ??
    ((invoice as any).period_end as number | undefined);

  // Push the payment ONLY if this invoice is not already on the document.
  // A unique index cannot help here: Mongo permits repeated keys inside a
  // single document's array, so a retried delivery would append a duplicate
  // and inflate reported revenue. The filter makes the write idempotent —
  // matchedCount 0 means we have already recorded it.
  const result = await Subscription.updateOne(
    {
      _id: account._id,
      deletedAt: null,
      "payments.stripeInvoiceId": { $ne: invoice.id },
    },
    {
      $push: {
        payments: {
          amount: toMajor(invoice.amount_paid),
          receivedOn,
          method: "card",
          recordedBy: "Stripe",
          periodLabel: periodLabel(receivedOn),
          stripeInvoiceId: invoice.id,
        },
      },
      $set: {
        lastPaymentAt: receivedOn,
        status: "active",
        ...(periodEnd ? { renewsAt: new Date(periodEnd * 1000) } : {}),
      },
    }
  );

  if (result.matchedCount === 0) {
    console.warn(
      `[billing] invoice ${invoice.id} already recorded — ignoring retry`
    );
  }
}

async function handleSubscriptionChanged(subscription: Stripe.Subscription) {
  const account = await Subscription.findOne({
    stripeSubscriptionId: subscription.id,
    deletedAt: null,
  });
  if (!account) return;

  const priceId = subscription.items.data[0]?.price?.id;
  const mapped = priceId ? await planForPriceId(priceId) : null;

  if (mapped) {
    // An upgrade or downgrade in Stripe moves the account onto the matching
    // plan here too, so the role the user holds follows what they now pay for.
    account.planId = mapped.plan.id;
    account.billingCycle = mapped.cycle;
  }
  if (priceId) account.stripePriceId = priceId;

  const unitAmount = subscription.items.data[0]?.price?.unit_amount;
  if (unitAmount != null) account.amount = toMajor(unitAmount);

  // Stripe's status is authoritative — ours is a mirror, never a second opinion.
  switch (subscription.status) {
    case "active":
    case "trialing":
      account.status = "active";
      break;
    case "past_due":
    case "unpaid":
      account.status = "past_due";
      break;
    case "canceled":
      account.status = "cancelled";
      break;
    case "incomplete":
    case "incomplete_expired":
      account.status = "pending";
      break;
  }

  account.cancelAtPeriodEnd = subscription.cancel_at_period_end ?? false;

  const currentPeriodEnd = subscriptionPeriodEnd(subscription);
  if (currentPeriodEnd) account.renewsAt = new Date(currentPeriodEnd * 1000);

  await account.save();
}

async function handleSubscriptionDeleted(subscription: Stripe.Subscription) {
  const account = await Subscription.findOne({
    stripeSubscriptionId: subscription.id,
    deletedAt: null,
  });
  if (!account) return;

  account.status = "cancelled";
  account.cancelAtPeriodEnd = false;
  account.renewsAt = null;
  await account.save();

  // Revoke the login too: a cancelled subscription that leaves a working
  // manager account is the org giving the product away.
  if (account.userId) {
    await User.findByIdAndUpdate(account.userId, { isActive: false });
  }
}

async function handleInvoiceFailed(invoice: Stripe.Invoice) {
  const subscriptionId = invoiceSubscriptionId(invoice);
  if (!subscriptionId) return;

  await Subscription.findOneAndUpdate(
    { stripeSubscriptionId: subscriptionId, deletedAt: null },
    { status: "past_due" }
  );
}

export async function POST(request: NextRequest) {
  const secret = process.env.STRIPE_SUBSCRIPTION_WEBHOOK_SECRET;
  const apiKey = process.env.STRIPE_SECRET_KEY;

  if (!secret || !apiKey) {
    console.error("[billing] Stripe subscription webhook is not configured");
    return NextResponse.json({ error: "Not configured" }, { status: 503 });
  }

  const signature = request.headers.get("stripe-signature");
  if (!signature) {
    return NextResponse.json({ error: "Missing signature" }, { status: 400 });
  }

  const stripe = new Stripe(apiKey);

  let event: Stripe.Event;
  try {
    // Raw body, not parsed JSON — the signature is over the exact bytes.
    const payload = await request.text();
    event = stripe.webhooks.constructEvent(payload, signature, secret);
  } catch (error) {
    // An unverified body is an untrusted body: never act on it.
    console.error("[billing] Webhook signature verification failed:", error);
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  try {
    await connectDB();

    switch (event.type) {
      case "checkout.session.completed":
        await handleCheckoutCompleted(
          stripe,
          event.data.object as Stripe.Checkout.Session
        );
        break;
      case "invoice.paid":
        await handleInvoicePaid(event.data.object as Stripe.Invoice);
        break;
      case "invoice.payment_failed":
        await handleInvoiceFailed(event.data.object as Stripe.Invoice);
        break;
      case "customer.subscription.updated":
        await handleSubscriptionChanged(
          event.data.object as Stripe.Subscription
        );
        break;
      case "customer.subscription.deleted":
        await handleSubscriptionDeleted(
          event.data.object as Stripe.Subscription
        );
        break;
      default:
        // Unhandled types are acknowledged, not retried forever.
        break;
    }

    return NextResponse.json({ received: true });
  } catch (error) {
    // 500 so Stripe retries — better a duplicate delivery against idempotent
    // handlers than a paid subscription that never got provisioned.
    console.error(`[billing] Failed handling ${event.type}:`, error);
    return NextResponse.json({ error: "Handler failed" }, { status: 500 });
  }
}
