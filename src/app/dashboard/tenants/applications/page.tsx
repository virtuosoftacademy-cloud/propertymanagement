"use client";

import { useState, useEffect, useCallback } from "react";
import { useSession } from "next-auth/react";
import Link from "next/link";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  FileText,
  Search,
  MoreHorizontal,
  Eye,
  Check,
  X,
  RefreshCw,
  AlertCircle,
} from "lucide-react";
import { toast } from "sonner";
import { useLocalizationContext } from "@/components/providers/LocalizationProvider";

const mapStatusToFilter = (
  status: string
): "pending" | "approved" | "rejected" => {
  const normalized = status?.toLowerCase?.() ?? "";

  if (
    [
      "submitted",
      "under_review",
      "screening_in_progress",
      "draft",
      "application_submitted",
    ].includes(normalized)
  ) {
    return "pending";
  }

  if (["approved"].includes(normalized)) {
    return "approved";
  }

  if (["rejected", "withdrawn", "terminated"].includes(normalized)) {
    return "rejected";
  }

  return "pending";
};

const matchesStatusFilter = (status: string, filter: string) => {
  if (filter === "all") return true;
  return mapStatusToFilter(status) === filter;
};

const formatLocation = (address?: {
  street?: string;
  city?: string;
  state?: string;
}): string | undefined => {
  if (!address) return undefined;
  const parts = [address.city, address.state].filter(Boolean);
  return parts.length ? parts.join(", ") : undefined;
};

const normalizeDate = (value?: string | Date | null): string | undefined => {
  if (!value) return undefined;
  const date = typeof value === "string" ? new Date(value) : value;
  if (!date || isNaN(date.getTime())) return undefined;
  return date.toISOString();
};

interface ApplicationRow {
  id: string;
  source: "application" | "tenant";
  applicantName: string;
  applicantEmail: string;
  applicantPhone?: string;
  status: string;
  submittedAt?: string;
  reviewedBy?: string;
  reviewDate?: string;
  propertyName?: string;
  propertyLocation?: string;
}

