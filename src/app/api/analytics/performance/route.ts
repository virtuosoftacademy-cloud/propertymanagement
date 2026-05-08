export const dynamic = "force-dynamic";

import { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import { performanceAnalyticsService } from "@/lib/services/performance-analytics.service";
import { UserRole } from "@/types";
import {
  createSuccessResponse as createApiSuccessResponse,
  createErrorResponse as createApiErrorResponse,
} from "@/lib/api-utils";

// Local helper (file scope) for benchmark scoring
function calculateBenchmarkScore(benchmarks: any[]): number {
  if (!Array.isArray(benchmarks) || benchmarks.length === 0) return 0;
  let score = 0;
  benchmarks.forEach((benchmark) => {
    if (benchmark?.status === "above") score += 100;
    else if (benchmark?.status === "at") score += 80;
    else score += 50;
  });
  return Math.round(score / benchmarks.length);
}

// Helper functions
function createSuccessResponse(
  data: any,
  message: string,
  status: number = 200
) {
  return createApiSuccessResponse(data, message);
}

function createErrorResponse(message: string, status: number = 400) {
  return createApiErrorResponse(message, status, message);
}

export async function GET(request: NextRequest) {
  try {
    // Get session
    const session = await auth();
    if (!session?.user) {
      return createErrorResponse("Authentication required", 401);
    }

    const userRole = (session.user.role as UserRole) || UserRole.TENANT;

    // Only admins and managers can access analytics
    if (![UserRole.ADMIN, UserRole.MANAGER].includes(userRole)) {
      return createErrorResponse("Insufficient permissions", 403);
    }

    // Parse query parameters
    const { searchParams } = new URL(request.url);
    const reportType = searchParams.get("type") || "current";
    const startDate = searchParams.get("startDate");
    const endDate = searchParams.get("endDate");
    const includeRecommendations =
      searchParams.get("recommendations") === "true";

    if (reportType === "current") {
      // Get current performance metrics
      const currentMetrics =
        await performanceAnalyticsService.collectCurrentMetrics();

      return createSuccessResponse(
        {
          metrics: currentMetrics,
          timestamp: new Date().toISOString(),
          type: "current",
        },
        "Current performance metrics retrieved successfully"
      );
    }

    if (reportType === "report") {
      // Generate comprehensive analytics report
      const start = startDate
        ? new Date(startDate)
        : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
      const end = endDate ? new Date(endDate) : new Date();

      const report = await performanceAnalyticsService.generateAnalyticsReport(
        start,
        end
      );

      let responseData: any = {
        report,
        generatedAt: new Date().toISOString(),
        type: "comprehensive",
      };

      if (includeRecommendations) {
        const recommendations =
          performanceAnalyticsService.generateOptimizationRecommendations(
            report
          );
        responseData.recommendations = recommendations;
      }

      return createSuccessResponse(
        responseData,
        "Analytics report generated successfully"
      );
    }

    if (reportType === "historical") {
      // Get historical metrics
      const days = parseInt(searchParams.get("days") || "30");
      const historicalData =
        performanceAnalyticsService.getHistoricalMetrics(days);

      return createSuccessResponse(
        {
          historical: Object.fromEntries(historicalData),
          period: `${days} days`,
          type: "historical",
        },
        "Historical metrics retrieved successfully"
      );
    }

    return createErrorResponse("Invalid report type specified", 400);
  } catch (error) {
    return createErrorResponse(
      error instanceof Error ? error.message : "Internal server error",
      500
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    // Get session
    const session = await auth();
    if (!session?.user) {
      return createErrorResponse("Authentication required", 401);
    }

    const userRole = (session.user.role as UserRole) || UserRole.TENANT;

    // Only super admins and property managers can store analytics
    if (![UserRole.ADMIN, UserRole.MANAGER].includes(userRole)) {
      return createErrorResponse("Insufficient permissions", 403);
    }

    // Parse request body
    const body = await request.json();
    const { action, data } = body;

    if (action === "store-metrics") {
      // Store current metrics for historical analysis
      const currentMetrics =
        await performanceAnalyticsService.collectCurrentMetrics();
      const timestamp = new Date();

      performanceAnalyticsService.storeMetrics(timestamp, currentMetrics);

      return createSuccessResponse(
        {
          stored: true,
          timestamp: timestamp.toISOString(),
          metrics: currentMetrics,
        },
        "Performance metrics stored successfully"
      );
    }

    if (action === "generate-optimization-report") {
      // Generate optimization recommendations
      const startDate = data?.startDate
        ? new Date(data.startDate)
        : new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
      const endDate = data?.endDate ? new Date(data.endDate) : new Date();

      const report = await performanceAnalyticsService.generateAnalyticsReport(
        startDate,
        endDate
      );
      const recommendations =
        performanceAnalyticsService.generateOptimizationRecommendations(report);

      return createSuccessResponse(
        {
          report,
          recommendations,
          optimizationPlan: {
            highPriority: recommendations.filter((r) => r.priority === "high"),
            mediumPriority: recommendations.filter(
              (r) => r.priority === "medium"
            ),
            lowPriority: recommendations.filter((r) => r.priority === "low"),
          },
          generatedAt: new Date().toISOString(),
        },
        "Optimization report generated successfully"
      );
    }

    if (action === "benchmark-comparison") {
      // Compare current metrics to benchmarks
      const currentMetrics =
        await performanceAnalyticsService.collectCurrentMetrics();
      const report = await performanceAnalyticsService.generateAnalyticsReport(
        new Date(Date.now() - 24 * 60 * 60 * 1000),
        new Date()
      );

      const benchmarkAnalysis = {
        metrics: currentMetrics,
        benchmarks: report.benchmarks,
        summary: {
          aboveBenchmark: report.benchmarks.filter((b) => b.status === "above")
            .length,
          atBenchmark: report.benchmarks.filter((b) => b.status === "at")
            .length,
          belowBenchmark: report.benchmarks.filter((b) => b.status === "below")
            .length,
          totalBenchmarks: report.benchmarks.length,
        },
        overallScore: calculateBenchmarkScore(report.benchmarks),
      };

      return createSuccessResponse(
        benchmarkAnalysis,
        "Benchmark comparison completed successfully"
      );
    }

    return createErrorResponse("Invalid action specified", 400);
  } catch (error) {
    return createErrorResponse(
      error instanceof Error ? error.message : "Internal server error",
      500
    );
  }
}
