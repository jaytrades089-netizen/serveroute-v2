import React, { useState, useMemo } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import { getCompanyId } from '@/components/utils/companyUtils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Calendar } from '@/components/ui/calendar';
import { X, Loader2, FolderOpen, Check, Plus, MapPin, Minus } from 'lucide-react';
import { toast } from 'sonner';
import { format, addDays, subDays } from 'date-fns';

const ATTEMPT_OPTIONS = [3, 5, 7];
const SPREAD_OPTIONS = [10, 14, 21];

export default function MoveAddressesModal({ open, onClose, selectedAddresses, sourceRouteId, sourceRoute, user }) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [mode, setMode] = useState('pick'); // 'pick' | 'new'
  const [targetRouteId, setTargetRouteId] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [isMoving, setIsMoving] = useState(false);

  // New route form
  const [routeName, setRouteName] = useState('');
  const [dueDate, setDueDate] = useState(addDays(new Date(), 14));
  const [requiredAttempts, setRequiredAttempts] = useState(sourceRoute?.required_attempts || 3);
  const [minimumDaysSpread, setMinimumDaysSpread] = useState(sourceRoute?.minimum_days_spread || 10);

  const { data: routes = [], isLoading: routesLoading } = useQuery({
    queryKey: ['allWorkerRoutes', user?.id],
    queryFn: async () => {
      if (!user?.id) return [];
      const isBoss = user.role === 'boss' || user.role === 'admin';
      if (isBoss) {
        return base44.entities.Route.filter({ company_id: getCompanyId(user), deleted_at: null });
      }
      return base44.entities.Route.filter({ worker_id: user.id, deleted_at: null });
    },
    enabled: open && !!user?.id
  });

  const availableRoutes = useMemo(() => {
    return routes.filter(r =>
      r.id !== sourceRouteId &&
      r.status !== 'archived' &&
      r.status !== 'completed' &&
      !r.deleted_at
    );
  }, [routes, sourceRouteId]);

  const filteredRoutes = useMemo(() => {
    if (!searchQuery.trim()) return availableRoutes;
    const q = searchQuery.toLowerCase();
    return availableRoutes.filter(r => r.folder_name?.toLowerCase().includes(q));
  }, [availableRoutes, searchQuery]);

  const handleMoveToExisting = async () => {
    if (!targetRouteId || isMoving) return;
    setIsMoving(true);
    try {
      const targetRoute = routes.find(r => r.id === targetRouteId);

      // Move each address
      for (const addr of selectedAddresses) {
        await base44.entities.Address.update(addr.id, { route_id: targetRouteId });
        // Move attempts too
        const attempts = await base44.entities.Attempt.filter({ address_id: addr.id });
        for (const att of attempts) {
          await base44.entities.Attempt.update(att.id, { route_id: targetRouteId });
        }
      }

      // Update source route counts
      const sourceAddrs = await base44.entities.Address.filter({ route_id: sourceRouteId, deleted_at: null });
      await base44.entities.Route.update(sourceRouteId, {
        total_addresses: sourceAddrs.length,
        served_count: sourceAddrs.filter(a => a.served).length
      });

      // Update target route counts
      const targetAddrs = await base44.entities.Address.filter({ route_id: targetRouteId, deleted_at: null });
      await base44.entities.Route.update(targetRouteId, {
        total_addresses: targetAddrs.length,
        served_count: targetAddrs.filter(a => a.served).length
      });

      // Refetch
      queryClient.refetchQueries({ queryKey: ['routeAddresses', sourceRouteId] });
      queryClient.refetchQueries({ queryKey: ['route', sourceRouteId] });
      queryClient.refetchQueries({ queryKey: ['routeAddresses', targetRouteId] });
      queryClient.refetchQueries({ queryKey: ['route', targetRouteId] });
      queryClient.refetchQueries({ queryKey: ['workerRoutes'] });

      toast.success(`Moved ${selectedAddresses.length} address${selectedAddresses.length !== 1 ? 'es' : ''} to ${targetRoute?.folder_name}`);
      onClose();
    } catch (error) {
      console.error('Move failed:', error);
      toast.error('Failed to move addresses');
    } finally {
      setIsMoving(false);
    }
  };

  const handleMoveToNew = async () => {
    if (!routeName.trim() || !dueDate || isMoving) return;
    setIsMoving(true);
    try {
      const isBoss = user.role === 'boss' || user.role === 'admin';
      const qualifierAttempts = 3;
      const flexibleAttempts = Math.max(0, requiredAttempts - qualifierAttempts);
      const firstAttemptDeadline = subDays(dueDate, minimumDaysSpread);

      const newRoute = await base44.entities.Route.create({
        company_id: getCompanyId(user),
        folder_name: routeName,
        due_date: format(dueDate, 'yyyy-MM-dd'),
        status: isBoss ? 'ready' : 'assigned',
        worker_id: isBoss ? null : user.id,
        total_addresses: selectedAddresses.length,
        served_count: selectedAddresses.filter(a => a.served).length,
        required_attempts: requiredAttempts,
        qualifier_attempts: qualifierAttempts,
        flexible_attempts: flexibleAttempts,
        minimum_days_spread: minimumDaysSpread,
        first_attempt_deadline: format(firstAttemptDeadline, 'yyyy-MM-dd'),
        am_required: true,
        pm_required: true,
        weekend_required: true,
        created_via: 'move',
        ...(isBoss ? {} : { assigned_at: new Date().toISOString(), assigned_by: user.id }),
      });

      // Move addresses
      for (const addr of selectedAddresses) {
        await base44.entities.Address.update(addr.id, { route_id: newRoute.id });
        const attempts = await base44.entities.Attempt.filter({ address_id: addr.id });
        for (const att of attempts) {
          await base44.entities.Attempt.update(att.id, { route_id: newRoute.id });
        }
      }

      // Update source route counts
      const sourceAddrs = await base44.entities.Address.filter({ route_id: sourceRouteId, deleted_at: null });
      await base44.entities.Route.update(sourceRouteId, {
        total_addresses: sourceAddrs.length,
        served_count: sourceAddrs.filter(a => a.served).length
      });

      queryClient.refetchQueries({ queryKey: ['routeAddresses', sourceRouteId] });
      queryClient.refetchQueries({ queryKey: ['route', sourceRouteId] });
      queryClient.refetchQueries({ queryKey: ['workerRoutes'] });

      toast.success(`Moved ${selectedAddresses.length} address${selectedAddresses.length !== 1 ? 'es' : ''} to new route "${routeName}"`);
      onClose();
    } catch (error) {
      console.error('Move to new route failed:', error);
      toast.error('Failed to create route and move addresses');
    } finally {
      setIsMoving(false);
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[100]" style={{ background: 'rgba(0,0,0,0.65)' }}>
      <div
        className="absolute bottom-0 left-0 right-0 rounded-t-2xl max-h-[90vh] overflow-y-auto"
        style={{ background: '#0F1A2E', border: '1px solid rgba(255,255,255,0.12)', borderBottom: 'none' }}
      >
        {/* Handle */}
        <div className="w-12 h-1 rounded-full mx-auto mt-3 mb-2" style={{ background: 'rgba(255,255,255,0.20)' }} />

        {/* Header */}
        <div className="px-4 pb-3 flex items-center justify-between">
          <h2 className="font-bold text-base" style={{ color: '#e6e1e4' }}>
            Move {selectedAddresses.length} Address{selectedAddresses.length !== 1 ? 'es' : ''}
          </h2>
          <button onClick={onClose} className="p-2 rounded-full hover:bg-white/10" style={{ color: '#6B7280' }}>
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Mode Toggle */}
        <div className="px-4 mb-3">
          <div className="flex rounded-lg p-1" style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.10)' }}>
            <button
              onClick={() => setMode('pick')}
              className="flex-1 py-2 text-xs font-bold rounded-md transition-colors"
              style={{ background: mode === 'pick' ? 'rgba(233,195,73,0.20)' : 'transparent', color: mode === 'pick' ? '#e9c349' : '#6B7280' }}
            >
              Existing Route
            </button>
            <button
              onClick={() => setMode('new')}
              className="flex-1 py-2 text-xs font-bold rounded-md transition-colors"
              style={{ background: mode === 'new' ? 'rgba(233,195,73,0.20)' : 'transparent', color: mode === 'new' ? '#e9c349' : '#6B7280' }}
            >
              New Route
            </button>
          </div>
        </div>

        <div className="px-4 pb-6">
          {mode === 'pick' ? (
            <>
              <Input
                placeholder="Search routes..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="mb-3"
                style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', color: '#e6e1e4' }}
              />

              {routesLoading ? (
                <div className="flex justify-center py-8">
                  <Loader2 className="w-6 h-6 animate-spin" style={{ color: '#e9c349' }} />
                </div>
              ) : filteredRoutes.length === 0 ? (
                <div className="text-center py-8">
                  <FolderOpen className="w-10 h-10 mx-auto mb-2" style={{ color: '#363436' }} />
                  <p className="text-sm" style={{ color: '#8a7f87' }}>{searchQuery ? 'No routes match' : 'No other routes available'}</p>
                </div>
              ) : (
                <div className="space-y-2 max-h-[40vh] overflow-y-auto mb-4">
                  {filteredRoutes.map(r => {
                    const selected = targetRouteId === r.id;
                    return (
                      <div
                        key={r.id}
                        onClick={() => setTargetRouteId(r.id)}
                        className="flex items-center gap-3 p-3 rounded-xl cursor-pointer transition-all"
                        style={{
                          background: selected ? 'rgba(233,195,73,0.12)' : 'rgba(255,255,255,0.04)',
                          border: selected ? '2px solid rgba(233,195,73,0.50)' : '1px solid rgba(255,255,255,0.10)'
                        }}
                      >
                        <div className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0"
                          style={{ background: selected ? 'rgba(233,195,73,0.25)' : 'rgba(255,255,255,0.08)' }}>
                          {selected ? <Check className="w-4 h-4" style={{ color: '#e9c349' }} /> : <FolderOpen className="w-4 h-4" style={{ color: '#6B7280' }} />}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="font-semibold text-sm truncate" style={{ color: '#e6e1e4' }}>{r.folder_name}</p>
                          <div className="flex items-center gap-2 text-xs" style={{ color: '#6B7280' }}>
                            <span>{r.total_addresses || 0} addresses</span>
                            {r.due_date && <span>Due {format(new Date(r.due_date), 'MMM d')}</span>}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              <button
                onClick={handleMoveToExisting}
                disabled={!targetRouteId || isMoving}
                className="w-full py-3 rounded-xl font-bold text-sm flex items-center justify-center gap-2"
                style={{
                  background: (!targetRouteId || isMoving) ? 'rgba(255,255,255,0.05)' : 'rgba(233,195,73,0.20)',
                  border: (!targetRouteId || isMoving) ? '1px solid rgba(255,255,255,0.10)' : '1px solid rgba(233,195,73,0.50)',
                  color: (!targetRouteId || isMoving) ? '#4B5563' : '#e9c349',
                  cursor: (!targetRouteId || isMoving) ? 'not-allowed' : 'pointer'
                }}
              >
                {isMoving ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                {isMoving ? 'Moving...' : 'Move Here'}
              </button>
            </>
          ) : (
            <>
              {/* New Route Form */}
              <div className="space-y-4 mb-4">
                <div>
                  <label className="text-[10px] font-bold uppercase tracking-wide block mb-1" style={{ color: '#6B7280' }}>Route Name *</label>
                  <Input
                    value={routeName}
                    onChange={(e) => setRouteName(e.target.value)}
                    placeholder="New route name"
                    style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', color: '#e6e1e4' }}
                  />
                </div>

                <div>
                  <label className="text-[10px] font-bold uppercase tracking-wide block mb-1" style={{ color: '#6B7280' }}>Due Date *</label>
                  <div className="rounded-xl overflow-hidden" style={{ border: '1px solid rgba(255,255,255,0.10)', background: 'rgba(255,255,255,0.04)' }}>
                    <Calendar mode="single" selected={dueDate} onSelect={setDueDate} disabled={(d) => d < new Date()} className="mx-auto" />
                  </div>
                </div>

                <div>
                  <label className="text-[10px] font-bold uppercase tracking-wide block mb-1" style={{ color: '#6B7280' }}>Required Attempts</label>
                  <div className="grid grid-cols-4 gap-2">
                    {ATTEMPT_OPTIONS.map(n => (
                      <button key={n} onClick={() => setRequiredAttempts(n)}
                        className="py-2 rounded-lg text-sm font-bold transition-colors"
                        style={requiredAttempts === n
                          ? { background: 'rgba(233,195,73,0.20)', border: '1px solid rgba(233,195,73,0.50)', color: '#e9c349' }
                          : { background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.10)', color: '#6B7280' }
                        }
                      >{n}</button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="text-[10px] font-bold uppercase tracking-wide block mb-1" style={{ color: '#6B7280' }}>Days Spread</label>
                  <div className="grid grid-cols-4 gap-2">
                    {SPREAD_OPTIONS.map(n => (
                      <button key={n} onClick={() => setMinimumDaysSpread(n)}
                        className="py-2 rounded-lg text-sm font-bold transition-colors"
                        style={minimumDaysSpread === n
                          ? { background: 'rgba(233,195,73,0.20)', border: '1px solid rgba(233,195,73,0.50)', color: '#e9c349' }
                          : { background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.10)', color: '#6B7280' }
                        }
                      >{n}</button>
                    ))}
                  </div>
                </div>
              </div>

              <button
                onClick={handleMoveToNew}
                disabled={!routeName.trim() || !dueDate || isMoving}
                className="w-full py-3 rounded-xl font-bold text-sm flex items-center justify-center gap-2"
                style={{
                  background: (!routeName.trim() || !dueDate || isMoving) ? 'rgba(255,255,255,0.05)' : 'rgba(34,197,94,0.18)',
                  border: (!routeName.trim() || !dueDate || isMoving) ? '1px solid rgba(255,255,255,0.10)' : '1px solid rgba(34,197,94,0.45)',
                  color: (!routeName.trim() || !dueDate || isMoving) ? '#4B5563' : '#22c55e',
                  cursor: (!routeName.trim() || !dueDate || isMoving) ? 'not-allowed' : 'pointer'
                }}
              >
                {isMoving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                {isMoving ? 'Creating & Moving...' : 'Create Route & Move'}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
