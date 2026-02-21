import React, { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { Loader2 } from 'lucide-react';

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
  'AddressDetail',
  'EditRoute'
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
  'ReceiptDetail'
];

// Known shared pages that both roles can access
const sharedPages = [
  'Chat', 
  'ReceiptDetail', 
  'ComboRouteSelection',
  'ScanDocumentType',
  'ScanCamera',
  'ScanPreview',
  'ScanRouteSetup',
  'ScanVerify'
];

export default function Layout({ children, currentPageName }) {
  const navigate = useNavigate();
  const [hasRedirected, setHasRedirected] = useState(false);
  
  // Check for fresh app launch (PWA or new session)
  useEffect(() => {
    const lastSession = sessionStorage.getItem('appSessionActive');
    if (!lastSession) {
      // Fresh launch - mark session and redirect to dashboard
      sessionStorage.setItem('appSessionActive', 'true');
      sessionStorage.setItem('freshLaunch', 'true');
    }
  }, []);
  
  const { data: user, isLoading } = useQuery({
    queryKey: ['currentUser'],
    queryFn: async () => {
      try {
        const isAuthenticated = await base44.auth.isAuthenticated();
        if (!isAuthenticated) {
          return null;
        }
        return await base44.auth.me();
      } catch (err) {
        console.warn('Auth check failed:', err);
        return null;
      }
    },
    retry: 1,
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false
  });

  // Compute role flags
  const isBoss = user?.role === 'boss' || user?.role === 'admin';
  const isWorker = user?.role === 'server';
  const isOnBossPage = bossPages.includes(currentPageName);
  const isOnWorkerPage = workerPages.includes(currentPageName);

  // Handle login redirect for unauthenticated users
  useEffect(() => {
    if (isLoading || user || hasRedirected) return;

    const currentPath = window.location.pathname;
    
    // Skip if on auth-related path
    if (currentPath.includes('auth') || currentPath === '/login' || currentPath === '/Login') {
      return;
    }

    // Check for redirect loop prevention
    const lastRedirectTime = sessionStorage.getItem('lastLoginRedirect');
    const now = Date.now();

    if (!lastRedirectTime || (now - parseInt(lastRedirectTime)) > 5000) {
      setHasRedirected(true);
      sessionStorage.setItem('lastLoginRedirect', now.toString());
      base44.auth.redirectToLogin(currentPath + window.location.search);
    }
  }, [isLoading, user, hasRedirected]);

  // Handle role-based navigation
  useEffect(() => {
    if (isLoading || !user) return;

    // Clear redirect tracking on successful auth
    sessionStorage.removeItem('lastLoginRedirect');

    // Check for fresh launch - always go to dashboard
    const freshLaunch = sessionStorage.getItem('freshLaunch');
    if (freshLaunch) {
      sessionStorage.removeItem('freshLaunch');
      const dashboardUrl = isBoss ? '/BossDashboard' : '/WorkerHome';
      if (window.location.pathname !== dashboardUrl) {
        navigate(dashboardUrl, { replace: true });
        return;
      }
    }

    // Determine redirect target
    let redirectTo = null;

    // If on root/empty page or unknown page, redirect based on role
    if (!currentPageName || currentPageName === '' || currentPageName === 'Home' || currentPageName === 'Index' ||
        (!isOnBossPage && !isOnWorkerPage && !sharedPages.includes(currentPageName))) {
      redirectTo = isBoss ? '/BossDashboard' : '/WorkerHome';
    }
    // Server trying to access boss pages
    else if (isWorker && isOnBossPage) {
      redirectTo = '/WorkerHome';
    }
    // Boss/Admin trying to access worker pages
    else if (isBoss && isOnWorkerPage && !sharedPages.includes(currentPageName)) {
      const workerToBossMap = {
        'WorkerHome': '/BossDashboard',
        'WorkerRoutes': '/BossRoutes',
        'WorkerSettings': '/BossSettings',
        'Notifications': '/BossNotifications',
        'Workers': '/BossWorkers',
        'WorkerRouteDetail': '/BossRouteDetail',
        'WorkerStats': '/Analytics',
        'WorkerVacationRequest': '/VacationRequests'
      };
      redirectTo = workerToBossMap[currentPageName] || '/BossDashboard';
    }

    if (redirectTo) {
      navigate(redirectTo, { replace: true });
    }
  }, [isLoading, user, currentPageName, isBoss, isWorker, isOnBossPage, isOnWorkerPage, navigate]);

  // Show loading while checking auth
  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
      </div>
    );
  }

  // Show loading for unauthenticated users (while redirect happens)
  if (!user) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
      </div>
    );
  }

  // Check if we should show loading while redirecting
  const needsRedirect = 
    (!currentPageName || currentPageName === '' || currentPageName === 'Home' || currentPageName === 'Index' ||
      (!isOnBossPage && !isOnWorkerPage && !sharedPages.includes(currentPageName))) ||
    (isWorker && isOnBossPage) ||
    (isBoss && isOnWorkerPage && !sharedPages.includes(currentPageName));

  if (needsRedirect) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
      </div>
    );
  }

  return children;
}