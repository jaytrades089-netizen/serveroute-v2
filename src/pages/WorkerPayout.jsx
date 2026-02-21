import React, { useState, useMemo } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { format } from 'date-fns';
import Header from '../components/layout/Header';
import BottomNav from '../components/layout/BottomNav';
import { Loader2, DollarSign, CheckCircle, Clock, Calendar } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

const DAYS_OF_WEEK = [
  { value: '0', label: 'Sunday' },
  { value: '1', label: 'Monday' },
  { value: '2', label: 'Tuesday' },
  { value: '3', label: 'Wednesday' },
  { value: '4', label: 'Thursday' },
  { value: '5', label: 'Friday' },
  { value: '6', label: 'Saturday' }
];

const HOURS = Array.from({ length: 24 }, (_, i) => ({
  value: String(i),
  label: i === 0 ? '12:00 AM' : i < 12 ? `${i}:00 AM` : i === 12 ? '12:00 PM' : `${i - 12}:00 PM`
}));

export default function WorkerPayout() {
  // Default: Wednesday at 12:00 PM
  const [selectedDay, setSelectedDay] = useState(3);
  const [selectedHour, setSelectedHour] = useState(12);

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

  const { data: addresses = [], isLoading: addressesLoading } = useQuery({
    queryKey: ['allWorkerAddresses', routes],
    queryFn: async () => {
      if (routes.length === 0) return [];
      const routeIds = routes.map(r => r.id);
      const allAddresses = await base44.entities.Address.filter({ deleted_at: null });
      return allAddresses.filter(a => routeIds.includes(a.route_id));
    },
    enabled: routes.length > 0
  });

  const { data: attempts = [], isLoading: attemptsLoading } = useQuery({
    queryKey: ['workerAttempts', user?.id],
    queryFn: async () => {
      if (!user?.id) return [];
      return base44.entities.Attempt.filter({ server_id: user.id });
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

  // Calculate payroll period based on selected day and hour
  const payrollPeriod = useMemo(() => {
    const now = new Date();
    const currentDayOfWeek = now.getDay();
    const currentHour = now.getHours();
    
    // Calculate days back to the selected day
    let daysBack = (currentDayOfWeek - selectedDay + 7) % 7;
    
    // If we're on the selected day but before the selected hour, go back a week
    if (daysBack === 0 && currentHour < selectedHour) {
      daysBack = 7;
    }
    
    const periodStart = new Date(now);
    periodStart.setDate(periodStart.getDate() - daysBack);
    periodStart.setHours(selectedHour, 0, 0, 0);
    
    const periodEnd = new Date(periodStart);
    periodEnd.setDate(periodEnd.getDate() + 7);
    
    return { start: periodStart, end: periodEnd };
  }, [selectedDay, selectedHour]);

  // Filter instant payouts (directly served addresses within period)
  const instantPayouts = useMemo(() => {
    return addresses.filter(a => {
      if (!a.served || !a.served_at) return false;
      if (!['serve', 'posting', 'garnishment'].includes(a.serve_type)) return false;
      const servedDate = new Date(a.served_at);
      return servedDate >= payrollPeriod.start && servedDate < payrollPeriod.end;
    });
  }, [addresses, payrollPeriod]);

  // Create map of address attempts for pending calculation
  const addressAttemptsMap = useMemo(() => {
    const map = {};
    attempts.forEach(attempt => {
      if (!map[attempt.address_id]) {
        map[attempt.address_id] = [];
      }
      map[attempt.address_id].push(attempt);
    });
    return map;
  }, [attempts]);

  // Filter pending payouts (addresses with all qualifiers completed via attempts)
  const pendingPayouts = useMemo(() => {
    return addresses.filter(a => {
      const addrAttempts = addressAttemptsMap[a.id] || [];
      if (addrAttempts.length === 0) return false;
      
      // Check if all qualifiers are present
      const hasAM = addrAttempts.some(att => att.has_am);
      const hasPM = addrAttempts.some(att => att.has_pm);
      const hasWeekend = addrAttempts.some(att => att.has_weekend);
      
      if (!hasAM || !hasPM || !hasWeekend) return false;
      
      // Check if at least one attempt is within the payroll period
      const lastAttempt = addrAttempts
        .filter(att => att.attempt_time)
        .sort((a, b) => new Date(b.attempt_time) - new Date(a.attempt_time))[0];
      
      if (!lastAttempt) return false;
      
      const attemptDate = new Date(lastAttempt.attempt_time);
      return attemptDate >= payrollPeriod.start && attemptDate < payrollPeriod.end;
    }).filter(a => !instantPayouts.find(ip => ip.id === a.id)); // Exclude already instant paid
  }, [addresses, addressAttemptsMap, payrollPeriod, instantPayouts]);

  const instantTotal = instantPayouts.reduce((sum, a) => sum + (a.pay_rate || 0), 0);
  const pendingTotal = pendingPayouts.reduce((sum, a) => sum + (a.pay_rate || 0), 0);

  const isLoading = addressesLoading || attemptsLoading;

  return (
    <div className="min-h-screen bg-gray-50 pb-20">
      <Header user={user} unreadCount={notifications.length} />
      
      <main className="px-4 py-6 max-w-lg mx-auto">
        <h1 className="text-2xl font-bold text-gray-900 mb-4">Earnings & Turn-in</h1>

        {/* Payroll Period Selector */}
        <Card className="mb-6 border-blue-200 bg-blue-50">
          <CardContent className="pt-4 pb-4">
            <div className="flex items-center gap-2 text-blue-700 mb-3">
              <Calendar className="w-5 h-5" />
              <span className="font-semibold">Payroll Period</span>
            </div>
            
            <div className="grid grid-cols-2 gap-3 mb-3">
              <div>
                <label className="text-xs text-blue-600 mb-1 block">Turn-in Day</label>
                <Select value={String(selectedDay)} onValueChange={(v) => setSelectedDay(parseInt(v))}>
                  <SelectTrigger className="bg-white">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {DAYS_OF_WEEK.map(day => (
                      <SelectItem key={day.value} value={day.value}>{day.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-xs text-blue-600 mb-1 block">Turn-in Time</label>
                <Select value={String(selectedHour)} onValueChange={(v) => setSelectedHour(parseInt(v))}>
                  <SelectTrigger className="bg-white">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {HOURS.map(hour => (
                      <SelectItem key={hour.value} value={hour.value}>{hour.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="text-sm text-blue-700 bg-blue-100 rounded-lg px-3 py-2">
              <span className="font-medium">Period:</span> {format(payrollPeriod.start, 'MMM d, h:mm a')} → {format(payrollPeriod.end, 'MMM d, h:mm a')}
            </div>
          </CardContent>
        </Card>

        {/* Summary Cards */}
        <div className="grid grid-cols-2 gap-4 mb-6">
          <Card className="border-green-200">
            <CardContent className="pt-4 pb-4">
              <div className="flex items-center gap-2 text-green-600 mb-1">
                <DollarSign className="w-5 h-5" />
                <span className="text-sm font-medium">This Check</span>
              </div>
              <p className="text-2xl font-bold text-green-700">${instantTotal.toFixed(2)}</p>
              <p className="text-xs text-gray-500">{instantPayouts.length} item{instantPayouts.length !== 1 ? 's' : ''}</p>
            </CardContent>
          </Card>
          
          <Card className="border-orange-200">
            <CardContent className="pt-4 pb-4">
              <div className="flex items-center gap-2 text-orange-600 mb-1">
                <Clock className="w-5 h-5" />
                <span className="text-sm font-medium">Next Check</span>
              </div>
              <p className="text-2xl font-bold text-orange-700">${pendingTotal.toFixed(2)}</p>
              <p className="text-xs text-gray-500">{pendingPayouts.length} item{pendingPayouts.length !== 1 ? 's' : ''}</p>
            </CardContent>
          </Card>
        </div>

        {isLoading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
          </div>
        ) : (
          <>
            {/* Instant Payouts Section */}
            <h2 className="text-lg font-semibold text-green-700 mb-3 flex items-center gap-2">
              <CheckCircle className="w-5 h-5" />
              Instant Payouts (This Check)
            </h2>
            
            {instantPayouts.length === 0 ? (
              <div className="bg-green-50 border border-green-200 rounded-xl p-6 text-center mb-6">
                <CheckCircle className="w-8 h-8 text-green-300 mx-auto mb-2" />
                <p className="text-green-600 text-sm">No instant payouts this period</p>
              </div>
            ) : (
              <div className="space-y-2 mb-6">
                {instantPayouts.map((address) => (
                  <div
                    key={address.id}
                    className="bg-white border-2 border-green-200 rounded-xl p-4"
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
                        <span className="text-xs px-2 py-0.5 rounded-full bg-green-100 text-green-700 capitalize">
                          {address.serve_type}
                        </span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Pending Payouts Section */}
            <h2 className="text-lg font-semibold text-orange-700 mb-3 flex items-center gap-2">
              <Clock className="w-5 h-5" />
              Pending Payouts (Next Check)
            </h2>
            
            {pendingPayouts.length === 0 ? (
              <div className="bg-orange-50 border border-orange-200 rounded-xl p-6 text-center">
                <Clock className="w-8 h-8 text-orange-300 mx-auto mb-2" />
                <p className="text-orange-600 text-sm">No pending payouts this period</p>
              </div>
            ) : (
              <div className="space-y-2">
                {pendingPayouts.map((address) => {
                  const addrAttempts = addressAttemptsMap[address.id] || [];
                  const lastAttempt = addrAttempts
                    .filter(att => att.attempt_time)
                    .sort((a, b) => new Date(b.attempt_time) - new Date(a.attempt_time))[0];
                  
                  return (
                    <div
                      key={address.id}
                      className="bg-white border-2 border-orange-200 rounded-xl p-4"
                    >
                      <div className="flex justify-between items-start">
                        <div className="flex-1">
                          <p className="font-medium text-gray-900 text-sm">
                            {address.normalized_address || address.legal_address}
                          </p>
                          <p className="text-xs text-gray-500 mt-1">
                            {lastAttempt?.attempt_time && format(new Date(lastAttempt.attempt_time), 'MMM d, h:mm a')}
                          </p>
                          <p className="text-xs text-orange-500 mt-0.5">
                            Attempts mailed: {addrAttempts.length}
                          </p>
                        </div>
                        <div className="text-right">
                          <p className="font-semibold text-orange-600">
                            ${(address.pay_rate || 0).toFixed(2)}
                          </p>
                          <span className="text-xs px-2 py-0.5 rounded-full bg-orange-100 text-orange-700">
                            Attempt
                          </span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </>
        )}
      </main>

      <BottomNav currentPage="WorkerRoutes" />
    </div>
  );
}