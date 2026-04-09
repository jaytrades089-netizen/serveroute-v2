import React from 'react';
import { useNavigate } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import { format } from 'date-fns';
import { Clock, MapPin } from 'lucide-react';

export default function ScheduledServeCard({ serve }) {
  const navigate = useNavigate();
  const dt = new Date(serve.scheduled_datetime);

  const handleClick = () => {
    navigate(createPageUrl(`WorkerRouteDetail?id=${serve.route_id}&addressId=${serve.address_id}`));
  };

  return (
    <div
      onClick={handleClick}
      className="rounded-2xl overflow-hidden cursor-pointer transition-all duration-200 hover:opacity-90 active:scale-[0.99]"
      style={{
        background: 'rgba(14, 20, 44, 0.55)',
        backdropFilter: 'blur(20px)',
        WebkitBackdropFilter: 'blur(20px)',
        border: '2px solid #e9c349',
        boxShadow: '0 0 12px rgba(233,195,73,0.35), inset 0 0 0 1px rgba(233,195,73,0.15)'
      }}
    >
      {/* Gold banner header */}
      <div
        className="px-4 py-2 flex items-center gap-2"
        style={{
          background: 'rgba(233,195,73,0.18)',
          borderBottom: '1px solid rgba(233,195,73,0.40)'
        }}
      >
        <Clock className="w-4 h-4 flex-shrink-0" style={{ color: '#e9c349' }} />
        <span className="text-xs font-bold uppercase tracking-wide" style={{ color: '#e9c349' }}>
          Scheduled Serve
        </span>
        {serve.location_type === 'meeting' && (
          <span
            className="ml-auto text-[10px] font-semibold rounded px-1.5 py-0.5 uppercase"
            style={{ background: 'rgba(229,179,225,0.20)', color: '#e5b9e1', border: '1px solid rgba(229,179,225,0.35)' }}
          >
            Meeting Place
          </span>
        )}
      </div>

      <div className="px-4 py-3">
        {/* Defendant Name */}
        {serve.defendant_name && (
          <h3 className="text-base font-bold leading-tight mb-1" style={{ color: '#E6E1E4' }}>
            {serve.defendant_name}
          </h3>
        )}

        {/* Date/Time */}
        <div className="flex items-center gap-2 mb-2">
          <Clock className="w-3.5 h-3.5 flex-shrink-0" style={{ color: '#e9c349' }} />
          <span className="text-sm font-semibold" style={{ color: '#e9c349' }}>
            {format(dt, "EEE, MMM d 'at' h:mm a")}
          </span>
        </div>

        {/* Route name */}
        <div className="flex items-center gap-2">
          <MapPin className="w-3.5 h-3.5 flex-shrink-0" style={{ color: '#6B7280' }} />
          <span className="text-xs" style={{ color: '#9CA3AF' }}>
            {serve.folder_name || 'Route'}
          </span>
        </div>
      </div>
    </div>
  );
}
