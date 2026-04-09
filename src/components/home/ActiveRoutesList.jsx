import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { createPageUrl } from '@/utils';
import { MapPin, Calendar, Clock } from 'lucide-react';
import { format, parseISO, isToday, isTomorrow } from 'date-fns';
import ScheduledServeCard from '../scheduled/ScheduledServeCard';

export default function ActiveRoutesList({ routes = [], attempts = [], addresses = [], userId }) {
  const [activeTab, setActiveTab] = useState('routes');

  const routeNameMap = React.useMemo(() => {
    const map = {};
    routes.forEach(r => { map[r.id] = r.folder_name; });
    return map;
  }, [routes]);

  const attemptsByRoute = React.useMemo(() => {
    const map = {};
    attempts.forEach(a => {
      if (!map[a.route_id]) map[a.route_id] = [];
      map[a.route_id].push(a);
    });
    return map;
  }, [attempts]);

  // Fetch open scheduled serves for this worker
  const { data: scheduledServes = [] } = useQuery({
    queryKey: ['workerScheduledServes', userId],
    queryFn: async () => {
      if (!userId) return [];
      return base44.entities.ScheduledServe.filter({ worker_id: userId, status: 'open' });
    },
    enabled: !!userId,
    staleTime: 60 * 1000
  });

  const doableRoutes = routes
    .filter(r => r.status !== 'archived' && r.status !== 'completed')
    .sort((a, b) => {
      if (a.status === 'active' && b.status !== 'active') return -1;
      if (b.status === 'active' && a.status !== 'active') return 1;
      const aRun = a.run_date ? new Date(a.run_date) : null;
      const bRun = b.run_date ? new Date(b.run_date) : null;
      if (aRun && !bRun) return -1;
      if (!aRun && bRun) return 1;
      if (aRun && bRun && aRun.getTime() !== bRun.getTime()) return aRun - bRun;
      const dateA = a.due_date ? new Date(a.due_date) : new Date('9999-12-31');
      const dateB = b.due_date ? new Date(b.due_date) : new Date('9999-12-31');
      return dateA - dateB;
    });

  const qualifierSortScore = (qualifiers = []) => {
    const qs = qualifiers.map(q => q.toLowerCase());
    const hasAM = qs.includes('am');
    const hasPM = qs.includes('pm');
    const hasWKND = qs.includes('weekend');
    if (hasAM && hasWKND) return 0;
    if (hasAM) return 1;
    if (hasWKND && !hasPM) return 2;
    if (hasPM && hasWKND) return 3;
    if (hasPM) return 4;
    return 5;
  };

  // Build route groups by run_date
  const groups = {};
  const unscheduled = [];
  doableRoutes.forEach(route => {
    if (route.run_date) {
      if (!groups[route.run_date]) groups[route.run_date] = [];
      groups[route.run_date].push(route);
    } else {
      unscheduled.push(route);
    }
  });

  // Map scheduled serves to their run dates
  const servesByDate = {};
  scheduledServes.forEach(s => {
    const dateKey = s.scheduled_datetime ? s.scheduled_datetime.split('T')[0] : null;
    if (dateKey) {
      if (!servesByDate[dateKey]) servesByDate[dateKey] = [];
      servesByDate[dateKey].push(s);
    }
  });

  // Build combined group keys (routes + scheduled serves)
  const allDateKeys = new Set([
    ...Object.keys(groups),
    ...Object.keys(servesByDate)
  ]);
  const groupKeys = [...allDateKeys].sort((a, b) => new Date(a) - new Date(b));

  // Serves with no date (ungrouped)
  const ungroupedServes = scheduledServes.filter(s => {
    const dateKey = s.scheduled_datetime?.split('T')[0];
    return !dateKey || !allDateKeys.has(dateKey);
  });

  // Sorted scheduled serves for the Scheduled tab (closest first)
  const sortedScheduledServes = [...scheduledServes].sort((a, b) => {
    const aDate = a.scheduled_datetime ? new Date(a.scheduled_datetime) : new Date('9999-12-31');
    const bDate = b.scheduled_datetime ? new Date(b.scheduled_datetime) : new Date('9999-12-31');
    return aDate - bDate;
  });

  const getStatusBadge = (status, hasRunDate) => {
    if (status === 'active') {
      return (
        <span className="text-xs font-medium rounded-full px-2 py-0.5" style={{ background: 'rgba(229,179,225,0.20)', color: '#e5b9e1' }}>
          Active
        </span>
      );
    }
    if (hasRunDate) {
      return (
        <span className="flex items-center gap-1 text-xs font-medium rounded-full px-2 py-0.5" style={{ background: 'rgba(99,102,241,0.20)', color: '#a5b4fc' }}>
          <Calendar className="w-3 h-3" />
          Scheduled
        </span>
      );
    }
    return (
      <span className="flex items-center gap-1 text-xs font-medium rounded-full px-2 py-0.5" style={{ background: 'rgba(156,163,175,0.20)', color: '#9CA3AF' }}>
        <Clock className="w-3 h-3" />
        Unscheduled
      </span>
    );
  };

  const renderRouteCard = (route) => {
    const isActive = route.status === 'active';
    const letter = (route.folder_name || 'R').replace(/^route\s*/i, '').trim().substring(0, 3).toUpperCase();

    const estTotalMinutes = (() => {
      if (!route.total_drive_time_minutes || route.total_drive_time_minutes <= 0) return null;
      const dwell = (route.time_at_address_minutes || 2) * (route.total_addresses || 0);
      return route.total_drive_time_minutes + dwell;
    })();

    const estTimeLabel = (() => {
      if (!estTotalMinutes) return null;
      const h = Math.floor(estTotalMinutes / 60);
      const m = estTotalMinutes % 60;
      if (h > 0 && m > 0) return `${h}h ${m}m`;
      if (h > 0) return `${h}h`;
      return `${m}m`;
    })();

    const dueDateLabel = route.due_date ? format(new Date(route.due_date), 'EEE M/d') : null;

    const spreadDateLabel = (() => {
      if (route.spread_due_date) return format(new Date(route.spread_due_date), 'EEE M/d');
      if (route.first_attempt_date) {
        const spreadDays = route.minimum_days_spread || (route.spread_type === '10' ? 10 : 14);
        const d = new Date(route.first_attempt_date);
        d.setDate(d.getDate() + spreadDays);
        return format(d, 'EEE M/d');
      }
      return null;
    })();

    const routeAttempts = attemptsByRoute[route.id] || [];
    const allQuals = [
      { key: 'am', label: 'AM' },
      { key: 'pm', label: 'PM' },
      { key: 'weekend', label: 'WKND' },
    ];

    const pendingAddressIds = new Set(
      addresses
        .filter(a => a.route_id === route.id && !a.served && a.status !== 'returned')
        .map(a => a.id)
    );

    const attemptsByNumber = {};
    routeAttempts.forEach(a => {
      if (pendingAddressIds.size > 0 && !pendingAddressIds.has(a.address_id)) return;
      const num = a.attempt_number || 1;
      if (!attemptsByNumber[num]) attemptsByNumber[num] = { am: false, pm: false, weekend: false, addresses: new Set() };
      if (a.has_am) attemptsByNumber[num].am = true;
      if (a.has_pm) attemptsByNumber[num].pm = true;
      if (a.has_weekend) attemptsByNumber[num].weekend = true;
      attemptsByNumber[num].addresses.add(a.address_id);
    });
    const attemptList = Object.entries(attemptsByNumber)
      .sort((a, b) => Number(a[0]) - Number(b[0]))
      .map(([num, quals]) => ({ num: Number(num), am: quals.am, pm: quals.pm, weekend: quals.weekend, count: quals.addresses.size }));
    const hasAnyAttempts = attemptList.length > 0;

    const addressCoverage = {};
    routeAttempts.forEach(a => {
      if (!pendingAddressIds.has(a.address_id)) return;
      if (!addressCoverage[a.address_id]) addressCoverage[a.address_id] = { am: false, pm: false, weekend: false };
      if (a.has_am) addressCoverage[a.address_id].am = true;
      if (a.has_pm) addressCoverage[a.address_id].pm = true;
      if (a.has_weekend) addressCoverage[a.address_id].weekend = true;
    });
    const pendingIds = [...pendingAddressIds];
    const allQualifiersMet = pendingIds.length > 0 && pendingIds.every(id =>
      addressCoverage[id]?.am && addressCoverage[id]?.pm && addressCoverage[id]?.weekend
    );

    return (
      <Link
        key={route.id}
        to={createPageUrl(`WorkerRouteDetail?id=${route.id}`)}
        className="block rounded-2xl p-4 mb-3 transition-opacity hover:opacity-90"
        style={{
          background: 'rgba(14, 20, 44, 0.55)',
          backdropFilter: 'blur(20px)',
          WebkitBackdropFilter: 'blur(20px)',
          border: '1px solid rgba(255,255,255,0.18)',
          borderLeft: isActive ? '3px solid #e5b9e1' : '1px solid rgba(255,255,255,0.18)'
        }}
      >
        <div className="flex items-center gap-3 mb-2">
          <div
            className="rounded-lg h-8 flex items-center justify-center font-bold flex-shrink-0 px-2"
            style={{ background: 'rgba(229,179,225,0.15)', color: '#e5b9e1', minWidth: '2rem', fontSize: letter.length >= 3 ? '10px' : letter.length === 2 ? '11px' : '14px' }}
          >
            {letter}
          </div>
          <div className="flex-1 min-w-0 flex items-center gap-2 flex-wrap">
            {route.run_date ? (
              <>
                <span className="text-[10px] uppercase tracking-wide" style={{ color: '#6B7280' }}>Run Date </span>
                <span className="text-xs" style={{ color: '#9CA3AF' }}>{format(parseISO(route.run_date), 'EEE MMM d')}</span>
              </>
            ) : (
              <span className="text-xs" style={{ color: '#6B7280' }}>No run date</span>
            )}
            {route.run_qualifiers?.length > 0 && (
              <span
                className="text-[10px] font-semibold rounded px-1.5 py-0.5 uppercase"
                style={{ background: 'rgba(233,195,73,0.18)', color: '#e9c349', border: '1px solid rgba(233,195,73,0.35)' }}
              >
                {route.run_qualifiers.map(q => q === 'weekend' ? 'WKND' : q.toUpperCase()).join(' · ')}
              </span>
            )}
          </div>
          {getStatusBadge(route.status, !!route.run_date)}
        </div>

        <div className="flex gap-4 mb-2">
          {estTimeLabel && (
            <div>
              <div className="text-[10px] uppercase tracking-wide" style={{ color: '#6B7280' }}>Duration</div>
              <div className="text-sm font-semibold" style={{ color: '#E6E1E4' }}>{estTimeLabel}</div>
            </div>
          )}
          <div>
            <div className="text-[10px] uppercase tracking-wide" style={{ color: '#6B7280' }}>Remaining</div>
            <div className="text-sm font-semibold" style={{ color: '#E6E1E4' }}>
              {(route.total_addresses || 0) - (route.served_count || 0)}
            </div>
          </div>
        </div>

        {(dueDateLabel || spreadDateLabel) && (
          <div className="mb-2">
            {dueDateLabel && (
              <div>
                <div className="text-[10px] uppercase tracking-wide" style={{ color: '#6B7280' }}>Due</div>
                <div className="text-sm font-semibold" style={{ color: '#E6E1E4' }}>{dueDateLabel}</div>
              </div>
            )}
            {spreadDateLabel && (
              <div className="mt-1">
                <div className="text-[10px] uppercase tracking-wide" style={{ color: '#6B7280' }}>Spread</div>
                <div className="text-sm font-semibold" style={{ color: '#E6E1E4' }}>{spreadDateLabel}</div>
              </div>
            )}
          </div>
        )}

        <div className="flex justify-end">
          {!hasAnyAttempts ? (
            <div className="flex gap-1">
              {allQuals.map(({ key, label }) => (
                <span key={key} className="text-[10px] font-semibold rounded px-2 py-0.5 uppercase"
                  style={{ background: 'rgba(255,255,255,0.05)', color: '#4B5563' }}>
                  {label}
                </span>
              ))}
            </div>
          ) : allQualifiersMet ? (
            <div className="flex flex-col items-end gap-0.5">
              <span className="text-[9px] font-semibold uppercase tracking-wide" style={{ color: '#22c55e' }}>All Qualifiers Met</span>
              <div className="flex items-center gap-1">
                {allQuals.map(({ key, label }) => (
                  <span key={key} className="text-[10px] font-semibold rounded px-2 py-0.5 uppercase"
                    style={{ background: 'rgba(34,197,94,0.18)', color: '#22c55e', border: '1px solid rgba(34,197,94,0.35)' }}>
                    {label}
                  </span>
                ))}
              </div>
            </div>
          ) : (
            <div className="flex flex-col gap-1 items-end">
              {attemptList.map(({ num, am, pm, weekend, count }) => {
                const activeKeys = [am && 'am', pm && 'pm', weekend && 'weekend'].filter(Boolean);
                return (
                  <div key={num} className="flex flex-col items-end gap-0.5">
                    <span className="text-[9px] font-semibold uppercase tracking-wide" style={{ color: '#6B7280' }}>Attempt {num}</span>
                    <div className="flex items-center gap-1">
                      {allQuals.map(({ key, label }) => (
                        <span key={key} className="text-[10px] font-semibold rounded px-2 py-0.5 uppercase"
                          style={activeKeys.includes(key)
                            ? { background: 'rgba(229,179,225,0.20)', color: '#e5b9e1' }
                            : { background: 'rgba(255,255,255,0.05)', color: '#4B5563' }
                          }>
                          {label}
                        </span>
                      ))}
                      <span className="text-[10px] font-bold rounded-full px-1.5 py-0.5"
                        style={{ background: 'rgba(233,195,73,0.18)', color: '#e9c349', border: '1px solid rgba(233,195,73,0.35)', minWidth: '20px', textAlign: 'center' }}>
                        {count}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </Link>
    );
  };

  return (
    <div className="mb-6">
      {/* Section header with tabs */}
      <div className="flex items-center gap-3 mb-3">
        <button
          onClick={() => setActiveTab('routes')}
          className="text-xl font-bold transition-opacity"
          style={{
            color: activeTab === 'routes' ? '#e6e1e4' : '#4B5563',
            background: 'none',
            border: 'none',
            padding: 0,
            cursor: 'pointer'
          }}
        >
          My Routes
        </button>
        <button
          onClick={() => setActiveTab('scheduled')}
          className="text-xl font-bold transition-opacity flex items-center gap-1.5"
          style={{
            color: activeTab === 'scheduled' ? '#e6e1e4' : '#4B5563',
            background: 'none',
            border: 'none',
            padding: 0,
            cursor: 'pointer'
          }}
        >
          Scheduled
          {scheduledServes.length > 0 && (
            <span
              className="text-xs font-semibold rounded-full px-2 py-0.5"
              style={{
                background: activeTab === 'scheduled' ? 'rgba(99,102,241,0.30)' : 'rgba(99,102,241,0.15)',
                color: activeTab === 'scheduled' ? '#a5b4fc' : '#6B7280',
                fontSize: '11px'
              }}
            >
              {scheduledServes.length}
            </span>
          )}
        </button>
      </div>

      {/* ── SCHEDULED TAB ── */}
      {activeTab === 'scheduled' && (
        <div>
          {sortedScheduledServes.length === 0 ? (
            <div className="frosted-glass rounded-xl p-8 text-center">
              <Calendar className="w-10 h-10 mx-auto mb-2" style={{ color: '#4B5563' }} />
              <p style={{ color: '#9CA3AF' }}>No scheduled serves</p>
            </div>
          ) : (
            <div className="space-y-3">
              {sortedScheduledServes.map(s => (
                <ScheduledServeCard key={s.id} serve={s} />
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── MY ROUTES TAB ── */}
      {activeTab === 'routes' && (
        <div>
          {doableRoutes.length === 0 ? (
            <div className="frosted-glass rounded-xl p-8 text-center">
              <MapPin className="w-10 h-10 mx-auto mb-2" style={{ color: '#4B5563' }} />
              <p style={{ color: '#9CA3AF' }}>No routes</p>
            </div>
          ) : (
            <div>
              {/* Dated groups (routes + scheduled serves interleaved) */}
              {groupKeys.map(dateKey => {
                const dt = parseISO(dateKey);
                let dayLabel;
                if (isToday(dt)) {
                  dayLabel = `Today — ${format(dt, 'EEE, MMM d')}`;
                } else if (isTomorrow(dt)) {
                  dayLabel = `Tomorrow — ${format(dt, 'EEE, MMM d')}`;
                } else {
                  dayLabel = format(dt, 'EEEE, MMM d');
                }
                const routesInGroup = groups[dateKey] || [];
                const servesInGroup = servesByDate[dateKey] || [];
                return (
                  <div key={dateKey}>
                    <div className="flex items-center gap-2 px-3 py-2 rounded-lg mt-3 mb-2" style={{ background: 'rgba(233,195,73,0.15)', backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)', border: '1px solid rgba(233,195,73,0.35)' }}>
                      <Calendar className="w-4 h-4 flex-shrink-0" style={{ color: '#e9c349' }} />
                      <span className="text-sm font-bold truncate" style={{ color: '#e9c349' }}>{dayLabel}</span>
                    </div>
                    {[...routesInGroup].sort((a, b) => qualifierSortScore(a.run_qualifiers) - qualifierSortScore(b.run_qualifiers)).map(route => renderRouteCard(route))}
                    {servesInGroup.map(s => (
                      <ScheduledServeCard key={s.id} serve={s} />
                    ))}
                  </div>
                );
              })}

              {/* Ungrouped scheduled serves */}
              {ungroupedServes.map(s => (
                <ScheduledServeCard key={s.id} serve={s} />
              ))}

              {/* Unscheduled routes */}
              {groupKeys.length > 0 && unscheduled.length > 0 && (
                <p className="text-xs font-semibold mt-4 mb-2 px-1" style={{ color: '#6B7280' }}>Unscheduled</p>
              )}
              {unscheduled.map(route => renderRouteCard(route))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
