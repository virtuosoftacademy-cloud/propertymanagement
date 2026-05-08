/**
 * PropertyPro - Stripe Payment Method Detach API
 * Detach payment methods from customers
 */

import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";

// Initialize Stripe
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: "2024-06-20",
});

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const paymentMethodId = params.id;

    // Detach payment method from customer
    const paymentMethod = await stripe.paymentMethods.detach(paymentMethodId);


    return NextResponse.json({
      id: paymentMethod.id,
      type: paymentMethod.type,
      detached: true,
    });
  } catch (error) {
    console.error("Stripe payment method detach error:", error);

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
