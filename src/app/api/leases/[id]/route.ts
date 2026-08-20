/**
 * PropertyPro - Individual Lease API Routes
 * CRUD operations for individual leases
 */

import { NextRequest } from "next/server";
import { Lease, Property, User } from "@/models";
import { UserRole, LeaseStatus } from "@/types";
import {
  createSuccessResponse,
  createErrorResponse,
  handleApiError,
  withRoleAndDB,
  parseRequestBody,
  isValidObjectId,
} from "@/lib/api-utils";
import {
  leaseSchema,
  leaseUpdateSchema,
  validateSchema,
} from "@/lib/validations";

// ============================================================================
// GET /api/leases/[id] - Get a specific lease
// ============================================================================

export const GET = withRoleAndDB([UserRole.ADMIN, UserRole.MANAGER, UserRole.TENANT])(
  async (
    user,
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
  ) => {
    try {
      const { id } = await params;

      if (!isValidObjectId(id)) {
        return createErrorResponse("Invalid lease ID", 400);
      }

      // The history view links here for records the soft-delete hook hides, so
      // `deleted=true` opts into a second lookup that names deletedAt to escape
      // it. Without the flag a deleted lease stays a 404 at its normal URL.
      const includeDeleted =
        new URL(request.url).searchParams.get("deleted") === "true";

      const withRelations = (query: any) =>
        query
          .populate({
            path: "propertyId",
            // `units` is needed to resolve the lease's unitId for display: units
            // are subdocuments of Property, so they cannot be populated directly.
            select:
              "name address type bedrooms bathrooms squareFootage ownerId managerId units",
            populate: [
              { path: "ownerId", select: "firstName lastName email" },
              { path: "managerId", select: "firstName lastName email" },
            ],
          })
          .populate({
            path: "tenantId",
            select:
              "firstName lastName email phone avatar dateOfBirth employmentInfo emergencyContacts creditScore backgroundCheckStatus moveInDate moveOutDate applicationDate",
          });

      // Find the lease
      let lease = await withRelations(Lease.findById(id));

      if (!lease && includeDeleted) {
        lease = await withRelations(
          Lease.findOne({ _id: id, deletedAt: { $ne: null } })
        );
      }

      if (!lease) {
        return createErrorResponse("Lease not found", 404);
      }

      // Role-based authorization
      if (user.role === UserRole.TENANT) {
        if (!lease.tenantId._id.equals(user.id)) {
          return createErrorResponse("You can only view your own leases", 403);
        }
      }
      // Admin and manager can view all leases (single-company architecture)

      return createSuccessResponse(lease, "Lease retrieved successfully");
    } catch (error) {
      return handleApiError(error);
    }
  }
);

// ============================================================================
// PUT /api/leases/[id] - Update a specific lease
// ============================================================================

export const PUT = withRoleAndDB([UserRole.ADMIN, UserRole.MANAGER])(
  async (
    user,
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
  ) => {
    try {
      const { id } = await params;

      if (!isValidObjectId(id)) {
        return createErrorResponse("Invalid lease ID", 400);
      }

      const { success, data: body, error } = await parseRequestBody(request);
      if (!success) {
        return createErrorResponse(error!, 400);
      }

      // Find the lease
      const lease = await Lease.findById(id);
      if (!lease) {
        return createErrorResponse("Lease not found", 404);
      }

      // Validate update data
      const validation = validateSchema(leaseUpdateSchema, body);
      if (!validation.success) {
        return createErrorResponse(validation.errors.join(", "), 400);
      }

      // Active leases are editable, but status transitions stay with PATCH so
      // they keep going through the transition rules rather than being set
      // arbitrarily here.
      const { status: _ignoredStatus, ...updateData } = validation.data;

      if (
        _ignoredStatus !== undefined &&
        _ignoredStatus !== lease.status
      ) {
        return createErrorResponse(
          "Lease status cannot be changed here. Use PATCH for status changes.",
          400
        );
      }

      // Validate date range if both dates are provided
      if (updateData.startDate && updateData.endDate) {
        if (updateData.endDate <= updateData.startDate) {
          return createErrorResponse("End date must be after start date", 400);
        }
      }

      // Check for overlapping leases if dates are being updated.
      // Scoped to the unit, not the property: a multi-unit property
      // legitimately runs concurrent leases, one per unit. Mirrors the Lease
      // model's pre-save check, including open-ended leases on either side.
      if (updateData.startDate || updateData.endDate) {
        const startDate = updateData.startDate || lease.startDate;
        const endDate = updateData.endDate ?? lease.endDate;

        const overlapQuery: Record<string, any> = {
          _id: { $ne: id },
          propertyId: lease.propertyId,
          unitId: lease.unitId,
          status: { $in: [LeaseStatus.ACTIVE, LeaseStatus.PENDING] },
          deletedAt: null,
          // An existing lease is ongoing relative to our start if it ends on
          // or after it, or is itself open-ended.
          $or: [
            { endDate: { $gte: startDate } },
            { endDate: { $exists: false } },
            { endDate: null },
          ],
        };

        // Only a bounded lease can be capped at the upper end.
        if (endDate) {
          overlapQuery.startDate = { $lte: endDate };
        }

        const overlappingLease = await Lease.findOne(overlapQuery);

        if (overlappingLease) {
          return createErrorResponse(
            "Lease dates overlap with an existing lease for this unit",
            409
          );
        }
      }

      // Update the lease
      Object.assign(lease, updateData);
      await lease.save();

      // Populate property and tenant information
      await lease.populate([
        {
          path: "propertyId",
          select: "name address type bedrooms bathrooms squareFootage",
        },
        {
          path: "tenantId",
          select:
            "firstName lastName email phone avatar dateOfBirth employmentInfo emergencyContacts creditScore backgroundCheckStatus moveInDate moveOutDate applicationDate",
        },
      ]);

      return createSuccessResponse(lease, "Lease updated successfully");
    } catch (error) {
      return handleApiError(error);
    }
  }
);

