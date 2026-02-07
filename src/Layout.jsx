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
  'BossRouteDetail',
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
  'WorkerDetail',
  'ReceiptQueue',
  'ReceiptReview',
  'ActivityLog',
  'Analytics',
  'DCNUpload',
  'DCNMatching',
  'DCNBatchDetail',
  'AddressQuestionDetail',
  'AddressDetail'
];

// Server/Worker pages
const workerPages = [
  'WorkerHome',
  'WorkerRoutes',
  'WorkerRouteDetail',
  'WorkerAddresses',
  'WorkerMap',
  'WorkerReceipts',
  'WorkerPayout',
  'WorkerSettings',
  'WorkerStats',
  'WorkerVacationRequest',
  'Workers',
  'Notifications',
  'ComboRouteSelection',
  'SubmitReceipt',
  'RouteOptimization',
  'ReceiptDetail'
];

export default function Layout({ children, currentPageName }) {
  const { data: user, isLoading, isError, error } = useQuery({
    queryKey: ['currentUser'],
    queryFn: async () => {
      const isAuthenticated = await base44.auth.isAuthenticated();
      if (!isAuthenticated) {
        return null;
      }
      return base44.auth.me();
    },
    retry: false,
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false
  });

  // Show loading while checking auth
  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
      </div>
    );
  }

  // If not logged in, redirect to Base44's login
  if (!user) {
    const currentPath = window.location.pathname;
    
    // If user is on /login (which doesn't exist), clear session and redirect to home
    if (currentPath === '/login' || currentPath === '/Login') {
      sessionStorage.removeItem('lastLoginRedirect');
      window.location.replace('/WorkerHome');
      return (
        <div className="min-h-screen bg-gray-50 flex items-center justify-center">
          <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
        </div>
      );
    }
    
    // Don't redirect if already in auth flow
    if (currentPath.includes('auth')) {
      return (
        <div className="min-h-screen bg-gray-50 flex items-center justify-center">
          <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
        </div>
      );
    }

    // Use React effect pattern to avoid redirect loops
    const lastRedirectTime = sessionStorage.getItem('lastLoginRedirect');
    const now = Date.now();

    // Only redirect if we haven't redirected in the last 5 seconds
    if (!lastRedirectTime || (now - parseInt(lastRedirectTime)) > 5000) {
      sessionStorage.setItem('lastLoginRedirect', now.toString());
      // Use Base44's built-in login - pass current location for redirect back
      base44.auth.redirectToLogin(currentPath + window.location.search);
    }

    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
      </div>
    );
  }
  
  // Clear redirect tracking on successful auth
  sessionStorage.removeItem('lastLoginRedirect');

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
      'WorkerRouteDetail': 'BossRouteDetail',
      'WorkerStats': 'Analytics',
      'WorkerVacationRequest': 'VacationRequests',
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