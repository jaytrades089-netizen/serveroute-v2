import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { createPageUrl } from '@/utils';
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { MapPin, Navigation, Plus, Loader2, X, Home, Building, Briefcase, Shuffle } from 'lucide-react';
import { toast } from 'sonner';

export default function RouteOptimization() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const urlParams = new URLSearchParams(window.location.search);
  const routeId = urlParams.get('routeId');
  
  const [selectedEndLocation, setSelectedEndLocation] = useState('');
  const [isOptimizing, setIsOptimizing] = useState(false);
  const [showAddLocation, setShowAddLocation] = useState(false);
  const [newLocationLabel, setNewLocationLabel] = useState('');
  const [newLocationAddress, setNewLocationAddress] = useState('');
  const [savingLocation, setSavingLocation] = useState(false);

  // Fetch current user
  const { data: user } = useQuery({
    queryKey: ['currentUser'],
    queryFn: () => base44.auth.me()
  });

  // Fetch route
  const { data: route, isLoading: routeLoading } = useQuery({
    queryKey: ['route', routeId],
    queryFn: async () => {
      if (!routeId) return null;
      const routes = await base44.entities.Route.filter({ id: routeId });
      return routes[0] || null;
    },
    enabled: !!routeId
  });

  // Fetch addresses for this route
  const { data: addresses = [] } = useQuery({
    queryKey: ['routeAddresses', routeId],
    queryFn: async () => {
      if (!routeId) return [];
      const addrs = await base44.entities.Address.filter({ route_id: routeId, deleted_at: null });
      return addrs.sort((a, b) => (a.order_index || 0) - (b.order_index || 0));
    },
    enabled: !!routeId
  });

  // Fetch user's saved locations
  const { data: savedLocations = [], refetch: refetchLocations } = useQuery({
    queryKey: ['savedLocations', user?.id],
    queryFn: async () => {
      if (!user?.id) return [];
      return base44.entities.SavedLocation.filter({ user_id: user.id });
    },
    enabled: !!user?.id
  });

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

      // Geocode the address using MapQuest
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

  const handleOptimizeRoute = async () => {
    console.log('Starting optimization...');
    console.log('Selected end location:', selectedEndLocation);
    
    if (!selectedEndLocation) {
      toast.error('Please select an end location');
      return;
    }

    setIsOptimizing(true);

    try {
      // Get current position
      console.log('Getting current position...');
      const position = await new Promise((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(resolve, reject, {
          enableHighAccuracy: true,
          timeout: 10000
        });
      });
      console.log('Position:', position.coords.latitude, position.coords.longitude);

      // Get end location
      const endLocation = savedLocations.find(loc => loc.id === selectedEndLocation);
      console.log('End location:', endLocation);
      
      if (!endLocation) {
        toast.error('End location not found');
        setIsOptimizing(false);
        return;
      }

      // Filter addresses with valid coordinates
      const validAddresses = addresses.filter(a => a.lat && a.lng);
      console.log('Valid addresses:', validAddresses.length);
      
      if (validAddresses.length === 0) {
        toast.error('No addresses with coordinates to optimize');
        setIsOptimizing(false);
        return;
      }

      // Build locations array for MapQuest
      const locations = [
        `${position.coords.latitude},${position.coords.longitude}`,
        ...validAddresses.map(addr => `${addr.lat},${addr.lng}`),
        `${endLocation.latitude},${endLocation.longitude}`
      ];
      console.log('Locations for API:', locations);

      // Get API key from settings
      const apiKey = userSettings?.mapquest_api_key;
      console.log('API Key exists:', !!apiKey);

      if (!apiKey) {
        toast.error('MapQuest API key not configured. Please add it in Settings.');
        setIsOptimizing(false);
        return;
      }

      // Call MapQuest
      const url = `https://www.mapquestapi.com/directions/v2/optimizedroute?key=${apiKey}`;
      console.log('Calling MapQuest API...');

      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          locations: locations,
          options: { allToAll: false, manyToOne: false }
        })
      });

      const result = await response.json();
      console.log('MapQuest response:', result);

      if (result.info?.statuscode !== 0) {
        console.error('MapQuest error:', result.info);
        toast.error('MapQuest API error: ' + (result.info?.messages?.[0] || 'Unknown error'));
        setIsOptimizing(false);
        return;
      }

      if (result.route?.locationSequence) {
        const sequence = result.route.locationSequence;
        
        // DEBUG: Log before/after order
        console.log('BEFORE optimization - address order:');
        validAddresses.forEach((addr, i) => {
          console.log(`  ${i + 1}. ${addr.normalized_address || addr.legal_address} (current order_index: ${addr.order_index})`);
        });
        
        console.log('MapQuest sequence:', sequence);
        console.log('AFTER optimization - new order:');
        for (let i = 1; i < sequence.length - 1; i++) {
          const originalIndex = sequence[i] - 1;
          const address = validAddresses[originalIndex];
          console.log(`  New position ${i}: ${address?.normalized_address || address?.legal_address} (was index ${originalIndex})`);
        }

        // DEACTIVATE any other active routes for this user first
        const activeRoutes = await base44.entities.Route.filter({ 
          worker_id: user.id, 
          status: 'active' 
        });
        console.log('Found active routes to pause:', activeRoutes.length);
        
        for (const activeRoute of activeRoutes) {
          if (activeRoute.id !== routeId) {
            await base44.entities.Route.update(activeRoute.id, { 
              status: 'paused',
              paused_at: new Date().toISOString()
            });
            console.log('Paused route:', activeRoute.id);
          }
        }

        // Update address order
        for (let i = 1; i < sequence.length - 1; i++) {
          const originalIndex = sequence[i] - 1;
          const address = validAddresses[originalIndex];
          if (address) {
            await base44.entities.Address.update(address.id, { order_index: i });
            console.log(`Address ${address.id} set to order_index ${i}`);
          }
        }

        // Set this route to active
        await base44.entities.Route.update(routeId, {
          status: 'active',
          started_at: new Date().toISOString(),
          optimized: true,
          total_distance_miles: result.route.distance || null,
          estimated_time_minutes: result.route.time ? Math.round(result.route.time / 60) : null,
          ending_point: {
            address: endLocation.address,
            lat: endLocation.latitude,
            lng: endLocation.longitude
          }
        });

        // Invalidate queries
        queryClient.invalidateQueries({ queryKey: ['route', routeId] });
        queryClient.invalidateQueries({ queryKey: ['routeAddresses', routeId] });
        queryClient.invalidateQueries({ queryKey: ['workerRoutes'] });

        toast.success('Route optimized! Addresses reordered.');
        setIsOptimizing(false);
        
        // Small delay to let user see the result, then navigate
        setTimeout(() => {
          navigate(createPageUrl(`WorkerRouteDetail?routeId=${routeId}`));
        }, 500);
        return;

      } else {
        console.error('No location sequence in response');
        toast.error('Could not optimize route - no sequence returned');
      }

    } catch (error) {
      console.error('Optimization failed:', error);
      toast.error('Failed to optimize: ' + error.message);
    } finally {
      setIsOptimizing(false);
    }
  };

  const getLocationIcon = (label) => {
    const lower = label.toLowerCase();
    if (lower.includes('home')) return <Home className="w-4 h-4" />;
    if (lower.includes('office') || lower.includes('work')) return <Briefcase className="w-4 h-4" />;
    if (lower.includes('court') || lower.includes('building')) return <Building className="w-4 h-4" />;
    return <MapPin className="w-4 h-4" />;
  };

  if (routeLoading) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center">
        <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />
        <Loader2 className="w-8 h-8 animate-spin text-white relative z-10" />
      </div>
    );
  }

  if (!route && !routeLoading) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center">
        <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => navigate(-1)} />
        <div className="relative bg-white rounded-xl p-6 max-w-sm mx-4 text-center">
          <p className="text-gray-600 mb-4">Route not found</p>
          <Button onClick={() => navigate(-1)}>Go Back</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center">
      {/* Slide-up animation styles */}
      <style>{`
        @keyframes slide-up {
          from {
            transform: translateY(100%);
            opacity: 0;
          }
          to {
            transform: translateY(0);
            opacity: 1;
          }
        }
        .animate-slide-up {
          animation: slide-up 0.3s ease-out;
        }
      `}</style>

      {/* Dark transparent backdrop */}
      <div 
        className="absolute inset-0 bg-black/40 backdrop-blur-sm"
        onClick={() => navigate(-1)}
      />
      
      {/* Bottom sheet style panel */}
      <div className="relative bg-white rounded-t-3xl w-full max-w-lg p-6 pb-8 shadow-2xl animate-slide-up max-h-[85vh] overflow-y-auto">
        {/* Header with drag handle */}
        <div className="w-12 h-1.5 bg-gray-300 rounded-full mx-auto mb-4" />
        
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-bold">Optimize Route</h2>
          <button 
            onClick={() => navigate(-1)}
            className="p-2 rounded-full hover:bg-gray-100"
          >
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>
        
        {/* Route info */}
        <div className="bg-gray-50 rounded-xl p-3 mb-4 flex items-center justify-between">
          <div>
            <p className="font-semibold">{route?.folder_name || 'Route'}</p>
            <p className="text-sm text-gray-500">{addresses.length} addresses</p>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={async () => {
              const shuffled = [...addresses].sort(() => Math.random() - 0.5);
              for (let i = 0; i < shuffled.length; i++) {
                await base44.entities.Address.update(shuffled[i].id, { order_index: i + 1 });
              }
              queryClient.invalidateQueries({ queryKey: ['routeAddresses', routeId] });
              toast.success('Addresses shuffled!');
            }}
            className="text-xs"
          >
            <Shuffle className="w-3 h-3 mr-1" />
            Shuffle
          </Button>
        </div>
        
        {/* End location dropdown */}
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
        
        {/* Add location button */}
        {!showAddLocation && (
          <Button
            variant="outline"
            size="sm"
            className="w-full mb-4"
            onClick={() => setShowAddLocation(true)}
          >
            <Plus className="w-4 h-4 mr-2" />
            Add End Location
          </Button>
        )}
        
        {/* Add location form (if showing) */}
        {showAddLocation && (
          <div className="bg-orange-50 rounded-xl p-4 mb-4 border border-orange-200">
            <Input
              placeholder="Label (Home, Office, etc.)"
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
                className="flex-1 bg-orange-500 hover:bg-orange-600" 
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
        
        {/* Optimize button */}
        <Button
          onClick={handleOptimizeRoute}
          disabled={!selectedEndLocation || isOptimizing}
          className="w-full bg-green-500 hover:bg-green-600 text-white font-bold py-4"
        >
          {isOptimizing ? (
            <>
              <Loader2 className="w-5 h-5 mr-2 animate-spin" />
              Optimizing...
            </>
          ) : (
            <>
              <Navigation className="w-5 h-5 mr-2" />
              Optimize & Start Route
            </>
          )}
        </Button>
      </div>
    </div>
  );
}