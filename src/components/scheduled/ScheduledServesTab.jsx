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

export default function ScheduledServesTab({ routeId, onViewAddress }) {
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

  // Build formatted note text from structured data for copy
  const buildFormattedNote = (serve) => {
    const addr = addressMap[serve.address_id];
    const defendantName = serve.defendant_name || addr?.defendant_name || '(unknown)';
    const locationLabel = serve.location_type === 'meeting' ? 'Meeting Place' : 'Place of Posting';
    const locationAddress = serve.location_type === 'meeting' && serve.meeting_place_address
      ? serve.meeting_place_address
      : (addr ? `${formatAddress(addr).line1}, ${formatAddress(addr).line2}` : '(unknown)');
    
    const dt = new Date(serve.scheduled_datetime);
    const dateTimeStr = format(dt, "EEE, MMM d, yyyy 'at' h:mm a");

    return `Scheduled Serve Defendant:\n${defendantName}\nPhone: ${serve.phone_number || '(none)'}\n\nLocation: ${locationLabel} Address:\n${locationAddress}\n\nDate/Time:\n${dateTimeStr}`;
  };

  return (
    <div className="space-y-3">
      {activeServes.sort((a, b) => new Date(a.scheduled_datetime) - new Date(b.scheduled_datetime)).map((serve) => {
        const dt = new Date(serve.scheduled_datetime);
        const addr = addressMap[serve.address_id];
        const locationAddress = serve.location_type === 'meeting' && serve.meeting_place_address
          ? serve.meeting_place_address
          : (addr ? `${formatAddress(addr).line1}, ${formatAddress(addr).line2}` : '');

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

              {/* Structured note display built from entity fields */}
              <div className="relative mt-2">
                <div className="text-xs text-gray-600 bg-white rounded-lg p-2 pr-8 border border-gray-100 whitespace-pre-line">
                  {buildFormattedNote(serve)}
                </div>
                <button
                  onClick={() => handleCopyNotes(buildFormattedNote(serve))}
                  className="absolute top-2 right-2 p-1 rounded hover:bg-gray-100 text-gray-400 hover:text-blue-600 transition-colors"
                >
                  <Copy className="w-3.5 h-3.5" />
                </button>
              </div>

              <div className="flex gap-2 mt-3">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    if (onViewAddress) {
                      onViewAddress(serve.address_id);
                    }
                  }}
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