import React, { useState, useMemo } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import { format, formatDistanceToNow, subDays } from 'date-fns';
import { getCompanyId } from '@/components/utils/companyUtils';
import { 
  Loader2, 
  ChevronLeft, 
  ChevronDown,
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
  TrendingUp,
  AlertCircle,
  Edit,
  UserPlus
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import BossBottomNav from '../components/boss/BossBottomNav';
import MessageDialog from '../components/boss/MessageDialog';
import AddressCard from '../components/address/AddressCard';
import { toast } from 'sonner';

const statusConfig = {
  active: { color: 'bg-green-100 text-green-700', label: 'Active', dot: 'bg-green-500' },
  paused: { color: 'bg-amber-100 text-amber-700', label: 'Paused', dot: 'bg-amber-500' },
  offline: { color: 'bg-gray-100 text-gray-600', label: 'Offline', dot: 'bg-gray-400' }
};

const routeStatusColors = {
  active: 'bg-green-100 text-green-700',
  assigned: 'bg-purple-100 text-purple-700',
  ready: 'bg-blue-100 text-blue-700',
  draft: 'bg-gray-100 text-gray-600',
  completed: 'bg-gray-100 text-gray-500'
};

export default function WorkerDetail() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const urlParams = new URLSearchParams(window.location.search);
  const workerId = urlParams.get('id');
  const [showMessage, setShowMessage] = useState(false);
  const [expandedRoutes, setExpandedRoutes] = useState({});
  const [showCompleted, setShowCompleted] = useState(false);

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

  // Fetch all routes for this worker
  const { data: routes = [], isLoading: routesLoading } = useQuery({
    queryKey: ['workerAllRoutes', workerId],
    queryFn: async () => {
      const allRoutes = await base44.entities.Route.filter({
        worker_id: workerId,
        deleted_at: null
      });
      const order = { active: 0, assigned: 1, ready: 2, draft: 3, completed: 4 };
      return allRoutes.sort((a, b) => (order[a.status] ?? 5) - (order[b.status] ?? 5));
    },
    enabled: !!workerId,
    refetchInterval: 15000
  });

  const routeIds = useMemo(() => routes.map(r => r.id), [routes]);

  // Fetch addresses for ALL routes
  const { data: allAddresses = [] } = useQuery({
    queryKey: ['workerAllAddresses', routeIds, companyId],
    queryFn: async () => {
      if (routeIds.length === 0 || !companyId) return [];
      const addrs = await base44.entities.Address.filter({
        company_id: companyId,
        deleted_at: null
      });
      return addrs.filter(a => routeIds.includes(a.route_id));
    },
    enabled: routeIds.length > 0 && !!companyId,
    refetchInterval: 15000
  });

  // Fetch ALL attempts for this worker's routes
  const { data: allAttempts = [] } = useQuery({
    queryKey: ['workerAllAttempts', workerId, routeIds],
    queryFn: async () => {
      if (routeIds.length === 0) return [];
      const attempts = await base44.entities.Attempt.filter({
        server_id: workerId
      }, '-attempt_time');
      return attempts.filter(a => routeIds.includes(a.route_id));
    },
    enabled: routeIds.length > 0,
    refetchInterval: 15000
  });

  // Group addresses by route
  const addressesByRoute = useMemo(() => {
    const map = {};
    allAddresses.forEach(a => {
      if (!map[a.route_id]) map[a.route_id] = [];
      map[a.route_id].push(a);
    });
    Object.values(map).forEach(arr => 
      arr.sort((a, b) => (a.order_index || 0) - (b.order_index || 0))
    );
    return map;
  }, [allAddresses]);

  // Group attempts by address
  const attemptsByAddress = useMemo(() => {
    const map = {};
    allAttempts.forEach(a => {
      if (!map[a.address_id]) map[a.address_id] = [];
      map[a.address_id].push(a);
    });
    return map;
  }, [allAttempts]);

  const lastAttemptByAddress = useMemo(() => {
    const map = {};
    allAttempts.forEach(a => {
      if (!map[a.address_id]) map[a.address_id] = a;
    });
    return map;
  }, [allAttempts]);

  // Separate active/completed routes
  const activeRoutes = routes.filter(r => r.status !== 'completed');
  const completedRoutes = routes.filter(r => r.status === 'completed');

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

  const toggleRoute = (routeId) => {
    setExpandedRoutes(prev => ({
      ...prev,
      [routeId]: !prev[routeId]
    }));
  };

  if (isLoading || !worker) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
      </div>
    );
  }

  const status = worker.worker_status || 'offline';
  const config = statusConfig[status];

  // Today's stats
  const today = new Date().toISOString().split('T')[0];
  const servedAddresses = allAddresses.filter(a => a.served);
  const todayServed = servedAddresses.filter(a => a.served_at?.startsWith(today)).length;
  const todayRoutes = completedRoutes.filter(r => r.completed_at?.startsWith(today)).length;

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
        {/* Profile Card with Quick Actions */}
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

            {/* Quick Actions in Profile Card */}
            <div className="flex gap-2 mt-4 pt-4 border-t border-gray-100">
              <Button variant="outline" size="sm" onClick={() => setShowMessage(true)}>
                <MessageSquare className="w-4 h-4 mr-1" />
                Message
              </Button>
              {status === 'active' && (
                <Button 
                  variant="outline"
                  size="sm"
                  onClick={() => pauseResumeMutation.mutate('pause')}
                  disabled={pauseResumeMutation.isPending}
                >
                  <Pause className="w-4 h-4 mr-1" />
                  Pause
                </Button>
              )}
              {status === 'paused' && (
                <Button 
                  variant="outline"
                  size="sm"
                  onClick={() => pauseResumeMutation.mutate('resume')}
                  disabled={pauseResumeMutation.isPending}
                >
                  <Play className="w-4 h-4 mr-1" />
                  Resume
                </Button>
              )}
            </div>
          </CardContent>
        </Card>

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
                <p className="text-2xl font-bold text-gray-900">{activeRoutes.length}</p>
                <p className="text-xs text-gray-500">Active</p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Upcoming Time Off Banner */}
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

        {/* ROUTES SECTION */}
        <div className="mt-4">
          <h2 className="text-sm font-bold text-gray-700 tracking-wide mb-3 px-1">
            ACTIVE ROUTES ({activeRoutes.length})
          </h2>

          {activeRoutes.length === 0 ? (
            <Card className="mb-3">
              <CardContent className="p-6 text-center text-gray-500 text-sm">
                No active routes assigned
              </CardContent>
            </Card>
          ) : (
            activeRoutes.map(route => {
              const routeAddresses = addressesByRoute[route.id] || [];
              const served = routeAddresses.filter(a => a.served).length;
              const total = routeAddresses.length;
              const percent = total > 0 ? Math.round((served / total) * 100) : 0;
              const isExpanded = expandedRoutes[route.id];

              return (
                <Card key={route.id} className="mb-3 overflow-hidden">
                  {/* Route Header */}
                  <button
                    onClick={() => toggleRoute(route.id)}
                    className="w-full text-left p-4"
                  >
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <h3 className="font-bold text-base text-gray-900">
                          {route.folder_name}
                        </h3>
                        <Badge className={`text-[10px] ${routeStatusColors[route.status] || 'bg-gray-100 text-gray-600'}`}>
                          {route.status?.toUpperCase()}
                        </Badge>
                      </div>
                      <ChevronDown className={`w-5 h-5 text-gray-400 transition-transform ${
                        isExpanded ? 'rotate-180' : ''
                      }`} />
                    </div>

                    <Progress value={percent} className="h-2 mb-1" />
                    <div className="flex justify-between text-xs text-gray-500">
                      <span>{served}/{total} served</span>
                      <span>{percent}%</span>
                      {route.due_date && (
                        <span>Due: {format(new Date(route.due_date), 'MMM d')}</span>
                      )}
                    </div>
                  </button>

                  {/* Expanded Content */}
                  {isExpanded && (
                    <div className="border-t border-gray-100">
                      {/* Route-level actions */}
                      <div className="flex gap-2 px-4 py-3 bg-gray-50 border-b border-gray-100">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={(e) => {
                            e.stopPropagation();
                            navigate(createPageUrl(`RouteEditor?id=${route.id}`));
                          }}
                        >
                          <Edit className="w-3 h-3 mr-1" />
                          Edit Route
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={(e) => {
                            e.stopPropagation();
                            navigate(createPageUrl(`ReassignRoute?routeId=${route.id}`));
                          }}
                        >
                          <UserPlus className="w-3 h-3 mr-1" />
                          Reassign
                        </Button>
                      </div>

                      {/* Address Cards */}
                      <div className="p-4 space-y-4">
                        {routeAddresses.length === 0 ? (
                          <p className="text-sm text-gray-500 text-center py-4">No addresses in this route</p>
                        ) : (
                          routeAddresses.map((address, index) => (
                            <AddressCard
                              key={address.id}
                              address={address}
                              index={index}
                              routeId={route.id}
                              showActions={true}
                              isBossView={true}
                              lastAttempt={lastAttemptByAddress[address.id]}
                              allAttempts={attemptsByAddress[address.id] || []}
                            />
                          ))
                        )}
                      </div>
                    </div>
                  )}
                </Card>
              );
            })
          )}

          {/* Completed Routes Toggle */}
          {completedRoutes.length > 0 && (
            <>
              <button
                onClick={() => setShowCompleted(!showCompleted)}
                className="w-full text-center text-sm text-gray-500 py-2 hover:text-gray-700"
              >
                {showCompleted ? 'Hide' : 'Show'} Completed Routes ({completedRoutes.length})
              </button>

              {showCompleted && completedRoutes.map(route => {
                const routeAddresses = addressesByRoute[route.id] || [];
                const isExpanded = expandedRoutes[route.id];
                const served = routeAddresses.filter(a => a.served).length;
                const total = routeAddresses.length;

                return (
                  <Card key={route.id} className="mb-3 overflow-hidden opacity-60">
                    <button
                      onClick={() => toggleRoute(route.id)}
                      className="w-full text-left p-4"
                    >
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <h3 className="font-bold text-base text-gray-700">
                            {route.folder_name}
                          </h3>
                          <Badge className="text-[10px] bg-gray-100 text-gray-500">
                            COMPLETED
                          </Badge>
                        </div>
                        <ChevronDown className={`w-5 h-5 text-gray-400 transition-transform ${
                          isExpanded ? 'rotate-180' : ''
                        }`} />
                      </div>
                      <div className="text-xs text-gray-500">
                        {served}/{total} served • Completed {route.completed_at && format(new Date(route.completed_at), 'MMM d')}
                      </div>
                    </button>

                    {isExpanded && (
                      <div className="border-t border-gray-100 p-4 space-y-4">
                        {routeAddresses.map((address, index) => (
                          <AddressCard
                            key={address.id}
                            address={address}
                            index={index}
                            routeId={route.id}
                            showActions={false}
                            isBossView={true}
                            lastAttempt={lastAttemptByAddress[address.id]}
                            allAttempts={attemptsByAddress[address.id] || []}
                          />
                        ))}
                      </div>
                    )}
                  </Card>
                );
              })}
            </>
          )}
        </div>
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