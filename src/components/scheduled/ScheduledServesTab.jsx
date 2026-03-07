import React from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import { format } from 'date-fns';
import { Clock, MapPin, Phone, Navigation, Loader2, Copy, Eye } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { formatAddress } from '@/components/utils/addressUtils';
import { toast } from 'sonner';

export default function ScheduledServesTab({ routeId }) {
  const navigate = useNavigate();

  const { data: activeServes = [], isLoading } = useQuery({
    queryKey: ['scheduledServes', routeId],
    queryFn: async () => {
      if (!routeId) return [];
      return base44.entities.ScheduledServe.filter({ route_id: routeId, status: 'open' });
    },
    enabled: !!routeId,
    staleTime: 0
  });

  // Fetch addresses for all scheduled serves so we can navigate to posting addresses
  const addressIds = activeServes.map(s => s.address_id).filter(Boolean);
  const { data: addresses = [] } = useQuery({
    queryKey: ['scheduledServeAddresses', addressIds.join(',')],
    queryFn: async () => {
      if (addressIds.length === 0) return [];
      const results = await Promise.all(
        addressIds.map(id => base44.entities.Address.filter({ id }))
      );
      return results.flat();
    },
    enabled: addressIds.length > 0
  });

  const addressMap = {};
  addresses.forEach(a => { addressMap[a.id] = a; });

  const getNavigationAddress = (serve) => {
    if (serve.location_type === 'meeting' && serve.meeting_place_address) {
      return serve.meeting_place_address;
    }
    const addr = addressMap[serve.address_id];
    if (addr) {
      const formatted = formatAddress(addr);
      return `${formatted.line1}, ${formatted.line2}`;
    }
    return null;
  };

  const handleCopyNotes = (notes) => {
    navigator.clipboard.writeText(notes).then(() => {
      toast.success('Copied', { duration: 1500 });
    }).catch(() => {
      toast.error('Failed to copy');
    });
  };

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

        return (
          <Card key={serve.id} className="border-blue-200 bg-blue-50/50">
            <CardContent className="p-4">
...
              {serve.notes && (
                <div className="relative mt-2">
                  <p className="text-xs text-gray-600 bg-white rounded-lg p-2 pr-8 border border-gray-100 whitespace-pre-line">
                    {serve.notes}
                  </p>
                  <button
                    onClick={() => handleCopyNotes(serve.notes)}
                    className="absolute top-2 right-2 p-1 rounded hover:bg-gray-100 text-gray-400 hover:text-blue-600 transition-colors"
                  >
                    <Copy className="w-3.5 h-3.5" />
                  </button>
                </div>
              )}

              <div className="flex gap-2 mt-3">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => navigate(createPageUrl(`AddressDetail?id=${serve.address_id}&routeId=${routeId}`))}
                  className="flex-1"
                >
                  <Eye className="w-4 h-4 mr-1" /> View Address
                </Button>
                <Button
                  size="sm"
                  onClick={() => {
                    const addr = getNavigationAddress(serve);
                    if (addr) {
                      window.open(`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(addr)}`, '_blank');
                    } else {
                      toast.error('No address available for navigation');
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