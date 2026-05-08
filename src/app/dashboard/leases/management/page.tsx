"use client";

import React from "react";
import { useSession } from "next-auth/react";
import { redirect } from "next/navigation";
import { UserRole } from "@/types";
import LeaseManagement from "@/components/tenant/LeaseManagement";

export default function LeaseManagementPage() {
  const { data: session, status } = useSession();

  // Show loading state while session is being fetched
  if (status === "loading") {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-primary"></div>
      </div>
    );
  }

  // Redirect if not authenticated
  if (status === "unauthenticated") {
    redirect("/auth/signin");
  }

  // Only allow tenants to access this page
  if (session?.user?.role !== UserRole.TENANT) {
    redirect("/dashboard");
  }

  return (
    <div className="container mx-auto py-6">
      <LeaseManagement />
    </div>
  );
}
