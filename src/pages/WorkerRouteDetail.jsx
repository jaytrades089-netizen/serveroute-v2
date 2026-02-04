import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { Link, useNavigate } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import { format } from 'date-fns';
import { Loader2, ChevronLeft, MapPin, Play, CheckCircle, Clock, Lock, FileCheck, AlertCircle, Tag, Camera, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import AddressCard from '@/components/address/AddressCard';
import MessageBossDialog from '@/components/address/MessageBossDialog';

export default function WorkerRouteDetail() {
  const navigate = useNavigate();
  const urlParams = new URLSearchParams(window.location.search);
  const routeId = urlParams.get('id') || urlParams.get('routeId');
  
  const [selectedAddress, setSelectedAddress] = useState(null);
  const [showMessageDialog, setShowMessageDialog] = useState(false);

  const { data: user } = useQuery({
    queryKey: ['currentUser'],
    queryFn: () => base44.auth.me()
  });

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
      return base44.entities.Address.filter({ route_id: routeId, deleted_at: null });
    },
    enabled: !!routeId
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
  const lastAttemptMap = React.useMemo(() => {
    const map = {};
    attempts.forEach(attempt => {
      if (!map[attempt.address_id]) {
        map[attempt.address_id] = attempt;
      }
    });
    return map;
  }, [attempts]);

  // Create a map of address_id to all attempts (for tabbed view)
  const allAttemptsMap = React.useMemo(() => {
    const map = {};
    attempts.forEach(attempt => {
      if (!map[attempt.address_id]) {
        map[attempt.address_id] = [];
      }
      map[attempt.address_id].push(attempt);
    });
    return map;
  }, [attempts]);

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

  const pendingAddresses = addresses.filter(a => !a.served);
  const servedAddresses = addresses.filter(a => a.served);
  
  // Check if route was assigned by boss (worker_id set but not by self)
  const isAssignedByBoss = route?.worker_id && route?.assigned_by && route.assigned_by !== route.worker_id;
  const unverifiedCount = addresses.filter(a => a.verification_status === 'unverified').length;
  const needsVerification = isAssignedByBoss && unverifiedCount > 0;
  
  const handleMessageBoss = (address) => {
    setSelectedAddress(address);
    setShowMessageDialog(true);
  };

  return (
    <div className="min-h-screen bg-gray-50 pb-6">
      <header className="bg-blue-500 text-white px-4 py-3 flex items-center gap-3">
        <Link to={createPageUrl('WorkerRoutes')}>
          <ChevronLeft className="w-6 h-6" />
        </Link>
        <div>
          <h1 className="font-bold text-lg">{route.folder_name}</h1>
          <p className="text-sm text-blue-100">{route.description || 'No description'}</p>
        </div>
      </header>

      <main className="px-4 py-4 max-w-lg mx-auto">
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

        <div className="flex items-center justify-between bg-white rounded-xl p-4 border border-gray-200 mb-4">
          <div>
            <p className="text-sm text-gray-500">Status</p>
            <span className={`text-sm font-semibold ${
              route.status === 'active' ? 'text-blue-600' :
              route.status === 'completed' ? 'text-green-600' :
              route.status === 'stalled' ? 'text-red-600' :
              'text-gray-600'
            }`}>
              {route.status.toUpperCase()}
            </span>
          </div>
          <div className="text-right">
            <p className="text-sm text-gray-500">Due Date</p>
            <p className="font-medium">
              {route.due_date ? format(new Date(route.due_date), 'MMM d, yyyy') : 'Not set'}
            </p>
          </div>
          {route.locked && (
            <div className="flex items-center gap-1 text-red-500">
              <Lock className="w-4 h-4" />
              <span className="text-xs">Locked</span>
            </div>
          )}
        </div>

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

        {route.status === 'assigned' && !needsVerification && (
          <Button className="w-full bg-blue-500 hover:bg-blue-600 mb-4">
            <Play className="w-4 h-4 mr-2" /> Start Route
          </Button>
        )}

        <h2 className="text-lg font-semibold text-gray-900 mb-3">Addresses</h2>

        {addressesLoading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="w-6 h-6 animate-spin text-blue-500" />
          </div>
        ) : addresses.length === 0 ? (
          <div className="bg-gray-100 rounded-xl p-6 text-center">
            <MapPin className="w-8 h-8 text-gray-300 mx-auto mb-2" />
            <p className="text-gray-500 text-sm">No addresses in this route</p>
          </div>
        ) : (
          <div className="space-y-4">
            {addresses.map((address, index) => (
              <AddressCard
                key={address.id}
                address={address}
                index={index}
                routeId={routeId}
                showActions={true}
                onMessageBoss={handleMessageBoss}
                lastAttempt={lastAttemptMap[address.id]}
              />
            ))}
          </div>
        )}
        
        {/* Message Boss Dialog */}
        <MessageBossDialog
          open={showMessageDialog}
          onOpenChange={setShowMessageDialog}
          address={selectedAddress}
          route={route}
          user={user}
        />
      </main>
    </div>
  );
}