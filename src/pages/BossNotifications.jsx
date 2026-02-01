import React from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import { formatDistanceToNow, format } from 'date-fns';
import { 
  Loader2, 
  ChevronLeft, 
  Bell,
  Check,
  CheckCheck,
  X,
  MapPin,
  AlertTriangle,
  User,
  Calendar,
  MessageSquare,
  FileText
} from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import BossBottomNav from '../components/boss/BossBottomNav';
import { toast } from 'sonner';

const typeConfig = {
  route_completed: { icon: CheckCheck, color: 'text-green-600', bg: 'bg-green-100' },
  address_flagged: { icon: AlertTriangle, color: 'text-red-600', bg: 'bg-red-100' },
  worker_offline: { icon: User, color: 'text-gray-600', bg: 'bg-gray-100' },
  vacation_request: { icon: Calendar, color: 'text-blue-600', bg: 'bg-blue-100' },
  route_needs_reassignment: { icon: MapPin, color: 'text-amber-600', bg: 'bg-amber-100' },
  daily_digest: { icon: FileText, color: 'text-purple-600', bg: 'bg-purple-100' },
  message_received: { icon: MessageSquare, color: 'text-blue-600', bg: 'bg-blue-100' },
  default: { icon: Bell, color: 'text-gray-600', bg: 'bg-gray-100' }
};

const priorityColors = {
  urgent: 'border-l-red-500',
  normal: 'border-l-blue-500',
  low: 'border-l-gray-300'
};

export default function BossNotifications() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const { data: user } = useQuery({
    queryKey: ['currentUser'],
    queryFn: () => base44.auth.me()
  });

  const { data: notifications = [], isLoading } = useQuery({
    queryKey: ['allBossNotifications', user?.id],
    queryFn: async () => {
      if (!user?.id) return [];
      return base44.entities.Notification.filter({ 
        user_id: user.id 
      }, '-created_date', 50);
    },
    enabled: !!user?.id
  });

  const markReadMutation = useMutation({
    mutationFn: async (id) => {
      await base44.entities.Notification.update(id, { 
        read: true, 
        read_at: new Date().toISOString() 
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['allBossNotifications'] });
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
      queryClient.invalidateQueries({ queryKey: ['allBossNotifications'] });
      queryClient.invalidateQueries({ queryKey: ['bossNotifications'] });
    }
  });

  const markAllReadMutation = useMutation({
    mutationFn: async () => {
      const unread = notifications.filter(n => !n.read && !n.dismissed_at);
      await Promise.all(unread.map(n => 
        base44.entities.Notification.update(n.id, { 
          read: true, 
          read_at: new Date().toISOString() 
        })
      ));
    },
    onSuccess: () => {
      toast.success('All notifications marked as read');
      queryClient.invalidateQueries({ queryKey: ['allBossNotifications'] });
      queryClient.invalidateQueries({ queryKey: ['bossNotifications'] });
    }
  });

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
      </div>
    );
  }

  const activeNotifications = notifications.filter(n => !n.dismissed_at);
  const unreadCount = activeNotifications.filter(n => !n.read).length;

  const handleNotificationClick = (notification) => {
    if (!notification.read) {
      markReadMutation.mutate(notification.id);
    }
    if (notification.action_url) {
      navigate(createPageUrl(notification.action_url.replace('/', '')));
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 pb-20">
      {/* Header */}
      <header className="bg-blue-500 text-white px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Link to={createPageUrl('BossDashboard')}>
            <ChevronLeft className="w-6 h-6" />
          </Link>
          <span className="font-bold text-lg">Notifications</span>
          {unreadCount > 0 && (
            <Badge className="bg-white/20 text-white">{unreadCount} new</Badge>
          )}
        </div>
        {unreadCount > 0 && (
          <Button 
            variant="ghost" 
            size="sm" 
            className="text-white hover:bg-blue-600"
            onClick={() => markAllReadMutation.mutate()}
          >
            <Check className="w-4 h-4 mr-1" />
            Mark all read
          </Button>
        )}
      </header>

      <main className="px-4 py-6 max-w-2xl mx-auto">
        {activeNotifications.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center">
              <Bell className="w-12 h-12 text-gray-300 mx-auto mb-3" />
              <p className="text-gray-500">No notifications</p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-2">
            {activeNotifications.map((notification) => {
              const config = typeConfig[notification.type] || typeConfig.default;
              const Icon = config.icon;
              const priorityColor = priorityColors[notification.priority] || priorityColors.normal;

              return (
                <Card 
                  key={notification.id}
                  className={`border-l-4 ${priorityColor} ${!notification.read ? 'bg-blue-50' : 'bg-white'} cursor-pointer hover:shadow-md transition-shadow`}
                  onClick={() => handleNotificationClick(notification)}
                >
                  <CardContent className="p-4">
                    <div className="flex items-start gap-3">
                      <div className={`p-2 rounded-lg ${config.bg}`}>
                        <Icon className={`w-5 h-5 ${config.color}`} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <h3 className={`font-medium ${notification.read ? 'text-gray-600' : 'text-gray-900'}`}>
                              {notification.title}
                            </h3>
                            <p className="text-sm text-gray-500 mt-0.5">
                              {notification.body}
                            </p>
                          </div>
                          <Button 
                            variant="ghost" 
                            size="icon" 
                            className="h-8 w-8 shrink-0"
                            onClick={(e) => {
                              e.stopPropagation();
                              dismissMutation.mutate(notification.id);
                            }}
                          >
                            <X className="w-4 h-4 text-gray-400" />
                          </Button>
                        </div>
                        <div className="flex items-center gap-2 mt-2">
                          <span className="text-xs text-gray-400">
                            {notification.created_date && formatDistanceToNow(new Date(notification.created_date), { addSuffix: true })}
                          </span>
                          {!notification.read && (
                            <Badge variant="secondary" className="text-xs">New</Badge>
                          )}
                          {notification.priority === 'urgent' && (
                            <Badge variant="destructive" className="text-xs">Urgent</Badge>
                          )}
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </main>

      <BossBottomNav currentPage="BossDashboard" />
    </div>
  );
}