import React from 'react';
import { Link } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import { MapPin, Calendar, Clock, CheckCircle } from 'lucide-react';
import { format, addDays, parseISO, isToday, isTomorrow } from 'date-fns';

export default function ActiveRoutesList({ routes = [] }) {
  // Filter out archived/completed routes, sort: active first, then by run_date, then due_date
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

  // Group by run_date
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

  const getStatusBadge = (status) => {
    if (status === 'active') {
      return (
        <span className="text-xs font-medium rounded-full px-2 py-0.5" style={{ background: 'rgba(229,179,225,0.20)', color: '#e5b9e1' }}>
          Active
        </span>
      );
    }
    if (status === 'ready' || status === 'assigned' || status === 'pending') {
      return (
        <span className="flex items-center gap-1 text-xs font-medium rounded-full px-2 py-0.5" style={{ background: 'rgba(156,163,175,0.20)', color: '#9CA3AF' }}>
          <Clock className="w-3 h-3" />
          Pending
        </span>
      );
    }
    if (status === 'completed') {
      return (
        <span className="flex items-center gap-1 text-xs font-medium rounded-full px-2 py-0.5" style={{ background: 'rgba(75,85,99,0.20)', color: '#6B7280' }}>
          <CheckCircle className="w-3 h-3" />
          Done
        </span>
      );
    }
    return (
      <span className="flex items-center gap-1 text-xs font-medium rounded-full px-2 py-0.5" style={{ background: 'rgba(99,102,241,0.20)', color: '#a5b4fc' }}>
        <Calendar className="w-3 h-3" />
        Scheduled
      </span>
    );
  };

  const renderRouteCard = (route) => {
    const isActive = route.status === 'active';
    const letter = (route.folder_name || 'R').charAt(0).toUpperCase();

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

    const startTime = route.started_at
      ? new Date(route.started_at).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })
      : null;

    const estEndTime = route.est_completion_time
      ? new Date(route.est_completion_time).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })
      : null;

    const qualifierLabel = route.run_qualifiers?.length
      ? route.run_qualifiers.map(q => q.toUpperCase()).join(' · ')
      : null;

    return (
      <Link
        key={route.id}
        to={createPageUrl(`WorkerRouteDetail?id=${route.id}`)}
        className="frosted-glass-card block rounded-2xl p-4 mb-3 transition-opacity hover:opacity-90"
        style={{ border: '1px solid rgba(255,255,255,0.18)' }}
        style={isActive ? { borderLeft: '3px solid #e5b9e1' } : { borderLeft: 'none' }}
      >
        {/* Top row: letter badge + name + status badge */}
        <div className="flex items-center gap-3 mb-2">
          <div
            className="rounded-lg w-8 h-8 flex items-center justify-center font-bold text-sm flex-shrink-0"
            style={{ background: 'rgba(229,179,225,0.15)', color: '#e5b9e1' }}
          >
            {letter}
          </div>
          <span className="font-semibold text-base flex-1 truncate" style={{ color: '#E6E1E4' }}>
            {route.folder_name}
          </span>
          {getStatusBadge(route.status)}
        </div>

        {/* Run date row */}
        {route.run_date && (
          <div className="mb-2">
            <span className="text-[10px] uppercase tracking-wide" style={{ color: '#6B7280' }}>Run Date </span>
            <span className="text-xs" style={{ color: '#9CA3AF' }}>{format(parseISO(route.run_date), 'MMM d, yyyy')}</span>
          </div>
        )}

        {/* Metrics row */}
        <div className="flex gap-6 mb-2">
          {startTime && (
            <div>
              <div className="text-[10px] uppercase tracking-wide" style={{ color: '#6B7280' }}>Start</div>
              <div className="text-sm font-semibold" style={{ color: '#E6E1E4' }}>{startTime}</div>
            </div>
          )}
          {estEndTime && isActive && (
            <div>
              <div className="text-[10px] uppercase tracking-wide" style={{ color: '#6B7280' }}>End</div>
              <div className="text-sm font-semibold" style={{ color: '#E6E1E4' }}>{estEndTime}</div>
            </div>
          )}
          {estTimeLabel && !isActive && (
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

        {/* Qualifier badge bottom right */}
        {qualifierLabel && (
          <div className="flex justify-end">
            <span
              className="text-[10px] font-semibold rounded px-2 py-0.5 uppercase"
              style={{ background: 'rgba(229,179,225,0.15)', color: '#e5b9e1' }}
            >
              {qualifierLabel}
            </span>
          </div>
        )}
      </Link>
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
                <div className="flex items-center gap-2 px-3 py-2 rounded-lg mt-3 mb-2" style={{ background: '#e9c349', border: '1px solid #c9a930' }}>
                  <Calendar className="w-4 h-4 flex-shrink-0" style={{ color: '#1a1208' }} />
                  <span className="text-sm font-bold truncate" style={{ color: '#1a1208' }}>{dayLabel}</span>
                </div>
                {groups[dateKey].map(route => renderRouteCard(route))}
              </div>
            );
          })}

          {groupKeys.length > 0 && unscheduled.length > 0 && (
            <p className="text-xs font-semibold mt-4 mb-2 px-1" style={{ color: '#6B7280' }}>Unscheduled</p>
          )}
          {unscheduled.map(route => renderRouteCard(route))}
        </div>
      )}
    </div>
  );
}