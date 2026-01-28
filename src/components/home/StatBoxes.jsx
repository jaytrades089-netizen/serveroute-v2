import React from 'react';
import { Link } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import { Link2, Clock, CheckCircle, CalendarDays } from 'lucide-react';

const stats = [
  { 
    id: 'active', 
    label: 'Active Routes', 
    icon: Link2, 
    bgColor: 'bg-blue-100', 
    textColor: 'text-blue-600',
    link: 'WorkerRoutes?filter=active'
  },
  { 
    id: 'addresses', 
    label: 'Addresses', 
    icon: Clock, 
    bgColor: 'bg-orange-100', 
    textColor: 'text-orange-600',
    link: 'WorkerAddresses'
  },
  { 
    id: 'served', 
    label: 'Served', 
    icon: CheckCircle, 
    bgColor: 'bg-green-100', 
    textColor: 'text-green-600',
    link: 'WorkerPayout'
  },
  { 
    id: 'dueSoon', 
    label: 'Due Soon', 
    icon: CalendarDays, 
    bgColor: 'bg-purple-100', 
    textColor: 'text-purple-600',
    link: 'WorkerRoutes?filter=due-soon'
  }
];

export default function StatBoxes({ activeRoutes = 0, addresses = 0, served = 0, dueSoon = 0 }) {
  const values = {
    active: activeRoutes,
    addresses: addresses,
    served: served,
    dueSoon: dueSoon
  };

  return (
    <div className="grid grid-cols-4 gap-2 mb-6">
      {stats.map((stat) => {
        const Icon = stat.icon;
        return (
          <Link
            key={stat.id}
            to={createPageUrl(stat.link)}
            className={`${stat.bgColor} rounded-xl p-3 text-center hover:opacity-90 transition-opacity cursor-pointer`}
          >
            <Icon className={`w-5 h-5 mx-auto mb-1 ${stat.textColor}`} />
            <div className={`text-2xl font-bold ${stat.textColor}`}>
              {values[stat.id]}
            </div>
            <div className="text-xs text-gray-600 font-medium">
              {stat.label}
            </div>
          </Link>
        );
      })}
    </div>
  );
}