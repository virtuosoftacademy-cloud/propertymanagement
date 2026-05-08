"use client";

import { useState } from "react";
import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { DeleteConfirmationDialog } from "@/components/ui/confirmation-dialog";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
  AlertDialogAction,
} from "@/components/ui/alert-dialog";
import {
  FileText,
  MoreHorizontal,
  Edit,
  Eye,
  Trash2,
  Calendar,
  DollarSign,
  Home,
  User,
  FileSignature,
  RotateCcw,
  XCircle,
  AlertTriangle,
  CheckCircle,
  Clock,
  Download,
} from "lucide-react";
import { LeaseStatus } from "@/types";
import { LeaseResponse, leaseService } from "@/lib/services/lease.service";
import { toast } from "sonner";
import { LeaseInvoiceModal } from "@/components/invoices";
import { useLocalizationContext } from "@/components/providers/LocalizationProvider";

interface LeaseCardProps {
  lease: LeaseResponse;
  onUpdate?: () => void;
  onDelete?: (id: string) => void;
  showActions?: boolean;
}

export function LeaseCard({
  lease,
  onUpdate,
  onDelete,
  showActions = true,
}: LeaseCardProps) {
  const [isDeleting, setIsDeleting] = useState(false);
  const [showActiveDeleteDialog, setShowActiveDeleteDialog] = useState(false);
  const { formatCurrency } = useLocalizationContext();

  const getStatusColor = (status: LeaseStatus) => {
    switch (status) {
      case LeaseStatus.DRAFT:
        return "outline";
      case LeaseStatus.PENDING:
        return "default";
      case LeaseStatus.ACTIVE:
        return "secondary";
      case LeaseStatus.EXPIRED:
        return "destructive";
      case LeaseStatus.TERMINATED:
        return "destructive";
      default:
        return "outline";
    }
  };

  const getStatusIcon = (status: LeaseStatus) => {
    switch (status) {
      case LeaseStatus.DRAFT:
        return Edit;
      case LeaseStatus.PENDING:
        return Clock;
      case LeaseStatus.ACTIVE:
        return CheckCircle;
      case LeaseStatus.EXPIRED:
        return AlertTriangle;
      case LeaseStatus.TERMINATED:
        return XCircle;
      default:
        return FileText;
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  };

  const getDaysRemaining = () => {
    const endDate = new Date(lease.endDate);
    const now = new Date();
    const diffTime = endDate.getTime() - now.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    return diffDays;
  };

  const handleDelete = async () => {
    try {
      setIsDeleting(true);
      await leaseService.deleteLease(lease._id);
      toast.success("Lease deleted successfully");
      onDelete?.(lease._id);
    } catch (error) {
      console.error("Error deleting lease:", error);
      toast.error(
        error instanceof Error ? error.message : "Failed to delete lease"
      );
    } finally {
      setIsDeleting(false);
    }
  };

  const StatusIcon = getStatusIcon(lease.status);
  const daysRemaining = getDaysRemaining();

  return (
    <>
      <Card className="hover:shadow-xl transition-all duration-300 border-border/40 overflow-hidden group p-0 bg-card">
        {/* Header with gradient background */}
        <div className="relative bg-gradient-to-br from-primary/8 via-primary/4 to-transparent p-4 border-b border-border/50">
          <div className="flex items-start justify-between mb-4">
            <div className="flex items-center gap-3 flex-1 min-w-0">
              <div className="p-2 rounded-xl bg-background shadow-sm border border-border/60 shrink-0">
                <Home className="h-4 w-4 text-primary" />
              </div>
              <div className="space-y-0.5 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <h3 className="font-semibold text-sm text-foreground truncate">
                    {lease?.propertyId?.name}
                  </h3>
                  {lease.unit && (
                    <Badge variant="secondary" className="text-[10px] px-1.5 py-0 h-5 font-medium">
                      Unit {lease.unit.unitNumber}
                    </Badge>
                  )}
                </div>
                <p className="text-xs text-muted-foreground line-clamp-1">
                  {lease?.propertyId?.address?.street},{" "}
                  {lease?.propertyId?.address?.city},{" "}
                  {lease?.propertyId?.address?.state}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              <Badge
                variant={getStatusColor(lease.status) as any}
                className="flex items-center gap-1 px-2 py-0.5 text-[10px] font-medium"
              >
                <StatusIcon className="h-3 w-3" />
                <span className="capitalize">{lease.status}</span>
              </Badge>
              {showActions && (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      <MoreHorizontal className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-48">
                    <DropdownMenuLabel>Actions</DropdownMenuLabel>
                    <DropdownMenuItem asChild>
                      <Link href={`/dashboard/leases/${lease._id}`}>
                        <Eye className="mr-2 h-4 w-4" />
                        View Details
                      </Link>
                    </DropdownMenuItem>
                    {lease.status === LeaseStatus.DRAFT && (
                      <DropdownMenuItem asChild>
                        <Link href={`/dashboard/leases/${lease._id}/edit`}>
                          <Edit className="mr-2 h-4 w-4" />
                          Edit Lease
                        </Link>
                      </DropdownMenuItem>
                    )}
                    {!lease.signedDate &&
                      lease.status === LeaseStatus.DRAFT && (
                        <DropdownMenuItem>
                          <FileSignature className="mr-2 h-4 w-4" />
                          Send for Signature
                        </DropdownMenuItem>
                      )}
                    {lease.status === LeaseStatus.ACTIVE && (
                      <>
                        <DropdownMenuItem>
                          <RotateCcw className="mr-2 h-4 w-4" />
                          Renew Lease
                        </DropdownMenuItem>
                        <DropdownMenuItem>
                          <XCircle className="mr-2 h-4 w-4" />
                          Terminate Lease
                        </DropdownMenuItem>
                      </>
                    )}
                    <DropdownMenuSeparator />
                    <DropdownMenuItem asChild>
                      <Link href={`/dashboard/leases/${lease._id}/invoice`}>
                        <FileText className="mr-2 h-4 w-4" />
                        View Invoice
                      </Link>
                    </DropdownMenuItem>
                    <DropdownMenuItem asChild>
                      <LeaseInvoiceModal
                        lease={lease}
                        trigger={
                          <div className="flex items-center w-full cursor-pointer">
                            <Download className="mr-2 h-4 w-4" />
                            Download Invoice
                          </div>
                        }
                      />
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    {lease.status === LeaseStatus.ACTIVE ? (
                      <DropdownMenuItem
                        onSelect={(e) => {
                          e.preventDefault();
                          setShowActiveDeleteDialog(true);
                        }}
                        className="text-destructive focus:text-destructive"
                      >
                        <Trash2 className="mr-2 h-4 w-4" />
                        Delete Lease
                      </DropdownMenuItem>
                    ) : (
                      <DeleteConfirmationDialog
                        itemName={`${
                          lease.propertyId?.name || "Unknown Property"
                        } - ${
                          lease.tenantId?.firstName && lease.tenantId?.lastName
                            ? `${lease.tenantId.firstName} ${lease.tenantId.lastName}`
                            : "Unknown Tenant"
                        }`}
                        itemType="lease"
                        onConfirm={handleDelete}
                        loading={isDeleting}
                      >
                        <DropdownMenuItem
                          onSelect={(e) => e.preventDefault()}
                          className="text-destructive focus:text-destructive"
                        >
                          <Trash2 className="mr-2 h-4 w-4" />
                          Delete Lease
                        </DropdownMenuItem>
                      </DeleteConfirmationDialog>
                    )}
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
            </div>
          </div>

          {/* Tenant Info Badge */}
          <div className="flex items-center gap-3 px-3 py-2.5 bg-background/80 backdrop-blur-sm rounded-xl border shadow-sm w-fit">
            <Avatar className="h-9 w-9 border-2 border-primary/20">
              <AvatarImage
                src={lease.tenantId?.avatar}
                alt={`${lease.tenantId?.firstName || ""} ${lease.tenantId?.lastName || ""}`}
              />
              <AvatarFallback className="bg-primary/10 text-primary font-medium text-sm">
                {lease.tenantId?.firstName?.[0] || "T"}
                {lease.tenantId?.lastName?.[0] || ""}
              </AvatarFallback>
            </Avatar>
            <div className="flex flex-col">
              <span className="text-sm font-semibold text-foreground">
                {lease.tenantId?.firstName && lease.tenantId?.lastName
                  ? `${lease.tenantId.firstName} ${lease.tenantId.lastName}`
                  : "Unknown Tenant"}
              </span>
              <span className="text-xs text-muted-foreground">
                {lease.tenantId?.email || "No email"}
              </span>
            </div>
          </div>
        </div>

        <CardContent className="p-4 space-y-3">
          {/* Lease Period with visual timeline */}
          <div className="flex items-center justify-between p-2.5 bg-muted/40 rounded-lg">
            <div className="flex items-center gap-2">
              <Calendar className="h-3.5 w-3.5 text-muted-foreground" />
              <span className="text-xs font-medium text-muted-foreground">Lease Period</span>
            </div>
            <span
              className={`text-xs font-bold px-2 py-0.5 rounded-full ${
                daysRemaining < 30 && daysRemaining > 0
                  ? "text-orange-700 bg-orange-100 dark:text-orange-300 dark:bg-orange-900/30"
                  : daysRemaining <= 0
                  ? "text-red-700 bg-red-100 dark:text-red-300 dark:bg-red-900/30"
                  : "text-green-700 bg-green-100 dark:text-green-300 dark:bg-green-900/30"
              }`}
            >
              {daysRemaining > 0
                ? `${daysRemaining} days remaining`
                : daysRemaining === 0
                ? "Expires today"
                : "Expired"}
            </span>
          </div>
          <div className="text-[11px] text-muted-foreground px-1">
            {formatDate(lease.startDate)} - {formatDate(lease.endDate)}
          </div>

          {/* Financial Summary */}
          <div className="grid grid-cols-2 gap-2">
            <div className="p-2.5 bg-muted/30 rounded-lg border border-border/40">
              <div className="flex items-center gap-1 text-muted-foreground mb-1">
                <DollarSign className="h-3 w-3" />
                <span className="text-[10px] font-medium uppercase tracking-wide">Monthly Rent</span>
              </div>
              <p className="text-sm font-bold text-foreground">
                {formatCurrency(
                  lease.unit?.rentAmount || lease.terms.rentAmount
                )}
              </p>
            </div>
            <div className="p-2.5 bg-muted/30 rounded-lg border border-border/40">
              <div className="flex items-center gap-1 text-muted-foreground mb-1">
                <DollarSign className="h-3 w-3" />
                <span className="text-[10px] font-medium uppercase tracking-wide">Security</span>
              </div>
              <p className="text-sm font-bold text-foreground">
                {formatCurrency(lease.terms.securityDeposit)}
              </p>
            </div>
          </div>

          {/* Property Details */}
          <div className="flex flex-wrap gap-1.5">
            {lease.unit ? (
              <>
                <Badge variant="outline" className="text-[10px] px-2 py-0.5 font-medium">
                  {lease.unit.bedrooms} bed
                </Badge>
                <Badge variant="outline" className="text-[10px] px-2 py-0.5 font-medium">
                  {lease.unit.bathrooms} bath
                </Badge>
                <Badge variant="outline" className="text-[10px] px-2 py-0.5 font-medium">
                  {lease.unit.squareFootage.toLocaleString()} sq ft
                </Badge>
                {lease.unit.floor && (
                  <Badge variant="outline" className="text-[10px] px-2 py-0.5 font-medium">
                    Floor {lease.unit.floor}
                  </Badge>
                )}
              </>
            ) : (
              <>
                <Badge variant="outline" className="text-[10px] px-2 py-0.5 font-medium">
                  {lease?.propertyId?.bedrooms} bed
                </Badge>
                <Badge variant="outline" className="text-[10px] px-2 py-0.5 font-medium">
                  {lease?.propertyId?.bathrooms} bath
                </Badge>
                <Badge variant="outline" className="text-[10px] px-2 py-0.5 font-medium">
                  {lease?.propertyId?.squareFootage?.toLocaleString()} sq ft
                </Badge>
              </>
            )}
          </div>

          {/* Action Buttons */}
          <div className="grid grid-cols-2 gap-1.5 pt-1">
            <Button variant="outline" size="sm" className="w-full h-8 text-xs" asChild>
              <Link href={`/dashboard/leases/${lease._id}`}>
                <Eye className="mr-1.5 h-3.5 w-3.5" />
                View Details
              </Link>
            </Button>
            <Button variant="outline" size="sm" className="w-full h-8 text-xs" asChild>
              <Link href={`/dashboard/leases/${lease._id}/invoice`}>
                <FileText className="mr-1.5 h-3.5 w-3.5" />
                Invoice
              </Link>
            </Button>
          </div>
          <LeaseInvoiceModal
            lease={lease}
            trigger={
              <Button variant="ghost" size="sm" className="w-full h-7 text-xs text-muted-foreground hover:text-foreground">
                <Download className="mr-1.5 h-3.5 w-3.5" />
                PDF
              </Button>
            }
          />
        </CardContent>
      </Card>
      <AlertDialog open={showActiveDeleteDialog} onOpenChange={setShowActiveDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cannot Delete Active Lease</AlertDialogTitle>
            <AlertDialogDescription>
              Please terminate the lease first before deleting. This preserves proper records and frees the unit.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Close</AlertDialogCancel>
            <AlertDialogAction asChild>
              <Link href={`/dashboard/leases/${lease._id}`}>View Details</Link>
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
