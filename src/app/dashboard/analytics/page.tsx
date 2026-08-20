"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  AreaChart,
  Area,
} from "recharts";
import {
  TrendingUp,
  TrendingDown,
  PoundSterling,
  Home,
  Users,
  Wrench,
  Target,
  BarChart3,
  PieChart as PieChartIcon,
  Download,
  RefreshCw,
} from "lucide-react";
import {
  AnalyticsCard,
  AnalyticsCardGrid,
} from "@/components/analytics/AnalyticsCard";
import { formatPercentage } from "@/lib/formatters";
import { LoadingSpinner } from "@/components/ui/loading-state";
import { useLocalizationContext } from "@/components/providers/LocalizationProvider";

// ============================================================================
// Live analytics
// ============================================================================

/** Period selector -> a concrete start date. */
const PERIOD_MONTHS: Record<string, number> = {
  "1month": 1,
  "3months": 3,
  "6months": 6,
  "1year": 12,
  custom: 12,
};

interface AnalyticsView {
  overview: {
    portfolio: { totalProperties: number; totalUnits: number };
    occupancy: { rate: number; occupied: number; total: number; vacant: number };
    financial: {
      totalRevenue: number;
      pendingRevenue: number;
      totalPayments: number;
      completedPayments: number;
      collectionRate: number;
    };
    maintenance: Record<string, { count: number; cost: number }>;
  };
  monthlyTrends: Array<{
    month: string;
    revenue: number;
    occupancy: number;
    occupiedUnits: number;
    totalUnits: number;
    maintenance: number;
  }>;
  propertyPerformance: Array<{
    name: string;
    revenue: number;
    pending: number;
    collectionRate: number;
  }>;
  maintenanceBreakdown: Array<{ category: string; count: number; cost: number }>;
  revenueBreakdown: Array<{ type: string; amount: number; percentage: number }>;
  performance: {
    /** Net operating margin — see calculateNetMargin in the analytics route. */
    marginPct: number;
    marginRevenue: number;
    marginExpenses: number;
    marginNetIncome: number;
    /** No revenue means the margin is undefined, not zero. */
    hasRevenue: boolean;
    retentionRate: number;
    renewalRate: number;
    /** Denominator behind the rate — 0 means nothing ended, not 0% retention. */
    endedLeases: number;
    rentComparison: number;
  };
}

const NOT_CALCULATED = "Not calculated yet";

/**
 * The performance helpers on the server are unimplemented and return literal
 * zeros, so a 0 here is "no measurement", not "measured as zero". Rendering an
 * em dash rather than "0%" avoids stating a figure that was never computed.
 */
const performanceValue = (value: number, signed = false) => {
  if (!value) return "—";
  const rounded = Math.round(value * 10) / 10;
  return `${signed && rounded > 0 ? "+" : ""}${rounded}%`;
};

const titleCase = (value: string) =>
  value
    .split("_")
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");

const CHART_COLORS = ["#0088FE", "#00C49F", "#FFBB28", "#FF8042", "#8884D8"];

