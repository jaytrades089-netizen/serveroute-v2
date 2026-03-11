import React from 'react';
import { Link } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import { FileText, Bell } from 'lucide-react';

export default function Header({ user, unreadCount = 0, actionButton = null, showArchived, onArchiveToggle }) {
  const initials = user?.full_name
    ? user.full_name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)
    : 'U';

  return (
    <header className="bg-blue-500 text-white px-4 py-3 flex items-center justify-between sticky top-0 z-40">
      <div className="flex items-center gap-2">
        <FileText className="w-6 h-6" />
        <span className="font-bold text-lg">ServeRoute</span>
        <span className="font-bold text-lg opacity-80">{new Date().toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}</span>
      </div>
      
      <div className="flex items-center gap-2 ml-auto">
        {actionButton}
        {onArchiveToggle && (
          <button
            onClick={onArchiveToggle}
            className={`w-9 h-9 rounded-lg flex items-center justify-center transition-colors font-bold text-sm ${
              showArchived
                ? 'bg-green-500 text-white'
                : 'bg-white/20 text-white hover:bg-white/30'
            }`}
          >
            A
          </button>
        )}
        <Link to={createPageUrl('Notifications')} className="relative">
          <div className="w-9 h-9 rounded-lg bg-white/20 hover:bg-white/30 flex items-center justify-center transition-colors">
            <Bell className="w-5 h-5" />
          </div>
          {unreadCount > 0 && (
            <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center">
              {unreadCount > 9 ? '9+' : unreadCount}
            </span>
          )}
        </Link>
      </div>
    </header>
  );
}