import React from 'react';
import { useNavigate } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import { format } from 'date-fns';
import { Clock, MapPin, User } from 'lucide-react';
import { Badge } from '@/components/ui/badge';

export default function ScheduledServeCard({ serve }) {
  const navigate = useNavigate();
  const dt = new Date(serve.scheduled_datetime);

  const handleClick = () => {
    // Navigate to the parent route with a filter showing only this address
    navigate(createPageUrl(`WorkerRouteDetail?id=${serve.route_id}&addressId=${serve.address_id}`));
  };

  return (
    <div
      onClick={handleClick}
      className="rounded-2xl shadow-sm overflow-hidden cursor-pointer transition-all duration-200 hover:shadow-lg hover:scale-[1.01] active:scale-[0.99] bg-blue-50 border-2 border-blue-200"
    >
      {/* Scheduled banner */}
      <div className="px-4 py-2 bg-blue-100 border-b border-blue-200">
        <div className="flex items-center gap-2">
          <Clock className="w-4 h-4 text-blue-600" />
          <span className="text-xs font-bold text-blue-700 uppercase tracking-wide">Scheduled Serve</span>
        </div>
      </div>

      <div className="px-4 py-3">
        {/* Defendant Name */}
        {serve.defendant_name && (
          <h3 className="text-lg font-bold text-gray-900 leading-tight mb-1">
            {serve.defendant_name}
          </h3>
        )}

        {/* Date/Time */}
        <div className="flex items-center gap-2 text-sm text-blue-700 font-semibold mb-2">
          <Clock className="w-4 h-4" />
          {format(dt, "EEE, MMM d 'at' h:mm a")}
        </div>

        {/* Route name */}
        <div className="flex items-center gap-2 text-xs text-gray-500">
          <MapPin className="w-3.5 h-3.5" />
          <span>{serve.folder_name || 'Route'}</span>
          {serve.location_type === 'meeting' && (
            <Badge className="bg-purple-100 text-purple-700 text-[10px]">Meeting Place</Badge>
          )}
        </div>
      </div>
    </div>
  );
}