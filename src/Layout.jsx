import React, { useEffect, useState, useRef } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { Loader2 } from 'lucide-react';
import { setupPersistence } from '@/components/utils/queryPersistence';

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
  'ComboRouteReview',
  'WorkerComboRouteDetail',
  'SubmitReceipt',
  'ReceiptDetail',
  'PayrollRecordDetail',
  'CreateScheduledServe'
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
  'ScanAddToRoute',
  'ScanVerify',
  'EditRoute',
  'EditScheduledServe'
];

export default function Layout({ children, currentPageName }) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [hasRedirected, setHasRedirected] = useState(false);
  const persistenceSetup = useRef(false);
  
  useEffect(() => {
    if (persistenceSetup.current) return;
    persistenceSetup.current = true;
    const cleanup = setupPersistence(queryClient);
    return cleanup;
  }, [queryClient]);
  
  const { data: user, isLoading } = useQuery({
    queryKey: ['currentUser'],
    queryFn: async () => {
      try {
        const isAuthenticated = await base44.auth.isAuthenticated();
        if (!isAuthenticated) {
          const localToken = localStorage.getItem('base44_access_token');
          if (localToken) return null;
          return null;
        }
        return await base44.auth.me();
      } catch (err) {
        console.warn('Auth check failed:', err);
        const localToken = localStorage.getItem('base44_access_token');
        if (localToken) {
          const cached = queryClient.getQueryData(['currentUser']);
          if (cached && cached.id) return cached;
          try {
            return await base44.auth.me();
          } catch {
            return queryClient.getQueryData(['currentUser']) || null;
          }
        }
        return null;
      }
    },
    retry: 2,
    retryDelay: 2000,
    staleTime: 4 * 60 * 60 * 1000,
    gcTime: 24 * 60 * 60 * 1000,
    refetchOnWindowFocus: false,
    refetchOnReconnect: true
  });

  const isBoss = user?.role === 'boss' || user?.role === 'admin';
  const isWorker = user?.role === 'server';
  const isOnBossPage = bossPages.includes(currentPageName);
  const isOnWorkerPage = workerPages.includes(currentPageName);

  useEffect(() => {
    if (isLoading || user || hasRedirected) return;
    const currentPath = window.location.pathname;
    if (currentPath.includes('auth') || currentPath === '/login' || currentPath === '/Login') return;
    const localToken = localStorage.getItem('base44_access_token');
    if (localToken) return;
    const lastRedirectTime = sessionStorage.getItem('lastLoginRedirect');
    const now = Date.now();
    if (!lastRedirectTime || (now - parseInt(lastRedirectTime)) > 5000) {
      setHasRedirected(true);
      sessionStorage.setItem('lastLoginRedirect', now.toString());
      base44.auth.redirectToLogin(currentPath + window.location.search);
    }
  }, [isLoading, user, hasRedirected]);

  useEffect(() => {
    if (isLoading || !user) return;
    sessionStorage.removeItem('lastLoginRedirect');
    let redirectTo = null;
    if (!currentPageName || currentPageName === '' || currentPageName === 'Home' || currentPageName === 'Index' ||
        (!isOnBossPage && !isOnWorkerPage && !sharedPages.includes(currentPageName))) {
      redirectTo = isBoss ? '/BossDashboard' : '/WorkerHome';
    } else if (isWorker && isOnBossPage) {
      redirectTo = '/WorkerHome';
    } else if (isBoss && isOnWorkerPage && !sharedPages.includes(currentPageName)) {
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
    if (redirectTo) navigate(redirectTo, { replace: true });
  }, [isLoading, user, currentPageName, isBoss, isWorker, isOnBossPage, isOnWorkerPage, navigate]);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
      </div>
    );
  }

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

  return (
    <>
      {/* Fixed global background: navy base + gold diagonal beam */}
      <div
        style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          zIndex: -1,
          background: 'linear-gradient(to bottom, #060914 0%, #0B1428 40%, #0D1E3A 100%)',
          overflow: 'hidden'
        }}
      >
        {/* Beams — sweep from top-left toward center-right, fade out at 75% height */}
        <div
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            maskImage: 'linear-gradient(to bottom, rgba(0,0,0,1) 0%, rgba(0,0,0,0.9) 50%, rgba(0,0,0,0) 75%)',
            WebkitMaskImage: 'linear-gradient(to bottom, rgba(0,0,0,1) 0%, rgba(0,0,0,0.9) 50%, rgba(0,0,0,0) 75%)',
            pointerEvents: 'none'
          }}
        >
          {/* BEAM 1 — main beam, starts top-left edge, angles ~25deg toward right */}
          {/* Glow halo */}
          <div style={{
            position: 'absolute',
            top: '-5%',
            left: '-5%',
            width: '60px',
            height: '250%',
            background: 'linear-gradient(90deg, transparent 0%, rgba(210,160,20,0.15) 20%, rgba(240,190,40,0.35) 50%, rgba(210,160,20,0.15) 80%, transparent 100%)',
            transform: 'rotate(25deg)',
            transformOrigin: 'top left',
          }} />
          {/* Bright line */}
          <div style={{
            position: 'absolute',
            top: '-5%',
            left: '-5%',
            width: '60px',
            height: '250%',
            background: 'linear-gradient(90deg, transparent 45%, rgba(255,230,80,0.95) 50%, transparent 55%)',
            transform: 'rotate(25deg)',
            transformOrigin: 'top left',
          }} />

          {/* BEAM 2 — parallel beam, offset slightly to the right */}
          {/* Glow halo */}
          <div style={{
            position: 'absolute',
            top: '-5%',
            left: '8%',
            width: '50px',
            height: '250%',
            background: 'linear-gradient(90deg, transparent 0%, rgba(210,160,20,0.1) 20%, rgba(240,190,40,0.25) 50%, rgba(210,160,20,0.1) 80%, transparent 100%)',
            transform: 'rotate(25deg)',
            transformOrigin: 'top left',
          }} />
          {/* Bright line */}
          <div style={{
            position: 'absolute',
            top: '-5%',
            left: '8%',
            width: '50px',
            height: '250%',
            background: 'linear-gradient(90deg, transparent 44%, rgba(255,230,80,0.85) 50%, transparent 56%)',
            transform: 'rotate(25deg)',
            transformOrigin: 'top left',
          }} />
        </div>
      </div>
      {children}
    </>
  );
}