import React from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import { Loader2, ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import ReceiptForm from '../components/receipts/ReceiptForm';

export default function SubmitReceipt() {
  const navigate = useNavigate();
  const urlParams = new URLSearchParams(window.location.search);
  const addressId = urlParams.get('addressId');
  const routeId = urlParams.get('routeId');
  const attemptId = urlParams.get('attemptId');
  const parentReceiptId = urlParams.get('parentReceiptId');
  const returnTo = urlParams.get('returnTo'); // Combo route return path // For resubmissions

  const { data: user, isLoading: userLoading } = useQuery({
    queryKey: ['currentUser'],
    queryFn: () => base44.auth.me()
  });

  const { data: address, isLoading: addressLoading } = useQuery({
    queryKey: ['address', addressId],
    queryFn: async () => {
      if (!addressId) return null;
      const addresses = await base44.entities.Address.filter({ id: addressId });
      return addresses[0] || null;
    },
    enabled: !!addressId
  });

  const { data: route, isLoading: routeLoading } = useQuery({
    queryKey: ['route', routeId],
    queryFn: async () => {
      if (!routeId) return null;
      const routes = await base44.entities.Route.filter({ id: routeId });
      return routes[0] || null;
    },
    enabled: !!routeId
  });

  const { data: attempt } = useQuery({
    queryKey: ['attempt', attemptId],
    queryFn: async () => {
      if (!attemptId) return null;
      const attempts = await base44.entities.Attempt.filter({ id: attemptId });
      return attempts[0] || null;
    },
    enabled: !!attemptId
  });

  const { data: parentReceipt } = useQuery({
    queryKey: ['parentReceipt', parentReceiptId],
    queryFn: async () => {
      if (!parentReceiptId) return null;
      const receipts = await base44.entities.Receipt.filter({ id: parentReceiptId });
      return receipts[0] || null;
    },
    enabled: !!parentReceiptId
  });

  const { data: bossSettings } = useQuery({
    queryKey: ['bossSettings', user?.company_id],
    queryFn: async () => {
      if (!user?.company_id) return null;
      const settings = await base44.entities.BossSettings.filter({ company_id: user.company_id });
      return settings[0] || {
        receipt_required: true,
        receipt_required_for: ['served', 'partially_served'],
        signature_required: false,
        signature_required_for: ['served'],
        min_photos_per_receipt: 1,
        max_photos_per_receipt: 5
      };
    },
    enabled: !!user?.company_id
  });

  const isLoading = userLoading || addressLoading || routeLoading;

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
      </div>
    );
  }

  if (!address || !route) {
    return (
      <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center p-4">
        <p className="text-gray-600 mb-4">Address or route not found</p>
        <Button onClick={() => navigate(-1)}>Go Back</Button>
      </div>
    );
  }

  // Ownership check - workers can only submit receipts for their own routes
  // Skip check if coming from a combo route (worker owns the combo, not necessarily each sub-route)
  if (user?.role === 'server' && route && route.worker_id !== user.id && !returnTo) {
    return (
      <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center p-4">
        <p className="text-gray-600 mb-4">You don't have access to submit receipts for this route</p>
        <Button onClick={() => navigate(-1)}>Go Back</Button>
      </div>
    );
  }

  const queryClient = useQueryClient();
  
  const handleSuccess = (receipt) => {
    // Refetch address and route caches so the card moves to completed section immediately
    queryClient.refetchQueries({ queryKey: ['routeAddresses', routeId] });
    queryClient.refetchQueries({ queryKey: ['route', routeId] });
    queryClient.refetchQueries({ queryKey: ['routeAttempts', routeId] });
    queryClient.refetchQueries({ queryKey: ['scheduledServes', routeId] });
    queryClient.refetchQueries({ queryKey: ['scheduledServesCount', routeId] });
    queryClient.refetchQueries({ queryKey: ['scheduledServesCountBadge', routeId] });
    queryClient.refetchQueries({ queryKey: ['comboDetailAddresses'] });
    queryClient.refetchQueries({ queryKey: ['comboDetailAttempts'] });
    
    // If coming from combo route, return there — never navigate to sub-folder
    if (returnTo) {
      navigate(createPageUrl(returnTo), { replace: true });
    } else if (routeId) {
      navigate(createPageUrl(`WorkerRouteDetail?id=${routeId}`), { replace: true });
    } else {
      window.history.back();
    }
  };

  const handleCancel = () => {
    navigate(-1);
  };

  return (
    <div style={{ minHeight: '100vh', background: 'transparent', paddingBottom: 32 }}>
      {/* Header */}
      <header style={{ background: 'rgba(11,15,30,0.75)', backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)', borderBottom: '1px solid rgba(255,255,255,0.08)', color: '#e6e1e4' }} className="sticky top-0 z-10">
        <div className="px-4 py-3 flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate(-1)} style={{ color: '#e6e1e4' }}>
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <h1 className="text-lg font-semibold" style={{ color: '#e6e1e4' }}>
            {parentReceiptId ? 'Resubmit Receipt' : 'Submit Receipt'}
          </h1>
        </div>
      </header>

      <main className="px-4 py-4 max-w-lg mx-auto">
        <ReceiptForm
          address={address}
          route={route}
          attempt={attempt}
          bossSettings={bossSettings}
          user={user}
          parentReceipt={parentReceipt}
          onSuccess={handleSuccess}
          onCancel={handleCancel}
        />
      </main>
    </div>
  );
}