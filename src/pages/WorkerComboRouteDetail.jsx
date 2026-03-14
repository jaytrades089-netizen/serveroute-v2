import React, { useState, useMemo, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCurrentUser } from '@/components/hooks/useCurrentUser';
import { useUserSettings } from '@/components/hooks/useUserSettings';
import { Link, useNavigate } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import { Loader2, ChevronLeft, Pause, AlertCircle, Clock } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import AnimatedAddressList from '@/components/address/AnimatedAddressList';
import MessageBossDialog from '@/components/address/MessageBossDialog';

export default function WorkerComboRouteDetail() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const urlParams = new URLSearchParams(window.location.search);
  const comboId = urlParams.get('id');

  const [showMessageDialog, setShowMessageDialog] = useState(false);
  const [selectedAddress, setSelectedAddress] = useState(null);
  const [stopping, setStopping] = useState(false);

  const { data: user } = useCurrentUser();
  const { data: userSettings } = useUserSettings(user?.id);

  // Fetch combo record
  const { data: combo, isLoading: comboLoading } = useQuery({
    queryKey: ['comboRoute', comboId],
    queryFn: async () => {
      if (!comboId) return null;
      const results = await base44.entities.ComboRoute.filter({ id: comboId });
      return results[0] || null;
    },
    enabled: !!comboId,
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000
  });

  // Fetch all routes, addresses, and attempts in PARALLEL
  const { data: routes = [] } = useQuery({
    queryKey: ['comboDetailRoutes', combo?.route_ids],
    queryFn: async () => {
      if (!combo?.route_ids) return [];
      const results = await Promise.all(
        combo.route_ids.map(rid => base44.entities.Route.filter({ id: rid }))
      );
      return results.map(r => r[0]).filter(Boolean);
    },
    enabled: !!combo?.route_ids,
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000
  });

  const { data: addresses = [], isLoading: addressesLoading } = useQuery({
    queryKey: ['comboDetailAddresses', combo?.route_ids],
    queryFn: async () => {
      if (!combo?.route_ids) return [];
      const results = await Promise.all(
        combo.route_ids.map(rid => base44.entities.Address.filter({ route_id: rid, deleted_at: null }))
      );
      // Sort ALL addresses globally by order_index (the combo optimization
      // already assigned a flat 1,2,3... sequence across all folders)
      const allAddrs = results.flat();
      allAddrs.sort((a, b) => (a.order_index || 999) - (b.order_index || 999));
      return allAddrs;
    },
    enabled: !!combo?.route_ids,
    refetchInterval: 30000,
    staleTime: 2 * 60 * 1000,
    gcTime: 10 * 60 * 1000
  });

  const { data: attempts = [] } = useQuery({
    queryKey: ['comboDetailAttempts', combo?.route_ids],
    queryFn: async () => {
      if (!combo?.route_ids) return [];
      const results = await Promise.all(
        combo.route_ids.map(rid => base44.entities.Attempt.filter({ route_id: rid }, '-attempt_time'))
      );
      return results.flat();
    },
    enabled: !!combo?.route_ids,
    staleTime: 60 * 1000,
    gcTime: 10 * 60 * 1000
  });

  // Build route name map
  const routeNameMap = useMemo(() => {
    const map = {};
    routes.forEach(r => { map[r.id] = r.folder_name; });
    return map;
  }, [routes]);

  // Build attempt maps
  const lastAttemptMap = useMemo(() => {
    const map = {};
    const sorted = [...attempts].sort((a, b) => new Date(b.attempt_time) - new Date(a.attempt_time));
    sorted.forEach(attempt => {
      if (!map[attempt.address_id]) {
        map[attempt.address_id] = attempt;
      }
    });
    return map;
  }, [attempts]);

  const allAttemptsMap = useMemo(() => {
    const map = {};
    attempts.forEach(attempt => {
      if (!map[attempt.address_id]) {
        map[attempt.address_id] = [];
      }
      map[attempt.address_id].push(attempt);
    });
    return map;
  }, [attempts]);

  // Progress
  const progress = useMemo(() => {
    const total = addresses.length;
    const served = addresses.filter(a => a.served).length;
    const pct = total > 0 ? Math.round((served / total) * 100) : 0;
    return { total, served, remaining: total - served, pct };
  }, [addresses]);

  // Aggregate route metrics for the combo
  const comboMetrics = useMemo(() => {
    let totalMiles = 0;
    let totalDriveMinutes = 0;
    let startedAt = null;

    routes.forEach(r => {
      if (r.total_miles) totalMiles += r.total_miles;
      if (r.total_drive_time_minutes) totalDriveMinutes += r.total_drive_time_minutes;
      if (r.started_at) {
        const t = new Date(r.started_at);
        if (!startedAt || t < startedAt) startedAt = t;
      }
    });

    // Remaining miles proportional to remaining addresses
    const remainingMiles = progress.total > 0
      ? totalMiles * (progress.remaining / progress.total)
      : totalMiles;

    // Est remaining time: proportional drive time + 2 min per remaining address
    const remainingDriveMinutes = progress.total > 0
      ? totalDriveMinutes * (progress.remaining / progress.total)
      : totalDriveMinutes;
    const remainingMinutes = Math.round(remainingDriveMinutes + progress.remaining * 2);

    const estCompletion = new Date(Date.now() + remainingMinutes * 60000);

    return { totalMiles, totalDriveMinutes, startedAt, remainingMiles, remainingMinutes, estCompletion };
  }, [routes, progress]);

  // Set worker status to active
  useEffect(() => {
    if (!user?.id) return;
    const setActive = async () => {
      if (user.worker_status !== 'active') {
        await base44.auth.updateMe({
          worker_status: 'active',
          last_active_at: new Date().toISOString()
        });
      }
    };
    setActive();
    const heartbeat = setInterval(() => {
      base44.auth.updateMe({ last_active_at: new Date().toISOString() });
    }, 2 * 60 * 1000);
    return () => clearInterval(heartbeat);
  }, [user?.id]);

  // Handle stop combo route
  const handleStopCombo = async () => {
    const confirmed = window.confirm(
      `Stop this combo route?\n\nAll serve data is saved. Routes will return to your folders.`
    );
    if (!confirmed) return;

    setStopping(true);
    try {
      for (const route of routes) {
        const routeAddresses = addresses.filter(a => a.route_id === route.id);
        const allServed = routeAddresses.every(a => a.served);
        
        await base44.entities.Route.update(route.id, {
          status: allServed ? 'completed' : 'assigned',
          completed_at: allServed ? new Date().toISOString() : null
        });
      }

      // Mark combo as completed instead of deleting — preserves history
      await base44.entities.ComboRoute.update(comboId, { status: 'completed' });

      queryClient.invalidateQueries({ queryKey: ['workerRoutes'] });
      toast.success('Combo route stopped. Routes returned to folders.');
      navigate(createPageUrl('WorkerRoutes'));
    } catch (error) {
      console.error('Failed to stop combo:', error);
      toast.error('Failed to stop combo route');
      setStopping(false);
    }
  };

  const handleMessageBoss = (address) => {
    setSelectedAddress(address);
    setShowMessageDialog(true);
  };

  // Loading states
  if (comboLoading || addressesLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-purple-500" />
      </div>
    );
  }

  // Not found
  if (!combo) {
    return (
      <div className="min-h-screen bg-gray-50 pb-24">
        <header className="bg-purple-500 text-white px-4 py-3 flex items-center gap-3">
          <Link to={createPageUrl('WorkerRoutes')}>
            <ChevronLeft className="w-6 h-6" />
          </Link>
          <h1 className="font-bold text-lg">Combo Route</h1>
        </header>
        <div className="flex flex-col items-center justify-center p-8 mt-16">
          <AlertCircle className="w-12 h-12 text-gray-300 mb-3" />
          <p className="text-gray-500 font-medium mb-4">Combo route not found</p>
          <Button onClick={() => navigate(createPageUrl('WorkerRoutes'))}>
            Back to My Routes
          </Button>
        </div>
      </div>
    );
  }

  // Build a virtual "route" object for AnimatedAddressList
  const virtualRoute = {
    id: comboId,
    status: 'active',
    required_attempts: Math.max(...routes.map(r => r.required_attempts || 3), 3),
    minimum_days_spread: Math.max(...routes.map(r => r.minimum_days_spread || 10), 10),
  };

  // Attach folder name to each address so it shows inline on the card
  const enhancedAddresses = addresses.map(addr => ({
    ...addr,
    _folderName: routeNameMap[addr.route_id] || ''
  }));

  return (
    <div className="min-h-screen bg-gray-50 pb-6">
      {/* Purple header */}
      <header className="bg-purple-500 text-white px-4 py-3 flex items-center gap-3 sticky top-0 z-50">
        <Link to={createPageUrl('WorkerRoutes')}>
          <ChevronLeft className="w-6 h-6" />
        </Link>
        <div className="flex-1">
          <h1 className="font-bold text-lg">Combo Route</h1>
          <p className="text-sm text-purple-100">
            {progress.remaining} remaining across {routes.length} folders
          </p>
        </div>
      </header>

      <main className="px-4 py-4 max-w-lg mx-auto">
        {/* Started / Stop / Est Done boxes */}
        <div className="grid grid-cols-3 gap-1.5 mb-3">
          {/* Start Time */}
          <div className="bg-blue-50 rounded-lg p-2 text-center border border-blue-200">
            <p className="text-sm font-bold text-blue-600">
              {comboMetrics.startedAt
                ? comboMetrics.startedAt.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })
                : new Date().toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })}
            </p>
            <p className="text-[10px] text-blue-500 font-medium">Started</p>
          </div>

          {/* Stop Route */}
          <div
            className="bg-red-50 rounded-lg p-2 text-center border border-red-300 cursor-pointer hover:bg-red-100 transition-colors flex flex-col items-center justify-center"
            onClick={handleStopCombo}
          >
            {stopping ? (
              <Loader2 className="w-5 h-5 text-red-500 animate-spin mb-0.5" />
            ) : (
              <Pause className="w-5 h-5 text-red-500 mb-0.5" />
            )}
            <p className="text-[10px] text-red-600 font-bold">Stop Combo</p>
          </div>

          {/* Est Completion */}
          <div className="bg-green-50 rounded-lg p-2 text-center border border-green-200">
            <p className="text-sm font-bold text-green-600">
              {comboMetrics.estCompletion.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })}
            </p>
            <p className="text-[10px] text-green-500 font-medium">Est. Done</p>
          </div>
        </div>

        {/* Progress bar with miles and time */}
        <div className="mb-4">
          <div className="flex justify-between text-[10px] text-gray-500 mb-0.5">
            <span>{progress.served} of {progress.total} complete</span>
            <span className="text-purple-600 font-medium">
              {comboMetrics.remainingMiles.toFixed(1)} mi left
            </span>
          </div>
          <div className="h-1.5 bg-gray-200 rounded-full overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-purple-500 to-purple-400 transition-all duration-500"
              style={{ width: `${progress.pct}%` }}
            />
          </div>
          <div className="flex justify-between text-[10px] text-gray-400 mt-0.5">
            <span>{progress.pct}% done</span>
            <span>
              {comboMetrics.remainingMinutes >= 60
                ? `${Math.floor(comboMetrics.remainingMinutes / 60)}h ${comboMetrics.remainingMinutes % 60}m left`
                : `${comboMetrics.remainingMinutes}m left`}
            </span>
          </div>
        </div>

        {/* Address list — uses the SAME AnimatedAddressList as regular routes */}
        <AnimatedAddressList
          addresses={enhancedAddresses}
          attempts={attempts}
          routeId={comboId}
          onMessageBoss={handleMessageBoss}
          lastAttemptMap={lastAttemptMap}
          allAttemptsMap={allAttemptsMap}
          route={virtualRoute}
          showZoneLabels={false}
          preserveOrder={true}
          comboRouteIds={combo?.route_ids}
        />
      </main>

      {/* Message Boss Dialog */}
      {selectedAddress && (
        <MessageBossDialog
          open={showMessageDialog}
          onOpenChange={setShowMessageDialog}
          address={selectedAddress}
          route={routes.find(r => r.id === selectedAddress.route_id)}
          user={user}
        />
      )}

    </div>
  );
}