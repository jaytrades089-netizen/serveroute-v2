import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import { format } from 'date-fns';
import { 
  ArrowLeft, 
  Loader2,
  MapPin,
  Clock,
  DollarSign,
  CheckCircle,
  AlertTriangle,
  User
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import BossBottomNav from '../components/boss/BossBottomNav';

export default function AssignRoute() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const urlParams = new URLSearchParams(window.location.search);
  const routeId = urlParams.get('id');
  
  const [selectedServerId, setSelectedServerId] = useState('');
  const [isAssigning, setIsAssigning] = useState(false);

  const { data: user } = useQuery({
    queryKey: ['currentUser'],
    queryFn: () => base44.auth.me()
  });

  const { data: route, isLoading: routeLoading } = useQuery({
    queryKey: ['route', routeId],
    queryFn: async () => {
      const routes = await base44.entities.Route.filter({ id: routeId });
      return routes[0] || null;
    },
    enabled: !!routeId
  });

  const { data: routeAddresses = [] } = useQuery({
    queryKey: ['routeAddresses', routeId],
    queryFn: async () => {
      return base44.entities.Address.filter({
        route_id: routeId,
        deleted_at: null
      });
    },
    enabled: !!routeId
  });

  const companyId = user?.company_id || 'default';

  const { data: servers = [] } = useQuery({
    queryKey: ['companyServers', companyId],
    queryFn: async () => {
      const users = await base44.entities.User.list();
      // Include users with role 'server' or 'user' (default role from invite)
      return users.filter(u => u.company_id === companyId && (u.role === 'server' || u.role === 'user'));
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

  const assignMutation = useMutation({
    mutationFn: async () => {
      const server = servers.find(s => s.id === selectedServerId);
      
      // Create assignment
      const assignment = await base44.entities.Assignment.create({
        company_id: companyId,
        boss_id: user.id,
        server_id: selectedServerId,
        batch_name: route.folder_name,
        due_date: route.due_date,
        total_addresses: routeAddresses.length,
        status: 'pending',
        assigned_at: new Date().toISOString()
      });
      
      // Update route
      await base44.entities.Route.update(routeId, {
        assignment_id: assignment.id,
        worker_id: selectedServerId,
        status: 'assigned'
      });
      
      // Update worker's current route
      await base44.entities.User.update(selectedServerId, {
        current_route_id: routeId,
        worker_status: 'active',
        last_active_at: new Date().toISOString()
      });
      
      // Send notification
      await base44.entities.Notification.create({
        user_id: selectedServerId,
        company_id: companyId,
        type: 'assignment_new',
        title: 'New Assignment',
        body: `You've been assigned ${route.folder_name} (${routeAddresses.length} addresses, due ${format(new Date(route.due_date), 'MMM d')})`,
        related_id: routeId,
        related_type: 'route'
      });
      
      // Audit log
      await base44.entities.AuditLog.create({
        company_id: companyId,
        action_type: 'assignment_created',
        actor_id: user.id,
        actor_role: user.role || 'boss',
        target_type: 'assignment',
        target_id: assignment.id,
        details: {
          route_id: routeId,
          route_name: route.folder_name,
          server_id: selectedServerId,
          server_name: server.full_name,
          addresses: routeAddresses.length,
          estimated_time: route.estimated_time_minutes
        },
        timestamp: new Date().toISOString()
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['allRoutes'] });
      toast.success('Route assigned successfully');
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

  const calculateEarnings = () => {
    return routeAddresses.reduce((sum, addr) => sum + (addr.pay_rate || 0), 0);
  };

  const routeTimeHours = route?.estimated_time_minutes ? Math.round(route.estimated_time_minutes / 60 * 10) / 10 : 2;

  if (routeLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
      </div>
    );
  }

  if (!route || route.status !== 'ready') {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <p className="text-gray-500">Route not found or not ready for assignment</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 pb-20">
      {/* Header */}
      <header className="bg-white border-b px-4 py-3 flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate(createPageUrl('BossRoutes'))}>
          <ArrowLeft className="w-5 h-5" />
        </Button>
        <h1 className="font-semibold text-lg">Assign {route.folder_name}</h1>
      </header>

      <main className="px-4 py-6 max-w-lg mx-auto">
        {/* Route Details */}
        <Card className="mb-6">
          <CardContent className="p-4">
            <h2 className="font-semibold mb-3">Route Details</h2>
            <div className="space-y-2 text-sm">
              <div className="flex items-center gap-2">
                <MapPin className="w-4 h-4 text-gray-400" />
                <span>{routeAddresses.length} addresses</span>
              </div>
              <div className="flex items-center gap-2">
                <DollarSign className="w-4 h-4 text-gray-400" />
                <span>Earnings: ${calculateEarnings()}</span>
              </div>
              <div className="flex items-center gap-2">
                <Clock className="w-4 h-4 text-gray-400" />
                <span>Estimated Time: ~{routeTimeHours}h</span>
              </div>
              <div className="flex items-center gap-2">
                <Clock className="w-4 h-4 text-gray-400" />
                <span>Due: {format(new Date(route.due_date), 'MMMM d, yyyy')}</span>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Server Selection */}
        <h2 className="font-semibold mb-3">Select Server</h2>
        
        {servers.length === 0 ? (
          <Card>
            <CardContent className="p-6 text-center">
              <User className="w-10 h-10 mx-auto text-gray-300 mb-3" />
              <p className="text-gray-500">No servers in your team</p>
            </CardContent>
          </Card>
        ) : (
          <RadioGroup value={selectedServerId} onValueChange={setSelectedServerId}>
            <div className="space-y-3">
              {servers.map((server) => {
                const capacity = getServerCapacity(server.id);
                const canAssign = capacity.remainingHours >= routeTimeHours;
                const isTight = capacity.remainingHours < routeTimeHours * 1.5 && capacity.remainingHours >= routeTimeHours;
                
                return (
                  <Card 
                    key={server.id} 
                    className={`cursor-pointer transition-colors ${
                      selectedServerId === server.id ? 'ring-2 ring-blue-500' : ''
                    }`}
                    onClick={() => setSelectedServerId(server.id)}
                  >
                    <CardContent className="p-4">
                      <div className="flex items-start gap-3">
                        <RadioGroupItem value={server.id} id={server.id} className="mt-1" />
                        <div className="flex-1">
                          <Label htmlFor={server.id} className="font-medium cursor-pointer">
                            {server.full_name}
                          </Label>
                          <div className="text-sm text-gray-500 mt-1">
                            Target: {capacity.targetHours}h/week
                          </div>
                          <div className="text-sm text-gray-500">
                            Assigned: {capacity.assignedHours}h
                          </div>
                          <div className="text-sm text-gray-500">
                            Remaining: {capacity.remainingHours}h
                          </div>
                          <Progress value={capacity.percentage} className="mt-2 h-2" />
                          
                          <div className="mt-2">
                            {!canAssign ? (
                              <div className="flex items-center gap-1 text-red-600 text-sm">
                                <AlertTriangle className="w-4 h-4" />
                                <span>Over capacity (needs {routeTimeHours}h)</span>
                              </div>
                            ) : isTight ? (
                              <div className="flex items-center gap-1 text-amber-600 text-sm">
                                <AlertTriangle className="w-4 h-4" />
                                <span>Tight fit (needs {routeTimeHours}h, has {capacity.remainingHours}h)</span>
                              </div>
                            ) : (
                              <div className="flex items-center gap-1 text-green-600 text-sm">
                                <CheckCircle className="w-4 h-4" />
                                <span>Can assign (needs {routeTimeHours}h, has {capacity.remainingHours}h)</span>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </RadioGroup>
        )}

        <div className="flex gap-3 mt-6">
          <Button variant="outline" onClick={() => navigate(createPageUrl('BossRoutes'))}>
            Cancel
          </Button>
          <Button 
            className="flex-1" 
            disabled={!selectedServerId || isAssigning}
            onClick={async () => {
              setIsAssigning(true);
              await assignMutation.mutateAsync();
              setIsAssigning(false);
            }}
          >
            {isAssigning ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Assigning...
              </>
            ) : (
              'Assign to Selected Server'
            )}
          </Button>
        </div>
      </main>

      <BossBottomNav currentPage="BossRoutes" />
    </div>
  );
}