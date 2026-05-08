"use client";

import React, {
  useState,
  useEffect,
  useCallback,
  useMemo,
  useRef,
} from "react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import SimpleMessagingInterface from "@/components/messaging/SimpleMessagingInterface";
import NewConversationDialog from "@/components/messaging/NewConversationDialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  MessageSquare,
  Megaphone,
  Users,
  Bell,
  Settings,
  Archive,
  Star,
  AlertCircle,
  Plus,
  TrendingUp,
  Loader2,
  ThumbsUp,
  Heart,
  Sparkles,
  Info,
} from "lucide-react";
import { toast } from "sonner";
import { useSession } from "next-auth/react";
import { useLocalizationContext } from "@/components/providers/LocalizationProvider";

// Type definitions
type AnnouncementReactionType = "like" | "love" | "helpful" | "important";

interface AnnouncementAttachment {
  fileName: string;
  fileUrl: string;
  fileSize: number;
  fileType: string;
}

interface AnnouncementAudience {
  includeAll?: boolean;
  roles?: string[];
  propertyIds?: Array<{ _id: string; name?: string; address?: string }>;
}

interface Announcement {
  id: string;
  title: string;
  content: string;
  priority: "low" | "normal" | "high" | "urgent";
  type: string;
  publishedAt?: Date;
  createdAt?: Date;
  updatedAt?: Date;
  status?: string;
  viewCount: number;
  reactionCount: number;
  reactionCounts?: Partial<Record<AnnouncementReactionType, number>>;
  attachments?: AnnouncementAttachment[];
  actionButton?: { text: string; url: string } | null;
  userReaction?: AnnouncementReactionType | null;
  userHasViewed?: boolean;
  createdBy?: {
    firstName?: string;
    lastName?: string;
    email?: string;
  } | null;
  targetAudience?: AnnouncementAudience;
}

interface Notification {
  id: string;
  title: string;
  message: string;
  priority: "low" | "normal" | "high";
  type: string;
  createdAt: Date;
  read: boolean;
}

async function requestJson<T>(
  input: RequestInfo,
  init?: RequestInit
): Promise<T> {
  const response = await fetch(input, init);
  if (!response.ok) {
    const message = await response.text();
    throw new Error(message || `Request failed with status ${response.status}`);
  }
  return response.json() as Promise<T>;
}

