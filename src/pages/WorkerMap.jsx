import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import { getCompanyId } from '@/lib/utils';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { ArrowLeft, RefreshCw, Loader2, MapPin, Clock, User } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import BossBottomNav from '@/components/boss/BossBottomNav';
import { formatDistanceToNow } from 'date-fns';

const STATUS_COLORS = {
  active: { dot: 'bg-green-500', text: 'text-green-600', label: 'Online' },
  paused: { dot: 'bg-yellow-500', text: 'text-yellow-600', label: 'Idle' },
  offline: { dot: 'bg-gray-400', text: 'text-gray-500', label: 'Offline' }
};

export default function WorkerMap() {
  const queryClient = useQueryClient();
  const [isRefreshing, setIsRefreshing] = useState(false);

  const { data: user } = useQuery({
    queryKey: ['currentUser'],
    queryFn: () => base44.auth.me()
  });

  const companyId = getCompanyId(user);

  const { data: workers = [], isLoading } = useQuery({
    queryKey: ['mapWorkers', companyId],
    queryFn: async () => {
      if (!companyId) return [];
      const users = await base44.entities.User.list();
      return users.filter(u => u.company_id === companyId && u.role === 'server');
    },
    enabled: !!companyId,
    refetchInterval: 30000 // 30 seconds
  });

  const { data: routes = [] } = useQuery({
    queryKey: ['mapRoutes', companyId],
    queryFn: async () => {
      if (!companyId) return [];
      return base44.entities.Route.filter({ company_id: companyId, deleted_at: null });
    },
    enabled: !!companyId
  });

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await queryClient.invalidateQueries({ queryKey: ['mapWorkers'] });
    setIsRefreshing(false);
  };

  // Generate static map URL
  const generateMapUrl = () => {
    const locatedWorkers = workers.filter(w => 
      w.current_location?.latitude && w.current_location?.longitude
    );

    if (locatedWorkers.length === 0) return null;

    // Using OpenStreetMap static map service
    const markers = locatedWorkers.map(w => {
      return `${w.current_location.latitude},${w.current_location.longitude}`;
    }).join('|');

    // Calculate center
    const lats = locatedWorkers.map(w => w.current_location.latitude);
    const lngs = locatedWorkers.map(w => w.current_location.longitude);
    const centerLat = lats.reduce((a, b) => a + b, 0) / lats.length;
    const centerLng = lngs.reduce((a, b) => a + b, 0) / lngs.length;

    // Using a simple static map service
    return `https://maps.geoapify.com/v1/staticmap?style=osm-bright&width=600&height=400&center=lonlat:${centerLng},${centerLat}&zoom=10&apiKey=demo`;
  };

  const getWorkerCurrentAddress = (worker) => {
    // Find active route for this worker
    const activeRoute = routes.find(r => 
      r.worker_id === worker.id && 
      (r.status === 'active' || r.status === 'assigned')
    );
    
    if (activeRoute) {
      return activeRoute.folder_name;
    }
    
    if (worker.worker_status === 'paused' && worker.last_active_at) {
      const idleTime = formatDistanceToNow(new Date(worker.last_active_at), { addSuffix: false });
      return `Idle (${idleTime})`;
    }
    
    return 'No active route';
  };

  const locatedWorkers = workers.filter(w => 
    w.current_location?.latitude && w.current_location?.longitude
  );
  const offlineWorkers = workers.filter(w => w.worker_status === 'offline');
  const onlineWorkers = workers.filter(w => w.worker_status !== 'offline');

  return (
    <div className="min-h-screen bg-gray-50 pb-20">
      <header className="bg-blue-500 text-white px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link to={createPageUrl('BossDashboard')}>
            <ArrowLeft className="w-6 h-6" />
          </Link>
          <h1 className="font-bold text-lg">🗺️ Worker Map</h1>
        </div>
        <Button 
          size="sm" 
          variant="secondary" 
          onClick={handleRefresh}
          disabled={isRefreshing}
        >
          <RefreshCw className={`w-4 h-4 mr-1 ${isRefreshing ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </header>

      <main className="px-4 py-4 max-w-4xl mx-auto">
        {isLoading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
          </div>
        ) : (
          <>
            {/* Map View */}
            <Card className="mb-4 overflow-hidden">
              <CardContent className="p-0">
                {locatedWorkers.length > 0 ? (
                  <div className="relative">
                    <div className="w-full h-64 bg-gray-200 flex items-center justify-center">
                      <div className="text-center">
                        <MapPin className="w-12 h-12 text-gray-400 mx-auto mb-2" />
                        <p className="text-gray-600 font-medium">{locatedWorkers.length} workers sharing location</p>
                        <p className="text-sm text-gray-500">Map view requires MapQuest API key</p>
                      </div>
                    </div>
                    {/* Location dots overlay */}
                    <div className="absolute top-4 right-4 bg-white rounded-lg shadow p-2 text-xs">
                      <div className="flex items-center gap-2 mb-1">
                        <div className="w-3 h-3 rounded-full bg-green-500"></div>
                        <span>Online</span>
                      </div>
                      <div className="flex items-center gap-2 mb-1">
                        <div className="w-3 h-3 rounded-full bg-yellow-500"></div>
                        <span>Idle</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="w-3 h-3 rounded-full bg-gray-400"></div>
                        <span>Offline</span>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="w-full h-64 flex items-center justify-center bg-gray-100">
                    <div className="text-center">
                      <MapPin className="w-12 h-12 text-gray-300 mx-auto mb-2" />
                      <p className="text-gray-500">No workers sharing location</p>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Workers List */}
            <div className="mb-4">
              <h2 className="text-sm font-semibold text-gray-600 mb-2">
                WORKERS ({workers.length})
              </h2>
              <div className="space-y-2">
                {workers.map(worker => {
                  const status = STATUS_COLORS[worker.worker_status || 'offline'];
                  const hasLocation = worker.current_location?.latitude;
                  
                  return (
                    <Card key={worker.id}>
                      <CardContent className="p-3">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            <div className={`w-3 h-3 rounded-full ${status.dot}`}></div>
                            <div>
                              <p className="font-medium text-gray-900">{worker.full_name}</p>
                              <p className="text-sm text-gray-500">
                                {getWorkerCurrentAddress(worker)}
                              </p>
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            {hasLocation && (
                              <Badge variant="outline" className="text-xs">
                                <MapPin className="w-3 h-3 mr-1" />
                                GPS
                              </Badge>
                            )}
                            <Link to={createPageUrl(`WorkerDetail?id=${worker.id}`)}>
                              <Button size="sm" variant="outline">View</Button>
                            </Link>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            </div>

            {/* Legend */}
            <div className="flex items-center justify-center gap-6 text-sm text-gray-600">
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full bg-green-500"></div>
                <span>Online ({onlineWorkers.filter(w => w.worker_status === 'active').length})</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full bg-yellow-500"></div>
                <span>Idle ({onlineWorkers.filter(w => w.worker_status === 'paused').length})</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full bg-gray-400"></div>
                <span>Offline ({offlineWorkers.length})</span>
              </div>
            </div>
          </>
        )}
      </main>

      <BossBottomNav currentPage="WorkerMap" />
    </div>
  );
}