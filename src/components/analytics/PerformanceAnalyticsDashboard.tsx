"use client";

import React, { useState, useEffect } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  LineChart,
  Line,
  PieChart,
  Pie,
  Cell,
} from "recharts";
import {
  TrendingUp,
  TrendingDown,
  Activity,
  Users,
  DollarSign,
  Clock,
  AlertTriangle,
  CheckCircle,
  RefreshCw,
} from "lucide-react";

interface PerformanceMetrics {
  systemPerformance: {
    averageResponseTime: number;
    throughput: number;
    errorRate: number;
    uptime: number;
    peakConcurrentUsers: number;
  };
  paymentMetrics: {
    totalPayments: number;
    successfulPayments: number;
    failedPayments: number;
    averagePaymentAmount: number;
    paymentMethodDistribution: Record<string, number>;
    processingTimeAverage: number;
  };
  userEngagement: {
    activeUsers: number;
    sessionDuration: number;
    pageViews: number;
    bounceRate: number;
    featureUsage: Record<string, number>;
  };
  businessMetrics: {
    collectionRate: number;
    averageDaysToPayment: number;
    lateFeeRevenue: number;
    autoPayAdoption: number;
    tenantSatisfactionScore: number;
  };
}
import { formatCurrency } from "@/lib/utils/formatting";

interface AnalyticsReport {
  period: {
    start: Date;
    end: Date;
    duration: string;
  };
  metrics: PerformanceMetrics;
  trends: {
    metric: string;
    direction: "up" | "down" | "stable";
    change: number;
    significance: "high" | "medium" | "low";
  }[];
  insights: {
    category: string;
    insight: string;
    impact: "positive" | "negative" | "neutral";
    recommendation: string;
  }[];
  benchmarks: {
    metric: string;
    current: number;
    target: number;
    industry: number;
    status: "above" | "at" | "below";
  }[];
}