export default function MessagesPage() {
  const { data: session } = useSession();
  const { t } = useLocalizationContext();
  const [showAnnouncementDialog, setShowAnnouncementDialog] = useState(false);
  const [showNewConversationDialog, setShowNewConversationDialog] =
    useState(false);
  const [activeTab, setActiveTab] = useState("messages");
  const [loading, setLoading] = useState(true);
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  const [selectedAnnouncementId, setSelectedAnnouncementId] = useState<
    string | null
  >(null);
  const [selectedAnnouncement, setSelectedAnnouncement] =
    useState<Announcement | null>(null);
  const [announcementDetailLoading, setAnnouncementDetailLoading] =
    useState(false);
  const [announcementDetailError, setAnnouncementDetailError] = useState<
    string | null
  >(null);
  const [announcementActionLoading, setAnnouncementActionLoading] =
    useState(false);
  const selectedAnnouncementIdRef = useRef<string | null>(null);

  const currentUserId = session?.user?.id ?? null;

  const normalizeAnnouncement = useCallback(
    (raw: any): Announcement => {
      if (!raw) {
        return {
          id: "",
          title: "",
          content: "",
          priority: "normal",
          type: "general",
          viewCount: 0,
          reactionCount: 0,
        };
      }

      const resolveId = (value: any): string => {
        if (!value) return "";
        if (typeof value === "string") return value;
        if (typeof value === "object" && typeof value.toString === "function") {
          return value.toString();
        }
        return String(value);
      };

      const id = resolveId(raw._id ?? raw.id);

      const coerceDate = (value: any): Date | undefined => {
        if (!value) return undefined;
        const date = value instanceof Date ? value : new Date(value);
        return Number.isNaN(date.getTime()) ? undefined : date;
      };

      const reactionCountsRaw =
        raw?.reactionCounts && typeof raw.reactionCounts === "object"
          ? (raw.reactionCounts as Record<string, number>)
          : undefined;

      const normalizedReactionCounts = reactionCountsRaw
        ? (Object.entries(reactionCountsRaw).reduce(
            (
              acc: Partial<Record<AnnouncementReactionType, number>>,
              [key, value]
            ) => {
              const numericValue =
                typeof value === "number" ? value : Number(value ?? 0);
              if (!Number.isNaN(numericValue)) {
                acc[key as AnnouncementReactionType] = numericValue;
              }
              return acc;
            },
            {}
          ) as Partial<Record<AnnouncementReactionType, number>>)
        : undefined;

      const totalReactions = normalizedReactionCounts
        ? Object.values(normalizedReactionCounts).reduce(
            (sum, value) => sum + (typeof value === "number" ? value : 0),
            0
          )
        : Array.isArray(raw?.reactions)
        ? raw.reactions.length
        : typeof raw?.reactionCount === "number"
        ? raw.reactionCount
        : 0;

      const resolvedReaction =
        raw?.userReaction ??
        (Array.isArray(raw?.reactions)
          ? raw.reactions.find(
              (reaction: any) =>
                reaction?.userId &&
                resolveId(reaction.userId) === (currentUserId ?? "")
            )?.type
          : null);

      const hasViewed = Array.isArray(raw?.views)
        ? raw.views.some(
            (view: any) =>
              view?.userId && resolveId(view.userId) === (currentUserId ?? "")
          )
        : Boolean(raw?.userHasViewed);

      return {
        id,
        title: raw?.title ?? "",
        content: raw?.content ?? "",
        priority:
          raw?.priority &&
          ["low", "normal", "high", "urgent"].includes(raw.priority)
            ? raw.priority
            : "normal",
        type: raw?.type ?? "general",
        status: raw?.status,
        publishedAt: coerceDate(raw?.publishedAt),
        createdAt: coerceDate(raw?.createdAt),
        updatedAt: coerceDate(raw?.updatedAt),
        viewCount: Number(raw?.viewCount ?? raw?.views?.length ?? 0),
        reactionCount: totalReactions,
        reactionCounts: normalizedReactionCounts,
        attachments: Array.isArray(raw?.attachments)
          ? (raw.attachments as AnnouncementAttachment[])
          : [],
        actionButton: raw?.actionButton ?? null,
        userReaction:
          (resolvedReaction as AnnouncementReactionType | null) ?? null,
        userHasViewed: hasViewed,
        createdBy: raw?.createdBy
          ? {
              firstName: raw.createdBy.firstName,
              lastName: raw.createdBy.lastName,
              email: raw.createdBy.email,
            }
          : null,
        targetAudience: raw?.targetAudience,
      };
    },
    [currentUserId]
  );

  const reactionOptions = useMemo(
    () => [
      {
        value: "like" as AnnouncementReactionType,
        label: t("messages.reactions.like"),
        icon: <ThumbsUp className="h-4 w-4" />,
        miniIcon: <ThumbsUp className="h-3 w-3" />,
      },
      {
        value: "love" as AnnouncementReactionType,
        label: t("messages.reactions.love"),
        icon: <Heart className="h-4 w-4" />,
        miniIcon: <Heart className="h-3 w-3" />,
      },
      {
        value: "helpful" as AnnouncementReactionType,
        label: t("messages.reactions.helpful"),
        icon: <Sparkles className="h-4 w-4" />,
        miniIcon: <Sparkles className="h-3 w-3" />,
      },
      {
        value: "important" as AnnouncementReactionType,
        label: t("messages.reactions.important"),
        icon: <Info className="h-4 w-4" />,
        miniIcon: <Info className="h-3 w-3" />,
      },
    ],
    [t]
  );

  // Real-time statistics state
  const [messageStats, setMessageStats] = useState({
    unreadMessages: 0,
    totalConversations: 0,
    announcementsSent: 0,
    emergencyMessages: 0,
  });

  // Announcement form state
  const [announcementForm, setAnnouncementForm] = useState({
    title: "",
    content: "",
    priority: "normal",
    targetAudience: "all",
    propertyId: "",
  });

  // Dynamic data state
  const [recentAnnouncements, setRecentAnnouncements] = useState<
    Announcement[]
  >([]);
  const [notifications, setNotifications] = useState<Notification[]>([]);

  useEffect(() => {
    selectedAnnouncementIdRef.current = selectedAnnouncementId;
  }, [selectedAnnouncementId]);

  const loadDashboardData = useCallback(
    async (trigger: "auto" | "manual" = "auto") => {
      if (!currentUserId) {
        setLoading(false);
        return;
      }

      const shouldNotify = trigger === "manual";

      try {
        setLoading(true);

        const [conversationsResult, announcementsResult, notificationsResult] =
          await Promise.allSettled([
            requestJson<any>("/api/conversations"),
            requestJson<any>(
              "/api/announcements?activeOnly=false&page=1&limit=10"
            ),
            requestJson<any>("/api/notifications"),
          ]);

        if (conversationsResult.status === "fulfilled") {
          const payload = conversationsResult.value;
          const conversations = Array.isArray(payload)
            ? payload
            : payload?.data?.conversations ?? payload?.conversations ?? [];

          if (Array.isArray(conversations)) {
            const unreadCount = conversations.reduce(
              (total: number, conv: any) => total + (conv?.unreadCount || 0),
              0
            );

            setMessageStats((prev) => ({
              ...prev,
              totalConversations: conversations.length,
              unreadMessages: unreadCount,
            }));
          } else {
            setMessageStats((prev) => ({
              ...prev,
              totalConversations: 0,
              unreadMessages: 0,
            }));
          }
        } else if (shouldNotify) {
          toast.error(t("messages.toasts.conversationsError"));
        }

        if (announcementsResult.status === "fulfilled") {
          const announcementsResponse = announcementsResult.value;

          const announcementsRaw = Array.isArray(announcementsResponse)
            ? announcementsResponse
            : announcementsResponse?.data?.announcements ??
              announcementsResponse?.announcements ??
              [];

          const normalizedAnnouncements = Array.isArray(announcementsRaw)
            ? announcementsRaw.map((item) => normalizeAnnouncement(item))
            : [];

          const limitedAnnouncements = normalizedAnnouncements.slice(0, 5);

          setRecentAnnouncements(limitedAnnouncements);
          setMessageStats((prev) => ({
            ...prev,
            announcementsSent:
              announcementsResponse?.data?.total ??
              announcementsResponse?.total ??
              normalizedAnnouncements.length,
          }));

          setSelectedAnnouncementId((prevId) => {
            if (
              prevId &&
              normalizedAnnouncements.some(
                (announcement) => announcement.id === prevId
              )
            ) {
              return prevId;
            }
            return limitedAnnouncements[0]?.id ?? null;
          });

          setSelectedAnnouncement((prev) => {
            if (!prev) {
              return limitedAnnouncements[0] ?? null;
            }
            const updated = normalizedAnnouncements.find(
              (announcement) => announcement.id === prev.id
            );
            return updated ?? limitedAnnouncements[0] ?? null;
          });
        } else {
          if (shouldNotify) {
            toast.error(t("messages.toasts.announcementsError"));
          }
          if (!selectedAnnouncementIdRef.current) {
            setRecentAnnouncements([]);
            setSelectedAnnouncement(null);
            setSelectedAnnouncementId(null);
          }
        }

        if (notificationsResult.status === "fulfilled") {
          const notificationsResponse = notificationsResult.value;

          const notificationsData = Array.isArray(notificationsResponse)
            ? notificationsResponse
            : notificationsResponse?.data?.notifications ??
              notificationsResponse?.notifications ??
              [];

          if (Array.isArray(notificationsData)) {
            setNotifications(notificationsData.slice(0, 10));
            const emergencyCount = notificationsData.filter(
              (notification: any) => notification?.priority === "high"
            ).length;
            setMessageStats((prev) => ({
              ...prev,
              emergencyMessages: emergencyCount,
            }));
          } else {
            setNotifications([]);
            setMessageStats((prev) => ({
              ...prev,
              emergencyMessages: 0,
            }));
          }
        } else if (shouldNotify) {
          toast.error(t("messages.toasts.notificationsError"));
        }
      } catch (error) {
        if (shouldNotify) {
          toast.error(
            error instanceof Error
              ? error.message
              : t("messages.toasts.refreshError")
          );
        }
      } finally {
        setLoading(false);
      }
    },
    [currentUserId, normalizeAnnouncement, t]
  );

  // Load dashboard data once the session is ready and keep refreshing
  useEffect(() => {
    if (!currentUserId) {
      return;
    }

    loadDashboardData();
    const interval = setInterval(loadDashboardData, 30000);
    return () => clearInterval(interval);
  }, [currentUserId, loadDashboardData]);

  const updateCachedAnnouncement = useCallback((updated: Announcement) => {
    setRecentAnnouncements((prev) =>
      prev.map((announcement) =>
        announcement.id === updated.id
          ? { ...announcement, ...updated }
          : announcement
      )
    );
  }, []);

  const fetchAnnouncementDetail = useCallback(
    async (announcementId: string, options: { trackView?: boolean } = {}) => {
      if (!announcementId) return;

      setAnnouncementDetailLoading(true);
      setAnnouncementDetailError(null);

      try {
        const searchParams = new URLSearchParams();
        if (options.trackView === false) {
          searchParams.set("trackView", "false");
        }

        const res = await fetch(
          `/api/announcements/${announcementId}${
            searchParams.toString() ? `?${searchParams.toString()}` : ""
          }`
        );

        if (!res.ok) {
          const errorText = await res.text();
          throw new Error(errorText || "Failed to load announcement");
        }

        const payload = await res.json();
        const rawAnnouncement =
          payload?.data?.announcement ?? payload?.announcement ?? payload;
        if (!rawAnnouncement) {
          throw new Error("Announcement not found");
        }

        const normalized = normalizeAnnouncement(rawAnnouncement);

        if (selectedAnnouncementIdRef.current !== announcementId) {
          return;
        }

        setSelectedAnnouncement(normalized);
        updateCachedAnnouncement(normalized);
      } catch (error) {
        if (selectedAnnouncementIdRef.current === announcementId) {
          setAnnouncementDetailError(
            error instanceof Error
              ? error.message
              : "Failed to load announcement"
          );
        }
      } finally {
        if (
          selectedAnnouncementIdRef.current === announcementId ||
          selectedAnnouncementIdRef.current === null
        ) {
          setAnnouncementDetailLoading(false);
        }
      }
    },
    [normalizeAnnouncement, updateCachedAnnouncement]
  );

  useEffect(() => {
    if (!selectedAnnouncementId) {
      setAnnouncementDetailLoading(false);
      return;
    }

    fetchAnnouncementDetail(selectedAnnouncementId);
  }, [selectedAnnouncementId, fetchAnnouncementDetail]);

  const handleAnnouncementCardClick = (announcement: Announcement) => {
    setAnnouncementDetailError(null);
    setAnnouncementDetailLoading(true);
    setSelectedAnnouncement((prev) =>
      prev && prev.id === announcement.id ? prev : { ...announcement }
    );
    selectedAnnouncementIdRef.current = announcement.id;
    setSelectedAnnouncementId(announcement.id);
  };

  const handleAnnouncementReaction = useCallback(
    async (reaction: AnnouncementReactionType) => {
      if (!selectedAnnouncement) return;

      const isRemoving = selectedAnnouncement.userReaction === reaction;

      try {
        setAnnouncementActionLoading(true);

        let response: Response;
        if (isRemoving) {
          const params = new URLSearchParams({ action: "reaction" });
          response = await fetch(
            `/api/announcements/${
              selectedAnnouncement.id
            }?${params.toString()}`,
            {
              method: "DELETE",
            }
          );
        } else {
          response = await fetch(
            `/api/announcements/${selectedAnnouncement.id}`,
            {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
              },
              body: JSON.stringify({
                action: "reaction",
                reactionType: reaction,
              }),
            }
          );
        }

        if (!response.ok) {
          const errorText = await response.text();
          throw new Error(errorText || "Unable to update announcement");
        }

        const payload = await response.json();
        const rawAnnouncement =
          payload?.data?.announcement ?? payload?.announcement ?? payload;
        if (rawAnnouncement) {
          const normalized = normalizeAnnouncement(rawAnnouncement);
          if (selectedAnnouncementIdRef.current !== normalized.id) {
            return;
          }
          setSelectedAnnouncement(normalized);
          updateCachedAnnouncement(normalized);
        }

        toast.success(
          isRemoving
            ? t("messages.reactions.removed")
            : t("messages.reactions.recorded")
        );
      } catch (error) {
        toast.error(
          error instanceof Error
            ? error.message
            : t("messages.toasts.reactionError")
        );
      } finally {
        setAnnouncementActionLoading(false);
      }
    },
    [normalizeAnnouncement, selectedAnnouncement, updateCachedAnnouncement, t]
  );

  const handleCreateAnnouncement = () => {
    setShowAnnouncementDialog(true);
  };

  const handleAnnouncementSubmit = async () => {
    if (!announcementForm.title.trim() || !announcementForm.content.trim()) {
      toast.error(t("messages.toasts.fillRequired"));
      return;
    }

    try {
      setLoading(true);
      const response = await fetch("/api/announcements", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          title: announcementForm.title,
          content: announcementForm.content,
          priority: announcementForm.priority,
          type: "general", // Default type
          targetAudience: {
            includeAll: announcementForm.targetAudience === "all",
            roles:
              announcementForm.targetAudience === "tenants"
                ? ["tenant"]
                : announcementForm.targetAudience === "staff"
                ? ["manager"]
                : announcementForm.targetAudience === "managers"
                ? ["manager"]
                : [],
            propertyIds: announcementForm.propertyId
              ? [announcementForm.propertyId]
              : [],
          },
          createdBy: session?.user?.id,
          publishedAt: new Date(),
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(
          errorText || `Failed to create announcement (${response.status})`
        );
      }

      toast.success(t("messages.toasts.announcementCreated"));
      setShowAnnouncementDialog(false);
      setAnnouncementForm({
        title: "",
        content: "",
        priority: "normal",
        targetAudience: "all",
        propertyId: "",
      });
      await loadDashboardData();
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : t("messages.toasts.announcementError")
      );
    } finally {
      setLoading(false);
    }
  };

  const handleNewConversation = () => {
    setShowNewConversationDialog(true);
  };

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case "urgent":
        return "bg-red-200 text-red-900";
      case "high":
        return "bg-orange-100 text-orange-800";
      case "normal":
        return "bg-blue-100 text-blue-800";
      case "low":
        return "bg-gray-100 text-gray-800";
      default:
        return "bg-gray-100 text-gray-800";
    }
  };

  const getTypeIcon = (type: string) => {
    switch (type) {
      case "maintenance":
        return <Settings className="h-4 w-4" />;
      case "policy":
        return <AlertCircle className="h-4 w-4" />;
      case "emergency":
        return (
          <AlertCircle className="h-4 w-4 text-red-500 dark:text-red-400" />
        );
      default:
        return <Megaphone className="h-4 w-4" />;
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-foreground">
            {t("messages.header.title")}
          </h1>
          <p className="text-muted-foreground">
            {t("messages.header.subtitle")}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm"
            variant="outline"
            onClick={() => loadDashboardData("manual")}
            disabled={loading}
          >
            <TrendingUp className="h-4 w-4 mr-2" />
            {loading
              ? t("messages.header.refreshing")
              : t("messages.header.refresh")}
          </Button>
          <Button size="sm" variant="outline" onClick={handleCreateAnnouncement}>
            <Megaphone className="h-4 w-4 mr-2" />
            {t("messages.header.newAnnouncement")}
          </Button>
          <Button size="sm" onClick={handleNewConversation}>
            <Plus className="h-4 w-4 mr-2" />
            {t("messages.header.newConversation")}
          </Button>
        </div>
      </div>

      {/* Statistics Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">
                  {t("messages.stats.unreadMessages")}
                </p>
                <p className="text-2xl font-bold">
                  {loading ? "..." : messageStats.unreadMessages}
                </p>
              </div>
              <div className="h-12 w-12 bg-blue-100 dark:bg-blue-900/20 rounded-lg flex items-center justify-center">
                <MessageSquare className="h-6 w-6 text-blue-600 dark:text-blue-400" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">
                  {t("messages.stats.totalConversations")}
                </p>
                <p className="text-2xl font-bold">
                  {loading ? "..." : messageStats.totalConversations}
                </p>
              </div>
              <div className="h-12 w-12 bg-green-100 dark:bg-green-900/20 rounded-lg flex items-center justify-center">
                <Users className="h-6 w-6 text-green-600 dark:text-green-400" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">
                  {t("messages.stats.announcementsSent")}
                </p>
                <p className="text-2xl font-bold">
                  {loading ? "..." : messageStats.announcementsSent}
                </p>
              </div>
              <div className="h-12 w-12 bg-purple-100 dark:bg-purple-900/20 rounded-lg flex items-center justify-center">
                <Megaphone className="h-6 w-6 text-purple-600 dark:text-purple-400" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">
                  {t("messages.stats.emergencyMessages")}
                </p>
                <p className="text-2xl font-bold">
                  {messageStats.emergencyMessages}
                </p>
              </div>
              <div className="h-12 w-12 bg-red-100 dark:bg-red-900/20 rounded-lg flex items-center justify-center">
                <AlertCircle className="h-6 w-6 text-red-600 dark:text-red-400" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Tabs
        value={activeTab}
        onValueChange={setActiveTab}
        className="space-y-6"
      >
        <TabsList>
          <TabsTrigger value="messages">
            {t("messages.tabs.messages")}
          </TabsTrigger>
          <TabsTrigger value="announcements">
            {t("messages.tabs.announcements")}
          </TabsTrigger>
          <TabsTrigger value="notifications">
            {t("messages.tabs.notifications")}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="messages" className="space-y-6">
          {/* Full-screen messaging interface */}
          <div className="h-[calc(100vh-300px)] min-h-[600px]">
            <SimpleMessagingInterface refreshTrigger={refreshTrigger} />
          </div>
        </TabsContent>

        <TabsContent value="announcements" className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2">
              <Card>
                <CardHeader>
                  <CardTitle>{t("messages.announcements.title")}</CardTitle>
                  <CardDescription>
                    {t("messages.announcements.subtitle")}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    {recentAnnouncements.length === 0 ? (
                      <div className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
                        {t("messages.announcements.empty")}
                      </div>
                    ) : (
                      recentAnnouncements.map((announcement) => {
                        const isSelected =
                          selectedAnnouncement?.id === announcement.id;
                        const publishedLabel = announcement.publishedAt
                          ? announcement.publishedAt.toLocaleDateString()
                          : "No date";

                        return (
                          <button
                            key={announcement.id}
                            type="button"
                            className={cn(
                              "w-full text-left p-4 rounded-lg border transition-colors",
                              isSelected
                                ? "border-primary bg-primary/5"
                                : "hover:bg-accent/50"
                            )}
                            onClick={() =>
                              handleAnnouncementCardClick(announcement)
                            }
                          >
                            <div className="flex items-start justify-between">
                              <div className="flex items-start gap-3">
                                <div className="mt-1 text-muted-foreground">
                                  {getTypeIcon(announcement.type)}
                                </div>
                                <div className="flex-1">
                                  <div className="flex items-center gap-2">
                                    <h3 className="font-semibold text-foreground">
                                      {announcement.title}
                                    </h3>
                                    {!announcement.userHasViewed && (
                                      <Badge variant="secondary">New</Badge>
                                    )}
                                  </div>
                                  <p className="line-clamp-2 text-sm text-muted-foreground mt-1">
                                    {announcement.content}
                                  </p>
                                  <div className="flex flex-wrap items-center gap-4 mt-3 text-xs text-muted-foreground">
                                    <span>{publishedLabel}</span>
                                    <span>
                                      {t("messages.announcements.views", {
                                        values: {
                                          count: announcement.viewCount || 0,
                                        },
                                      })}
                                    </span>
                                    <span>
                                      {t("messages.announcements.reactions", {
                                        values: {
                                          count:
                                            announcement.reactionCount || 0,
                                        },
                                      })}
                                    </span>
                                  </div>
                                </div>
                              </div>
                              <Badge
                                className={getPriorityColor(
                                  announcement.priority
                                )}
                              >
                                {announcement.priority}
                              </Badge>
                            </div>
                          </button>
                        );
                      })
                    )}
                  </div>
                </CardContent>
              </Card>
            </div>

            <div className="space-y-6">
              {/* Quick Actions */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">
                    {t("messages.quickActions.title")}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    <Button
                      variant="outline"
                      className="w-full justify-start"
                      onClick={handleCreateAnnouncement}
                    >
                      <Megaphone className="h-4 w-4 mr-2" />
                      {t("messages.quickActions.createAnnouncement")}
                    </Button>
                    <Button
                      variant="outline"
                      className="w-full justify-start"
                      onClick={() => setActiveTab("notifications")}
                    >
                      <Bell className="h-4 w-4 mr-2" />
                      {t("messages.quickActions.sendNotification")}
                    </Button>
                    <Button
                      variant="outline"
                      className="w-full justify-start"
                      onClick={() => {
                        toast.info(t("messages.toasts.openingArchive"));
                        setActiveTab("announcements");
                      }}
                    >
                      <Archive className="h-4 w-4 mr-2" />
                      {t("messages.quickActions.viewArchive")}
                    </Button>
                    <Button
                      variant="outline"
                      className="w-full justify-start"
                      onClick={() =>
                        toast.info(t("messages.toasts.templatesComingSoon"))
                      }
                    >
                      <Star className="h-4 w-4 mr-2" />
                      {t("messages.quickActions.templates")}
                    </Button>
                  </div>
                </CardContent>
              </Card>

              {/* Announcement Details */}
              <Card className="border-primary/20">
                <CardHeader className="flex flex-row items-start justify-between gap-4">
                  <div>
                    <CardTitle className="text-lg">
                      {t("messages.details.title")}
                    </CardTitle>
                    <CardDescription>
                      {selectedAnnouncement
                        ? t("messages.details.subtitleSelected")
                        : t("messages.details.subtitleEmpty")}
                    </CardDescription>
                  </div>
                  {announcementDetailLoading && (
                    <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                  )}
                </CardHeader>
                <CardContent>
                  {announcementDetailError ? (
                    <Alert variant="destructive">
                      <AlertTitle>{t("messages.details.loadError")}</AlertTitle>
                      <AlertDescription>
                        {announcementDetailError}
                      </AlertDescription>
                    </Alert>
                  ) : selectedAnnouncement ? (
                    <div className="space-y-5">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <h3 className="text-xl font-semibold text-foreground">
                            {selectedAnnouncement.title}
                          </h3>
                          <div className="flex flex-wrap items-center gap-2 mt-2">
                            <Badge
                              className={getPriorityColor(
                                selectedAnnouncement.priority
                              )}
                            >
                              {selectedAnnouncement.priority}
                            </Badge>
                            <Badge variant="secondary" className="capitalize">
                              {selectedAnnouncement.type}
                            </Badge>
                            {selectedAnnouncement.status && (
                              <Badge variant="outline" className="capitalize">
                                {selectedAnnouncement.status}
                              </Badge>
                            )}
                          </div>
                        </div>
                      </div>

                      <div className="space-y-1 text-sm text-muted-foreground">
                        <div className="flex gap-2">
                          <span className="font-medium text-foreground">
                            {t("messages.details.published")}
                          </span>
                          <span>
                            {selectedAnnouncement.publishedAt
                              ? selectedAnnouncement.publishedAt.toLocaleString()
                              : t("messages.details.notPublished")}
                          </span>
                        </div>
                        {selectedAnnouncement.createdBy && (
                          <div className="flex gap-2">
                            <span className="font-medium text-foreground">
                              {t("messages.details.author")}
                            </span>
                            <span>
                              {`${
                                selectedAnnouncement.createdBy.firstName ?? ""
                              } ${
                                selectedAnnouncement.createdBy.lastName ?? ""
                              }`.trim() ||
                                selectedAnnouncement.createdBy.email ||
                                t("messages.details.unknown")}
                            </span>
                          </div>
                        )}
                      </div>

                      <div className="rounded-md bg-muted/40 p-4 text-sm leading-6 text-muted-foreground whitespace-pre-wrap">
                        {selectedAnnouncement.content}
                      </div>

                      {selectedAnnouncement.attachments &&
                      selectedAnnouncement.attachments.length > 0 ? (
                        <div className="space-y-2">
                          <p className="text-sm font-medium text-foreground">
                            {t("messages.details.attachments")}
                          </p>
                          <ul className="space-y-1">
                            {selectedAnnouncement.attachments.map(
                              (attachment) => (
                                <li
                                  key={`${attachment.fileUrl}-${attachment.fileName}`}
                                >
                                  <Button
                                    asChild
                                    variant="link"
                                    className="px-0"
                                  >
                                    <Link
                                      href={attachment.fileUrl}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                    >
                                      {attachment.fileName}
                                    </Link>
                                  </Button>
                                  <span className="ml-2 text-xs text-muted-foreground">
                                    {attachment.fileSize
                                      ? `${(attachment.fileSize / 1024).toFixed(
                                          1
                                        )} KB`
                                      : attachment.fileType ?? ""}
                                  </span>
                                </li>
                              )
                            )}
                          </ul>
                        </div>
                      ) : null}

                      <div className="rounded-md border p-3 space-y-2">
                        <div className="flex flex-wrap items-center gap-4 text-sm text-muted-foreground">
                          <span>
                            <span className="font-semibold text-foreground">
                              {selectedAnnouncement.viewCount}
                            </span>{" "}
                            {t("messages.details.viewsLabel")}
                          </span>
                          <span>
                            <span className="font-semibold text-foreground">
                              {selectedAnnouncement.reactionCount}
                            </span>{" "}
                            {t("messages.details.reactionsLabel")}
                          </span>
                          {selectedAnnouncement.userHasViewed && (
                            <span className="text-emerald-600 dark:text-emerald-400 font-medium">
                              {t("messages.details.viewedByYou")}
                            </span>
                          )}
                        </div>
                        {selectedAnnouncement.reactionCounts && (
                          <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
                            {reactionOptions.map((reaction) => {
                              const count =
                                selectedAnnouncement.reactionCounts?.[
                                  reaction.value
                                ] ?? 0;
                              if (!count) return null;
                              return (
                                <span
                                  key={reaction.value}
                                  className="flex items-center gap-1 rounded-full bg-muted px-2 py-1"
                                >
                                  {reaction.miniIcon}
                                  {count}
                                </span>
                              );
                            })}
                          </div>
                        )}
                      </div>

                      <div className="flex flex-wrap items-center gap-2">
                        {reactionOptions.map((reaction) => {
                          const isActive =
                            selectedAnnouncement.userReaction ===
                            reaction.value;
                          return (
                            <Button
                              key={reaction.value}
                              variant={isActive ? "default" : "outline"}
                              size="sm"
                              onClick={() =>
                                handleAnnouncementReaction(reaction.value)
                              }
                              disabled={
                                announcementActionLoading ||
                                !selectedAnnouncementId
                              }
                              className={cn("gap-1", isActive && "shadow-sm")}
                            >
                              {reaction.icon}
                              {reaction.label}
                            </Button>
                          );
                        })}
                      </div>

                      {selectedAnnouncement.actionButton?.url && (
                        <div>
                          <Button asChild size="sm">
                            <Link
                              href={selectedAnnouncement.actionButton.url}
                              target="_blank"
                              rel="noopener noreferrer"
                            >
                              {selectedAnnouncement.actionButton.text ||
                                t("messages.details.openLink")}
                            </Link>
                          </Button>
                        </div>
                      )}
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground">
                      {t("messages.details.selectAnnouncement")}
                    </p>
                  )}
                </CardContent>
              </Card>

              {/* Announcement Stats */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">
                    {t("messages.thisMonth.title")}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    <div className="flex justify-between">
                      <span className="text-sm text-muted-foreground">
                        {t("messages.thisMonth.totalSent")}
                      </span>
                      <span className="font-medium">12</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-sm text-muted-foreground">
                        {t("messages.thisMonth.totalViews")}
                      </span>
                      <span className="font-medium">456</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-sm text-muted-foreground">
                        {t("messages.thisMonth.engagementRate")}
                      </span>
                      <span className="font-medium">78%</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-sm text-muted-foreground">
                        {t("messages.thisMonth.avgResponseTime")}
                      </span>
                      <span className="font-medium">2.3h</span>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="notifications" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>{t("messages.notifications.title")}</CardTitle>
              <CardDescription>
                {t("messages.notifications.subtitle")}
              </CardDescription>
            </CardHeader>
            <CardContent>
              {loading ? (
                <div className="text-center py-12">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
                  <p className="text-muted-foreground mt-4">
                    {t("messages.notifications.loading")}
                  </p>
                </div>
              ) : notifications.length > 0 ? (
                <div className="space-y-4">
                  {notifications.map((notification) => (
                    <div
                      key={notification.id}
                      className={`p-4 rounded-lg border transition-colors ${
                        notification.read
                          ? "bg-gray-50"
                          : "bg-blue-50 border-blue-200"
                      }`}
                    >
                      <div className="flex items-start justify-between">
                        <div className="flex items-start gap-3">
                          <div className="mt-1">
                            <Bell
                              className={`h-4 w-4 ${
                                notification.priority === "high"
                                  ? "text-red-500"
                                  : "text-blue-500"
                              }`}
                            />
                          </div>
                          <div className="flex-1">
                            <h3 className="font-semibold text-foreground">
                              {notification.title}
                            </h3>
                            <p className="text-sm text-muted-foreground mt-1">
                              {notification.message}
                            </p>
                            <div className="flex items-center gap-2 mt-2">
                              <Badge
                                variant={
                                  notification.priority === "high"
                                    ? "destructive"
                                    : notification.priority === "normal"
                                    ? "default"
                                    : "secondary"
                                }
                              >
                                {notification.priority}
                              </Badge>
                              <span className="text-xs text-muted-foreground">
                                {notification.createdAt
                                  ? new Date(
                                      notification.createdAt
                                    ).toLocaleDateString()
                                  : "No date"}
                              </span>
                            </div>
                          </div>
                        </div>
                        {!notification.read && (
                          <div className="h-2 w-2 bg-blue-600 rounded-full"></div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-12 text-muted-foreground">
                  <Bell className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p>{t("messages.notifications.empty")}</p>
                  <p className="text-sm">
                    {t("messages.notifications.emptyDescription")}
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Create Announcement Dialog */}
      <Dialog
        open={showAnnouncementDialog}
        onOpenChange={setShowAnnouncementDialog}
      >
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              {t("messages.dialog.createAnnouncement.title")}
            </DialogTitle>
            <DialogDescription>
              {t("messages.dialog.createAnnouncement.description")}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="title">
                {t("messages.dialog.createAnnouncement.titleLabel")}
              </Label>
              <Input
                id="title"
                placeholder={t(
                  "messages.dialog.createAnnouncement.titlePlaceholder"
                )}
                value={announcementForm.title}
                onChange={(e) =>
                  setAnnouncementForm((prev) => ({
                    ...prev,
                    title: e.target.value,
                  }))
                }
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="content">
                {t("messages.dialog.createAnnouncement.contentLabel")}
              </Label>
              <Textarea
                id="content"
                placeholder={t(
                  "messages.dialog.createAnnouncement.contentPlaceholder"
                )}
                rows={4}
                value={announcementForm.content}
                onChange={(e) =>
                  setAnnouncementForm((prev) => ({
                    ...prev,
                    content: e.target.value,
                  }))
                }
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="priority">
                  {t("messages.dialog.createAnnouncement.priorityLabel")}
                </Label>
                <Select
                  value={announcementForm.priority}
                  onValueChange={(value) =>
                    setAnnouncementForm((prev) => ({
                      ...prev,
                      priority: value,
                    }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue
                      placeholder={t(
                        "messages.dialog.createAnnouncement.priorityPlaceholder"
                      )}
                    />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="low">
                      {t("messages.priority.low")}
                    </SelectItem>
                    <SelectItem value="normal">
                      {t("messages.priority.normal")}
                    </SelectItem>
                    <SelectItem value="high">
                      {t("messages.priority.high")}
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="audience">
                  {t("messages.dialog.createAnnouncement.audienceLabel")}
                </Label>
                <Select
                  value={announcementForm.targetAudience}
                  onValueChange={(value) =>
                    setAnnouncementForm((prev) => ({
                      ...prev,
                      targetAudience: value,
                    }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue
                      placeholder={t(
                        "messages.dialog.createAnnouncement.audiencePlaceholder"
                      )}
                    />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">
                      {t("messages.audience.all")}
                    </SelectItem>
                    <SelectItem value="tenants">
                      {t("messages.audience.tenants")}
                    </SelectItem>
                    <SelectItem value="staff">
                      {t("messages.audience.staff")}
                    </SelectItem>
                    <SelectItem value="managers">
                      {t("messages.audience.managers")}
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-4">
              <Button
                variant="outline"
                onClick={() => setShowAnnouncementDialog(false)}
              >
                {t("messages.dialog.createAnnouncement.cancel")}
              </Button>
              <Button
                onClick={handleAnnouncementSubmit}
                disabled={
                  loading ||
                  !announcementForm.title.trim() ||
                  !announcementForm.content.trim()
                }
              >
                {loading
                  ? t("messages.dialog.createAnnouncement.creating")
                  : t("messages.dialog.createAnnouncement.create")}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* New Conversation Dialog */}
      <NewConversationDialog
        open={showNewConversationDialog}
        onOpenChange={setShowNewConversationDialog}
        onCreateConversation={async (data) => {
          try {
            const response = await fetch("/api/conversations", {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
              },
              body: JSON.stringify({
                ...data,
                createdBy: session?.user?.id,
              }),
            });

            if (!response.ok) {
              const errorText = await response.text();
              throw new Error(
                errorText ||
                  `Failed to create conversation (${response.status})`
              );
            }

            toast.success(t("messages.toasts.conversationCreated"));
            loadDashboardData();
            setRefreshTrigger((prev) => prev + 1); // Trigger refresh
            setActiveTab("messages");
          } catch (error) {
            toast.error(
              error instanceof Error
                ? error.message
                : t("messages.toasts.conversationError")
            );
          }
        }}
      />
    </div>
  );
}
