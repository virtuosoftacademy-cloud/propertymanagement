"use client";

import React from "react";
import { useSession } from "next-auth/react";
import { UserRole } from "@/types";
import {
  hasRole,
  isAdmin,
  canManageProperties,
  canAccessTenantFeatures,
  hasCompanyAccess,
  canManageUsers,
  canViewAllData,
} from "@/lib/auth";
import { useRolePermissions } from "@/hooks/useRolePermissions";

interface PermissionGuardProps {
  children: React.ReactNode;
  roles?: UserRole[];
  permissions?: string[];
  requireAll?: boolean;
  fallback?: React.ReactNode;
  showFallback?: boolean;
}

/**
 * Permission Guard Component
 * Conditionally renders children based on user roles and permissions
 * Uses useRolePermissions hook for consistent permission checking
 */
export function PermissionGuard({
  children,
  roles = [],
  permissions = [],
  requireAll = false,
  fallback = null,
  showFallback = true,
}: PermissionGuardProps) {
  const { data: session, status } = useSession();
  const {
    hasPermission,
    hasAnyPermission,
    hasAllPermissions,
    isLoading: permissionsLoading,
  } = useRolePermissions();

  // Show nothing while loading
  if (status === "loading" || permissionsLoading) {
    return null;
  }

  // Show fallback if not authenticated
  if (!session?.user) {
    return showFallback ? fallback : null;
  }

  const userRole = session.user.role;

  // Check role-based permissions
  const hasRequiredRole = roles.length === 0 || hasRole(userRole, roles);

  // Check custom permissions using the hook
  let hasRequiredPermissions = true;
  if (permissions.length > 0) {
    hasRequiredPermissions = requireAll
      ? hasAllPermissions(permissions)
      : hasAnyPermission(permissions);
  }

  // Show children if user has required permissions
  if (hasRequiredRole && hasRequiredPermissions) {
    return <>{children}</>;
  }

  // Show fallback if user doesn't have permissions
  return showFallback ? fallback : null;
}

/**
 * Hook to check user permissions - Enhanced version
 */
export function usePermissions() {
  const { data: session } = useSession();
  const {
    permissions,
    hasPermission,
    hasAnyPermission,
    hasAllPermissions,
    isLoading,
    error,
  } = useRolePermissions();

  const checkRole = (roles: UserRole[]): boolean => {
    if (!session?.user?.role) return false;
    return hasRole(session.user.role, roles);
  };

  return {
    user: session?.user,
    userRole: session?.user?.role,
    permissions,
    isLoading,
    error,
    checkPermission: hasPermission,
    checkRole,
    checkMultiplePermissions: (perms: string[], requireAll = false) =>
      requireAll ? hasAllPermissions(perms) : hasAnyPermission(perms),
    hasPermission,
    hasAnyPermission,
    hasAllPermissions,
    isAdmin: session?.user?.role ? isAdmin(session.user.role) : false,
    canManageProperties: session?.user?.role
      ? canManageProperties(session.user.role)
      : false,
    canAccessTenantFeatures: session?.user?.role
      ? canAccessTenantFeatures(session.user.role)
      : false,
  };
}

/**
 * Higher-order component for permission-based rendering
 */
export function withPermissions<P extends object>(
  Component: React.ComponentType<P>,
  requiredRoles: UserRole[] = [],
  requiredPermissions: string[] = [],
  fallback?: React.ComponentType
) {
  return function PermissionWrappedComponent(props: P) {
    return (
      <PermissionGuard
        roles={requiredRoles}
        permissions={requiredPermissions}
        fallback={fallback ? <fallback /> : undefined}
      >
        <Component {...props} />
      </PermissionGuard>
    );
  };
}

/**
 * Role-specific components for common use cases
 */
export const AdminOnly: React.FC<{
  children: React.ReactNode;
  fallback?: React.ReactNode;
}> = ({ children, fallback }) => (
  <PermissionGuard roles={[UserRole.ADMIN]} fallback={fallback}>
    {children}
  </PermissionGuard>
);

export const ManagerOnly: React.FC<{
  children: React.ReactNode;
  fallback?: React.ReactNode;
}> = ({ children, fallback }) => (
  <PermissionGuard
    roles={[UserRole.ADMIN, UserRole.MANAGER]}
    fallback={fallback}
  >
    {children}
  </PermissionGuard>
);

export const TenantOnly: React.FC<{
  children: React.ReactNode;
  fallback?: React.ReactNode;
}> = ({ children, fallback }) => (
  <PermissionGuard roles={[UserRole.TENANT]} fallback={fallback}>
    {children}
  </PermissionGuard>
);

export const CompanyStaffOnly: React.FC<{
  children: React.ReactNode;
  fallback?: React.ReactNode;
}> = ({ children, fallback }) => (
  <PermissionGuard
    roles={[UserRole.ADMIN, UserRole.MANAGER]}
    fallback={fallback}
  >
    {children}
  </PermissionGuard>
);
