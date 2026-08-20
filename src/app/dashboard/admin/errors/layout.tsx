import RequireAdmin from "@/components/auth/require-admin";

export const metadata = {
  title: "Error Monitoring | PropertyPro",
};

/**
 * The page itself had no role check of any kind, and no layout covered this
 * segment — only /dashboard/admin/billing had one — so any authenticated user
 * could open it by typing the URL.
 *
 * Scoped to this segment rather than added at /dashboard/admin, because a
 * blanket admin layout there would also gate /dashboard/admin/users, which
 * MANAGER is allowed to reach.
 */
export default function ErrorMonitoringLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <RequireAdmin>{children}</RequireAdmin>;
}
