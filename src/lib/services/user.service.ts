/**
 * PropertyPro - User Service
 * API service for user-related operations
 */

import { UserRole } from "@/types";

// ============================================================================
// TYPES
// ============================================================================

export interface UserResponse {
  _id: string;
  firstName: string;
  lastName: string;
  email: string;
  role: UserRole;
  phone?: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  /** Set only on soft-deleted users; drives the history page's "Deleted" column. */
  deletedAt?: string;
}

export interface UserQueryParams {
  page?: number;
  limit?: number;
  search?: string;
  role?: UserRole;
  isActive?: boolean;
  sortBy?: string;
  sortOrder?: "asc" | "desc";
  /**
   * Ask for the soft-deleted users instead of the live ones. The User model's
   * pre-find hook hides them unless a query names `deletedAt`, which the API
   * only does when this is set — same arrangement as leases.
   */
  deleted?: boolean;
  /** Restrict to users deleted on/after this date (ISO). Requires `deleted`. */
  deletedFrom?: string;
  /** Restrict to users deleted on/before this date (ISO), inclusive of the whole day. Requires `deleted`. */
  deletedTo?: string;
}

export interface DeletionImpactEntry {
  label: string;
  count: number;
  critical: boolean;
  /** Audit entries are reported but never block deletion. */
  blocking: boolean;
}

export interface DeletionImpactResponse {
  user: { id: string; name: string; email: string; role: string };
  total: number;
  blockingTotal: number;
  entries: DeletionImpactEntry[];
  hasReferences: boolean;
  canDeletePermanently: boolean;
}

export interface PaginatedUsersResponse {
  data: UserResponse[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    pages: number;
    hasNext: boolean;
    hasPrev: boolean;
  };
}

// ============================================================================
// API SERVICE
// ============================================================================

class UserService {
  private baseUrl = "/api/users";

  /**
   * Get all users with pagination and filtering
   */
  async getUsers(params?: UserQueryParams): Promise<PaginatedUsersResponse> {
    const searchParams = new URLSearchParams();

    if (params) {
      Object.entries(params).forEach(([key, value]) => {
        if (value !== undefined && value !== null && value !== "") {
          searchParams.append(key, value.toString());
        }
      });
    }

    const url = `${this.baseUrl}${
      searchParams.toString() ? `?${searchParams.toString()}` : ""
    }`;

    const response = await fetch(url, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
      },
    });


    if (!response.ok) {
      const error = await response
        .json()
        .catch(() => ({ message: "Unknown error" }));
      console.error("Users API error:", error);
      throw new Error(error.error || error.message || "Failed to fetch users");
    }

    const result = await response.json();

    return result;
  }

  /**
   * Get users by role (useful for dropdowns)
   */
  async getUsersByRole(role: UserRole): Promise<UserResponse[]> {
    try {
      const response = await this.getUsers({ role, limit: 100 });
      // Filter out users with invalid IDs
      return response.data.filter((user) => user._id && user._id.trim() !== "");
    } catch (error) {
      console.error(`Error fetching users with role ${role}:`, error);
      return [];
    }
  }

  /**
   * Get property owners (users with owner role)
   */
  async getPropertyOwners(): Promise<UserResponse[]> {
    return this.getUsersByRole(UserRole.MANAGER);
  }

  /**
   * Get property managers (users with property_manager role)
   */
  async getPropertyManagers(): Promise<UserResponse[]> {
    return this.getUsersByRole(UserRole.MANAGER);
  }

  /**
   * Get a single user by ID
   */
  async getUser(id: string): Promise<UserResponse> {
    const response = await fetch(`${this.baseUrl}/${id}`, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
      },
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || error.message || "Failed to fetch user");
    }

    const result = await response.json();
    return result.data;
  }

  /**
   * Soft-deleted users only, for the history page.
   *
   * Normalised to the same `{ data, pagination }` shape leaseService returns,
   * because GET /api/users wraps its payload as `{ data: { users, pagination } }`
   * rather than returning the array directly.
   */
  async getDeletedUsers(
    params?: Omit<UserQueryParams, "deleted">
  ): Promise<PaginatedUsersResponse> {
    const result: any = await this.getUsers({ ...params, deleted: true });

    const payload = result?.data ?? result;
    const users = payload?.users ?? payload ?? [];
    const pagination = payload?.pagination ?? {
      page: 1,
      limit: users.length,
      total: users.length,
      pages: 1,
      hasNext: false,
      hasPrev: false,
    };

    const rows: UserResponse[] = Array.isArray(users) ? users : [];

    // Defensive: this accessor must never surface a live user.
    //
    // GET /api/users falls back to `deletedAt: null` when it doesn't see
    // `deleted=true` — so if that parameter is ever lost (a stale build, a
    // proxy stripping the query, a future refactor), the endpoint happily
    // returns the ACTIVE users and the history page would render them as
    // deleted. Filtering on the field the page actually claims to show makes
    // that failure mode impossible to display.
    const deletedOnly = rows.filter((u) => Boolean(u?.deletedAt));
    const dropped = rows.length - deletedOnly.length;

    if (dropped > 0) {
      // Not silent: hiding the rows fixes the display, but the response was
      // still wrong and that is worth knowing about.
      console.warn(
        `[userService.getDeletedUsers] dropped ${dropped} record(s) with no deletedAt — ` +
          `the API appears to be ignoring deleted=true (stale build?)`
      );
    }

    return {
      data: deletedOnly,
      pagination: {
        ...pagination,
        // Keep the count consistent with what is rendered, so the list can't
        // claim "5 deleted" while showing an empty table.
        total: Math.max(0, (pagination.total ?? 0) - dropped),
      },
    };
  }

  /** Soft delete — moves the user to the history page. */
  async softDeleteUser(id: string): Promise<{ id: string }> {
    const response = await fetch(`${this.baseUrl}/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ action: "soft-delete" }),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(error.error || error.message || "Failed to delete user");
    }

    const result = await response.json();
    return result.data;
  }

  /** Restore a soft-deleted user back to the active list. */
  async restoreUser(id: string): Promise<{ id: string }> {
    const response = await fetch(`${this.baseUrl}/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ action: "restore" }),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(error.error || error.message || "Failed to restore user");
    }

    const result = await response.json();
    return result.data;
  }

  /** What a permanent delete would strand. Read-only. */
  async getDeletionImpact(id: string): Promise<DeletionImpactResponse> {
    const response = await fetch(`${this.baseUrl}/${id}/impact`, {
      method: "GET",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(
        error.error || error.message || "Failed to load deletion impact"
      );
    }

    const result = await response.json();
    return result.data;
  }

  /** Irreversible. The server refuses if anything blocking still references them. */
  async permanentlyDeleteUser(id: string): Promise<{ deletedUserId: string }> {
    const response = await fetch(`${this.baseUrl}/${id}?permanent=true`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(error.error || error.message || "Failed to delete user");
    }

    const result = await response.json();
    return result.data;
  }
}

// Export singleton instance
export const userService = new UserService();
export default userService;
