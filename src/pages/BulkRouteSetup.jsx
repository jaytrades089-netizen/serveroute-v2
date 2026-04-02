import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import { getCompanyId } from '@/components/utils/companyUtils';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Calendar } from '@/components/ui/calendar';
import { ArrowLeft, Check, Loader2, Plus, Minus } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { toast } from 'sonner';
import { format, addDays, subDays } from 'date-fns';
import {
  DOCUMENT_INFO,
  PAY_RATES,
  loadScanSession,
  saveScanSession,
  clearScanSession,
  generateNormalizedKey
} from '@/components/scanning/ScanningService';

const ATTEMPT_OPTIONS = [3, 5, 7];
const SPREAD_OPTIONS = [10, 14, 21];

const PILE_COLORS = [
  { dot: 'bg-orange-500', text: 'text-orange-600', bg: 'bg-orange-50' },
  { dot: 'bg-blue-500', text: 'text-blue-600', bg: 'bg-blue-50' },
  { dot: 'bg-green-600', text: 'text-green-700', bg: 'bg-green-50' },
  { dot: 'bg-purple-600', text: 'text-purple-700', bg: 'bg-purple-50' },
];

function getPileColor(pileNumber) {
  const idx = Math.min((pileNumber || 1) - 1, PILE_COLORS.length - 1);
  return PILE_COLORS[idx];
}

function autoSuggestName(addresses) {
  const today = format(new Date(), 'MMM d');
  const cities = addresses
    .filter(a => a.extractedData?.city)
    .map(a => a.extractedData.city);
  if (cities.length === 0) return `Route - ${today}`;
  const freq = {};
  cities.forEach(c => { freq[c] = (freq[c] || 0) + 1; });
  const top = Object.entries(freq).sort((a, b) => b[1] - a[1])[0][0];
  return `${top} - ${today}`;
}

