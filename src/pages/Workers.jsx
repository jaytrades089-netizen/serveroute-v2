import React from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import Header from '../components/layout/Header';
import BottomNav from '../components/layout/BottomNav';
import { Loader2, Users, Lock } from 'lucide-react';

export default function Workers() {
  const { data: user, isLoading } = useQuery({
    queryKey: ['currentUser'],
    queryFn: () => base44.auth.me()
  });

  const { data: notifications = [] } = useQuery({
    queryKey: ['notifications', user?.id],
    queryFn: async () => {
      if (!user?.id) return [];
      return base44.entities.Notification.filter({ user_id: user.id, read: false });
    },
    enabled: !!user?.id
  });

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
      </div>
    );
  }

  const isBossOrAdmin = user?.role === 'boss' || user?.role === 'admin';

  return (
    <div className="min-h-screen bg-gray-50 pb-20">
      <Header user={user} unreadCount={notifications.length} />
      
      <main className="px-4 py-6 max-w-lg mx-auto">
        <h1 className="text-2xl font-bold text-gray-900 mb-4">Workers</h1>

        {!isBossOrAdmin ? (
          <div className="bg-gray-100 rounded-xl p-8 text-center">
            <Lock className="w-10 h-10 text-gray-300 mx-auto mb-2" />
            <p className="text-gray-500">Only bosses and admins can view team members</p>
          </div>
        ) : (
          <div className="bg-gray-100 rounded-xl p-8 text-center">
            <Users className="w-10 h-10 text-gray-300 mx-auto mb-2" />
            <p className="text-gray-500">Team management coming in Phase 2</p>
          </div>
        )}
      </main>

      <BottomNav currentPage="Workers" />
    </div>
  );
}