"use client";

import { useMemo, useState } from "react";
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
  DollarSign,
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
import { useLocalizationContext } from "@/components/providers/LocalizationProvider";

const SAMPLE_ANALYTICS = {
  overview: {
    portfolio: {
      totalProperties: 25,
      totalUnits: 150,
      totalValue: 15000000,
      averageRent: 2800,
    },
    occupancy: {
      rate: 94.5,
      occupied: 142,
      total: 150,
      vacant: 8,
    },
    financial: {
      totalRevenue: 425000,
      pendingRevenue: 28000,
      totalPayments: 180,
      completedPayments: 165,
      collectionRate: 91.7,
    },
    maintenance: {
      submitted: { count: 45, cost: 12500 },
      in_progress: { count: 12, cost: 8200 },
      completed: { count: 128, cost: 45600 },
    },
  },
  monthlyTrends: [
    { month: "Jan", revenue: 38000, occupancy: 92, maintenance: 8500 },
    { month: "Feb", revenue: 42000, occupancy: 94, maintenance: 6200 },
    { month: "Mar", revenue: 45000, occupancy: 96, maintenance: 7800 },
    { month: "Apr", revenue: 43000, occupancy: 95, maintenance: 9200 },
    { month: "May", revenue: 47000, occupancy: 97, maintenance: 5600 },
    { month: "Jun", revenue: 44000, occupancy: 94, maintenance: 8900 },
  ],
  propertyPerformance: [
    {
      name: "Sunset Apartments",
      revenue: 85000,
      occupancy: 98,
      maintenance: 12000,
    },
    {
      name: "Downtown Lofts",
      revenue: 72000,
      occupancy: 92,
      maintenance: 8500,
    },
    {
      name: "Garden View Complex",
      revenue: 95000,
      occupancy: 96,
      maintenance: 15200,
    },
    {
      name: "Riverside Towers",
      revenue: 68000,
      occupancy: 89,
      maintenance: 9800,
    },
    {
      name: "Metro Heights",
      revenue: 78000,
      occupancy: 94,
      maintenance: 11200,
    },
  ],
  maintenanceBreakdown: [
    { category: "Plumbing", count: 45, cost: 18500 },
    { category: "HVAC", count: 32, cost: 24200 },
    { category: "Electrical", count: 28, cost: 15600 },
    { category: "General", count: 38, cost: 8900 },
    { category: "Appliances", count: 22, cost: 12400 },
  ],
  revenueBreakdown: [
    { type: "Rent", amount: 380000, percentage: 89.4 },
    { type: "Late Fees", amount: 12500, percentage: 2.9 },
    { type: "Deposits", amount: 25000, percentage: 5.9 },
    { type: "Other", amount: 7500, percentage: 1.8 },
  ],
};

const CHART_COLORS = ["#0088FE", "#00C49F", "#FFBB28", "#FF8042", "#8884D8"];

