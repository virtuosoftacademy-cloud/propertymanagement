"use client";

import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { ShieldAlert } from "lucide-react";
import { UserRole } from "@/types";

/**
 * Client-side gate for a settings page.
 *
 * Mirrors hasActionPermission() on the server: an admin always passes, a
 * built-in role passes (its role list is the authority), and an admin-created
 * role must hold the permission or its *_management parent.
 *
 * This is UX, NOT security — it runs in the browser after the page has already
 * shipped. The authority is the API: /api/settings/display already refuses a
 * non-admin write. Keep both; the gate stops someone wandering into a page they
 * cannot use, the API stops them changing anything if they do.
 */
export function RequirePermission({
  permission,
  roles,
  children,
}: {
  permission: string;
  /** Built-in roles allowed through before the permission is considered. */
  roles?: UserRole[];
  children: React.ReactNode;
}) {
  const { data: session, status } = useSession();
  const router = useRouter();

  const user = session?.user as any;
  const role = user?.role as UserRole | undefined;

  const allowed = (() => {
    if (status !== "authenticated") return false;
    if (role === UserRole.ADMIN) return true;
    if (roles && role && !roles.includes(role)) return false;
    if (!user?.isCustomRole) return true;
    const held: string[] = user?.permissions ?? [];
    const group = permission.split("_")[0];
    return held.includes(permission) || held.includes(`${group}_management`);
  })();

  useEffect(() => {
    if (status === "authenticated" && !allowed) {
      // Replace, not push: the page they cannot see should not sit in history
      // for the back button to land on again.
      router.replace("/dashboard");
    }
  }, [status, allowed, router]);

  if (status === "loading") {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="border-primary h-8 w-8 animate-spin rounded-full border-b-2" />
      </div>
    );
  }

  if (!allowed) {
    // Shown briefly before the redirect lands, and it is what a user sees if
    // the redirect is blocked for any reason. Says why, rather than a blank.
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-24 text-center">
        <ShieldAlert className="text-muted-foreground h-10 w-10" />
        <h2 className="text-lg font-medium">You don&apos;t have access to this</h2>
        <p className="text-muted-foreground max-w-sm text-sm">
          These settings are managed by an administrator. Ask them to grant your
          role access if you need it.
        </p>
      </div>
    );
  }

  return <>{children}</>;
}
