"use client";

import Link from "next/link";
import { toast } from "sonner";
import { useSession } from "next-auth/react";
import { useState, useEffect, useCallback, useRef } from "react";
import { ErrorAlert } from "@/components/ui/error-alert";
import TenantCard from "@/components/tenants/TenantCard";
import TenantStats from "@/components/tenants/TenantStats";
import { useSearchParams, useRouter } from "next/navigation";
import { GlobalPagination } from "@/components/ui/global-pagination";
import BulkStatusDialog from "@/components/tenants/BulkStatusDialog";
import TenantStatusBadge from "@/components/tenants/TenantStatusBadge";
import TenantDeleteDialog from "@/components/tenants/TenantDeleteDialog";
import TenantStatusDialog from "@/components/tenants/TenantStatusDialog";
import type { TenantRecord, TenantStatus } from "@/components/tenants/types";
import { useLocalizationContext } from "@/components/providers/LocalizationProvider";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { DataTable, DataTableColumn } from "@/components/ui/data-table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  Plus,
  MoreHorizontal,
  Edit,
  Eye,
  Trash2,
  Phone,
  Mail,
  Calendar,
  List,
  LayoutGrid,
  RefreshCw,
  Users,
  XCircle,
  FileText,
  Clock,
} from "lucide-react";
import { GlobalSearch } from "@/components/ui/global-search";
import { formatCurrency, formatDate } from "@/lib/utils/formatting";
import { useViewPreferencesStore } from "@/stores/view-preferences.store";

const currencyDisplayOptions = {
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
} as const;

const formatTenantDate = (value?: string) =>
  value ? formatDate(value, { format: "medium" }) : "-";

const formatIncome = (amount?: number) =>
  typeof amount === "number"
    ? formatCurrency(amount, undefined, currencyDisplayOptions)
    : null;
type Tenant = TenantRecord;

// ─── Local (browser) tenant drafts ──────────────────────────────────────────
// The New Tenant page stores unsaved work to localStorage under this key. Drafts
// are device-local only (not synced to the server).
const TENANT_DRAFT_KEY = "propertypro:tenant-draft";

interface TenantDraft {
  id: string;
  savedAt?: string;
  values: Record<string, any>;
}

const formatDraftTime = (value?: string) => {
  if (!value) return "";
  try {
    return new Date(value).toLocaleString();
  } catch {
    return "";
  }
};

