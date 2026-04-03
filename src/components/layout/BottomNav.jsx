import React from 'react';
import { Link } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import { Home, MapPin, Settings, Camera, MessageCircle } from 'lucide-react';

const leftNavItems = [
{ id: 'home', label: 'Dashboard', icon: Home, page: 'WorkerHome' },
{ id: 'routes', label: 'Routes', icon: MapPin, page: 'WorkerRoutes' }];


const rightNavItems = [
{ id: 'chat', label: 'Chat', icon: MessageCircle, page: 'Chat' },
{ id: 'settings', label: 'Settings', icon: Settings, page: 'WorkerSettings' }];


const hiddenPages = [
'WorkerRouteDetail',
'WorkerComboRouteDetail',
'ComboRouteReview'];


export default function BottomNav({ currentPage }) {
  const isScanActive = currentPage === 'ScanDocumentType' || currentPage === 'ScanCamera' ||
  currentPage === 'ScanPreview' || currentPage === 'ScanRouteSetup';

  if (hiddenPages.includes(currentPage)) return null;

  return (
    <nav style={{
      position: 'fixed',
      bottom: 0,
      left: 0,
      right: 0,
      background: '#0F0B10',
      borderTop: 'none',
      paddingLeft: 8,
      paddingRight: 8,
      paddingTop: 8,
      paddingBottom: 8,
      zIndex: 50
    }} className="px-2 py-2 opacity-100 frosted-glass-light fixed bottom-0 left-0 right-0 z-50 bottom-nav-bar">
      <div style={{ height: 1, background: 'linear-gradient(to right, rgba(233,195,73,0.55), rgba(233,195,73,0.0))', marginBottom: 8 }} />
      <div className="max-w-lg mx-auto flex justify-around items-end">
        {/* Left nav items */}
        {leftNavItems.map((item) => {
          const Icon = item.icon;
          const isActive = currentPage === item.page;

          return (
            <Link
              key={item.id}
              to={createPageUrl(item.page)}
              style={{
                color: isActive ? '#e9c349' : '#8a7f87'
              }}
              className="flex flex-col items-center py-2 px-3 rounded-lg transition-colors">
              
              <Icon className="w-6 h-6" />
              <span className="text-xs mt-1 font-medium">{item.label}</span>
            </Link>);

        })}

        {/* Center Scan Button */}
        <Link
          to={createPageUrl('ScanDocumentType')}
          className="flex flex-col items-center -mt-4">
          
          <div
            className="rounded-full flex items-center justify-center border-4 transition-all"
            style={{
              width: 56,
              height: 56,
              borderColor: '#0F0B10',
              background: isScanActive ? '#e9c349' : '#e9c349',
              boxShadow: '0 4px 12px rgba(233, 195, 73, 0.4)',
              marginBottom: -4,
              animation: 'pulse-glow 2s infinite'
            }}>
            
            <Camera className="w-7 h-7" style={{ color: '#0F0B10' }} />
          </div>
          <span style={{
            fontSize: 12,
            fontWeight: 500,
            marginTop: 4,
            color: isScanActive ? '#e9c349' : '#8a7f87'
          }}>
            Bulk Scan
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
              style={{
                color: isActive ? '#e9c349' : '#8a7f87'
              }}
              className="flex flex-col items-center py-2 px-3 rounded-lg transition-colors">
              
              <Icon className="w-6 h-6" />
              <span className="text-xs mt-1 font-medium">{item.label}</span>
            </Link>);

        })}
      </div>
    </nav>);

}