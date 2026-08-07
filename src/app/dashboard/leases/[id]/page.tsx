// View Lease Page

"use client";

import Link from "next/link";
import { showSimpleError, showSimpleSuccess } from "@/lib/toast-notifications";
import { useRouter, useSearchParams } from "next/navigation";
import { useSession } from "next-auth/react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { LeaseStatus, UserRole } from "@/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  ArrowLeft,
  MoreHorizontal,
  Edit,
  Download,
  Calendar,
  Home,
  User,
  FileText,
  CheckCircle,
  MapPin,
  Phone,
  Mail,
  Settings,
  Building,
  PoundSterling,
} from "lucide-react";
import { useState, useEffect, use, useCallback } from "react";
import { LeaseStatusBadge } from "@/components/leases/LeaseStatusBadge";
// import { LeaseActions } from "@/components/leases/LeaseActions";
import {
  LeaseStatusChanger,
  LeaseCapabilities,
  LeaseEndDateButton,
} from "@/components/leases/LeaseStatusChanger";
import { LeaseInvoiceModal } from "@/components/invoices";
import { LeaseDocuments } from "@/components/leases/LeaseDocuments";
import { leaseService, LeaseResponse } from "@/lib/services/lease.service";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PaymentStatusDashboard } from "@/components/payments/PaymentStatusDashboard";
import { PaymentManagementSystem } from "@/components/payments/PaymentManagementSystem";
import { useLocalizationContext } from "@/components/providers/LocalizationProvider";
import { LoadingSpinner } from "@/components/ui/loading-state";

interface LeaseDetailsPageProps {
  params: Promise<{
    id: string;
  }>;
}

