import React from 'react';
import { Link } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import { FileText, Bell } from 'lucide-react';

export default function Header({ user, unreadCount = 0 }) {
  const initials = user?.full_name
    ? user.full_name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)
    : 'U';

  return (
    <header className="bg-blue-500 text-white px-4 py-3 flex items-center justify-between">
      <div className="flex items-center gap-2">
        <FileText className="w-6 h-6" />
        <span className="font-bold text-lg">ServeRoute</span>
        <span className="text-xs bg-white/20 px-2 py-0.5 rounded-full">Worker</span>
      </div>
      
      <div className="flex items-center gap-3">
        <Link to={createPageUrl('Notifications')} className="relative">
          <Bell className="w-6 h-6" />
          {unreadCount > 0 && (
            <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center">
              {unreadCount > 9 ? '9+' : unreadCount}
            </span>
          )}
        </Link>
        
        <Link 
          to={createPageUrl('WorkerSettings')}
          className="w-9 h-9 bg-white text-blue-600 rounded-full flex items-center justify-center font-bold text-sm"
        >
          {initials}
        </Link>
      </div>
    </header>
  );
}