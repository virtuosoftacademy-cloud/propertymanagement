"use client";

/**
 * Subscription analytics — ADMIN only.
 *
 * The guard is inherited from src/app/dashboard/admin/billing/layout.tsx, which
 * matters here: this is revenue data and managers must not see it.
 *
 * UI ONLY. Figures are derived from the mock fixtures so the charts and the
 * cards agree with the Manager Accounts list rather than telling a different
 * story.
 */

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  ArrowLeft,
  CalendarClock,
  Download,
  PoundSterling,
  TrendingDown,
  TrendingUp,
  Users,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AnalyticsCard,
  AnalyticsCardGrid,
} from "@/components/analytics/AnalyticsCard";
import { useManagerAnalytics } from "@/hooks/useManagerBilling";
import { MANAGER_PLANS, monthlyEquivalent, resolvePlan } from "@/lib/billing/plans";
import { downloadCsv, downloadPdf, exportFilename } from "@/lib/utils/export";

// Distinct hues per status, reused by the pie and its legend.
const STATUS_COLOURS: Record<string, string> = {
  active: "#10b981",
  pending: "#f59e0b",
  past_due: "#ef4444",
  cancelled: "#6b7280",
  expired: "#8b5cf6",
};

const PLAN_COLOURS = ["#3b82f6", "#10b981", "#f59e0b", "#8b5cf6", "#ec4899"];

const money = (value: number) =>
  `£${value.toLocaleString("en-GB", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  })}`;

const formatDate = (value?: string | null) => {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : date.toLocaleDateString("en-GB");
};

