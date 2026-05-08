export type NotificationPriorityLevel =
  | "low"
  | "normal"
  | "medium"
  | "high"
  | "critical";

export interface NotificationItem {
  id: string;
  title: string;
  message: string;
  type: string;
  priority: NotificationPriorityLevel;
  read: boolean;
  readAt: string | null;
  createdAt: string;
  updatedAt: string;
  actionUrl?: string | null;
  metadata?: Record<string, any>;
}

export interface NotificationMetrics {
  highPriority: number;
  lastUpdated: string | null;
}

export interface NotificationResponsePayload {
  notifications: NotificationItem[];
  unreadCount: number;
  totalCount: number;
  metrics: NotificationMetrics;
}
