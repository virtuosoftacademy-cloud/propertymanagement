/**
 * PropertyPro - Users an admin can attach a manager account to
 *
 * Picking a client from a list rather than typing a name is what lets the
 * account carry a real managerUserId instead of a string nothing can join on.
 * Users who already hold an account are returned with `hasAccount` so the form
 * can show them greyed rather than silently hiding them — a client asking why
 * their name is missing is worse than one that is visibly already set up.
 */

import { ManagerAccount, User } from "@/models";
import { UserRole } from "@/types";
import type { SelectableUser } from "@/types/billing";
import {
  createSuccessResponse,
  handleApiError,
  withRoleAndDB,
} from "@/lib/api-utils";

export const GET = withRoleAndDB([UserRole.ADMIN])(async () => {
  try {
    const [users, accounts] = await Promise.all([
      User.find({ role: { $in: ["manager", "admin"] }, isActive: true })
        .select("firstName lastName email phone companyName")
        .sort({ firstName: 1, lastName: 1 })
        .lean(),
      ManagerAccount.find({}).select("managerUserId").lean(),
    ]);

    const taken = new Set(
      (accounts as any[])
        .map((a) => a.managerUserId && String(a.managerUserId))
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
