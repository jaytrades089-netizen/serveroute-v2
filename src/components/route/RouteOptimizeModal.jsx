import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import { base44 } from '@/api/base44Client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { MapPin, Navigation, Plus, Loader2, X, Home, Building, Briefcase, Shuffle, Play, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import { optimizeWithHybrid } from '@/components/services/OptimizationService';

const TIME_AT_ADDRESS_OPTIONS = [
  { label: '1 min', value: 1 },
  { label: '2 mins', value: 2 },
  { label: '3 mins', value: 3 },
  { label: '5 mins', value: 5 },
  { label: '10 mins', value: 10 },
];

export default function RouteOptimizeModal({ routeId, route, addresses, onClose, onOptimized }) {
  const queryClient = useQueryClient();
  const [selectedEndLocation, setSelectedEndLocation] = useState('');
  const [isOptimizing, setIsOptimizing] = useState(false);
  const [showAddLocation, setShowAddLocation] = useState(false);
  const [newLocationLabel, setNewLocationLabel] = useState('');
  const [newLocationAddress, setNewLocationAddress] = useState('');
  const [savingLocation, setSavingLocation] = useState(false);
  
  // Route metrics state
  const [routeMetrics, setRouteMetrics] = useState(null);
  const [timeAtAddress, setTimeAtAddress] = useState(2);
  const [isOptimized, setIsOptimized] = useState(false);
  const [isStarting, setIsStarting] = useState(false);

  // Fetch current user
  const { data: user } = useQuery({
    queryKey: ['currentUser'],
    queryFn: () => base44.auth.me()
  });

  // Fetch user's saved locations
  const { data: savedLocations = [], refetch: refetchLocations } = useQuery({
    queryKey: ['savedLocations', user?.id],
    queryFn: async () => {
      if (!user?.id) return [];
      const locations = await base44.entities.SavedLocation.filter({ user_id: user.id });
      return locations.sort((a, b) => {
        const aTime = a.last_used ? new Date(a.last_used) : new Date(a.created_date || 0);
        const bTime = b.last_used ? new Date(b.last_used) : new Date(b.created_date || 0);
        return bTime - aTime;
      });
    },
    enabled: !!user?.id
  });

  // Auto-select the most recently used location
  useEffect(() => {
    if (savedLocations.length > 0 && !selectedEndLocation) {
      setSelectedEndLocation(savedLocations[0].id);
    }
  }, [savedLocations, selectedEndLocation]);

  // Fetch user settings for MapQuest API key
  const { data: userSettings } = useQuery({
    queryKey: ['userSettings', user?.id],
    queryFn: async () => {
      if (!user?.id) return null;
      const settings = await base44.entities.UserSettings.filter({ user_id: user.id });
      return settings[0] || null;
    },
    enabled: !!user?.id
  });

  const getLocationIcon = (label) => {
    const lower = label.toLowerCase();
    if (lower.includes('home')) return <Home className="w-4 h-4" />;
    if (lower.includes('office') || lower.includes('work')) return <Briefcase className="w-4 h-4" />;
    if (lower.includes('court') || lower.includes('building')) return <Building className="w-4 h-4" />;
    return <MapPin className="w-4 h-4" />;
  };

  const handleAddLocation = async () => {
    if (!newLocationLabel || !newLocationAddress) {
      toast.error('Please enter both label and address');
      return;
    }

    setSavingLocation(true);

    try {
      const apiKey = userSettings?.mapquest_api_key;
      if (!apiKey) {
        toast.error('MapQuest API key not configured. Please add it in Settings.');
        setSavingLocation(false);
        return;
      }

      const geocodeUrl = `https://www.mapquestapi.com/geocoding/v1/address?key=${apiKey}&location=${encodeURIComponent(newLocationAddress)}`;
      const response = await fetch(geocodeUrl);
      const data = await response.json();

      if (data.results?.[0]?.locations?.[0]) {
        const loc = data.results[0].locations[0];

        await base44.entities.SavedLocation.create({
          user_id: user.id,
          company_id: user.company_id,
          label: newLocationLabel,
          address: newLocationAddress,
          latitude: loc.latLng.lat,
          longitude: loc.latLng.lng
        });

        refetchLocations();
        setNewLocationLabel('');
        setNewLocationAddress('');
        setShowAddLocation(false);
        toast.success('Location saved');
      } else {
        toast.error('Could not find that address');
      }
    } catch (error) {
      console.error('Geocode error:', error);
      toast.error('Failed to save location');
    } finally {
      setSavingLocation(false);
    }
  };

  const [isShuffling, setIsShuffling] = useState(false);

  const handleShuffle = async () => {
    setIsShuffling(true);
    try {
      const shuffled = [...addresses].sort(() => Math.random() - 0.5);
      for (let i = 0; i < shuffled.length; i++) {
        await base44.entities.Address.update(shuffled[i].id, { order_index: i + 1 });
      }
      await queryClient.invalidateQueries({ queryKey: ['routeAddresses', routeId] });
      setIsOptimized(false);
      setRouteMetrics(null);
      toast.success('Addresses shuffled!');
    } finally {
      setIsShuffling(false);
    }
  };

  // Calculate estimated completion time
  const calculateEstCompletion = () => {
    if (!routeMetrics) return null;
    
    const driveTimeMinutes = routeMetrics.totalTimeMinutes;
    const addressTimeMinutes = timeAtAddress * addresses.length;
    const totalMinutes = driveTimeMinutes + addressTimeMinutes;
    
    const now = new Date();
    const completionTime = new Date(now.getTime() + totalMinutes * 60000);
    
    return {
      totalMinutes,
      completionTime,
      driveTime: routeMetrics.totalTimeMinutes,
      addressTime: addressTimeMinutes
    };
  };

  const handleOptimizeRoute = async () => {
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
      console.log('Starting optimization...');
      
      // Get current position
      const position = await new Promise((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(resolve, reject, {
          enableHighAccuracy: true,
          timeout: 15000
        });
      });
      console.log('Position:', position.coords.latitude, position.coords.longitude);

      const endLocation = savedLocations.find(loc => loc.id === selectedEndLocation);
      if (!endLocation) {
        toast.error('End location not found');
        setIsOptimizing(false);
        return;
      }

      // Geocode addresses that don't have coordinates
      let validAddresses = [...addresses];
      const needsGeocoding = validAddresses.filter(a => !a.lat || !a.lng);
      
      if (needsGeocoding.length > 0) {
        console.log(`Geocoding ${needsGeocoding.length} addresses...`);
        toast.info(`Geocoding ${needsGeocoding.length} addresses...`);
        
        for (const addr of needsGeocoding) {
          const fullAddress = addr.normalized_address || addr.legal_address;
          const geocodeUrl = `https://www.mapquestapi.com/geocoding/v1/address?key=${apiKey}&location=${encodeURIComponent(fullAddress)}`;
          
          try {
            const geoResponse = await fetch(geocodeUrl);
            const geoData = await geoResponse.json();
            
            if (geoData.results?.[0]?.locations?.[0]) {
              const loc = geoData.results[0].locations[0];
              await base44.entities.Address.update(addr.id, {
                lat: loc.latLng.lat,
                lng: loc.latLng.lng,
                geocode_status: 'exact'
              });
              addr.lat = loc.latLng.lat;
              addr.lng = loc.latLng.lng;
            }
          } catch (geoErr) {
            console.error('Geocode error for', fullAddress, geoErr);
          }
        }
      }
      
      // Filter to only addresses with coordinates
      validAddresses = validAddresses.filter(a => a.lat && a.lng);
      
      if (validAddresses.length === 0) {
        toast.error('No addresses could be geocoded');
        setIsOptimizing(false);
        return;
      }

      console.log(`Optimizing ${validAddresses.length} addresses using hybrid algorithm...`);

      // Use the hybrid optimization (handles large routes automatically)
      const optimizedAddresses = await optimizeWithHybrid(
        validAddresses,
        position.coords.latitude,
        position.coords.longitude,
        endLocation.latitude,
        endLocation.longitude,
        apiKey
      );

      // Calculate route metrics using MapQuest directions API
      const locations = [
        `${position.coords.latitude},${position.coords.longitude}`,
        ...optimizedAddresses.map(a => `${a.lat},${a.lng}`),
        `${endLocation.latitude},${endLocation.longitude}`
      ];

      const directionsUrl = `https://www.mapquestapi.com/directions/v2/route?key=${apiKey}`;
      const directionsResponse = await fetch(directionsUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          locations: locations,
          options: { routeType: 'fastest', unit: 'm' }
        })
      });
      
      const directionsData = await directionsResponse.json();
      console.log('Directions response:', directionsData);

      let metrics = { totalMiles: 0, totalTimeMinutes: 0 };
      
      if (directionsData.route) {
        metrics = {
          totalMiles: directionsData.route.distance || 0,
          totalTimeMinutes: Math.round((directionsData.route.time || 0) / 60),
          totalTimeFormatted: directionsData.route.formattedTime || '0:00',
          fuelUsed: directionsData.route.fuelUsed || 0
        };
      }

      setRouteMetrics(metrics);
      setIsOptimized(true);

      // Update address order in database
      console.log('Updating address order in database...');
      for (let i = 0; i < optimizedAddresses.length; i++) {
        await base44.entities.Address.update(optimizedAddresses[i].id, { order_index: i + 1 });
      }

      // Update route with optimization data (but don't start yet)
      await base44.entities.Route.update(routeId, {
        optimized: true,
        ending_point: {
          address: endLocation.address,
          lat: endLocation.latitude,
          lng: endLocation.longitude
        },
        starting_point: {
          lat: position.coords.latitude,
          lng: position.coords.longitude
        }
      });

      // Update last_used on the selected location
      await base44.entities.SavedLocation.update(selectedEndLocation, {
        last_used: new Date().toISOString()
      });

      // Invalidate queries to refresh address list
      await queryClient.invalidateQueries({ queryKey: ['routeAddresses', routeId] });

      toast.success('Route optimized! Review metrics below.');

    } catch (error) {
      console.error('Optimization failed:', error);
      toast.error('Failed to optimize: ' + error.message);
    } finally {
      setIsOptimizing(false);
    }
  };

  const handleStartRoute = async () => {
    if (!isOptimized) {
      toast.error('Please optimize the route first');
      return;
    }

    setIsStarting(true);

    try {
      const estCompletion = calculateEstCompletion();

      // Deactivate other active routes
      const activeRoutes = await base44.entities.Route.filter({ 
        worker_id: user.id, 
        status: 'active' 
      });
      for (const activeRoute of activeRoutes) {
        if (activeRoute.id !== routeId) {
          await base44.entities.Route.update(activeRoute.id, { status: 'ready' });
        }
      }

      // Start this route with metrics
      await base44.entities.Route.update(routeId, {
        status: 'active',
        started_at: new Date().toISOString(),
        total_miles: routeMetrics.totalMiles,
        total_drive_time_minutes: routeMetrics.totalTimeMinutes,
        time_at_address_minutes: timeAtAddress,
        est_completion_time: estCompletion.completionTime.toISOString(),
        est_total_minutes: estCompletion.totalMinutes
      });

      // Invalidate queries
      await queryClient.invalidateQueries({ queryKey: ['route', routeId] });
      await queryClient.invalidateQueries({ queryKey: ['routeAddresses', routeId] });
      await queryClient.invalidateQueries({ queryKey: ['workerRoutes'] });

      toast.success('Route started!');
      
      if (onOptimized) {
        onOptimized();
      }

    } catch (error) {
      console.error('Failed to start route:', error);
      toast.error('Failed to start route');
    } finally {
      setIsStarting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50">
      {/* Slide-up animation styles */}
      <style>{`
        @keyframes slide-down {
          from {
            transform: translateY(-100%);
          }
          to {
            transform: translateY(0);
          }
        }
        .animate-slide-down {
          animation: slide-down 0.3s ease-out;
        }
      `}</style>
      
      {/* Semi-transparent backdrop - tap to close */}
      <div 
        className="absolute inset-0 bg-black/20"
        onClick={onClose}
      />

      {/* Top sheet */}
      <div className="absolute top-0 left-0 right-0 bg-white rounded-b-3xl p-4 pb-6 shadow-2xl animate-slide-down z-50 max-h-[85vh] overflow-y-auto">
        {/* Drag handle at bottom */}
        <div className="w-12 h-1.5 bg-gray-300 rounded-full mx-auto mb-3" />
        
        {/* Header */}
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-xl font-bold">Optimize Route</h2>
          <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-full">
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>
        
        {/* Route info */}
        <div className="bg-gray-50 rounded-xl p-3 mb-4 flex justify-between items-center">
          <div>
            <p className="font-semibold">{route?.folder_name || 'Route'}</p>
            <p className="text-sm text-gray-500">{addresses.length} addresses</p>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={handleShuffle}
            disabled={isShuffling}
            className="text-xs"
          >
            {isShuffling ? (
              <Loader2 className="w-3 h-3 mr-1 animate-spin" />
            ) : (
              <Shuffle className="w-3 h-3 mr-1" />
            )}
            {isShuffling ? 'Shuffling...' : 'Shuffle'}
          </Button>
        </div>
        
        {/* End location */}
        <label className="block text-sm font-medium text-gray-700 mb-2">
          End Location
        </label>
        <Select value={selectedEndLocation} onValueChange={setSelectedEndLocation}>
          <SelectTrigger className="w-full mb-3">
            <SelectValue placeholder="Select where to end" />
          </SelectTrigger>
          <SelectContent>
            {savedLocations.map(loc => (
              <SelectItem key={loc.id} value={loc.id}>
                <div className="flex items-center gap-2">
                  {getLocationIcon(loc.label)}
                  <span className="font-medium">{loc.label}</span>
                  <span className="text-gray-400 text-sm truncate max-w-[150px]">
                    - {loc.address}
                  </span>
                </div>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        
        {/* Add location */}
        {!showAddLocation ? (
          <Button
            variant="outline"
            size="sm"
            className="w-full mb-4"
            onClick={() => setShowAddLocation(true)}
          >
            <Plus className="w-4 h-4 mr-2" />
            Add End Location
          </Button>
        ) : (
          <div className="bg-orange-50 rounded-xl p-4 mb-4 border border-orange-200">
            <Input
              placeholder="Label (Home, Office)"
              value={newLocationLabel}
              onChange={(e) => setNewLocationLabel(e.target.value)}
              className="mb-2"
            />
            <Input
              placeholder="Full address"
              value={newLocationAddress}
              onChange={(e) => setNewLocationAddress(e.target.value)}
              className="mb-2"
            />
            <div className="flex gap-2">
              <Button 
                variant="outline" 
                size="sm" 
                className="flex-1" 
                onClick={() => {
                  setShowAddLocation(false);
                  setNewLocationLabel('');
                  setNewLocationAddress('');
                }}
              >
                Cancel
              </Button>
              <Button 
                size="sm" 
                className="flex-1 bg-orange-500 hover:bg-orange-600 text-white" 
                onClick={handleAddLocation}
                disabled={savingLocation}
              >
                {savingLocation ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Save'}
              </Button>
            </div>
          </div>
        )}

        {/* API Key Warning */}
        {!userSettings?.mapquest_api_key && (
          <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-3 mb-4">
            <p className="text-sm text-yellow-800">
              <strong>Note:</strong> MapQuest API key required. Add it in Settings.
            </p>
          </div>
        )}

        {/* Route Metrics - Show after optimization */}
        {isOptimized && routeMetrics && (
          <div className="bg-white rounded-xl p-4 shadow-sm mb-4 border border-gray-200 animate-fade-in">
            <h3 className="text-sm font-semibold text-gray-500 mb-3">ROUTE SUMMARY</h3>
            
            {/* 3 Metric Boxes */}
            <div className="grid grid-cols-3 gap-3 mb-4">
              {/* Total Miles */}
              <div className="bg-blue-50 rounded-xl p-3 text-center border border-blue-200">
                <p className="text-2xl font-bold text-blue-600">
                  {routeMetrics.totalMiles.toFixed(1)}
                </p>
                <p className="text-xs text-blue-500 font-medium">Miles</p>
              </div>
              
              {/* Total Drive Time */}
              <div className="bg-purple-50 rounded-xl p-3 text-center border border-purple-200">
                <p className="text-2xl font-bold text-purple-600">
                  {routeMetrics.totalTimeMinutes >= 60 
                    ? `${Math.floor(routeMetrics.totalTimeMinutes / 60)}h ${routeMetrics.totalTimeMinutes % 60}m`
                    : `${routeMetrics.totalTimeMinutes}m`
                  }
                </p>
                <p className="text-xs text-purple-500 font-medium">Drive Time</p>
              </div>
              
              {/* Time at Address Selector */}
              <div className="bg-amber-50 rounded-xl p-3 text-center border border-amber-200">
                <Select value={timeAtAddress.toString()} onValueChange={(v) => setTimeAtAddress(parseInt(v))}>
                  <SelectTrigger className="border-0 bg-transparent text-center font-bold text-amber-600 text-xl p-0 h-auto justify-center">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {TIME_AT_ADDRESS_OPTIONS.map(opt => (
                      <SelectItem key={opt.value} value={opt.value.toString()}>
                        {opt.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-amber-500 font-medium">Per Address</p>
              </div>
            </div>
            
            {/* Estimated Completion */}
            {(() => {
              const est = calculateEstCompletion();
              if (!est) return null;
              
              return (
                <div className="bg-green-50 rounded-xl p-4 border border-green-200">
                  <div className="flex justify-between items-center">
                    <div>
                      <p className="text-sm text-green-700 font-medium">Est. Completion Time</p>
                      <p className="text-xs text-green-600">
                        {est.driveTime} min drive + {est.addressTime} min at addresses
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-2xl font-bold text-green-600">
                        {est.completionTime.toLocaleTimeString('en-US', { 
                          hour: 'numeric', 
                          minute: '2-digit',
                          hour12: true 
                        })}
                      </p>
                      <p className="text-xs text-green-500">
                        ~{Math.floor(est.totalMinutes / 60)}h {est.totalMinutes % 60}m total
                      </p>
                    </div>
                  </div>
                </div>
              );
            })()}
          </div>
        )}
        
        {/* Buttons */}
        <div className="space-y-3">
          {/* Optimize Button */}
          <Button
            onClick={handleOptimizeRoute}
            disabled={!selectedEndLocation || isOptimizing}
            className={`w-full font-bold py-4 ${
              isOptimized 
                ? 'bg-gray-400 hover:bg-gray-500' 
                : 'bg-orange-500 hover:bg-orange-600'
            } text-white`}
          >
            {isOptimizing ? (
              <><Loader2 className="w-5 h-5 mr-2 animate-spin" /> Optimizing...</>
            ) : isOptimized ? (
              <><RefreshCw className="w-5 h-5 mr-2" /> Re-Optimize Route</>
            ) : (
              <><Navigation className="w-5 h-5 mr-2" /> Optimize Route</>
            )}
          </Button>
          
          {/* Start Button - Only show after optimization */}
          {isOptimized && (
            <Button
              onClick={handleStartRoute}
              disabled={isStarting}
              className="w-full bg-green-500 hover:bg-green-600 text-white font-bold py-4"
            >
              {isStarting ? (
                <><Loader2 className="w-5 h-5 mr-2 animate-spin" /> Starting...</>
              ) : (
                <><Play className="w-5 h-5 mr-2" /> Start Route</>
              )}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}