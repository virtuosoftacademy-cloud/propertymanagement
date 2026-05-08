/**
 * PropertyPro - Applications API Routes
 * CRUD operations for tenant applications
 */

export const dynamic = "force-dynamic";

import { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import connectDB from "@/lib/mongodb";
import { Application, Property, User } from "@/models";
import { UserRole, ApplicationStatus } from "@/types";
import {
  createSuccessResponse,
  createErrorResponse,
  handleApiError,
  parsePaginationParams,
  paginateQuery,
  parseRequestBody,
} from "@/lib/api-utils";
import {
  applicationSchema,
  paginationSchema,
  validateSchema,
} from "@/lib/validations";

// ============================================================================
// GET /api/applications - Get all applications with pagination and filtering
// ============================================================================

export async function GET(request: NextRequest) {
  try {
    // Connect to database
    await connectDB();

    // Get session
    const session = await auth();
    if (!session?.user) {
      return createErrorResponse("Unauthorized", 401);
    }

    // Check user role
    const allowedRoles = [UserRole.ADMIN, UserRole.MANAGER, UserRole.TENANT];

    if (!allowedRoles.includes(session.user.role as UserRole)) {
      return createErrorResponse("Insufficient permissions", 403);
    }

    const user = session.user;

    const { searchParams } = new URL(request.url);

    // Parse pagination parameters
    const paginationParams = parsePaginationParams(searchParams);

    // Build query based on user role and filters
    let query: any = {};

    // Role-based filtering for single company architecture
    if (user.role === UserRole.TENANT) {
      query.applicantId = user.id;
    }
    // Admin and Manager can see all company applications - no filtering needed

    // Additional filters
    const status = searchParams.get("status");
    if (
      status &&
      Object.values(ApplicationStatus).includes(status as ApplicationStatus)
    ) {
      query.status = status;
    }

    const propertyId = searchParams.get("propertyId");
    if (propertyId) {
      query.propertyId = propertyId;
    }

    const applicantId = searchParams.get("applicantId");
    if (applicantId && user.role !== UserRole.TENANT) {
      query.applicantId = applicantId;
    }

    // Date range filters
    const startDate = searchParams.get("startDate");
    const endDate = searchParams.get("endDate");
    if (startDate || endDate) {
      query.submittedAt = {};
      if (startDate) query.submittedAt.$gte = new Date(startDate);
      if (endDate) query.submittedAt.$lte = new Date(endDate);
    }

    // Search by applicant name or email
    const search = searchParams.get("search");
    if (search) {
      query.$or = [
        { "personalInfo.firstName": { $regex: search, $options: "i" } },
        { "personalInfo.lastName": { $regex: search, $options: "i" } },
        { "personalInfo.email": { $regex: search, $options: "i" } },
      ];
    }

    // Execute query with pagination
    const result = await paginateQuery(Application, query, paginationParams);

    // Populate the response
    const populatedData = await Application.populate(result.data, [
      { path: "propertyId", select: "name address type rentAmount" },
      { path: "applicantId", select: "firstName lastName email" },
      { path: "reviewedBy", select: "firstName lastName" },
    ]);

    return createSuccessResponse(
      populatedData,
      "Applications retrieved successfully",
      result.pagination
    );
  } catch (error) {
    return handleApiError(error);
  }
}

// ============================================================================
// POST /api/applications - Create a new application
// ============================================================================

export async function POST(request: NextRequest) {
  try {
    // Connect to database
    await connectDB();

    // Get session
    const session = await auth();
    if (!session?.user) {
      return createErrorResponse("Unauthorized", 401);
    }

    // Check user role
    const allowedRoles = [
      UserRole.TENANT,
      UserRole.ADMIN,
      UserRole.MANAGER,
      UserRole.MANAGER,
    ];

    if (!allowedRoles.includes(session.user.role as UserRole)) {
      return createErrorResponse("Insufficient permissions", 403);
    }

    const user = session.user;

    const { success, data: body, error } = await parseRequestBody(request);
    if (!success) {
      return createErrorResponse(error!, 400);
    }

    // Validate request body
    const validation = validateSchema(applicationSchema, body);
    if (!validation.success) {
      return createErrorResponse(validation.errors.join(", "), 400);
    }

    const applicationData = validation.data;

    // For tenants, ensure they can only create applications for themselves
    if (user.role === UserRole.TENANT) {
      applicationData.applicantId = user.id;
    }

    // Verify property exists and is available
    const property = await Property.findById(applicationData.propertyId);
    if (!property) {
      return createErrorResponse("Property not found", 404);
    }

    if (property.status !== "available") {
      return createErrorResponse(
        "Property is not available for applications",
        400
      );
    }

    // Check if user already has an active application for this property
    const existingApplication = await Application.findOne({
      propertyId: applicationData.propertyId,
      applicantId: applicationData.applicantId,
      status: {
        $in: [
          ApplicationStatus.DRAFT,
          ApplicationStatus.SUBMITTED,
          ApplicationStatus.UNDER_REVIEW,
          ApplicationStatus.SCREENING_IN_PROGRESS,
        ],
      },
    });

    if (existingApplication) {
      return createErrorResponse(
        "You already have an active application for this property",
        400
      );
    }

    // Verify applicant exists
    const applicant = await User.findById(applicationData.applicantId);
    if (!applicant) {
      return createErrorResponse("Applicant not found", 404);
    }

    // Create the application
    const application = new Application(applicationData);
    await application.save();

    // Populate the response
    await application.populate([
      { path: "propertyId", select: "name address type rentAmount" },
      { path: "applicantId", select: "firstName lastName email" },
    ]);

    return createSuccessResponse(
      { application },
      "Application created successfully",
      201
    );
  } catch (error) {
    return handleApiError(error);
  }
}
