"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { LayoutDashboard, LogOut, Menu, X } from "lucide-react";
import { useDisplaySettingsSync } from "@/hooks/useDisplaySettingsSync";
import { signOut, useSession } from "next-auth/react";
import { useUserAvatar } from "@/components/providers/UserAvatarProvider";
import { useLocalizationContext } from "@/components/providers/LocalizationProvider";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import NotificationBell from "@/components/notifications/notification-bell";

// ─── Navbar ───────────────────────────────────────────────────────────────────

export default function Navbar() {
  const { data: session, status } = useSession();
  const { avatarUrl } = useUserAvatar();
  const { t } = useLocalizationContext();
  const { settings: displaySettings, syncSettings } = useDisplaySettingsSync({
    pollInterval: 30000,
    autoResolveConflicts: true,
  });

  // The landing page is PUBLIC, but useDisplaySettingsSync reads
  // /api/settings/display, which 401s for anonymous visitors — so a logged-out
  // visitor always fell back to the bundled placeholder logo and favicon and
  // never saw the configured branding. /api/branding/public serves the same
  // admin-owned branding without a session; the sign-in page already uses it.
  const [publicBranding, setPublicBranding] = useState<{
    logoLight?: string;
    logoDark?: string;
    favicon?: string;
  } | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/branding/public");
        const json = await res.json();
        if (!cancelled && json?.success && json.data) setPublicBranding(json.data);
      } catch {
        // Best-effort: the defaults below still render.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const [scrolled, setScrolled] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  /**
   * BOTH logos, not the one for the current theme.
   *
   * Picking here with `resolvedTheme` cannot work during server rendering: the
   * theme lives in localStorage, so the server always resolved to the light
   * logo while a dark-mode visitor's client resolved to the dark one, and React
   * reported a hydration mismatch on the img src.
   *
   * Rendering both and letting Tailwind's `dark:` variants choose fixes it
   * without a mounted gate — the provider uses attribute="class", so the class
   * is on <html> before paint. That also keeps the logo in the server HTML,
   * which matters because it is the LCP element and marked `priority`; hiding
   * it until mount would trade a console warning for a slower, flashing header.
   */
  const logoUrls = useMemo(() => {
    // Always fall back to the default logos so something always renders.
    const defaultLight = "/images/logo-dark.png";
    const defaultDark = "/images/logo-light.png";

    // displaySettings first so an admin editing branding sees it update live;
    // publicBranding is what an anonymous visitor gets.
    const branding = displaySettings?.branding;

    return {
      light:
        branding?.logoDark || publicBranding?.logoLight || defaultLight,
      dark: branding?.logoLight || publicBranding?.logoDark || defaultDark,
    };
  }, [displaySettings?.branding, publicBranding]);

  const currentIconUrl = useMemo(() => {
    const defaultIcon = "/favicon.ico";
    return (
      displaySettings?.branding?.favicon || publicBranding?.favicon || defaultIcon
    );
  }, [displaySettings?.branding, publicBranding]);

  // Update the favicon in the document head when branding changes.
  useEffect(() => {
    const faviconUrl =
      displaySettings?.branding?.favicon || publicBranding?.favicon;
    if (!faviconUrl) return;
    try {
      const rels = ["icon", "shortcut icon"] as const;
      rels.forEach((rel) => {
        let link = document.querySelector<HTMLLinkElement>(`link[rel='${rel}']`);
        if (!link) {
          link = document.createElement("link");
          link.rel = rel;
          document.head.appendChild(link);
        }
        link.href = faviconUrl;
      });
    } catch {
      // no-op; favicon update is best-effort
    }
  }, [displaySettings?.branding?.favicon, publicBranding?.favicon]);

  // Refresh branding immediately when settings are updated elsewhere.
  useEffect(() => {
    const handleUpdate = () => syncSettings?.();
    const handleStorage = (e: StorageEvent) => {
      if (e.key === "pc-display-settings-updated") syncSettings?.();
    };

    window.addEventListener("pc:display-settings-updated", handleUpdate);
    window.addEventListener("storage", handleStorage);
    return () => {
      window.removeEventListener("pc:display-settings-updated", handleUpdate);
      window.removeEventListener("storage", handleStorage);
    };
  }, [syncSettings]);

  const user = session?.user;

  return (
    <nav
      id="nav"
      className={cn(
        "relative z-10 -mb-25 w-full py-4 md:py-6 border-b border-background/20 dark:border-foreground/20 transition-all duration-300 px-6 md:px-12"
      )}
    >
      <div className="flex items-center justify-between pr-6 md:px-0 max-w-360 mx-auto">
        {/* Logo */}
        <Link href="/">
          <Image
            src={logoUrls.light}
            alt="Logo"
            width={160}
            height={48}
            className="transition-all duration-300 h-6 w-16 md:w-30 md:h-10 dark:hidden"
            priority
          />
          <Image
            src={logoUrls.dark}
            alt="Logo"
            width={160}
            height={48}
            // Both carry the same alt deliberately. `hidden` is display:none,
            // which drops the element from the accessibility tree, so exactly
            // one of the pair is ever announced.
            className="transition-all duration-300 h-6 w-16 md:w-30 md:h-10 hidden dark:block"
            priority
          />
        </Link>

        {/* Desktop right */}
        <div>
          {status === "loading" ? null : session ? (
            <div className="flex items-center gap-2 lg:gap-4">
              {/* Notifications */}
              <div className="hidden sm:flex">
                <NotificationBell />
              </div>
              <div className="sm:hidden">
                <NotificationBell />
              </div>

              {/* User Menu */}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="ghost"
                    className="relative h-8 w-8 rounded-full"
                  >
                    <Avatar className="h-8 w-8">
                      <AvatarImage
                        src={avatarUrl || user?.avatar || ""}
                        alt={user?.firstName || ""}
                      />
                      <AvatarFallback>
                        {user?.firstName?.[0]}
                        {user?.lastName?.[0]}
                      </AvatarFallback>
                    </Avatar>
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent className="w-56" align="end" forceMount>
                  <DropdownMenuLabel className="font-normal">
                    <div className="flex flex-col space-y-1">
                      <p className="text-sm font-medium leading-none">
                        {user?.firstName} {user?.lastName}
                      </p>
                      <p className="text-xs leading-none text-muted-foreground">
                        {user?.email}
                      </p>
                      <p className="text-xs leading-none text-muted-foreground capitalize">
                        {user?.role?.replace("_", " ")}
                      </p>
                    </div>
                  </DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <Link href="/dashboard">
                    <DropdownMenuItem
                      className="text-foreground"
                    >
                      <LayoutDashboard className="mr-2 h-4 w-4" />
                      <span>Dashboard</span>
                    </DropdownMenuItem>
                  </Link>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    className="text-red-600"
                    onClick={() => signOut({ callbackUrl: "/" })}
                  >
                    <LogOut className="mr-2 h-4 w-4" />
                    <span>{t("header.menu.logout")}</span>
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          ) : (
            <div className="hidden md:flex items-center gap-4">
              <Button
                size="lg"
                className="rounded-none text-sm font-normal px-12! text-white"
                asChild
              >
                <Link href="/auth/signin">Log In</Link>
              </Button>
              {/* <Button
                variant="ghost"
                size="lg"
                className="rounded-none text-sm font-normal px-10! text-white border border-white"
                asChild
              >
                <Link href="/auth/signup">Sign Up</Link>
              </Button> */}
            </div>
          )}
        </div>

        {/* Mobile toggle */}
        <button
          type="button"
          className="md:hidden"
          onClick={() => setMobileOpen((p) => !p)}
          aria-label="Toggle menu"
          aria-expanded={mobileOpen}
          aria-controls="mobile-menu"
        >
          {mobileOpen ? <X size={28} /> : <Menu size={28} />}
        </button>
      </div>

      {/* Mobile menu */}
      {mobileOpen && (
        <div
          id="mobile-menu"
          className="md:hidden mt-4 px-4 bg-foreground text-accent max-h-[80vh] overflow-y-auto"
        >

        </div>
      )}
    </nav>
  );
}