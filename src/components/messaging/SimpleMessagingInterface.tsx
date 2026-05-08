/**
 * PropertyPro - Simple Messaging Interface
 * A working messaging interface without real-time features (polling-based)
 */

"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import {
  MessageSquare,
  Send,
  Plus,
  Search,
  MoreVertical,
  Phone,
  Video,
  Info,
  Smile,
  Paperclip,
  Users,
  Clock,
  Check,
  CheckCheck,
  AlertCircle,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { useSession } from "next-auth/react";
import NewConversationDialog from "./NewConversationDialog";

interface SimpleMessagingInterfaceProps {
  refreshTrigger?: number; // Add prop to trigger refresh
}

export const SimpleMessagingInterface: React.FC<
  SimpleMessagingInterfaceProps
> = ({ refreshTrigger }) => {
  const { data: session } = useSession();
  const [conversations, setConversations] = useState<any[]>([]);
  const [selectedConversation, setSelectedConversation] = useState<any>(null);
  const [messages, setMessages] = useState<any[]>([]);
  const [newMessage, setNewMessage] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [loadingConversations, setLoadingConversations] = useState(true);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [conversationsError, setConversationsError] = useState<string | null>(
    null
  );
  const [messagesError, setMessagesError] = useState<string | null>(null);
  const [showNewConversationDialog, setShowNewConversationDialog] =
    useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Socket.IO functionality removed - using database-only approach

  const normalizeId = useCallback((value: any): string => {
    if (!value) return "";
    if (typeof value === "string") return value;
    if (typeof value === "object") {
      if (value._id) {
        return normalizeId(value._id);
      }
      if (value.id) {
        return normalizeId(value.id);
      }
      if (typeof value.toString === "function") {
        return value.toString();
      }
    }
    return String(value);
  }, []);

  const transformConversation = useCallback(
    (conv: any) => {
      if (!conv) return null;

      const conversationId = normalizeId(conv._id ?? conv.id);
      if (!conversationId) {
        return null;
    }

    const currentUserId = session?.user?.id
      ? normalizeId(session.user.id)
      : null;
    const participants = Array.isArray(conv.participants)
      ? conv.participants
      : [];

    const extractParticipant = (participant: any) => {
      if (!participant) return null;
      const user = participant.userId || participant.user || participant;
      const participantId = normalizeId(
        user?._id ??
          user?.id ??
          participant.userId ??
          participant.id ??
          participant
      );

      const firstName = user?.firstName ?? participant.firstName ?? "";
      const lastName = user?.lastName ?? participant.lastName ?? "";
      const email = user?.email ?? participant.email ?? "";
      const avatar = user?.avatar ?? participant.avatar ?? null;
      const fullName = [firstName, lastName].filter(Boolean).join(" ");

      return {
        id: participantId,
        firstName,
        lastName,
        fullName: fullName || email || "Unknown",
        email,
        avatar,
        raw: participant,
      };
    };

    const participantDetails = participants
      .map(extractParticipant)
      .filter(Boolean);

    const otherParticipant = participantDetails.find((participant: any) => {
      if (!participant?.id) {
        return false;
      }
      if (currentUserId && participant.id === currentUserId) {
        return false;
      }
      return true;
    });

    // For individual conversations, try to get the other participant's name
    let otherParticipantName = "";
    if (conv.type === "individual" && otherParticipant) {
      otherParticipantName =
        otherParticipant.fullName || otherParticipant.email || "";
    }

    const currentUserNameParts = [
      session?.user?.firstName,
      session?.user?.lastName,
    ].filter((value): value is string => Boolean(value?.trim()));
    const currentUserFullName =
      (currentUserNameParts.length > 0
        ? currentUserNameParts.join(" ")
        : typeof session?.user?.name === "string"
        ? session.user.name
        : ""
      ).trim();

    const currentUserEmail = (session?.user?.email || "").toLowerCase();

    const isGroupConversation = conv.type === "group";

    const participantFallbackName = otherParticipantName.trim();
    const conversationNameCandidates = [
      conv.displayName,
      conv.name,
      conv.contactName,
      conv.description,
    ]
      .map((value) => (typeof value === "string" ? value.trim() : ""))
      .filter(Boolean);

    let displayName = "";
    if (isGroupConversation) {
      displayName =
        conversationNameCandidates.find(Boolean) || "Group Conversation";
    } else {
      const otherNameCandidate = participantFallbackName;
      const nonSelfCandidate = conversationNameCandidates.find((candidate) => {
        if (!candidate) {
          return false;
        }
        if (!currentUserFullName) {
          return true;
        }
        return candidate.toLowerCase() !== currentUserFullName.toLowerCase();
      });

      displayName =
        otherNameCandidate ||
        nonSelfCandidate ||
        (conv.contactEmail ? String(conv.contactEmail).trim() : "") ||
        "Direct Message";
    }
    displayName = displayName.trim();

    const conversationEmailCandidates = [
      conv.displayEmail,
      conv.contactEmail,
    ]
      .map((value) => (typeof value === "string" ? value.trim() : ""))
      .filter(Boolean);

    let displayEmail = "";
    if (isGroupConversation) {
      displayEmail = conversationEmailCandidates[0] || "";
    } else {
      const otherEmail = otherParticipant?.email?.trim();
      const nonSelfEmail = conversationEmailCandidates.find((candidate) => {
        if (!candidate) {
          return false;
        }
        if (!currentUserEmail) {
          return true;
        }
        return candidate.toLowerCase() !== currentUserEmail;
      });

      displayEmail = otherEmail || nonSelfEmail || "";
    }

    const computeInitials = (value: string) =>
      value
        .split(/\s+/)
        .filter(Boolean)
        .slice(0, 2)
        .map((segment) => segment[0])
        .join("")
        .toUpperCase();

    const initials = computeInitials(displayName || "DM") || "DM";

    const rawLastMessage =
      conv.lastMessage ||
      conv.lastMessagePreview ||
      conv.latestMessage ||
      conv.metadata?.lastMessage;

    let lastMessageContent = "";
    let lastMessageCreatedAt: string | Date | null = null;
    let lastMessageSenderId = "";
    let lastMessageSenderName = "";
    let lastMessageId = "";
    let lastMessageStatus = rawLastMessage?.status;

    if (rawLastMessage) {
      if (typeof rawLastMessage === "string") {
        lastMessageContent = rawLastMessage;
      } else {
        lastMessageContent =
          rawLastMessage.content ||
          rawLastMessage.preview ||
          rawLastMessage.message?.content ||
          "";

        lastMessageCreatedAt =
          rawLastMessage.createdAt ||
          rawLastMessage.timestamp ||
          rawLastMessage.sentAt ||
          rawLastMessage.message?.createdAt ||
          null;

        lastMessageSenderId = normalizeId(
          rawLastMessage.senderId ||
            rawLastMessage.sender?._id ||
            rawLastMessage.sender?.id ||
            rawLastMessage.message?.senderId
        );

        lastMessageId = normalizeId(
          rawLastMessage.messageId ||
            rawLastMessage._id ||
            rawLastMessage.id ||
            rawLastMessage.message?._id
        );

        lastMessageSenderName =
          rawLastMessage.senderName ||
          rawLastMessage.sender?.name ||
          rawLastMessage.sender?.fullName ||
          participantDetails.find((p: any) => p?.id === lastMessageSenderId)
            ?.fullName ||
          "";
      }
    }

    const lastMessage = lastMessageContent
      ? {
          messageId: lastMessageId,
          content: lastMessageContent,
          createdAt: lastMessageCreatedAt,
          senderId: lastMessageSenderId,
          senderName: lastMessageSenderName,
          status: lastMessageStatus,
          sender:
            participantDetails.find(
              (p: any) => p?.id === lastMessageSenderId
            ) ||
            (lastMessageSenderName
              ? {
                  firstName: lastMessageSenderName.split(" ")[0] || "",
                  lastName: lastMessageSenderName.split(" ")[1] || "",
                  fullName: lastMessageSenderName,
                }
              : undefined),
        }
      : null;

    const lastActivityTimestamp =
      lastMessage?.createdAt ||
      conv.metadata?.lastActivity ||
      conv.updatedAt ||
      conv.createdAt;

      return {
        _id: conversationId,
        type: conv.type || "individual",
        name: displayName,
        displayName,
      displayEmail,
      initials,
      lastMessage,
      lastMessagePreview: lastMessage?.content || "No messages yet",
      lastMessageTime: lastActivityTimestamp,
      unreadCount: conv.unreadCount || 0,
      avatar: otherParticipant?.avatar || conv.avatar || null,
      participants,
      participantDetails,
      otherParticipant,
      originalData: conv,
    };
    },
    [normalizeId, session?.user?.id]
  );

  const normalizeMessage = useCallback(
    (msg: any) => {
      if (!msg) return msg;

      const messageId = normalizeId(msg._id ?? msg.id);
      const conversationId = normalizeId(msg.conversationId);
      const senderValue = msg.senderId ?? msg.sender;
    const senderId = normalizeId(
      senderValue?._id ?? senderValue?.id ?? senderValue
    );

    const senderDetails =
      senderValue && typeof senderValue === "object"
        ? {
            ...senderValue,
            _id: senderId,
          }
        : undefined;

      return {
        ...msg,
        _id: messageId,
        id: messageId,
        conversationId,
        senderId: senderDetails || senderId,
        senderIdNormalized: senderId,
        createdAt: msg.createdAt || new Date().toISOString(),
      };
    },
    [normalizeId]
  );

  const buildLatestMessagePayload = useCallback(
    (message: any) => {
      if (!message) {
        return null;
      }

      const messageId = normalizeId(message._id ?? message.id);
      if (!messageId) {
        return null;
      }

      const senderValue =
        typeof message.senderId === "object" && message.senderId !== null
          ? message.senderId
          : typeof message.sender === "object" && message.sender !== null
          ? message.sender
          : undefined;

      const senderId =
        message.senderIdNormalized ||
        normalizeId(message.senderId?._id ?? message.senderId);

      const senderName = senderValue
        ? senderValue.fullName ||
          [senderValue.firstName, senderValue.lastName]
            .filter(Boolean)
            .join(" ") ||
          senderValue.email ||
          ""
        : message.senderName || "";

      return {
        messageId,
        content: message.content,
        createdAt: message.createdAt,
        senderId,
        senderName,
        status: message.status,
      };
    },
    [normalizeId]
  );

  const syncConversationWithLatestMessage = useCallback(
    (
      conversationId: string,
      message: any,
      options: { unreadCount?: number } = {}
    ) => {
      const payload = buildLatestMessagePayload(message);
      if (!payload) {
        return;
      }

      setConversations((prev) =>
        prev.map((conversation) => {
          if (normalizeId(conversation._id) !== conversationId) {
            return conversation;
          }

          return {
            ...conversation,
            lastMessage: {
              ...conversation.lastMessage,
              ...payload,
            },
            lastMessagePreview: payload.content,
            lastMessageTime: payload.createdAt,
            unreadCount:
              typeof options.unreadCount === "number"
                ? options.unreadCount
                : conversation.unreadCount,
          };
        })
      );

      setSelectedConversation((prev) => {
        if (prev && normalizeId(prev._id) === conversationId) {
          return {
            ...prev,
            lastMessage: {
              ...prev.lastMessage,
              ...payload,
            },
            lastMessagePreview: payload.content,
            lastMessageTime: payload.createdAt,
            unreadCount:
              typeof options.unreadCount === "number"
                ? options.unreadCount
                : prev.unreadCount,
          };
        }
        return prev;
      });
    },
    [buildLatestMessagePayload, normalizeId]
  );

  const markMessagesAsRead = useCallback(
    async (conversationId: string, fetchedMessages: any[]) => {
      if (!session?.user?.id) {
        return;
      }

      const currentUserId = normalizeId(session.user.id);

      const unreadMessages = fetchedMessages.filter((message) => {
        const senderId =
          message.senderIdNormalized ||
          normalizeId(message.senderId?._id ?? message.senderId);

        if (!senderId || senderId === currentUserId) {
          return false;
        }

        return message.status !== "read";
      });

      if (unreadMessages.length === 0) {
        return;
      }

      const messageIds = unreadMessages
        .map((message) => normalizeId(message._id ?? message.id))
        .filter(Boolean);

      if (messageIds.length === 0) {
        return;
      }

      const messageIdSet = new Set(messageIds);

      try {
        await fetch(`/api/conversations/${conversationId}/messages`, {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            action: "mark_as_read",
            messageIds,
          }),
        });

        setMessages((prev) =>
          prev.map((message) => {
            const messageId = normalizeId(message._id ?? message.id);
            if (messageIdSet.has(messageId)) {
              return {
                ...message,
                status: "read",
                readAt: new Date().toISOString(),
              };
            }
            return message;
          })
        );

        const latestMessage = fetchedMessages[fetchedMessages.length - 1] || null;

        if (latestMessage) {
          syncConversationWithLatestMessage(conversationId, latestMessage, {
            unreadCount: 0,
          });
        } else {
          setConversations((prev) =>
            prev.map((conversation) => {
              if (normalizeId(conversation._id) !== conversationId) {
                return conversation;
              }

              return {
                ...conversation,
                unreadCount: 0,
              };
            })
          );

          setSelectedConversation((prev) => {
            if (prev && normalizeId(prev._id) === conversationId) {
              return {
                ...prev,
                unreadCount: 0,
              };
            }
            return prev;
          });
        }
      } catch (error) {
        // Best effort: ignore failures to mark messages as read in UI thread
      }
    },
    [
      normalizeId,
      session?.user?.id,
      syncConversationWithLatestMessage,
    ]
  );

  // Load conversations from API
  const loadConversations = useCallback(async () => {
    try {
      setLoadingConversations(true);
      setConversationsError(null);

      const response = await fetch("/api/conversations");
      if (!response.ok) {
        throw new Error(`Request failed with status ${response.status}`);
      }

      const apiResponse = await response.json();
      const conversationsArray = Array.isArray(apiResponse)
        ? apiResponse
        : apiResponse?.data?.conversations ??
          apiResponse?.conversations ??
          apiResponse?.data ??
          apiResponse;

      if (!Array.isArray(conversationsArray)) {
        setConversationsError("Conversations data is unavailable.");
        return;
      }

      const transformedConversations = conversationsArray
        .map(transformConversation)
        .filter(Boolean);

      setConversations(transformedConversations);

      setSelectedConversation((current) => {
        if (!current) {
          return transformedConversations[0] ?? null;
        }
        const currentId = normalizeId(current._id);
        const existing = transformedConversations.find(
          (conversation) => normalizeId(conversation?._id) === currentId
        );
        return existing ?? transformedConversations[0] ?? null;
      });
    } catch (error) {
      setConversationsError(
        error instanceof Error
          ? error.message
          : "Unable to load conversations."
      );
    } finally {
      setLoadingConversations(false);
    }
  }, [normalizeId, transformConversation]);

  // Load messages for a specific conversation
  const loadMessages = useCallback(
    async (conversationId: string) => {
      if (!conversationId) {
        setMessages([]);
        return;
      }

      try {
        setLoadingMessages(true);
        setMessagesError(null);

        const response = await fetch(
          `/api/conversations/${conversationId}/messages`
        );
        if (!response.ok) {
          throw new Error(`Request failed with status ${response.status}`);
        }

        const data = await response.json();
        const messagesArray = Array.isArray(data?.messages)
          ? data.messages
          : Array.isArray(data)
          ? data
          : null;

        if (!Array.isArray(messagesArray)) {
          throw new Error("Messages data is unavailable.");
        }

        const normalizedMessages = messagesArray.map(normalizeMessage);
        setMessages(normalizedMessages);

        const latestMessage =
          normalizedMessages[normalizedMessages.length - 1] || null;

        if (latestMessage) {
          syncConversationWithLatestMessage(conversationId, latestMessage);
        }

        await markMessagesAsRead(conversationId, normalizedMessages);
      } catch (error) {
        setMessagesError(
          error instanceof Error ? error.message : "Unable to load messages."
        );
      } finally {
        setLoadingMessages(false);
      }
    },
    [markMessagesAsRead, normalizeMessage, syncConversationWithLatestMessage]
  );

  // Load conversations on component mount
  useEffect(() => {
    loadConversations();
  }, [loadConversations]);

  // Reload conversations once session information is available
  useEffect(() => {
    if (session?.user?.id) {
      loadConversations();
    }
  }, [loadConversations, session?.user?.id]);

  // Refresh conversations when refreshTrigger changes
  useEffect(() => {
    if (refreshTrigger) {
      loadConversations();
    }
  }, [loadConversations, refreshTrigger]);

  // Real-time functionality removed - using database-only approach

  // Conversation change handling simplified for database-only approach

  const selectedConversationId = selectedConversation
    ? normalizeId(selectedConversation._id)
    : null;

  // Polling for new messages and conversation updates
  useEffect(() => {
    const pollInterval = setInterval(() => {
      loadConversations();

      if (selectedConversationId) {
        loadMessages(selectedConversationId);
      }
    }, 10000);

    return () => clearInterval(pollInterval);
  }, [loadConversations, loadMessages, selectedConversationId]);

  // Auto-scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const selectedConversationLastUpdate =
    selectedConversation?.lastMessage?.messageId ||
    selectedConversation?.lastMessage?.createdAt ||
    selectedConversation?.lastMessageTime ||
    selectedConversation?.originalData?.updatedAt ||
    null;

  // Load messages when conversation is selected
  useEffect(() => {
    if (selectedConversationId) {
      loadMessages(selectedConversationId);
    } else {
      // Clear messages when no conversation is selected
      setMessages([]);
      setMessagesError(null);
    }
  }, [loadMessages, selectedConversationId, selectedConversationLastUpdate]);

  // Filter conversations based on search
  const filteredConversations = conversations.filter((conv) => {
    const label = (conv.displayName || conv.name || "").toLowerCase();
    return label.includes(searchQuery.toLowerCase());
  });

  // Get messages for selected conversation
  const conversationMessages = selectedConversationId
    ? messages.filter(
        (msg) => normalizeId(msg.conversationId) === selectedConversationId
      )
    : [];

  const handleSendMessage = async () => {
    if (!newMessage.trim() || !selectedConversationId) return;

    setLoading(true);
    try {
      // Send message via API
      const response = await fetch(
        `/api/conversations/${selectedConversationId}/messages`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            content: newMessage.trim(),
            messageType: "general",
            priority: "normal",
          }),
        }
      );

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        const message =
          errorData?.error || errorData?.message || "Failed to send message";
        throw new Error(message);
      }

      const data = await response.json();
      const newMsg = normalizeMessage(data.message);
      setMessages((prev) => [...prev, newMsg]);
      syncConversationWithLatestMessage(selectedConversationId, newMsg, {
        unreadCount: 0,
      });
      setNewMessage("");
      toast.success("Message sent!");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to send message"
      );
    } finally {
      setLoading(false);
    }
  };

  const handleCreateConversation = async (data: {
    type: "individual" | "group";
    name?: string;
    description?: string;
    participants: string[];
    propertyId?: string;
  }) => {
    try {
      const response = await fetch("/api/conversations", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(data),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(
          errorText || `Failed to create conversation (${response.status})`
        );
      }

      const apiResponse = await response.json();
      const createdConversation =
        apiResponse.data?.conversation ||
        apiResponse.conversation ||
        apiResponse.data ||
        apiResponse;

      const transformedConversation =
        transformConversation(createdConversation);

      toast.success("Conversation created successfully!");
      setShowNewConversationDialog(false);

      if (transformedConversation) {
        const newConversationId = normalizeId(transformedConversation._id);

        setConversations((prev) => {
          const updated = [...prev];
          const existingIndex = updated.findIndex(
            (conv) => normalizeId(conv._id) === newConversationId
          );

          if (existingIndex >= 0) {
            updated[existingIndex] = transformedConversation;
            return updated;
          }

          return [transformedConversation, ...updated];
        });

        setSelectedConversation(transformedConversation);
      }

      loadConversations();
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Failed to create conversation"
      );
      throw error;
    }
  };

  // Typing indicators removed - using database-only approach
  const handleTypingStart = () => {
    // No-op - typing indicators disabled
  };

  const handleTypingStop = () => {
    // No-op - typing indicators disabled
  };

  const getMessageStatusIcon = (status: string) => {
    switch (status) {
      case "sent":
        return <Clock className="h-3 w-3 text-muted-foreground" />;
      case "delivered":
        return <Check className="h-3 w-3 text-muted-foreground" />;
      case "read":
        return <CheckCheck className="h-3 w-3 text-green-500" />;
      case "failed":
        return <AlertCircle className="h-3 w-3 text-destructive" />;
      default:
        return null;
    }
  };

  const formatMessageTime = (date: Date | string | undefined | null) => {
    if (!date) {
      return "Now";
    }

    try {
      const messageDate = new Date(date);
      if (isNaN(messageDate.getTime())) {
        return "Now";
      }

      const now = new Date();
      const diffInHours =
        (now.getTime() - messageDate.getTime()) / (1000 * 60 * 60);

      if (diffInHours < 24) {
        return format(messageDate, "HH:mm");
      } else {
        return format(messageDate, "MMM dd, HH:mm");
      }
    } catch (error) {
      return "Now";
    }
  };

  return (
    <div className="flex h-full bg-background rounded-lg border shadow-sm overflow-hidden">
      {/* Conversations Sidebar */}
      <div className="w-80 border-r bg-muted/30 flex flex-col">
        {/* Header */}
        <div className="p-4 border-b bg-background">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-lg font-semibold text-foreground">Messages</h2>
            <Button
              size="sm"
              onClick={() => setShowNewConversationDialog(true)}
            >
              <Plus className="h-4 w-4 mr-1" />
              New
            </Button>
          </div>

          {/* Search */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search conversations..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10"
            />
          </div>
        </div>

        {/* Conversations List */}
        <ScrollArea className="flex-1">
          <div className="p-2">
            {!loadingConversations &&
              conversationsError &&
              conversations.length > 0 && (
              <div className="mb-3 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
                {conversationsError}
              </div>
            )}
            {loadingConversations ? (
              <div className="flex items-center justify-center py-8">
                <div className="text-center">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-2"></div>
                  <p className="text-sm text-muted-foreground">
                    Loading conversations...
                  </p>
                </div>
              </div>
            ) : filteredConversations.length === 0 ? (
              conversationsError && conversations.length === 0 ? (
                <div className="flex items-center justify-center py-8">
                  <div className="text-center text-destructive">
                    <MessageSquare className="h-12 w-12 text-destructive/50 mx-auto mb-2" />
                    <p className="text-sm">{conversationsError}</p>
                    <p className="text-xs text-destructive/70 mt-1">
                      Try refreshing the page.
                    </p>
                  </div>
                </div>
              ) : (
                <div className="flex items-center justify-center py-8">
                  <div className="text-center">
                    <MessageSquare className="h-12 w-12 text-muted-foreground/50 mx-auto mb-2" />
                    <p className="text-sm text-muted-foreground">
                      No conversations found
                    </p>
                    <p className="text-xs text-muted-foreground/70 mt-1">
                      {searchQuery
                        ? "Try a different search term"
                        : "Start a new conversation"}
                    </p>
                  </div>
                </div>
              )
            ) : (
              filteredConversations.map((conversation) => (
                <div
                  key={conversation._id}
                  onClick={() => setSelectedConversation(conversation)}
                  className={cn(
                    "flex items-center gap-3 p-3 rounded-lg cursor-pointer transition-colors mb-1",
                    selectedConversation?._id === conversation._id
                      ? "bg-primary/10 border border-primary/20"
                      : "hover:bg-muted/50"
                  )}
                >
                  <div className="relative">
                    <Avatar className="h-12 w-12">
                      <AvatarFallback className="bg-primary/10 text-primary">
                        {conversation.type === "group" ? (
                          <Users className="h-6 w-6" />
                        ) : (
                          conversation.initials || "DM"
                        )}
                      </AvatarFallback>
                    </Avatar>
                    {conversation.type === "individual" && (
                      <div className="absolute -bottom-1 -right-1 h-4 w-4 bg-green-500 border-2 border-background rounded-full" />
                    )}
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between">
                      <h3 className="font-medium text-foreground truncate">
                        {conversation.displayName || conversation.name}
                      </h3>
                      <span className="text-xs text-muted-foreground">
                        {formatMessageTime(conversation.lastMessageTime)}
                      </span>
                    </div>
                    {conversation.displayEmail && (
                      <p className="text-xs text-muted-foreground truncate">
                        {conversation.displayEmail}
                      </p>
                    )}
                    <p className="text-sm text-muted-foreground truncate">
                      {conversation.lastMessagePreview || "No messages yet"}
                    </p>
                    <div className="flex items-center justify-between mt-1">
                      <span className="text-xs text-muted-foreground">
                        {conversation.lastMessage?.sender?.fullName ||
                          conversation.lastMessage?.senderName ||
                          ""}
                      </span>
                      {conversation.unreadCount > 0 && (
                        <Badge className="bg-primary text-primary-foreground text-xs px-2 py-0.5">
                          {conversation.unreadCount}
                        </Badge>
                      )}
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </ScrollArea>
      </div>

      {/* Chat Area */}
      <div className="flex-1 flex flex-col">
        {selectedConversation ? (
          <>
            {/* Chat Header */}
            <div className="p-4 border-b bg-background flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Avatar className="h-10 w-10">
                  <AvatarFallback className="bg-primary/10 text-primary">
                    {selectedConversation.type === "group" ? (
                      <Users className="h-5 w-5" />
                    ) : selectedConversation.initials ? (
                      selectedConversation.initials
                    ) : (
                      "U"
                    )}
                  </AvatarFallback>
                </Avatar>
                <div>
                  <h3 className="font-medium text-foreground">
                    {selectedConversation.displayName ||
                      selectedConversation.name ||
                      "Unknown Conversation"}
                  </h3>
                  <div className="text-sm text-muted-foreground flex items-center gap-2">
                    {selectedConversation.type === "group"
                      ? `${selectedConversation.participants.length} participants`
                      : selectedConversation.displayEmail
                      ? selectedConversation.displayEmail
                      : "Online"}
                    {/* Database Mode */}
                    <span className="flex items-center gap-1">
                      <div className="w-2 h-2 rounded-full bg-primary" />
                      <span className="text-xs">Database Mode</span>
                    </span>
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <Button variant="ghost" size="sm">
                  <Phone className="h-4 w-4" />
                </Button>
                <Button variant="ghost" size="sm">
                  <Video className="h-4 w-4" />
                </Button>
                <Button variant="ghost" size="sm">
                  <Info className="h-4 w-4" />
                </Button>
                <Button variant="ghost" size="sm">
                  <MoreVertical className="h-4 w-4" />
                </Button>
              </div>
            </div>

            {/* Messages */}
            <ScrollArea className="flex-1 p-4">
              <div className="space-y-4">
                {!loadingMessages &&
                  messagesError &&
                  conversationMessages.length > 0 && (
                  <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
                    {messagesError}
                  </div>
                )}
                {loadingMessages ? (
                  <div className="flex items-center justify-center py-8">
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <div className="w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin"></div>
                      Loading messages...
                    </div>
                  </div>
                ) : conversationMessages.length === 0 ? (
                  messagesError ? (
                    <div className="flex items-center justify-center py-8">
                      <div className="text-center text-destructive">
                        <p className="text-sm">{messagesError}</p>
                        <p className="text-xs text-destructive/70">
                          Try refreshing the conversation.
                        </p>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-center justify-center py-8">
                      <div className="text-center text-muted-foreground">
                        <p>No messages yet</p>
                        <p className="text-sm">Start a conversation!</p>
                      </div>
                    </div>
                  )
                ) : (
                  conversationMessages.map((message) => {
                    const isCurrentUser =
                      message.senderId?._id === session?.user?.id ||
                      message.senderId === session?.user?.id;

                    return (
                      <div
                        key={message._id}
                        className={cn(
                          "flex gap-3",
                          isCurrentUser ? "justify-end" : "justify-start"
                        )}
                      >
                        {!isCurrentUser && (
                          <Avatar className="h-8 w-8">
                            <AvatarFallback className="text-xs">
                              {message.senderId?.firstName?.[0] || "U"}
                              {message.senderId?.lastName?.[0] || ""}
                            </AvatarFallback>
                          </Avatar>
                        )}

                        <div
                          className={cn(
                            "max-w-xs lg:max-w-md px-4 py-2 rounded-lg",
                            isCurrentUser
                              ? "bg-primary text-primary-foreground"
                              : "bg-muted text-foreground"
                          )}
                        >
                          <p className="text-sm">{message.content}</p>
                          <div
                            className={cn(
                              "flex items-center gap-1 mt-1",
                              isCurrentUser ? "justify-end" : "justify-start"
                            )}
                          >
                            <span
                              className={cn(
                                "text-xs",
                                isCurrentUser
                                  ? "text-blue-100"
                                  : "text-gray-500"
                              )}
                            >
                              {formatMessageTime(message.createdAt)}
                            </span>
                            {isCurrentUser &&
                              getMessageStatusIcon(message.status)}
                          </div>
                        </div>

                        {isCurrentUser && (
                          <Avatar className="h-8 w-8">
                            <AvatarFallback className="text-xs bg-primary/10 text-primary">
                              {session?.user?.firstName?.[0] || "U"}
                              {session?.user?.lastName?.[0] || ""}
                            </AvatarFallback>
                          </Avatar>
                        )}
                      </div>
                    );
                  })
                )}
                <div ref={messagesEndRef} />
              </div>
            </ScrollArea>

            {/* Typing indicators removed - using database-only approach */}

            {/* Message Input */}
            <div className="p-4 border-t bg-background">
              <div className="flex items-end gap-2">
                <Button variant="ghost" size="sm">
                  <Paperclip className="h-4 w-4" />
                </Button>
                <Button variant="ghost" size="sm">
                  <Smile className="h-4 w-4" />
                </Button>

                <div className="flex-1">
                  <Textarea
                    placeholder="Type a message..."
                    value={newMessage}
                    onChange={(e) => {
                      setNewMessage(e.target.value);
                      handleTypingStart();
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.shiftKey) {
                        e.preventDefault();
                        handleSendMessage();
                        handleTypingStop();
                      }
                    }}
                    onBlur={handleTypingStop}
                    className="min-h-[40px] max-h-32 resize-none"
                    rows={1}
                  />
                </div>

                <Button
                  onClick={handleSendMessage}
                  disabled={!newMessage.trim() || loading}
                >
                  <Send className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </>
        ) : (
          /* No conversation selected */
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center">
              <MessageSquare className="h-16 w-16 text-muted-foreground/50 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-foreground mb-2">
                Select a conversation
              </h3>
              <p className="text-muted-foreground">
                Choose a conversation from the sidebar to start messaging
              </p>
            </div>
          </div>
        )}
      </div>

      {/* New Conversation Dialog */}
      <NewConversationDialog
        open={showNewConversationDialog}
        onOpenChange={setShowNewConversationDialog}
        onCreateConversation={handleCreateConversation}
      />
    </div>
  );
};

export default SimpleMessagingInterface;
