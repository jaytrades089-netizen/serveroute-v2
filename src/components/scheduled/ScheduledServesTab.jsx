import React from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import { format } from 'date-fns';
import { Clock, MapPin, Phone, Navigation, Loader2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { formatAddress } from '@/components/utils/addressUtils';

export default function ScheduledServesTab({ routeId }) {
  const navigate = useNavigate();

  // Fetch open scheduled serves AND check which addresses are actually served
  const { data: activeServes = [], isLoading } = useQuery({
    queryKey: ['scheduledServes', routeId],
    queryFn: async () => {
      if (!routeId) return [];
      const serves = await base44.entities.ScheduledServe.filter({ route_id: routeId, status: 'open' });
      if (serves.length === 0) return [];
      
      // Fetch fresh address data to check served status
      const addressIds = [...new Set(serves.map(s => s.address_id))];
      const addresses = await Promise.all(
        addressIds.map(id => base44.entities.Address.filter({ id }).then(r => r[0]).catch(() => null))
      );
      const servedIds = new Set(
        addresses.filter(a => a && (a.served || a.status === 'returned')).map(a => a.id)
      );
      
      // Auto-complete any that should be completed
      const staleServes = serves.filter(s => servedIds.has(s.address_id));
      for (const serve of staleServes) {
        base44.entities.ScheduledServe.update(serve.id, {
          status: 'completed',
          completed_at: new Date().toISOString()
        }).catch(() => {});
      }
      
      return serves.filter(s => !servedIds.has(s.address_id));
    },
    enabled: !!routeId,
    staleTime: 0 // Always refetch to ensure fresh data
  });

  if (isLoading) {
    return (
      <div className="flex justify-center py-8">
        <Loader2 className="w-6 h-6 animate-spin text-blue-500" />
      </div>
    );
  }

  if (activeServes.length === 0) {
    return (
      <div className="text-center py-8 text-gray-500">
        <Clock className="w-10 h-10 mx-auto text-gray-300 mb-2" />
        <p className="text-sm">No scheduled serves</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {activeServes.sort((a, b) => new Date(a.scheduled_datetime) - new Date(b.scheduled_datetime)).map((serve) => {
        const dt = new Date(serve.scheduled_datetime);
        const navAddress = serve.location_type === 'meeting' && serve.meeting_place_address
          ? serve.meeting_place_address
          : null;

        return (
          <Card key={serve.id} className="border-blue-200 bg-blue-50/50">
            <CardContent className="p-4">
              <div className="flex items-start justify-between mb-2">
                <div>
                  {serve.defendant_name && (
                    <p className="font-bold text-gray-900">{serve.defendant_name}</p>
                  )}
                  <div className="flex items-center gap-2 text-sm text-blue-700 font-semibold mt-1">
                    <Clock className="w-4 h-4" />
                    {format(dt, "EEE, MMM d 'at' h:mm a")}
                  </div>
                </div>
                <Badge className={serve.location_type === 'meeting' 
                  ? 'bg-purple-100 text-purple-700' 
                  : 'bg-blue-100 text-blue-700'
                }>
                  {serve.location_type === 'meeting' ? 'Meeting Place' : 'Place of Posting'}
                </Badge>
              </div>

              {serve.phone_number && (
                <div className="flex items-center gap-2 text-xs text-gray-500 mb-1">
                  <Phone className="w-3.5 h-3.5" /> {serve.phone_number}
                </div>
              )}

              {serve.notes && (
                <p className="text-xs text-gray-600 bg-white rounded-lg p-2 mt-2 border border-gray-100">
                  {serve.notes}
                </p>
              )}

              <div className="flex gap-2 mt-3">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => navigate(createPageUrl(`WorkerRouteDetail?id=${routeId}&addressId=${serve.address_id}`))}
                  className="flex-1"
                >
                  View Address
                </Button>
                <Button
                  size="sm"
                  onClick={() => {
                    const addr = navAddress || '';
                    if (addr) {
                      window.open(`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(addr)}`, '_blank');
                    } else {
                      // Fallback — navigate to address view
                      navigate(createPageUrl(`WorkerRouteDetail?id=${routeId}&addressId=${serve.address_id}`));
                    }
                  }}
                  className="flex-1 bg-green-500 hover:bg-green-600"
                >
                  <Navigation className="w-4 h-4 mr-1" /> Navigate
                </Button>
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}