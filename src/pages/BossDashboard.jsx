import React, { useState, useEffect, useCallback } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate } from 'react-router-dom';
import { BarChart3, Map, ScrollText } from 'lucide-react';
import { createPageUrl } from '@/utils';
import { getCompanyId } from '@/components/utils/companyUtils';
import { format } from 'date-fns';
import { 
  Loader2, 
  FileText, 
  Upload, 
  Plus, 
  ClipboardList,
  Package,
  RefreshCw,
  ArrowRightLeft,
  Settings,
  ChevronRight,
  Users,
  Pause,
  Play,
  Wand2,
  FileCheck,
  FileUp,
  Camera
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import BossBottomNav from '../components/boss/BossBottomNav';
import DashboardOverview from '../components/boss/dashboard/DashboardOverview';
import WorkerCard from '../components/boss/dashboard/WorkerCard';
import SmartAssignmentCard from '../components/boss/SmartAssignmentCard';
import WorkerLocationMap from '../components/boss/WorkerLocationMap';
import CapacityOverview from '../components/boss/CapacityOverview';
import RecentActivityFeed from '../components/boss/dashboard/RecentActivityFeed';
import NotificationBell from '../components/boss/NotificationBell';
import MessageDialog from '../components/boss/MessageDialog';
import AddressQuestionsCard from '../components/boss/AddressQuestionsCard';
import { generateSuggestions, autoAssignAllRoutes } from '../components/services/SmartAssignmentService';
import { buildAddressCountsMap } from '../components/services/MetricsService';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';

// Polling configuration
const POLLING_CONFIG = {
  active: 30000,     // 30 seconds when tab active
  background: 60000  // 60 seconds when tab hidden
};

export default function BossDashboard() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [refreshing, setRefreshing] = useState(false);
  const [messageRecipient, setMessageRecipient] = useState(null);
  const [isPollingActive, setIsPollingActive] = useState(true);
  const [isPaused, setIsPaused] = useState(false);
  const [lastUpdate, setLastUpdate] = useState(null);
  const [suggestions, setSuggestions] = useState({});
  const [autoAssigning, setAutoAssigning] = useState(false);
  
  const { data: user, isLoading: userLoading } = useQuery({
    queryKey: ['currentUser'],
    queryFn: () => base44.auth.me()
  });

  // Handle tab visibility for polling
  useEffect(() => {
    const handleVisibility = () => setIsPollingActive(!document.hidden);
    document.addEventListener('visibilitychange', handleVisibility);
    return () => document.removeEventListener('visibilitychange', handleVisibility);
  }, []);

  const companyId = getCompanyId(user);

  // Get all workers (servers) in company
  const { data: workers = [] } = useQuery({
    queryKey: ['companyWorkers', companyId],
    queryFn: async () => {
      if (!companyId) return [];
      const companyUsers = await base44.entities.User.filter({ company_id: companyId });
      return companyUsers.filter(u => u.role === 'server' || u.role === 'user');
    },
    enabled: !!companyId
  });

  // Get all routes
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

  // Get pending receipts count
  const { data: pendingReceipts = [] } = useQuery({
    queryKey: ['pendingReceipts', companyId],
    queryFn: async () => {
      if (!companyId) return [];
      return base44.entities.Receipt.filter({ company_id: companyId, status: 'pending_review' });
    },
    enabled: !!user
  });

  // Get all addresses for progress tracking
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

  // Get recent audit logs
  const { data: auditLogs = [] } = useQuery({
    queryKey: ['recentActivity', companyId],
    queryFn: async () => {
      if (!companyId) return [];
      const logs = await base44.entities.AuditLog.filter({
        company_id: companyId
      }, '-timestamp', 20);
      return logs;
    },
    enabled: !!user
  });

  // Get user settings for MapQuest API key
  const { data: userSettings } = useQuery({
    queryKey: ['userSettings', user?.id],
    queryFn: async () => {
      if (!user?.id) return null;
      const settings = await base44.entities.UserSettings.filter({ user_id: user.id });
      return settings[0] || null;
    },
    enabled: !!user?.id
  });

  // Auto-refresh polling
  useEffect(() => {
    if (isPaused) return;

    const interval = isPollingActive 
      ? POLLING_CONFIG.active 
      : POLLING_CONFIG.background;

    const pollTimer = setInterval(() => {
      queryClient.invalidateQueries({ queryKey: ['companyWorkers'] });
      queryClient.invalidateQueries({ queryKey: ['allRoutes'] });
      queryClient.invalidateQueries({ queryKey: ['allAddresses'] });
      queryClient.invalidateQueries({ queryKey: ['pendingReceipts'] });
      queryClient.invalidateQueries({ queryKey: ['recentActivity'] });
      setLastUpdate(new Date());
    }, interval);

    return () => clearInterval(pollTimer);
  }, [isPaused, isPollingActive, queryClient]);

  // Build address counts for capacity tracking
  const addressCounts = buildAddressCountsMap(workers, routes, addresses);

  // Load suggestions for unassigned routes
  const loadSuggestions = useCallback(async (routeId) => {
    const route = routes.find(r => r.id === routeId);
    if (!route) return;

    const routeSuggestions = await generateSuggestions(
      route, 
      workers, 
      addresses, 
      addressCounts
    );
    setSuggestions(prev => ({ ...prev, [routeId]: routeSuggestions }));
  }, [routes, workers, addresses, addressCounts]);

  // Pause/Resume worker mutation
  const pauseResumeMutation = useMutation({
    mutationFn: async ({ worker, action }) => {
      const newStatus = action === 'pause' ? 'paused' : 'active';
      await base44.entities.User.update(worker.id, {
        worker_status: newStatus
      });

      // Create audit log
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

      // Notify worker
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
      queryClient.invalidateQueries({ queryKey: ['recentActivity'] });
    },
    onError: (error) => {
      toast.error(error.message || 'Failed to update worker status');
    }
  });

  // Assign route mutation
  const assignRouteMutation = useMutation({
    mutationFn: async ({ routeId, workerId }) => {
      const worker = workers.find(w => w.id === workerId);
      const route = routes.find(r => r.id === routeId);

      await base44.entities.Route.update(routeId, {
        worker_id: workerId,
        status: 'assigned',
        assigned_at: new Date().toISOString(),
        assigned_by: user.id
      });

      // Update worker's current route
      await base44.entities.User.update(workerId, {
        current_route_id: routeId,
        worker_status: 'active',
        last_active_at: new Date().toISOString()
      });

      // Notify worker
      await base44.entities.Notification.create({
        user_id: workerId,
        company_id: companyId,
        recipient_role: 'server',
        type: 'route_assigned',
        title: 'New Route Assigned',
        body: `${route.folder_name}: ${route.total_addresses || 0} addresses`,
        data: { route_id: routeId },
        action_url: `/WorkerRouteDetail?routeId=${routeId}`,
        priority: 'normal'
      });

      // Audit log
      await base44.entities.AuditLog.create({
        company_id: companyId,
        action_type: 'route_assigned',
        actor_id: user.id,
        actor_role: 'boss',
        target_type: 'route',
        target_id: routeId,
        details: { 
          route_name: route.folder_name,
          worker_name: worker?.full_name,
          worker_id: workerId
        },
        timestamp: new Date().toISOString()
      });
    },
    onSuccess: () => {
      toast.success('Route assigned');
      queryClient.invalidateQueries({ queryKey: ['allRoutes'] });
      queryClient.invalidateQueries({ queryKey: ['companyWorkers'] });
      queryClient.invalidateQueries({ queryKey: ['recentActivity'] });
    },
    onError: (error) => {
      toast.error(error.message || 'Failed to assign route');
    }
  });

  const handleRefresh = async () => {
    setRefreshing(true);
    await queryClient.invalidateQueries();
    setLastUpdate(new Date());
    setTimeout(() => setRefreshing(false), 500);
  };

  // Auto-assign all unassigned routes
  const handleAutoAssignAll = async () => {
    if (unassignedRoutes.length === 0) return;
    
    setAutoAssigning(true);
    try {
      const results = await autoAssignAllRoutes(
        unassignedRoutes,
        workers,
        addresses,
        { ...addressCounts },
        user.id,
        companyId
      );

      const successCount = results.filter(r => r.success).length;
      const failCount = results.filter(r => !r.success).length;

      if (successCount > 0) {
        toast.success(`Assigned ${successCount} routes`);
      }
      if (failCount > 0) {
        toast.error(`${failCount} routes could not be assigned`);
      }

      queryClient.invalidateQueries({ queryKey: ['allRoutes'] });
      queryClient.invalidateQueries({ queryKey: ['companyWorkers'] });
    } catch (error) {
      toast.error('Auto-assign failed');
    } finally {
      setAutoAssigning(false);
    }
  };

  if (userLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
      </div>
    );
  }

  // Calculate dashboard stats
  const today = new Date().toISOString().split('T')[0];
  const todayRoutes = routes.filter(r => 
    r.created_date?.startsWith(today) || r.started_at?.startsWith(today)
  );
  const completedRoutes = routes.filter(r => r.status === 'completed');
  const todayCompletedRoutes = completedRoutes.filter(r => 
    r.completed_at?.startsWith(today)
  );
  const activeWorkers = workers.filter(w => w.worker_status === 'active');
  const servedAddresses = addresses.filter(a => a.served);
  const todayServedAddresses = servedAddresses.filter(a => 
    a.served_at?.startsWith(today)
  );

  // Calculate on-time rate (routes completed before due date)
  const routesWithDueDate = completedRoutes.filter(r => r.due_date);
  const onTimeRoutes = routesWithDueDate.filter(r => 
    r.completed_at && new Date(r.completed_at) <= new Date(r.due_date)
  );
  const onTimeRate = routesWithDueDate.length > 0 
    ? Math.round((onTimeRoutes.length / routesWithDueDate.length) * 100)
    : 100;

  const dashboardStats = {
    totalRoutes: routes.length,
    completedRoutes: todayCompletedRoutes.length,
    totalAddresses: addresses.length,
    servedAddresses: todayServedAddresses.length,
    activeWorkers: activeWorkers.length,
    totalWorkers: workers.length,
    onTimeRate
  };

  // Get unassigned routes (ready but no worker)
  const unassignedRoutes = routes.filter(r => 
    r.status === 'ready' && !r.worker_id
  );

  // Load suggestions when unassigned routes change
  useEffect(() => {
    unassignedRoutes.forEach(route => {
      if (!suggestions[route.id]) {
        loadSuggestions(route.id);
      }
    });
  }, [unassignedRoutes.length]);

  // Get worker progress data
  const getWorkerProgress = (worker) => {
    const workerRoute = routes.find(r => 
      r.worker_id === worker.id && 
      ['assigned', 'active'].includes(r.status)
    );
    if (!workerRoute) return null;

    const routeAddresses = addresses.filter(a => a.route_id === workerRoute.id);
    const served = routeAddresses.filter(a => a.served).length;
    return {
      total: routeAddresses.length || workerRoute.total_addresses || 0,
      served
    };
  };

  const getWorkerRoute = (worker) => {
    return routes.find(r => 
      r.worker_id === worker.id && 
      ['assigned', 'active'].includes(r.status)
    );
  };

  const firstName = user?.full_name?.split(' ')[0] || 'Boss';
  const todayDate = format(new Date(), 'EEEE, MMMM d');

  return (
    <div className="min-h-screen bg-gray-50 pb-20">
      {/* Header */}
      <header className="bg-blue-500 text-white px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <FileText className="w-6 h-6" />
          <span className="font-bold text-lg">ServeRoute</span>
          <span className="text-xs bg-white/20 px-2 py-0.5 rounded-full">Boss</span>
        </div>
        <div className="flex items-center gap-2">
          <NotificationBell userId={user?.id} />
          <Link to={createPageUrl('BossSettings')}>
            <Button variant="ghost" size="icon" className="text-white hover:bg-blue-600">
              <Settings className="w-5 h-5" />
            </Button>
          </Link>
        </div>
      </header>

      <main className="px-4 py-6 max-w-5xl mx-auto">
        {/* Welcome + Actions */}
        <div className="flex items-start justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Welcome back, {firstName}</h1>
            <p className="text-gray-500">{todayDate}</p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            {/* Auto-refresh status */}
            <div className="flex items-center gap-1 text-xs text-gray-500">
              <span className={`w-2 h-2 rounded-full ${isPaused ? 'bg-yellow-500' : isPollingActive ? 'bg-green-500 animate-pulse' : 'bg-gray-400'}`} />
              <span className="hidden sm:inline">
                {isPaused ? 'Paused' : isPollingActive ? 'Live' : 'Background'}
              </span>
              {lastUpdate && (
                <span className="hidden md:inline ml-1">
                  {format(lastUpdate, 'h:mm:ss a')}
                </span>
              )}
            </div>
            <Button 
              variant="ghost" 
              size="sm"
              onClick={() => setIsPaused(!isPaused)}
              className="h-8 px-2"
            >
              {isPaused ? <Play className="w-4 h-4" /> : <Pause className="w-4 h-4" />}
            </Button>
            <Button 
              variant="outline" 
              size="sm"
              onClick={handleRefresh}
              disabled={refreshing}
            >
              <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
            </Button>

          </div>
        </div>

        {/* Overview Stats */}
        <div className="mb-6">
          <h2 className="text-sm font-semibold text-gray-600 mb-3">TODAY'S OVERVIEW</h2>
          <DashboardOverview stats={dashboardStats} />
        </div>

        {/* Address Questions Alert */}
        <AddressQuestionsCard companyId={companyId} />

        {/* Active Workers */}
        <Card className="mb-6">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base">Active Workers</CardTitle>
              <Link to={createPageUrl('BossWorkers')}>
                <Button variant="ghost" size="sm" className="text-blue-600">
                  View All <ChevronRight className="w-4 h-4 ml-1" />
                </Button>
              </Link>
            </div>
          </CardHeader>
          <CardContent>
            {workers.length === 0 ? (
              <div className="text-center py-8">
                <Users className="w-10 h-10 text-gray-300 mx-auto mb-2" />
                <p className="text-gray-500 text-sm">No workers in your team yet</p>
                <Link to={createPageUrl('BossTeam')}>
                  <Button variant="link" size="sm">Invite workers</Button>
                </Link>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {workers.slice(0, 6).map((worker) => (
                  <WorkerCard
                    key={worker.id}
                    worker={worker}
                    route={getWorkerRoute(worker)}
                    progress={getWorkerProgress(worker)}
                    onMessage={(w) => setMessageRecipient(w)}
                    onPauseResume={(w, action) => pauseResumeMutation.mutate({ worker: w, action })}
                    onAssign={(w) => navigate(createPageUrl('BossRoutes'))}
                  />
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Unassigned Routes with Smart Assignment */}
        {unassignedRoutes.length > 0 && (
          <Card className="mb-6">
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base">Unassigned Routes ({unassignedRoutes.length})</CardTitle>
                <div className="flex items-center gap-2">
                  <Button 
                    variant="outline" 
                    size="sm"
                    onClick={handleAutoAssignAll}
                    disabled={autoAssigning}
                    className="text-green-600 border-green-200 hover:bg-green-50"
                  >
                    <Wand2 className={`w-4 h-4 mr-1 ${autoAssigning ? 'animate-spin' : ''}`} />
                    Auto-Assign All
                  </Button>
                  <Link to={createPageUrl('BossRoutes')}>
                    <Button variant="ghost" size="sm" className="text-blue-600">
                      View All <ChevronRight className="w-4 h-4 ml-1" />
                    </Button>
                  </Link>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              {unassignedRoutes.slice(0, 3).map((route) => (
                <SmartAssignmentCard
                  key={route.id}
                  route={route}
                  suggestions={suggestions[route.id] || []}
                  isLoading={!suggestions[route.id]}
                  onAssign={(routeId, workerId) => {
                    assignRouteMutation.mutate({ routeId, workerId });
                    setSuggestions(prev => {
                      const copy = { ...prev };
                      delete copy[routeId];
                      return copy;
                    });
                  }}
                />
              ))}
            </CardContent>
          </Card>
        )}

        {/* Worker Location & Capacity Row */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
          <WorkerLocationMap 
            workers={workers} 
            mapquestApiKey={userSettings?.mapquest_api_key}
          />
          <CapacityOverview 
            workers={workers} 
            addressCounts={addressCounts}
          />
        </div>

        {/* Recent Activity */}
        <RecentActivityFeed activities={auditLogs} />

        {/* Quick Actions */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-6">
          <Link to={createPageUrl('ScanDocumentType')}>
            <Button variant="outline" className="w-full h-14 justify-start gap-3">
              <Camera className="w-5 h-5 text-indigo-600" />
              <span>Scan Docs</span>
            </Button>
          </Link>
          <Link to={createPageUrl('ReceiptQueue')}>
            <Button variant="outline" className="w-full h-14 justify-start gap-3 relative">
              <FileCheck className="w-5 h-5 text-green-600" />
              <span>Receipts</span>
              {pendingReceipts.length > 0 && (
                <Badge className="absolute top-1 right-1 bg-orange-500 text-white text-xs px-1.5">
                  {pendingReceipts.length}
                </Badge>
              )}
            </Button>
          </Link>
          <Link to={createPageUrl('DCNUpload')}>
            <Button variant="outline" className="w-full h-14 justify-start gap-3">
              <FileUp className="w-5 h-5 text-purple-600" />
              <span>DCN Upload</span>
            </Button>
          </Link>
          <Link to={createPageUrl('AddressPool')}>
            <Button variant="outline" className="w-full h-14 justify-start gap-3">
              <Package className="w-5 h-5 text-blue-600" />
              <span>Address Pool</span>
            </Button>
          </Link>
        </div>

        {/* Phase 6: Analytics & Reports */}
        <div className="grid grid-cols-3 gap-3 mt-4">
          <Link to={createPageUrl('Analytics')}>
            <Button variant="outline" className="w-full h-12 justify-start gap-2">
              <BarChart3 className="w-5 h-5 text-orange-500" />
              <span className="text-sm">Analytics</span>
            </Button>
          </Link>
          <Link to={createPageUrl('WorkerMap')}>
            <Button variant="outline" className="w-full h-12 justify-start gap-2">
              <Map className="w-5 h-5 text-green-500" />
              <span className="text-sm">Worker Map</span>
            </Button>
          </Link>
          <Link to={createPageUrl('ActivityLog')}>
            <Button variant="outline" className="w-full h-12 justify-start gap-2">
              <ScrollText className="w-5 h-5 text-blue-500" />
              <span className="text-sm">Activity</span>
            </Button>
          </Link>
        </div>
      </main>

      <BossBottomNav currentPage="BossDashboard" />

      {/* Message Dialog */}
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