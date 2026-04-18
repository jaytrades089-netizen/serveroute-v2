import React from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import { format } from 'date-fns';
import { Clock, MapPin, Phone, Navigation, Loader2, Copy, Eye, Pencil } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { formatAddress } from '@/components/utils/addressUtils';
import { useCurrentUser } from '@/components/hooks/useCurrentUser';
import { toast } from 'sonner';

export default function ScheduledServesTab({ routeId, onViewAddress }) {
  const navigate = useNavigate();
  const { data: user } = useCurrentUser();

  // Show ALL open scheduled serves for the worker, not just ones tied to the
  // currently-viewed route. Lets the worker tap Scheduled from inside any route
  // and see everything they have on deck — no need to back out to the dashboard.
  // Shared cache key with ActiveRoutesList so both views stay in sync.
  const { data: activeServes = [], isLoading } = useQuery({
    queryKey: ['workerScheduledServes', user?.id],
    queryFn: async () => {
      if (!user?.id) return [];
      return base44.entities.ScheduledServe.filter({ worker_id: user.id, status: 'open' });
    },
    enabled: !!user?.id,
    staleTime: 60 * 1000
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
        <Loader2 className="w-6 h-6 animate-spin" style={{ color: '#e9c349' }} />
      </div>
    );
  }

  if (activeServes.length === 0) {
    return (
      <div className="text-center py-8">
        <Clock className="w-10 h-10 mx-auto mb-2" style={{ color: '#363436' }} />
        <p className="text-sm" style={{ color: '#8a7f87' }}>No scheduled serves</p>
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
          <div
            key={serve.id}
            className="rounded-2xl overflow-hidden"
            style={{
              background: 'rgba(14, 20, 44, 0.55)',
              backdropFilter: 'blur(20px)',
              WebkitBackdropFilter: 'blur(20px)',
              border: '2px solid #e9c349',
              boxShadow: '0 0 12px rgba(233,195,73,0.35), inset 0 0 0 1px rgba(233,195,73,0.15)'
            }}
          >
            {/* Gold banner header — matches ScheduledServeCard.jsx on Dash */}
            <div
              className="px-4 py-2 flex items-center gap-2"
              style={{
                background: 'rgba(233,195,73,0.18)',
                borderBottom: '1px solid rgba(233,195,73,0.40)'
              }}
            >
              <Clock className="w-4 h-4 flex-shrink-0" style={{ color: '#e9c349' }} />
              <span className="text-xs font-bold uppercase tracking-wide" style={{ color: '#e9c349' }}>
                Scheduled Serve
              </span>
              <span
                className="ml-auto text-[10px] font-semibold rounded px-1.5 py-0.5 uppercase"
                style={
                  serve.location_type === 'meeting'
                    ? { background: 'rgba(229,179,225,0.20)', color: '#e5b9e1', border: '1px solid rgba(229,179,225,0.35)' }
                    : { background: 'rgba(147,197,253,0.15)', color: '#93c5fd', border: '1px solid rgba(147,197,253,0.35)' }
                }
              >
                {serve.location_type === 'meeting' ? 'Meeting Place' : 'Place of Posting'}
              </span>
            </div>

            <div className="px-4 py-3">
              {/* Defendant Name */}
              {serve.defendant_name && (
                <h3 className="text-base font-bold leading-tight mb-1" style={{ color: '#E6E1E4' }}>
                  {serve.defendant_name}
                </h3>
              )}

              {/* Date/Time */}
              <div className="flex items-center gap-2 mb-2">
                <Clock className="w-3.5 h-3.5 flex-shrink-0" style={{ color: '#e9c349' }} />
                <span className="text-sm font-semibold" style={{ color: '#e9c349' }}>
                  {format(dt, "EEE, MMM d 'at' h:mm a")}
                </span>
              </div>

              {/* Phone number */}
              {serve.phone_number && (
                <div className="flex items-center gap-2 mb-3">
                  <Phone className="w-3.5 h-3.5 flex-shrink-0" style={{ color: '#8a7f87' }} />
                  <span className="text-xs" style={{ color: '#d0c3cb' }}>{serve.phone_number}</span>
                </div>
              )}

              {/* Structured note display — dark frosted inner block */}
              <div className="relative">
                <div
                  className="text-xs rounded-lg p-3 pr-9 whitespace-pre-line"
                  style={{
                    background: 'rgba(255,255,255,0.04)',
                    border: '1px solid rgba(255,255,255,0.10)',
                    color: '#d0c3cb',
                    lineHeight: 1.6
                  }}
                >
                  {buildFormattedNote(serve)}
                </div>
                <button
                  onClick={() => handleCopyNotes(buildFormattedNote(serve))}
                  className="absolute top-2 right-2 p-1.5 rounded transition-colors"
                  style={{ color: '#8a7f87' }}
                  onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(233,195,73,0.15)'; e.currentTarget.style.color = '#e9c349'; }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = '#8a7f87'; }}
                >
                  <Copy className="w-3.5 h-3.5" />
                </button>
              </div>

              {/* Action buttons — View / Edit / Nav */}
              <div className="grid grid-cols-3 gap-2 mt-3">
                <button
                  onClick={() => {
                    // If this serve belongs to the currently-viewed route, filter
                    // this route's address list to show it. If it belongs to a
                    // different route, navigate to that route's detail page with
                    // the address pre-filtered — otherwise we'd be asking the current
                    // route to show an address it doesn't own, which returns nothing.
                    if (serve.route_id && serve.route_id !== routeId) {
                      navigate(createPageUrl(`WorkerRouteDetail?id=${serve.route_id}&addressId=${serve.address_id}&tab=addresses`));
                      return;
                    }
                    if (onViewAddress) {
                      onViewAddress(serve.address_id);
                    }
                  }}
                  className="flex items-center justify-center gap-1.5 py-2 rounded-lg font-bold text-xs transition-colors"
                  style={{
                    background: 'rgba(229,179,225,0.12)',
                    border: '1px solid rgba(229,179,225,0.35)',
                    color: '#e5b9e1'
                  }}
                >
                  <Eye className="w-4 h-4" /> View
                </button>
                <button
                  onClick={() => {
                    // Pass the serve's OWN route_id, not the currently-viewed one —
                    // otherwise editing a cross-route serve could write the wrong
                    // route_id back on save.
                    const serveRouteId = serve.route_id || routeId;
                    navigate(createPageUrl(`EditScheduledServe?serveId=${serve.id}&routeId=${serveRouteId}`));
                  }}
                  className="flex items-center justify-center gap-1.5 py-2 rounded-lg font-bold text-xs transition-colors"
                  style={{
                    background: 'rgba(233,195,73,0.12)',
                    border: '1px solid rgba(233,195,73,0.35)',
                    color: '#e9c349'
                  }}
                >
                  <Pencil className="w-4 h-4" /> Edit
                </button>
                <button
                  onClick={() => {
                    const addr = getNavigationAddress(serve);
                    if (addr) {
                      window.open(`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(addr)}`, '_blank');
                    } else {
                      toast.error('No address available for navigation');
                    }
                  }}
                  className="flex items-center justify-center gap-1.5 py-2 rounded-lg font-bold text-xs transition-colors"
                  style={{
                    background: 'rgba(34,197,94,0.18)',
                    border: '1px solid rgba(34,197,94,0.45)',
                    color: '#22c55e'
                  }}
                >
                  <Navigation className="w-4 h-4" /> Nav
                </button>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}