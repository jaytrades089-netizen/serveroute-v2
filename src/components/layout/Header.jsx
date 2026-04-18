import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import { FileText, Bell } from 'lucide-react';

export default function Header({ user, unreadCount = 0, actionButton = null }) {
  const [now, setNow] = useState(new Date());

  useEffect(() => {
    const interval = setInterval(() => setNow(new Date()), 60000);
    return () => clearInterval(interval);
  }, []);

  const dateStr = now.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }).toUpperCase();
  const timeStr = now.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });

  return (
    <div style={{ position: 'sticky', top: 0, zIndex: 40 }}>
    <header style={{
      background: 'rgba(15,11,16,0.55)',
      backdropFilter: 'blur(20px)',
      WebkitBackdropFilter: 'blur(20px)',
      color: '#e6e1e4',
      borderBottom: 'none',
      padding: '12px 16px',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
    }}>
      <div className="flex items-center gap-1.5 min-w-0">
        <FileText className="w-5 h-5 flex-shrink-0" style={{ color: '#e5b9e1' }} />
        <span className="font-bold text-base leading-none truncate" style={{ color: '#E6E1E4' }}>ServeRoute</span>
      </div>
      
      <div className="flex items-center gap-1.5 ml-auto min-w-0">
        <span className="font-bold text-sm leading-none whitespace-nowrap" style={{ color: '#E6E1E4' }}>{dateStr}&nbsp;&nbsp;{timeStr}</span>
        {actionButton}
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
    </div>
  );
}