export default function SubscriptionAnalyticsPage() {
  const router = useRouter();
  const [isExporting, setIsExporting] = useState(false);

  const { data, loading, error: loadError, refetch } = useManagerAnalytics();
  const accounts = data?.accounts ?? [];
  const history = data?.history ?? [];

  const metrics = useMemo(() => {
    const active = accounts.filter((a) => a.status === "active");
    const cancelled = accounts.filter((a) => a.status === "cancelled");
    const pastDue = accounts.filter((a) => a.status === "past_due");

    const mrr = active.reduce(
      (sum, a) => sum + monthlyEquivalent(a.amount, a.billingCycle),
      0
    );

    // Renewals inside the next 90 days, from the newest history point rather
    // than the wall clock so the page reads consistently against the fixtures.
    const now = new Date(`${history[history.length - 1].month}-01T00:00:00Z`);
    const horizon = new Date(now);
    horizon.setUTCDate(horizon.getUTCDate() + 90);

    const upcoming = active
      .filter((a) => {
        if (!a.renewsAt) return false;
        const due = new Date(a.renewsAt);
        return due >= now && due <= horizon;
      })
      .sort(
        (a, b) =>
          new Date(a.renewsAt!).getTime() - new Date(b.renewsAt!).getTime()
      );

    return {
      mrr,
      arr: mrr * 12,
      // Average revenue per account — flat MRR can hide a shift between many
      // cheap accounts and a few expensive ones.
      arpa: active.length > 0 ? mrr / active.length : 0,
      activeCount: active.length,
      totalCount: accounts.length,
      churnRate:
        accounts.length > 0 ? (cancelled.length / accounts.length) * 100 : 0,
      outstanding: pastDue.reduce((sum, a) => sum + a.amount, 0),
      pastDueCount: pastDue.length,
      upcoming,
      upcomingValue: upcoming.reduce((sum, a) => sum + a.amount, 0),
    };
  }, [accounts, history]);

  const byPlan = useMemo(
    () =>
      MANAGER_PLANS.map((plan) => {
        const rows = accounts.filter(
          (a) => a.planId === plan.id && a.status === "active"
        );
        return {
          name: plan.name,
          accounts: rows.length,
          mrr: Math.round(
            rows.reduce(
              (sum, a) => sum + monthlyEquivalent(a.amount, a.billingCycle),
              0
            )
          ),
        };
      }).filter((row) => row.accounts > 0),
    [accounts]
  );

  const byStatus = useMemo(() => {
    const counts = new Map<string, number>();
    for (const account of accounts) {
      counts.set(account.status, (counts.get(account.status) ?? 0) + 1);
    }
    return Array.from(counts.entries()).map(([status, value]) => ({
      name: status.replace(/_/g, " "),
      status,
      value,
    }));
  }, [accounts]);

  const trendDelta = useMemo(() => {
    if (history.length < 2) return 0;
    const latest = history[history.length - 1].mrr;
    const previous = history[history.length - 2].mrr;
    if (previous === 0) return 0;
    return ((latest - previous) / previous) * 100;
  }, [history]);

  // ─── Export ───────────────────────────────────────────────────────────────
  const exportRows = () =>
    accounts.map((account) => ({
      Client: account.clientName,
      Company: account.companyName ?? "—",
      Plan: resolvePlan(account.planId)?.name ?? account.planId,
      Cycle: account.billingCycle,
      Amount: `£${account.amount.toFixed(2)}`,
      "Monthly equivalent": `£${monthlyEquivalent(
        account.amount,
        account.billingCycle
      ).toFixed(2)}`,
      Status: account.status.replace(/_/g, " "),
      Renews: formatDate(account.renewsAt),
    }));

  const exportColumns = [
    { key: "Client", label: "Client", width: 120 },
    { key: "Company", label: "Company", width: 120 },
    { key: "Plan", label: "Plan", width: 80 },
    { key: "Cycle", label: "Cycle", width: 70 },
    { key: "Amount", label: "Amount", width: 80 },
    { key: "Monthly equivalent", label: "Monthly equiv.", width: 100 },
    { key: "Status", label: "Status", width: 85 },
    { key: "Renews", label: "Renews", width: 80 },
  ];

  const exportSubtitle = () =>
    [
      `${metrics.activeCount} active of ${metrics.totalCount} accounts`,
      `${money(metrics.mrr)} MRR`,
      `${money(metrics.arr)} ARR`,
      `${money(metrics.outstanding)} outstanding`,
      `generated ${new Date().toLocaleString("en-GB")}`,
    ].join(" · ");

  const handleExportCsv = () => {
    const count = downloadCsv(
      exportRows(),
      exportFilename("subscription-analytics", "csv")
    );
    if (count === 0) {
      toast.error("There is nothing to export.");
      return;
    }
    toast.success(`Exported ${count} account(s) to CSV.`);
  };

  const handleExportPdf = async () => {
    try {
      setIsExporting(true);
      const count = await downloadPdf(exportRows(), exportColumns, {
        title: "Subscription Analytics",
        filename: exportFilename("subscription-analytics", "pdf"),
        subtitle: exportSubtitle(),
      });
      if (count === 0) {
        toast.error("There is nothing to export.");
        return;
      }
      toast.success(`Exported ${count} account(s) to PDF.`);
    } catch (error) {
      console.error("[subscription analytics] PDF export failed:", error);
      toast.error("Failed to generate the PDF export.");
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="space-y-1">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => router.push("/dashboard/admin/billing")}
          className="-ml-2 flex items-center gap-2"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Manager Accounts
        </Button>

        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h1 className="flex items-center gap-2 text-3xl font-bold tracking-tight">
              <TrendingUp className="h-7 w-7" />
              Subscription Analytics
            </h1>
            <p className="text-muted-foreground">
              Revenue from manager accounts sold to clients.
            </p>
          </div>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="outline"
                disabled={isExporting || accounts.length === 0}
              >
                <Download className="mr-2 h-4 w-4" />
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
        </div>
      </div>

      {/* KPIs */}
      {loadError && (
        <div className="flex items-center justify-between gap-4 rounded-md border border-destructive/40 bg-destructive/5 px-4 py-3 text-sm">
          <span className="text-destructive">
            Could not load analytics: {loadError}
          </span>
          <Button variant="outline" size="sm" onClick={() => void refetch()}>
            Try again
          </Button>
        </div>
      )}

      {loading && !data && (
        <p className="text-sm text-muted-foreground">Loading analytics…</p>
      )}

      {/* The trend is reconstructed from the payments ledger — there is no event
          log of past subscription states — so it only covers months that
          actually have recorded payments. Say so rather than letting a short
          series read as a collapse in revenue. */}
      {!loading && history.length > 0 && history.length < 12 && (
        <p className="rounded-md border bg-muted/40 px-4 py-3 text-sm text-muted-foreground">
          Showing {history.length} month{history.length === 1 ? "" : "s"} of
          history — the trend is derived from recorded payments and will extend
          as more are taken.
        </p>
      )}

      <AnalyticsCardGrid className="lg:grid-cols-4">
        <AnalyticsCard
          title="Monthly recurring revenue"
          value={money(metrics.mrr)}
          description={
            trendDelta === 0
              ? "Flat on last month"
              : `${trendDelta > 0 ? "+" : ""}${trendDelta.toFixed(1)}% on last month`
          }
          icon={PoundSterling}
          iconColor={trendDelta < 0 ? "error" : "success"}
        />
        <AnalyticsCard
          title="Annual run rate"
          value={money(metrics.arr)}
          description="MRR × 12"
          icon={TrendingUp}
          iconColor="info"
        />
        <AnalyticsCard
          title="Active accounts"
          value={metrics.activeCount.toLocaleString("en-GB")}
          description={`${metrics.totalCount} sold in total`}
          icon={Users}
          iconColor="primary"
        />
        <AnalyticsCard
          title="Average per account"
          value={money(metrics.arpa)}
          description="MRR ÷ active accounts"
          icon={PoundSterling}
          iconColor="info"
        />
      </AnalyticsCardGrid>

      <AnalyticsCardGrid className="lg:grid-cols-3">
        <AnalyticsCard
          title="Outstanding"
          value={money(metrics.outstanding)}
          description={
            metrics.pastDueCount > 0
              ? `${metrics.pastDueCount} account(s) past due`
              : "All settled"
          }
          icon={TrendingDown}
          iconColor={metrics.outstanding > 0 ? "error" : "success"}
        />
        <AnalyticsCard
          title="Churn rate"
          value={`${metrics.churnRate.toFixed(1)}%`}
          description="Cancelled as a share of all accounts"
          icon={TrendingDown}
          iconColor={metrics.churnRate > 10 ? "warning" : "success"}
        />
        <AnalyticsCard
          title="Renewals next 90 days"
          value={metrics.upcoming.length.toLocaleString("en-GB")}
          description={`${money(metrics.upcomingValue)} due`}
          icon={CalendarClock}
          iconColor="warning"
        />
      </AnalyticsCardGrid>

      {/* MRR trend */}
      <Card className="border-0 shadow-lg bg-linear-to-br from-white to-gray-50/50 dark:from-primary/10 dark:to-background">
        <CardHeader>
          <CardTitle>Revenue trend</CardTitle>
          <CardDescription>
            Monthly recurring revenue over the last 12 months.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={280}>
            <AreaChart data={history}>
              <defs>
                <linearGradient id="mrrFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.35} />
                  <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
              <XAxis dataKey="label" fontSize={12} tickLine={false} />
              <YAxis
                fontSize={12}
                tickLine={false}
                tickFormatter={(v) => `£${v}`}
              />
              {/* recharts types the value as string | number | array, so the
                  parameter cannot be narrowed to number here. */}
              <Tooltip
                formatter={(value: any) => [money(Number(value)), "MRR"]}
                labelFormatter={(label) => `Month: ${label}`}
              />
              <Area
                type="monotone"
                dataKey="mrr"
                stroke="#3b82f6"
                strokeWidth={2}
                fill="url(#mrrFill)"
              />
            </AreaChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Revenue by plan */}
        <Card className="border-0 shadow-lg bg-linear-to-br from-white to-gray-50/50 dark:from-primary/10 dark:to-background">
          <CardHeader>
            <CardTitle>Revenue by plan</CardTitle>
            <CardDescription>
              Monthly equivalent from active accounts.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {byPlan.length === 0 ? (
              <p className="text-muted-foreground py-12 text-center text-sm">
                No active accounts.
              </p>
            ) : (
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={byPlan}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis dataKey="name" fontSize={12} tickLine={false} />
                  <YAxis
                    fontSize={12}
                    tickLine={false}
                    tickFormatter={(v) => `£${v}`}
                  />
                  <Tooltip
                    formatter={(value: any, name: any) => [
                      name === "mrr" ? money(Number(value)) : value,
                      name === "mrr" ? "MRR" : "Accounts",
                    ]}
                  />
                  <Bar dataKey="mrr" radius={[4, 4, 0, 0]}>
                    {byPlan.map((_, index) => (
                      <Cell
                        key={index}
                        fill={PLAN_COLOURS[index % PLAN_COLOURS.length]}
                      />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        {/* Accounts by status */}
        <Card className="border-0 shadow-lg bg-linear-to-br from-white to-gray-50/50 dark:from-primary/10 dark:to-background">
          <CardHeader>
            <CardTitle>Accounts by status</CardTitle>
            <CardDescription>Every account sold, by state.</CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={260}>
              <PieChart>
                <Pie
                  data={byStatus}
                  dataKey="value"
                  nameKey="name"
                  cx="50%"
                  cy="50%"
                  outerRadius={90}
                  label={(entry: any) => `${entry.name}: ${entry.value}`}
                >
                  {byStatus.map((entry) => (
                    <Cell
                      key={entry.status}
                      fill={STATUS_COLOURS[entry.status] ?? "#94a3b8"}
                    />
                  ))}
                </Pie>
                <Tooltip />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      {/* Growth */}
      <Card className="border-0 shadow-lg bg-linear-to-br from-white to-gray-50/50 dark:from-primary/10 dark:to-background">
        <CardHeader>
          <CardTitle>New and cancelled accounts</CardTitle>
          <CardDescription>
            What is driving the trend above, month by month.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={history}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
              <XAxis dataKey="label" fontSize={12} tickLine={false} />
              <YAxis fontSize={12} tickLine={false} allowDecimals={false} />
              <Tooltip />
              <Legend />
              <Bar
                dataKey="newAccounts"
                name="New"
                fill="#10b981"
                radius={[4, 4, 0, 0]}
              />
              <Bar
                dataKey="cancelledAccounts"
                name="Cancelled"
                fill="#ef4444"
                radius={[4, 4, 0, 0]}
              />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      {/* Upcoming renewals */}
      <Card className="border-0 shadow-lg bg-linear-to-br from-white to-gray-50/50 dark:from-primary/10 dark:to-background">
        <CardHeader>
          <CardTitle>Upcoming renewals</CardTitle>
          <CardDescription>
            Active accounts due to pay in the next 90 days.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {metrics.upcoming.length === 0 ? (
            <p className="text-muted-foreground py-8 text-center text-sm">
              No renewals in the next 90 days.
            </p>
          ) : (
            <div className="space-y-2">
              {metrics.upcoming.map((account) => (
                <div
                  key={account.id}
                  className="flex items-center justify-between gap-4 rounded-lg border p-3"
                >
                  <div className="min-w-0">
                    <p className="truncate font-medium">{account.clientName}</p>
                    <p className="text-muted-foreground text-xs">
                      {resolvePlan(account.planId)?.name ?? account.planId} ·{" "}
                      {account.billingCycle}
                    </p>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <span className="font-medium">
                      £{account.amount.toLocaleString("en-GB")}
                    </span>
                    <Badge variant="outline">
                      {formatDate(account.renewsAt)}
                    </Badge>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
