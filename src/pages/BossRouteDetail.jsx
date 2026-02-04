import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { Link, useNavigate } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import { format } from 'date-fns';
import { 
  Loader2, 
  ChevronLeft, 
  MapPin, 
  CheckCircle, 
  Clock, 
  Lock, 
  User,
  Edit,
  UserPlus
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import AddressCard from '@/components/address/AddressCard';
import BossBottomNav from '@/components/boss/BossBottomNav';

export default function BossRouteDetail() {
  const navigate = useNavigate();
  const urlParams = new URLSearchParams(window.location.search);
  const routeId = urlParams.get('id') || urlParams.get('routeId');

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
      const addrs = await base44.entities.Address.filter({ route_id: routeId, deleted_at: null });
      return addrs.sort((a, b) => (a.order_index || 0) - (b.order_index || 0));
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

  // Fetch assigned worker info
  const { data: worker } = useQuery({
    queryKey: ['routeWorker', route?.worker_id],
    queryFn: async () => {
      if (!route?.worker_id) return null;
      const users = await base44.entities.User.filter({ id: route.worker_id });
      return users[0] || null;
    },
    enabled: !!route?.worker_id
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

  const statusColors = {
    draft: 'text-gray-600',
    ready: 'text-blue-600',
    assigned: 'text-purple-600',
    active: 'text-green-600',
    stalled: 'text-red-600',
    completed: 'text-emerald-600'
  };

  return (
    <div className="min-h-screen bg-gray-50 pb-20">
      <header className="bg-blue-500 text-white px-4 py-3 flex items-center gap-3">
        <Link to={createPageUrl('BossRoutes')}>
          <ChevronLeft className="w-6 h-6" />
        </Link>
        <div className="flex-1">
          <h1 className="font-bold text-lg">{route.folder_name}</h1>
          <p className="text-sm text-blue-100">{route.description || 'No description'}</p>
        </div>
        <Badge className="bg-white/20 text-white border-0">Boss View</Badge>
      </header>

      <main className="px-4 py-4 max-w-lg mx-auto">
        {/* Stats Cards */}
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

        {/* Route Info */}
        <div className="flex items-center justify-between bg-white rounded-xl p-4 border border-gray-200 mb-4">
          <div>
            <p className="text-sm text-gray-500">Status</p>
            <span className={`text-sm font-semibold ${statusColors[route.status] || 'text-gray-600'}`}>
              {route.status?.toUpperCase()}
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

        {/* Assigned Worker */}
        {route.worker_id && (
          <Card className="mb-4">
            <CardContent className="p-4 flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-indigo-100 flex items-center justify-center">
                <User className="w-5 h-5 text-indigo-600" />
              </div>
              <div className="flex-1">
                <p className="text-sm text-gray-500">Assigned To</p>
                <p className="font-semibold">{worker?.full_name || 'Loading...'}</p>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => navigate(createPageUrl(`ReassignRoute?id=${routeId}`))}
              >
                <UserPlus className="w-4 h-4 mr-1" />
                Reassign
              </Button>
            </CardContent>
          </Card>
        )}

        {/* Action Buttons */}
        <div className="flex gap-2 mb-4">
          {route.status === 'draft' && (
            <Button 
              className="flex-1"
              onClick={() => navigate(createPageUrl(`RouteEditor?id=${routeId}`))}
            >
              <Edit className="w-4 h-4 mr-2" />
              Edit Route
            </Button>
          )}
          {route.status === 'ready' && (
            <Button 
              className="flex-1 bg-green-500 hover:bg-green-600"
              onClick={() => navigate(createPageUrl(`AssignRoute?id=${routeId}`))}
            >
              <UserPlus className="w-4 h-4 mr-2" />
              Assign Route
            </Button>
          )}
        </div>

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
                showActions={false}
                lastAttempt={lastAttemptMap[address.id]}
                allAttempts={allAttemptsMap[address.id] || []}
              />
            ))}
          </div>
        )}
      </main>

      <BossBottomNav currentPage="BossRoutes" />
    </div>
  );
}