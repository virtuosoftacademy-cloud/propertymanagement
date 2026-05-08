/**
 * PropertyPro - Enhanced Real-time Messaging Interface
 * Modern chat interface with real-time updates and PropertyPro design integration
 */

"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import {
  MessageCircle,
  Send,
  Search,
  Plus,
  MoreVertical,
  Paperclip,
  Phone,
  Video,
  Info,
  Archive,
  Trash2,
  Reply,
  Edit,
  Clock,
  Check,
  CheckCheck,
  AlertCircle,
  Users,
  Settings,
  Smile,
  Image,
  File,
  X,
  Loader2,
  Wifi,
  WifiOff,
  Pin,
  Star,
} from "lucide-react";
import { format, formatDistanceToNow } from "date-fns";
import { toast } from "sonner";
import { useConversations } from "@/hooks/useConversations";
import { cn } from "@/lib/utils";
import NewConversationDialog from "./NewConversationDialog";

// Database Mode Status Component
const ConnectionStatus: React.FC = () => {
  return (
    <div className="flex items-center gap-2 text-blue-600 text-sm">
      <Database className="h-4 w-4" />
      <span>Database Mode</span>
    </div>
  );
};

// Message Status Icon Component
const MessageStatusIcon: React.FC<{ status: string; isOwn: boolean }> = ({
  status,
  isOwn,
}) => {
  if (!isOwn) return null;

  switch (status) {
    case "sent":
      return <Clock className="h-3 w-3 text-gray-400" />;
    case "delivered":
      return <Check className="h-3 w-3 text-gray-400" />;
    case "read":
      return <CheckCheck className="h-3 w-3 text-blue-500" />;
    case "failed":
      return <AlertCircle className="h-3 w-3 text-red-500" />;
    default:
      return null;
  }
};

// Typing Indicator Component
const TypingIndicator: React.FC<{
  users: Array<{ firstName: string; lastName: string }>;
}> = ({ users }) => {
  if (users.length === 0) return null;

  const names = users.map((u) => `${u.firstName} ${u.lastName}`);
  const displayText =
    names.length === 1
      ? `${names[0]} is typing...`
      : names.length === 2
      ? `${names[0]} and ${names[1]} are typing...`
      : `${names[0]} and ${names.length - 1} others are typing...`;

  return (
    <div className="flex items-center gap-2 text-sm text-gray-500 px-4 py-2">
      <div className="flex gap-1">
        <div
          className="w-2 h-2 bg-gray-400 rounded-full animate-bounce"
          style={{ animationDelay: "0ms" }}
        />
        <div
          className="w-2 h-2 bg-gray-400 rounded-full animate-bounce"
          style={{ animationDelay: "150ms" }}
        />
        <div
          className="w-2 h-2 bg-gray-400 rounded-full animate-bounce"
          style={{ animationDelay: "300ms" }}
        />
      </div>
      <span>{displayText}</span>
    </div>
  );
};

