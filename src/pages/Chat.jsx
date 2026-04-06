import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { 
  ArrowLeft, 
  Send, 
  Image as ImageIcon, 
  User, 
  Plus,
  Loader2,
  Trash2,
  MessageCircle
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
import { toast } from 'sonner';

export default function Chat() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const messagesEndRef = useRef(null);
  const fileInputRef = useRef(null);
  
  const [selectedConversation, setSelectedConversation] = useState(null);
  const [newMessage, setNewMessage] = useState('');
  const [showNewChat, setShowNewChat] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [deletingId, setDeletingId] = useState(null);

  const { data: user } = useQuery({
    queryKey: ['currentUser'],
    queryFn: () => base44.auth.me()
  });

  const isBoss = user?.role === 'boss' || user?.role === 'admin';

  const isUserActive = (u) => {
    if (!u) return false;
    if (u.worker_status === 'active') return true;
    if (!u.last_active_at) return false;
    return (Date.now() - new Date(u.last_active_at).getTime()) < 30 * 60 * 1000;
  };

  const { data: allConversations = [], isLoading: conversationsLoading } = useQuery({
    queryKey: ['chatConversations', user?.company_id],
    queryFn: async () => {
      if (!user?.company_id) return [];
      return base44.entities.ChatConversation.filter({ company_id: user.company_id }, '-last_message_at');
    },
    enabled: !!user?.company_id,
    refetchInterval: isUserActive(user) ? 15000 : false
  });

  // Filter out company chats — only show direct chats
  const conversations = allConversations.filter(c => c.type !== 'company');

  // Delete any company chats that exist
  useEffect(() => {
    const companyChats = allConversations.filter(c => c.type === 'company');
    companyChats.forEach(c => {
      base44.entities.ChatConversation.delete(c.id).catch(() => {});
    });
    if (companyChats.length > 0) {
      queryClient.invalidateQueries({ queryKey: ['chatConversations'] });
    }
  }, [allConversations]);

  const { data: companyUsers = [] } = useQuery({
    queryKey: ['companyUsers', user?.company_id],
    queryFn: async () => {
      if (!user?.company_id) return [];
      const users = await base44.entities.User.filter({ company_id: user.company_id });
      return users.filter(u => u.id !== user.id);
    },
    enabled: !!user?.company_id
  });

  const { data: messages = [], isLoading: messagesLoading } = useQuery({
    queryKey: ['chatMessages', selectedConversation?.id],
    queryFn: async () => {
      if (!selectedConversation?.id) return [];
      return base44.entities.ChatMessage.filter({ conversation_id: selectedConversation.id }, 'created_date');
    },
    enabled: !!selectedConversation?.id,
    refetchInterval: isUserActive(user) ? 10000 : false
  });

  const { data: participants = [] } = useQuery({
    queryKey: ['chatParticipants', user?.id],
    queryFn: async () => {
      if (!user?.id) return [];
      return base44.entities.ChatParticipant.filter({ user_id: user.id });
    },
    enabled: !!user?.id,
    refetchInterval: isUserActive(user) ? 10000 : false
  });

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const getUnreadCount = (conversationId) => {
    const participant = participants.find(p => p.conversation_id === conversationId);
    return participant?.unread_count || 0;
  };

  const getConversationName = (conversation) => {
    const otherUserId = conversation.participant_ids?.find(id => id !== user?.id);
    const otherUser = companyUsers.find(u => u.id === otherUserId);
    return otherUser?.full_name || 'Unknown';
  };

  const getConversationUser = (conversation) => {
    const otherUserId = conversation.participant_ids?.find(id => id !== user?.id);
    return companyUsers.find(u => u.id === otherUserId);
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
      toast.error('Failed to send message');
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
      toast.error('Failed to upload image');
    } finally {
      setIsSending(false);
      e.target.value = '';
    }
  };

  const handleStartDirectChat = async (otherUser) => {
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

  const handleDeleteConversation = async (e, convoId) => {
    e.stopPropagation();
    setDeletingId(convoId);
    try {
      // Delete all messages in the conversation
      const msgs = await base44.entities.ChatMessage.filter({ conversation_id: convoId });
      for (const msg of msgs) {
        await base44.entities.ChatMessage.delete(msg.id);
      }
      await base44.entities.ChatConversation.delete(convoId);
      queryClient.invalidateQueries({ queryKey: ['chatConversations'] });
      toast.success('Conversation deleted');
    } catch (error) {
      toast.error('Failed to delete conversation');
    } finally {
      setDeletingId(null);
    }
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
      <div style={{ minHeight: '100vh', background: 'transparent', paddingBottom: 80 }}>
        <header style={{ background: 'rgba(11,15,30,0.75)', backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)', borderBottom: '1px solid rgba(255,255,255,0.08)', padding: '12px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', position: 'sticky', top: 0, zIndex: 50 }}>
          <h1 className="text-lg font-semibold" style={{ color: '#e6e1e4' }}>Chat</h1>
          <button
            onClick={() => setShowNewChat(true)}
            className="w-9 h-9 rounded-lg flex items-center justify-center hover:bg-white/10 transition-colors"
            style={{ border: '1px solid rgba(255,255,255,0.12)' }}
          >
            <Plus className="w-5 h-5" style={{ color: '#e9c349' }} />
          </button>
        </header>

        <div className="p-4 max-w-lg mx-auto">
          {conversationsLoading ? (
            <div className="space-y-2">
              {[1, 2, 3].map(i => <ChatSkeleton key={i} />)}
            </div>
          ) : conversations.length === 0 ? (
            <div className="text-center py-16">
              <MessageCircle className="w-12 h-12 mx-auto mb-3" style={{ color: '#363436' }} />
              <p className="font-semibold" style={{ color: '#8a7f87' }}>No conversations yet</p>
              <p className="text-sm mt-1" style={{ color: '#4B5563' }}>Tap + to start a chat with a teammate</p>
            </div>
          ) : (
            <div className="space-y-2">
              {conversations.map((convo) => {
                const unread = getUnreadCount(convo.id);
                const convoUser = getConversationUser(convo);
                const isDeleting = deletingId === convo.id;

                return (
                  <div
                    key={convo.id}
                    className="rounded-2xl p-4 flex items-center gap-3 cursor-pointer transition-opacity hover:opacity-90 relative"
                    style={{ background: 'rgba(14,20,44,0.55)', backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)', border: '1px solid rgba(255,255,255,0.12)' }}
                    onClick={() => setSelectedConversation(convo)}
                  >
                    <div className="w-11 h-11 rounded-full flex items-center justify-center flex-shrink-0" style={{ background: 'rgba(229,179,225,0.15)' }}>
                      <User className="w-5 h-5" style={{ color: '#e5b9e1' }} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between">
                        <p className="font-semibold" style={{ color: '#e6e1e4' }}>{getConversationName(convo)}</p>
                        <div className="flex items-center gap-2">
                          {unread > 0 && (
                            <span className="text-xs px-2 py-0.5 rounded-full font-bold" style={{ background: '#e9c349', color: '#0F0B10' }}>
                              {unread}
                            </span>
                          )}
                          {convo.last_message_at && (
                            <span className="text-xs" style={{ color: '#4B5563' }}>{formatMessageTime(convo.last_message_at)}</span>
                          )}
                        </div>
                      </div>
                      <p className="text-sm truncate" style={{ color: '#8a7f87' }}>
                        {convo.last_message_preview || 'No messages yet'}
                      </p>
                      {convoUser && (
                        <p className="text-xs capitalize" style={{ color: '#4B5563' }}>{convoUser.role}</p>
                      )}
                    </div>
                    <button
                      onClick={(e) => handleDeleteConversation(e, convo.id)}
                      disabled={isDeleting}
                      className="p-2 rounded-lg hover:bg-red-500/20 transition-colors flex-shrink-0"
                    >
                      {isDeleting ? <Loader2 className="w-4 h-4 animate-spin" style={{ color: '#ef4444' }} /> : <Trash2 className="w-4 h-4" style={{ color: '#4B5563' }} />}
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* New Chat Dialog */}
        <Dialog open={showNewChat} onOpenChange={setShowNewChat}>
          <DialogContent style={{ background: 'rgba(11,15,30,0.97)', border: '1px solid rgba(255,255,255,0.12)', color: '#e6e1e4' }}>
            <DialogHeader>
              <DialogTitle style={{ color: '#e6e1e4' }}>New Message</DialogTitle>
            </DialogHeader>
            <div className="py-4 space-y-2 max-h-80 overflow-y-auto">
              {companyUsers.length === 0 ? (
                <p className="text-center py-4" style={{ color: '#8a7f87' }}>No teammates found</p>
              ) : companyUsers.map((u) => (
                <div
                  key={u.id}
                  className="flex items-center gap-3 p-3 rounded-xl cursor-pointer transition-opacity hover:opacity-80"
                  style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)' }}
                  onClick={() => handleStartDirectChat(u)}
                >
                  <Avatar>
                    <AvatarFallback style={{ background: 'rgba(229,179,225,0.20)', color: '#e5b9e1' }}>{getInitials(u.full_name)}</AvatarFallback>
                  </Avatar>
                  <div>
                    <p className="font-medium" style={{ color: '#e6e1e4' }}>{u.full_name}</p>
                    <p className="text-sm capitalize" style={{ color: '#8a7f87' }}>{u.role}</p>
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
    <div style={{ minHeight: '100vh', background: 'transparent', display: 'flex', flexDirection: 'column' }}>
      <header style={{ background: 'rgba(11,15,30,0.75)', backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)', borderBottom: '1px solid rgba(255,255,255,0.08)', padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 12, position: 'sticky', top: 0, zIndex: 50 }}>
        <button
          onClick={() => setSelectedConversation(null)}
          className="w-10 h-10 rounded-lg flex items-center justify-center hover:bg-white/10 transition-colors"
          style={{ border: '1px solid rgba(255,255,255,0.12)' }}
        >
          <ArrowLeft className="w-5 h-5" style={{ color: '#e6e1e4' }} />
        </button>
        <div className="w-10 h-10 rounded-full flex items-center justify-center" style={{ background: 'rgba(229,179,225,0.15)' }}>
          <User className="w-5 h-5" style={{ color: '#e5b9e1' }} />
        </div>
        <h1 className="font-semibold" style={{ color: '#e6e1e4' }}>{getConversationName(selectedConversation)}</h1>
      </header>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messagesLoading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="w-6 h-6 animate-spin" style={{ color: '#e9c349' }} />
          </div>
        ) : messages.length === 0 ? (
          <div className="text-center py-12">
            <p style={{ color: '#8a7f87' }}>No messages yet. Start the conversation!</p>
          </div>
        ) : (
          messages.map((msg) => {
            const isMe = msg.sender_id === user?.id;
            return (
              <div key={msg.id} className={`flex ${isMe ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[80%] ${isMe ? 'order-2' : 'order-1'}`}>
                  <div className={`rounded-2xl px-4 py-2 ${isMe ? 'rounded-br-sm' : 'rounded-bl-sm'}`}
                    style={isMe
                      ? { background: 'rgba(233,195,73,0.25)', border: '1px solid rgba(233,195,73,0.40)' }
                      : { background: 'rgba(14,20,44,0.70)', backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)', border: '1px solid rgba(255,255,255,0.12)' }
                    }
                  >
                    {msg.image_url && (
                      <img src={msg.image_url} alt="Shared image" className="rounded-lg max-w-full mb-2" />
                    )}
                    {msg.content && (
                      <p className="text-sm" style={{ color: isMe ? '#e9c349' : '#e6e1e4' }}>{msg.content}</p>
                    )}
                  </div>
                  <p className={`text-xs mt-1 ${isMe ? 'text-right' : 'text-left'}`} style={{ color: '#4B5563' }}>
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
      <div style={{ background: 'rgba(11,15,30,0.75)', backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)', borderTop: '1px solid rgba(255,255,255,0.08)', padding: 16 }}>
        <div className="flex items-center gap-2">
          <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleImageUpload} />
          <Button variant="ghost" size="icon" onClick={() => fileInputRef.current?.click()} disabled={isSending} style={{ color: '#8a7f87' }}>
            <ImageIcon className="w-5 h-5" />
          </Button>
          <Input
            value={newMessage}
            onChange={(e) => setNewMessage(e.target.value)}
            placeholder="Type a message..."
            style={{ background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.12)', color: '#e6e1e4' }}
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
            style={{ background: 'rgba(233,195,73,0.20)', border: '1px solid rgba(233,195,73,0.50)', color: '#e9c349' }}
          >
            {isSending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
          </Button>
        </div>
      </div>
    </div>
  );
}