export default function BulkRouteSetup() {
  const navigate = useNavigate();
  const urlParams = new URLSearchParams(window.location.search);
  const sessionId = urlParams.get('sessionId');

  const [session, setSession] = useState(null);
  const [pileGroups, setPileGroups] = useState([]);
  const [currentPileIndex, setCurrentPileIndex] = useState(0);

  // Per-pile form state
  const [routeName, setRouteName] = useState('');
  const [dueDate, setDueDate] = useState(null);
  const [requiredAttempts, setRequiredAttempts] = useState(3);
  const [minimumDaysSpread, setMinimumDaysSpread] = useState(10);
  const [isSaving, setIsSaving] = useState(false);
  const [creationProgress, setCreationProgress] = useState('');

  const [showCustomAttempts, setShowCustomAttempts] = useState(false);
  const [showCustomSpread, setShowCustomSpread] = useState(false);
  const [customAttempts, setCustomAttempts] = useState(4);
  const [customSpread, setCustomSpread] = useState(15);

  const { data: user } = useQuery({
    queryKey: ['currentUser'],
    queryFn: () => base44.auth.me(),
  });

  const { data: userSettings } = useQuery({
    queryKey: ['userSettings', user?.id],
    queryFn: async () => {
      if (!user?.id) return null;
      const settings = await base44.entities.UserSettings.filter({ user_id: user.id });
      return settings[0] || null;
    },
    enabled: !!user?.id,
  });

  useEffect(() => {
    if (!sessionId) { navigate(createPageUrl('ScanDocumentType')); return; }
    const s = loadScanSession(sessionId);
    if (!s) { navigate(createPageUrl('ScanDocumentType')); return; }
    setSession(s);

    // Group by pile_number, only valid addresses
    const valid = s.addresses.filter(
      a => (a.status === 'extracted' || a.status === 'resolved') && a.extractedData?.street
    );
    const grouped = {};
    valid.forEach(addr => {
      const p = addr.pile_number || 1;
      if (!grouped[p]) grouped[p] = [];
      grouped[p].push(addr);
    });
    const sorted = Object.keys(grouped)
      .map(Number)
      .sort((a, b) => a - b)
      .map(p => ({ pileNumber: p, addresses: grouped[p] }));
    setPileGroups(sorted);

    // Pre-fill first pile
    if (sorted.length > 0) {
      setRouteName(autoSuggestName(sorted[0].addresses));
      setDueDate(addDays(new Date(), 14));
    }
  }, [sessionId]);

  const currentPile = pileGroups[currentPileIndex];
  const totalPiles = pileGroups.length;

  const firstAttemptDeadline = useMemo(() => {
    if (!dueDate) return null;
    return subDays(dueDate, minimumDaysSpread);
  }, [dueDate, minimumDaysSpread]);

  const qualifierAttempts = 3;
  const flexibleAttempts = Math.max(0, requiredAttempts - qualifierAttempts);

  const geocodeAddress = async (fullAddress, apiKey) => {
    if (!apiKey) return null;
    try {
      const response = await fetch(
        `https://www.mapquestapi.com/geocoding/v1/address?key=${apiKey}&location=${encodeURIComponent(fullAddress)}`
      );
      const data = await response.json();
      const loc = data?.results?.[0]?.locations?.[0]?.latLng;
      if (loc?.lat && loc?.lng) return { lat: loc.lat, lng: loc.lng };
      return null;
    } catch { return null; }
  };

  const handleCreateRoute = async () => {
    if (!currentPile || !user || isSaving) return;
    if (!routeName.trim()) { toast.error('Please enter a route name'); return; }
    if (!dueDate) { toast.error('Please select a due date'); return; }

    setIsSaving(true);
    setCreationProgress('Creating route...');

    try {
      const isBoss = user.role === 'boss' || user.role === 'admin';
      const mapquestApiKey = userSettings?.mapquest_api_key;
      const pileAddresses = currentPile.addresses;

      const routeData = {
        company_id: getCompanyId(user),
        folder_name: routeName,
        due_date: format(dueDate, 'yyyy-MM-dd'),
        status: isBoss ? 'ready' : 'assigned',
        worker_id: isBoss ? null : user.id,
        total_addresses: pileAddresses.length,
        served_count: 0,
        required_attempts: requiredAttempts,
        qualifier_attempts: qualifierAttempts,
        flexible_attempts: flexibleAttempts,
        minimum_days_spread: minimumDaysSpread,
        first_attempt_deadline: firstAttemptDeadline ? format(firstAttemptDeadline, 'yyyy-MM-dd') : null,
        am_required: true,
        pm_required: true,
        weekend_required: true,
        created_via: 'bulk_scan',
        scan_session_id: session.dbSessionId || null,
        ...(isBoss ? {} : { assigned_at: new Date().toISOString(), assigned_by: user.id }),
      };

      const route = await base44.entities.Route.create(routeData);

      for (let i = 0; i < pileAddresses.length; i++) {
        const addr = pileAddresses[i];
        setCreationProgress(`Creating address ${i + 1}/${pileAddresses.length}...`);

        let lat = addr.lat || null;
        let lng = addr.lng || null;
        let geocodeStatus = lat ? 'exact' : 'pending';

        if (!lat && mapquestApiKey && addr.extractedData?.fullAddress) {
          const geo = await geocodeAddress(addr.extractedData.fullAddress, mapquestApiKey);
          if (geo) { lat = geo.lat; lng = geo.lng; geocodeStatus = 'exact'; }
          else { geocodeStatus = 'failed'; }
        }

        const addressStr = addr.status === 'resolved' && addr.manualEntry
          ? addr.manualEntry
          : addr.extractedData.fullAddress;

        await base44.entities.Address.create({
          company_id: getCompanyId(user),
          route_id: route.id,
          legal_address: addr.ocrRawText || addressStr,
          normalized_address: addressStr,
          city: addr.extractedData.city,
          state: addr.extractedData.state,
          zip: addr.extractedData.zip,
          lat,
          lng,
          serve_type: addr.extractedData?.documentType || session.documentType,
          pay_rate: PAY_RATES[session.documentType],
          status: 'pending',
          served: false,
          attempts_count: 0,
          defendant_name: addr.defendantName || null,
          ocr_raw_text: addr.ocrRawText || null,
          confidence_score: addr.confidence,
          manual_edit_flag: addr.manuallyEdited || addr.status === 'resolved' || false,
          scanned_by: user.id,
          scanned_at: new Date().toISOString(),
          scan_session_id: session.dbSessionId || null,
          normalized_key: generateNormalizedKey(addr.extractedData),
          has_related_addresses: false,
          related_address_count: 0,
          geocode_status: geocodeStatus,
        });
      }

      const isLast = currentPileIndex === totalPiles - 1;

      if (isLast) {
        if (session.dbSessionId) {
          await base44.entities.ScanSession.update(session.dbSessionId, {
            status: 'completed',
            completed_at: new Date().toISOString(),
          });
        }
        clearScanSession(session.id);
        toast.success('All routes created!');
        navigate(createPageUrl(isBoss ? 'BossRoutes' : 'WorkerRoutes'));
      } else {
        toast.success(`Route ${currentPileIndex + 1} created ✓`);
        const nextIdx = currentPileIndex + 1;
        const nextPile = pileGroups[nextIdx];
        setCurrentPileIndex(nextIdx);
        setRouteName(autoSuggestName(nextPile.addresses));
        setDueDate(addDays(new Date(), 14));
        setRequiredAttempts(3);
        setMinimumDaysSpread(10);
      }
    } catch (error) {
      toast.error('Failed to create route: ' + error.message);
    } finally {
      setIsSaving(false);
      setCreationProgress('');
    }
  };

  if (!session || pileGroups.length === 0) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-orange-500" />
      </div>
    );
  }

  const progress = (currentPileIndex / totalPiles) * 100;
  const pileColor = getPileColor(currentPile?.pileNumber);

  return (
    <div className="min-h-screen bg-gray-50 pb-24">
      {/* Header */}
      <div className="bg-white border-b px-4 py-3 flex items-center gap-3">
        {!isSaving && (
          <button
            onClick={() => navigate(createPageUrl(`ScanSortReview?sessionId=${session.id}`))}
            className="p-2 rounded-lg hover:bg-gray-100"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
        )}
        <h1 className="text-lg font-semibold flex-1">Create Routes</h1>
        <span className="text-sm font-semibold text-orange-600">
          Route {currentPileIndex + 1} of {totalPiles}
        </span>
      </div>

      {/* Progress bar */}
      <div className="h-1 bg-gray-200">
        <div
          className="h-1 bg-orange-500 transition-all duration-500"
          style={{ width: `${progress}%` }}
        />
      </div>

      {/* Pile color indicator */}
      {currentPile && (
        <div className={`px-4 py-2 flex items-center gap-2 ${pileColor.bg} border-b`}>
          <div className={`w-3 h-3 rounded-full flex-shrink-0 ${pileColor.dot}`} />
          <span className={`text-sm font-semibold ${pileColor.text}`}>
            Setting up Pile {currentPile.pileNumber} — {currentPile.addresses.length} address{currentPile.addresses.length !== 1 ? 'es' : ''}
          </span>
        </div>
      )}

      {/* Body */}
      <div className="p-4 max-w-lg mx-auto space-y-6">
        {/* Route Name */}
        <div>
          <Label className="text-sm font-medium">ROUTE NAME *</Label>
          <Input
            value={routeName}
            onChange={(e) => setRouteName(e.target.value)}
            placeholder="Detroit East - Feb 2"
            className="mt-1"
            disabled={isSaving}
          />
        </div>

        {/* Due Date */}
        <div>
          <Label className="text-sm font-medium">DUE DATE *</Label>
          <Card className="mt-2">
            <CardContent className="p-3">
              <Calendar
                mode="single"
                selected={dueDate}
                onSelect={setDueDate}
                disabled={(date) => date < new Date() || isSaving}
                className="mx-auto"
              />
              {dueDate && (
                <p className="text-center text-sm text-gray-600 mt-2">
                  Selected: {format(dueDate, 'MMMM d, yyyy')}
                </p>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Required Attempts */}
        <div>
          <Label className="text-sm font-medium">REQUIRED ATTEMPTS *</Label>
          <p className="text-xs text-gray-500 mb-2">How many attempts before marking unable to serve?</p>
          <div className="grid grid-cols-4 gap-2">
            {ATTEMPT_OPTIONS.map((num) => (
              <Button
                key={num}
                variant={requiredAttempts === num ? 'default' : 'outline'}
                className={`h-16 flex flex-col ${requiredAttempts === num ? 'bg-orange-500 hover:bg-orange-600' : ''}`}
                onClick={() => setRequiredAttempts(num)}
                disabled={isSaving}
              >
                <span className="text-xl font-bold">{num}</span>
                <span className="text-xs opacity-80">{num === 3 ? 'Standard' : num === 5 ? 'Common' : 'Extended'}</span>
              </Button>
            ))}
            <Button
              variant={!ATTEMPT_OPTIONS.includes(requiredAttempts) ? 'default' : 'outline'}
              className={`h-16 flex flex-col ${!ATTEMPT_OPTIONS.includes(requiredAttempts) ? 'bg-orange-500 hover:bg-orange-600' : ''}`}
              onClick={() => { setCustomAttempts(requiredAttempts > 7 ? requiredAttempts : 4); setShowCustomAttempts(true); }}
              disabled={isSaving}
            >
              <Plus className="w-5 h-5" />
              <span className="text-xs">Custom</span>
            </Button>
          </div>
          <p className="text-xs text-gray-600 mt-1">Selected: {requiredAttempts} attempts</p>
        </div>

        {/* Minimum Days Spread */}
        <div>
          <Label className="text-sm font-medium">MINIMUM DAYS SPREAD *</Label>
          <p className="text-xs text-gray-500 mb-2">Days required between first and last attempt</p>
          <div className="grid grid-cols-4 gap-2">
            {SPREAD_OPTIONS.map((num) => (
              <Button
                key={num}
                variant={minimumDaysSpread === num ? 'default' : 'outline'}
                className={`h-16 flex flex-col ${minimumDaysSpread === num ? 'bg-orange-500 hover:bg-orange-600' : ''}`}
                onClick={() => setMinimumDaysSpread(num)}
                disabled={isSaving}
              >
                <span className="text-xl font-bold">{num}</span>
                <span className="text-xs opacity-80">{num === 10 ? 'Default' : num === 14 ? 'Common' : 'Extended'}</span>
              </Button>
            ))}
            <Button
              variant={!SPREAD_OPTIONS.includes(minimumDaysSpread) ? 'default' : 'outline'}
              className={`h-16 flex flex-col ${!SPREAD_OPTIONS.includes(minimumDaysSpread) ? 'bg-orange-500 hover:bg-orange-600' : ''}`}
              onClick={() => { setCustomSpread(minimumDaysSpread); setShowCustomSpread(true); }}
              disabled={isSaving}
            >
              <Plus className="w-5 h-5" />
              <span className="text-xs">Custom</span>
            </Button>
          </div>
          <p className="text-xs text-gray-600 mt-1">Selected: {minimumDaysSpread} days</p>
        </div>

        {/* Address count summary */}
        <Card className="bg-gray-50 border">
          <CardContent className="p-4">
            <p className="text-sm text-gray-700 font-medium">
              This route contains{' '}
              <span className="text-orange-600 font-bold">{currentPile?.addresses.length}</span>{' '}
              address{currentPile?.addresses.length !== 1 ? 'es' : ''}
            </p>
            <p className="text-xs text-gray-500 mt-1">
              Estimated earnings: ${((currentPile?.addresses.length || 0) * PAY_RATES[session.documentType]).toFixed(2)}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Fixed bottom bar */}
      <div className="fixed bottom-0 left-0 right-0 bg-white border-t p-4">
        <Button
          className="w-full bg-green-600 hover:bg-green-700 h-12 text-base"
          onClick={handleCreateRoute}
          disabled={isSaving || !routeName.trim() || !dueDate}
        >
          {isSaving ? (
            <>
              <Loader2 className="w-5 h-5 mr-2 animate-spin" />
              {creationProgress || 'Creating...'}
            </>
          ) : (
            <>
              <Check className="w-5 h-5 mr-2" />
              Create Route {currentPileIndex + 1} of {totalPiles} →
            </>
          )}
        </Button>
      </div>

      {/* Custom Attempts Dialog */}
      <Dialog
        open={showCustomAttempts}
        onOpenChange={setShowCustomAttempts}
      >
        <DialogContent
          className="max-w-xs"
          onInteractOutside={(e) => e.preventDefault()}
          onEscapeKeyDown={(e) => e.preventDefault()}
        >
          <DialogHeader>
            <DialogTitle>Custom Attempt Count</DialogTitle>
          </DialogHeader>
          <div className="py-4">
            <p className="text-sm text-gray-600 mb-4">Number of attempts required:</p>
            <div className="flex items-center justify-center gap-4">
              <Button variant="outline" size="icon" onClick={() => setCustomAttempts(Math.max(3, customAttempts - 1))}>
                <Minus className="w-4 h-4" />
              </Button>
              <span className="text-3xl font-bold w-12 text-center">{customAttempts}</span>
              <Button variant="outline" size="icon" onClick={() => setCustomAttempts(Math.min(10, customAttempts + 1))}>
                <Plus className="w-4 h-4" />
              </Button>
            </div>
            <p className="text-xs text-gray-500 text-center mt-2">Min: 3 &nbsp; Max: 10</p>
          </div>
          <DialogFooter className="flex gap-2">
            <Button variant="outline" onClick={() => setShowCustomAttempts(false)} className="flex-1">Cancel</Button>
            <Button onClick={() => { setRequiredAttempts(customAttempts); setShowCustomAttempts(false); }} className="flex-1">Confirm</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Custom Spread Dialog */}
      <Dialog
        open={showCustomSpread}
        onOpenChange={setShowCustomSpread}
      >
        <DialogContent
          className="max-w-xs"
          onInteractOutside={(e) => e.preventDefault()}
          onEscapeKeyDown={(e) => e.preventDefault()}
        >
          <DialogHeader>
            <DialogTitle>Custom Days Spread</DialogTitle>
          </DialogHeader>
          <div className="py-4">
            <p className="text-sm text-gray-600 mb-4">Minimum days between first and last attempt:</p>
            <div className="flex items-center justify-center gap-4">
              <Button variant="outline" size="icon" onClick={() => setCustomSpread(Math.max(7, customSpread - 1))}>
                <Minus className="w-4 h-4" />
              </Button>
              <span className="text-3xl font-bold w-12 text-center">{customSpread}</span>
              <Button variant="outline" size="icon" onClick={() => setCustomSpread(Math.min(30, customSpread + 1))}>
                <Plus className="w-4 h-4" />
              </Button>
            </div>
            <p className="text-xs text-gray-500 text-center mt-2">Min: 7 &nbsp; Max: 30</p>
          </div>
          <DialogFooter className="flex gap-2">
            <Button variant="outline" onClick={() => setShowCustomSpread(false)} className="flex-1">Cancel</Button>
            <Button onClick={() => { setMinimumDaysSpread(customSpread); setShowCustomSpread(false); }} className="flex-1">Confirm</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}