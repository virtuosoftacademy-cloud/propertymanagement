/**
 * PropertyPro - Stripe Customer Payment Methods API
 * Retrieve customer payment methods
 */

import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { Types } from "mongoose";

import connectDB from "@/lib/mongodb";
import { Tenant, Payment, RecurringPayment, User } from "@/models";

// Initialize Stripe
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: "2024-06-20",
});

async function resolveStripeCustomerId(
  customerIdentifier: string
): Promise<string | null> {
  if (customerIdentifier.startsWith("cus_")) {
    return customerIdentifier;
  }

  if (!Types.ObjectId.isValid(customerIdentifier)) {
    return null;
  }

  await connectDB();

  const objectId = new Types.ObjectId(customerIdentifier);

  let tenant = await Tenant.findById(objectId).populate(
    "userId",
    "firstName lastName email"
  );

  if (!tenant) {
    tenant = await Tenant.findOne({
      userId: objectId,
    }).populate("userId", "firstName lastName email");
  }

  const candidateIdStrings = new Set<string>();
  candidateIdStrings.add(objectId.toString());

  const tenantUserField = tenant?.userId ?? null;
  let tenantUserIdString: string | undefined;

  if (tenant?._id) {
    candidateIdStrings.add(tenant._id.toString());
  }

  if (tenantUserField) {
    if (tenantUserField instanceof Types.ObjectId) {
      tenantUserIdString = tenantUserField.toString();
    } else if (
      typeof tenantUserField === "object" &&
      tenantUserField !== null &&
      "_id" in tenantUserField &&
      tenantUserField._id
    ) {
      tenantUserIdString = tenantUserField._id.toString();
    } else if (typeof tenantUserField === "string") {
      tenantUserIdString = tenantUserField;
    }

    if (tenantUserIdString && Types.ObjectId.isValid(tenantUserIdString)) {
      candidateIdStrings.add(tenantUserIdString);
    }
  }

  let user: any =
    tenantUserField &&
    typeof tenantUserField === "object" &&
    tenantUserField !== null &&
    "email" in tenantUserField
      ? tenantUserField
      : null;

  if (!user && tenantUserIdString && Types.ObjectId.isValid(tenantUserIdString)) {
    user = await User.findById(tenantUserIdString).select(
      "firstName lastName email"
    );
  }

  if (!user) {
    user = await User.findById(objectId).select("firstName lastName email");
  }

  if (user?._id && Types.ObjectId.isValid(user._id.toString())) {
    candidateIdStrings.add(user._id.toString());
  }

  const candidateObjectIds = Array.from(candidateIdStrings)
    .filter((id) => Types.ObjectId.isValid(id))
    .map((id) => new Types.ObjectId(id));

  if (tenant?.stripeCustomerId) {
    return tenant.stripeCustomerId;
  }

  let paymentWithCustomer: { stripeCustomerId?: string } | null = null;

  if (candidateObjectIds.length > 0) {
    paymentWithCustomer = await Payment.findOne({
      stripeCustomerId: { $exists: true, $ne: null },
      $or: candidateObjectIds.map((id) => ({ tenantId: id })),
    })
      .sort({ updatedAt: -1 })
      .lean();
  }

  if (paymentWithCustomer?.stripeCustomerId) {
    if (tenant && !tenant.stripeCustomerId) {
      tenant.stripeCustomerId = paymentWithCustomer.stripeCustomerId;
      await tenant.save();
    }
    return paymentWithCustomer.stripeCustomerId;
  }

  let recurringPaymentWithCustomer:
    | { stripeCustomerId?: string }
    | null = null;

  if (candidateObjectIds.length > 0) {
    recurringPaymentWithCustomer = await RecurringPayment.findOne({
      stripeCustomerId: { $exists: true, $ne: null },
      $or: candidateObjectIds.map((id) => ({ tenantId: id })),
    })
      .sort({ updatedAt: -1 })
      .lean();
  }

  if (recurringPaymentWithCustomer?.stripeCustomerId) {
    if (tenant && !tenant.stripeCustomerId) {
      tenant.stripeCustomerId = recurringPaymentWithCustomer.stripeCustomerId;
      await tenant.save();
    }
    return recurringPaymentWithCustomer.stripeCustomerId;
  }

  if (user?.email) {
    const fullName = `${user.firstName ?? ""} ${user.lastName ?? ""}`
      .trim()
      .replace(/\s+/g, " ");

    const existingCustomer = await stripe.customers.list({
      email: user.email,
      limit: 1,
    });

    const customer =
      existingCustomer.data[0] ||
      (await stripe.customers.create({
        email: user.email,
        name: fullName || user.email,
        metadata: {
          tenantId: tenant?._id?.toString() ?? "",
          userId: user?._id?.toString() ?? "",
          source: "PropertyPro",
        },
      }));

    if (tenant) {
      tenant.stripeCustomerId = customer.id;
      await tenant.save();
    }

    return customer.id;
  }

  return null;
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { searchParams } = new URL(request.url);
    const type = searchParams.get("type") || "card";
    const resolvedParams = await params;

    const resolvedCustomerId = await resolveStripeCustomerId(resolvedParams.id);

    if (!resolvedCustomerId) {
      return NextResponse.json(
        { error: "Stripe customer not found for the provided identifier" },
        { status: 404 }
      );
    }

    // Retrieve customer payment methods
    const paymentMethods = await stripe.paymentMethods.list({
      customer: resolvedCustomerId,
      type: type as Stripe.PaymentMethodListParams.Type,
    });


    return NextResponse.json({
      data: paymentMethods.data.map((pm) => ({
        id: pm.id,
        type: pm.type,
        card: pm.card,
        billing_details: pm.billing_details,
        created: pm.created,
      })),
      has_more: paymentMethods.has_more,
      customerId: resolvedCustomerId,
    });
  } catch (error) {
    console.error("Stripe customer payment methods retrieval error:", error);

    if (error instanceof Stripe.errors.StripeError) {
      return NextResponse.json(
        {
          error: error.message,
          type: error.type,
          code: error.code,
        },
        { status: 400 }
      );
    }

    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
