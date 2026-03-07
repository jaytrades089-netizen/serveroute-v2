import React, { useState, useEffect, useCallback } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import { ChevronLeft, Phone, Calendar as CalendarIcon, MapPin, FileText, Loader2, Copy, Clock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import { formatAddress } from '@/components/utils/addressUtils';
import { getCompanyId } from '@/components/utils/companyUtils';
import { format } from 'date-fns';

export default function CreateScheduledServe() {
  const navigate = useNavigate();
  const urlParams = new URLSearchParams(window.location.search);
  const addressId = urlParams.get('addressId');
  const routeId = urlParams.get('routeId');

  const [phoneNumber, setPhoneNumber] = useState('');
  const [selectedDate, setSelectedDate] = useState(null);
  const [selectedHour, setSelectedHour] = useState('');
  const [selectedMinute, setSelectedMinute] = useState('');
  const [selectedAmPm, setSelectedAmPm] = useState('AM');
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

  // Build the combined datetime string for display and storage
  const getDateTimeDisplay = useCallback(() => {
    if (!selectedDate || !selectedHour) return '';
    let h = parseInt(selectedHour);
    const m = selectedMinute || '00';
    if (selectedAmPm === 'PM' && h !== 12) h += 12;
    if (selectedAmPm === 'AM' && h === 12) h = 0;
    const dt = new Date(selectedDate);
    dt.setHours(h, parseInt(m), 0, 0);
    return format(dt, "EEE, MMM d, yyyy 'at' h:mm a");
  }, [selectedDate, selectedHour, selectedMinute, selectedAmPm]);

  // Build the ISO datetime for saving
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

  // Build notes template
  const buildTemplate = useCallback(() => {
    const defendantName = address?.defendant_name || '(unknown)';
    const locationLabel = locationType === 'posting' ? 'Place of Posting' : 'Meeting Place';
    const locationAddress = locationType === 'posting'
      ? fullPostingAddress
      : (meetingAddress || '(not entered)');
    const dateTimeStr = getDateTimeDisplay() || '(not selected)';

    return `Scheduled Serve\nDefendant: ${defendantName}\nLocation: ${locationLabel}\nAddress: ${locationAddress}\nDate/Time: ${dateTimeStr}`;
  }, [address, locationType, fullPostingAddress, meetingAddress, getDateTimeDisplay]);

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
  }, [locationType, meetingAddress, selectedDate, selectedHour, selectedMinute, selectedAmPm, buildTemplate, templateInitialized]);

  const handleCopyNotes = () => {
    navigator.clipboard.writeText(notes).then(() => {
      toast.success('Copied', { duration: 1500 });
    }).catch(() => {
      toast.error('Failed to copy');
    });
  };

  const handleSave = async () => {
    const isoDate = getDateTimeISO();
    if (!isoDate) {
      toast.error('Please select a date and time');
      return;
    }

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

  const hours = Array.from({ length: 12 }, (_, i) => i + 1);
  const minutes = ['00', '15', '30', '45'];

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

        {/* Date Picker */}
        <Card>
          <CardContent className="p-4">
            <label className="text-xs font-semibold text-gray-500 flex items-center gap-1.5 mb-3">
              <CalendarIcon className="w-3.5 h-3.5" /> DATE
            </label>
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" className="w-full justify-start text-left font-normal">
                  <CalendarIcon className="w-4 h-4 mr-2 text-gray-400" />
                  {selectedDate ? format(selectedDate, 'EEEE, MMMM d, yyyy') : 'Pick a date'}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                  mode="single"
                  selected={selectedDate}
                  onSelect={setSelectedDate}
                  disabled={(date) => date < new Date(new Date().setHours(0, 0, 0, 0))}
                />
              </PopoverContent>
            </Popover>
          </CardContent>
        </Card>

        {/* Time Picker */}
        <Card>
          <CardContent className="p-4">
            <label className="text-xs font-semibold text-gray-500 flex items-center gap-1.5 mb-3">
              <Clock className="w-3.5 h-3.5" /> TIME
            </label>
            <div className="flex gap-2">
              <Select value={selectedHour} onValueChange={setSelectedHour}>
                <SelectTrigger className="flex-1">
                  <SelectValue placeholder="Hour" />
                </SelectTrigger>
                <SelectContent>
                  {hours.map(h => (
                    <SelectItem key={h} value={String(h)}>{h}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={selectedMinute} onValueChange={setSelectedMinute}>
                <SelectTrigger className="w-20">
                  <SelectValue placeholder="Min" />
                </SelectTrigger>
                <SelectContent>
                  {minutes.map(m => (
                    <SelectItem key={m} value={m}>{m}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={selectedAmPm} onValueChange={setSelectedAmPm}>
                <SelectTrigger className="w-20">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="AM">AM</SelectItem>
                  <SelectItem value="PM">PM</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {selectedDate && selectedHour && (
              <p className="text-sm text-blue-600 font-medium mt-2">
                {getDateTimeDisplay()}
              </p>
            )}
          </CardContent>
        </Card>

        {/* Location Toggle */}
        <Card>
          <CardContent className="p-4">
            <label className="text-xs font-semibold text-gray-500 flex items-center gap-1.5 mb-3">
              <MapPin className="w-3.5 h-3.5" /> LOCATION
            </label>
            <div className="grid grid-cols-2 gap-2 mb-3">
              <button
                onClick={() => setLocationType('posting')}
                className={`p-3 rounded-xl text-sm font-semibold border-2 transition-all ${
                  locationType === 'posting'
                    ? 'border-blue-500 bg-blue-50 text-blue-700'
                    : 'border-gray-200 bg-white text-gray-600'
                }`}
              >
                Place of Posting
              </button>
              <button
                onClick={() => setLocationType('meeting')}
                className={`p-3 rounded-xl text-sm font-semibold border-2 transition-all ${
                  locationType === 'meeting'
                    ? 'border-blue-500 bg-blue-50 text-blue-700'
                    : 'border-gray-200 bg-white text-gray-600'
                }`}
              >
                Meeting Place
              </button>
            </div>
            {locationType === 'posting' ? (
              <div className="bg-gray-50 rounded-lg p-3 text-sm text-gray-600">
                Will use: {formatted.line1}, {formatted.line2}
              </div>
            ) : (
              <Input
                placeholder="Enter meeting place address..."
                value={meetingAddress}
                onChange={(e) => setMeetingAddress(e.target.value)}
              />
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
          disabled={saving || !selectedDate || !selectedHour}
          className="w-full h-12 bg-blue-500 hover:bg-blue-600 text-white font-bold text-sm"
        >
          {saving ? <Loader2 className="w-5 h-5 animate-spin mr-2" /> : null}
          Create Scheduled Serve
        </Button>
      </main>
    </div>
  );
}