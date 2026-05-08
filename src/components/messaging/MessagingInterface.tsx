"use client";

import React, { useState, useEffect, useRef } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  MessageSquare,
  Send,
  Search,
  Plus,
  Paperclip,
  MoreVertical,
  Phone,
  Video,
  AlertCircle,
  Clock,
  CheckCircle2,
  Users,
  Megaphone,
} from "lucide-react";
import { formatRelativeTime, formatInitials } from "@/lib/utils/formatting";
import { toast } from "sonner";

interface Message {
  id: string;
  conversationId: string;
  senderId: string;
  senderName: string;
  senderAvatar?: string;
  content: string;
  messageType: "general" | "maintenance" | "payment" | "lease" | "emergency" | "announcement";
  priority: "low" | "normal" | "high" | "urgent";
  status: "sent" | "delivered" | "read";
  attachments?: Array<{
    fileName: string;
    fileUrl: string;
    fileSize: number;
    fileType: string;
  }>;
  createdAt: Date;
  readAt?: Date;
  isSystemMessage: boolean;
}

interface Conversation {
  conversationId: string;
  participants: Array<{
    userId: string;
    name: string;
    avatar?: string;
    role: string;
  }>;
  lastMessage: {
    content: string;
    senderId: string;
    senderName: string;
    createdAt: Date;
    isRead: boolean;
  };
  unreadCount: number;
  propertyId?: string;
  propertyName?: string;
  messageType: string;
  priority: string;
}

interface MessagingInterfaceProps {
  userId: string;
  userRole: string;
  className?: string;
}

