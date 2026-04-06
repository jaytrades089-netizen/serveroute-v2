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
  const urlParams = new URLSearchParams(window.location.search);
  const preselect = urlParams.get('preselect');
  const preselectIds = preselect ? preselect.split(',').filter(Boolean) : [];
  const [selectedRoutes, setSelectedRoutes] = useState(preselectIds);
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
      // Mark any existing active combo routes as completed and clear combo_route_ids from their routes
      const existingCombos = await base44.entities.ComboRoute.filter({ 
        user_id: user.id, 
        status: 'active' 
      });
      for (const old of existingCombos) {
        await base44.entities.ComboRoute.update(old.id, { status: 'completed' });
        // Clear combo_route_ids from all routes in the old combo
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

      // Calculate route metrics via MapQuest Directions
      let totalMiles = 0;
      let totalDriveTimeMinutes = 0;
      
      try {
        const geocodedAddrs = optimizedAddresses.filter(a => (a.lat || a.latitude) && (a.lng || a.longitude));
        if (geocodedAddrs.length > 0) {
          // Build waypoints: start → all addresses → end
          const waypoints = [
            `${startLat},${startLng}`,
            ...geocodedAddrs.map(a => `${a.lat || a.latitude},${a.lng || a.longitude}`),
            `${endLocation.latitude},${endLocation.longitude}`
          ];
          
          // MapQuest Directions limit is ~100 waypoints per call; chunk if needed
          const CHUNK_SIZE = 90;
          for (let i = 0; i < waypoints.length - 1; i += CHUNK_SIZE) {
            const chunk = waypoints.slice(i, Math.min(i + CHUNK_SIZE + 1, waypoints.length));
            if (chunk.length < 2) continue;
            
            const dirUrl = `https://www.mapquestapi.com/directions/v2/route?key=${apiKey}`;
            const dirResponse = await fetch(dirUrl, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                locations: chunk,
                options: { routeType: 'fastest', unit: 'm' }
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

      // Create ComboRoute record with metrics
      const combo = await base44.entities.ComboRoute.create({
        user_id: user.id,
        company_id: user.company_id,
        name: `Combo - ${format(new Date(), 'MMM d')}`,
        route_ids: selectedRoutes,
        route_order: routeOrder,
        end_location_id: selectedEndLocation,
        status: 'active',
        total_addresses: allAddresses.length,
        started_at: startedAtNow,
        total_miles: Math.round(totalMiles * 10) / 10,
        total_drive_time_minutes: totalDriveTimeMinutes
      });

      // Update address orders in batches of 10 to avoid N+1 sequential API calls
      const BATCH_SIZE = 10;
      for (let start = 0; start < optimizedAddresses.length; start += BATCH_SIZE) {
        const batch = optimizedAddresses.slice(start, start + BATCH_SIZE);
        await Promise.all(
          batch.map((addr, i) =>
            base44.entities.Address.update(addr.id, {
              order_index: start + i + 1
            })
          )
        );
      }

      // Set all selected routes to active
      for (const routeId of selectedRoutes) {
        await base44.entities.Route.update(routeId, { 
          status: 'active',
          started_at: startedAtNow
        });
      }

      toast.success(`Combo route created with ${allAddresses.length} addresses!`);
      
      // Navigate to review screen
      navigate(createPageUrl(`ComboRouteReview?id=${combo.id}`));

    } catch (error) {
      console.error('Combo optimization failed:', error);
      toast.error('Failed to optimize: ' + error.message);
    } finally {
      setIsOptimizing(false);
    }
  };

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
        {/* End Location Selection */}
        <div className="rounded-2xl p-4 mb-4" style={{ background: 'rgba(14,20,44,0.55)', backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)', border: '1px solid rgba(255,255,255,0.10)' }}>
          <label className="flex items-center gap-2 text-sm font-semibold mb-3" style={{ color: '#8a7f87' }}>
            <MapPin className="w-4 h-4" />
            End Location
          </label>
          <Select value={selectedEndLocation} onValueChange={setSelectedEndLocation}>
            <SelectTrigger style={{ background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.12)', color: '#e6e1e4' }}>
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
            <p className="text-xs mt-2" style={{ color: '#6B7280' }}>No saved locations. Add one in Settings.</p>
          )}
        </div>

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
                    <div className="space-y-2">
                      {scheduledRoutes.map(renderRouteRow)}
                    </div>
                  </div>
                )}

                {otherRoutes.length > 0 && (
                  <div>
                    {scheduledRoutes.length > 0 && (
                      <p className="text-xs font-semibold uppercase tracking-wide mb-2 px-1" style={{ color: '#6B7280' }}>Other Routes</p>
                    )}
                    <div className="space-y-2">
                      {otherRoutes.map(renderRouteRow)}
                    </div>
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

        {/* Optimize Button */}
        <button
          onClick={handleOptimizeCombo}
          disabled={selectedRoutes.length < 2 || !selectedEndLocation || isOptimizing}
          className="w-full rounded-xl py-4 font-bold text-base flex items-center justify-center gap-2 transition-opacity disabled:opacity-40"
          style={{ background: 'rgba(233,195,73,0.20)', border: '1px solid rgba(233,195,73,0.50)', color: '#e9c349' }}
        >
          {isOptimizing ? (
            <><Loader2 className="w-5 h-5 animate-spin" /> Optimizing...</>
          ) : (
            <><Shuffle className="w-5 h-5" /> Optimize Combo Route</>
          )}
        </button>

        {selectedRoutes.length < 2 && (
          <p className="text-center text-sm mt-2" style={{ color: '#6B7280' }}>Select at least 2 routes to combine</p>
        )}
      </main>

      <BottomNav currentPage="WorkerRoutes" />
    </div>
  );
}