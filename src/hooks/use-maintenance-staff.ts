/**
 * PropertyPro - Maintenance Staff Hook
 * Hook for fetching available maintenance staff for assignment
 */

"use client";

import { useState, useEffect } from "react";
import { useSession } from "next-auth/react";
import { UserRole } from "@/types";

interface MaintenanceStaff {
  _id: string;
  firstName: string;
  lastName: string;
  email: string;
  role: UserRole;
  isActive: boolean;
}

interface UseMaintenanceStaffReturn {
  staff: MaintenanceStaff[];
  isLoading: boolean;
  error: string | null;
  refetch: () => void;
}

export function useMaintenanceStaff(): UseMaintenanceStaffReturn {
  const { data: session } = useSession();
  const [staff, setStaff] = useState<MaintenanceStaff[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Check if user has permission to fetch maintenance staff
  const canFetchStaff =
    session?.user?.role &&
    [UserRole.ADMIN, UserRole.MANAGER].includes(session.user.role as UserRole);

  const fetchStaff = async () => {
    // Don't fetch if user doesn't have permission
    if (!canFetchStaff) {
      setIsLoading(false);
      return;
    }

    try {
      setIsLoading(true);
      setError(null);

      const response = await fetch(
        "/api/users?role=manager&isActive=true&limit=100"
      );

      if (!response.ok) {
        throw new Error("Failed to fetch maintenance staff");
      }

      const data = await response.json();
      const staffList = data.users || data.data?.users || [];

      // Filter to only include managers (who handle maintenance)
      const filteredStaff = staffList.filter(
        (user: MaintenanceStaff) =>
          user.role === UserRole.MANAGER && user.isActive
      );

      setStaff(filteredStaff);
    } catch (err) {
      console.error("Error fetching maintenance staff:", err);
      setError(err instanceof Error ? err.message : "Failed to fetch staff");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (session && canFetchStaff) {
      fetchStaff();
    } else if (session && !canFetchStaff) {
      // For users without permission, set loading to false immediately
      setIsLoading(false);
    }
  }, [session, canFetchStaff]);

  return {
    staff,
    isLoading,
    error,
    refetch: fetchStaff,
  };
}
