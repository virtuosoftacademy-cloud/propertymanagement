/**
 * PropertyPro - Conversation Participants API Routes
 * Manage conversation participants (add, remove, update permissions)
 */

export const dynamic = "force-dynamic";

import { NextRequest } from "next/server";
import { Conversation, User } from "@/models";
import { UserRole } from "@/types";
import {
  createSuccessResponse,
  createErrorResponse,
  handleApiError,
  withRoleAndDB,
  parseRequestBody,
  isValidObjectId,
} from "@/lib/api-utils";
import { z } from "zod";

// Validation schemas
const addParticipantSchema = z.object({
  userId: z.string(),
  role: z.enum([UserRole.ADMIN, "member"]).optional(),
  permissions: z
    .object({
      canAddMembers: z.boolean().optional(),
      canRemoveMembers: z.boolean().optional(),
      canEditConversation: z.boolean().optional(),
      canDeleteMessages: z.boolean().optional(),
    })
    .optional(),
});

const updateParticipantSchema = z.object({
  role: z.enum([UserRole.ADMIN, "member"]).optional(),
  permissions: z
    .object({
      canAddMembers: z.boolean().optional(),
      canRemoveMembers: z.boolean().optional(),
      canEditConversation: z.boolean().optional(),
      canDeleteMessages: z.boolean().optional(),
    })
    .optional(),
});

// ============================================================================
// GET /api/conversations/[id]/participants - Get conversation participants
// ============================================================================

export const GET = withRoleAndDB([
  UserRole.ADMIN,
  UserRole.MANAGER,
  UserRole.MANAGER,
  UserRole.TENANT,
  UserRole.MANAGER,
])(
  async (
    user,
    request: NextRequest,
    { params }: { params: { id: string } }
  ) => {
    try {
      const conversationId = params.id;

      if (!isValidObjectId(conversationId)) {
        return createErrorResponse("Invalid conversation ID", 400);
      }

      const conversation = await Conversation.findById(conversationId).populate(
        "participants.userId",
        "firstName lastName email avatar role"
      );

      if (!conversation) {
        return createErrorResponse("Conversation not found", 404);
      }

      // Check if user is a participant
      const isParticipant = conversation.participants.some(
        (p: any) => p.userId._id.toString() === user.id && p.isActive
      );

      if (!isParticipant) {
        return createErrorResponse("Access denied to this conversation", 403);
      }

      // Filter active participants
      const activeParticipants = conversation.participants.filter(
        (p: any) => p.isActive
      );

      return createSuccessResponse({
        participants: activeParticipants,
        totalCount: activeParticipants.length,
      });
    } catch (error) {
      return handleApiError(error, "Failed to fetch participants");
    }
  }
);

// ============================================================================
// POST /api/conversations/[id]/participants - Add participant to conversation
// ============================================================================

export const POST = withRoleAndDB([
  UserRole.ADMIN,
  UserRole.MANAGER,
  UserRole.MANAGER,
  UserRole.TENANT,
  UserRole.MANAGER,
])(
  async (
    user,
    request: NextRequest,
    { params }: { params: { id: string } }
  ) => {
    try {
      const conversationId = params.id;

      if (!isValidObjectId(conversationId)) {
        return createErrorResponse("Invalid conversation ID", 400);
      }

      const { success, data: body, error } = await parseRequestBody(request);
      if (!success) {
        return createErrorResponse(error!, 400);
      }

      // Validate request body
      const validation = addParticipantSchema.safeParse(body);
      if (!validation.success) {
        return createErrorResponse(
          `Validation error: ${validation.error.errors
            .map((e) => e.message)
            .join(", ")}`,
          400
        );
      }

      const { userId, role = "member", permissions } = validation.data;

      if (!isValidObjectId(userId)) {
        return createErrorResponse("Invalid user ID", 400);
      }

      const conversation = await Conversation.findById(conversationId);

      if (!conversation) {
        return createErrorResponse("Conversation not found", 404);
      }

      // Check if current user is a participant with add permissions
      const currentParticipant = conversation.participants.find(
        (p: any) => p.userId.toString() === user.id && p.isActive
      );

      if (!currentParticipant) {
        return createErrorResponse("Access denied to this conversation", 403);
      }

      if (
        currentParticipant.role !== UserRole.ADMIN &&
        !currentParticipant.permissions.canAddMembers
      ) {
        return createErrorResponse(
          "Insufficient permissions to add participants",
          403
        );
      }

      // Check if conversation allows member invites
      if (
        !conversation.settings.allowMemberInvites &&
        currentParticipant.role !== UserRole.ADMIN
      ) {
        return createErrorResponse(
          "Member invites are not allowed in this conversation",
          403
        );
      }

      // Validate user exists and is active
      const userToAdd = await User.findById(userId);
      if (!userToAdd || !userToAdd.isActive) {
        return createErrorResponse("User not found or inactive", 404);
      }

      // Check if user is already a participant
      const existingParticipant = conversation.participants.find(
        (p: any) => p.userId.toString() === userId
      );

      if (existingParticipant && existingParticipant.isActive) {
        return createErrorResponse("User is already a participant", 400);
      }

      // Add participant
      conversation.addParticipant(userId, role, permissions);
      await conversation.save();

      // Populate the updated conversation
      await conversation.populate(
        "participants.userId",
        "firstName lastName email avatar"
      );

      return createSuccessResponse(
        {
          conversation,
          addedParticipant: {
            userId: userToAdd._id,
            firstName: userToAdd.firstName,
            lastName: userToAdd.lastName,
            email: userToAdd.email,
            role,
          },
        },
        "Participant added successfully",
        201
      );
    } catch (error) {
      return handleApiError(error, "Failed to add participant");
    }
  }
);

