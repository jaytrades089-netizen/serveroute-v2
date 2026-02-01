import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { MapPin, Clock, User } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';

export default function WorkerLocationMap({ workers = [], mapquestApiKey }) {
  const activeWorkers = workers.filter(w => 
    w.current_location && 
    w.worker_status === 'active'
  );

  const getMapUrl = () => {
    if (!mapquestApiKey || activeWorkers.length === 0) {
      // Default map centered on Detroit
      return `https://www.mapquestapi.com/staticmap/v5/map?key=${mapquestApiKey || 'demo'}&center=42.3314,-83.0458&zoom=10&size=600,300&type=light`;
    }

    // Build markers
    const locations = activeWorkers.map((w, i) => {
      const { latitude, longitude } = w.current_location;
      return `${latitude},${longitude}|marker-${i + 1}`;
    }).join('||');

    // Calculate center
    const avgLat = activeWorkers.reduce((sum, w) => sum + w.current_location.latitude, 0) / activeWorkers.length;
    const avgLng = activeWorkers.reduce((sum, w) => sum + w.current_location.longitude, 0) / activeWorkers.length;

    return `https://www.mapquestapi.com/staticmap/v5/map?key=${mapquestApiKey}&center=${avgLat},${avgLng}&zoom=11&size=600,300&locations=${locations}&type=light`;
  };

  const getTimeAgo = (timestamp) => {
    if (!timestamp) return 'Unknown';
    return formatDistanceToNow(new Date(timestamp), { addSuffix: true });
  };

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center gap-2">
          <MapPin className="w-4 h-4" />
          Worker Locations
          <span className="text-sm font-normal text-gray-500">
            ({activeWorkers.length} active)
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent>
        {/* Map Image */}
        <div className="rounded-lg overflow-hidden bg-gray-100 mb-4">
          {mapquestApiKey ? (
            <img 
              src={getMapUrl()} 
              alt="Worker locations map"
              className="w-full h-48 object-cover"
            />
          ) : (
            <div className="w-full h-48 flex items-center justify-center text-gray-500">
              <div className="text-center">
                <MapPin className="w-8 h-8 mx-auto mb-2 text-gray-400" />
                <p className="text-sm">MapQuest API key required</p>
                <p className="text-xs">Set in Settings → API Keys</p>
              </div>
            </div>
          )}
        </div>

        {/* Worker List */}
        <div className="space-y-2">
          {activeWorkers.length === 0 ? (
            <p className="text-sm text-gray-500 text-center py-2">
              No active workers with location data
            </p>
          ) : (
            activeWorkers.map((worker, index) => (
              <div 
                key={worker.id}
                className="flex items-center justify-between py-2 border-b last:border-0"
              >
                <div className="flex items-center gap-2">
                  <div className="w-6 h-6 rounded-full bg-blue-500 text-white flex items-center justify-center text-xs font-bold">
                    {index + 1}
                  </div>
                  <div>
                    <p className="text-sm font-medium">{worker.full_name}</p>
                    <p className="text-xs text-gray-500">
                      {worker.current_route_id ? 'On route' : 'Available'}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-1 text-xs text-gray-500">
                  <Clock className="w-3 h-3" />
                  {getTimeAgo(worker.current_location?.updated_at)}
                </div>
              </div>
            ))
          )}

          {/* Offline workers */}
          {workers.filter(w => !w.current_location || w.worker_status !== 'active').slice(0, 3).map(worker => (
            <div 
              key={worker.id}
              className="flex items-center gap-2 py-2 opacity-50"
            >
              <div className="w-6 h-6 rounded-full bg-gray-300 flex items-center justify-center">
                <User className="w-3 h-3 text-gray-500" />
              </div>
              <span className="text-sm text-gray-500">{worker.full_name} - Offline</span>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}