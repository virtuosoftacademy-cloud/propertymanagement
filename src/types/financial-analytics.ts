/**
 * PropertyPro - Financial Analytics Types
 * Comprehensive type definitions for financial analytics and reporting
 */

// ============================================================================
// CORE FINANCIAL ANALYTICS TYPES
// ============================================================================

export interface FinancialKPIs {
  totalRevenue: number;
  totalExpected: number;
  totalPayments: number;
  completedPayments: number;
  overdueAmount: number;
  averagePaymentAmount: number;
  lateFeeRevenue: number;
  collectionRate: number;
  profitMargin: number;
  roi: number;
}

export interface RevenueTrend {
  _id: {
    year: number;
    month: number;
  };
  revenue: number;
  paymentCount: number;
  averageAmount: number;
}

export interface PaymentMethodBreakdown {
  _id: string;
  count: number;
  totalAmount: number;
  averageAmount: number;
}

export interface PropertyPerformanceData {
  _id: string;
  propertyName: string;
  propertyType?: string;
  totalRevenue: number;
  totalExpected: number;
  paymentCount: number;
  overdueAmount: number;
  averageRent: number;
  collectionRate: number;
  occupancyRate: number;
  roi: number;
}

// ============================================================================
// PROFIT & LOSS TYPES
// ============================================================================

export interface ProfitLossSummary {
  totalRevenue: number;
  totalExpenses: number;
  netIncome: number;
  profitMargin: number;
}

export interface RevenueBreakdown {
  _id: string;
  totalAmount: number;
  count: number;
}

export interface ExpenseBreakdown {
  _id: string;
  totalAmount: number;
  count: number;
}

export interface MonthlyPL {
  _id: {
    year: number;
    month: number;
  };
  revenue: number;
  expenses: number;
  netIncome: number;
  paymentCount: number;
}

// ============================================================================
// CASH FLOW TYPES
// ============================================================================

export interface CashInflow {
  _id: {
    year: number;
    month: number;
  };
  totalInflow: number;
  rentInflow: number;
  feeInflow: number;
  transactionCount: number;
}

export interface CashOutflow {
  _id: {
    year: number;
    month: number;
  };
  totalOutflow: number;
  maintenanceOutflow: number;
  operatingOutflow: number;
  netCashFlow: number;
}

export interface CashFlowProjection {
  _id: {
    year: number;
    month: number;
  };
  projectedInflow: number;
  projectedOutflow: number;
  projectedNetFlow: number;
}

export interface CashFlowSummary {
  totalInflows: number;
  totalOutflows: number;
  netCashFlow: number;
}

// ============================================================================
// PROPERTY PERFORMANCE TYPES
// ============================================================================

export interface PropertyBenchmarks {
  averageCollectionRate: number;
  averageROI: number;
  totalPortfolioRevenue: number;
  bestPerformer: PropertyPerformanceData;
  worstPerformer: PropertyPerformanceData;
}

// ============================================================================
// EXPENSE ANALYSIS TYPES
// ============================================================================

export interface ExpenseCategory {
  category: string;
  amount: number;
  percentage: number;
  trend: "up" | "down" | "stable";
}

export interface MonthlyExpense {
  _id: {
    year: number;
    month: number;
  };
  revenue: number;
  estimatedExpenses: number;
  maintenanceExpenses: number;
  operatingExpenses: number;
}

export interface ExpenseSummary {
  totalExpenses: number;
  totalRevenue: number;
  expenseRatio: number;
  netIncome: number;
}

// ============================================================================
// API RESPONSE TYPES
// ============================================================================

export interface AnalyticsReportResponse {
  kpis: FinancialKPIs;
  revenueTrends: RevenueTrend[];
  paymentMethodBreakdown: PaymentMethodBreakdown[];
  period: {
    startDate: string;
    endDate: string;
  };
}

export interface ProfitLossReportResponse {
  summary: ProfitLossSummary;
  revenueBreakdown: RevenueBreakdown[];
  expenseBreakdown: ExpenseBreakdown[];
  monthlyPL: MonthlyPL[];
  period: {
    startDate: string;
    endDate: string;
  };
}

