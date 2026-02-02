import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import { format } from 'date-fns';
import { 
  Loader2, 
  Plus, 
  FileText,
  Bell,
  MapPin,
  Clock,
  User,
  Trash2,
  Edit,
  UserPlus,
  MoreVertical
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { toast } from 'sonner';
import BossBottomNav from '../components/boss/BossBottomNav';

export default function BossRoutes() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState('all');

  const { data: user } = useQuery({
    queryKey: ['currentUser'],
    queryFn: () => base44.auth.me()
  });

  const companyId = user?.company_id || 'default';

  const { data: routes = [], isLoading } = useQuery({
    queryKey: ['allRoutes', companyId],
    queryFn: async () => {
      return base44.entities.Route.filter({
        company_id: companyId,
        deleted_at: null
      });
    },
    enabled: !!user
  });

  const { data: servers = [] } = useQuery({
    queryKey: ['companyServers', companyId],
    queryFn: async () => {
      const users = await base44.entities.User.list();
      return users.filter(u => (u.company_id === companyId || !u.company_id) && u.role === 'server');
    },
    enabled: !!user
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

  const deleteRouteMutation = useMutation({
    mutationFn: async (routeId) => {
      const route = routes.find(r => r.id === routeId);
      
      // Return addresses to pool
      const addresses = await base44.entities.Address.filter({
        route_id: routeId,
        deleted_at: null
      });
      
      for (const addr of addresses) {
        await base44.entities.Address.update(addr.id, {
          route_id: null,
          order_index: null
        });
      }
      
      await base44.entities.Route.update(routeId, {
        deleted_at: new Date().toISOString(),
        deleted_by: user.id
      });
      
      await base44.entities.AuditLog.create({
        company_id: companyId,
        action_type: 'route_updated',
        actor_id: user.id,
        actor_role: user.role || 'boss',
        target_type: 'route',
        target_id: routeId,
        details: {
          action: 'deleted',
          route_name: route?.folder_name
        },
        timestamp: new Date().toISOString()
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['allRoutes'] });
      queryClient.invalidateQueries({ queryKey: ['poolAddresses'] });
      toast.success('Route deleted');
    }
  });

  const getStatusColor = (status) => {
    switch (status) {
      case 'draft': return 'bg-gray-100 text-gray-700';
      case 'ready': return 'bg-blue-100 text-blue-700';
      case 'assigned': return 'bg-purple-100 text-purple-700';
      case 'active': return 'bg-green-100 text-green-700';
      case 'stalled': return 'bg-amber-100 text-amber-700';
      case 'completed': return 'bg-emerald-100 text-emerald-700';
      default: return 'bg-gray-100 text-gray-700';
    }
  };

  const getServerName = (workerId) => {
    const server = servers.find(s => s.id === workerId);
    return server?.full_name || 'Unassigned';
  };

  const filteredRoutes = routes.filter(route => {
    if (activeTab === 'all') return true;
    if (activeTab === 'draft') return route.status === 'draft';
    if (activeTab === 'ready') return route.status === 'ready';
    if (activeTab === 'assigned') return ['assigned', 'active', 'stalled'].includes(route.status);
    if (activeTab === 'completed') return route.status === 'completed';
    return true;
  });

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
          <span className="font-bold text-lg">Routes</span>
          <span className="text-xs bg-white/20 px-2 py-0.5 rounded-full">Boss</span>
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
          <Link to={createPageUrl('CreateRoute')}>
            <Button size="sm" variant="secondary">
              <Plus className="w-4 h-4 mr-1" /> New
            </Button>
          </Link>
        </div>
      </header>

      <main className="px-4 py-4 max-w-4xl mx-auto">
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="w-full mb-4">
            <TabsTrigger value="all" className="flex-1">All</TabsTrigger>
            <TabsTrigger value="draft" className="flex-1">Draft</TabsTrigger>
            <TabsTrigger value="ready" className="flex-1">Ready</TabsTrigger>
            <TabsTrigger value="assigned" className="flex-1">Assigned</TabsTrigger>
          </TabsList>

          <TabsContent value={activeTab}>
            {filteredRoutes.length === 0 ? (
              <Card>
                <CardContent className="p-8 text-center">
                  <MapPin className="w-12 h-12 mx-auto text-gray-300 mb-4" />
                  <p className="text-gray-500">No routes found</p>
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-3">
                {filteredRoutes.map((route) => (
                  <Card 
                    key={route.id} 
                    className="overflow-hidden cursor-pointer hover:shadow-md transition-shadow"
                    onClick={() => navigate(createPageUrl(`RouteEditor?id=${route.id}`))}
                  >
                    <CardContent className="p-4">
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-2">
                            <h3 className="font-semibold">{route.folder_name}</h3>
                            <Badge className={getStatusColor(route.status)}>
                              {route.status}
                            </Badge>
                          </div>
                          
                          <div className="flex flex-wrap gap-3 text-sm text-gray-600">
                            <div className="flex items-center gap-1">
                              <MapPin className="w-4 h-4" />
                              <span>{route.total_addresses || 0} addresses</span>
                            </div>
                            {route.due_date && (
                              <div className="flex items-center gap-1">
                                <Clock className="w-4 h-4" />
                                <span>Due {format(new Date(route.due_date), 'MMM d')}</span>
                              </div>
                            )}
                            {route.worker_id && (
                              <div className="flex items-center gap-1">
                                <User className="w-4 h-4" />
                                <span>{getServerName(route.worker_id)}</span>
                              </div>
                            )}
                          </div>
                        </div>
                        
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button 
                              variant="ghost" 
                              size="icon"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <MoreVertical className="w-4 h-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            {route.status === 'draft' && (
                              <DropdownMenuItem onClick={() => navigate(createPageUrl(`RouteEditor?id=${route.id}`))}>
                                <Edit className="w-4 h-4 mr-2" /> Edit
                              </DropdownMenuItem>
                            )}
                            {route.status === 'ready' && (
                              <DropdownMenuItem onClick={() => navigate(createPageUrl(`AssignRoute?id=${route.id}`))}>
                                <UserPlus className="w-4 h-4 mr-2" /> Assign
                              </DropdownMenuItem>
                            )}
                            {['assigned', 'stalled'].includes(route.status) && (
                              <>
                                <DropdownMenuItem onClick={() => navigate(createPageUrl(`ReassignRoute?id=${route.id}`))}>
                                  <UserPlus className="w-4 h-4 mr-2" /> Reassign
                                </DropdownMenuItem>
                                <DropdownMenuItem onClick={() => navigate(createPageUrl(`UnassignRoute?id=${route.id}`))}>
                                  <User className="w-4 h-4 mr-2" /> Unassign
                                </DropdownMenuItem>
                              </>
                            )}
                            {['draft', 'ready'].includes(route.status) && (
                              <DropdownMenuItem 
                                className="text-red-600"
                                onClick={() => {
                                  if (confirm('Delete this route? Addresses will return to the pool.')) {
                                    deleteRouteMutation.mutate(route.id);
                                  }
                                }}
                              >
                                <Trash2 className="w-4 h-4 mr-2" /> Delete
                              </DropdownMenuItem>
                            )}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>
        </Tabs>
      </main>

      <BossBottomNav currentPage="BossRoutes" />
    </div>
  );
}