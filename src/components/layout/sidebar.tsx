/**
 * PropertyPro - Sidebar Navigation
 * Role-based navigation sidebar for the dashboard
 */

"use client";

import Link from "next/link";
import Image from "next/image";
import { cn } from "@/lib/utils";
import { useSession } from "next-auth/react";
import { usePathname } from "next/navigation";
import { Button } from "@/components/ui/button";
import { useEffect, useMemo, useState } from "react";
import { useUserAvatar } from "@/components/providers/UserAvatarProvider";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  Building2,
  Users,
  FileText,
  CreditCard,
  Wrench,
  BarChart3,
  Settings,
  Home,
  UserPlus,
  Calendar,
  Bell,
  DollarSign,
  Key,
  Shield,
  ChevronLeft,
  ChevronRight,
  User,
  Palette,
  MessageSquare,
  Grid3X3,
  FileLock,
  Files,
  FilePlusCorner, 
} from "lucide-react";
import { UserRole } from "@/types";
import { useTheme } from "next-themes";
import { useSidebarCounts } from "@/hooks/useSidebarCounts";
import { useDisplaySettingsSync } from "@/hooks/useDisplaySettingsSync";
import { useLocalizationContext } from "@/components/providers/LocalizationProvider";

interface NavItem {
  title: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  badge?: string;
  roles: UserRole[];
  children?: NavItem[];
}

interface NavSection {
  title?: string;
  items: NavItem[];
}

