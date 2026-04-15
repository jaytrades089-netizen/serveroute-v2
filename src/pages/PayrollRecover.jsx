import React, { useState, useMemo } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { format } from 'date-fns';
import { Loader2, ChevronLeft, Wrench, CheckCircle, AlertTriangle, Plus } from 'lucide-react';
import { toast } from 'sonner';

// ─── Brand colors ────────────────────────────────────────────────────────────
const C = {
  bg: 'linear-gradient(to bottom, #0F0B10, #1A141D)',
  card: '#1c1b1d',
  cardElevated: '#201f21',
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

function calcPay(serveType) {
  if (serveType === 'posting') return 10;
  if (serveType === 'serve' || serveType === 'garnishment') return 24;
  return 0;
}

// Normalize a date to the Sunday of its week (week ending date)
// This creates a stable key to group orphans by 7-day blocks.
function weekKey(dateStr) {
  if (!dateStr) return 'unknown';
  const d = new Date(dateStr);
  if (isNaN(d)) return 'unknown';
  // Find the end-of-week (Saturday) for grouping
  const dayOfWeek = d.getDay();
  const daysUntilSaturday = 6 - dayOfWeek;
  const endOfWeek = new Date(d);
  endOfWeek.setDate(d.getDate() + daysUntilSaturday);
  endOfWeek.setHours(23, 59, 59, 999);
  return endOfWeek.toISOString().split('T')[0];
}

function weekLabel(key) {
  if (key === 'unknown') return 'Unknown date';
  const end = new Date(key);
  const start = new Date(end);
  start.setDate(end.getDate() - 6);
  return `${format(start, 'MMM d')} – ${format(end, 'MMM d, yyyy')}`;
}

export default function PayrollRecover({ onBack }) {
  const navigate = useNavigate();
  const handleBack = onBack || (() => navigate(-1));
  const queryClient = useQueryClient();
  const [selectedTargets, setSelectedTargets] = useState({}); // { weekKey: recordId | 'new' }
  const [isRecovering, setIsRecovering] = useState(false);
  const [recoveryLog, setRecoveryLog] = useState([]);

  const { data: user } = useQuery({
    queryKey: ['currentUser'],
    queryFn: () => base44.auth.me()
  });

  const { data: routes = [] } = useQuery({
    queryKey: ['workerRoutes', user?.id],
    queryFn: async () => {
      if (!user?.id) return [];
      const allRoutes = await base44.entities.Route.filter({ worker_id: user.id });
      return allRoutes.filter(r => !r.deleted_at);
    },
    enabled: !!user?.id
  });

  const { data: addresses = [], isLoading: addressesLoading } = useQuery({
    queryKey: ['allWorkerAddresses', user?.id, routes.map(r => r.id).join(',')],
    queryFn: async () => {
      if (!user?.id) return [];
      const routeIds = routes.map(r => r.id);
      if (routeIds.length === 0) return [];
      const all = await base44.entities.Address.filter({ deleted_at: null });
      return all.filter(a => routeIds.includes(a.route_id));
    },
    enabled: !!user?.id && routes.length > 0
  });

  const { data: payrollHistory = [], isLoading: historyLoading } = useQuery({
    queryKey: ['payrollHistory', user?.id],
    queryFn: async () => {
      if (!user?.id) return [];
      const records = await base44.entities.PayrollRecord.filter({ user_id: user.id });
      return records.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    },
    enabled: !!user?.id
  });

  const validRecordIds = useMemo(() => new Set(payrollHistory.map(r => r.id)), [payrollHistory]);

  // Find orphans: served/returned addresses with no stamp OR a stamp that points to a deleted record
  const orphans = useMemo(() => {
    return addresses.filter(a => {
      const hasActivity = a.served || a.status === 'returned';
      if (!hasActivity) return false;
      // Unstamped
      if (!a.payroll_record_id || a.payroll_record_id === '') return true;
      // Ghost-stamped (record was deleted)
      if (!validRecordIds.has(a.payroll_record_id)) return true;
      return false;
    });
  }, [addresses, validRecordIds]);

  // Group orphans by week
  const orphanGroups = useMemo(() => {
    const groups = {};
    orphans.forEach(a => {
      const refDate = a.status === 'returned' ? a.rto_at : a.served_at;
      const key = weekKey(refDate);
      if (!groups[key]) groups[key] = [];
      groups[key].push(a);
    });
    // Sort keys newest first
    return Object.keys(groups)
      .sort((a, b) => b.localeCompare(a))
      .map(k => ({ key: k, label: weekLabel(k), addresses: groups[k] }));
  }, [orphans]);

  // Match a week to an existing PayrollRecord whose period_end falls in that week
  const suggestedTargetForWeek = (weekKeyStr) => {
    if (weekKeyStr === 'unknown') return null;
    const weekEnd = new Date(weekKeyStr);
    const weekStart = new Date(weekEnd);
    weekStart.setDate(weekEnd.getDate() - 6);
    weekStart.setHours(0, 0, 0, 0);

    // Find a record whose turn_in_date or period_end falls inside this week
    return payrollHistory.find(r => {
      const cmp = r.turn_in_date ? new Date(r.turn_in_date) : (r.period_end ? new Date(r.period_end) : null);
      if (!cmp) return false;
      return cmp >= weekStart && cmp <= weekEnd;
    });
  };

  const handleTargetChange = (key, value) => {
    setSelectedTargets(prev => ({ ...prev, [key]: value }));
  };

  const logLine = (line) => {
    setRecoveryLog(prev => [...prev, line]);
  };

  const handleRecover = async () => {
    if (isRecovering) return;
    setIsRecovering(true);
    setRecoveryLog([]);
    try {
      for (const group of orphanGroups) {
        const targetChoice = selectedTargets[group.key];
        if (!targetChoice) {
          logLine(`Skipped: ${group.label} (no target selected)`);
          continue;
        }

        // Resolve target record
        let targetRecord = null;
        if (targetChoice === 'new') {
          // Create a new PayrollRecord for this week
          const weekEnd = group.key === 'unknown' ? new Date() : new Date(group.key);
          const weekStart = new Date(weekEnd);
          weekStart.setDate(weekEnd.getDate() - 6);

          const addrList = group.addresses;
          const served = addrList.filter(a => a.served && a.status !== 'returned');
          const rtos = addrList.filter(a => a.status === 'returned');
          const instantTotal = served.reduce((s, a) => s + calcPay(a.serve_type), 0);
          const rtoTotal = rtos.reduce((s, a) => s + calcPay(a.serve_type), 0);

          const snapshotAddresses = [
            ...served.map(a => ({
              id: a.id,
              address: a.normalized_address || a.legal_address,
              defendant: a.defendant_name || '',
              serve_type: a.serve_type,
              amount: calcPay(a.serve_type),
              served_at: a.served_at,
              rto_at: null,
              bucket: 'served'
            })),
            ...rtos.map(a => ({
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

          targetRecord = await base44.entities.PayrollRecord.create({
            user_id: user.id,
            company_id: user.company_id || '',
            period_start: weekStart.toISOString(),
            period_end: weekEnd.toISOString(),
            turn_in_date: weekEnd.toISOString(),
            instant_total: instantTotal,
            pending_total: 0,
            rto_total: rtoTotal,
            total_amount: instantTotal + rtoTotal,
            address_count: snapshotAddresses.length,
            snapshot_data: JSON.stringify(snapshotAddresses),
            status: 'saved',
            notes: `Recovered ${snapshotAddresses.length} items via recovery tool`,
            created_at: new Date().toISOString()
          });

          logLine(`Created new record for ${group.label} with ${snapshotAddresses.length} items`);
        } else {
          // Add orphans to existing record's snapshot
          targetRecord = payrollHistory.find(r => r.id === targetChoice);
          if (!targetRecord) {
            logLine(`Skipped: ${group.label} (target record not found)`);
            continue;
          }

          let existingSnapshot = [];
          try { existingSnapshot = JSON.parse(targetRecord.snapshot_data || '[]'); } catch { existingSnapshot = []; }

          const existingIds = new Set(existingSnapshot.map(s => s.id));
          const newEntries = group.addresses
            .filter(a => !existingIds.has(a.id))
            .map(a => {
              const isRto = a.status === 'returned';
              return {
                id: a.id,
                address: a.normalized_address || a.legal_address,
                defendant: a.defendant_name || '',
                serve_type: a.serve_type,
                amount: calcPay(a.serve_type),
                served_at: a.served_at || null,
                rto_at: isRto ? a.rto_at : null,
                rto_reason: isRto ? (a.rto_reason || '') : undefined,
                bucket: isRto ? 'rto' : 'served'
              };
            });

          const mergedSnapshot = [...existingSnapshot, ...newEntries];

          // Recompute totals from merged snapshot
          const instantTotal = mergedSnapshot
            .filter(s => s.bucket === 'served' || s.bucket === 'pending' || s.bucket === 'instant')
            .reduce((sum, s) => sum + (s.amount || 0), 0);
          const rtoTotal = mergedSnapshot
            .filter(s => s.bucket === 'rto')
            .reduce((sum, s) => sum + (s.amount || 0), 0);

          await base44.entities.PayrollRecord.update(targetRecord.id, {
            snapshot_data: JSON.stringify(mergedSnapshot),
            instant_total: instantTotal,
            rto_total: rtoTotal,
            total_amount: instantTotal + rtoTotal,
            address_count: mergedSnapshot.length
          });

          logLine(`Added ${newEntries.length} items to ${format(new Date(targetRecord.turn_in_date || targetRecord.created_at), 'MMM d')} record`);
        }

        // Stamp all orphans in this group with the target record's ID
        if (targetRecord?.id) {
          const BATCH_SIZE = 10;
          for (let i = 0; i < group.addresses.length; i += BATCH_SIZE) {
            const batch = group.addresses.slice(i, i + BATCH_SIZE);
            await Promise.all(
              batch.map(a =>
                base44.entities.Address.update(a.id, { payroll_record_id: targetRecord.id })
                  .catch(err => console.error('Failed to stamp', a.id, err))
              )
            );
          }
          logLine(`Stamped ${group.addresses.length} addresses`);
        }
      }

      queryClient.invalidateQueries({ queryKey: ['allWorkerAddresses', user?.id] });
      queryClient.invalidateQueries({ queryKey: ['payrollHistory', user?.id] });
      toast.success('Recovery complete');
    } catch (err) {
      console.error('Recovery error:', err);
      logLine(`ERROR: ${err.message}`);
      toast.error('Recovery encountered an error');
    } finally {
      setIsRecovering(false);
    }
  };

  const isLoading = addressesLoading || historyLoading;

  const totalOrphans = orphans.length;
  const totalValue = orphans.reduce((sum, a) => sum + calcPay(a.serve_type), 0);

  return (
    <div style={{ minHeight: '100vh', background: C.bg, paddingBottom: 40 }}>
      <div style={{ background: C.nav, padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 10, borderBottom: `1px solid ${C.border}` }}>
        <button onClick={handleBack} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4 }}>
          <ChevronLeft size={24} color={C.textPrimary} />
        </button>
        <Wrench size={18} color={C.accentGold} />
        <div>
          <p style={{ color: C.textPrimary, fontWeight: 700, fontSize: 15, margin: 0 }}>Payroll Recovery</p>
          <p style={{ color: C.textMuted, fontSize: 11, margin: 0 }}>Restore orphaned pay items</p>
        </div>
      </div>

      <main style={{ padding: '16px', maxWidth: 600, margin: '0 auto' }}>
        {isLoading ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: '60px 0' }}>
            <Loader2 size={32} color={C.accentPlum} className="animate-spin" />
          </div>
        ) : totalOrphans === 0 ? (
          <div style={{
            background: C.cardElevated,
            border: `1px solid ${C.border}`,
            borderRadius: 12,
            padding: '32px 20px',
            textAlign: 'center',
          }}>
            <CheckCircle size={40} color="#4ade80" style={{ margin: '0 auto 12px' }} />
            <p style={{ color: C.textPrimary, fontSize: 15, fontWeight: 600, margin: 0 }}>
              No orphans found
            </p>
            <p style={{ color: C.textMuted, fontSize: 12, margin: '6px 0 0' }}>
              All your served addresses are correctly stamped.
            </p>
          </div>
        ) : (
          <>
            <div style={{
              background: C.rto + '22',
              border: `1px solid ${C.rto}`,
              borderRadius: 12,
              padding: '14px 16px',
              marginBottom: 16,
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                <AlertTriangle size={16} color={C.rto} />
                <p style={{ color: C.rto, fontSize: 13, fontWeight: 700, margin: 0 }}>
                  {totalOrphans} orphan{totalOrphans !== 1 ? 's' : ''} · ${totalValue.toFixed(2)} unrecovered
                </p>
              </div>
              <p style={{ color: C.textSecondary, fontSize: 12, margin: 0, lineHeight: 1.5 }}>
                Addresses grouped by the week they were served or RTO'd.
                Pick a target pay record for each group, or create a new one. Nothing is changed until you tap Recover.
              </p>
            </div>

            {orphanGroups.map(group => {
              const suggested = suggestedTargetForWeek(group.key);
              const current = selectedTargets[group.key] ?? (suggested?.id || '');
              const groupValue = group.addresses.reduce((s, a) => s + calcPay(a.serve_type), 0);

              return (
                <div key={group.key} style={{
                  background: C.cardElevated,
                  border: `1px solid ${C.border}`,
                  borderRadius: 12,
                  padding: '12px 14px',
                  marginBottom: 12,
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 10 }}>
                    <div>
                      <p style={{ color: C.textPrimary, fontSize: 14, fontWeight: 700, margin: 0 }}>{group.label}</p>
                      <p style={{ color: C.textMuted, fontSize: 11, margin: '2px 0 0' }}>
                        {group.addresses.length} item{group.addresses.length !== 1 ? 's' : ''} · ${groupValue.toFixed(2)}
                      </p>
                    </div>
                  </div>

                  <label style={{ color: C.textMuted, fontSize: 10, fontWeight: 600, display: 'block', marginBottom: 4 }}>
                    ASSIGN TO
                  </label>
                  <select
                    value={current}
                    onChange={e => handleTargetChange(group.key, e.target.value)}
                    style={{
                      width: '100%',
                      padding: '8px 10px',
                      background: C.card,
                      color: C.textPrimary,
                      border: `1px solid ${C.border}`,
                      borderRadius: 8,
                      fontSize: 12,
                      marginBottom: 10,
                    }}
                  >
                    <option value="">-- Skip this group --</option>
                    <option value="new">➕ Create new record for this week</option>
                    {payrollHistory.map(r => (
                      <option key={r.id} value={r.id}>
                        {r.turn_in_date ? format(new Date(r.turn_in_date), 'MMM d, yyyy') : format(new Date(r.created_at), 'MMM d, yyyy')}
                        {' · '}${r.total_amount?.toFixed(2) || '0.00'}
                        {suggested?.id === r.id ? ' (suggested)' : ''}
                      </option>
                    ))}
                  </select>

                  <details>
                    <summary style={{ color: C.accentPlum, fontSize: 11, cursor: 'pointer' }}>
                      Show {group.addresses.length} address{group.addresses.length !== 1 ? 'es' : ''}
                    </summary>
                    <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 6 }}>
                      {group.addresses.map(a => {
                        const isRto = a.status === 'returned';
                        return (
                          <div key={a.id} style={{
                            background: C.card,
                            border: `1px solid ${C.border}`,
                            borderLeft: `3px solid ${isRto ? C.rto : C.accentGold}`,
                            borderRadius: 8,
                            padding: '8px 10px',
                            fontSize: 11,
                          }}>
                            <p style={{ color: C.textPrimary, margin: 0, fontWeight: 600 }}>
                              {a.normalized_address || a.legal_address}
                            </p>
                            {a.defendant_name && (
                              <p style={{ color: C.textMuted, margin: '2px 0 0' }}>{a.defendant_name}</p>
                            )}
                            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4 }}>
                              <span style={{ color: C.textMuted }}>
                                {isRto ? 'RTO' : 'Served'} {a.served_at || a.rto_at ? format(new Date(a.rto_at || a.served_at), 'MMM d') : ''}
                              </span>
                              <span style={{ color: isRto ? C.rto : C.accentGold, fontWeight: 700 }}>
                                ${calcPay(a.serve_type).toFixed(2)}
                              </span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </details>
                </div>
              );
            })}

            <button
              onClick={handleRecover}
              disabled={isRecovering || Object.keys(selectedTargets).filter(k => selectedTargets[k]).length === 0}
              style={{
                width: '100%',
                background: C.accentGold,
                color: '#0F0B10',
                fontWeight: 700,
                fontSize: 14,
                padding: '12px',
                borderRadius: 10,
                border: 'none',
                cursor: isRecovering ? 'not-allowed' : 'pointer',
                opacity: isRecovering ? 0.5 : 1,
                marginTop: 8,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 8,
              }}
            >
              {isRecovering ? <Loader2 size={16} className="animate-spin" /> : <CheckCircle size={16} />}
              {isRecovering ? 'Recovering...' : 'Recover Selected Groups'}
            </button>

            {recoveryLog.length > 0 && (
              <div style={{
                background: C.card,
                border: `1px solid ${C.border}`,
                borderRadius: 10,
                padding: '10px 12px',
                marginTop: 14,
                fontSize: 11,
                color: C.textSecondary,
                fontFamily: 'monospace',
                whiteSpace: 'pre-wrap',
              }}>
                {recoveryLog.map((line, i) => (
                  <div key={i}>{line}</div>
                ))}
              </div>
            )}
          </>
        )}
      </main>
    </div>
  );
}
