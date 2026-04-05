import React, { useState, useMemo, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import { Search, Archive, X, FolderOpen, ChevronRight, User, MapPin, Building2, Hash, Map } from 'lucide-react';
import { Button } from '@/components/ui/button';

const FILTER_OPTIONS = [
  { key: 'name', label: 'Name', icon: User },
  { key: 'address', label: 'Address', icon: MapPin },
  { key: 'city', label: 'City', icon: Building2 },
  { key: 'state', label: 'State', icon: Map },
  { key: 'zip', label: 'Zip', icon: Hash },
];

export default function AddressSearch({ routes = [], addresses = [], workers = [], isBossView = false, className, showArchivedToggle = false, archivedOnly = false, onToggleArchived }) {
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const [includeArchived, setIncludeArchived] = useState(false);
  const [filters, setFilters] = useState(['name', 'address']);
  const [showFilters, setShowFilters] = useState(false);
  const inputRef = useRef(null);
  const containerRef = useRef(null);

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
      if (archivedOnly) {
        if (r.status !== 'archived') return;
      } else if (!includeArchived && r.status === 'archived') {
        return;
      }
      ids.add(r.id);
    });
    return ids;
  }, [routes, includeArchived, archivedOnly]);

  const toggleFilter = (key) => {
    setFilters(prev => {
      if (prev.includes(key)) {
        if (prev.length === 1) return prev; // keep at least one
        return prev.filter(f => f !== key);
      }
      return [...prev, key];
    });
  };

  const results = useMemo(() => {
    const trimmed = query.trim();
    if (trimmed.length < 2) return [];
    const lower = trimmed.toLowerCase();
    const words = lower.split(/\s+/).filter(w => w.length > 0);

    return addresses
      .filter(addr => {
        if (!validRouteIds.has(addr.route_id)) return false;

        // Build searchable fields based on active filters
        const fields = [];
        if (filters.includes('name')) {
          fields.push({ text: (addr.defendant_name || '').toLowerCase(), wordStart: true });
        }
        if (filters.includes('address')) {
          fields.push({ text: (addr.legal_address || '').toLowerCase(), wordStart: false });
          fields.push({ text: (addr.normalized_address || '').toLowerCase(), wordStart: false });
        }
        if (filters.includes('city')) {
          fields.push({ text: (addr.city || '').toLowerCase(), wordStart: true });
        }
        if (filters.includes('state')) {
          fields.push({ text: (addr.state || '').toLowerCase(), wordStart: true });
        }
        if (filters.includes('zip')) {
          fields.push({ text: (addr.zip || '').toLowerCase(), wordStart: false });
        }

        if (fields.length === 0) return false;

        return words.every(w =>
          fields.some(f => {
            if (f.wordStart) {
              const fWords = f.text.split(/\s+/);
              return fWords.some(fw => fw.startsWith(w));
            }
            return f.text.includes(w);
          })
        );
      })
      .slice(0, 20);
  }, [query, addresses, validRouteIds, filters]);

  const handleClear = () => {
    setQuery('');
    inputRef.current?.focus();
  };

  const handleSelectAddress = (addr) => {
    setQuery('');
    const detailPage = isBossView ? 'BossRouteDetail' : 'WorkerRouteDetail';
    navigate(createPageUrl(`${detailPage}?id=${addr.route_id}&addressId=${addr.id}`));
  };

  return (
    <div className={className !== undefined ? className : "mb-4"}>
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 pointer-events-none" style={{ color: '#8a7f87' }} />
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={e => setQuery(e.target.value)}
          onFocus={() => setShowFilters(true)}
          onBlur={(e) => {
            // Don't hide if clicking inside the container
            if (containerRef.current?.contains(e.relatedTarget)) return;
            if (query.trim().length === 0) setShowFilters(false);
          }}
          placeholder={`Search by ${filters.join(', ')}...`}
          className="w-full pl-9 pr-8 py-2.5 text-sm rounded-lg focus:outline-none"
          style={{ background: '#201f21', border: '1px solid #363436', color: '#e6e1e4' }}
        />
        {query.length > 0 && (
          <button
            onClick={handleClear}
            className="absolute right-2.5 top-1/2 -translate-y-1/2"
            style={{ color: '#8a7f87' }}
          >
            <X className="w-4 h-4" />
          </button>
        )}

      {/* Filter chips - show when focused and no text typed */}
      {showFilters && query.trim().length === 0 && (
        <div ref={containerRef} className="absolute left-0 right-0 top-full mt-1 z-50 rounded-lg p-3" style={{ background: '#201f21', border: '1px solid #363436', borderRadius: 8, boxShadow: '0 8px 24px rgba(0,0,0,0.4)' }}>
          {showArchivedToggle && onToggleArchived && (
            <button
              type="button"
              tabIndex={0}
              onMouseDown={e => e.preventDefault()}
              onClick={onToggleArchived}
              className="w-full flex items-center justify-between px-3 py-2 mb-3 rounded-lg text-sm font-medium border transition-colors"
              style={archivedOnly ? { background: '#502f50', color: '#e5b9e1', border: '1px solid #e5b9e1' } : { background: '#1c1b1d', color: '#8a7f87', border: '1px solid #363436' }}
            >
              <span className="flex items-center gap-2">
                <Archive className="w-4 h-4" />
                {archivedOnly ? 'Showing archived' : 'Show archived'}
              </span>
              <span className="text-xs">{archivedOnly ? 'On' : 'Off'}</span>
            </button>
          )}
          <p className="text-xs font-medium mb-2" style={{ color: '#8a7f87' }}>Search by:</p>
          <div className="flex flex-wrap gap-2">
            {FILTER_OPTIONS.map(opt => {
              const active = filters.includes(opt.key);
              const Icon = opt.icon;
              return (
                <button
                  key={opt.key}
                  tabIndex={0}
                  onMouseDown={e => e.preventDefault()}
                  onClick={() => toggleFilter(opt.key)}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border transition-colors"
                  style={active ? { background: '#502f50', color: '#e5b9e1', border: '1px solid #e5b9e1' } : { background: '#1c1b1d', color: '#8a7f87', border: '1px solid #363436' }}
                >
                  <Icon className="w-3 h-3" />
                  {opt.label}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {query.trim().length >= 2 && (
        <div className="absolute left-0 right-0 top-full mt-1 z-50 rounded-lg overflow-hidden" style={{ background: '#201f21', border: '1px solid #363436', boxShadow: '0 8px 24px rgba(0,0,0,0.4)' }}>
          {results.length === 0 ? (
            <div className="px-4 py-5 text-center text-sm" style={{ color: '#8a7f87' }}>
              No addresses found{!includeArchived ? ' in active routes' : ''}.
              {!includeArchived && (
                <button
                  onClick={() => setIncludeArchived(true)}
                  className="ml-1 underline"
                  style={{ color: '#e9c349' }}
                >
                  Search archived too?
                </button>
              )}
            </div>
          ) : (
            <>
              <div className="px-3 py-2" style={{ background: '#1c1b1d', borderBottom: '1px solid #363436' }}>
                <span className="text-xs font-medium" style={{ color: '#8a7f87' }}>
                  {results.length} result{results.length !== 1 ? 's' : ''}
                  {includeArchived ? ' (including archived)' : ''}
                </span>
              </div>
              <ul className="max-h-72 overflow-y-auto">
                {results.map(addr => {
                  const route = routeMap[addr.route_id];
                  const isArchived = route?.status === 'archived';
                  return (
                    <li 
                      key={addr.id} 
                      onClick={() => handleSelectAddress(addr)}
                      className="px-4 py-3 cursor-pointer transition-colors flex items-center justify-between hover:bg-white/5"
                      style={{ borderBottom: '1px solid #363436' }}
                    >
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5 mb-1">
                          <FolderOpen className="w-3.5 h-3.5 flex-shrink-0" style={{ color: '#e9c349' }} />
                          <span className="text-sm font-semibold truncate" style={{ color: '#e9c349' }}>
                            {route?.folder_name || 'Unknown Folder'}
                          </span>
                          {isArchived && (
                            <span className="ml-1 text-xs px-1.5 py-0.5 rounded-full" style={{ background: '#201f21', color: '#e9c349' }}>Archived</span>
                          )}
                        </div>
                        {addr.defendant_name && (
                          <p className="text-sm font-medium truncate" style={{ color: '#e6e1e4' }}>
                            {addr.defendant_name}
                          </p>
                        )}
                      </div>
                      <ChevronRight className="w-5 h-5 flex-shrink-0 ml-2" style={{ color: '#8a7f87' }} />
                    </li>
                  );
                })}
              </ul>
            </>
          )}
        </div>
      )}
      </div>
    </div>
  );
}