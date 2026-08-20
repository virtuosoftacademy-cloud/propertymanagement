/**
 * PropertyPro - Users an admin can attach a manager account to
 *
 * Picking a client from a list rather than typing a name is what lets the
 * account carry a real userId instead of a string nothing can join on.
 * Users who already hold an account are returned with `hasAccount` so the form
 * can show them greyed rather than silently hiding them — a client asking why
 * their name is missing is worse than one that is visibly already set up.
 */

import { Subscription, Role, User } from "@/models";
import { UserRole } from "@/types";
import type { SelectableUser } from "@/types/billing";
import {
  createSuccessResponse,
  handleApiError,
  withRoleAndDB,
} from "@/lib/api-utils";

export const GET = withRoleAndDB([UserRole.ADMIN])(async () => {
  try {
    // Plan roles ("free", "pro") and other admin-created roles are stored on
    // the user as their own name, not as "manager" — so a query for the two
    // built-in names missed every client on a plan. The account being edited
    // then had no matching option and its Client field rendered blank.
    // Include any active role that inherits from manager or admin.
    const inheriting = await Role.find({
      isActive: true,
      inheritsFrom: { $in: ["manager", "admin"] },
    })
      .select("name")
      .lean();

    const selectableRoles = [
      "manager",
      "admin",
      ...(inheriting as any[]).map((r) => r.name),
    ];

    const [users, accounts] = await Promise.all([
      User.find({ role: { $in: selectableRoles }, isActive: true })
        .select("firstName lastName email phone companyName")
        .sort({ firstName: 1, lastName: 1 })
        .lean(),
      Subscription.find({}).select("userId").lean(),
    ]);

    const taken = new Set(
      (accounts as any[])
        .map((a) => a.userId && String(a.userId))
        .filter(Boolean)
    );

    const result: SelectableUser[] = (users as any[]).map((u) => ({
      id: String(u._id),
      name: [u.firstName, u.lastName].filter(Boolean).join(" ").trim(),
      email: u.email,
      phone: u.phone || undefined,
      company: u.companyName || undefined,
      hasAccount: taken.has(String(u._id)) || undefined,
    }));

    return createSuccessResponse(result);
  } catch (error) {
    return handleApiError(error);
  }
});
