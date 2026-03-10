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
      className="rounded-2xl shadow-md overflow-hidden cursor-pointer hover:shadow-lg hover:scale-[1.01] active:scale-[0.99] transition-all duration-200 ring-2 ring-purple-500 ring-offset-2 shadow-purple-500/30 bg-white border border-purple-200"
    >
      {/* Active Banner */}
      <div className="px-4 py-2 bg-purple-500 border-b border-purple-600">
        <div className="flex items-center gap-2">
          <span className="relative flex h-3 w-3">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-white opacity-75" />
            <span className="relative inline-flex rounded-full h-3 w-3 bg-white" />
          </span>
          <span className="text-xs font-bold text-white uppercase tracking-wide">
            Active Combo Route
          </span>
        </div>
      </div>

      <div className="px-4 pt-4 pb-3">
        <div className="flex items-start gap-3">
          <div className="w-12 h-12 rounded-xl bg-purple-100 flex items-center justify-center flex-shrink-0">
            <Shuffle className="w-6 h-6 text-purple-600" />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="text-lg font-bold text-gray-900">Combo Route</h3>
            {displayDate && (
              <p className="text-sm text-gray-500">{displayDate}</p>
            )}
          </div>
          <ChevronRight className="w-5 h-5 text-purple-400 mt-1 flex-shrink-0" />
        </div>
      </div>

      {/* Folder list */}
      {folderNames.length > 0 && (
        <div className="px-4 pb-3">
          <div className="flex flex-wrap gap-1.5">
            {folderNames.map((name, i) => (
              <span
                key={i}
                className="text-xs font-bold px-2.5 py-1 rounded-full bg-purple-100 text-purple-700 border border-purple-200"
              >
                {name}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Stats */}
      <div className="px-4 pb-3">
        <div className="flex items-center gap-4 text-sm">
          <span className="text-gray-500">
            <span className="font-bold text-purple-600">{combo.total_addresses || 0}</span> addresses
          </span>
          <span className="text-gray-500">
            <span className="font-bold text-purple-600">{folderNames.length}</span> folders
          </span>
        </div>
      </div>

      {/* Continue Button */}
      <div className="px-4 py-3 border-t border-purple-100">
        <div className="flex items-center justify-center gap-2 py-2 rounded-xl bg-purple-500 text-white font-bold text-sm">
          <Play className="w-4 h-4" />
          Continue Combo Route
        </div>
      </div>
    </div>
  );
}