export default function LeaseDetailsPage({ params }: LeaseDetailsPageProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { data: session } = useSession();
  const { t, formatCurrency, formatDate, formatNumber } =
    useLocalizationContext();

  const resolvedParams = use(params);
  const [lease, setLease] = useState<LeaseResponse | null>(null);
  const [loading, setLoading] = useState(true);
  // const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  // const [isDeleting, setIsDeleting] = useState(false);
  const [activeTab, setActiveTab] = useState("overview");

  // Check if user is a tenant
  const isTenant = session?.user?.role === UserRole.TENANT;
  // Active leases hide the manual invoice entry points (Quick Invoice and the
  // Full Invoice Page action).
  const isActiveLease = lease?.status === LeaseStatus.ACTIVE;
  // Edit is manager-only; Full Invoice Page is hidden on active leases. If
  // neither applies there is nothing left to show, so drop the menu entirely
  // rather than render an empty one.
  const hasDropdownActions = !isTenant || !isActiveLease;

  const fetchLease = useCallback(async () => {
    try {
      setLoading(true);
      // Arriving from the history view, where the lease is soft-deleted.
      const leaseData = await leaseService.getLeaseById(
        resolvedParams.id,
        searchParams.get("deleted") === "true"
      );
      setLease(leaseData);
    } catch (error) {
      showSimpleError("Load Error", t("leases.details.toasts.fetchError"));
      router.push("/dashboard/leases");
    } finally {
      setLoading(false);
    }
  }, [resolvedParams.id, router, t, searchParams]);

  useEffect(() => {
    fetchLease();
  }, [fetchLease]);

  // DISABLED: Delete functionality temporarily disabled
  // const handleDelete = async () => {
  //   try {
  //     setIsDeleting(true);
  //     await leaseService.deleteLease(resolvedParams.id);
  //     toast.success("Lease deleted successfully");
  //     router.push("/dashboard/leases");
  //   } catch (error) {
  //     toast.error("Failed to delete lease");
  //   } finally {
  //     setIsDeleting(false);
  //     setShowDeleteDialog(false);
  //   }
  // };

  const getDaysRemaining = () => {
    // Open-ended leases (e.g. monthly) have no end date — nothing to count down.
    if (!lease?.endDate) return null;

    const endDate = new Date(lease.endDate);
    if (isNaN(endDate.getTime())) return null;

    // Count whole days from the start of today so the result doesn't shift with
    // the current time of day (which caused the off-by-one).
    const today = new Date(lease.startDate || new Date());
    today.setHours(0, 0, 0, 0);
    endDate.setHours(0, 0, 0, 0);

    return Math.round(
      (endDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)
    );
  };

  const getTotalDays = () => {
    if (!lease?.startDate || !lease?.endDate) return 0;
    const start = new Date(lease.startDate);
    const end = new Date(lease.endDate);
    const diffTime = end.getTime() - start.getTime();
    return Math.max(0, Math.round(diffTime / (1000 * 60 * 60 * 24)));
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center h-[90vh]">
        <LoadingSpinner message="" size="lg" />
      </div>
    );
  }

  if (!lease) {
    return (
      <div className="flex items-center justify-center min-h-125 animate-fade-in-up">
        <div className="text-center p-8 rounded-2xl bg-card/50 backdrop-blur-sm border border-border/50 shadow-lg">
          <div className="p-4 rounded-full bg-muted/50 w-fit mx-auto mb-6">
            <FileText className="h-16 w-16 text-muted-foreground" />
          </div>
          <h3 className="text-2xl font-bold mb-3 bg-linear-to-r from-foreground to-muted-foreground bg-clip-text text-transparent">
            {t("leases.details.notFound.title")}
          </h3>
          <p className="text-muted-foreground mb-8 text-lg leading-relaxed max-w-md">
            {t("leases.details.notFound.description")}
          </p>
          <Button
            onClick={() => router.push("/dashboard/leases")}
            size="lg"
            className="animate-pulse-glow"
          >
            {t("leases.details.notFound.backButton")}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8 animate-fade-in-up">
      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-6 p-4 lg:p-6 rounded-2xl bg-linear-to-r from-card/60 via-card/40 to-transparent backdrop-blur-sm border border-border/15 shadow-md">
        <div className="flex flex-col sm:flex-row sm:items-center gap-4 lg:gap-6">
          <div className="space-y-2">
            <h1 className="text-2xl sm:text-3xl lg:text-4xl font-bold tracking-tight bg-linear-to-r from-primary via-primary-light to-primary bg-clip-text text-transparent">
              {lease.propertyId?.name ||
                t("leases.labels.propertyNotAvailable")}
            </h1>
            <p className="text-muted-foreground text-base lg:text-lg font-medium">
              {t("leases.details.header.subtitle")}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2 lg:gap-3">
          <LeaseStatusBadge status={lease.status} />
          {!isTenant && (
            <LeaseEndDateButton lease={lease} onUpdate={fetchLease} />
          )}
          {/* {!isTenant && <LeaseActions lease={lease} onUpdate={fetchLease} />} */}

          {/* Payment Management Button */}
          {!isTenant && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setActiveTab("payments")}
              className="flex items-center gap-2 cursor-pointer"
            >
              <PoundSterling className="h-4 w-4" />
              <span className="hidden sm:inline">
                {t("leases.details.actions.managePayments")}
              </span>
              <span className="sm:hidden">
                {t("leases.details.actions.paymentsShort")}
              </span>
            </Button>
          )}

          {/* Invoice Actions */}
          {!isTenant && (
            <Button
              variant="outline"
              size="sm"
              // Scope to the tenant on this lease, not the property: a property
              // with several units returns every other tenant's invoices too,
              // which is not what "view invoices" from a lease should mean.
              // Falls back to the property filter only if the tenant ref is
              // missing, so the button never navigates to an unfiltered list.
              onClick={() =>
                router.push(
                  lease.tenantId?._id
                    ? `/dashboard/leases/invoices?propertyId=${lease.propertyId?._id}`
                    : `/dashboard/leases/invoices?propertyId=${
                        lease.propertyId?._id || ""
                      }`
                )
              }
              className="flex items-center gap-2 cursor-pointer"
            >
              <FileText className="h-4 w-4" />
              <span className="hidden sm:inline">
                {t("leases.details.actions.viewInvoices")}
              </span>
              <span className="sm:hidden">
                {t("leases.details.actions.invoicesShort")}
              </span>
            </Button>
          )}
          {!isTenant && !isActiveLease && (
            <LeaseInvoiceModal
              lease={lease}
              trigger={
                <Button
                  variant="outline"
                  size="sm"
                  className="flex items-center gap-2 cursor-pointer"
                >
                  <Download className="h-4 w-4" />
                  <span className="hidden sm:inline">
                    {t("leases.details.actions.quickInvoice")}
                  </span>
                  <span className="sm:hidden">
                    {t("leases.details.actions.quickShort")}
                  </span>
                </Button>
              }
            />
          )}
          {hasDropdownActions && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild className="cursor-pointer">
              <Button variant="outline" size="sm">
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuLabel>
                {t("leases.details.dropdown.actionsLabel")}
              </DropdownMenuLabel>
              {/* Editable at any status — the edit form warns about live
                  tenancies, and status changes go through the status actions. */}
              {!isTenant && (
                <DropdownMenuItem asChild>
                  <Link href={`/dashboard/leases/${lease._id}/edit`}>
                    <Edit className="mr-2 h-4 w-4" />
                    {t("leases.details.actions.editLease")}
                  </Link>
                </DropdownMenuItem>
              )}
              {!isActiveLease && (
                <>
                  {/* Separator only when an item precedes it */}
                  {!isTenant && <DropdownMenuSeparator />}
                  <DropdownMenuItem asChild>
                    <Link href={`/dashboard/leases/${lease._id}/invoice`}>
                      <FileText className="mr-2 h-4 w-4" />
                      {t("leases.details.actions.fullInvoicePage")}
                    </Link>
                  </DropdownMenuItem>
                </>
              )}
              {!isTenant && (
                <>
                  {/* DISABLED: Delete functionality temporarily disabled */}
                  {/* <DropdownMenuSeparator />
                  <DropdownMenuItem
                    className="text-destructive"
                    onClick={() => setShowDeleteDialog(true)}
                  >
                    <Trash2 className="mr-2 h-4 w-4" />
                    Delete Lease
                  </DropdownMenuItem> */}
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
          )}
          <Button
            variant="outline"
            size="sm"
            onClick={() => router.back()}
            className="flex items-center gap-2 cursor-pointer"
          >
            <ArrowLeft className="h-4 w-4" />
            {t("leases.details.actions.back")}
          </Button>
        </div>
      </div>

      {/* Main Content with Tabs */}
      <Tabs
        value={activeTab}
        onValueChange={setActiveTab}
        className="space-y-6"
      >
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="overview" className="flex items-center gap-2">
            <Home className="h-4 w-4" />
            {t("leases.details.tabs.overview")}
          </TabsTrigger>
          <TabsTrigger value="payments" className="flex items-center gap-2">
            <PoundSterling className="h-4 w-4" />
            {t("leases.details.tabs.payments")}
          </TabsTrigger>
          <TabsTrigger value="documents" className="flex items-center gap-2">
            <FileText className="h-4 w-4" />
            {t("leases.details.tabs.documents")}
          </TabsTrigger>
          <TabsTrigger value="settings" className="flex items-center gap-2">
            <Settings className="h-4 w-4" />
            {t("leases.details.tabs.settings")}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-6">
          <div className="grid grid-cols-1 xl:grid-cols-3 gap-6 lg:gap-8">
            {/* Main Content */}
            <div className="xl:col-span-2 space-y-6 lg:space-y-8">
              {/* Property Information */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-3 text-xl">
                    <div className="p-2 rounded-lg bg-primary/10">
                      <Home className="h-5 w-5 text-primary" />
                    </div>
                    {t("leases.details.property.title")}
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4 lg:space-y-6">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 lg:gap-6">
                    <div className="space-y-2">
                      <label className="text-xs lg:text-sm font-semibold text-muted-foreground uppercase tracking-wide">
                        {t("leases.details.property.nameLabel")}
                      </label>
                      <p className="text-lg lg:text-xl font-bold text-foreground wrap-break-word">
                        {lease.propertyId?.name ||
                          t("leases.labels.propertyNotAvailable")}
                      </p>
                    </div>
                    <div className="space-y-2">
                      <label className="text-xs lg:text-sm font-semibold text-muted-foreground uppercase tracking-wide">
                        {t("leases.details.property.typeLabel")}
                      </label>
                      <p className="text-base lg:text-lg font-semibold capitalize bg-linear-to-r from-primary to-primary-light bg-clip-text text-transparent">
                        {lease.propertyId?.type ||
                          t("leases.details.property.typeNotAvailable")}
                      </p>
                    </div>
                  </div>

                  <div className="space-y-3">
                    <label className="text-xs lg:text-sm font-semibold text-muted-foreground uppercase tracking-wide">
                      {t("leases.details.property.addressLabel")}
                    </label>
                    <div className="flex flex-col sm:flex-row sm:items-center gap-3 p-3 lg:p-4 rounded-xl bg-muted/30 border border-border/15">
                      <div className="p-2 rounded-lg bg-info/10 w-fit">
                        <MapPin className="h-4 w-4 text-info" />
                      </div>
                      <p className="text-sm lg:text-lg font-medium wrap-break-word">
                        {lease.propertyId?.address ? (
                          <>
                            {lease.propertyId.address.street},{" "}
                            {lease.propertyId.address.city},{" "}
                            {lease.propertyId.address.state}{" "}
                            {lease.propertyId.address.zipCode}
                          </>
                        ) : (
                          t("leases.labels.addressNotAvailable")
                        )}
                      </p>
                    </div>
                  </div>

                  {/* Unit Information - prioritize unit details over property details */}
                  {lease.unit && (
                    <div className="space-y-3">
                      <label className="text-xs lg:text-sm font-semibold text-muted-foreground uppercase tracking-wide">
                        {t("leases.details.property.unitDetailsTitle")}
                      </label>
                      <div className="p-3 lg:p-4 rounded-xl bg-primary/5 border border-primary/15">
                        <div className="flex items-center gap-2 mb-3">
                          <Building className="h-4 w-4 text-primary" />
                          <span className="font-semibold text-primary">
                            {t("leases.labels.unit")} {lease.unit.unitNumber}
                          </span>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 lg:gap-6">
                    <div className="text-center p-3 lg:p-4 rounded-xl bg-linear-to-br from-success/15 to-success/8 border border-success/15">
                      <label className="text-xs font-bold text-success uppercase tracking-wider block mb-2">
                        {t("leases.details.property.bedrooms")}
                      </label>
                      <p className="text-xl lg:text-2xl font-bold text-success">
                        {lease.unit?.bedrooms ||
                          lease.propertyId?.bedrooms ||
                          t("leases.details.common.notAvailable")}
                      </p>
                    </div>
                    <div className="text-center p-3 lg:p-4 rounded-xl bg-linear-to-br from-warning/15 to-warning/8 border border-warning/15">
                      <label className="text-xs font-bold text-warning uppercase tracking-wider block mb-2">
                        {t("leases.details.property.bathrooms")}
                      </label>
                      <p className="text-xl lg:text-2xl font-bold text-warning">
                        {lease.unit?.bathrooms ||
                          lease.propertyId?.bathrooms ||
                          t("leases.details.common.notAvailable")}
                      </p>
                    </div>
                    <div className="text-center p-3 lg:p-4 rounded-xl bg-linear-to-br from-info/15 to-info/8 border border-info/15">
                      <label className="text-xs font-bold text-info uppercase tracking-wider block mb-2">
                        {t("leases.details.property.squareFeet")}
                      </label>
                      <p className="text-xl lg:text-2xl font-bold text-info">
                        {(() => {
                          const squareFootage =
                            lease.unit?.squareFootage ||
                            lease.propertyId?.squareFootage;
                          return squareFootage
                            ? formatNumber(squareFootage)
                            : t("leases.details.common.notAvailable");
                        })()}
                      </p>
                    </div>
                  </div> */}

                </CardContent>
              </Card>

              {/* Tenant Information */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-3 text-xl">
                    <div className="p-2 rounded-lg bg-success/10">
                      <User className="h-5 w-5 text-success" />
                    </div>
                    {t("leases.details.tenant.title")}
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="text-sm font-medium text-muted-foreground">
                        {t("leases.details.tenant.fullName")}
                      </label>
                      <p className="text-lg font-semibold">
                        {lease.tenantId?.firstName && lease.tenantId?.lastName
                          ? `${lease.tenantId.firstName} ${lease.tenantId.lastName}`
                          : t("leases.labels.unknownTenant")}
                      </p>
                    </div>
                    <div>
                      <label className="text-sm font-medium text-muted-foreground">
                        {t("leases.details.tenant.email")}
                      </label>
                      <div className="flex items-center gap-2 mt-1">
                        <Mail className="h-4 w-4 text-muted-foreground" />
                        <p>
                          {lease.tenantId?.email || t("leases.labels.noEmail")}
                        </p>
                      </div>
                    </div>
                  </div>

                  {lease.tenantId?.phone && (
                    <div>
                      <label className="text-sm font-medium text-muted-foreground">
                        {t("leases.details.tenant.phone")}
                      </label>
                      <div className="flex items-center gap-2 mt-1">
                        <Phone className="h-4 w-4 text-muted-foreground" />
                        <p>{lease.tenantId.phone}</p>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Lease Terms */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Settings className="h-5 w-5" />
                    {t("leases.details.terms.title")}
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-6">
                  {/* Utilities */}
                  {lease.terms.utilities.length > 0 && (
                    <div>
                      <label className="text-sm font-medium text-muted-foreground mb-2 block">
                        {t("leases.details.terms.utilitiesIncluded")}
                      </label>
                      <div className="flex flex-wrap gap-2">
                        {lease.terms.utilities.map((utility) => (
                          <Badge
                            key={utility}
                            variant="secondary"
                            className="capitalize"
                          >
                            {utility}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Restrictions */}
                  {lease.terms.restrictions.length > 0 && (
                    <div>
                      <label className="text-sm font-medium text-muted-foreground mb-2 block">
                        {t("leases.details.terms.restrictions")}
                      </label>
                      <div className="space-y-2">
                        {lease.terms.restrictions.map((restriction, index) => (
                          <div
                            key={index}
                            className="flex items-center gap-2 text-sm"
                          >
                            <div className="w-1.5 h-1.5 bg-muted-foreground rounded-full"></div>
                            <span>{restriction}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Renewal Options */}
                  {lease.renewalOptions?.available && (
                    <div>
                      <label className="text-sm font-medium text-muted-foreground mb-2 block">
                        {t("leases.details.terms.renewalOptions")}
                      </label>
                      <div className="p-3 rounded-md border bg-success/10 dark:bg-success/15 border-success/20">
                        <div className="flex items-center gap-2 mb-2">
                          <CheckCircle className="h-4 w-4 text-success" />
                          <span className="text-sm font-medium text-success">
                            {t("leases.details.terms.renewalAvailable")}
                          </span>
                        </div>
                        {lease.renewalOptions.terms && (
                          <p className="text-sm text-success">
                            {lease.renewalOptions.terms}
                          </p>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Notes */}
                  {lease.notes && (
                    <div>
                      <label className="text-sm font-medium text-muted-foreground mb-2 block">
                        {t("leases.details.terms.additionalNotes")}
                      </label>
                      <div className="p-3 bg-muted/50 rounded-md">
                        <p className="text-sm">{lease.notes}</p>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>

            {/* Sidebar */}
            <div className="space-y-6 lg:space-y-8">
              {/* Lease Summary */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-3 text-lg">
                    <div className="p-2 rounded-lg bg-primary/10">
                      <Calendar className="h-5 w-5 text-primary" />
                    </div>
                    {t("leases.details.summary.title")}
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex flex-col gap-1">
                    <label className="text-sm font-medium text-muted-foreground">
                      Rent Period
                    </label>
                    {lease.rentPeriod}
                  </div>

                  <div>
                    <label className="text-sm font-medium text-muted-foreground">
                      {t("leases.details.summary.leasePeriod")}
                    </label>
                    <p className="font-semibold">
                      {formatDate(lease.startDate)} -{" "}
                      {lease.endDate ? formatDate(lease.endDate) : t("leases.details.summary.leasePeriodPresent")}
                    </p>
                  </div>

                  {/* <div>
                    <label className="text-sm font-medium text-muted-foreground">
                      {t("leases.details.summary.duration")}
                    </label>
                    <p>
                      {totalDays > 0
                        ? t("leases.labels.days", {
                          values: { days: totalDays },
                        })
                        : t("leases.labels.expired")}
                    </p>
                  </div> */}

                  {/* {lease.status === LeaseStatus.ACTIVE && (
                    <div>
                      <label className="text-sm font-medium text-muted-foreground">
                        {t("leases.details.summary.daysRemaining")}
                      </label>
                      <p
                        className={`font-semibold ${daysRemaining < 1
                          ? "text-destructive"
                          : daysRemaining < 2
                            ? "text-warning"
                            : "text-success"
                          }`}
                      >
                        {daysRemaining > 0
                          ? t("leases.labels.days", {
                            values: { days: daysRemaining },
                          })
                          : t("leases.labels.expired")}
                      </p>
                    </div>
                  )} */}

                  {lease.signedDate && (
                    <div>
                      <label className="text-sm font-medium text-muted-foreground">
                        {t("leases.details.summary.signedDate")}
                      </label>
                      <div className="flex items-center gap-2 mt-1">
                        <CheckCircle className="h-4 w-4 text-success" />
                        <p>{formatDate(lease.signedDate)}</p>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Financial Terms */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-3 text-lg">
                    <div className="p-2 rounded-lg bg-success/10">
                      <PoundSterling className="h-5 w-5 text-success" />
                    </div>
                    {t("leases.details.financial.title")}
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4 lg:space-y-6">
                  <div className="grid grid-cols-1 gap-3 lg:gap-4">
                    {/* Total rent takes precedence; fall back to the rent
                        amount when no total is set. The original code tested
                        `lease.terms`, which is always truthy, so the fallback
                        never ran and leases with no total showed no figure. */}
                    {(lease.terms?.totalAmount ?? 0) > 0 ? (
                      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-2 p-3 lg:p-4 rounded-xl bg-linear-to-r from-success/15 to-success/8 border border-success/15">
                        <span className="text-success font-semibold text-sm lg:text-base">
                          {t("leases.details.financial.rentAmount")}
                        </span>
                        <span className="font-bold text-lg lg:text-xl text-success">
                          {formatCurrency(lease.terms.totalAmount)}
                        </span>
                      </div>
                    ) : (
                      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-2 p-3 lg:p-4 rounded-xl bg-linear-to-r from-success/15 to-success/8 border border-success/15">
                        <span className="text-success font-semibold text-sm lg:text-base">
                          {t("leases.details.financial.rentAmount")}
                        </span>
                        <span className="font-bold text-lg lg:text-xl text-success">
                          {formatCurrency(lease.terms?.rentAmount ?? 0)}
                        </span>
                      </div>
                    )}


                    <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-2 p-3 lg:p-4 rounded-xl bg-linear-to-r from-warning/15 to-warning/8 border border-warning/15">
                      <span className="text-warning font-semibold text-sm lg:text-base">
                        {t("leases.details.financial.securityDeposit")}
                      </span>
                      <span className="font-bold text-base lg:text-lg text-warning">
                        {formatCurrency(lease.terms.securityDeposit)}
                      </span>
                    </div>
                    <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-2 p-3 lg:p-4 rounded-xl bg-linear-to-r from-error/15 to-error/8 border border-error/15">
                      <span className="text-error font-semibold text-sm lg:text-base">
                        {t("leases.details.financial.lateFee")}
                      </span>
                      <span className="font-bold text-base lg:text-lg text-error">
                        {formatCurrency(lease.terms.lateFee)}
                      </span>
                    </div>
                    {lease.terms.petDeposit && lease.terms.petDeposit > 0 && (
                      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-2 p-3 lg:p-4 rounded-xl bg-linear-to-r from-info/15 to-info/8 border border-info/15">
                        <span className="text-info font-semibold text-sm lg:text-base">
                          {t("leases.details.financial.petDeposit")}
                        </span>
                        <span className="font-bold text-base lg:text-lg text-info">
                          {formatCurrency(lease.terms.petDeposit)}
                        </span>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>

              {/* Status Management */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Settings className="h-5 w-5" />
                    {t("leases.details.status.title")}
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <LeaseStatusChanger lease={lease} onUpdate={fetchLease} />
                </CardContent>
              </Card>

              {/* Lease Capabilities */}
              {/* <Card>
                <CardHeader>
                  <CardTitle className="text-sm">
                    {t("leases.details.status.availableActionsTitle")}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <LeaseCapabilities lease={lease} />
                </CardContent>
              </Card> */}
            </div>
          </div>
        </TabsContent>

        <TabsContent value="payments" className="space-y-6">
          <div className="grid grid-cols-1 gap-6">
            {/* Payment Status Dashboard */}
            <PaymentStatusDashboard
              leaseId={lease._id}
              lease={lease}
              onPaymentUpdate={fetchLease}
              onInvoiceGenerated={() => {
                showSimpleSuccess("Invoice Generated", t("leases.details.toasts.invoiceGenerated"));
              }}
            />

            {/* Payment Management System */}
            <PaymentManagementSystem
              leaseId={lease._id}
              lease={lease}
              onPaymentUpdate={fetchLease}
            />
          </div>
        </TabsContent>

        <TabsContent value="documents" className="space-y-6">
          {/* Document Management */}
          <LeaseDocuments lease={lease} onUpdate={fetchLease} />
        </TabsContent>

        <TabsContent value="settings" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>{t("leases.details.settings.title")}</CardTitle>
              <CardDescription>
                {t("leases.details.settings.description")}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Status Management */}
              <div>
                <h4 className="font-medium mb-3">
                  {t("leases.details.status.title")}
                </h4>
                <LeaseStatusChanger lease={lease} onUpdate={fetchLease} />
              </div>

              {/* Lease Capabilities */}
              {/* <div>
                <h4 className="font-medium mb-3">
                  {t("leases.details.status.availableActionsTitle")}
                </h4>
                <LeaseCapabilities lease={lease} />
              </div> */}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* DISABLED: Delete functionality temporarily disabled */}
      {/* <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Lease</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this lease? This action cannot be
              undone. The lease for {lease.propertyId?.name || "this property"}{" "}
              will be permanently removed.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={isDeleting}
              className="bg-destructive hover:bg-destructive/90"
            >
              {isDeleting ? "Deleting..." : "Delete Lease"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog> */}
    </div>
  );
}