// Conversation List Item Component
const ConversationItem: React.FC<{
  conversation: any;
  isSelected: boolean;
  onClick: () => void;
  onArchive: () => void;
  onDelete: () => void;
}> = ({ conversation, isSelected, onClick, onArchive, onDelete }) => {
  const getConversationName = () => {
    if (conversation.type === "individual") {
      const otherParticipant = conversation.participants.find(
        (p: any) => p.userId._id !== "current-user-id" // This should be the actual current user ID
      );
      return otherParticipant
        ? `${otherParticipant.userId.firstName} ${otherParticipant.userId.lastName}`
        : "Unknown User";
    }
    return conversation.name || "Group Chat";
  };

  const getLastMessagePreview = () => {
    if (!conversation.lastMessage) return "No messages yet";
    return conversation.lastMessage.content.length > 50
      ? `${conversation.lastMessage.content.substring(0, 50)}...`
      : conversation.lastMessage.content;
  };

  return (
    <div
      className={cn(
        "flex items-center gap-3 p-3 rounded-lg cursor-pointer transition-all duration-200 hover:bg-gray-50",
        isSelected && "bg-blue-50 border-l-4 border-blue-500"
      )}
      onClick={onClick}
    >
      <div className="relative">
        <Avatar className="h-12 w-12">
          <AvatarImage src={conversation.avatar} />
          <AvatarFallback className="bg-gradient-to-br from-blue-500 to-blue-600 text-white">
            {conversation.type === "individual" ? (
              getConversationName()
                .split(" ")
                .map((n) => n[0])
                .join("")
                .toUpperCase()
            ) : (
              <Users className="h-6 w-6" />
            )}
          </AvatarFallback>
        </Avatar>
        {conversation.type === "group" && (
          <div className="absolute -bottom-1 -right-1 bg-blue-500 rounded-full p-1">
            <Users className="h-3 w-3 text-white" />
          </div>
        )}
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between">
          <h3 className="font-medium text-gray-900 truncate">
            {getConversationName()}
          </h3>
          <div className="flex items-center gap-2">
            {conversation.isPinned && <Pin className="h-4 w-4 text-blue-500" />}
            {conversation.unreadCount > 0 && (
              <Badge
                variant="default"
                className="bg-blue-500 text-white text-xs"
              >
                {conversation.unreadCount > 99
                  ? "99+"
                  : conversation.unreadCount}
              </Badge>
            )}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="sm" className="h-6 w-6 p-0">
                  <MoreVertical className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={onArchive}>
                  <Archive className="h-4 w-4 mr-2" />
                  Archive
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={onDelete} className="text-red-600">
                  <Trash2 className="h-4 w-4 mr-2" />
                  Delete
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        <div className="flex items-center justify-between mt-1">
          <p className="text-sm text-gray-500 truncate">
            {getLastMessagePreview()}
          </p>
          {conversation.lastMessage && (
            <span className="text-xs text-gray-400">
              {formatDistanceToNow(
                new Date(conversation.lastMessage.createdAt),
                { addSuffix: true }
              )}
            </span>
          )}
        </div>
      </div>
    </div>
  );
};

