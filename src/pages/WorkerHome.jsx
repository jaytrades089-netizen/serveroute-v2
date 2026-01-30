import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import { format } from 'date-fns';
import Header from '../components/layout/Header';
import BottomNav from '../components/layout/BottomNav';
import WorkPhaseBlocks from '../components/home/WorkPhaseBlocks';
import StatBoxes from '../components/home/StatBoxes';
import ActiveRoutesList from '../components/home/ActiveRoutesList';
import { Loader2, ArrowRightLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';

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
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
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
    </div>
  );
}