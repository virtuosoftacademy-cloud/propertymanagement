/**
 * PropertyPro - Roles a plan can be built on
 *
 * A plan IS a role, so selling a new plan usually means putting a price on a
 * role that already exists rather than inventing a parallel one. This lists
 * the active roles that are not already plans, with the features their
 * permissions imply, so the plan form can offer them.
 *
 * userCount matters and is returned deliberately: promoting a role to a paid
 * plan applies that plan's unit limit to everyone already holding the role, so
 * the admin needs to see who they are about to affect BEFORE choosing it.
 */

import { Role, User } from "@/models";
import { UserRole } from "@/types";
import {
  createSuccessResponse,
  handleApiError,
  withRoleAndDB,
} from "@/lib/api-utils";
import {
  featuresFromPermissions,
  prettifyRoleName,
} from "@/lib/billing/role-features";

/**
 * Roles that must never become a plan.
 *
 * Only admin. Selling it would put system administration behind a
 * subscription, and every guard in the app treats admin as the role that
 * bypasses plan limits — a priced admin plan would be enforcing a unit ceiling
 * on the person meant to be exempt from it.
 */
const EXCLUDED_ROLES = ["admin"];

export const GET = withRoleAndDB([UserRole.ADMIN])(async () => {
  try {
    const roles = await Role.find({
      // Everything except admin. Admin is not a thing to sell — it is the role
      // that does the selling, and pricing it up would put the whole system
      // behind a subscription.
      name: { $nin: EXCLUDED_ROLES },
      deletedAt: null,
    })
      .select(
        "name displayName description permissions inheritsFrom isPlan isActive"
      )
      .lean();

    const counts = await Promise.all(
      roles.map((role: any) =>
        User.countDocuments({ role: role.name, deletedAt: null })
      )
    );

    const available = roles.map((role: any, index: number) => {
      const isPlan = Boolean(role.isPlan);

      return {
        name: role.name,
        label: role.displayName || prettifyRoleName(role.name),
        description: role.description || "",
        permissions: role.permissions ?? [],
        permissionCount: (role.permissions ?? []).length,
        features: featuresFromPermissions(role.permissions ?? []),
        userCount: counts[index],
        isPlan,
        isActive: Boolean(role.isActive),
        /**
         * A role that is already a plan cannot be promoted again — the API
         * refuses it. Returned rather than filtered out so the picker can show
         * it greyed with the reason, which answers "why isn't Pro in the list?"
         * without the admin having to guess.
         */
        selectable: !isPlan,
        reason: isPlan ? "already a plan" : null,
      };
    });

    // Selectable first, then roles nobody holds — those are the safe ones to
    // price up, since promoting them changes nothing for anyone today.
    available.sort(
      (a, b) =>
        Number(b.selectable) - Number(a.selectable) ||
        a.userCount - b.userCount ||
        a.label.localeCompare(b.label)
    );

    return createSuccessResponse(available);
  } catch (error) {
    return handleApiError(error);
  }
});
