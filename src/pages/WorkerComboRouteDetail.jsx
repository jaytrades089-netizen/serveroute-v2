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
      // Return flat unsorted — display order is derived via sortedAddresses useMemo below.
      return results.flat();
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

  // Derive display order from combo.optimized_order — same pattern as WorkerRouteDetail.
  // Never sorts by order_index. Falls back to creation date if not yet optimized.
  const sortedAddresses = useMemo(() => {
    if (!addresses.length) return addresses;
    if (combo?.optimized_order?.length > 0) {
      const orderMap = {};
      combo.optimized_order.forEach((id, idx) => { orderMap[id] = idx; });
      return [...addresses].sort((a, b) => {
        const aIdx = orderMap[a.id] ?? Infinity;
        const bIdx = orderMap[b.id] ?? Infinity;
        return aIdx - bIdx;
      });
    }
    return [...addresses].sort((a, b) => new Date(a.created_date || 0) - new Date(b.created_date || 0));
  }, [addresses, combo?.optimized_order]);

  // Progress
  const progress = useMemo(() => {
    const total = addresses.length;
    const served = addresses.filter(a => a.served).length;
    const pct = total > 0 ? Math.round((served / total) * 100) : 0;
    return { total, served, remaining: total - served, pct };
  }, [addresses]);

  // Use combo-level metrics (calculated during optimization) instead of individual routes
  const comboMetrics = useMemo(() => {
    const totalMiles = combo?.total_miles || 0;
    const totalDriveMinutes = combo?.total_drive_time_minutes || 0;
    const startedAt = combo?.started_at ? new Date(combo.started_at) : null;

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
  }, [combo, progress]);

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
      queryClient.invalidateQueries({ queryKey: ['activeComboRoutes'] });
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
      <div style={{ minHeight: '100vh', background: 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Loader2 className="w-8 h-8 animate-spin" style={{ color: '#e9c349' }} />
      </div>
    );
  }

  // Not found
  if (!combo) {
    return (
      <div style={{ minHeight: '100vh', background: 'transparent' }}>
        <header style={{ background: 'rgba(11,15,30,0.75)', backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)', borderBottom: '1px solid rgba(255,255,255,0.08)', color: '#e6e1e4', padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 12 }}>
          <Link to={createPageUrl('WorkerRoutes')} className="flex items-center justify-center w-10 h-10 rounded-lg hover:bg-white/10" style={{ border: '1px solid #363436' }}>
            <ChevronLeft className="w-6 h-6" />
          </Link>
          <h1 className="font-bold text-lg">Combo Route</h1>
        </header>
        <div className="flex flex-col items-center justify-center p-8 mt-16">
          <AlertCircle className="w-12 h-12 mb-3" style={{ color: '#4B5563' }} />
          <p className="font-medium mb-4" style={{ color: '#8a7f87' }}>Combo route not found</p>
          <Button onClick={() => navigate(createPageUrl('WorkerRoutes'))}>Back to My Routes</Button>
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
  const enhancedAddresses = sortedAddresses.map(addr => ({
    ...addr,
    _folderName: routeNameMap[addr.route_id] || ''
  }));

  return (
    <div style={{ minHeight: '100vh', background: 'transparent', paddingBottom: 24 }}>
      <header style={{ background: 'rgba(11,15,30,0.75)', backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)', borderBottom: '1px solid rgba(255,255,255,0.08)', color: '#e6e1e4', padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 12, position: 'sticky', top: 0, zIndex: 50 }}>
        <Link to={createPageUrl('WorkerRoutes')} className="flex items-center justify-center w-10 h-10 rounded-lg hover:bg-white/10 active:bg-white/20 transition-colors" style={{ border: '1px solid #363436' }}>
          <ChevronLeft className="w-6 h-6" />
        </Link>
        <div className="flex-1">
          <h1 className="font-bold text-lg" style={{ color: '#e6e1e4' }}>Combo Route</h1>
          <p className="text-sm" style={{ color: '#8a7f87' }}>
            {progress.remaining} remaining across {routes.length} folders
          </p>
        </div>
      </header>

      <main className="px-4 py-4 max-w-lg mx-auto">
        {/* Started / Stop / Est Done boxes */}
        <div className="grid grid-cols-3 gap-1.5 mb-3">
          {/* Start Time */}
          <div className="rounded-lg p-2 text-center" style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.10)' }}>
            <p className="text-sm font-bold" style={{ color: '#e9c349' }}>
              {comboMetrics.startedAt
                ? comboMetrics.startedAt.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })
                : new Date().toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })}
            </p>
            <p className="text-[10px] font-medium" style={{ color: '#8a7f87' }}>Started</p>
          </div>

          {/* Stop Route */}
          <div
            className="rounded-lg p-2 text-center cursor-pointer flex flex-col items-center justify-center transition-opacity hover:opacity-90"
            style={{ background: 'rgba(239,68,68,0.15)', border: '1px solid rgba(239,68,68,0.35)' }}
            onClick={handleStopCombo}
          >
            {stopping ? (
              <Loader2 className="w-5 h-5 animate-spin mb-0.5" style={{ color: '#ef4444' }} />
            ) : (
              <Pause className="w-5 h-5 mb-0.5" style={{ color: '#ef4444' }} />
            )}
            <p className="text-[10px] font-bold" style={{ color: '#ef4444' }}>Stop Combo</p>
          </div>

          {/* Est Completion */}
          <div className="rounded-lg p-2 text-center" style={{ background: 'rgba(34,197,94,0.12)', border: '1px solid rgba(34,197,94,0.30)' }}>
            <p className="text-sm font-bold" style={{ color: '#22c55e' }}>
              {comboMetrics.estCompletion.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })}
            </p>
            <p className="text-[10px] font-medium" style={{ color: '#22c55e' }}>Est. Done</p>
          </div>
        </div>

        {/* Progress bar with miles and time */}
        <div className="mb-4">
          <div className="flex justify-between text-[10px] mb-0.5" style={{ color: '#8a7f87' }}>
            <span>{progress.served} of {progress.total} complete</span>
            <span className="font-medium" style={{ color: '#8a7f87' }}>{comboMetrics.remainingMiles.toFixed(1)} mi left</span>
          </div>
          <div className="h-1.5 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.10)' }}>
            <div
              className="h-full bg-gradient-to-r from-green-500 to-green-400 transition-all duration-500"
              style={{ width: `${progress.pct}%` }}
            />
          </div>
          <div className="flex justify-between text-[10px] mt-0.5" style={{ color: '#8a7f87' }}>
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
