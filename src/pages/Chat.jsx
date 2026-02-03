import React, { useState, useEffect, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { 
  ArrowLeft, 
  Send, 
  Image as ImageIcon, 
  Building2, 
  User, 
  Plus,
  Loader2,
  MessageCircle,
  X
} from 'lucide-react';
import { format, isToday, isYesterday } from 'date-fns';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import BossBottomNav from '@/components/boss/BossBottomNav';
import BottomNav from '@/components/layout/BottomNav';
import { ChatSkeleton } from '@/components/ui/skeletons';
import EmptyState from '@/components/ui/empty-state';

export default function Chat() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const messagesEndRef = useRef(null);
  const fileInputRef = useRef(null);
  
  const [selectedConversation, setSelectedConversation] = useState(null);
  const [newMessage, setNewMessage] = useState('');
  const [showNewChat, setShowNewChat] = useState(false);
  const [isSending, setIsSending] = useState(false);

  const { data: user } = useQuery({
    queryKey: ['currentUser'],
    queryFn: () => base44.auth.me()
  });

  const isBoss = user?.role === 'boss' || user?.role === 'admin';

  // Get all conversations for this company
  const { data: conversations = [], isLoading: conversationsLoading } = useQuery({
    queryKey: ['chatConversations', user?.company_id],
    queryFn: async () => {
      if (!user?.company_id) return [];
      const convos = await base44.entities.ChatConversation.filter({ company_id: user.company_id }, '-last_message_at');
      return convos;
    },
    enabled: !!user?.company_id,
    refetchInterval: 5000
  });

  // Get company users for starting new chats
  const { data: companyUsers = [] } = useQuery({
    queryKey: ['companyUsers', user?.company_id],
    queryFn: async () => {
      if (!user?.company_id) return [];
      const users = await base44.entities.User.filter({ company_id: user.company_id });
      return users.filter(u => u.id !== user.id);
    },
    enabled: !!user?.company_id
  });

  // Get messages for selected conversation
  const { data: messages = [], isLoading: messagesLoading } = useQuery({
    queryKey: ['chatMessages', selectedConversation?.id],
    queryFn: async () => {
      if (!selectedConversation?.id) return [];
      return base44.entities.ChatMessage.filter({ conversation_id: selectedConversation.id }, 'created_date');
    },
    enabled: !!selectedConversation?.id,
    refetchInterval: 3000
  });

  // Get unread counts
  const { data: participants = [] } = useQuery({
    queryKey: ['chatParticipants', user?.id],
    queryFn: async () => {
      if (!user?.id) return [];
      return base44.entities.ChatParticipant.filter({ user_id: user.id });
    },
    enabled: !!user?.id,
    refetchInterval: 5000
  });

  // Scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Ensure company chat exists
  useEffect(() => {
    async function ensureCompanyChat() {
      if (!user?.company_id) return;
      const existing = conversations.find(c => c.type === 'company');
      if (!existing && conversations.length === 0 && !conversationsLoading) {
        await base44.entities.ChatConversation.create({
          company_id: user.company_id,
          type: 'company',
          participant_ids: [],
          last_message_at: new Date().toISOString(),
          last_message_preview: 'Welcome to company chat!'
        });
        queryClient.invalidateQueries({ queryKey: ['chatConversations'] });
      }
    }
    ensureCompanyChat();
  }, [user, conversations, conversationsLoading, queryClient]);

  const getUnreadCount = (conversationId) => {
    const participant = participants.find(p => p.conversation_id === conversationId);
    return participant?.unread_count || 0;
  };

  const getConversationName = (conversation) => {
    if (conversation.type === 'company') return 'Company Chat';
    const otherUserId = conversation.participant_ids?.find(id => id !== user?.id);
    const otherUser = companyUsers.find(u => u.id === otherUserId);
    return otherUser?.full_name || 'Unknown';
  };

  const formatMessageTime = (date) => {
    const d = new Date(date);
    if (isToday(d)) return format(d, 'h:mm a');
    if (isYesterday(d)) return 'Yesterday';
    return format(d, 'MMM d');
  };

  const handleSendMessage = async () => {
    if (!newMessage.trim() || !selectedConversation || isSending) return;
    
    setIsSending(true);
    try {
      await base44.entities.ChatMessage.create({
        conversation_id: selectedConversation.id,
        company_id: user.company_id,
        sender_id: user.id,
        message_type: 'text',
        content: newMessage.trim(),
        read_by: [user.id]
      });

      await base44.entities.ChatConversation.update(selectedConversation.id, {
        last_message_at: new Date().toISOString(),
        last_message_preview: newMessage.trim().substring(0, 50)
      });

      setNewMessage('');
      queryClient.invalidateQueries({ queryKey: ['chatMessages', selectedConversation.id] });
      queryClient.invalidateQueries({ queryKey: ['chatConversations'] });
    } catch (error) {
      console.error('Error sending message:', error);
    } finally {
      setIsSending(false);
    }
  };

  const handleImageUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file || !selectedConversation) return;

    setIsSending(true);
    try {
      const { file_url } = await base44.integrations.Core.UploadFile({ file });
      
      await base44.entities.ChatMessage.create({
        conversation_id: selectedConversation.id,
        company_id: user.company_id,
        sender_id: user.id,
        message_type: 'image',
        content: '',
        image_url: file_url,
        read_by: [user.id]
      });

      await base44.entities.ChatConversation.update(selectedConversation.id, {
        last_message_at: new Date().toISOString(),
        last_message_preview: '📷 Image'
      });

      queryClient.invalidateQueries({ queryKey: ['chatMessages', selectedConversation.id] });
      queryClient.invalidateQueries({ queryKey: ['chatConversations'] });
    } catch (error) {
      console.error('Error uploading image:', error);
    } finally {
      setIsSending(false);
      e.target.value = '';
    }
  };

  const handleStartDirectChat = async (otherUser) => {
    // Check if conversation already exists
    const existing = conversations.find(c => 
      c.type === 'direct' && 
      c.participant_ids?.includes(user.id) && 
      c.participant_ids?.includes(otherUser.id)
    );

    if (existing) {
      setSelectedConversation(existing);
      setShowNewChat(false);
      return;
    }

    // Create new conversation
    const newConvo = await base44.entities.ChatConversation.create({
      company_id: user.company_id,
      type: 'direct',
      participant_ids: [user.id, otherUser.id],
      last_message_at: new Date().toISOString(),
      last_message_preview: ''
    });

    queryClient.invalidateQueries({ queryKey: ['chatConversations'] });
    setSelectedConversation(newConvo);
    setShowNewChat(false);
  };

  const getSenderName = (senderId) => {
    if (senderId === user?.id) return 'You';
    const sender = companyUsers.find(u => u.id === senderId);
    return sender?.full_name || 'Unknown';
  };

  const getInitials = (name) => {
    if (!name) return '?';
    return name.split(' ').map(n => n[0]).join('').toUpperCase().substring(0, 2);
  };

  // Conversation List View
  if (!selectedConversation) {
    return (
      <div className="min-h-screen bg-gray-50 pb-20">
        <header className="bg-white border-b px-4 py-3 flex items-center justify-between">
          <h1 className="text-lg font-semibold">Chat</h1>
          <Button variant="ghost" size="icon" onClick={() => setShowNewChat(true)}>
            <Plus className="w-5 h-5" />
          </Button>
        </header>

        <div className="p-4 max-w-lg mx-auto">
          {conversationsLoading ? (
            <div className="space-y-2">
              {[1, 2, 3].map(i => <ChatSkeleton key={i} />)}
            </div>
          ) : conversations.length === 0 ? (
            <EmptyState 
              type="messages"
              onAction={() => setShowNewChat(true)}
            />
          ) : (
            <div className="space-y-2">
              {conversations.map((convo) => {
                const unread = getUnreadCount(convo.id);
                const isCompany = convo.type === 'company';
                
                return (
                  <Card
                    key={convo.id}
                    className="cursor-pointer hover:bg-gray-50 transition-colors"
                    onClick={() => setSelectedConversation(convo)}
                  >
                    <CardContent className="p-4 flex items-center gap-3">
                      <div className={`w-12 h-12 rounded-full flex items-center justify-center ${
                        isCompany ? 'bg-blue-100' : 'bg-gray-100'
                      }`}>
                        {isCompany ? (
                          <Building2 className="w-6 h-6 text-blue-600" />
                        ) : (
                          <User className="w-6 h-6 text-gray-600" />
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between">
                          <p className="font-medium text-gray-900">{getConversationName(convo)}</p>
                          {unread > 0 && (
                            <span className="bg-orange-500 text-white text-xs px-2 py-0.5 rounded-full">
                              {unread}
                            </span>
                          )}
                        </div>
                        <p className="text-sm text-gray-500 truncate">
                          {convo.last_message_preview || 'No messages yet'}
                        </p>
                        <p className="text-xs text-gray-400">
                          {convo.last_message_at ? formatMessageTime(convo.last_message_at) : ''}
                        </p>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </div>

        {/* New Chat Dialog */}
        <Dialog open={showNewChat} onOpenChange={setShowNewChat}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>New Message</DialogTitle>
            </DialogHeader>
            <div className="py-4 space-y-2 max-h-80 overflow-y-auto">
              {companyUsers.map((u) => (
                <div
                  key={u.id}
                  className="flex items-center gap-3 p-3 rounded-lg hover:bg-gray-100 cursor-pointer"
                  onClick={() => handleStartDirectChat(u)}
                >
                  <Avatar>
                    <AvatarFallback>{getInitials(u.full_name)}</AvatarFallback>
                  </Avatar>
                  <div>
                    <p className="font-medium">{u.full_name}</p>
                    <p className="text-sm text-gray-500 capitalize">{u.role}</p>
                  </div>
                </div>
              ))}
            </div>
          </DialogContent>
        </Dialog>

        {isBoss ? <BossBottomNav currentPage="Chat" /> : <BottomNav currentPage="Chat" />}
      </div>
    );
  }

  // Conversation Detail View
  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <header className="bg-white border-b px-4 py-3 flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => setSelectedConversation(null)}>
          <ArrowLeft className="w-5 h-5" />
        </Button>
        <div className={`w-10 h-10 rounded-full flex items-center justify-center ${
          selectedConversation.type === 'company' ? 'bg-blue-100' : 'bg-gray-100'
        }`}>
          {selectedConversation.type === 'company' ? (
            <Building2 className="w-5 h-5 text-blue-600" />
          ) : (
            <User className="w-5 h-5 text-gray-600" />
          )}
        </div>
        <h1 className="font-semibold">{getConversationName(selectedConversation)}</h1>
      </header>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messagesLoading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="w-6 h-6 animate-spin text-blue-500" />
          </div>
        ) : messages.length === 0 ? (
          <div className="text-center py-12 text-gray-500">
            No messages yet. Start the conversation!
          </div>
        ) : (
          messages.map((msg) => {
            const isMe = msg.sender_id === user?.id;
            
            return (
              <div
                key={msg.id}
                className={`flex ${isMe ? 'justify-end' : 'justify-start'}`}
              >
                <div className={`max-w-[80%] ${isMe ? 'order-2' : 'order-1'}`}>
                  {!isMe && selectedConversation.type === 'company' && (
                    <p className="text-xs text-gray-500 mb-1 ml-1">{getSenderName(msg.sender_id)}</p>
                  )}
                  <div className={`rounded-2xl px-4 py-2 ${
                    isMe 
                      ? 'bg-blue-500 text-white rounded-br-sm' 
                      : 'bg-white border border-gray-200 rounded-bl-sm'
                  }`}>
                    {msg.image_url && (
                      <img 
                        src={msg.image_url} 
                        alt="Shared image" 
                        className="rounded-lg max-w-full mb-2"
                      />
                    )}
                    {msg.content && (
                      <p className="text-sm">{msg.content}</p>
                    )}
                  </div>
                  <p className={`text-xs text-gray-400 mt-1 ${isMe ? 'text-right' : 'text-left'}`}>
                    {formatMessageTime(msg.created_date)}
                  </p>
                </div>
              </div>
            );
          })
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="bg-white border-t p-4">
        <div className="flex items-center gap-2">
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={handleImageUpload}
          />
          <Button
            variant="ghost"
            size="icon"
            onClick={() => fileInputRef.current?.click()}
            disabled={isSending}
          >
            <ImageIcon className="w-5 h-5 text-gray-500" />
          </Button>
          <Input
            value={newMessage}
            onChange={(e) => setNewMessage(e.target.value)}
            placeholder="Type a message..."
            className="flex-1"
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleSendMessage();
              }
            }}
          />
          <Button
            onClick={handleSendMessage}
            disabled={!newMessage.trim() || isSending}
            className="bg-blue-500 hover:bg-blue-600"
          >
            {isSending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
          </Button>
        </div>
      </div>
    </div>
  );
}