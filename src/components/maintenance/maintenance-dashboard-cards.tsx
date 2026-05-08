"use client";

import { Card, CardContent, CardHeader } from "@/components/ui/card";
import {
  Wrench,
  Clock,
  DollarSign,
  Target,
  TrendingUp,
  TrendingDown,
  CheckCircle,
  AlertTriangle,
  Timer,
} from "lucide-react";
import {
  AnalyticsCard,
  AnalyticsCardGrid,
} from "@/components/analytics/AnalyticsCard";

interface MaintenanceOverviewData {
  totalRequests: number;
  pendingRequests: number;
  inProgressRequests: number;
  completedRequests: number;
  totalCost: number;
  avgCompletionTime: number;
  avgCost: number;
  completionRate: number;
}

interface MaintenanceDashboardCardsProps {
  data?: MaintenanceOverviewData;
}
import { formatCurrency } from "@/lib/utils/formatting";

export function MaintenanceDashboardCards({
  data,
}: MaintenanceDashboardCardsProps) {
  // const formatCurrency = (amount: number) => {
  //   return new Intl.NumberFormat("en-US", {
  //     style: "currency",
  //     currency: "USD",
  //     minimumFractionDigits: 0,
  //     maximumFractionDigits: 0,
  //   }).format(amount);
  // };

  const formatPercentage = (value: number) => {
    return `${value.toFixed(1)}%`;
  };

  const formatDuration = (hours: number | null | undefined) => {
    if (!hours || hours === 0) {
      return "0h";
    }
    if (hours < 24) {
      return `${hours.toFixed(1)}h`;
    }
    const days = Math.floor(hours / 24);
    const remainingHours = hours % 24;
    return `${days}d ${remainingHours.toFixed(1)}h`;
  };

  // Mock previous period data for trend calculation
  const previousData = {
    totalRequests: data ? data.totalRequests - 15 : 0,
    totalCost: data ? data.totalCost - 5000 : 0,
    avgCompletionTime: data ? data.avgCompletionTime + 2 : 0,
    completionRate: data ? data.completionRate - 5 : 0,
  };

  const calculateChange = (current: number, previous: number) => {
    if (previous === 0) return { value: "0", isPositive: true };
    const change = ((current - previous) / previous) * 100;
    return {
      value: Math.abs(change).toFixed(1),
      isPositive: change >= 0,
    };
  };

  const requestsChange = data
    ? calculateChange(data.totalRequests, previousData.totalRequests)
    : { value: "0", isPositive: true };
  const costChange = data
    ? calculateChange(data.totalCost, previousData.totalCost)
    : { value: "0", isPositive: true };
  const timeChange = data
    ? calculateChange(data.avgCompletionTime, previousData.avgCompletionTime)
    : { value: "0", isPositive: true };
  const completionChange = data
    ? calculateChange(data.completionRate, previousData.completionRate)
    : { value: "0", isPositive: true };

  const cards = [
    {
      title: "Total Requests",
      value: data?.totalRequests || 0,
      icon: Wrench,
      color: "text-blue-600",
      bgColor: "bg-blue-50",
      borderColor: "border-blue-200",
      description: `${data?.pendingRequests || 0} pending, ${
        data?.inProgressRequests || 0
      } in progress`,
      trend: requestsChange,
      trendLabel: "from last period",
    },
    {
      title: "Total Cost",
      value: data ? formatCurrency(data.totalCost) : "$0",
      icon: DollarSign,
      color: "text-green-600",
      bgColor: "bg-green-50",
      borderColor: "border-green-200",
      description: `Avg: ${
        data ? formatCurrency(data.avgCost) : "$0"
      } per request`,
      trend: costChange,
      trendLabel: "from last period",
      trendInverted: true, // Lower cost is better
    },
    {
      title: "Avg Completion Time",
      value: data ? formatDuration(data.avgCompletionTime) : "0h",
      icon: Clock,
      color: "text-orange-600",
      bgColor: "bg-orange-50",
      borderColor: "border-orange-200",
      description: "Average time to complete",
      trend: timeChange,
      trendLabel: "from last period",
      trendInverted: true, // Lower time is better
    },
    {
      title: "Completion Rate",
      value: data ? formatPercentage(data.completionRate) : "0%",
      icon: Target,
      color: "text-purple-600",
      bgColor: "bg-purple-50",
      borderColor: "border-purple-200",
      description: `${data?.completedRequests || 0} of ${
        data?.totalRequests || 0
      } completed`,
      trend: completionChange,
      trendLabel: "from last period",
    },
  ];

  const getTrendIndicator = (
    trend: { value: string; isPositive: boolean },
    inverted = false
  ) => {
    const isGood = inverted ? !trend.isPositive : trend.isPositive;
    const Icon = trend.isPositive ? TrendingUp : TrendingDown;
    const colorClass = isGood ? "text-green-600" : "text-red-600";

    return (
      <div className={`flex items-center text-xs ${colorClass}`}>
        <Icon className="h-3 w-3 mr-1" />
        <span>{trend.value}%</span>
      </div>
    );
  };

  if (!data) {
    return (
      <AnalyticsCardGrid>
        {[...Array(4)].map((_, i) => (
          <Card
            key={i}
            className="animate-pulse hover:shadow-md transition-shadow"
          >
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <div className="h-4 bg-gray-200 rounded w-3/4"></div>
              <div className="h-4 w-4 bg-gray-200 rounded"></div>
            </CardHeader>
            <CardContent>
              <div className="h-8 bg-gray-200 rounded w-1/2 mb-2"></div>
              <div className="h-3 bg-gray-200 rounded w-full"></div>
            </CardContent>
          </Card>
        ))}
      </AnalyticsCardGrid>
    );
  }

  return (
    <div className="space-y-4">
      {/* Main Metrics Cards */}
      <AnalyticsCardGrid>
        <AnalyticsCard
          title="Total Requests"
          value={data.totalRequests}
          description={`${data.pendingRequests} pending, ${data.inProgressRequests} in progress`}
          icon={Wrench}
          iconColor="primary"
          trend={{
            value: `${requestsChange.value}% from last period`,
            isPositive: requestsChange.isPositive,
            icon: requestsChange.isPositive ? TrendingUp : TrendingDown,
          }}
        />

        <AnalyticsCard
          title="Total Cost"
          value={formatCurrency(data.totalCost)}
          description={`Avg: ${formatCurrency(data.avgCost)} per request`}
          icon={DollarSign}
          iconColor="success"
          trend={{
            value: `${costChange.value}% from last period`,
            isPositive: !costChange.isPositive, // Lower cost is better
            icon: costChange.isPositive ? TrendingUp : TrendingDown,
          }}
        />

        <AnalyticsCard
          title="Avg Completion Time"
          value={formatDuration(data.avgCompletionTime)}
          description="Average time to complete"
          icon={Timer}
          iconColor="warning"
          trend={{
            value: `${timeChange.value}% from last period`,
            isPositive: !timeChange.isPositive, // Lower time is better
            icon: timeChange.isPositive ? TrendingUp : TrendingDown,
          }}
        />

        <AnalyticsCard
          title="Completion Rate"
          value={formatPercentage(data.completionRate)}
          description={`${data.completedRequests} completed requests`}
          icon={Target}
          iconColor="info"
          trend={{
            value: `${completionChange.value}% from last period`,
            isPositive: completionChange.isPositive,
            icon: completionChange.isPositive ? TrendingUp : TrendingDown,
          }}
        />
      </AnalyticsCardGrid>

      {/* Status Overview */}
      <div className="grid gap-4 md:grid-cols-3">
        <AnalyticsCard
          title="Pending Requests"
          value={data.pendingRequests}
          description="Awaiting assignment or approval"
          icon={AlertTriangle}
          iconColor="warning"
        />

        <AnalyticsCard
          title="In Progress"
          value={data.inProgressRequests}
          description="Currently being worked on"
          icon={Timer}
          iconColor="info"
        />

        <AnalyticsCard
          title="Completed"
          value={data.completedRequests}
          description="Successfully resolved"
          icon={CheckCircle}
          iconColor="success"
        />
      </div>
    </div>
  );
}
