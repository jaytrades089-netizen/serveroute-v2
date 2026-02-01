import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import { format } from 'date-fns';
import { 
  Loader2, 
  ChevronLeft, 
  MapPin,
  User,
  ArrowRight,
  AlertCircle,
  CheckCircle
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Progress } from '@/components/ui/progress';
import BossBottomNav from '../components/boss/BossBottomNav';
import { toast } from 'sonner';

export default function RouteHandoff() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const urlParams = new URLSearchParams(window.location.search);
  const routeId = urlParams.get('routeId');

  const [selectedWorker, setSelectedWorker] = useState('');
  const [transferType, setTransferType] = useState('remaining');
  const [reason, setReason] = useState('');

  const { data: user } = useQuery({
    queryKey: ['currentUser'],
    queryFn: () => base44.auth.me()
  });

  const companyId = user?.company_id || 'default';

  const { data: route, isLoading: routeLoading } = useQuery({
    queryKey: ['route', routeId],
    queryFn: async () => {
      const routes = await base44.entities.Route.filter({ id: routeId });
      return routes[0];
    },
    enabled: !!routeId
  });

  const { data: addresses = [] } = useQuery({
    queryKey: ['routeAddresses', routeId],
    queryFn: async () => {
      return base44.entities.Address.filter({
        route_id: routeId,
        deleted_at: null
      });
    },
    enabled: !!routeId
  });

  const { data: workers = [] } = useQuery({
    queryKey: ['companyWorkers', companyId],
    queryFn: async () => {
      const users = await base44.entities.User.list();
      return users.filter(u => 
        u.company_id === companyId && 
        (u.role === 'server' || u.role === 'user') &&
        u.id !== route?.worker_id
      );
    },
    enabled: !!user && !!route
  });

  const { data: currentWorker } = useQuery({
    queryKey: ['currentWorker', route?.worker_id],
    queryFn: async () => {
      const users = await base44.entities.User.list();
      return users.find(u => u.id === route.worker_id);
    },
    enabled: !!route?.worker_id
  });

  const handoffMutation = useMutation({
    mutationFn: async () => {
      const toWorker = workers.find(w => w.id === selectedWorker);
      const remainingAddresses = addresses.filter(a => !a.served);

      // Update route
      await base44.entities.Route.update(routeId, {
        worker_id: selectedWorker,
        previous_worker_id: route.worker_id,
        handoff_reason: reason || null,
        handoff_at: new Date().toISOString(),
        status: 'assigned',
        assigned_at: new Date().toISOString(),
        assigned_by: user.id
      });

      // Update old worker's current route
      if (route.worker_id) {
        await base44.entities.User.update(route.worker_id, {
          current_route_id: null
        });
      }

      // Update new worker
      await base44.entities.User.update(selectedWorker, {
        current_route_id: routeId,
        worker_status: 'active',
        last_active_at: new Date().toISOString()
      });

      // Notify old worker
      if (route.worker_id) {
        await base44.entities.Notification.create({
          user_id: route.worker_id,
          company_id: companyId,
          recipient_role: 'server',
          type: 'route_reassigned',
          title: 'Route Reassigned',
          body: `${route.folder_name} has been reassigned to ${toWorker.full_name}`,
          data: { route_id: routeId },
          priority: 'normal'
        });
      }

      // Notify new worker
      await base44.entities.Notification.create({
        user_id: selectedWorker,
        company_id: companyId,
        recipient_role: 'server',
        type: 'route_assigned',
        title: 'Route Assigned',
        body: `${route.folder_name}: ${remainingAddresses.length} addresses remaining`,
        action_url: `/WorkerRouteDetail?routeId=${routeId}`,
        data: { route_id: routeId, handoff: true },
        priority: 'normal'
      });

      // Audit log
      await base44.entities.AuditLog.create({
        company_id: companyId,
        action_type: 'route_handoff',
        actor_id: user.id,
        actor_role: 'boss',
        target_type: 'route',
        target_id: routeId,
        details: {
          from_worker: route.worker_id,
          from_worker_name: currentWorker?.full_name,
          to_worker: selectedWorker,
          to_worker_name: toWorker.full_name,
          addresses_remaining: remainingAddresses.length,
          reason
        },
        timestamp: new Date().toISOString()
      });
    },
    onSuccess: () => {
      toast.success('Route reassigned successfully');
      queryClient.invalidateQueries();
      navigate(createPageUrl('BossDashboard'));
    },
    onError: (error) => {
      toast.error(error.message || 'Failed to reassign route');
    }
  });

  if (routeLoading || !route) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
      </div>
    );
  }

  const servedCount = addresses.filter(a => a.served).length;
  const remainingCount = addresses.length - servedCount;
  const progress = addresses.length > 0 ? Math.round((servedCount / addresses.length) * 100) : 0;

  return (
    <div className="min-h-screen bg-gray-50 pb-20">
      {/* Header */}
      <header className="bg-blue-500 text-white px-4 py-3 flex items-center gap-3">
        <Link to={createPageUrl('BossDashboard')}>
          <ChevronLeft className="w-6 h-6" />
        </Link>
        <span className="font-bold text-lg">Reassign Route</span>
      </header>

      <main className="px-4 py-6 max-w-lg mx-auto">
        {/* Current Assignment */}
        <Card className="mb-4">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold">Current Assignment</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-3 mb-3">
              <div className="p-2 bg-blue-100 rounded-lg">
                <MapPin className="w-5 h-5 text-blue-600" />
              </div>
              <div>
                <h3 className="font-semibold text-gray-900">{route.folder_name}</h3>
                {currentWorker && (
                  <p className="text-sm text-gray-500">Assigned to: {currentWorker.full_name}</p>
                )}
              </div>
            </div>
            <Progress value={progress} className="h-2 mb-2" />
            <div className="flex justify-between text-sm text-gray-600">
              <span>{servedCount}/{addresses.length} completed</span>
              <span className="font-medium text-amber-600">{remainingCount} remaining</span>
            </div>
          </CardContent>
        </Card>

        {/* Select New Worker */}
        <Card className="mb-4">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold">Reassign To</CardTitle>
          </CardHeader>
          <CardContent>
            {workers.length === 0 ? (
              <div className="text-center py-4">
                <User className="w-8 h-8 text-gray-300 mx-auto mb-2" />
                <p className="text-sm text-gray-500">No other workers available</p>
              </div>
            ) : (
              <RadioGroup value={selectedWorker} onValueChange={setSelectedWorker}>
                <div className="space-y-2">
                  {workers.map((worker) => {
                    const status = worker.worker_status || 'offline';
                    const isRecommended = status === 'active' || status === 'offline';
                    
                    return (
                      <div 
                        key={worker.id}
                        className={`flex items-center space-x-3 p-3 rounded-lg border ${
                          selectedWorker === worker.id ? 'border-blue-500 bg-blue-50' : 'border-gray-200'
                        }`}
                      >
                        <RadioGroupItem value={worker.id} id={worker.id} />
                        <Label htmlFor={worker.id} className="flex-1 cursor-pointer">
                          <div className="flex items-center justify-between">
                            <div>
                              <span className="font-medium">{worker.full_name}</span>
                              {isRecommended && (
                                <span className="ml-2 text-xs text-green-600">✓ Available</span>
                              )}
                            </div>
                            <span className={`text-xs ${
                              status === 'active' ? 'text-green-600' :
                              status === 'paused' ? 'text-amber-600' : 'text-gray-500'
                            }`}>
                              {status}
                            </span>
                          </div>
                        </Label>
                      </div>
                    );
                  })}
                </div>
              </RadioGroup>
            )}
          </CardContent>
        </Card>

        {/* Reason */}
        <Card className="mb-4">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold">Reason (Optional)</CardTitle>
          </CardHeader>
          <CardContent>
            <Textarea
              placeholder="Why is this route being reassigned?"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={3}
            />
          </CardContent>
        </Card>

        {/* Summary */}
        {selectedWorker && (
          <Card className="mb-4 bg-blue-50 border-blue-200">
            <CardContent className="p-4">
              <div className="flex items-center gap-2 text-blue-800">
                <AlertCircle className="w-5 h-5" />
                <span className="font-medium">Summary</span>
              </div>
              <p className="text-sm text-blue-700 mt-2">
                {remainingCount} remaining addresses will be assigned to{' '}
                {workers.find(w => w.id === selectedWorker)?.full_name}.
                Both workers will be notified.
              </p>
            </CardContent>
          </Card>
        )}

        {/* Actions */}
        <div className="flex gap-3">
          <Button 
            variant="outline" 
            className="flex-1"
            onClick={() => navigate(-1)}
          >
            Cancel
          </Button>
          <Button 
            className="flex-1"
            disabled={!selectedWorker || handoffMutation.isPending}
            onClick={() => handoffMutation.mutate()}
          >
            {handoffMutation.isPending ? (
              <Loader2 className="w-4 h-4 animate-spin mr-2" />
            ) : (
              <CheckCircle className="w-4 h-4 mr-2" />
            )}
            Confirm Reassignment
          </Button>
        </div>
      </main>

      <BossBottomNav currentPage="BossRoutes" />
    </div>
  );
}