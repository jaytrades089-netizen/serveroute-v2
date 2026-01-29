import React from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import { format } from 'date-fns';
import { 
  Loader2, 
  FileText, 
  Bell, 
  Upload, 
  Plus, 
  ClipboardList,
  Package,
  FileEdit,
  CheckCircle,
  Rocket
} from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import BossBottomNav from '../components/boss/BossBottomNav';

export default function BossDashboard() {
  const { data: user, isLoading: userLoading } = useQuery({
    queryKey: ['currentUser'],
    queryFn: () => base44.auth.me()
  });

  const { data: addresses = [] } = useQuery({
    queryKey: ['poolAddresses', user?.company_id],
    queryFn: async () => {
      if (!user?.company_id) return [];
      return base44.entities.Address.filter({
        company_id: user.company_id,
        route_id: null,
        deleted_at: null
      });
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

  const { data: servers = [] } = useQuery({
    queryKey: ['companyServers', user?.company_id],
    queryFn: async () => {
      if (!user?.company_id) return [];
      const users = await base44.entities.User.list();
      return users.filter(u => u.company_id === user.company_id && u.role === 'server');
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

  const { data: auditLogs = [] } = useQuery({
    queryKey: ['recentActivity', user?.company_id],
    queryFn: async () => {
      if (!user?.company_id) return [];
      const logs = await base44.entities.AuditLog.filter({
        company_id: user.company_id
      });
      return logs.slice(0, 5);
    },
    enabled: !!user?.company_id
  });

  if (userLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
      </div>
    );
  }

  const draftRoutes = routes.filter(r => r.status === 'draft');
  const readyRoutes = routes.filter(r => r.status === 'ready');
  const assignedRoutes = routes.filter(r => ['assigned', 'active', 'stalled'].includes(r.status));

  const firstName = user?.full_name?.split(' ')[0] || 'Boss';
  const todayDate = format(new Date(), 'EEEE, MMMM d, yyyy');

  const stats = [
    { id: 'pool', label: 'Address Pool', value: addresses.length, icon: Package, color: 'bg-blue-100 text-blue-600' },
    { id: 'draft', label: 'Draft Routes', value: draftRoutes.length, icon: FileEdit, color: 'bg-orange-100 text-orange-600' },
    { id: 'ready', label: 'Ready', value: readyRoutes.length, icon: CheckCircle, color: 'bg-green-100 text-green-600' },
    { id: 'assigned', label: 'Assigned', value: assignedRoutes.length, icon: Rocket, color: 'bg-purple-100 text-purple-600' }
  ];

  // Calculate server capacities
  const serverCapacities = servers.map(server => {
    const serverRoutes = routes.filter(r => 
      r.worker_id === server.id && 
      ['assigned', 'active'].includes(r.status)
    );
    const assignedMinutes = serverRoutes.reduce((sum, r) => sum + (r.estimated_time_minutes || 0), 0);
    const assignedHours = Math.round(assignedMinutes / 60);
    const targetHours = 40; // Default target
    const percentage = Math.min(Math.round((assignedHours / targetHours) * 100), 100);
    
    return {
      ...server,
      assignedHours,
      targetHours,
      percentage
    };
  });

  const getActivityText = (log) => {
    const actions = {
      'route_created': 'Route created',
      'assignment_created': 'Route assigned',
      'addresses_imported': 'Addresses imported',
      'route_completed': 'Route completed',
      'route_started': 'Route started'
    };
    return actions[log.action_type] || log.action_type;
  };

  return (
    <div className="min-h-screen bg-gray-50 pb-20">
      {/* Header */}
      <header className="bg-blue-500 text-white px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <FileText className="w-6 h-6" />
          <span className="font-bold text-lg">ServeRoute</span>
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
          <div className="w-9 h-9 bg-white text-blue-600 rounded-full flex items-center justify-center font-bold text-sm">
            {user?.full_name?.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2) || 'B'}
          </div>
        </div>
      </header>

      <main className="px-4 py-6 max-w-4xl mx-auto">
        {/* Welcome */}
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-gray-900">Welcome back, {firstName}</h1>
          <p className="text-gray-500">{todayDate}</p>
        </div>

        {/* Quick Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
          {stats.map(stat => {
            const Icon = stat.icon;
            return (
              <Card key={stat.id} className="cursor-pointer hover:shadow-md transition-shadow">
                <CardContent className="p-4">
                  <div className={`w-10 h-10 rounded-lg ${stat.color} flex items-center justify-center mb-2`}>
                    <Icon className="w-5 h-5" />
                  </div>
                  <p className="text-2xl font-bold">{stat.value}</p>
                  <p className="text-sm text-gray-500">{stat.label}</p>
                </CardContent>
              </Card>
            );
          })}
        </div>

        {/* Team Capacity */}
        <Card className="mb-6">
          <CardContent className="p-4">
            <h2 className="font-semibold text-lg mb-4">Team Capacity This Week</h2>
            {serverCapacities.length === 0 ? (
              <p className="text-gray-500 text-sm">No servers in your team yet.</p>
            ) : (
              <div className="space-y-4">
                {serverCapacities.map(server => (
                  <div key={server.id}>
                    <div className="flex justify-between items-center mb-1">
                      <span className="font-medium">{server.full_name}</span>
                      <span className="text-sm text-gray-500">
                        {server.assignedHours}h / {server.targetHours}h
                        {server.percentage >= 100 && (
                          <span className="ml-2 text-xs bg-red-100 text-red-600 px-2 py-0.5 rounded">FULL</span>
                        )}
                      </span>
                    </div>
                    <Progress value={server.percentage} className="h-2" />
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Recent Activity */}
        <Card className="mb-6">
          <CardContent className="p-4">
            <h2 className="font-semibold text-lg mb-4">Recent Activity</h2>
            {auditLogs.length === 0 ? (
              <p className="text-gray-500 text-sm">No recent activity.</p>
            ) : (
              <div className="space-y-3">
                {auditLogs.map((log, idx) => (
                  <div key={log.id || idx} className="flex items-center gap-3 text-sm">
                    <div className="w-2 h-2 rounded-full bg-blue-500" />
                    <span className="text-gray-700">{getActivityText(log)}</span>
                    {log.details?.route_name && (
                      <span className="text-gray-500">- {log.details.route_name}</span>
                    )}
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Quick Actions */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <Link to={createPageUrl('AddressImport')}>
            <Button variant="outline" className="w-full h-14 justify-start gap-3">
              <Upload className="w-5 h-5 text-blue-600" />
              <span>Import Addresses</span>
            </Button>
          </Link>
          <Link to={createPageUrl('CreateRoute')}>
            <Button variant="outline" className="w-full h-14 justify-start gap-3">
              <Plus className="w-5 h-5 text-green-600" />
              <span>Create Route</span>
            </Button>
          </Link>
          <Link to={createPageUrl('BossRoutes')}>
            <Button variant="outline" className="w-full h-14 justify-start gap-3">
              <ClipboardList className="w-5 h-5 text-purple-600" />
              <span>View All Routes</span>
            </Button>
          </Link>
        </div>
      </main>

      <BossBottomNav currentPage="BossDashboard" />
    </div>
  );
}