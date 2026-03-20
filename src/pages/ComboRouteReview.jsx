import React, { useMemo } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { Link, useNavigate } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import { ChevronLeft, Loader2, MapPin, AlertCircle, FolderOpen } from 'lucide-react';
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
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-purple-500" />
      </div>
    );
  }

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

  return (
    <div className="min-h-screen bg-gray-50 pb-24">
      <header className="bg-purple-500 text-white px-4 py-3 flex items-center gap-3">
        <Link to={createPageUrl('WorkerRoutes')}>
          <ChevronLeft className="w-6 h-6" />
        </Link>
        <div>
          <h1 className="font-bold text-lg">Review Combo Route</h1>
          <p className="text-sm text-purple-100">{addresses.length} addresses across {routes.length} folders</p>
        </div>
      </header>

      <main className="px-4 py-4 max-w-lg mx-auto">
        {groupedBlocks.map((block, blockIdx) => (
          <div key={`${block.route_id}-${blockIdx}`} className="mb-4">
            {/* Folder header */}
            <div className="flex items-center gap-2 mb-2 px-1">
              <FolderOpen className="w-4 h-4 text-purple-500" />
              <h2 className="text-sm font-bold text-gray-800">{block.folder_name}</h2>
              <span className="text-xs text-gray-400">({block.addresses.length})</span>
            </div>

            <div className="space-y-2">
              {block.addresses.map((addr) => {
                const formatted = formatAddress(addr);
                return (
                  <div
                    key={addr.id}
                    className="bg-white border border-gray-200 rounded-xl p-3 flex items-center gap-3"
                  >
                    <div className="w-8 h-8 rounded-full bg-purple-100 text-purple-600 flex items-center justify-center font-bold text-sm flex-shrink-0">
                      {addr.order_index || '?'}
                    </div>
                    <div className="min-w-0 flex-1">
                      {addr.defendant_name && (
                        <p className="text-xs font-medium text-gray-500 truncate">{addr.defendant_name}</p>
                      )}
                      <p className="text-sm font-semibold text-gray-900 truncate">{formatted.line1}</p>
                      <p className="text-xs text-gray-500 truncate">{formatted.line2}</p>
                    </div>
                    {addr.serve_type && (
                      <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold flex-shrink-0 ${
                        addr.serve_type === 'posting' ? 'bg-green-100 text-green-700' :
                        addr.serve_type === 'garnishment' ? 'bg-purple-100 text-purple-700' :
                        'bg-blue-100 text-blue-700'
                      }`}>
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
        <Button
          onClick={() => navigate(createPageUrl(`WorkerComboRouteDetail?id=${comboId}`))}
          className="w-full bg-purple-500 hover:bg-purple-600 text-white font-bold py-6 text-lg rounded-xl mt-4"
        >
          Start Combo Route
        </Button>
      </main>


    </div>
  );
}