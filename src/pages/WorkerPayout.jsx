import React, { useState, useMemo, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import { format } from 'date-fns';
import Header from '../components/layout/Header';
import BottomNav from '../components/layout/BottomNav';
import { Loader2, DollarSign, Clock, Calendar, RotateCcw, Save, ArrowRight, ChevronRight, FileText as FileTextIcon, Undo2 } from 'lucide-react';
import { toast } from 'sonner';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

// ─── Brand colors ────────────────────────────────────────────────────────────
const C = {
  bg: 'linear-gradient(to bottom, #0F0B10, #1A141D)',
  card: '#1c1b1d',
  cardElevated: '#201f21',
  cardHighest: '#363436',
  textPrimary: '#e6e1e4',
  textSecondary: '#d0c3cb',
  textMuted: '#8a7f87',
  accentGold: '#e9c349',
  accentPlum: '#e5b9e1',
  containerPlum: '#502f50',
  rto: '#c97070',
  border: '#363436',
  nav: '#0F0B10',
};

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

function getDaysWithDates() {
  const today = new Date();
  const currentDay = today.getDay();
  return DAY_NAMES.map((name, dayIndex) => {
    let daysUntil = (dayIndex - currentDay + 7) % 7;
    if (daysUntil === 0) daysUntil = 7;
    const nextDate = new Date(today);
    nextDate.setDate(today.getDate() + daysUntil);
    return { value: String(dayIndex), label: `${name} ${format(nextDate, 'M/d')}` };
  });
}

function calcPay(serveType) {
  if (serveType === 'posting') return 10;
  if (serveType === 'serve' || serveType === 'garnishment') return 24;
  return 0;
}

// ─── Address card ─────────────────────────────────────────────────────────────
function AddressCard({ address, accentColor, badge, onUndo, showUndo }) {
  return (
    <div style={{
      background: C.card,
      border: `1px solid ${C.border}`,
      borderLeft: `3px solid ${accentColor}`,
      borderRadius: 12,
      padding: '12px 14px',
      marginBottom: 8,
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div style={{ flex: 1, marginRight: 8 }}>
          <p style={{ color: C.textPrimary, fontSize: 13, fontWeight: 600, marginBottom: 2 }}>
            {address.normalized_address || address.legal_address}
          </p>
          {address.defendant_name && (
            <p style={{ color: C.textMuted, fontSize: 11, marginBottom: 2 }}>{address.defendant_name}</p>
          )}
          {address.served_at && (
            <p style={{ color: C.textMuted, fontSize: 11 }}>
              Served {format(new Date(address.served_at), 'MMM d, h:mm a')}
            </p>
          )}
          {address.rto_at && (
            <p style={{ color: C.textMuted, fontSize: 11 }}>
              RTO'd {format(new Date(address.rto_at), 'MMM d, h:mm a')}
            </p>
          )}
          {address.rto_reason && (
            <p style={{ color: C.rto, fontSize: 11, fontStyle: 'italic', marginTop: 2 }}>"{address.rto_reason}"</p>
          )}
        </div>
        <div style={{ textAlign: 'right', flexShrink: 0 }}>
          <p style={{ color: accentColor, fontWeight: 700, fontSize: 15 }}>
            ${calcPay(address.serve_type).toFixed(2)}
          </p>
          {badge && (
            <span style={{
              fontSize: 9, fontWeight: 700,
              background: accentColor + '22',
              color: accentColor,
              border: `1px solid ${accentColor}`,
              borderRadius: 4,
              padding: '2px 5px',
              display: 'inline-block',
              marginTop: 2,
            }}>
              {badge}
            </span>
          )}
          <span style={{
            fontSize: 9,
            color: C.textMuted,
            display: 'block',
            textTransform: 'capitalize',
            marginTop: 2,
          }}>{address.serve_type}</span>
        </div>
      </div>
      {showUndo && (
        <button
          onClick={() => onUndo(address)}
          style={{
            marginTop: 10,
            width: '100%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 6,
            padding: '8px 12px',
            background: 'transparent',
            border: `1px solid ${C.textMuted}`,
            borderRadius: 8,
            color: C.textSecondary,
            fontSize: 12,
            fontWeight: 600,
            cursor: 'pointer',
          }}
        >
          <Undo2 size={13} />
          Undo RTO — Return to Route
        </button>
      )}
    </div>
  );
}

// ─── Snapshot address card (from PayrollRecord JSON) ──────────────────────────
function SnapshotCard({ item }) {
  const isRTO = item.bucket === 'rto';
  const accentColor = isRTO ? C.rto : C.accentPlum;
  const badge = isRTO ? 'RTO' : 'Attempt';
  return (
    <div style={{
      background: C.card,
      border: `1px solid ${C.border}`,
      borderLeft: `3px solid ${accentColor}`,
      borderRadius: 12,
      padding: '12px 14px',
      marginBottom: 8,
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'flex-start',
    }}>
      <div style={{ flex: 1, marginRight: 8 }}>
        <p style={{ color: C.textPrimary, fontSize: 13, fontWeight: 600, marginBottom: 2 }}>
          {item.address}
        </p>
        {item.defendant && (
          <p style={{ color: C.textMuted, fontSize: 11, marginBottom: 2 }}>{item.defendant}</p>
        )}
        {item.served_at && (
          <p style={{ color: C.textMuted, fontSize: 11 }}>
            Served {format(new Date(item.served_at), 'MMM d, h:mm a')}
          </p>
        )}
        {item.rto_at && (
          <p style={{ color: C.textMuted, fontSize: 11 }}>
            RTO'd {format(new Date(item.rto_at), 'MMM d, h:mm a')}
          </p>
        )}
        {item.rto_reason && (
          <p style={{ color: C.rto, fontSize: 11, fontStyle: 'italic', marginTop: 2 }}>"{item.rto_reason}"</p>
        )}
      </div>
      <div style={{ textAlign: 'right', flexShrink: 0 }}>
        <p style={{ color: accentColor, fontWeight: 700, fontSize: 15 }}>
          ${(item.amount || 0).toFixed(2)}
        </p>
        <span style={{
          fontSize: 9, fontWeight: 700,
          background: accentColor + '22',
          color: accentColor,
          border: `1px solid ${accentColor}`,
          borderRadius: 4,
          padding: '2px 5px',
          display: 'inline-block',
          marginTop: 2,
        }}>{badge}</span>
        <span style={{
          fontSize: 9, color: C.textMuted,
          display: 'block', textTransform: 'capitalize', marginTop: 2,
        }}>{item.serve_type}</span>
      </div>
    </div>
  );
}

// ─── Main component ────────────────────────────────────────────────────────────
export default function WorkerPayout() {
  const navigate = useNavigate();
  const [selectedDay, setSelectedDay] = useState(3);
  const [previousTurnInDate, setPreviousTurnInDate] = useState(null);
  const [priorTurnInDate, setPriorTurnInDate] = useState(null);
  const [activeTab, setActiveTab] = useState('served');
  const queryClient = useQueryClient();

  const { data: user } = useQuery({
    queryKey: ['currentUser'],
    queryFn: () => base44.auth.me()
  });

  const { data: userSettings } = useQuery({
    queryKey: ['userSettings', user?.id],
    queryFn: async () => {
      if (!user?.id) return null;
      const settings = await base44.entities.UserSettings.filter({ user_id: user.id });
      return settings[0] || null;
    },
    enabled: !!user?.id
  });

  useEffect(() => {
    if (userSettings) {
      if (userSettings.payroll_turn_in_day !== undefined && userSettings.payroll_turn_in_day !== null) {
        setSelectedDay(userSettings.payroll_turn_in_day);
      }
      if (userSettings.previous_turn_in_date) setPreviousTurnInDate(new Date(userSettings.previous_turn_in_date));
      if (userSettings.prior_turn_in_date) setPriorTurnInDate(new Date(userSettings.prior_turn_in_date));
    }
  }, [userSettings]);

  const saveSettingsMutation = useMutation({
    mutationFn: async ({ day }) => {
      if (!user?.id) return;
      if (userSettings?.id) {
        await base44.entities.UserSettings.update(userSettings.id, { payroll_turn_in_day: day });
      } else {
        await base44.entities.UserSettings.create({ user_id: user.id, payroll_turn_in_day: day });
      }
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['userSettings', user?.id] }); }
  });

  const handleDayChange = (value) => {
    const day = parseInt(value);
    setSelectedDay(day);
    saveSettingsMutation.mutate({ day });
  };

  const { data: routes = [] } = useQuery({
    queryKey: ['workerRoutes', user?.id],
    queryFn: async () => {
      if (!user?.id) return [];
      // Include ALL routes (even archived/completed) to ensure payroll history shows correctly
      const allRoutes = await base44.entities.Route.filter({ worker_id: user.id });
      return allRoutes.filter(r => !r.deleted_at);
    },
    enabled: !!user?.id
  });

  const { data: addresses = [], isLoading: addressesLoading, refetch: refetchAddresses } = useQuery({
    queryKey: ['allWorkerAddresses', user?.id, routes.map(r=>r.id).join(',')],
    queryFn: async () => {
      if (!user?.id) return [];
      // Fetch by route_ids (all routes, including completed/archived)
      const routeIds = routes.map(r => r.id);
      if (routeIds.length === 0) return [];
      const all = await base44.entities.Address.filter({ deleted_at: null });
      return all.filter(a => routeIds.includes(a.route_id));
    },
    enabled: !!user?.id && routes.length > 0,
    staleTime: 30 * 1000 // Become stale after 30 seconds
  });

  // Refetch on page visibility change
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (!document.hidden) {
        refetchAddresses();
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [refetchAddresses]);

  const { data: attempts = [] } = useQuery({
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

  // Current period boundaries
  const currentPeriod = useMemo(() => {
    const now = new Date();
    const currentDayOfWeek = now.getDay();
    let daysBack = (currentDayOfWeek - selectedDay + 7) % 7;
    if (daysBack === 0) daysBack = 7;
    const start = new Date(now);
    start.setDate(start.getDate() - daysBack);
    start.setHours(0, 0, 0, 0);
    const end = new Date(start);
    end.setDate(end.getDate() + 7);
    return { start, end };
  }, [selectedDay]);

  const addressAttemptsMap = useMemo(() => {
    const map = {};
    attempts.forEach(att => {
      if (!map[att.address_id]) map[att.address_id] = [];
      map[att.address_id].push(att);
    });
    return map;
  }, [attempts]);

  // instantPayouts — served after last turn-in, not yet in a payroll record
  const instantPayouts = useMemo(() => {
    return addresses.filter(a => {
      if (!a.served || !a.served_at) return false;
      if (a.status === 'returned') return false;
      if (!['serve', 'posting', 'garnishment'].includes(a.serve_type)) return false;
      if (a.payroll_record_id && a.payroll_record_id !== '') return false;
      // Date boundary: ignore anything served before/on the last turn-in (handles partial stamping failures)
      if (previousTurnInDate && new Date(a.served_at) <= previousTurnInDate) return false;
      return true;
    }).sort((a, b) => new Date(b.served_at) - new Date(a.served_at));
  }, [addresses, previousTurnInDate]);

  // ── currentRTOs — RTOd after last turn-in, not yet in a payroll record ──
  const currentRTOs = useMemo(() => {
    return addresses.filter(a => {
      if (a.status !== 'returned') return false;
      if (!['serve', 'posting', 'garnishment'].includes(a.serve_type)) return false;
      if (a.payroll_record_id) return false;
      // Date boundary: ignore RTOs that happened before/on the last turn-in
      if (previousTurnInDate && a.rto_at && new Date(a.rto_at) <= previousTurnInDate) return false;
      return true;
    }).sort((a, b) => new Date(b.rto_at) - new Date(a.rto_at));
  }, [addresses, previousTurnInDate]);

  // ── Mailed/RTO tabs: read from snapshot, fall back to payroll_record_id match
  const { pendingPayouts, pendingRTOs, lastTurnInDate } = useMemo(() => {
    const lastRecord = payrollHistory[0];
    const turnInDate = lastRecord?.turn_in_date ? new Date(lastRecord.turn_in_date) : null;

    // Try snapshot first
    let snapshot = [];
    if (lastRecord?.snapshot_data) {
      try { snapshot = JSON.parse(lastRecord.snapshot_data); } catch { snapshot = []; }
    }
    const snapshotPending = snapshot.filter(a => a.bucket === 'pending' && a.serve_type !== 'posting').sort((a, b) => new Date(b.served_at) - new Date(a.served_at));
    const snapshotRTO = snapshot.filter(a => a.bucket === 'rto' && a.serve_type !== 'posting').sort((a, b) => new Date(b.rto_at) - new Date(a.rto_at));
    if (snapshotPending.length > 0 || snapshotRTO.length > 0) {
      return { pendingPayouts: snapshotPending, pendingRTOs: snapshotRTO, lastTurnInDate: turnInDate };
    }

    // Fallback: use previousTurnInDate from userSettings if no record found
    const cutoff = turnInDate || previousTurnInDate;
    if (!cutoff) return { pendingPayouts: [], pendingRTOs: [], lastTurnInDate: null };

    // If we have a record, try payroll_record_id match first
    const stamped = lastRecord?.id ? addresses.filter(a => a.payroll_record_id === lastRecord.id) : [];

    // Lower bound: use period_start from the payroll record
    const periodStart = lastRecord?.period_start ? new Date(lastRecord.period_start) : new Date(cutoff.getTime() - 7 * 24 * 60 * 60 * 1000);

    // If stamping worked, use those; otherwise fall back to date-range
    const candidates = stamped.length > 0 ? stamped : addresses.filter(a => {
      const date = new Date(a.served_at || a.rto_at || 0);
      return date >= periodStart && date <= cutoff;
    });

    const liveMailed = candidates
      .filter(a => a.served && a.status !== 'returned' && a.serve_type !== 'posting')
      .map(a => ({
        id: a.id,
        address: a.normalized_address || a.legal_address,
        defendant: a.defendant_name || '',
        serve_type: a.serve_type,
        amount: calcPay(a.serve_type),
        served_at: a.served_at,
        bucket: 'pending'
      }))
      .sort((a, b) => new Date(b.served_at) - new Date(a.served_at));

    const liveRTO = candidates
      .filter(a => a.status === 'returned')
      .map(a => ({
        id: a.id,
        address: a.normalized_address || a.legal_address,
        defendant: a.defendant_name || '',
        serve_type: a.serve_type,
        amount: calcPay(a.serve_type),
        rto_at: a.rto_at,
        rto_reason: a.rto_reason || '',
        bucket: 'rto'
      }))
      .sort((a, b) => new Date(b.rto_at) - new Date(a.rto_at));

    return { pendingPayouts: liveMailed, pendingRTOs: liveRTO, lastTurnInDate: cutoff };
  }, [payrollHistory, addresses, previousTurnInDate]);

  // Mailed tab = served addresses from snapshot only (RTOs shown in their own tab)
  const mailedItems = pendingPayouts;

  const instantTotal = instantPayouts.reduce((sum, a) => sum + calcPay(a.serve_type), 0);
  // pendingPayouts/pendingRTOs are snapshot objects with pre-computed `amount` field
  const pendingTotal = pendingPayouts.reduce((sum, a) => sum + (a.amount || 0), 0);
  const pendingRTOTotal = pendingRTOs.reduce((sum, a) => sum + (a.amount || 0), 0);
  const nextCheckTotal = pendingTotal + pendingRTOTotal;
  const nextCheckCount = mailedItems.length;
  const nextCheckRTOCount = pendingRTOs.length;

  const isLoading = addressesLoading;

  // ─── Save Payroll Record + stamp payroll_record_id ──────────────────────────
  const savePayrollRecord = async (turnInDate = null, skipDuplicateCheck = false) => {
    if (!user?.id) return;

    if (!skipDuplicateCheck) {
      const existingRecord = payrollHistory.find(r => {
        if (!r.period_start || !r.period_end) return false;
        return (
          new Date(r.period_start).toDateString() === currentPeriod.start.toDateString() &&
          new Date(r.period_end).toDateString() === currentPeriod.end.toDateString()
        );
      });
      if (existingRecord) {
        const confirmed = window.confirm(
          `You already have a saved pay stub for this period.\n\nOverride with updated data?`
        );
        if (!confirmed) return;
        await base44.entities.PayrollRecord.delete(existingRecord.id);
      }
    }

    const now = new Date();
    const rtoTotal = currentRTOs.reduce((sum, a) => sum + calcPay(a.serve_type), 0);

    // Only include serve/garnishment in mailed snapshot — postings are already instant pay
    const mailedPayouts = instantPayouts.filter(a => a.serve_type !== 'posting');

    const snapshotAddresses = [
      ...mailedPayouts.map(a => ({
        id: a.id,
        address: a.normalized_address || a.legal_address,
        defendant: a.defendant_name || '',
        serve_type: a.serve_type,
        amount: calcPay(a.serve_type),
        served_at: a.served_at,
        rto_at: null,
        bucket: 'pending'
      })),
      ...currentRTOs.map(a => ({
        id: a.id,
        address: a.normalized_address || a.legal_address,
        defendant: a.defendant_name || '',
        serve_type: a.serve_type,
        amount: calcPay(a.serve_type),
        served_at: null,
        rto_at: a.rto_at,
        rto_reason: a.rto_reason || '',
        bucket: 'rto'
      }))
    ];

    const newRecord = await base44.entities.PayrollRecord.create({
      user_id: user.id,
      company_id: user.company_id || '',
      period_start: currentPeriod.start.toISOString(),
      period_end: currentPeriod.end.toISOString(),
      turn_in_date: (turnInDate || now).toISOString(),
      instant_total: instantTotal,
      pending_total: instantTotal,
      rto_total: rtoTotal,
      total_amount: instantTotal + rtoTotal,
      address_count: snapshotAddresses.length,
      snapshot_data: JSON.stringify(snapshotAddresses),
      status: 'saved',
      notes: '',
      created_at: now.toISOString()
    });

    // Stamp payroll_record_id on every included address (sequential to avoid rate limits)
    if (newRecord?.id) {
      const addressesToStamp = [
        ...instantPayouts.map(a => a.id), // stamp all including postings
        ...currentRTOs.map(a => a.id)
      ];
      for (const addressId of addressesToStamp) {
        await base44.entities.Address.update(addressId, { payroll_record_id: newRecord.id });
        await new Promise(r => setTimeout(r, 300)); // throttle to avoid rate limit
      }
    }

    queryClient.invalidateQueries({ queryKey: ['allWorkerAddresses', user?.id] });
    queryClient.invalidateQueries({ queryKey: ['payrollHistory', user?.id] });
    refetchHistory();
    toast.success('Turned in successfully');
  };

  // ─── Handle Turn In ───────────────────────────────────────────────────────────
  const handleTurnIn = async () => {
    const existingRecord = payrollHistory.find(r => {
      if (!r.period_start || !r.period_end) return false;
      return (
        new Date(r.period_start).toDateString() === currentPeriod.start.toDateString() &&
        new Date(r.period_end).toDateString() === currentPeriod.end.toDateString()
      );
    });

    if (existingRecord) {
      const confirmed = window.confirm(
        `You already have a saved pay stub for this period (${format(currentPeriod.start, 'MMM d')} – ${format(currentPeriod.end, 'MMM d')}).\n\nWould you like to override it with updated data?`
      );
      if (!confirmed) return;
      await base44.entities.PayrollRecord.delete(existingRecord.id);
    }

    const now = new Date();
    const oldPrevious = previousTurnInDate ? previousTurnInDate.toISOString() : null;
    setPriorTurnInDate(previousTurnInDate);
    setPreviousTurnInDate(now);

    if (userSettings?.id) {
      await base44.entities.UserSettings.update(userSettings.id, {
        previous_turn_in_date: now.toISOString(),
        prior_turn_in_date: oldPrevious
      });
    } else if (user?.id) {
      await base44.entities.UserSettings.create({
        user_id: user.id,
        payroll_turn_in_day: selectedDay,
        previous_turn_in_date: now.toISOString(),
        prior_turn_in_date: oldPrevious
      });
    }
    queryClient.invalidateQueries({ queryKey: ['userSettings', user?.id] });
    await savePayrollRecord(now, true);
  };

  // ─── Undo RTO ─────────────────────────────────────────────────────────────────
  const handleUndoRTO = async (address) => {
    const confirmed = window.confirm(
      `Undo RTO for this address?\n\n${address.normalized_address || address.legal_address}\n\nThis will move it back to its route as an active address.`
    );
    if (!confirmed) return;

    const addrAttempts = addressAttemptsMap[address.id] || [];
    const newStatus = addrAttempts.length > 0 ? 'attempted' : 'pending';

    await base44.entities.Address.update(address.id, {
      status: newStatus,
      served: false,
      served_at: null,
      receipt_status: 'pending',
      rto_at: null,
      rto_reason: null,
      rto_by: null
    });

    if (address.route_id) {
      const routeArr = await base44.entities.Route.filter({ id: address.route_id });
      const route = routeArr[0];
      if (route) {
        const routeAddresses = await base44.entities.Address.filter({ route_id: address.route_id, deleted_at: null });
        const doneCount = routeAddresses.filter(a =>
          a.id === address.id ? false : (a.served || a.status === 'returned')
        ).length;
        const updates = { served_count: doneCount };
        if (route.status === 'completed' || route.status === 'archived') {
          updates.status = 'active';
          updates.completed_at = null;
        }
        await base44.entities.Route.update(address.route_id, updates);
      }
    }

    await base44.entities.AuditLog.create({
      company_id: user?.company_id || address.company_id,
      action_type: 'address_updated',
      actor_id: user?.id,
      actor_role: user?.role || 'server',
      target_type: 'address',
      target_id: address.id,
      details: { action: 'undo_rto', route_id: address.route_id, restored_status: newStatus },
      timestamp: new Date().toISOString()
    });

    queryClient.invalidateQueries({ queryKey: ['allWorkerAddresses'] });
    queryClient.invalidateQueries({ queryKey: ['workerAddresses'] });
    queryClient.invalidateQueries({ queryKey: ['workerRoutes'] });
    queryClient.invalidateQueries({ queryKey: ['routeAddresses', address.route_id] });
    queryClient.invalidateQueries({ queryKey: ['route', address.route_id] });
    toast.success('RTO undone — address returned to route');
  };

  // After a turn-in, RTO tab merges snapshot RTOs with new live RTOs marked after turn-in
  const rtoTabItems = pendingRTOs.length > 0 ? [
    ...pendingRTOs,
    ...currentRTOs
      .filter(a => !pendingRTOs.find(p => p.id === a.id))
      .map(a => ({
        id: a.id,
        address: a.normalized_address || a.legal_address,
        defendant: a.defendant_name || '',
        serve_type: a.serve_type,
        amount: calcPay(a.serve_type),
        rto_at: a.rto_at,
        rto_reason: a.rto_reason || '',
        bucket: 'rto'
      }))
  ].sort((a, b) => new Date(b.rto_at) - new Date(a.rto_at)) : null; // null = use live currentRTOs
  const rtoTabCount = rtoTabItems ? rtoTabItems.length : currentRTOs.length;

  // ─── Tab definitions ─────────────────────────────────────────────────────────
  const tabs = [
    { id: 'served', label: 'Served', count: instantPayouts.length },
    { id: 'mailed', label: 'Mailed', count: pendingPayouts.length },
    { id: 'rto',    label: 'RTO',    count: rtoTabCount },
  ];

  return (
    <div style={{ minHeight: '100vh', background: C.bg, paddingBottom: 80 }}>
      <Header
        user={user}
        unreadCount={notifications.length}
        actionButton={
          <button
            onClick={() => savePayrollRecord()}
            style={{ padding: 8, background: 'rgba(255,255,255,0.15)', borderRadius: 8, border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center' }}
            title="Save payroll record"
          >
            <Save size={18} color="#fff" />
          </button>
        }
      />

      <main style={{ padding: '16px 16px 0', maxWidth: 480, margin: '0 auto' }}>
        <h1 style={{ color: C.textPrimary, fontSize: 22, fontWeight: 700, marginBottom: 16 }}>Earnings &amp; Turn-in</h1>

        {/* Pay Period card */}
        <div style={{
          background: C.cardElevated,
          border: `1px solid ${C.border}`,
          borderRadius: 14,
          padding: '14px 16px',
          marginBottom: 16,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 12 }}>
            <Calendar size={16} color={C.accentGold} />
            <span style={{ color: C.textSecondary, fontWeight: 600, fontSize: 13 }}>Pay Period</span>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
            <div>
              <label style={{ color: C.textMuted, fontSize: 10, fontWeight: 600, display: 'block', marginBottom: 4 }}>MAIL-IN DAY</label>
              <Select value={String(selectedDay)} onValueChange={handleDayChange}>
                <SelectTrigger style={{ background: C.card, border: `1px solid ${C.border}`, color: C.textPrimary, fontSize: 13 }}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {getDaysWithDates().map(day => (
                    <SelectItem key={day.value} value={day.value}>{day.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'flex-end' }}>
              <button
                onClick={handleTurnIn}
                style={{
                  width: '100%',
                  background: C.accentGold,
                  color: C.bg.replace('linear-gradient(to bottom, ', '').split(',')[0],
                  fontWeight: 700,
                  fontSize: 14,
                  padding: '10px 12px',
                  borderRadius: 10,
                  border: 'none',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 6,
                }}
              >
                <ArrowRight size={16} />
                Turn In: ${(instantTotal + nextCheckTotal).toFixed(2)}
              </button>
            </div>
          </div>

          <div style={{
            background: C.card,
            border: `1px solid ${C.border}`,
            borderRadius: 8,
            padding: '8px 12px',
            fontSize: 12,
          }}>
            <span style={{ color: C.textMuted }}>This Period: </span>
            <span style={{ color: C.accentGold, fontWeight: 600 }}>
              {format(currentPeriod.start, 'MMM d')} → {format(currentPeriod.end, 'MMM d, yyyy')}
            </span>
          </div>
        </div>

        {/* Summary cards */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 16 }}>
          {/* This Check */}
          <div style={{ background: C.cardElevated, border: `1px solid ${C.border}`, borderRadius: 14, padding: '12px 14px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 4 }}>
            <DollarSign size={13} color={C.accentGold} />
            <span style={{ color: C.accentGold, fontSize: 11, fontWeight: 600 }}>Served/Posted</span>
            </div>
            <p style={{ color: C.accentGold, fontSize: 20, fontWeight: 700, marginBottom: 2 }}>
              ${instantTotal.toFixed(2)}
            </p>
            <p style={{ color: C.textMuted, fontSize: 11 }}>
              {instantPayouts.length} item{instantPayouts.length !== 1 ? 's' : ''} served/posted
            </p>
          </div>

          {/* Next Check */}
          <div style={{ background: C.cardElevated, border: `1px solid ${C.border}`, borderRadius: 14, padding: '12px 14px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 4 }}>
            <Clock size={13} color={C.accentPlum} />
            <span style={{ color: C.accentPlum, fontSize: 11, fontWeight: 600 }}>Mailed in + RTO</span>
            </div>
            <p style={{ color: C.accentPlum, fontSize: 20, fontWeight: 700, marginBottom: 2 }}>
              ${nextCheckTotal.toFixed(2)}
            </p>
            <p style={{ color: C.textMuted, fontSize: 11 }}>
              {lastTurnInDate
                ? `${nextCheckCount - nextCheckRTOCount} attempt${nextCheckCount - nextCheckRTOCount !== 1 ? 's' : ''}${nextCheckRTOCount > 0 ? ` · ${nextCheckRTOCount} RTO` : ''}`
                : 'Mail in to update'
              }
            </p>
          </div>
        </div>

        {/* Tabs */}
        <div style={{
          background: C.card,
          border: `1px solid ${C.border}`,
          borderBottom: `1px solid ${C.border}`,
          borderRadius: '12px 12px 0 0',
          display: 'flex',
        }}>
          {tabs.map(tab => {
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                style={{
                  flex: 1,
                  padding: '11px 8px',
                  background: isActive ? C.containerPlum : 'transparent',
                  border: 'none',
                  borderBottom: isActive ? `2px solid ${C.accentPlum}` : '2px solid transparent',
                  color: isActive ? C.accentPlum : C.textMuted,
                  fontSize: 12,
                  fontWeight: 700,
                  cursor: 'pointer',
                  borderRadius: isActive ? '10px 10px 0 0' : '10px 10px 0 0',
                  transition: 'all 0.15s',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 5,
                }}
              >
                {tab.label}
                {tab.count > 0 && (
                  <span style={{
                    background: isActive ? C.accentPlum : C.textMuted,
                    color: isActive ? '#0F0B10' : '#0F0B10',
                    fontSize: 9,
                    fontWeight: 700,
                    borderRadius: '99px',
                    padding: '1px 5px',
                    minWidth: 16,
                    textAlign: 'center',
                  }}>{tab.count}</span>
                )}
              </button>
            );
          })}
        </div>

        {/* Tab content */}
        <div style={{
          background: C.card,
          border: `1px solid ${C.border}`,
          borderTop: 'none',
          borderRadius: '0 0 12px 12px',
          padding: '14px 12px',
          marginBottom: 20,
        }}>
          {isLoading ? (
            <div style={{ display: 'flex', justifyContent: 'center', padding: '40px 0' }}>
              <Loader2 size={28} color={C.accentPlum} className="animate-spin" />
            </div>
          ) : (
            <>
              {/* ── SERVED TAB ── */}
              {activeTab === 'served' && (
                <>
                  <p style={{ color: C.textMuted, fontSize: 11, marginBottom: 12 }}>
                    These were completed in the app and are included on this check.
                  </p>
                  {instantPayouts.length === 0 ? (
                    <div style={{
                      background: C.card,
                      border: `1px dashed ${C.border}`,
                      borderRadius: 10,
                      padding: '28px 16px',
                      textAlign: 'center',
                    }}>
                      <DollarSign size={28} color={C.textMuted} style={{ margin: '0 auto 8px' }} />
                      <p style={{ color: C.textMuted, fontSize: 13 }}>No direct serves yet this period</p>
                    </div>
                  ) : (
                    instantPayouts.map(a => (
                      <AddressCard key={a.id} address={a} accentColor={C.accentGold} badge={null} />
                    ))
                  )}
                </>
              )}

              {/* ── MAILED TAB ── */}
              {activeTab === 'mailed' && (
                <>
                  <p style={{ color: C.textMuted, fontSize: 11, marginBottom: 12 }}>
                    {lastTurnInDate
                      ? `Turned in ${format(lastTurnInDate, 'MMM d, h:mm a')}. These arrive on your next check.`
                      : 'Documents you mail in will appear here after your first Turn In.'}
                  </p>
                  {mailedItems.length === 0 ? (
                    <div style={{
                      background: C.card,
                      border: `1px dashed ${C.border}`,
                      borderRadius: 10,
                      padding: '28px 16px',
                      textAlign: 'center',
                    }}>
                      <Clock size={28} color={C.textMuted} style={{ margin: '0 auto 8px' }} />
                      <p style={{ color: C.textMuted, fontSize: 13 }}>Tap Turn In when you mail your documents</p>
                    </div>
                  ) : (
                    mailedItems.map((item, i) => <SnapshotCard key={i} item={item} />)
                  )}
                </>
              )}

              {/* ── RTO TAB ── */}
              {activeTab === 'rto' && (
                <>
                  <p style={{ color: C.textMuted, fontSize: 11, marginBottom: 12 }}>
                    {rtoTabItems
                      ? `Returned documents from your last turn-in on ${lastTurnInDate ? format(lastTurnInDate, 'MMM d') : 'last period'}.`
                      : 'These will be included when you tap Turn In.'}
                  </p>
                  {rtoTabCount === 0 ? (
                    <div style={{
                      background: C.card,
                      border: `1px dashed ${C.border}`,
                      borderRadius: 10,
                      padding: '28px 16px',
                      textAlign: 'center',
                    }}>
                      <RotateCcw size={28} color={C.textMuted} style={{ margin: '0 auto 8px' }} />
                      <p style={{ color: C.textMuted, fontSize: 13 }}>No returns this period</p>
                    </div>
                  ) : rtoTabItems ? (
                    // Show snapshot RTOs (post-turn-in)
                    rtoTabItems.map((item, i) => <SnapshotCard key={i} item={item} />)
                  ) : (
                    // Show live unstamped RTOs (pre-turn-in)
                    currentRTOs.map(a => (
                      <AddressCard
                        key={a.id}
                        address={a}
                        accentColor={C.rto}
                        badge="RTO"
                        onUndo={handleUndoRTO}
                        showUndo={true}
                      />
                    ))
                  )}
                </>
              )}
            </>
          )}
        </div>

        {/* Pay History */}
        {payrollHistory.length > 0 && (
          <div style={{ marginBottom: 20 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <FileTextIcon size={15} color={C.textSecondary} />
                <span style={{ color: C.textSecondary, fontWeight: 600, fontSize: 14 }}>Pay History</span>
              </div>
              <span style={{ color: C.textMuted, fontSize: 11 }}>
                {payrollHistory.length} record{payrollHistory.length !== 1 ? 's' : ''}
              </span>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {payrollHistory.map(record => (
                <div
                  key={record.id}
                  onClick={() => navigate(createPageUrl(`PayrollRecordDetail?id=${record.id}`))}
                  style={{
                    background: C.card,
                    border: `1px solid ${C.border}`,
                    borderRadius: 12,
                    padding: '12px 14px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    cursor: 'pointer',
                  }}
                >
                  <div>
                    <p style={{ color: C.textPrimary, fontSize: 13, fontWeight: 600 }}>
                      {record.period_start && format(new Date(record.period_start), 'MMM d')} — {record.period_end && format(new Date(record.period_end), 'MMM d, yyyy')}
                    </p>
                    <p style={{ color: C.textMuted, fontSize: 11, marginTop: 2 }}>
                      {record.created_at && format(new Date(record.created_at), 'MMM d, h:mm a')} · {record.address_count} item{record.address_count !== 1 ? 's' : ''}
                    </p>
                    <div style={{ display: 'flex', gap: 10, marginTop: 4 }}>
                      <span style={{ color: C.accentGold, fontSize: 11 }}>Instant: ${record.instant_total?.toFixed(2)}</span>
                      <span style={{ color: C.accentPlum, fontSize: 11 }}>Next: ${record.pending_total?.toFixed(2)}</span>
                      {record.rto_total > 0 && <span style={{ color: C.rto, fontSize: 11 }}>RTO: ${record.rto_total?.toFixed(2)}</span>}
                    </div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <p style={{ color: C.textPrimary, fontSize: 17, fontWeight: 700 }}>
                      ${record.total_amount?.toFixed(2)}
                    </p>
                    <ChevronRight size={18} color={C.textMuted} />
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