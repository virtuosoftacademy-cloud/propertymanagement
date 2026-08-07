"use client";

import Link from "next/link";
import { toast } from "sonner";
import { useState, useEffect, useCallback } from "react";
import { useSession } from "next-auth/react";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { GlobalPagination } from "@/components/ui/global-pagination";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  FileCheck,
  Plus,
  Search,
  AlertTriangle,
  CheckCircle2,
  Clock,
  PoundSterling,
  Grid3X3,
  List,
  Download,
  FileText,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { downloadCsv, downloadPdf, exportFilename } from "@/lib/utils/export";
import { DataTable, DataTableColumn } from "@/components/ui/data-table";
import { useViewPreferencesStore } from "@/stores/view-preferences.store";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useLocalizationContext } from "@/components/providers/LocalizationProvider";
import { ComplianceActions } from "@/components/compliance/compliance-actions";
import {
  ComplianceCategoryLabels,
  ComplianceCategory,
  ComplianceStatus,
} from "@/types";

// ────────────────────────────────────────────────
// Types
// ────────────────────────────────────────────────
interface ComplianceReport {
  _id: string;
  propertyId: {
    _id: string;
    name: string;
    address: { city: string; state?: string; street?: string };
  } | null;
  createdBy?: {
    _id: string;
    firstName?: string;
    lastName?: string;
    email?: string;
  } | null;
  category: ComplianceCategory | null;
  issueDate: string;
  expiryDate: string;
  estimatedCost?: number;
  status: ComplianceStatus;
  images?: Array<{ url: string; name?: string }>;
  notes?: string;
  daysUntilExpiry?: number | null;
  isExpired?: boolean;
  isExpiringSoon?: boolean;
  createdAt: string;
}

