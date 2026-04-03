import React, { useState, useMemo, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCurrentUser } from '@/components/hooks/useCurrentUser';
import { useUserSettings } from '@/components/hooks/useUserSettings';
import { Link, useNavigate } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import { format } from 'date-fns';
import { Loader2, ChevronLeft, MapPin, Play, CheckCircle, Clock, Lock, FileCheck, AlertCircle, Tag, Camera, AlertTriangle, Pause, RotateCcw, MoreVertical, Pencil, Check, X, Search, RefreshCw } from 'lucide-react';
import { geocodeAddress } from '@/components/services/OptimizationService';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import * as DropdownMenuPrimitives from "@/components/ui/dropdown-menu";
const {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} = DropdownMenuPrimitives;
import AddressCard from '@/components/address/AddressCard';
import AnimatedAddressList from '@/components/address/AnimatedAddressList';
import MessageBossDialog from '@/components/address/MessageBossDialog';
import RouteOptimizeModal from '@/components/route/RouteOptimizeModal';
import DesktopWarningBanner from '@/components/common/DesktopWarningBanner';
import ScheduledServesTab from '@/components/scheduled/ScheduledServesTab';
import StopRouteModal from '@/components/route/StopRouteModal';
import { Input } from '@/components/ui/input';

export default function WorkerRouteDetail() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const urlParams = new URLSearchParams(window.location.search);
  const routeId = urlParams.get('id') || urlParams.get('routeId');
  
  const [selectedAddress, setSelectedAddress] = useState(null);
  const [showMessageDialog, setShowMessageDialog] = useState(false);
  const [showOptimizeModal, setShowOptimizeModal] = useState(false);
  const [lastMilestoneChecked, setLastMilestoneChecked] = useState(0);
  const [isEditingName, setIsEditingName] = useState(false);
  const [editedFolderName, setEditedFolderName] = useState('');
  const editMode = urlParams.get('edit') === 'true';
  const searchAddressId = urlParams.get('addressId');
  const tabParam = urlParams.get('tab');
  const [searchFilter, setSearchFilter] = useState(searchAddressId || null);
  const [activeRouteTab, setActiveRouteTab] = useState(tabParam || 'addresses');
  const [showStopModal, setShowStopModal] = useState(false);
  const [isCompletingRoute, setIsCompletingRoute] = useState(false);
  const [dismissedOptWarning, setDismissedOptWarning] = useState(false);
  const [isRetryingGeocode, setIsRetryingGeocode] = useState(false);

  const handleRetryGeocode = async () => {
    const unlocated = addresses.filter(a => !a.served && a.status !== 'served' && (!a.lat || !a.lng));
    if (!unlocated.length) return;
    const mapquestKey = userSettings?.mapquest_api_key;
    const hereKey = userSettings?.here_api_key || null;
    if (!mapquestKey && !hereKey) {
      toast.error('No API key configured. Add MapQuest key in Settings.');
      return;
    }
    setIsRetryingGeocode(true);
    let successCount = 0;
    for (const addr of unlocated) {
      const addressStr = addr.normalized_address || addr.legal_address;
      const coords = await geocodeAddress(addressStr, hereKey, mapquestKey);
      if (coords) {
        await base44.entities.Address.update(addr.id, { lat: coords.lat, lng: coords.lng, geocode_status: 'exact' });
        successCount++;
      }
    }
    setIsRetryingGeocode(false);
    if (successCount > 0) {
      toast.success(`Geocoded ${successCount} of ${unlocated.length} addresses!`);
      queryClient.invalidateQueries({ queryKey: ['routeAddresses', routeId] });
      if (successCount === unlocated.length) setDismissedOptWarning(true);
    } else {
      toast.error('Could not geocode any addresses. Check the addresses are valid.');
    }
  };

  const { data: user } = useCurrentUser();
  const { data: userSettings } = useUserSettings(user?.id);

  // Set worker status to active when viewing a route
  useEffect(() => {
    if (!user?.id) return;

    const setActive = async () => {
      if (user.worker_status !== 'active') {
        await base44.auth.updateMe({
          worker_status: 'active',
          last_active_at: new Date().toISOString()
        });
        queryClient.invalidateQueries({ queryKey: ['currentUser'] });
      }
    };

    setActive();

    // Heartbeat - update last_active_at every 2 minutes while on route
    const heartbeat = setInterval(() => {
      base44.auth.updateMe({ last_active_at: new Date().toISOString() });
    }, 2 * 60 * 1000);

    return () => clearInterval(heartbeat);
  }, [user?.id, user?.worker_status, queryClient]);

  const { data: route, isLoading: routeLoading } = useQuery({
    queryKey: ['route', routeId],
    queryFn: async () => {
      if (!routeId) return null;
      const routes = await base44.entities.Route.filter({ id: routeId });
      return routes[0] || null;
    },
    enabled: !!routeId,
    staleTime: 2 * 60 * 1000,
    gcTime: 10 * 60 * 1000
  });

  const { data: addresses = [], isLoading: addressesLoading } = useQuery({
    queryKey: ['routeAddresses', routeId],
    queryFn: async () => {
      if (!routeId) return [];
      const addrs = await base44.entities.Address.filter({ route_id: routeId, deleted_at: null });
      return addrs.sort((a, b) => {
        const aIdx = (a.order_index && a.order_index > 0) ? a.order_index : null;
        const bIdx = (b.order_index && b.order_index > 0) ? b.order_index : null;
        if (aIdx !== null && bIdx !== null) return aIdx - bIdx;
        if (aIdx !== null) return -1;
        if (bIdx !== null) return 1;
        return new Date(a.created_date || 0) - new Date(b.created_date || 0);
      });
    },
    enabled: !!routeId,
    staleTime: 2 * 60 * 1000,
    gcTime: 10 * 60 * 1000
  });



  // Badge count for scheduled serves tab
  const { data: scheduledServesCount = 0 } = useQuery({
    queryKey: ['scheduledServesCount', routeId],
    queryFn: async () => {
      if (!routeId) return 0;
      const serves = await base44.entities.ScheduledServe.filter({ route_id: routeId, status: 'open' });
      return serves.length;
    },
    enabled: !!routeId,
    staleTime: 0
  });

  // Fetch attempts for all addresses in the route
  const { data: attempts = [] } = useQuery({
    queryKey: ['routeAttempts', routeId],
    queryFn: async () => {
      if (!routeId) return [];
      return base44.entities.Attempt.filter({ route_id: routeId }, '-attempt_time');
    },
    enabled: !!routeId,
    staleTime: 60 * 1000,
    gcTime: 10 * 60 * 1000
  });

  // Create a map of address_id to latest attempt
  const lastAttemptMap = useMemo(() => {
    const map = {};
    attempts.forEach(attempt => {
      if (!map[attempt.address_id]) {
        map[attempt.address_id] = attempt;
      }
    });
    return map;
  }, [attempts]);

  // Create a map of address_id to all attempts
  const allAttemptsMap = useMemo(() => {
    const map = {};
    attempts.forEach(attempt => {
      if (!map[attempt.address_id]) {
        map[attempt.address_id] = [];
      }
      map[attempt.address_id].push(attempt);
    });
    return map;
  }, [attempts]);

  // Calculate progress
  const calculateProgress = useMemo(() => {
    const total = addresses.length;
    const completed = addresses.filter(a => a.served).length;
    const percentage = total > 0 ? Math.round((completed / total) * 100) : 0;
    return { total, completed, percentage };
  }, [addresses]);

  // Calculate remaining miles based on completed addresses
  const calculateRemainingMiles = useMemo(() => {
    if (!route?.total_miles) return 0;
    
    const totalAddresses = addresses.length;
    const completedCount = addresses.filter(a => a.served).length;
    
    if (totalAddresses === 0) return route.total_miles;
    
    // Calculate remaining as percentage of total
    const remainingPercentage = (totalAddresses - completedCount) / totalAddresses;
    return route.total_miles * remainingPercentage;
  }, [route?.total_miles, addresses]);

  // Calculate total route duration (start time to est completion)
  const calculateRouteDuration = useMemo(() => {
    if (!route?.started_at || !route?.est_completion_time) return null;
    
    const start = new Date(route.started_at);
    const end = new Date(route.est_completion_time);
    const durationMinutes = Math.round((end - start) / 60000);
    
    const hours = Math.floor(durationMinutes / 60);
    const minutes = durationMinutes % 60;
    
    if (hours === 0) {
      return `${minutes}m`;
    } else if (minutes === 0) {
      return `${hours}h`;
    } else {
      return `${hours}h ${minutes}m`;
    }
  }, [route?.started_at, route?.est_completion_time]);

  // Calculate remaining time until est completion
  const calculateRemainingTime = useMemo(() => {
    if (!route?.est_completion_time) return null;
    
    const now = new Date();
    const end = new Date(route.est_completion_time);
    const remainingMinutes = Math.max(0, Math.round((end - now) / 60000));
    
    const hours = Math.floor(remainingMinutes / 60);
    const minutes = remainingMinutes % 60;
    
    if (hours === 0) {
      return `${minutes}m left`;
    } else {
      return `${hours}h ${minutes}m left`;
    }
  }, [route?.est_completion_time]);

  // Get updated est completion based on progress
  const getUpdatedEstCompletion = useMemo(() => {
    if (!route?.started_at || !route?.total_drive_time_minutes) return null;
    
    const progress = calculateProgress;
    const startTime = new Date(route.started_at);
    const now = new Date();
    const elapsedMinutes = Math.round((now - startTime) / 60000);
    
    const visitedCount = addresses.filter(a => a.served || a.status !== 'pending').length;
    const remainingAddresses = Math.max(0, progress.total - visitedCount);
    const timeAtAddress = route.time_at_address_minutes || 2;
    
    // Estimate remaining drive time proportionally
    const totalDriveTime = route.total_drive_time_minutes || 0;
    const remainingDriveTime = progress.total > 0 
      ? totalDriveTime * (remainingAddresses / progress.total) 
      : 0;
    const remainingAddressTime = remainingAddresses * timeAtAddress;
    const remainingMinutes = Math.round(remainingDriveTime + remainingAddressTime);
    
    const estCompletion = new Date(now.getTime() + remainingMinutes * 60000);
    
    return {
      startTime,
      elapsedMinutes,
      remainingMinutes,
      estCompletion,
      progress: progress.percentage
    };
  }, [route, calculateProgress]);

  // Update est completion at milestones (25%, 50%, 75%, 100%)
  useEffect(() => {
    const progress = calculateProgress;
    const milestones = [25, 50, 75, 100];
    
    // Check if we hit a new milestone
    const currentMilestone = milestones.find(m => progress.percentage >= m && m > lastMilestoneChecked);
    
    if (currentMilestone && route?.id && route?.status === 'active') {
      setLastMilestoneChecked(currentMilestone);
      
      // Update route with new est completion
      const updateEstCompletion = async () => {
        const updated = getUpdatedEstCompletion;
        if (updated) {
          await base44.entities.Route.update(route.id, {
            est_completion_time: updated.estCompletion.toISOString()
          });
        }
      };
      updateEstCompletion();
    }
  }, [calculateProgress.percentage, lastMilestoneChecked, route?.id, route?.status, getUpdatedEstCompletion]);

  if (routeLoading) {
    return (
      <div style={{ minHeight: '100vh', background: 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Loader2 className="w-8 h-8 animate-spin" style={{ color: '#e9c349' }} />
      </div>
    );
  }

  if (!route) {
    return (
      <div style={{ minHeight: '100vh', background: 'transparent', padding: '16px' }}>
        <p className="text-center" style={{ color: '#8a7f87' }}>Route not found</p>
      </div>
    );
  }

  // Ownership check - workers can only see their own routes
  if (user?.role === 'server' && route && route.worker_id !== user.id) {
    return (
      <div style={{ minHeight: '100vh', background: 'transparent', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '16px' }}>
        <p style={{ color: '#d0c3cb', marginBottom: 16 }}>You don't have access to this route</p>
        <Button onClick={() => navigate(createPageUrl('WorkerRoutes'))}>Go to My Routes</Button>
      </div>
    );
  }

  const pendingAddresses = addresses.filter(a => !a.served);
  const servedAddresses = addresses.filter(a => a.served);
  
  const isAssignedByBoss = route?.worker_id && route?.assigned_by && route.assigned_by !== route.worker_id;
  const unverifiedCount = addresses.filter(a => a.verification_status === 'unverified').length;
  const needsVerification = isAssignedByBoss && unverifiedCount > 0;
  
  const handleMessageBoss = (address) => {
    setSelectedAddress(address);
    setShowMessageDialog(true);
  };

  const handleSaveFolderName = async () => {
    if (!editedFolderName.trim() || editedFolderName === route.folder_name) {
      setIsEditingName(false);
      return;
    }
    try {
      await base44.entities.Route.update(routeId, {
        folder_name: editedFolderName.trim()
      });
      queryClient.invalidateQueries({ queryKey: ['route', routeId] });
      queryClient.invalidateQueries({ queryKey: ['workerRoutes'] });
      toast.success('Route renamed');
      setIsEditingName(false);
    } catch (error) {
      toast.error('Failed to rename route');
    }
  };

  const handleResetAllAttempts = async () => {
    const confirmed = window.confirm(
      'Are you sure you want to delete ALL attempts for this route? This will reset all addresses to pending. This cannot be undone.'
    );
    
    if (!confirmed) return;
    
    try {
      toast.info('Resetting route...');
      
      for (const attempt of attempts) {
        await base44.entities.Attempt.delete(attempt.id);
      }
      
      for (const addr of addresses) {
        await base44.entities.Address.update(addr.id, {
          status: 'pending',
          served: false,
          served_at: null,
          attempts_count: 0,
          receipt_status: 'pending'
        });
      }
      
      await base44.entities.Route.update(routeId, {
        status: 'ready',
        started_at: null,
        completed_at: null,
        served_count: 0,
        total_miles: null,
        total_drive_time_minutes: null,
        time_at_address_minutes: null,
        est_completion_time: null,
        est_total_minutes: null
      });
      
      setLastMilestoneChecked(0);
      toast.success('Route reset successfully!');
      
      queryClient.invalidateQueries({ queryKey: ['route', routeId] });
      queryClient.invalidateQueries({ queryKey: ['routeAddresses', routeId] });
      queryClient.invalidateQueries({ queryKey: ['routeAttempts', routeId] });
      
    } catch (error) {
      console.error('Reset failed:', error);
      toast.error('Failed to reset: ' + error.message);
    }
  };

  return (
    <div style={{ minHeight: '100vh', background: 'transparent', paddingBottom: 24 }}>
      <header style={{ background: 'rgba(11,15,30,0.75)', backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)', borderBottom: '1px solid rgba(255,255,255,0.08)', color: '#e6e1e4', padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 12, position: 'sticky', top: 0, zIndex: 50 }}>
        <Link to={createPageUrl('WorkerRoutes')} className="flex items-center justify-center w-10 h-10 rounded-lg hover:bg-white/10 active:bg-white/20 transition-colors" style={{ border: '1px solid #363436' }}>
          <ChevronLeft className="w-6 h-6" />
        </Link>
        <div className="flex-1">
          {editMode && isEditingName ? (
            <div className="flex items-center gap-2">
              <Input
                value={editedFolderName}
                onChange={(e) => setEditedFolderName(e.target.value)}
                className="h-8 bg-white/20 border-white/30 text-white placeholder:text-white/50 font-bold"
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    handleSaveFolderName();
                  } else if (e.key === 'Escape') {
                    setIsEditingName(false);
                  }
                }}
              />
              <button 
                onClick={handleSaveFolderName}
                className="p-1.5 bg-green-500 rounded-full hover:bg-green-600"
              >
                <Check className="w-4 h-4" />
              </button>
              <button 
                onClick={() => setIsEditingName(false)}
                className="p-1.5 bg-red-500 rounded-full hover:bg-red-600"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          ) : (
            <div 
              className={editMode ? 'cursor-pointer rounded px-2 py-1 -mx-2 -my-1' : ''}
              style={editMode ? { background: 'rgba(255,255,255,0.05)' } : {}}
              onClick={() => {
                if (editMode) {
                  setEditedFolderName(route.folder_name);
                  setIsEditingName(true);
                }
              }}
            >
              <h1 className="font-bold text-lg flex items-center gap-2">
                {route.folder_name}
                {editMode && <Pencil className="w-3 h-3 opacity-60" />}
              </h1>
              {route.description && <p className="text-sm" style={{ color: '#d0c3cb' }}>{route.description}</p>}
            </div>
          )}
        </div>

      </header>

      <main className="px-4 py-4 max-w-lg mx-auto">
        {/* Route Metrics Header */}
        {route?.status === 'active' && route?.started_at ? (
          // ACTIVE ROUTE: Show 3 metric boxes
          <>
            <div className="grid grid-cols-3 gap-1.5 mb-3">
              {/* Start Time */}
              <div style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.10)', borderRadius: 8, padding: 8, textAlign: 'center' }}>
                <p className="text-sm font-bold" style={{ color: '#e9c349' }}>
                  {new Date(route.started_at).toLocaleTimeString('en-US', {
                    hour: 'numeric',
                    minute: '2-digit',
                    hour12: true
                  })}
                </p>
                <p className="text-[10px] font-medium" style={{ color: '#8a7f87' }}>Started</p>
              </div>
              
              {/* Stop Route */}
              <div 
                className="rounded-lg p-2 text-center cursor-pointer hover:opacity-90 transition-colors flex flex-col items-center justify-center"
                style={{ background: 'rgba(239,68,68,0.15)', border: '1px solid rgba(239,68,68,0.35)' }}
                onClick={() => setShowStopModal(true)}
              >
                <Pause className="w-5 h-5 mb-0.5" style={{ color: '#ef4444' }} />
                <p className="text-[10px] font-bold" style={{ color: '#ef4444' }}>Stop Route</p>
              </div>
              
              {/* Est Completion */}
              <div className="rounded-lg p-2 text-center" style={{ background: 'rgba(34,197,94,0.12)', border: '1px solid rgba(34,197,94,0.30)' }}>
                <p className="text-sm font-bold" style={{ color: '#22c55e' }}>
                  {getUpdatedEstCompletion?.estCompletion 
                    ? getUpdatedEstCompletion.estCompletion.toLocaleTimeString('en-US', {
                        hour: 'numeric',
                        minute: '2-digit',
                        hour12: true
                      })
                    : route.est_completion_time
                      ? new Date(route.est_completion_time).toLocaleTimeString('en-US', {
                          hour: 'numeric',
                          minute: '2-digit',
                          hour12: true
                        })
                      : '--:--'
                  }
                </p>
                <p className="text-[10px] font-medium" style={{ color: '#22c55e' }}>Est. Done</p>
              </div>
            </div>

            {/* Progress Bar with miles remaining */}
            <div className="mb-3">
              <div className="flex justify-between text-[10px] mb-0.5" style={{ color: '#8a7f87' }}>
                <span>{calculateProgress.completed} of {calculateProgress.total} complete</span>
                <span className="font-medium" style={{ color: '#8a7f87' }}>
                  {calculateRemainingMiles.toFixed(1)} mi left
                </span>
              </div>
              <div className="h-1.5 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.10)' }}>
                <div 
                  className="h-full bg-gradient-to-r from-green-500 to-green-400 transition-all duration-500"
                  style={{ width: `${calculateProgress.percentage}%` }}
                />
              </div>
              <div className="flex justify-between text-[10px] mt-0.5" style={{ color: '#8a7f87' }}>
                <span>{calculateProgress.percentage}% done</span>
                <span>{calculateRemainingTime}</span>
              </div>
            </div>
          </>
        ) : (
          // NOT ACTIVE: Show regular stats (Total, Served, Pending) + Start Route bar
          <>
          <div className={`grid grid-cols-3 gap-2 mb-3`}>
              <div style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.10)', padding: 12, textAlign: 'center', borderRadius: '12px' }}>
              <MapPin className="w-5 h-5 mx-auto mb-1" style={{ color: '#e9c349' }} />
              <p className="text-2xl font-bold" style={{ color: '#e9c349' }}>{addresses.length}</p>
              <p className="text-xs font-medium" style={{ color: '#8a7f87' }}>Total</p>
            </div>
            <div style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.10)', padding: 12, textAlign: 'center', borderRadius: '12px' }}>
            <CheckCircle className="w-5 h-5 mx-auto mb-1" style={{ color: '#22c55e' }} />
            <p className="text-2xl font-bold text-green-500">{servedAddresses.length}</p>
            <p className="text-xs font-medium" style={{ color: '#8a7f87' }}>Served</p>
              </div>
            <div style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.10)', padding: 12, textAlign: 'center', borderRadius: '12px' }}>
            <Clock className="w-5 h-5 mx-auto mb-1" style={{ color: '#f97316' }} />
            <p className="text-2xl font-bold" style={{ color: '#e6e1e4' }}>{pendingAddresses.length}</p>
            <p className="text-xs font-medium" style={{ color: '#8a7f87' }}>Pending</p>
              </div>
          </div>
          </>
        )}



        {/* Verification Banner */}
        {needsVerification && (
          <Card className="bg-yellow-50 border-yellow-200 mb-4">
            <CardContent className="p-4">
              <div className="flex items-start gap-3">
                <AlertTriangle className="w-5 h-5 text-yellow-600 flex-shrink-0 mt-0.5" />
                <div className="flex-1">
                  <p className="font-medium text-yellow-800">Documents Not Verified</p>
                  <p className="text-sm text-yellow-700 mt-1">
                    Scan received documents to confirm all {unverifiedCount} addresses
                  </p>
                  <Button
                    className="mt-3 bg-yellow-600 hover:bg-yellow-700"
                    onClick={() => navigate(createPageUrl(`ScanVerify?routeId=${routeId}`))}
                  >
                    <Camera className="w-4 h-4 mr-2" />
                    Scan to Verify Documents
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {(route.status === 'assigned' || route.status === 'ready') && !needsVerification && (
          <div
            onClick={() => setShowOptimizeModal(true)}
            className="bg-orange-500 hover:bg-orange-600 rounded-b-xl px-4 py-3 mb-4 cursor-pointer transition-colors"
          >
            <div className="flex items-center justify-center gap-2">
              <Play className="w-5 h-5 text-white" />
              <span className="font-bold text-white">Start Route</span>
            </div>
          </div>
        )}

        {route.status === 'active' && pendingAddresses.length === 0 && (
          <div className="mb-4">
            <Button 
              disabled={isCompletingRoute}
              onClick={async () => {
                if (isCompletingRoute) return;
                setIsCompletingRoute(true);
                try {
                  await base44.entities.Route.update(routeId, {
                    status: 'completed',
                    completed_at: new Date().toISOString()
                  });
                  
                  const allUsers = await base44.entities.User.filter({ 
                    company_id: route.company_id || user?.company_id 
                  });
                  const bosses = allUsers.filter(u => u.role === 'boss' || u.role === 'admin');
                  
                  for (const boss of bosses) {
                    await base44.entities.Notification.create({
                      user_id: boss.id,
                      company_id: route.company_id || user?.company_id,
                      recipient_role: 'boss',
                      type: 'route_completed',
                      title: 'Route Completed ✓',
                      body: `${user?.full_name || 'Worker'} completed ${route.folder_name}`,
                      data: { route_id: routeId },
                      action_url: `/BossRouteDetail?id=${routeId}`,
                      priority: 'normal'
                    });
                  }
                  
                  await base44.entities.AuditLog.create({
                    company_id: route.company_id || user?.company_id,
                    action_type: 'route_completed',
                    actor_id: user?.id,
                    actor_role: 'server',
                    target_type: 'route',
                    target_id: routeId,
                    details: {
                      route_name: route.folder_name,
                      total_addresses: route.total_addresses,
                      served_count: route.served_count
                    },
                    timestamp: new Date().toISOString()
                  });
                  
                  await queryClient.refetchQueries({ queryKey: ['route', routeId] });
                  await queryClient.refetchQueries({ queryKey: ['workerRoutes'] });
                  toast.success('Route completed! All addresses served.');
                  navigate(createPageUrl('WorkerRoutes'));
                } catch (error) {
                  toast.error('Failed to complete route');
                } finally {
                  setIsCompletingRoute(false);
                }
                }}
                className="w-full bg-green-500 hover:bg-green-600"
            >
              <CheckCircle className="w-4 h-4 mr-2" /> Complete Route
            </Button>
          </div>
        )}

        {/* Edit Mode Banner */}
        {editMode && (
         <div style={{ padding: 12, background: 'rgba(14,20,44,0.60)', backdropFilter: 'blur(14px)', WebkitBackdropFilter: 'blur(14px)', border: '1px solid rgba(229,179,225,0.30)', borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
           <div className="flex items-center gap-2">
             <Pencil className="w-4 h-4" style={{ color: '#e5b9e1' }} />
             <span className="text-sm font-semibold" style={{ color: '#e5b9e1' }}>Edit Mode</span>
             <span className="text-xs" style={{ color: '#8a7f87' }}>Tap addresses to edit details</span>
           </div>
           <Button
             variant="outline"
             size="sm"
             onClick={() => navigate(createPageUrl(`WorkerRouteDetail?id=${routeId}`))}
             style={{ color: '#e5b9e1', borderColor: '#e5b9e1' }}
           >
             Done
           </Button>
         </div>
        )}

        <DesktopWarningBanner />

        {/* Unoptimized addresses warning */}
        {!dismissedOptWarning && addresses.filter(a => !a.served && a.status !== 'served').some(a => !a.lat || !a.lng) && activeRouteTab === 'addresses' && (
          <div className="mb-3 rounded-xl p-3 flex items-start gap-2" style={{ background: 'rgba(233,195,73,0.10)', border: '1px solid rgba(233,195,73,0.30)' }}>
            <AlertTriangle className="w-4 h-4 text-yellow-600 flex-shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="text-xs font-semibold" style={{ color: '#e9c349' }}>Some stops couldn't be located</p>
              <p className="text-xs mt-0.5" style={{ color: '#c9a030' }}>
                {addresses.filter(a => !a.served && a.status !== 'served' && (!a.lat || !a.lng)).length} address{addresses.filter(a => !a.served && a.status !== 'served' && (!a.lat || !a.lng)).length !== 1 ? 'es' : ''} couldn't be geocoded and are shown at the end.
              </p>
              <button
                onClick={handleRetryGeocode}
                disabled={isRetryingGeocode}
                className="mt-2 flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1.5 rounded-lg transition-colors disabled:opacity-50"
                style={{ color: '#e9c349', background: 'rgba(233,195,73,0.15)' }}
              >
                {isRetryingGeocode ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
                {isRetryingGeocode ? 'Geocoding...' : 'Retry Geocoding'}
              </button>
            </div>
            <button onClick={() => setDismissedOptWarning(true)} className="p-1 rounded hover:bg-white/10 flex-shrink-0" style={{ color: '#6B7280' }}>
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* Addresses / Scheduled Tabs */}
        <div className="flex rounded-xl p-1 mb-4" style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.10)' }}>
          <button
            onClick={() => setActiveRouteTab('addresses')}
            className="flex-1 py-2 text-xs font-bold rounded-lg transition-colors"
            style={{
              background: activeRouteTab === 'addresses' ? 'rgba(229,179,225,0.20)' : 'transparent',
              color: activeRouteTab === 'addresses' ? '#e5b9e1' : '#6B7280',
              boxShadow: activeRouteTab === 'addresses' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none'
            }}
          >
            Addresses ({addresses.length})
          </button>
          <button
            onClick={() => setActiveRouteTab('scheduled')}
            className="flex-1 py-2 text-xs font-bold rounded-lg transition-colors relative"
            style={{
              background: activeRouteTab === 'scheduled' ? 'rgba(229,179,225,0.20)' : 'transparent',
              color: activeRouteTab === 'scheduled' ? '#e5b9e1' : '#6B7280',
              boxShadow: activeRouteTab === 'scheduled' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none'
            }}
          >
            Scheduled
            {scheduledServesCount > 0 && (
              <span className="ml-1 inline-flex items-center justify-center px-1.5 py-0.5 rounded-full text-[10px] font-bold" style={{ background: '#e9c349', color: '#0F0B10' }}>
                {scheduledServesCount}
              </span>
            )}
          </button>
        </div>

        {activeRouteTab === 'scheduled' ? (
          <ScheduledServesTab routeId={routeId} onViewAddress={(addressId) => {
            setSearchFilter(addressId);
            setActiveRouteTab('addresses');
            // Update URL params
            const newParams = new URLSearchParams(window.location.search);
            newParams.set('addressId', addressId);
            newParams.set('tab', 'addresses');
            window.history.replaceState({}, '', `${window.location.pathname}?${newParams.toString()}`);
          }} />
        ) : (
        <>
        {/* Search Filter Banner */}
         {searchFilter && (
          <div style={{ marginBottom: 16, background: 'rgba(14,20,44,0.60)', backdropFilter: 'blur(14px)', WebkitBackdropFilter: 'blur(14px)', border: '1px solid rgba(255,255,255,0.10)', borderRadius: 12, padding: 12, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div className="flex items-center gap-2">
              <Search className="w-4 h-4" style={{ color: '#e9c349' }} />
              <span className="text-sm font-medium" style={{ color: '#e6e1e4' }}>Showing search result</span>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setSearchFilter(null);
                // Remove addressId from URL without reload
                const newParams = new URLSearchParams(window.location.search);
                newParams.delete('addressId');
                const newUrl = `${window.location.pathname}?${newParams.toString()}`;
                window.history.replaceState({}, '', newUrl);
              }}
              className="text-xs h-7"
              style={{ color: '#e9c349', borderColor: '#363436' }}
            >
              Show All ({addresses.length})
            </Button>
          </div>
        )}

        {addressesLoading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="w-6 h-6 animate-spin" style={{ color: '#e9c349' }} />
          </div>
        ) : (
          <AnimatedAddressList
            addresses={searchFilter ? addresses.filter(a => a.id === searchFilter) : addresses}
            attempts={attempts}
            routeId={routeId}
            onMessageBoss={handleMessageBoss}
            lastAttemptMap={lastAttemptMap}
            allAttemptsMap={allAttemptsMap}
            editMode={editMode}
            route={route}
            showZoneLabels={userSettings?.show_zone_labels !== false}
          />
        )}
        
        </>
        )}
        
        <MessageBossDialog
          open={showMessageDialog}
          onOpenChange={setShowMessageDialog}
          address={selectedAddress}
          route={route}
          user={user}
        />
      </main>

      {showStopModal && (
        <StopRouteModal
          route={route}
          addresses={addresses}
          onClose={() => setShowStopModal(false)}
        />
      )}

      {showOptimizeModal && (
        <RouteOptimizeModal
          routeId={routeId}
          route={route}
          addresses={addresses}
          onClose={() => setShowOptimizeModal(false)}
          onOptimized={async () => {
            setShowOptimizeModal(false);
            // Force refetch with fresh data after optimization updates order_index values
            await queryClient.refetchQueries({ queryKey: ['routeAddresses', routeId] });
            await queryClient.refetchQueries({ queryKey: ['route', routeId] });
          }}
        />
      )}
    </div>
  );
}