import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import { FileText, Bell } from 'lucide-react';

export default function Header({ user, unreadCount = 0, actionButton = null, showArchived, onArchiveToggle }) {
  const [now, setNow] = useState(new Date());

  useEffect(() => {
    const interval = setInterval(() => setNow(new Date()), 60000);
    return () => clearInterval(interval);
  }, []);

  const dateStr = now.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }).toUpperCase();
  const timeStr = now.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });

  return (
    <>
    <header style={{
      background: '#0F0B10',
      color: '#e6e1e4',
      borderBottom: 'none',
      padding: '12px 16px',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      position: 'sticky',
      top: 0,
      zIndex: 40,
    }}>
      <div className="flex items-center gap-2">
        <FileText className="w-6 h-6" style={{ color: '#e5b9e1' }} />
        <span className="font-bold text-lg" style={{ color: '#E6E1E4' }}>ServeRoute</span>
      </div>
      
      <div className="flex items-center gap-2 ml-auto">
        <span className="font-bold text-lg" style={{ color: '#E6E1E4' }}>{dateStr}&nbsp;&nbsp;{timeStr}</span>
        {actionButton}
        {onArchiveToggle && (
          <button
            onClick={onArchiveToggle}
            className="font-bold text-sm rounded-lg transition-colors"
            style={{
              width: 36,
              height: 36,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              background: showArchived ? '#502f50' : 'rgba(255,255,255,0.08)',
              color: showArchived ? '#e5b9e1' : '#8a7f87',
            }}
          >
            A
          </button>
        )}
        <Link to={createPageUrl('Notifications')} className="relative">
          <div className="w-9 h-9 rounded-lg transition-colors flex items-center justify-center" style={{
            background: 'rgba(255,255,255,0.08)',
            cursor: 'pointer',
          }} onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.15)'} onMouseLeave={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.08)'}>
            <Bell className="w-5 h-5" style={{ color: '#e6e1e4' }} />
          </div>
          {unreadCount > 0 && (
            <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center">
              {unreadCount > 9 ? '9+' : unreadCount}
            </span>
          )}
        </Link>
      </div>
    </header>
    <div style={{ height: 1, background: 'linear-gradient(to right, rgba(233,195,73,0.55), rgba(233,195,73,0.0))' }} />
  </>
  );
}