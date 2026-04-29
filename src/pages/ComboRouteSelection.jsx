import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { useNavigate, Link } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import { Button } from '@/components/ui/button';
import { ChevronLeft, Check, Shuffle, Loader2, MapPin, Calendar, AlertCircle, X, LocateFixed, CheckCircle, Navigation } from 'lucide-react';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { optimizeWithHybrid, geocodeAddress, calculateDistanceFeet } from '@/components/services/OptimizationService';
import LocationPicker from '@/components/route/LocationPicker';
import BottomNav from '@/components/layout/BottomNav';

export default function ComboRouteSelection() {
  const navigate = useNavigate();
  const urlParams = new URLSearchParams(window.location.search);
  const preselect = urlParams.get('preselect');
  const preselectIds = preselect ? preselect.split(',').filter(Boolean) : [];
  const [selectedRoutes, setSelectedRoutes] = useState(preselectIds);
  const [isOptimizing, setIsOptimizing] = useState(false);

  // Optimize modal state
  const [showOptimizeModal, setShowOptimizeModal] = useState(false);
  const [useCurrentLocation, setUseCurrentLocation] = useState(true);
  const [selectedStartLocation, setSelectedStartLocation] = useState('');
  const [selectedEndLocation, setSelectedEndLocation] = useState('');
  const [routeType, setRouteType] = useState('fastest');
  const [cachedGps, setCachedGps] = useState(null);
  const [gpsLoading, setGpsLoading] = useState(false);
  const [locationError, setLocationError] = useState(null);
  const [currentLocationAddress, setCurrentLocationAddress] = useState(null);

  const { data: user } = useQuery({
    queryKey: ['currentUser'],
    queryFn: () => base44.auth.me()
  });

  const { data: routes = [], isLoading: routesLoading } = useQuery({
    queryKey: ['comboRoutes', user?.id],
    queryFn: async () => {
      if (!user?.id) return [];
      const allRoutes = await base44.entities.Route.filter({});
      // Exclude archived, completed, and deleted routes — match ScanAddToRoute filter pattern
      return allRoutes.filter(r =>
        r.worker_id === user.id &&
        !r.deleted_at &&
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
      const locs = await base44.entities.SavedLocation.filter({ user_id: user.id });
      return locs.sort((a, b) => {
        const aTime = a.last_used ? new Date(a.last_used) : new Date(a.created_date || 0);
        const bTime = b.last_used ? new Date(b.last_used) : new Date(b.created_date || 0);
        return bTime - aTime;
      });
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

  // Auto-select first saved location as end when locations load
  useEffect(() => {
    if (savedLocations.length > 0 && !selectedEndLocation) {
      setSelectedEndLocation(savedLocations[0].id);
    }
  }, [savedLocations, selectedEndLocation]);

  // Pre-fetch GPS when modal opens — re-runs when mapquestKey loads so reverse geocode gets a real address
  useEffect(() => {
    if (!useCurrentLocation || !showOptimizeModal) {
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
            maximumAge: 30000
          });
        });
        if (cancelled) return;
        const lat = position.coords.latitude;
        const lng = position.coords.longitude;
        let readable = `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
        try {
          if (mapquestKey) {
            const res = await fetch(`https://www.mapquestapi.com/geocoding/v1/reverse?key=${mapquestKey}&location=${lat},${lng}`);
            const data = await res.json();
            const loc = data?.results?.[0]?.locations?.[0];
            if (loc) {
              readable = [loc.street, loc.adminArea5, loc.adminArea3].filter(Boolean).join(', ') || readable;
            }
          }
        } catch { /* reverse geocode is cosmetic */ }
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
  }, [useCurrentLocation, showOptimizeModal, mapquestKey]);

  const toggleRouteSelection = (routeId) => {
    setSelectedRoutes(prev =>
      prev.includes(routeId) ? prev.filter(id => id !== routeId) : [...prev, routeId]
    );
  };

  const getTotalAddresses = () =>
    selectedRoutes.reduce((sum, routeId) => sum + (routeAddressCounts[routeId] || 0), 0);

  const handleOptimizeCombo = async () => {
    if (selectedRoutes.length < 2) {
      toast.error('Please select at least 2 routes');
      return;
    }
    if (!selectedEndLocation && !routeType) {
      toast.error('Please select an end location or optimization mode');
      return;
    }

    if (!mapquestKey) {
      toast.error('MapQuest API key not configured. Go to Settings to add it.');
      return;
    }

    // Resolve start location
    let startLat, startLng;
    if (useCurrentLocation) {
      if (!cachedGps) {
        if (gpsLoading) {
          toast.info('Getting your location — try again in a moment...');
        } else {
          toast.error(locationError || 'Could not get your location. Check GPS and try again.');
        }
        return;
      }
      startLat = cachedGps.lat;
      startLng = cachedGps.lng;
    } else {
      if (!selectedStartLocation) {
        toast.error('Please select a start location');
        return;
      }
      const startLoc = savedLocations.find(l => l.id === selectedStartLocation);
      if (!startLoc) {
        toast.error('Start location not found');
        return;
      }
      startLat = startLoc.latitude;
      startLng = startLoc.longitude;
    }

    setIsOptimizing(true);

    try {
      // Mark any existing active combo routes as completed
      const existingCombos = await base44.entities.ComboRoute.filter({ user_id: user.id, status: 'active' });
      for (const old of existingCombos) {
        await base44.entities.ComboRoute.update(old.id, { status: 'completed' });
        for (const oldRouteId of (old.route_ids || [])) {
          await base44.entities.Route.update(oldRouteId, { combo_route_ids: [] });
        }
      }

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

      // Geocode any addresses that don't have coordinates — same as single-route optimization.
      // Without this, addresses without lat/lng are appended in original order, defeating optimization.
      const needsGeocoding = allAddresses.filter(a => !a.lat || !a.lng);
      if (needsGeocoding.length > 0) {
        toast.info(`Geocoding ${needsGeocoding.length} address${needsGeocoding.length > 1 ? 'es' : ''}...`);
        for (const addr of needsGeocoding) {
          const fullAddress = addr.normalized_address || addr.legal_address;
          try {
            const coords = await geocodeAddress(fullAddress, hereKey, mapquestKey, startLat, startLng);
            if (coords) {
              await base44.entities.Address.update(addr.id, { lat: coords.lat, lng: coords.lng, geocode_status: 'exact' });
              addr.lat = coords.lat;
              addr.lng = coords.lng;
            }
          } catch (geoErr) {
            console.error('Geocode error for', fullAddress, geoErr);
          }
        }
      }

      // Outlier detection — same 100-mile threshold as single-route optimization
      const coordAddresses = allAddresses.filter(a => a.lat && a.lng);
      if (coordAddresses.length >= 2) {
        const centLat = coordAddresses.reduce((s, a) => s + a.lat, 0) / coordAddresses.length;
        const centLng = coordAddresses.reduce((s, a) => s + a.lng, 0) / coordAddresses.length;
        const OUTLIER_FEET = 100 * 5280;
        coordAddresses
          .filter(a => calculateDistanceFeet(centLat, centLng, a.lat, a.lng) > OUTLIER_FEET)
          .forEach(a => {
            const label = (a.normalized_address || a.legal_address || '').split('\n')[0].trim().substring(0, 50);
            toast.warning(`⚠️ "${label}" is 100+ miles from your other stops — verify city & zip, then re-optimize.`, { duration: 20000 });
          });
      }

      const endLocation = savedLocations.find(loc => loc.id === selectedEndLocation) || null;

      const optimizedAddresses = await optimizeWithHybrid(
        allAddresses,
        startLat,
        startLng,
        endLocation?.latitude || null,
        endLocation?.longitude || null,
        mapquestKey
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

      const optimizedOrder = optimizedAddresses.map(a => a.id);

      // Calculate route metrics via MapQuest Directions
      let totalMiles = 0;
      let totalDriveTimeMinutes = 0;
      try {
        const geocodedAddrs = optimizedAddresses.filter(a => (a.lat || a.latitude) && (a.lng || a.longitude));
        if (geocodedAddrs.length > 0) {
          const waypoints = [
            `${startLat},${startLng}`,
            ...geocodedAddrs.map(a => `${a.lat || a.latitude},${a.lng || a.longitude}`),
            ...(endLocation ? [`${endLocation.latitude},${endLocation.longitude}`] : [])
          ];
          const CHUNK_SIZE = 90;
          for (let i = 0; i < waypoints.length - 1; i += CHUNK_SIZE) {
            const chunk = waypoints.slice(i, Math.min(i + CHUNK_SIZE + 1, waypoints.length));
            if (chunk.length < 2) continue;
            const dirResponse = await fetch(`https://www.mapquestapi.com/directions/v2/route?key=${mapquestKey}`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                locations: chunk,
                options: { routeType: routeType || 'fastest', unit: 'm' }
              })
            });
            const dirData = await dirResponse.json();
            if (dirData.route) {
              totalMiles += dirData.route.distance || 0;
              totalDriveTimeMinutes += Math.round((dirData.route.time || 0) / 60);
            }
          }
        }
      } catch (dirError) {
        console.warn('Failed to calculate route metrics:', dirError);
      }

      const startedAtNow = new Date().toISOString();

      const combo = await base44.entities.ComboRoute.create({
        user_id: user.id,
        company_id: user.company_id,
        name: `Combo - ${format(new Date(), 'MMM d')}`,
        route_ids: selectedRoutes,
        route_order: routeOrder,
        optimized_order: optimizedOrder,
        end_location_id: selectedEndLocation || null,
        status: 'active',
        total_addresses: allAddresses.length,
        started_at: startedAtNow,
        total_miles: Math.round(totalMiles * 10) / 10,
        total_drive_time_minutes: totalDriveTimeMinutes
      });

      const BATCH_SIZE = 10;
      for (let start = 0; start < optimizedAddresses.length; start += BATCH_SIZE) {
        const batch = optimizedAddresses.slice(start, start + BATCH_SIZE);
        await Promise.all(
          batch.map((addr, i) =>
            base44.entities.Address.update(addr.id, { order_index: start + i + 1 })
          )
        );
      }

      for (const routeId of selectedRoutes) {
        await base44.entities.Route.update(routeId, { status: 'active', started_at: startedAtNow });
      }

      toast.success(`Combo route created with ${allAddresses.length} addresses!`);
      navigate(createPageUrl(`ComboRouteReview?id=${combo.id}`));

    } catch (error) {
      console.error('Combo optimization failed:', error);
      toast.error('Failed to optimize: ' + error.message);
    } finally {
      setIsOptimizing(false);
    }
  };

  const getLocationIcon = (label) => <MapPin className="w-4 h-4" />;

  return (
    <div style={{ minHeight: '100vh', background: 'transparent', paddingBottom: 80 }}>
      {/* Header */}
      <header style={{ background: 'rgba(11,15,30,0.75)', backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)', borderBottom: '1px solid rgba(255,255,255,0.08)', color: '#e6e1e4', padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 12, position: 'sticky', top: 0, zIndex: 50 }}>
        <Link to={createPageUrl('WorkerRoutes')} className="flex items-center justify-center w-10 h-10 rounded-lg hover:bg-white/10 active:bg-white/20 transition-colors" style={{ border: '1px solid #363436' }}>
          <ChevronLeft className="w-6 h-6" />
        </Link>
        <div>
          <h1 className="font-bold text-lg" style={{ color: '#e6e1e4' }}>Combo Route</h1>
          <p className="text-sm" style={{ color: '#8a7f87' }}>Combine multiple routes</p>
        </div>
      </header>

      <main className="px-4 py-4 max-w-lg mx-auto">
        {/* Route Selection */}
        <div className="rounded-2xl p-4 mb-4" style={{ background: 'rgba(14,20,44,0.55)', backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)', border: '1px solid rgba(255,255,255,0.10)' }}>
          <h2 className="font-semibold mb-3" style={{ color: '#e6e1e4' }}>Select Routes to Combine</h2>

          {routesLoading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="w-6 h-6 animate-spin" style={{ color: '#e9c349' }} />
            </div>
          ) : routes.length === 0 ? (
            <div className="text-center py-8">
              <AlertCircle className="w-8 h-8 mx-auto mb-2" style={{ color: '#4B5563' }} />
              <p style={{ color: '#6B7280' }}>No routes available to combine</p>
            </div>
          ) : (() => {
            const scheduledRoutes = routes.filter(r => preselectIds.includes(r.id));
            const otherRoutes = routes.filter(r => !preselectIds.includes(r.id));

            const renderRouteRow = (route) => {
              const addressCount = routeAddressCounts[route.id] || 0;
              const isSelected = selectedRoutes.includes(route.id);
              return (
                <div
                  key={route.id}
                  onClick={() => toggleRouteSelection(route.id)}
                  className="rounded-xl p-4 cursor-pointer transition-all"
                  style={isSelected
                    ? { background: 'rgba(233,195,73,0.15)', border: '2px solid rgba(233,195,73,0.60)' }
                    : { background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.10)' }
                  }
                >
                  <div className="flex items-center gap-3">
                    <div className="w-6 h-6 rounded-md border-2 flex items-center justify-center transition-colors flex-shrink-0"
                      style={isSelected
                        ? { background: '#e9c349', borderColor: '#e9c349', color: '#0F0B10' }
                        : { borderColor: '#363436', background: 'transparent' }
                      }>
                      {isSelected && <Check className="w-4 h-4" />}
                    </div>
                    <div className="flex-1">
                      <p className="font-semibold" style={{ color: '#e6e1e4' }}>{route.folder_name}</p>
                      <div className="flex items-center gap-3 text-sm" style={{ color: '#6B7280' }}>
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
            };

            return (
              <div className="space-y-4">
                {scheduledRoutes.length > 0 && (
                  <div>
                    <div className="flex items-center gap-2 mb-2 px-2 py-1.5 rounded-lg" style={{ background: 'rgba(233,195,73,0.15)', border: '1px solid rgba(233,195,73,0.35)' }}>
                      <Shuffle className="w-3.5 h-3.5" style={{ color: '#e9c349' }} />
                      <span className="text-xs font-bold uppercase tracking-wide" style={{ color: '#e9c349' }}>Scheduled Combo</span>
                    </div>
                    <div className="space-y-2">{scheduledRoutes.map(renderRouteRow)}</div>
                  </div>
                )}
                {otherRoutes.length > 0 && (
                  <div>
                    {scheduledRoutes.length > 0 && (
                      <p className="text-xs font-semibold uppercase tracking-wide mb-2 px-1" style={{ color: '#6B7280' }}>Other Routes</p>
                    )}
                    <div className="space-y-2">{otherRoutes.map(renderRouteRow)}</div>
                  </div>
                )}
              </div>
            );
          })()}
        </div>

        {/* Summary */}
        <div className="rounded-xl p-4 mb-4 text-center" style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.10)' }}>
          <p style={{ color: '#8a7f87' }}>
            Selected: <span className="font-bold" style={{ color: '#e6e1e4' }}>{selectedRoutes.length} routes</span>
            <span style={{ color: '#6B7280' }}> ({getTotalAddresses()} addresses)</span>
          </p>
        </div>

        {/* Continue Button */}
        <button
          onClick={() => setShowOptimizeModal(true)}
          disabled={selectedRoutes.length < 2}
          className="w-full rounded-xl py-4 font-bold text-base flex items-center justify-center gap-2 transition-opacity disabled:opacity-40"
          style={{ background: 'rgba(233,195,73,0.20)', border: '1px solid rgba(233,195,73,0.50)', color: '#e9c349' }}
        >
          <Shuffle className="w-5 h-5" />
          Continue to Optimize
        </button>

        {selectedRoutes.length < 2 && (
          <p className="text-center text-sm mt-2" style={{ color: '#6B7280' }}>Select at least 2 routes to combine</p>
        )}
      </main>

      <BottomNav currentPage="WorkerRoutes" />

      {/* Optimize Modal */}
      {showOptimizeModal && (
        <div className="fixed inset-0 z-50">
          <style>{`
            @keyframes slide-down { from { transform: translateY(-100%); } to { transform: translateY(0); } }
            .animate-slide-down { animation: slide-down 0.3s ease-out; }
          `}</style>

          <div className="absolute inset-0 bg-black/50" onClick={() => !isOptimizing && setShowOptimizeModal(false)} />

          <div className="absolute top-0 left-0 right-0 rounded-b-3xl px-4 pt-3 pb-6 shadow-2xl animate-slide-down z-50 max-h-[95vh] overflow-y-auto"
            style={{ background: 'rgba(11,15,30,0.92)', backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)', border: '1px solid rgba(255,255,255,0.10)', borderTop: 'none' }}>
            <div className="w-12 h-1 rounded-full mx-auto mb-2" style={{ background: 'rgba(255,255,255,0.20)' }} />

            <div className="flex justify-between items-center mb-4">
              <h2 className="text-lg font-bold" style={{ color: '#E6E1E4' }}>Optimize Combo Route</h2>
              <button onClick={() => !isOptimizing && setShowOptimizeModal(false)} className="p-2 rounded-full hover:bg-white/10">
                <X className="w-5 h-5" style={{ color: '#9CA3AF' }} />
              </button>
            </div>

            {/* Route summary pill */}
            <div className="rounded-xl p-2.5 mb-4 flex items-center justify-between" style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.10)' }}>
              <p className="font-semibold text-sm" style={{ color: '#E6E1E4' }}>{selectedRoutes.length} routes · {getTotalAddresses()} addresses</p>
            </div>

            {/* Start Location */}
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
            {useCurrentLocation && !currentLocationAddress && !locationError && !gpsLoading && (
              <p className="text-xs mb-3 ml-6" style={{ color: '#4B5563' }}>Address will show here after location is detected</p>
            )}

            {!useCurrentLocation && (
              <LocationPicker
                locations={savedLocations}
                value={selectedStartLocation}
                onChange={setSelectedStartLocation}
                placeholder="Select start location"
                getLocationIcon={getLocationIcon}
                className="mb-4"
              />
            )}

            {/* Optimization Mode */}
            <label className="block text-xs font-medium mb-1 mt-3" style={{ color: '#9CA3AF' }}>Optimization Mode</label>
            <div className="flex gap-2 mb-3">
              <button type="button"
                onClick={() => { setRouteType(routeType === 'fastest' ? null : 'fastest'); setSelectedEndLocation(''); }}
                className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl font-semibold text-sm transition-all"
                style={routeType === 'fastest'
                  ? { background: 'rgba(233,195,73,0.18)', border: '1px solid rgba(233,195,73,0.40)', color: '#e9c349' }
                  : { background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(233,195,73,0.35)', color: '#e9c349' }}
              >⏱ Efficient Time</button>
              <button type="button"
                onClick={() => { setRouteType(routeType === 'shortest' ? null : 'shortest'); setSelectedEndLocation(''); }}
                className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl font-semibold text-sm transition-all"
                style={routeType === 'shortest'
                  ? { background: 'rgba(233,195,73,0.18)', border: '1px solid rgba(233,195,73,0.40)', color: '#e9c349' }
                  : { background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(233,195,73,0.35)', color: '#e9c349' }}
              >📍 Efficient Miles</button>
            </div>

            {/* End Location */}
            <label className="block text-xs font-medium mb-1" style={{ color: '#9CA3AF' }}>End Location</label>
            <div className={routeType ? 'opacity-40 pointer-events-none' : ''}>
              <LocationPicker
                locations={savedLocations}
                value={selectedEndLocation}
                onChange={setSelectedEndLocation}
                placeholder="Select where to end"
                getLocationIcon={getLocationIcon}
                className="mb-4"
              />
            </div>

            {/* Optimize Button */}
            <button
              onClick={handleOptimizeCombo}
              disabled={(!selectedEndLocation && !routeType) || isOptimizing}
              className="w-full rounded-xl py-3.5 font-bold text-base flex items-center justify-center gap-2 transition-opacity disabled:opacity-40 mt-2"
              style={{ background: 'rgba(233,195,73,0.20)', border: '1px solid rgba(233,195,73,0.50)', color: '#e9c349' }}
            >
              {isOptimizing ? (
                <><Loader2 className="w-5 h-5 animate-spin" /> Optimizing...</>
              ) : (
                <><Navigation className="w-5 h-5" /> Optimize Combo Route</>
              )}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
