import React, { useState, useEffect, useCallback } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import { ChevronLeft, Phone, CalendarIcon, MapPin, FileText, Loader2, Copy, Clock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';
import { formatAddress } from '@/components/utils/addressUtils';
import { getCompanyId } from '@/components/utils/companyUtils';
import { format } from 'date-fns';
import DateTimeWheelPicker from '@/components/common/DateTimeWheelPicker';

// ── shared style tokens ──────────────────────────────────────────────────────
const card = {
  background: 'rgba(14, 20, 44, 0.55)',
  backdropFilter: 'blur(20px)',
  WebkitBackdropFilter: 'blur(20px)',
  border: '1px solid rgba(255,255,255,0.10)',
  borderRadius: '16px',
  padding: '16px',
};
const label = {
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

export default function CreateScheduledServe() {
  const navigate = useNavigate();
  const urlParams = new URLSearchParams(window.location.search);
  const addressId = urlParams.get('addressId');
  const routeId = urlParams.get('routeId');

  const [phoneNumber, setPhoneNumber] = useState('');
  const [selectedDate, setSelectedDate] = useState(null);

  const [startHourIdx, setStartHourIdx] = useState(11);
  const [startMinIdx, setStartMinIdx] = useState(0);
  // Default to AM (index 0) — AM/PM array is ['AM', 'PM'], so 0 = AM
  const [startAmPmIdx, setStartAmPmIdx] = useState(0);
  const [endHourIdx, setEndHourIdx] = useState(11);
  const [endMinIdx, setEndMinIdx] = useState(0);
  // Default to AM (index 0) for end time as well
  const [endAmPmIdx, setEndAmPmIdx] = useState(0);

  const HOURS = ['1','2','3','4','5','6','7','8','9','10','11','12'];
  const MINUTES = ['00','15','30','45'];
  const AMPM = ['AM','PM'];

  const idxToTime = (hIdx, mIdx, apIdx) => ({
    hour: HOURS[hIdx], minute: MINUTES[mIdx], ampm: AMPM[apIdx]
  });

  const [notes, setNotes] = useState('');
  const [locationType, setLocationType] = useState('posting');
  const [meetingAddress, setMeetingAddress] = useState('');
  const [saving, setSaving] = useState(false);

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
    queryKey: ['route', routeId],
    queryFn: async () => {
      if (!routeId) return null;
      const routes = await base44.entities.Route.filter({ id: routeId });
      return routes[0] || null;
    },
    enabled: !!routeId
  });

  const formatted = address ? formatAddress(address) : {};
  const fullPostingAddress = formatted.line1 ? `${formatted.line1}, ${formatted.line2}` : '';

  const formatTimeDisplay = (hour, minute, ampm) => `${hour}:${minute} ${ampm}`;

  const getDateTimeDisplay = useCallback(() => {
    if (!selectedDate) return '';
    const s = idxToTime(startHourIdx, startMinIdx, startAmPmIdx);
    const e = idxToTime(endHourIdx, endMinIdx, endAmPmIdx);
    const startTime = formatTimeDisplay(s.hour, s.minute, s.ampm);
    const endTime = formatTimeDisplay(e.hour, e.minute, e.ampm);
    const dateStr = format(selectedDate, 'EEE, MMM d, yyyy');
    if (startTime !== endTime) return `${dateStr} between ${startTime} - ${endTime}`;
    return `${dateStr} at ${startTime}`;
  }, [selectedDate, startHourIdx, startMinIdx, startAmPmIdx, endHourIdx, endMinIdx, endAmPmIdx]);

  const getDateTimeISO = useCallback(() => {
    if (!selectedDate) return null;
    const s = idxToTime(startHourIdx, startMinIdx, startAmPmIdx);
    let h = parseInt(s.hour);
    const m = parseInt(s.minute);
    if (s.ampm === 'PM' && h !== 12) h += 12;
    if (s.ampm === 'AM' && h === 12) h = 0;
    const dt = new Date(selectedDate);
    dt.setHours(h, m, 0, 0);
    return dt.toISOString();
  }, [selectedDate, startHourIdx, startMinIdx, startAmPmIdx]);

  const buildTemplate = useCallback(() => {
    const defendantName = address?.defendant_name || '(unknown)';
    const locationLabel = locationType === 'posting' ? 'Place of Posting' : 'Meeting Place';
    const locationAddress = locationType === 'posting'
      ? fullPostingAddress
      : (meetingAddress || '(not entered)');
    const dateTimeStr = getDateTimeDisplay() || '(not selected)';
    return `Scheduled Serve Defendant:\n${defendantName}\nPhone: ${phoneNumber || '(not entered)'}\n\nLocation: ${locationLabel} Address:\n${locationAddress}\n\nDate/Time:\n${dateTimeStr}`;
  }, [address, locationType, fullPostingAddress, meetingAddress, getDateTimeDisplay, phoneNumber]);

  const [templateInitialized, setTemplateInitialized] = useState(false);
  useEffect(() => {
    if (address && !templateInitialized) {
      setNotes(buildTemplate());
      setTemplateInitialized(true);
    }
  }, [address, templateInitialized, buildTemplate]);

  useEffect(() => {
    if (templateInitialized) setNotes(buildTemplate());
  }, [locationType, meetingAddress, selectedDate, startHourIdx, startMinIdx, startAmPmIdx, phoneNumber, buildTemplate, templateInitialized]);

  const handleCopyNotes = () => {
    navigator.clipboard.writeText(notes)
      .then(() => toast.success('Copied', { duration: 1500 }))
      .catch(() => toast.error('Failed to copy'));
  };

  const handleSave = async () => {
    if (!selectedDate) { toast.error('Please select a date'); return; }
    const isoDate = getDateTimeISO();
    if (locationType === 'meeting' && !meetingAddress.trim()) {
      toast.error('Please enter a meeting place address'); return;
    }
    setSaving(true);
    const companyId = getCompanyId(user) || address?.company_id;
    let meetingLat = null, meetingLng = null;

    if (locationType === 'meeting' && meetingAddress.trim()) {
      const geocodeResult = await base44.integrations.Core.InvokeLLM({
        prompt: `Geocode this address and return lat/lng coordinates: "${meetingAddress}". If you cannot geocode it, return null values.`,
        response_json_schema: {
          type: 'object',
          properties: { lat: { type: 'number' }, lng: { type: 'number' }, valid: { type: 'boolean' } }
        }
      });
      if (!geocodeResult.valid) {
        toast.error('Could not geocode meeting place address. Please check the address and try again.');
        setSaving(false); return;
      }
      meetingLat = geocodeResult.lat;
      meetingLng = geocodeResult.lng;
    }

    try {
      await base44.entities.ScheduledServe.create({
        address_id: addressId,
        route_id: routeId,
        worker_id: user.id,
        company_id: companyId,
        phone_number: phoneNumber,
        scheduled_datetime: isoDate,
        notes,
        location_type: locationType,
        meeting_place_address: locationType === 'meeting' ? meetingAddress : null,
        meeting_place_lat: meetingLat,
        meeting_place_lng: meetingLng,
        status: 'open',
        defendant_name: address?.defendant_name || '',
        folder_name: route?.folder_name || ''
      });
      toast.success('Scheduled serve created');
      navigate(createPageUrl(`WorkerRouteDetail?id=${routeId}`));
    } catch (error) {
      console.error('Failed to create scheduled serve:', error);
      toast.error('Failed to create scheduled serve');
    } finally {
      setSaving(false);
    }
  };

  if (addressLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: 'transparent' }}>
        <Loader2 className="w-8 h-8 animate-spin" style={{ color: '#e9c349' }} />
      </div>
    );
  }

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
        <h1 className="font-bold text-lg" style={{ color: '#E6E1E4' }}>Schedule Serve</h1>
      </header>

      <main className="px-4 py-4 max-w-lg mx-auto space-y-3">

        {/* Address Info */}
        <div style={card}>
          <div style={label}><MapPin className="w-3.5 h-3.5" style={{ color: '#e5b9e1' }} />Address</div>
          <p className="font-bold text-sm" style={{ color: '#E6E1E4' }}>{formatted.line1}</p>
          <p className="text-xs mt-0.5" style={{ color: '#9CA3AF' }}>{formatted.line2}</p>
          {address?.defendant_name && (
            <p className="text-sm mt-1" style={{ color: '#d0c3cb' }}>{address.defendant_name}</p>
          )}
        </div>

        {/* Phone Number */}
        <div style={card}>
          <label style={label}><Phone className="w-3.5 h-3.5" style={{ color: '#e5b9e1' }} />Phone Number</label>
          <input
            type="tel"
            placeholder="(555) 123-4567"
            value={phoneNumber}
            onChange={e => setPhoneNumber(e.target.value)}
            style={{ ...inputStyle }}
          />
        </div>

        {/* Date & Time */}
        <div style={card}>
          <label style={label}><CalendarIcon className="w-3.5 h-3.5" style={{ color: '#e5b9e1' }} />Date &amp; Time</label>
          <DateTimeWheelPicker
            date={selectedDate}
            onDateChange={setSelectedDate}
            startHourIndex={startHourIdx}
            startMinuteIndex={startMinIdx}
            startAmPmIndex={startAmPmIdx}
            onStartChange={(h, m, ap) => { setStartHourIdx(h); setStartMinIdx(m); setStartAmPmIdx(ap); }}
            endHourIndex={endHourIdx}
            endMinuteIndex={endMinIdx}
            endAmPmIndex={endAmPmIdx}
            onEndChange={(h, m, ap) => { setEndHourIdx(h); setEndMinIdx(m); setEndAmPmIdx(ap); }}
            showEnd={true}
          />
          {selectedDate && (
            <p className="text-sm font-semibold mt-3 text-center" style={{ color: '#e9c349' }}>
              {getDateTimeDisplay()}
            </p>
          )}
        </div>

        {/* Location */}
        <div style={card}>
          <label style={label}><MapPin className="w-3.5 h-3.5" style={{ color: '#e5b9e1' }} />Location</label>
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
            <label style={{ ...label, marginBottom: 0 }}><FileText className="w-3.5 h-3.5" style={{ color: '#e5b9e1' }} />Notes</label>
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
            style={{
              ...inputStyle,
              resize: 'none',
              fontFamily: 'inherit',
              lineHeight: 1.5
            }}
          />
        </div>

        {/* Save Button */}
        <button
          onClick={handleSave}
          disabled={saving || !selectedDate}
          style={{
            width: '100%',
            height: '52px',
            borderRadius: '14px',
            background: saving || !selectedDate ? 'rgba(233,195,73,0.25)' : '#e9c349',
            color: saving || !selectedDate ? 'rgba(233,195,73,0.5)' : '#0B0F1E',
            fontWeight: 700,
            fontSize: '15px',
            border: 'none',
            cursor: saving || !selectedDate ? 'not-allowed' : 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '8px',
            transition: 'all 0.15s'
          }}
        >
          {saving && <Loader2 className="w-5 h-5 animate-spin" />}
          Create Scheduled Serve
        </button>
      </main>
    </div>
  );
}
