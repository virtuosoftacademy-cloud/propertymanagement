'use client';

import { useDisplaySettingsSync } from "@/hooks/useDisplaySettingsSync";
import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";

const Footer = () => {
  // The landing footer is PUBLIC, and useDisplaySettingsSync reads
  // /api/settings/display which 401s without a session — so anonymous
  // visitors never saw the configured branding. /api/branding/public serves
  // the same admin-owned values without auth.
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
        // Best-effort; the bundled default still renders.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const { settings: displaySettings, syncSettings } = useDisplaySettingsSync({
    pollInterval: 30000,
    autoResolveConflicts: true,
  });

  // NOTE: there is deliberately no theme-derived logo here, unlike the header.
  // See footerLogoSrc below — the footer background is dark in BOTH themes, so
  // swapping the logo with the theme would put a light-on-transparent logo on a
  // dark background half the time. A theme-derived memo used to sit here and
  // was never rendered, which made this file look like it had the header's
  // hydration bug when it did not.

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

  // The footer sits on a dark background in BOTH themes
  // (bg-foreground / dark:bg-background), so it always wants the dark-background
  // logo — not the theme-derived one the header uses.
  //
  // This previously read from a `currentLogo` state that was declared and never
  // assigned, so the ternary always chose "" and the footer rendered an empty
  // <Image src="">. That is why no footer logo appeared for anyone.
  const footerLogoSrc =
    displaySettings?.branding?.logoDark ||
    publicBranding?.logoDark ||
    "/images/logo-light.png";

  return (
    <footer className="relative bg-foreground dark:bg-background">
      <div className="max-w-350 mx-auto py-12 px-16 md:px-16 xl:px-0">
        <div className="text-center md:text-left">
          <div className="flex justify-between flex-wrap space-y-10 gap-10">
            <div className="flex justify-center md:justify-start">
              <Link href="/">
                <Image src={footerLogoSrc} alt="PropertyPro logo" width={192} height={48} className="w-38 h-auto md:py-2" />
              </Link>
            </div>

            <div>
              <p className="text-base md:text-[1.2rem] dark:text-foreground text-muted-foreground md:max-w-lg leading-relaxed font-serif">
                Bring your properties, tenants, payments, and workflows together in one powerful platform designed to simplify operations and keep you in control.
              </p>
            </div>
            <div className="text-sm md:text-base text-accent dark:text-foreground space-y-1">
              <h2>
                  Help & Legal
              </h2>
              <ul className="text-muted-foreground dark:text-foreground">
                <li>Terms & Conditions</li>
                <li>Privacy Policy</li>
              </ul>

            </div>
          </div>
        </div>
        <hr className="bg-foreground dark:bg-muted-foreground" />
        <div className="dark:text-foreground text-muted-foreground pt-8 flex flex-col sm:flex-row items-center justify-between gap-4 text-sm md:text-base">
          <p>© 2026 Tenure | All rights reserved.</p>
        </div>

      </div>

    </footer>
  );
};

export default Footer;