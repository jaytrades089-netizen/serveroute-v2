import React, { useState, useEffect, useCallback, useRef } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import { ChevronLeft, Phone, CalendarIcon, MapPin, FileText, Loader2, Copy, Clock, Image as ImageIcon, X, Sparkles } from 'lucide-react';
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

// Parse a screenshot's raw OCR text against the standard draft-line template.
// Returns whatever pieces it could extract; missing fields stay null.
// Template reminder (trained to the team):
//   Scheduled serve meeting place M-D at H:MM a.m./p.m.
//   [optional meeting place address]
//   OR
//   Scheduled serve place of posting M-D at H:MM a.m./p.m.
function parseScheduledServeDraft(rawText) {
  if (!rawText || typeof rawText !== 'string') {
    return { phone: null, date: null, hour: null, minute: null, ampm: null, locationType: null, meetingAddress: null };
  }

  const result = {
    phone: null,
    date: null,        // Date object
    hour: null,        // '1'..'12'
    minute: null,      // '00' | '15' | '30' | '45'
    ampm: null,        // 'AM' | 'PM'
    locationType: null,    // 'posting' | 'meeting'
    meetingAddress: null
  };

  // Phone: (XXX) XXX-XXXX or XXX-XXX-XXXX or XXX.XXX.XXXX
  // Pick the FIRST match (messaging apps put the contact header at top).
  const phoneMatch = rawText.match(/\(?\d{3}\)?[\s.\-]?\d{3}[\s.\-]?\d{4}/);
  if (phoneMatch) {
    const digits = phoneMatch[0].replace(/\D/g, '');
    if (digits.length === 10) {
      result.phone = `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
    }
  }

  // Locate the draft line. Case-insensitive. "scheduled serve" is the anchor.
  const draftStartMatch = rawText.match(/scheduled\s+serve/i);
  if (!draftStartMatch) {
    return result; // Nothing to parse beyond phone
  }

  // Take everything from "scheduled serve" to end as the draft block.
  const draftBlock = rawText.slice(draftStartMatch.index);

  // Location type
  if (/meeting\s*place/i.test(draftBlock)) {
    result.locationType = 'meeting';
  } else if (/place\s*of\s*posting/i.test(draftBlock)) {
    result.locationType = 'posting';
  }

  // Date: M-D or M/D or MM-DD or MM/DD  (no year in the draft template)
  const dateMatch = draftBlock.match(/\b(\d{1,2})[\-\/](\d{1,2})\b/);
  if (dateMatch) {
    const m = parseInt(dateMatch[1], 10);
    const d = parseInt(dateMatch[2], 10);
    if (m >= 1 && m <= 12 && d >= 1 && d <= 31) {
      const now = new Date();
      let year = now.getFullYear();
      let candidate = new Date(year, m - 1, d);
      // If the date is more than 30 days in the past, assume next year (handles Dec→Jan wrap)
      const msPerDay = 1000 * 60 * 60 * 24;
      const diffDays = (candidate.getTime() - now.getTime()) / msPerDay;
      if (diffDays < -30) {
        candidate = new Date(year + 1, m - 1, d);
      }
      result.date = candidate;
    }
  }

  // Time: H:MM a.m./p.m. — accept many variants: "3:00 p.m.", "3:00pm", "3:00 PM", "3:00PM"
  const timeMatch = draftBlock.match(/\b(\d{1,2}):(\d{2})\s*([aApP])\.?\s*([mM])\.?/);
  if (timeMatch) {
    const h = parseInt(timeMatch[1], 10);
    const m = parseInt(timeMatch[2], 10);
    const isPM = timeMatch[3].toLowerCase() === 'p';
    if (h >= 1 && h <= 12 && m >= 0 && m <= 59) {
      result.hour = String(h);
      // Snap minute to nearest allowed wheel value: 00 / 15 / 30 / 45
      const allowed = [0, 15, 30, 45];
      const snapped = allowed.reduce((prev, curr) =>
        Math.abs(curr - m) < Math.abs(prev - m) ? curr : prev
      );
      result.minute = snapped.toString().padStart(2, '0');
      result.ampm = isPM ? 'PM' : 'AM';
    }
  }

  // Meeting place address: when locationType is 'meeting', take the line(s)
  // that look address-like. Heuristic: find a substring that contains a
  // 5-digit ZIP. Back up to the nearest sensible line start.
  if (result.locationType === 'meeting') {
    // Strip the leading "scheduled serve meeting place ... a.m./p.m." chunk
    // so we don't pick up that line as the address.
    const afterTime = timeMatch
      ? draftBlock.slice(draftBlock.indexOf(timeMatch[0]) + timeMatch[0].length)
      : draftBlock;

    // Find a line with a 5-digit ZIP
    const zipLineMatch = afterTime.match(/([^\n]*\b\d{5}(?:-\d{4})?\b[^\n]*)/);
    if (zipLineMatch) {
      // Collect up to 2 lines leading up to and including the ZIP line,
      // in case the street and city are on separate lines.
      const idx = afterTime.indexOf(zipLineMatch[0]);
      const before = afterTime.slice(0, idx).trim().split('\n').filter(Boolean);
      const tail = before.slice(-1); // one preceding line at most
      const combined = [...tail, zipLineMatch[0]].join(' ').replace(/\s+/g, ' ').trim();
      // Drop common boilerplate that sometimes appears in messaging previews
      const cleaned = combined.replace(/\b(United States|USA|US)\b\.?/i, '').trim();
      if (cleaned) result.meetingAddress = cleaned;
    }
  }

  return result;
}

// Gold chip shown next to fields that were auto-filled by OCR.
// Clears as soon as the user edits that field.
function AutoFilledChip({ show }) {
  if (!show) return null;
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '4px',
        fontSize: '10px',
        fontWeight: 700,
        letterSpacing: '0.05em',
        textTransform: 'uppercase',
        color: '#e9c349',
        background: 'rgba(233,195,73,0.15)',
        border: '1px solid rgba(233,195,73,0.35)',
        padding: '2px 6px',
        borderRadius: '999px',
        marginLeft: '8px'
      }}
    >
      <Sparkles className="w-3 h-3" /> Auto
    </span>
  );
}

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

  // ── Screenshot OCR state ───────────────────────────────────────────────────
  const fileInputRef = useRef(null);
  const [screenshotThumb, setScreenshotThumb] = useState(null); // data URL for preview
  const [ocrBusy, setOcrBusy] = useState(false);
  // Which fields were populated by OCR? Chips clear when user edits.
  const [autoFilled, setAutoFilled] = useState({
    phone: false,
    dateTime: false,
    locationType: false,
    meetingAddress: false
  });
  const clearAutoFilled = (key) =>
    setAutoFilled(prev => (prev[key] ? { ...prev, [key]: false } : prev));
  // ────────────────────────────────────────────────────────────────────────────

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

  // ── Screenshot upload handlers ─────────────────────────────────────────────
  const handleOpenPicker = () => {
    if (ocrBusy) return;
    fileInputRef.current?.click();
  };

  const handleClearScreenshot = () => {
    if (ocrBusy) return;
    setScreenshotThumb(null);
    setAutoFilled({ phone: false, dateTime: false, locationType: false, meetingAddress: false });
    // Reset the file input so picking the same file again still fires onChange
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleScreenshotPicked = async (event) => {
    const file = event.target.files?.[0];
    // Always reset the input early so re-picking the same file works
    if (event.target) event.target.value = '';
    if (!file) return;

    if (ocrBusy) return;
    setOcrBusy(true);

    try {
      // Read as data URL for thumbnail + extract base64 payload for OCR
      const dataUrl = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = e => resolve(e.target.result);
        reader.onerror = () => reject(new Error('FILE_READ_ERROR'));
        reader.readAsDataURL(file);
      });
      setScreenshotThumb(dataUrl);

      const base64 = dataUrl.split(',')[1];
      if (!base64) throw new Error('FILE_READ_ERROR');

      // Reuse the existing processOCR serverless function. We only need
      // `result.rawText` — the address parsing it also does is ignored here.
      // 30s client-side timeout matches the scan flow.
      const OCR_TIMEOUT_MS = 30000;
      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error('OCR_TIMEOUT')), OCR_TIMEOUT_MS)
      );

      let response;
      try {
        response = await Promise.race([
          base44.functions.invoke('processOCR', {
            imageBase64: base64,
            documentType: 'screenshot',
            sessionId: null
          }),
          timeoutPromise
        ]);
      } catch (invokeError) {
        if (invokeError?.message === 'OCR_TIMEOUT') {
          toast.error('OCR taking too long — check signal and try again');
        } else if (!navigator.onLine) {
          toast.error("Can't read screenshot right now — no internet. Fill manually or try again.");
        } else {
          toast.error('Network error — check your connection and try again');
        }
        return;
      }

      const rawText = response?.data?.rawText || '';
      if (!rawText) {
        toast.error("Couldn't read the screenshot. Try again or fill manually.");
        return;
      }

      const parsed = parseScheduledServeDraft(rawText);
      const filled = { phone: false, dateTime: false, locationType: false, meetingAddress: false };

      if (parsed.phone) {
        setPhoneNumber(parsed.phone);
        filled.phone = true;
      }
      if (parsed.date) {
        setSelectedDate(parsed.date);
      }
      if (parsed.hour && parsed.minute && parsed.ampm) {
        const hIdx = HOURS.indexOf(parsed.hour);
        const mIdx = MINUTES.indexOf(parsed.minute);
        const apIdx = AMPM.indexOf(parsed.ampm);
        if (hIdx >= 0) setStartHourIdx(hIdx);
        if (mIdx >= 0) setStartMinIdx(mIdx);
        if (apIdx >= 0) setStartAmPmIdx(apIdx);
      }
      if (parsed.date || (parsed.hour && parsed.minute && parsed.ampm)) {
        filled.dateTime = true;
      }
      if (parsed.locationType) {
        setLocationType(parsed.locationType);
        filled.locationType = true;
      }
      if (parsed.locationType === 'meeting' && parsed.meetingAddress) {
        setMeetingAddress(parsed.meetingAddress);
        filled.meetingAddress = true;
      }

      const anyFilled = Object.values(filled).some(Boolean);
      setAutoFilled(filled);

      if (anyFilled) {
        toast.success('Screenshot read — review the highlighted fields');
      } else {
        toast.error('Could not match the draft template. Fill manually.');
      }
    } catch (err) {
      console.error('Screenshot OCR failed:', err);
      if (err?.message === 'FILE_READ_ERROR') {
        toast.error("Couldn't read that image. Try another screenshot.");
      } else {
        toast.error('Something went wrong. Fill manually.');
      }
    } finally {
      setOcrBusy(false);
    }
  };
  // ────────────────────────────────────────────────────────────────────────────

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

        {/* Hidden file input for screenshot picker */}
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={handleScreenshotPicked}
        />

        {/* Address Info + Upload Screenshot button on the right */}
        <div style={card}>
          <div className="flex items-start justify-between gap-3">
            <div className="flex-1 min-w-0">
              <div style={label}><MapPin className="w-3.5 h-3.5" style={{ color: '#e5b9e1' }} />Address</div>
              <p className="font-bold text-sm" style={{ color: '#E6E1E4' }}>{formatted.line1}</p>
              <p className="text-xs mt-0.5" style={{ color: '#9CA3AF' }}>{formatted.line2}</p>
              {address?.defendant_name && (
                <p className="text-sm mt-1" style={{ color: '#d0c3cb' }}>{address.defendant_name}</p>
              )}
            </div>

            {/* Upload Screenshot button — active press state + disabled while OCR runs */}
            <button
              type="button"
              onClick={handleOpenPicker}
              disabled={ocrBusy}
              aria-label="Upload screenshot"
              style={{
                flexShrink: 0,
                height: '52px',
                minWidth: '52px',
                padding: '0 10px',
                borderRadius: '12px',
                background: ocrBusy ? 'rgba(233,195,73,0.10)' : 'rgba(233,195,73,0.15)',
                border: '1px solid rgba(233,195,73,0.45)',
                color: ocrBusy ? 'rgba(233,195,73,0.5)' : '#e9c349',
                cursor: ocrBusy ? 'not-allowed' : 'pointer',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '2px',
                fontSize: '10px',
                fontWeight: 700,
                letterSpacing: '0.04em',
                transition: 'transform 0.08s ease, background 0.15s ease, opacity 0.15s ease'
              }}
              onMouseDown={e => { if (!ocrBusy) e.currentTarget.style.transform = 'scale(0.96)'; }}
              onMouseUp={e => { e.currentTarget.style.transform = 'scale(1)'; }}
              onMouseLeave={e => { e.currentTarget.style.transform = 'scale(1)'; }}
              onTouchStart={e => { if (!ocrBusy) e.currentTarget.style.transform = 'scale(0.96)'; }}
              onTouchEnd={e => { e.currentTarget.style.transform = 'scale(1)'; }}
            >
              {ocrBusy ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : (
                <ImageIcon className="w-5 h-5" />
              )}
              <span>{ocrBusy ? 'READING' : 'UPLOAD'}</span>
            </button>
          </div>

          {/* Thumbnail + Clear & Re-upload, only shown after a pick */}
          {screenshotThumb && (
            <div
              style={{
                marginTop: '12px',
                display: 'flex',
                alignItems: 'center',
                gap: '10px',
                padding: '8px',
                borderRadius: '10px',
                background: 'rgba(255,255,255,0.04)',
                border: '1px solid rgba(255,255,255,0.08)'
              }}
            >
              <img
                src={screenshotThumb}
                alt="Screenshot preview"
                style={{
                  width: '44px',
                  height: '44px',
                  objectFit: 'cover',
                  borderRadius: '8px',
                  flexShrink: 0
                }}
              />
              <div className="flex-1 min-w-0">
                <p className="text-xs font-semibold" style={{ color: '#e6e1e4' }}>
                  {ocrBusy ? 'Reading screenshot…' : 'Screenshot attached'}
                </p>
                <p className="text-[11px]" style={{ color: '#8a7f87' }}>
                  {ocrBusy ? 'Hold tight' : 'Review highlighted fields below'}
                </p>
              </div>
              <button
                type="button"
                onClick={handleClearScreenshot}
                disabled={ocrBusy}
                aria-label="Clear screenshot"
                style={{
                  flexShrink: 0,
                  width: '32px',
                  height: '32px',
                  borderRadius: '8px',
                  background: 'rgba(255,255,255,0.06)',
                  border: '1px solid rgba(255,255,255,0.12)',
                  color: '#d0c3cb',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: ocrBusy ? 'not-allowed' : 'pointer'
                }}
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          )}
        </div>

        {/* Phone Number */}
        <div style={card}>
          <div className="flex items-center justify-between">
            <label style={label}>
              <Phone className="w-3.5 h-3.5" style={{ color: '#e5b9e1' }} />Phone Number
            </label>
            <AutoFilledChip show={autoFilled.phone} />
          </div>
          <input
            type="tel"
            placeholder="(555) 123-4567"
            value={phoneNumber}
            onChange={e => { setPhoneNumber(e.target.value); clearAutoFilled('phone'); }}
            style={{ ...inputStyle }}
          />
        </div>

        {/* Date & Time */}
        <div style={card}>
          <div className="flex items-center justify-between">
            <label style={label}>
              <CalendarIcon className="w-3.5 h-3.5" style={{ color: '#e5b9e1' }} />Date &amp; Time
            </label>
            <AutoFilledChip show={autoFilled.dateTime} />
          </div>
          <DateTimeWheelPicker
            date={selectedDate}
            onDateChange={(d) => { setSelectedDate(d); clearAutoFilled('dateTime'); }}
            startHourIndex={startHourIdx}
            startMinuteIndex={startMinIdx}
            startAmPmIndex={startAmPmIdx}
            onStartChange={(h, m, ap) => {
              setStartHourIdx(h); setStartMinIdx(m); setStartAmPmIdx(ap);
              clearAutoFilled('dateTime');
            }}
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
          <div className="flex items-center justify-between">
            <label style={label}>
              <MapPin className="w-3.5 h-3.5" style={{ color: '#e5b9e1' }} />Location
            </label>
            <AutoFilledChip show={autoFilled.locationType || autoFilled.meetingAddress} />
          </div>
          <div className="grid grid-cols-2 gap-2 mb-3">
            {['posting', 'meeting'].map(type => (
              <button
                key={type}
                onClick={() => {
                  setLocationType(type);
                  clearAutoFilled('locationType');
                }}
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
              onChange={e => { setMeetingAddress(e.target.value); clearAutoFilled('meetingAddress'); }}
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
