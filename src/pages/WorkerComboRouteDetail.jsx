import React, { useState, useMemo, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCurrentUser } from '@/components/hooks/useCurrentUser';
import { useUserSettings } from '@/components/hooks/useUserSettings';
import { Link, useNavigate } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import { Loader2, ChevronLeft, Pause, AlertCircle } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import AnimatedAddressList from '@/components/address/AnimatedAddressList';
import MessageBossDialog from '@/components/address/MessageBossDialog';
import BottomNav from '@/components/layout/BottomNav';

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
    enabled: !!comboId
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
    enabled: !!combo?.route_ids
  });

  const { data: addresses = [], isLoading: addressesLoading } = useQuery({
    queryKey: ['comboDetailAddresses', combo?.route_ids],
    queryFn: async () => {
      if (!combo?.route_ids) return [];
      const results = await Promise.all(
        combo.route_ids.map(rid => base44.entities.Address.filter({ route_id: rid, deleted_at: null }))
      );
      return results.flat().sort((a, b) => (a.order_index || 999) - (b.order_index || 999));
    },
    enabled: !!combo?.route_ids,
    refetchInterval: 30000
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
    enabled: !!combo?.route_ids
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
    // Sort by attempt_time descending to get latest first
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
      // Update each route status based on whether all addresses are served
      for (const route of routes) {
        const routeAddresses = addresses.filter(a => a.route_id === route.id);
        const allServed = routeAddresses.every(a => a.served);
        
        await base44.entities.Route.update(route.id, {
          status: allServed ? 'completed' : 'ready',
          completed_at: allServed ? new Date().toISOString() : null,
          started_at: null
        });
      }

      // Delete combo record
      await base44.entities.ComboRoute.delete(comboId);

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

  // Build a virtual "route" object for AnimatedAddressList (needs minimum_days_spread, required_attempts)
  // Use the most conservative values from all routes
  const virtualRoute = {
    id: comboId,
    status: 'active',
    required_attempts: Math.max(...routes.map(r => r.required_attempts || 3), 3),
    minimum_days_spread: Math.max(...routes.map(r => r.minimum_days_spread || 10), 10),
  };

  // We need a single routeId for AddressCard — but addresses span multiple routes.
  // AnimatedAddressList passes routeId to each AddressCard. We'll override by wrapping.
  // Instead, we use a custom wrapper that passes each address's own route_id.

  return (
    <div className="min-h-screen bg-gray-50 pb-24">
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
        {/* Progress bar */}
        <div className="mb-4">
          <div className="flex justify-between text-xs text-gray-500 mb-1">
            <span>{progress.served} of {progress.total} served</span>
            <span className="text-purple-600 font-medium">{progress.pct}%</span>
          </div>
          <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-purple-500 to-purple-400 transition-all duration-500"
              style={{ width: `${progress.pct}%` }}
            />
          </div>
        </div>

        {/* Stop button */}
        <Button
          onClick={handleStopCombo}
          disabled={stopping}
          className="w-full bg-gray-500 hover:bg-gray-600 mb-4"
        >
          {stopping ? (
            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
          ) : (
            <Pause className="w-4 h-4 mr-2" />
          )}
          Stop Combo Route
        </Button>

        {/* Address list — using ComboAnimatedList wrapper */}
        <ComboAnimatedList
          addresses={addresses}
          attempts={attempts}
          routes={routes}
          routeNameMap={routeNameMap}
          lastAttemptMap={lastAttemptMap}
          allAttemptsMap={allAttemptsMap}
          virtualRoute={virtualRoute}
          onMessageBoss={handleMessageBoss}
          userSettings={userSettings}
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

      <BottomNav currentPage="WorkerRoutes" />
    </div>
  );
}

/**
 * Custom wrapper around AnimatedAddressList that:
 * 1. Adds a folder label badge to each address
 * 2. Passes the correct route_id per address
 * 
 * We reuse AnimatedAddressList directly since it handles all the
 * categorization, animation, and card rendering. The key insight is
 * that AnimatedAddressList passes routeId to AddressCard — but since
 * each address has its own route_id field, and AddressCard uses it 
 * for creating attempts, we need to pass each address's own route_id.
 * 
 * AnimatedAddressList accepts a single routeId. For combo routes,
 * we add a folder_name badge via CSS on the address objects and 
 * render with the list component's built-in logic, using a dummy
 * routeId since AddressCard also reads address.route_id from the
 * address object for attempts.
 */
function ComboAnimatedList({ 
  addresses, 
  attempts, 
  routes,
  routeNameMap, 
  lastAttemptMap, 
  allAttemptsMap, 
  virtualRoute,
  onMessageBoss,
  userSettings
}) {
  // Enhance addresses with _folderName for display
  const enhancedAddresses = useMemo(() => {
    return addresses.map(addr => ({
      ...addr,
      _folderName: routeNameMap[addr.route_id] || 'Unknown'
    }));
  }, [addresses, routeNameMap]);

  // AnimatedAddressList uses routeId for query invalidation.
  // Since we have multiple routes, we'll pass a fake combo routeId.
  // The individual AddressCard will use the address's own route_id for attempts.
  // However, AnimatedAddressList passes routeId prop to each AddressCard.
  // We need each card to get its own address.route_id instead.
  // 
  // The cleanest solution: render our own list using the same pattern as AnimatedAddressList
  // but passing per-address route_id. This avoids modifying the shared component.

  return (
    <ComboAddressList
      addresses={enhancedAddresses}
      attempts={attempts}
      routeNameMap={routeNameMap}
      lastAttemptMap={lastAttemptMap}
      allAttemptsMap={allAttemptsMap}
      virtualRoute={virtualRoute}
      onMessageBoss={onMessageBoss}
      showZoneLabels={userSettings?.show_zone_labels !== false}
    />
  );
}

/**
 * Simplified address list for combo routes.
 * Renders addresses in order_index order with folder badges.
 * Uses AddressCard with per-address route_id.
 */
function ComboAddressList({
  addresses,
  attempts,
  routeNameMap,
  lastAttemptMap,
  allAttemptsMap,
  virtualRoute,
  onMessageBoss,
  showZoneLabels
}) {
  const [highlightedAddressId, setHighlightedAddressId] = useState(null);

  // Categorize: active, attempted today, completed
  const { activeAddresses, attemptedTodayAddresses, completedAddresses } = useMemo(() => {
    const today = new Date().toDateString();
    const served = [];
    const attemptedToday = [];
    const active = [];

    addresses.forEach(addr => {
      if (addr.served || addr.status === 'served' || addr.status === 'returned') {
        served.push(addr);
      } else {
        const addrAttempts = attempts.filter(a => a.address_id === addr.id && a.status === 'completed');
        const hasCompletedToday = addrAttempts.some(a => new Date(a.attempt_time).toDateString() === today);
        if (hasCompletedToday) {
          attemptedToday.push(addr);
        } else {
          active.push(addr);
        }
      }
    });

    return {
      activeAddresses: active.sort((a, b) => (a.order_index || 999) - (b.order_index || 999)),
      attemptedTodayAddresses: attemptedToday.sort((a, b) => (a.order_index || 999) - (b.order_index || 999)),
      completedAddresses: served.sort((a, b) => (a.order_index || 999) - (b.order_index || 999))
    };
  }, [addresses, attempts]);

  // Highlight first active
  useEffect(() => {
    if (activeAddresses.length > 0) {
      setHighlightedAddressId(activeAddresses[0].id);
    } else if (attemptedTodayAddresses.length > 0) {
      setHighlightedAddressId(attemptedTodayAddresses[0].id);
    }
  }, [activeAddresses.length, attemptedTodayAddresses.length]);

  const [showCompleted, setShowCompleted] = useState(false);

  const renderCard = (addr, index, globalIndex) => (
    <div key={addr.id} className="relative">
      {/* Order number badge */}
      <div className="absolute -top-2 -left-2 z-10 w-8 h-8 rounded-full bg-purple-500 text-white flex items-center justify-center font-bold text-sm shadow-lg border-2 border-white">
        {addr.order_index || globalIndex + 1}
      </div>
      {/* Folder badge */}
      {addr._folderName && (
        <div className="absolute -top-2 left-8 z-10">
          <span className="bg-gray-200 text-gray-600 text-[10px] font-semibold py-0.5 px-2 rounded-full">
            {addr._folderName}
          </span>
        </div>
      )}
      <div className="pt-1">
        <AddressCard
          address={addr}
          routeId={addr.route_id}
          showActions={true}
          onMessageBoss={onMessageBoss}
          lastAttempt={lastAttemptMap[addr.id]}
          allAttempts={allAttemptsMap[addr.id] || []}
          isHighlighted={highlightedAddressId === addr.id}
        />
      </div>
    </div>
  );

  return (
    <div className="space-y-6">
      {/* Active */}
      {activeAddresses.length > 0 && (
        <div className="space-y-4">
          {activeAddresses.map((addr, i) => renderCard(addr, i, i))}
        </div>
      )}

      {/* Attempted Today */}
      {attemptedTodayAddresses.length > 0 && (
        <div>
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 mb-3">
            <h2 className="text-sm font-bold text-amber-700">
              ATTEMPTED TODAY ({attemptedTodayAddresses.length})
            </h2>
          </div>
          <div className="space-y-4">
            {attemptedTodayAddresses.map((addr, i) => renderCard(addr, i, activeAddresses.length + i))}
          </div>
        </div>
      )}

      {/* Completed */}
      {completedAddresses.length > 0 && (
        <div>
          <button
            onClick={() => setShowCompleted(!showCompleted)}
            className="w-full bg-green-50 border border-green-200 rounded-xl p-4 flex items-center justify-between hover:bg-green-100 transition-colors"
          >
            <span className="font-semibold text-green-700">
              COMPLETED ({completedAddresses.length})
            </span>
          </button>
          {showCompleted && (
            <div className="mt-3 space-y-4">
              {completedAddresses.map((addr, i) => (
                <div key={addr.id} className="relative opacity-75">
                  <div className="absolute -top-2 -left-2 z-10 w-8 h-8 rounded-full bg-green-500 text-white flex items-center justify-center font-bold text-sm shadow-lg border-2 border-white">
                    {addr.order_index || '?'}
                  </div>
                  {addr._folderName && (
                    <div className="absolute -top-2 left-8 z-10">
                      <span className="bg-gray-200 text-gray-600 text-[10px] font-semibold py-0.5 px-2 rounded-full">
                        {addr._folderName}
                      </span>
                    </div>
                  )}
                  <div className="pt-1 border-2 border-green-300 rounded-2xl">
                    <AddressCard
                      address={addr}
                      routeId={addr.route_id}
                      showActions={false}
                      lastAttempt={lastAttemptMap[addr.id]}
                      allAttempts={allAttemptsMap[addr.id] || []}
                      isCompleted={true}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Empty */}
      {activeAddresses.length === 0 && attemptedTodayAddresses.length === 0 && completedAddresses.length === 0 && (
        <div className="bg-gray-100 rounded-xl p-6 text-center">
          <p className="text-gray-500 text-sm">No addresses in this combo route</p>
        </div>
      )}
    </div>
  );
}