export default function TenantApplicationsPage() {
  const { t, formatDate } = useLocalizationContext();
  const { data: session } = useSession();
  const [applications, setApplications] = useState<ApplicationRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");

  const statusOptions = [
    { value: "all", label: t("tenants.applications.filters.status.all") },
    {
      value: "pending",
      label: t("tenants.applications.filters.status.pending"),
    },
    {
      value: "approved",
      label: t("tenants.applications.filters.status.approved"),
    },
    {
      value: "rejected",
      label: t("tenants.applications.filters.status.rejected"),
    },
  ];

  const mapApplicationDocuments = useCallback(
    (data: any[]): ApplicationRow[] => {
      if (!Array.isArray(data)) return [];

      return data.map((item) => {
        const personalInfo = item.personalInfo || {};
        const applicant = item.applicantId || {};
        const property = item.propertyId || {};
        const propertyAddress = property.address || {};
        const reviewer = item.reviewedBy || {};

        const applicantName = [
          personalInfo.firstName || applicant.firstName,
          personalInfo.lastName || applicant.lastName,
        ]
          .filter(Boolean)
          .join(" ");

        return {
          id: item._id,
          source: "application",
          applicantName:
            applicantName || personalInfo.fullName || "Unknown Applicant",
          applicantEmail: personalInfo.email || applicant.email || "",
          applicantPhone: personalInfo.phone || applicant.phone,
          status: item.status || "submitted",
          submittedAt:
            normalizeDate(item.submittedAt) ||
            normalizeDate(item.applicationDate) ||
            normalizeDate(item.createdAt),
          reviewedBy:
            reviewer?.firstName || reviewer?.lastName
              ? [reviewer.firstName, reviewer.lastName]
                  .filter(Boolean)
                  .join(" ")
              : undefined,
          reviewDate: normalizeDate(item.reviewedAt || item.reviewDate),
          propertyName: property.name,
          propertyLocation: formatLocation(propertyAddress),
        };
      });
    },
    []
  );

  const mapTenantApplications = useCallback((data: any[]): ApplicationRow[] => {
    if (!Array.isArray(data)) return [];

    return data.map((tenant) => {
      const reviewer = tenant.reviewedBy || {};
      return {
        id: tenant._id,
        source: "tenant",
        applicantName:
          [tenant.firstName, tenant.lastName].filter(Boolean).join(" ") ||
          tenant.fullName ||
          "Unknown Applicant",
        applicantEmail: tenant.email || "",
        applicantPhone: tenant.phone,
        status: tenant.tenantStatus || "application_submitted",
        submittedAt: normalizeDate(tenant.applicationDate || tenant.createdAt),
        reviewedBy:
          reviewer?.firstName || reviewer?.lastName
            ? [reviewer.firstName, reviewer.lastName].filter(Boolean).join(" ")
            : undefined,
        reviewDate: normalizeDate(tenant.lastStatusUpdate),
        propertyName: tenant.currentLeaseId?.propertyId?.name,
        propertyLocation: formatLocation(
          tenant.currentLeaseId?.propertyId?.address
        ),
      };
    });
  }, []);

  const fetchApplications = useCallback(async () => {
    if (!session) return;

    try {
      setLoading(true);
      setError(null);

      const params = new URLSearchParams();
      if (searchTerm) {
        params.append("search", searchTerm);
      }

      const response = await fetch(`/api/applications?${params.toString()}`);
      let rows: ApplicationRow[] = [];

      if (response.ok) {
        const payload = await response.json();
        rows = mapApplicationDocuments(payload.data || []);
      } else if (response.status !== 404) {
        throw new Error("Failed to fetch applications");
      }

      if (rows.length === 0) {
        const tenantParams = new URLSearchParams();
        const tenantStatusQuery =
          statusFilter === "approved"
            ? "approved"
            : statusFilter === "rejected"
            ? "terminated"
            : "pending";
        tenantParams.append("status", tenantStatusQuery);
        if (searchTerm) {
          tenantParams.append("search", searchTerm);
        }

        const tenantResponse = await fetch(
          `/api/tenants?${tenantParams.toString()}`
        );

        if (tenantResponse.ok) {
          const tenantPayload = await tenantResponse.json();
          rows = mapTenantApplications(tenantPayload.data || []);
        }
      }

      const filteredRows = rows.filter((row) =>
        matchesStatusFilter(row.status, statusFilter)
      );

      setApplications(filteredRows);
    } catch (err) {
      const message =
        err instanceof Error
          ? err.message
          : t("tenants.applications.error.fetchFailed");
      setError(message);
      toast.error(message);
    } finally {
      setLoading(false);
    }
  }, [
    session,
    searchTerm,
    statusFilter,
    mapApplicationDocuments,
    mapTenantApplications,
    t,
  ]);

  useEffect(() => {
    fetchApplications();
  }, [fetchApplications]);

  const handleStatusChange = useCallback(
    async (application: ApplicationRow, action: "approve" | "reject") => {
      try {
        if (application.source === "application") {
          const response = await fetch(
            `/api/applications/${application.id}/${action}`,
            {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
              },
              body: JSON.stringify({
                notes: t("tenants.applications.statusChange.notes", {
                  values: { action, name: session?.user?.name },
                }),
              }),
            }
          );

          if (!response.ok) {
            throw new Error(
              t("tenants.applications.error.statusChangeFailed", {
                values: { action },
              })
            );
          }
        } else {
          const newStatus = action === "approve" ? "approved" : "terminated";
          const response = await fetch(
            `/api/tenants/${application.id}/status`,
            {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
              },
              body: JSON.stringify({
                newStatus,
                reason: t("tenants.applications.statusChange.reason", {
                  values: { action },
                }),
              }),
            }
          );

          if (!response.ok) {
            throw new Error(
              t("tenants.applications.error.statusChangeFailed", {
                values: { action },
              })
            );
          }
        }

        toast.success(
          t("tenants.applications.toasts.statusChangeSuccess", {
            values: { action },
          })
        );
        fetchApplications();
      } catch (err) {
        const message =
          err instanceof Error
            ? err.message
            : t("tenants.applications.error.statusChangeFailed", {
                values: { action },
              });
        toast.error(message);
      }
    },
    [fetchApplications, session?.user?.name, t]
  );

  const getStatusBadge = (status: string) => {
    const normalized = status?.toLowerCase?.() ?? "";

    if (normalized === "approved") {
      return (
        <Badge className="bg-green-100 text-green-800 border-green-200">
          {t("tenants.applications.status.approved")}
        </Badge>
      );
    }

    if (["rejected", "withdrawn", "terminated"].includes(normalized)) {
      return (
        <Badge className="bg-red-100 text-red-800 border-red-200">
          {t("tenants.applications.status.rejected")}
        </Badge>
      );
    }

    if (["under_review"].includes(normalized)) {
      return (
        <Badge className="bg-blue-100 text-blue-800 border-blue-200">
          {t("tenants.applications.status.underReview")}
        </Badge>
      );
    }

    return (
      <Badge className="bg-yellow-100 text-yellow-800 border-yellow-200">
        {t("tenants.applications.status.pending")}
      </Badge>
    );
  };

  if (!session) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <AlertCircle className="h-12 w-12 text-red-500 mx-auto mb-4" />
          <h2 className="text-xl font-semibold mb-2">
            {t("tenants.applications.error.accessDenied")}
          </h2>
          <p className="text-gray-600">
            {t("tenants.applications.error.signInRequired")}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">
            {t("tenants.applications.header.title")}
          </h1>
          <p className="text-muted-foreground">
            {t("tenants.applications.header.subtitle")}
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={fetchApplications}
          disabled={loading}
        >
          <RefreshCw
            className={`h-4 w-4 mr-2 ${loading ? "animate-spin" : ""}`}
          />
          {t("tenants.applications.actions.refresh")}
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">
            {t("tenants.applications.filters.title")}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center space-x-4">
            <div className="flex-1">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
                <Input
                  placeholder={t(
                    "tenants.applications.filters.searchPlaceholder"
                  )}
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10"
                />
              </div>
            </div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-48">
                <SelectValue
                  placeholder={t(
                    "tenants.applications.filters.statusPlaceholder"
                  )}
                />
              </SelectTrigger>
              <SelectContent>
                {statusOptions.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>
            {t("tenants.applications.list.title", {
              values: { count: applications.length },
            })}
          </CardTitle>
          <CardDescription>
            {t("tenants.applications.list.description")}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {error && (
            <Alert className="mb-4">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          {loading ? (
            <div className="flex items-center justify-center py-8">
              <RefreshCw className="h-6 w-6 animate-spin mr-2" />
              <span>{t("tenants.applications.loading")}</span>
            </div>
          ) : applications.length === 0 ? (
            <div className="text-center py-8">
              <FileText className="h-12 w-12 text-gray-400 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-gray-900 mb-2">
                {t("tenants.applications.empty.title")}
              </h3>
              <p className="text-gray-600">
                {searchTerm || statusFilter !== "all"
                  ? t("tenants.applications.empty.noMatches")
                  : t("tenants.applications.empty.noApplications")}
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>
                      {t("tenants.applications.table.applicant")}
                    </TableHead>
                    <TableHead>
                      {t("tenants.applications.table.property")}
                    </TableHead>
                    <TableHead>
                      {t("tenants.applications.table.status")}
                    </TableHead>
                    <TableHead>
                      {t("tenants.applications.table.applicationDate")}
                    </TableHead>
                    <TableHead>
                      {t("tenants.applications.table.reviewedBy")}
                    </TableHead>
                    <TableHead className="text-right">
                      {t("tenants.applications.table.actions")}
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {applications.map((application) => (
                    <TableRow key={application.id}>
                      <TableCell>
                        <div>
                          <div className="font-medium">
                            {application.applicantName}
                          </div>
                          <div className="text-sm text-gray-600">
                            {application.applicantEmail}
                          </div>
                          {application.applicantPhone && (
                            <div className="text-xs text-gray-500">
                              {application.applicantPhone}
                            </div>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div>
                          <div className="font-medium">
                            {application.propertyName ||
                              t("tenants.applications.table.notSpecified")}
                          </div>
                          <div className="text-sm text-gray-600">
                            {application.propertyLocation ||
                              t("tenants.applications.table.notAvailable")}
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        {getStatusBadge(application.status)}
                      </TableCell>
                      <TableCell>
                        {application.submittedAt
                          ? formatDate(application.submittedAt)
                          : t("tenants.applications.table.notAvailable")}
                      </TableCell>
                      <TableCell>
                        {application.reviewedBy ? (
                          <div>
                            <div className="text-sm">
                              {application.reviewedBy}
                            </div>
                            <div className="text-xs text-gray-600">
                              {application.reviewDate
                                ? formatDate(application.reviewDate)
                                : t("tenants.applications.table.notAvailable")}
                            </div>
                          </div>
                        ) : (
                          <span className="text-gray-400">
                            {t("tenants.applications.table.notReviewed")}
                          </span>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" className="h-8 w-8 p-0">
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem asChild>
                              <Link
                                href={
                                  application.source === "application"
                                    ? `/dashboard/applications/${application.id}`
                                    : `/dashboard/tenants/${application.id}`
                                }
                              >
                                <Eye className="h-4 w-4 mr-2" />
                                {t("tenants.applications.actions.viewDetails")}
                              </Link>
                            </DropdownMenuItem>
                            {mapStatusToFilter(application.status) ===
                              "pending" && (
                              <>
                                <DropdownMenuItem
                                  onClick={() =>
                                    handleStatusChange(application, "approve")
                                  }
                                >
                                  <Check className="h-4 w-4 mr-2" />
                                  {t("tenants.applications.actions.approve")}
                                </DropdownMenuItem>
                                <DropdownMenuItem
                                  onClick={() =>
                                    handleStatusChange(application, "reject")
                                  }
                                >
                                  <X className="h-4 w-4 mr-2" />
                                  {t("tenants.applications.actions.reject")}
                                </DropdownMenuItem>
                              </>
                            )}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
