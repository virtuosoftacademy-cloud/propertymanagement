"use client";

import {
  AreaChart,
  Area,
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
} from "recharts";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { TrendingUp, TrendingDown, Minus } from "lucide-react";
import {
  RevenueTrend,
  ExpenseCategory,
  CashInflow,
  CashOutflow,
  PropertyPerformanceData,
  MonthlyPL,
} from "@/types/financial-analytics";
import {
  formatCurrency,
  formatCurrency as formatCurrencyValue,
} from "@/lib/formatters";

// CHART COLORS

const CHART_COLORS = {
  primary: "#2563eb",
  success: "#10b981",
  warning: "#f59e0b",
  error: "#ef4444",
  info: "#06b6d4",
  muted: "#64748b",
};

const PIE_COLORS = [
  "#2563eb",
  "#10b981",
  "#f59e0b",
  "#ef4444",
  "#06b6d4",
  "#8b5cf6",
  "#f97316",
];

const formatAmount = (value?: number | null) =>
  formatCurrencyValue(value ?? 0, {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  });

// Revenue trends chart

interface RevenueTrendsChartProps {
  data: RevenueTrend[];
  height?: number;
  showProjections?: boolean;
}

export function RevenueTrendsChart({
  data,
  height = 300,
  showProjections = false,
}: RevenueTrendsChartProps) {
  const formatMonth = (item: RevenueTrend) => {
    const date = new Date(item._id.year, item._id.month - 1);
    return date.toLocaleDateString("en-US", {
      month: "short",
      year: "2-digit",
    });
  };

  const chartData = data.map((item) => ({
    month: formatMonth(item),
    revenue: item.revenue,
    paymentCount: item.paymentCount,
    averageAmount: item.averageAmount,
  }));

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <TrendingUp className="h-5 w-5 text-success" />
          Revenue Trends
        </CardTitle>
        <CardDescription>
          Monthly revenue performance and payment volume
        </CardDescription>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={height}>
          <AreaChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="month" />
            <YAxis tickFormatter={(value) => formatAmount(value as number)} />
            <Tooltip
              formatter={(value, name) => [
                name === "revenue" ? formatAmount(value as number) : value,
                name === "revenue" ? "Revenue" : "Payment Count",
              ]}
            />
            <Area
              type="monotone"
              dataKey="revenue"
              stroke={CHART_COLORS.success}
              fill={CHART_COLORS.success}
              fillOpacity={0.6}
            />
          </AreaChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}

// Expense breakdown chart

interface ExpenseBreakdownChartProps {
  data: ExpenseCategory[];
  height?: number;
}

