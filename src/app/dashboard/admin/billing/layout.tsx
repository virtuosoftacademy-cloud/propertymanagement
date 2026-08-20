import RequireAdmin from "@/components/auth/require-admin";

export const metadata = {
  title: "Manager Accounts | PropertyPro",
};

export default function BillingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <RequireAdmin>{children}</RequireAdmin>;
}
