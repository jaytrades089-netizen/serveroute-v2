import React, { useState, useMemo, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import { format } from 'date-fns';
import Header from '../components/layout/Header';
import BottomNav from '../components/layout/BottomNav';
import { Loader2, DollarSign, Clock, Calendar, RotateCcw, ArrowRight, ChevronRight, FileText as FileTextIcon, Undo2, Pencil, X } from 'lucide-react';
import { Dialog, DialogContent } from '@/components/ui/dialog';
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
function AddressCard({ address, accentColor, badge, onUndo, showUndo, number }) {
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
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', justifyContent: 'flex-end', marginTop: 2 }}>
            {number && (
              <span style={{ color: C.textMuted, fontSize: '11px', fontWeight: 600 }}>#{number}</span>
            )}
            {badge && (
              <span style={{
                fontSize: 9, fontWeight: 700,
                background: accentColor + '22',
                color: accentColor,
                border: `1px solid ${accentColor}`,
                borderRadius: 4,
                padding: '2px 5px',
                display: 'inline-block',
              }}>
                {badge}
              </span>
            )}
          </div>
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
function SnapshotCard({ item, number }) {
  const isRTO = item.bucket === 'rto';
  const accentColor = isRTO ? C.rto : C.accentPlum;
  const badge = isRTO ? 'RTO' : (item.serve_type === 'serve' || item.serve_type === 'garnishment') ? 'Serve' : item.serve_type === 'posting' ? 'Post' : 'Attempt';
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
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', justifyContent: 'flex-end', marginTop: 2 }}>
          {number && (
            <span style={{ color: C.textMuted, fontSize: '11px', fontWeight: 600 }}>#{number}</span>
          )}
          <span style={{
            fontSize: 9, fontWeight: 700,
            background: accentColor + '22',
            color: accentColor,
            border: `1px solid ${accentColor}`,
            borderRadius: 4,
            padding: '2px 5px',
            display: 'inline-block',
          }}>{badge}</span>
        </div>
        <span style={{
          fontSize: 9, color: C.textMuted,
          display: 'block', textTransform: 'capitalize', marginTop: 2,
        }}>{item.serve_type}</span>
      </div>
    </div>
  );
}

// ─── Adjust Amount Modal ──────────────────────────────────────────────────────
function AdjustAmountModal({ open, onClose, label, currentAmount, onSave }) {
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setAmount(currentAmount.toFixed(2));
      setNote('');
    }
  }, [open, currentAmount]);

  const handleSave = () => {
    const parsed = parseFloat(amount);
    if (isNaN(parsed) || parsed < 0) { return; }
    onSave(parsed, note.trim());
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent
        style={{ background: '#201f21', border: '1px solid #363436', color: '#e6e1e4', maxWidth: 340 }}
        onInteractOutside={(e) => e.preventDefault()}
        onEscapeKeyDown={(e) => e.preventDefault()}
      >
        <div style={{ padding: '4px 0' }}>
          <h3 style={{ fontSize: 15, fontWeight: 700, marginBottom: 12 }}>Adjust {label}</h3>
          <label style={{ fontSize: 10, fontWeight: 600, color: '#8a7f87', display: 'block', marginBottom: 4 }}>AMOUNT</label>
          <div style={{ position: 'relative', marginBottom: 12 }}>
            <span style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: '#8a7f87', fontSize: 16 }}>$</span>
            <input
              type="number"
              inputMode="decimal"
              step="0.01"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              style={{ width: '100%', background: '#1c1b1d', border: '1px solid #363436', borderRadius: 8, padding: '10px 12px 10px 28px', color: '#e6e1e4', fontSize: 18, fontWeight: 700, outline: 'none' }}
            />
          </div>
          <label style={{ fontSize: 10, fontWeight: 600, color: '#8a7f87', display: 'block', marginBottom: 4 }}>REASON (optional)</label>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Why is the amount different?"
            rows={2}
            style={{ width: '100%', background: '#1c1b1d', border: '1px solid #363436', borderRadius: 8, padding: '8px 12px', color: '#e6e1e4', fontSize: 13, resize: 'none', outline: 'none' }}
          />
          <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
            <button onClick={onClose} style={{ flex: 1, padding: '10px', borderRadius: 8, background: 'transparent', border: '1px solid #363436', color: '#8a7f87', fontWeight: 600, fontSize: 13, cursor: 'pointer' }}>Cancel</button>
            <button onClick={handleSave} style={{ flex: 1, padding: '10px', borderRadius: 8, background: 'rgba(233,195,73,0.20)', border: '1px solid rgba(233,195,73,0.50)', color: '#e9c349', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>Save</button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── Main component ────────────────────────────────────────────────────────────
export default function WorkerPayout() {
  const navigate = useNavigate();
  const [selectedDay, setSelectedDay] = useState(3);
  const [activeTab, setActiveTab] = useState('served');
  const [isTurningIn, setIsTurningIn] = useState(false);
  const [servedAdjustment, setServedAdjustment] = useState(null); // { amount, note } or null
  const [mailedAdjustment, setMailedAdjustment] = useState(null);
  const [editingBox, setEditingBox] = useState(null); // 'served' | 'mailed' | null
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
    onSuccess: () => { queryClient.refetchQueries({ queryKey: ['userSettings', user?.id] }); }
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
      const allRoutes = await base44.entities.Route.filter({ worker_id: user.id });
      return allRoutes.filter(r => !r.deleted_at);
    },
    enabled: !!user?.id
  });

  const { data: addresses = [], isLoading: addressesLoading, refetch: refetchAddresses } = useQuery({
    queryKey: ['allWorkerAddresses', user?.id, routes.map(r=>r.id).join(',')],
    queryFn: async () => {
      if (!user?.id) return [];
      const routeIds = routes.map(r => r.id);
      if (routeIds.length === 0) return [];
      const all = await base44.entities.Address.filter({ deleted_at: null });
      return all.filter(a => routeIds.includes(a.route_id));
    },
    enabled: !!user?.id && routes.length > 0,
    staleTime: 30 * 1000
  });

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

  // Set of valid PayrollRecord IDs — used to detect ghost/orphan stamps
  const validRecordIds = useMemo(() => {
    return new Set(payrollHistory.map(r => r.id));
  }, [payrollHistory]);

  // Timestamp of the most recent Turn In press — the boundary between
  // "current period" (Served tab + current RTOs) and "last period" (Mailed + RTO snapshots).
  const lastTurnInAt = useMemo(() => {
    const lastRecord = payrollHistory[0];
    if (!lastRecord?.turn_in_date) return null;
    const d = new Date(lastRecord.turn_in_date);
    return isNaN(d) ? null : d;
  }, [payrollHistory]);

  // An address belongs to the CURRENT period if it is unstamped (or ghost-stamped)
  // AND its completion timestamp is after the last Turn In press.
  // If there's never been a Turn In, everything unstamped is current.
  const isCurrent = (a) => {
    const stamped = a.payroll_record_id && a.payroll_record_id !== '' && validRecordIds.has(a.payroll_record_id);
    if (stamped) return false;
    if (!lastTurnInAt) return true;
    const ts = a.status === 'returned' ? a.rto_at : a.served_at;
    if (!ts) return false;
    return new Date(ts) > lastTurnInAt;
  };

  // Current period boundaries — used only for the display label
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

  // ─── SERVED TAB ─────────────────────────────────────────────────────────────
  // Everything served in the app, current (unstamped OR orphan).
  // Includes serves, postings, and garnishments.
  const instantPayouts = useMemo(() => {
    return addresses.filter(a => {
      if (!a.served || !a.served_at) return false;
      if (a.status === 'returned') return false;
      if (!['serve', 'posting', 'garnishment'].includes(a.serve_type)) return false;
      if (!isCurrent(a)) return false;
      return true;
    }).sort((a, b) => new Date(b.served_at) - new Date(a.served_at));
  }, [addresses, validRecordIds]);

  // ─── CURRENT RTOs ───────────────────────────────────────────────────────────
  const currentRTOs = useMemo(() => {
    return addresses.filter(a => {
      if (a.status !== 'returned') return false;
      if (!isCurrent(a)) return false;
      return true;
    }).sort((a, b) => new Date(b.rto_at || 0) - new Date(a.rto_at || 0));
  }, [addresses, validRecordIds]);

  // ─── MAILED TAB ─────────────────────────────────────────────────────────────
  // Reads the most recent PayrollRecord's snapshot. Only items whose completion
  // timestamp falls inside that record's period_start → period_end window are shown.
  // This filters out polluted snapshots that may contain out-of-period items.
  const { pendingPayouts, pendingRTOs, lastTurnInDate } = useMemo(() => {
    const lastRecord = payrollHistory[0];
    const turnInDate = lastRecord?.turn_in_date ? new Date(lastRecord.turn_in_date) : null;

    let snapshot = [];
    if (lastRecord?.snapshot_data) {
      try { snapshot = JSON.parse(lastRecord.snapshot_data); } catch { snapshot = []; }
    }

    const periodStart = lastRecord?.period_start ? new Date(lastRecord.period_start) : null;
    const periodEnd = lastRecord?.period_end ? new Date(lastRecord.period_end) : null;

    const inPeriod = (dateStr) => {
      if (!periodStart || !periodEnd) return true;
      if (!dateStr) return false;
      const d = new Date(dateStr);
      if (isNaN(d)) return false;
      return d >= periodStart && d <= periodEnd;
    };

    const mailed = snapshot
      .filter(a => (a.bucket === 'served' || a.bucket === 'pending') && inPeriod(a.served_at))
      .sort((a, b) => new Date(b.served_at || 0) - new Date(a.served_at || 0));

    const rtos = snapshot
      .filter(a => a.bucket === 'rto' && inPeriod(a.rto_at))
      .sort((a, b) => new Date(b.rto_at || 0) - new Date(a.rto_at || 0));

    return { pendingPayouts: mailed, pendingRTOs: rtos, lastTurnInDate: turnInDate };
  }, [payrollHistory]);

  const mailedItems = pendingPayouts;

  // ─── TOTALS ─────────────────────────────────────────────────────────────────
  const instantTotal = instantPayouts.reduce((sum, a) => sum + calcPay(a.serve_type), 0);
  const currentRTOsTotal = currentRTOs.reduce((sum, a) => sum + calcPay(a.serve_type), 0);
  const pendingTotal = pendingPayouts.reduce((sum, a) => sum + (a.amount || 0), 0);
  const pendingRTOTotal = pendingRTOs.reduce((sum, a) => sum + (a.amount || 0), 0);
  const mailedTotal = pendingTotal; // last period's mailed paperwork (non-RTO)
  const rtoSummaryTotal = pendingRTOTotal + currentRTOsTotal; // RTO summary combines last-period + current

  // Display totals — use adjusted amounts if set, otherwise computed
  const displayServedTotal = servedAdjustment !== null ? servedAdjustment.amount : instantTotal;
  const displayMailedTotal = mailedAdjustment !== null ? mailedAdjustment.amount : (mailedTotal + pendingRTOTotal);
  const turnInAmount = displayServedTotal + (mailedAdjustment !== null ? mailedAdjustment.amount : (mailedTotal + pendingRTOTotal));

  const isLoading = addressesLoading;

  const handleTurnIn = async () => {
    if (isTurningIn) return;
    if (!user?.id) return;
    if (instantPayouts.length === 0 && currentRTOs.length === 0) {
      toast.error('Nothing to turn in');
      return;
    }

    setIsTurningIn(true);
    try {
      const now = new Date();
      const rtoTotal = currentRTOs.reduce((sum, a) => sum + calcPay(a.serve_type), 0);

      const snapshotAddresses = [
        ...instantPayouts.map(a => ({
          id: a.id,
          address: a.normalized_address || a.legal_address,
          defendant: a.defendant_name || '',
          serve_type: a.serve_type,
          amount: calcPay(a.serve_type),
          served_at: a.served_at,
          rto_at: null,
          bucket: 'served'
        })),
        ...currentRTOs.map(a => ({
          id: a.id,
          address: a.normalized_address || a.legal_address,
          defendant: a.defendant_name || '',
          serve_type: a.serve_type,
          amount: calcPay(a.serve_type),
          rto_at: a.rto_at,
          rto_reason: a.rto_reason || '',
          bucket: 'rto'
        }))
      ];

      // Period starts at last turn-in (or 30 days back if first ever turn-in)
      const periodEnd = now;
      const periodStart = lastTurnInAt || new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

      const newRecord = await base44.entities.PayrollRecord.create({
        user_id: user.id,
        company_id: user.company_id || '',
        period_start: periodStart.toISOString(),
        period_end: periodEnd.toISOString(),
        turn_in_date: now.toISOString(),
        instant_total: displayServedTotal,
        pending_total: mailedTotal,
        mailed_total: mailedTotal,
        prev_rto_total: pendingRTOTotal,
        rto_total: rtoTotal,
        total_amount: turnInAmount,
        served_adjustment: servedAdjustment ? servedAdjustment.amount : null,
        served_adjustment_note: servedAdjustment ? servedAdjustment.note : null,
        mailed_adjustment: mailedAdjustment ? mailedAdjustment.amount : null,
        mailed_adjustment_note: mailedAdjustment ? mailedAdjustment.note : null,
        address_count: snapshotAddresses.length,
        snapshot_data: JSON.stringify(snapshotAddresses),
        status: 'saved',
        notes: '',
        created_at: now.toISOString()
      });

      if (newRecord?.id) {
        const addressesToStamp = [
          ...instantPayouts.map(a => a.id),
          ...currentRTOs.map(a => a.id)
        ];
        const BATCH_SIZE = 10;
        for (let i = 0; i < addressesToStamp.length; i += BATCH_SIZE) {
          const batch = addressesToStamp.slice(i, i + BATCH_SIZE);
          await Promise.all(
            batch.map(addressId =>
              base44.entities.Address.update(addressId, { payroll_record_id: newRecord.id })
                .catch(err => console.error('Failed to stamp address', addressId, err))
            )
          );
        }
      }

      // Reset adjustments after turn-in
      setServedAdjustment(null);
      setMailedAdjustment(null);

      queryClient.refetchQueries({ queryKey: ['allWorkerAddresses', user?.id] });
      queryClient.refetchQueries({ queryKey: ['payrollHistory', user?.id] });
      refetchHistory();
      toast.success(`Turned in ${snapshotAddresses.length} item${snapshotAddresses.length !== 1 ? 's' : ''}`);
    } finally {
      setIsTurningIn(false);
    }
  };

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

    queryClient.refetchQueries({ queryKey: ['allWorkerAddresses'] });
    queryClient.refetchQueries({ queryKey: ['workerAddresses'] });
    queryClient.refetchQueries({ queryKey: ['workerRoutes'] });
    queryClient.refetchQueries({ queryKey: ['routeAddresses', address.route_id] });
    queryClient.refetchQueries({ queryKey: ['route', address.route_id] });
    toast.success('RTO undone — address returned to route');
  };

  const rtoTabCount = pendingRTOs.length;

  const tabs = [
    { id: 'served', label: 'Served', count: instantPayouts.length },
    { id: 'mailed', label: 'Mailed', count: pendingPayouts.length },
    { id: 'rto',    label: 'RTO',    count: rtoTabCount },
  ];

  return (
    <div style={{ minHeight: '100vh', background: 'transparent', paddingBottom: 80 }}>
      <Header user={user} unreadCount={notifications.length} />

      <main style={{ padding: '16px 16px 0', maxWidth: 480, margin: '0 auto' }}>
        <h1 style={{ color: C.textPrimary, fontSize: 22, fontWeight: 700, marginBottom: 16 }}>Earnings &amp; Turn-in</h1>

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
                disabled={isTurningIn || (instantPayouts.length === 0 && currentRTOs.length === 0)}
                style={{
                  width: '100%',
                  background: C.accentGold,
                  color: '#0F0B10',
                  fontWeight: 700,
                  fontSize: 14,
                  padding: '10px 12px',
                  borderRadius: 10,
                  border: 'none',
                  cursor: (isTurningIn || (instantPayouts.length === 0 && currentRTOs.length === 0)) ? 'not-allowed' : 'pointer',
                  opacity: (isTurningIn || (instantPayouts.length === 0 && currentRTOs.length === 0)) ? 0.5 : 1,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 6,
                }}
              >
                <ArrowRight size={16} />
                Turn In: ${turnInAmount.toFixed(2)}
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

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 16 }}>
          <div
            onClick={() => setEditingBox('served')}
            style={{ background: C.cardElevated, border: `1px solid ${C.border}`, borderRadius: 14, padding: '12px 14px', cursor: 'pointer', position: 'relative' }}
          >
            <Pencil size={10} style={{ position: 'absolute', top: 8, right: 8, color: C.textMuted }} />
            <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 4 }}>
              <DollarSign size={13} color={C.accentGold} />
              <span style={{ color: C.accentGold, fontSize: 11, fontWeight: 600 }}>Served/Posted</span>
            </div>
            <p style={{ color: C.accentGold, fontSize: 20, fontWeight: 700, marginBottom: 2 }}>
              ${displayServedTotal.toFixed(2)}{servedAdjustment !== null ? ' *' : ''}
            </p>
            <p style={{ color: C.textMuted, fontSize: 11 }}>
              {instantPayouts.length} item{instantPayouts.length !== 1 ? 's' : ''}{servedAdjustment !== null ? ' · Adjusted' : ''}
            </p>
          </div>

          <div
            onClick={() => setEditingBox('mailed')}
            style={{ background: C.cardElevated, border: `1px solid ${C.border}`, borderRadius: 14, padding: '12px 14px', cursor: 'pointer', position: 'relative' }}
          >
            <Pencil size={10} style={{ position: 'absolute', top: 8, right: 8, color: C.textMuted }} />
            <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 4 }}>
              <Clock size={13} color={C.accentPlum} />
              <span style={{ color: C.accentPlum, fontSize: 11, fontWeight: 600 }}>Mailed in</span>
            </div>
            <p style={{ color: C.accentPlum, fontSize: 20, fontWeight: 700, marginBottom: 2 }}>
              ${displayMailedTotal.toFixed(2)}{mailedAdjustment !== null ? ' *' : ''}
            </p>
            <p style={{ color: C.textMuted, fontSize: 11 }}>
              {mailedItems.length} mailed{rtoSummaryTotal > 0 ? ` · ${pendingRTOs.length + currentRTOs.length} RTO` : ''}{mailedAdjustment !== null ? ' · Adjusted' : ''}
            </p>
          </div>
        </div>

        <div style={{
          background: C.card,
          border: `1px solid ${C.border}`,
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
                  borderRadius: '10px 10px 0 0',
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
                    color: '#0F0B10',
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
              {activeTab === 'served' && (
                <>
                  <p style={{ color: C.textMuted, fontSize: 11, marginBottom: 12 }}>
                    These were completed in the app and will be included on your next Turn In.
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
                    instantPayouts.map((a, i) => (
                      <AddressCard key={a.id} address={a} accentColor={C.accentGold} badge={null} number={i + 1} />
                    ))
                  )}
                </>
              )}

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
                    mailedItems.map((item, i) => (
                      <SnapshotCard key={`mailed-${i}`} item={item} number={i + 1} />
                    ))
                  )}
                </>
              )}

              {activeTab === 'rto' && (
                <>
                  <p style={{ color: C.textMuted, fontSize: 11, marginBottom: 12 }}>
                    {lastTurnInDate
                      ? `RTOs mailed in with your ${format(lastTurnInDate, 'MMM d')} turn-in.`
                      : 'RTOs mailed in with your paperwork.'}
                  </p>
                  {pendingRTOs.length === 0 ? (
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
                  ) : (
                    pendingRTOs.map((item, i) => (
                      <SnapshotCard key={`rto-last-${i}`} item={item} number={i + 1} />
                    ))
                  )}
                </>
              )}
            </>
          )}
        </div>

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

      {/* Adjust Amount Modals */}
      <AdjustAmountModal
        open={editingBox === 'served'}
        onClose={() => setEditingBox(null)}
        label="Served/Posted"
        currentAmount={servedAdjustment !== null ? servedAdjustment.amount : instantTotal}
        onSave={(amount, note) => {
          if (amount === instantTotal && !note) { setServedAdjustment(null); }
          else { setServedAdjustment({ amount, note }); }
          setEditingBox(null);
          toast.success('Amount updated');
        }}
      />
      <AdjustAmountModal
        open={editingBox === 'mailed'}
        onClose={() => setEditingBox(null)}
        label="Mailed In"
        currentAmount={mailedAdjustment !== null ? mailedAdjustment.amount : (mailedTotal + pendingRTOTotal)}
        onSave={(amount, note) => {
          if (amount === (mailedTotal + pendingRTOTotal) && !note) { setMailedAdjustment(null); }
          else { setMailedAdjustment({ amount, note }); }
          setEditingBox(null);
          toast.success('Amount updated');
        }}
      />

      <BottomNav currentPage="WorkerRoutes" />
    </div>
  );
}
