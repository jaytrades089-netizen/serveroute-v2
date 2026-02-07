import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import { format } from 'date-fns';
import Header from '../components/layout/Header';
import BottomNav from '../components/layout/BottomNav';
import { Loader2, Bell, ChevronLeft, Check, UserPlus, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';

export default function Notifications() {
  const queryClient = useQueryClient();

  const { data: user } = useQuery({
    queryKey: ['currentUser'],
    queryFn: () => base44.auth.me()
  });

  const { data: notifications = [], isLoading } = useQuery({
    queryKey: ['allNotifications', user?.id],
    queryFn: async () => {
      if (!user?.id) return [];
      return base44.entities.Notification.filter({ user_id: user.id }, '-created_date');
    },
    enabled: !!user?.id,
    refetchInterval: 15000
  });

  const markReadMutation = useMutation({
    mutationFn: async (id) => {
      return base44.entities.Notification.update(id, { 
        read: true, 
        read_at: new Date().toISOString() 
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['allNotifications'] });
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
    }
  });

  const markAllReadMutation = useMutation({
    mutationFn: async () => {
      const unread = notifications.filter(n => !n.read);
      await Promise.all(unread.map(n => 
        base44.entities.Notification.update(n.id, { 
          read: true, 
          read_at: new Date().toISOString() 
        })
      ));
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['allNotifications'] });
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
    }
  });

  const unreadCount = notifications.filter(n => !n.read).length;

  const [processingInvite, setProcessingInvite] = useState(null);

  const handleAcceptInvite = async (notification) => {
    setProcessingInvite(notification.id);
    try {
      // Get the boss who sent the invite
      const bossId = notification.related_id;
      const users = await base44.entities.User.list();
      const boss = users.find(u => u.id === bossId);
      
      if (!boss) {
        toast.error('Could not find the team to join');
        setProcessingInvite(null);
        return;
      }

      // Update current user's company_id and role to join the boss's team
      await base44.auth.updateMe({
        company_id: boss.company_id || 'default',
        role: 'server'
      });

      // Mark notification as read
      await base44.entities.Notification.update(notification.id, {
        read: true,
        read_at: new Date().toISOString()
      });

      // Send confirmation notification to boss
      await base44.entities.Notification.create({
        user_id: bossId,
        company_id: boss.company_id || 'default',
        type: 'system_alert',
        title: 'Team Member Joined',
        body: `${user.full_name} has accepted your invitation and joined your team.`,
        related_id: user.id,
        related_type: 'user',
        read: false
      });

      toast.success(`You've joined ${boss.full_name}'s team!`);
      queryClient.invalidateQueries({ queryKey: ['allNotifications'] });
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
      queryClient.invalidateQueries({ queryKey: ['currentUser'] });
    } catch (error) {
      toast.error(error.message || 'Failed to accept invitation');
    }
    setProcessingInvite(null);
  };

  const handleDeclineInvite = async (notification) => {
    setProcessingInvite(notification.id);
    try {
      // Mark notification as read
      await base44.entities.Notification.update(notification.id, {
        read: true,
        read_at: new Date().toISOString()
      });

      toast.success('Invitation declined');
      queryClient.invalidateQueries({ queryKey: ['allNotifications'] });
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
    } catch (error) {
      toast.error(error.message || 'Failed to decline invitation');
    }
    setProcessingInvite(null);
  };

  const isTeamInvite = (notification) => {
    return notification.title === 'Team Invitation' && 
           notification.related_type === 'user' && 
           !notification.read;
  };

  return (
    <div className="min-h-screen bg-gray-50 pb-20">
      <header className="bg-blue-500 text-white px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Link to={createPageUrl('WorkerHome')}>
            <ChevronLeft className="w-6 h-6" />
          </Link>
          <span className="font-bold text-lg">Notifications</span>
        </div>
        {unreadCount > 0 && (
          <Button 
            variant="ghost" 
            size="sm" 
            className="text-white hover:bg-blue-600"
            onClick={() => markAllReadMutation.mutate()}
          >
            <Check className="w-4 h-4 mr-1" /> Mark all read
          </Button>
        )}
      </header>
      
      <main className="px-4 py-6 max-w-lg mx-auto">
        {isLoading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
          </div>
        ) : notifications.length === 0 ? (
          <div className="bg-gray-100 rounded-xl p-8 text-center">
            <Bell className="w-10 h-10 text-gray-300 mx-auto mb-2" />
            <p className="text-gray-500">No notifications</p>
          </div>
        ) : (
          <div className="space-y-2">
            {notifications.map((notification) => (
              <div
                key={notification.id}
                className={`bg-white border rounded-xl p-4 transition-colors ${
                  notification.read 
                    ? 'border-gray-200' 
                    : 'border-blue-200 bg-blue-50'
                } ${!isTeamInvite(notification) ? 'cursor-pointer' : ''}`}
                onClick={() => !notification.read && !isTeamInvite(notification) && markReadMutation.mutate(notification.id)}
              >
                <div className="flex justify-between items-start">
                  <div className="flex-1">
                    <h3 className={`font-medium ${notification.read ? 'text-gray-700' : 'text-gray-900'}`}>
                      {notification.title}
                    </h3>
                    <p className="text-sm text-gray-500 mt-1">{notification.body}</p>
                  </div>
                  {!notification.read && !isTeamInvite(notification) && (
                    <div className="w-2 h-2 bg-blue-500 rounded-full mt-2"></div>
                  )}
                </div>
                
                {/* Team Invitation Accept/Decline Buttons */}
                {isTeamInvite(notification) && (
                  <div className="flex gap-2 mt-3">
                    <Button
                      size="sm"
                      variant="outline"
                      className="flex-1"
                      disabled={processingInvite === notification.id}
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDeclineInvite(notification);
                      }}
                    >
                      <X className="w-4 h-4 mr-1" /> Decline
                    </Button>
                    <Button
                      size="sm"
                      className="flex-1 bg-green-600 hover:bg-green-700"
                      disabled={processingInvite === notification.id}
                      onClick={(e) => {
                        e.stopPropagation();
                        handleAcceptInvite(notification);
                      }}
                    >
                      {processingInvite === notification.id ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <>
                          <UserPlus className="w-4 h-4 mr-1" /> Accept
                        </>
                      )}
                    </Button>
                  </div>
                )}
                
                <p className="text-xs text-gray-400 mt-2">
                  {format(new Date(notification.created_date), 'MMM d, h:mm a')}
                </p>
              </div>
            ))}
          </div>
        )}
      </main>

      <BottomNav currentPage="WorkerHome" />
    </div>
  );
}