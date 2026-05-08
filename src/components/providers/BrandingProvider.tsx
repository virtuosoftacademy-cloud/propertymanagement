/**
 * PropertyPro - Branding Provider
 * Global provider for dynamic branding colors and theme management
 */

"use client";

import React, { createContext, useContext, useEffect, useState } from "react";

interface BrandingSettings {
  primaryColor: string;
  secondaryColor: string;
  logoLight: string;
  logoDark: string;
  favicon: string;
}

interface BrandingContextType {
  branding: BrandingSettings;
  updateBranding: (newBranding: Partial<BrandingSettings>) => void;
  isLoading: boolean;
}

const defaultBranding: BrandingSettings = {
  primaryColor: "#3B82F6",
  secondaryColor: "#64748B",
  logoLight: "/images/logo-light.png",
  logoDark: "/images/logo-dark.png",
  favicon: "/favicon.ico",
};

const BrandingContext = createContext<BrandingContextType>({
  branding: defaultBranding,
  updateBranding: () => {},
  isLoading: true,
});

interface BrandingProviderProps {
  children: React.ReactNode;
}

export function BrandingProvider({ children }: BrandingProviderProps) {
  const [branding, setBranding] = useState<BrandingSettings>(defaultBranding);
  const [isLoading, setIsLoading] = useState(true);

  // Fetch branding settings from API
  const fetchBranding = async () => {
    try {
      const response = await fetch("/api/settings/display");
      if (response.ok) {
        const data = await response.json();
        const brandingData = data?.settings?.branding || data?.branding;

        if (brandingData) {
          setBranding({
            primaryColor:
              brandingData.primaryColor || defaultBranding.primaryColor,
            secondaryColor:
              brandingData.secondaryColor || defaultBranding.secondaryColor,
            logoLight: brandingData.logoLight || defaultBranding.logoLight,
            logoDark: brandingData.logoDark || defaultBranding.logoDark,
            favicon: brandingData.favicon || defaultBranding.favicon,
          });
        }
      }
    } catch (error) {
      console.error("Failed to fetch branding settings:", error);
    } finally {
      setIsLoading(false);
    }
  };

  // Update branding settings
  const updateBranding = (newBranding: Partial<BrandingSettings>) => {
    setBranding((prev) => ({ ...prev, ...newBranding }));
  };

  // Apply CSS variables to document root
  const applyCSSVariables = () => {
    if (typeof document === "undefined") return;

    const root = document.documentElement;

    // Apply primary color variations
    root.style.setProperty("--primary", branding.primaryColor);
    root.style.setProperty("--primary-rgb", hexToRgb(branding.primaryColor));

    // Create lighter and darker variations
    const hsl = hexToHsl(branding.primaryColor);
    if (hsl) {
      // Light variant (increase lightness)
      const lightHsl = `hsl(${hsl.h}, ${hsl.s}%, ${Math.min(hsl.l + 10, 95)}%)`;
      root.style.setProperty("--primary-light", lightHsl);

      // Dark variant (decrease lightness)
      const darkHsl = `hsl(${hsl.h}, ${hsl.s}%, ${Math.max(hsl.l - 10, 5)}%)`;
      root.style.setProperty("--primary-dark", darkHsl);

      // Sidebar primary colors
      root.style.setProperty("--sidebar-primary", branding.primaryColor);

      // Ring color for focus states
      root.style.setProperty("--ring", branding.primaryColor);

      // Chart primary color
      root.style.setProperty("--chart-1", branding.primaryColor);
    }

    // Apply secondary color
    root.style.setProperty("--secondary-brand", branding.secondaryColor);
  };

  // Utility function to convert hex to RGB
  const hexToRgb = (hex: string): string => {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    if (result) {
      const r = parseInt(result[1], 16);
      const g = parseInt(result[2], 16);
      const b = parseInt(result[3], 16);
      return `${r}, ${g}, ${b}`;
    }
    return "59, 130, 246"; // Default blue
  };

  // Utility function to convert hex to HSL
  const hexToHsl = (
    hex: string
  ): { h: number; s: number; l: number } | null => {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    if (!result) return null;

    let r = parseInt(result[1], 16) / 255;
    let g = parseInt(result[2], 16) / 255;
    let b = parseInt(result[3], 16) / 255;

    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    let h: number, s: number, l: number;

    l = (max + min) / 2;

    if (max === min) {
      h = s = 0; // achromatic
    } else {
      const d = max - min;
      s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
      switch (max) {
        case r:
          h = (g - b) / d + (g < b ? 6 : 0);
          break;
        case g:
          h = (b - r) / d + 2;
          break;
        case b:
          h = (r - g) / d + 4;
          break;
        default:
          h = 0;
      }
      h /= 6;
    }

    return {
      h: Math.round(h * 360),
      s: Math.round(s * 100),
      l: Math.round(l * 100),
    };
  };

  // Initial load
  useEffect(() => {
    fetchBranding();
  }, []);

  // Apply CSS variables when branding changes
  useEffect(() => {
    applyCSSVariables();
  }, [branding]);

  // Listen for display settings updates
  useEffect(() => {
    const handleDisplaySettingsUpdate = () => {
      fetchBranding();
    };

    const handleStorageUpdate = (e: StorageEvent) => {
      if (e.key === "pc-display-settings-updated") {
        fetchBranding();
      }
    };

    if (typeof window !== "undefined") {
      window.addEventListener(
        "pc:display-settings-updated",
        handleDisplaySettingsUpdate
      );
      window.addEventListener("storage", handleStorageUpdate);

      return () => {
        window.removeEventListener(
          "pc:display-settings-updated",
          handleDisplaySettingsUpdate
        );
        window.removeEventListener("storage", handleStorageUpdate);
      };
    }
  }, []);

  return (
    <BrandingContext.Provider
      value={{
        branding,
        updateBranding,
        isLoading,
      }}
    >
      {children}
    </BrandingContext.Provider>
  );
}

export const useBranding = () => {
  const context = useContext(BrandingContext);
  if (!context) {
    throw new Error("useBranding must be used within a BrandingProvider");
  }
  return context;
};
