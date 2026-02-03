import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import { format } from 'date-fns';
import Header from '../components/layout/Header';
import BottomNav from '../components/layout/BottomNav';
import WorkPhaseBlocks from '../components/home/WorkPhaseBlocks';
import StatBoxes from '../components/home/StatBoxes';
import ActiveRoutesList from '../components/home/ActiveRoutesList';
import LocationTracker from '../components/worker/LocationTracker';
import { Loader2, ArrowRightLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
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

  const { data: user, isLoading: userLoading, isError: userError } = useQuery({
    queryKey: ['currentUser'],
    queryFn: () => base44.auth.me(),
    retry: false
  });

  useEffect(() => {
    if (!userLoading && (userError || !user)) {
      base44.auth.redirectToLogin();
    }
  }, [userLoading, userError, user]);

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
      // Fetch all routes for this company and filter by worker_id
      const allRoutes = await base44.entities.Route.filter({ 
        deleted_at: null 
      });
      return allRoutes.filter(r => r.worker_id === user.id);
    },
    enabled: !!user?.id
  });

  const { data: addresses = [] } = useQuery({
    queryKey: ['workerAddresses', routes],
    queryFn: async () => {
      if (routes.length === 0) return [];
      const routeIds = routes.map(r => r.id);
      const allAddresses = await base44.entities.Address.filter({
        deleted_at: null
      });
      return allAddresses.filter(a => routeIds.includes(a.route_id));
    },
    enabled: routes.length > 0
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
    enabled: !!user?.id
  });

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

  // Show both assigned and active routes on home
  const activeRoutes = routes.filter(r => r.status === 'active' || r.status === 'assigned');
  const pendingAddresses = addresses.filter(a => !a.served);
  const servedAddresses = addresses.filter(a => a.served);
  
  const threeDaysFromNow = new Date();
  threeDaysFromNow.setDate(threeDaysFromNow.getDate() + 3);
  const dueSoonRoutes = routes.filter(r => 
    r.status !== 'completed' && 
    r.due_date && 
    new Date(r.due_date) <= threeDaysFromNow
  );

  const firstName = user?.full_name?.split(' ')[0] || 'there';
  const todayDate = format(new Date(), 'EEEE, MMMM d');

  return (
    <div className="min-h-screen bg-gray-50 pb-20">
      <Header user={user} unreadCount={notifications.length} />
      
      <main className="px-4 py-6 max-w-lg mx-auto">
        <div className="mb-6 flex items-start justify-between">
                        <div>
                          <h1 className="text-3xl font-extrabold text-gray-900">
                            Welcome back, {firstName}
                          </h1>
                          <p className="text-gray-500 mt-1">{todayDate}</p>
                        </div>
                        <Button 
                          variant="outline" 
                          size="sm"
                          onClick={() => navigate(createPageUrl('BossDashboard'))}
                          className="flex items-center gap-2 text-xs"
                        >
                          <ArrowRightLeft className="w-3 h-3" />
                          Boss View
                        </Button>
                      </div>

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