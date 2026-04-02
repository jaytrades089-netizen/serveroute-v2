import React from 'react';
import { Link } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import { Link2, Clock, CheckCircle, CalendarDays } from 'lucide-react';

const topStats = [
  { 
    id: 'active', 
    label: 'Routes', 
    icon: Link2, 
    bgColor: 'bg-[#201f21]', 
    textColor: 'text-[#e9c349]',
    link: 'WorkerRoutes'
  },
  { 
    id: 'addresses', 
    label: 'Addresses', 
    icon: Clock, 
    bgColor: 'bg-[#201f21]', 
    textColor: 'text-[#e5b9e1]',
    link: 'WorkerAddresses'
  },
  { 
    id: 'served', 
    label: 'Served', 
    icon: CheckCircle, 
    bgColor: 'bg-[#1c1b1d]',
    textColor: 'text-[#e9c349]',
    link: 'WorkerPayout'
  }
];

export default function StatBoxes({ activeRoutes = 0, addresses = 0, served = 0, dueSoon = 0 }) {
  const values = {
    active: activeRoutes,
    addresses: addresses,
    served: served
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
              className={`${stat.bgColor} rounded-t-xl p-3 text-center hover:opacity-90 transition-opacity cursor-pointer`}
            >
              <Icon className={`w-5 h-5 mx-auto mb-1 ${stat.textColor}`} />
              <div className={`text-2xl font-bold ${stat.textColor}`}>
                {values[stat.id]}
              </div>
              <div className="text-xs font-medium" style={{ color: '#8a7f87' }}>
                {stat.label}
              </div>
            </Link>
          );
        })}
      </div>

      {/* Due Soon bar underneath */}
      <Link
        to={createPageUrl('WorkerRoutes?filter=due-soon')}
        className="block rounded-b-xl px-4 py-2.5 hover:opacity-90 transition-opacity cursor-pointer"
        style={{ background: '#201f21', border: '1px solid #363436', borderTop: 'none' }}
      >
        <div className="flex items-center justify-center gap-2">
          <CalendarDays className="w-4 h-4" style={{ color: '#e5b9e1' }} />
          <span className="font-semibold text-sm" style={{ color: '#e5b9e1' }}>Due Soon</span>
          <span className="text-xs" style={{ color: '#8a7f87' }}>— {dueSoon} upcoming</span>
        </div>
      </Link>
    </div>
  );
}