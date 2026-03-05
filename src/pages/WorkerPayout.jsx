import React, { useState, useMemo, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { format } from 'date-fns';
import Header from '../components/layout/Header';
import BottomNav from '../components/layout/BottomNav';
import { Loader2, DollarSign, CheckCircle, Clock, Calendar, RotateCcw } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

// Generate days with dates for the next turn-in
function getDaysWithDates() {
  const today = new Date();
  const currentDay = today.getDay();
  
  return DAY_NAMES.map((name, dayIndex) => {
    // Calculate the next occurrence of this day
    let daysUntil = (dayIndex - currentDay + 7) % 7;
    if (daysUntil === 0) daysUntil = 7; // If it's today, show next week's date
    
    const nextDate = new Date(today);
    nextDate.setDate(today.getDate() + daysUntil);
    
    const dateStr = format(nextDate, 'M/d');
    return { value: String(dayIndex), label: `${name} ${dateStr}` };
  });
}

const HOURS = Array.from({ length: 24 }, (_, i) => ({
  value: String(i),
  label: i === 0 ? '12:00 AM' : i < 12 ? `${i}:00 AM` : i === 12 ? '12:00 PM' : `${i - 12}:00 PM`
}));

// Calculate correct pay rate based on serve_type (overrides database values)
function calculateCorrectPayRate(serveType) {
  if (serveType === 'posting') return 10;
  if (serveType === 'serve') return 24;
  if (serveType === 'garnishment') return 24;
  return 0;
}

export default function WorkerPayout() {
  // Default: Wednesday at 12:00 PM
  const [selectedDay, setSelectedDay] = useState(3);
  const [selectedHour, setSelectedHour] = useState(12);
  const [previousTurnInDate, setPreviousTurnInDate] = useState(null);
  const queryClient = useQueryClient();

  const { data: user } = useQuery({
    queryKey: ['currentUser'],
    queryFn: () => base44.auth.me()
  });

  // Load user settings for payroll day/hour
  const { data: userSettings } = useQuery({
    queryKey: ['userSettings', user?.id],
    queryFn: async () => {
      if (!user?.id) return null;
      const settings = await base44.entities.UserSettings.filter({ user_id: user.id });
      return settings[0] || null;
    },
    enabled: !!user?.id
  });

  // Initialize state from saved settings
  useEffect(() => {
    if (userSettings) {
      if (userSettings.payroll_turn_in_day !== undefined && userSettings.payroll_turn_in_day !== null) {
        setSelectedDay(userSettings.payroll_turn_in_day);
      }
      if (userSettings.payroll_turn_in_hour !== undefined && userSettings.payroll_turn_in_hour !== null) {
        setSelectedHour(userSettings.payroll_turn_in_hour);
      }
      if (userSettings.previous_turn_in_date) {
        setPreviousTurnInDate(new Date(userSettings.previous_turn_in_date));
      }
    }
  }, [userSettings]);

  // Mutation to save settings
  const saveSettingsMutation = useMutation({
    mutationFn: async ({ day, hour }) => {
      if (!user?.id) return;
      
      if (userSettings?.id) {
        // Update existing settings
        await base44.entities.UserSettings.update(userSettings.id, {
          payroll_turn_in_day: day,
          payroll_turn_in_hour: hour
        });
      } else {
        // Create new settings
        await base44.entities.UserSettings.create({
          user_id: user.id,
          payroll_turn_in_day: day,
          payroll_turn_in_hour: hour
        });
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['userSettings', user?.id] });
    }
  });

  // Handle day change and save
  const handleDayChange = (value) => {
    const day = parseInt(value);
    setSelectedDay(day);
    saveSettingsMutation.mutate({ day, hour: selectedHour });
  };

  // Handle hour change and save
  const handleHourChange = (value) => {
    const hour = parseInt(value);
    setSelectedHour(hour);
    saveSettingsMutation.mutate({ day: selectedDay, hour });
  };

  const { data: routes = [] } = useQuery({
    queryKey: ['workerRoutes', user?.id],
    queryFn: async () => {
      if (!user?.id) return [];
      // Include ALL routes (including archived) to capture completed work
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

  // Calculate payroll periods based on selected day and hour
  // Current period = for instant payouts (served this week)
  // Previous period = for pending payouts (attempts completed last week, paid on THIS check)
  const { currentPeriod, previousPeriod } = useMemo(() => {
    const now = new Date();
    const currentDayOfWeek = now.getDay();
    const currentHour = now.getHours();
    
    // Calculate days back to the MOST RECENT selected day
    let daysBack = (currentDayOfWeek - selectedDay + 7) % 7;
    
    // If we're on the selected day but before the selected hour, 
    // the period hasn't ended yet - go back to PREVIOUS week's selected day
    if (daysBack === 0 && currentHour < selectedHour) {
      daysBack = 7;
    }
    
    // CURRENT Period START is the most recent selected day at selected hour
    const currentStart = new Date(now);
    currentStart.setDate(currentStart.getDate() - daysBack);
    currentStart.setHours(selectedHour, 0, 0, 0);
    
    // CURRENT Period END is 7 days after start (next turn-in day)
    const currentEnd = new Date(currentStart);
    currentEnd.setDate(currentEnd.getDate() + 7);
    
    // PREVIOUS Period uses saved previous_turn_in_date if available
    // This allows the previous period to stay fixed even if you change the current settings
    let previousEnd;
    if (previousTurnInDate) {
      previousEnd = new Date(previousTurnInDate);
    } else {
      previousEnd = new Date(currentStart); // Fallback to current start
    }
    
    const previousStart = new Date(previousEnd);
    previousStart.setDate(previousStart.getDate() - 7);
    
    return {
      currentPeriod: { start: currentStart, end: currentEnd },
      previousPeriod: { start: previousStart, end: previousEnd }
    };
  }, [selectedDay, selectedHour, previousTurnInDate]);

  // Filter instant payouts (directly served addresses within CURRENT period)
  const instantPayouts = useMemo(() => {
    return addresses.filter(a => {
      if (!a.served || !a.served_at) return false;
      if (!['serve', 'posting', 'garnishment'].includes(a.serve_type)) return false;
      const servedDate = new Date(a.served_at);
      return servedDate >= currentPeriod.start && servedDate < currentPeriod.end;
    });
  }, [addresses, currentPeriod]);

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

  // Filter pending payouts (addresses completed via attempts in PREVIOUS period)
  // These are addresses that:
  // 1. Have all qualifiers (AM + PM + Weekend) completed, OR
  // 2. Are marked as RTO
  // These were completed LAST week and turned in on the previous turn-in date
  const pendingPayouts = useMemo(() => {
    return addresses.filter(a => {
      // Check if address is RTO (returned to office)
      const isRTO = !!a.rto_at;
      
      // Check if all qualifiers are present via attempts
      const addrAttempts = addressAttemptsMap[a.id] || [];
      const hasAM = addrAttempts.some(att => att.has_am);
      const hasPM = addrAttempts.some(att => att.has_pm);
      const hasWeekend = addrAttempts.some(att => att.has_weekend);
      const hasAllQualifiers = hasAM && hasPM && hasWeekend;
      
      // Must be either RTO or have all qualifiers completed
      if (!isRTO && !hasAllQualifiers) return false;
      
      // Exclude addresses that were directly served (those go to instant payouts)
      if (a.served && a.served_at) return false;
      
      // Determine the completion date - either RTO date or last attempt date
      let completionDate = null;
      
      if (isRTO && a.rto_at) {
        completionDate = new Date(a.rto_at);
      } else if (hasAllQualifiers) {
        const lastAttempt = addrAttempts
          .filter(att => att.attempt_time)
          .sort((x, y) => new Date(y.attempt_time) - new Date(x.attempt_time))[0];
        if (lastAttempt?.attempt_time) {
          completionDate = new Date(lastAttempt.attempt_time);
        }
      }
      
      if (!completionDate) return false;
      
      // Must be completed in the PREVIOUS period (last week) - turned in on previous turn-in date
      return completionDate >= previousPeriod.start && completionDate < previousPeriod.end;
    });
  }, [addresses, addressAttemptsMap, previousPeriod]);

  // RTO addresses in the CURRENT period — these will appear on the NEXT paycheck (not this one)
  const rtoCurrentPeriod = useMemo(() => {
    return addresses.filter(a => {
      if (!a.rto_at) return false;
      const rtoDate = new Date(a.rto_at);
      return rtoDate >= currentPeriod.start && rtoDate < currentPeriod.end;
    });
  }, [addresses, currentPeriod]);

  // Calculate when the next paycheck after current period is
  const nextPaycheckDate = useMemo(() => {
    // The current period ends at currentPeriod.end — that's the next turn-in
    // The paycheck AFTER that is 7 days later
    const nextCheck = new Date(currentPeriod.end);
    nextCheck.setDate(nextCheck.getDate() + 7);
    return nextCheck;
  }, [currentPeriod]);

  const instantTotal = instantPayouts.reduce((sum, a) => sum + calculateCorrectPayRate(a.serve_type), 0);
  
  // Manual override for pending total - $312 was turned in on old app
  // This override applies only for the pay period ending Feb 26, 2026
  const overrideEndDate = new Date('2026-02-26T12:00:00');
  const isPendingOverridePeriod = previousPeriod.end <= overrideEndDate && previousPeriod.end > new Date('2026-02-19T12:00:00');
  const pendingTotal = isPendingOverridePeriod ? 312 : pendingPayouts.reduce((sum, a) => sum + calculateCorrectPayRate(a.serve_type), 0);

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
                <Select value={String(selectedDay)} onValueChange={handleDayChange}>
                  <SelectTrigger className="bg-white">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {getDaysWithDates().map(day => (
                      <SelectItem key={day.value} value={day.value}>{day.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-xs text-blue-600 mb-1 block">Turn-in Time</label>
                <Select value={String(selectedHour)} onValueChange={handleHourChange}>
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

            <div className="text-sm text-blue-700 bg-blue-100 rounded-lg px-3 py-2 mb-3">
              <span className="font-medium">Current Period:</span> {format(currentPeriod.start, 'MMM d, h:mm a')} → {format(currentPeriod.end, 'MMM d, h:mm a')}
            </div>

            <div>
              <label className="text-xs text-blue-600 mb-1 block">Previous Turn-in Date (for Next Check calculation)</label>
              <Select 
                value={previousTurnInDate ? previousTurnInDate.toISOString() : 'auto'}
                onValueChange={(value) => {
                  if (value === 'auto') {
                    setPreviousTurnInDate(null);
                    if (userSettings?.id) {
                      base44.entities.UserSettings.update(userSettings.id, { previous_turn_in_date: null });
                    }
                  } else {
                    const date = new Date(value);
                    setPreviousTurnInDate(date);
                    if (userSettings?.id) {
                      base44.entities.UserSettings.update(userSettings.id, { previous_turn_in_date: date.toISOString() });
                    }
                  }
                }}
              >
                <SelectTrigger className="bg-white">
                  <SelectValue placeholder="Select previous turn-in date" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="auto">Auto (based on current settings)</SelectItem>
                  {/* Generate last 4 weeks of potential turn-in dates */}
                  {Array.from({ length: 4 }, (_, i) => {
                    const date = new Date();
                    date.setDate(date.getDate() - (7 * (i + 1)));
                    // Find the selected day in that week
                    const dayDiff = (date.getDay() - selectedDay + 7) % 7;
                    date.setDate(date.getDate() - dayDiff);
                    date.setHours(selectedHour, 0, 0, 0);
                    return date;
                  }).map((date, i) => (
                    <SelectItem key={i} value={date.toISOString()}>
                      {format(date, 'EEEE, MMM d')} at {format(date, 'h:mm a')}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {previousTurnInDate && (
                <p className="text-xs text-blue-500 mt-1">
                  Locked to: {format(previousTurnInDate, 'MMM d, h:mm a')}
                </p>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Summary Cards */}
        <div className="grid grid-cols-3 gap-3 mb-6">
          <Card className="border-green-200">
            <CardContent className="pt-3 pb-3 px-3">
              <div className="flex items-center gap-1 text-green-600 mb-1">
                <DollarSign className="w-4 h-4" />
                <span className="text-xs font-medium">This Check</span>
              </div>
              <p className="text-xl font-bold text-green-700">${instantTotal.toFixed(2)}</p>
              <p className="text-xs text-gray-500">{instantPayouts.length} item{instantPayouts.length !== 1 ? 's' : ''}</p>
            </CardContent>
          </Card>

          <Card className="border-orange-200">
            <CardContent className="pt-3 pb-3 px-3">
              <div className="flex items-center gap-1 text-orange-600 mb-1">
                <Clock className="w-4 h-4" />
                <span className="text-xs font-medium">Next Check</span>
              </div>
              <p className="text-xl font-bold text-orange-700">${pendingTotal.toFixed(2)}</p>
              <p className="text-xs text-gray-500">{pendingPayouts.length} item{pendingPayouts.length !== 1 ? 's' : ''}</p>
            </CardContent>
          </Card>

          <Card className="border-purple-200 bg-purple-50">
            <CardContent className="pt-3 pb-3 px-3">
              <div className="flex items-center gap-1 text-purple-600 mb-1">
                <DollarSign className="w-4 h-4" />
                <span className="text-xs font-medium">Est. Total</span>
              </div>
              <p className="text-xl font-bold text-purple-700">${(instantTotal + pendingTotal).toFixed(2)}</p>
              <p className="text-xs text-gray-500">{instantPayouts.length + pendingPayouts.length} items</p>
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
                          ${calculateCorrectPayRate(address.serve_type).toFixed(2)}
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

            {/* Pending Payouts Section - From PREVIOUS week, turned in on previous turn-in date */}
            <h2 className="text-lg font-semibold text-orange-700 mb-3 flex items-center gap-2">
              <Clock className="w-5 h-5" />
              Completed Attempts (Next Check)
            </h2>
            <p className="text-xs text-orange-600 mb-3">
              Turned in {format(previousPeriod.end, 'MMM d')}
            </p>
            
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
                            {address.rto_at ? 'RTO' : `Attempts: ${addrAttempts.length}`}
                          </p>
                        </div>
                        <div className="text-right">
                          <p className="font-semibold text-orange-600">
                            ${calculateCorrectPayRate(address.serve_type).toFixed(2)}
                          </p>
                          <span className="text-xs px-2 py-0.5 rounded-full bg-orange-100 text-orange-700">
                            {address.rto_at ? 'RTO' : 'Attempt'}
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