export default function MessagingInterface({
  userId,
  userRole,
  className,
}: MessagingInterfaceProps) {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [selectedConversation, setSelectedConversation] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [showNewMessageDialog, setShowNewMessageDialog] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Mock data for demonstration
  const mockConversations: Conversation[] = [
    {
      conversationId: "conv-1",
      participants: [
        { userId: "user-1", name: "John Smith", avatar: "", role: "Property Manager" },
        { userId: userId, name: "You", avatar: "", role: userRole },
      ],
      lastMessage: {
        content: "The maintenance request has been scheduled for tomorrow.",
        senderId: "user-1",
        senderName: "John Smith",
        createdAt: new Date(Date.now() - 2 * 60 * 60 * 1000),
        isRead: false,
      },
      unreadCount: 2,
      propertyId: "prop-1",
      propertyName: "Oak Street Apartments",
      messageType: "maintenance",
      priority: "normal",
    },
    {
      conversationId: "conv-2",
      participants: [
        { userId: "user-2", name: "Sarah Johnson", avatar: "", role: "Tenant" },
        { userId: userId, name: "You", avatar: "", role: userRole },
      ],
      lastMessage: {
        content: "Thank you for the quick response!",
        senderId: "user-2",
        senderName: "Sarah Johnson",
        createdAt: new Date(Date.now() - 24 * 60 * 60 * 1000),
        isRead: true,
      },
      unreadCount: 0,
      propertyId: "prop-2",
      propertyName: "Pine Avenue Complex",
      messageType: "general",
      priority: "low",
    },
  ];

  const mockMessages: Message[] = [
    {
      id: "msg-1",
      conversationId: "conv-1",
      senderId: "user-1",
      senderName: "John Smith",
      content: "Hi! I received your maintenance request for the leaky faucet. I'll schedule a plumber to come take a look.",
      messageType: "maintenance",
      priority: "normal",
      status: "read",
      createdAt: new Date(Date.now() - 4 * 60 * 60 * 1000),
      isSystemMessage: false,
    },
    {
      id: "msg-2",
      conversationId: "conv-1",
      senderId: userId,
      senderName: "You",
      content: "That sounds great! When would be a good time?",
      messageType: "maintenance",
      priority: "normal",
      status: "read",
      createdAt: new Date(Date.now() - 3 * 60 * 60 * 1000),
      isSystemMessage: false,
    },
    {
      id: "msg-3",
      conversationId: "conv-1",
      senderId: "user-1",
      senderName: "John Smith",
      content: "The maintenance request has been scheduled for tomorrow between 10 AM and 2 PM. The plumber will contact you 30 minutes before arrival.",
      messageType: "maintenance",
      priority: "normal",
      status: "delivered",
      createdAt: new Date(Date.now() - 2 * 60 * 60 * 1000),
      isSystemMessage: false,
    },
  ];

  useEffect(() => {
    setConversations(mockConversations);
  }, []);

  useEffect(() => {
    if (selectedConversation) {
      const conversationMessages = mockMessages.filter(
        msg => msg.conversationId === selectedConversation
      );
      setMessages(conversationMessages);
    }
  }, [selectedConversation]);

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  const handleSendMessage = async () => {
    if (!newMessage.trim() || !selectedConversation) return;

    setLoading(true);
    try {
      // In a real implementation, this would call the API
      const message: Message = {
        id: `msg-${Date.now()}`,
        conversationId: selectedConversation,
        senderId: userId,
        senderName: "You",
        content: newMessage,
        messageType: "general",
        priority: "normal",
        status: "sent",
        createdAt: new Date(),
        isSystemMessage: false,
      };

      setMessages(prev => [...prev, message]);
      setNewMessage("");
      toast.success("Message sent!");
    } catch (error) {
      toast.error("Failed to send message");
    } finally {
      setLoading(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  const getMessageTypeIcon = (type: string) => {
    switch (type) {
      case "maintenance": return <AlertCircle className="h-3 w-3" />;
      case "announcement": return <Megaphone className="h-3 w-3" />;
      case "emergency": return <AlertCircle className="h-3 w-3 text-red-500" />;
      default: return <MessageSquare className="h-3 w-3" />;
    }
  };

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case "urgent": return "bg-red-100 text-red-800";
      case "high": return "bg-orange-100 text-orange-800";
      case "normal": return "bg-blue-100 text-blue-800";
      case "low": return "bg-gray-100 text-gray-800";
      default: return "bg-gray-100 text-gray-800";
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "sent": return <Clock className="h-3 w-3 text-gray-400" />;
      case "delivered": return <CheckCircle2 className="h-3 w-3 text-blue-400" />;
      case "read": return <CheckCircle2 className="h-3 w-3 text-green-400" />;
      default: return null;
    }
  };

  const filteredConversations = conversations.filter(conv =>
    conv.participants.some(p => 
      p.name.toLowerCase().includes(searchQuery.toLowerCase())
    ) ||
    conv.propertyName?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    conv.lastMessage.content.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const selectedConversationData = conversations.find(
    conv => conv.conversationId === selectedConversation
  );

  return (
    <div className={`flex h-[600px] border rounded-lg overflow-hidden ${className}`}>
      {/* Conversations Sidebar */}
      <div className="w-1/3 border-r bg-muted/30">
        <div className="p-4 border-b">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-semibold">Messages</h3>
            <Dialog open={showNewMessageDialog} onOpenChange={setShowNewMessageDialog}>
              <DialogTrigger asChild>
                <Button size="sm" variant="outline">
                  <Plus className="h-4 w-4" />
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>New Message</DialogTitle>
                  <DialogDescription>
                    Start a new conversation
                  </DialogDescription>
                </DialogHeader>
                <div className="text-center py-8 text-muted-foreground">
                  <MessageSquare className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p>New message form coming soon</p>
                </div>
              </DialogContent>
            </Dialog>
          </div>
          
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

        <ScrollArea className="flex-1">
          <div className="p-2">
            {filteredConversations.map((conversation) => {
              const otherParticipant = conversation.participants.find(p => p.userId !== userId);
              
              return (
                <div
                  key={conversation.conversationId}
                  className={`p-3 rounded-lg cursor-pointer transition-colors mb-2 ${
                    selectedConversation === conversation.conversationId
                      ? "bg-primary/10 border border-primary/20"
                      : "hover:bg-accent"
                  }`}
                  onClick={() => setSelectedConversation(conversation.conversationId)}
                >
                  <div className="flex items-start gap-3">
                    <Avatar className="h-10 w-10">
                      <AvatarImage src={otherParticipant?.avatar} />
                      <AvatarFallback>
                        {formatInitials(
                          otherParticipant?.name.split(" ")[0] || "",
                          otherParticipant?.name.split(" ")[1] || ""
                        )}
                      </AvatarFallback>
                    </Avatar>
                    
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between">
                        <p className="font-medium text-sm truncate">
                          {otherParticipant?.name}
                        </p>
                        <div className="flex items-center gap-1">
                          {getMessageTypeIcon(conversation.messageType)}
                          {conversation.unreadCount > 0 && (
                            <Badge variant="destructive" className="h-5 w-5 p-0 text-xs">
                              {conversation.unreadCount}
                            </Badge>
                          )}
                        </div>
                      </div>
                      
                      <p className="text-xs text-muted-foreground mb-1">
                        {conversation.propertyName}
                      </p>
                      
                      <p className="text-sm text-muted-foreground truncate">
                        {conversation.lastMessage.content}
                      </p>
                      
                      <div className="flex items-center justify-between mt-1">
                        <span className="text-xs text-muted-foreground">
                          {formatRelativeTime(conversation.lastMessage.createdAt)}
                        </span>
                        <Badge variant="outline" className={`text-xs ${getPriorityColor(conversation.priority)}`}>
                          {conversation.priority}
                        </Badge>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </ScrollArea>
      </div>

      {/* Messages Area */}
      <div className="flex-1 flex flex-col">
        {selectedConversation ? (
          <>
            {/* Chat Header */}
            <div className="p-4 border-b bg-background">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Avatar className="h-8 w-8">
                    <AvatarImage src={selectedConversationData?.participants.find(p => p.userId !== userId)?.avatar} />
                    <AvatarFallback className="text-xs">
                      {formatInitials(
                        selectedConversationData?.participants.find(p => p.userId !== userId)?.name.split(" ")[0] || "",
                        selectedConversationData?.participants.find(p => p.userId !== userId)?.name.split(" ")[1] || ""
                      )}
                    </AvatarFallback>
                  </Avatar>
                  <div>
                    <p className="font-medium text-sm">
                      {selectedConversationData?.participants.find(p => p.userId !== userId)?.name}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {selectedConversationData?.propertyName}
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
                    <MoreVertical className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </div>

            {/* Messages */}
            <ScrollArea className="flex-1 p-4">
              <div className="space-y-4">
                {messages.map((message) => (
                  <div
                    key={message.id}
                    className={`flex ${message.senderId === userId ? "justify-end" : "justify-start"}`}
                  >
                    <div className={`max-w-[70%] ${message.senderId === userId ? "order-2" : "order-1"}`}>
                      <div
                        className={`p-3 rounded-lg ${
                          message.senderId === userId
                            ? "bg-primary text-primary-foreground"
                            : "bg-muted"
                        }`}
                      >
                        <p className="text-sm">{message.content}</p>
                        
                        <div className="flex items-center justify-between mt-2 gap-2">
                          <span className="text-xs opacity-70">
                            {formatRelativeTime(message.createdAt)}
                          </span>
                          {message.senderId === userId && getStatusIcon(message.status)}
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
                <div ref={messagesEndRef} />
              </div>
            </ScrollArea>

            {/* Message Input */}
            <div className="p-4 border-t bg-background">
              <div className="flex items-end gap-2">
                <Button variant="ghost" size="sm">
                  <Paperclip className="h-4 w-4" />
                </Button>
                
                <div className="flex-1">
                  <Textarea
                    placeholder="Type your message..."
                    value={newMessage}
                    onChange={(e) => setNewMessage(e.target.value)}
                    onKeyPress={handleKeyPress}
                    className="min-h-[40px] max-h-[120px] resize-none"
                    rows={1}
                  />
                </div>
                
                <Button
                  onClick={handleSendMessage}
                  disabled={!newMessage.trim() || loading}
                  size="sm"
                >
                  <Send className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center text-center">
            <div className="text-muted-foreground">
              <MessageSquare className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p className="text-lg font-medium">Select a conversation</p>
              <p className="text-sm">Choose a conversation from the sidebar to start messaging</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
