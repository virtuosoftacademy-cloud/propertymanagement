/**
 * PropertyPro - Email delivery diagnostic
 *
 * Lets an admin confirm SMTP works without having to buy a subscription to
 * trigger a welcome email. GET reports configuration and whether the server
 * accepts the credentials; POST sends a test message to a chosen address.
 *
 * Admin-only, and it never returns the password — only whether one is set.
 */

import { NextRequest } from "next/server";
import { z } from "zod";
import { UserRole } from "@/types";
import {
  createSuccessResponse,
  createErrorResponse,
  handleApiError,
  parseRequestBody,
  withRoleAndDB,
} from "@/lib/api-utils";
import { emailService } from "@/lib/email-service";

export const GET = withRoleAndDB([UserRole.ADMIN])(async () => {
  try {
    const configured = emailService.isConfigured();

    // Only worth opening a connection if credentials are actually present.
    const connectionOk = configured
      ? await emailService.verifyConnection()
      : false;

    return createSuccessResponse({
      configured,
      connectionOk,
      host: process.env.EMAIL_SERVER_HOST || "smtp.gmail.com",
      port: Number(process.env.EMAIL_SERVER_PORT || "587"),
      user: process.env.EMAIL_SERVER_USER || null,
      from: process.env.EMAIL_FROM || process.env.EMAIL_SERVER_USER || null,
      passwordSet: Boolean(process.env.EMAIL_SERVER_PASSWORD),
      hint: configured
        ? connectionOk
          ? "SMTP accepted the credentials. Welcome emails will send."
          : "Credentials were rejected. For Gmail, use a 16-character App Password with 2FA enabled."
        : "Set real values for EMAIL_SERVER_USER and EMAIL_SERVER_PASSWORD in .env.local — they are still the .env.example placeholders.",
    });
  } catch (error) {
    return handleApiError(error);
  }
});

const testSchema = z.object({
  to: z.string().trim().email("Enter a valid email address"),
});

export const POST = withRoleAndDB([UserRole.ADMIN])(
  async (_user, request: NextRequest) => {
    try {
      const body = await parseRequestBody(request);
      if (!body.success) return createErrorResponse(body.error!, 400);

      const parsed = testSchema.safeParse(body.data);
      if (!parsed.success) {
        return createErrorResponse(
          parsed.error.issues.map((i) => i.message).join(", "),
          400
        );
      }

      const sent = await emailService.sendTestEmail(parsed.data.to);

      if (!sent) {
        return createErrorResponse(
          "The test email could not be sent. Check the server logs for the SMTP error.",
          502
        );
      }

      return createSuccessResponse(
        { to: parsed.data.to },
        "Test email sent — check the inbox."
      );
    } catch (error) {
      return handleApiError(error);
    }
  }
);
