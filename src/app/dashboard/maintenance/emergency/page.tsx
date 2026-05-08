"use client";

import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useSearchParams } from "next/navigation";
import { Skeleton } from "@/components/ui/skeleton";
import { Checkbox } from "@/components/ui/checkbox";
import { useState, useEffect, useCallback, useMemo } from "react";
import { GlobalPagination } from "@/components/ui/global-pagination";
import { DataTable, DataTableColumn } from "@/components/ui/data-table";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { useLocalizationContext } from "@/components/providers/LocalizationProvider";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import {
  AlertTriangle,
  Clock,
  User,
  Plus,
  RefreshCw,
  Search,
  TrendingUp,
  AlertCircle,
  CheckCircle,
  XCircle,
  Zap,
  Timer,
  List,
  LayoutGrid,
  MoreHorizontal,
  UserPlus,
  FileText,
  Download,
  Settings,
  Eye,
  Edit,
  ExternalLink,
} from "lucide-react";
import {
  AnalyticsCard,
  AnalyticsCardGrid,
} from "@/components/analytics/AnalyticsCard";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";
import { MaintenanceStatus } from "@/types";
import { formatAddress } from "@/lib/utils";
import EmergencyCard from "@/components/emergency/EmergencyCard";
import { useViewPreferencesStore } from "@/stores/view-preferences.store";
import { MaintenanceStatusManager } from "@/components/maintenance/maintenance-status-manager";

interface EmergencyRequest {
  _id: string;
  title: string;
  description: string;
  priority: string;
  status: MaintenanceStatus;
  category: string;
  createdAt: string;
  updatedAt: string;
  hoursSinceCreation: number;
  isOverdue: boolean;
  urgencyLevel: "normal" | "overdue" | "critical" | "completed";
  property: {
    _id: string;
    name: string;
    address:
      | string
      | {
          street: string;
          city: string;
          state: string;
          zipCode: string;
          country: string;
        };
  };
  tenant: {
    _id: string;
    firstName: string;
    lastName: string;
    email: string;
    phone: string;
    avatar?: string;
  };
  assignedUser?: {
    _id: string;
    firstName: string;
    lastName: string;
    email: string;
    avatar?: string;
    phone?: string;
  };
  estimatedCost?: number;
  actualCost?: number;
  scheduledDate?: string;
  completedAt?: string;
  images?: string[];
  notes?: string;
  escalationLevel?: number;
  lastContactedAt?: string;
}

interface EmergencyStats {
  total: number;
  active: number;
  overdue: number;
  completed: number;
  unassigned: number;
  avgResponseTime: number;
  critical: number;
  escalated: number;
  todayCreated: number;
  weekCreated: number;
}

interface BulkAction {
  id: string;
  label: string;
  icon: React.ComponentType<any>;
  action: (selectedIds: string[]) => void;
  requiresConfirmation?: boolean;
  confirmationMessage?: string;
}

interface QuickAssignData {
  requestId: string;
  assigneeId: string;
  notes?: string;
}

interface EmergencyPageData {
  requests: EmergencyRequest[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    pages: number;
  };
  statistics: EmergencyStats;
}

