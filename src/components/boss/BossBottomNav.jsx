import React from 'react';
import { Link } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import { LayoutDashboard, MapPin, Users, Settings, Camera } from 'lucide-react';

const leftNavItems = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard, page: 'BossDashboard' },
  { id: 'routes', label: 'Routes', icon: MapPin, page: 'BossRoutes' }
];

const rightNavItems = [
  { id: 'workers', label: 'Workers', icon: Users, page: 'BossWorkers' },
  { id: 'settings', label: 'Settings', icon: Settings, page: 'BossSettings' }
];

export default function BossBottomNav({ currentPage }) {
  const isScanActive = currentPage === 'ScanDocumentType' || currentPage === 'ScanCamera' || 
                       currentPage === 'ScanPreview' || currentPage === 'ScanRouteSetup';

  return (
    <nav className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 px-2 py-2 z-50">
      <div className="max-w-lg mx-auto flex justify-around items-end">
        {/* Left nav items */}
        {leftNavItems.map((item) => {
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

        {/* Center Scan Button */}
        <Link
          to={createPageUrl('ScanDocumentType')}
          className="flex flex-col items-center -mt-4"
        >
          <div 
            className={`w-14 h-14 rounded-full flex items-center justify-center border-4 border-white transition-all ${
              isScanActive 
                ? 'bg-orange-600 ring-2 ring-orange-300' 
                : 'bg-orange-500 hover:bg-orange-600'
            }`}
            style={{ 
              boxShadow: '0 4px 12px rgba(249, 115, 22, 0.4)',
              marginBottom: '-4px'
            }}
          >
            <Camera className="w-7 h-7 text-white" />
          </div>
          <span className={`text-xs font-medium mt-1 ${
            isScanActive ? 'text-orange-600' : 'text-orange-500'
          }`}>
            Scan
          </span>
        </Link>

        {/* Right nav items */}
        {rightNavItems.map((item) => {
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