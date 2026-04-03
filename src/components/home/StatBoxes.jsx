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
    <div className="mb-3 -mt-1">
      {/* Top row: Routes / Addresses / Served */}
      <div className="grid grid-cols-3 gap-2 mb-1.5">
        {topStats.map((stat) => {
          const Icon = stat.icon;
          return (
            <Link
              key={stat.id}
              to={createPageUrl(stat.link)}
              className="rounded-xl px-2 py-1.5 text-center hover:opacity-90 transition-opacity cursor-pointer"
              style={{
                background: 'rgba(14, 20, 44, 0.55)',
                backdropFilter: 'blur(20px)',
                WebkitBackdropFilter: 'blur(20px)',
                border: '1px solid rgba(255,255,255,0.18)'
              }}
            >
              <div className="text-xl font-bold" style={{ color: '#E6E1E4' }}>
                {values[stat.id]}
              </div>
              <div className="text-[11px]" style={{ color: '#9CA3AF' }}>
                {stat.label}
              </div>
            </Link>
          );
        })}
      </div>

      {/* Due Soon bar */}
      <Link
        to={createPageUrl('WorkerRoutes?filter=due-soon')}
        className="block rounded-xl px-4 py-1.5 hover:opacity-90 transition-opacity cursor-pointer"
        style={{
          background: 'rgba(14, 20, 44, 0.55)',
          backdropFilter: 'blur(20px)',
          WebkitBackdropFilter: 'blur(20px)',
          border: '1px solid rgba(255,255,255,0.18)'
        }}
      >
        <div className="flex items-center justify-center gap-2">
          <CalendarDays className="w-3.5 h-3.5" style={{ color: '#e5b9e1' }} />
          <span className="font-semibold text-[13px]" style={{ color: '#E6E1E4' }}>Due Soon</span>
          <span className="text-[11px]" style={{ color: '#9CA3AF' }}>— {dueSoon} upcoming</span>
        </div>
      </Link>
    </div>
  );
}