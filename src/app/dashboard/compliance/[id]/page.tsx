"use client";

import Link from "next/link";
import { toast } from "sonner";
import { useState, useEffect, useCallback } from "react";
import { useSession } from "next-auth/react";
import { useParams, useRouter } from "next/navigation";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import {
  ArrowLeft,
  AlertTriangle,
  CheckCircle,
  Ban,
  Clock,
  FileText,
  MapPin,
  PoundSterling,
  Building2,
  CalendarDays,
  Hourglass,
  ExternalLink,
  ImageIcon,
} from "lucide-react";
import {
  ComplianceStatus,
  ComplianceCategory,
  ComplianceCategoryLabels,
  ComplianceReportDetail,
  IComplianceDocument,
} from "@/types";
import { useLocalizationContext } from "@/components/providers/LocalizationProvider";
import { ComplianceDetailSkeleton } from "@/components/compliance/compliance-skeleton";
import { ComplianceActions } from "@/components/compliance/compliance-actions";
import Image from "next/image";

// ────────────────────────────────────────────────
// Types
// ────────────────────────────────────────────────


// ────────────────────────────────────────────────
// Component
// ────────────────────────────────────────────────
export default function ComplianceReportDetailPage() {
  const params = useParams();
  const router = useRouter();
  const { data: session } = useSession();
  const {
    t,
    formatCurrency,
    formatDate: formatDateLocalized,
  } = useLocalizationContext();

  const reportId = Array.isArray(params.id) ? params.id[0] : params.id;

  const [report, setReport] = useState<ComplianceReportDetail | null>(null);
  const [loading, setLoading] = useState(true);

  // ────────────────────────────────────────────────
  // Fetch
  // ────────────────────────────────────────────────
  const fetchComplianceReport = useCallback(async () => {
    if (!reportId || !session) return;

    try {
      setLoading(true);

      const response = await fetch(`/api/compliance/${reportId}`);
      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(
          data.error || data.message ||
          t("compliance.details.toasts.fetchError", {
            defaultValue: "Failed to load compliance report",
          })
        );
      }

      if (!data.data) {
        throw new Error(
          t("compliance.details.toasts.fetchError", {
            defaultValue: "Compliance report not found",
          })
        );
      }

      setReport(data.data);
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : t("compliance.details.toasts.fetchError", {
            defaultValue: "Failed to load compliance report",
          })
      );
      router.push("/dashboard/compliance");
    } finally {
      setLoading(false);
    }
  }, [reportId, session, t, router]);

  useEffect(() => {
    fetchComplianceReport();
  }, [fetchComplianceReport]);

  // ────────────────────────────────────────────────
  // Helpers
  // ────────────────────────────────────────────────
  const getStatusVariant = (status: ComplianceStatus | string) => {
    switch (status) {
      case ComplianceStatus.ACTIVE:
        return "default";
      case ComplianceStatus.EXPIRED:
        return "destructive";
      case ComplianceStatus.EXPIRING_SOON:
        return "secondary";
      case ComplianceStatus.REVOKED:
        return "outline";
      default:
        return "outline";
    }
  };

  const getStatusIcon = (status: ComplianceStatus | string) => {
    switch (status) {
      case ComplianceStatus.ACTIVE:
        return CheckCircle;
      case ComplianceStatus.EXPIRING_SOON:
        return Hourglass;
      case ComplianceStatus.EXPIRED:
        return AlertTriangle;
      case ComplianceStatus.REVOKED:
        return Ban;
      default:
        return Clock;
    }
  };

  const formatStatusLabel = (status: string) => status.replace("_", " ");

  const formatCategoryLabel = (category: string) =>
    ComplianceCategoryLabels[category as ComplianceCategory] ||
    category.split("-").join(" ");

  const formatCurrencyDisplay = (amount: number | undefined) => {
    if (amount == null) {
      return t("compliance.details.labels.na", { defaultValue: "—" });
    }
    return formatCurrency(amount);
  };

  const formatDateDisplay = (date: string | Date | undefined | null) => {
    if (!date) return t("compliance.details.labels.na", { defaultValue: "—" });
    try {
      const dateObj = typeof date === "string" ? new Date(date) : date;
      if (isNaN(dateObj.getTime())) {
        return t("compliance.details.labels.na", { defaultValue: "—" });
      }
      return formatDateLocalized(dateObj, {
        year: "numeric",
        month: "long",
        day: "numeric",
      });
    } catch {
      return t("compliance.details.labels.na", { defaultValue: "—" });
    }
  };

  const getExpiryHint = (days: number | null | undefined) => {
    if (days == null) return null;
    if (days < 0) {
      return (
        <span className="text-red-600 text-sm">
          Expired {Math.abs(days)} day{Math.abs(days) === 1 ? "" : "s"} ago
        </span>
      );
    }
    if (days === 0) {
      return <span className="text-red-600 text-sm">Expires today</span>;
    }
    if (days <= 30) {
      return (
        <span className="text-orange-600 text-sm">
          {days} day{days === 1 ? "" : "s"} remaining
        </span>
      );
    }
    return (
      <span className="text-green-600 text-sm">
        {days} day{days === 1 ? "" : "s"} remaining
      </span>
    );
  };

  const formatFileSize = (bytes?: number) => {
    if (!bytes) return "";
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const isImageDoc = (doc: IComplianceDocument) => {
    if (doc.mimeType) return doc.mimeType.startsWith("image/");
    if (!doc.url) return false;
    return /\.(jpe?g|png|gif|webp|svg)(\?|$)/i.test(doc.url);
  };

  const getDocLabel = (doc: IComplianceDocument, index: number) => {
    if (doc.name) return doc.name;
    try {
      const url = new URL(doc.url);
      const last = url.pathname.split("/").pop();
      if (last) return decodeURIComponent(last);
    } catch {
      /* not a parseable URL, fall through */
    }
    return `Document ${index + 1}`;
  };

  // ────────────────────────────────────────────────
  // Render
  // ────────────────────────────────────────────────
  if (loading) {
    return <ComplianceDetailSkeleton />;
  }

  if (!report) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] space-y-4">
        <AlertTriangle className="h-12 w-12 text-muted-foreground" />
        <h2 className="text-xl font-semibold">
          {t("compliance.details.header.notFound", {
            defaultValue: "Report not found",
          })}
        </h2>
        <p className="text-muted-foreground text-center">
          {t("compliance.details.header.notFoundDescription", {
            defaultValue:
              "This compliance report doesn't exist or has been deleted.",
          })}
        </p>
        <Link href="/dashboard/compliance">
          <Button size="sm" variant="outline">
            <ArrowLeft className="mr-2 h-4 w-4" />
            {t("compliance.details.header.backToCompliance", {
              defaultValue: "Back to compliance",
            })}
          </Button>
        </Link>
      </div>
    );
  }

  const StatusIcon = getStatusIcon(report.status);
  const reportIdShort =
    report._id?.toString().slice(-8).toUpperCase() || "—";

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center space-x-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight capitalize">
              {formatCategoryLabel(report.category)}
            </h1>
            <p className="text-muted-foreground">
              Report ID: {reportIdShort}
            </p>
          </div>
        </div>

        <div className="flex items-center space-x-2">
          {/* All status-affecting actions live inside ComplianceActions:
              edit, renew, revoke, delete. Permissions are handled internally. */}
          <ComplianceActions
            report={report}
            onStatusUpdate={(id, newStatus) =>
              setReport((prev) =>
                prev && prev._id === id ? { ...prev, status: newStatus } : prev
              )
            }
            onReportUpdate={fetchComplianceReport}
          />

          <Link href="/dashboard/compliance">
            <Button variant="outline" size="sm">
              <ArrowLeft className="h-4 w-4 mr-1" />
              Back
            </Button>
          </Link>
        </div>
      </div>

      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-5">
        {/* Main Content */}
        <div className="md:col-span-1 lg:col-span-3 space-y-6">
          {/* Report Details */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle>Report Details</CardTitle>
                <Badge
                  variant={getStatusVariant(report.status)}
                  className="capitalize"
                >
                  <StatusIcon className="h-3 w-3 mr-1" />
                  {formatStatusLabel(report.status)}
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <h4 className="font-medium mb-2">Notes / Remarks</h4>
                <p className="text-muted-foreground whitespace-pre-wrap">
                  {report.notes || "No additional notes provided."}
                </p>
              </div>

              <Separator />

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <h4 className="font-medium mb-1 flex items-center gap-1">
                    <CalendarDays className="h-4 w-4" />
                    Issued On
                  </h4>
                  <p className="text-muted-foreground">
                    {formatDateDisplay(report.issueDate)}
                  </p>
                </div>
                <div>
                  <h4 className="font-medium mb-1 flex items-center gap-1">
                    <Hourglass className="h-4 w-4" />
                    Expiry Date
                  </h4>
                  <p className="text-muted-foreground">
                    {formatDateDisplay(report.expiryDate)}
                  </p>
                  {getExpiryHint(report.daysUntilExpiry)}
                </div>
              </div>

              {report.images && (
                <>
                  <Separator />
                  <div>
                    <h4 className="font-medium mb-3">
                      Attached Documents ({report.images.length})
                    </h4>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      {report.images.map((doc, index) => {
                        const label = getDocLabel(doc, index);
                        const isImage = isImageDoc(doc);
                        return (
                          <a
                            key={`${doc.url}-${index}`}
                            href={doc.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center gap-3 p-3 border rounded-lg hover:bg-muted/50 transition-colors group"
                          >
                            <div className="shrink-0 h-10 w-10 rounded bg-muted flex items-center justify-center">
                              {isImage ? (
                                <ImageIcon className="h-5 w-5 text-muted-foreground" />
                              ) : (
                                <FileText className="h-5 w-5 text-muted-foreground" />
                              )}
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium truncate">
                                {label}
                              </p>
                              {doc.size && (
                                <p className="text-xs text-muted-foreground">
                                  {formatFileSize(doc.size)}
                                </p>
                              )}
                            </div>
                            <ExternalLink className="h-4 w-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                          </a>
                        );
                      })}
                    </div>
                  </div>
                </>
              )}
            </CardContent>
          </Card>

          {/* Images */}
          {report.images && report.images.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <ImageIcon className="h-5 w-5" />
                  {t("compliance.details.card.photos")} (
                  {report?.images.length})
                </CardTitle>
                <CardDescription>
                  {t("maintenance.details.card.photosDescription")}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                  {report?.images.map((image, index) => (
                    <div
                      key={index}
                      className="aspect-square bg-gray-100 rounded-lg overflow-hidden"
                    >
                      <Image
                        src={image}
                        alt={`Compliance report image ${index + 1}`}
                        className="w-full h-full object-cover hover:scale-105 transition-transform cursor-pointer"
                        onClick={() => window.open(image, "_blank")}
                        width={200}
                        height={200}
                      />
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </div>

        {/* Sidebar */}
        <div className="md:col-span-1 lg:col-span-2 space-y-6">
          {/* Property Information */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Building2 className="h-5 w-5" />
                Property
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {report.propertyId ? (
                <div>
                  <Link
                    href={`/dashboard/properties/${report.propertyId._id}`}
                    className="font-medium hover:underline"
                  >
                    {report.propertyId.name}
                  </Link>
                  <div className="flex items-start gap-2 mt-2 text-sm text-muted-foreground">
                    <MapPin className="h-4 w-4 mt-0.5 shrink-0" />
                    <div>
                      <p>{report.propertyId.address?.street || "—"}</p>
                      <p>
                        {report.propertyId.address?.city || "—"},{" "}
                        {report.propertyId.address?.state || "—"}{" "}
                        {report.propertyId.address?.zipCode || ""}
                      </p>
                    </div>
                  </div>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">
                  Property information unavailable
                </p>
              )}
            </CardContent>
          </Card>

          {/* Cost Information */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <PoundSterling className="h-5 w-5" />
                Cost Information
              </CardTitle>
            </CardHeader>
            <CardContent>
              {report.estimatedCost != null ? (
                <div className="flex justify-between items-center">
                  <span className="text-sm text-muted-foreground">
                    Actual Cost
                  </span>
                  <span className="font-medium">
                    {formatCurrencyDisplay(report.estimatedCost)}
                  </span>
                </div>
              ) : (
                <div className="text-center py-4">
                  <PoundSterling className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
                  <p className="text-sm text-muted-foreground">
                    No cost information recorded
                  </p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Audit Information */}
          <Card>
            <CardHeader>
              <CardTitle>Audit Trail</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Created</span>
                <span>{formatDateDisplay(report.createdAt)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Last Updated</span>
                <span>{formatDateDisplay(report.updatedAt)}</span>
              </div>
              {report.createdBy && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Created by</span>
                  <span>
                    {[report.createdBy.firstName, report.createdBy.lastName]
                      .filter(Boolean)
                      .join(" ") ||
                      report.createdBy.email ||
                      "—"}
                  </span>
                </div>
              )}
              {report.validityDuration != null && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">
                    Validity Period
                  </span>
                  <span>{report.validityDuration} days</span>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}