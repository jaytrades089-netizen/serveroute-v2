import React from 'react';
import { Link } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import { ChevronRight, MapPin, Calendar, Clock } from 'lucide-react';
import { format, addDays, parseISO, isToday, isTomorrow } from 'date-fns';
import { QualifierBadges } from '@/components/qualifier/QualifierBadge';

export default function ActiveRoutesList({ routes = [] }) {
  // Filter out archived routes and sort: active first, then by run_date, then by due date
  const doableRoutes = routes
    .filter(r => r.status !== 'archived' && r.status !== 'completed')
    .sort((a, b) => {
      // Active routes first
      if (a.status === 'active' && b.status !== 'active') return -1;
      if (b.status === 'active' && a.status !== 'active') return 1;
      // Then by run_date (scheduled before unscheduled, soonest first)
      const aRun = a.run_date ? new Date(a.run_date) : null;
      const bRun = b.run_date ? new Date(b.run_date) : null;
      if (aRun && !bRun) return -1;
      if (!aRun && bRun) return 1;
      if (aRun && bRun && aRun.getTime() !== bRun.getTime()) return aRun - bRun;
      // Then by due date (closest first)
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

  const renderRouteCard = (route) => {
    const isActive = route.status === 'active';

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

    return (
      <Link
        key={route.id}
        to={createPageUrl(`WorkerRouteDetail?id=${route.id}`)}
        className="block rounded-xl p-3 transition-shadow"
        style={isActive ? { background: '#201f21', border: '2px solid #e9c349' } : { background: '#1c1b1d', border: '1px solid #363436' }}
      >
        <div className="flex justify-between items-center">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 min-w-0">
              <h3 className="font-semibold truncate" style={{ color: isActive ? '#e9c349' : '#e6e1e4' }}>
                {route.folder_name}
              </h3>
              {estTimeLabel && (
                <span className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-semibold flex-shrink-0" style={{ background: 'rgba(255,255,255,0.08)', color: '#b0aab3', border: '1px solid #4a4748' }}>
                  <Clock className="w-3 h-3" style={{ color: '#8a7f87' }} />
                  {estTimeLabel}
                </span>
              )}
            </div>
            {route.run_date && (
              <p className="text-[10px] font-medium flex items-center gap-1 mt-0.5" style={{ color: '#e9c349' }}>
                📅 Run: {format(parseISO(route.run_date), 'EEE, MMM d')}
                {route.run_qualifiers && route.run_qualifiers.length > 0 && (
                  <span className="ml-0.5"><QualifierBadges badges={route.run_qualifiers} size="small" /></span>
                )}
              </p>
            )}
            <p className="text-xs" style={{ color: '#8a7f87' }}>
              {(route.total_addresses || 0) - (route.served_count || 0)} remaining
            </p>
          </div>
          <div className="text-right flex-shrink-0 ml-2">
            {isActive && (
              <span className="text-[10px] px-2 py-0.5 rounded-full font-bold" style={{ background: '#e9c349', color: '#0F0B10' }}>
                ACTIVE
              </span>
            )}
            {route.due_date && (
              <p className="text-[10px] mt-1" style={{ color: isActive ? '#e9c349' : '#8a7f87' }}>
                Due: {format(new Date(route.due_date), 'M/d')}
              </p>
            )}
            {route.first_attempt_date && route.minimum_days_spread && (
              <p className="text-[10px]" style={{ color: isActive ? '#e9c349' : '#8a7f87' }}>
                Spread: {format(addDays(new Date(route.first_attempt_date), route.minimum_days_spread), 'M/d')}
              </p>
            )}
          </div>
        </div>
      </Link>
    );
  };

  return (
    <div className="mb-6">
      <div className="mb-3">
        <h2 className="text-xl font-bold" style={{ color: '#e6e1e4' }}>My Routes</h2>
      </div>

      {doableRoutes.length === 0 ? (
        <div className="rounded-xl p-8 text-center" style={{ background: '#1c1b1d', border: '1px dashed #363436' }}>
          <MapPin className="w-10 h-10 mx-auto mb-2" style={{ color: '#363436' }} />
          <p style={{ color: '#8a7f87' }}>No routes</p>
        </div>
      ) : (
        <div className="space-y-1">
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
                <div className="flex items-center gap-2 px-3 py-2 bg-purple-600 rounded-lg mt-3 mb-2">
                  <Calendar className="w-4 h-4 text-white flex-shrink-0" />
                  <span className="text-sm font-bold text-white truncate">{dayLabel}</span>
                </div>
                <div className="space-y-2">
                  {groups[dateKey].map(route => renderRouteCard(route))}
                </div>
              </div>
            );
          })}

          {groupKeys.length > 0 && unscheduled.length > 0 && (
            <p className="text-xs font-semibold text-gray-400 mt-4 mb-2 px-1">Unscheduled</p>
          )}
          <div className="space-y-2">
            {unscheduled.map(route => renderRouteCard(route))}
          </div>
        </div>
      )}
    </div>
  );
}