import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { MapPin, Navigation, Plus, Loader2, X, Home, Building, Briefcase, Shuffle } from 'lucide-react';
import { toast } from 'sonner';

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

    setIsOptimizing(true);

    try {
      console.log('Starting optimization...');
      
      // Get current position
      const position = await new Promise((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(resolve, reject, {
          enableHighAccuracy: true,
          timeout: 10000
        });
      });
      console.log('Position:', position.coords.latitude, position.coords.longitude);

      const endLocation = savedLocations.find(loc => loc.id === selectedEndLocation);
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

      // DEBUG: Log before order
      console.log('BEFORE optimization - address order:');
      validAddresses.forEach((addr, i) => {
        console.log(`  ${i + 1}. ${addr.normalized_address || addr.legal_address} (order_index: ${addr.order_index})`);
      });

      // Build locations array for MapQuest
      const locations = [
        `${position.coords.latitude},${position.coords.longitude}`,
        ...validAddresses.map(addr => `${addr.lat},${addr.lng}`),
        `${endLocation.latitude},${endLocation.longitude}`
      ];

      const apiKey = userSettings?.mapquest_api_key;
      if (!apiKey) {
        toast.error('MapQuest API key not configured.');
        setIsOptimizing(false);
        return;
      }

      // Call MapQuest
      const url = `https://www.mapquestapi.com/directions/v2/optimizedroute?key=${apiKey}`;
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
        toast.error('MapQuest API error: ' + (result.info?.messages?.[0] || 'Unknown error'));
        setIsOptimizing(false);
        return;
      }

      if (result.route?.locationSequence) {
        const sequence = result.route.locationSequence;
        
        // DEBUG: Log the sequence
        console.log('=== MAPQUEST OPTIMIZATION RESULTS ===');
        console.log('Raw locationSequence from MapQuest:', sequence);
        console.log('Number of locations sent:', locations.length);
        console.log('Locations breakdown:');
        console.log('  - locations[0] = start (current position)');
        console.log('  - locations[1..' + validAddresses.length + '] = addresses');
        console.log('  - locations[' + (validAddresses.length + 1) + '] = end location');
        
        // MapQuest locationSequence is an array where:
        // - sequence[i] = the index in the ORIGINAL locations array that should be visited at stop i
        // - sequence[0] should be 0 (start)
        // - sequence[last] should be locations.length-1 (end)
        // - The middle values are the address indices in optimized order
        
        console.log('\nBEFORE optimization - addresses as sent to MapQuest:');
        validAddresses.forEach((addr, i) => {
          console.log(`  locations[${i + 1}]: ${addr.normalized_address || addr.legal_address} (id: ${addr.id})`);
        });
        
        console.log('\nMapQuest returned sequence:', sequence);
        console.log('This means visit order is:');
        sequence.forEach((locIdx, stopNum) => {
          if (locIdx === 0) {
            console.log(`  Stop ${stopNum}: START (current location)`);
          } else if (locIdx === locations.length - 1) {
            console.log(`  Stop ${stopNum}: END (${endLocation.label})`);
          } else {
            const addr = validAddresses[locIdx - 1];
            console.log(`  Stop ${stopNum}: ${addr?.normalized_address || addr?.legal_address || 'UNKNOWN'}`);
          }
        });
        
        // Build the new order for addresses
        // We need to find all the address indices in the sequence (skip start=0 and end=lastIndex)
        const addressUpdates = [];
        let newOrderPosition = 1;
        
        for (let i = 0; i < sequence.length; i++) {
          const locationIndex = sequence[i];
          
          // Skip start (0) and end (last index)
          if (locationIndex === 0 || locationIndex === locations.length - 1) {
            continue;
          }
          
          // This is an address - locationIndex maps to validAddresses[locationIndex - 1]
          const addressArrayIndex = locationIndex - 1;
          const address = validAddresses[addressArrayIndex];
          
          if (address) {
            console.log(`  New position ${newOrderPosition}: ${address.normalized_address || address.legal_address}`);
            addressUpdates.push({ address, newOrder: newOrderPosition });
            newOrderPosition++;
          } else {
            console.error(`  ERROR: No address at index ${addressArrayIndex}`);
          }
        }
        
        console.log('\nTotal addresses to update:', addressUpdates.length);

        // Deactivate other active routes
        const activeRoutes = await base44.entities.Route.filter({ 
          worker_id: user.id, 
          status: 'active' 
        });
        for (const activeRoute of activeRoutes) {
          if (activeRoute.id !== routeId) {
            await base44.entities.Route.update(activeRoute.id, { status: 'paused' });
          }
        }

        // Update address order in database
        console.log('\nUpdating addresses in database:');
        const updatePromises = addressUpdates.map(({ address, newOrder }) => {
          console.log(`  Setting ${address.id} order_index to ${newOrder}`);
          return base44.entities.Address.update(address.id, { order_index: newOrder });
        });
        await Promise.all(updatePromises);
        console.log('All address updates completed');

        // Set route to active
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

        // Small delay to ensure database updates are committed
        await new Promise(resolve => setTimeout(resolve, 500));

        // Invalidate queries to refresh the UI
        console.log('\nInvalidating queries to refresh UI...');
        await queryClient.invalidateQueries({ queryKey: ['route', routeId] });
        await queryClient.invalidateQueries({ queryKey: ['routeAddresses', routeId] });
        await queryClient.invalidateQueries({ queryKey: ['workerRoutes'] });

        toast.success('Route optimized! Addresses reordered.');
        console.log('=== OPTIMIZATION COMPLETE ===');
        
        // Call onOptimized callback after a brief delay
        setTimeout(() => {
          if (onOptimized) {
            onOptimized();
          }
        }, 300);

      } else {
        console.error('No locationSequence in MapQuest response:', result);
        toast.error('Could not optimize route - no sequence returned');
      }

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