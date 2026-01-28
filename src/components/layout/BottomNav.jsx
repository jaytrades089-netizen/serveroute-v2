import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import { Home, MapPin, Users, Settings } from 'lucide-react';

const navItems = [
  { id: 'home', label: 'Dashboard', icon: Home, page: 'WorkerHome' },
  { id: 'routes', label: 'Routes', icon: MapPin, page: 'WorkerRoutes' },
  { id: 'workers', label: 'Workers', icon: Users, page: 'Workers' },
  { id: 'settings', label: 'Settings', icon: Settings, page: 'WorkerSettings' }
];

export default function BottomNav({ currentPage }) {
  return (
    <nav className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 px-4 py-2 z-50">
      <div className="max-w-lg mx-auto flex justify-around">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = currentPage === item.page;
          
          return (
            <Link
              key={item.id}
              to={createPageUrl(item.page)}
              className={`flex flex-col items-center py-2 px-3 rounded-lg transition-colors ${
                isActive 
                  ? 'text-blue-600' 
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              <Icon className="w-6 h-6" />
              <span className="text-xs mt-1 font-medium">{item.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}