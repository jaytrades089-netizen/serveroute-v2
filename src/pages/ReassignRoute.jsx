import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import { ArrowLeft, Loader2, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Progress } from '@/components/ui/progress';
import { toast } from 'sonner';
import BossBottomNav from '../components/boss/BossBottomNav';

const REASSIGN_REASONS = [
  { value: 'unavailable', label: 'Server unavailable' },
  { value: 'workload', label: 'Workload balancing' },
  { value: 'requested', label: 'Server requested reassignment' },
  { value: 'geographic', label: 'Geographic optimization' },
  { value: 'other', label: 'Other (specify below)' }
];

export default function ReassignRoute() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const urlParams = new URLSearchParams(window.location.search);
  const routeId = urlParams.get('id') || urlParams.get('routeId');
  
  const [selectedServerId, setSelectedServerId] = useState('');
  const [reason, setReason] = useState('');
  const [notes, setNotes] = useState('');
  const [isReassigning, setIsReassigning] = useState(false);

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

  const { data: allRoutes = [] } = useQuery({
    queryKey: ['allRoutes', companyId],
    queryFn: async () => {
      return base44.entities.Route.filter({
        company_id: companyId,
        deleted_at: null
      });
    },
    enabled: !!user
  });

  const reassignMutation = useMutation({
    mutationFn: async () => {
      const oldServer = servers.find(s => s.id === route.worker_id);
      const newServer = servers.find(s => s.id === selectedServerId);
      const reasonLabel = REASSIGN_REASONS.find(r => r.value === reason)?.label || reason;
      
      // Update route
      await base44.entities.Route.update(routeId, {
        worker_id: selectedServerId
      });
      
      // Update assignment
      if (route.assignment_id) {
        await base44.entities.Assignment.update(route.assignment_id, {
          server_id: selectedServerId
        });
      }
      
      // Update old worker - clear current route
      await base44.entities.User.update(route.worker_id, {
        current_route_id: null
      });

      // Update new worker - set current route
      await base44.entities.User.update(selectedServerId, {
        current_route_id: routeId,
        worker_status: 'active',
        last_active_at: new Date().toISOString()
      });
      
      // Notify old server
      await base44.entities.Notification.create({
        user_id: route.worker_id,
        company_id: companyId,
        type: 'reassigned_away',
        title: 'Route Reassigned',
        body: `${route.folder_name} has been reassigned to ${newServer.full_name}. Reason: ${reasonLabel}`,
        related_id: routeId,
        related_type: 'route'
      });
      
      // Notify new server
      await base44.entities.Notification.create({
        user_id: selectedServerId,
        company_id: companyId,
        type: 'reassigned_to',
        title: 'Route Assigned',
        body: `${route.folder_name} has been assigned to you (reassigned from ${oldServer?.full_name})`,
        related_id: routeId,
        related_type: 'route'
      });
      
      // Audit log
      await base44.entities.AuditLog.create({
        company_id: companyId,
        action_type: 'route_reassigned',
        actor_id: user.id,
        actor_role: user.role || 'boss',
        target_type: 'route',
        target_id: routeId,
        details: {
          route_name: route.folder_name,
          from_server_id: route.worker_id,
          from_server_name: oldServer?.full_name,
          to_server_id: selectedServerId,
          to_server_name: newServer?.full_name,
          reason: reasonLabel,
          notes: notes
        },
        timestamp: new Date().toISOString()
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['allRoutes'] });
      toast.success('Route reassigned successfully');
      navigate(createPageUrl('BossRoutes'));
    }
  });

  const getServerCapacity = (serverId) => {
    const serverRoutes = allRoutes.filter(r => 
      r.worker_id === serverId && 
      ['assigned', 'active'].includes(r.status)
    );
    const assignedMinutes = serverRoutes.reduce((sum, r) => sum + (r.estimated_time_minutes || 0), 0);
    const assignedHours = Math.round(assignedMinutes / 60);
    const targetHours = 40;
    const remainingHours = Math.max(0, targetHours - assignedHours);
    const percentage = Math.min(Math.round((assignedHours / targetHours) * 100), 100);
    
    return { assignedHours, targetHours, remainingHours, percentage };
  };

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

  const canReassign = ['assigned', 'stalled'].includes(route.status);
  const availableServers = servers.filter(s => s.id !== route.worker_id);

  return (
    <div className="min-h-screen bg-gray-50 pb-20">
      {/* Header */}
      <header className="bg-white border-b px-4 py-3 flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate(createPageUrl('BossRoutes'))}>
          <ArrowLeft className="w-5 h-5" />
        </Button>
        <h1 className="font-semibold text-lg">Reassign Route</h1>
      </header>

      <main className="px-4 py-6 max-w-lg mx-auto">
        {!canReassign ? (
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>
              Cannot reassign {route.status === 'active' ? 'active' : 'this'} route.
              {route.status === 'active' && ' Route is locked while server is working.'}
            </AlertDescription>
          </Alert>
        ) : (
          <div className="space-y-6">
            {/* Route Info */}
            <Card>
              <CardContent className="p-4">
                <p><strong>Route:</strong> {route.folder_name}</p>
                <p><strong>Currently assigned to:</strong> {getServerName(route.worker_id)}</p>
              </CardContent>
            </Card>

            {/* Reason */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Reason for reassignment *</CardTitle>
              </CardHeader>
              <CardContent>
                <Select value={reason} onValueChange={setReason}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select a reason" />
                  </SelectTrigger>
                  <SelectContent>
                    {REASSIGN_REASONS.map(r => (
                      <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                
                <div className="mt-4">
                  <Label>Additional notes</Label>
                  <Textarea
                    placeholder="Optional notes..."
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    className="mt-1"
                  />
                </div>
              </CardContent>
            </Card>

            {/* Server Selection */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Reassign to</CardTitle>
              </CardHeader>
              <CardContent>
                {availableServers.length === 0 ? (
                  <p className="text-gray-500 text-center py-4">No other servers available</p>
                ) : (
                  <RadioGroup value={selectedServerId} onValueChange={setSelectedServerId}>
                    <div className="space-y-3">
                      {availableServers.map((server) => {
                        const capacity = getServerCapacity(server.id);
                        
                        return (
                          <div
                            key={server.id}
                            className={`p-3 border rounded-lg cursor-pointer ${
                              selectedServerId === server.id ? 'border-blue-500 bg-blue-50' : ''
                            }`}
                            onClick={() => setSelectedServerId(server.id)}
                          >
                            <div className="flex items-center gap-3">
                              <RadioGroupItem value={server.id} id={server.id} />
                              <div className="flex-1">
                                <Label htmlFor={server.id} className="font-medium cursor-pointer">
                                  {server.full_name}
                                </Label>
                                <p className="text-sm text-gray-500">
                                  {capacity.remainingHours}h remaining
                                </p>
                                <Progress value={capacity.percentage} className="mt-1 h-1.5" />
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </RadioGroup>
                )}
              </CardContent>
            </Card>

            <div className="flex gap-3">
              <Button variant="outline" onClick={() => navigate(createPageUrl('BossRoutes'))}>
                Cancel
              </Button>
              <Button 
                className="flex-1"
                disabled={!selectedServerId || !reason || isReassigning}
                onClick={async () => {
                  setIsReassigning(true);
                  await reassignMutation.mutateAsync();
                  setIsReassigning(false);
                }}
              >
                {isReassigning ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Reassigning...
                  </>
                ) : (
                  `Reassign to ${servers.find(s => s.id === selectedServerId)?.full_name || 'Selected Server'}`
                )}
              </Button>
            </div>
          </div>
        )}
      </main>

      <BossBottomNav currentPage="BossRoutes" />
    </div>
  );
}