import React from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
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
  const parentReceiptId = urlParams.get('parentReceiptId'); // For resubmissions

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
  if (user?.role === 'server' && route && route.worker_id !== user.id) {
    return (
      <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center p-4">
        <p className="text-gray-600 mb-4">You don't have access to submit receipts for this route</p>
        <Button onClick={() => navigate(-1)}>Go Back</Button>
      </div>
    );
  }

  const handleSuccess = (receipt) => {
    // Force immediate navigation back to the route detail page
    // Using replace to avoid navigation stack issues
    if (routeId) {
      navigate(createPageUrl(`WorkerRouteDetail?id=${routeId}`), { replace: true });
    } else {
      window.history.back();
    }
  };

  const handleCancel = () => {
    navigate(-1);
  };

  return (
    <div className="min-h-screen bg-gray-50 pb-24">
      {/* Header */}
      <header className="bg-white border-b sticky top-0 z-10">
        <div className="px-4 py-3 flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <h1 className="text-lg font-semibold">
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