export default function EmergencyMaintenancePage() {
  const searchParams = useSearchParams();
  const { t } = useLocalizationContext();

  const [data, setData] = useState<EmergencyPageData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  // Filter states
  const [searchTerm, setSearchTerm] = useState(
    searchParams.get("search") || ""
  );
  const [statusFilter, setStatusFilter] = useState(
    searchParams.get("status") || "all"
  );
  const [responseTimeFilter, setResponseTimeFilter] = useState(
    searchParams.get("responseTime") || "all"
  );
  const [propertyFilter, setPropertyFilter] = useState(
    searchParams.get("propertyId") || ""
  );
  const [assignedFilter, setAssignedFilter] = useState(
    searchParams.get("assignedTo") || "all"
  );
  const viewMode = useViewPreferencesStore(
    (state) => state.emergencyMaintenanceView
  );
  const setViewMode = useViewPreferencesStore(
    (state) => state.setEmergencyMaintenanceView
  );

  // Enhanced state management
  const [selectedRequests, setSelectedRequests] = useState<string[]>([]);
  const [showBulkActions, setShowBulkActions] = useState(false);
  const [quickAssignDialog, setQuickAssignDialog] = useState(false);
  const [escalateDialog, setEscalateDialog] = useState(false);
  const [selectedRequestForAction, setSelectedRequestForAction] = useState<
    string | null
  >(null);
  const [assigneeOptions, setAssigneeOptions] = useState<
    Array<{ id: string; name: string; email: string }>
  >([]);
  const [bulkActionLoading, setBulkActionLoading] = useState(false);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [sortBy, setSortBy] = useState("createdAt");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(12);

  // Enhanced data fetching with better error handling and caching
  const fetchEmergencyRequests = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      if (statusFilter !== "all") params.set("status", statusFilter);
      if (responseTimeFilter !== "all")
        params.set("responseTime", responseTimeFilter);
      if (propertyFilter) params.set("propertyId", propertyFilter);
      if (assignedFilter !== "all") params.set("assignedTo", assignedFilter);
      if (sortBy) params.set("sortBy", sortBy);
      if (sortOrder) params.set("sortOrder", sortOrder);

      const response = await fetch(
        `/api/maintenance/emergency?${params.toString()}`,
        {
          headers: {
            "Cache-Control": "no-cache",
          },
        }
      );
      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || "Failed to fetch emergency requests");
      }

      setData(result.data);
      setError(null);

      // Clear selections when data changes
      setSelectedRequests([]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred");
      toast.error(t("maintenance.emergency.list.toasts.loadError"));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [
    t,
    statusFilter,
    responseTimeFilter,
    propertyFilter,
    assignedFilter,
    sortBy,
    sortOrder,
  ]);

  // Fetch available assignees for quick assignment
  const fetchAssignees = useCallback(async () => {
    try {
      const response = await fetch("/api/users?role=manager&limit=50");
      const result = await response.json();

      if (response.ok && result.users) {
        setAssigneeOptions(
          result.users.map((user: any) => ({
            id: user._id,
            name: `${user.firstName} ${user.lastName}`,
            email: user.email,
          }))
        );
      }
    } catch {
      toast.error(t("maintenance.emergency.list.toasts.assigneeError"));
    }
  }, [t]);

  const handleRefresh = () => {
    setRefreshing(true);
    fetchEmergencyRequests();
  };

  // Bulk action handlers
  const handleSelectAll = (checked: boolean) => {
    if (checked && filteredRequests) {
      setSelectedRequests(filteredRequests.map((req) => req._id));
    } else {
      setSelectedRequests([]);
    }
  };

  const handleSelectRequest = (requestId: string, checked: boolean) => {
    if (checked) {
      setSelectedRequests((prev) => [...prev, requestId]);
    } else {
      setSelectedRequests((prev) => prev.filter((id) => id !== requestId));
    }
  };

  const handleBulkAssign = async (assigneeId: string) => {
    if (selectedRequests.length === 0) return;

    setBulkActionLoading(true);
    try {
      const response = await fetch("/api/maintenance/bulk-assign", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          requestIds: selectedRequests,
          assigneeId,
        }),
      });

      if (response.ok) {
        toast.success(
          t("maintenance.emergency.list.toasts.assignSuccess", {
            values: { count: selectedRequests.length },
          })
        );
        setSelectedRequests([]);
        fetchEmergencyRequests();
      } else {
        throw new Error("Failed to assign requests");
      }
    } catch {
      toast.error(t("maintenance.emergency.list.toasts.assignError"));
    } finally {
      setBulkActionLoading(false);
    }
  };

  const handleBulkStatusUpdate = async (status: MaintenanceStatus) => {
    if (selectedRequests.length === 0) return;

    setBulkActionLoading(true);
    try {
      const response = await fetch("/api/maintenance/bulk-status", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          requestIds: selectedRequests,
          status,
        }),
      });

      if (response.ok) {
        toast.success(
          t("maintenance.emergency.list.toasts.updateSuccess", {
            values: { count: selectedRequests.length },
          })
        );
        setSelectedRequests([]);
        fetchEmergencyRequests();
      } else {
        throw new Error("Failed to update requests");
      }
    } catch {
      toast.error(t("maintenance.emergency.list.toasts.updateError"));
    } finally {
      setBulkActionLoading(false);
    }
  };

  const handleEscalate = async (requestId: string, notes?: string) => {
    try {
      const response = await fetch(`/api/maintenance/emergency/escalate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          requestId,
          notes,
        }),
      });

      if (response.ok) {
        toast.success(t("maintenance.emergency.list.toasts.escalateSuccess"));
        fetchEmergencyRequests();
      } else {
        throw new Error("Failed to escalate request");
      }
    } catch {
      toast.error(t("maintenance.emergency.list.toasts.escalateError"));
    }
  };

  const handleQuickContact = async (
    requestId: string,
    method: "phone" | "email"
  ) => {
    const request = data?.requests.find((r) => r._id === requestId);
    if (!request) return;

    if (method === "phone" && request.tenant.phone) {
      window.open(`tel:${request.tenant.phone}`);
    } 

    // Log the contact attempt
    try {
      await fetch(`/api/maintenance/${requestId}/contact`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          method,
          contactedAt: new Date().toISOString(),
        }),
      });
    } catch {
      toast.warning(t("maintenance.emergency.list.toasts.contactWarning"));
    }
  };

  // DISABLED: Delete functionality temporarily disabled
  // const handleDeleteRequest = useCallback(
  //   async (requestId: string) => {
  //     if (!requestId) {
  //       return;
  //     }

  //     try {
  //       const response = await fetch(`/api/maintenance/${requestId}`, {
  //         method: "DELETE",
  //       });

  //       const isJson = response.headers
  //         .get("content-type")
  //         ?.includes("application/json");
  //       const payload = isJson ? await response.json() : null;

  //       if (!response.ok) {
  //         throw new Error(
  //           payload?.error || "Failed to delete emergency request"
  //         );
  //       }

  //       toast.success("Emergency request deleted");
  //       setRefreshing(true);
  //       setSelectedRequests((prev) =>
  //         prev.filter((selectedId) => selectedId !== requestId)
  //       );
  //       await fetchEmergencyRequests();
  //     } catch (err) {
  //       toast.error(
  //         err instanceof Error
  //           ? err.message
  //           : "Failed to delete emergency request"
  //       );
  //     }
  //   },
  //   [fetchEmergencyRequests]
  // );

  const getUrgencyBadge = (urgencyLevel: string, isOverdue: boolean) => {
    if (urgencyLevel === "critical") {
      return (
        <Badge variant="destructive" className="animate-pulse">
          <AlertTriangle className="w-3 h-3 mr-1" />
          Critical
        </Badge>
      );
    }
    if (urgencyLevel === "overdue" || isOverdue) {
      return (
        <Badge variant="destructive">
          <Clock className="w-3 h-3 mr-1" />
          Overdue
        </Badge>
      );
    }
    if (urgencyLevel === "completed") {
      return (
        <Badge variant="default" className="bg-green-100 text-green-800">
          <CheckCircle className="w-3 h-3 mr-1" />
          Completed
        </Badge>
      );
    }
    return (
      <Badge variant="secondary">
        <Timer className="w-3 h-3 mr-1" />
        Normal
      </Badge>
    );
  };

  const getStatusBadge = (status: MaintenanceStatus) => {
    const statusConfig = {
      [MaintenanceStatus.SUBMITTED]: {
        variant: "secondary" as const,
        icon: AlertCircle,
      },
      [MaintenanceStatus.ASSIGNED]: { variant: "default" as const, icon: User },
      [MaintenanceStatus.IN_PROGRESS]: {
        variant: "default" as const,
        icon: RefreshCw,
      },
      [MaintenanceStatus.COMPLETED]: {
        variant: "default" as const,
        icon: CheckCircle,
      },
      [MaintenanceStatus.CANCELLED]: {
        variant: "destructive" as const,
        icon: XCircle,
      },
    };

    const config = statusConfig[status];
    const Icon = config.icon;

    return (
      <Badge variant={config.variant}>
        <Icon className="w-3 h-3 mr-1" />
        {status.replace("_", " ").toUpperCase()}
      </Badge>
    );
  };

  // Define columns for DataTable
  const emergencyColumns: DataTableColumn<EmergencyRequest>[] = [
    {
      id: "number",
      header: t("maintenance.emergency.list.table.number"),
      cell: (_request, index) => (
        <span className="font-medium text-muted-foreground">
          {(index || 0) + 1}
        </span>
      ),
    },
    {
      id: "request",
      header: t("maintenance.emergency.list.table.request"),
      cell: (request) => {
        const getUrgencyColor = () => {
          if (
            request.urgencyLevel === "critical" ||
            (request.isOverdue && request.hoursSinceCreation > 4)
          ) {
            return "text-red-600 font-bold";
          }
          if (request.urgencyLevel === "overdue" || request.isOverdue) {
            return "text-orange-600";
          }
          return "text-gray-600";
        };
        return (
          <div className="space-y-1">
            <div className={`font-medium ${getUrgencyColor()}`}>
              <Link
                href={`/dashboard/maintenance/${request._id}`}
                className="hover:underline"
              >
                {request.title}
              </Link>
            </div>
            <div className="text-sm text-muted-foreground">
              ID: {request._id.slice(-8)}
            </div>
          </div>
        );
      },
    },
    {
      id: "status",
      header: t("maintenance.emergency.list.table.status"),
      cell: (request) => (
        <div className="flex flex-col gap-1">
          <div>{getUrgencyBadge(request.urgencyLevel, request.isOverdue)}</div>
          <div>{getStatusBadge(request.status)}</div>
        </div>
      ),
    },
    {
      id: "property",
      header: t("maintenance.emergency.list.table.property"),
      visibility: "lg" as const,
      cell: (request) => {
        const address = formatAddress(request.property.address);
        const words = address.split(" ");
        const truncatedAddress =
          words.length > 3 ? words.slice(0, 3).join(" ") + "..." : address;
        return (
          <div className="space-y-1 max-w-[180px]">
            <div className="font-medium truncate">{request.property.name}</div>
            <div
              className="text-sm text-muted-foreground truncate"
              title={address}
            >
              {truncatedAddress}
            </div>
          </div>
        );
      },
    },
    {
      id: "tenant",
      header: t("maintenance.emergency.list.table.tenant"),
      visibility: "md" as const,
      cell: (request) => (
        <div className="flex items-center space-x-3">
          <Avatar className="h-8 w-8">
            <AvatarImage
              src={request.tenant?.avatar}
              alt={`${request.tenant?.firstName || ""} ${
                request.tenant?.lastName || ""
              }`}
            />
            <AvatarFallback>
              {request.tenant?.firstName?.[0] || "T"}
              {request.tenant?.lastName?.[0] || ""}
            </AvatarFallback>
          </Avatar>
          <div>
            <div className="font-medium">
              {request.tenant?.firstName || ""} {request.tenant?.lastName || ""}
            </div>
            <div className="text-sm text-muted-foreground">
              {request.tenant?.phone || ""}
            </div>
          </div>
        </div>
      ),
    },
    {
      id: "assignedTo",
      header: t("maintenance.emergency.list.table.assignedTo"),
      visibility: "lg" as const,
      cell: (request) =>
        request.assignedUser ? (
          <div className="flex items-center gap-2">
            <User className="h-4 w-4 text-green-600" />
            <span className="text-sm">
              {request.assignedUser.firstName} {request.assignedUser.lastName}
            </span>
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <AlertCircle className="h-4 w-4 text-orange-500" />
            <span className="text-sm text-orange-600">Unassigned</span>
          </div>
        ),
    },
    {
      id: "created",
      header: t("maintenance.emergency.list.table.created"),
      visibility: "xl" as const,
      cell: (request) => (
        <div className="text-sm">
          {formatDistanceToNow(new Date(request.createdAt))} ago
        </div>
      ),
    },
    {
      id: "elapsed",
      header: t("maintenance.emergency.list.table.elapsed"),
      visibility: "xl" as const,
      cell: (request) => (
        <div className="text-sm font-medium">
          {Math.round(request.hoursSinceCreation)}h
        </div>
      ),
    },
    {
      id: "actions",
      header: t("maintenance.emergency.list.table.actions"),
      align: "right" as const,
      cell: (request) => (
        <MaintenanceStatusManager
          request={request as any}
          onRequestUpdate={fetchEmergencyRequests}
          availableStaff={assigneeOptions.map((a) => {
            const parts = (a.name || "").split(" ");
            const first = parts[0] || a.name;
            const last = parts.slice(1).join(" ");
            return {
              _id: a.id,
              firstName: first,
              lastName: last,
              email: a.email,
            };
          })}
        />
      ),
    },
  ];

  // Computed values
  const criticalRequests = useMemo(() => {
    return (
      data?.requests.filter(
        (req) =>
          req.urgencyLevel === "critical" ||
          (req.isOverdue && req.hoursSinceCreation > 4)
      ) || []
    );
  }, [data?.requests]);

  const unassignedRequests = useMemo(() => {
    return data?.requests.filter((req) => !req.assignedUser) || [];
  }, [data?.requests]);

  const filteredRequests = useMemo(() => {
    const list = data?.requests || [];
    const term = (searchTerm || "").toLowerCase();
    const priorityOrder: Record<string, number> = {
      emergency: 4,
      high: 3,
      medium: 2,
      low: 1,
    };
    const statusMap: Record<string, MaintenanceStatus> = {
      submitted: MaintenanceStatus.SUBMITTED,
      assigned: MaintenanceStatus.ASSIGNED,
      in_progress: MaintenanceStatus.IN_PROGRESS,
      completed: MaintenanceStatus.COMPLETED,
      cancelled: MaintenanceStatus.CANCELLED,
    };

    const matches = list.filter((req) => {
      const matchesSearch = term
        ? (req.title || "").toLowerCase().includes(term) ||
          (req.description || "").toLowerCase().includes(term) ||
          (req.category || "").toLowerCase().includes(term) ||
          (req.property?.name || "").toLowerCase().includes(term) ||
          (formatAddress(req.property?.address) || "")
            .toLowerCase()
            .includes(term) ||
          (req.tenant?.firstName || "").toLowerCase().includes(term) ||
          (req.tenant?.lastName || "").toLowerCase().includes(term)
        : true;

      const matchesStatus = (() => {
        if (statusFilter === "all") return true;
        if (statusFilter === "active") {
          return (
            req.status === MaintenanceStatus.SUBMITTED ||
            req.status === MaintenanceStatus.ASSIGNED ||
            req.status === MaintenanceStatus.IN_PROGRESS
          );
        }
        const mapped = statusMap[statusFilter];
        return mapped ? req.status === mapped : true;
      })();

      const matchesResponse = (() => {
        if (responseTimeFilter === "all") return true;
        if (responseTimeFilter === "normal") {
          return !req.isOverdue && (req.hoursSinceCreation || 0) < 2;
        }
        if (responseTimeFilter === "overdue") {
          return !!req.isOverdue || (req.hoursSinceCreation || 0) >= 2;
        }
        if (responseTimeFilter === "critical") {
          return (
            req.urgencyLevel === "critical" ||
            (!!req.isOverdue && (req.hoursSinceCreation || 0) > 4)
          );
        }
        return true;
      })();

      const matchesAssigned = (() => {
        if (assignedFilter === "all") return true;
        if (assignedFilter === "assigned") return !!req.assignedUser;
        if (assignedFilter === "unassigned") return !req.assignedUser;
        return true;
      })();

      const matchesProperty = propertyFilter
        ? req.property?._id === propertyFilter
        : true;

      return (
        matchesSearch &&
        matchesStatus &&
        matchesResponse &&
        matchesAssigned &&
        matchesProperty
      );
    });

    const sorted = [...matches].sort((a, b) => {
      let aValue: any = 0;
      let bValue: any = 0;
      switch (sortBy) {
        case "createdAt":
          aValue = new Date(a.createdAt || "").getTime();
          bValue = new Date(b.createdAt || "").getTime();
          break;
        case "hoursSinceCreation":
          aValue = a.hoursSinceCreation || 0;
          bValue = b.hoursSinceCreation || 0;
          break;
        case "priority":
          aValue = priorityOrder[(a.priority || "").toLowerCase()] || 0;
          bValue = priorityOrder[(b.priority || "").toLowerCase()] || 0;
          break;
        case "status":
          aValue = a.status || "";
          bValue = b.status || "";
          break;
        case "property.name":
          aValue = a.property?.name || "";
          bValue = b.property?.name || "";
          break;
        default:
          aValue = new Date(a.createdAt || "").getTime();
          bValue = new Date(b.createdAt || "").getTime();
      }
      if (sortOrder === "asc") {
        return aValue > bValue ? 1 : -1;
      } else {
        return aValue < bValue ? 1 : -1;
      }
    });

    return sorted;
  }, [
    data?.requests,
    searchTerm,
    statusFilter,
    responseTimeFilter,
    propertyFilter,
    assignedFilter,
    sortBy,
    sortOrder,
  ]);

  const totalItems = filteredRequests.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  const startIndex = (currentPage - 1) * pageSize;
  const endIndex = startIndex + pageSize;
  const visibleRequests = filteredRequests.slice(startIndex, endIndex);

  const isAllSelected = useMemo(() => {
    return (
      filteredRequests &&
      filteredRequests.length > 0 &&
      selectedRequests.length === filteredRequests.length
    );
  }, [selectedRequests.length, filteredRequests]);

  const isSomeSelected = useMemo(() => {
    return (
      selectedRequests.length > 0 &&
      selectedRequests.length < (filteredRequests.length || 0)
    );
  }, [selectedRequests.length, filteredRequests]);

  useEffect(() => {
    fetchEmergencyRequests();
    fetchAssignees();
  }, [fetchEmergencyRequests, fetchAssignees]);

  useEffect(() => {
    if (currentPage > totalPages) {
      setCurrentPage(1);
    }
  }, [totalItems, pageSize, currentPage, totalPages]);

  useEffect(() => {
    setCurrentPage(1);
  }, [
    searchTerm,
    statusFilter,
    responseTimeFilter,
    propertyFilter,
    assignedFilter,
    sortBy,
    sortOrder,
  ]);

  const handlePageChange = (page: number) => setCurrentPage(page);
  const handlePageSizeChange = (size: number) => {
    setPageSize(size);
    setCurrentPage(1);
  };

  // Enhanced auto-refresh with configurable interval
  useEffect(() => {
    if (!autoRefresh) return;

    const interval = setInterval(() => {
      if (!loading && !refreshing && !bulkActionLoading) {
        fetchEmergencyRequests();
      }
    }, 30000); // 30 seconds

    return () => clearInterval(interval);
  }, [
    fetchEmergencyRequests,
    loading,
    refreshing,
    bulkActionLoading,
    autoRefresh,
  ]);

  // Update URL params when filters change
  useEffect(() => {
    const params = new URLSearchParams();
    if (searchTerm) params.set("search", searchTerm);
    if (statusFilter !== "all") params.set("status", statusFilter);
    if (responseTimeFilter !== "all")
      params.set("responseTime", responseTimeFilter);
    if (propertyFilter) params.set("propertyId", propertyFilter);
    if (assignedFilter !== "all") params.set("assignedTo", assignedFilter);

    const newUrl = `${window.location.pathname}?${params.toString()}`;
    window.history.replaceState({}, "", newUrl);
  }, [
    searchTerm,
    statusFilter,
    responseTimeFilter,
    propertyFilter,
    assignedFilter,
  ]);

  // Show bulk actions when requests are selected
  useEffect(() => {
    setShowBulkActions(selectedRequests.length > 0);
  }, [selectedRequests.length]);

  if (error) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight text-red-600">
              Emergency Maintenance
            </h1>
            <p className="text-muted-foreground">
              Critical maintenance requests requiring immediate attention
            </p>
          </div>
        </div>
        <Card>
          <CardContent className="flex flex-col items-center justify-center min-h-[400px] space-y-4">
            <AlertTriangle className="h-12 w-12 text-red-500" />
            <h2 className="text-xl font-semibold">
              Failed to Load Emergency Requests
            </h2>
            <p className="text-muted-foreground text-center">{error}</p>
            <Button onClick={handleRefresh}>
              <RefreshCw className="mr-2 h-4 w-4" />
              Try Again
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Enhanced Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-red-600 flex items-center gap-2">
            <Zap className="h-8 w-8" />
            {t("maintenance.emergency.list.header.title")}
            {criticalRequests.length > 0 && (
              <Badge variant="destructive" className="animate-pulse">
                {criticalRequests.length}{" "}
                {t("maintenance.emergency.list.header.critical")}
              </Badge>
            )}
          </h1>
          <p className="text-muted-foreground">
            {t("maintenance.emergency.list.header.subtitle")}
            {unassignedRequests.length > 0 && (
              <span className="text-orange-600 font-medium ml-2">
                • {unassignedRequests.length}{" "}
                {t("maintenance.emergency.list.header.unassigned")}
              </span>
            )}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-2 mr-4">
            <label className="text-sm font-medium">
              {t("maintenance.emergency.list.header.autoRefresh")}
            </label>
            <Checkbox checked={autoRefresh} onCheckedChange={setAutoRefresh} />
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={handleRefresh}
            disabled={refreshing}
          >
            <RefreshCw
              className={`mr-2 h-4 w-4 ${refreshing ? "animate-spin" : ""}`}
            />
            {t("maintenance.emergency.list.header.refresh")}
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm">
                <Download className="mr-2 h-4 w-4" />
                {t("maintenance.emergency.list.header.export")}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent>
              <DropdownMenuItem onClick={() => window.print()}>
                <FileText className="mr-2 h-4 w-4" />
                {t("maintenance.emergency.list.export.printReport")}
              </DropdownMenuItem>
              <DropdownMenuItem>
                <Download className="mr-2 h-4 w-4" />
                {t("maintenance.emergency.list.export.exportCsv")}
              </DropdownMenuItem>
              <DropdownMenuItem>
                <Download className="mr-2 h-4 w-4" />
                {t("maintenance.emergency.list.export.exportPdf")}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <Link href="/dashboard/maintenance/new?priority=emergency">
            <Button size="sm" className="bg-red-600 hover:bg-red-700">
              <Plus className="h-4 w-4" />
              {t("maintenance.emergency.list.header.newEmergency")}
            </Button>
          </Link>
        </div>
      </div>

      {/* Enhanced Statistics Cards */}
      <AnalyticsCardGrid className="lg:grid-cols-6">
        <AnalyticsCard
          title={t("maintenance.emergency.list.stats.totalEmergencies")}
          value={data?.statistics?.total ?? 0}
          description={`${t("maintenance.emergency.list.stats.allTime")} • ${data?.statistics?.todayCreated || 0} ${t("maintenance.emergency.list.stats.today")}`}
          icon={AlertTriangle}
          iconColor="error"
        />

        <AnalyticsCard
          title={t("maintenance.emergency.list.stats.active")}
          value={data?.statistics?.active ?? 0}
          description={t("maintenance.emergency.list.stats.needsAttention")}
          icon={Clock}
          iconColor="warning"
        />

        <AnalyticsCard
          title={t("maintenance.emergency.list.stats.critical")}
          value={data?.statistics?.critical || criticalRequests.length}
          description={t("maintenance.emergency.list.stats.hoursOld")}
          icon={Zap}
          iconColor="error"
        />

        <AnalyticsCard
          title={t("maintenance.emergency.list.stats.unassigned")}
          value={data?.statistics?.unassigned || unassignedRequests.length}
          description={t("maintenance.emergency.list.stats.needAssignment")}
          icon={UserPlus}
          iconColor="warning"
        />

        <AnalyticsCard
          title={t("maintenance.emergency.list.stats.completed")}
          value={data?.statistics?.completed ?? 0}
          description={t("maintenance.emergency.list.stats.resolved")}
          icon={CheckCircle}
          iconColor="success"
        />

        <AnalyticsCard
          title={t("maintenance.emergency.list.stats.avgResponse")}
          value={
            data?.statistics?.avgResponseTime
              ? `${Math.round(data.statistics.avgResponseTime)}h`
              : "N/A"
          }
          description={t("maintenance.emergency.list.stats.responseTime")}
          icon={TrendingUp}
          iconColor="info"
        />
      </AnalyticsCardGrid>

      {/* Bulk Actions Bar */}
      {showBulkActions && (
        <Card className="border-blue-200 bg-blue-50/50">
          <CardContent className="py-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <span className="text-sm font-medium">
                  {selectedRequests.length} request(s) selected
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setSelectedRequests([])}
                >
                  Clear Selection
                </Button>
              </div>
              <div className="flex items-center gap-2">
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button size="sm" disabled={bulkActionLoading}>
                      <UserPlus className="mr-2 h-4 w-4" />
                      Assign To
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent>
                    {assigneeOptions.map((assignee) => (
                      <DropdownMenuItem
                        key={assignee.id}
                        onClick={() => handleBulkAssign(assignee.id)}
                      >
                        {assignee.name}
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>

                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={bulkActionLoading}
                    >
                      <Settings className="mr-2 h-4 w-4" />
                      Update Status
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent>
                    <DropdownMenuItem
                      onClick={() =>
                        handleBulkStatusUpdate(MaintenanceStatus.ASSIGNED)
                      }
                    >
                      Mark as Assigned
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onClick={() =>
                        handleBulkStatusUpdate(MaintenanceStatus.IN_PROGRESS)
                      }
                    >
                      Mark as In Progress
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onClick={() =>
                        handleBulkStatusUpdate(MaintenanceStatus.COMPLETED)
                      }
                    >
                      Mark as Completed
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Emergency Requests with Integrated Filters */}
      <Card className="gap-2">
        <CardHeader>
          {/* Main Header */}
          <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 mb-2">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-red-50 dark:bg-red-900/30 rounded-lg border border-red-100 dark:border-red-800">
                <Zap className="h-5 w-5 text-red-600 dark:text-red-400" />
              </div>
              <div>
                <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                  {t("maintenance.emergency.list.table.title")} (
                  {filteredRequests?.length || 0})
                </h2>
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  {t("maintenance.emergency.list.table.subtitle")}
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
                <List className="h-4 w-4" />
              </Button>
              <Button
                variant={viewMode === "cards" ? "default" : "ghost"}
                size="sm"
                onClick={() => setViewMode("cards")}
                className="h-8 flex-1 sm:flex-none sm:px-3"
              >
                <LayoutGrid className="h-4 w-4" />
              </Button>
            </div>
          </div>

          {/* Integrated Filters Bar - Single Row */}
          <div className="flex flex-col lg:flex-row lg:items-center gap-4 p-4 bg-gray-50/50 dark:bg-gray-800/50 rounded-lg border border-gray-200/60 dark:border-gray-700/60">
            {/* Search */}
            <div className="relative flex-1 min-w-0">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400 dark:text-gray-500" />
              <Input
                placeholder={t(
                  "maintenance.emergency.list.filters.searchPlaceholder"
                )}
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10 h-10 border-gray-200 dark:border-gray-700 focus:border-red-400 dark:focus:border-red-500 focus:ring-1 focus:ring-red-400 dark:focus:ring-red-500 bg-white dark:bg-gray-800"
              />
            </div>

            {/* Filters */}
            <div className="flex flex-wrap items-center gap-3">
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="h-10 w-[130px] border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800">
                  <SelectValue
                    placeholder={t(
                      "maintenance.emergency.list.filters.allStatuses"
                    )}
                  />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">
                    {t("maintenance.emergency.list.filters.allStatuses")}
                  </SelectItem>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="submitted">Submitted</SelectItem>
                  <SelectItem value="assigned">Assigned</SelectItem>
                  <SelectItem value="in_progress">In Progress</SelectItem>
                  <SelectItem value="completed">Completed</SelectItem>
                </SelectContent>
              </Select>

              <Select
                value={responseTimeFilter}
                onValueChange={setResponseTimeFilter}
              >
                <SelectTrigger className="h-10 w-[130px] border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800">
                  <SelectValue placeholder="All Times" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Times</SelectItem>
                  <SelectItem value="normal">Normal (&lt;2h)</SelectItem>
                  <SelectItem value="overdue">Overdue (&gt;2h)</SelectItem>
                  <SelectItem value="critical">Critical (&gt;4h)</SelectItem>
                </SelectContent>
              </Select>

              <Select value={assignedFilter} onValueChange={setAssignedFilter}>
                <SelectTrigger className="h-10 w-[140px] border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800">
                  <SelectValue placeholder="All Assignments" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Assignments</SelectItem>
                  <SelectItem value="unassigned">Unassigned</SelectItem>
                  <SelectItem value="assigned">Assigned</SelectItem>
                </SelectContent>
              </Select>

              <Select value={sortBy} onValueChange={setSortBy}>
                <SelectTrigger className="h-10 w-[130px] border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800">
                  <SelectValue placeholder="Sort By" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="createdAt">Created Date</SelectItem>
                  <SelectItem value="hoursSinceCreation">
                    Response Time
                  </SelectItem>
                  <SelectItem value="priority">Priority</SelectItem>
                  <SelectItem value="status">Status</SelectItem>
                  <SelectItem value="property.name">Property</SelectItem>
                </SelectContent>
              </Select>

              {/* Clear Button - only show when filters are active */}
              {(searchTerm ||
                statusFilter !== "all" ||
                responseTimeFilter !== "all" ||
                assignedFilter !== "all" ||
                sortBy !== "createdAt") && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setSearchTerm("");
                    setStatusFilter("all");
                    setResponseTimeFilter("all");
                    setPropertyFilter("");
                    setAssignedFilter("all");
                    setSortBy("createdAt");
                    setSortOrder("desc");
                  }}
                  className="h-10 text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100"
                >
                  <XCircle className="h-4 w-4 mr-2" />
                  {t("maintenance.emergency.list.filters.clearAll") ||
                    "Clear All"}
                </Button>
              )}
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {viewMode === "cards" ? (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {loading ? (
                [...Array(6)].map((_, i) => (
                  <Card key={i} className="overflow-hidden">
                    <Skeleton className="h-24 w-full" />
                    <CardContent className="p-4 space-y-3">
                      <div className="space-y-2">
                        <Skeleton className="h-5 w-40" />
                        <Skeleton className="h-4 w-56" />
                      </div>
                      <div className="flex items-center gap-2">
                        <Skeleton className="h-4 w-4" />
                        <Skeleton className="h-4 w-24" />
                      </div>
                      <div className="flex items-center gap-4">
                        <Skeleton className="h-4 w-12" />
                        <Skeleton className="h-4 w-12" />
                        <Skeleton className="h-4 w-16" />
                      </div>
                      <div className="flex items-center justify-between pt-1">
                        <Skeleton className="h-6 w-24" />
                        <Skeleton className="h-8 w-8" />
                      </div>
                    </CardContent>
                  </Card>
                ))
              ) : filteredRequests && filteredRequests.length > 0 ? (
                visibleRequests.map((request) => (
                  <EmergencyCard
                    key={request._id}
                    request={request}
                    onEdit={(id) =>
                      window.open(`/dashboard/maintenance/${id}/edit`, "_blank")
                    }
                    // onDelete={handleDeleteRequest}
                  />
                ))
              ) : (
                <div className="col-span-full text-center py-8">
                  <div className="flex flex-col items-center space-y-4">
                    <CheckCircle className="h-12 w-12 text-green-500" />
                    <h2 className="text-xl font-semibold">
                      {t("maintenance.emergency.list.table.noRequests")}
                    </h2>
                    <p className="text-muted-foreground text-center">
                      {t("maintenance.emergency.list.table.noRequestsDesc")}
                    </p>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <DataTable<EmergencyRequest>
              columns={emergencyColumns}
              data={visibleRequests || []}
              getRowKey={(request) => request._id}
              loading={loading}
              selection={{
                enabled: true,
                selectedIds: selectedRequests,
                onSelectRow: (id: string, checked: boolean) =>
                  handleSelectRequest(id, checked),
                onSelectAll: (checked: boolean) => handleSelectAll(checked),
                getRowId: (request: EmergencyRequest) => request._id,
              }}
              emptyState={{
                icon: <CheckCircle className="h-12 w-12 text-green-500" />,
                title: t("maintenance.emergency.list.table.noRequests"),
                description: t(
                  "maintenance.emergency.list.table.noRequestsDesc"
                ),
              }}
              striped
            />
          )}
          {totalItems > 0 && (
            <GlobalPagination
              currentPage={currentPage}
              totalPages={totalPages}
              totalItems={totalItems}
              pageSize={pageSize}
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
              disabled={loading}
            />
          )}
        </CardContent>
      </Card>

      {/* Quick Assign Dialog */}
      <Dialog open={quickAssignDialog} onOpenChange={setQuickAssignDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {t("maintenance.emergency.list.dialogs.quickAssign.title")}
            </DialogTitle>
            <DialogDescription>
              {t("maintenance.emergency.list.dialogs.quickAssign.description")}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">
                {t(
                  "maintenance.emergency.list.dialogs.quickAssign.selectTechnician"
                )}
              </label>
              <Select>
                <SelectTrigger>
                  <SelectValue
                    placeholder={t(
                      "maintenance.emergency.list.dialogs.quickAssign.selectPlaceholder"
                    )}
                  />
                </SelectTrigger>
                <SelectContent>
                  {assigneeOptions.map((assignee) => (
                    <SelectItem key={assignee.id} value={assignee.id}>
                      {assignee.name} - {assignee.email}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">
                {t("maintenance.emergency.list.dialogs.quickAssign.notes")}
              </label>
              <Textarea
                placeholder={t(
                  "maintenance.emergency.list.dialogs.quickAssign.notesPlaceholder"
                )}
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setQuickAssignDialog(false)}
            >
              {t("maintenance.emergency.list.dialogs.quickAssign.cancel")}
            </Button>
            <Button onClick={() => setQuickAssignDialog(false)}>
              {t("maintenance.emergency.list.dialogs.quickAssign.assign")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Escalate Dialog */}
      <Dialog open={escalateDialog} onOpenChange={setEscalateDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {t("maintenance.emergency.list.dialogs.escalate.title")}
            </DialogTitle>
            <DialogDescription>
              {t("maintenance.emergency.list.dialogs.escalate.description")}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
              <div className="flex items-center gap-2">
                <AlertTriangle className="h-5 w-5 text-yellow-600" />
                <span className="font-medium text-yellow-800">
                  Escalation Warning
                </span>
              </div>
              <p className="text-sm text-yellow-700 mt-1">
                This will notify management and increase the priority level of
                this request.
              </p>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">
                {t("maintenance.emergency.list.dialogs.escalate.reason")}
              </label>
              <Textarea
                placeholder={t(
                  "maintenance.emergency.list.dialogs.escalate.reasonPlaceholder"
                )}
                rows={4}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEscalateDialog(false)}>
              {t("maintenance.emergency.list.dialogs.escalate.cancel")}
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                if (selectedRequestForAction) {
                  handleEscalate(selectedRequestForAction);
                }
                setEscalateDialog(false);
              }}
            >
              <AlertTriangle className="mr-2 h-4 w-4" />
              {t("maintenance.emergency.list.dialogs.escalate.escalate")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
