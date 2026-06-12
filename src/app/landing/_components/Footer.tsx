'use client';

import { useDisplaySettingsSync } from "@/hooks/useDisplaySettingsSync";
import { useTheme } from "next-themes";
import Image from "next/image";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

const Footer = () => {
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

  const [currentLogo, setCurrentLogo] = useState()
  const logoSrc = currentLogo ? currentIconUrl : currentLogoUrl;

  return (
    <footer className="relative bg-background dark:bg-foreground">
      <div className="max-w-350 mx-auto py-12 px-16 md:px-16 xl:px-0">
        <div className="text-center md:text-left">
          <div className="flex justify-between flex-wrap space-y-10 gap-10">
            <div className="flex justify-center md:justify-start">
              <Link href="/">
                <Image src={currentLogo ? logoSrc : ""} alt="Property Logo" width={40} height={10} className="w-48 h-auto md:py-2" />
              </Link>
            </div>

            <div>
              <p className="text-base md:text-[1.2rem] text-foreground dark:text-muted-foreground md:max-w-lg leading-relaxed font-serif">
                Stay ahead in a rapidly changing world. Subscribe to Nexus Insights — our monthly look at the critical issues facing global businesses.
              </p>
            </div>
            <div className="text-sm md:text-base dark:text-muted-foreground text-foreground">
              <h2 className="text-muted-foreground dark:text-foreground">
                <strong>
                  Help & Legal
                </strong>
              </h2>
              <ul>
                <li>Terms & Conditions</li>
                <li>Privacy Policy</li>
              </ul>

            </div>
          </div>
        </div>
        <hr className="bg-accent dark:bg-muted-foreground" />
        <div className="dark:text-muted-foreground text-foreground pt-8 flex flex-col sm:flex-row items-center justify-between gap-4 text-sm md:text-base">
          <p>© 2026 PropertyPro | All rights reserved.</p>
        </div>

      </div>

    </footer>
  );
};

export default Footer;