import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import { format, formatDistanceToNow } from 'date-fns';
import { getCompanyId } from '@/components/utils/companyUtils';
import { 
  Loader2, 
  ChevronLeft, 
  Search,
  User,
  MapPin,
  Clock,
  MessageSquare,
  Pause,
  Play,
  UserPlus,
  MoreVertical,
  RefreshCw
} from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import BossBottomNav from '../components/boss/BossBottomNav';
import MessageDialog from '../components/boss/MessageDialog';
import { toast } from 'sonner';
import { WorkerSkeleton } from '@/components/ui/skeletons';
import EmptyState from '@/components/ui/empty-state';

const statusConfig = {
  active: { color: 'bg-green-100 text-green-700', label: 'Active' },
  paused: { color: 'bg-amber-100 text-amber-700', label: 'Paused' },
  offline: { color: 'bg-gray-100 text-gray-600', label: 'Offline' }
};

export default function BossWorkers() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [messageRecipient, setMessageRecipient] = useState(null);

  const { data: user, isLoading: userLoading } = useQuery({
    queryKey: ['currentUser'],
    queryFn: () => base44.auth.me()
  });

  const companyId = user?.company_id || 'default';

  const { data: workers = [], isLoading: workersLoading } = useQuery({
    queryKey: ['companyWorkers', companyId],
    queryFn: async () => {
      if (!companyId) return [];
      const users = await base44.entities.User.list();
      return users.filter(u => 
        u.company_id === companyId && 
        (u.role === 'server' || u.role === 'user')
      );
    },
    enabled: !!user
  });

  const { data: routes = [] } = useQuery({
    queryKey: ['allRoutes', companyId],
    queryFn: async () => {
      return base44.entities.Route.filter({
        company_id: companyId,
        deleted_at: null
      });
    },
    enabled: !!user
  });

  const { data: addresses = [] } = useQuery({
    queryKey: ['allAddresses', companyId],
    queryFn: async () => {
      return base44.entities.Address.filter({
        company_id: companyId,
        deleted_at: null
      });
    },
    enabled: !!user
  });

  const pauseResumeMutation = useMutation({
    mutationFn: async ({ worker, action }) => {
      const newStatus = action === 'pause' ? 'paused' : 'active';
      await base44.entities.User.update(worker.id, {
        worker_status: newStatus
      });

      await base44.entities.AuditLog.create({
        company_id: companyId,
        action_type: action === 'pause' ? 'worker_paused' : 'worker_resumed',
        actor_id: user.id,
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
    onSuccess: (_, { action }) => {
      toast.success(action === 'pause' ? 'Worker paused' : 'Worker resumed');
      queryClient.invalidateQueries({ queryKey: ['companyWorkers'] });
    },
    onError: (error) => {
      toast.error(error.message || 'Failed to update worker status');
    }
  });

  if (userLoading || workersLoading) {
    return (
      <div className="min-h-screen bg-gray-50 pb-20">
        <header className="bg-blue-500 text-white px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Link to={createPageUrl('BossDashboard')}>
              <ChevronLeft className="w-6 h-6" />
            </Link>
            <span className="font-bold text-lg">Workers</span>
          </div>
        </header>
        <main className="px-4 py-6 max-w-4xl mx-auto">
          <div className="space-y-3">
            {[1, 2, 3].map(i => <WorkerSkeleton key={i} />)}
          </div>
        </main>
        <BossBottomNav currentPage="BossTeam" />
      </div>
    );
  }

  // Get worker stats
  const getWorkerStats = (worker) => {
    const workerRoutes = routes.filter(r => r.worker_id === worker.id);
    const activeRoute = workerRoutes.find(r => ['assigned', 'active'].includes(r.status));
    const completedRoutes = workerRoutes.filter(r => r.status === 'completed');
    
    let todayServed = 0;
    let routeProgress = null;
    
    if (activeRoute) {
      const routeAddresses = addresses.filter(a => a.route_id === activeRoute.id);
      const served = routeAddresses.filter(a => a.served).length;
      routeProgress = {
        route: activeRoute,
        served,
        total: routeAddresses.length || activeRoute.total_addresses || 0
      };
    }

    const today = new Date().toISOString().split('T')[0];
    const todayAddresses = addresses.filter(a => 
      a.served && 
      a.served_at?.startsWith(today) &&
      workerRoutes.some(r => r.id === a.route_id)
    );
    todayServed = todayAddresses.length;

    return {
      activeRoute,
      routeProgress,
      todayServed,
      totalCompleted: worker.total_addresses_completed || 0,
      avgTime: worker.avg_completion_time_minutes || 0,
      completedRoutes: completedRoutes.length
    };
  };

  // Filter workers
  const filteredWorkers = workers.filter(worker => {
    const matchesSearch = !search || 
      worker.full_name?.toLowerCase().includes(search.toLowerCase()) ||
      worker.email?.toLowerCase().includes(search.toLowerCase());
    
    const status = worker.worker_status || 'offline';
    const matchesStatus = statusFilter === 'all' || status === statusFilter;
    
    return matchesSearch && matchesStatus;
  });

  return (
    <div className="min-h-screen bg-gray-50 pb-20">
      {/* Header */}
      <header className="bg-blue-500 text-white px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Link to={createPageUrl('BossDashboard')}>
            <ChevronLeft className="w-6 h-6" />
          </Link>
          <span className="font-bold text-lg">Workers</span>
        </div>
        <Link to={createPageUrl('BossTeam')}>
          <Button variant="ghost" size="sm" className="text-white hover:bg-blue-600">
            <UserPlus className="w-4 h-4 mr-1" />
            Invite
          </Button>
        </Link>
      </header>

      <main className="px-4 py-6 max-w-4xl mx-auto">
        {/* Search & Filter */}
        <div className="flex gap-2 mb-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <Input
              placeholder="Search workers..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-10"
            />
          </div>
          <div className="flex gap-1">
            {['all', 'active', 'paused', 'offline'].map((status) => (
              <Button
                key={status}
                variant={statusFilter === status ? 'default' : 'outline'}
                size="sm"
                onClick={() => setStatusFilter(status)}
                className="capitalize"
              >
                {status}
              </Button>
            ))}
          </div>
        </div>

        {/* Workers List */}
        {filteredWorkers.length === 0 ? (
          <EmptyState 
            type="workers"
            title={search ? 'No workers found' : 'No workers yet'}
            description={search 
              ? 'Try adjusting your search or filters.'
              : 'Invite workers to join your team.'
            }
            actionLabel="Invite Worker"
            onAction={() => navigate(createPageUrl('BossTeam'))}
          />
        ) : (
          <div className="space-y-3">
            {filteredWorkers.map((worker) => {
              const status = worker.worker_status || 'offline';
              const config = statusConfig[status];
              const stats = getWorkerStats(worker);

              return (
                <Card key={worker.id} className="bg-white">
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between">
                      <div className="flex items-start gap-3">
                        <div className="w-12 h-12 bg-gray-100 rounded-full flex items-center justify-center">
                          <User className="w-6 h-6 text-gray-600" />
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <h3 className="font-semibold text-gray-900">{worker.full_name}</h3>
                            <Badge className={config.color}>{config.label}</Badge>
                          </div>
                          <p className="text-sm text-gray-500">{worker.email}</p>
                          {worker.last_active_at && (
                            <p className="text-xs text-gray-400 mt-1">
                              Last active: {formatDistanceToNow(new Date(worker.last_active_at), { addSuffix: true })}
                            </p>
                          )}
                        </div>
                      </div>

                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon">
                            <MoreVertical className="w-4 h-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => navigate(createPageUrl(`WorkerDetail?id=${worker.id}`))}>
                            View Details
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => setMessageRecipient(worker)}>
                            Send Message
                          </DropdownMenuItem>
                          {status === 'active' && (
                            <DropdownMenuItem onClick={() => pauseResumeMutation.mutate({ worker, action: 'pause' })}>
                              Pause Worker
                            </DropdownMenuItem>
                          )}
                          {status === 'paused' && (
                            <DropdownMenuItem onClick={() => pauseResumeMutation.mutate({ worker, action: 'resume' })}>
                              Resume Worker
                            </DropdownMenuItem>
                          )}
                          {stats.activeRoute && (
                            <DropdownMenuItem onClick={() => navigate(createPageUrl(`ReassignRoute?routeId=${stats.activeRoute.id}`))}>
                              Reassign Route
                            </DropdownMenuItem>
                          )}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>

                    {/* Stats Row */}
                    <div className="mt-3 pt-3 border-t grid grid-cols-3 gap-4 text-center">
                      <div>
                        <p className="text-lg font-semibold text-gray-900">{stats.todayServed}</p>
                        <p className="text-xs text-gray-500">Today</p>
                      </div>
                      <div>
                        <p className="text-lg font-semibold text-gray-900">{stats.avgTime || '-'}</p>
                        <p className="text-xs text-gray-500">Avg min/addr</p>
                      </div>
                      <div>
                        <p className="text-lg font-semibold text-gray-900">{stats.completedRoutes}</p>
                        <p className="text-xs text-gray-500">Routes done</p>
                      </div>
                    </div>

                    {/* Active Route Progress */}
                    {stats.routeProgress && (
                      <div className="mt-3 pt-3 border-t">
                        <div className="flex items-center gap-2 text-sm text-gray-600 mb-2">
                          <MapPin className="w-4 h-4" />
                          <span className="font-medium">{stats.routeProgress.route.folder_name}</span>
                          {stats.routeProgress.route.due_date && (
                            <span className="text-gray-400">
                              Due: {format(new Date(stats.routeProgress.route.due_date), 'MMM d')}
                            </span>
                          )}
                        </div>
                        <Progress 
                          value={stats.routeProgress.total > 0 
                            ? (stats.routeProgress.served / stats.routeProgress.total) * 100 
                            : 0
                          } 
                          className="h-2 mb-1" 
                        />
                        <p className="text-xs text-gray-500">
                          {stats.routeProgress.served}/{stats.routeProgress.total} addresses
                        </p>
                      </div>
                    )}

                    {/* Quick Actions */}
                    <div className="mt-3 pt-3 border-t flex gap-2">
                      <Button 
                        variant="outline" 
                        size="sm"
                        onClick={() => navigate(createPageUrl(`WorkerDetail?id=${worker.id}`))}
                      >
                        View
                      </Button>
                      <Button 
                        variant="outline" 
                        size="sm"
                        onClick={() => setMessageRecipient(worker)}
                      >
                        <MessageSquare className="w-3 h-3 mr-1" />
                        Message
                      </Button>
                      {status === 'active' && (
                        <Button 
                          variant="outline" 
                          size="sm"
                          onClick={() => pauseResumeMutation.mutate({ worker, action: 'pause' })}
                        >
                          <Pause className="w-3 h-3 mr-1" />
                          Pause
                        </Button>
                      )}
                      {status === 'paused' && (
                        <Button 
                          variant="outline" 
                          size="sm"
                          onClick={() => pauseResumeMutation.mutate({ worker, action: 'resume' })}
                        >
                          <Play className="w-3 h-3 mr-1" />
                          Resume
                        </Button>
                      )}
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </main>

      <BossBottomNav currentPage="BossTeam" />

      <MessageDialog
        open={!!messageRecipient}
        onOpenChange={(open) => !open && setMessageRecipient(null)}
        recipient={messageRecipient}
        sender={user}
        companyId={companyId}
      />
    </div>
  );
}