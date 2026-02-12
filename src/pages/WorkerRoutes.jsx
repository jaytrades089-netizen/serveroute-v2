import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import Header from '../components/layout/Header';
import BottomNav from '../components/layout/BottomNav';
import RouteCard from '../components/common/RouteCard';
import { Loader2, MapPin, Shuffle, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { RouteSkeleton } from '@/components/ui/skeletons';
import EmptyState from '@/components/ui/empty-state';
import { toast } from 'sonner';

export default function WorkerRoutes() {
  const urlParams = new URLSearchParams(window.location.search);
  const initialFilter = urlParams.get('filter') || 'all';
  const [filter, setFilter] = useState(initialFilter);
  const [deletingRouteId, setDeletingRouteId] = useState(null);
  const queryClient = useQueryClient();

  const { data: user } = useQuery({
    queryKey: ['currentUser'],
    queryFn: () => base44.auth.me()
  });

  const handleDeleteRoute = async (route) => {
    const confirmed = window.confirm(
      `Delete "${route.folder_name}"?\n\nThis will remove the route and all its addresses. This cannot be undone.`
    );
    if (!confirmed) return;
    
    setDeletingRouteId(route.id);
    try {
      // Soft-delete route
      await base44.entities.Route.update(route.id, {
        deleted_at: new Date().toISOString(),
        status: 'deleted'
      });
      
      // Soft-delete all addresses in the route
      const addresses = await base44.entities.Address.filter({ 
        route_id: route.id, 
        deleted_at: null 
      });
      for (const addr of addresses) {
        await base44.entities.Address.update(addr.id, {
          deleted_at: new Date().toISOString()
        });
      }
      
      toast.success(`"${route.folder_name}" deleted`);
      queryClient.invalidateQueries({ queryKey: ['workerRoutes'] });
    } catch (error) {
      console.error('Failed to delete route:', error);
      toast.error('Failed to delete route');
    } finally {
      setDeletingRouteId(null);
    }
  };

  const { data: routes = [], isLoading } = useQuery({
    queryKey: ['workerRoutes', user?.id],
    queryFn: async () => {
      if (!user?.id) return [];
      return base44.entities.Route.filter({ 
        worker_id: user.id,
        deleted_at: null 
      });
    },
    enabled: !!user?.id,
    refetchInterval: 30000
  });

  // Fetch attempts for all user's routes
  const { data: allAttempts = [] } = useQuery({
    queryKey: ['workerAttempts', user?.id],
    queryFn: async () => {
      if (!user?.id) return [];
      return base44.entities.Attempt.filter({ server_id: user.id });
    },
    enabled: !!user?.id
  });

  // Group attempts by route_id
  const attemptsByRoute = React.useMemo(() => {
    const map = {};
    allAttempts.forEach(att => {
      if (!map[att.route_id]) map[att.route_id] = [];
      map[att.route_id].push(att);
    });
    return map;
  }, [allAttempts]);

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
          <Link to={createPageUrl('ComboRouteSelection')}>
            <Button
              size="sm"
              className="bg-purple-500 hover:bg-purple-600 text-white"
            >
              <Shuffle className="w-4 h-4 mr-1" />
              Combo
            </Button>
          </Link>
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
              <div key={route.id} className="space-y-1">
                <RouteCard
                  route={route}
                  isBossView={false}
                  attempts={attemptsByRoute[route.id] || []}
                />
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleDeleteRoute(route);
                  }}
                  disabled={deletingRouteId === route.id}
                  className="w-full py-2 text-xs text-red-500 hover:text-red-700 hover:bg-red-50 rounded-lg transition-colors flex items-center justify-center gap-1"
                >
                  {deletingRouteId === route.id ? (
                    <Loader2 className="w-3 h-3 animate-spin" />
                  ) : (
                    <Trash2 className="w-3 h-3" />
                  )}
                  Delete Route
                </button>
              </div>
            ))}
          </div>
        )}
      </main>

      <BottomNav currentPage="WorkerRoutes" />
    </div>
  );
}