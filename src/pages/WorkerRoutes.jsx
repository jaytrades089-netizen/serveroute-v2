import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCurrentUser } from '@/components/hooks/useCurrentUser';
import { useUserSettings } from '@/components/hooks/useUserSettings';
import { Link, useNavigate } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import Header from '../components/layout/Header';
import BottomNav from '../components/layout/BottomNav';
import RouteCard from '../components/common/RouteCard';
import { Loader2, MapPin, Shuffle, Trash2, Archive as ArchiveIcon, Calendar } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { RouteSkeleton } from '@/components/ui/skeletons';
import EmptyState from '@/components/ui/empty-state';
import { toast } from 'sonner';
import ScheduledServeCard from '../components/scheduled/ScheduledServeCard';
import { format, parseISO } from 'date-fns';


export default function WorkerRoutes() {
  const navigate = useNavigate();
  const urlParams = new URLSearchParams(window.location.search);
  const initialFilter = urlParams.get('filter') || 'all';
  const [filter, setFilter] = useState(initialFilter);
  const [deletingRouteId, setDeletingRouteId] = useState(null);
  const [archivingRouteId, setArchivingRouteId] = useState(null);
  const queryClient = useQueryClient();

  const { data: user } = useCurrentUser();

  // DELETE — soft delete route and all its addresses
  const handleDeleteRoute = async (route) => {
    const confirmed = window.confirm(
      `Delete "${route.folder_name}"?\n\nThis will remove the route and all its addresses. This cannot be undone.`
    );
    if (!confirmed) return;
    
    setDeletingRouteId(route.id);
    try {
      await base44.entities.Route.update(route.id, {
        deleted_at: new Date().toISOString(),
        status: 'deleted'
      });
      
      const routeAddresses = await base44.entities.Address.filter({ 
        route_id: route.id, 
        deleted_at: null 
      });
      for (const addr of routeAddresses) {
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

  // ARCHIVE — moves route to archived status (reversible)
  const handleArchiveRoute = async (route) => {
    const isArchived = route.status === 'archived';
    
    if (!isArchived) {
      const confirmed = window.confirm(
        `Archive "${route.folder_name}"?\n\nThis will move it to your Archived tab. You can unarchive it anytime.`
      );
      if (!confirmed) return;
    }
    
    setArchivingRouteId(route.id);
    try {
      if (isArchived) {
        // UNARCHIVE — restore to previous status
        await base44.entities.Route.update(route.id, {
          status: route.pre_archive_status || 'ready',
          archived_at: null,
          pre_archive_status: null
        });
        toast.success(`"${route.folder_name}" restored`);
      } else {
        // ARCHIVE — save current status and set to archived
        await base44.entities.Route.update(route.id, {
          pre_archive_status: route.status,
          status: 'archived',
          archived_at: new Date().toISOString()
        });
        toast.success(`"${route.folder_name}" archived`);
      }
      queryClient.invalidateQueries({ queryKey: ['workerRoutes'] });
    } catch (error) {
      console.error('Failed to archive route:', error);
      toast.error('Failed to archive route');
    } finally {
      setArchivingRouteId(null);
    }
  };

  // EDIT — navigate to EditRoute page
  const handleEditRoute = (route) => {
    navigate(createPageUrl(`EditRoute?id=${route.id}`));
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
    staleTime: 4 * 60 * 60 * 1000,
    gcTime: 4 * 60 * 60 * 1000,
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

  // Fetch all addresses for user's routes
  const { data: allAddresses = [] } = useQuery({
    queryKey: ['workerAddresses', user?.id, routes],
    queryFn: async () => {
      if (!user?.id || routes.length === 0) return [];
      const routeIds = routes.map(r => r.id);
      const addresses = await base44.entities.Address.filter({ 
        route_id: { $in: routeIds },
        deleted_at: null 
      });
      return addresses;
    },
    enabled: !!user?.id && routes.length > 0
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

  // Load user settings for payroll day/hour
  const { data: userSettings } = useUserSettings(user?.id);

  // Fetch open scheduled serves for this worker
  const { data: scheduledServes = [] } = useQuery({
    queryKey: ['workerScheduledServes', user?.id],
    queryFn: async () => {
      if (!user?.id) return [];
      return base44.entities.ScheduledServe.filter({ worker_id: user.id, status: 'open' });
    },
    enabled: !!user?.id
  });

  // Set run date on a route (with optional qualifiers)
  const handleSetRunDate = async (routeId, date, qualifiers) => {
    try {
      const dateStr = date ? format(date, 'yyyy-MM-dd') : null;
      const updateData = { run_date: dateStr };
      if (qualifiers !== undefined) {
        updateData.run_qualifiers = qualifiers;
      }
      await base44.entities.Route.update(routeId, updateData);
      queryClient.invalidateQueries({ queryKey: ['workerRoutes'] });
      toast.success(date ? `Scheduled for ${format(date, 'EEE, MMM d')}` : 'Date cleared');
    } catch (error) {
      toast.error('Failed to set date');
    }
  };

  // Calculate next payroll turn-in date - use saved settings or default to Wednesday at 12pm
  const selectedDay = userSettings?.payroll_turn_in_day ?? 3;
  const selectedHour = userSettings?.payroll_turn_in_hour ?? 12;
  const now = new Date();
  const currentDayOfWeek = now.getDay();
  
  // Calculate the next occurrence of the selected day
  let daysUntil = (selectedDay - currentDayOfWeek + 7) % 7;
  if (daysUntil === 0) daysUntil = 7; // If today is the selected day, show next week
  
  const nextPayrollDate = new Date(now);
  nextPayrollDate.setDate(nextPayrollDate.getDate() + daysUntil);
  nextPayrollDate.setHours(23, 59, 59, 999); // End of that day to include routes due ON that date

  const filteredRoutes = routes.filter(route => {
    if (filter === 'all') return route.status !== 'archived';
    if (filter === 'active') return route.status === 'active' || route.status === 'assigned';
    if (filter === 'completed') return route.status === 'completed';
    if (filter === 'archived') return route.status === 'archived';
    if (filter === 'due-soon') {
      if (route.status === 'completed' || route.status === 'archived') return false;
      
      // Calculate the effective due date for this route (spread due date = 3rd attempt deadline)
      let effectiveDueDate = null;
      
      // If route has started (has first_attempt_date), use the spread due date
      if (route.first_attempt_date) {
        const spreadDays = route.minimum_days_spread || (route.spread_type === '10' ? 10 : 14);
        effectiveDueDate = new Date(route.first_attempt_date);
        effectiveDueDate.setDate(effectiveDueDate.getDate() + spreadDays);
        effectiveDueDate.setHours(0, 0, 0, 0); // Start of the day for comparison
      } else if (route.spread_due_date) {
        effectiveDueDate = new Date(route.spread_due_date);
        effectiveDueDate.setHours(0, 0, 0, 0);
      } else if (route.due_date) {
        // Fallback to route's due_date if not started yet
        effectiveDueDate = new Date(route.due_date);
        effectiveDueDate.setHours(0, 0, 0, 0);
      }
      
      if (!effectiveDueDate) return false;
      
      // Include routes where spread due date is ON or BEFORE the selected payroll date
      return effectiveDueDate <= nextPayrollDate;
    }
    return true;
  });

  const filters = [
    { id: 'all', label: 'All' },
    { id: 'due-soon', label: 'Due Soon' },
    { id: 'completed', label: 'Completed' },
    { id: 'archived', label: 'Archived' }
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
          (() => {
            // Sort routes: active first, then by run_date, then by due_date
            const sorted = [...filteredRoutes].sort((a, b) => {
              const aActive = a.status === 'active';
              const bActive = b.status === 'active';
              if (aActive && !bActive) return -1;
              if (!aActive && bActive) return 1;
              
              // Then by run_date (null = unscheduled goes last)
              const aRun = a.run_date ? new Date(a.run_date) : null;
              const bRun = b.run_date ? new Date(b.run_date) : null;
              if (aRun && !bRun) return -1;
              if (!aRun && bRun) return 1;
              if (aRun && bRun && aRun.getTime() !== bRun.getTime()) return aRun - bRun;
              
              const aDate = a.due_date ? new Date(a.due_date) : new Date('9999-12-31');
              const bDate = b.due_date ? new Date(b.due_date) : new Date('9999-12-31');
              return aDate - bDate;
            });

            // Group by run_date
            const groups = {};
            const unscheduled = [];
            sorted.forEach(route => {
              if (route.run_date) {
                const key = route.run_date;
                if (!groups[key]) groups[key] = [];
                groups[key].push(route);
              } else {
                unscheduled.push(route);
              }
            });

            // Sort group keys by date ascending
            const groupKeys = Object.keys(groups).sort((a, b) => new Date(a) - new Date(b));

            // Map scheduled serves to their run dates
            const servesByDate = {};
            scheduledServes.forEach(s => {
              const dateKey = s.scheduled_datetime ? s.scheduled_datetime.split('T')[0] : null;
              if (dateKey) {
                if (!servesByDate[dateKey]) servesByDate[dateKey] = [];
                servesByDate[dateKey].push(s);
              }
            });

            // Also include scheduled serve dates that don't have route groups
            Object.keys(servesByDate).forEach(dateKey => {
              if (!groups[dateKey] && !groupKeys.includes(dateKey)) {
                groupKeys.push(dateKey);
                groupKeys.sort((a, b) => new Date(a) - new Date(b));
              }
            });

            // Serves that don't match any group date
            const ungroupedServes = scheduledServes.filter(s => {
              const dateKey = s.scheduled_datetime?.split('T')[0];
              return !dateKey || !groupKeys.includes(dateKey);
            });

            const renderRouteCard = (route) => {
              const isOverdue = route.due_date && new Date(route.due_date) < new Date() && route.status !== 'completed';
              return (
                <RouteCard
                  key={route.id}
                  route={route}
                  isBossView={false}
                  attempts={attemptsByRoute[route.id] || []}
                  addresses={allAddresses}
                  onDelete={handleDeleteRoute}
                  onArchive={handleArchiveRoute}
                  onEdit={handleEditRoute}
                  isOverdue={isOverdue}
                  onScheduleRunDate={handleSetRunDate}
                />
              );
            };

            return (
              <div className="space-y-4">
                {/* Dated groups */}
                {groupKeys.map(dateKey => {
                  const dt = parseISO(dateKey);
                  const dayLabel = format(dt, "EEEE, MMMM d");
                  const routesInGroup = groups[dateKey] || [];
                  const servesInGroup = servesByDate[dateKey] || [];

                  return (
                    <div key={dateKey}>
                      <div className="flex items-center gap-2 mb-2 mt-2">
                        <Calendar className="w-4 h-4 text-blue-500" />
                        <h2 className="text-sm font-bold text-blue-700">
                          Scheduled for {dayLabel}
                        </h2>
                      </div>
                      <div className="space-y-3">
                        {routesInGroup.map(renderRouteCard)}
                        {servesInGroup.map(s => (
                          <ScheduledServeCard key={s.id} serve={s} />
                        ))}
                      </div>
                    </div>
                  );
                })}

                {/* Ungrouped scheduled serves */}
                {ungroupedServes.map(s => (
                  <ScheduledServeCard key={s.id} serve={s} />
                ))}

                {/* Unscheduled */}
                {unscheduled.length > 0 && (
                  <div>
                    {groupKeys.length > 0 && (
                      <div className="flex items-center gap-2 mb-2 mt-4">
                        <h2 className="text-sm font-bold text-gray-500">Unscheduled</h2>
                      </div>
                    )}
                    <div className="space-y-3">
                      {unscheduled.map(renderRouteCard)}
                    </div>
                  </div>
                )}
              </div>
            );
          })()
        )}
      </main>

      <BottomNav currentPage="WorkerRoutes" />
    </div>
  );
}