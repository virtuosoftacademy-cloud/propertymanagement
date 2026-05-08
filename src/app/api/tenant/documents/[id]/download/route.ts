/**
 * PropertyPro - Document Download API
 * API endpoint for downloading tenant documents
 */

export const dynamic = "force-dynamic";

import { NextRequest } from "next/server";
import { promises as fs } from "fs";
import { join } from "path";
import { Document } from "@/models";
import { UserRole } from "@/types";
import {
  createErrorResponse,
  withRoleAndDB,
  isValidObjectId,
} from "@/lib/api-utils";

// ============================================================================
// GET /api/tenant/documents/[id]/download - Download a document
// ============================================================================

export const GET = withRoleAndDB([
  UserRole.ADMIN,
  UserRole.MANAGER,
  UserRole.TENANT,
])(
  async (
    user,
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> },
    context?: { tenantProfile?: any }
  ) => {
    try {
      const { id } = await params;

      if (!isValidObjectId(id)) {
        return createErrorResponse("Invalid document ID", 400);
      }

      // Find the document
      const document = await Document.findById(id);
      if (!document) {
        return createErrorResponse("Document not found", 404);
      }

      // Check permissions based on user role
      let canAccess = false;

      if (user.role === UserRole.ADMIN || user.role === UserRole.MANAGER) {
        // Admins and managers can access all documents
        canAccess = true;
      } else if (user.role === UserRole.TENANT) {
        // Tenants need their profile verified
        const tenant = context?.tenantProfile;
        if (!tenant) {
          return createErrorResponse("Tenant profile unavailable", 500);
        }

        // Tenant can access if they're the uploader, the document's tenant, or have shared access
        canAccess =
          document.uploadedBy.toString() === user.id ||
          document.tenantId?.toString() === tenant._id.toString() ||
          document.sharedWith?.includes(user.id);
      }

      if (!canAccess) {
        return createErrorResponse("Access denied", 403);
      }

      if (!document.fileUrl) {
        return createErrorResponse("Document file URL missing", 500);
      }

      let fileBuffer: Uint8Array;

      if (/^https?:\/\//i.test(document.fileUrl)) {
        // Remote file (R2 or other HTTP asset)
        const fileResponse = await fetch(document.fileUrl);

        if (!fileResponse.ok) {
          return createErrorResponse("Failed to fetch document file", 500);
        }

        const remoteArrayBuffer = await fileResponse.arrayBuffer();
        fileBuffer = new Uint8Array(remoteArrayBuffer);
      } else {
        // Local file stored under public/
        const normalizedPath = document.fileUrl.startsWith("/")
          ? document.fileUrl.slice(1)
          : document.fileUrl;

        const absolutePath = join(process.cwd(), "public", normalizedPath);

        try {
          const localBuffer = await fs.readFile(absolutePath);
          fileBuffer = localBuffer;
        } catch (readError) {
          return createErrorResponse(
            readError instanceof Error
              ? readError.message
              : "Document file not found",
            404
          );
        }
      }

      // Set appropriate headers for file download
      const headers = new Headers();
      headers.set(
        "Content-Type",
        document.mimeType || "application/octet-stream"
      );
      headers.set(
        "Content-Disposition",
        `attachment; filename="${document.name}"`
      );
      headers.set("Content-Length", fileBuffer.byteLength.toString());
      headers.set("Cache-Control", "private, no-cache");

      return new Response(fileBuffer, {
        status: 200,
        headers,
      });
    } catch (error) {
      return createErrorResponse(
        error instanceof Error ? error.message : "Failed to download document",
        500
      );
    }
  }
);
