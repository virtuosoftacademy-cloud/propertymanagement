"use client";

import { toast } from "sonner";
import { useSession } from "next-auth/react";
import { Button } from "@/components/ui/button";
import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import {
  ArrowLeft,
  TrendingUp,
  DollarSign,
  BarChart3,
  RefreshCw,
  Calendar,
  Target,
  AlertCircle,
  Building2,
} from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  RevenueTrendsChart,
  ExpenseBreakdownChart,
  CashFlowChart,
  PropertyPerformanceChart,
  ProfitLossChart,
} from "@/components/analytics/financial-charts";
import { CheckCircle } from "lucide-react";
import {
  AnalyticsReportResponse,
  ProfitLossReportResponse,
  CashFlowReportResponse,
  PropertyPerformanceReportResponse,
  ExpenseAnalysisReportResponse,
  FinancialAction,
  FinancialActionInput,
  FinancialActionStatus,
  FinancialActionReportType,
} from "@/types/financial-analytics";
import {
  formatCurrency as formatCurrencyValue,
  formatPercentage as formatPercentageValue,
} from "@/lib/formatters";
import { useLocalizationContext } from "@/components/providers/LocalizationProvider";
import { useRealTimePayments } from "@/hooks/useRealTimePayments";

// Helpers

const getStartDate = (range: string): Date => {
  const now = new Date();
  switch (range) {
    case "last-30-days":
      return new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    case "last-90-days":
      return new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
    case "last-6-months":
      return new Date(now.getFullYear(), now.getMonth() - 6, 1);
    case "last-12-months":
      return new Date(now.getFullYear() - 1, now.getMonth(), 1);
    case "year-to-date":
      return new Date(now.getFullYear(), 0, 1);
    default:
      return new Date(now.getFullYear() - 1, now.getMonth(), 1);
  }
};

const formatCurrency = (amount?: number | null) =>
  formatCurrencyValue(amount ?? 0);

const formatPercentage = (value?: number | null) =>
  formatPercentageValue(value ?? 0);

const REPORT_TYPE_MAP: Record<string, FinancialActionReportType> = {
  overview: "analytics",
  "profit-loss": "profit-loss",
  "cash-flow": "cash-flow",
  properties: "property-performance",
  expenses: "expense-analysis",
};

// Component

