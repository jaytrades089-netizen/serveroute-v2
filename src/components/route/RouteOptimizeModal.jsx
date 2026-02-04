import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import { base44 } from '@/api/base44Client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { MapPin, Navigation, Plus, Loader2, X, Home, Building, Briefcase, Shuffle } from 'lucide-react';
import { toast } from 'sonner';
import { optimizeWithHybrid } from '@/components/services/OptimizationService';

export default function RouteOptimizeModal({ routeId, route, addresses, onClose, onOptimized }) {
  const queryClient = useQueryClient();
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

  // Fetch user's saved locations
  const { data: savedLocations = [], refetch: refetchLocations } = useQuery({
    queryKey: ['savedLocations', user?.id],
    queryFn: async () => {
      if (!user?.id) return [];
      const locations = await base44.entities.SavedLocation.filter({ user_id: user.id });
      // Sort by last_used to get most recently used first
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
      toast.success('Addresses shuffled!');
    } finally {
      setIsShuffling(false);
    }
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

      // Update address order in database
      console.log('Updating address order in database...');
      for (let i = 0; i < optimizedAddresses.length; i++) {
        await base44.entities.Address.update(optimizedAddresses[i].id, { order_index: i + 1 });
      }

      // Set route to active
      await base44.entities.Route.update(routeId, {
        status: 'active',
        started_at: new Date().toISOString(),
        optimized: true,
        ending_point: {
          address: endLocation.address,
          lat: endLocation.latitude,
          lng: endLocation.longitude
        }
      });

      // Invalidate queries
      await queryClient.invalidateQueries({ queryKey: ['route', routeId] });
      await queryClient.invalidateQueries({ queryKey: ['routeAddresses', routeId] });
      await queryClient.invalidateQueries({ queryKey: ['workerRoutes'] });

      // Update last_used on the selected location
      await base44.entities.SavedLocation.update(selectedEndLocation, {
        last_used: new Date().toISOString()
      });

      toast.success(`Route optimized! ${optimizedAddresses.length} addresses reordered.`);

      setTimeout(() => {
        if (onOptimized) {
          onOptimized();
        }
      }, 300);

    } catch (error) {
      console.error('Optimization failed:', error);
      toast.error('Failed to optimize: ' + error.message);
    } finally {
      setIsOptimizing(false);
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

      {/* Top sheet - no backdrop so you can see cards below */}
      <div className="absolute top-0 left-0 right-0 bg-white rounded-b-3xl p-4 pb-6 shadow-2xl animate-slide-down z-50 max-h-[50vh] overflow-y-auto">
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