export default function AnalyticsPage() {
  const { t, formatCurrency } = useLocalizationContext();
  const [selectedPeriod, setSelectedPeriod] = useState("6months");
  const [selectedProperty, setSelectedProperty] = useState("all");
  const [activeTab, setActiveTab] = useState("overview");
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const formatAmount = (value: number) =>
    formatCurrency(value, undefined, {
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    });

  const [analytics, setAnalytics] = useState<AnalyticsView | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [properties, setProperties] = useState<
    Array<{ id: string; name: string }>
  >([]);

  // Real properties for the filter — it previously listed four invented ones
  // ("Sunset Apartments" and friends) that matched nothing in the database.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/properties?limit=100&sortBy=name");
        const result = await res.json();
        if (cancelled || !res.ok) return;
        const rows = Array.isArray(result?.data) ? result.data : [];
        setProperties(
          rows.map((p: any) => ({ id: p._id ?? p.id, name: p.name }))
        );
      } catch {
        // Non-fatal: the filter simply offers "All properties".
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const loadAnalytics = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    const end = new Date();
    const start = new Date();
    start.setMonth(start.getMonth() - (PERIOD_MONTHS[selectedPeriod] ?? 6));

    const params = (type: string) => {
      const q = new URLSearchParams({
        type,
        startDate: start.toISOString(),
        endDate: end.toISOString(),
      });
      if (selectedProperty !== "all") q.set("propertyId", selectedProperty);
      return `/api/analytics?${q}`;
    };

    try {
      // Three report types, because no single one carries every section:
      // overview has the KPIs, financial has revenue and per-property, and
      // maintenance has the monthly series and category split.
      const [overviewRes, financialRes, maintenanceRes, performanceRes] =
        await Promise.all([
          fetch(params("overview")),
          fetch(params("financial")),
          fetch(params("maintenance")),
          fetch(params("performance")),
        ]);

      const failed = [
        overviewRes,
        financialRes,
        maintenanceRes,
        performanceRes,
      ].find((r) => !r.ok);
      if (failed) {
        const detail = await failed.text().catch(() => "");
        throw new Error(
          `Analytics request failed: ${failed.status} ${failed.statusText} ${detail}`
        );
      }

      const [overview, financial, maintenance, performance] = await Promise.all(
        [
          overviewRes.json(),
          financialRes.json(),
          maintenanceRes.json(),
          performanceRes.json(),
        ]
      );

      // createSuccessResponse wraps everything in `data`.
      const o = overview?.data ?? {};
      const f = financial?.data ?? {};
      const m = maintenance?.data ?? {};
      const perf = performance?.data ?? {};

      // revenueAnalysis is grouped by {year, month, type} — still used for the
      // revenue-by-type pie. The monthly series now comes from the server.
      const revenueRows: any[] = Array.isArray(f.revenueAnalysis)
        ? f.revenueAnalysis
        : [];

      const revenueByType = new Map<string, number>();
      for (const row of revenueRows) {
        const type = titleCase(row?._id?.type ?? "other");
        revenueByType.set(type, (revenueByType.get(type) ?? 0) + (row.amount ?? 0));
      }

      // getMonthlyTrends now returns a complete series with revenue, occupancy
      // and maintenance aligned to the same month, so the client no longer
      // stitches one together from two separate reports.
      const months: AnalyticsView["monthlyTrends"] = (
        Array.isArray(o.monthlyTrends) ? o.monthlyTrends : []
      ).map((point: any) => ({
        month: point.month ?? "",
        revenue: point.revenue ?? 0,
        occupancy: point.occupancy ?? 0,
        occupiedUnits: point.occupiedUnits ?? 0,
        totalUnits: point.totalUnits ?? 0,
        maintenance: point.maintenance ?? 0,
      }));

      const revenueTotal = [...revenueByType.values()].reduce(
        (s, v) => s + v,
        0
      );

      setAnalytics({
        overview: {
          portfolio: {
            totalProperties: o?.portfolio?.totalProperties ?? 0,
            totalUnits: o?.portfolio?.totalUnits ?? 0,
          },
          occupancy: {
            rate: o?.occupancy?.rate ?? 0,
            occupied: o?.occupancy?.occupied ?? 0,
            total: o?.occupancy?.total ?? 0,
            vacant: o?.occupancy?.vacant ?? 0,
          },
          financial: {
            totalRevenue: o?.financial?.totalRevenue ?? 0,
            pendingRevenue: o?.financial?.pendingRevenue ?? 0,
            totalPayments: o?.financial?.totalPayments ?? 0,
            completedPayments: o?.financial?.completedPayments ?? 0,
            collectionRate: o?.financial?.collectionRate ?? 0,
          },
          maintenance: o?.maintenance ?? {},
        },
        monthlyTrends: months,
        propertyPerformance: (f?.propertyPerformance ?? []).map((row: any) => ({
          name: row.propertyName ?? "Unknown",
          revenue: row.totalRevenue ?? 0,
          pending: row.pendingRevenue ?? 0,
          // The aggregation averages 1/0 per payment, so it is a fraction.
          collectionRate: Math.round((row.collectionRate ?? 0) * 100),
        })),
        maintenanceBreakdown: (m?.trends?.categories ?? []).map((row: any) => ({
          category: titleCase(row.category ?? "Other"),
          count: row.count ?? row.requests ?? 0,
          cost: row.cost ?? 0,
        })),
        revenueBreakdown: [...revenueByType.entries()]
          .map(([type, amount]) => ({
            type,
            amount,
            percentage: revenueTotal > 0 ? (amount / revenueTotal) * 100 : 0,
          }))
          .sort((a, b) => b.amount - a.amount),
        performance: {
          marginPct: perf?.netMargin?.marginPct ?? 0,
          marginRevenue: perf?.netMargin?.revenue ?? 0,
          marginExpenses: perf?.netMargin?.expenses ?? 0,
          marginNetIncome: perf?.netMargin?.netIncome ?? 0,
          hasRevenue: Boolean(perf?.netMargin?.hasRevenue),
          retentionRate: perf?.tenantMetrics?.retentionRate ?? 0,
          renewalRate: perf?.tenantMetrics?.renewalRate ?? 0,
          endedLeases: perf?.tenantMetrics?.endedLeases ?? 0,
          rentComparison: perf?.marketComparison?.rentComparison ?? 0,
        },
      });
    } catch (err) {
      console.error("[analytics] load failed:", err);
      setError(err instanceof Error ? err.message : "Failed to load analytics");
      setAnalytics(null);
    } finally {
      setIsLoading(false);
    }
  }, [selectedPeriod, selectedProperty]);

  useEffect(() => {
    loadAnalytics();
  }, [loadAnalytics]);

  const maintenanceStats = useMemo(
    () => Object.values(analytics?.overview.maintenance ?? {}),
    [analytics]
  );

  /**
   * Trend arrows compare the last two months of real data. There used to be a
   * hardcoded `previousData` baseline (revenue 398000, occupancy 92.1 …) that
   * produced confident percentages from invented numbers. Occupancy and
   * collection rate have no historical series in the API, so they get no arrow
   * rather than a fabricated one.
   */
  const revenueChange = useMemo(() => {
    const series = analytics?.monthlyTrends ?? [];
    if (series.length < 2) return null;
    const latest = series[series.length - 1].revenue;
    const previous = series[series.length - 2].revenue;
    if (previous === 0) return null;
    const change = ((latest - previous) / previous) * 100;
    return { value: Math.abs(change).toFixed(1), isPositive: change >= 0 };
  }, [analytics]);

  const maintenanceChange = useMemo(() => {
    const series = analytics?.monthlyTrends ?? [];
    if (series.length < 2) return null;
    const latest = series[series.length - 1].maintenance;
    const previous = series[series.length - 2].maintenance;
    if (previous === 0) return null;
    const change = ((latest - previous) / previous) * 100;
    return { value: Math.abs(change).toFixed(1), isPositive: change >= 0 };
  }, [analytics]);

  // Export function (brought over from the dashboard page).
  const handleExport = useCallback(async () => {
    try {
      setIsRefreshing(true);

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 60000); // 60s timeout for export

      const response = await fetch("/api/dashboard/export", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({
          format: "json",
          includeDetails: false,
          dateRange: {
            start: new Date(new Date().getFullYear(), 0, 1).toISOString(),
            end: new Date().toISOString(),
          },
        }),
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorText = await response.text().catch(() => "Unknown error");
        throw new Error(`Export failed: ${response.status} ${errorText}`);
      }

      const result = await response.json();

      if (!result.data) {
        throw new Error("Invalid export data received");
      }

      const blob = new Blob([JSON.stringify(result.data, null, 2)], {
        type: "application/json",
      });

      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `dashboard-export-${new Date().toISOString().split("T")[0]
        }.json`;

      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (error) {
      // Ignore errors from aborted requests
      if (error instanceof Error && error.name === "AbortError") {
        return;
      }

      setError(error instanceof Error ? error.message : "Export failed");
    } finally {
      setIsRefreshing(false);
    }
  }, []);

  // Re-runs the three analytics fetches.
  const handleRefresh = useCallback(async () => {
    setIsRefreshing(true);
    await loadAnalytics();
    setIsRefreshing(false);
  }, [loadAnalytics]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">
            {t("analytics.header.title")}
          </h1>
          <p className="text-muted-foreground">
            {t("analytics.header.subtitle")}
          </p>
        </div>
        <div className="flex items-center space-x-2">
          <Select value={selectedPeriod} onValueChange={setSelectedPeriod}>
            <SelectTrigger className="w-[140px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="1month">
                {t("analytics.filters.period.lastMonth")}
              </SelectItem>
              <SelectItem value="3months">
                {t("analytics.filters.period.last3Months")}
              </SelectItem>
              <SelectItem value="6months">
                {t("analytics.filters.period.last6Months")}
              </SelectItem>
              <SelectItem value="1year">
                {t("analytics.filters.period.lastYear")}
              </SelectItem>
              <SelectItem value="custom">
                {t("analytics.filters.period.custom")}
              </SelectItem>
            </SelectContent>
          </Select>
          <Select value={selectedProperty} onValueChange={setSelectedProperty}>
            <SelectTrigger className="w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">
                {t("analytics.filters.property.all")}
              </SelectItem>
              {properties.map((property) => (
                <SelectItem key={property.id} value={property.id}>
                  {property.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            variant="outline"
            size="sm"
            onClick={handleRefresh}
            disabled={isRefreshing}
          >
            <RefreshCw
              className={`h-4 w-4 mr-2 ${isRefreshing ? "animate-spin" : ""}`}
            />
            {t("analytics.header.refresh")}
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={handleExport}
            disabled={isRefreshing}
          >
            <Download className="h-4 w-4 mr-2" />
            {t("analytics.header.export")}
          </Button>
        </div>
      </div>

      {error && <p className="text-sm text-error">{error}</p>}

      {isLoading ? (
        <div className="flex justify-center items-center py-16">
          <LoadingSpinner message="" size="lg" />
        </div>
      ) : !analytics ? (
        <div className="py-16 text-center">
          <BarChart3 className="text-muted-foreground mx-auto mb-4 h-12 w-12" />
          <h3 className="mb-1 text-lg font-medium">
            {t("analytics.header.title")} unavailable
          </h3>
          <p className="text-muted-foreground">
            {error ?? "No analytics could be loaded for this period."}
          </p>
        </div>
      ) : (
        <>
      <AnalyticsCardGrid className="lg:grid-cols-4!">
        <AnalyticsCard
          title={t("analytics.cards.totalRevenue")}
          value={formatAmount(analytics.overview.financial.totalRevenue)}
          icon={PoundSterling}
          iconColor="success"
          // Only shown when there are two months to compare. It used to be
          // computed against a hardcoded baseline, so it always showed a
          // confident percentage derived from invented numbers.
          trend={
            revenueChange
              ? {
                  value: t("analytics.cards.fromLastPeriod", {
                    values: { value: revenueChange.value },
                  }),
                  isPositive: revenueChange.isPositive,
                  icon: revenueChange.isPositive ? TrendingUp : TrendingDown,
                }
              : undefined
          }
        />

        <AnalyticsCard
          title={t("analytics.cards.occupancyRate")}
          value={formatPercentage(analytics.overview.occupancy.rate)}
          description={t("analytics.cards.units", {
            values: {
              occupied: analytics.overview.occupancy.occupied,
              total: analytics.overview.occupancy.total,
            },
          })}
          icon={Home}
          iconColor="primary"
          // No occupancy history in the API (getMonthlyTrends is a stub), so
          // there is nothing honest to compare against.
        />

        <AnalyticsCard
          title={t("analytics.cards.collectionRate")}
          value={formatPercentage(
            analytics.overview.financial.collectionRate
          )}
          description={t("analytics.cards.payments", {
            values: {
              completed: analytics.overview.financial.completedPayments,
              total: analytics.overview.financial.totalPayments,
            },
          })}
          icon={Target}
          iconColor="info"
          // No collection-rate history in the API either.
        />

        <AnalyticsCard
          title={t("analytics.cards.maintenanceCost")}
          value={formatAmount(
            maintenanceStats.reduce((sum, item) => sum + item.cost, 0)
          )}
          description={t("analytics.cards.requests", {
            values: {
              count: maintenanceStats.reduce(
                (sum, item) => sum + item.count,
                0
              ),
            },
          })}
          icon={Wrench}
          iconColor="warning"
          trend={
            maintenanceChange
              ? {
                  value: `${maintenanceChange.value}%`,
                  // Lower maintenance cost is the good direction.
                  isPositive: !maintenanceChange.isPositive,
                  icon: !maintenanceChange.isPositive
                    ? TrendingDown
                    : TrendingUp,
                }
              : undefined
          }
        />
      </AnalyticsCardGrid>

      <Tabs
        value={activeTab}
        onValueChange={setActiveTab}
        className="space-y-4"
      >
        <TabsList>
          <TabsTrigger value="overview">
            {t("analytics.tabs.overview")}
          </TabsTrigger>
          <TabsTrigger value="financial">
            {t("analytics.tabs.financial")}
          </TabsTrigger>
          <TabsTrigger value="occupancy">
            {t("analytics.tabs.occupancy")}
          </TabsTrigger>
          <TabsTrigger value="maintenance">
            {t("analytics.tabs.maintenance")}
          </TabsTrigger>
          <TabsTrigger value="performance">
            {t("analytics.tabs.performance")}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <Card className="hover:shadow-md transition-shadow">
              <CardHeader>
                <CardTitle className="flex items-center gap-3 text-lg">
                  <div className="p-2 rounded-lg bg-primary/10">
                    <BarChart3 className="h-5 w-5 text-primary" />
                  </div>
                  {t("analytics.overview.monthlyTrends.title")}
                </CardTitle>
                <CardDescription>
                  {t("analytics.overview.monthlyTrends.description")}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <LineChart data={analytics.monthlyTrends}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="month" />
                    <YAxis yAxisId="left" />
                    <YAxis yAxisId="right" orientation="right" domain={[0, 100]} />
                    <Tooltip />
                    <Legend />
                    <Line
                      yAxisId="left"
                      type="monotone"
                      dataKey="revenue"
                      stroke="#8884d8"
                      name={t("analytics.charts.revenue")}
                    />
                    {/* Occupancy is real now that getMonthlyTrends is
                        implemented. It shares the right axis as a percentage,
                        so the domain is pinned rather than auto-scaled against
                        revenue. */}
                    <Line
                      yAxisId="right"
                      type="monotone"
                      dataKey="occupancy"
                      stroke="#82ca9d"
                      name={t("analytics.charts.occupancyRate")}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            <Card className="hover:shadow-md transition-shadow">
              <CardHeader>
                <CardTitle className="flex items-center gap-3 text-lg">
                  <div className="p-2 rounded-lg bg-success/10">
                    <PieChartIcon className="h-5 w-5 text-success" />
                  </div>
                  {t("analytics.overview.revenueBreakdown.title")}
                </CardTitle>
                <CardDescription>
                  {t("analytics.overview.revenueBreakdown.description")}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <PieChart>
                    <Pie
                      data={analytics.revenueBreakdown}
                      cx="50%"
                      cy="50%"
                      labelLine={false}
                      // Real percentages carry decimals — the sample data used
                      // clean numbers, so this rounds rather than rendering
                      // "Rent 89.43821%".
                      label={({ name, percentage }: any) =>
                        `${name} ${Math.round(Number(percentage) || 0)}%`
                      }
                      outerRadius={80}
                      fill="#8884d8"
                      dataKey="amount"
                    >
                      {analytics.revenueBreakdown.map((_, index) => (
                        <Cell
                          key={`cell-${index}`}
                          fill={CHART_COLORS[index % CHART_COLORS.length]}
                        />
                      ))}
                    </Pie>
                    <Tooltip
                      formatter={(value) => formatAmount(value as number)}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>
                {t("analytics.overview.propertyPerformance.title")}
              </CardTitle>
              <CardDescription>
                {t("analytics.overview.propertyPerformance.description")}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={400}>
                <BarChart data={analytics.propertyPerformance}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="name" />
                  <YAxis yAxisId="left" />
                  <YAxis yAxisId="right" orientation="right" />
                  <Tooltip />
                  <Legend />
                  <Bar
                    yAxisId="left"
                    dataKey="revenue"
                    fill="#8884d8"
                    name={t("analytics.charts.revenue")}
                  />
                  {/* Was dataKey="occupancy", which the API does not return
                      per property — the bar rendered nothing. The financial
                      report gives a collection rate instead. */}
                  <Bar
                    yAxisId="right"
                    dataKey="collectionRate"
                    fill="#82ca9d"
                    name={t("analytics.cards.collectionRate")}
                  />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="financial" className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <Card className="hover:shadow-md transition-shadow">
              <CardHeader>
                <CardTitle className="flex items-center gap-3 text-lg">
                  <div className="p-2 rounded-lg bg-success/10">
                    <PoundSterling className="h-5 w-5 text-success" />
                  </div>
                  {t("analytics.financial.cashFlow.title")}
                </CardTitle>
                <CardDescription>
                  {t("analytics.financial.cashFlow.description")}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <AreaChart data={analytics.monthlyTrends}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="month" />
                    <YAxis />
                    <Tooltip />
                    <Area
                      type="monotone"
                      dataKey="revenue"
                      stackId="1"
                      stroke="#8884d8"
                      fill="#8884d8"
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            <Card className="hover:shadow-md transition-shadow">
              <CardHeader>
                <CardTitle className="flex items-center gap-3 text-lg">
                  <div className="p-2 rounded-lg bg-info/10">
                    <Target className="h-5 w-5 text-info" />
                  </div>
                  {t("analytics.financial.collection.title")}
                </CardTitle>
                <CardDescription>
                  {t("analytics.financial.collection.description")}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium">
                      {t("analytics.financial.collection.onTime")}
                    </span>
                    <span className="text-sm text-muted-foreground">85%</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium">
                      {t("analytics.financial.collection.late")}
                    </span>
                    <span className="text-sm text-muted-foreground">12%</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium">
                      {t("analytics.financial.collection.outstanding")}
                    </span>
                    <span className="text-sm text-muted-foreground">3%</span>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          <div className="flex justify-center pt-4">
            <Link href="/dashboard/analytics/financial">
              <Button variant="outline" className="gap-2">
                <BarChart3 className="h-4 w-4" />
                {t("analytics.financial.viewDetailed")}
              </Button>
            </Link>
          </div>
        </TabsContent>

        <TabsContent value="occupancy" className="space-y-4">
          <Card className="hover:shadow-md transition-shadow">
            <CardHeader>
              <CardTitle className="flex items-center gap-3 text-lg">
                <div className="p-2 rounded-lg bg-primary/10">
                  <Home className="h-5 w-5 text-primary" />
                </div>
                {t("analytics.occupancy.trends.title")}
              </CardTitle>
              <CardDescription>
                {t("analytics.occupancy.trends.description")}
              </CardDescription>
            </CardHeader>
            <CardContent>
              {/* Real occupancy history now that getMonthlyTrends is
                  implemented — derived from lease date ranges, so months before
                  a lease expired still show it as occupied. Fixed 0–100 domain
                  keeps the line comparable across periods. */}
              <ResponsiveContainer width="100%" height={400}>
                <LineChart data={analytics.monthlyTrends}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="month" />
                  <YAxis domain={[0, 100]} />
                  <Tooltip
                    formatter={(value: any, _name: any, item: any) => [
                      `${value}% (${item?.payload?.occupiedUnits ?? 0} of ${item?.payload?.totalUnits ?? 0} units)`,
                      t("analytics.charts.occupancyRate"),
                    ]}
                  />
                  <Legend />
                  <Line
                    type="monotone"
                    dataKey="occupancy"
                    stroke="#8884d8"
                    name={t("analytics.charts.occupancyRate")}
                  />
                </LineChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="maintenance" className="space-y-4">
          <Card className="hover:shadow-md transition-shadow">
            <CardHeader>
              <CardTitle className="flex items-center gap-3 text-lg">
                <div className="p-2 rounded-lg bg-warning/10">
                  <Wrench className="h-5 w-5 text-warning" />
                </div>
                {t("analytics.maintenance.analysis.title")}
              </CardTitle>
              <CardDescription>
                {t("analytics.maintenance.analysis.description")}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={400}>
                <BarChart data={analytics.maintenanceBreakdown}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="category" />
                  <YAxis />
                  <Tooltip />
                  <Legend />
                  <Bar
                    dataKey="cost"
                    fill="#8884d8"
                    name={t("analytics.charts.cost")}
                  />
                  <Bar
                    dataKey="count"
                    fill="#82ca9d"
                    name={t("analytics.charts.count")}
                  />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="performance" className="space-y-4">
          <div className="grid gap-4 md:grid-cols-3">
            {/* Net operating margin, not ROI — the Property model carries no
                purchase price or asset value, so a return on investment cannot
                be derived. Margin measures what the data does support. */}
            <AnalyticsCard
              title={t("analytics.performance.margin.title")}
              value={
                analytics.performance.hasRevenue
                  ? `${analytics.performance.marginPct}%`
                  : "—"
              }
              description={
                analytics.performance.hasRevenue
                  ? `${formatAmount(analytics.performance.marginNetIncome)} net · ${formatAmount(analytics.performance.marginRevenue)} in, ${formatAmount(analytics.performance.marginExpenses)} costs`
                  : "No revenue collected in this period"
              }
              icon={TrendingUp}
              iconColor={
                analytics.performance.marginPct < 0 ? "error" : "success"
              }
            />

            {/* Retention IS computed server-side now, so 0% is a real result
                rather than an unimplemented one — but only when something
                actually ended. With no ended leases there is no denominator. */}
            <AnalyticsCard
              title={t("analytics.performance.retention.title")}
              value={
                analytics.performance.endedLeases === 0
                  ? "—"
                  : `${analytics.performance.retentionRate}%`
              }
              description={
                analytics.performance.endedLeases === 0
                  ? "No leases ended in this period"
                  : `${analytics.performance.renewalRate}% renewed the same unit · ${analytics.performance.endedLeases} lease${
                      analytics.performance.endedLeases === 1 ? "" : "s"
                    } ended`
              }
              icon={Users}
              iconColor="info"
            />

            <AnalyticsCard
              title={t("analytics.performance.market.title")}
              // Signed, because "+5%" and "-5%" against market mean opposite
              // things — an unsigned number here would be ambiguous.
              value={performanceValue(
                analytics.performance.rentComparison,
                true
              )}
              description={
                analytics.performance.rentComparison === 0
                  ? NOT_CALCULATED
                  : t("analytics.performance.market.description")
              }
              icon={Target}
              iconColor="primary"
            />
          </div>

          {/* Per-property collection rate, mirroring the by-property bar chart
              on the occupancy page: rotated labels, a fixed 0–100 domain so
              bars stay comparable between properties and across reloads, and
              the same primary fill. Collection rate is the per-property
              percentage this report actually carries — occupancy per property
              is not returned by the API. */}
          <Card>
            <CardHeader>
              <CardTitle>Collection rate by property</CardTitle>
              <CardDescription>
                Share of billed payments collected, per property
              </CardDescription>
            </CardHeader>
            <CardContent>
              {analytics.propertyPerformance.length === 0 ? (
                <div className="flex h-[300px] flex-col items-center justify-center text-center">
                  <BarChart3 className="text-muted-foreground mb-3 h-10 w-10" />
                  <p className="text-muted-foreground text-sm">
                    No payments were billed against any property in this period.
                  </p>
                </div>
              ) : (
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={analytics.propertyPerformance}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis
                      dataKey="name"
                      angle={-45}
                      textAnchor="end"
                      height={80}
                      fontSize={12}
                    />
                    <YAxis domain={[0, 100]} />
                    <Tooltip
                      formatter={(value: any) => [`${value}%`, "Collected"]}
                    />
                    <Bar dataKey="collectionRate" fill="var(--primary)" />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>

          {/* Said plainly rather than implied by three dashes. The API route
              exists and is wired; its calculateROI / getTenantSatisfactionMetrics
              / getMarketComparison helpers still return hardcoded zeros. */}
          {!analytics.performance.hasRevenue &&
            analytics.performance.endedLeases === 0 &&
            analytics.performance.rentComparison === 0 && (
              <Card>
                <CardContent className="flex items-start gap-3 pt-6">
                  <BarChart3 className="text-muted-foreground mt-0.5 h-5 w-5 shrink-0" />
                  <div className="space-y-1 text-sm">
                    <p className="font-medium">
                      These metrics are not calculated yet
                    </p>
                    <p className="text-muted-foreground">
                      Net margin and retention are both computed from your data,
                      but this period has no collected revenue and no leases
                      that ended, so neither has anything to measure. Market
                      comparison remains unimplemented — the app has no source
                      for market rates.
                    </p>
                  </div>
                </CardContent>
              </Card>
            )}
        </TabsContent>
      </Tabs>
        </>
      )}
    </div>
  );
}