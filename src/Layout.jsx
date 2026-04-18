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

  const darkSpinner = (
    <div style={{ minHeight: '100vh', background: '#060914', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <Loader2 className="w-8 h-8 animate-spin" style={{ color: '#e9c349' }} />
    </div>
  );

  if (isLoading) return darkSpinner;
  if (!user) return darkSpinner;

  const needsRedirect = 
    (!currentPageName || currentPageName === '' || currentPageName === 'Home' || currentPageName === 'Index' ||
      (!isOnBossPage && !isOnWorkerPage && !sharedPages.includes(currentPageName))) ||
    (isWorker && isOnBossPage) ||
    (isBoss && isOnWorkerPage && !sharedPages.includes(currentPageName));

  if (needsRedirect) return darkSpinner;

  return (
    <>
      {/* Fixed global background — navy base + ambient gold warmth.
          z-index:0 (not -1) so it paints ABOVE html's #060914 fallback.
          Children get explicit z-index:1 below so content stacks on top. */}
      <div
        style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          zIndex: 0,
          pointerEvents: 'none',
          background: 'linear-gradient(to bottom, #060914 0%, #0B1428 40%, #0D1E3A 100%)',
          overflow: 'hidden'
        }}
      >
        {/* Top-left streaks — two beams, clearly visible gold identity.
            Each beam has a wider glow halo + a bright line core for structure. */}
        {[
          { top: '-4%', left: '-8%', glowOpacity: 0.28, lineOpacity: 0.55, glowWidth: 120 },
          { top: '10%', left: '6%', glowOpacity: 0.20, lineOpacity: 0.42, glowWidth: 90 },
        ].map((beam, i) => (
          <React.Fragment key={`tl-${i}`}>
            <div style={{
              position: 'absolute',
              top: beam.top,
              left: beam.left,
              width: `${beam.glowWidth}px`,
              height: '185%',
              background: `linear-gradient(90deg, transparent 0%, rgba(214,166,28,${beam.glowOpacity * 0.45}) 20%, rgba(247,206,78,${beam.glowOpacity}) 50%, rgba(214,166,28,${beam.glowOpacity * 0.45}) 80%, transparent 100%)`,
              transform: 'rotate(-38deg)',
              transformOrigin: 'top left',
              filter: 'blur(2px)',
              pointerEvents: 'none'
            }} />
            <div style={{
              position: 'absolute',
              top: beam.top,
              left: beam.left,
              width: `${beam.glowWidth}px`,
              height: '185%',
              background: `linear-gradient(90deg, transparent 47%, rgba(255,224,92,${beam.lineOpacity}) 50%, transparent 53%)`,
              transform: 'rotate(-38deg)',
              transformOrigin: 'top left',
              pointerEvents: 'none'
            }} />
          </React.Fragment>
        ))}

        {/* Counter-streak from top-right — angled the other way so the middle
            of the viewport catches gold while scrolling. */}
        <div style={{
          position: 'absolute',
          top: '-6%',
          right: '-10%',
          width: '110px',
          height: '140%',
          background: 'linear-gradient(90deg, transparent 0%, rgba(214,166,28,0.10) 30%, rgba(247,206,78,0.20) 50%, rgba(214,166,28,0.10) 70%, transparent 100%)',
          transform: 'rotate(32deg)',
          transformOrigin: 'top right',
          filter: 'blur(3px)',
          pointerEvents: 'none'
        }} />
        <div style={{
          position: 'absolute',
          top: '-6%',
          right: '-10%',
          width: '110px',
          height: '140%',
          background: 'linear-gradient(90deg, transparent 46%, rgba(255,224,92,0.32) 50%, transparent 54%)',
          transform: 'rotate(32deg)',
          transformOrigin: 'top right',
          pointerEvents: 'none'
        }} />

        {/* Ambient radial glow — bottom-right. Catches through frosted cards
            in the scroll zone where beams don't reach. */}
        <div style={{
          position: 'absolute',
          bottom: '-15%',
          right: '-10%',
          width: '720px',
          height: '720px',
          background: 'radial-gradient(circle, rgba(233,195,73,0.22) 0%, rgba(233,195,73,0.12) 30%, rgba(233,195,73,0.05) 55%, transparent 75%)',
          pointerEvents: 'none',
          filter: 'blur(6px)'
        }} />

        {/* Secondary ambient glow — mid-left, fills the dead zone between
            top-left beams and the bottom-right glow. */}
        <div style={{
          position: 'absolute',
          top: '45%',
          left: '-12%',
          width: '560px',
          height: '560px',
          background: 'radial-gradient(circle, rgba(233,195,73,0.14) 0%, rgba(233,195,73,0.07) 35%, transparent 70%)',
          pointerEvents: 'none',
          filter: 'blur(8px)'
        }} />
      </div>
      <div style={{ position: 'relative', zIndex: 1 }}>
        {children}
      </div>
    </>
  );
}