export interface CashFlowReportResponse {
  cashInflows: CashInflow[];
  cashOutflows: CashOutflow[];
  projections: CashFlowProjection[];
  summary: CashFlowSummary;
  period: {
    startDate: string;
    endDate: string;
  };
}

export interface PropertyPerformanceReportResponse {
  propertyPerformance: PropertyPerformanceData[];
  benchmarks: PropertyBenchmarks;
  period: {
    startDate: string;
    endDate: string;
  };
}

export interface ExpenseAnalysisReportResponse {
  summary: ExpenseSummary;
  expenseCategories: ExpenseCategory[];
  monthlyExpenses: MonthlyExpense[];
  insights: string[];
  period: {
    startDate: string;
    endDate: string;
  };
}

// ============================================================================
// COMPONENT PROPS TYPES
// ============================================================================

export interface FinancialAnalyticsPageProps {
  initialData?: AnalyticsReportResponse;
}

export interface KPIDashboardProps {
  kpis: FinancialKPIs;
  isLoading?: boolean;
}

export interface RevenueChartProps {
  data: RevenueTrend[];
  height?: number;
  showProjections?: boolean;
}

export interface ExpenseChartProps {
  data: ExpenseCategory[];
  height?: number;
}

export interface CashFlowChartProps {
  inflows: CashInflow[];
  outflows: CashOutflow[];
  projections?: CashFlowProjection[];
  height?: number;
}

export interface PropertyComparisonProps {
  properties: PropertyPerformanceData[];
  benchmarks: PropertyBenchmarks;
}

// ============================================================================
// FILTER AND EXPORT TYPES
// ============================================================================

export interface FinancialAnalyticsFilters {
  startDate: Date;
  endDate: Date;
  propertyId?: string;
  reportType:
    | "analytics"
    | "profit-loss"
    | "cash-flow"
    | "property-performance"
    | "expense-analysis";
}

export interface ExportOptions {
  format: "pdf" | "excel" | "csv";
  includeCharts: boolean;
  dateRange: {
    start: Date;
    end: Date;
  };
}

// ============================================================================
// CHART DATA TYPES
// ============================================================================

export interface ChartDataPoint {
  name: string;
  value: number;
  color?: string;
  trend?: "up" | "down" | "stable";
}

export interface TimeSeriesDataPoint {
  date: string;
  value: number;
  category?: string;
}

export interface ComparisonDataPoint {
  name: string;
  current: number;
  previous: number;
  target?: number;
}

// ============================================================================
// FINANCIAL ACTION TYPES
// ============================================================================

export type FinancialActionStatus = "pending" | "in-progress" | "completed";

export type FinancialActionPriority = "low" | "medium" | "high";

export type FinancialActionCategory =
  | "revenue"
  | "collections"
  | "profitability"
  | "cash-flow"
  | "expenses"
  | "portfolio"
  | "risk"
  | "general";

export type FinancialActionReportType =
  | "analytics"
  | "profit-loss"
  | "cash-flow"
  | "property-performance"
  | "expense-analysis"
  | "summary";

export interface FinancialActionInput {
  title: string;
  description?: string;
  status?: FinancialActionStatus;
  priority?: FinancialActionPriority;
  category?: FinancialActionCategory;
  reportType?: FinancialActionReportType;
  dueDate?: string | Date;
  propertyId?: string;
  tags?: string[];
}

export interface FinancialAction extends FinancialActionInput {
  _id: string;
  status: FinancialActionStatus;
  priority: FinancialActionPriority;
  category: FinancialActionCategory;
  reportType: FinancialActionReportType;
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
  dueDate?: string;
  propertyId?:
    | string
    | {
        _id: string;
        name?: string;
      };
  createdBy?:
    | {
        _id: string;
        firstName?: string;
        lastName?: string;
        email?: string;
      }
    | string;
  updatedBy?: string;
}

export interface FinancialActionFilters {
  status?: FinancialActionStatus;
  priority?: FinancialActionPriority;
  category?: FinancialActionCategory;
  reportType?: FinancialActionReportType;
  propertyId?: string;
  search?: string;
  page?: number;
  limit?: number;
}
