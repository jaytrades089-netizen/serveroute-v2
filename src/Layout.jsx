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
  'BossWorkers',
  'BossSettings',
  'BossNotifications',
  'AddressImport',
  'AddressPool',
  'AddAddress',
  'EditAddress',
  'CreateRoute',
  'RouteEditor',
  'AssignRoute',
  'UnassignRoute',
  'ReassignRoute',
  'RouteHandoff',
  'VacationRequests',
  'WorkerDetail'
];

// Server/Worker pages
const workerPages = [
  'WorkerHome',
  'WorkerRoutes',
  'WorkerRouteDetail',
  'WorkerAddresses',
  'WorkerPayout',
  'WorkerSettings',
  'WorkerStats',
  'WorkerVacationRequest',
  'Workers',
  'Notifications'
];

export default function Layout({ children, currentPageName }) {
  const { data: user, isLoading, isError } = useQuery({
    queryKey: ['currentUser'],
    queryFn: () => base44.auth.me(),
    retry: false
  });

  // Show loading while checking auth (with timeout fallback)
  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
      </div>
    );
  }

  // If not logged in, redirect to login
  if (isError || !user) {
    // Use Base44's built-in login redirect
    base44.auth.redirectToLogin(window.location.pathname + window.location.search);
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
      </div>
    );
  }

  // Redirect logic based on role and page
  const isBoss = user.role === 'boss' || user.role === 'admin';
  const isWorker = user.role === 'server';
  const isOnBossPage = bossPages.includes(currentPageName);
  const isOnWorkerPage = workerPages.includes(currentPageName);

  // Server trying to access boss pages - redirect to worker home
  if (isWorker && isOnBossPage) {
    window.location.href = '/WorkerHome';
    return null;
  }

  return children;
}