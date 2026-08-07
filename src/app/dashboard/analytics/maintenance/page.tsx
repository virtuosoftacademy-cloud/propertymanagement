"use client";

import { useState, useEffect } from "react";
import { useSession } from "next-auth/react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
} from "recharts";
import {
  Wrench,
  PoundSterling,
  RefreshCw,
  Download,
  Filter,
  Clock,
  TrendingUp,
} from "lucide-react";
import { UserRole } from "@/types";
import { useLocalizationContext } from "@/components/providers/LocalizationProvider";
import {
  downloadCsv,
  downloadPdf,
  exportFilename,
} from "@/lib/utils/export";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface MaintenanceAnalyticsData {
  overview: {
    totalRequests: number;
    pendingRequests: number;
    inProgressRequests: number;
    completedRequests: number;
    totalCost: number;
    avgCompletionTime: number;
    completionRate: number;
  };
  categoryBreakdown: Array<{
    category: string;
    count: number;
    totalCost: number;
    avgCost: number;
  }>;
  statusDistribution: Array<{
    status: string;
    count: number;
    percentage: number;
  }>;
  priorityDistribution: Array<{
    priority: string;
    count: number;
    percentage: number;
  }>;
  propertyBreakdown: Array<{
    propertyName: string;
    totalRequests: number;
    completedRequests: number;
    totalCost: number;
    avgResponseTime: number;
  }>;
}

