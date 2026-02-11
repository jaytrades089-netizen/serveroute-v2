import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { useNavigate, Link } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ChevronLeft, Check, Shuffle, Loader2, MapPin, Calendar, AlertCircle } from 'lucide-react';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { optimizeWithHybrid } from '@/components/services/OptimizationService';
import BottomNav from '@/components/layout/BottomNav';

export default function ComboRouteSelection() {
  const navigate = useNavigate();
  const [selectedRoutes, setSelectedRoutes] = useState([]);
  const [selectedEndLocation, setSelectedEndLocation] = useState('');
  const [isOptimizing, setIsOptimizing] = useState(false);

  const { data: user } = useQuery({
    queryKey: ['currentUser'],
    queryFn: () => base44.auth.me()
  });

  const { data: routes = [], isLoading: routesLoading } = useQuery({
    queryKey: ['comboRoutes', user?.id],
    queryFn: async () => {
      if (!user?.id) return [];
      const allRoutes = await base44.entities.Route.filter({ 
        deleted_at: null 
      });
      return allRoutes.filter(r => 
        r.worker_id === user.id && 
        ['ready', 'assigned', 'active'].includes(r.status)
      );
    },
    enabled: !!user?.id
  });

  const { data: routeAddressCounts = {} } = useQuery({
    queryKey: ['routeAddressCounts', routes],
    queryFn: async () => {
      const counts = {};
      for (const route of routes) {
        const addresses = await base44.entities.Address.filter({ 
          route_id: route.id, 
          deleted_at: null,
          served: false 
        });
        counts[route.id] = addresses.length;
      }
      return counts;
    },
    enabled: routes.length > 0
  });

  const { data: savedLocations = [] } = useQuery({
    queryKey: ['savedLocations', user?.id],
    queryFn: async () => {
      if (!user?.id) return [];
      return base44.entities.SavedLocation.filter({ user_id: user.id });
    },
    enabled: !!user?.id
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

  const toggleRouteSelection = (routeId) => {
    setSelectedRoutes(prev => 
      prev.includes(routeId)
        ? prev.filter(id => id !== routeId)
        : [...prev, routeId]
    );
  };

  const getTotalAddresses = () => {
    return selectedRoutes.reduce((sum, routeId) => sum + (routeAddressCounts[routeId] || 0), 0);
  };

  const handleOptimizeCombo = async () => {
    if (selectedRoutes.length < 2) {
      toast.error('Please select at least 2 routes');
      return;
    }
    if (!selectedEndLocation) {
      toast.error('Please select an end location');
      return;
    }

    const apiKey = userSettings?.mapquest_api_key;
    if (!apiKey) {
      toast.error('MapQuest API key not configured. Go to Settings to add it.');
      return;
    }

    setIsOptimizing(true);

    try {
      // Get all addresses from selected routes
      let allAddresses = [];
      for (const routeId of selectedRoutes) {
        const addresses = await base44.entities.Address.filter({ 
          route_id: routeId, 
          deleted_at: null,
          served: false 
        });
        allAddresses = [...allAddresses, ...addresses.map(a => ({ ...a, originalRouteId: routeId }))];
      }

      // Get current position — graceful fallback if denied
      let startLat, startLng;
      try {
        const position = await new Promise((resolve, reject) => {
          navigator.geolocation.getCurrentPosition(resolve, reject, {
            enableHighAccuracy: true,
            timeout: 15000
          });
        });
        startLat = position.coords.latitude;
        startLng = position.coords.longitude;
      } catch (geoError) {
        console.warn('Geolocation unavailable, using first address as start:', geoError.message);
        // Fall back to first address that has coordinates
        const firstWithCoords = allAddresses.find(a => a.lat && a.lng);
        if (firstWithCoords) {
          startLat = firstWithCoords.lat;
          startLng = firstWithCoords.lng;
          toast.info('Location unavailable — using first address as starting point');
        } else {
          toast.error('Location unavailable and no addresses have coordinates. Please enable location services.');
          setIsOptimizing(false);
          return;
        }
      }

      const endLocation = savedLocations.find(loc => loc.id === selectedEndLocation);

      // Use hybrid optimization
      const optimizedAddresses = await optimizeWithHybrid(
        allAddresses,
        startLat,
        startLng,
        endLocation.latitude,
        endLocation.longitude,
        apiKey
      );

      // Determine route order based on optimized addresses
      const routeOrder = [];
      const seenRoutes = new Set();
      
      for (const addr of optimizedAddresses) {
        if (!seenRoutes.has(addr.originalRouteId)) {
          seenRoutes.add(addr.originalRouteId);
          routeOrder.push(addr.originalRouteId);
        }
      }

      // Create ComboRoute record
      const combo = await base44.entities.ComboRoute.create({
        user_id: user.id,
        company_id: user.company_id,
        name: `Combo - ${format(new Date(), 'MMM d')}`,
        route_ids: selectedRoutes,
        route_order: routeOrder,
        end_location_id: selectedEndLocation,
        status: 'active',
        total_addresses: allAddresses.length
      });

      // Update address orders across all routes
      for (let i = 0; i < optimizedAddresses.length; i++) {
        await base44.entities.Address.update(optimizedAddresses[i].id, { 
          order_index: i + 1 
        });
      }

      // Set all selected routes to active
      for (const routeId of selectedRoutes) {
        await base44.entities.Route.update(routeId, { 
          status: 'active',
          started_at: new Date().toISOString()
        });
      }

      toast.success(`Combo route created with ${allAddresses.length} addresses!`);
      
      // Navigate to first route in optimized order
      navigate(createPageUrl(`WorkerRouteDetail?id=${routeOrder[0]}`));

    } catch (error) {
      console.error('Combo optimization failed:', error);
      toast.error('Failed to optimize: ' + error.message);
    } finally {
      setIsOptimizing(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 pb-24">
      {/* Header */}
      <header className="bg-purple-500 text-white px-4 py-3 flex items-center gap-3">
        <Link to={createPageUrl('WorkerRoutes')}>
          <ChevronLeft className="w-6 h-6" />
        </Link>
        <div>
          <h1 className="font-bold text-lg">Combo Route</h1>
          <p className="text-sm text-purple-100">Combine multiple routes</p>
        </div>
      </header>

      <main className="px-4 py-4 max-w-lg mx-auto">
        {/* End Location Selection */}
        <Card className="mb-4">
          <CardContent className="p-4">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              <MapPin className="w-4 h-4 inline mr-1" />
              End Location
            </label>
            <Select value={selectedEndLocation} onValueChange={setSelectedEndLocation}>
              <SelectTrigger>
                <SelectValue placeholder="Select where to end" />
              </SelectTrigger>
              <SelectContent>
                {savedLocations.map(loc => (
                  <SelectItem key={loc.id} value={loc.id}>
                    {loc.label} - {loc.address?.substring(0, 30)}...
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {savedLocations.length === 0 && (
              <p className="text-xs text-gray-500 mt-2">
                No saved locations. Add one in Settings.
              </p>
            )}
          </CardContent>
        </Card>

        {/* Route Selection */}
        <Card className="mb-4">
          <CardContent className="p-4">
            <h2 className="font-semibold mb-3">Select Routes to Combine</h2>
            
            {routesLoading ? (
              <div className="flex justify-center py-8">
                <Loader2 className="w-6 h-6 animate-spin text-purple-500" />
              </div>
            ) : routes.length === 0 ? (
              <div className="text-center py-8 text-gray-500">
                <AlertCircle className="w-8 h-8 mx-auto mb-2 text-gray-400" />
                <p>No routes available to combine</p>
              </div>
            ) : (
              <div className="space-y-2">
                {routes.map(route => {
                  const addressCount = routeAddressCounts[route.id] || 0;
                  const isSelected = selectedRoutes.includes(route.id);
                  
                  return (
                    <div
                      key={route.id}
                      onClick={() => toggleRouteSelection(route.id)}
                      className={`p-4 rounded-xl cursor-pointer border-2 transition-all ${
                        isSelected
                          ? 'border-purple-500 bg-purple-50'
                          : 'border-gray-200 bg-white hover:border-gray-300'
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <div className={`w-6 h-6 rounded-md border-2 flex items-center justify-center transition-colors ${
                          isSelected
                            ? 'bg-purple-500 border-purple-500 text-white'
                            : 'border-gray-300 bg-white'
                        }`}>
                          {isSelected && <Check className="w-4 h-4" />}
                        </div>
                        <div className="flex-1">
                          <p className="font-semibold text-gray-900">{route.folder_name}</p>
                          <div className="flex items-center gap-3 text-sm text-gray-500">
                            <span>{addressCount} addresses</span>
                            {route.due_date && (
                              <span className="flex items-center gap-1">
                                <Calendar className="w-3 h-3" />
                                {format(new Date(route.due_date), 'MMM d')}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Summary */}
        <div className="bg-purple-100 rounded-xl p-4 mb-4">
          <p className="text-center text-purple-900">
            Selected: <strong>{selectedRoutes.length} routes</strong> ({getTotalAddresses()} addresses)
          </p>
        </div>

        {/* Optimize Button */}
        <Button
          onClick={handleOptimizeCombo}
          disabled={selectedRoutes.length < 2 || !selectedEndLocation || isOptimizing}
          className="w-full bg-purple-500 hover:bg-purple-600 text-white font-bold py-6 text-lg rounded-xl"
        >
          {isOptimizing ? (
            <>
              <Loader2 className="w-5 h-5 mr-2 animate-spin" />
              Optimizing...
            </>
          ) : (
            <>
              <Shuffle className="w-5 h-5 mr-2" />
              Optimize Combo Route
            </>
          )}
        </Button>

        {selectedRoutes.length < 2 && (
          <p className="text-center text-sm text-gray-500 mt-2">
            Select at least 2 routes to combine
          </p>
        )}
      </main>

      <BottomNav currentPage="WorkerRoutes" />
    </div>
  );
}