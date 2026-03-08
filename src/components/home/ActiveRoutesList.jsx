import React from 'react';
import { Link } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import { ChevronRight, MapPin, Calendar } from 'lucide-react';
import { format, addDays, parseISO } from 'date-fns';
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

  return (
    <div className="mb-6">
      <div className="mb-3">
        <h2 className="text-xl font-bold text-gray-900">My Routes</h2>
      </div>

      {doableRoutes.length === 0 ? (
        <div className="bg-gray-50 rounded-xl p-8 text-center">
          <MapPin className="w-10 h-10 text-gray-300 mx-auto mb-2" />
          <p className="text-gray-500">No routes</p>
        </div>
      ) : (
        <div className="space-y-2">
          {doableRoutes.map((route) => {
            const isActive = route.status === 'active';
            return (
              <Link
                key={route.id}
                to={createPageUrl(`WorkerRouteDetail?id=${route.id}`)}
                className={`block rounded-xl p-3 transition-shadow ${
                  isActive 
                    ? 'bg-blue-50 border-2 border-blue-400 shadow-sm' 
                    : 'bg-white border border-gray-200 hover:shadow-md'
                }`}
              >
                <div className="flex justify-between items-center">
                  <div className="flex-1 min-w-0">
                    <h3 className={`font-semibold truncate ${isActive ? 'text-blue-900' : 'text-gray-900'}`}>
                      {route.folder_name}
                    </h3>
                    {route.run_date && (
                      <p className="text-[10px] text-blue-600 font-medium flex items-center gap-1 mt-0.5">
                        📅 Run: {format(parseISO(route.run_date), 'EEE, MMM d')}
                        {route.run_qualifiers && route.run_qualifiers.length > 0 && (
                          <span className="ml-0.5"><QualifierBadges badges={route.run_qualifiers} size="small" /></span>
                        )}
                      </p>
                    )}
                    <p className={`text-xs ${isActive ? 'text-blue-600' : 'text-gray-500'}`}>
                      {(route.total_addresses || 0) - (route.served_count || 0)} remaining
                    </p>
                  </div>
                  <div className="text-right flex-shrink-0 ml-2">
                    {isActive && (
                      <span className="text-[10px] px-2 py-0.5 rounded-full font-bold bg-blue-500 text-white">
                        ACTIVE
                      </span>
                    )}
                    {route.due_date && (
                      <p className={`text-[10px] mt-1 ${isActive ? 'text-blue-600' : 'text-gray-500'}`}>
                        Due: {format(new Date(route.due_date), 'M/d')}
                      </p>
                    )}
                    {route.first_attempt_date && route.minimum_days_spread && (
                      <p className={`text-[10px] ${isActive ? 'text-blue-500' : 'text-gray-400'}`}>
                        Spread: {format(addDays(new Date(route.first_attempt_date), route.minimum_days_spread), 'M/d')}
                      </p>
                    )}
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}