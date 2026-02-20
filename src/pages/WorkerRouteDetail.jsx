import React, { useState, useMemo, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import { format } from 'date-fns';
import { Loader2, ChevronLeft, MapPin, Play, CheckCircle, Clock, Lock, FileCheck, AlertCircle, Tag, Camera, AlertTriangle, Pause, RotateCcw, MoreVertical, Pencil } from 'lucide-react';
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

export default function WorkerRouteDetail() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const urlParams = new URLSearchParams(window.location.search);
  const routeId = urlParams.get('id') || urlParams.get('routeId');
  
  const [selectedAddress, setSelectedAddress] = useState(null);
  const [showMessageDialog, setShowMessageDialog] = useState(false);
  const [showOptimizeModal, setShowOptimizeModal] = useState(false);
  const [lastMilestoneChecked, setLastMilestoneChecked] = useState(0);
  const editMode = urlParams.get('edit') === 'true';

  const { data: user } = useQuery({
    queryKey: ['currentUser'],
    queryFn: () => base44.auth.me()
  });

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
    enabled: !!routeId
  });

  const { data: addresses = [], isLoading: addressesLoading } = useQuery({
    queryKey: ['routeAddresses', routeId],
    queryFn: async () => {
      if (!routeId) return [];
      const addrs = await base44.entities.Address.filter({ route_id: routeId, deleted_at: null });
      return addrs.sort((a, b) => (a.order_index || 999) - (b.order_index || 999));
    },
    enabled: !!routeId,
    refetchInterval: route?.status === 'active' ? 30000 : false
  });



  // Fetch attempts for all addresses in the route
  const { data: attempts = [] } = useQuery({
    queryKey: ['routeAttempts', routeId],
    queryFn: async () => {
      if (!routeId) return [];
      return base44.entities.Attempt.filter({ route_id: routeId }, '-attempt_time');
    },
    enabled: !!routeId
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
    
    const remainingAddresses = progress.total - progress.completed;
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
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
      </div>
    );
  }

  if (!route) {
    return (
      <div className="min-h-screen bg-gray-50 p-4">
        <p className="text-center text-gray-500">Route not found</p>
      </div>
    );
  }

  // Ownership check - workers can only see their own routes
  if (user?.role === 'server' && route && route.worker_id !== user.id) {
    return (
      <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center p-4">
        <p className="text-gray-600 mb-4">You don't have access to this route</p>
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
    <div className="min-h-screen bg-gray-50 pb-6">
      <header className="bg-blue-500 text-white px-4 py-3 flex items-center gap-3">
        <Link to={createPageUrl('WorkerRoutes')}>
          <ChevronLeft className="w-6 h-6" />
        </Link>
        <div className="flex-1">
          <h1 className="font-bold text-lg">{route.folder_name}</h1>
          <p className="text-sm text-blue-100">{route.description || 'No description'}</p>
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="p-2 hover:bg-blue-600 rounded-full transition-colors">
              <MoreVertical className="w-5 h-5" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem 
              onClick={handleResetAllAttempts} 
              className="text-red-600 focus:text-red-600"
            >
              <RotateCcw className="w-4 h-4 mr-2" />
              Reset All Attempts
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </header>

      <main className="px-4 py-4 max-w-lg mx-auto">
        {/* Route Metrics Header */}
        {route?.status === 'active' && route?.started_at ? (
          // ACTIVE ROUTE: Show 3 metric boxes
          <>
            <div className="grid grid-cols-3 gap-2 mb-4">
              {/* Start Time */}
              <div className="bg-blue-50 rounded-xl p-3 text-center border border-blue-200">
                <p className="text-xl font-bold text-blue-600">
                  {new Date(route.started_at).toLocaleTimeString('en-US', {
                    hour: 'numeric',
                    minute: '2-digit',
                    hour12: true
                  })}
                </p>
                <p className="text-xs text-blue-500 font-medium">Started</p>
              </div>
              
              {/* Miles + Duration (SPLIT BOX) */}
              <div className="bg-purple-50 rounded-xl overflow-hidden border border-purple-200">
                {/* Top Half - Remaining Miles */}
                <div className="p-2 text-center border-b border-purple-200">
                  <p className="text-xl font-bold text-purple-600">
                    {calculateRemainingMiles.toFixed(1)}
                    <span className="text-sm ml-0.5">mi</span>
                  </p>
                  <p className="text-xs text-purple-400">remaining</p>
                </div>
                {/* Bottom Half - Total Duration */}
                <div className="p-1.5 text-center bg-purple-100/50">
                  <p className="text-sm font-bold text-purple-700">
                    {calculateRouteDuration || '--'}
                  </p>
                  <p className="text-xs text-purple-500">total</p>
                </div>
              </div>
              
              {/* Est Completion */}
              <div className="bg-green-50 rounded-xl p-3 text-center border border-green-200">
                <p className="text-xl font-bold text-green-600">
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
                <p className="text-xs text-green-500 font-medium">Est. Done</p>
              </div>
            </div>

            {/* Progress Bar with miles remaining */}
            <div className="mb-4">
              <div className="flex justify-between text-xs text-gray-500 mb-1">
                <span>{calculateProgress.completed} of {calculateProgress.total} complete</span>
                <span className="text-purple-600 font-medium">
                  {calculateRemainingMiles.toFixed(1)} mi left
                </span>
              </div>
              <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
                <div 
                  className="h-full bg-gradient-to-r from-green-500 to-green-400 transition-all duration-500"
                  style={{ width: `${calculateProgress.percentage}%` }}
                />
              </div>
              <div className="flex justify-between text-xs text-gray-400 mt-1">
                <span>{calculateProgress.percentage}% done</span>
                <span>{calculateRemainingTime}</span>
              </div>
            </div>
          </>
        ) : (
          // NOT ACTIVE: Show regular stats (Total, Served, Pending)
          <div className="grid grid-cols-3 gap-3 mb-4">
            <Card>
              <CardContent className="p-3 text-center">
                <p className="text-2xl font-bold text-gray-900">{addresses.length}</p>
                <p className="text-xs text-gray-500">Total</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-3 text-center">
                <p className="text-2xl font-bold text-green-600">{servedAddresses.length}</p>
                <p className="text-xs text-gray-500">Served</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-3 text-center">
                <p className="text-2xl font-bold text-orange-600">{pendingAddresses.length}</p>
                <p className="text-xs text-gray-500">Pending</p>
              </CardContent>
            </Card>
          </div>
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
          <Button 
            onClick={() => setShowOptimizeModal(true)}
            className="w-full bg-orange-500 hover:bg-orange-600 mb-4"
          >
            <Play className="w-4 h-4 mr-2" /> Start Route
          </Button>
        )}

        {route.status === 'active' && (
          <div className="flex gap-2 mb-4">
            <Button 
              onClick={async () => {
                try {
                  await base44.entities.Route.update(routeId, {
                    status: 'ready'
                  });
                  queryClient.invalidateQueries({ queryKey: ['route', routeId] });
                  queryClient.invalidateQueries({ queryKey: ['workerRoutes'] });
                  toast.info('Route stopped - you can start it again later');
                  navigate(createPageUrl('WorkerRoutes'));
                } catch (error) {
                  toast.error('Failed to stop route');
                }
              }}
              className="flex-1 bg-gray-500 hover:bg-gray-600"
            >
              <Pause className="w-4 h-4 mr-2" /> Stop Route
            </Button>
            
            {pendingAddresses.length === 0 && (
              <Button 
                onClick={async () => {
                  try {
                    await base44.entities.Route.update(routeId, {
                      status: 'completed',
                      completed_at: new Date().toISOString()
                    });
                    
                    // Notify boss(es)
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
                    
                    // Audit log
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
                    
                    queryClient.invalidateQueries({ queryKey: ['route', routeId] });
                    queryClient.invalidateQueries({ queryKey: ['workerRoutes'] });
                    toast.success('Route completed! All addresses served.');
                    navigate(createPageUrl('WorkerRoutes'));
                  } catch (error) {
                    toast.error('Failed to complete route');
                  }
                }}
                className="flex-1 bg-green-500 hover:bg-green-600"
              >
                <CheckCircle className="w-4 h-4 mr-2" /> Complete
              </Button>
            )}
          </div>
        )}

        {/* Edit Mode Banner */}
        {editMode && (
          <div className="p-3 bg-blue-50 border border-blue-200 rounded-xl flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Pencil className="w-4 h-4 text-blue-500" />
              <span className="text-sm font-semibold text-blue-700">Edit Mode</span>
              <span className="text-xs text-blue-500">Tap addresses to edit details</span>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => navigate(createPageUrl(`WorkerRouteDetail?id=${routeId}`))}
              className="text-blue-600 border-blue-300"
            >
              Done
            </Button>
          </div>
        )}

        <DesktopWarningBanner />

        {addressesLoading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="w-6 h-6 animate-spin text-blue-500" />
          </div>
        ) : (
          <AnimatedAddressList
            addresses={addresses}
            attempts={attempts}
            routeId={routeId}
            onMessageBoss={handleMessageBoss}
            lastAttemptMap={lastAttemptMap}
            allAttemptsMap={allAttemptsMap}
            editMode={editMode}
          />
        )}
        
        <MessageBossDialog
          open={showMessageDialog}
          onOpenChange={setShowMessageDialog}
          address={selectedAddress}
          route={route}
          user={user}
        />
      </main>

      {showOptimizeModal && (
        <RouteOptimizeModal
          routeId={routeId}
          route={route}
          addresses={addresses}
          onClose={() => setShowOptimizeModal(false)}
          onOptimized={() => {
            setShowOptimizeModal(false);
            queryClient.invalidateQueries({ queryKey: ['routeAddresses', routeId] });
            queryClient.invalidateQueries({ queryKey: ['route', routeId] });
          }}
        />
      )}
    </div>
  );
}