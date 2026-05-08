/**
 * PropertyPro - Lease Status Badge Component
 * Display lease status with appropriate styling and icons
 * Now supports visual indication for nightly rent leases
 */

"use client";

import { Badge } from "@/components/ui/badge";
import {
  Edit,
  Clock,
  CheckCircle,
  AlertTriangle,
  XCircle,
  FileText,
  FileSignature,
  Moon,
} from "lucide-react";
import { LeaseStatus } from "@/types";
import { cn } from "@/lib/utils";

// ────────────────────────────────────────────────
// Types & Config
// ────────────────────────────────────────────────

interface LeaseStatusBadgeProps {
  status: LeaseStatus;
  rentBasis?: "monthly" | "nightly"; // optional — pass from lease.terms.rentBasis
  showIcon?: boolean;
  showRentBasis?: boolean;           // new — show monthly/nightly pill
  size?: "sm" | "default" | "lg";
  className?: string;
}

const statusConfig: Record<
  LeaseStatus,
  { variant: "default" | "secondary" | "destructive" | "outline"; icon: any; label: string; className: string }
> = {
  [LeaseStatus.DRAFT]: {
    variant: "outline",
    icon: Edit,
    label: "Draft",
    className: "border-gray-300 text-gray-700 bg-gray-50",
  },
  [LeaseStatus.PENDING]: {
    variant: "default",
    icon: Clock,
    label: "Pending Signature",
    className: "border-yellow-300 text-yellow-700 bg-yellow-50",
  },
  [LeaseStatus.ACTIVE]: {
    variant: "secondary",
    icon: CheckCircle,
    label: "Active",
    className: "border-green-300 text-green-700 bg-green-50",
  },
  [LeaseStatus.EXPIRED]: {
    variant: "destructive",
    icon: AlertTriangle,
    label: "Expired",
    className: "border-red-300 text-red-700 bg-red-50",
  },
  [LeaseStatus.TERMINATED]: {
    variant: "destructive",
    icon: XCircle,
    label: "Terminated",
    className: "border-red-300 text-red-700 bg-red-50",
  },
};

// ────────────────────────────────────────────────
// Main Badge Component
// ────────────────────────────────────────────────

export function LeaseStatusBadge({
  status,
  rentBasis,
  showIcon = true,
  showRentBasis = false,
  size = "default",
  className = "",
}: LeaseStatusBadgeProps) {
  const config = statusConfig[status] || {
    variant: "outline" as const,
    icon: FileText,
    label: status || "Unknown",
    className: "border-gray-300 text-gray-700 bg-gray-50",
  };

  const Icon = config.icon;

  const sizeClasses = {
    sm: "text-xs px-2 py-0.5",
    default: "text-sm px-2.5 py-1",
    lg: "text-base px-3 py-1.5",
  };

  const iconSizes = {
    sm: "h-3 w-3",
    default: "h-4 w-4",
    lg: "h-5 w-5",
  };

  return (
    <div className="flex items-center gap-1.5">
      <Badge
        variant={config.variant}
        className={cn(
          config.className,
          sizeClasses[size],
          "flex items-center gap-1.5 font-medium",
          className
        )}
      >
        {showIcon && <Icon className={iconSizes[size]} />}
        {config.label}
      </Badge>

      {/* Nightly rent indicator */}
      {showRentBasis && rentBasis && (
        <Badge
          variant="outline"
          className={cn(
            "text-xs font-normal",
            rentBasis === "nightly"
              ? "border-indigo-300 text-indigo-700 bg-indigo-50"
              : "border-blue-300 text-blue-700 bg-blue-50"
          )}
        >
          {rentBasis === "nightly" ? (
            <>
              <Moon className="h-3 w-3 mr-1" />
              Nightly
            </>
          ) : (
            "Monthly"
          )}
        </Badge>
      )}
    </div>
  );
}

// ────────────────────────────────────────────────
// Utilities
// ────────────────────────────────────────────────

