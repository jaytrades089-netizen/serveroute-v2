import React from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import { format, subDays } from 'date-fns';
import { 
  Loader2, 
  ChevronLeft, 
  TrendingUp,
  MapPin,
  CheckCircle,
  Clock,
  Calendar,
  Award
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import BottomNav from '../components/layout/BottomNav';

export default function WorkerStats() {
  const { data: user, isLoading: userLoading } = useQuery({
    queryKey: ['currentUser'],
    queryFn: () => base44.auth.me()
  });

  const { data: routes = [] } = useQuery({
    queryKey: ['myRoutes', user?.id],
    queryFn: async () => {
      return base44.entities.Route.filter({
        worker_id: user.id,
        deleted_at: null
      });
    },
    enabled: !!user?.id
  });

  const { data: addresses = [] } = useQuery({
    queryKey: ['myAddresses', user?.id, routes],
    queryFn: async () => {
      if (routes.length === 0) return [];
      const routeIds = routes.map(r => r.id);
      const all = await base44.entities.Address.filter({
        company_id: user.company_id,
        deleted_at: null
      });
      return all.filter(a => routeIds.includes(a.route_id));
    },
    enabled: routes.length > 0
  });

  if (userLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
      </div>
    );
  }

  // Calculate stats
  const completedRoutes = routes.filter(r => r.status === 'completed');
  const servedAddresses = addresses.filter(a => a.served);

  // Today's stats
  const today = new Date().toISOString().split('T')[0];
  const todayServed = servedAddresses.filter(a => a.served_at?.startsWith(today)).length;
  const todayRoutes = completedRoutes.filter(r => r.completed_at?.startsWith(today)).length;

  // This week stats
  const weekAgo = subDays(new Date(), 7);
  const weekRoutes = completedRoutes.filter(r => 
    r.completed_at && new Date(r.completed_at) >= weekAgo
  ).length;
  const weekServed = servedAddresses.filter(a => 
    a.served_at && new Date(a.served_at) >= weekAgo
  ).length;

  // 30-day stats
  const thirtyDaysAgo = subDays(new Date(), 30);
  const monthRoutes = completedRoutes.filter(r => 
    r.completed_at && new Date(r.completed_at) >= thirtyDaysAgo
  ).length;
  const monthServed = servedAddresses.filter(a => 
    a.served_at && new Date(a.served_at) >= thirtyDaysAgo
  ).length;

  // Estimates
  const avgTimePerAddress = user.avg_completion_time_minutes || 12;
  const estimatedEarnings = monthServed * 24; // $24 per address average

  return (
    <div className="min-h-screen bg-gray-50 pb-20">
      {/* Header */}
      <header className="bg-blue-500 text-white px-4 py-3 flex items-center gap-3">
        <Link to={createPageUrl('WorkerSettings')}>
          <ChevronLeft className="w-6 h-6" />
        </Link>
        <span className="font-bold text-lg">My Stats</span>
      </header>

      <main className="px-4 py-6 max-w-lg mx-auto space-y-4">
        {/* Overview */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <TrendingUp className="w-4 h-4" />
              Today
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-3 gap-4 text-center">
              <div className="bg-green-50 rounded-lg p-3">
                <p className="text-2xl font-bold text-green-600">{todayServed}</p>
                <p className="text-xs text-gray-500">Addresses</p>
              </div>
              <div className="bg-blue-50 rounded-lg p-3">
                <p className="text-2xl font-bold text-blue-600">{todayRoutes}</p>
                <p className="text-xs text-gray-500">Routes</p>
              </div>
              <div className="bg-purple-50 rounded-lg p-3">
                <p className="text-2xl font-bold text-purple-600">${todayServed * 24}</p>
                <p className="text-xs text-gray-500">Est. Earned</p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* This Week */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <Calendar className="w-4 h-4" />
              This Week
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-4">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-green-100 rounded-lg">
                  <CheckCircle className="w-5 h-5 text-green-600" />
                </div>
                <div>
                  <p className="text-xl font-bold">{weekServed}</p>
                  <p className="text-xs text-gray-500">Addresses served</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <div className="p-2 bg-blue-100 rounded-lg">
                  <MapPin className="w-5 h-5 text-blue-600" />
                </div>
                <div>
                  <p className="text-xl font-bold">{weekRoutes}</p>
                  <p className="text-xs text-gray-500">Routes completed</p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Last 30 Days */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <Award className="w-4 h-4" />
              Last 30 Days
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="flex justify-between items-center py-2 border-b">
                <span className="text-gray-600">Routes Completed</span>
                <span className="font-bold text-lg">{monthRoutes}</span>
              </div>
              <div className="flex justify-between items-center py-2 border-b">
                <span className="text-gray-600">Addresses Served</span>
                <span className="font-bold text-lg">{monthServed}</span>
              </div>
              <div className="flex justify-between items-center py-2 border-b">
                <span className="text-gray-600">Avg Time/Address</span>
                <span className="font-bold text-lg">{avgTimePerAddress} min</span>
              </div>
              <div className="flex justify-between items-center py-2 border-b">
                <span className="text-gray-600">Reliability Score</span>
                <span className="font-bold text-lg">{user.reliability_score || '-'}%</span>
              </div>
              <div className="flex justify-between items-center py-2">
                <span className="text-gray-600">Est. Earnings</span>
                <span className="font-bold text-lg text-green-600">${estimatedEarnings.toLocaleString()}</span>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* All Time */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold">All Time</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-4 text-center">
              <div className="bg-gray-50 rounded-lg p-4">
                <p className="text-3xl font-bold text-gray-900">
                  {user.total_routes_completed || completedRoutes.length}
                </p>
                <p className="text-sm text-gray-500">Routes</p>
              </div>
              <div className="bg-gray-50 rounded-lg p-4">
                <p className="text-3xl font-bold text-gray-900">
                  {user.total_addresses_completed || servedAddresses.length}
                </p>
                <p className="text-sm text-gray-500">Addresses</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </main>

      <BottomNav currentPage="WorkerSettings" />
    </div>
  );
}