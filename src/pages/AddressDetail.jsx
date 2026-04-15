import React from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import { Loader2, ChevronLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import AddressDetailView from '@/components/address/AddressDetailView';
import BottomNav from '@/components/layout/BottomNav';

export default function AddressDetail() {
  const navigate = useNavigate();
  const urlParams = new URLSearchParams(window.location.search);
  const addressId = urlParams.get('addressId') || urlParams.get('id');
  const routeId = urlParams.get('routeId');

  const { data: user } = useQuery({
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

  const { data: route } = useQuery({
    queryKey: ['route', routeId || address?.route_id],
    queryFn: async () => {
      const id = routeId || address?.route_id;
      if (!id) return null;
      const routes = await base44.entities.Route.filter({ id });
      return routes[0] || null;
    },
    enabled: !!(routeId || address?.route_id)
  });

  const handleBack = () => {
    if (routeId || address?.route_id) {
      navigate(createPageUrl(`WorkerRouteDetail?id=${routeId || address?.route_id}`));
    } else {
      navigate(-1);
    }
  };

  if (addressLoading) {
    return (
      <div style={{ minHeight: '100vh', background: '#060914', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Loader2 className="w-8 h-8 animate-spin" style={{ color: '#e9c349' }} />
      </div>
    );
  }

  if (!address) {
    return (
      <div style={{ minHeight: '100vh', background: '#060914', padding: 16 }}>
        <button
          onClick={() => navigate(-1)}
          style={{ display: 'flex', alignItems: 'center', gap: 4, color: '#e6e1e4', background: 'none', border: 'none', cursor: 'pointer', marginBottom: 16 }}
        >
          <ChevronLeft className="w-5 h-5" /> Back
        </button>
        <p style={{ textAlign: 'center', color: '#8a7f87' }}>Address not found</p>
      </div>
    );
  }

  // Ownership check for workers
  if (user?.role === 'server' && route && route.worker_id !== user.id) {
    return (
      <div style={{ minHeight: '100vh', background: '#060914', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
        <p style={{ color: '#8a7f87', marginBottom: 16 }}>You don't have access to this address</p>
        <Button onClick={() => navigate(-1)}>Go Back</Button>
      </div>
    );
  }

  return (
    <div style={{ minHeight: '100vh', background: 'transparent', paddingBottom: 80 }}>
      {/* Header */}
      <header style={{ background: 'rgba(6,9,20,0.85)', backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)', borderBottom: '1px solid rgba(255,255,255,0.08)', color: '#e6e1e4', padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 12, position: 'sticky', top: 0, zIndex: 50 }}>
        <button
          onClick={handleBack}
          className="flex items-center justify-center w-10 h-10 rounded-lg hover:bg-white/10 active:bg-white/20 transition-colors"
          style={{ border: '1px solid #363436', background: 'transparent', cursor: 'pointer' }}
        >
          <ChevronLeft className="w-6 h-6" style={{ color: '#e6e1e4' }} />
        </button>
        <div>
          <h1 className="font-bold text-lg" style={{ color: '#e6e1e4' }}>{route?.folder_name || 'Address'}</h1>
          <p className="text-sm" style={{ color: '#8a7f87' }}>Address Details</p>
        </div>
      </header>

      {/* Address Detail View */}
      <AddressDetailView
        address={address}
        routeId={routeId || address?.route_id}
        onBack={handleBack}
      />

      <BottomNav currentPage="WorkerRoutes" />
    </div>
  );
}