interface PaginationState {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

interface FiltersState {
  page: number;
  limit: number;
  search: string;
  status: ComplianceStatus | "ALL";
  category: ComplianceCategory | "ALL";
  expiry: "ALL" | "EXPIRING_SOON" | "EXPIRED";
  sortBy: string;
  sortOrder: "asc" | "desc";
}

const DEFAULT_FILTERS: FiltersState = {
  page: 1,
  limit: 12,
  search: "",
  status: "ALL",
  category: "ALL",
  expiry: "ALL",
  sortBy: "expiryDate",
  sortOrder: "asc",
};

// ────────────────────────────────────────────────
// Component
// ────────────────────────────────────────────────
export default function CompliancePage() {
  const { status: sessionStatus } = useSession();
  const { t } = useLocalizationContext();

  const [reports, setReports] = useState<ComplianceReport[]>([]);
  const [pagination, setPagination] = useState<PaginationState>({
    page: 1,
    limit: 12,
    total: 0,
    totalPages: 0,
  });
  const [filters, setFilters] = useState<FiltersState>(DEFAULT_FILTERS);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const viewMode = useViewPreferencesStore((state) => state.maintenanceView);
  const setViewMode = useViewPreferencesStore(
    (state) => state.setMaintenanceView
  );

  const updateFilter = useCallback(
    <K extends keyof FiltersState>(key: K, value: FiltersState[K]) => {
      setFilters((prev) => ({
        ...prev,
        [key]: value,
        ...(key !== "page" ? { page: 1 } : {}),
      }));
    },
    []
  );

  const [searchInput, setSearchInput] = useState("");
  useEffect(() => {
    const timer = setTimeout(() => {
      if (searchInput !== filters.search) {
        updateFilter("search", searchInput);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [searchInput, filters.search, updateFilter]);

  const fetchComplianceReports = useCallback(async () => {
    if (sessionStatus !== "authenticated") return;

    try {
      setLoading(true);
      setError(null);

      const params = new URLSearchParams({
        page: filters.page.toString(),
        limit: filters.limit.toString(),
        sortBy: filters.sortBy,
        sortOrder: filters.sortOrder,
      });

      if (filters.search.trim()) params.set("search", filters.search.trim());
      if (filters.status !== "ALL") params.set("status", filters.status);
      if (filters.category !== "ALL") params.set("category", filters.category);
      if (filters.expiry === "EXPIRING_SOON") {
        params.set("isExpiringSoon", "true");
      } else if (filters.expiry === "EXPIRED") {
        params.set("isExpired", "true");
      }

      const res = await fetch(`/api/compliance?${params.toString()}`);
      const json = await res.json().catch(() => ({}));

      if (!res.ok || !json.success) {
        throw new Error(
          json.error ||
          json.message ||
          `Request failed with status ${res.status}`
        );
      }

      setReports(Array.isArray(json.data) ? json.data : []);
      setPagination({
        page: json.pagination?.page ?? filters.page,
        limit: json.pagination?.limit ?? filters.limit,
        total: json.pagination?.total ?? 0,
        totalPages: json.pagination?.totalPages ?? 1,
      });
    } catch (err: any) {
      const msg = err?.message || "Could not load compliance reports";
      setError(msg);
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  }, [sessionStatus, filters]);

  useEffect(() => {
    fetchComplianceReports();
  }, [fetchComplianceReports]);

  // ─── Export ───────────────────────────────────────────────────────────────
  // This list is server-paginated, so `reports` only holds the current page.
  // Re-run the same query with a large limit so the export covers every record
  // matching the active filters, not just the page on screen.
  const fetchAllForExport = async (): Promise<ComplianceReport[]> => {
    const params = new URLSearchParams({
      page: "1",
      limit: "1000",
      sortBy: filters.sortBy,
      sortOrder: filters.sortOrder,
    });

    if (filters.search.trim()) params.set("search", filters.search.trim());
    if (filters.status !== "ALL") params.set("status", filters.status);
    if (filters.category !== "ALL") params.set("category", filters.category);
    if (filters.expiry === "EXPIRING_SOON") {
      params.set("isExpiringSoon", "true");
    } else if (filters.expiry === "EXPIRED") {
      params.set("isExpired", "true");
    }

    const res = await fetch(`/api/compliance?${params.toString()}`);
    const json = await res.json().catch(() => ({}));

    if (!res.ok || !json.success) {
      throw new Error(
        json.error || json.message || `Request failed with status ${res.status}`
      );
    }
    return Array.isArray(json.data) ? json.data : [];
  };

  const toExportRows = (records: ComplianceReport[]) =>
    records.map((report) => ({
      Reference: report._id,
      Type: formatCategory(report.category),
      Status: formatStatus(report.status),
      Property: report.propertyId?.name ?? "",
      Address: [
        report.propertyId?.address?.street,
        report.propertyId?.address?.city,
        report.propertyId?.address?.state,
      ]
        .filter(Boolean)
        .join(", "),
      "Issue Date": report.issueDate
        ? new Date(report.issueDate).toLocaleDateString("en-GB")
        : "",
      "Expiry Date": report.expiryDate
        ? new Date(report.expiryDate).toLocaleDateString("en-GB")
        : "",
      "Days Until Expiry":
        report.daysUntilExpiry != null ? String(report.daysUntilExpiry) : "",
      Expired: report.isExpired ? "Yes" : "No",
      "Expiring Soon": report.isExpiringSoon ? "Yes" : "No",
      Cost: report.estimatedCost != null ? `£${report.estimatedCost}` : "",
      "Created By": report.createdBy
        ? [report.createdBy.firstName, report.createdBy.lastName]
            .filter(Boolean)
            .join(" ")
        : "",
      Documents: String(report.images?.length ?? 0),
      Notes: report.notes ?? "",
      Created: report.createdAt
        ? new Date(report.createdAt).toLocaleString("en-GB")
        : "",
    }));

  const handleExportCsv = async () => {
    try {
      const count = downloadCsv(
        toExportRows(await fetchAllForExport()),
        exportFilename("compliance-reports", "csv")
      );
      if (count === 0) {
        toast.error("There is nothing to export.");
        return;
      }
      toast.success(`Exported ${count} report(s) to CSV.`);
    } catch (error) {
      console.error("[compliance] CSV export failed:", error);
      toast.error("Failed to generate the CSV export.");
    }
  };

  const handleExportPdf = async () => {
    try {
      // A readable subset; the CSV carries the full record.
      const count = await downloadPdf(
        toExportRows(await fetchAllForExport()),
        [
          { key: "Type", label: "Type", width: 150 },
          { key: "Property", label: "Property", width: 125 },
          { key: "Status", label: "Status", width: 85 },
          { key: "Issue Date", label: "Issued", width: 65 },
          { key: "Expiry Date", label: "Expires", width: 65 },
          { key: "Days Until Expiry", label: "Days Left", width: 55 },
          { key: "Cost", label: "Cost", width: 55 },
          { key: "Created By", label: "Created By", width: 95 },
          { key: "Documents", label: "Docs", width: 40 },
        ],
        {
          title: "Compliance Reports",
          filename: exportFilename("compliance-reports", "pdf"),
        }
      );
      if (count === 0) {
        toast.error("There is nothing to export.");
        return;
      }
      toast.success(`Exported ${count} report(s) to PDF.`);
    } catch (error) {
      console.error("[compliance] PDF export failed:", error);
      toast.error("Failed to generate the PDF export.");
    }
  };

  const handleStatusUpdate = (
    reportId: string,
    newStatus: ComplianceReport["status"]
  ) => {
    setReports((prev) =>
      prev.map((r) => (r._id === reportId ? { ...r, status: newStatus } : r))
    );
    setTimeout(() => fetchComplianceReports(), 800);
  };

  const handleReportUpdate = () => {
    fetchComplianceReports();
  };

  const stats = {
    total: pagination.total,
    active: reports.filter((r) => r.status === ComplianceStatus.ACTIVE).length,
    expired: reports.filter(
      (r) =>
        r.status === ComplianceStatus.EXPIRED ||
        (typeof r.daysUntilExpiry === "number" && r.daysUntilExpiry < 0)
    ).length,
    expiringSoon: reports.filter(
      (r) =>
        r.status === ComplianceStatus.EXPIRING_SOON ||
        (typeof r.daysUntilExpiry === "number" &&
          r.daysUntilExpiry >= 0 &&
          r.daysUntilExpiry <= 30)
    ).length,
    totalEstimatedCost: reports.reduce(
      (sum, r) => sum + (r.estimatedCost || 0),
      0
    ),
  };

  // ────────────────────────────────────────────────
  // Helpers
  // ────────────────────────────────────────────────
  const formatDate = (date?: string) => {
    if (!date) return "—";
    try {
      return new Date(date).toLocaleDateString("en-US", {
        year: "numeric",
        month: "short",
        day: "numeric",
      });
    } catch {
      return "—";
    }
  };

  /**
   * Safely format a category value for display.
   * Prefers the shared label map; falls back to de-hyphenating the raw value
   * so legacy/unknown values still read cleanly. Handles null/non-string input.
   */
  const formatCategory = (category: unknown): string => {
    if (category == null || typeof category !== "string") return "—";
    return (
      ComplianceCategoryLabels[category as ComplianceCategory] ||
      category.split("-").filter(Boolean).join(" ")
    );
  };

  const getExpiryStyle = (days?: number | null) => {
    if (days == null) return "";
    if (days < 0) return "text-red-600 font-medium";
    if (days <= 30) return "text-orange-600 font-medium";
    return "text-green-600";
  };

  const getStatusVariant = (status: ComplianceStatus | string | undefined) => {
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

  const formatStatus = (status: unknown): string => {
    if (status == null || typeof status !== "string") return "—";
    return status.replace("_", " ");
  };

  // ────────────────────────────────────────────────
  // Table Columns
  // ────────────────────────────────────────────────
  const columns: DataTableColumn<ComplianceReport>[] = [
    {
      id: "category",
      header: "Type",
      cell: (r) => (
        <div className="font-medium capitalize">
          {formatCategory(r.category)}
        </div>
      ),
    },
    {
      id: "property",
      header: "Property",
      cell: (r) => (
        <div>
          <div className="font-medium">{r.propertyId?.name || "—"}</div>
          <div className="text-xs text-muted-foreground">
            {r.propertyId?.address?.city || "—"}
          </div>
        </div>
      ),
    },
    {
      id: "issued",
      header: "Issued",
      cell: (r) => formatDate(r.issueDate),
    },
    {
      id: "expiry",
      header: "Expiry",
      cell: (r) => (
        <div className={getExpiryStyle(r.daysUntilExpiry)}>
          {formatDate(r.expiryDate)}
          {r.daysUntilExpiry != null && (
            <span className="text-xs ml-1">
              (
              {r.daysUntilExpiry < 0
                ? `${Math.abs(r.daysUntilExpiry)}d ago`
                : `${r.daysUntilExpiry}d left`}
              )
            </span>
          )}
        </div>
      ),
    },
    {
      id: "status",
      header: "Status",
      cell: (r) => (
        <Badge variant={getStatusVariant(r.status)} className="capitalize">
          {formatStatus(r.status)}
        </Badge>
      ),
    },
    {
      id: "cost",
      header: "Act. Cost",
      cell: (r) =>
        r.estimatedCost ? `£${r.estimatedCost.toLocaleString()}` : "—",
    },
    {
      id: "docs",
      header: "Docs",
      cell: (r) => r.images?.length || 0,
    },
    {
      id: "actions",
      header: "Actions",
      align: "right",
      cell: (report) => (
        <ComplianceActions
          report={report as any}
          onStatusUpdate={handleStatusUpdate}
          onReportUpdate={handleReportUpdate}
        />
      ),
    },
  ];

  // ────────────────────────────────────────────────
  // Render
  // ────────────────────────────────────────────────
  if (sessionStatus === "loading") {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-3xl font-bold tracking-tight">
            Compliance Reports
          </h1>
          <Link href="/dashboard/compliance/new">
            <Button>
              <Plus className="mr-2 h-4 w-4" />
              New Report
            </Button>
          </Link>
        </div>
        <div className="flex flex-col items-center justify-center min-h-[50vh] space-y-4">
          <AlertTriangle className="h-12 w-12 text-destructive" />
          <h2 className="text-xl font-semibold">Failed to load reports</h2>
          <p className="text-muted-foreground">{error}</p>
          <Button onClick={fetchComplianceReports}>Try Again</Button>
        </div>
      </div>
    );
  }

  const hasActiveFilters =
    filters.search.trim() !== "" ||
    filters.status !== "ALL" ||
    filters.category !== "ALL" ||
    filters.expiry !== "ALL";

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">
            Compliance Reports
          </h1>
          <p className="text-muted-foreground">
            Manage building compliance certificates and inspections
          </p>
        </div>
        <div className="flex items-center space-x-2">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                disabled={pagination.total === 0}
              >
                <Download className="mr-2 h-4 w-4" />
                Export
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => void handleExportCsv()}>
                <FileText className="mr-2 h-4 w-4" />
                Export CSV
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => void handleExportPdf()}>
                <Download className="mr-2 h-4 w-4" />
                Export PDF
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <Link href="/dashboard/compliance/new">
            <Button size="sm">
              <Plus className="h-4 w-4 mr-2" />
              New Report
            </Button>
          </Link>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid gap-4 md:grid-cols-4 lg:grid-cols-5">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Total Reports</CardTitle>
            <FileCheck className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.total}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Active</CardTitle>
            <CheckCircle2 className="h-4 w-4 text-green-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">
              {stats.active}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Expired</CardTitle>
            <AlertTriangle className="h-4 w-4 text-red-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-600">
              {stats.expired}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">
              Expiring Soon
            </CardTitle>
            <Clock className="h-4 w-4 text-orange-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-orange-600">
              {stats.expiringSoon}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">
              Total Act. Cost
            </CardTitle>
            <PoundSterling className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              £{stats.totalEstimatedCost.toLocaleString()}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Main List Card */}
      <Card>
        <CardHeader className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-indigo-50 dark:bg-indigo-950/30 rounded-lg">
                <FileCheck className="h-5 w-5 text-indigo-600 dark:text-indigo-400" />
              </div>
              <div>
                <h2 className="text-lg font-semibold">Compliance Reports</h2>
                <p className="text-sm text-muted-foreground">
                  {pagination.total}{" "}
                  {pagination.total === 1 ? "report" : "reports"} found
                </p>
              </div>
            </div>

            <div className="flex border rounded-lg overflow-hidden">
              <Button
                variant={viewMode === "table" ? "default" : "ghost"}
                size="sm"
                className="rounded-none"
                onClick={() => setViewMode("table")}
              >
                <List className="h-4 w-4" />
              </Button>
              <Button
                variant={viewMode === "cards" ? "default" : "ghost"}
                size="sm"
                className="rounded-none"
                onClick={() => setViewMode("cards")}
              >
                <Grid3X3 className="h-4 w-4" />
              </Button>
            </div>
          </div>

          {/* Filters */}
          <div className="flex flex-col lg:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Search by type, property, notes..."
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                className="pl-10 h-10"
              />
            </div>

            <Select
              value={filters.status}
              onValueChange={(value) =>
                updateFilter("status", value as FiltersState["status"])
              }
            >
              <SelectTrigger className="h-10 w-[160px]">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">All Statuses</SelectItem>
                <SelectItem value={ComplianceStatus.ACTIVE}>Active</SelectItem>
                <SelectItem value={ComplianceStatus.EXPIRING_SOON}>
                  Expiring Soon
                </SelectItem>
                <SelectItem value={ComplianceStatus.EXPIRED}>
                  Expired
                </SelectItem>
                <SelectItem value={ComplianceStatus.REVOKED}>
                  Revoked
                </SelectItem>
              </SelectContent>
            </Select>

            <Select
              value={filters.category}
              onValueChange={(value) =>
                updateFilter("category", value as FiltersState["category"])
              }
            >
              <SelectTrigger className="h-10 w-[200px]">
                <SelectValue placeholder="Type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">All Types</SelectItem>
                {Object.values(ComplianceCategory).map((category) => (
                  <SelectItem key={category} value={category}>
                    {ComplianceCategoryLabels[category]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select
              value={filters.expiry}
              onValueChange={(value) =>
                updateFilter("expiry", value as FiltersState["expiry"])
              }
            >
              <SelectTrigger className="h-10 w-[180px]">
                <SelectValue placeholder="Expiry" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">All Expiry</SelectItem>
                <SelectItem value="EXPIRING_SOON">
                  Expiring Soon (≤30d)
                </SelectItem>
                <SelectItem value="EXPIRED">Expired</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardHeader>

        <CardContent>
          {loading ? (
            <div className="flex justify-center py-12">
              <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-primary" />
            </div>
          ) : reports.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center space-y-4">
              <FileCheck className="h-12 w-12 text-muted-foreground" />
              <h3 className="text-lg font-semibold">
                No compliance reports found
              </h3>
              <p className="text-muted-foreground max-w-md">
                {hasActiveFilters
                  ? "Try adjusting your filters"
                  : "Start by adding your first compliance certificate"}
              </p>
              <Link href="/dashboard/compliance/new">
                <Button>
                  <Plus className="mr-2 h-4 w-4" />
                  Add New Report
                </Button>
              </Link>
            </div>
          ) : viewMode === "table" ? (
            <DataTable
              columns={columns}
              data={reports}
              getRowKey={(r) => r._id}
              loading={loading}
            />
          ) : (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {reports.map((report) => (
                <Card
                  key={report._id}
                  className="hover:shadow-md transition-shadow dark:bg-accent/50"
                >
                  <CardHeader className="pb-3">
                    <div className="flex justify-between items-start gap-3">
                      <div className="space-y-1">
                        <h3 className="font-medium line-clamp-2 capitalize">
                          {formatCategory(report.category)}
                        </h3>
                        <p className="text-sm text-muted-foreground">
                          {report.propertyId?.name || "—"}
                        </p>
                      </div>
                      <Badge
                        variant={getStatusVariant(report.status)}
                        className="capitalize"
                      >
                        {formatStatus(report.status)}
                      </Badge>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-4 text-sm">
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <div className="text-muted-foreground">Issued</div>
                        {formatDate(report.issueDate)}
                      </div>
                      <div>
                        <div className="text-muted-foreground">Expiry</div>
                        <div className={getExpiryStyle(report.daysUntilExpiry)}>
                          {formatDate(report.expiryDate)}
                        </div>
                      </div>
                      <div>
                        <div className="text-muted-foreground">Act. Cost</div>
                        {report.estimatedCost
                          ? `£${report.estimatedCost.toLocaleString()}`
                          : "—"}
                      </div>
                      <div>
                        <div className="text-muted-foreground">Docs</div>
                        {report.images?.length || 0}
                      </div>
                    </div>
                    <div className="flex justify-end pt-2 border-t">
                      <ComplianceActions
                        report={report as any}
                        onStatusUpdate={handleStatusUpdate}
                        onReportUpdate={handleReportUpdate}
                      />
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}

          {pagination.total > 0 && (
            <div className="mt-6">
              <GlobalPagination
                currentPage={pagination.page}
                totalPages={pagination.totalPages}
                totalItems={pagination.total}
                pageSize={pagination.limit}
                onPageChange={(page) => updateFilter("page", page)}
                onPageSizeChange={(limit) => {
                  setFilters((prev) => ({ ...prev, limit, page: 1 }));
                }}
                showingLabel={t("common.showing", { defaultValue: "Showing" })}
                previousLabel={t("common.previous", {
                  defaultValue: "Previous",
                })}
                nextLabel={t("common.next", { defaultValue: "Next" })}
                pageLabel={t("common.page", { defaultValue: "Page" })}
                ofLabel={t("common.of", { defaultValue: "of" })}
                itemsPerPageLabel={t("common.perPage", {
                  defaultValue: "per page",
                })}
                disabled={loading}
              />
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}