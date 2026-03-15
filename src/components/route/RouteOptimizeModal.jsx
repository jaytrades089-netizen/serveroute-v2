import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import { base44 } from '@/api/base44Client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { MapPin, Navigation, Plus, Loader2, X, Home, Building, Briefcase, Shuffle, Play, RefreshCw, LocateFixed, CheckCircle, AlertCircle } from 'lucide-react';
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from 'sonner';
import { optimizeWithHybrid, geocodeAddress } from '@/components/services/OptimizationService';

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
  const [useCurrentLocation, setUseCurrentLocation] = useState(true);
  const [selectedStartLocation, setSelectedStartLocation] = useState('');
  const [isOptimizing, setIsOptimizing] = useState(false);
  const [currentLocationAddress, setCurrentLocationAddress] = useState(null);
  const [locationError, setLocationError] = useState(null);
  const [showAddLocation, setShowAddLocation] = useState(false);
  const [newLocationLabel, setNewLocationLabel] = useState('');
  const [newLocationAddress, setNewLocationAddress] = useState('');
  const [savingLocation, setSavingLocation] = useState(false);
  
  const [routeMetrics, setRouteMetrics] = useState(null);
  const [timeAtAddress, setTimeAtAddress] = useState(2);
  const [isOptimized, setIsOptimized] = useState(false);
  const [isStarting, setIsStarting] = useState(false);

  const { data: user } = useQuery({
    queryKey: ['currentUser'],
    queryFn: () => base44.auth.me()
  });

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

  useEffect(() => {
    if (savedLocations.length > 0 && !selectedEndLocation) {
      setSelectedEndLocation(savedLocations[0].id);
    }
  }, [savedLocations, selectedEndLocation]);

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
        await base44.entities.Address.update(shuffled[i].id, { 
          order_index: i + 1,
          zone_label: null
        });
      }
      await queryClient.invalidateQueries({ queryKey: ['routeAddresses', routeId] });
      setIsOptimized(false);
      setRouteMetrics(null);
      toast.success('Addresses shuffled!');
    } finally {
      setIsShuffling(false);
    }
  };

  const calculateEstCompletion = () => {
    if (!routeMetrics) return null;
    const driveTimeMinutes = routeMetrics.totalTimeMinutes;
    const addressTimeMinutes = timeAtAddress * addresses.length;
    const totalMinutes = driveTimeMinutes + addressTimeMinutes;
    const now = new Date();
    const completionTime = new Date(now.getTime() + totalMinutes * 60000);
    return { totalMinutes, completionTime, driveTime: routeMetrics.totalTimeMinutes, addressTime: addressTimeMinutes };
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
    setLocationError(null);

    try {
      let startLat, startLng;

      if (useCurrentLocation) {
        try {
          toast.info('Getting your current location...');
          const position = await new Promise((resolve, reject) => {
            if (!navigator.geolocation) {
              reject(new Error('Geolocation not supported by this device'));
              return;
            }
            navigator.geolocation.getCurrentPosition(resolve, reject, {
              enableHighAccuracy: true,
              timeout: 15000,
              maximumAge: 0
            });
          });
          startLat = position.coords.latitude;
          startLng = position.coords.longitude;
          console.log('GPS Location obtained:', startLat, startLng);

          // Reverse geocode to show the worker exactly which address was used as start
          try {
            const reverseUrl = `https://www.mapquestapi.com/geocoding/v1/reverse?key=${apiKey}&location=${startLat},${startLng}`;
            const reverseRes = await fetch(reverseUrl);
            const reverseData = await reverseRes.json();
            const loc = reverseData?.results?.[0]?.locations?.[0];
            if (loc) {
              const readable = [loc.street, loc.adminArea5, loc.adminArea3].filter(Boolean).join(', ');
              setCurrentLocationAddress(readable || `${startLat.toFixed(5)}, ${startLng.toFixed(5)}`);
            } else {
              setCurrentLocationAddress(`${startLat.toFixed(5)}, ${startLng.toFixed(5)}`);
            }
          } catch {
            setCurrentLocationAddress(`${startLat.toFixed(5)}, ${startLng.toFixed(5)}`);
          }

        } catch (geoError) {
          console.error('Geolocation error:', geoError);
          const msg = geoError.code === 1
            ? 'Location permission denied. Enable location in your phone settings or choose a start location below.'
            : geoError.code === 2
            ? 'Could not detect your location. Check GPS signal and try again.'
            : geoError.code === 3
            ? 'Location request timed out. Try again or choose a start location.'
            : 'Could not get your location. Please enable location services.';
          setLocationError(msg);
          setIsOptimizing(false);
          return;
        }
      } else {
        if (!selectedStartLocation) {
          toast.error('Please select a start location');
          setIsOptimizing(false);
          return;
        }
        const startLocation = savedLocations.find(loc => loc.id === selectedStartLocation);
        if (!startLocation) {
          toast.error('Start location not found');
          setIsOptimizing(false);
          return;
        }
        startLat = startLocation.latitude;
        startLng = startLocation.longitude;
      }

      console.log('Start position:', startLat, startLng);

      const endLocation = savedLocations.find(loc => loc.id === selectedEndLocation);
      if (!endLocation) {
        toast.error('End location not found');
        setIsOptimizing(false);
        return;
      }

      // Exclude completed addresses
      let validAddresses = addresses.filter(addr =>
        !addr.served &&
        addr.status !== 'served' &&
        addr.status !== 'completed' &&
        addr.status !== 'returned'
      );

      if (validAddresses.length < addresses.length) {
        console.log(`Excluded ${addresses.length - validAddresses.length} completed address(es) from optimization`);
      }

      const needsGeocoding = validAddresses.filter(a => !a.lat || !a.lng);

      if (needsGeocoding.length > 0) {
        console.log(`Geocoding ${needsGeocoding.length} addresses...`);
        toast.info(`Geocoding ${needsGeocoding.length} addresses...`);

        const hereApiKey = userSettings?.here_api_key || null;

        for (const addr of needsGeocoding) {
          const fullAddress = addr.normalized_address || addr.legal_address;
          try {
            // HERE first, MapQuest fallback — handled inside geocodeAddress()
            const coords = await geocodeAddress(fullAddress, hereApiKey, apiKey);
            if (coords) {
              await base44.entities.Address.update(addr.id, {
                lat: coords.lat,
                lng: coords.lng,
                geocode_status: 'exact'
              });
              addr.lat = coords.lat;
              addr.lng = coords.lng;
            }
          } catch (geoErr) {
            console.error('Geocode error for', fullAddress, geoErr);
          }
        }
      }

      validAddresses = validAddresses.filter(a => a.lat && a.lng);

      if (validAddresses.length === 0) {
        toast.error('No addresses could be geocoded');
        setIsOptimizing(false);
        return;
      }

      console.log(`Optimizing ${validAddresses.length} addresses...`);
      console.log('GPS start:', startLat, startLng);
      console.log('End location:', endLocation.address, endLocation.latitude, endLocation.longitude);
      toast.info(`Optimizing ${validAddresses.length} stops from GPS (${startLat.toFixed(4)}, ${startLng.toFixed(4)})...`);

      const optimizedAddresses = await optimizeWithHybrid(
        validAddresses,
        startLat,
        startLng,
        endLocation.latitude,
        endLocation.longitude,
        apiKey
      );

      // Show debug info about optimization result
      if (optimizedAddresses.length > 0) {
        const first = optimizedAddresses[0];
        const firstLabel = (first.normalized_address || first.legal_address || '').substring(0, 40);
        const distFeet = Math.round(
          Math.sqrt(
            Math.pow((first.lat - startLat) * 364000, 2) + 
            Math.pow((first.lng - startLng) * 288200, 2)
          )
        );
        const distMiles = (distFeet / 5280).toFixed(1);
        toast.success(`First stop: ${firstLabel} (${distMiles} mi from GPS)`, { duration: 8000 });
      }

      // Calculate route metrics
      const locations = [
        `${startLat},${startLng}`,
        ...optimizedAddresses.map(a => `${a.lat},${a.lng}`),
        `${endLocation.latitude},${endLocation.longitude}`
      ];

      const directionsUrl = `https://www.mapquestapi.com/directions/v2/route?key=${apiKey}`;
      const directionsResponse = await fetch(directionsUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ locations, options: { routeType: 'fastest', unit: 'm' } })
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

      // Save order_index in batches of 10
      const BATCH_SIZE = 10;
      for (let start = 0; start < optimizedAddresses.length; start += BATCH_SIZE) {
        const batch = optimizedAddresses.slice(start, start + BATCH_SIZE);
        await Promise.all(
          batch.map((addr, i) =>
            base44.entities.Address.update(addr.id, {
              order_index: start + i + 1,
              zone_label: addr.zone_label || null
            })
          )
        );
      }

      const startLocationData = useCurrentLocation
        ? { lat: startLat, lng: startLng }
        : {
            address: savedLocations.find(loc => loc.id === selectedStartLocation)?.address,
            lat: startLat,
            lng: startLng
          };

      await base44.entities.Route.update(routeId, {
        optimized: true,
        ending_point: { address: endLocation.address, lat: endLocation.latitude, lng: endLocation.longitude },
        starting_point: startLocationData
      });

      await base44.entities.SavedLocation.update(selectedEndLocation, {
        last_used: new Date().toISOString()
      });

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
      const activeRoutes = await base44.entities.Route.filter({ worker_id: user.id, status: 'active' });
      for (const activeRoute of activeRoutes) {
        if (activeRoute.id !== routeId) {
          await base44.entities.Route.update(activeRoute.id, { status: 'ready' });
        }
      }
      await base44.entities.Route.update(routeId, {
        status: 'active',
        started_at: new Date().toISOString(),
        total_miles: routeMetrics.totalMiles,
        total_drive_time_minutes: routeMetrics.totalTimeMinutes,
        time_at_address_minutes: timeAtAddress,
        est_completion_time: estCompletion.completionTime.toISOString(),
        est_total_minutes: estCompletion.totalMinutes
      });
      await queryClient.invalidateQueries({ queryKey: ['route', routeId] });
      await queryClient.invalidateQueries({ queryKey: ['routeAddresses', routeId] });
      await queryClient.invalidateQueries({ queryKey: ['workerRoutes'] });
      toast.success('Route started!');
      if (onOptimized) onOptimized();
    } catch (error) {
      console.error('Failed to start route:', error);
      toast.error('Failed to start route');
    } finally {
      setIsStarting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50">
      <style>{`
        @keyframes slide-down { from { transform: translateY(-100%); } to { transform: translateY(0); } }
        .animate-slide-down { animation: slide-down 0.3s ease-out; }
      `}</style>

      <div className="absolute inset-0 bg-black/20" onClick={onClose} />

      <div className="absolute top-0 left-0 right-0 bg-white rounded-b-3xl px-4 pt-3 pb-4 shadow-2xl animate-slide-down z-50 max-h-[95vh] overflow-y-auto">
        <div className="w-12 h-1 bg-gray-300 rounded-full mx-auto mb-2" />

        <div className="flex justify-between items-center mb-3">
          <h2 className="text-lg font-bold">Optimize Route</h2>
          <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-full">
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        {/* Route info */}
        <div className="bg-gray-50 rounded-xl p-2.5 mb-3 flex justify-between items-center">
          <div>
            <p className="font-semibold">{route?.folder_name || 'Route'}</p>
            <p className="text-sm text-gray-500">
              {addresses.filter(a => !a.served && a.status !== 'served' && a.status !== 'completed' && a.status !== 'returned').length} pending
              {addresses.filter(a => a.served || a.status === 'served' || a.status === 'completed' || a.status === 'returned').length > 0 && (
                <span className="text-gray-400"> · {addresses.filter(a => a.served || a.status === 'served' || a.status === 'completed' || a.status === 'returned').length} done</span>
              )}
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={handleShuffle} disabled={isShuffling} className="text-xs">
            {isShuffling ? <Loader2 className="w-3 h-3 mr-1 animate-spin" /> : <Shuffle className="w-3 h-3 mr-1" />}
            {isShuffling ? 'Shuffling...' : 'Shuffle'}
          </Button>
        </div>

        {/* Start location */}
        <label className="block text-xs font-medium text-gray-700 mb-1">Start Location</label>

        <div className="flex items-center gap-2 mb-1">
          <Checkbox
            id="useCurrentLocation"
            checked={useCurrentLocation}
            onCheckedChange={(val) => {
              setUseCurrentLocation(val);
              if (!val) { setCurrentLocationAddress(null); setLocationError(null); }
            }}
          />
          <label htmlFor="useCurrentLocation" className="text-sm text-gray-600 flex items-center gap-1 cursor-pointer">
            <LocateFixed className="w-4 h-4 text-blue-500" />
            Use current location
          </label>
        </div>

        {useCurrentLocation && currentLocationAddress && !locationError && (
          <div className="flex items-center gap-1.5 mb-3 ml-6">
            <CheckCircle className="w-3.5 h-3.5 text-green-500 flex-shrink-0" />
            <p className="text-xs text-green-700 font-medium">{currentLocationAddress}</p>
          </div>
        )}
        {useCurrentLocation && locationError && (
          <div className="flex items-start gap-1.5 mb-3 ml-6 bg-red-50 border border-red-200 rounded-lg p-2">
            <AlertCircle className="w-3.5 h-3.5 text-red-500 flex-shrink-0 mt-0.5" />
            <p className="text-xs text-red-700">{locationError}</p>
          </div>
        )}
        {useCurrentLocation && !currentLocationAddress && !locationError && (
          <p className="text-xs text-gray-400 mb-3 ml-6">Address will show here after you tap Optimize</p>
        )}

        {!useCurrentLocation && (
          <Select value={selectedStartLocation} onValueChange={setSelectedStartLocation}>
            <SelectTrigger className="w-full mb-4">
              <SelectValue placeholder="Select start location" />
            </SelectTrigger>
            <SelectContent>
              {savedLocations.map(loc => (
                <SelectItem key={loc.id} value={loc.id}>
                  <div className="flex items-center gap-2">
                    {getLocationIcon(loc.label)}
                    <span className="font-medium">{loc.label}</span>
                    <span className="text-gray-400 text-sm truncate max-w-[150px]">- {loc.address}</span>
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}

        {/* End location */}
        <label className="block text-xs font-medium text-gray-700 mb-1">End Location</label>
        <Select value={selectedEndLocation} onValueChange={setSelectedEndLocation}>
          <SelectTrigger className="w-full mb-2">
            <SelectValue placeholder="Select where to end" />
          </SelectTrigger>
          <SelectContent>
            {savedLocations.map(loc => (
              <SelectItem key={loc.id} value={loc.id}>
                <div className="flex items-center gap-2">
                  {getLocationIcon(loc.label)}
                  <span className="font-medium">{loc.label}</span>
                  <span className="text-gray-400 text-sm truncate max-w-[150px]">- {loc.address}</span>
                </div>
              </SelectItem>
            ))}
            <div
              className="relative flex w-full cursor-pointer select-none items-center rounded-sm py-2 px-2 text-sm outline-none hover:bg-accent border-t mt-1 pt-2"
              onClick={(e) => { e.stopPropagation(); setShowAddLocation(true); }}
            >
              <div className="flex items-center gap-2 text-blue-600">
                <Plus className="w-4 h-4" />
                <span className="font-medium">Add New Location</span>
              </div>
            </div>
          </SelectContent>
        </Select>

        {showAddLocation && (
          <div className="bg-orange-50 rounded-xl p-3 mb-3 border border-orange-200">
            <Input placeholder="Label (Home, Office)" value={newLocationLabel} onChange={(e) => setNewLocationLabel(e.target.value)} className="mb-2" />
            <Input placeholder="Full address" value={newLocationAddress} onChange={(e) => setNewLocationAddress(e.target.value)} className="mb-2" />
            <div className="flex gap-2">
              <Button variant="outline" size="sm" className="flex-1" onClick={() => { setShowAddLocation(false); setNewLocationLabel(''); setNewLocationAddress(''); }}>Cancel</Button>
              <Button size="sm" className="flex-1 bg-orange-500 hover:bg-orange-600 text-white" onClick={handleAddLocation} disabled={savingLocation}>
                {savingLocation ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Save'}
              </Button>
            </div>
          </div>
        )}



        {/* Route Metrics */}
        {isOptimized && routeMetrics && (
          <div className="bg-white rounded-xl p-3 shadow-sm mb-3 border border-gray-200">
            <h3 className="text-xs font-semibold text-gray-500 mb-2">ROUTE SUMMARY</h3>
            <div className="space-y-1.5">
              <div className="bg-gray-100 rounded-lg p-2 flex items-center justify-center gap-2">
                <Select value={timeAtAddress.toString()} onValueChange={(v) => setTimeAtAddress(parseInt(v))}>
                  <SelectTrigger className="border-0 bg-transparent font-semibold text-gray-700 text-sm p-0 h-auto w-auto gap-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {TIME_AT_ADDRESS_OPTIONS.map(opt => (
                      <SelectItem key={opt.value} value={opt.value.toString()}>{opt.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <span className="text-sm text-gray-600">per address</span>
              </div>
              <div className="bg-gray-100 rounded-lg p-2 text-center">
                <p className="text-sm text-gray-600">
                  {routeMetrics.totalMiles.toFixed(1)} miles • {addresses.length} addresses •
                  {(() => {
                    const est = calculateEstCompletion();
                    if (!est) return ' --';
                    const hours = Math.floor(est.totalMinutes / 60);
                    const mins = est.totalMinutes % 60;
                    return ` ${hours}h ${mins}m total`;
                  })()}
                </p>
              </div>
              <div className="bg-gray-100 rounded-lg p-2 text-center">
                {(() => {
                  const est = calculateEstCompletion();
                  return (
                    <p className="text-sm text-gray-600">
                      Est. done by <span className="font-semibold">{est?.completionTime.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true }) || '--:--'}</span>
                    </p>
                  );
                })()}
              </div>
            </div>
          </div>
        )}

        {/* Buttons */}
        <div className="flex gap-3">
          <Button
            onClick={handleOptimizeRoute}
            disabled={!selectedEndLocation || isOptimizing}
            className={`flex-1 font-bold py-3 ${isOptimized ? 'bg-gray-400 hover:bg-gray-500' : 'bg-orange-500 hover:bg-orange-600'} text-white`}
          >
            {isOptimizing ? (
              <><Loader2 className="w-5 h-5 mr-2 animate-spin" /> Optimizing...</>
            ) : isOptimized ? (
              <><RefreshCw className="w-5 h-5 mr-2" /> Re-Optimize</>
            ) : (
              <><Navigation className="w-5 h-5 mr-2" /> Optimize</>
            )}
          </Button>

          <Button
            onClick={handleStartRoute}
            disabled={!isOptimized || isStarting}
            className={`flex-1 font-bold py-3 text-white ${isOptimized ? 'bg-green-500 hover:bg-green-600' : 'bg-gray-300 cursor-not-allowed'}`}
          >
            {isStarting ? (
              <><Loader2 className="w-5 h-5 mr-2 animate-spin" /> Starting...</>
            ) : (
              <><Play className="w-5 h-5 mr-2" /> Start Route</>
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}