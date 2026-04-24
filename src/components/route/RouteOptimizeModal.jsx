import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import { base44 } from '@/api/base44Client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { MapPin, Navigation, Plus, Loader2, X, Home, Building, Briefcase, Shuffle, Play, RefreshCw, LocateFixed, CheckCircle, AlertCircle, ChevronDown } from 'lucide-react';
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from 'sonner';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { optimizeWithHybrid, geocodeAddress, calculateDistanceFeet } from '@/components/services/OptimizationService';
import LocationPicker from './LocationPicker';

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
  const [optimizedCount, setOptimizedCount] = useState(0);
  const [timeAtAddress, setTimeAtAddress] = useState(2);
  const [isOptimized, setIsOptimized] = useState(false);
  const [isStarting, setIsStarting] = useState(false);
  const [deletingLocationId, setDeletingLocationId] = useState(null);
  const [routeType, setRouteType] = useState('fastest'); // 'fastest' = time, 'shortest' = miles

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

  const { data: backendApiKeys } = useQuery({
    queryKey: ['backendApiKeys'],
    queryFn: async () => {
      const res = await base44.functions.invoke('getApiKeys', {});
      return res.data;
    },
    staleTime: 10 * 60 * 1000
  });

  const mapquestKey = backendApiKeys?.mapquest_api_key || userSettings?.mapquest_api_key || null;
  const hereKey = backendApiKeys?.here_api_key || userSettings?.here_api_key || null;

  const handleDeleteLocation = async (locId) => {
    try {
      await base44.entities.SavedLocation.delete(locId);
      if (selectedEndLocation === locId) setSelectedEndLocation('');
      if (selectedStartLocation === locId) setSelectedStartLocation('');
      refetchLocations();
      toast.success('Location deleted');
    } catch (error) {
      toast.error('Failed to delete location');
    }
    setDeletingLocationId(null);
  };

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
      const apiKey = mapquestKey;
      if (!apiKey) {
        toast.error('MapQuest API key not configured.');
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
  const [cachedGps, setCachedGps] = useState(null); // {lat, lng} pre-fetched when toggle is on
  const [gpsLoading, setGpsLoading] = useState(false);

  // Pre-fetch GPS as soon as "Use Current Location" is toggled on.
  // By the time the user taps Optimize the coords are already ready.
  useEffect(() => {
    if (!useCurrentLocation) {
      setCachedGps(null);
      setCurrentLocationAddress(null);
      setLocationError(null);
      return;
    }
    let cancelled = false;
    const prefetch = async () => {
      setGpsLoading(true);
      setLocationError(null);
      try {
        const position = await new Promise((resolve, reject) => {
          navigator.geolocation.getCurrentPosition(resolve, reject, {
            enableHighAccuracy: true,
            timeout: 15000,
            maximumAge: 30000 // accept a position up to 30s old — fast and accurate enough
          });
        });
        if (cancelled) return;
        const lat = position.coords.latitude;
        const lng = position.coords.longitude;
        // Attempt reverse geocode for readable label — non-blocking
        let readable = `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
        try {
          const apiKey = mapquestKey;
          if (apiKey) {
            const reverseUrl = `https://www.mapquestapi.com/geocoding/v1/reverse?key=${apiKey}&location=${lat},${lng}`;
            const res = await fetch(reverseUrl);
            const data = await res.json();
            const loc = data?.results?.[0]?.locations?.[0];
            if (loc) {
              readable = [loc.street, loc.adminArea5, loc.adminArea3].filter(Boolean).join(', ') || readable;
            }
          }
        } catch { /* reverse geocode is cosmetic — ignore errors */ }
        if (cancelled) return;
        setCachedGps({ lat, lng });
        setCurrentLocationAddress(readable);
      } catch (geoError) {
        if (cancelled) return;
        const msg = geoError.code === 1
          ? 'Location permission denied. Enable location in your phone settings or choose a start location below.'
          : geoError.code === 2
          ? 'Could not detect your location. Check GPS signal and try again.'
          : geoError.code === 3
          ? 'Location request timed out. Try again or choose a start location.'
          : 'Could not get your location. Please enable location services.';
        setLocationError(msg);
      } finally {
        if (!cancelled) setGpsLoading(false);
      }
    };
    prefetch();
    return () => { cancelled = true; };
  }, [useCurrentLocation, mapquestKey]); // re-run if toggle flips or key loads

  // If the route was already optimized (e.g. the night before), pre-populate
  // the metrics and set isOptimized=true so Start Route is immediately available
  // without requiring a re-optimization.
  useEffect(() => {
    if (route?.optimized_order?.length > 0) {
      setIsOptimized(true);
      setOptimizedCount(route.optimized_order.length);
      setRouteMetrics({
        totalMiles: route.total_miles || 0,
        totalTimeMinutes: route.total_drive_time_minutes || 0
      });
      if (route.time_at_address_minutes) {
        setTimeAtAddress(route.time_at_address_minutes);
      }
    }
  }, []); // run once on mount — intentionally empty deps

  const handleShuffle = async () => {
    setIsShuffling(true);
    try {
      const shuffled = [...addresses].sort(() => Math.random() - 0.5);
      const shuffledOrder = shuffled.map(a => a.id);
      await base44.entities.Route.update(routeId, { optimized_order: shuffledOrder });
      await queryClient.refetchQueries({ queryKey: ['route', routeId] });
      await queryClient.refetchQueries({ queryKey: ['routeAddresses', routeId] });
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
    const addressTimeMinutes = timeAtAddress * optimizedCount;
    const totalMinutes = driveTimeMinutes + addressTimeMinutes;
    const now = new Date();
    const completionTime = new Date(now.getTime() + totalMinutes * 60000);
    return { totalMinutes, completionTime, driveTime: routeMetrics.totalTimeMinutes, addressTime: addressTimeMinutes };
  };

  const handleOptimizeRoute = async () => {
    if (!routeType && !selectedEndLocation) {
      toast.error('Please select an end location or an optimization mode');
      return;
    }
    const apiKey = mapquestKey;
    if (!apiKey) {
      toast.error('MapQuest API key not configured.');
      return;
    }

    setIsOptimizing(true);
    setLocationError(null);
    setIsOptimized(false);
    setRouteMetrics(null);

    try {
      // NOTE: We deliberately do NOT clear optimized_order before optimizing.
      // The final update overwrites it atomically, and an early clear creates a
      // race window where the worker's cache can see an empty array during the
      // 10-30s optimization run.

      let startLat, startLng;

      if (useCurrentLocation) {
        // Use the GPS coords pre-fetched when the toggle was switched on.
        // If for some reason they are not ready yet (e.g. GPS still resolving),
        // block optimization and tell the worker to wait a moment.
        if (!cachedGps) {
          if (gpsLoading) {
            toast.info('Getting your location — try again in a moment...');
          } else {
            toast.error(locationError || 'Could not get your location. Check GPS and try again.');
          }
          setIsOptimizing(false);
          return;
        }
        startLat = cachedGps.lat;
        startLng = cachedGps.lng;
        console.log('GPS Location (pre-fetched):', startLat, startLng);
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

      const endLocation = savedLocations.find(loc => loc.id === selectedEndLocation) || null;
      if (!routeType && !endLocation) {
        toast.error('End location not found');
        setIsOptimizing(false);
        return;
      }

      // Always fetch fresh addresses directly from DB before optimizing
      // This ensures re-optimization always has the latest data, not stale props
      let allFreshAddresses;
      try {
        allFreshAddresses = await base44.entities.Address.filter({ route_id: routeId, deleted_at: null });
      } catch (e) {
        allFreshAddresses = addresses;
      }

      // Exclude completed addresses
      let validAddresses = allFreshAddresses.filter(addr =>
        !addr.served &&
        addr.status !== 'served' &&
        addr.status !== 'completed' &&
        addr.status !== 'returned'
      );

      if (validAddresses.length < allFreshAddresses.length) {
        console.log(`Excluded ${allFreshAddresses.length - validAddresses.length} completed address(es) from optimization`);
      }

      const needsGeocoding = validAddresses.filter(a => !a.lat || !a.lng);

      if (needsGeocoding.length > 0) {
        console.log(`Geocoding ${needsGeocoding.length} addresses...`);
        toast.info(`Geocoding ${needsGeocoding.length} addresses...`);

        const hereApiKey = hereKey;

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
      console.log('End location:', endLocation?.address, endLocation?.latitude, endLocation?.longitude);
      toast.info(`Optimizing ${validAddresses.length} stops from GPS (${startLat.toFixed(4)}, ${startLng.toFixed(4)})...`);

      let optimizedAddresses = await optimizeWithHybrid(
        validAddresses,
        startLat,
        startLng,
        endLocation?.latitude || null,
        endLocation?.longitude || null,
        apiKey,
        routeType || 'fastest'
      );

      // Post-process: rotate the optimized sequence so the address nearest
      // to the start point is always first. MapQuest sometimes returns a
      // circular route that is optimal overall but starts at the wrong end.
      if (optimizedAddresses.length > 1) {
        let nearestIdx = 0;
        let nearestDist = Infinity;
        for (let i = 0; i < optimizedAddresses.length; i++) {
          const addr = optimizedAddresses[i];
          const addrLat = addr.lat || addr.latitude;
          const addrLng = addr.lng || addr.longitude;
          if (!addrLat || !addrLng) continue;
          const dist = calculateDistanceFeet(startLat, startLng, addrLat, addrLng);
          if (dist < nearestDist) { nearestDist = dist; nearestIdx = i; }
        }
        if (nearestIdx !== 0) {
          console.log(`Rotating route: moving address at index ${nearestIdx} to front (nearest to GPS start)`);
          optimizedAddresses = [
            ...optimizedAddresses.slice(nearestIdx),
            ...optimizedAddresses.slice(0, nearestIdx)
          ];
          // Re-assign order_index after rotation
          optimizedAddresses = optimizedAddresses.map((addr, i) => ({ ...addr, order_index: i + 1 }));
        }
      }

      // Show debug info about optimization result
      if (optimizedAddresses.length > 0) {
        const first = optimizedAddresses[0];
        const firstLabel = (first.normalized_address || first.legal_address || '').substring(0, 40);
        const distFeet = calculateDistanceFeet(
          startLat, startLng,
          first.lat || first.latitude,
          first.lng || first.longitude
        );
        const distMiles = (distFeet / 5280).toFixed(1);
        toast.success(`First stop: ${firstLabel} (${distMiles} mi from GPS)`, { duration: 8000 });
      }

      // Calculate route metrics
      const lastAddr = optimizedAddresses[optimizedAddresses.length - 1];
      const endLat = endLocation?.latitude || lastAddr?.lat;
      const endLng = endLocation?.longitude || lastAddr?.lng;
      const locations = [
        `${startLat},${startLng}`,
        ...optimizedAddresses.map(a => `${a.lat},${a.lng}`),
        `${endLat},${endLng}`
      ];

      const directionsUrl = `https://www.mapquestapi.com/directions/v2/route?key=${apiKey}`;
      const directionsResponse = await fetch(directionsUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ locations, options: { routeType: routeType || 'fastest', unit: 'm' } })
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
      setOptimizedCount(validAddresses.length);
      setIsOptimized(true);

      // Save optimized order + metrics to Route in a single write
      // order_index is never stored on individual addresses — derived at render time from route.optimized_order
      const optimizedOrder = optimizedAddresses.map(a => a.id);
      console.log('Saving optimized order to Route...', { routeId, count: optimizedOrder.length, firstId: optimizedOrder[0], lastId: optimizedOrder[optimizedOrder.length - 1] });

      let saveSucceeded = false;
      try {
        const updateResult = await base44.entities.Route.update(routeId, {
          optimized_order: optimizedOrder,
          total_miles: metrics.totalMiles,
          total_drive_time_minutes: metrics.totalTimeMinutes,
          time_at_address_minutes: timeAtAddress
        });
        console.log('Route.update response:', updateResult);
        console.log('  optimized_order returned:', updateResult?.optimized_order?.length ?? 'undefined', 'ids');
        saveSucceeded = true;
      } catch (saveErr) {
        console.error('Route.update FAILED while saving optimized order:', saveErr);
        toast.error('Failed to save optimized order: ' + (saveErr?.message || 'unknown error'));
      }

      if (!saveSucceeded) {
        // Surface failure to the worker instead of pretending it worked
        setIsOptimizing(false);
        return;
      }

      // Single coordinated refetch — refetch route + addresses in parallel so the
      // useMemo in WorkerRouteDetail re-runs with the fresh optimized_order.
      // workerRoutes is invalidated (not refetched) since it's not currently rendered.
      await Promise.all([
        queryClient.refetchQueries({ queryKey: ['route', routeId] }),
        queryClient.refetchQueries({ queryKey: ['routeAddresses', routeId] })
      ]);
      queryClient.refetchQueries({ queryKey: ['workerRoutes'] });

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
      await queryClient.refetchQueries({ queryKey: ['route', routeId] });
      await queryClient.refetchQueries({ queryKey: ['routeAddresses', routeId] });
      queryClient.refetchQueries({ queryKey: ['workerRoutes'] });
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

      <div className="absolute inset-0 bg-black/50" onClick={onClose} />

      <div className={`absolute top-0 left-0 right-0 rounded-b-3xl px-4 pt-3 pb-4 shadow-2xl animate-slide-down z-50 ${isOptimized ? '' : 'max-h-[95vh] overflow-y-auto'}`}
        style={{ background: 'rgba(11,15,30,0.92)', backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)', border: '1px solid rgba(255,255,255,0.10)', borderTop: 'none' }}>
        <div className="w-12 h-1 rounded-full mx-auto mb-2" style={{ background: 'rgba(255,255,255,0.20)' }} />

        <div className="flex justify-between items-center mb-3">
          <h2 className="text-lg font-bold" style={{ color: '#E6E1E4' }}>Optimize Route</h2>
          <button onClick={onClose} className="p-2 rounded-full hover:bg-white/10">
            <X className="w-5 h-5" style={{ color: '#9CA3AF' }} />
          </button>
        </div>

        {!isOptimized && (
        <>
        {/* Route info */}
        <div className="rounded-xl p-2.5 mb-3 flex justify-between items-center" style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.10)' }}>
          <div>
            <p className="font-semibold" style={{ color: '#E6E1E4' }}>{route?.folder_name || 'Route'}</p>
          </div>
          <Button variant="outline" size="icon" onClick={handleShuffle} disabled={isShuffling} style={{ border: '1px solid rgba(255,255,255,0.15)', color: '#9CA3AF', background: 'rgba(255,255,255,0.05)' }}>
            {isShuffling ? <Loader2 className="w-4 h-4 animate-spin" /> : <Shuffle className="w-4 h-4" />}
          </Button>
        </div>

        {/* Start location */}
        <label className="block text-xs font-medium mb-1" style={{ color: '#9CA3AF' }}>Start Location</label>

        <button
          onClick={() => setUseCurrentLocation(v => !v)}
          className="w-full mb-1 flex items-center justify-center gap-2 py-2.5 rounded-xl font-semibold text-sm transition-all"
          style={useCurrentLocation
            ? { background: 'rgba(34,197,94,0.18)', border: '1px solid rgba(34,197,94,0.40)', color: '#22c55e' }
            : { background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(34,197,94,0.35)', color: '#22c55e' }}
        >
          <LocateFixed className="w-4 h-4" />
          Use Current Location
          {useCurrentLocation && gpsLoading && <span style={{ fontSize: '11px', marginLeft: 4, opacity: 0.7 }}>locating...</span>}
        </button>

        {useCurrentLocation && currentLocationAddress && !locationError && (
          <div className="flex items-center gap-1.5 mb-3 ml-6">
            <CheckCircle className="w-3.5 h-3.5 flex-shrink-0" style={{ color: '#22c55e' }} />
            <p className="text-xs font-medium" style={{ color: '#22c55e' }}>{currentLocationAddress}</p>
          </div>
        )}
        {useCurrentLocation && locationError && (
          <div className="flex items-start gap-1.5 mb-3 ml-6 rounded-lg p-2" style={{ background: 'rgba(239,68,68,0.12)', border: '1px solid rgba(239,68,68,0.30)' }}>
            <AlertCircle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" style={{ color: '#ef4444' }} />
            <p className="text-xs" style={{ color: '#ef4444' }}>{locationError}</p>
          </div>
        )}
        {useCurrentLocation && !currentLocationAddress && !locationError && (
          <p className="text-xs mb-3 ml-6" style={{ color: '#4B5563' }}>Address will show here after you tap Optimize</p>
        )}

        {!useCurrentLocation && (
          <LocationPicker
            locations={savedLocations}
            value={selectedStartLocation}
            onChange={setSelectedStartLocation}
            placeholder="Select start location"
            onDelete={(id) => setDeletingLocationId(id)}
            getLocationIcon={getLocationIcon}
            className="mb-4"
          />
        )}

        {/* End location */}
        <label className="block text-xs font-medium mb-1" style={{ color: '#9CA3AF' }}>Optimization Mode</label>
        <div className="flex gap-2 mb-2">
          <button type="button"
            onClick={() => { setRouteType(routeType === 'fastest' ? null : 'fastest'); setSelectedEndLocation(''); }}
            className="flex-1 mb-1 flex items-center justify-center gap-2 py-2.5 rounded-xl font-semibold text-sm transition-all"
            style={routeType === 'fastest'
              ? { background: 'rgba(233,195,73,0.18)', border: '1px solid rgba(233,195,73,0.40)', color: '#e9c349' }
              : { background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(233,195,73,0.35)', color: '#e9c349' }}
          >⏱ Efficient Time</button>
          <button type="button"
            onClick={() => { setRouteType(routeType === 'shortest' ? null : 'shortest'); setSelectedEndLocation(''); }}
            className="flex-1 mb-1 flex items-center justify-center gap-2 py-2.5 rounded-xl font-semibold text-sm transition-all"
            style={routeType === 'shortest'
              ? { background: 'rgba(233,195,73,0.18)', border: '1px solid rgba(233,195,73,0.40)', color: '#e9c349' }
              : { background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(233,195,73,0.35)', color: '#e9c349' }}
          >📍 Efficient Miles</button>
        </div>
        <label className="block text-xs font-medium mb-1" style={{ color: '#9CA3AF' }}>End Location</label>
        <div className={routeType ? 'opacity-40 pointer-events-none' : ''}>
        <LocationPicker
          locations={savedLocations}
          value={selectedEndLocation}
          onChange={setSelectedEndLocation}
          placeholder="Select where to end"
          onDelete={(id) => setDeletingLocationId(id)}
          getLocationIcon={getLocationIcon}
          className="mb-2"
          extraOption={
            <button
            className="w-full flex items-center gap-2 px-3 py-2 text-sm font-medium"
            style={{ color: '#e9c349' }}
              onClick={() => setShowAddLocation(true)}
            >
              <Plus className="w-4 h-4" />
              Add New Location
            </button>
          }
        />
        </div>

        {showAddLocation && (
          <div className="rounded-xl p-3 mb-3" style={{ background: 'rgba(233,195,73,0.08)', border: '1px solid rgba(233,195,73,0.25)' }}>
            <Input placeholder="Label (Home, Office)" value={newLocationLabel} onChange={(e) => setNewLocationLabel(e.target.value)} className="mb-2" style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', color: '#E6E1E4' }} />
            <Input placeholder="Full address" value={newLocationAddress} onChange={(e) => setNewLocationAddress(e.target.value)} className="mb-2" style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', color: '#E6E1E4' }} />
            <div className="flex gap-2">
              <Button variant="outline" size="sm" className="flex-1" style={{ border: '1px solid rgba(255,255,255,0.15)', color: '#9CA3AF', background: 'rgba(255,255,255,0.05)' }} onClick={() => { setShowAddLocation(false); setNewLocationLabel(''); setNewLocationAddress(''); }}>Cancel</Button>
              <Button size="sm" className="flex-1 font-semibold" style={{ background: 'rgba(233,195,73,0.18)', border: '1px solid rgba(233,195,73,0.40)', color: '#e9c349' }} onClick={handleAddLocation} disabled={savingLocation}>
                {savingLocation ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Save'}
              </Button>
            </div>
          </div>
        )}
        </>
        )}

        {/* Route Metrics */}
        {isOptimized && routeMetrics && (
          <div className="rounded-xl p-2.5 mb-3 flex flex-wrap gap-x-3 gap-y-1 text-sm justify-center" style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.10)', color: '#9CA3AF' }}>
            <span>{routeMetrics.totalMiles.toFixed(1)} mi</span>
            <span>•</span>
            <span>{optimizedCount} stops</span>
            <span>•</span>
            <span>{(() => { const est = calculateEstCompletion(); if (!est) return '--'; const h = Math.floor(est.totalMinutes/60); const m = est.totalMinutes%60; return `${h}h ${m}m`; })()}</span>
            <span>•</span>
            <span>Done ~{(() => { const est = calculateEstCompletion(); return est?.completionTime.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true }) || '--'; })()}</span>
          </div>
        )}

        {/* Buttons */}
        <div className="flex gap-3">
          <Button
            onClick={handleOptimizeRoute}
            disabled={(!selectedEndLocation && !routeType) || isOptimizing}
            className="flex-1 font-bold py-3"
            style={isOptimized
              ? { background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.15)', color: '#9CA3AF' }
              : { background: 'rgba(233,195,73,0.18)', backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)', border: '1px solid rgba(233,195,73,0.40)', color: '#e9c349' }}
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
            className="flex-1 font-bold py-3"
            style={isOptimized
              ? { background: 'rgba(233,195,73,0.18)', backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)', border: '1px solid rgba(233,195,73,0.40)', color: '#e9c349' }
              : { background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.10)', color: '#4B5563', cursor: 'not-allowed' }}
          >
            {isStarting ? (
              <><Loader2 className="w-5 h-5 mr-2 animate-spin" /> Starting...</>
            ) : (
              <><Play className="w-5 h-5 mr-2" /> Start Route</>
            )}
          </Button>
        </div>
      </div>

      <AlertDialog open={!!deletingLocationId} onOpenChange={(open) => { if (!open) setDeletingLocationId(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete saved location?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently remove this location from your saved list.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction className="bg-red-500 hover:bg-red-600" onClick={() => handleDeleteLocation(deletingLocationId)}>
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