export function getLeaseStatusColor(status: LeaseStatus): string {
  switch (status) {
    case LeaseStatus.DRAFT: return "gray";
    case LeaseStatus.PENDING: return "yellow";
    case LeaseStatus.ACTIVE: return "green";
    case LeaseStatus.EXPIRED: return "red";
    case LeaseStatus.TERMINATED: return "red";
    default: return "gray";
  }
}

export function getLeaseRentBasisLabel(rentBasis?: "monthly" | "nightly"): string {
  if (!rentBasis) return "Monthly";
  return rentBasis === "nightly" ? "Nightly" : "Monthly";
}

export function getLeaseRentBasisColor(rentBasis?: "monthly" | "nightly"): string {
  return rentBasis === "nightly" ? "indigo" : "blue";
}

export function canEditLease(status: LeaseStatus): boolean {
  return status === LeaseStatus.DRAFT;
}

export function canSignLease(status: LeaseStatus): boolean {
  return status === LeaseStatus.DRAFT || status === LeaseStatus.PENDING;
}

export function canTerminateLease(status: LeaseStatus): boolean {
  return status === LeaseStatus.ACTIVE;
}

export function canRenewLease(status: LeaseStatus): boolean {
  return status === LeaseStatus.ACTIVE || status === LeaseStatus.EXPIRED;
}

export function getNextPossibleStatuses(currentStatus: LeaseStatus): LeaseStatus[] {
  switch (currentStatus) {
    case LeaseStatus.DRAFT:
      return [LeaseStatus.PENDING, LeaseStatus.ACTIVE];
    case LeaseStatus.PENDING:
      return [LeaseStatus.ACTIVE, LeaseStatus.DRAFT];
    case LeaseStatus.ACTIVE:
      return [LeaseStatus.TERMINATED, LeaseStatus.EXPIRED];
    case LeaseStatus.EXPIRED:
      return [LeaseStatus.TERMINATED];
    case LeaseStatus.TERMINATED:
      return [];
    default:
      return [];
  }
}

// ────────────────────────────────────────────────
// Enhanced Display with context
// ────────────────────────────────────────────────

interface LeaseStatusDisplayProps {
  status: LeaseStatus;
  rentBasis?: "monthly" | "nightly";
  signedDate?: string;
  startDate?: string;
  endDate?: string;
  showDetails?: boolean;
  showRentBasis?: boolean;
}

export function LeaseStatusDisplay({
  status,
  rentBasis,
  signedDate,
  startDate,
  endDate,
  showDetails = false,
  showRentBasis = true,
}: LeaseStatusDisplayProps) {
  const getStatusMessage = () => {
    const now = new Date();
    const start = startDate ? new Date(startDate) : null;
    const end = endDate ? new Date(endDate) : null;

    switch (status) {
      case LeaseStatus.DRAFT:
        return "Lease is in draft mode and needs to be finalized";
      case LeaseStatus.PENDING:
        return "Waiting for tenant signature";
      case LeaseStatus.ACTIVE:
        if (end && end < now) return "Lease has expired but status not updated";
        return signedDate
          ? `Active since ${new Date(signedDate).toLocaleDateString()}`
          : "Active lease";
      case LeaseStatus.EXPIRED:
        return end ? `Expired on ${end.toLocaleDateString()}` : "Lease has expired";
      case LeaseStatus.TERMINATED:
        return "Lease has been terminated";
      default:
        return "";
    }
  };

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center gap-2">
        <LeaseStatusBadge
          status={status}
          rentBasis={rentBasis}
          showRentBasis={showRentBasis}
        />
      </div>

      {showDetails && (
        <p className="text-xs text-muted-foreground">{getStatusMessage()}</p>
      )}

      {rentBasis && showRentBasis && (
        <p className="text-xs text-muted-foreground">
          {rentBasis === "nightly"
            ? "Variable nightly billing – invoices depend on occupied nights"
            : "Fixed monthly billing"}
        </p>
      )}
    </div>
  );
}