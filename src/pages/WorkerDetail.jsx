import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import { format, formatDistanceToNow, subDays } from 'date-fns';
import { getCompanyId } from '@/components/utils/companyUtils';
import { 
  Loader2, 
  ChevronLeft, 
  User,
  MapPin,
  Clock,
  CheckCircle,
  Calendar,
  Phone,
  Mail,
  MessageSquare,
  Pause,
  Play,
  History,
  TrendingUp,
  AlertCircle
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import BossBottomNav from '../components/boss/BossBottomNav';
import MessageDialog from '../components/boss/MessageDialog';
import { toast } from 'sonner';

const statusConfig = {
  active: { color: 'bg-green-100 text-green-700', label: 'Active', dot: 'bg-green-500' },
  paused: { color: 'bg-amber-100 text-amber-700', label: 'Paused', dot: 'bg-amber-500' },
  offline: { color: 'bg-gray-100 text-gray-600', label: 'Offline', dot: 'bg-gray-400' }
};

export default function WorkerDetail() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const urlParams = new URLSearchParams(window.location.search);
  const workerId = urlParams.get('id');
  const [showMessage, setShowMessage] = useState(false);

  const { data: currentUser } = useQuery({
    queryKey: ['currentUser'],
    queryFn: () => base44.auth.me()
  });

  const companyId = getCompanyId(currentUser);

  const { data: worker, isLoading } = useQuery({
    queryKey: ['worker', workerId, companyId],
    queryFn: async () => {
      if (!companyId) return null;
      const users = await base44.entities.User.filter({ company_id: companyId });
      return users.find(u => u.id === workerId);
    },
    enabled: !!workerId && !!companyId
  });

  const { data: routes = [] } = useQuery({
    queryKey: ['workerRoutes', workerId],
    queryFn: async () => {
      return base44.entities.Route.filter({
        worker_id: workerId,
        deleted_at: null
      });
    },
    enabled: !!workerId
  });

  const { data: addresses = [] } = useQuery({
    queryKey: ['workerAddresses', workerId, routes],
    queryFn: async () => {
      if (routes.length === 0) return [];
      const routeIds = routes.map(r => r.id);
      const all = await base44.entities.Address.filter({
        company_id: companyId,
        deleted_at: null
      });
      return all.filter(a => routeIds.includes(a.route_id));
    },
    enabled: routes.length > 0
  });

  const { data: vacationRequests = [] } = useQuery({
    queryKey: ['workerVacations', workerId],
    queryFn: async () => {
      return base44.entities.VacationRequest.filter({
        server_id: workerId
      }, '-created_date', 5);
    },
    enabled: !!workerId
  });

  const pauseResumeMutation = useMutation({
    mutationFn: async (action) => {
      const newStatus = action === 'pause' ? 'paused' : 'active';
      await base44.entities.User.update(worker.id, {
        worker_status: newStatus
      });

      await base44.entities.AuditLog.create({
        company_id: companyId,
        action_type: action === 'pause' ? 'worker_paused' : 'worker_resumed',
        actor_id: currentUser.id,
        actor_role: 'boss',
        target_type: 'user',
        target_id: worker.id,
        details: { worker_name: worker.full_name },
        timestamp: new Date().toISOString()
      });

      await base44.entities.Notification.create({
        user_id: worker.id,
        company_id: companyId,
        recipient_role: 'server',
        type: 'message_received',
        title: action === 'pause' ? 'Work Paused' : 'Work Resumed',
        body: action === 'pause' 
          ? 'Your work has been paused by admin'
          : 'You can continue working on your routes',
        priority: 'urgent'
      });
    },
    onSuccess: (_, action) => {
      toast.success(action === 'pause' ? 'Worker paused' : 'Worker resumed');
      queryClient.invalidateQueries({ queryKey: ['worker'] });
    },
    onError: (error) => {
      toast.error(error.message || 'Failed to update worker status');
    }
  });

  if (isLoading || !worker) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
      </div>
    );
  }

  const status = worker.worker_status || 'offline';
  const config = statusConfig[status];

  // Calculate stats
  const activeRoute = routes.find(r => ['assigned', 'active'].includes(r.status));
  const completedRoutes = routes.filter(r => r.status === 'completed');
  const servedAddresses = addresses.filter(a => a.served);

  // Today's stats
  const today = new Date().toISOString().split('T')[0];
  const todayServed = servedAddresses.filter(a => a.served_at?.startsWith(today)).length;
  const todayRoutes = completedRoutes.filter(r => r.completed_at?.startsWith(today)).length;

  // Current route progress
  let routeProgress = null;
  if (activeRoute) {
    const routeAddresses = addresses.filter(a => a.route_id === activeRoute.id);
    const served = routeAddresses.filter(a => a.served).length;
    routeProgress = {
      route: activeRoute,
      served,
      total: routeAddresses.length || activeRoute.total_addresses || 0,
      percent: routeAddresses.length > 0 ? Math.round((served / routeAddresses.length) * 100) : 0
    };
  }

  // 30-day history
  const thirtyDaysAgo = subDays(new Date(), 30);
  const recentRoutes = completedRoutes.filter(r => 
    r.completed_at && new Date(r.completed_at) >= thirtyDaysAgo
  );
  const recentServed = servedAddresses.filter(a => 
    a.served_at && new Date(a.served_at) >= thirtyDaysAgo
  );

  // Upcoming vacation
  const upcomingVacation = vacationRequests.find(v => 
    v.status === 'approved' && new Date(v.start_date) >= new Date()
  );

  return (
    <div className="min-h-screen bg-gray-50 pb-20">
      {/* Header */}
      <header className="bg-blue-500 text-white px-4 py-3 flex items-center gap-3">
        <Link to={createPageUrl('BossWorkers')}>
          <ChevronLeft className="w-6 h-6" />
        </Link>
        <span className="font-bold text-lg">Worker Details</span>
      </header>

      <main className="px-4 py-6 max-w-2xl mx-auto">
        {/* Profile Card */}
        <Card className="mb-4">
          <CardContent className="p-4">
            <div className="flex items-start gap-4">
              <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center">
                <User className="w-8 h-8 text-gray-600" />
              </div>
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-1">
                  <h1 className="text-xl font-bold text-gray-900">{worker.full_name}</h1>
                  <Badge className={config.color}>{config.label}</Badge>
                </div>
                <p className="text-sm text-gray-500 flex items-center gap-1">
                  <Mail className="w-4 h-4" />
                  {worker.email}
                </p>
                {worker.phone && (
                  <a 
                    href={`tel:${worker.phone}`}
                    className="text-sm text-blue-600 flex items-center gap-1 mt-1"
                  >
                    <Phone className="w-4 h-4" />
                    {worker.phone}
                  </a>
                )}
                {worker.last_active_at && (
                  <p className="text-xs text-gray-400 mt-2">
                    Last active: {formatDistanceToNow(new Date(worker.last_active_at), { addSuffix: true })}
                  </p>
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Current Route */}
        {routeProgress && (
          <Card className="mb-4">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <MapPin className="w-4 h-4" />
                Current Route
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between mb-2">
                <span className="font-medium">{routeProgress.route.folder_name}</span>
                {routeProgress.route.due_date && (
                  <span className="text-sm text-gray-500">
                    Due: {format(new Date(routeProgress.route.due_date), 'MMM d')}
                  </span>
                )}
              </div>
              <Progress value={routeProgress.percent} className="h-3 mb-2" />
              <div className="flex justify-between text-sm text-gray-600">
                <span>{routeProgress.served}/{routeProgress.total} addresses</span>
                <span>{routeProgress.percent}%</span>
              </div>
              <div className="mt-3 flex gap-2">
                <Link to={createPageUrl(`WorkerRouteDetail?routeId=${routeProgress.route.id}`)}>
                  <Button variant="outline" size="sm">View Route</Button>
                </Link>
                <Link to={createPageUrl(`ReassignRoute?routeId=${routeProgress.route.id}`)}>
                  <Button variant="outline" size="sm">Reassign</Button>
                </Link>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Today's Performance */}
        <Card className="mb-4">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <TrendingUp className="w-4 h-4" />
              Today's Performance
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-4 gap-4 text-center">
              <div>
                <p className="text-2xl font-bold text-gray-900">{todayServed}</p>
                <p className="text-xs text-gray-500">Addresses</p>
              </div>
              <div>
                <p className="text-2xl font-bold text-gray-900">{todayRoutes}</p>
                <p className="text-xs text-gray-500">Routes</p>
              </div>
              <div>
                <p className="text-2xl font-bold text-gray-900">{worker.avg_completion_time_minutes || '-'}</p>
                <p className="text-xs text-gray-500">Avg min</p>
              </div>
              <div>
                <p className="text-2xl font-bold text-gray-900">0</p>
                <p className="text-xs text-gray-500">Issues</p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* 30-Day Stats */}
        <Card className="mb-4">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <History className="w-4 h-4" />
              Last 30 Days
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-4">
              <div className="bg-gray-50 rounded-lg p-3 text-center">
                <p className="text-2xl font-bold text-gray-900">{recentRoutes.length}</p>
                <p className="text-xs text-gray-500">Routes completed</p>
              </div>
              <div className="bg-gray-50 rounded-lg p-3 text-center">
                <p className="text-2xl font-bold text-gray-900">{recentServed.length}</p>
                <p className="text-xs text-gray-500">Addresses served</p>
              </div>
              <div className="bg-gray-50 rounded-lg p-3 text-center">
                <p className="text-2xl font-bold text-gray-900">{worker.avg_completion_time_minutes || '-'}</p>
                <p className="text-xs text-gray-500">Avg min/address</p>
              </div>
              <div className="bg-gray-50 rounded-lg p-3 text-center">
                <p className="text-2xl font-bold text-gray-900">{worker.reliability_score || '-'}%</p>
                <p className="text-xs text-gray-500">Reliability</p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Availability */}
        <Card className="mb-4">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <Calendar className="w-4 h-4" />
              Availability
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-500">Work Days</span>
                <span className="font-medium">
                  {worker.available_days?.join(', ') || 'Mon-Fri'}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Hours</span>
                <span className="font-medium">
                  {worker.work_start_time || '08:00'} - {worker.work_end_time || '18:00'}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Capacity</span>
                <span className="font-medium">{worker.capacity_limit || 50} addresses/day</span>
              </div>
              {worker.preferred_zones?.length > 0 && (
                <div className="flex justify-between">
                  <span className="text-gray-500">Zones</span>
                  <span className="font-medium">{worker.preferred_zones.join(', ')}</span>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Upcoming Time Off */}
        {upcomingVacation && (
          <Card className="mb-4 border-amber-200 bg-amber-50">
            <CardContent className="p-4">
              <div className="flex items-start gap-3">
                <AlertCircle className="w-5 h-5 text-amber-600 mt-0.5" />
                <div>
                  <p className="font-medium text-amber-800">Upcoming Time Off</p>
                  <p className="text-sm text-amber-700">
                    {format(new Date(upcomingVacation.start_date), 'MMM d')} - {format(new Date(upcomingVacation.end_date), 'MMM d, yyyy')}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Quick Actions */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold">Quick Actions</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => setShowMessage(true)}>
              <MessageSquare className="w-4 h-4 mr-2" />
              Send Message
            </Button>
            
            {status === 'active' && (
              <Button 
                variant="outline"
                onClick={() => pauseResumeMutation.mutate('pause')}
                disabled={pauseResumeMutation.isPending}
              >
                <Pause className="w-4 h-4 mr-2" />
                Pause Worker
              </Button>
            )}
            
            {status === 'paused' && (
              <Button 
                variant="outline"
                onClick={() => pauseResumeMutation.mutate('resume')}
                disabled={pauseResumeMutation.isPending}
              >
                <Play className="w-4 h-4 mr-2" />
                Resume Worker
              </Button>
            )}
          </CardContent>
        </Card>
      </main>

      <BossBottomNav currentPage="BossTeam" />

      <MessageDialog
        open={showMessage}
        onOpenChange={setShowMessage}
        recipient={worker}
        sender={currentUser}
        companyId={companyId}
      />
    </div>
  );
}