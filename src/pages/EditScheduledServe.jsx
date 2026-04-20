import React, { useState, useEffect, useCallback, useRef } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import { ChevronLeft, Phone, CalendarIcon, MapPin, FileText, Loader2, Copy, Clock, Image as ImageIcon, X, Sparkles, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
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

// Same OCR parser as CreateScheduledServe — detects time ranges + single times
function parseScheduledServeDraft(rawText) {
  if (!rawText || typeof rawText !== 'string') return { phone: null, date: null, hour: null, minute: null, ampm: null, endHour: null, endMinute: null, endAmPm: null, locationType: null, meetingAddress: null };
  const result = { phone: null, date: null, hour: null, minute: null, ampm: null, endHour: null, endMinute: null, endAmPm: null, locationType: null, meetingAddress: null };
  const phoneMatch = rawText.match(/\(?\d{3}\)?[\s.\-]?\d{3}[\s.\-]?\d{4}/);
  if (phoneMatch) { const digits = phoneMatch[0].replace(/\D/g, ''); if (digits.length === 10) result.phone = `(${digits.slice(0,3)}) ${digits.slice(3,6)}-${digits.slice(6)}`; }
  const draftStartMatch = rawText.match(/scheduled\s+serve/i);
  if (!draftStartMatch) return result;
  const draftBlock = rawText.slice(draftStartMatch.index);
  if (/meeting\s*place/i.test(draftBlock)) result.locationType = 'meeting';
  else if (/place\s*of\s*posting/i.test(draftBlock)) result.locationType = 'posting';
  const dateMatch = draftBlock.match(/\b(\d{1,2})[\-\/](\d{1,2})\b/);
  if (dateMatch) { const m = parseInt(dateMatch[1],10), d = parseInt(dateMatch[2],10); if (m>=1&&m<=12&&d>=1&&d<=31) { const now=new Date(); let candidate=new Date(now.getFullYear(),m-1,d); if ((candidate.getTime()-now.getTime())/(1000*60*60*24)<-30) candidate=new Date(now.getFullYear()+1,m-1,d); result.date=candidate; } }
  const HOURS=['1','2','3','4','5','6','7','8','9','10','11','12'], MINUTES=['00','15','30','45'];
  const allowed=[0,15,30,45]; const snap=(m)=>allowed.reduce((prev,curr)=>Math.abs(curr-m)<Math.abs(prev-m)?curr:prev);
  const timeRangeMatch = draftBlock.match(/\b(\d{1,2}):(\d{2})\s*([aApP])\.?\s*([mM])\.?\s*(?:to|[-\u2013\u2014])\s*(\d{1,2}):(\d{2})\s*([aApP])\.?\s*([mM])\.?/i);
  if (timeRangeMatch) {
    const h1=parseInt(timeRangeMatch[1],10),m1=parseInt(timeRangeMatch[2],10),isPM1=timeRangeMatch[3].toLowerCase()==='p';
    const h2=parseInt(timeRangeMatch[5],10),m2=parseInt(timeRangeMatch[6],10),isPM2=timeRangeMatch[7].toLowerCase()==='p';
    if (h1>=1&&h1<=12&&m1>=0&&m1<=59) { result.hour=String(h1); result.minute=snap(m1).toString().padStart(2,'0'); result.ampm=isPM1?'PM':'AM'; }
    if (h2>=1&&h2<=12&&m2>=0&&m2<=59) { result.endHour=String(h2); result.endMinute=snap(m2).toString().padStart(2,'0'); result.endAmPm=isPM2?'PM':'AM'; }
  } else {
    const timeMatch=draftBlock.match(/\b(\d{1,2}):(\d{2})\s*([aApP])\.?\s*([mM])\.?/);
    if (timeMatch) { const h=parseInt(timeMatch[1],10),m=parseInt(timeMatch[2],10),isPM=timeMatch[3].toLowerCase()==='p'; if (h>=1&&h<=12&&m>=0&&m<=59) { result.hour=String(h); result.minute=snap(m).toString().padStart(2,'0'); result.ampm=isPM?'PM':'AM'; } }
  }
  if (result.locationType === 'meeting') {
    const zipLineMatch = draftBlock.match(/([^\n]*\b\d{5}(?:-\d{4})?\b[^\n]*)/);
    if (zipLineMatch) { const idx=draftBlock.indexOf(zipLineMatch[0]); const before=draftBlock.slice(0,idx).trim().split('\n').filter(Boolean); const combined=[...before.slice(-1),zipLineMatch[0]].join(' ').replace(/\s+/g,' ').trim(); const cleaned=combined.replace(/\b(United States|USA|US)\b\.?/i,'').trim(); if (cleaned) result.meetingAddress=cleaned; }
  }
  return result;
}

function AutoFilledChip({ show }) {
  if (!show) return null;
  return (
    <span style={{ display:'inline-flex',alignItems:'center',gap:'4px',fontSize:'10px',fontWeight:700,letterSpacing:'0.05em',textTransform:'uppercase',color:'#e9c349',background:'rgba(233,195,73,0.15)',border:'1px solid rgba(233,195,73,0.35)',padding:'2px 6px',borderRadius:'999px',marginLeft:'8px' }}>
      <Sparkles className="w-3 h-3" /> Auto
    </span>
  );
}

export default function EditScheduledServe() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const urlParams = new URLSearchParams(window.location.search);
  const serveId = urlParams.get('serveId');
  const routeId = urlParams.get('routeId');

  const [phoneNumber, setPhoneNumber] = useState('');
  const [selectedDate, setSelectedDate] = useState(null);
  const [startHourIdx, setStartHourIdx] = useState(11);
  const [startMinIdx, setStartMinIdx] = useState(0);
  const [startAmPmIdx, setStartAmPmIdx] = useState(0);
  const [endHourIdx, setEndHourIdx] = useState(11);
  const [endMinIdx, setEndMinIdx] = useState(0);
  const [endAmPmIdx, setEndAmPmIdx] = useState(0);
  const HOURS = ['1','2','3','4','5','6','7','8','9','10','11','12'];
  const MINUTES = ['00','15','30','45'];
  const AMPM = ['AM','PM'];
  const idxToTime = (hIdx, mIdx, apIdx) => ({ hour: HOURS[hIdx], minute: MINUTES[mIdx], ampm: AMPM[apIdx] });

  const [notes, setNotes] = useState('');
  const [locationType, setLocationType] = useState('posting');
  const [meetingAddress, setMeetingAddress] = useState('');
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [initialized, setInitialized] = useState(false);
  const fileInputRef = useRef(null);
  const [screenshotThumb, setScreenshotThumb] = useState(null);
  const [ocrBusy, setOcrBusy] = useState(false);
  const [autoFilled, setAutoFilled] = useState({ phone: false, dateTime: false, locationType: false, meetingAddress: false });
  const clearAutoFilled = (key) => setAutoFilled(prev => (prev[key] ? { ...prev, [key]: false } : prev));

  const { data: user } = useQuery({ queryKey: ['currentUser'], queryFn: () => base44.auth.me() });
  const { data: serve, isLoading: serveLoading } = useQuery({
    queryKey: ['scheduledServe', serveId],
    queryFn: async () => { if (!serveId) return null; const s = await base44.entities.ScheduledServe.filter({ id: serveId }); return s[0] || null; },
    enabled: !!serveId
  });
  const addressId = serve?.address_id;
  const { data: address, isLoading: addressLoading } = useQuery({
    queryKey: ['address', addressId],
    queryFn: async () => { if (!addressId) return null; const a = await base44.entities.Address.filter({ id: addressId }); return a[0] || null; },
    enabled: !!addressId
  });
  const { data: route } = useQuery({
    queryKey: ['route', routeId],
    queryFn: async () => { if (!routeId) return null; const r = await base44.entities.Route.filter({ id: routeId }); return r[0] || null; },
    enabled: !!routeId
  });

  // Pre-populate from existing serve record
  useEffect(() => {
    if (!serve || initialized) return;
    setPhoneNumber(serve.phone_number || '');
    setLocationType(serve.location_type || 'posting');
    setMeetingAddress(serve.meeting_place_address || '');
    setNotes(serve.notes || '');
    if (serve.scheduled_datetime) {
      const dt = new Date(serve.scheduled_datetime);
      setSelectedDate(new Date(dt.getFullYear(), dt.getMonth(), dt.getDate()));
      let h = dt.getHours(); const m = dt.getMinutes(); const isPM = h >= 12;
      if (h > 12) h -= 12; if (h === 0) h = 12;
      const hIdx = HOURS.indexOf(String(h));
      const roundedM = [0,15,30,45].reduce((prev,curr)=>Math.abs(curr-m)<Math.abs(prev-m)?curr:prev);
      const mIdx = MINUTES.indexOf(String(roundedM).padStart(2,'0'));
      if (hIdx >= 0) setStartHourIdx(hIdx);
      if (mIdx >= 0) setStartMinIdx(mIdx);
      setStartAmPmIdx(isPM ? 1 : 0);
      // Auto-advance end time by +1h
      const endH24 = (dt.getHours() + 1) % 24;
      const endH12 = endH24 % 12 || 12;
      const endHIdx = HOURS.indexOf(String(endH12));
      if (endHIdx >= 0) setEndHourIdx(endHIdx);
      if (mIdx >= 0) setEndMinIdx(mIdx);
      setEndAmPmIdx(endH24 >= 12 ? 1 : 0);
    }
    setInitialized(true);
  }, [serve, initialized]);

  const formatted = address ? formatAddress(address) : {};
  const fullPostingAddress = formatted.line1 ? `${formatted.line1}, ${formatted.line2}` : '';

  const getDateTimeDisplay = useCallback(() => {
    if (!selectedDate) return '';
    const s = idxToTime(startHourIdx, startMinIdx, startAmPmIdx);
    const e = idxToTime(endHourIdx, endMinIdx, endAmPmIdx);
    const st = `${s.hour}:${s.minute} ${s.ampm}`, et = `${e.hour}:${e.minute} ${e.ampm}`;
    const dateStr = format(selectedDate, 'EEE, MMM d, yyyy');
    if (st !== et) return `${dateStr} between ${st} - ${et}`;
    return `${dateStr} at ${st}`;
  }, [selectedDate, startHourIdx, startMinIdx, startAmPmIdx, endHourIdx, endMinIdx, endAmPmIdx]);

  const getDateTimeISO = useCallback(() => {
    if (!selectedDate) return null;
    const s = idxToTime(startHourIdx, startMinIdx, startAmPmIdx);
    let h = parseInt(s.hour); const m = parseInt(s.minute);
    if (s.ampm === 'PM' && h !== 12) h += 12;
    if (s.ampm === 'AM' && h === 12) h = 0;
    const dt = new Date(selectedDate); dt.setHours(h, m, 0, 0); return dt.toISOString();
  }, [selectedDate, startHourIdx, startMinIdx, startAmPmIdx]);

  const buildTemplate = useCallback(() => {
    const defendantName = address?.defendant_name || serve?.defendant_name || '(unknown)';
    const locationLabel = locationType === 'posting' ? 'Place of Posting' : 'Meeting Place';
    const locationAddress = locationType === 'posting' ? fullPostingAddress : (meetingAddress || '(not entered)');
    return `Scheduled Serve Defendant:\n${defendantName}\nPhone: ${phoneNumber || '(not entered)'}\n\nLocation: ${locationLabel} Address:\n${locationAddress}\n\nDate/Time:\n${getDateTimeDisplay() || '(not selected)'}`;
  }, [address, serve, locationType, fullPostingAddress, meetingAddress, getDateTimeDisplay, phoneNumber]);

  useEffect(() => { if (initialized) setNotes(buildTemplate()); }, [locationType, meetingAddress, selectedDate, startHourIdx, startMinIdx, startAmPmIdx, phoneNumber, buildTemplate, initialized]);

  const handleCopyNotes = () => { navigator.clipboard.writeText(notes).then(() => toast.success('Copied', { duration: 1500 })).catch(() => toast.error('Failed to copy')); };

  const handleOpenPicker = () => { if (!ocrBusy) fileInputRef.current?.click(); };
  const handleClearScreenshot = () => {
    if (ocrBusy) return;
    setScreenshotThumb(null);
    setAutoFilled({ phone: false, dateTime: false, locationType: false, meetingAddress: false });
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleScreenshotPicked = async (event) => {
    const file = event.target.files?.[0];
    if (event.target) event.target.value = '';
    if (!file || ocrBusy) return;
    setOcrBusy(true);
    try {
      const dataUrl = await new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = e => resolve(e.target.result); reader.onerror = () => reject(new Error('FILE_READ_ERROR')); reader.readAsDataURL(file); });
      setScreenshotThumb(dataUrl);
      const base64 = dataUrl.split(',')[1];
      if (!base64) throw new Error('FILE_READ_ERROR');
      let response;
      try {
        response = await Promise.race([
          base44.functions.invoke('processOCR', { imageBase64: base64, documentType: 'screenshot', sessionId: null }),
          new Promise((_,reject) => setTimeout(() => reject(new Error('OCR_TIMEOUT')), 30000))
        ]);
      } catch (invokeError) {
        if (invokeError?.message === 'OCR_TIMEOUT') toast.error('OCR taking too long — try again');
        else if (!navigator.onLine) toast.error("No internet. Fill manually.");
        else toast.error('Network error — try again');
        return;
      }
      const rawText = response?.data?.rawText || '';
      if (!rawText) { toast.error("Couldn't read the screenshot. Fill manually."); return; }
      const parsed = parseScheduledServeDraft(rawText);
      const filled = { phone: false, dateTime: false, locationType: false, meetingAddress: false };
      if (parsed.phone) { setPhoneNumber(parsed.phone); filled.phone = true; }
      if (parsed.date) setSelectedDate(parsed.date);
      if (parsed.hour && parsed.minute && parsed.ampm) {
        const hIdx = HOURS.indexOf(parsed.hour), mIdx = MINUTES.indexOf(parsed.minute), apIdx = AMPM.indexOf(parsed.ampm);
        if (hIdx >= 0) setStartHourIdx(hIdx); if (mIdx >= 0) setStartMinIdx(mIdx); if (apIdx >= 0) setStartAmPmIdx(apIdx);
        if (parsed.endHour && parsed.endMinute && parsed.endAmPm) {
          const eHIdx=HOURS.indexOf(parsed.endHour),eMIdx=MINUTES.indexOf(parsed.endMinute),eApIdx=AMPM.indexOf(parsed.endAmPm);
          if (eHIdx>=0) setEndHourIdx(eHIdx); if (eMIdx>=0) setEndMinIdx(eMIdx); if (eApIdx>=0) setEndAmPmIdx(eApIdx);
        } else if (hIdx>=0&&mIdx>=0&&apIdx>=0) {
          let h24=parseInt(parsed.hour,10); if (parsed.ampm==='PM'&&h24!==12) h24+=12; if (parsed.ampm==='AM'&&h24===12) h24=0;
          const endH24=(h24+1)%24; const endApIdx=endH24>=12?1:0; let endH12=endH24%12; if (endH12===0) endH12=12;
          const endHIdx=HOURS.indexOf(String(endH12)); if (endHIdx>=0) setEndHourIdx(endHIdx); setEndMinIdx(mIdx); setEndAmPmIdx(endApIdx);
        }
      }
      if (parsed.date||(parsed.hour&&parsed.minute&&parsed.ampm)) filled.dateTime=true;
      if (parsed.locationType) { setLocationType(parsed.locationType); filled.locationType=true; }
      if (parsed.locationType==='meeting'&&parsed.meetingAddress) { setMeetingAddress(parsed.meetingAddress); filled.meetingAddress=true; }
      setAutoFilled(filled);
      if (Object.values(filled).some(Boolean)) toast.success('Screenshot read — review highlighted fields');
      else toast.error('Could not match the draft template. Fill manually.');
    } catch (err) {
      if (err?.message==='FILE_READ_ERROR') toast.error("Couldn't read that image."); else toast.error('Something went wrong. Fill manually.');
    } finally { setOcrBusy(false); }
  };

  const handleSave = async () => {
    if (!selectedDate) { toast.error('Please select a date'); return; }
    const isoDate = getDateTimeISO();
    if (locationType === 'meeting' && !meetingAddress.trim()) { toast.error('Please enter a meeting place address'); return; }
    setSaving(true);
    let meetingLat = serve?.meeting_place_lat || null, meetingLng = serve?.meeting_place_lng || null;
    if (locationType === 'meeting' && meetingAddress.trim() && meetingAddress !== serve?.meeting_place_address) {
      const geocodeResult = await base44.integrations.Core.InvokeLLM({
        prompt: `Geocode this address and return lat/lng: "${meetingAddress}". Return null if not found.`,
        response_json_schema: { type: 'object', properties: { lat: { type: 'number' }, lng: { type: 'number' }, valid: { type: 'boolean' } } }
      });
      if (!geocodeResult.valid) { toast.error('Could not geocode meeting place address.'); setSaving(false); return; }
      meetingLat = geocodeResult.lat; meetingLng = geocodeResult.lng;
    }
    try {
      await base44.entities.ScheduledServe.update(serveId, {
        phone_number: phoneNumber, scheduled_datetime: isoDate, notes, location_type: locationType,
        meeting_place_address: locationType === 'meeting' ? meetingAddress : null,
        meeting_place_lat: locationType === 'meeting' ? meetingLat : null,
        meeting_place_lng: locationType === 'meeting' ? meetingLng : null,
        defendant_name: address?.defendant_name || serve?.defendant_name || '',
        folder_name: route?.folder_name || serve?.folder_name || ''
      });
      toast.success('Scheduled serve updated');
      queryClient.refetchQueries({ queryKey: ['workerScheduledServes', user?.id] });
      queryClient.refetchQueries({ queryKey: ['scheduledServes', routeId] });
      queryClient.refetchQueries({ queryKey: ['scheduledServesCount', routeId] });
      navigate(-1);
    } catch (error) {
      console.error('Failed to update:', error); toast.error('Failed to update');
    } finally { setSaving(false); }
  };

  const handleDelete = async () => {
    const confirmed = window.confirm('Delete this scheduled serve? This cannot be undone.');
    if (!confirmed) return;
    setDeleting(true);
    try {
      await base44.entities.ScheduledServe.delete(serveId);
      toast.success('Scheduled serve deleted');
      queryClient.refetchQueries({ queryKey: ['workerScheduledServes', user?.id] });
      queryClient.refetchQueries({ queryKey: ['scheduledServes', routeId] });
      queryClient.refetchQueries({ queryKey: ['scheduledServesCount', routeId] });
      navigate(-1);
    } catch (error) {
      console.error('Failed to delete:', error); toast.error('Failed to delete');
    } finally { setDeleting(false); }
  };

  if (serveLoading || addressLoading) {
    return <div className="min-h-screen flex items-center justify-center" style={{ background: 'transparent' }}><Loader2 className="w-8 h-8 animate-spin" style={{ color: '#e9c349' }} /></div>;
  }

  return (
    <div style={{ minHeight: '100vh', background: 'transparent', paddingBottom: 32 }}>
      <header className="px-4 py-3 flex items-center gap-3 sticky top-0 z-50"
        style={{ background: 'rgba(10,14,30,0.85)', backdropFilter: 'blur(16px)', WebkitBackdropFilter: 'blur(16px)', borderBottom: '1px solid rgba(233,195,73,0.20)' }}>
        <button onClick={() => navigate(-1)} style={{ color: '#e9c349' }}><ChevronLeft className="w-6 h-6" /></button>
        <h1 className="font-bold text-lg flex-1" style={{ color: '#E6E1E4' }}>Edit Scheduled Serve</h1>
        <button onClick={handleDelete} disabled={deleting} className="p-2 rounded-full hover:opacity-80" style={{ color: '#ef4444' }}>
          {deleting ? <Loader2 className="w-5 h-5 animate-spin" /> : <Trash2 className="w-5 h-5" />}
        </button>
      </header>

      <main className="px-4 py-4 max-w-lg mx-auto space-y-3">
        <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleScreenshotPicked} />

        {/* Address Info + Upload Screenshot */}
        <div style={card}>
          <div className="flex items-start justify-between gap-3">
            <div className="flex-1 min-w-0">
              <div style={label}><MapPin className="w-3.5 h-3.5" style={{ color: '#e5b9e1' }} />Address</div>
              <p className="font-bold text-sm" style={{ color: '#E6E1E4' }}>{formatted.line1 || serve?.defendant_name}</p>
              <p className="text-xs mt-0.5" style={{ color: '#9CA3AF' }}>{formatted.line2}</p>
              {address?.defendant_name && <p className="text-sm mt-1" style={{ color: '#d0c3cb' }}>{address.defendant_name}</p>}
            </div>
            <button type="button" onClick={handleOpenPicker} disabled={ocrBusy} aria-label="Upload screenshot"
              style={{ flexShrink:0,height:'52px',minWidth:'52px',padding:'0 10px',borderRadius:'12px',background:ocrBusy?'rgba(233,195,73,0.10)':'rgba(233,195,73,0.15)',border:'1px solid rgba(233,195,73,0.45)',color:ocrBusy?'rgba(233,195,73,0.5)':'#e9c349',cursor:ocrBusy?'not-allowed':'pointer',display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',gap:'2px',fontSize:'10px',fontWeight:700 }}>
              {ocrBusy ? <Loader2 className="w-5 h-5 animate-spin" /> : <ImageIcon className="w-5 h-5" />}
              <span>{ocrBusy ? 'READING' : 'UPLOAD'}</span>
            </button>
          </div>
          {screenshotThumb && (
            <div style={{ marginTop:'12px',display:'flex',alignItems:'center',gap:'10px',padding:'8px',borderRadius:'10px',background:'rgba(255,255,255,0.04)',border:'1px solid rgba(255,255,255,0.08)' }}>
              <img src={screenshotThumb} alt="Screenshot preview" style={{ width:'44px',height:'44px',objectFit:'cover',borderRadius:'8px',flexShrink:0 }} />
              <div className="flex-1 min-w-0">
                <p className="text-xs font-semibold" style={{ color:'#e6e1e4' }}>{ocrBusy?'Reading screenshot…':'Screenshot attached'}</p>
                <p className="text-[11px]" style={{ color:'#8a7f87' }}>{ocrBusy?'Hold tight':'Review highlighted fields below'}</p>
              </div>
              <button type="button" onClick={handleClearScreenshot} disabled={ocrBusy} aria-label="Clear screenshot"
                style={{ flexShrink:0,width:'32px',height:'32px',borderRadius:'8px',background:'rgba(255,255,255,0.06)',border:'1px solid rgba(255,255,255,0.12)',color:'#d0c3cb',display:'flex',alignItems:'center',justifyContent:'center',cursor:ocrBusy?'not-allowed':'pointer' }}>
                <X className="w-4 h-4" />
              </button>
            </div>
          )}
        </div>

        {/* Phone Number */}
        <div style={card}>
          <div className="flex items-center justify-between">
            <label style={label}><Phone className="w-3.5 h-3.5" style={{ color: '#e5b9e1' }} />Phone Number</label>
            <AutoFilledChip show={autoFilled.phone} />
          </div>
          <input type="tel" placeholder="(555) 123-4567" value={phoneNumber} onChange={e => { setPhoneNumber(e.target.value); clearAutoFilled('phone'); }} style={inputStyle} />
        </div>

        {/* Date & Time */}
        <div style={card}>
          <div className="flex items-center justify-between">
            <label style={label}><CalendarIcon className="w-3.5 h-3.5" style={{ color: '#e5b9e1' }} />Date &amp; Time</label>
            <AutoFilledChip show={autoFilled.dateTime} />
          </div>
          <DateTimeWheelPicker
            date={selectedDate}
            onDateChange={(d) => { setSelectedDate(d); clearAutoFilled('dateTime'); }}
            startHourIndex={startHourIdx} startMinuteIndex={startMinIdx} startAmPmIndex={startAmPmIdx}
            onStartChange={(h,m,ap) => { setStartHourIdx(h); setStartMinIdx(m); setStartAmPmIdx(ap); clearAutoFilled('dateTime'); }}
            endHourIndex={endHourIdx} endMinuteIndex={endMinIdx} endAmPmIndex={endAmPmIdx}
            onEndChange={(h,m,ap) => { setEndHourIdx(h); setEndMinIdx(m); setEndAmPmIdx(ap); }}
            showEnd={true}
          />
          {selectedDate && <p className="text-sm font-semibold mt-3 text-center" style={{ color: '#e9c349' }}>{getDateTimeDisplay()}</p>}
        </div>

        {/* Location */}
        <div style={card}>
          <div className="flex items-center justify-between">
            <label style={label}><MapPin className="w-3.5 h-3.5" style={{ color: '#e5b9e1' }} />Location</label>
            <AutoFilledChip show={autoFilled.locationType || autoFilled.meetingAddress} />
          </div>
          <div className="grid grid-cols-2 gap-2 mb-3">
            {['posting', 'meeting'].map(type => (
              <button key={type} onClick={() => { setLocationType(type); clearAutoFilled('locationType'); }}
                style={{ padding:'10px',borderRadius:'10px',fontSize:'13px',fontWeight:600,border:locationType===type?'2px solid #e9c349':'1px solid rgba(255,255,255,0.10)',background:locationType===type?'rgba(233,195,73,0.15)':'rgba(255,255,255,0.04)',color:locationType===type?'#e9c349':'#6B7280',cursor:'pointer',transition:'all 0.15s' }}>
                {type === 'posting' ? 'Place of Posting' : 'Meeting Place'}
              </button>
            ))}
          </div>
          {locationType === 'posting' ? (
            <div style={{ background:'rgba(255,255,255,0.04)',borderRadius:'10px',padding:'10px 12px' }}>
              <p className="text-xs" style={{ color:'#9CA3AF' }}>Will use: {formatted.line1}, {formatted.line2}</p>
            </div>
          ) : (
            <input placeholder="Enter meeting place address..." value={meetingAddress} onChange={e => { setMeetingAddress(e.target.value); clearAutoFilled('meetingAddress'); }} style={inputStyle} />
          )}
        </div>

        {/* Notes */}
        <div style={card}>
          <div className="flex items-center justify-between mb-2">
            <label style={{ ...label, marginBottom:0 }}><FileText className="w-3.5 h-3.5" style={{ color:'#e5b9e1' }} />Notes</label>
            <button onClick={handleCopyNotes} className="flex items-center gap-1 text-xs font-semibold px-2 py-1 rounded-lg hover:opacity-80" style={{ color:'#e9c349',background:'rgba(233,195,73,0.12)',border:'1px solid rgba(233,195,73,0.25)' }}>
              <Copy className="w-3.5 h-3.5" /> Copy
            </button>
          </div>
          <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={6} style={{ ...inputStyle,resize:'none',fontFamily:'inherit',lineHeight:1.5 }} />
        </div>

        {/* Save Button */}
        <button onClick={handleSave} disabled={saving || !selectedDate}
          style={{ width:'100%',height:'52px',borderRadius:'14px',background:saving||!selectedDate?'rgba(233,195,73,0.25)':'#e9c349',color:saving||!selectedDate?'rgba(233,195,73,0.5)':'#0B0F1E',fontWeight:700,fontSize:'15px',border:'none',cursor:saving||!selectedDate?'not-allowed':'pointer',display:'flex',alignItems:'center',justifyContent:'center',gap:'8px',transition:'all 0.15s' }}>
          {saving && <Loader2 className="w-5 h-5 animate-spin" />}
          Save Changes
        </button>
      </main>
    </div>
  );
}
