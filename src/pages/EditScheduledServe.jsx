import React, { useState, useEffect, useCallback } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import { ChevronLeft, Phone, Calendar as CalendarIcon, MapPin, FileText, Loader2, Copy, Clock, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import { formatAddress } from '@/components/utils/addressUtils';
import { getCompanyId } from '@/components/utils/companyUtils';
import { format } from 'date-fns';

// ── shared style tokens ──────────────────────────────────────────────────────
const card = {
  background: 'rgba(14, 20, 44, 0.55)',
  backdropFilter: 'blur(20px)',
  WebkitBackdropFilter: 'blur(20px)',
  border: '1px solid rgba(255,255,255,0.10)',
  borderRadius: '16px',
  padding: '16px',
};
const sectionLabel = {
  fontSize: '10px',
  fontWeight: 700,
  letterSpacing: '0.08em',
  textTransform: 'uppercase',
  color: '#6B7280',
  display: 'flex',
  alignItems: 'center',
  gap: '6px',
  marginBottom: '10px',
};
const inputStyle = {
  background: 'rgba(255,255,255,0.06)',
  border: '1px solid rgba(255,255,255,0.12)',
  borderRadius: '10px',
  color: '#E6E1E4',
  fontSize: '14px',
  padding: '10px 12px',
  width: '100%',
  outline: 'none',
};
// ────────────────────────────────────────────────────────────────────────────

function parseExistingDateTime(isoString) {
  if (!isoString) return {};
  const dt = new Date(isoString);
  let hours = dt.getHours();
  const minutes = dt.getMinutes();
  const ampm = hours >= 12 ? 'PM' : 'AM';
  if (hours > 12) hours -= 12;
  if (hours === 0) hours = 12;
  const roundedMinute = [0, 15, 30, 45].reduce((prev, curr) =>
    Math.abs(curr - minutes) < Math.abs(prev - minutes) ? curr : prev
  );
  return {
    date: new Date(dt.getFullYear(), dt.getMonth(), dt.getDate()),
    hour: String(hours),
    minute: String(roundedMinute).padStart(2, '0'),
    ampm
  };
}

export default function EditScheduledServe() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const urlParams = new URLSearchParams(window.location.search);
  const serveId = urlParams.get('serveId');
  const routeId = urlParams.get('routeId');

  const [phoneNumber, setPhoneNumber] = useState('');
  const [selectedDate, setSelectedDate] = useState(null);
  const [selectedHour, setSelectedHour] = useState('');
  const [selectedMinute, setSelectedMinute] = useState('');
  const [selectedAmPm, setSelectedAmPm] = useState('AM');
  const [endHour, setEndHour] = useState('');
  const [endMinute, setEndMinute] = useState('');
  const [endAmPm, setEndAmPm] = useState('AM');
  const [notes, setNotes] = useState('');
  const [locationType, setLocationType] = useState('posting');
  const [meetingAddress, setMeetingAddress] = useState('');
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [initialized, setInitialized] = useState(false);

  const { data: serve, isLoading: serveLoading } = useQuery({
    queryKey: ['scheduledServe', serveId],
    queryFn: async () => {
      if (!serveId) return null;
      const serves = await base44.entities.ScheduledServe.filter({ id: serveId });
      return serves[0] || null;
    },
    enabled: !!serveId
  });

  const { data: user } = useQuery({
    queryKey: ['currentUser'],
    queryFn: () => base44.auth.me()
  });

  const addressId = serve?.address_id;

  const { data: address } = useQuery({
    queryKey: ['address', addressId],
    queryFn: async () => {
      if (!addressId) return null;
      const addresses = await base44.entities.Address.filter({ id: addressId });
      return addresses[0] || null;
    },
    enabled: !!addressId
  });

  const { data: route } = useQuery({
    queryKey: ['route', routeId],
    queryFn: async () => {
      if (!routeId) return null;
      const routes = await base44.entities.Route.filter({ id: routeId });
      return routes[0] || null;
    },
    enabled: !!routeId
  });

  useEffect(() => {
    if (serve && !initialized) {
      setPhoneNumber(serve.phone_number || '');
      setLocationType(serve.location_type || 'posting');
      setMeetingAddress(serve.meeting_place_address || '');
      setNotes(serve.notes || '');
      const parsed = parseExistingDateTime(serve.scheduled_datetime);
      if (parsed.date) setSelectedDate(parsed.date);
      if (parsed.hour) setSelectedHour(parsed.hour);
      if (parsed.minute) setSelectedMinute(parsed.minute);
      if (parsed.ampm) setSelectedAmPm(parsed.ampm);
      setInitialized(true);
    }
  }, [serve, initialized]);

  const formatted = address ? formatAddress(address) : {};
  const fullPostingAddress = formatted.line1 ? `${formatted.line1}, ${formatted.line2}` : '';

  const formatTimeDisplay = (hour, minute, ampm) => {
    if (!hour) return '';
    return `${hour}:${minute || '00'} ${ampm}`;
  };

  const getDateTimeDisplay = useCallback(() => {
    if (!selectedDate || !selectedHour) return '';
    const startTime = formatTimeDisplay(selectedHour, selectedMinute, selectedAmPm);
    const endTime = endHour ? formatTimeDisplay(endHour, endMinute, endAmPm) : '';
    const dateStr = format(selectedDate, "EEE, MMM d, yyyy");
    if (endTime) return `${dateStr} between ${startTime} - ${endTime}`;
    return `${dateStr} at ${startTime}`;
  }, [selectedDate, selectedHour, selectedMinute, selectedAmPm, endHour, endMinute, endAmPm]);

  const getDateTimeISO = useCallback(() => {
    if (!selectedDate || !selectedHour) return null;
    let h = parseInt(selectedHour);
    const m = parseInt(selectedMinute || '0');
    if (selectedAmPm === 'PM' && h !== 12) h += 12;
    if (selectedAmPm === 'AM' && h === 12) h = 0;
    const dt = new Date(selectedDate);
    dt.setHours(h, m, 0, 0);
    return dt.toISOString();
  }, [selectedDate, selectedHour, selectedMinute, selectedAmPm]);

  const buildTemplate = useCallback(() => {
    const defendantName = address?.defendant_name || serve?.defendant_name || '(unknown)';
    const locationLabel = locationType === 'posting' ? 'Place of Posting' : 'Meeting Place';
    const locationAddress = locationType === 'posting'
      ? fullPostingAddress
      : (meetingAddress || '(not entered)');
    const dateTimeStr = getDateTimeDisplay() || '(not selected)';
    return `Scheduled Serve Defendant:\n${defendantName}\nPhone: ${phoneNumber || '(not entered)'}\n\nLocation: ${locationLabel} Address:\n${locationAddress}\n\nDate/Time:\n${dateTimeStr}`;
  }, [address, serve, locationType, fullPostingAddress, meetingAddress, getDateTimeDisplay, phoneNumber]);

  useEffect(() => {
    if (initialized && address) setNotes(buildTemplate());
  }, [locationType, meetingAddress, selectedDate, selectedHour, selectedMinute, selectedAmPm, endHour, endMinute, endAmPm, phoneNumber, buildTemplate, initialized, address]);

  const handleCopyNotes = () => {
    navigator.clipboard.writeText(notes)
      .then(() => toast.success('Copied', { duration: 1500 }))
      .catch(() => toast.error('Failed to copy'));
  };

  const handleSave = async () => {
    const isoDate = getDateTimeISO();
    if (!isoDate) { toast.error('Please select a date and time'); return; }
    if (locationType === 'meeting' && !meetingAddress.trim()) {
      toast.error('Please enter a meeting place address'); return;
    }
    setSaving(true);
    let meetingLat = serve?.meeting_place_lat || null;
    let meetingLng = serve?.meeting_place_lng || null;
    if (locationType === 'meeting' && meetingAddress.trim() && meetingAddress !== serve?.meeting_place_address) {
      const geocodeResult = await base44.integrations.Core.InvokeLLM({
        prompt: `Geocode this address and return lat/lng coordinates: "${meetingAddress}". If you cannot geocode it, return null values.`,
        response_json_schema: {
          type: 'object',
          properties: { lat: { type: 'number' }, lng: { type: 'number' }, valid: { type: 'boolean' } }
        }
      });
      if (!geocodeResult.valid) {
        toast.error('Could not geocode meeting place address.');
        setSaving(false); return;
      }
      meetingLat = geocodeResult.lat;
      meetingLng = geocodeResult.lng;
    }
    try {
      await base44.entities.ScheduledServe.update(serveId, {
        phone_number: phoneNumber,
        scheduled_datetime: isoDate,
        notes,
        location_type: locationType,
        meeting_place_address: locationType === 'meeting' ? meetingAddress : null,
        meeting_place_lat: locationType === 'meeting' ? meetingLat : null,
        meeting_place_lng: locationType === 'meeting' ? meetingLng : null,
        defendant_name: address?.defendant_name || serve?.defendant_name || '',
        folder_name: route?.folder_name || serve?.folder_name || ''
      });
      toast.success('Scheduled serve updated');
      // Include workerScheduledServes — it's the dashboard list key, and without it
      // the updated serve keeps showing its old data until the cache expires.
      queryClient.refetchQueries({ queryKey: ['workerScheduledServes', user?.id] });
      queryClient.refetchQueries({ queryKey: ['scheduledServes', routeId] });
      queryClient.refetchQueries({ queryKey: ['scheduledServesCount', routeId] });
      navigate(-1);
    } catch (error) {
      console.error('Failed to update scheduled serve:', error);
      toast.error('Failed to update');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    const confirmed = window.confirm('Delete this scheduled serve? This cannot be undone.');
    if (!confirmed) return;
    setDeleting(true);
    try {
      await base44.entities.ScheduledServe.delete(serveId);
      toast.success('Scheduled serve deleted');
      // Include workerScheduledServes — without it, the deleted card lingers on
      // the dashboard until the cache expires, and tapping it navigates to a
      // record that no longer exists.
      queryClient.refetchQueries({ queryKey: ['workerScheduledServes', user?.id] });
      queryClient.refetchQueries({ queryKey: ['scheduledServes', routeId] });
      queryClient.refetchQueries({ queryKey: ['scheduledServesCount', routeId] });
      navigate(-1);
    } catch (error) {
      console.error('Failed to delete:', error);
      toast.error('Failed to delete');
    } finally {
      setDeleting(false);
    }
  };

  if (serveLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: 'transparent' }}>
        <Loader2 className="w-8 h-8 animate-spin" style={{ color: '#e9c349' }} />
      </div>
    );
  }

  if (!serve) {
    return (
      <div className="min-h-screen p-4 text-center" style={{ background: 'transparent', color: '#9CA3AF' }}>
        Scheduled serve not found
      </div>
    );
  }

  const hours = Array.from({ length: 12 }, (_, i) => i + 1);
  const minutes = ['00', '15', '30', '45'];

  return (
    <div style={{ minHeight: '100vh', background: 'transparent', paddingBottom: 32 }}>
      {/* Header */}
      <header
        className="px-4 py-3 flex items-center gap-3 sticky top-0 z-50"
        style={{
          background: 'rgba(10,14,30,0.85)',
          backdropFilter: 'blur(16px)',
          WebkitBackdropFilter: 'blur(16px)',
          borderBottom: '1px solid rgba(233,195,73,0.20)'
        }}
      >
        <button onClick={() => navigate(-1)} style={{ color: '#e9c349' }}>
          <ChevronLeft className="w-6 h-6" />
        </button>
        <h1 className="font-bold text-lg flex-1" style={{ color: '#E6E1E4' }}>Edit Scheduled Serve</h1>
        <button
          onClick={handleDelete}
          disabled={deleting}
          className="p-2 rounded-full transition-colors hover:opacity-80"
          style={{ color: '#ef4444' }}
        >
          {deleting ? <Loader2 className="w-5 h-5 animate-spin" /> : <Trash2 className="w-5 h-5" />}
        </button>
      </header>

      <main className="px-4 py-4 max-w-lg mx-auto space-y-3">

        {/* Address Info */}
        <div style={card}>
          <div style={sectionLabel}><MapPin className="w-3.5 h-3.5" style={{ color: '#e5b9e1' }} />Address</div>
          <p className="font-bold text-sm" style={{ color: '#E6E1E4' }}>{formatted.line1 || serve.defendant_name}</p>
          <p className="text-xs mt-0.5" style={{ color: '#9CA3AF' }}>{formatted.line2}</p>
          {address?.defendant_name && (
            <p className="text-sm mt-1" style={{ color: '#d0c3cb' }}>{address.defendant_name}</p>
          )}
        </div>

        {/* Phone Number */}
        <div style={card}>
          <label style={sectionLabel}><Phone className="w-3.5 h-3.5" style={{ color: '#e5b9e1' }} />Phone Number</label>
          <input
            type="tel"
            placeholder="(555) 123-4567"
            value={phoneNumber}
            onChange={e => setPhoneNumber(e.target.value)}
            style={inputStyle}
          />
        </div>

        {/* Date Picker */}
        <div style={card}>
          <label style={sectionLabel}><CalendarIcon className="w-3.5 h-3.5" style={{ color: '#e5b9e1' }} />Date</label>
          <Popover>
            <PopoverTrigger asChild>
              <button
                className="w-full flex items-center gap-2 px-3 py-2.5 rounded-xl text-sm transition-colors hover:opacity-80"
                style={{
                  background: 'rgba(255,255,255,0.06)',
                  border: '1px solid rgba(255,255,255,0.12)',
                  color: selectedDate ? '#E6E1E4' : '#6B7280',
                  textAlign: 'left'
                }}
              >
                <CalendarIcon className="w-4 h-4 flex-shrink-0" style={{ color: '#e5b9e1' }} />
                {selectedDate ? format(selectedDate, 'EEEE, MMMM d, yyyy') : 'Pick a date'}
              </button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <Calendar mode="single" selected={selectedDate} onSelect={setSelectedDate} />
            </PopoverContent>
          </Popover>
        </div>

        {/* Time Window */}
        <div style={card}>
          <label style={sectionLabel}><Clock className="w-3.5 h-3.5" style={{ color: '#e5b9e1' }} />Time Window</label>

          <p style={{ fontSize: '10px', fontWeight: 700, letterSpacing: '0.06em', color: '#6B7280', marginBottom: '6px' }}>FROM</p>
          <div className="flex gap-2 mb-4">
            <Select value={selectedHour} onValueChange={setSelectedHour}>
              <SelectTrigger className="flex-1" style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', color: '#E6E1E4' }}>
                <SelectValue placeholder="Hour" />
              </SelectTrigger>
              <SelectContent>
                {hours.map(h => <SelectItem key={h} value={String(h)}>{h}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={selectedMinute} onValueChange={setSelectedMinute}>
              <SelectTrigger className="w-20" style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', color: '#E6E1E4' }}>
                <SelectValue placeholder="Min" />
              </SelectTrigger>
              <SelectContent>
                {minutes.map(m => <SelectItem key={m} value={m}>{m}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={selectedAmPm} onValueChange={setSelectedAmPm}>
              <SelectTrigger className="w-20" style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', color: '#E6E1E4' }}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="AM">AM</SelectItem>
                <SelectItem value="PM">PM</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <p style={{ fontSize: '10px', fontWeight: 700, letterSpacing: '0.06em', color: '#6B7280', marginBottom: '6px' }}>
            TO <span style={{ fontWeight: 400, color: '#4B5563' }}>(optional)</span>
          </p>
          <div className="flex gap-2">
            <Select value={endHour} onValueChange={setEndHour}>
              <SelectTrigger className="flex-1" style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', color: '#E6E1E4' }}>
                <SelectValue placeholder="Hour" />
              </SelectTrigger>
              <SelectContent>
                {hours.map(h => <SelectItem key={h} value={String(h)}>{h}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={endMinute} onValueChange={setEndMinute}>
              <SelectTrigger className="w-20" style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', color: '#E6E1E4' }}>
                <SelectValue placeholder="Min" />
              </SelectTrigger>
              <SelectContent>
                {minutes.map(m => <SelectItem key={m} value={m}>{m}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={endAmPm} onValueChange={setEndAmPm}>
              <SelectTrigger className="w-20" style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', color: '#E6E1E4' }}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="AM">AM</SelectItem>
                <SelectItem value="PM">PM</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {selectedDate && selectedHour && (
            <p className="text-sm font-semibold mt-3 text-center" style={{ color: '#e9c349' }}>
              {getDateTimeDisplay()}
            </p>
          )}
        </div>

        {/* Location */}
        <div style={card}>
          <label style={sectionLabel}><MapPin className="w-3.5 h-3.5" style={{ color: '#e5b9e1' }} />Location</label>
          <div className="grid grid-cols-2 gap-2 mb-3">
            {['posting', 'meeting'].map(type => (
              <button
                key={type}
                onClick={() => setLocationType(type)}
                style={{
                  padding: '10px',
                  borderRadius: '10px',
                  fontSize: '13px',
                  fontWeight: 600,
                  border: locationType === type ? '2px solid #e9c349' : '1px solid rgba(255,255,255,0.10)',
                  background: locationType === type ? 'rgba(233,195,73,0.15)' : 'rgba(255,255,255,0.04)',
                  color: locationType === type ? '#e9c349' : '#6B7280',
                  cursor: 'pointer',
                  transition: 'all 0.15s'
                }}
              >
                {type === 'posting' ? 'Place of Posting' : 'Meeting Place'}
              </button>
            ))}
          </div>
          {locationType === 'posting' ? (
            <div style={{ background: 'rgba(255,255,255,0.04)', borderRadius: '10px', padding: '10px 12px' }}>
              <p className="text-xs" style={{ color: '#9CA3AF' }}>Will use: {formatted.line1}, {formatted.line2}</p>
            </div>
          ) : (
            <input
              placeholder="Enter meeting place address..."
              value={meetingAddress}
              onChange={e => setMeetingAddress(e.target.value)}
              style={inputStyle}
            />
          )}
        </div>

        {/* Notes */}
        <div style={card}>
          <div className="flex items-center justify-between mb-2">
            <label style={{ ...sectionLabel, marginBottom: 0 }}><FileText className="w-3.5 h-3.5" style={{ color: '#e5b9e1' }} />Notes</label>
            <button
              onClick={handleCopyNotes}
              className="flex items-center gap-1 text-xs font-semibold px-2 py-1 rounded-lg transition-colors hover:opacity-80"
              style={{ color: '#e9c349', background: 'rgba(233,195,73,0.12)', border: '1px solid rgba(233,195,73,0.25)' }}
            >
              <Copy className="w-3.5 h-3.5" /> Copy
            </button>
          </div>
          <textarea
            value={notes}
            onChange={e => setNotes(e.target.value)}
            rows={6}
            style={{ ...inputStyle, resize: 'none', fontFamily: 'inherit', lineHeight: 1.5 }}
          />
        </div>

        {/* Save Button */}
        <button
          onClick={handleSave}
          disabled={saving || !selectedDate || !selectedHour}
          style={{
            width: '100%',
            height: '52px',
            borderRadius: '14px',
            background: saving || !selectedDate || !selectedHour ? 'rgba(233,195,73,0.25)' : '#e9c349',
            color: saving || !selectedDate || !selectedHour ? 'rgba(233,195,73,0.5)' : '#0B0F1E',
            fontWeight: 700,
            fontSize: '15px',
            border: 'none',
            cursor: saving || !selectedDate || !selectedHour ? 'not-allowed' : 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '8px',
            transition: 'all 0.15s'
          }}
        >
          {saving && <Loader2 className="w-5 h-5 animate-spin" />}
          Save Changes
        </button>
      </main>
    </div>
  );
}