export function ExpenseBreakdownChart({
  data,
  height = 300,
}: ExpenseBreakdownChartProps) {
  const getTrendIcon = (trend: string) => {
    switch (trend) {
      case "up":
        return <TrendingUp className="h-3 w-3 text-red-500" />;
      case "down":
        return <TrendingDown className="h-3 w-3 text-green-500" />;
      default:
        return <Minus className="h-3 w-3 text-muted-foreground" />;
    }
  };

  const pieData = data.map((item, index) => ({
    name: item.category,
    value: item.amount,
    percentage: item.percentage,
    trend: item.trend,
    color: PIE_COLORS[index % PIE_COLORS.length],
  }));

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <div className="p-1 rounded bg-warning/10">
            <div className="h-4 w-4 bg-warning rounded" />
          </div>
          Expense Breakdown
        </CardTitle>
        <CardDescription>
          Expenses by category with trend indicators
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Pie Chart */}
          <div>
            <ResponsiveContainer width="100%" height={height}>
              <PieChart>
                <Pie
                  data={pieData}
                  cx="50%"
                  cy="50%"
                  labelLine={false}
                  label={({ percentage }) => `${percentage}%`}
                  outerRadius={80}
                  fill="#8884d8"
                  dataKey="value"
                >
                  {pieData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip formatter={(value) => formatAmount(value as number)} />
              </PieChart>
            </ResponsiveContainer>
          </div>

          {/* Legend with Details */}
          <div className="space-y-3">
            {pieData.map((item, index) => (
              <div
                key={index}
                className="flex items-center justify-between p-3 rounded-lg border"
              >
                <div className="flex items-center gap-3">
                  <div
                    className="w-3 h-3 rounded-full"
                    style={{ backgroundColor: item.color }}
                  />
                  <div>
                    <p className="font-medium text-sm">{item.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {formatCurrency(item.value)}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className="text-xs">
                    {item.percentage}%
                  </Badge>
                  {getTrendIcon(item.trend)}
                </div>
              </div>
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// Cash flow chart

interface CashFlowChartProps {
  inflows: CashInflow[];
  outflows: CashOutflow[];
  height?: number;
}

export function CashFlowChart({
  inflows,
  outflows,
  height = 300,
}: CashFlowChartProps) {
  const formatMonth = (year: number, month: number) => {
    const date = new Date(year, month - 1);
    return date.toLocaleDateString("en-US", {
      month: "short",
      year: "2-digit",
    });
  };

  // Combine inflows and outflows data
  const chartData = inflows.map((inflow) => {
    const outflow = outflows.find(
      (o) => o._id.year === inflow._id.year && o._id.month === inflow._id.month
    );

    return {
      month: formatMonth(inflow._id.year, inflow._id.month),
      inflow: inflow.totalInflow,
      outflow: outflow?.totalOutflow || 0,
      netFlow: inflow.totalInflow - (outflow?.totalOutflow || 0),
    };
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <div className="p-1 rounded bg-info/10">
            <div className="h-4 w-4 bg-info rounded" />
          </div>
          Cash Flow Analysis
        </CardTitle>
        <CardDescription>
          Monthly cash inflows, outflows, and net cash flow
        </CardDescription>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={height}>
          <BarChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="month" />
            <YAxis tickFormatter={(value) => formatAmount(value as number)} />
            <Tooltip formatter={(value) => formatAmount(value as number)} />
            <Legend />
            <Bar
              dataKey="inflow"
              fill={CHART_COLORS.success}
              name="Cash Inflow"
            />
            <Bar
              dataKey="outflow"
              fill={CHART_COLORS.error}
              name="Cash Outflow"
            />
            <Bar
              dataKey="netFlow"
              fill={CHART_COLORS.info}
              name="Net Cash Flow"
            />
          </BarChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}

// Property performance comparison

interface PropertyPerformanceChartProps {
  data: PropertyPerformanceData[];
  height?: number;
}

export function PropertyPerformanceChart({
  data,
  height = 300,
}: PropertyPerformanceChartProps) {
  const chartData = data.slice(0, 10).map((property) => ({
    name:
      property.propertyName.length > 15
        ? property.propertyName.substring(0, 15) + "..."
        : property.propertyName,
    revenue: property.totalRevenue,
    collectionRate: property.collectionRate,
    roi: property.roi,
  }));

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <div className="p-1 rounded bg-primary/10">
            <div className="h-4 w-4 bg-primary rounded" />
          </div>
          Property Performance Comparison
        </CardTitle>
        <CardDescription>
          Revenue and collection rates by property (top 10)
        </CardDescription>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={height}>
          <BarChart data={chartData} layout="horizontal">
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis
              type="number"
              tickFormatter={(value) => formatAmount(value as number)}
            />
            <YAxis dataKey="name" type="category" width={100} />
            <Tooltip
              formatter={(value, name) => [
                name === "revenue"
                  ? formatAmount(value as number)
                  : `${value}%`,
                name === "revenue"
                  ? "Revenue"
                  : name === "collectionRate"
                  ? "Collection Rate"
                  : "ROI",
              ]}
            />
            <Bar dataKey="revenue" fill={CHART_COLORS.primary} />
          </BarChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}

// Profit & loss chart

interface ProfitLossChartProps {
  data: MonthlyPL[];
  height?: number;
}

export function ProfitLossChart({ data, height = 300 }: ProfitLossChartProps) {
  const formatMonth = (year: number, month: number) => {
    const date = new Date(year, month - 1);
    return date.toLocaleDateString("en-US", {
      month: "short",
      year: "2-digit",
    });
  };

  const chartData = data.map((item) => ({
    month: formatMonth(item._id.year, item._id.month),
    revenue: item.revenue,
    expenses: item.expenses,
    netIncome: item.netIncome,
  }));

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <div className="p-1 rounded bg-success/10">
            <div className="h-4 w-4 bg-success rounded" />
          </div>
          Profit & Loss Trends
        </CardTitle>
        <CardDescription>
          Monthly revenue, expenses, and net income
        </CardDescription>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={height}>
          <LineChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="month" />
            <YAxis tickFormatter={(value) => formatAmount(value as number)} />
            <Tooltip formatter={(value) => formatAmount(value as number)} />
            <Legend />
            <Line
              type="monotone"
              dataKey="revenue"
              stroke={CHART_COLORS.success}
              strokeWidth={2}
              name="Revenue"
            />
            <Line
              type="monotone"
              dataKey="expenses"
              stroke={CHART_COLORS.error}
              strokeWidth={2}
              name="Expenses"
            />
            <Line
              type="monotone"
              dataKey="netIncome"
              stroke={CHART_COLORS.primary}
              strokeWidth={2}
              name="Net Income"
            />
          </LineChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}
