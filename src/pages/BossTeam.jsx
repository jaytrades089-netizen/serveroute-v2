import React from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import { Loader2, FileText, Bell, User, Mail, MapPin } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import BossBottomNav from '../components/boss/BossBottomNav';

export default function BossTeam() {
  const { data: user } = useQuery({
    queryKey: ['currentUser'],
    queryFn: () => base44.auth.me()
  });

  const { data: servers = [], isLoading } = useQuery({
    queryKey: ['companyServers', user?.company_id],
    queryFn: async () => {
      if (!user?.company_id) return [];
      const users = await base44.entities.User.list();
      return users.filter(u => u.company_id === user.company_id && u.role === 'server');
    },
    enabled: !!user?.company_id
  });

  const { data: routes = [] } = useQuery({
    queryKey: ['allRoutes', user?.company_id],
    queryFn: async () => {
      if (!user?.company_id) return [];
      return base44.entities.Route.filter({
        company_id: user.company_id,
        deleted_at: null
      });
    },
    enabled: !!user?.company_id
  });

  const { data: notifications = [] } = useQuery({
    queryKey: ['bossNotifications', user?.id],
    queryFn: async () => {
      if (!user?.id) return [];
      return base44.entities.Notification.filter({
        user_id: user.id,
        read: false
      });
    },
    enabled: !!user?.id
  });

  const getServerStats = (serverId) => {
    const serverRoutes = routes.filter(r => r.worker_id === serverId);
    const activeRoutes = serverRoutes.filter(r => ['assigned', 'active'].includes(r.status));
    const completedRoutes = serverRoutes.filter(r => r.status === 'completed');
    
    const assignedMinutes = activeRoutes.reduce((sum, r) => sum + (r.estimated_time_minutes || 0), 0);
    const assignedHours = Math.round(assignedMinutes / 60);
    const targetHours = 40;
    const percentage = Math.min(Math.round((assignedHours / targetHours) * 100), 100);
    
    const totalAddresses = activeRoutes.reduce((sum, r) => sum + (r.total_addresses || 0), 0);
    const servedAddresses = activeRoutes.reduce((sum, r) => sum + (r.served_count || 0), 0);
    
    return {
      activeRoutes: activeRoutes.length,
      completedRoutes: completedRoutes.length,
      assignedHours,
      targetHours,
      percentage,
      totalAddresses,
      servedAddresses
    };
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 pb-20">
      {/* Header */}
      <header className="bg-blue-500 text-white px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <FileText className="w-6 h-6" />
          <span className="font-bold text-lg">Team</span>
        </div>
        <div className="flex items-center gap-3">
          <Link to={createPageUrl('Notifications')} className="relative">
            <Bell className="w-6 h-6" />
            {notifications.length > 0 && (
              <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center">
                {notifications.length > 9 ? '9+' : notifications.length}
              </span>
            )}
          </Link>
        </div>
      </header>

      <main className="px-4 py-4 max-w-4xl mx-auto">
        <h2 className="font-semibold text-lg mb-4">Servers ({servers.length})</h2>
        
        {servers.length === 0 ? (
          <Card>
            <CardContent className="p-8 text-center">
              <User className="w-12 h-12 mx-auto text-gray-300 mb-4" />
              <p className="text-gray-500">No servers in your team</p>
              <p className="text-sm text-gray-400 mt-1">Invite servers to get started</p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {servers.map((server) => {
              const stats = getServerStats(server.id);
              
              return (
                <Card key={server.id}>
                  <CardContent className="p-4">
                    <div className="flex items-start gap-4">
                      <div className="w-12 h-12 bg-blue-100 rounded-full flex items-center justify-center">
                        <span className="text-blue-600 font-bold">
                          {server.full_name?.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2) || 'U'}
                        </span>
                      </div>
                      
                      <div className="flex-1">
                        <h3 className="font-semibold">{server.full_name}</h3>
                        <p className="text-sm text-gray-500 flex items-center gap-1">
                          <Mail className="w-3 h-3" />
                          {server.email}
                        </p>
                        
                        <div className="mt-3 space-y-2">
                          <div className="flex items-center justify-between text-sm">
                            <span className="text-gray-600">Weekly Capacity</span>
                            <span className="font-medium">
                              {stats.assignedHours}h / {stats.targetHours}h
                              {stats.percentage >= 100 && (
                                <Badge className="ml-2 bg-red-100 text-red-700">FULL</Badge>
                              )}
                            </span>
                          </div>
                          <Progress value={stats.percentage} className="h-2" />
                          
                          <div className="flex flex-wrap gap-4 text-sm text-gray-600 mt-2">
                            <div className="flex items-center gap-1">
                              <MapPin className="w-4 h-4" />
                              <span>{stats.activeRoutes} active routes</span>
                            </div>
                            <div>
                              {stats.servedAddresses}/{stats.totalAddresses} addresses served
                            </div>
                          </div>
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

      <BossBottomNav currentPage="BossTeam" />
    </div>
  );
}