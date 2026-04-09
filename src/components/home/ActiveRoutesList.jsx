import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import { MapPin, Calendar, Clock, MoreHorizontal, Archive, Trash2, CalendarDays, Pencil } from 'lucide-react';
import ScheduleRunModal from './ScheduleRunModal';
import EditRouteModal from './EditRouteModal';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { format, parseISO, isToday, isTomorrow } from 'date-fns';

export default function ActiveRoutesList({ routes = [], attempts = [], addresses = [], onArchive, onDelete }) {
  const [schedulingRoute, setSchedulingRoute] = useState(null);
  const [editingRoute, setEditingRoute] = useState(null);

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
  const groupKeys = Object.keys(groups).sort((a, b) => new Date(a) - new Date(b));

  const getStatusBadge = (status, hasRunDate, onScheduleClick) => {
    if (status === 'active') {
      return (
        <span className="text-xs font-medium rounded-full px-2 py-0.5" style={{ background: 'rgba(229,179,225,0.20)', color: '#e5b9e1' }}>
          Active
        </span>
      );
    }
    if (hasRunDate) {
      return (
        <button
          onClick={e => { e.preventDefault(); onScheduleClick?.(); }}
          className="flex items-center gap-1 text-xs font-medium rounded-full px-2 py-0.5 transition-colors hover:opacity-80"
          style={{ background: 'rgba(99,102,241,0.20)', color: '#a5b4fc', cursor: 'pointer' }}
        >
          <Calendar className="w-3 h-3" />
          Scheduled
        </button>
      );
    }
    return (
      <button
        onClick={e => { e.preventDefault(); onScheduleClick?.(); }}
        className="flex items-center gap-1.5 text-sm font-bold rounded-full px-3 py-1.5 transition-colors hover:opacity-80"
        style={{ background: 'rgba(233,195,73,0.18)', color: '#e9c349', border: '1px solid rgba(233,195,73,0.45)', cursor: 'pointer' }}
      >
        <CalendarDays className="w-4 h-4" />
        Unscheduled
      </button>
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
      <div
        key={route.id}
        className="block rounded-2xl p-4 mb-3 relative"
        style={{
          background: 'rgba(14, 20, 44, 0.55)',
          backdropFilter: 'blur(20px)',
          WebkitBackdropFilter: 'blur(20px)',
          border: '1px solid rgba(255,255,255,0.18)',
          borderLeft: isActive ? '3px solid #e5b9e1' : '1px solid rgba(255,255,255,0.18)'
        }}
      >
      <Link to={createPageUrl(`WorkerRouteDetail?id=${route.id}`)} className="block">
        {/* Top row: letter + run date (left), status badge + scheduled runs (right, absolutely positioned) */}
        <div className="flex items-start gap-3 mb-2">
          <div
            className="rounded-lg h-8 flex items-center justify-center font-bold flex-shrink-0 px-2"
            style={{ background: 'rgba(229,179,225,0.15)', color: '#e5b9e1', minWidth: '2rem', fontSize: letter.length >= 3 ? '10px' : letter.length === 2 ? '11px' : '14px' }}
          >
            {letter}
          </div>
          <div className="flex-1 min-w-0 flex items-center gap-2 overflow-hidden">
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
        </div>

        {/* Absolutely positioned right column: status badge + scheduled run chips */}
        <div className="absolute top-4 right-4 flex flex-col items-end gap-1">
          {getStatusBadge(route.status, !!route.run_date, () => setSchedulingRoute(route))}
          {route.scheduled_runs?.length > 0 && (
            <button
              onClick={e => { e.preventDefault(); setSchedulingRoute(route); }}
              className="flex flex-col gap-0.5 items-end"
            >
              {route.scheduled_runs.filter(r => r.date).sort((a, b) => new Date(a.date) - new Date(b.date)).map((run, i) => (
                <div key={i} className="flex items-center gap-1">
                  <span className="text-[9px] font-semibold uppercase tracking-wide" style={{ color: '#a5b4fc' }}>
                    {new Date(run.date + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'numeric', day: 'numeric' })}
                  </span>
                  {run.qualifiers?.length > 0 && (
                    <span className="text-[10px] font-bold rounded px-2 py-0.5 uppercase"
                      style={{ background: 'rgba(233,195,73,0.18)', color: '#e9c349', border: '1px solid rgba(233,195,73,0.35)' }}>
                      {run.qualifiers.map(q => q === 'weekend' ? 'WKND' : q.toUpperCase()).join('·')}
                    </span>
                  )}
                </div>
              ))}
            </button>
          )}
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

        <div className="flex justify-between items-end">
          {/* Hamburger menu — bottom left */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild onClick={e => e.preventDefault()}>
              <button
                className="flex items-center justify-center w-7 h-7 rounded-lg transition-colors hover:bg-white/10"
                style={{ color: '#6B7280', border: '1px solid rgba(255,255,255,0.12)' }}
                onClick={e => e.preventDefault()}
              >
                <MoreHorizontal className="w-4 h-4" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start">
              <DropdownMenuItem onClick={e => { e.preventDefault(); setEditingRoute(route); }}>
                <Pencil className="w-4 h-4 mr-2" />
                Edit Route
              </DropdownMenuItem>
              <DropdownMenuItem onClick={e => { e.preventDefault(); setSchedulingRoute(route); }}>
                <CalendarDays className="w-4 h-4 mr-2" />
                Schedule Runs
              </DropdownMenuItem>
              {onArchive && (
                <DropdownMenuItem onClick={e => { e.preventDefault(); onArchive(route); }}>
                  <Archive className="w-4 h-4 mr-2" />
                  Archive Route
                </DropdownMenuItem>
              )}
              {onDelete && (
                <DropdownMenuItem className="text-red-600" onClick={e => { e.preventDefault(); onDelete(route); }}>
                  <Trash2 className="w-4 h-4 mr-2" />
                  Delete Route
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>

          {/* Qualifier badges — bottom right */}
          <div className="flex-1 flex justify-end">
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
        </div>
      </Link>
      </div>
    );
  };

  return (
    <div className="mb-6">
      <div className="mb-3">
        <h2 className="text-xl font-bold" style={{ color: '#e6e1e4' }}>My Routes</h2>
      </div>

      {doableRoutes.length === 0 ? (
        <div className="frosted-glass rounded-xl p-8 text-center">
          <MapPin className="w-10 h-10 mx-auto mb-2" style={{ color: '#4B5563' }} />
          <p style={{ color: '#9CA3AF' }}>No routes</p>
        </div>
      ) : (
        <div>
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
            return (
              <div key={dateKey}>
                <div className="flex items-center gap-2 px-3 py-2 rounded-lg mt-3 mb-2" style={{ background: 'rgba(233,195,73,0.15)', backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)', border: '1px solid rgba(233,195,73,0.35)' }}>
                  <Calendar className="w-4 h-4 flex-shrink-0" style={{ color: '#e9c349' }} />
                  <span className="text-sm font-bold truncate" style={{ color: '#e9c349' }}>{dayLabel}</span>
                </div>
                {[...groups[dateKey]].sort((a, b) => qualifierSortScore(a.run_qualifiers) - qualifierSortScore(b.run_qualifiers)).map(route => renderRouteCard(route))}
              </div>
            );
          })}

          {groupKeys.length > 0 && unscheduled.length > 0 && (
            <p className="text-xs font-semibold mt-4 mb-2 px-1" style={{ color: '#6B7280' }}>Unscheduled</p>
          )}
          {unscheduled.map(route => renderRouteCard(route))}
        </div>
      )}

      {schedulingRoute && (
        <ScheduleRunModal
          route={schedulingRoute}
          onClose={() => setSchedulingRoute(null)}
          onSaved={() => setSchedulingRoute(null)}
        />
      )}
      {editingRoute && (
        <EditRouteModal
          route={editingRoute}
          onClose={() => setEditingRoute(null)}
        />
      )}
    </div>
  );
}