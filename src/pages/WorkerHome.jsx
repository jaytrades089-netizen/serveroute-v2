import React, { useState, useEffect } from 'react';
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
import ActiveRoutesList from '../components/home/ActiveRoutesList';
import LocationTracker from '../components/worker/LocationTracker';
import AddressSearch from '../components/common/AddressSearch';
import { Loader2 } from 'lucide-react';

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
    if (hour >= 8 && hour < 21) return 'weekend';
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

  // Auth is handled by Layout - no redirect needed here

  // Set worker status to active when page loads
  useEffect(() => {
    if (!user?.id) return;

    const setActive = async () => {
      // Only update if not already active
      if (user.worker_status !== 'active') {
        await base44.auth.updateMe({
          worker_status: 'active',
          last_active_at: new Date().toISOString()
        });
        queryClient.invalidateQueries({ queryKey: ['currentUser'] });
      }
    };

    setActive();

    // Set to offline when leaving page
    const handleVisibilityChange = () => {
      if (document.hidden) {
        // Don't set offline immediately - let it timeout
      } else {
        // Coming back - set active again
        setActive();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);

    // Heartbeat - update last_active_at every 2 minutes
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
      const addressPromises = routes.map(r => 
        base44.entities.Address.filter({ route_id: r.id, deleted_at: null })
      );
      const results = await Promise.all(addressPromises);
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
      return base44.entities.Notification.filter({ 
        user_id: user.id,
        read: false 
      });
    },
    enabled: !!user?.id,
    staleTime: 60 * 1000,
    gcTime: 24 * 60 * 60 * 1000,
    refetchInterval: 30000
  });

  // Load user settings for payroll day/hour
  const { data: userSettings } = useUserSettings(user?.id);

  useEffect(() => {
    const timezone = user?.settings?.timezone || 'America/Detroit';
    setCurrentPhase(getCurrentPhase(timezone));
    
    const interval = setInterval(() => {
      setCurrentPhase(getCurrentPhase(timezone));
    }, 60000);
    
    return () => clearInterval(interval);
  }, [user]);



  if (userLoading || !user) {
    return (
      <div className="min-h-screen bg-gray-50 pb-20">
        <div className="bg-blue-500 h-14" />
        <main className="px-4 py-6 max-w-lg mx-auto">
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

  // Show both assigned and active routes on home (exclude archived/completed)
  const activeRoutes = routes.filter(r => r.status === 'active' || r.status === 'assigned' || r.status === 'ready');
  const activeRouteIds = activeRoutes.map(r => r.id);
  
  // Pending addresses only from active routes
  const activeAddresses = addresses.filter(a => activeRouteIds.includes(a.route_id));
  const pendingAddresses = activeAddresses.filter(a => !a.served);
  
  // Served count = addresses within current payroll period (same logic as WorkerPayout)
  // Use saved settings or default to Wednesday at 12:00 PM
  const selectedDay = userSettings?.payroll_turn_in_day ?? 3;
  const selectedHour = userSettings?.payroll_turn_in_hour ?? 12;
  const now = new Date();
  const currentDayOfWeek = now.getDay();
  const currentHour = now.getHours();
  let daysBack = (currentDayOfWeek - selectedDay + 7) % 7;
  if (daysBack === 0 && currentHour < selectedHour) {
    daysBack = 7;
  }
  const periodStart = new Date(now);
  periodStart.setDate(periodStart.getDate() - daysBack);
  periodStart.setHours(selectedHour, 0, 0, 0);
  
  // Count served addresses within current payroll period
  const servedAddresses = addresses.filter(a => {
    if (!a.served || !a.served_at) return false;
    const servedDate = new Date(a.served_at);
    return servedDate >= periodStart && servedDate < now;
  });
  
  // Due Soon = routes due on or before the next payroll turn-in date
  // Calculate next occurrence of the selected day
  let daysUntilPayroll = (selectedDay - currentDayOfWeek + 7) % 7;
  if (daysUntilPayroll === 0) daysUntilPayroll = 7; // If today is the selected day, show next week
  
  const nextPayrollDate = new Date(now);
  nextPayrollDate.setDate(nextPayrollDate.getDate() + daysUntilPayroll);
  nextPayrollDate.setHours(23, 59, 59, 999); // End of that day to include routes due ON that date
  
  // Due Soon = routes that need to be completed by the next payroll turn-in
  // If route has first_attempt_date, use spread due date (3rd attempt deadline)
  // Otherwise, use the route's due_date
  const dueSoonRoutes = routes.filter(r => {
    if (r.status === 'completed' || r.status === 'archived') return false;
    
    // Calculate the effective due date for this route (spread due date = 3rd attempt deadline)
    let effectiveDueDate = null;
    
    // If route has started (has first_attempt_date), use the spread due date
    if (r.first_attempt_date) {
      const spreadDays = r.minimum_days_spread || (r.spread_type === '10' ? 10 : 14);
      effectiveDueDate = new Date(r.first_attempt_date);
      effectiveDueDate.setDate(effectiveDueDate.getDate() + spreadDays);
      effectiveDueDate.setHours(0, 0, 0, 0); // Start of the day for comparison
    } else if (r.spread_due_date) {
      effectiveDueDate = new Date(r.spread_due_date);
      effectiveDueDate.setHours(0, 0, 0, 0);
    } else if (r.due_date) {
      // Fallback to route's due_date if not started yet
      effectiveDueDate = new Date(r.due_date);
      effectiveDueDate.setHours(0, 0, 0, 0);
    }
    
    if (!effectiveDueDate) return false;
    
    // Include routes where spread due date is ON or BEFORE the selected payroll date
    return effectiveDueDate <= nextPayrollDate;
  });

  const firstName = user?.full_name?.split(' ')[0] || 'there';
  const todayDate = format(new Date(), 'EEEE, MMMM d');

  return (
    <div className="min-h-screen bg-gray-50 pb-20">
      <Header user={user} unreadCount={notifications.length} />
      
      <main className="px-4 py-6 max-w-lg mx-auto">
        <AddressSearch
          routes={routes}
          addresses={addresses}
          isBossView={false}
        />

        <WorkPhaseBlocks currentPhase={currentPhase} />
        
        <StatBoxes 
          activeRoutes={activeRoutes.length}
          addresses={pendingAddresses.length}
          served={servedAddresses.length}
          dueSoon={dueSoonRoutes.length}
        />
        
        <ActiveRoutesList routes={activeRoutes} />
      </main>

      <BottomNav currentPage="WorkerHome" />

      {/* Location tracker - active when user has permission and has an active route */}
      <LocationTracker 
        user={user} 
        enabled={user?.location_permission && activeRoutes.length > 0}
      />
    </div>
  );
}