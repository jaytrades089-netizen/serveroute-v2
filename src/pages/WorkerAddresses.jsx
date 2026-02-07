import React from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import Header from '../components/layout/Header';
import BottomNav from '../components/layout/BottomNav';
import { Loader2, MapPin, CheckCircle } from 'lucide-react';

export default function WorkerAddresses() {
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
    queryKey: ['workerAddresses', routes],
    queryFn: async () => {
      if (routes.length === 0) return [];
      const addressPromises = routes.map(r => 
        base44.entities.Address.filter({ route_id: r.id, deleted_at: null })
      );
      const results = await Promise.all(addressPromises);
      return results.flat().filter(a => !a.served);
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

  return (
    <div className="min-h-screen bg-gray-50 pb-20">
      <Header user={user} unreadCount={notifications.length} />
      
      <main className="px-4 py-6 max-w-lg mx-auto">
        <h1 className="text-2xl font-bold text-gray-900 mb-4">Pending Addresses</h1>

        {isLoading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
          </div>
        ) : addresses.length === 0 ? (
          <div className="bg-gray-100 rounded-xl p-8 text-center">
            <CheckCircle className="w-10 h-10 text-green-400 mx-auto mb-2" />
            <p className="text-gray-500">All addresses served!</p>
          </div>
        ) : (
          <div className="space-y-2">
            {addresses.map((address) => (
              <div
                key={address.id}
                className="bg-white border border-gray-200 rounded-xl p-4"
              >
                <div className="flex items-start gap-3">
                  <MapPin className="w-5 h-5 text-gray-400 mt-0.5 flex-shrink-0" />
                  <div className="flex-1">
                    <p className="font-medium text-gray-900">
                      {address.normalized_address || address.legal_address}
                    </p>
                    <div className="flex gap-2 mt-2">
                      <span className={`text-xs px-2 py-1 rounded-full ${
                        address.status === 'pending' ? 'bg-gray-100 text-gray-600' :
                        address.status === 'attempted' ? 'bg-orange-100 text-orange-700' :
                        'bg-gray-100 text-gray-600'
                      }`}>
                        {address.status}
                      </span>
                      <span className="text-xs px-2 py-1 rounded-full bg-blue-100 text-blue-700">
                        {address.serve_type}
                      </span>
                      {address.attempts_count > 0 && (
                        <span className="text-xs text-gray-500">
                          {address.attempts_count} attempt{address.attempts_count > 1 ? 's' : ''}
                        </span>
                      )}
                    </div>
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