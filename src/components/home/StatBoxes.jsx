import React from 'react';
import { Link } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import { Link2, Clock, CheckCircle, CalendarDays } from 'lucide-react';

const topStats = [
  { id: 'active', label: 'Routes', icon: Link2, link: 'WorkerRoutes' },
  { id: 'addresses', label: 'Addresses', icon: Clock, link: 'WorkerAddresses' },
  { id: 'served', label: 'Served', icon: CheckCircle, link: 'WorkerPayout' },
];

export default function StatBoxes({ activeRoutes = 0, addresses = 0, served = 0, dueSoon = 0 }) {
  const values = {
    active: activeRoutes,
    addresses: addresses,
    served: served,
  };

  return (
    <div className="mb-6">
      {/* Top row: Routes / Addresses / Served */}
      <div className="grid grid-cols-3 gap-2">
        {topStats.map((stat) => {
          const Icon = stat.icon;
          return (
            <Link
              key={stat.id}
              to={createPageUrl(stat.link)}
              className="frosted-glass rounded-t-xl p-3 text-center hover:opacity-90 transition-opacity cursor-pointer"
            >
              <Icon className="w-5 h-5 mx-auto mb-1" style={{ color: '#e5b9e1' }} />
              <div className="text-2xl font-bold" style={{ color: '#E6E1E4' }}>
                {values[stat.id]}
              </div>
              <div className="text-xs" style={{ color: '#9CA3AF' }}>
                {stat.label}
              </div>
            </Link>
          );
        })}
      </div>

      {/* Due Soon bar */}
      <Link
        to={createPageUrl('WorkerRoutes?filter=due-soon')}
        className="frosted-glass block rounded-b-xl px-4 py-2.5 hover:opacity-90 transition-opacity cursor-pointer"
      >
        <div className="flex items-center justify-center gap-2">
          <CalendarDays className="w-4 h-4" style={{ color: '#e5b9e1' }} />
          <span className="font-semibold text-sm" style={{ color: '#E6E1E4' }}>Due Soon</span>
          <span className="text-xs" style={{ color: '#9CA3AF' }}>— {dueSoon} upcoming</span>
        </div>
      </Link>
    </div>
  );
}