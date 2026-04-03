import React from 'react';
import { Link } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import { Home, MapPin, Settings, Camera, MessageCircle } from 'lucide-react';

const leftNavItems = [
  { id: 'home', label: 'Dashboard', icon: Home, page: 'WorkerHome' },
  { id: 'routes', label: 'Routes', icon: MapPin, page: 'WorkerRoutes' }
];

const rightNavItems = [
  { id: 'chat', label: 'Chat', icon: MessageCircle, page: 'Chat' },
  { id: 'settings', label: 'Settings', icon: Settings, page: 'WorkerSettings' }
];

const hiddenPages = [
  'WorkerRouteDetail',
  'WorkerComboRouteDetail',
  'ComboRouteReview'
];

export default function BottomNav({ currentPage }) {
  const isScanActive = currentPage === 'ScanDocumentType' || currentPage === 'ScanCamera' || 
                       currentPage === 'ScanPreview' || currentPage === 'ScanRouteSetup';

  if (hiddenPages.includes(currentPage)) return null;

  return (
    <nav className="frosted-glass-light fixed bottom-0 left-0 right-0 px-2 py-2 z-50 bottom-nav-bar">
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
                  ? 'text-[#e5b9e1]' 
                  : 'text-[#6B7280]'
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
            className={`w-14 h-14 rounded-2xl flex items-center justify-center transition-all ${
              isScanActive 
                ? 'bg-[#d4aa33] ring-2 ring-[#e9c349]/50' 
                : 'bg-[#e9c349] hover:bg-[#d4aa33]'
            }`}
            style={{ 
              boxShadow: '0 4px 14px rgba(233,195,73,0.50)',
              marginBottom: '-4px'
            }}
          >
            <Camera className="w-7 h-7 text-white" />
          </div>
          <span className="text-xs font-medium mt-1 text-[#e9c349]">
            SCAN
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
                  ? 'text-[#e5b9e1]' 
                  : 'text-[#6B7280]'
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