import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import { ArrowLeft, Loader2, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { toast } from 'sonner';
import BossBottomNav from '../components/boss/BossBottomNav';

export default function UnassignRoute() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const urlParams = new URLSearchParams(window.location.search);
  const routeId = urlParams.get('id');
  
  const [isUnassigning, setIsUnassigning] = useState(false);

  const { data: user } = useQuery({
    queryKey: ['currentUser'],
    queryFn: () => base44.auth.me()
  });

  const { data: route, isLoading } = useQuery({
    queryKey: ['route', routeId],
    queryFn: async () => {
      const routes = await base44.entities.Route.filter({ id: routeId });
      return routes[0] || null;
    },
    enabled: !!routeId
  });

  const companyId = user?.company_id || 'default';

  const { data: servers = [] } = useQuery({
    queryKey: ['companyServers', companyId],
    queryFn: async () => {
      const users = await base44.entities.User.list();
      return users.filter(u => (u.company_id === companyId || !u.company_id) && u.role === 'server');
    },
    enabled: !!user
  });

  const unassignMutation = useMutation({
    mutationFn: async () => {
      const previousServerId = route.worker_id;
      const previousServer = servers.find(s => s.id === previousServerId);
      
      // Update route
      await base44.entities.Route.update(routeId, {
        worker_id: null,
        assignment_id: null,
        status: 'ready'
      });
      
      // Update assignment if exists
      if (route.assignment_id) {
        await base44.entities.Assignment.update(route.assignment_id, {
          status: 'unassigned'
        });
      }
      
      // Notify server
      await base44.entities.Notification.create({
        user_id: previousServerId,
        company_id: companyId,
        type: 'reassigned_away',
        title: 'Route Unassigned',
        body: `${route.folder_name} has been removed from your assignments.`,
        related_id: routeId,
        related_type: 'route'
      });
      
      // Audit log
      await base44.entities.AuditLog.create({
        company_id: companyId,
        action_type: 'route_unassigned',
        actor_id: user.id,
        actor_role: user.role || 'boss',
        target_type: 'route',
        target_id: routeId,
        details: {
          route_name: route.folder_name,
          previous_server_id: previousServerId,
          previous_server_name: previousServer?.full_name
        },
        timestamp: new Date().toISOString()
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['allRoutes'] });
      toast.success('Route unassigned');
      navigate(createPageUrl('BossRoutes'));
    }
  });

  const getServerName = (workerId) => {
    const server = servers.find(s => s.id === workerId);
    return server?.full_name || 'Unknown';
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
      </div>
    );
  }

  if (!route) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <p className="text-gray-500">Route not found</p>
      </div>
    );
  }

  const canUnassign = ['assigned', 'stalled'].includes(route.status);

  return (
    <div className="min-h-screen bg-gray-50 pb-20">
      {/* Header */}
      <header className="bg-white border-b px-4 py-3 flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate(createPageUrl('BossRoutes'))}>
          <ArrowLeft className="w-5 h-5" />
        </Button>
        <h1 className="font-semibold text-lg">Unassign Route</h1>
      </header>

      <main className="px-4 py-6 max-w-lg mx-auto">
        {!canUnassign ? (
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>
              Cannot unassign {route.status === 'active' ? 'active' : 'this'} route. 
              {route.status === 'active' && ' Route is locked while server is working.'}
            </AlertDescription>
          </Alert>
        ) : (
          <Card>
            <CardHeader>
              <CardTitle>Confirm Unassignment</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p>Are you sure you want to unassign this route?</p>
              
              <div className="bg-gray-50 rounded-lg p-4 space-y-2">
                <p><strong>Route:</strong> {route.folder_name}</p>
                <p><strong>Currently assigned to:</strong> {getServerName(route.worker_id)}</p>
                <p><strong>Status:</strong> {route.status}</p>
              </div>
              
              <p className="text-sm text-gray-600">
                {getServerName(route.worker_id)} will be notified that this route has been removed from their assignments.
              </p>
              
              <div className="flex gap-3 pt-4">
                <Button variant="outline" onClick={() => navigate(createPageUrl('BossRoutes'))}>
                  Cancel
                </Button>
                <Button 
                  variant="destructive"
                  className="flex-1"
                  disabled={isUnassigning}
                  onClick={async () => {
                    setIsUnassigning(true);
                    await unassignMutation.mutateAsync();
                    setIsUnassigning(false);
                  }}
                >
                  {isUnassigning ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Unassigning...
                    </>
                  ) : (
                    'Unassign Route'
                  )}
                </Button>
              </div>
            </CardContent>
          </Card>
        )}
      </main>

      <BossBottomNav currentPage="BossRoutes" />
    </div>
  );
}