import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { Link, useNavigate } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import Header from '../components/layout/Header';
import BottomNav from '../components/layout/BottomNav';
import RouteCard from '../components/common/RouteCard';
import { Loader2, MapPin } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { RouteSkeleton } from '@/components/ui/skeletons';
import EmptyState from '@/components/ui/empty-state';

export default function WorkerRoutes() {
  const urlParams = new URLSearchParams(window.location.search);
  const initialFilter = urlParams.get('filter') || 'all';
  const [filter, setFilter] = useState(initialFilter);

  const { data: user } = useQuery({
    queryKey: ['currentUser'],
    queryFn: () => base44.auth.me()
  });

  const { data: routes = [], isLoading } = useQuery({
    queryKey: ['workerRoutes', user?.id],
    queryFn: async () => {
      if (!user?.id) return [];
      // Fetch all routes and filter by worker_id client-side
      const allRoutes = await base44.entities.Route.filter({ 
        deleted_at: null 
      });
      return allRoutes.filter(r => r.worker_id === user.id);
    },
    enabled: !!user?.id
  });

  const { data: notifications = [] } = useQuery({
    queryKey: ['notifications', user?.id],
    queryFn: async () => {
      if (!user?.id) return [];
      return base44.entities.Notification.filter({ user_id: user.id, read: false });
    },
    enabled: !!user?.id
  });

  const threeDaysFromNow = new Date();
  threeDaysFromNow.setDate(threeDaysFromNow.getDate() + 3);

  const filteredRoutes = routes.filter(route => {
    if (filter === 'all') return true;
    if (filter === 'active') return route.status === 'active' || route.status === 'assigned';
    if (filter === 'completed') return route.status === 'completed';
    if (filter === 'due-soon') {
      return route.status !== 'completed' && 
             route.due_date && 
             new Date(route.due_date) <= threeDaysFromNow;
    }
    return true;
  });

  const filters = [
    { id: 'all', label: 'All' },
    { id: 'active', label: 'Active' },
    { id: 'due-soon', label: 'Due Soon' },
    { id: 'completed', label: 'Completed' }
  ];

  return (
    <div className="min-h-screen bg-gray-50 pb-20">
      <Header user={user} unreadCount={notifications.length} />
      
      <main className="px-4 py-6 max-w-lg mx-auto">
        <h1 className="text-2xl font-bold text-gray-900 mb-4">My Routes</h1>

        <div className="flex gap-2 mb-4 overflow-x-auto pb-2">
          {filters.map(f => (
            <Button
              key={f.id}
              variant={filter === f.id ? 'default' : 'outline'}
              size="sm"
              onClick={() => setFilter(f.id)}
              className={filter === f.id ? 'bg-blue-500' : ''}
            >
              {f.label}
            </Button>
          ))}
        </div>

        {isLoading ? (
          <div className="space-y-3">
            {[1, 2, 3].map(i => <RouteSkeleton key={i} />)}
          </div>
        ) : filteredRoutes.length === 0 ? (
          <EmptyState 
            type="routes" 
            title={filter === 'all' ? 'No routes yet' : `No ${filter} routes`}
            description={filter === 'all' 
              ? "You'll see your assigned routes here."
              : `No routes match the "${filter}" filter.`
            }
          />
        ) : (
          <div className="space-y-4">
            {filteredRoutes.map((route) => (
              <RouteCard
                key={route.id}
                route={route}
                isBossView={false}
              />
            ))}
          </div>
        )}
      </main>

      <BottomNav currentPage="WorkerRoutes" />
    </div>
  );
}