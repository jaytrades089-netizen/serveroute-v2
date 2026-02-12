import React, { useEffect } from 'react';
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
  'ReceiptDetail'
];

// Known shared pages that both roles can access
const sharedPages = ['Chat', 'ReceiptDetail', 'ComboRouteSelection'];

export default function Layout({ children, currentPageName }) {
  const navigate = useNavigate();
  
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

  // Compute role flags - always computed, even if user is null
  const isBoss = user?.role === 'boss' || user?.role === 'admin';
  const isWorker = user?.role === 'server';
  const isOnBossPage = bossPages.includes(currentPageName);
  const isOnWorkerPage = workerPages.includes(currentPageName);

  // Navigation effect - MUST be called unconditionally (before any returns)
  useEffect(() => {
    // Don't navigate if still loading or no user
    if (isLoading || !user) return;

    // If on root/empty page or unknown page, redirect based on role
    if (!currentPageName || currentPageName === '' || currentPageName === 'Home' || currentPageName === 'Index' ||
        (!isOnBossPage && !isOnWorkerPage && !sharedPages.includes(currentPageName))) {
      if (isBoss) {
        navigate('/BossDashboard', { replace: true });
      } else {
        navigate('/WorkerHome', { replace: true });
      }
      return;
    }

    // Server trying to access boss pages - redirect to worker home
    if (isWorker && isOnBossPage) {
      navigate('/WorkerHome', { replace: true });
      return;
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
        'Chat': 'Chat'
      };

      const bossPage = workerToBossMap[currentPageName];
      if (bossPage && bossPage !== currentPageName) {
        navigate('/' + bossPage, { replace: true });
      }
    }
  }, [currentPageName, isBoss, isWorker, isOnBossPage, isOnWorkerPage, navigate, isLoading, user]);

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

  // Check if we should show loading while redirecting
  const shouldRedirect = 
    (!currentPageName || currentPageName === '' || currentPageName === 'Home' || currentPageName === 'Index' ||
      (!isOnBossPage && !isOnWorkerPage && !sharedPages.includes(currentPageName))) ||
    (isWorker && isOnBossPage) ||
    (isBoss && isOnWorkerPage && currentPageName !== 'Chat' && currentPageName !== 'ComboRouteSelection');

  if (shouldRedirect) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
      </div>
    );
  }

  return children;
}