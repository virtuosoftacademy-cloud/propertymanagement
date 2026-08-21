/**
 * PropertyPro - Single plan
 *
 * The id here is the ROLE NAME, not an ObjectId — a plan is a role, and its
 * name is what subscriptions and users store. Renaming it is a migration, so
 * PUT deliberately does not allow it.
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
import { getPlan } from "@/lib/billing/plan-store";

const updateSchema = z.object({
  name: z.string().trim().min(1).max(100),
  description: z.string().trim().max(500).default(""),
  monthlyPrice: z.number().min(0).max(1_000_000).nullable(),
  annualPrice: z.number().min(0).max(1_000_000).nullable(),
  unitLimit: z.number().int().min(0).max(100_000).nullable(),
  pricePerUnit: z.number().min(0).max(10_000).nullable().default(null),
  features: z.array(z.string().trim().max(200)).max(30).default([]),
  popular: z.boolean().default(false),
  custom: z.boolean().default(false),
  permissions: z.array(z.string()).optional(),
});

async function planId(context: any): Promise<string> {
  const params = await context?.params;
  return String(params?.id ?? "");
}

export const GET = withRoleAndDB([UserRole.ADMIN])(
  async (_user, _request: NextRequest, context: any) => {
    try {
      const plan = await getPlan(await planId(context));
      if (!plan) return createErrorResponse("Plan not found", 404);
      return createSuccessResponse(plan);
    } catch (error) {
      return handleApiError(error);
    }
  }
);

export const PUT = withRoleAndDB([UserRole.ADMIN])(
  async (user, request: NextRequest, context: any) => {
    try {
      const id = await planId(context);
      const role: any = await Role.findOne({ name: id, isPlan: true });
      if (!role) return createErrorResponse("Plan not found", 404);

      const body = await parseRequestBody(request);
      if (!body.success) return createErrorResponse(body.error!, 400);

      const parsed = updateSchema.safeParse(body.data);
      if (!parsed.success) {
        return createErrorResponse(
          parsed.error.issues.map((i) => i.message).join(", "),
          400
        );
      }

      const v = parsed.data;
      const set: Record<string, unknown> = {
        label: v.name,
        description: v.description || v.name,
        monthlyPrice: v.monthlyPrice,
        annualPrice: v.annualPrice,
        unitLimit: v.unitLimit,
        pricePerUnit: v.pricePerUnit,
        features: v.features,
        popular: v.popular,
        custom: v.custom,
        updatedBy: user.id,
      };
      if (v.permissions) set.permissions = v.permissions;

      // A changed price needs a NEW Stripe Price — Stripe Prices are immutable.
      // Existing subscribers stay on the old one until they resubscribe, which
      // is Stripe's own model: changing a price never silently re-bills anyone.
      const monthlyChanged =
        (v.monthlyPrice ?? 0) > 0 && v.monthlyPrice !== role.monthlyPrice;
      const annualChanged =
        (v.annualPrice ?? 0) > 0 && v.annualPrice !== role.annualPrice;
      const needsPrice =
        !v.custom &&
        (monthlyChanged ||
          annualChanged ||
          ((v.monthlyPrice ?? 0) > 0 && !role.stripePriceIdMonthly));

      if (needsPrice) {
        if (!process.env.STRIPE_SECRET_KEY) {
          return createErrorResponse(
            "STRIPE_SECRET_KEY is not set, so the new price cannot be created in Stripe.",
            503
          );
        }

        const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

        let productId = role.stripeProductId;
        if (!productId) {
          const product = await stripe.products.create({
            name: v.name,
            description: v.description || undefined,
            metadata: { planId: id },
          });
          productId = product.id;
          set.stripeProductId = productId;
        }

        if ((v.monthlyPrice ?? 0) > 0 && (monthlyChanged || !role.stripePriceIdMonthly)) {
          const price = await stripe.prices.create({
            product: productId,
            currency: "gbp",
            unit_amount: Math.round((v.monthlyPrice as number) * 100),
            recurring: { interval: "month" },
            metadata: { planId: id, cycle: "monthly" },
          });
          set.stripePriceIdMonthly = price.id;
        }

        if ((v.annualPrice ?? 0) > 0 && (annualChanged || !role.stripePriceIdAnnual)) {
          const price = await stripe.prices.create({
            product: productId,
            currency: "gbp",
            unit_amount: Math.round((v.annualPrice as number) * 100),
            recurring: { interval: "year" },
            metadata: { planId: id, cycle: "annual" },
          });
          set.stripePriceIdAnnual = price.id;
        }
      }

      await Role.updateOne({ _id: role._id }, { $set: set });

      return createSuccessResponse(
        await getPlan(id),
        needsPrice ? "Plan updated, with a new Stripe Price." : "Plan updated."
      );
    } catch (error) {
      return handleApiError(error);
    }
  }
);

/**
 * Retire a plan.
 *
 * Deactivates rather than deletes, and refuses while anyone is on it. A plan id
 * is stored on every subscription and on the user's role — deleting one in use
 * would leave subscriptions pointing at nothing and users holding a role that
 * resolves to no permissions.
 */
export const DELETE = withRoleAndDB([UserRole.ADMIN])(
  async (user, _request: NextRequest, context: any) => {
    try {
      const id = await planId(context);
      const role: any = await Role.findOne({ name: id, isPlan: true });
      if (!role) return createErrorResponse("Plan not found", 404);

      const [subs, users] = await Promise.all([
        Subscription.countDocuments({ planId: id, deletedAt: null }),
        User.countDocuments({ role: id }),
      ]);

      if (subs > 0 || users > 0) {
        const parts = [
          subs > 0 ? `${subs} subscription${subs === 1 ? "" : "s"}` : null,
          users > 0 ? `${users} user${users === 1 ? "" : "s"}` : null,
        ].filter(Boolean);

        return createErrorResponse(
          `Cannot retire "${id}" — ${parts.join(" and ")} still on it. Move them to another plan first.`,
          409
        );
      }

      await Role.updateOne(
        { _id: role._id },
        { $set: { isActive: false, updatedBy: user.id } }
      );

      return createSuccessResponse(
        { id },
        "Plan retired. Its Stripe Product was left in place — archive it in Stripe if you want it gone."
      );
    } catch (error) {
      return handleApiError(error);
    }
  }
);
