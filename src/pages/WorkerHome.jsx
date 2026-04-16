import React, { useState, useEffect, useCallback } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCurrentUser } from '@/components/hooks/useCurrentUser';
import { useUserSettings } from '@/components/hooks/useUserSettings';
import { useNavigate } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import { format } from 'date-fns';
import Header from '../components/layout/Header';
import BottomNav from '../components/layout/BottomNav';
import WorkPhaseBlocks from '../components/home/WorkPhaseBlocks';
import StatBoxes from '../components/home/StatBoxes';
import ActiveRoutesList from '../components/home/ActiveRoutesList.jsx';
import LocationTracker from '../components/worker/LocationTracker';
import AddressSearch from '../components/common/AddressSearch';
import ComboRouteCard from '../components/common/ComboRouteCard';
import { Loader2, Shuffle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';

import { RouteSkeleton, StatSkeleton } from '@/components/ui/skeletons';
import EmptyState from '@/components/ui/empty-state';

function getCurrentPhase(timezone = 'America/Detroit') {
  const now = new Date();
  const options = { timeZone: timezone, hour: 'numeric', hour12: false };
  const hour = parseInt(new Intl.DateTimeFormat('en-US', options).format(now));
  const dayOptions = { timeZone: timezone, weekday: 'short' };
  const day = new Intl.DateTimeFormat('en-US', dayOptions).format(now);
  
  const isWeekend = day === 'Sat' || day === 'Sun';
  
  if (isWeekend) {
    if (hour >= 8 && hour < 12) return ['am', 'weekend'];
    if (hour >= 17 && hour < 21) return ['pm', 'weekend'];
    if (hour >= 12 && hour < 17) return ['weekend'];
    return 'ntc';
  }
  
  if (hour >= 8 && hour < 12) return 'am';
  if (hour >= 17 && hour < 21) return 'pm';
  return 'ntc';
}

export default function WorkerHome() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [currentPhase, setCurrentPhase] = useState('ntc');

  const { data: user, isLoading: userLoading } = useCurrentUser();

  // Set worker status to active when page loads
  useEffect(() => {
    if (!user?.id) return;

    const setActive = async () => {
      if (user.worker_status !== 'active') {
        await base44.auth.updateMe({
          worker_status: 'active',
          last_active_at: new Date().toISOString()
        });
        queryClient.refetchQueries({ queryKey: ['currentUser'] });
      }
    };

    setActive();

    const handleVisibilityChange = () => {
      if (!document.hidden) setActive();
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);

    const heartbeat = setInterval(() => {
      base44.auth.updateMe({ last_active_at: new Date().toISOString() });
    }, 2 * 60 * 1000);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      clearInterval(heartbeat);
    };
  }, [user?.id, user?.worker_status, queryClient]);

  const { data: routes = [], isLoading: routesLoading } = useQuery({
    queryKey: ['workerRoutes', user?.id],
    queryFn: async () => {
      if (!user?.id) return [];
      return base44.entities.Route.filter({ 
        worker_id: user.id,
        deleted_at: null 
      });
    },
    enabled: !!user?.id,
    staleTime: 2 * 60 * 1000,
    gcTime: 24 * 60 * 60 * 1000,
    refetchInterval: 30000
  });

  const routeIds = routes.map(r => r.id).sort().join(',');

  const { data: addresses = [] } = useQuery({
    queryKey: ['workerAddresses', user?.id, routeIds],
    queryFn: async () => {
      if (routes.length === 0) return [];
      const results = await Promise.all(
        routes.map(r => base44.entities.Address.filter({ route_id: r.id, deleted_at: null }))
      );
      return results.flat();
    },
    enabled: routes.length > 0,
    staleTime: 2 * 60 * 1000,
    gcTime: 24 * 60 * 60 * 1000,
  });

  const { data: notifications = [] } = useQuery({
    queryKey: ['notifications', user?.id],
    queryFn: async () => {
      if (!user?.id) return [];
      return base44.entities.Notification.filter({ user_id: user.id, read: false });
    },
    enabled: !!user?.id,
    staleTime: 60 * 1000,
    gcTime: 24 * 60 * 60 * 1000,
    refetchInterval: 30000
  });

  const { data: allAttempts = [] } = useQuery({
    queryKey: ['workerAttemptsHome', user?.id, routeIds],
    queryFn: async () => {
      if (!user?.id || routes.length === 0) return [];
      const results = await Promise.all(
        routes.filter(r => r.status !== 'archived').map(r =>
          base44.entities.Attempt.filter({ route_id: r.id })
        )
      );
      return results.flat();
    },
    enabled: !!user?.id && routes.length > 0,
    staleTime: 2 * 60 * 1000
  });

  const { data: activeComboRoutes = [] } = useQuery({
    queryKey: ['activeComboRoutes', user?.id],
    queryFn: async () => {
      if (!user?.id) return [];
      return base44.entities.ComboRoute.filter({ user_id: user.id, status: 'active' });
    },
    enabled: !!user?.id,
    staleTime: 60 * 1000
  });

  // Pull all addresses across ALL routes (including archived/completed) for the
  // current-period served count — once a route gets archived after Turn In, its
  // addresses still need to count toward this period's served total until the
  // next Turn In stamps them.
  const allRouteIds = routes.map(r => r.id).sort().join(',');
  const { data: allWorkerAddresses = [] } = useQuery({
    queryKey: ['allWorkerAddressesHome', user?.id, allRouteIds],
    queryFn: async () => {
      if (!user?.id || routes.length === 0) return [];
      const routeIdList = routes.map(r => r.id);
      const all = await base44.entities.Address.filter({ deleted_at: null });
      return all.filter(a => routeIdList.includes(a.route_id));
    },
    enabled: !!user?.id && routes.length > 0,
    staleTime: 2 * 60 * 1000
  });

  const { data: payrollHistoryHome = [] } = useQuery({
    queryKey: ['payrollHistory', user?.id],
    queryFn: async () => {
      if (!user?.id) return [];
      const records = await base44.entities.PayrollRecord.filter({ user_id: user.id });
      return records.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    },
    enabled: !!user?.id,
    staleTime: 5 * 60 * 1000
  });

  const { data: userSettings } = useUserSettings(user?.id);

  useEffect(() => {
    const timezone = user?.settings?.timezone || 'America/Detroit';
    setCurrentPhase(getCurrentPhase(timezone));
    const interval = setInterval(() => setCurrentPhase(getCurrentPhase(timezone)), 60000);
    return () => clearInterval(interval);
  }, [user]);

  const handleArchiveRoute = useCallback(async (route) => {
    const confirmed = window.confirm(`Archive "${route.folder_name}"?\n\nYou can unarchive it anytime from the Routes page.`);
    if (!confirmed) return;
    try {
      await base44.entities.Route.update(route.id, {
        pre_archive_status: route.status,
        status: 'archived',
        archived_at: new Date().toISOString()
      });
      queryClient.refetchQueries({ queryKey: ['workerRoutes', user?.id] });
      toast.success(`"${route.folder_name}" archived`);
    } catch (e) {
      toast.error('Failed to archive route');
    }
  }, [user?.id, queryClient]);

  const handleDeleteRoute = useCallback(async (route) => {
    const confirmed = window.confirm(`Delete "${route.folder_name}"?\n\nThis will remove the route and all its addresses. This cannot be undone.`);
    if (!confirmed) return;
    try {
      await base44.entities.Route.update(route.id, { deleted_at: new Date().toISOString(), status: 'deleted' });
      const routeAddresses = await base44.entities.Address.filter({ route_id: route.id, deleted_at: null });
      for (const addr of routeAddresses) {
        await base44.entities.Address.update(addr.id, { deleted_at: new Date().toISOString() });
      }
      queryClient.refetchQueries({ queryKey: ['workerRoutes', user?.id] });
      toast.success(`"${route.folder_name}" deleted`);
    } catch (e) {
      toast.error('Failed to delete route');
    }
  }, [user?.id, queryClient]);

  if (userLoading || !user) {
    return (
      <div className="min-h-screen bg-transparent pb-20">
        <div className="bg-blue-500 h-14" />
        <main className="px-4 py-3 max-w-lg mx-auto">
          <div className="animate-pulse mb-6">
            <div className="h-8 bg-gray-200 rounded w-3/4 mb-2" />
            <div className="h-4 bg-gray-200 rounded w-1/2" />
          </div>
          <div className="grid grid-cols-2 gap-3 mb-6">
            {[1, 2, 3, 4].map(i => <StatSkeleton key={i} />)}
          </div>
          <div className="space-y-3">
            {[1, 2].map(i => <RouteSkeleton key={i} />)}
          </div>
        </main>
        <BottomNav currentPage="WorkerHome" />
      </div>
    );
  }

  const activeRoutes = routes.filter(r => r.status === 'active' || r.status === 'assigned' || r.status === 'ready');
  const activeRouteIds = activeRoutes.map(r => r.id);
  const activeAddresses = addresses.filter(a => activeRouteIds.includes(a.route_id));
  const pendingAddresses = activeAddresses.filter(a => !a.served);

  // Current-period served count — mirrors the Served tab in WorkerPayout.
  // An address counts as "this period" if it is unstamped (or ghost-stamped) AND
  // its served_at is after the most recent Turn In press. If no Turn In has ever
  // happened, every unstamped served item counts.
  const lastRecordHome = payrollHistoryHome[0];
  const lastTurnInAtHome = lastRecordHome?.turn_in_date ? new Date(lastRecordHome.turn_in_date) : null;
  const validRecordIdsHome = new Set(payrollHistoryHome.map(r => r.id));

  const servedAddresses = allWorkerAddresses.filter(a => {
    if (!a.served || !a.served_at) return false;
    if (a.status === 'returned') return false;
    if (!['serve', 'posting', 'garnishment'].includes(a.serve_type)) return false;
    const stamped = a.payroll_record_id && a.payroll_record_id !== '' && validRecordIdsHome.has(a.payroll_record_id);
    if (stamped) return false;
    if (!lastTurnInAtHome) return true;
    return new Date(a.served_at) > lastTurnInAtHome;
  });

  const selectedDay = userSettings?.payroll_turn_in_day ?? 3;
  const now = new Date();
  const currentDayOfWeek = now.getDay();
  let daysUntilPayroll = (selectedDay - currentDayOfWeek + 7) % 7;
  if (daysUntilPayroll === 0) daysUntilPayroll = 7;
  const nextPayrollDate = new Date(now);
  nextPayrollDate.setDate(nextPayrollDate.getDate() + daysUntilPayroll);
  nextPayrollDate.setHours(23, 59, 59, 999);

  const dueSoonRoutes = activeRoutes.filter(r => {
    let effectiveDueDate = null;
    if (r.first_attempt_date) {
      const spreadDays = r.minimum_days_spread || (r.spread_type === '10' ? 10 : 14);
      effectiveDueDate = new Date(r.first_attempt_date);
      effectiveDueDate.setDate(effectiveDueDate.getDate() + spreadDays);
      effectiveDueDate.setHours(0, 0, 0, 0);
    } else if (r.spread_due_date) {
      effectiveDueDate = new Date(r.spread_due_date);
      effectiveDueDate.setHours(0, 0, 0, 0);
    } else if (r.due_date) {
      effectiveDueDate = new Date(r.due_date);
      effectiveDueDate.setHours(0, 0, 0, 0);
    }
    if (!effectiveDueDate) return false;
    return effectiveDueDate <= nextPayrollDate;
  });

  return (
    <div style={{ minHeight: '100vh', background: 'transparent', paddingBottom: 80 }}>
      <Header user={user} unreadCount={notifications.length} />
      
      <main className="px-4 py-3 max-w-lg mx-auto">
        <div className="flex items-center gap-2 mb-4">
          <Link to={createPageUrl('ComboRouteSelection')} className="shrink-0">
            <Button
              size="sm"
              className="bg-transparent hover:bg-purple-600/20 text-purple-400 text-xs px-2.5 h-[38px] border border-purple-500"
            >
              <Shuffle className="w-3.5 h-3.5 mr-1" />
              Combo{activeComboRoutes.length > 0 ? ` (${activeComboRoutes.length})` : ''}
            </Button>
          </Link>
          <div className="flex-1 min-w-0">
            <AddressSearch
              routes={routes}
              addresses={addresses}
              isBossView={false}
              className=""
            />
          </div>
        </div>

        <WorkPhaseBlocks currentPhase={currentPhase} />
        
        <StatBoxes 
          activeRoutes={activeRoutes.length}
          addresses={pendingAddresses.length}
          served={servedAddresses.length}
          dueSoon={dueSoonRoutes.length}
        />
        
        {activeComboRoutes.map(combo => (
          <div key={combo.id} className="mb-4">
            <ComboRouteCard combo={combo} routes={routes} />
          </div>
        ))}

        <ActiveRoutesList
          routes={activeRoutes}
          attempts={allAttempts}
          addresses={addresses}
          userId={user?.id}
          onArchive={handleArchiveRoute}
          onDelete={handleDeleteRoute}
        />
      </main>

      <BottomNav currentPage="WorkerHome" />

      <LocationTracker 
        user={user} 
        enabled={user?.location_permission && activeRoutes.length > 0}
      />
    </div>
  );
}
