import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Loader2 } from 'lucide-react';

// Pages that don't require auth check in layout
const publicPages = [];

// Boss pages that require boss/admin role
const bossPages = [
  'BossDashboard',
  'BossRoutes', 
  'BossTeam',
  'BossSettings',
  'AddressImport',
  'AddressPool',
  'AddAddress',
  'EditAddress',
  'CreateRoute',
  'RouteEditor',
  'AssignRoute',
  'UnassignRoute',
  'ReassignRoute'
];

// Server/Worker pages
const workerPages = [
  'WorkerHome',
  'WorkerRoutes',
  'WorkerRouteDetail',
  'WorkerAddresses',
  'WorkerPayout',
  'WorkerSettings',
  'Workers',
  'Notifications'
];

export default function Layout({ children, currentPageName }) {
  const { data: user, isLoading } = useQuery({
    queryKey: ['currentUser'],
    queryFn: () => base44.auth.me(),
    retry: false
  });

  // Show loading while checking auth
  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
      </div>
    );
  }

  // Redirect logic based on role and page
  if (user) {
    const isBoss = user.role === 'boss' || user.role === 'admin';
    const isOnBossPage = bossPages.includes(currentPageName);
    const isOnWorkerPage = workerPages.includes(currentPageName);

    // Boss trying to access worker pages - allow (they might want to see worker view)
    // Server trying to access boss pages - redirect to worker home
    if (!isBoss && isOnBossPage) {
      window.location.href = '/WorkerHome';
      return null;
    }
  }

  return children;
}