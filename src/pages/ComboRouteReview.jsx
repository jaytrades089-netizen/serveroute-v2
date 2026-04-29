import React, { useMemo } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { Link, useNavigate } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import { ChevronLeft, Loader2, MapPin, AlertCircle, FolderOpen, Clock, CheckCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { formatAddress } from '@/components/utils/addressUtils';


export default function ComboRouteReview() {
  const navigate = useNavigate();
  const urlParams = new URLSearchParams(window.location.search);
  const comboId = urlParams.get('id');

  const { data: combo, isLoading: comboLoading } = useQuery({
    queryKey: ['comboRoute', comboId],
    queryFn: async () => {
      if (!comboId) return null;
      const results = await base44.entities.ComboRoute.filter({ id: comboId });
      return results[0] || null;
    },
    enabled: !!comboId,
    staleTime: 0,
    gcTime: 10 * 60 * 1000,
    // Retry every 3s until the record appears — handles Base44 propagation delay after create
    refetchInterval: (query) => (!query.state.data ? 3000 : false),
  });

  const { data: routes = [] } = useQuery({
    queryKey: ['comboRoutes', combo?.route_ids],
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
    queryKey: ['comboAddresses', combo?.route_ids],
    queryFn: async () => {
      if (!combo?.route_ids) return [];
      const results = await Promise.all(
        combo.route_ids.map(rid => base44.entities.Address.filter({ route_id: rid, deleted_at: null, served: false }))
      );
      // Return flat unsorted — display order is derived via optimized_order useMemo below.
      return results.flat();
    },
    enabled: !!combo?.route_ids,
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000
  });

  // Build route name map
  const routeNameMap = useMemo(() => {
    const map = {};
    routes.forEach(r => { map[r.id] = r.folder_name; });
    return map;
  }, [routes]);

  // Sort addresses using combo.optimized_order — same source as WorkerComboRouteDetail.
  // This guarantees the review screen and the running route show identical order.
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

  // Global serve-order numbers derived from sortedAddresses so they work
  // whether or not combo.optimized_order exists.
  const globalOrderMap = useMemo(() => {
    const map = {};
    sortedAddresses.forEach((addr, idx) => { map[addr.id] = idx + 1; });
    return map;
  }, [sortedAddresses]);

  // Group addresses by folder for physical folder organization display.
  // Uses sortedAddresses (optimized_order based) not raw addresses.
  const groupedBlocks = useMemo(() => {
    if (sortedAddresses.length === 0) return [];
    const byRoute = {};
    
    for (const addr of sortedAddresses) {
      if (!byRoute[addr.route_id]) {
        byRoute[addr.route_id] = {
          route_id: addr.route_id,
          folder_name: routeNameMap[addr.route_id] || 'Unknown Folder',
          addresses: []
        };
      }
      byRoute[addr.route_id].addresses.push(addr);
    }

    // Determine folder order by the position of each folder's first address in the optimized list
    const folderFirstIndex = {};
    sortedAddresses.forEach((addr, idx) => {
      if (folderFirstIndex[addr.route_id] === undefined) {
        folderFirstIndex[addr.route_id] = idx;
      }
    });
    
    return Object.values(byRoute).sort((a, b) => {
      return (folderFirstIndex[a.route_id] ?? Infinity) - (folderFirstIndex[b.route_id] ?? Infinity);
    });
  }, [sortedAddresses, routeNameMap]);

  if (comboLoading || addressesLoading || (comboId && !combo && !comboLoading)) {
    return (
      <div style={{ minHeight: '100vh', background: 'transparent', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12 }}>
        <Loader2 className="w-8 h-8 animate-spin" style={{ color: '#e9c349' }} />
        <p className="text-sm" style={{ color: '#8a7f87' }}>Loading combo route...</p>
      </div>
    );
  }

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

  return (
    <div style={{ minHeight: '100vh', background: 'transparent', paddingBottom: 24 }}>
      <header style={{ background: 'rgba(11,15,30,0.75)', backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)', borderBottom: '1px solid rgba(255,255,255,0.08)', color: '#e6e1e4', padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 12, position: 'sticky', top: 0, zIndex: 50 }}>
        <Link to={createPageUrl('WorkerRoutes')} className="flex items-center justify-center w-10 h-10 rounded-lg hover:bg-white/10 active:bg-white/20 transition-colors" style={{ border: '1px solid #363436' }}>
          <ChevronLeft className="w-6 h-6" />
        </Link>
        <div>
          <h1 className="font-bold text-lg" style={{ color: '#e6e1e4' }}>Review Combo Route</h1>
          <p className="text-sm" style={{ color: '#8a7f87' }}>{addresses.length} addresses across {routes.length} folders</p>
        </div>
      </header>

      <main className="px-4 py-4 max-w-lg mx-auto">
        {(combo.total_miles > 0 || combo.total_drive_time_minutes > 0) && (() => {
          const mins = combo.total_drive_time_minutes || 0;
          const driveLabel = mins >= 60 ? `${Math.floor(mins / 60)}h ${mins % 60}m` : mins > 0 ? `${mins}m` : '—';
          const estDone = mins > 0
            ? new Date(Date.now() + mins * 60000).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', hour12: true })
            : '—';
          return (
            <div className="rounded-2xl mb-4" style={{ background: 'rgba(14,20,44,0.55)', backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)', border: '1px solid rgba(255,255,255,0.10)' }}>
              <div className="grid grid-cols-3 gap-3 p-4">
                <div className="flex flex-col items-center text-center">
                  <MapPin className="w-4 h-4 mb-1" style={{ color: '#e9c349' }} />
                  <span className="text-lg font-bold" style={{ color: '#e9c349' }}>{combo.total_miles?.toFixed(1) || '—'} mi</span>
                  <span className="text-xs" style={{ color: '#6B7280' }}>Total Miles</span>
                </div>
                <div className="flex flex-col items-center text-center">
                  <Clock className="w-4 h-4 mb-1" style={{ color: '#e9c349' }} />
                  <span className="text-lg font-bold" style={{ color: '#e9c349' }}>{driveLabel}</span>
                  <span className="text-xs" style={{ color: '#6B7280' }}>Drive Time</span>
                </div>
                <div className="flex flex-col items-center text-center">
                  <CheckCircle className="w-4 h-4 mb-1" style={{ color: '#22c55e' }} />
                  <span className="text-lg font-bold" style={{ color: '#22c55e' }}>{estDone}</span>
                  <span className="text-xs" style={{ color: '#6B7280' }}>Est. Done</span>
                </div>
              </div>
            </div>
          );
        })()}
        {groupedBlocks.map((block, blockIdx) => (
          <div key={`${block.route_id}-${blockIdx}`} className="mb-4">
            {/* Folder header */}
            <div className="flex items-center gap-2 mb-2 px-2 py-1.5 rounded-lg" style={{ background: 'rgba(233,195,73,0.15)', border: '1px solid rgba(233,195,73,0.35)' }}>
              <FolderOpen className="w-4 h-4" style={{ color: '#e9c349' }} />
              <h2 className="text-sm font-bold" style={{ color: '#e9c349' }}>{block.folder_name}</h2>
              <span className="text-xs" style={{ color: '#8a7f87' }}>({block.addresses.length})</span>
            </div>

            <div className="space-y-2">
              {block.addresses.map((addr) => {
                const formatted = formatAddress(addr);
                return (
                  <div
                    key={addr.id}
                    className="rounded-xl p-3 flex items-center gap-3"
                    style={{ background: 'rgba(14,20,44,0.55)', border: '1px solid rgba(255,255,255,0.10)' }}
                  >
                    <div className="w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm flex-shrink-0" style={{ background: 'rgba(233,195,73,0.20)', color: '#e9c349' }}>
                      {globalOrderMap[addr.id] ?? '?'}
                    </div>
                    <div className="min-w-0 flex-1">
                      {addr.defendant_name && (
                        <p className="text-xs font-medium truncate" style={{ color: '#8a7f87' }}>{addr.defendant_name}</p>
                      )}
                      <p className="text-sm font-semibold truncate" style={{ color: '#e6e1e4' }}>{formatted.line1}</p>
                      <p className="text-xs truncate" style={{ color: '#6B7280' }}>{formatted.line2}</p>
                    </div>
                    {addr.serve_type && (
                      <span className="text-[10px] px-2 py-0.5 rounded-full font-bold flex-shrink-0" style={{ background: 'rgba(233,195,73,0.15)', color: '#e9c349', border: '1px solid rgba(233,195,73,0.30)' }}>
                        {addr.serve_type.toUpperCase()}
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        ))}

        {/* Start Button */}
        <button
          onClick={() => navigate(createPageUrl(`WorkerComboRouteDetail?id=${comboId}`))}
          className="w-full rounded-xl py-4 font-bold text-base flex items-center justify-center gap-2 mt-4 transition-opacity hover:opacity-90"
          style={{ background: 'rgba(233,195,73,0.20)', border: '1px solid rgba(233,195,73,0.50)', color: '#e9c349' }}
        >
          Start Combo Route
        </button>
      </main>


    </div>
  );
}