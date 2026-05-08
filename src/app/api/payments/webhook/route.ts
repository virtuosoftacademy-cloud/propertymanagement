/**
 * PropertyPro - Stripe Webhook Handler
 * Handles Stripe webhook events for payment processing
 */

import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { constructWebhookEvent, handleWebhookEvent } from "@/lib/stripe";
import connectDB from "@/lib/mongodb";

export async function POST(request: NextRequest) {
  try {
    // Connect to database
    await connectDB();

    // Get the raw body
    const body = await request.text();

    // Get the Stripe signature from headers
    const headersList = headers();
    const signature = headersList.get("stripe-signature");

    if (!signature) {
      console.error("Missing Stripe signature");
      return NextResponse.json(
        { error: "Missing Stripe signature" },
        { status: 400 }
      );
    }

    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
    if (!webhookSecret) {
      console.error("Missing Stripe webhook secret");
      return NextResponse.json(
        { error: "Webhook secret not configured" },
        { status: 500 }
      );
    }

    // Construct the Stripe event
    const event = constructWebhookEvent(body, signature, webhookSecret);


    // Handle the event
    await handleWebhookEvent(event);

    return NextResponse.json({ received: true });
  } catch (error) {
    console.error("Webhook error:", error);

    if (error instanceof Error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json(
      { error: "Webhook handler failed" },
      { status: 500 }
    );
  }
}
