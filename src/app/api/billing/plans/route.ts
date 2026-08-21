/**
 * PropertyPro - Plans API
 *
 * A plan IS a role, so this writes to the `roles` collection. Creating a plan
 * therefore creates the thing registration and the Stripe webhook already look
 * for by name — which is what closes the old failure where a plan existed with
 * no role and sign-up returned "Sign-up is not available yet".
 *
 * Paid plans get their Stripe Product and Price created here, because a plan
 * sold at a price with no Stripe Price behind it fails at checkout, and the
 * admin has no way to tell until a customer hits it.
 */

import { NextRequest } from "next/server";
import Stripe from "stripe";
import { z } from "zod";
import { Role, Subscription, User } from "@/models";
import { UserRole } from "@/types";
import {
  createSuccessResponse,
  createErrorResponse,
  handleApiError,
  parseRequestBody,
  withRoleAndDB,
} from "@/lib/api-utils";
import { getPlans } from "@/lib/billing/plan-store";

const planSchema = z.object({
  /** Becomes the role name, so it must obey the same rules as one. */
  id: z
    .string()
    .trim()
    .min(1, "An id is required")
    .max(50, "Id cannot exceed 50 characters")
    .regex(/^[a-z0-9_]+$/, "Id may contain only lowercase letters, numbers and underscores"),
  name: z.string().trim().min(1, "A name is required").max(100),
  description: z.string().trim().max(500).default(""),
  monthlyPrice: z.number().min(0).max(1_000_000).nullable(),
  annualPrice: z.number().min(0).max(1_000_000).nullable(),
  unitLimit: z.number().int().min(0).max(100_000).nullable(),
  pricePerUnit: z.number().min(0).max(10_000).nullable().default(null),
  features: z.array(z.string().trim().max(200)).max(30).default([]),
  popular: z.boolean().default(false),
  custom: z.boolean().default(false),
  /** Permissions the plan grants — this is a role, after all. */
  permissions: z.array(z.string()).default([]),
});

// ============================================================================
// GET /api/billing/plans
// ============================================================================

export const GET = withRoleAndDB([UserRole.ADMIN])(async () => {
  try {
    const plans = await getPlans();

    // How many subscriptions and users sit on each plan — the number that
    // decides whether it can be retired, so it belongs next to the plan rather
    // than a click away.
    const [subs, users] = await Promise.all([
      Subscription.find({}).select("planId").lean(),
      User.find({}).select("role").lean(),
    ]);

    const withUsage = plans.map((p) => ({
      ...p,
      subscriptionCount: (subs as any[]).filter((s) => s.planId === p.id).length,
      userCount: (users as any[]).filter((u) => u.role === p.id).length,
    }));

    return createSuccessResponse(withUsage);
  } catch (error) {
    return handleApiError(error);
  }
});

// ============================================================================
// POST /api/billing/plans
// ============================================================================

export const POST = withRoleAndDB([UserRole.ADMIN])(
  async (user, request: NextRequest) => {
    try {
      const body = await parseRequestBody(request);
      if (!body.success) return createErrorResponse(body.error!, 400);

      const parsed = planSchema.safeParse(body.data);
      if (!parsed.success) {
        return createErrorResponse(
          parsed.error.issues.map((i) => i.message).join(", "),
          400
        );
      }

      const v = parsed.data;

      const clash = await Role.findOne({ name: v.id });
      if (clash) {
        return createErrorResponse(
          `A role named "${v.id}" already exists. Edit it instead, or choose another id.`,
          409
        );
      }

      // Create the Stripe Product/Price BEFORE the role. If Stripe fails we
      // want no plan at all rather than one that looks sellable and 500s at
      // checkout — the failure mode this whole endpoint exists to prevent.
      let stripeProductId: string | null = null;
      let stripePriceIdMonthly: string | null = null;
      let stripePriceIdAnnual: string | null = null;

      const isPaid = !v.custom && ((v.monthlyPrice ?? 0) > 0 || (v.annualPrice ?? 0) > 0);

      if (isPaid) {
        if (!process.env.STRIPE_SECRET_KEY) {
          return createErrorResponse(
            "STRIPE_SECRET_KEY is not set, so a paid plan cannot be created. Add it, or save this plan as free or custom.",
            503
          );
        }

        const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

        const product = await stripe.products.create({
          name: v.name,
          description: v.description || undefined,
          metadata: { planId: v.id },
        });
        stripeProductId = product.id;

        if ((v.monthlyPrice ?? 0) > 0) {
          const price = await stripe.prices.create({
            product: product.id,
            currency: "gbp",
            unit_amount: Math.round((v.monthlyPrice as number) * 100),
            recurring: { interval: "month" },
            metadata: { planId: v.id, cycle: "monthly" },
          });
          stripePriceIdMonthly = price.id;
        }

        if ((v.annualPrice ?? 0) > 0) {
          const price = await stripe.prices.create({
            product: product.id,
            currency: "gbp",
            unit_amount: Math.round((v.annualPrice as number) * 100),
            recurring: { interval: "year" },
            metadata: { planId: v.id, cycle: "annual" },
          });
          stripePriceIdAnnual = price.id;
        }
      }

      const role = await Role.create({
        name: v.id,
        label: v.name,
        description: v.description || v.name,
        permissions: v.permissions,
        // Plans are sold to managers; this is what makes every route guard
        // written against the three-value UserRole enum accept the holder.
        inheritsFrom: "manager",
        isActive: true,
        isSystem: false,
        isPlan: true,
        monthlyPrice: v.monthlyPrice,
        annualPrice: v.annualPrice,
        unitLimit: v.unitLimit,
        pricePerUnit: v.pricePerUnit,
        features: v.features,
        popular: v.popular,
        custom: v.custom,
        stripeProductId,
        stripePriceIdMonthly,
        stripePriceIdAnnual,
        createdBy: user.id,
        updatedBy: user.id,
      });

      return createSuccessResponse(
        {
          id: role.name,
          stripeProductId,
          stripePriceIdMonthly,
          stripePriceIdAnnual,
        },
        isPaid
          ? `Plan created, with its Stripe Price.`
          : `Plan created.`
      );
    } catch (error) {
      return handleApiError(error);
    }
  }
);
