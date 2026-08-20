import RequireAdmin from "@/components/auth/require-admin";

export const metadata = {
  title: "User Management | PropertyPro",
};

/**
 * URL-level ADMIN enforcement for the whole /dashboard/admin/users subtree
 * (list, new, [id], [id]/edit, roles, history).
 *
 * These pages previously gated themselves client-side by rendering an
 * "Access Denied" panel. With no middleware in this project that is cosmetic —
 * the route still resolves and the page's JavaScript is still served. This
 * turns a non-admin away before the page renders.
 *
 * ADMIN only, deliberately: MANAGER could reach the user list before this and
 * can no longer. The user-facing API (GET /api/users) still allows MANAGER,
 * because the assignment dropdowns in the property and maintenance forms read
 * it — locking that too would break those flows for managers.
 */
export default function AdminUsersLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <RequireAdmin>{children}</RequireAdmin>;
}