// Message Item Component
const MessageItem: React.FC<{
  message: any;
  isOwn: boolean;
  showAvatar: boolean;
  onReply: () => void;
  onEdit: () => void;
  onDelete: () => void;
}> = ({ message, isOwn, showAvatar, onReply, onEdit, onDelete }) => {
  return (
    <div
      className={cn("flex gap-3 mb-4", isOwn ? "flex-row-reverse" : "flex-row")}
    >
      {showAvatar && !isOwn && (
        <Avatar className="h-8 w-8">
          <AvatarImage src={message.senderId.avatar} />
          <AvatarFallback className="bg-gradient-to-br from-gray-500 to-gray-600 text-white text-sm">
            {`${message.senderId.firstName[0]}${message.senderId.lastName[0]}`}
          </AvatarFallback>
        </Avatar>
      )}

      <div
        className={cn(
          "flex flex-col max-w-[70%]",
          isOwn ? "items-end" : "items-start"
        )}
      >
        {showAvatar && !isOwn && (
          <span className="text-xs text-gray-500 mb-1">
            {`${message.senderId.firstName} ${message.senderId.lastName}`}
          </span>
        )}

        <div className="group relative">
          <div
            className={cn(
              "rounded-lg px-4 py-2 shadow-sm",
              isOwn
                ? "bg-gradient-to-r from-blue-500 to-blue-600 text-white"
                : "bg-white border border-gray-200 text-gray-900"
            )}
          >
            {message.replyToId && (
              <div
                className={cn(
                  "border-l-2 pl-2 mb-2 text-sm opacity-75",
                  isOwn ? "border-blue-200" : "border-gray-300"
                )}
              >
                <div className="font-medium">Replying to:</div>
                <div className="truncate">{message.replyToId.content}</div>
              </div>
            )}

            <p className="text-sm whitespace-pre-wrap break-words">
              {message.content}
            </p>

            {message.attachments && message.attachments.length > 0 && (
              <div className="mt-2 space-y-2">
                {message.attachments.map((attachment: any, index: number) => (
                  <div key={index} className="flex items-center gap-2 text-sm">
                    <File className="h-4 w-4" />
                    <span className="truncate">{attachment.fileName}</span>
                  </div>
                ))}
              </div>
            )}

            {message.mentions && message.mentions.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1">
                {message.mentions.map((mention: any) => (
                  <Badge
                    key={mention._id}
                    variant="secondary"
                    className="text-xs"
                  >
                    @{mention.firstName} {mention.lastName}
                  </Badge>
                ))}
              </div>
            )}
          </div>

          <div
            className={cn(
              "flex items-center gap-2 mt-1 text-xs text-gray-500",
              isOwn ? "justify-end" : "justify-start"
            )}
          >
            <span>{format(new Date(message.createdAt), "HH:mm")}</span>
            {message.isEdited && <span>(edited)</span>}
            <MessageStatusIcon status={message.status} isOwn={isOwn} />
          </div>

          {/* Message Actions */}
          <div
            className={cn(
              "absolute top-0 opacity-0 group-hover:opacity-100 transition-opacity",
              isOwn ? "-left-20" : "-right-20"
            )}
          >
            <div className="flex gap-1 bg-white border border-gray-200 rounded-lg shadow-lg p-1">
              <Button
                variant="ghost"
                size="sm"
                onClick={onReply}
                className="h-6 w-6 p-0"
              >
                <Reply className="h-3 w-3" />
              </Button>
              {isOwn && (
                <>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={onEdit}
                    className="h-6 w-6 p-0"
                  >
                    <Edit className="h-3 w-3" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={onDelete}
                    className="h-6 w-6 p-0 text-red-500"
                  >
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

// Main Enhanced Messaging Interface Component
export const EnhancedMessagingInterface: React.FC = () => {
  const [searchQuery, setSearchQuery] = useState("");
  const [newMessage, setNewMessage] = useState("");
  const [replyToMessage, setReplyToMessage] = useState<any>(null);
  const [editingMessage, setEditingMessage] = useState<any>(null);
  const [showNewConversationDialog, setShowNewConversationDialog] =
    useState(false);
  const [isTyping, setIsTyping] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messageInputRef = useRef<HTMLTextAreaElement>(null);
  const typingTimeoutRef = useRef<NodeJS.Timeout>();

  // Socket.io functionality removed - using database-only approach

  const {
    conversations,
    currentConversation,
    messages,
    loading,
    error,
    totalUnread,
    loadConversations,
    selectConversation,
    sendMessage,
    editMessage,
    deleteMessage,
    markAsRead,
    archiveConversation,
    deleteConversation,
  } = useConversations();

  // Auto-scroll to bottom when new messages arrive
  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, scrollToBottom]);

  // Typing indicators removed - using database-only approach
  const handleTypingStart = useCallback(() => {
    // No-op - typing indicators disabled
  }, []);

  const handleTypingStop = useCallback(() => {
    // No-op - typing indicators disabled
  }, []);

  // Handle message input changes
  const handleMessageChange = (value: string) => {
    setNewMessage(value);

    if (value.trim() && !isTyping) {
      handleTypingStart();
    } else if (!value.trim() && isTyping) {
      handleTypingStop();
    }
  };

  // Send message handler
  const handleSendMessage = async () => {
    if (!newMessage.trim() || !currentConversation) return;

    try {
      await sendMessage({
        content: newMessage,
        replyToId: replyToMessage?._id,
      });

      setNewMessage("");
      setReplyToMessage(null);
      handleTypingStop();

      // Focus back to input
      messageInputRef.current?.focus();
    } catch (error) {
      toast.error("Failed to send message");
    }
  };

  // Handle key press in message input
  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  // Handle message actions
  const handleReplyToMessage = (message: any) => {
    setReplyToMessage(message);
    messageInputRef.current?.focus();
  };

  const handleEditMessage = (message: any) => {
    setEditingMessage(message);
    setNewMessage(message.content);
    messageInputRef.current?.focus();
  };

  const handleDeleteMessage = async (messageId: string) => {
    try {
      await deleteMessage(messageId);
      toast.success("Message deleted");
    } catch (error) {
      toast.error("Failed to delete message");
    }
  };

  const handleSaveEdit = async () => {
    if (!editingMessage || !newMessage.trim()) return;

    try {
      await editMessage(editingMessage._id, newMessage);
      setEditingMessage(null);
      setNewMessage("");
      toast.success("Message updated");
    } catch (error) {
      toast.error("Failed to update message");
    }
  };

  const handleCancelEdit = () => {
    setEditingMessage(null);
    setNewMessage("");
    messageInputRef.current?.focus();
  };

  // Filter conversations based on search
  const filteredConversations = conversations.filter((conv) => {
    if (!searchQuery) return true;

    const searchLower = searchQuery.toLowerCase();
    const conversationName =
      conv.type === "individual"
        ? conv.participants.find((p: any) => p.userId._id !== "current-user-id")
            ?.userId.firstName +
          " " +
          conv.participants.find((p: any) => p.userId._id !== "current-user-id")
            ?.userId.lastName
        : conv.name;

    return (
      conversationName?.toLowerCase().includes(searchLower) ||
      conv.lastMessage?.content.toLowerCase().includes(searchLower)
    );
  });

  // Typing users removed - using database-only approach
  const currentTypingUsers: any[] = [];

  return (
    <div className="flex h-full bg-gray-50">
      {/* Sidebar - Conversations List */}
      <div className="w-80 bg-white border-r border-gray-200 flex flex-col">
        {/* Header */}
        <div className="p-4 border-b border-gray-200">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-semibold text-gray-900">Messages</h2>
            <div className="flex items-center gap-2">
              <ConnectionStatus />
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowNewConversationDialog(true)}
              >
                <Plus className="h-4 w-4" />
              </Button>
            </div>
          </div>

          {/* Search */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
            <Input
              placeholder="Search conversations..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10"
            />
          </div>

          {/* Unread count */}
          {totalUnread > 0 && (
            <div className="mt-2 text-sm text-blue-600">
              {totalUnread} unread message{totalUnread !== 1 ? "s" : ""}
            </div>
          )}
        </div>

        {/* Conversations List */}
        <ScrollArea className="flex-1">
          <div className="p-2 space-y-1">
            {loading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
              </div>
            ) : filteredConversations.length === 0 ? (
              <div className="text-center py-8 text-gray-500">
                {searchQuery
                  ? "No conversations found"
                  : "No conversations yet"}
              </div>
            ) : (
              filteredConversations.map((conversation) => (
                <ConversationItem
                  key={conversation._id}
                  conversation={conversation}
                  isSelected={currentConversation?._id === conversation._id}
                  onClick={() => selectConversation(conversation._id)}
                  onArchive={() => archiveConversation(conversation._id)}
                  onDelete={() => deleteConversation(conversation._id)}
                />
              ))
            )}
          </div>
        </ScrollArea>
      </div>

      {/* Main Chat Area */}
      <div className="flex-1 flex flex-col">
        {currentConversation ? (
          <>
            {/* Chat Header */}
            <div className="bg-white border-b border-gray-200 p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Avatar className="h-10 w-10">
                    <AvatarImage src={currentConversation.avatar} />
                    <AvatarFallback className="bg-gradient-to-br from-blue-500 to-blue-600 text-white">
                      {currentConversation.type === "individual" ? (
                        currentConversation.participants.find(
                          (p: any) => p.userId._id !== "current-user-id"
                        )?.userId.firstName[0] +
                        currentConversation.participants.find(
                          (p: any) => p.userId._id !== "current-user-id"
                        )?.userId.lastName[0]
                      ) : (
                        <Users className="h-5 w-5" />
                      )}
                    </AvatarFallback>
                  </Avatar>
                  <div>
                    <h3 className="font-medium text-gray-900">
                      {currentConversation.type === "individual"
                        ? currentConversation.participants.find(
                            (p: any) => p.userId._id !== "current-user-id"
                          )?.userId.firstName +
                          " " +
                          currentConversation.participants.find(
                            (p: any) => p.userId._id !== "current-user-id"
                          )?.userId.lastName
                        : currentConversation.name}
                    </h3>
                    <p className="text-sm text-gray-500">
                      {currentConversation.type === "group"
                        ? `${currentConversation.participants.length} participants`
                        : "Direct message"}
                    </p>
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
                </div>
              </div>
            </div>

            {/* Messages Area */}
            <ScrollArea className="flex-1 p-4">
              <div className="space-y-4">
                {messages.length === 0 ? (
                  <div className="text-center py-8 text-gray-500">
                    No messages yet. Start the conversation!
                  </div>
                ) : (
                  messages.map((message, index) => {
                    const isOwn = message.senderId._id === "current-user-id"; // This should be the actual current user ID
                    const showAvatar =
                      index === 0 ||
                      messages[index - 1].senderId._id !== message.senderId._id;

                    return (
                      <MessageItem
                        key={message._id}
                        message={message}
                        isOwn={isOwn}
                        showAvatar={showAvatar}
                        onReply={() => handleReplyToMessage(message)}
                        onEdit={() => handleEditMessage(message)}
                        onDelete={() => handleDeleteMessage(message._id)}
                      />
                    );
                  })
                )}

                {/* Typing Indicator */}
                <TypingIndicator users={currentTypingUsers} />

                <div ref={messagesEndRef} />
              </div>
            </ScrollArea>

            {/* Message Input Area */}
            <div className="bg-white border-t border-gray-200 p-4">
              {/* Reply Preview */}
              {replyToMessage && (
                <div className="mb-3 p-3 bg-gray-50 rounded-lg border-l-4 border-blue-500">
                  <div className="flex items-center justify-between">
                    <div className="flex-1">
                      <div className="text-sm font-medium text-gray-700">
                        Replying to {replyToMessage.senderId.firstName}
                      </div>
                      <div className="text-sm text-gray-600 truncate">
                        {replyToMessage.content}
                      </div>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setReplyToMessage(null)}
                      className="h-6 w-6 p-0"
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              )}

              {/* Edit Mode */}
              {editingMessage && (
                <div className="mb-3 p-3 bg-yellow-50 rounded-lg border-l-4 border-yellow-500">
                  <div className="flex items-center justify-between">
                    <div className="text-sm font-medium text-yellow-700">
                      Editing message
                    </div>
                    <div className="flex gap-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={handleSaveEdit}
                      >
                        Save
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={handleCancelEdit}
                      >
                        Cancel
                      </Button>
                    </div>
                  </div>
                </div>
              )}

              {/* Message Input */}
              <div className="flex items-end gap-3">
                <div className="flex gap-2">
                  <Button variant="ghost" size="sm" className="h-9 w-9 p-0">
                    <Paperclip className="h-4 w-4" />
                  </Button>
                  <Button variant="ghost" size="sm" className="h-9 w-9 p-0">
                    <Image className="h-4 w-4" />
                  </Button>
                  <Button variant="ghost" size="sm" className="h-9 w-9 p-0">
                    <Smile className="h-4 w-4" />
                  </Button>
                </div>

                <div className="flex-1">
                  <Textarea
                    ref={messageInputRef}
                    placeholder="Type a message..."
                    value={newMessage}
                    onChange={(e) => handleMessageChange(e.target.value)}
                    onKeyPress={handleKeyPress}
                    className="min-h-[40px] max-h-32 resize-none"
                    rows={1}
                  />
                </div>

                <Button
                  onClick={editingMessage ? handleSaveEdit : handleSendMessage}
                  disabled={!newMessage.trim()}
                  className="h-9 w-9 p-0 bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700"
                >
                  <Send className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </>
        ) : (
          /* No Conversation Selected */
          <div className="flex-1 flex items-center justify-center bg-gray-50">
            <div className="text-center">
              <MessageCircle className="h-16 w-16 text-gray-400 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-gray-900 mb-2">
                Select a conversation
              </h3>
              <p className="text-gray-500 mb-4">
                Choose a conversation from the sidebar to start messaging
              </p>
              <Button
                onClick={() => setShowNewConversationDialog(true)}
                className="bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700"
              >
                <Plus className="h-4 w-4 mr-2" />
                Start New Conversation
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* New Conversation Dialog */}
      <NewConversationDialog
        open={showNewConversationDialog}
        onOpenChange={setShowNewConversationDialog}
        onCreateConversation={createConversation}
      />
    </div>
  );
};

export default EnhancedMessagingInterface;