export default function MaintenanceAnalyticsPage() {
  const { data: session } = useSession();
  const { t, formatCurrency: formatLocalizedCurrency } =
    useLocalizationContext();
  const [data, setData] = useState<MaintenanceAnalyticsData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedProperty, setSelectedProperty] = useState("all");
  const [availableProperties, setAvailableProperties] = useState<
    Array<{ id: string; name: string }>
  >([]);

  const userRole = session?.user?.role as UserRole;
  const isAdmin = userRole === UserRole.ADMIN;

  useEffect(() => {
    fetchMaintenanceData();
  }, [selectedProperty]);

  // ─── Export ───────────────────────────────────────────────────────────────
  // The page has no tabs, so the export is the per-property breakdown — the
  // table on screen — with the overall totals carried in the PDF subtitle.
  const exportRows = () =>
    (data?.propertyBreakdown ?? []).map((row) => ({
      Property: row.propertyName ?? "",
      Requests: String(row.totalRequests ?? 0),
      Completed: String(row.completedRequests ?? 0),
      Outstanding: String(
        Math.max(0, (row.totalRequests ?? 0) - (row.completedRequests ?? 0))
      ),
      "Total Cost": `£${row.totalCost ?? 0}`,
      "Avg Response (hrs)": (row.avgResponseTime ?? 0).toFixed(1),
    }));

  const exportColumns = [
    { key: "Property", label: "Property", width: 180 },
    { key: "Requests", label: "Requests", width: 85 },
    { key: "Completed", label: "Completed", width: 90 },
    { key: "Outstanding", label: "Outstanding", width: 95 },
    { key: "Total Cost", label: "Total Cost", width: 100 },
    { key: "Avg Response (hrs)", label: "Avg Response (hrs)", width: 120 },
  ];

  const exportSubtitle = () => {
    const o = data?.overview;
    return [
      selectedProperty === "all"
        ? "All properties"
        : availableProperties.find((p) => p.id === selectedProperty)?.name ??
        "Selected property",
      `${o?.totalRequests ?? 0} requests`,
      `${(o?.completionRate ?? 0).toFixed(1)}% completed`,
      `£${o?.totalCost ?? 0} total cost`,
      `generated ${new Date().toLocaleString("en-GB")}`,
    ].join(" · ");
  };

  const handleExportCsv = () => {
    const count = downloadCsv(
      exportRows(),
      exportFilename("maintenance-analytics", "csv")
    );
    if (count === 0) {
      toast.error("There is nothing to export.");
      return;
    }
    toast.success(`Exported ${count} property/properties to CSV.`);
  };

  const handleExportPdf = async () => {
    try {
      const count = await downloadPdf(exportRows(), exportColumns, {
        title: "Maintenance Analytics",
        filename: exportFilename("maintenance-analytics", "pdf"),
        subtitle: exportSubtitle(),
      });
      if (count === 0) {
        toast.error("There is nothing to export.");
        return;
      }
      toast.success(`Exported ${count} property/properties to PDF.`);
    } catch (error) {
      console.error("[maintenance analytics] PDF export failed:", error);
      toast.error("Failed to generate the PDF export.");
    }
  };

  const fetchMaintenanceData = async () => {
    try {
      setIsLoading(true);
      const response = await fetch(
        `/api/analytics/maintenance?property=${selectedProperty}`
      );

      if (!response.ok) {
        // Surface the status and server message rather than a bare string —
        // a 403 (role) and a 500 (server fault) need very different fixes.
        const detail = await response.text().catch(() => "");
        throw new Error(
          `Maintenance request failed: ${response.status} ${response.statusText} ${detail}`
        );
      }

      const result = await response.json();
      setData(result.analytics);
      setAvailableProperties(result.properties || []);
    } catch (error) {
      console.error("[maintenance analytics] load failed:", error);
      toast.error(t("analytics.toasts.maintenanceLoadError"), {
        description: error instanceof Error ? error.message : undefined,
      });
      setData({
        overview: {
          totalRequests: 0,
          pendingRequests: 0,
          inProgressRequests: 0,
          completedRequests: 0,
          totalCost: 0,
          avgCompletionTime: 0,
          completionRate: 0,
        },
        categoryBreakdown: [],
        statusDistribution: [],
        priorityDistribution: [],
        propertyBreakdown: [],
      });
    } finally {
      setIsLoading(false);
    }
  };

  const formatAmount = (value: number) => formatLocalizedCurrency(value);

  const formatDuration = (hours: number) => {
    if (hours < 24) {
      return `${hours.toFixed(1)}h`;
    }
    const days = Math.floor(hours / 24);
    const remainingHours = hours % 24;
    return `${days}d ${remainingHours.toFixed(1)}h`;
  };

  const getStatusColor = (status: string) => {
    switch (status.toLowerCase()) {
      case "completed":
        return "#10b981";
      case "in_progress":
        return "#3b82f6";
      case "assigned":
        return "#f59e0b";
      case "submitted":
        return "#ef4444";
      case "cancelled":
        return "#6b7280";
      default:
        return "#8b5cf6";
    }
  };

  const getPriorityColor = (priority: string) => {
    switch (priority.toLowerCase()) {
      case "emergency":
        return "#ef4444";
      case "high":
        return "#f59e0b";
      case "medium":
        return "#3b82f6";
      case "low":
        return "#10b981";
      default:
        return "#6b7280";
    }
  };

  if (isLoading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6 max-w-7xl">
      <div className="mb-8">
        <div className="flex items-center gap-3 mb-2">
          <Wrench className="h-8 w-8 text-primary" />
          <h1 className="text-3xl font-bold">
            {t("analytics.maintenance.page.title")}
          </h1>
        </div>
        <p className="text-muted-foreground">
          {t("analytics.maintenance.page.subtitle")}
        </p>
      </div>

      <Card className="mb-6">
        {/* <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Filter className="h-5 w-5" />
            {t("analytics.maintenance.filters.title")}
          </CardTitle>
        </CardHeader> */}
        <CardContent>
          <div className="flex gap-4 items-center justify-between">
            <div className="space-y-2">
              <label className="text-sm font-medium">
                {t("analytics.maintenance.filters.property")}
              </label>
              <Select
                value={selectedProperty}
                onValueChange={setSelectedProperty}
              >
                <SelectTrigger className="w-48">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">
                    {t("analytics.filters.property.all")}
                  </SelectItem>
                  {availableProperties.map((property) => (
                    <SelectItem key={property.id} value={property.id}>
                      {property.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-x-2">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="outline"
                    disabled={isLoading || !data?.propertyBreakdown?.length}
                    className="mt-6"
                  >
                    <Download className="h-4 w-4 mr-2" />
                    Export
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={handleExportCsv}>
                    Export as CSV
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={handleExportPdf}>
                    Export as PDF
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
              <Button
                variant="outline"
                onClick={fetchMaintenanceData}
                disabled={isLoading}
                className="mt-6"
              >
                <RefreshCw
                  className={`h-4 w-4 mr-2 ${isLoading ? "animate-spin" : ""}`}
                />
                {t("analytics.maintenance.filters.refresh")}
              </Button>
            </div>

          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              {t("analytics.maintenance.stats.totalRequests")}
            </CardTitle>
            <Wrench className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {data?.overview.totalRequests || 0}
            </div>
            <p className="text-xs text-muted-foreground">
              {t("analytics.maintenance.stats.pendingInProgress", {
                values: {
                  pending: data?.overview.pendingRequests || 0,
                  inProgress: data?.overview.inProgressRequests || 0,
                },
              })}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              {t("analytics.maintenance.stats.totalCost")}
            </CardTitle>
            <PoundSterling className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {formatAmount(data?.overview.totalCost || 0)}
            </div>
            <p className="text-xs text-muted-foreground">
              {t("analytics.maintenance.stats.avgCost", {
                values: {
                  amount: formatAmount(
                    data?.overview && data.overview.totalRequests > 0
                      ? (data.overview.totalCost || 0) /
                      data.overview.totalRequests
                      : 0
                  ),
                },
              })}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              {t("analytics.maintenance.stats.avgCompletionTime")}
            </CardTitle>
            <Clock className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {formatDuration(data?.overview.avgCompletionTime || 0)}
            </div>
            <p className="text-xs text-muted-foreground">
              {t("analytics.maintenance.stats.completedRequests", {
                values: { count: data?.overview.completedRequests || 0 },
              })}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              {t("analytics.maintenance.stats.completionRate")}
            </CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-primary">
              {data?.overview.completionRate || 0}%
            </div>
            <p className="text-xs text-muted-foreground">
              {t("analytics.maintenance.stats.currentRate")}
            </p>
          </CardContent>
        </Card>
      </div>

      {data?.categoryBreakdown && data.categoryBreakdown.length > 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
          <Card>
            <CardHeader>
              <CardTitle>
                {t("analytics.maintenance.byCategory.title")}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={data.categoryBreakdown}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis
                    dataKey="category"
                    angle={-45}
                    textAnchor="end"
                    height={80}
                    fontSize={12}
                  />
                  <YAxis />
                  <Tooltip />
                  <Bar dataKey="count" fill="var(--primary)" />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>
                {t("analytics.maintenance.statusDistribution.title")}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={300}>
                <PieChart>
                  <Pie
                    data={data.statusDistribution}
                    cx="50%"
                    cy="50%"
                    outerRadius={80}
                    dataKey="count"
                    label={({ status, percentage }) =>
                      `${status}: ${percentage}%`
                    }
                  >
                    {data.statusDistribution.map((entry, index) => (
                      <Cell
                        key={`cell-${index}`}
                        fill={getStatusColor(entry.status)}
                      />
                    ))}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </div>
      )}

      {data?.priorityDistribution && data.priorityDistribution.length > 0 && (
        <Card className="mb-6">
          <CardHeader>
            <CardTitle>
              {t("analytics.maintenance.priorityDistribution.title")}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie
                  data={data.priorityDistribution}
                  cx="50%"
                  cy="50%"
                  outerRadius={80}
                  dataKey="count"
                  label={({ priority, percentage }) =>
                    `${priority}: ${percentage}%`
                  }
                >
                  {data.priorityDistribution.map((entry, index) => (
                    <Cell
                      key={`cell-${index}`}
                      fill={getPriorityColor(entry.priority)}
                    />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>
            {t("analytics.maintenance.propertyBreakdown.title")}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {data?.propertyBreakdown && data.propertyBreakdown.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b">
                    <th className="text-left p-2">
                      {t("analytics.maintenance.table.propertyName")}
                    </th>
                    <th className="text-left p-2">
                      {t("analytics.maintenance.table.totalRequests")}
                    </th>
                    <th className="text-left p-2">
                      {t("analytics.maintenance.table.completed")}
                    </th>
                    <th className="text-left p-2">
                      {t("analytics.maintenance.table.totalCost")}
                    </th>
                    <th className="text-left p-2">
                      {t("analytics.maintenance.table.avgResponseTime")}
                    </th>
                    <th className="text-left p-2">
                      {t("analytics.maintenance.table.completionRate")}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {data.propertyBreakdown.map((property, index) => {
                    const completionRate =
                      property.totalRequests > 0
                        ? Math.round(
                          (property.completedRequests /
                            property.totalRequests) *
                          100
                        )
                        : 0;

                    return (
                      <tr key={index} className="border-b">
                        <td className="p-2 font-medium">
                          {property.propertyName}
                        </td>
                        <td className="p-2">{property.totalRequests}</td>
                        <td className="p-2 text-green-600">
                          {property.completedRequests}
                        </td>
                        <td className="p-2">
                          {formatAmount(property.totalCost)}
                        </td>
                        <td className="p-2">
                          {formatDuration(property.avgResponseTime)}
                        </td>
                        <td className="p-2">
                          <Badge
                            variant={
                              completionRate >= 80 ? "default" : "secondary"
                            }
                          >
                            {completionRate}%
                          </Badge>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="text-center py-8 text-muted-foreground">
              <Wrench className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>{t("analytics.maintenance.noData.title")}</p>
              <p className="text-sm">
                {t("analytics.maintenance.noData.description")}
              </p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