// ============================================================================
// PATCH /api/conversations/[id]/participants/[userId] - Update participant
// ============================================================================

export const PATCH = withRoleAndDB([
  UserRole.ADMIN,
  UserRole.MANAGER,
  UserRole.MANAGER,
  UserRole.TENANT,
  UserRole.MANAGER,
])(
  async (
    user,
    request: NextRequest,
    { params }: { params: { id: string } }
  ) => {
    try {
      const conversationId = params.id;
      const { searchParams } = new URL(request.url);
      const targetUserId = searchParams.get("userId");

      if (!isValidObjectId(conversationId) || !isValidObjectId(targetUserId)) {
        return createErrorResponse("Invalid conversation or user ID", 400);
      }

      const { success, data: body, error } = await parseRequestBody(request);
      if (!success) {
        return createErrorResponse(error!, 400);
      }

      // Validate request body
      const validation = updateParticipantSchema.safeParse(body);
      if (!validation.success) {
        return createErrorResponse(
          `Validation error: ${validation.error.errors
            .map((e) => e.message)
            .join(", ")}`,
          400
        );
      }

      const { role, permissions } = validation.data;

      const conversation = await Conversation.findById(conversationId);

      if (!conversation) {
        return createErrorResponse("Conversation not found", 404);
      }

      // Check if current user is a participant with admin permissions
      const currentParticipant = conversation.participants.find(
        (p: any) => p.userId.toString() === user.id && p.isActive
      );

      if (!currentParticipant) {
        return createErrorResponse("Access denied to this conversation", 403);
      }

      if (currentParticipant.role !== UserRole.ADMIN) {
        return createErrorResponse(
          "Only admins can update participant permissions",
          403
        );
      }

      // Find target participant
      const targetParticipant = conversation.participants.find(
        (p: any) => p.userId.toString() === targetUserId && p.isActive
      );

      if (!targetParticipant) {
        return createErrorResponse("Participant not found", 404);
      }

      // Prevent removing the last admin
      if (role === "member" && targetParticipant.role === UserRole.ADMIN) {
        const adminCount = conversation.participants.filter(
          (p: any) => p.isActive && p.role === UserRole.ADMIN
        ).length;

        if (adminCount <= 1) {
          return createErrorResponse(
            "Cannot remove the last admin from the conversation",
            400
          );
        }
      }

      // Update participant
      if (role !== undefined) {
        targetParticipant.role = role;

        // Update permissions based on role
        if (role === UserRole.ADMIN) {
          targetParticipant.permissions = {
            canAddMembers: true,
            canRemoveMembers: true,
            canEditConversation: true,
            canDeleteMessages: true,
          };
        }
      }

      if (permissions !== undefined) {
        targetParticipant.permissions = {
          ...targetParticipant.permissions,
          ...permissions,
        };
      }

      await conversation.save();

      // Populate the updated conversation
      await conversation.populate(
        "participants.userId",
        "firstName lastName email avatar"
      );

      return createSuccessResponse(
        { conversation },
        "Participant updated successfully"
      );
    } catch (error) {
      return handleApiError(error, "Failed to update participant");
    }
  }
);

// ============================================================================
// DELETE /api/conversations/[id]/participants/[userId] - Remove participant
// ============================================================================

export const DELETE = withRoleAndDB([
  UserRole.ADMIN,
  UserRole.MANAGER,
  UserRole.MANAGER,
  UserRole.TENANT,
  UserRole.MANAGER,
])(
  async (
    user,
    request: NextRequest,
    { params }: { params: { id: string } }
  ) => {
    try {
      const conversationId = params.id;
      const { searchParams } = new URL(request.url);
      const targetUserId = searchParams.get("userId");

      if (!isValidObjectId(conversationId) || !isValidObjectId(targetUserId)) {
        return createErrorResponse("Invalid conversation or user ID", 400);
      }

      const conversation = await Conversation.findById(conversationId);

      if (!conversation) {
        return createErrorResponse("Conversation not found", 404);
      }

      // Check if current user is a participant
      const currentParticipant = conversation.participants.find(
        (p: any) => p.userId.toString() === user.id && p.isActive
      );

      if (!currentParticipant) {
        return createErrorResponse("Access denied to this conversation", 403);
      }

      // Check permissions
      const isSelfRemoval = user.id === targetUserId;
      const hasRemovePermission =
        currentParticipant.role === UserRole.ADMIN ||
        currentParticipant.permissions.canRemoveMembers;

      if (!isSelfRemoval && !hasRemovePermission) {
        return createErrorResponse(
          "Insufficient permissions to remove participants",
          403
        );
      }

      // Find target participant
      const targetParticipant = conversation.participants.find(
        (p: any) => p.userId.toString() === targetUserId && p.isActive
      );

      if (!targetParticipant) {
        return createErrorResponse("Participant not found", 404);
      }

      // Prevent removing the last admin (unless it's self-removal)
      if (targetParticipant.role === UserRole.ADMIN) {
        const adminCount = conversation.participants.filter(
          (p: any) => p.isActive && p.role === UserRole.ADMIN
        ).length;

        if (adminCount <= 1 && !isSelfRemoval) {
          return createErrorResponse(
            "Cannot remove the last admin from the conversation",
            400
          );
        }
      }

      // Remove participant
      conversation.removeParticipant(targetUserId);
      await conversation.save();

      // If no active participants left, soft delete the conversation
      if (conversation.activeParticipantsCount === 0) {
        conversation.deletedAt = new Date();
        await conversation.save();
      }

      return createSuccessResponse(
        null,
        isSelfRemoval
          ? "Left conversation successfully"
          : "Participant removed successfully"
      );
    } catch (error) {
      return handleApiError(error, "Failed to remove participant");
    }
  }
);