const navigationSections: NavSection[] = [
  {
    items: [
      {
        title: "nav.dashboard",
        href: "/dashboard",
        icon: Home,
        roles: [UserRole.ADMIN, UserRole.MANAGER, UserRole.TENANT],
      },
    ],
  },
  {
    title: "nav.section.management",
    items: [
      {
        title: "nav.properties",
        href: "/dashboard/properties",
        icon: Building2,
        roles: [UserRole.ADMIN, UserRole.MANAGER],
        children: [
          {
            title: "nav.properties.all",
            href: "/dashboard/properties",
            icon: Building2,
            roles: [UserRole.ADMIN, UserRole.MANAGER],
          },
          {
            title: "nav.properties.new",
            href: "/dashboard/properties/new",
            icon: Building2,
            roles: [UserRole.ADMIN, UserRole.MANAGER],
          },
          {
            title: "nav.properties.available",
            href: "/dashboard/properties/available",
            icon: Key,
            roles: [UserRole.ADMIN, UserRole.MANAGER],
          },
          {
            title: "nav.properties.allUnits",
            href: "/dashboard/properties/units",
            icon: Grid3X3,
            roles: [UserRole.ADMIN, UserRole.MANAGER],
          },
        ],
      },
      {
        title: "nav.tenants",
        href: "/dashboard/tenants",
        icon: Users,
        roles: [UserRole.ADMIN, UserRole.MANAGER],
        children: [
          {
            title: "nav.tenants.all",
            href: "/dashboard/tenants",
            icon: Users,
            roles: [UserRole.ADMIN, UserRole.MANAGER],
          },
          {
            title: "nav.tenants.new",
            href: "/dashboard/tenants/new",
            icon: UserPlus,
            roles: [UserRole.ADMIN, UserRole.MANAGER],
          },
          {
            title: "nav.tenants.applications",
            href: "/dashboard/tenants/applications",
            icon: UserPlus,
            roles: [UserRole.ADMIN, UserRole.MANAGER],
          },
        ],
      },
      {
        title: "nav.leases",
        href: "/dashboard/leases",
        icon: FileText,
        roles: [UserRole.ADMIN, UserRole.MANAGER, UserRole.TENANT],
        children: [
          {
            title: "nav.leases.all",
            href: "/dashboard/leases",
            icon: FileText,
            roles: [UserRole.ADMIN, UserRole.MANAGER],
          },
          {
            title: "nav.leases.new",
            href: "/dashboard/leases/new",
            icon: UserPlus,
            roles: [UserRole.ADMIN, UserRole.MANAGER],
          },
          {
            title: "nav.leases.active",
            href: "/dashboard/leases/active",
            icon: FileText,
            roles: [UserRole.ADMIN, UserRole.MANAGER],
          },
          {
            title: "nav.leases.expiring",
            href: "/dashboard/leases/expiring",
            icon: Calendar,
            roles: [UserRole.ADMIN, UserRole.MANAGER],
          },
          {
            title: "nav.leases.invoices",
            href: "/dashboard/leases/invoices",
            icon: DollarSign,
            roles: [UserRole.ADMIN, UserRole.MANAGER],
          },
          {
            title: "nav.leases.my",
            href: "/dashboard/leases/my-leases",
            icon: Home,
            roles: [UserRole.TENANT],
          },
          {
            title: "nav.leases.invoices",
            href: "/dashboard/leases/invoices",
            icon: DollarSign,
            roles: [UserRole.TENANT],
          },
          {
            title: "nav.leases.documents",
            href: "/dashboard/leases/documents",
            icon: FileText,
            roles: [UserRole.TENANT],
          },
        ],
      },
    ],
  },
  {
    title: "nav.section.operations",
    items: [
      {
        title: "nav.maintenance",
        href: "/dashboard/maintenance",
        icon: Wrench,
        roles: [UserRole.ADMIN, UserRole.MANAGER, UserRole.TENANT],
        children: [
          {
            title: "nav.maintenance.all",
            href: "/dashboard/maintenance",
            icon: Wrench,
            roles: [UserRole.ADMIN, UserRole.MANAGER],
          },
          {
            title: "nav.maintenance.emergency",
            href: "/dashboard/maintenance/emergency",
            icon: Bell,
            roles: [UserRole.ADMIN, UserRole.MANAGER],
          },
          {
            title: "nav.maintenance.submit",
            href: "/dashboard/maintenance/new",
            icon: Wrench,
            roles: [UserRole.TENANT],
          },
          {
            title: "nav.maintenance.mine",
            href: "/dashboard/maintenance/my-requests",
            icon: Wrench,
            roles: [UserRole.TENANT],
          },
        ],
      },
      {
        title: "Compliance",
        href: "/dashboard/compliance",
        icon: FileLock,
        roles: [UserRole.ADMIN, UserRole.MANAGER],
        children: [
          {
            title: "All Reports",
            href: "/dashboard/compliance",
            icon: Files,
            roles: [UserRole.ADMIN, UserRole.MANAGER],
          },
          {
            title: "Add Report",
            href: "/dashboard/compliance/new",
            icon: FilePlusCorner,
            roles: [UserRole.ADMIN, UserRole.MANAGER],
          }
        ]
      }
    ],
  },
  {
    title: "nav.section.financial",
    items: [
      {
        title: "nav.payments",
        href: "/dashboard/payments",
        icon: CreditCard,
        roles: [UserRole.ADMIN, UserRole.MANAGER, UserRole.TENANT],
        children: [
          {
            title: "nav.payments.all",
            href: "/dashboard/payments",
            icon: CreditCard,
            roles: [UserRole.ADMIN, UserRole.MANAGER],
          },
          {
            title: "nav.payments.overdue",
            href: "/dashboard/payments/overdue",
            icon: DollarSign,
            roles: [UserRole.ADMIN, UserRole.MANAGER],
          },
          {
            title: "nav.payments.payRent",
            href: "/dashboard/payments/pay-rent",
            icon: CreditCard,
            roles: [UserRole.TENANT],
          },
          {
            title: "nav.payments.history",
            href: "/dashboard/payments/history",
            icon: BarChart3,
            roles: [UserRole.TENANT],
          },
        ],
      },
    ],
  },
  {
    title: "nav.section.analytics",
    items: [
      {
        title: "nav.analytics",
        href: "/dashboard/analytics",
        icon: BarChart3,
        roles: [UserRole.ADMIN, UserRole.MANAGER],
        children: [
          {
            title: "nav.analytics.financial",
            href: "/dashboard/analytics/financial",
            icon: DollarSign,
            roles: [UserRole.ADMIN, UserRole.MANAGER],
          },
          {
            title: "nav.analytics.occupancy",
            href: "/dashboard/analytics/occupancy",
            icon: Building2,
            roles: [UserRole.ADMIN, UserRole.MANAGER],
          },
          {
            title: "nav.analytics.maintenance",
            href: "/dashboard/analytics/maintenance",
            icon: Wrench,
            roles: [UserRole.ADMIN, UserRole.MANAGER],
          },
        ],
      },
    ],
  },
  {
    title: "nav.section.communication",
    items: [
      {
        title: "nav.messages",
        href: "/dashboard/messages",
        icon: MessageSquare,
        roles: [UserRole.ADMIN, UserRole.MANAGER, UserRole.TENANT],
      },
    ],
  },
  {
    title: "nav.section.events",
    items: [
      {
        title: "nav.calendar",
        href: "/dashboard/calendar",
        icon: Calendar,
        roles: [UserRole.ADMIN, UserRole.MANAGER, UserRole.TENANT],
      },
    ],
  },
  {
    title: "nav.section.administration",
    items: [
      {
        title: "nav.admin",
        href: "/dashboard/admin",
        icon: Shield,
        roles: [UserRole.ADMIN],
        children: [
          {
            title: "nav.admin.overview",
            href: "/dashboard/admin",
            icon: Shield,
            roles: [UserRole.ADMIN],
          },
          {
            title: "nav.admin.users",
            href: "/dashboard/admin/users",
            icon: Users,
            roles: [UserRole.ADMIN],
          },
          {
            title: "nav.admin.users.new",
            href: "/dashboard/admin/users/new",
            icon: UserPlus,
            roles: [UserRole.ADMIN],
          },
          {
            title: "nav.admin.users.roles",
            href: "/dashboard/admin/users/roles",
            icon: Shield,
            roles: [UserRole.ADMIN],
          },
        ],
      },
      {
        title: "nav.settings",
        href: "/dashboard/settings",
        icon: Settings,
        roles: [UserRole.ADMIN, UserRole.MANAGER, UserRole.TENANT],
        children: [
          {
            title: "nav.settings.profile",
            href: "/dashboard/settings/profile",
            icon: User,
            roles: [UserRole.ADMIN, UserRole.MANAGER, UserRole.TENANT],
          },
          {
            title: "nav.settings.display",
            href: "/dashboard/settings/display",
            icon: Palette,
            roles: [UserRole.ADMIN, UserRole.MANAGER],
          },
        ],
      },
    ],
  },
];