export default function PerformanceAnalyticsDashboard() {
  const [metrics, setMetrics] = useState<PerformanceMetrics | null>(null);
  const [report, setReport] = useState<AnalyticsReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedPeriod, setSelectedPeriod] = useState("7d");

  useEffect(() => {
    loadCurrentMetrics();
  }, []);

  const loadCurrentMetrics = async () => {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch("/api/analytics/performance?type=current");
      const data = await response.json();

      if (data.success) {
        setMetrics(data.data.metrics);
      } else {
        setError(data.message);
      }
    } catch (err) {
      setError("Failed to load performance metrics");
    } finally {
      setLoading(false);
    }
  };

  const generateReport = async () => {
    setLoading(true);
    setError(null);

    try {
      const endDate = new Date();
      const startDate = new Date();

      switch (selectedPeriod) {
        case "7d":
          startDate.setDate(endDate.getDate() - 7);
          break;
        case "30d":
          startDate.setDate(endDate.getDate() - 30);
          break;
        case "90d":
          startDate.setDate(endDate.getDate() - 90);
          break;
      }

      const response = await fetch("/api/analytics/performance", {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
        },
      });

      const params = new URLSearchParams({
        type: "report",
        startDate: startDate.toISOString(),
        endDate: endDate.toISOString(),
        recommendations: "true",
      });

      const reportResponse = await fetch(
        `/api/analytics/performance?${params}`
      );
      const reportData = await reportResponse.json();

      if (reportData.success) {
        setReport(reportData.data.report);
      } else {
        setError(reportData.message);
      }
    } catch (err) {
      setError("Failed to generate analytics report");
    } finally {
      setLoading(false);
    }
  };

  // const formatCurrency = (amount: number) => {
  //   return new Intl.NumberFormat("en-US", {
  //     style: "currency",
  //     currency: "USD",
  //   }).format(amount);
  // };

  const formatPercentage = (value: number) => {
    return `${(value * 100).toFixed(1)}%`;
  };

  const getTrendIcon = (direction: string) => {
    switch (direction) {
      case "up":
        return <TrendingUp className="h-4 w-4 text-green-500" />;
      case "down":
        return <TrendingDown className="h-4 w-4 text-red-500" />;
      default:
        return <Activity className="h-4 w-4 text-gray-500" />;
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "above":
        return (
          <Badge variant="default" className="bg-green-500">
            Above Target
          </Badge>
        );
      case "at":
        return <Badge variant="secondary">At Target</Badge>;
      case "below":
        return <Badge variant="destructive">Below Target</Badge>;
      default:
        return <Badge variant="outline">Unknown</Badge>;
    }
  };

  if (loading && !metrics) {
    return (
      <div className="flex items-center justify-center h-64">
        <RefreshCw className="h-8 w-8 animate-spin" />
        <span className="ml-2">Loading analytics...</span>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">
            Performance Analytics
          </h2>
          <p className="text-muted-foreground">
            Monitor system performance and optimize operations
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            onClick={loadCurrentMetrics}
            variant="outline"
            disabled={loading}
          >
            <RefreshCw
              className={`h-4 w-4 mr-2 ${loading ? "animate-spin" : ""}`}
            />
            Refresh
          </Button>
          <Button onClick={generateReport} disabled={loading}>
            Generate Report
          </Button>
        </div>
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {metrics && (
        <Tabs defaultValue="overview" className="space-y-4">
          <TabsList>
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="system">System Performance</TabsTrigger>
            <TabsTrigger value="payments">Payment Metrics</TabsTrigger>
            <TabsTrigger value="users">User Engagement</TabsTrigger>
            <TabsTrigger value="business">Business Metrics</TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="space-y-4">
            {/* Key Metrics Cards */}
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">
                    Response Time
                  </CardTitle>
                  <Clock className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">
                    {metrics?.systemPerformance?.averageResponseTime ?? 0}ms
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Average response time
                  </p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">
                    Collection Rate
                  </CardTitle>
                  <DollarSign className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">
                    {formatPercentage(
                      metrics?.businessMetrics?.collectionRate ?? 0
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    On-time payments
                  </p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">
                    Active Users
                  </CardTitle>
                  <Users className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">
                    {metrics?.userEngagement?.activeUsers ?? 0}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Current active users
                  </p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">
                    Auto-pay Adoption
                  </CardTitle>
                  <CheckCircle className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">
                    {formatPercentage(metrics.businessMetrics.autoPayAdoption)}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Tenants using auto-pay
                  </p>
                </CardContent>
              </Card>
            </div>

            {/* Payment Method Distribution Chart */}
            <Card>
              <CardHeader>
                <CardTitle>Payment Method Distribution</CardTitle>
                <CardDescription>
                  Breakdown of payment methods used by tenants
                </CardDescription>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <PieChart>
                    <Pie
                      data={Object.entries(
                        metrics.paymentMetrics.paymentMethodDistribution
                      ).map(([method, value]) => ({
                        name: method.replace("_", " ").toUpperCase(),
                        value: value * 100,
                      }))}
                      cx="50%"
                      cy="50%"
                      labelLine={false}
                      label={({ name, percent }) =>
                        `${name} ${percent.toFixed(0)}%`
                      }
                      outerRadius={80}
                      fill="#8884d8"
                      dataKey="value"
                    >
                      {Object.entries(
                        metrics.paymentMetrics.paymentMethodDistribution
                      ).map((entry, index) => (
                        <Cell
                          key={`cell-${index}`}
                          fill={
                            ["#0088FE", "#00C49F", "#FFBB28", "#FF8042"][
                              index % 4
                            ]
                          }
                        />
                      ))}
                    </Pie>
                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="system" className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <Card>
                <CardHeader>
                  <CardTitle>System Performance</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <div className="flex justify-between">
                      <span>Response Time</span>
                      <span>
                        {metrics.systemPerformance.averageResponseTime}ms
                      </span>
                    </div>
                    <Progress
                      value={Math.min(
                        100,
                        (500 - metrics.systemPerformance.averageResponseTime) /
                          5
                      )}
                    />
                  </div>

                  <div className="space-y-2">
                    <div className="flex justify-between">
                      <span>Throughput</span>
                      <span>{metrics.systemPerformance.throughput} RPS</span>
                    </div>
                    <Progress
                      value={Math.min(
                        100,
                        metrics.systemPerformance.throughput
                      )}
                    />
                  </div>

                  <div className="space-y-2">
                    <div className="flex justify-between">
                      <span>Error Rate</span>
                      <span>
                        {formatPercentage(metrics.systemPerformance.errorRate)}
                      </span>
                    </div>
                    <Progress
                      value={Math.max(
                        0,
                        100 - metrics.systemPerformance.errorRate * 1000
                      )}
                    />
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>System Health</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex items-center justify-between">
                    <span>Uptime</span>
                    <Badge variant="default" className="bg-green-500">
                      {(metrics.systemPerformance.uptime / 86400).toFixed(1)}{" "}
                      days
                    </Badge>
                  </div>

                  <div className="flex items-center justify-between">
                    <span>Peak Concurrent Users</span>
                    <span className="font-semibold">
                      {metrics.systemPerformance.peakConcurrentUsers}
                    </span>
                  </div>

                  <div className="flex items-center justify-between">
                    <span>System Status</span>
                    <Badge variant="default" className="bg-green-500">
                      Healthy
                    </Badge>
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="payments" className="space-y-4">
            <div className="grid gap-4 md:grid-cols-3">
              <Card>
                <CardHeader>
                  <CardTitle>Payment Volume</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">
                    {metrics.paymentMetrics.totalPayments}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Total payments processed
                  </p>
                  <div className="mt-2">
                    <div className="text-sm text-green-600">
                      ✓ {metrics.paymentMetrics.successfulPayments} successful
                    </div>
                    <div className="text-sm text-red-600">
                      ✗ {metrics.paymentMetrics.failedPayments} failed
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Average Payment</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">
                    {formatCurrency(
                      metrics.paymentMetrics.averagePaymentAmount
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Average payment amount
                  </p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Processing Time</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">
                    {(
                      metrics.paymentMetrics.processingTimeAverage / 1000
                    ).toFixed(1)}
                    s
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Average processing time
                  </p>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="users" className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <Card>
                <CardHeader>
                  <CardTitle>User Engagement</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex justify-between">
                    <span>Active Users</span>
                    <span className="font-semibold">
                      {metrics?.userEngagement?.activeUsers ?? 0}
                    </span>
                  </div>

                  <div className="flex justify-between">
                    <span>Session Duration</span>
                    <span className="font-semibold">
                      {Math.round(
                        (metrics?.userEngagement?.sessionDuration ?? 0) / 60
                      )}
                      m
                    </span>
                  </div>

                  <div className="flex justify-between">
                    <span>Page Views</span>
                    <span className="font-semibold">
                      {metrics?.userEngagement?.pageViews ?? 0}
                    </span>
                  </div>

                  <div className="flex justify-between">
                    <span>Bounce Rate</span>
                    <span className="font-semibold">
                      {formatPercentage(metrics.userEngagement.bounceRate)}
                    </span>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Feature Usage</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {Object.entries(metrics.userEngagement.featureUsage).map(
                      ([feature, usage]) => (
                        <div key={feature} className="space-y-1">
                          <div className="flex justify-between text-sm">
                            <span className="capitalize">
                              {feature.replace("_", " ")}
                            </span>
                            <span>{formatPercentage(usage)}</span>
                          </div>
                          <Progress value={usage * 100} />
                        </div>
                      )
                    )}
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="business" className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
              <Card>
                <CardHeader>
                  <CardTitle>Collection Rate</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">
                    {formatPercentage(
                      metrics?.businessMetrics?.collectionRate ?? 0
                    )}
                  </div>
                  <Progress
                    value={
                      (metrics?.businessMetrics?.collectionRate ?? 0) * 100
                    }
                    className="mt-2"
                  />
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Avg. Days to Payment</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">
                    {(
                      metrics?.businessMetrics?.averageDaysToPayment ?? 0
                    ).toFixed(1)}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Days on average
                  </p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Late Fee Revenue</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">
                    {formatCurrency(metrics.businessMetrics.lateFeeRevenue)}
                  </div>
                  <p className="text-xs text-muted-foreground">This period</p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Tenant Satisfaction</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">
                    {metrics.businessMetrics.tenantSatisfactionScore.toFixed(1)}
                    /5
                  </div>
                  <Progress
                    value={metrics.businessMetrics.tenantSatisfactionScore * 20}
                    className="mt-2"
                  />
                </CardContent>
              </Card>
            </div>
          </TabsContent>
        </Tabs>
      )}

      {/* Analytics Report */}
      {report && (
        <Card>
          <CardHeader>
            <CardTitle>Analytics Report</CardTitle>
            <CardDescription>
              Generated for {report.period.duration} period
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Trends */}
            <div>
              <h4 className="font-semibold mb-2">Performance Trends</h4>
              <div className="grid gap-2 md:grid-cols-2">
                {report.trends.map((trend, index) => (
                  <div
                    key={index}
                    className="flex items-center justify-between p-2 border rounded"
                  >
                    <span className="text-sm">{trend.metric}</span>
                    <div className="flex items-center gap-2">
                      {getTrendIcon(trend.direction)}
                      <span className="text-sm font-medium">
                        {trend.change > 0 ? "+" : ""}
                        {trend.change.toFixed(1)}%
                      </span>
                      <Badge
                        variant={
                          trend.significance === "high"
                            ? "default"
                            : "secondary"
                        }
                      >
                        {trend.significance}
                      </Badge>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Insights */}
            <div>
              <h4 className="font-semibold mb-2">Key Insights</h4>
              <div className="space-y-2">
                {report.insights.map((insight, index) => (
                  <Alert key={index}>
                    <AlertDescription>
                      <strong>{insight.category}:</strong> {insight.insight}
                      <br />
                      <em>Recommendation: {insight.recommendation}</em>
                    </AlertDescription>
                  </Alert>
                ))}
              </div>
            </div>

            {/* Benchmarks */}
            <div>
              <h4 className="font-semibold mb-2">Benchmark Comparison</h4>
              <div className="space-y-2">
                {report.benchmarks.map((benchmark, index) => (
                  <div
                    key={index}
                    className="flex items-center justify-between p-2 border rounded"
                  >
                    <span className="text-sm">{benchmark.metric}</span>
                    <div className="flex items-center gap-2">
                      <span className="text-sm">
                        {benchmark.current.toFixed(1)} /{" "}
                        {benchmark.target.toFixed(1)}
                      </span>
                      {getStatusBadge(benchmark.status)}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
