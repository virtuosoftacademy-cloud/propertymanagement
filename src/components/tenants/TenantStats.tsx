"use client";

import { useMemo } from "react";
import {
  Users,
  UserCheck,
  Clock,
  CheckCircle,
  XCircle,
  CreditCard,
  TrendingUp,
  TrendingDown,
  Calendar,
} from "lucide-react";
import {
  AnalyticsCard,
  AnalyticsCardGrid,
} from "@/components/analytics/AnalyticsCard";
import { formatCurrency } from "@/lib/utils/formatting";
import type { TenantRecord } from "./types";
import { useLocalizationContext } from "@/components/providers/LocalizationProvider";

const currencyDisplayOptions = {
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
} as const;

type Tenant = TenantRecord;

interface TenantStatsProps {
  tenants: Tenant[];
}

export default function TenantStats({ tenants }: TenantStatsProps) {
  const { t } = useLocalizationContext();

  const stats = useMemo(() => {
    if (!tenants.length) {
      return {
        total: 0,
        active: 0,
        pending: 0,
        movedOut: 0,
        approved: 0,
        rejected: 0,
        averageCreditScore: 0,
        averageIncome: 0,
        thisMonthApplications: 0,
        lastMonthApplications: 0,
      };
    }

    const now = new Date();
    const thisMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const lastMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0);

    const active = tenants.filter((t) => t.tenantStatus === "active").length;
    const pending = tenants.filter(
      (t) =>
        t.tenantStatus === "application_submitted" ||
        t.tenantStatus === "under_review"
    ).length;
    const movedOut = tenants.filter(
      (t) => t.tenantStatus === "moved_out"
    ).length;
    const approved = tenants.filter(
      (t) => t.tenantStatus === "approved"
    ).length;
    const rejected = tenants.filter(
      (t) => t.tenantStatus === "terminated"
    ).length;

    const tenantsWithCreditScore = tenants.filter((t) => t.creditScore);
    const averageCreditScore =
      tenantsWithCreditScore.length > 0
        ? Math.round(
            tenantsWithCreditScore.reduce(
              (sum, t) => sum + (t.creditScore || 0),
              0
            ) / tenantsWithCreditScore.length
          )
        : 0;

    const tenantsWithIncome = tenants.filter((t) => t.employmentInfo?.income);
    const averageIncome =
      tenantsWithIncome.length > 0
        ? Math.round(
            tenantsWithIncome.reduce(
              (sum, t) => sum + (t.employmentInfo?.income || 0),
              0
            ) / tenantsWithIncome.length
          )
        : 0;

    const thisMonthApplications = tenants.filter(
      (t) => new Date(t.applicationDate) >= thisMonth
    ).length;

    const lastMonthApplications = tenants.filter((t) => {
      const appDate = new Date(t.applicationDate);
      return appDate >= lastMonth && appDate <= lastMonthEnd;
    }).length;

    return {
      total: tenants.length,
      active,
      pending,
      movedOut,
      approved,
      rejected,
      averageCreditScore,
      averageIncome,
      thisMonthApplications,
      lastMonthApplications,
    };
  }, [tenants]);

  const getApplicationTrend = () => {
    if (stats.lastMonthApplications === 0) {
      return { trend: "neutral", percentage: 0 };
    }

    const change =
      ((stats.thisMonthApplications - stats.lastMonthApplications) /
        stats.lastMonthApplications) *
      100;
    return {
      trend: change > 0 ? "up" : change < 0 ? "down" : "neutral",
      percentage: Math.abs(Math.round(change)),
    };
  };

  const applicationTrend = getApplicationTrend();

  const getCreditScoreLabel = () => {
    if (stats.averageCreditScore >= 700) {
      return t("tenants.stats.creditScore.excellent");
    } else if (stats.averageCreditScore >= 600) {
      return t("tenants.stats.creditScore.good");
    } else {
      return t("tenants.stats.creditScore.fair");
    }
  };

  return (
    <AnalyticsCardGrid className="lg:grid-cols-4">
      <AnalyticsCard
        title={t("tenants.stats.total.title")}
        value={stats.total}
        description={t("tenants.stats.total.description")}
        icon={Users}
        iconColor="primary"
      />

      <AnalyticsCard
        title={t("tenants.stats.active.title")}
        value={stats.active}
        description={t("tenants.stats.active.description")}
        icon={UserCheck}
        iconColor="success"
      />

      <AnalyticsCard
        title={t("tenants.stats.pending.title")}
        value={stats.pending}
        description={t("tenants.stats.pending.description")}
        icon={Clock}
        iconColor="warning"
      />

      <AnalyticsCard
        title={t("tenants.stats.avgCreditScore.title")}
        value={stats.averageCreditScore}
        description={t("tenants.stats.avgCreditScore.description", {
          values: { rating: getCreditScoreLabel() },
        })}
        icon={CreditCard}
        iconColor="info"
      />

      <AnalyticsCard
        title={t("tenants.stats.approved.title")}
        value={stats.approved}
        description={t("tenants.stats.approved.description")}
        icon={CheckCircle}
        iconColor="success"
      />

      <AnalyticsCard
        title={t("tenants.stats.rejected.title")}
        value={stats.rejected}
        description={t("tenants.stats.rejected.description")}
        icon={XCircle}
        iconColor="error"
      />

      <AnalyticsCard
        title={t("tenants.stats.avgIncome.title")}
        value={
          stats.averageIncome > 0
            ? formatCurrency(
                stats.averageIncome,
                undefined,
                currencyDisplayOptions
              )
            : t("tenants.stats.avgIncome.notAvailable")
        }
        description={t("tenants.stats.avgIncome.description")}
        icon={TrendingUp}
        iconColor="success"
      />

      <AnalyticsCard
        title={t("tenants.stats.thisMonth.title")}
        value={stats.thisMonthApplications}
        description={t("tenants.stats.thisMonth.description")}
        icon={Calendar}
        iconColor="info"
        trend={
          applicationTrend.trend !== "neutral"
            ? {
                value: t("tenants.stats.thisMonth.trend", {
                  values: { percentage: applicationTrend.percentage },
                }),
                isPositive: applicationTrend.trend === "up",
                icon:
                  applicationTrend.trend === "up" ? TrendingUp : TrendingDown,
              }
            : undefined
        }
      />
    </AnalyticsCardGrid>
  );
}
