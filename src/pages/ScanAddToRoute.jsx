import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import { getCompanyId } from '@/components/utils/companyUtils';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import {
  ArrowLeft,
  Loader2,
  Search,
  FolderOpen,
  MapPin,
  Check,
  ChevronRight
} from 'lucide-react';
import { toast } from 'sonner';
import { format } from 'date-fns';
import {
  PAY_RATES,
  loadScanSession,
  clearScanSession,
  generateNormalizedKey
} from '@/components/scanning/ScanningService';

export default function ScanAddToRoute() {
  const navigate = useNavigate();
  const [session, setSession] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedRouteId, setSelectedRouteId] = useState(null);
  const [isAdding, setIsAdding] = useState(false);
  const [addingProgress, setAddingProgress] = useState('');

  const urlParams = new URLSearchParams(window.location.search);
  const sessionId = urlParams.get('sessionId');

  const { data: user } = useQuery({
    queryKey: ['currentUser'],
    queryFn: () => base44.auth.me()
  });

  const { data: userSettings } = useQuery({
    queryKey: ['userSettings', user?.id],
    queryFn: async () => {
      if (!user?.id) return null;
      const settings = await base44.entities.UserSettings.filter({ user_id: user.id });
      return settings[0] || null;
    },
    enabled: !!user?.id
  });

  const { data: backendApiKeys } = useQuery({
    queryKey: ['backendApiKeys'],
    queryFn: async () => {
      const res = await base44.functions.invoke('getApiKeys', {});
      return res.data;
    },
    staleTime: 10 * 60 * 1000
  });

  const isBoss = user?.role === 'boss' || user?.role === 'admin';

  const { data: routes = [], isLoading: routesLoading } = useQuery({
    queryKey: ['allRoutes', user?.id],
    queryFn: async () => {
      if (!user?.id) return [];
      if (isBoss) {
        return base44.entities.Route.filter({
          company_id: getCompanyId(user),
          deleted_at: null
        });
      }
      return base44.entities.Route.filter({
        worker_id: user.id,
        deleted_at: null
      });
    },
    enabled: !!user?.id
  });

  useEffect(() => {
    if (sessionId) {
      const existing = loadScanSession(sessionId);
      if (existing) {
        setSession(existing);
      } else {
        navigate(createPageUrl('ScanDocumentType'));
      }
    } else {
      navigate(createPageUrl('ScanDocumentType'));
    }
  }, [sessionId, navigate]);

  // Filter routes - exclude archived/completed/deleted
  const availableRoutes = routes.filter(r =>
    r.status !== 'archived' && r.status !== 'completed' && !r.deleted_at
  );

  const filteredRoutes = availableRoutes.filter(r => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return r.folder_name?.toLowerCase().includes(q);
  });

  const geocodeAddress = async (fullAddress, apiKey) => {
    if (!apiKey) return null;
    try {
      const response = await fetch(
        `https://www.mapquestapi.com/geocoding/v1/address?key=${apiKey}&location=${encodeURIComponent(fullAddress)}`
      );
      const data = await response.json();
      const location = data?.results?.[0]?.locations?.[0]?.latLng;
      if (location?.lat && location?.lng) {
        return { lat: location.lat, lng: location.lng, status: 'exact' };
      }
      return null;
    } catch {
      return null;
    }
  };

  const handleAddToRoute = async () => {
    if (!session || !user || !selectedRouteId) return;

    const validAddresses = session.addresses.filter(
      a => a.status === 'extracted' && a.extractedData?.street
    );

    if (validAddresses.length === 0) {
      toast.error('No valid addresses to add');
      return;
    }

    setIsAdding(true);
    const route = routes.find(r => r.id === selectedRouteId);

    try {
      const mapquestApiKey = backendApiKeys?.mapquest_api_key || userSettings?.mapquest_api_key;

      for (let i = 0; i < validAddresses.length; i++) {
        const addr = validAddresses[i];
        setAddingProgress(`Adding address ${i + 1}/${validAddresses.length}...`);

        const normalizedKey = generateNormalizedKey(addr.extractedData);

        let lat = null;
        let lng = null;
        let geocodeStatus = 'pending';

        if (mapquestApiKey) {
          const geoResult = await geocodeAddress(addr.extractedData.fullAddress, mapquestApiKey);
          if (geoResult) {
            lat = geoResult.lat;
            lng = geoResult.lng;
            geocodeStatus = geoResult.status;
          } else {
            geocodeStatus = 'failed';
          }
        }

        await base44.entities.Address.create({
          company_id: getCompanyId(user),
          route_id: selectedRouteId,
          legal_address: addr.ocrRawText || addr.extractedData.fullAddress,
          normalized_address: addr.extractedData.fullAddress,
          city: addr.extractedData.city,
          state: addr.extractedData.state,
          zip: addr.extractedData.zip,
          lat,
          lng,
          serve_type: addr.extractedData?.documentType || session.documentType,
          pay_rate: PAY_RATES[addr.extractedData?.documentType || session.documentType],
          status: 'pending',
          served: false,
          attempts_count: 0,
          defendant_name: addr.defendantName || null,
          ocr_raw_text: addr.ocrRawText || null,
          confidence_score: addr.confidence,
          manual_edit_flag: addr.manuallyEdited || false,
          scanned_by: user.id,
          scanned_at: new Date().toISOString(),
          scan_session_id: session.dbSessionId || null,
          normalized_key: normalizedKey,
          has_related_addresses: false,
          related_address_count: 0,
          geocode_status: geocodeStatus
        });
      }

      // Update route total_addresses count
      const currentTotal = route?.total_addresses || 0;
      await base44.entities.Route.update(selectedRouteId, {
        total_addresses: currentTotal + validAddresses.length
      });

      // Update scan session
      if (session.dbSessionId) {
        await base44.entities.ScanSession.update(session.dbSessionId, {
          status: 'completed',
          route_id: selectedRouteId,
          completed_at: new Date().toISOString()
        });
      }

      clearScanSession(session.id);
      toast.success(`Added ${validAddresses.length} address${validAddresses.length !== 1 ? 'es' : ''} to ${route?.folder_name}`);

      if (isBoss) {
        navigate(createPageUrl(`BossRouteDetail?id=${selectedRouteId}`));
      } else {
        navigate(createPageUrl(`WorkerRouteDetail?id=${selectedRouteId}`));
      }
    } catch (error) {
      console.error('Error adding to route:', error);
      toast.error('Failed to add addresses: ' + error.message);
    } finally {
      setIsAdding(false);
    }
  };

  if (!session) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
      </div>
    );
  }

  const validCount = session.addresses.filter(a => a.status === 'extracted').length;
  const selectedRoute = routes.find(r => r.id === selectedRouteId);

  return (
    <div className="min-h-screen bg-gray-50 pb-24 flex flex-col">
      {/* Header */}
      <div className="bg-white border-b px-4 py-3 flex items-center gap-3">
        <Link to={createPageUrl(`ScanCamera?sessionId=${session.id}&mode=addToRoute`)}>
          <Button variant="ghost" size="icon">
            <ArrowLeft className="w-5 h-5" />
          </Button>
        </Link>
        <h1 className="text-lg font-semibold">Select Route</h1>
      </div>

      <div className="p-4 max-w-lg mx-auto w-full flex-1">
        {/* Summary */}
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-3 mb-4">
          <p className="text-sm font-medium text-blue-800">
            Adding {validCount} address{validCount !== 1 ? 'es' : ''} to an existing route
          </p>
        </div>

        {/* Search */}
        <div className="relative mb-4">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <Input
            placeholder="Search routes..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10"
          />
        </div>

        {/* Route List */}
        {routesLoading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="w-6 h-6 animate-spin text-blue-500" />
          </div>
        ) : filteredRoutes.length === 0 ? (
          <div className="text-center py-8 text-gray-500">
            <FolderOpen className="w-10 h-10 mx-auto mb-2 text-gray-300" />
            <p className="text-sm">{searchQuery ? 'No routes match your search' : 'No routes available'}</p>
          </div>
        ) : (
          <div className="space-y-2">
            {filteredRoutes.map(route => {
              const isSelected = selectedRouteId === route.id;
              return (
                <Card
                  key={route.id}
                  className={`cursor-pointer transition-all ${
                    isSelected
                      ? 'border-2 border-blue-500 bg-blue-50 shadow-md'
                      : 'border hover:border-gray-300 hover:shadow-sm'
                  }`}
                  onClick={() => setSelectedRouteId(route.id)}
                >
                  <CardContent className="p-3">
                    <div className="flex items-center gap-3">
                      <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${
                        isSelected ? 'bg-blue-500' : 'bg-gray-100'
                      }`}>
                        {isSelected ? (
                          <Check className="w-4 h-4 text-white" />
                        ) : (
                          <FolderOpen className="w-4 h-4 text-gray-400" />
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <h3 className="font-semibold text-sm truncate">{route.folder_name}</h3>
                        <div className="flex items-center gap-2 text-xs text-gray-500">
                          <span className="flex items-center gap-0.5">
                            <MapPin className="w-3 h-3" />
                            {route.total_addresses || 0} addresses
                          </span>
                          {route.due_date && (
                            <span>Due {format(new Date(route.due_date), 'MMM d')}</span>
                          )}
                        </div>
                      </div>
                      <span className={`text-xs px-2 py-1 rounded-full ${
                        route.status === 'active' ? 'bg-green-100 text-green-700' :
                        route.status === 'assigned' ? 'bg-purple-100 text-purple-700' :
                        route.status === 'ready' ? 'bg-blue-100 text-blue-700' :
                        'bg-gray-100 text-gray-600'
                      }`}>
                        {route.status}
                      </span>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>

      {/* Bottom Action */}
      <div className="fixed bottom-0 left-0 right-0 bg-white border-t p-4">
        <Button
          className="w-full bg-blue-600 hover:bg-blue-700 h-12 text-base text-white"
          onClick={handleAddToRoute}
          disabled={!selectedRouteId || isAdding}
        >
          {isAdding ? (
            <>
              <Loader2 className="w-5 h-5 mr-2 animate-spin" />
              {addingProgress || 'Adding...'}
            </>
          ) : selectedRoute ? (
            <>
              <Check className="w-5 h-5 mr-2" />
              Add {validCount} to "{selectedRoute.folder_name}"
            </>
          ) : (
            'Select a route above'
          )}
        </Button>
      </div>
    </div>
  );
}