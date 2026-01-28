import React from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import { format } from 'date-fns';
import Header from '../components/layout/Header';
import BottomNav from '../components/layout/BottomNav';
import { Loader2, Bell, ChevronLeft, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';

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
    enabled: !!user?.id
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
                className={`bg-white border rounded-xl p-4 cursor-pointer transition-colors ${
                  notification.read 
                    ? 'border-gray-200' 
                    : 'border-blue-200 bg-blue-50'
                }`}
                onClick={() => !notification.read && markReadMutation.mutate(notification.id)}
              >
                <div className="flex justify-between items-start">
                  <div className="flex-1">
                    <h3 className={`font-medium ${notification.read ? 'text-gray-700' : 'text-gray-900'}`}>
                      {notification.title}
                    </h3>
                    <p className="text-sm text-gray-500 mt-1">{notification.body}</p>
                  </div>
                  {!notification.read && (
                    <div className="w-2 h-2 bg-blue-500 rounded-full mt-2"></div>
                  )}
                </div>
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