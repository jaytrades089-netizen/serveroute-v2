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
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000
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
      return results.flat().sort((a, b) => (a.order_index || 999) - (b.order_index || 999));
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

  // Group addresses by folder for physical folder organization display
  const groupedBlocks = useMemo(() => {
    if (addresses.length === 0) return [];
    const byRoute = {};
    const routeIdOrder = combo?.route_ids || [];
    
    for (const addr of addresses) {
      if (!byRoute[addr.route_id]) {
        byRoute[addr.route_id] = {
          route_id: addr.route_id,
          folder_name: routeNameMap[addr.route_id] || 'Unknown Folder',
          addresses: []
        };
      }
      byRoute[addr.route_id].addresses.push(addr);
    }
    
    // Sort addresses within each folder by order_index
    Object.values(byRoute).forEach(block => {
      block.addresses.sort((a, b) => (a.order_index || 999) - (b.order_index || 999));
    });
    
    return routeIdOrder
      .filter(rid => byRoute[rid])
      .map(rid => byRoute[rid]);
  }, [addresses, routeNameMap, combo?.route_ids]);

  if (comboLoading || addressesLoading) {
    return (
      <div style={{ minHeight: '100vh', background: 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Loader2 className="w-8 h-8 animate-spin" style={{ color: '#e9c349' }} />
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
                      {addr.order_index || '?'}
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