export default function AnalyticsPage() {
  const { t, formatCurrency } = useLocalizationContext();
  const [selectedPeriod, setSelectedPeriod] = useState("6months");
  const [selectedProperty, setSelectedProperty] = useState("all");
  const [activeTab, setActiveTab] = useState("overview");

  const formatAmount = (value: number) =>
    formatCurrency(value, undefined, {
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    });

  const maintenanceStats = useMemo(
    () => Object.values(SAMPLE_ANALYTICS.overview.maintenance),
    []
  );

  const calculateChange = (current: number, previous: number) => {
    const change = ((current - previous) / previous) * 100;
    return {
      value: Math.abs(change).toFixed(1),
      isPositive: change >= 0,
    };
  };

  // Baseline data for trend calculation
  const previousData = {
    revenue: 398000,
    occupancy: 92.1,
    maintenance: 42800,
    collectionRate: 89.2,
  };

  const revenueChange = calculateChange(
    SAMPLE_ANALYTICS.overview.financial.totalRevenue,
    previousData.revenue
  );
  const occupancyChange = calculateChange(
    SAMPLE_ANALYTICS.overview.occupancy.rate,
    previousData.occupancy
  );
  const maintenanceChange = calculateChange(
    maintenanceStats.reduce((sum, item) => sum + item.cost, 0),
    previousData.maintenance
  );
  const collectionChange = calculateChange(
    SAMPLE_ANALYTICS.overview.financial.collectionRate,
    previousData.collectionRate
  );

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
              <SelectItem value="sunset">Sunset Apartments</SelectItem>
              <SelectItem value="downtown">Downtown Lofts</SelectItem>
              <SelectItem value="garden">Garden View Complex</SelectItem>
              <SelectItem value="riverside">Riverside Towers</SelectItem>
            </SelectContent>
          </Select>
          <Button variant="outline" size="sm">
            <RefreshCw className="h-4 w-4 mr-2" />
            {t("analytics.header.refresh")}
          </Button>
          <Button variant="outline" size="sm">
            <Download className="h-4 w-4 mr-2" />
            {t("analytics.header.export")}
          </Button>
        </div>
      </div>

      <AnalyticsCardGrid>
        <AnalyticsCard
          title={t("analytics.cards.totalRevenue")}
          value={formatAmount(SAMPLE_ANALYTICS.overview.financial.totalRevenue)}
          icon={DollarSign}
          iconColor="success"
          trend={{
            value: t("analytics.cards.fromLastPeriod", {
              values: { value: revenueChange.value },
            }),
            isPositive: revenueChange.isPositive,
            icon: revenueChange.isPositive ? TrendingUp : TrendingDown,
          }}
        />

        <AnalyticsCard
          title={t("analytics.cards.occupancyRate")}
          value={formatPercentage(SAMPLE_ANALYTICS.overview.occupancy.rate)}
          description={t("analytics.cards.units", {
            values: {
              occupied: SAMPLE_ANALYTICS.overview.occupancy.occupied,
              total: SAMPLE_ANALYTICS.overview.occupancy.total,
            },
          })}
          icon={Home}
          iconColor="primary"
          trend={{
            value: `${occupancyChange.value}%`,
            isPositive: occupancyChange.isPositive,
            icon: occupancyChange.isPositive ? TrendingUp : TrendingDown,
          }}
        />

        <AnalyticsCard
          title={t("analytics.cards.collectionRate")}
          value={formatPercentage(
            SAMPLE_ANALYTICS.overview.financial.collectionRate
          )}
          description={t("analytics.cards.payments", {
            values: {
              completed: SAMPLE_ANALYTICS.overview.financial.completedPayments,
              total: SAMPLE_ANALYTICS.overview.financial.totalPayments,
            },
          })}
          icon={Target}
          iconColor="info"
          trend={{
            value: `${collectionChange.value}%`,
            isPositive: collectionChange.isPositive,
            icon: collectionChange.isPositive ? TrendingUp : TrendingDown,
          }}
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
          trend={{
            value: `${maintenanceChange.value}%`,
            isPositive: !maintenanceChange.isPositive, // Lower maintenance cost is positive
            icon: !maintenanceChange.isPositive ? TrendingDown : TrendingUp,
          }}
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
                  <LineChart data={SAMPLE_ANALYTICS.monthlyTrends}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="month" />
                    <YAxis yAxisId="left" />
                    <YAxis yAxisId="right" orientation="right" />
                    <Tooltip />
                    <Legend />
                    <Line
                      yAxisId="left"
                      type="monotone"
                      dataKey="revenue"
                      stroke="#8884d8"
                      name={t("analytics.charts.revenue")}
                    />
                    <Line
                      yAxisId="right"
                      type="monotone"
                      dataKey="occupancy"
                      stroke="#82ca9d"
                      name={t("analytics.charts.occupancy")}
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
                      data={SAMPLE_ANALYTICS.revenueBreakdown}
                      cx="50%"
                      cy="50%"
                      labelLine={false}
                      label={({ name, percentage }) => `${name} ${percentage}%`}
                      outerRadius={80}
                      fill="#8884d8"
                      dataKey="amount"
                    >
                      {SAMPLE_ANALYTICS.revenueBreakdown.map((_, index) => (
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
                <BarChart data={SAMPLE_ANALYTICS.propertyPerformance}>
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
                  <Bar
                    yAxisId="right"
                    dataKey="occupancy"
                    fill="#82ca9d"
                    name={t("analytics.charts.occupancyRate")}
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
                    <DollarSign className="h-5 w-5 text-success" />
                  </div>
                  {t("analytics.financial.cashFlow.title")}
                </CardTitle>
                <CardDescription>
                  {t("analytics.financial.cashFlow.description")}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <AreaChart data={SAMPLE_ANALYTICS.monthlyTrends}>
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
              <ResponsiveContainer width="100%" height={400}>
                <LineChart data={SAMPLE_ANALYTICS.monthlyTrends}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="month" />
                  <YAxis />
                  <Tooltip />
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
                <BarChart data={SAMPLE_ANALYTICS.maintenanceBreakdown}>
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
            <AnalyticsCard
              title={t("analytics.performance.roi.title")}
              value="12.5%"
              description={t("analytics.performance.roi.description")}
              icon={TrendingUp}
              iconColor="success"
            />

            <AnalyticsCard
              title={t("analytics.performance.retention.title")}
              value="87%"
              description={t("analytics.performance.retention.description")}
              icon={Users}
              iconColor="info"
            />

            <AnalyticsCard
              title={t("analytics.performance.market.title")}
              value="+5.2%"
              description={t("analytics.performance.market.description")}
              icon={Target}
              iconColor="primary"
            />
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
