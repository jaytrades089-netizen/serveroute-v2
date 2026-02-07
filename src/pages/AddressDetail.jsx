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
      <div className="min-h-screen bg-gray-100 flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
      </div>
    );
  }

  if (!address) {
    return (
      <div className="min-h-screen bg-gray-100 p-4">
        <Button variant="ghost" onClick={() => navigate(-1)} className="mb-4">
          <ChevronLeft className="w-5 h-5 mr-1" /> Back
        </Button>
        <p className="text-center text-gray-500">Address not found</p>
      </div>
    );
  }

  // Ownership check for workers
  if (user?.role === 'server' && route && route.worker_id !== user.id) {
    return (
      <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center p-4">
        <p className="text-gray-600 mb-4">You don't have access to this address</p>
        <Button onClick={() => navigate(-1)}>Go Back</Button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-100 pb-20">
      {/* Header */}
      <header className="bg-blue-500 text-white px-4 py-3 flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={handleBack} className="text-white hover:bg-blue-600">
          <ChevronLeft className="w-6 h-6" />
        </Button>
        <div>
          <h1 className="font-bold text-lg">{route?.folder_name || 'Address'}</h1>
          <p className="text-sm text-blue-100">Address Details</p>
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