interface SidebarProps {
  className?: string;
}

export function Sidebar({ className }: SidebarProps) {
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [expandedItems, setExpandedItems] = useState<string[]>([]);
  const pathname = usePathname();
  const { avatarUrl } = useUserAvatar();

  const { data: session } = useSession();
  const { resolvedTheme } = useTheme();
  const { t } = useLocalizationContext();
  // Sync display settings (branding) and react to changes without full reloads
  const { settings: displaySettings, syncSettings } = useDisplaySettingsSync({
    pollInterval: 30000,
    autoResolveConflicts: true,
  });

  // Get dynamic sidebar counts
  const { counts } = useSidebarCounts({
    refreshInterval: 30000, // Refresh every 30 seconds
    enabled: !!session?.user, // Only fetch when user is logged in
  });

  const userRole = session?.user?.role as UserRole;

  const toggleExpanded = (href: string) => {
    setExpandedItems((prev) =>
      prev.includes(href)
        ? prev.filter((item) => item !== href)
        : [...prev, href]
    );
  };

  // Function to get dynamic badge for navigation items
  const getDynamicBadge = (href: string): string | undefined => {
    switch (href) {
      case "/dashboard/tenants/applications":
        return counts.applications > 0
          ? counts.applications.toString()
          : undefined;
      case "/dashboard/leases/expiring":
        return counts.expiringLeases > 0
          ? counts.expiringLeases.toString()
          : undefined;
      case "/dashboard/maintenance/emergency":
        return counts.emergencyMaintenance > 0
          ? counts.emergencyMaintenance.toString()
          : undefined;
      case "/dashboard/compliance/reports":
        return counts.complianceReports > 0
          ? counts.complianceReports.toString()
          : undefined;
      case "/dashboard/payments/overdue":
        return counts.overduePayments > 0
          ? counts.overduePayments.toString()
          : undefined;
      default:
        return undefined;
    }
  };

  // Update navigation sections with dynamic badges
  const updateItemWithDynamicBadge = (item: NavItem): NavItem => {
    const dynamicBadge = getDynamicBadge(item.href);
    const updatedItem = {
      ...item,
      badge: dynamicBadge || item.badge, // Use dynamic badge if available, fallback to static
      children: item.children?.map(updateItemWithDynamicBadge),
    };
    return updatedItem;
  };

  const filteredSections = navigationSections
    .map((section) => ({
      ...section,
      items: section.items
        .filter((item) => item.roles.includes(userRole))
        .map(updateItemWithDynamicBadge),
    }))
    .filter((section) => section.items.length > 0);

  const renderNavItem = (item: NavItem, level = 0) => {
    const isActive = pathname === item.href;
    const hasChildren = item.children && item.children.length > 0;
    const filteredChildren = item.children?.filter((child) =>
      child.roles.includes(userRole)
    );

    // Check if any child is active (for parent highlighting)
    const hasActiveChild =
      hasChildren && filteredChildren?.some((child) => pathname === child.href);
    const isParentActive = hasActiveChild && level === 0;
    const isChildActive = isActive && level > 0;

    // Auto-expand parent if child is active
    const shouldExpand = expandedItems.includes(item.href) || hasActiveChild;
    const isExpanded = shouldExpand;

    return (
      <div key={item.href}>
        <Link
          href={hasChildren ? "#" : item.href}
          onClick={(e) => {
            if (hasChildren) {
              e.preventDefault();
              toggleExpanded(item.href);
            }
          }}
          className={cn(
            "flex items-center gap-3 px-3 py-2 text-sm font-medium transition-all duration-200 relative group rounded-lg",
            "hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground",
            // Main parent active state (full primary styling)
            isActive &&
            level === 0 &&
            "bg-gradient-to-r from-primary/20 to-primary-light/20 text-primary border border-primary/20 shadow-sm",
            // Parent with active child (subtle primary styling)
            isParentActive &&
            "bg-primary/10 text-primary border border-primary/10",
            // Child active state (lighter styling)
            isChildActive &&
            "bg-primary/5 text-primary border-l-2 border-primary/30 ml-6",
            level > 0 && "ml-8 text-xs py-1.5 relative",
            isCollapsed && "justify-center px-2"
          )}
        >
          {/* Tree structure indicator for child items */}
          {level > 0 && (
            <div className="absolute left-[-12px] top-1/2 w-3 h-px bg-gray-300 dark:bg-gray-600" />
          )}

          {/* Active indicator - only for main parent active state */}
          {isActive && level === 0 && (
            <div className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-6 bg-gradient-to-b from-primary to-primary-light rounded-r-full shadow-sm" />
          )}

          <item.icon
            className={cn(
              "h-4 w-4 transition-colors",
              isCollapsed && "h-5 w-5",
              isActive || isParentActive
                ? "text-primary"
                : "text-gray-600 dark:text-gray-400"
            )}
          />
          {!isCollapsed && (
            <>
              <span
                className={cn(
                  "flex-1 font-medium",
                  isActive || isParentActive
                    ? "text-primary"
                    : "text-gray-700 dark:text-gray-300"
                )}
              >
                {t(item.title)}
              </span>
              {item.badge && (
                <span className="inline-flex items-center justify-center px-2 py-0.5 text-xs font-medium bg-primary/10 text-primary border border-primary/15 rounded-full">
                  {item.badge}
                </span>
              )}
              {hasChildren && (
                <ChevronRight
                  className={cn(
                    "h-4 w-4 transition-transform duration-200 text-gray-400 dark:text-gray-500",
                    isExpanded && "rotate-90"
                  )}
                />
              )}
            </>
          )}
        </Link>

        {hasChildren && isExpanded && !isCollapsed && filteredChildren && (
          <div className="mt-1 space-y-0.5 relative">
            {/* Single vertical line connecting all children */}
            <div className="absolute left-3 top-0 bottom-2 w-px bg-gray-300 dark:bg-gray-600" />
            {filteredChildren.map((child) => (
              <div key={child.href} className="relative">
                {renderNavItem(child, level + 1)}
              </div>
            ))}
          </div>
        )}
      </div>
    );
  };

  const renderSection = (section: NavSection): React.ReactNode => {
    return (
      <div key={section.title || "default"} className="space-y-1">
        {section.title && !isCollapsed && (
          <div className="px-3 py-2">
            <h3 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
              {t(section.title)}
            </h3>
          </div>
        )}
        <div className="space-y-0.5">
          {section.items.map((item) => renderNavItem(item))}
        </div>
      </div>
    );
  };

  // Compute current logo URL from display settings and theme
  const currentLogoUrl = useMemo(() => {
    // Always use default logos as fallback - this ensures logo always displays
    const defaultLight = "/images/logo-light.png";
    const defaultDark = "/images/logo-dark.png";

    // Try to get custom logos from display settings, but fallback to defaults
    const branding = displaySettings?.branding;
    const light = branding?.logoLight || defaultLight;
    const dark = branding?.logoDark || defaultDark;

    // Return appropriate logo based on theme
    let logoUrl;
    if (resolvedTheme === "dark") logoUrl = dark;
    else if (resolvedTheme === "light") logoUrl = light;
    else logoUrl = light; // Default to light theme

    return logoUrl;
  }, [displaySettings?.branding, resolvedTheme]);

  const currentIconUrl = useMemo(() => {
    const defaultIcon = "/favicon.ico";
    const branding = displaySettings?.branding;
    return branding?.favicon || defaultIcon;
  }, [displaySettings?.branding]);

  // Update favicon in document head when branding changes
  useEffect(() => {
    const faviconUrl = displaySettings?.branding?.favicon;
    if (!faviconUrl || typeof document === "undefined") return;
    try {
      const rels = ["icon", "shortcut icon"] as const;
      rels.forEach((rel) => {
        let link = document.querySelector<HTMLLinkElement>(
          `link[rel='${rel}']`
        );
        if (!link) {
          link = document.createElement("link");
          link.rel = rel;
          document.head.appendChild(link);
        }
        if (link) link.href = faviconUrl;
      });
    } catch (e) {
      // no-op; favicon update is best-effort
    }
  }, [displaySettings?.branding?.favicon]);

  // Listen for settings-updated events to refresh branding immediately
  useEffect(() => {
    const handleUpdate = () => {
      syncSettings?.();
    };
    const handleStorage = (e: StorageEvent) => {
      if (e.key === "pc-display-settings-updated") {
        syncSettings?.();
      }
    };
    if (typeof window !== "undefined") {
      window.addEventListener(
        "pc:display-settings-updated",
        handleUpdate as any
      );
      window.addEventListener("storage", handleStorage);
    }
    return () => {
      if (typeof window !== "undefined") {
        window.removeEventListener(
          "pc:display-settings-updated",
          handleUpdate as any
        );
        window.removeEventListener("storage", handleStorage);
      }
    };
  }, [syncSettings]);

  return (
    <div
      className={cn(
        "flex h-full flex-col bg-white dark:bg-gray-900 border-r border-gray-200 dark:border-gray-800 overflow-hidden relative transition-[width] duration-300 ease-in-out",
        isCollapsed ? "w-16" : "w-64",
        className
      )}
    >
      {/* Header */}
      <div
        className={cn(
          "flex h-16 items-center flex-shrink-0 border-b border-gray-200 dark:border-gray-800 gap-2",
          isCollapsed ? "px-2" : "px-4"
        )}
      >
        <Link
          href="/dashboard"
          className={cn(
            "flex items-center hover:opacity-80 transition-opacity duration-150",
            isCollapsed ? "flex-1 justify-center gap-0" : "flex-1 gap-3"
          )}
        >
          <div className="flex items-center justify-center">
            <Image
              src={isCollapsed ? currentIconUrl : currentLogoUrl}
              loading="lazy"
              alt="PropertyPro Logo"
              width={isCollapsed ? 32 : 140}
              height={isCollapsed ? 32 : 36}
              className={cn(
                "object-contain",
                isCollapsed ? "h-8 w-8" : "h-8 w-auto max-w-35"
              )}
            />
          </div>
        </Link>
        <Button
          variant="ghost"
          size="icon"
          className={cn(
            "ml-auto h-8 w-8 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors",
            isCollapsed && "ml-0"
          )}
          onClick={() => setIsCollapsed((prev) => !prev)}
          aria-label={isCollapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          {isCollapsed ? (
            <ChevronRight className="h-4 w-4 text-gray-500 dark:text-gray-400" />
          ) : (
            <ChevronLeft className="h-4 w-4 text-gray-500 dark:text-gray-400" />
          )}
        </Button>
      </div>

      {/* Navigation */}
      <nav
        className={cn(
          "flex-1 space-y-4 overflow-y-auto min-h-0 scrollbar-thin scrollbar-track-transparent scrollbar-thumb-gray-200 dark:scrollbar-thumb-gray-700 hover:scrollbar-thumb-gray-300 dark:hover:scrollbar-thumb-gray-600",
          isCollapsed ? "p-3" : "p-4"
        )}
      >
        {filteredSections.map((section) => renderSection(section))}
      </nav>

      {/* User Info */}
      {!isCollapsed && session?.user && (
        <div className="border-t border-gray-200 dark:border-gray-800 p-4 flex-shrink-0">
          <div className="flex items-center gap-3">
            <Avatar className="h-8 w-8">
              <AvatarImage
                src={
                  avatarUrl || session.user.avatar || session.user.image || ""
                }
                alt={`${session.user.firstName} ${session.user.lastName}`}
              />
              <AvatarFallback className="bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 text-sm font-medium">
                {session.user.firstName?.[0]}
                {session.user.lastName?.[0]}
              </AvatarFallback>
            </Avatar>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-gray-900 dark:text-white truncate">
                {session.user.firstName} {session.user.lastName}
              </p>
              <p className="text-xs text-gray-500 dark:text-gray-400 capitalize">
                {userRole?.replace("_", " ")}
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
