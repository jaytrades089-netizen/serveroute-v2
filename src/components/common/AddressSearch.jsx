import React, { useState, useMemo, useRef } from 'react';
import { Search, Archive, X, FolderOpen, CheckCircle, Clock } from 'lucide-react';
import { Button } from '@/components/ui/button';

export default function AddressSearch({ routes = [], addresses = [], workers = [], isBossView = false }) {
  const [query, setQuery] = useState('');
  const [includeArchived, setIncludeArchived] = useState(false);
  const inputRef = useRef(null);

  const routeMap = useMemo(() => {
    const map = {};
    routes.forEach(r => { map[r.id] = r; });
    return map;
  }, [routes]);

  const workerMap = useMemo(() => {
    const map = {};
    workers.forEach(w => { map[w.id] = w; });
    return map;
  }, [workers]);

  const validRouteIds = useMemo(() => {
    const ids = new Set();
    routes.forEach(r => {
      if (r.deleted_at) return;
      if (!includeArchived && r.status === 'archived') return;
      ids.add(r.id);
    });
    return ids;
  }, [routes, includeArchived]);

  const results = useMemo(() => {
    const trimmed = query.trim();
    if (trimmed.length < 2) return [];
    const lower = trimmed.toLowerCase();
    return addresses
      .filter(addr => {
        if (!validRouteIds.has(addr.route_id)) return false;
        const legal = (addr.legal_address || '').toLowerCase();
        const normalized = (addr.normalized_address || '').toLowerCase();
        return legal.includes(lower) || normalized.includes(lower);
      })
      .slice(0, 20);
  }, [query, addresses, validRouteIds]);

  const handleClear = () => {
    setQuery('');
    inputRef.current?.focus();
  };

  const getStatusDisplay = (addr) => {
    if (addr.status === 'completed') {
      return { label: 'Served', color: 'bg-green-100 text-green-700', Icon: CheckCircle };
    }
    return { label: 'Pending', color: 'bg-yellow-100 text-yellow-700', Icon: Clock };
  };

  return (
    <div className="mb-4">
      <div className="flex gap-2 items-center">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Search addresses across all folders..."
            className="w-full pl-9 pr-8 py-2.5 text-sm border border-gray-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-400 focus:border-blue-400"
          />
          {query.length > 0 && (
            <button
              onClick={handleClear}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
        <Button
          variant={includeArchived ? 'default' : 'outline'}
          size="sm"
          onClick={() => setIncludeArchived(v => !v)}
          className={includeArchived ? 'bg-amber-500 hover:bg-amber-600 border-amber-500 text-white' : 'text-gray-500'}
        >
          <Archive className="w-4 h-4 mr-1" />
          Archived
        </Button>
      </div>

      {query.trim().length >= 2 && (
        <div className="mt-2 border border-gray-200 rounded-lg bg-white shadow-sm overflow-hidden">
          {results.length === 0 ? (
            <div className="px-4 py-5 text-center text-sm text-gray-500">
              No addresses found{!includeArchived ? ' in active routes' : ''}.
              {!includeArchived && (
                <button
                  onClick={() => setIncludeArchived(true)}
                  className="ml-1 text-blue-500 underline"
                >
                  Search archived too?
                </button>
              )}
            </div>
          ) : (
            <>
              <div className="px-3 py-2 bg-gray-50 border-b border-gray-100">
                <span className="text-xs text-gray-500 font-medium">
                  {results.length} result{results.length !== 1 ? 's' : ''}
                  {includeArchived ? ' (including archived)' : ''}
                </span>
              </div>
              <ul className="divide-y divide-gray-100 max-h-72 overflow-y-auto">
                {results.map(addr => {
                  const route = routeMap[addr.route_id];
                  const { label, color, Icon } = getStatusDisplay(addr);
                  const worker = isBossView && route?.worker_id ? workerMap[route.worker_id] : null;
                  const isArchived = route?.status === 'archived';
                  return (
                    <li key={addr.id} className="px-4 py-3">
                      <div className="flex items-center gap-1.5 mb-1">
                        <FolderOpen className="w-3.5 h-3.5 text-blue-500 flex-shrink-0" />
                        <span className="text-xs font-semibold text-blue-600 truncate">
                          {route?.folder_name || 'Unknown Folder'}
                        </span>
                        {addr.order_index != null && (
                          <span className="ml-1 text-xs text-gray-400">#{addr.order_index}</span>
                        )}
                        {isArchived && (
                          <span className="ml-1 text-xs bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded-full">Archived</span>
                        )}
                      </div>
                      <p className="text-sm text-gray-800 leading-snug">
                        {addr.legal_address || addr.normalized_address}
                      </p>
                      <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                        <span className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full ${color}`}>
                          <Icon className="w-3 h-3" />
                          {label}
                        </span>
                        {isBossView && worker && (
                          <span className="text-xs text-gray-500">
                            {worker.full_name || worker.email}
                          </span>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
            </>
          )}
        </div>
      )}
    </div>
  );
}