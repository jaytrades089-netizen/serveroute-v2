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
    retry: false,
    staleTime: 5 * 60 * 1000, // Cache for 5 minutes to prevent refetching
    refetchOnWindowFocus: false // Don't refetch on window focus
  });

  // Show loading while checking auth
  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
      </div>
    );
  }

  // If not logged in, redirect to login - but only once to avoid loops
  if (isError || !user) {
    // Check if we're already redirecting to prevent loops
    const isAlreadyRedirecting = sessionStorage.getItem('redirectingToLogin');
    if (!isAlreadyRedirecting) {
      sessionStorage.setItem('redirectingToLogin', 'true');
      // Clear the flag after a short delay in case redirect fails
      setTimeout(() => sessionStorage.removeItem('redirectingToLogin'), 5000);
      base44.auth.redirectToLogin(window.location.pathname + window.location.search);
    }
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
      </div>
    );
  }
  
  // Clear redirect flag on successful auth
  sessionStorage.removeItem('redirectingToLogin');

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

  // Boss/Admin trying to access worker pages - redirect to boss equivalent
  if (isBoss && isOnWorkerPage) {
    const workerToBossMap = {
      'WorkerHome': 'BossDashboard',
      'WorkerRoutes': 'BossRoutes',
      'WorkerSettings': 'BossSettings',
      'Notifications': 'BossNotifications',
      'Workers': 'BossWorkers',
      'Chat': 'Chat' // Chat is shared, no redirect needed
    };

    const bossPage = workerToBossMap[currentPageName];
    if (bossPage && bossPage !== currentPageName) {
      window.location.href = '/' + bossPage;
      return null;
    }
  }

  return children;
}