export default function TenantsPage() {
  const searchParams = useSearchParams();
  const { data: session } = useSession();
  const router = useRouter();
  const { t } = useLocalizationContext();
  const canDelete = ["admin", "manager"].includes(session?.user?.role || "");

  const [searchTerm, setSearchTerm] = useState("");
  const [isSearching, setIsSearching] = useState(false);
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [allTenants, setAllTenants] = useState<Tenant[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isStatsLoading, setIsStatsLoading] = useState(true);
  const viewMode = useViewPreferencesStore((state) => state.tenantsView);
  const setViewMode = useViewPreferencesStore((state) => state.setTenantsView);

  const [statusDialogOpen, setStatusDialogOpen] = useState(false);
  const [selectedTenantForStatus, setSelectedTenantForStatus] =
    useState<Tenant | null>(null);

  const [selectedTenants, setSelectedTenants] = useState<string[]>([]);
  const [bulkStatusDialogOpen, setBulkStatusDialogOpen] = useState(false);

  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [selectedTenantForDelete, setSelectedTenantForDelete] =
    useState<Tenant | null>(null);

  // Locally-saved tenant drafts (from the New Tenant page).
  const [drafts, setDrafts] = useState<TenantDraft[]>([]);

  const [currentPage, setCurrentPage] = useState(
    parseInt(searchParams.get("page") || "1")
  );
  const itemsPerPage = parseInt(searchParams.get("limit") || "12");
  const [totalTenants, setTotalTenants] = useState(0);
  const [totalPages, setTotalPages] = useState(1);

  const fetchAllTenants = useCallback(async () => {
    try {
      setIsStatsLoading(true);

      const params = new URLSearchParams();
      params.set("limit", "2000");

      const response = await fetch(`/api/tenants?${params.toString()}`);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: Failed to fetch all tenants`);
      }

      const data = await response.json();
      const allTenantsData = data?.data;
      setAllTenants(allTenantsData || []);
    } catch (error) {
      setAllTenants([]);
    } finally {
      setIsStatsLoading(false);
    }
  }, []);

  // Read any locally-saved tenant drafts. Tolerates either a single draft
  // object {savedAt, values} or an array of them.
  const loadDrafts = useCallback(() => {
    if (typeof window === "undefined") return;
    try {
      const raw = window.localStorage.getItem(TENANT_DRAFT_KEY);
      if (!raw) {
        setDrafts([]);
        return;
      }
      const parsed = JSON.parse(raw);
      const list = Array.isArray(parsed) ? parsed : [parsed];
      const normalized: TenantDraft[] = list
        .filter((d) => d && d.values)
        .map((d, index) => ({
          id: d.id || d.savedAt || `draft-${index}`,
          savedAt: d.savedAt,
          values: d.values,
        }));
      setDrafts(normalized);
    } catch {
      setDrafts([]);
    }
  }, []);

  const discardDraft = (id: string) => {
    if (typeof window === "undefined") return;
    try {
      const raw = window.localStorage.getItem(TENANT_DRAFT_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          const next = parsed.filter(
            (d, index) => (d.id || d.savedAt || `draft-${index}`) !== id
          );
          if (next.length) {
            window.localStorage.setItem(TENANT_DRAFT_KEY, JSON.stringify(next));
          } else {
            window.localStorage.removeItem(TENANT_DRAFT_KEY);
          }
        } else {
          window.localStorage.removeItem(TENANT_DRAFT_KEY);
        }
      }
    } catch {
      // ignore parse/storage errors and fall through to a reload
    }
    loadDrafts();
    toast.success(
      t("tenants.drafts.discarded", { defaultValue: "Draft discarded" })
    );
  };

  const discardAllDrafts = () => {
    if (typeof window === "undefined") return;
    try {
      window.localStorage.removeItem(TENANT_DRAFT_KEY);
    } catch {
      // ignore
    }
    loadDrafts();
    toast.success(
      t("tenants.drafts.allDiscarded", { defaultValue: "All drafts discarded" })
    );
  };

  const [error, setError] = useState<string | null>(null);

  const clearError = () => setError(null);

  const handleStatusChange = (tenant: Tenant) => {
    setSelectedTenantForStatus(tenant);
    setStatusDialogOpen(true);
  };

  const handleStatusUpdate = (newStatus: TenantStatus) => {
    setTenants((prev) =>
      prev.map((tenant) =>
        tenant._id === selectedTenantForStatus?._id
          ? { ...tenant, tenantStatus: newStatus }
          : tenant
      )
    );

    setAllTenants((prev) =>
      prev.map((tenant) =>
        tenant._id === selectedTenantForStatus?._id
          ? { ...tenant, tenantStatus: newStatus }
          : tenant
      )
    );

    setSelectedTenantForStatus(null);
  };

  const handleTenantSelect = (tenantId: string, selected: boolean) => {
    setSelectedTenants((prev) =>
      selected ? [...prev, tenantId] : prev.filter((id) => id !== tenantId)
    );
  };

  const handleSelectAll = (selected: boolean) => {
    setSelectedTenants(selected ? tenants.map((t) => t._id) : []);
  };

  const handleBulkStatusUpdate = (
    tenantIds: string[],
    newStatus: TenantStatus
  ) => {
    setTenants((prev) =>
      prev.map((tenant) =>
        tenantIds.includes(tenant._id)
          ? { ...tenant, tenantStatus: newStatus }
          : tenant
      )
    );

    setAllTenants((prev) =>
      prev.map((tenant) =>
        tenantIds.includes(tenant._id)
          ? { ...tenant, tenantStatus: newStatus }
          : tenant
      )
    );

    setSelectedTenants([]);
  };

  const handleDeleteTenant = (tenant: Tenant) => {
    setSelectedTenantForDelete(tenant);
    setDeleteDialogOpen(true);
  };

  const handleTenantDeleted = (tenantId: string) => {
    setTenants((prev) => prev.filter((tenant) => tenant._id !== tenantId));
    setAllTenants((prev) => prev.filter((tenant) => tenant._id !== tenantId));
    setSelectedTenantForDelete(null);
    setSelectedTenants((prev) => prev.filter((id) => id !== tenantId));
  };

  // Define columns for DataTable
  const tenantColumns: DataTableColumn<Tenant>[] = [
    {
      id: "tenant",
      header: t("tenants.table.tenant"),
      cell: (tenant) => (
        <div className="flex items-center space-x-3">
          <Avatar className="h-10 w-10">
            <AvatarImage
              src={tenant.avatar}
              alt={`${tenant.firstName} ${tenant.lastName}`}
            />
            <AvatarFallback>
              {tenant.firstName.charAt(0)}
              {tenant.lastName.charAt(0)}
            </AvatarFallback>
          </Avatar>
          <div>
            <div className="font-medium">
              {tenant.firstName} {tenant.lastName}
            </div>
            <div className="text-sm text-muted-foreground">{tenant.email}</div>
          </div>
        </div>
      ),
    },
    {
      id: "status",
      header: t("tenants.table.status"),
      cell: (tenant) => (
        <TenantStatusBadge
          status={tenant.tenantStatus}
          showIcon={true}
          size="default"
        />
      ),
    },
    {
      id: "contact",
      header: t("tenants.table.contact"),
      cell: (tenant) => (
        <div className="space-y-1">
          <div className="flex items-center text-sm">
            <Phone className="h-3 w-3 mr-1" />
            {tenant.phone}
          </div>
          <div className="flex items-center text-sm text-muted-foreground">
            <Mail className="h-3 w-3 mr-1" />
            {tenant.email}
          </div>
        </div>
      ),
      visibility: "md" as const,
    },
    {
      id: "employment",
      header: t("tenants.table.employment"),
      cell: (tenant) =>
        tenant.employmentInfo ? (
          <div className="space-y-1">
            <div className="text-sm font-medium">
              {tenant.employmentInfo.employer}
            </div>
            <div className="text-sm text-muted-foreground">
              {tenant.employmentInfo.position}
            </div>
            <div className="text-sm text-muted-foreground">
              {formatIncome(tenant.employmentInfo.income) ?? "-"}
            </div>
          </div>
        ) : (
          <span className="text-muted-foreground">-</span>
        ),
      visibility: "lg" as const,
    },
    {
      id: "creditScore",
      header: t("tenants.table.creditScore"),
      cell: (tenant) =>
        tenant.creditScore !== undefined && tenant.creditScore !== null ? (
          <span className="font-medium">{tenant.creditScore}</span>
        ) : (
          <span className="text-muted-foreground">-</span>
        ),
      visibility: "lg" as const,
    },
    {
      id: "applicationDate",
      header: t("tenants.table.applicationDate"),
      cell: (tenant) => (
        <div className="flex items-center text-sm">
          <Calendar className="h-3 w-3 mr-1" />
          {formatTenantDate(tenant.applicationDate)}
        </div>
      ),
      visibility: "md" as const,
    },
    {
      id: "moveInOut",
      header: t("tenants.table.moveInOut"),
      cell: (tenant) => (
        <div className="space-y-1">
          {tenant.moveInDate && (
            <div className="text-sm">
              In: {formatTenantDate(tenant.moveInDate)}
            </div>
          )}
          {tenant.moveOutDate && (
            <div className="text-sm text-muted-foreground">
              Out: {formatTenantDate(tenant.moveOutDate)}
            </div>
          )}
          {!tenant.moveInDate && !tenant.moveOutDate && (
            <span className="text-muted-foreground">-</span>
          )}
        </div>
      ),
      visibility: "lg" as const,
    },
    {
      id: "actions",
      header: t("tenants.table.actions"),
      align: "right" as const,
      cell: (tenant) => (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" className="h-8 w-8 p-0">
              <span className="sr-only">Open menu</span>
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuLabel>{t("tenants.menu.actions")}</DropdownMenuLabel>
            <DropdownMenuItem
              onClick={() => router.push(`/dashboard/tenants/${tenant._id}`)}
            >
              <Eye className="mr-2 h-4 w-4" />
              {t("tenants.menu.viewDetails")}
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() =>
                router.push(`/dashboard/tenants/${tenant._id}/edit`)
              }
            >
              <Edit className="mr-2 h-4 w-4" />
              {t("tenants.menu.editTenant")}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => handleStatusChange(tenant)}>
              <RefreshCw className="mr-2 h-4 w-4" />
              {t("tenants.menu.changeStatus")}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            {canDelete && (
              <DropdownMenuItem
                className="text-red-600"
                onClick={() => handleDeleteTenant(tenant)}
              >
                <Trash2 className="mr-2 h-4 w-4" />
                {t("tenants.menu.deleteTenant")}
              </DropdownMenuItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      ),
    },
  ];

  // Fetch tenants - not wrapped in useCallback, using explicit deps in useEffect
  // Remembers which empty result we last warned about — the search term, or a
  // sentinel when there is no search — so the toast fires once per distinct case.
  const lastEmptyResultRef = useRef<string | null>(null);

  const fetchTenants = async () => {
    try {
      // Only show main loading on initial load
      if (!searchTerm) {
        setIsLoading(true);
      }
      setIsSearching(true);
      clearError();

      const params = new URLSearchParams();
      params.set("page", currentPage.toString());
      params.set("limit", itemsPerPage.toString());
      if (searchTerm) params.set("search", searchTerm);
      if (statusFilter !== "all") params.set("status", statusFilter);

      console.log("🔍 Fetching tenants with params:", {
        page: currentPage,
        limit: itemsPerPage,
        search: searchTerm,
        status: statusFilter,
        url: `/api/tenants?${params.toString()}`,
      });

      const response = await fetch(`/api/tenants?${params.toString()}`);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: Failed to fetch tenants`);
      }

      const data = await response.json();
      const tenantsData = data?.data;
      console.log("✅ Received tenants:", tenantsData?.length, "tenants");
      setTenants(tenantsData || []);

      if (data?.pagination) {
        setTotalTenants(data.pagination.total);
        setTotalPages(data.pagination.totalPages);
      }

      // Warn once per distinct empty result. This refetches on paging, sorting
      // and filter changes, so the key guards against repeat toasts while the
      // same fruitless query sits in the filters. Falls back to the row count
      // because pagination is not always present on the response.
      const total = data?.pagination?.total ?? tenantsData?.length ?? 0;
      const term = (searchTerm || "").trim();
      if (total === 0) {
        const key = term || "__no-search__";
        if (lastEmptyResultRef.current !== key) {
          lastEmptyResultRef.current = key;
          if (term) {
            toast.info("No tenants found", {
              description: `No tenants match "${term}".`,
            });
          } else {
            toast.info("No tenants", {
              description:
                "No tenants have been added yet, or none match the current filters.",
            });
          }
        }
      } else {
        lastEmptyResultRef.current = null;
      }
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to fetch tenants";
      setError(message);
      toast.error(message);
    } finally {
      setIsLoading(false);
      setIsSearching(false);
    }
  };

  const handleRetry = () => {
    clearError();
    void fetchTenants();
    void fetchAllTenants();
  };

  // Effect to fetch tenants when search/filter/pagination changes
  useEffect(() => {
    void fetchTenants();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentPage, itemsPerPage, searchTerm, statusFilter]);

  useEffect(() => {
    void fetchAllTenants();
  }, [fetchAllTenants]);

  // Load local drafts on mount, and refresh them whenever the user returns to
  // this tab (e.g. after saving a draft on the New Tenant page) or another tab
  // changes the stored value.
  useEffect(() => {
    loadDrafts();
    const refresh = () => loadDrafts();
    window.addEventListener("focus", refresh);
    window.addEventListener("storage", refresh);
    return () => {
      window.removeEventListener("focus", refresh);
      window.removeEventListener("storage", refresh);
    };
  }, [loadDrafts]);

  useEffect(() => {
    const tp = Math.max(1, Math.ceil(totalTenants / itemsPerPage));
    if (currentPage > tp) {
      setCurrentPage(1);
    }
  }, [totalTenants, itemsPerPage, currentPage]);

  const handlePageChange = (page: number) => {
    setCurrentPage(page);
  };

  const handlePageSizeChange = (pageSize: number) => {
    const params = new URLSearchParams(Array.from(searchParams.entries()));
    params.set("limit", pageSize.toString());
    params.set("page", "1");
    router.push(`/dashboard/tenants?${params.toString()}`);
    setCurrentPage(1);
  };

  // Handler for debounced search from GlobalSearch component
  const handleSearch = useCallback((value: string) => {
    setSearchTerm(value);
    setCurrentPage(1); // Reset to first page on search
  }, []);

  const handleStatusFilterChange = (value: string) => {
    console.log("🎯 Status filter changed to:", value);
    setStatusFilter(value);
    setCurrentPage(1);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">
            {t("tenants.header.title")}
          </h1>
          <p className="text-muted-foreground">
            {t("tenants.header.subtitle")}
          </p>
        </div>
        <Link href="/dashboard/tenants/new">
          <Button size="sm">
            <Plus className="mr-2 h-4 w-4" />
            {t("tenants.actions.addTenant.full")}
          </Button>
        </Link>
      </div>

      {error && (
        <div className="mb-6">
          <ErrorAlert
            title={t("tenants.error.loadingTenant")}
            message={error}
            onRetry={handleRetry}
            onDismiss={clearError}
          />
        </div>
      )}

      <TenantStats tenants={allTenants} />

      {/* Locally-saved tenant drafts */}
      {drafts.length > 0 && (
        <Card className="border-amber-200 dark:border-amber-900/40 bg-amber-50/40 dark:bg-amber-900/10">
          <CardHeader className="pb-3">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-amber-100 dark:bg-amber-900/30 rounded-lg border border-amber-200 dark:border-amber-800">
                  <FileText className="h-5 w-5 text-amber-600 dark:text-amber-400" />
                </div>
                <div>
                  <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                    {t("tenants.drafts.title", {
                      defaultValue: "Unsaved tenant drafts",
                    })}{" "}
                    ({drafts.length})
                  </h2>
                  <p className="text-sm text-gray-500 dark:text-gray-400">
                    {t("tenants.drafts.subtitle", {
                      defaultValue:
                        "Saved on this device. Resume to finish adding the tenant.",
                    })}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {drafts.length > 1 && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-red-600"
                    onClick={discardAllDrafts}
                  >
                    <Trash2 className="h-4 w-4 mr-2" />
                    {t("tenants.drafts.discardAll", {
                      defaultValue: "Discard all",
                    })}
                  </Button>
                )}
                <Link href="/dashboard/tenants/new">
                  <Button variant="outline" size="sm">
                    <Plus className="h-4 w-4 mr-2" />
                    {t("tenants.drafts.openNew", {
                      defaultValue: "Open new tenant",
                    })}
                  </Button>
                </Link>
              </div>
            </div>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="space-y-2">
              {drafts.map((draft) => {
                const name =
                  `${draft.values?.firstName || ""} ${
                    draft.values?.lastName || ""
                  }`.trim() ||
                  t("tenants.drafts.untitled", {
                    defaultValue: "Untitled draft",
                  });
                const email = draft.values?.email || "";
                return (
                  <div
                    key={draft.id}
                    className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 p-3 rounded-lg border bg-white/70 dark:bg-gray-900/30"
                  >
                    <div className="min-w-0">
                      <div className="font-medium truncate">{name}</div>
                      <div className="text-sm text-muted-foreground truncate flex flex-wrap items-center gap-x-2">
                        {email && <span className="truncate">{email}</span>}
                        {draft.savedAt && (
                          <span className="inline-flex items-center gap-1">
                            <Clock className="h-3 w-3" />
                            {t("tenants.drafts.savedAt", {
                              defaultValue: "Saved",
                            })}{" "}
                            {formatDraftTime(draft.savedAt)}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => router.push("/dashboard/tenants/new")}
                      >
                        <Edit className="h-4 w-4 mr-2" />
                        {t("tenants.drafts.resume", { defaultValue: "Resume" })}
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-red-600"
                        onClick={() => discardDraft(draft.id)}
                      >
                        <Trash2 className="h-4 w-4 mr-2" />
                        {t("tenants.drafts.discard", {
                          defaultValue: "Discard",
                        })}
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      <Card className="gap-2 shadow-lg bg-linear-to-br from-white to-gray-50/50 dark:from-primary/10 dark:to-background">
        <CardHeader>
          {/* Main Header */}
          <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 mb-2">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-primary/5 dark:bg-primary/10 rounded-lg border border-primary/30 dark:border-primary">
                <Users className="h-5 w-5 text-primary dark:text-primary" />
              </div>
              <div>
                <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                  {t("tenants.header.title")} ({totalTenants})
                </h2>
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  {t("tenants.pagination.summary", {
                    values: {
                      from: (currentPage - 1) * itemsPerPage + 1,
                      to: Math.min(currentPage * itemsPerPage, totalTenants),
                      total: totalTenants,
                    },
                  })}
                </p>
              </div>
            </div>

            {/* View Mode Toggle */}
            <div className="flex items-center border rounded-lg p-1 w-full sm:w-auto">
              <Button
                variant={viewMode === "table" ? "default" : "ghost"}
                size="sm"
                onClick={() => setViewMode("table")}
                className="h-8 flex-1 sm:flex-none sm:px-3"
              >
                <List className="h-4 w-4 mr-2" />
                {t("tenants.view.table")}
              </Button>
              <Button
                variant={viewMode === "cards" ? "default" : "ghost"}
                size="sm"
                onClick={() => setViewMode("cards")}
                className="h-8 flex-1 sm:flex-none sm:px-3"
              >
                <LayoutGrid className="h-4 w-4 mr-2" />
                {t("tenants.view.cards")}
              </Button>
            </div>
          </div>

          {/* Integrated Filters Bar */}
          <div className="flex flex-col gap-4 p-4 bg-gray-50/50 dark:bg-gray-800/50 rounded-lg border border-gray-200/60 dark:border-gray-700/60">
            {/* Search and Status Filter */}
            <div className="flex flex-col sm:flex-row gap-3">
              {/* Global Search Component with 300ms debounce */}
              <GlobalSearch
                placeholder={t("tenants.filters.searchPlaceholder")}
                initialValue={searchTerm}
                debounceDelay={300}
                onSearch={handleSearch}
                isLoading={isSearching}
                className="flex-1"
                ariaLabel="Search tenants"
              />

              <Select
                value={statusFilter}
                onValueChange={handleStatusFilterChange}
              >
                <SelectTrigger className="h-10 w-full sm:w-[180px] border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800">
                  <SelectValue placeholder={t("tenants.filters.status.all")} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">
                    {t("tenants.filters.status.all")}
                  </SelectItem>
                  <SelectItem value="pending">
                    {t("tenants.filters.status.pending")}
                  </SelectItem>
                  <SelectItem value="approved">
                    {t("tenants.filters.status.approved")}
                  </SelectItem>
                  <SelectItem value="active">
                    {t("tenants.filters.status.active")}
                  </SelectItem>
                  <SelectItem value="inactive">
                    {t("tenants.filters.status.inactive")}
                  </SelectItem>
                  <SelectItem value="moved_out">
                    {t("tenants.filters.status.movedOut")}
                  </SelectItem>
                  <SelectItem value="terminated">
                    {t("tenants.filters.status.terminated")}
                  </SelectItem>
                  <SelectItem value="application_submitted">
                    {t("tenants.filters.status.applicationSubmitted")}
                  </SelectItem>
                  <SelectItem value="under_review">
                    {t("tenants.filters.status.underReview")}
                  </SelectItem>
                </SelectContent>
              </Select>

              {/* Clear Button - only show when filters are active */}
              {(searchTerm || statusFilter !== "all") && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    handleSearch("");
                    handleStatusFilterChange("all");
                  }}
                  className="h-10 text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100"
                >
                  <XCircle className="h-4 w-4 mr-2" />
                  {t("tenants.filters.clear") || "Clear"}
                </Button>
              )}
            </div>
          </div>

          {/* Bulk Selection Bar */}
          {selectedTenants.length > 0 && (
            <div className="mt-4 px-4 py-3 bg-muted/50 rounded-lg border">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium">
                    {t("tenants.bulk.selected", {
                      values: { count: selectedTenants.length },
                    })}
                  </span>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setSelectedTenants([])}
                  >
                    {t("tenants.filters.clear")}
                  </Button>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setBulkStatusDialogOpen(true)}
                  >
                    <RefreshCw className="h-4 w-4 mr-2" />
                    {t("tenants.actions.changeStatus")}
                  </Button>
                </div>
              </div>
            </div>
          )}
        </CardHeader>
        <CardContent>
          {isLoading ? (
            viewMode === "cards" ? (
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {[...Array(6)].map((_, i) => (
                  <div key={i} className="space-y-4">
                    <div className="flex items-center space-x-3">
                      <div className="h-12 w-12 bg-muted rounded-full animate-pulse" />
                      <div className="flex-1 space-y-2">
                        <div className="h-4 bg-muted rounded animate-pulse" />
                        <div className="h-3 bg-muted rounded w-3/4 animate-pulse" />
                      </div>
                    </div>
                    <div className="space-y-2">
                      <div className="h-3 bg-muted rounded animate-pulse" />
                      <div className="h-3 bg-muted rounded w-2/3 animate-pulse" />
                      <div className="h-3 bg-muted rounded w-1/2 animate-pulse" />
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="space-y-4">
                {[...Array(5)].map((_, i) => (
                  <div
                    key={i}
                    className="flex items-center space-x-4 p-4 border rounded-lg"
                  >
                    <div className="h-4 w-4 bg-muted rounded animate-pulse" />
                    <div className="h-10 w-10 bg-muted rounded-full animate-pulse" />
                    <div className="flex-1 space-y-2">
                      <div className="h-4 bg-muted rounded animate-pulse" />
                      <div className="h-3 bg-muted rounded w-3/4 animate-pulse" />
                    </div>
                    <div className="h-6 w-16 bg-muted rounded animate-pulse" />
                    <div className="h-8 w-8 bg-muted rounded animate-pulse" />
                  </div>
                ))}
              </div>
            )
          ) : tenants.length === 0 ? (
            <div className="text-center py-8">
              <h3 className="text-lg font-semibold mb-2">
                {t("tenants.empty.title")}
              </h3>
              <p className="text-muted-foreground mb-4">
                {t("tenants.empty.description")}
              </p>
              <Link href="/dashboard/tenants/new">
                <Button>
                  <Plus className="h-4 w-4 mr-2" />
                  {t("tenants.actions.addFirstTenant")}
                </Button>
              </Link>
            </div>
          ) : viewMode === "cards" ? (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {tenants.map((tenant) => (
                <TenantCard
                  key={tenant._id}
                  tenant={tenant}
                  onEdit={(id) => router.push(`/dashboard/tenants/${id}/edit`)}
                  onDelete={handleDeleteTenant}
                />
              ))}
            </div>
          ) : (
            <DataTable<Tenant>
              columns={tenantColumns}
              data={tenants}
              getRowKey={(tenant) => tenant._id}
              selection={{
                enabled: true,
                selectedIds: selectedTenants,
                onSelectAll: handleSelectAll,
                onSelectRow: handleTenantSelect,
                getRowId: (tenant) => tenant._id,
                selectAllLabel: t("tenants.table.selectAll"),
                selectRowLabel: (tenant) =>
                  t("tenants.table.selectTenant", {
                    values: { name: `${tenant.firstName} ${tenant.lastName}` },
                  }),
              }}
              emptyState={{
                icon: <Users className="h-12 w-12 text-muted-foreground" />,
                title: t("tenants.empty.title"),
                description: t("tenants.empty.description"),
              }}
              striped
            />
          )}

          {totalTenants > 0 && (
            <GlobalPagination
              currentPage={currentPage}
              totalPages={Math.max(1, Math.ceil(totalTenants / itemsPerPage))}
              totalItems={totalTenants}
              pageSize={itemsPerPage}
              onPageChange={handlePageChange}
              onPageSizeChange={handlePageSizeChange}
              showingLabel={t("common.showing", { defaultValue: "Showing" })}
              previousLabel={t("common.previous", { defaultValue: "Previous" })}
              nextLabel={t("common.next", { defaultValue: "Next" })}
              pageLabel={t("common.page", { defaultValue: "Page" })}
              ofLabel={t("common.of", { defaultValue: "of" })}
              itemsPerPageLabel={t("common.perPage", {
                defaultValue: "per page",
              })}
              disabled={isLoading || isSearching}
            />
          )}
        </CardContent>
      </Card>

      {selectedTenantForStatus && (
        <TenantStatusDialog
          isOpen={statusDialogOpen}
          onClose={() => {
            setStatusDialogOpen(false);
            setSelectedTenantForStatus(null);
          }}
          tenant={selectedTenantForStatus}
          onStatusChange={handleStatusUpdate}
          userRole={session?.user?.role || ""}
        />
      )}

      <BulkStatusDialog
        isOpen={bulkStatusDialogOpen}
        onClose={() => setBulkStatusDialogOpen(false)}
        selectedTenants={selectedTenants.map((id) => {
          const tenant = tenants.find((t) => t._id === id);
          return tenant
            ? {
                _id: tenant._id,
                firstName: tenant.firstName,
                lastName: tenant.lastName,
                tenantStatus: tenant.tenantStatus,
              }
            : { _id: id, firstName: "", lastName: "" };
        })}
        onBulkStatusChange={handleBulkStatusUpdate}
        userRole={session?.user?.role || ""}
      />

      <TenantDeleteDialog
        isOpen={deleteDialogOpen}
        onClose={() => setDeleteDialogOpen(false)}
        tenant={
          selectedTenantForDelete || { _id: "", firstName: "", lastName: "" }
        }
        onDelete={handleTenantDeleted}
        userRole={session?.user?.role || ""}
      />
    </div>
  );
}