import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Bell, Check, X, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { formatDistanceToNow } from 'date-fns';
import { Link } from 'react-router-dom';
import { createPageUrl } from '@/utils';

const priorityColors = {
  urgent: 'border-l-red-500 bg-red-50',
  normal: 'border-l-blue-500 bg-white',
  low: 'border-l-gray-300 bg-white'
};

export default function NotificationBell({ userId }) {
  const [open, setOpen] = useState(false);
  const queryClient = useQueryClient();

  const { data: notifications = [] } = useQuery({
    queryKey: ['bossNotifications', userId],
    queryFn: async () => {
      if (!userId) return [];
      const all = await base44.entities.Notification.filter({ 
        user_id: userId 
      }, '-created_date', 20);
      return all.filter(n => !n.dismissed_at);
    },
    enabled: !!userId,
    refetchInterval: 30000
  });

  const unreadCount = notifications.filter(n => !n.read).length;

  const markReadMutation = useMutation({
    mutationFn: async (id) => {
      await base44.entities.Notification.update(id, { 
        read: true, 
        read_at: new Date().toISOString() 
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['bossNotifications'] });
    }
  });

  const dismissMutation = useMutation({
    mutationFn: async (id) => {
      await base44.entities.Notification.update(id, { 
        dismissed_at: new Date().toISOString() 
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['bossNotifications'] });
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
      queryClient.invalidateQueries({ queryKey: ['bossNotifications'] });
    }
  });

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="relative">
          <Bell className="w-5 h-5" />
          {unreadCount > 0 && (
            <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center font-medium">
              {unreadCount > 9 ? '9+' : unreadCount}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80 p-0" align="end">
        <div className="flex items-center justify-between p-3 border-b">
          <h3 className="font-semibold">Notifications</h3>
          {unreadCount > 0 && (
            <Button 
              variant="ghost" 
              size="sm" 
              className="text-xs h-7"
              onClick={() => markAllReadMutation.mutate()}
            >
              <Check className="w-3 h-3 mr-1" />
              Mark all read
            </Button>
          )}
        </div>
        
        <div className="max-h-80 overflow-y-auto">
          {notifications.length === 0 ? (
            <div className="p-6 text-center text-gray-400">
              <Bell className="w-8 h-8 mx-auto mb-2 opacity-50" />
              <p className="text-sm">No notifications</p>
            </div>
          ) : (
            notifications.slice(0, 10).map((notification) => (
              <div 
                key={notification.id}
                className={`border-l-4 p-3 border-b last:border-b-0 ${priorityColors[notification.priority || 'normal']} ${!notification.read ? 'bg-blue-50' : ''}`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div 
                    className="flex-1 cursor-pointer"
                    onClick={() => !notification.read && markReadMutation.mutate(notification.id)}
                  >
                    <p className={`text-sm font-medium ${notification.read ? 'text-gray-600' : 'text-gray-900'}`}>
                      {notification.title}
                    </p>
                    <p className="text-xs text-gray-500 mt-0.5 line-clamp-2">
                      {notification.body}
                    </p>
                    <p className="text-xs text-gray-400 mt-1">
                      {notification.created_date && formatDistanceToNow(new Date(notification.created_date), { addSuffix: true })}
                    </p>
                  </div>
                  <Button 
                    variant="ghost" 
                    size="icon" 
                    className="h-6 w-6 shrink-0"
                    onClick={() => dismissMutation.mutate(notification.id)}
                  >
                    <X className="w-3 h-3" />
                  </Button>
                </div>
              </div>
            ))
          )}
        </div>
        
        <div className="p-2 border-t">
          <Link to={createPageUrl('BossNotifications')}>
            <Button variant="ghost" size="sm" className="w-full justify-between">
              View all notifications
              <ChevronRight className="w-4 h-4" />
            </Button>
          </Link>
        </div>
      </PopoverContent>
    </Popover>
  );
}