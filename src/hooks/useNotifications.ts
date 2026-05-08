"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import type {
  NotificationItem,
  NotificationMetrics,
  NotificationResponsePayload,
} from "@/types/notifications";

interface UseNotificationsOptions {
  limit?: number;
  pollInterval?: number;
  includeRead?: boolean;
  status?: "read" | "unread";
  enabled?: boolean;
}

interface NotificationState {
  notifications: NotificationItem[];
  unreadCount: number;
  totalCount: number;
  metrics: NotificationMetrics;
}

const defaultState: NotificationState = {
  notifications: [],
  unreadCount: 0,
  totalCount: 0,
  metrics: {
    highPriority: 0,
    lastUpdated: null,
  },
};

export function useNotifications(options: UseNotificationsOptions = {}) {
  const {
    limit = 10,
    pollInterval = 60000,
    includeRead = true,
    status,
    enabled = true,
  } = options;

  const [state, setState] = useState<NotificationState>(defaultState);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const abortRef = useRef<AbortController | null>(null);
  const isMountedRef = useRef(true);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const fetchRef = useRef<((silent?: boolean) => Promise<void>) | null>(null);
  const initialFetchDoneRef = useRef(false);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      // Clear the abort ref without calling abort to prevent errors
      abortRef.current = null;
      if (pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
    };
  }, []);

  const buildQueryString = useCallback(() => {
    const params = new URLSearchParams();
    params.set("limit", limit.toString());
    params.set("includeRead", includeRead ? "true" : "false");
    if (status) {
      params.set("status", status);
    }
    return params.toString();
  }, [includeRead, limit, status]);

  const fetchNotifications = useCallback(
    async (silent = false) => {
      if (!enabled) {
        if (!silent && isMountedRef.current) {
          setIsLoading(false);
        }

        if (isMountedRef.current) {
          setError(null);
          setState(defaultState);
        }

        return;
      }

      // Clear any existing request reference before starting a new one
      // Don't call abort() as it can throw errors
      abortRef.current = null;

      // Create new controller for this request
      const controller = new AbortController();
      abortRef.current = controller;

      if (!silent) {
        setIsLoading(true);
      }
      setError(null);

      try {
        const response = await fetch(
          `/api/notifications?${buildQueryString()}`,
          {
            method: "GET",
            signal: controller.signal,
          }
        );

        // Check if request was aborted
        if (controller.signal.aborted || !isMountedRef.current) {
          return;
        }

        if (response.status === 403) {
          if (isMountedRef.current) {
            setState(defaultState);
            setError("Notifications are unavailable for your role.");
            setIsLoading(false);
          }
          return;
        }

        if (!response.ok) {
          const message = await response.text();
          throw new Error(message || "Failed to load notifications");
        }

        const payload: {
          data?: NotificationResponsePayload;
        } & NotificationResponsePayload = await response.json();

        const data =
          payload?.data ?? payload ?? ({} as NotificationResponsePayload);

        if (!isMountedRef.current || controller.signal.aborted) {
          return;
        }

        setState({
          notifications: data.notifications ?? [],
          unreadCount: data.unreadCount ?? 0,
          totalCount: data.totalCount ?? 0,
          metrics: data.metrics ?? defaultState.metrics,
        });
      } catch (err) {
        // Ignore errors if component is unmounted or request was aborted
        if (!isMountedRef.current || controller.signal.aborted) {
          return;
        }

        // Handle specific abort errors - check both DOMException and Error types
        if (err instanceof DOMException && err.name === "AbortError") {
          return;
        }

        // Also check for abort-related errors
        if (
          err instanceof Error &&
          err.message.toLowerCase().includes("abort")
        ) {
          return;
        }

        // Only log and set error for legitimate failures
        if (isMountedRef.current) {
          setError(err instanceof Error ? err.message : "Unknown error");
        }
      } finally {
        if (isMountedRef.current) {
          setIsLoading(false);
        }
      }
    },
    [buildQueryString, enabled]
  );

  // Store the latest fetchNotifications in a ref to avoid dependency issues
  useEffect(() => {
    fetchRef.current = fetchNotifications;
  });

  useEffect(() => {
    if (!enabled) {
      // Clear abort ref without calling abort
      abortRef.current = null;

      if (pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }

      setState(defaultState);
      setIsLoading(false);
      setError(null);
      initialFetchDoneRef.current = false;
      return;
    }

    // Only do initial fetch once per enabled session
    if (!initialFetchDoneRef.current) {
      initialFetchDoneRef.current = true;
      fetchRef.current?.();
    }

    // Avoid creating multiple intervals
    if (pollRef.current) {
      return;
    }

    if (pollInterval > 0) {
      pollRef.current = setInterval(() => {
        fetchRef.current?.(true);
      }, pollInterval);
    }

    return () => {
      if (pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
      // Don't reset initialFetchDoneRef here to prevent re-fetching
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, pollInterval]);

  const applyLocalReadState = useCallback((ids: string[]) => {
    setState((prev) => {
      if (ids.length === 0) {
        return prev;
      }

      const timestamp = new Date().toISOString();

      const updatedNotifications = prev.notifications.map((notification) =>
        ids.includes(notification.id)
          ? {
              ...notification,
              read: true,
              readAt: timestamp,
            }
          : notification
      );

      const unreadCount = updatedNotifications.filter((n) => !n.read).length;

      return {
        ...prev,
        notifications: updatedNotifications,
        unreadCount,
      };
    });
  }, []);

  const markAsRead = useCallback(
    async (ids: string[]) => {
      if (!enabled) {
        return;
      }

      if (!ids || ids.length === 0) {
        return;
      }

      applyLocalReadState(ids);

      try {
        const response = await fetch("/api/notifications", {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ notificationIds: ids, read: true }),
        });

        if (!response.ok) {
          throw new Error(await response.text());
        }

        await fetchRef.current?.(true);
      } catch (err) {
        console.error("Failed to mark notifications as read:", err);
        await fetchRef.current?.(true);
      }
    },
    [applyLocalReadState, enabled]
  );

  const markAllAsRead = useCallback(async () => {
    if (!enabled) {
      return;
    }

    const unreadIds = state.notifications
      .filter((n) => !n.read)
      .map((n) => n.id);

    applyLocalReadState(unreadIds);

    try {
      const response = await fetch("/api/notifications", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ markAll: true, read: true }),
      });

      if (!response.ok) {
        throw new Error(await response.text());
      }

      await fetchRef.current?.(true);
    } catch (err) {
      console.error("Failed to mark all notifications as read:", err);
      await fetchRef.current?.(true);
    }
  }, [applyLocalReadState, enabled, state.notifications]);

  return {
    notifications: state.notifications,
    unreadCount: state.unreadCount,
    totalCount: state.totalCount,
    metrics: state.metrics,
    isLoading,
    error,
    refresh: () => {
      if (!enabled) {
        return;
      }

      return fetchRef.current?.(true);
    },
    markAsRead,
    markAllAsRead,
  };
}
