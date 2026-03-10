import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import { format } from 'date-fns';
import Header from '../components/layout/Header';
import BottomNav from '../components/layout/BottomNav';
import { Loader2, DollarSign, CheckCircle, Clock, Calendar, RotateCcw, Save, ArrowRight, ChevronRight, FileText as FileTextIcon } from 'lucide-react';
import { toast } from 'sonner';
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

// Calculate correct pay rate based on serve_type (overrides database values)
function calculateCorrectPayRate(serveType) {
  if (serveType === 'posting') return 10;
  if (serveType === 'serve') return 24;
  if (serveType === 'garnishment') return 24;
  return 0;
}

export default function WorkerPayout() {
  const navigate = useNavigate();
  // Default: Wednesday
  const [selectedDay, setSelectedDay] = useState(3);
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
      if (userSettings.previous_turn_in_date) {
        setPreviousTurnInDate(new Date(userSettings.previous_turn_in_date));
      }
    }
  }, [userSettings]);

  // Mutation to save settings
  const saveSettingsMutation = useMutation({
    mutationFn: async ({ day }) => {
      if (!user?.id) return;
      
      if (userSettings?.id) {
        await base44.entities.UserSettings.update(userSettings.id, {
          payroll_turn_in_day: day
        });
      } else {
        await base44.entities.UserSettings.create({
          user_id: user.id,
          payroll_turn_in_day: day
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
    saveSettingsMutation.mutate({ day });
  };

  // Handle Turn In button
  const handleTurnIn = async () => {
    // Check for existing record in the same period
    const existingRecord = payrollHistory.find(r => {
      if (!r.period_start || !r.period_end) return false;
      const rStart = new Date(r.period_start).toDateString();
      const rEnd = new Date(r.period_end).toDateString();
      const cStart = currentPeriod.start.toDateString();
      const cEnd = currentPeriod.end.toDateString();
      return rStart === cStart && rEnd === cEnd;
    });

    if (existingRecord) {
      const confirmed = window.confirm(
        `You already have a saved pay stub for this period (${format(currentPeriod.start, 'MMM d')} – ${format(currentPeriod.end, 'MMM d')}).\n\nWould you like to override it with updated data?`
      );
      if (!confirmed) return;

      // Delete the existing record before saving new one
      await base44.entities.PayrollRecord.delete(existingRecord.id);
    }

    const now = new Date();
    setPreviousTurnInDate(now);
    if (userSettings?.id) {
      await base44.entities.UserSettings.update(userSettings.id, {
        previous_turn_in_date: now.toISOString()
      });
    } else if (user?.id) {
      await base44.entities.UserSettings.create({
        user_id: user.id,
        payroll_turn_in_day: selectedDay,
        previous_turn_in_date: now.toISOString()
      });
    }
    queryClient.invalidateQueries({ queryKey: ['userSettings', user?.id] });
    savePayrollRecord(now, true);
  };

  // Save a payroll record snapshot (with optional duplicate check bypass)
  const savePayrollRecord = async (turnInDate = null, skipDuplicateCheck = false) => {
    if (!user?.id) return;
    try {
      // Check for existing record in same period (unless already handled by caller)
      if (!skipDuplicateCheck) {
        const existingRecord = payrollHistory.find(r => {
          if (!r.period_start || !r.period_end) return false;
          const rStart = new Date(r.period_start).toDateString();
          const rEnd = new Date(r.period_end).toDateString();
          const cStart = currentPeriod.start.toDateString();
          const cEnd = currentPeriod.end.toDateString();
          return rStart === cStart && rEnd === cEnd;
        });
        if (existingRecord) {
          const confirmed = window.confirm(
            `You already have a saved pay stub for this period (${format(currentPeriod.start, 'MMM d')} – ${format(currentPeriod.end, 'MMM d')}).\n\nWould you like to override it with updated data?`
          );
          if (!confirmed) return;
          await base44.entities.PayrollRecord.delete(existingRecord.id);
        }
      }

      const now = new Date();
      const snapshotAddresses = [
        ...instantPayouts.map(a => ({
          id: a.id,
          address: a.normalized_address || a.legal_address,
          defendant: a.defendant_name || '',
          serve_type: a.serve_type,
          amount: calculateCorrectPayRate(a.serve_type),
          served_at: a.served_at,
          rto_at: null,
          bucket: 'instant'
        })),
        ...pendingPayouts.map(a => ({
          id: a.id,
          address: a.normalized_address || a.legal_address,
          defendant: a.defendant_name || '',
          serve_type: a.serve_type,
          amount: calculateCorrectPayRate(a.serve_type),
          served_at: a.served_at,
          rto_at: a.rto_at || null,
          bucket: 'pending'
        })),
        ...rtoCurrentPeriod.map(a => ({
          id: a.id,
          address: a.normalized_address || a.legal_address,
          defendant: a.defendant_name || '',
          serve_type: a.serve_type,
          amount: calculateCorrectPayRate(a.serve_type),
          served_at: null,
          rto_at: a.rto_at,
          rto_reason: a.rto_reason || '',
          bucket: 'rto'
        }))
      ];

      const rtoTotal = rtoCurrentPeriod.reduce((sum, a) => sum + calculateCorrectPayRate(a.serve_type), 0);

      await base44.entities.PayrollRecord.create({
        user_id: user.id,
        company_id: user.company_id || '',
        period_start: currentPeriod.start.toISOString(),
        period_end: currentPeriod.end.toISOString(),
        turn_in_date: (turnInDate || now).toISOString(),
        instant_total: instantTotal,
        pending_total: pendingTotal,
        rto_total: rtoTotal,
        total_amount: instantTotal + pendingTotal,
        address_count: snapshotAddresses.length,
        snapshot_data: JSON.stringify(snapshotAddresses),
        status: 'saved',
        notes: '',
        created_at: now.toISOString()
      });

      refetchHistory();
      toast.success('Payroll record saved');
    } catch (err) {
      console.error('Failed to save payroll record:', err);
      toast.error('Failed to save record');
    }
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

  const { data: payrollHistory = [], refetch: refetchHistory } = useQuery({
    queryKey: ['payrollHistory', user?.id],
    queryFn: async () => {
      if (!user?.id) return [];
      const records = await base44.entities.PayrollRecord.filter({ user_id: user.id });
      return records.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    },
    enabled: !!user?.id,
    staleTime: 5 * 60 * 1000
  });

  // Calculate payroll periods based on selected day and hour
  // Current period = for instant payouts (served this week)
  // Previous period = for pending payouts (attempts completed last week, paid on THIS check)
  const { currentPeriod, previousPeriod } = useMemo(() => {
    const now = new Date();
    const currentDayOfWeek = now.getDay();
    
    // Calculate days back to the MOST RECENT selected day
    let daysBack = (currentDayOfWeek - selectedDay + 7) % 7;
    
    // If we're on the selected day, the period hasn't ended yet - go back to PREVIOUS week
    if (daysBack === 0) {
      daysBack = 7;
    }
    
    // CURRENT Period START is the most recent selected day at midnight
    const currentStart = new Date(now);
    currentStart.setDate(currentStart.getDate() - daysBack);
    currentStart.setHours(0, 0, 0, 0);
    
    // CURRENT Period END is 7 days after start (next turn-in day)
    const currentEnd = new Date(currentStart);
    currentEnd.setDate(currentEnd.getDate() + 7);
    
    // PREVIOUS Period = from last turn-in date to current period start
    // "Next Check" shows work completed AFTER the last turn-in but BEFORE the current period
    let previousStart;
    if (previousTurnInDate) {
      previousStart = new Date(previousTurnInDate);
    } else {
      // Fallback: previous period is 7 days before current start
      previousStart = new Date(currentStart);
      previousStart.setDate(previousStart.getDate() - 7);
    }
    
    const previousEnd = new Date(currentStart);
    
    return {
      currentPeriod: { start: currentStart, end: currentEnd },
      previousPeriod: { start: previousStart, end: previousEnd }
    };
  }, [selectedDay, previousTurnInDate]);

  // Filter instant payouts (served addresses AFTER the last turn-in date, within current period)
  const instantPayouts = useMemo(() => {
    const turnInCutoff = previousTurnInDate || currentPeriod.start;
    return addresses.filter(a => {
      if (!a.served || !a.served_at) return false;
      if (!['serve', 'posting', 'garnishment'].includes(a.serve_type)) return false;
      const servedDate = new Date(a.served_at);
      // Must be after last turn-in AND within current period
      return servedDate >= turnInCutoff && servedDate < currentPeriod.end;
    });
  }, [addresses, currentPeriod, previousTurnInDate]);

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

  // Filter pending payouts - these are addresses that were turned in last time
  // They include: served addresses from BEFORE the last turn-in, and completed attempts/RTOs from before turn-in
  // Basically: everything that was turned in at the previous turn-in date, now waiting for next paycheck
  const { pendingPayouts, pendingRTOs } = useMemo(() => {
    if (!previousTurnInDate) return { pendingPayouts: [], pendingRTOs: [] };
    
    const turnInCutoff = previousTurnInDate;
    
    // Find the turn-in BEFORE the previous one to know the start of the turned-in period
    // We look at payroll history for the previous record's period_start
    const lastRecord = payrollHistory[0]; // Most recent saved record
    const periodStart = lastRecord?.period_start ? new Date(lastRecord.period_start) : new Date(previousTurnInDate.getTime() - 7 * 24 * 60 * 60 * 1000);
    
    const served = [];
    const rtos = [];
    
    addresses.forEach(a => {
      if (!['serve', 'posting', 'garnishment'].includes(a.serve_type)) return;
      
      // Served addresses from the turned-in period
      if (a.served && a.served_at) {
        const servedDate = new Date(a.served_at);
        if (servedDate >= periodStart && servedDate < turnInCutoff) {
          served.push(a);
          return;
        }
      }
      
      // RTO addresses from the turned-in period
      if (a.rto_at) {
        const rtoDate = new Date(a.rto_at);
        if (rtoDate >= periodStart && rtoDate < turnInCutoff) {
          rtos.push(a);
          return;
        }
      }
      
      // Completed attempt addresses (all qualifiers met) from turned-in period
      if (!a.served && !a.rto_at) {
        const addrAttempts = addressAttemptsMap[a.id] || [];
        const hasAM = addrAttempts.some(att => att.has_am);
        const hasPM = addrAttempts.some(att => att.has_pm);
        const hasWeekend = addrAttempts.some(att => att.has_weekend);
        if (hasAM && hasPM && hasWeekend) {
          const lastAttempt = addrAttempts
            .filter(att => att.attempt_time)
            .sort((x, y) => new Date(y.attempt_time) - new Date(x.attempt_time))[0];
          if (lastAttempt?.attempt_time) {
            const completionDate = new Date(lastAttempt.attempt_time);
            if (completionDate >= periodStart && completionDate < turnInCutoff) {
              served.push(a);
            }
          }
        }
      }
    });
    
    return { pendingPayouts: served, pendingRTOs: rtos };
  }, [addresses, addressAttemptsMap, previousTurnInDate, payrollHistory]);

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
      <Header
        user={user}
        unreadCount={notifications.length}
        actionButton={
          <button
            onClick={() => savePayrollRecord()}
            className="p-2 bg-white/20 hover:bg-white/30 rounded-lg transition-colors"
            title="Save payroll record"
          >
            <Save className="w-5 h-5 text-white" />
          </button>
        }
      />
      
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
              <div className="flex flex-col justify-end">
                <label className="text-xs text-blue-600 mb-1 block">Documentation</label>
                <button
                  onClick={handleTurnIn}
                  className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-3 rounded-lg text-sm flex items-center justify-center gap-2 transition-colors"
                >
                  <ArrowRight className="w-4 h-4" />
                  Turn In
                </button>
              </div>
            </div>

            <div className="text-sm text-blue-700 bg-blue-100 rounded-lg px-3 py-2">
              <span className="font-medium">Current Period:</span> {format(currentPeriod.start, 'MMM d')} → {format(currentPeriod.end, 'MMM d, yyyy')}
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

            {/* RTO Addresses - Current Period (will appear on NEXT paycheck) */}
            {rtoCurrentPeriod.length > 0 && (
              <div className="mt-6">
                <div className="flex items-center justify-between mb-3">
                  <h2 className="text-lg font-semibold text-red-700 flex items-center gap-2">
                    <RotateCcw className="w-5 h-5" />
                    Returned to Office
                  </h2>
                  <span className="text-xs bg-red-100 text-red-600 px-2 py-1 rounded-full font-medium">
                    On {format(nextPaycheckDate, 'MMM d')} paycheck
                  </span>
                </div>
                <p className="text-xs text-red-500 mb-3">
                  These addresses will be mailed in and appear on your {format(nextPaycheckDate, 'EEEE, MMM d')} paycheck
                </p>
                
                <div className="space-y-2">
                  {rtoCurrentPeriod.map((address) => (
                    <div
                      key={address.id}
                      className="bg-red-50 border-2 border-red-200 rounded-xl p-4"
                    >
                      <div className="flex justify-between items-start">
                        <div className="flex-1">
                          <p className="font-medium text-gray-900 text-sm">
                            {address.normalized_address || address.legal_address}
                          </p>
                          {address.defendant_name && (
                            <p className="text-xs text-gray-600 mt-0.5">{address.defendant_name}</p>
                          )}
                          <p className="text-xs text-gray-500 mt-1">
                            RTO'd {address.rto_at && format(new Date(address.rto_at), 'MMM d, h:mm a')}
                          </p>
                          {address.rto_reason && (
                            <p className="text-xs text-red-500 mt-0.5 italic">"{address.rto_reason}"</p>
                          )}
                        </div>
                        <div className="text-right">
                          <p className="font-semibold text-red-600">
                            ${calculateCorrectPayRate(address.serve_type).toFixed(2)}
                          </p>
                          <span className="text-xs px-2 py-0.5 rounded-full bg-red-100 text-red-700 font-bold">
                            RTO
                          </span>
                        </div>
                      </div>
                    </div>
                  ))}
                  <div className="bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-center">
                    <p className="text-xs text-red-600">
                      RTO Total: <span className="font-bold">${rtoCurrentPeriod.reduce((sum, a) => sum + calculateCorrectPayRate(a.serve_type), 0).toFixed(2)}</span> — not included in totals above
                    </p>
                  </div>
                </div>
              </div>
            )}
          </>
        )}

        {/* Payroll History */}
        {payrollHistory.length > 0 && (
          <div className="mt-8">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-gray-800 flex items-center gap-2">
                <FileTextIcon className="w-5 h-5" />
                Saved Records
              </h2>
              <span className="text-xs text-gray-500">{payrollHistory.length} record{payrollHistory.length !== 1 ? 's' : ''}</span>
            </div>

            <div className="space-y-2">
              {payrollHistory.map((record) => (
                <div
                  key={record.id}
                  onClick={() => navigate(createPageUrl(`PayrollRecordDetail?id=${record.id}`))}
                  className="bg-white border border-gray-200 rounded-xl p-4 flex items-center justify-between active:bg-gray-50 cursor-pointer"
                >
                  <div>
                    <p className="text-sm font-semibold text-gray-900">
                      {record.period_start && format(new Date(record.period_start), 'MMM d')} — {record.period_end && format(new Date(record.period_end), 'MMM d, yyyy')}
                    </p>
                    <p className="text-xs text-gray-500 mt-0.5">
                      Saved {record.created_at && format(new Date(record.created_at), 'MMM d, h:mm a')} · {record.address_count} item{record.address_count !== 1 ? 's' : ''}
                    </p>
                    <div className="flex gap-3 mt-1">
                      <span className="text-xs text-green-600">Instant: ${record.instant_total?.toFixed(2)}</span>
                      <span className="text-xs text-orange-600">Next: ${record.pending_total?.toFixed(2)}</span>
                      {record.rto_total > 0 && <span className="text-xs text-red-600">RTO: ${record.rto_total?.toFixed(2)}</span>}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <p className="text-lg font-bold text-gray-900">${record.total_amount?.toFixed(2)}</p>
                    <ChevronRight className="w-5 h-5 text-gray-400" />
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </main>

      <BottomNav currentPage="WorkerRoutes" />
    </div>
  );
}