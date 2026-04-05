import React from 'react';
import { useNavigate } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import { Shuffle, ChevronRight, Play } from 'lucide-react';
import { format } from 'date-fns';

export default function ComboRouteCard({ combo, routes = [] }) {
  const navigate = useNavigate();

  const folderNames = routes
    .filter(r => combo.route_ids?.includes(r.id))
    .map(r => r.folder_name)
    .filter(Boolean);

  const displayDate = combo.created_date
    ? format(new Date(combo.created_date), 'MMM d')
    : '';

  return (
    <div
      onClick={() => navigate(createPageUrl(`WorkerComboRouteDetail?id=${combo.id}`))}
      className="cursor-pointer hover:opacity-90 active:scale-[0.99] transition-all duration-200"
      style={{ background: 'rgba(14,20,44,0.55)', backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)', border: '1px solid rgba(233,195,73,0.40)', borderRadius: '1rem' }}
    >
      {/* Active Banner */}
      <div className="px-3 py-1.5 rounded-t-2xl flex items-center gap-2" style={{ background: 'rgba(233,195,73,0.15)', borderBottom: '1px solid rgba(233,195,73,0.30)' }}>
        <span className="relative flex h-2.5 w-2.5">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full opacity-75" style={{ background: '#e9c349' }} />
          <span className="relative inline-flex rounded-full h-2.5 w-2.5" style={{ background: '#e9c349' }} />
        </span>
        <span className="text-xs font-bold uppercase tracking-wide" style={{ color: '#e9c349' }}>Active Combo Route</span>
      </div>

      <div className="px-4 py-3 flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: 'rgba(233,195,73,0.15)' }}>
          <Shuffle className="w-5 h-5" style={{ color: '#e9c349' }} />
        </div>
        <div className="flex-1 min-w-0">
          {folderNames.length > 0 && (
            <div className="flex flex-wrap gap-1 mb-1">
              {folderNames.map((name, i) => (
                <span key={i} className="text-[10px] font-bold px-2 py-0.5 rounded-full" style={{ background: 'rgba(233,195,73,0.18)', color: '#e9c349', border: '1px solid rgba(233,195,73,0.35)' }}>
                  {name}
                </span>
              ))}
            </div>
          )}
          <div className="flex items-center gap-3 text-xs" style={{ color: '#8a7f87' }}>
            <span><span className="font-bold" style={{ color: '#e6e1e4' }}>{combo.total_addresses || 0}</span> addresses</span>
            <span><span className="font-bold" style={{ color: '#e6e1e4' }}>{folderNames.length}</span> folders</span>
          </div>
        </div>
        <div className="flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl flex-shrink-0" style={{ background: 'rgba(233,195,73,0.18)', border: '1px solid rgba(233,195,73,0.40)' }}>
          <Play className="w-3.5 h-3.5" style={{ color: '#e9c349' }} />
          <span className="text-xs font-bold" style={{ color: '#e9c349' }}>Continue</span>
        </div>
      </div>
    </div>
  );
}