import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import { Home, Settings, Camera, MessageCircle, CalendarDays } from 'lucide-react';

const rightNavItems = [
{ id: 'settings', label: 'Settings', icon: Settings, page: 'WorkerSettings' }];

const hiddenPages = [
'WorkerRouteDetail',
'WorkerComboRouteDetail',
'ComboRouteReview'];

export default function BottomNav({ currentPage }) {
  const [showComingSoon, setShowComingSoon] = useState(null); // 'calendar' | 'chat' | null

  const isScanActive = currentPage === 'ScanDocumentType' || currentPage === 'ScanCamera' ||
  currentPage === 'ScanPreview' || currentPage === 'ScanRouteSetup';

  if (hiddenPages.includes(currentPage)) return null;

  const handleCalendarTap = () => {
    setShowComingSoon('calendar');
    setTimeout(() => setShowComingSoon(null), 2500);
  };

  const handleChatTap = () => {
    setShowComingSoon('chat');
    setTimeout(() => setShowComingSoon(null), 2500);
  };

  return (
    <>
      {/* Coming Soon Toast */}
      {showComingSoon && (
        <div style={{
          position: 'fixed',
          bottom: 90,
          left: '50%',
          transform: 'translateX(-50%)',
          background: '#502f50',
          border: '1px solid rgba(229,185,225,0.3)',
          borderRadius: 12,
          paddingTop: 10,
          paddingBottom: 10,
          paddingLeft: 20,
          paddingRight: 20,
          zIndex: 10000,
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          whiteSpace: 'nowrap',
          boxShadow: '0 4px 20px rgba(0,0,0,0.4)'
        }}>
          {showComingSoon === 'calendar'
            ? <CalendarDays style={{ color: '#e5b9e1', width: 16, height: 16 }} />
            : <MessageCircle style={{ color: '#e5b9e1', width: 16, height: 16 }} />}
          <span style={{ color: '#e5b9e1', fontSize: 14, fontWeight: 500 }}>
            {showComingSoon === 'calendar' ? 'Calendar coming soon 😊' : 'Chat coming soon 😊'}
          </span>
        </div>
      )}

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
        zIndex: 9999
      }} className="px-2 py-2 opacity-100 frosted-glass-light fixed bottom-0 left-0 right-0 z-50 bottom-nav-bar">
        <div style={{ height: 1, background: 'linear-gradient(to right, rgba(233,195,73,0.55), rgba(233,195,73,0.0))', marginBottom: 8 }} />
        <div className="max-w-lg mx-auto flex justify-around items-center">

          {/* Dash */}
          <Link
            to={createPageUrl('WorkerHome')}
            style={{ color: currentPage === 'WorkerHome' ? '#e9c349' : '#8a7f87' }}
            className="flex-1 flex flex-col items-center justify-center py-2 rounded-lg transition-colors">
            <Home className="w-6 h-6" />
            <span className="text-xs mt-1 font-medium">Dash</span>
          </Link>

          {/* Calendar — Coming Soon */}
          <button
            onClick={handleCalendarTap}
            style={{
              color: '#8a7f87',
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              padding: 0
            }}
            className="flex-1 flex flex-col items-center justify-center py-2 rounded-lg transition-colors">
            <CalendarDays className="w-6 h-6" />
            <span className="text-xs mt-1 font-medium">Calendar</span>
          </button>

          {/* Center Scan Button */}
          <Link
            to={createPageUrl('ScanDocumentType')}
            className="flex-1 flex flex-col items-center justify-center">
            <div
              className="rounded-2xl flex items-center justify-center transition-all"
              style={{
                width: 56,
                height: 56,
                borderColor: '#0F0B10',
                background: '#e9c349',
                boxShadow: '0 4px 12px rgba(233, 195, 73, 0.4)',
                marginBottom: -4,
                marginTop: -16,
                animation: 'pulse-glow 2s infinite'
              }}>
              <Camera className="w-7 h-7" style={{ color: '#0F0B10' }} />
            </div>
            <span style={{
              fontSize: 12,
              fontWeight: 500,
              marginTop: 8,
              color: isScanActive ? '#e9c349' : '#8a7f87',
              textAlign: 'center'
            }}>
              Scan
            </span>
          </Link>

          {/* Chat — Coming Soon */}
          <button
            onClick={handleChatTap}
            style={{
              color: '#8a7f87',
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              padding: 0
            }}
            className="flex-1 flex flex-col items-center justify-center py-2 rounded-lg transition-colors">
            <MessageCircle className="w-6 h-6" />
            <span className="text-xs mt-1 font-medium">Chat</span>
          </button>

          {/* Right nav items */}
          {rightNavItems.map((item) => {
            const Icon = item.icon;
            const isActive = currentPage === item.page;
            return (
              <Link
                key={item.id}
                to={createPageUrl(item.page)}
                style={{ color: isActive ? '#e9c349' : '#8a7f87' }}
                className="flex-1 flex flex-col items-center justify-center py-2 rounded-lg transition-colors">
                <Icon className="w-6 h-6" />
                <span className="text-xs mt-1 font-medium">{item.label}</span>
              </Link>
            );
          })}

        </div>
      </nav>
    </>
  );
}
