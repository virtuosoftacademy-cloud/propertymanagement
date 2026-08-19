/**
 * PropertyPro - Invitation Utilities
 * Utility functions for managing password reset tokens
 */

import crypto from "crypto";
import InvitationToken, { IInvitationToken } from "@/models/InvitationToken";
import connectDB from "@/lib/mongodb";
import { emailService } from "@/lib/email-service";

// Generate secure random token
export function generateSecureToken(): string {
  return crypto.randomBytes(32).toString("hex");
}

// Create password reset token
export const ONE_HOUR_MS = 60 * 60 * 1000;
/**
 * Welcome links need far longer than a reset link. A customer who has just paid
 * may not open their inbox for a day or two, and an expired link is the first
 * thing they experience of the product.
 */
export const SEVEN_DAYS_MS = 7 * 24 * ONE_HOUR_MS;

export async function createPasswordResetToken(
  userId: string,
  email: string,
  expiresInMs: number = ONE_HOUR_MS
): Promise<{ success: boolean; token?: string; error?: string }> {
  try {
    await connectDB();

    // Remove any existing password reset tokens for this user
    await InvitationToken.deleteMany({
      userId,
      type: "password_reset",
    });

    // Generate secure token
    const token = generateSecureToken();

    const expiresAt = new Date(Date.now() + expiresInMs);

    const resetToken = new InvitationToken({
      email: email.toLowerCase(),
      token,
      type: "password_reset",
      userId,
      invitedBy: userId, // Self-initiated
      expiresAt,
      isUsed: false,
    });

    await resetToken.save();

    return {
      success: true,
      token,
    };
  } catch (error) {
    console.error("Error creating password reset token:", error);
    return {
      success: false,
      error: "Failed to create password reset token",
    };
  }
}

// Send password reset email
export async function sendPasswordResetEmail(
  token: string,
  userName: string
): Promise<{ success: boolean; error?: string }> {
  try {
    await connectDB();

    // Find the reset token
    const resetToken = await InvitationToken.findOne({
      token,
      type: "password_reset",
      isUsed: false,
      expiresAt: { $gt: new Date() },
    });

    if (!resetToken) {
      return {
        success: false,
        error: "Invalid or expired reset token",
      };
    }

    const emailSent = await emailService.sendPasswordReset(
      resetToken.email,
      userName,
      token
    );

    if (!emailSent) {
      // Report the failure rather than returning success: a caller that thinks
      // the email went out will tell the user to check their inbox for
      // something that was never sent.
      return {
        success: false,
        error: "Failed to send password reset email",
      };
    }

    return {
      success: true,
    };
  } catch (error) {
    console.error("Error sending password reset email:", error);
    return {
      success: false,
      error: "Failed to send password reset email",
    };
  }
}

// Validate and get invitation token
export async function validateInvitationToken(
  token: string,
  type?: "tenant_invitation" | "password_reset"
): Promise<{
  success: boolean;
  invitation?: IInvitationToken;
  error?: string;
}> {
  try {
    await connectDB();

    const invitation = await InvitationToken.findValidToken(token, type);

    if (!invitation) {
      return {
        success: false,
        error: "Invalid or expired token",
      };
    }

    return {
      success: true,
      invitation,
    };
  } catch (error) {
    console.error("Error validating invitation token:", error);
    return {
      success: false,
      error: "Failed to validate token",
    };
  }
}

// Mark invitation token as used
export async function markTokenAsUsed(
  token: string
): Promise<{ success: boolean; error?: string }> {
  try {
    await connectDB();

    const invitation = await InvitationToken.findOne({
      token,
      isUsed: false,
      expiresAt: { $gt: new Date() },
    });

    if (!invitation) {
      return {
        success: false,
        error: "Invalid or expired token",
      };
    }

    await invitation.markAsUsed();

    return {
      success: true,
    };
  } catch (error) {
    console.error("Error marking token as used:", error);
    return {
      success: false,
      error: "Failed to mark token as used",
    };
  }
}

// Cleanup expired tokens (can be called periodically)
export async function cleanupExpiredTokens(): Promise<void> {
  try {
    await connectDB();
    await InvitationToken.cleanupExpired();
  } catch (error) {
    console.error("Error cleaning up expired tokens:", error);
  }
}