export default function FinancialAnalyticsPage() {
  const { data: session } = useSession();
  const { t } = useLocalizationContext();
  const [isLoading, setIsLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("overview");
  const [dateRange, setDateRange] = useState("last-12-months");
  const [selectedProperty, setSelectedProperty] = useState<string>("all");
  const [loadError, setLoadError] = useState<string | null>(null);
  const [propertyOptions, setPropertyOptions] = useState<
    Array<{ id: string; name: string }>
  >([]);
  const [propertiesLoading, setPropertiesLoading] = useState(false);
  const [lastLoadedAt, setLastLoadedAt] = useState<Date | null>(null);
  const dataLoadedRef = useRef(false);
  const [financialActions, setFinancialActions] = useState<FinancialAction[]>(
    []
  );
  const [actionsLoading, setActionsLoading] = useState(true);
  const [actionsError, setActionsError] = useState<string | null>(null);

  // Data states
  const [analyticsData, setAnalyticsData] =
    useState<AnalyticsReportResponse | null>(null);
  const [profitLossData, setProfitLossData] =
    useState<ProfitLossReportResponse | null>(null);
  const [cashFlowData, setCashFlowData] =
    useState<CashFlowReportResponse | null>(null);
  const [propertyPerformanceData, setPropertyPerformanceData] =
    useState<PropertyPerformanceReportResponse | null>(null);
  const [expenseAnalysisData, setExpenseAnalysisData] =
    useState<ExpenseAnalysisReportResponse | null>(null);

  const currentDateRange = useMemo(() => {
    return {
      start: getStartDate(dateRange),
      end: new Date(),
    };
  }, [dateRange]);

  const lastUpdatedLabel = useMemo(() => {
    if (!lastLoadedAt) return null;
    return lastLoadedAt.toLocaleString(undefined, {
      hour: "numeric",
      minute: "2-digit",
      month: "short",
      day: "numeric",
    });
  }, [lastLoadedAt]);

  const selectedPropertyLabel = useMemo(() => {
    if (selectedProperty === "all") {
      return t("analytics.financial.property.all");
    }

    const match = propertyOptions.find(
      (option) => option.id === selectedProperty
    );
    return match?.name || t("analytics.financial.property.unavailable");
  }, [propertyOptions, selectedProperty, t]);

  const currentReportType = useMemo(
    () => REPORT_TYPE_MAP[activeTab] ?? "analytics",
    [activeTab]
  );

  const fetchFinancialReport = useCallback(
    async <T,>(reportType: string, start: Date, end: Date): Promise<T> => {
      const params = new URLSearchParams({
        type: reportType,
        startDate: start.toISOString(),
        endDate: end.toISOString(),
      });

      if (selectedProperty !== "all") {
        params.set("propertyId", selectedProperty);
      }

      const response = await fetch(
        `/api/reports/financial?${params.toString()}`,
        {
          cache: "no-store",
        }
      );
      const result = await response.json();

      if (!response.ok) {
        throw new Error(
          result.message || `Failed to fetch ${reportType} report`
        );
      }

      return result.data as T;
    },
    [selectedProperty]
  );

  const loadAllReports = useCallback(async () => {
    setIsLoading(true);
    setLoadError(null);

    const start = getStartDate(dateRange);
    const end = new Date();

    const [
      analyticsResult,
      profitLossResult,
      cashFlowResult,
      propertyPerformanceResult,
      expenseAnalysisResult,
    ] = await Promise.allSettled([
      fetchFinancialReport<AnalyticsReportResponse>("analytics", start, end),
      fetchFinancialReport<ProfitLossReportResponse>("profit-loss", start, end),
      fetchFinancialReport<CashFlowReportResponse>("cash-flow", start, end),
      fetchFinancialReport<PropertyPerformanceReportResponse>(
        "property-performance",
        start,
        end
      ),
      fetchFinancialReport<ExpenseAnalysisReportResponse>(
        "expense-analysis",
        start,
        end
      ),
    ]);

    let failedReports = 0;

    if (analyticsResult.status === "fulfilled") {
      setAnalyticsData(analyticsResult.value);
    } else {
      failedReports += 1;
      if (!dataLoadedRef.current) {
        setAnalyticsData(null);
      }
    }

    if (profitLossResult.status === "fulfilled") {
      setProfitLossData(profitLossResult.value);
    } else {
      failedReports += 1;
      if (!dataLoadedRef.current) {
        setProfitLossData(null);
      }
    }

    if (cashFlowResult.status === "fulfilled") {
      setCashFlowData(cashFlowResult.value);
    } else {
      failedReports += 1;
      if (!dataLoadedRef.current) {
        setCashFlowData(null);
      }
    }

    if (propertyPerformanceResult.status === "fulfilled") {
      setPropertyPerformanceData(propertyPerformanceResult.value);
    } else {
      failedReports += 1;
      if (!dataLoadedRef.current) {
        setPropertyPerformanceData(null);
      }
    }

    if (expenseAnalysisResult.status === "fulfilled") {
      setExpenseAnalysisData(expenseAnalysisResult.value);
    } else {
      failedReports += 1;
      if (!dataLoadedRef.current) {
        setExpenseAnalysisData(null);
      }
    }

    if (failedReports === 5) {
      setLoadError(t("analytics.toasts.loadError"));
      toast.error(t("analytics.toasts.loadError"));
    } else if (failedReports > 0) {
      setLoadError(t("analytics.toasts.partialLoad"));
      toast.warning(t("analytics.toasts.partialLoad"));
    } else {
      setLoadError(null);
    }

    dataLoadedRef.current = true;
    setLastLoadedAt(new Date());
    setIsLoading(false);
  }, [dateRange, fetchFinancialReport]);

  const fetchPropertyOptions = useCallback(async () => {
    try {
      setPropertiesLoading(true);
      const response = await fetch(
        "/api/properties?limit=100&sortBy=name&sortOrder=asc",
        { cache: "no-store" }
      );
      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.message || "Failed to load properties");
      }

      type ApiProperty = {
        _id?: string;
        id?: string;
        name?: string;
      };

      const rawProperties: ApiProperty[] = Array.isArray(result.data)
        ? (result.data as ApiProperty[])
        : [];

      const options = rawProperties
        .map((property) => ({
          id: property._id ?? property.id ?? "",
          name: property.name || "Untitled Property",
        }))
        .filter((property) => property.id !== "");

      setPropertyOptions(options);

      setSelectedProperty((current) => {
        if (
          current !== "all" &&
          !options.some((option) => option.id === current)
        ) {
          return "all";
        }
        return current;
      });
    } catch (error) {
      toast.warning(t("analytics.toasts.propertiesError"));
    } finally {
      setPropertiesLoading(false);
    }
  }, [t]);

  const loadFinancialActions = useCallback(async () => {
    if (!session) return;

    try {
      setActionsLoading(true);
      setActionsError(null);

      const params = new URLSearchParams({
        limit: "50",
        reportType: currentReportType,
      });

      if (selectedProperty !== "all") {
        params.set("propertyId", selectedProperty);
      }

      const response = await fetch(
        `/api/analytics/financial/actions?${params.toString()}`,
        { cache: "no-store" }
      );
      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.message || "Failed to load financial actions");
      }

      const actionData = Array.isArray(result.data)
        ? (result.data as FinancialAction[])
        : [];

      setFinancialActions(actionData);
    } catch (error) {
      setActionsError("Unable to load financial action items");
    } finally {
      setActionsLoading(false);
    }
  }, [currentReportType, selectedProperty, session]);

  const createFinancialAction = useCallback(
    async (payload: FinancialActionInput): Promise<boolean> => {
      try {
        const body = { ...payload };

        if (!body.reportType) {
          body.reportType = currentReportType;
        }

        const derivedPropertyId =
          body.propertyId && body.propertyId !== "all"
            ? body.propertyId
            : selectedProperty !== "all"
            ? selectedProperty
            : undefined;

        const response = await fetch("/api/analytics/financial/actions", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            ...body,
            propertyId: derivedPropertyId,
          }),
        });

        const result = await response.json();
        if (!response.ok) {
          throw new Error(result.message || "Failed to create action");
        }

        const created = result.data as FinancialAction;
        setFinancialActions((prev) => [created, ...prev]);
        toast.success(t("analytics.toasts.actionCreated"));
        return true;
      } catch (error) {
        toast.error(t("analytics.toasts.actionCreateError"));
        return false;
      }
    },
    [currentReportType, selectedProperty, t]
  );

  const updateFinancialAction = useCallback(
    async (
      id: string,
      updates: Partial<FinancialActionInput> & {
        status?: FinancialActionStatus;
      }
    ): Promise<boolean> => {
      try {
        const response = await fetch(`/api/analytics/financial/actions/${id}`, {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(updates),
        });

        const result = await response.json();
        if (!response.ok) {
          throw new Error(result.message || "Failed to update action");
        }

        const updated = result.data as FinancialAction;
        setFinancialActions((prev) =>
          prev.map((action) => (action._id === id ? updated : action))
        );
        toast.success(t("analytics.toasts.actionUpdated"));
        return true;
      } catch (error) {
        toast.error(t("analytics.toasts.actionUpdateError"));
        return false;
      }
    },
    [t]
  );

  // const deleteFinancialAction = useCallback(
  //   async (id: string): Promise<boolean> => {
  //     try {
  //       const response = await fetch(`/api/analytics/financial/actions/${id}`, {
  //         method: "DELETE",
  //       });
  //       const result = await response.json();
  //       if (!response.ok) {
  //         throw new Error(result.message || "Failed to delete action");
  //       }

  //       setFinancialActions((prev) =>
  //         prev.filter((action) => action._id !== id)
  //       );
  //       toast.success("Action item removed");
  //       return true;
  //     } catch (error) {
  //       toast.error("Unable to remove action item");
  //       return false;
  //     }
  //   },
  //   []
  // );

  const { lastUpdate } = useRealTimePayments({
    propertyId: selectedProperty !== "all" ? selectedProperty : undefined,
    enabled: true,
  });
  const lastUpdateProcessedRef = useRef<string | null>(null);

  useEffect(() => {
    if (!session) return;
    fetchPropertyOptions();
  }, [session, fetchPropertyOptions]);

  useEffect(() => {
    if (!session) return;
    loadAllReports();
  }, [session, loadAllReports]);

  useEffect(() => {
    if (!session) return;
    loadFinancialActions();
  }, [session, loadFinancialActions]);

  useEffect(() => {
    if (!session) return;
    if (!lastUpdate) return;
    if (!lastUpdate.type.startsWith("payment_")) return;
    if (isLoading) return;

    const id = `${lastUpdate.type}-${lastUpdate.timestamp}`;
    if (lastUpdateProcessedRef.current === id) return;
    lastUpdateProcessedRef.current = id;

    loadAllReports();
    loadFinancialActions();
  }, [session, lastUpdate, loadAllReports, loadFinancialActions]);

  if (!session) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6">
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="space-y-1">
            <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
              <BarChart3 className="h-8 w-8" />
              {t("analytics.financial.page.title")}
            </h1>
            <p className="text-muted-foreground">
              {t("analytics.financial.page.subtitle", {
                values: { property: selectedPropertyLabel },
              })}
            </p>
          </div>

          <div className="flex flex-wrap items-center justify-end gap-2">
            <Select value={dateRange} onValueChange={setDateRange}>
              <SelectTrigger className="relative w-[180px] pl-9">
                <Calendar className="absolute left-3 h-4 w-4 text-muted-foreground" />
                <SelectValue placeholder={t("analytics.filters.selectRange")} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="last-30-days">
                  {t("analytics.financial.dateRange.last30Days")}
                </SelectItem>
                <SelectItem value="last-90-days">
                  {t("analytics.financial.dateRange.last90Days")}
                </SelectItem>
                <SelectItem value="last-6-months">
                  {t("analytics.financial.dateRange.last6Months")}
                </SelectItem>
                <SelectItem value="last-12-months">
                  {t("analytics.financial.dateRange.last12Months")}
                </SelectItem>
                <SelectItem value="year-to-date">
                  {t("analytics.financial.dateRange.yearToDate")}
                </SelectItem>
              </SelectContent>
            </Select>

            <Select
              value={selectedProperty}
              onValueChange={setSelectedProperty}
              disabled={propertiesLoading}
            >
              <SelectTrigger className="relative w-[220px] pl-9">
                <Building2 className="absolute left-3 h-4 w-4 text-muted-foreground" />
                <SelectValue
                  placeholder={
                    propertiesLoading
                      ? t("analytics.financial.property.loading")
                      : t("analytics.financial.property.all")
                  }
                />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">
                  {t("analytics.financial.property.all")}
                </SelectItem>
                {propertyOptions.map((property) => (
                  <SelectItem key={property.id} value={property.id}>
                    {property.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <div className="flex items-center gap-2">
              {lastUpdatedLabel && (
                <span className="hidden text-xs text-muted-foreground xl:inline-flex">
                  {t("analytics.financial.lastUpdated", {
                    values: { time: lastUpdatedLabel },
                  })}
                </span>
              )}
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  if (!isLoading) {
                    loadAllReports();
                  }
                }}
                disabled={isLoading}
              >
                <RefreshCw
                  className={`h-4 w-4 ${isLoading ? "animate-spin" : ""}`}
                />
              </Button>
            </div>
          </div>
        </div>

        {loadError && (
          <Alert
            variant={
              loadError.toLowerCase().includes("unable")
                ? "destructive"
                : undefined
            }
          >
            <AlertTitle>{t("analytics.financial.notice.title")}</AlertTitle>
            <AlertDescription>{loadError}</AlertDescription>
          </Alert>
        )}

        {/* KPI Cards */}
        {isLoading ? (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            {[...Array(4)].map((_, i) => (
              <Card key={i}>
                <CardContent className="p-6">
                  <Skeleton className="h-4 w-24 mb-2" />
                  <Skeleton className="h-8 w-32 mb-1" />
                  <Skeleton className="h-3 w-20" />
                </CardContent>
              </Card>
            ))}
          </div>
        ) : analyticsData ? (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">
                  {t("analytics.financial.kpi.totalRevenue")}
                </CardTitle>
                <DollarSign className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {formatCurrency(analyticsData.kpis.totalRevenue || 0)}
                </div>
                <p className="text-xs text-muted-foreground flex items-center">
                  <TrendingUp className="h-3 w-3 mr-1 text-green-600" />
                  {formatPercentage(
                    analyticsData.kpis.collectionRate || 0
                  )}{" "}
                  {t("analytics.financial.kpi.collectionRate")}
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">
                  {t("analytics.financial.kpi.totalPayments")}
                </CardTitle>
                <Target className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {analyticsData.kpis.totalPayments || 0}
                </div>
                <p className="text-xs text-muted-foreground">
                  {t("analytics.financial.kpi.completed", {
                    values: {
                      count: analyticsData.kpis.completedPayments || 0,
                    },
                  })}
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">
                  {t("analytics.financial.kpi.expectedRevenue")}
                </CardTitle>
                <TrendingUp className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {formatCurrency(analyticsData.kpis.totalExpected || 0)}
                </div>
                <p className="text-xs text-muted-foreground">
                  {t("analytics.financial.kpi.totalExpected")}
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">
                  {t("analytics.financial.kpi.overdueAmount")}
                </CardTitle>
                <AlertCircle className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-red-600">
                  {formatCurrency(analyticsData.kpis.overdueAmount || 0)}
                </div>
                <p className="text-xs text-muted-foreground">
                  {t("analytics.financial.kpi.requiresAttention")}
                </p>
              </CardContent>
            </Card>
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            <Card>
              <CardContent className="p-6">
                <div className="text-center py-8">
                  <p className="text-muted-foreground">
                    {t("analytics.financial.noData.title")}
                  </p>
                  <p className="text-sm text-muted-foreground mt-2">
                    {t("analytics.financial.noData.hint")}
                  </p>
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Main Content Tabs */}
        <Tabs
          value={activeTab}
          onValueChange={setActiveTab}
          className="space-y-6"
        >
          <TabsList className="grid w-full grid-cols-5">
            <TabsTrigger value="overview">
              {t("analytics.financial.tabs.overview")}
            </TabsTrigger>
            <TabsTrigger value="profit-loss">
              {t("analytics.financial.tabs.profitLoss")}
            </TabsTrigger>
            <TabsTrigger value="cash-flow">
              {t("analytics.financial.tabs.cashFlow")}
            </TabsTrigger>
            <TabsTrigger value="properties">
              {t("analytics.financial.tabs.properties")}
            </TabsTrigger>
            <TabsTrigger value="expenses">
              {t("analytics.financial.tabs.expenses")}
            </TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="space-y-6">
            {isLoading ? (
              <div className="grid gap-6 md:grid-cols-2">
                {[...Array(2)].map((_, i) => (
                  <Card key={i}>
                    <CardContent className="p-6">
                      <Skeleton className="h-[300px] w-full" />
                    </CardContent>
                  </Card>
                ))}
              </div>
            ) : (
              <div className="grid gap-6 md:grid-cols-2">
                {analyticsData?.revenueTrends ? (
                  <RevenueTrendsChart
                    data={analyticsData.revenueTrends}
                    height={300}
                  />
                ) : (
                  <Card>
                    <CardHeader>
                      <CardTitle>
                        {t("analytics.financial.revenueTrends.title")}
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="flex items-center justify-center h-[300px]">
                        <div className="text-center">
                          <p className="text-muted-foreground">
                            {t("analytics.financial.revenueTrends.noData")}
                          </p>
                          <p className="text-sm text-muted-foreground mt-2">
                            {t("analytics.financial.revenueTrends.noDataHint")}
                          </p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                )}
                {analyticsData?.paymentMethodBreakdown ? (
                  <Card>
                    <CardHeader>
                      <CardTitle>
                        {t("analytics.financial.paymentMethods.title")}
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-4">
                        {analyticsData.paymentMethodBreakdown.map(
                          (method, index) => (
                            <div
                              key={method._id || index}
                              className="flex items-center justify-between"
                            >
                              <div>
                                <p className="font-medium">
                                  {method._id ||
                                    t(
                                      "analytics.financial.paymentMethods.unknownMethod"
                                    )}
                                </p>
                                <p className="text-sm text-muted-foreground">
                                  {t(
                                    "analytics.financial.paymentMethods.transactions",
                                    { values: { count: method.count || 0 } }
                                  )}
                                </p>
                              </div>
                              <div className="text-right">
                                <p className="font-medium">
                                  {formatCurrency(method.totalAmount || 0)}
                                </p>
                                <p className="text-sm text-muted-foreground">
                                  {t("analytics.financial.paymentMethods.avg", {
                                    values: {
                                      amount: formatCurrency(
                                        method.averageAmount || 0
                                      ),
                                    },
                                  })}
                                </p>
                              </div>
                            </div>
                          )
                        )}
                      </div>
                    </CardContent>
                  </Card>
                ) : (
                  <Card>
                    <CardHeader>
                      <CardTitle>
                        {t("analytics.financial.paymentMethods.title")}
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="flex items-center justify-center h-[300px]">
                        <div className="text-center">
                          <p className="text-muted-foreground">
                            {t("analytics.financial.paymentMethods.noData")}
                          </p>
                          <p className="text-sm text-muted-foreground mt-2">
                            {t("analytics.financial.paymentMethods.noDataHint")}
                          </p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                )}
              </div>
            )}
          </TabsContent>

          <TabsContent value="profit-loss" className="space-y-6">
            {isLoading ? (
              <Card>
                <CardContent className="p-6">
                  <Skeleton className="h-[400px] w-full" />
                </CardContent>
              </Card>
            ) : profitLossData ? (
              <ProfitLossChart data={profitLossData.monthlyPL} height={400} />
            ) : (
              <Card>
                <CardContent className="p-6">
                  <p className="text-center text-muted-foreground py-8">
                    {t("analytics.financial.profitLoss.noData")}
                  </p>
                </CardContent>
              </Card>
            )}
          </TabsContent>

          <TabsContent value="cash-flow" className="space-y-6">
            {isLoading ? (
              <Card>
                <CardContent className="p-6">
                  <Skeleton className="h-[400px] w-full" />
                </CardContent>
              </Card>
            ) : cashFlowData ? (
              <CashFlowChart
                inflows={cashFlowData.cashInflows}
                outflows={cashFlowData.cashOutflows}
                height={400}
              />
            ) : (
              <Card>
                <CardContent className="p-6">
                  <p className="text-center text-muted-foreground py-8">
                    {t("analytics.financial.cashFlow.noData")}
                  </p>
                </CardContent>
              </Card>
            )}
          </TabsContent>

          <TabsContent value="properties" className="space-y-6">
            {isLoading ? (
              <Card>
                <CardContent className="p-6">
                  <Skeleton className="h-[400px] w-full" />
                </CardContent>
              </Card>
            ) : propertyPerformanceData ? (
              <PropertyPerformanceChart
                data={propertyPerformanceData.propertyPerformance}
                height={400}
              />
            ) : (
              <Card>
                <CardContent className="p-6">
                  <p className="text-center text-muted-foreground py-8">
                    {t("analytics.financial.properties.noData")}
                  </p>
                </CardContent>
              </Card>
            )}
          </TabsContent>

          <TabsContent value="expenses" className="space-y-6">
            {isLoading ? (
              <Card>
                <CardContent className="p-6">
                  <Skeleton className="h-[400px] w-full" />
                </CardContent>
              </Card>
            ) : expenseAnalysisData ? (
              <ExpenseBreakdownChart
                data={expenseAnalysisData.expenseCategories}
                height={400}
              />
            ) : (
              <Card>
                <CardContent className="p-6">
                  <p className="text-center text-muted-foreground py-8">
                    {t("analytics.financial.expenses.noData")}
                  </p>
                </CardContent>
              </Card>
            )}
          </TabsContent>
        </Tabs>

        {/* Financial Action Items */}
        <Card>
          <CardHeader>
            <CardTitle>{t("analytics.financial.actions.title")}</CardTitle>
            <p className="text-sm text-muted-foreground">
              {t("analytics.financial.actions.subtitle", {
                values: { property: selectedPropertyLabel },
              })}
            </p>
          </CardHeader>
          <CardContent>
            {actionsLoading ? (
              <div className="space-y-3">
                {[...Array(3)].map((_, i) => (
                  <div key={i} className="flex items-center space-x-4">
                    <div className="h-4 bg-gray-200 rounded w-4 animate-pulse" />
                    <div className="space-y-2 flex-1">
                      <div className="h-4 bg-gray-200 rounded w-3/4 animate-pulse" />
                      <div className="h-3 bg-gray-200 rounded w-1/2 animate-pulse" />
                    </div>
                  </div>
                ))}
              </div>
            ) : actionsError ? (
              <div className="text-center py-8">
                <AlertCircle className="h-12 w-12 text-red-500 mx-auto mb-4" />
                <h3 className="text-lg font-semibold">
                  {t("analytics.financial.actions.failedTitle")}
                </h3>
                <p className="text-muted-foreground mb-4">{actionsError}</p>
                <Button onClick={loadFinancialActions} variant="outline">
                  <RefreshCw className="mr-2 h-4 w-4" />
                  {t("analytics.financial.actions.tryAgain")}
                </Button>
              </div>
            ) : financialActions.length === 0 ? (
              <div className="text-center py-8">
                <CheckCircle className="h-12 w-12 text-green-500 mx-auto mb-4" />
                <h3 className="text-lg font-semibold">
                  {t("analytics.financial.actions.noItems.title")}
                </h3>
                <p className="text-muted-foreground">
                  {t("analytics.financial.actions.noItems.description")}
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                {financialActions.slice(0, 5).map((action) => (
                  <div
                    key={action._id}
                    className="flex items-start space-x-4 p-4 border rounded"
                  >
                    <div
                      className={`h-3 w-3 rounded-full mt-2 ${
                        action.status === "completed"
                          ? "bg-green-500"
                          : action.status === "in-progress"
                          ? "bg-yellow-500"
                          : "bg-gray-300"
                      }`}
                    />
                    <div className="flex-1">
                      <h4 className="font-medium">{action.title}</h4>
                      <p className="text-sm text-muted-foreground">
                        {action.description}
                      </p>
                      <div className="flex items-center gap-2 mt-2">
                        <span
                          className={`px-2 py-1 text-xs rounded ${
                            action.priority === "high"
                              ? "bg-red-100 text-red-800"
                              : action.priority === "medium"
                              ? "bg-yellow-100 text-yellow-800"
                              : "bg-gray-100 text-gray-800"
                          }`}
                        >
                          {action.priority === "high"
                            ? t("analytics.financial.actions.priority.high")
                            : action.priority === "medium"
                            ? t("analytics.financial.actions.priority.medium")
                            : t("analytics.financial.actions.priority.low")}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {action.category}
                        </span>
                      </div>
                    </div>
                  </div>
                ))}
                {financialActions.length > 5 && (
                  <Button
                    variant="outline"
                    className="w-full"
                    onClick={loadFinancialActions}
                  >
                    {t("analytics.financial.actions.viewAll", {
                      values: { count: financialActions.length },
                    })}
                  </Button>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