// ============================================================================
// DELETE /api/leases/[id] - Delete a specific lease
// ============================================================================

export const DELETE = withRoleAndDB([UserRole.ADMIN, UserRole.MANAGER])(
  async (
    user,
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
  ) => {
    try {
      const { id } = await params;

      if (!isValidObjectId(id)) {
        return createErrorResponse("Invalid lease ID", 400);
      }

      // Find the lease
      const lease = await Lease.findById(id);
      if (!lease) {
        return createErrorResponse("Lease not found", 404);
      }

      // Prevent deleting active leases
      if (lease.status === LeaseStatus.ACTIVE) {
        return createErrorResponse(
          "Cannot delete active lease. Please terminate the lease first.",
          409
        );
      }

      // Perform soft delete
      lease.deletedAt = new Date();
      await lease.save({ validateModifiedOnly: true });

      return createSuccessResponse(
        { id: lease._id },
        "Lease deleted successfully"
      );
    } catch (error) {
      return handleApiError(error);
    }
  }
);

// ============================================================================
// PATCH /api/leases/[id] - Partial update (status change, etc.)
// ============================================================================

export const PATCH = withRoleAndDB([UserRole.ADMIN, UserRole.MANAGER, UserRole.TENANT])(
  async (
    user,
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
  ) => {
    try {
      const { id } = await params;

      if (!isValidObjectId(id)) {
        return createErrorResponse("Invalid lease ID", 400);
      }

      const { success, data: body, error } = await parseRequestBody(request);
      if (!success) {
        return createErrorResponse(error!, 400);
      }

      // Find the lease. Restore is the one action that targets a soft-deleted
      // lease, so it must name `deletedAt` to escape the model's default
      // filter — findById alone would never see it.
      const lease =
        body?.action === "restore"
          ? await Lease.findOne({ _id: id, deletedAt: { $ne: null } })
          : await Lease.findById(id);
      if (!lease) {
        return createErrorResponse("Lease not found", 404);
      }

      // Role-based authorization for tenant actions
      if (user.role === UserRole.TENANT) {
        if (!lease.tenantId.equals(user.id)) {
          return createErrorResponse(
            "You can only modify your own leases",
            403
          );
        }
      }

      // Handle specific patch operations
      const { action, ...data } = body;

      // Closing a lease requires a concrete end date — mirrors the guard in
      // LeaseStatusChanger. An open-ended lease has no cutoff to prorate the
      // final invoice against or to report the closure on. Checked here for
      // all three routes into a closed state, not just the one the UI uses.
      const closesLease =
        action === "terminate" ||
        action === "expire" ||
        (action === "changeStatus" &&
          (data.status === LeaseStatus.TERMINATED ||
            data.status === LeaseStatus.EXPIRED));

      if (closesLease && !lease.endDate) {
        // The closing request may carry the end date itself, so an open-ended
        // lease can be closed in one step. It doubles as the departure date —
        // the cutoff the final invoice is prorated to.
        if (!data.endDate) {
          return createErrorResponse(
            "Add an end date before marking this lease as expired or terminated.",
            400
          );
        }

        const closingDate = new Date(data.endDate);
        if (isNaN(closingDate.getTime())) {
          return createErrorResponse("Invalid end date", 400);
        }
        if (lease.startDate && closingDate < lease.startDate) {
          return createErrorResponse(
            "End date cannot be before the lease start date",
            400
          );
        }

        lease.endDate = closingDate;
        lease.departureDate = closingDate;
      }

      switch (action) {
        case "activate":
          if (user.role === UserRole.TENANT) {
            return createErrorResponse("Tenants cannot activate leases", 403);
          }
          lease.status = LeaseStatus.ACTIVE;
          if (!lease.signedDate) {
            lease.signedDate = new Date();
          }
          // Update unit status to occupied
          if (lease.unitId) {
            await Property.updateOne(
              { _id: lease.propertyId, "units._id": lease.unitId },
              {
                $set: {
                  "units.$.status": "occupied",
                  "units.$.currentTenantId": lease.tenantId,
                  "units.$.currentLeaseId": lease._id,
                },
              }
            );
          } else {
            // Fallback for old leases without unitId
            await Property.findByIdAndUpdate(lease.propertyId, {
              status: "occupied",
            });
          }
          break;

        case "sign":
          lease.signedDate = new Date();
          if (lease.status === LeaseStatus.PENDING) {
            lease.status = LeaseStatus.ACTIVE;
            // Update unit status to occupied
            if (lease.unitId) {
              await Property.updateOne(
                { _id: lease.propertyId, "units._id": lease.unitId },
                {
                  $set: {
                    "units.$.status": "occupied",
                    "units.$.currentTenantId": lease.tenantId,
                    "units.$.currentLeaseId": lease._id,
                  },
                }
              );
            } else {
              // Fallback for old leases without unitId
              await Property.findByIdAndUpdate(lease.propertyId, {
                status: "occupied",
              });
            }
          }
          break;

        case "terminate":
          if (user.role === UserRole.TENANT) {
            return createErrorResponse("Tenants cannot terminate leases", 403);
          }
          lease.status = LeaseStatus.TERMINATED;
          // Update unit status to available
          if (lease.unitId) {
            await Property.updateOne(
              { _id: lease.propertyId, "units._id": lease.unitId },
              {
                $set: {
                  "units.$.status": "available",
                  "units.$.currentTenantId": null,
                  "units.$.currentLeaseId": null,
                },
              }
            );
          } else {
            // Fallback for old leases without unitId
            await Property.findByIdAndUpdate(lease.propertyId, {
              status: "available",
            });
          }
          break;

        case "expire":
          if (user.role === UserRole.TENANT) {
            return createErrorResponse("Tenants cannot expire leases", 403);
          }
          lease.status = LeaseStatus.EXPIRED;
          // Update property status to available
          await Property.findByIdAndUpdate(lease.propertyId, {
            status: "available",
          });
          break;

        case "changeStatus":
          if (user.role === UserRole.TENANT) {
            return createErrorResponse(
              "Tenants cannot change lease status",
              403
            );
          }

          if (
            !data.status ||
            !Object.values(LeaseStatus).includes(data.status)
          ) {
            return createErrorResponse("Valid status is required", 400);
          }

          const oldStatus = lease.status;
          lease.status = data.status;

          // Handle unit status changes based on lease status
          if (
            data.status === LeaseStatus.ACTIVE &&
            oldStatus !== LeaseStatus.ACTIVE
          ) {
            if (lease.unitId) {
              await Property.updateOne(
                { _id: lease.propertyId, "units._id": lease.unitId },
                {
                  $set: {
                    "units.$.status": "occupied",
                    "units.$.currentTenantId": lease.tenantId,
                    "units.$.currentLeaseId": lease._id,
                  },
                }
              );
            } else {
              // Fallback for old leases without unitId
              await Property.findByIdAndUpdate(lease.propertyId, {
                status: "occupied",
              });
            }
            if (!lease.signedDate) {
              lease.signedDate = new Date();
            }
          } else if (
            (data.status === LeaseStatus.TERMINATED ||
              data.status === LeaseStatus.EXPIRED) &&
            oldStatus === LeaseStatus.ACTIVE
          ) {
            if (lease.unitId) {
              await Property.updateOne(
                { _id: lease.propertyId, "units._id": lease.unitId },
                {
                  $set: {
                    "units.$.status": "available",
                    "units.$.currentTenantId": null,
                    "units.$.currentLeaseId": null,
                  },
                }
              );
            } else {
              // Fallback for old leases without unitId
              await Property.findByIdAndUpdate(lease.propertyId, {
                status: "available",
              });
            }
          }
          break;

        case "restore":
          if (user.role === UserRole.TENANT) {
            return createErrorResponse("Tenants cannot restore leases", 403);
          }
          lease.deletedAt = null;
          break;

        case "addDocument":
          if (!data.document) {
            return createErrorResponse("Document URL is required", 400);
          }
          lease.documents.push(data.document);
          break;

        case "removeDocument":
          if (!data.document) {
            return createErrorResponse("Document URL is required", 400);
          }
          lease.documents = lease.documents.filter(
            (doc) => doc !== data.document
          );
          break;

        case "updateRenewalOptions":
          if (user.role === UserRole.TENANT) {
            return createErrorResponse(
              "Tenants cannot update renewal options",
              403
            );
          }
          if (!data.renewalOptions) {
            return createErrorResponse("Renewal options are required", 400);
          }
          lease.renewalOptions = data.renewalOptions;
          break;

        case "requestRenewal":
          // Tenant can request renewal
          if (!lease.renewalOptions?.available) {
            return createErrorResponse(
              "Renewal is not available for this lease",
              400
            );
          }
          // This would typically create a renewal request record
          // For now, we'll just add a note
          break;

        default:
          return createErrorResponse("Invalid action", 400);
      }

      await lease.save({ validateModifiedOnly: true });

      return createSuccessResponse(
        lease,
        `Lease ${action} completed successfully`
      );
    } catch (error) {
      return handleApiError(error);
    }
  }
);
