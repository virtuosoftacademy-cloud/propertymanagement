"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { ChevronUp, Menu, X } from "lucide-react";
import { useDisplaySettingsSync } from "@/hooks/useDisplaySettingsSync";
import { useTheme } from "next-themes";

// ─── Data ─────────────────────────────────────────────────────────────────────

const consultingServicesItems = [
  {
    title: "Payroll",
    href: "#",
    subPages: [
      { label: "Payroll Bureau Service", href: "#" },
      { label: "Compliance Service", href: "#" },
    ],
  },
  {
    title: "Finance Function",
    href: "#",
    subPages: [
      { label: "Business Accounting", href: "#" },
      { label: "Financial Consultancy", href: "#" },
      { label: "Individual Accounting", href: "#" },
    ],
  },
  { title: "Fractional CFO", href: "#", subPages: [] },
  { title: "Digital Accounting", href: "#", subPages: [] },
  { title: "Tax", href: "#", subPages: [] },
  { title: "Property Accounting", href: "#", subPages: [] },
  { title: "Industries", href: "#", subPages: [] },
  { title: "View all Payroll Services", href: "#", subPages: [], isViewAll: true },
];

// ─── Navbar ───────────────────────────────────────────────────────────────────

export default function Navbar() {
  
  const { resolvedTheme } = useTheme();
  const { settings: displaySettings, syncSettings } = useDisplaySettingsSync({
    pollInterval: 30000,
    autoResolveConflicts: true,
  });

  const currentLogoUrl = useMemo(() => {
    // Always fall back to the default logos so something always renders.
    const defaultLight = "/images/logo-light.png";
    const defaultDark = "/images/logo-dark.png";

    const branding = displaySettings?.branding;
    const light = branding?.logoLight || defaultLight;
    const dark = branding?.logoDark || defaultDark;

    return resolvedTheme === "dark" ? dark : light;
  }, [displaySettings?.branding, resolvedTheme]);

  const currentIconUrl = useMemo(() => {
    const defaultIcon = "/favicon.ico";
    return displaySettings?.branding?.favicon || defaultIcon;
  }, [displaySettings?.branding]);

  // Update the favicon in the document head when branding changes.
  useEffect(() => {
    const faviconUrl = displaySettings?.branding?.favicon;
    if (!faviconUrl || typeof document === "undefined") return;
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
  }, [displaySettings?.branding?.favicon]);

  // Refresh branding immediately when settings are updated elsewhere.
  useEffect(() => {
    if (typeof window === "undefined") return;

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

  const pathname = usePathname();
  const [scrolled, setScrolled] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [openSubMobile, setOpenSubMobile] = useState<number | null>(null);
  const [mobileServicesOpen, setMobileServicesOpen] = useState(false);

  // Solidify the (otherwise transparent) navbar once the user scrolls off the hero.
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 10);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const isTransparentRoute = pathname === "/" || pathname === "/landing";
  const isSolid = scrolled || !isTransparentRoute;
  const navBg = isSolid ? "bg-white shadow-sm" : "bg-transparent shadow-none";
  const textColor = isSolid ? "text-foreground" : "text-accent";
  const logoSrc = scrolled ? currentIconUrl : currentLogoUrl;

  return (
    <nav
      id="nav"
      className={cn(
        "z-50 w-full py-4 md:py-6 border-b border-muted-foreground/40 transition-all duration-300",
        navBg,
        textColor
      )}
    >
      <div className="flex items-center justify-between pr-6 md:px-0 max-w-360 mx-auto">
        {/* Logo */}
        <Link href="/">
          <Image
            src={logoSrc}
            alt="Logo"
            width={160}
            height={48}
            className={cn(
              "transition-all duration-300 h-7 md:h-auto",
              scrolled && "h-7 lg:h-8"
            )}
            priority
          />
        </Link>

        {/* Desktop right */}
        <div className="flex gap-5">
          <div className="hidden md:flex items-center gap-4">
            <Button size="lg" className="text-sm rounded-none font-normal p-6" asChild>
              <Link href="/auth/signin">Log In</Link>
            </Button>
          </div>

          <div className="hidden md:flex items-center gap-4">
            <Button variant={"ghost"} size="lg" className="rounded-none text-sm font-normal p-6 text-white border border-white" asChild>
              <Link href="/auth/signup">Sign Up</Link>
            </Button>
          </div>
        </div>

        {/* Mobile toggle */}
        <button
          className="md:hidden"
          onClick={() => setMobileOpen((p) => !p)}
          aria-label="Toggle menu"
        >
          {mobileOpen ? <X size={28} /> : <Menu size={28} />}
        </button>
      </div>

      {/* Mobile menu */}
      {mobileOpen && (
        <div className="md:hidden mt-4 px-4 bg-foreground text-accent max-h-[80vh] overflow-y-auto">

        </div>
      )}
    </nav>
  );
}