import React, { useState, useEffect, useCallback } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import { ChevronLeft, Phone, CalendarIcon, MapPin, FileText, Loader2, Copy, Clock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { toast } from 'sonner';
import { formatAddress } from '@/components/utils/addressUtils';
import { getCompanyId } from '@/components/utils/companyUtils';
import { format } from 'date-fns';
import DateTimeWheelPicker from '@/components/common/DateTimeWheelPicker';

export default function CreateScheduledServe() {
  const navigate = useNavigate();
  const urlParams = new URLSearchParams(window.location.search);
  const addressId = urlParams.get('addressId');
  const routeId = urlParams.get('routeId');

  const [phoneNumber, setPhoneNumber] = useState('');
  const [selectedDate, setSelectedDate] = useState(null);

  // Wheel picker indices — start at noon (12:00 PM)
  // HOURS: index 0=1, ..., 11=12. Noon = index 11 (12), PM = index 1
  const [startHourIdx, setStartHourIdx] = useState(11); // 12
  const [startMinIdx, setStartMinIdx] = useState(0);   // :00
  const [startAmPmIdx, setStartAmPmIdx] = useState(1); // PM
  const [endHourIdx, setEndHourIdx] = useState(11);
  const [endMinIdx, setEndMinIdx] = useState(0);
  const [endAmPmIdx, setEndAmPmIdx] = useState(1);

  const HOURS = ['1','2','3','4','5','6','7','8','9','10','11','12'];
  const MINUTES = ['00','15','30','45'];
  const AMPM = ['AM','PM'];

  // Convert wheel indices to h/m/ampm strings
  const idxToTime = (hIdx, mIdx, apIdx) => ({
    hour: HOURS[hIdx],
    minute: MINUTES[mIdx],
    ampm: AMPM[apIdx]
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
    return `${format(selectedDate, 'EEE, MMM d, yyyy')} at ${formatTimeDisplay(s.hour, s.minute, s.ampm)}`;
  }, [selectedDate, startHourIdx, startMinIdx, startAmPmIdx]);

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

  // Build notes template
  const buildTemplate = useCallback(() => {
    const defendantName = address?.defendant_name || '(unknown)';
    const locationLabel = locationType === 'posting' ? 'Place of Posting' : 'Meeting Place';
    const locationAddress = locationType === 'posting'
      ? fullPostingAddress
      : (meetingAddress || '(not entered)');
    const dateTimeStr = getDateTimeDisplay() || '(not selected)';

    return `Scheduled Serve Defendant:\n${defendantName}\nPhone: ${phoneNumber || '(not entered)'}\n\nLocation: ${locationLabel} Address:\n${locationAddress}\n\nDate/Time:\n${dateTimeStr}`;
  }, [address, locationType, fullPostingAddress, meetingAddress, getDateTimeDisplay, phoneNumber]);

  // Auto-populate notes on first load
  const [templateInitialized, setTemplateInitialized] = useState(false);
  useEffect(() => {
    if (address && !templateInitialized) {
      setNotes(buildTemplate());
      setTemplateInitialized(true);
    }
  }, [address, templateInitialized, buildTemplate]);

  // Update template when dependencies change (only if user hasn't manually edited away from template)
  useEffect(() => {
    if (templateInitialized) {
      setNotes(buildTemplate());
    }
  }, [locationType, meetingAddress, selectedDate, startHourIdx, startMinIdx, startAmPmIdx, phoneNumber, buildTemplate, templateInitialized]);

  const handleCopyNotes = () => {
    navigator.clipboard.writeText(notes).then(() => {
      toast.success('Copied', { duration: 1500 });
    }).catch(() => {
      toast.error('Failed to copy');
    });
  };

  const handleSave = async () => {
    if (!selectedDate) {
      toast.error('Please select a date');
      return;
    }
    const isoDate = getDateTimeISO();

    if (locationType === 'meeting' && !meetingAddress.trim()) {
      toast.error('Please enter a meeting place address');
      return;
    }

    setSaving(true);
    const companyId = getCompanyId(user) || address?.company_id;

    let meetingLat = null;
    let meetingLng = null;

    if (locationType === 'meeting' && meetingAddress.trim()) {
      const geocodeResult = await base44.integrations.Core.InvokeLLM({
        prompt: `Geocode this address and return lat/lng coordinates: "${meetingAddress}". If you cannot geocode it, return null values.`,
        response_json_schema: {
          type: "object",
          properties: {
            lat: { type: "number" },
            lng: { type: "number" },
            valid: { type: "boolean" }
          }
        }
      });

      if (!geocodeResult.valid) {
        toast.error('Could not geocode meeting place address. Please check the address and try again.');
        setSaving(false);
        return;
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
        notes: notes,
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
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
      </div>
    );
  }



  return (
    <div className="min-h-screen bg-gray-50 pb-8">
      <header className="bg-blue-500 text-white px-4 py-3 flex items-center gap-3 sticky top-0 z-50">
        <button onClick={() => navigate(-1)}>
          <ChevronLeft className="w-6 h-6" />
        </button>
        <h1 className="font-bold text-lg">Schedule Serve</h1>
      </header>

      <main className="px-4 py-4 max-w-lg mx-auto space-y-4">
        {/* Address Info */}
        <Card>
          <CardContent className="p-4">
            <p className="text-xs font-semibold text-gray-500 mb-1">ADDRESS</p>
            <p className="font-bold text-gray-900">{formatted.line1}</p>
            <p className="text-sm text-gray-500">{formatted.line2}</p>
            {address?.defendant_name && (
              <p className="text-sm text-gray-600 mt-1">{address.defendant_name}</p>
            )}
          </CardContent>
        </Card>

        {/* Phone Number */}
        <Card>
          <CardContent className="p-4">
            <label className="text-xs font-semibold text-gray-500 flex items-center gap-1.5 mb-2">
              <Phone className="w-3.5 h-3.5" /> PHONE NUMBER
            </label>
            <Input
              type="tel"
              placeholder="(555) 123-4567"
              value={phoneNumber}
              onChange={(e) => setPhoneNumber(e.target.value)}
            />
          </CardContent>
        </Card>

        {/* Combined Date + Time Picker */}
        <Card>
          <CardContent className="p-4">
            <label className="text-xs font-semibold text-gray-500 flex items-center gap-1.5 mb-3">
              <CalendarIcon className="w-3.5 h-3.5" /> DATE &amp; TIME
            </label>
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
              <p className="text-sm text-blue-600 font-medium mt-3 text-center">{getDateTimeDisplay()}</p>
            )}
          </CardContent>
        </Card>

        {/* Notes */}
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-semibold text-gray-500 flex items-center gap-1.5">
                <FileText className="w-3.5 h-3.5" /> NOTES
              </label>
              <button
                onClick={handleCopyNotes}
                className="flex items-center gap-1 text-xs text-blue-600 font-medium hover:text-blue-800 transition-colors px-2 py-1 rounded-lg hover:bg-blue-50"
              >
                <Copy className="w-3.5 h-3.5" />
                Copy
              </button>
            </div>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm resize-none"
              rows={6}
            />
          </CardContent>
        </Card>

        {/* Save Button */}
        <Button
          onClick={handleSave}
          disabled={saving || !selectedDate}
          className="w-full h-12 bg-blue-500 hover:bg-blue-600 text-white font-bold text-sm"
        >
          {saving ? <Loader2 className="w-5 h-5 animate-spin mr-2" /> : null}
          Create Scheduled Serve
        </Button>
      </main>
    </div>
  );
}