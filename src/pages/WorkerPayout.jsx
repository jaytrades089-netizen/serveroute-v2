import React from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { format } from 'date-fns';
import Header from '../components/layout/Header';
import BottomNav from '../components/layout/BottomNav';
import { Loader2, DollarSign, CheckCircle, TrendingUp } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

export default function WorkerPayout() {
  const { data: user } = useQuery({
    queryKey: ['currentUser'],
    queryFn: () => base44.auth.me()
  });

  const { data: routes = [] } = useQuery({
    queryKey: ['workerRoutes', user?.id],
    queryFn: async () => {
      if (!user?.id) return [];
      return base44.entities.Route.filter({ worker_id: user.id, deleted_at: null });
    },
    enabled: !!user?.id
  });

  const { data: addresses = [], isLoading } = useQuery({
    queryKey: ['servedAddresses', routes],
    queryFn: async () => {
      if (routes.length === 0) return [];
      const routeIds = routes.map(r => r.id);
      const allAddresses = await base44.entities.Address.filter({ served: true, deleted_at: null });
      return allAddresses.filter(a => routeIds.includes(a.route_id));
    },
    enabled: routes.length > 0
  });

  const { data: notifications = [] } = useQuery({
    queryKey: ['notifications', user?.id],
    queryFn: async () => {
      if (!user?.id) return [];
      return base44.entities.Notification.filter({ user_id: user.id, read: false });
    },
    enabled: !!user?.id
  });

  const totalEarnings = addresses.reduce((sum, a) => sum + (a.pay_rate || 0), 0);
  const totalServed = addresses.length;

  // Group by week for display
  const thisWeekStart = new Date();
  thisWeekStart.setDate(thisWeekStart.getDate() - thisWeekStart.getDay());
  thisWeekStart.setHours(0, 0, 0, 0);

  const thisWeekAddresses = addresses.filter(a => 
    a.served_at && new Date(a.served_at) >= thisWeekStart
  );
  const thisWeekEarnings = thisWeekAddresses.reduce((sum, a) => sum + (a.pay_rate || 0), 0);

  return (
    <div className="min-h-screen bg-gray-50 pb-20">
      <Header user={user} unreadCount={notifications.length} />
      
      <main className="px-4 py-6 max-w-lg mx-auto">
        <h1 className="text-2xl font-bold text-gray-900 mb-4">Earnings & Turn-in</h1>

        <div className="grid grid-cols-2 gap-4 mb-6">
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-2 text-green-600 mb-1">
                <DollarSign className="w-5 h-5" />
                <span className="text-sm font-medium">This Week</span>
              </div>
              <p className="text-3xl font-bold">${thisWeekEarnings.toFixed(2)}</p>
              <p className="text-xs text-gray-500">{thisWeekAddresses.length} served</p>
            </CardContent>
          </Card>
          
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-2 text-blue-600 mb-1">
                <TrendingUp className="w-5 h-5" />
                <span className="text-sm font-medium">All Time</span>
              </div>
              <p className="text-3xl font-bold">${totalEarnings.toFixed(2)}</p>
              <p className="text-xs text-gray-500">{totalServed} served</p>
            </CardContent>
          </Card>
        </div>

        <h2 className="text-lg font-semibold text-gray-900 mb-3">Served Addresses</h2>

        {isLoading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
          </div>
        ) : addresses.length === 0 ? (
          <div className="bg-gray-100 rounded-xl p-8 text-center">
            <CheckCircle className="w-10 h-10 text-gray-300 mx-auto mb-2" />
            <p className="text-gray-500">No served addresses yet</p>
          </div>
        ) : (
          <div className="space-y-2">
            {addresses.slice(0, 20).map((address) => (
              <div
                key={address.id}
                className="bg-white border border-gray-200 rounded-xl p-4"
              >
                <div className="flex justify-between items-start">
                  <div className="flex-1">
                    <p className="font-medium text-gray-900 text-sm">
                      {address.normalized_address || address.legal_address}
                    </p>
                    <p className="text-xs text-gray-500 mt-1">
                      {address.served_at && format(new Date(address.served_at), 'MMM d, h:mm a')}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="font-semibold text-green-600">
                      ${(address.pay_rate || 0).toFixed(2)}
                    </p>
                    <span className="text-xs px-2 py-0.5 rounded-full bg-green-100 text-green-700">
                      {address.serve_type}
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>

      <BottomNav currentPage="WorkerRoutes" />
    </div>
  );
}