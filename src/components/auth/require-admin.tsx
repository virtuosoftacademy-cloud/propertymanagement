/**
 * PropertyPro - Server-side ADMIN gate
 *
 * A server component, deliberately. The dashboard layout
 * (src/app/dashboard/layout.tsx) is a client component that enforces
 * authentication only, and the existing admin pages gate themselves with a
 * client-side "Access Denied" panel — which is cosmetic, since there is no
 * middleware in this project. Redirecting here means a MANAGER or TENANT who
 * types the URL is turned away before the page renders, rather than merely
 * not seeing a sidebar link.
 *
 * Nesting a server layout inside the client dashboard layout is fine: Next
 * renders the server tree and passes the result in as `children`. Calling
 * auth() reads cookies, which marks the segment dynamic automatically.
 */

import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { UserRole } from "@/types";

export default async function RequireAdmin({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();

  if (!session?.user) {
    redirect("/auth/signin");
  }

  if (session.user.role !== UserRole.ADMIN) {
    redirect("/dashboard");
  }

  return <>{children}</>;
}
