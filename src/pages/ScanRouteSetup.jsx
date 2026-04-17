import React, { useState, useEffect, useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import { getCompanyId } from '@/components/utils/companyUtils';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Calendar } from '@/components/ui/calendar';
import {
  ArrowLeft,
  Check,
  Loader2,
  Info,
  Plus,
  Minus
} from 'lucide-react';
import { toast } from 'sonner';
import { format, addDays, subDays } from 'date-fns';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  DOCUMENT_INFO,
  PAY_RATES,
  loadScanSession,
  saveScanSession,
  clearScanSession,
  generateNormalizedKey
} from '@/components/scanning/ScanningService';
import { parseStreetOnly } from '@/components/utils/addressUtils';

const ATTEMPT_OPTIONS = [3, 5, 7];
const SPREAD_OPTIONS = [10, 14, 21];

const C = {
  card: '#1c1b1d',
  cardElevated: '#201f21',
  border: '#363436',
  textPrimary: '#e6e1e4',
  textSecondary: '#d0c3cb',
  textMuted: '#8a7f87',
  accentGold: '#e9c349',
  accentPlum: '#e5b9e1',
  green: '#22c55e',
};

export default function ScanRouteSetup() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [session, setSession] = useState(null);
  const [routeName, setRouteName] = useState('');
  const [dueDate, setDueDate] = useState(null);
  const [requiredAttempts, setRequiredAttempts] = useState(3);
  const [minimumDaysSpread, setMinimumDaysSpread] = useState(10);
  const [isCreating, setIsCreating] = useState(false);
  const [creationProgress, setCreationProgress] = useState('');
  const [showCustomAttempts, setShowCustomAttempts] = useState(false);
  const [showCustomSpread, setShowCustomSpread] = useState(false);
  const [customAttempts, setCustomAttempts] = useState(4);
  const [customSpread, setCustomSpread] = useState(15);

  const urlParams = new URLSearchParams(window.location.search);
  const sessionId = urlParams.get('sessionId');

  const { data: user } = useQuery({
    queryKey: ['currentUser'],
    queryFn: () => base44.auth.me()
  });

  const { data: userSettings } = useQuery({
    queryKey: ['userSettings', user?.id],
    queryFn: async () => {
      if (!user?.id) return null;
      const settings = await base44.entities.UserSettings.filter({ user_id: user.id });
      return settings[0] || null;
    },
    enabled: !!user?.id
  });

  const geocodeAddress = async (fullAddress, apiKey) => {
    if (!apiKey) return null;
    try {
      const response = await fetch(
        `https://www.mapquestapi.com/geocoding/v1/address?key=${apiKey}&location=${encodeURIComponent(fullAddress)}`
      );
      const data = await response.json();
      const location = data?.results?.[0]?.locations?.[0]?.latLng;
      if (location && location.lat && location.lng) {
        return { lat: location.lat, lng: location.lng, status: 'exact' };
      }
      return null;
    } catch (err) {
      console.warn('Geocoding failed for:', fullAddress, err);
      return null;
    }
  };

  useEffect(() => {
    if (sessionId) {
      const existingSession = loadScanSession(sessionId);
      if (existingSession) {
        setSession(existingSession);
        const today = format(new Date(), 'MMM d');
        const cities = [...new Set(existingSession.addresses
          .filter(a => a.extractedData?.city)
          .map(a => a.extractedData.city))];
        const cityPart = cities.length > 0 ? cities[0] : 'Route';
        setRouteName(`${cityPart} - ${today}`);
        setDueDate(addDays(new Date(), 14));
      } else {
        navigate(createPageUrl('ScanDocumentType'));
      }
    } else {
      navigate(createPageUrl('ScanDocumentType'));
    }
  }, [sessionId, navigate]);

  const firstAttemptDeadline = useMemo(() => {
    if (!dueDate) return null;
    return subDays(dueDate, minimumDaysSpread);
  }, [dueDate, minimumDaysSpread]);

  const qualifierAttempts = 3;
  const flexibleAttempts = Math.max(0, requiredAttempts - qualifierAttempts);

  const handleCreateRoute = async () => {
    console.log('Create Route clicked', { hasSession: !!session, userId: user?.id, routeName, dueDate, isCreating });
    if (!session || !user) return;
    if (!routeName.trim()) { toast.error('Please enter a route name'); return; }
    if (!dueDate) { toast.error('Please select a due date'); return; }

    const validAddresses = session.addresses.filter(a => a.status === 'extracted' && a.extractedData?.street);
    if (validAddresses.length === 0) { toast.error('No valid addresses to create route'); return; }

    setIsCreating(true);

    try {
      const isBoss = user.role === 'boss' || user.role === 'admin';

      const routeData = {
        company_id: getCompanyId(user),
        folder_name: routeName,
        due_date: format(dueDate, 'yyyy-MM-dd'),
        status: isBoss ? 'ready' : 'assigned',
        worker_id: isBoss ? null : user.id,
        total_addresses: validAddresses.length,
        served_count: 0,
        required_attempts: requiredAttempts,
        qualifier_attempts: qualifierAttempts,
        flexible_attempts: flexibleAttempts,
        minimum_days_spread: minimumDaysSpread,
        first_attempt_deadline: firstAttemptDeadline ? format(firstAttemptDeadline, 'yyyy-MM-dd') : null,
        am_required: true,
        pm_required: true,
        weekend_required: true,
        created_via: 'scan',
        scan_session_id: session.dbSessionId || null
      };

      if (!isBoss) {
        routeData.assigned_at = new Date().toISOString();
        routeData.assigned_by = user.id;
      }

      console.log('Creating route with data', routeData);
      const route = await base44.entities.Route.create(routeData);
      console.log('Route created', route);

      // Seed route into local cache immediately so WorkerRouteDetail
      // never shows "route not found" — cloud write already succeeded.
      queryClient.setQueryData(['route', route.id], route);

      const mapquestApiKey = userSettings?.mapquest_api_key;
      let geocodedCount = 0;
      const createdAddresses = [];

      for (let i = 0; i < validAddresses.length; i++) {
        const addr = validAddresses[i];
        setCreationProgress(`Creating address ${i + 1}/${validAddresses.length}...`);
        const normalizedKey = generateNormalizedKey(addr.extractedData);
        let lat = null, lng = null, geocodeStatus = 'pending';
        if (mapquestApiKey) {
          const geoResult = await geocodeAddress(addr.extractedData.fullAddress, mapquestApiKey);
          if (geoResult) { lat = geoResult.lat; lng = geoResult.lng; geocodeStatus = geoResult.status; geocodedCount++; }
          else { geocodeStatus = 'failed'; }
        }
        const createdAddr = await base44.entities.Address.create({
          company_id: getCompanyId(user),
          route_id: route.id,
          legal_address: addr.ocrRawText || addr.extractedData.fullAddress,
          // ROOT CAUSE FIX: strip city/state/zip out of the street field so it
          // stays clean. City/state/zip are saved to their own columns below.
          normalized_address: parseStreetOnly(addr.extractedData.fullAddress),
          city: addr.extractedData.city,
          state: addr.extractedData.state,
          zip: addr.extractedData.zip,
          lat, lng,
          serve_type: addr.extractedData?.documentType || session.documentType,
          pay_rate: PAY_RATES[session.documentType],
          status: 'pending',
          served: false,
          attempts_count: 0,
          defendant_name: addr.defendantName || null,
          ocr_raw_text: addr.ocrRawText || null,
          confidence_score: addr.confidence,
          manual_edit_flag: addr.manuallyEdited || false,
          scanned_by: user.id,
          scanned_at: new Date().toISOString(),
          scan_session_id: session.dbSessionId || null,
          normalized_key: normalizedKey,
          has_related_addresses: false,
          related_address_count: 0,
          geocode_status: geocodeStatus
        });
        createdAddresses.push(createdAddr);
      }

      // Seed addresses into local cache so tapping into the route
      // shows the full address list instantly without a cloud fetch.
      queryClient.setQueryData(
        ['routeAddresses', route.id],
        createdAddresses.sort((a, b) => new Date(a.created_date || 0) - new Date(b.created_date || 0))
      );

      setCreationProgress('Finalizing...');
      if (session.dbSessionId) {
        await base44.entities.ScanSession.update(session.dbSessionId, { status: 'completed', route_id: route.id, completed_at: new Date().toISOString() });
      }
      await base44.entities.AuditLog.create({
        company_id: getCompanyId(user),
        action_type: 'route_created_from_scan',
        actor_id: user.id,
        actor_role: user.role,
        target_type: 'route',
        target_id: route.id,
        details: { route_name: routeName, address_count: validAddresses.length, document_type: session.documentType, total_earnings: validAddresses.length * PAY_RATES[session.documentType], required_attempts: requiredAttempts, minimum_days_spread: minimumDaysSpread },
        timestamp: new Date().toISOString()
      });

      clearScanSession(session.id);
      // refetchQueries forces an actual cloud fetch even with staleTime: Infinity.
      // invalidateQueries alone won't refetch unless a component is subscribed.
      await queryClient.refetchQueries({ queryKey: ['workerRoutes'] });
      await queryClient.refetchQueries({ queryKey: ['allRoutes'] });
      toast.success('Route created successfully!');
      if (isBoss) { navigate(createPageUrl('BossRoutes')); } else { navigate(createPageUrl('WorkerRoutes')); }
      return;
    } catch (error) {
      console.error('Error creating route:', error);
      toast.error('Failed to create route: ' + error.message);
    } finally {
      console.log('Create Route finished');
      setIsCreating(false);
    }
  };

  const handleConfirmCustomAttempts = () => { setRequiredAttempts(customAttempts); setShowCustomAttempts(false); };
  const handleConfirmCustomSpread = () => { setMinimumDaysSpread(customSpread); setShowCustomSpread(false); };

  if (!session) {
    return (
      <div style={{ minHeight: '100vh', background: '#060914', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Loader2 className="w-8 h-8 animate-spin" style={{ color: C.accentGold }} />
      </div>
    );
  }

  const docInfo = DOCUMENT_INFO[session.documentType];
  const validAddresses = session.addresses.filter(a => a.status === 'extracted' && a.extractedData?.street);
  const estimatedEarnings = validAddresses.length * PAY_RATES[session.documentType];
  const isBoss = user?.role === 'boss' || user?.role === 'admin';

  return (
    <div style={{ minHeight: '100vh', background: 'transparent', paddingBottom: 88 }}>
      {/* Header */}
      <div style={{ background: 'rgba(6,9,20,0.85)', backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)', borderBottom: '1px solid rgba(255,255,255,0.08)', padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 12, position: 'sticky', top: 0, zIndex: 50 }}>
        <Link to={createPageUrl(`ScanCamera?sessionId=${session.id}`)}>
          <button style={{ width: 40, height: 40, borderRadius: 8, border: `1px solid ${C.border}`, background: 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
            <ArrowLeft style={{ width: 20, height: 20, color: C.textPrimary }} />
          </button>
        </Link>
        <h1 style={{ fontSize: 17, fontWeight: 700, color: C.textPrimary }}>Save Route</h1>
      </div>

      <div style={{ padding: '16px', maxWidth: 480, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 20 }}>

        {/* Route Name */}
        <div>
          <Label style={{ color: C.textMuted, fontSize: 11, fontWeight: 700, letterSpacing: '0.06em' }}>ROUTE NAME *</Label>
          <Input value={routeName} onChange={(e) => setRouteName(e.target.value)} placeholder="Detroit East - Feb 2" style={{ background: 'rgba(255,255,255,0.06)', border: `1px solid ${C.border}`, color: C.textPrimary, marginTop: 6 }} />
          <p style={{ fontSize: 11, color: C.textMuted, marginTop: 4 }}>Auto-suggested based on addresses + date</p>
        </div>

        {/* Due Date */}
        <div>
          <Label style={{ color: C.textMuted, fontSize: 11, fontWeight: 700, letterSpacing: '0.06em' }}>DUE DATE *</Label>
          <div style={{ marginTop: 8, borderRadius: 12, border: `1px solid ${C.border}`, background: C.card, padding: 12 }}>
            <Calendar mode="single" selected={dueDate} onSelect={setDueDate} disabled={(date) => date < new Date()} className="mx-auto" />
            {dueDate && <p style={{ textAlign: 'center', fontSize: 13, color: C.textMuted, marginTop: 8 }}>Selected: {format(dueDate, 'MMMM d, yyyy')}</p>}
          </div>
        </div>

        {/* Required Attempts */}
        <div>
          <Label style={{ color: C.textMuted, fontSize: 11, fontWeight: 700, letterSpacing: '0.06em' }}>REQUIRED ATTEMPTS *</Label>
          <p style={{ fontSize: 12, color: C.textMuted, marginBottom: 8, marginTop: 2 }}>How many attempts before marking unable to serve?</p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 }}>
            {ATTEMPT_OPTIONS.map((num) => (
              <button key={num} onClick={() => setRequiredAttempts(num)} style={{ height: 60, borderRadius: 10, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 2, cursor: 'pointer', background: requiredAttempts === num ? 'rgba(233,195,73,0.20)' : 'rgba(255,255,255,0.04)', border: requiredAttempts === num ? '1px solid rgba(233,195,73,0.60)' : `1px solid ${C.border}`, color: requiredAttempts === num ? C.accentGold : C.textMuted }}>
                <span style={{ fontSize: 20, fontWeight: 700 }}>{num}</span>
                <span style={{ fontSize: 10 }}>{num === 3 ? 'Standard' : num === 5 ? 'Common' : 'Extended'}</span>
              </button>
            ))}
            <button onClick={() => { setCustomAttempts(requiredAttempts > 7 ? requiredAttempts : 4); setShowCustomAttempts(true); }} style={{ height: 60, borderRadius: 10, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 2, cursor: 'pointer', background: !ATTEMPT_OPTIONS.includes(requiredAttempts) ? 'rgba(233,195,73,0.20)' : 'rgba(255,255,255,0.04)', border: !ATTEMPT_OPTIONS.includes(requiredAttempts) ? '1px solid rgba(233,195,73,0.60)' : `1px solid ${C.border}`, color: !ATTEMPT_OPTIONS.includes(requiredAttempts) ? C.accentGold : C.textMuted }}>
              <Plus style={{ width: 18, height: 18 }} />
              <span style={{ fontSize: 10 }}>Custom</span>
            </button>
          </div>
          <p style={{ fontSize: 12, color: C.textMuted, marginTop: 6 }}>Selected: {requiredAttempts} attempts</p>
        </div>

        {/* Minimum Days Spread */}
        <div>
          <Label style={{ color: C.textMuted, fontSize: 11, fontWeight: 700, letterSpacing: '0.06em' }}>MINIMUM DAYS SPREAD *</Label>
          <p style={{ fontSize: 12, color: C.textMuted, marginBottom: 8, marginTop: 2 }}>Days required between first and last attempt</p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 }}>
            {SPREAD_OPTIONS.map((num) => (
              <button key={num} onClick={() => setMinimumDaysSpread(num)} style={{ height: 60, borderRadius: 10, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 2, cursor: 'pointer', background: minimumDaysSpread === num ? 'rgba(233,195,73,0.20)' : 'rgba(255,255,255,0.04)', border: minimumDaysSpread === num ? '1px solid rgba(233,195,73,0.60)' : `1px solid ${C.border}`, color: minimumDaysSpread === num ? C.accentGold : C.textMuted }}>
                <span style={{ fontSize: 20, fontWeight: 700 }}>{num}</span>
                <span style={{ fontSize: 10 }}>{num === 10 ? 'Default' : num === 14 ? 'Common' : 'Extended'}</span>
              </button>
            ))}
            <button onClick={() => { setCustomSpread(minimumDaysSpread); setShowCustomSpread(true); }} style={{ height: 60, borderRadius: 10, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 2, cursor: 'pointer', background: !SPREAD_OPTIONS.includes(minimumDaysSpread) ? 'rgba(233,195,73,0.20)' : 'rgba(255,255,255,0.04)', border: !SPREAD_OPTIONS.includes(minimumDaysSpread) ? '1px solid rgba(233,195,73,0.60)' : `1px solid ${C.border}`, color: !SPREAD_OPTIONS.includes(minimumDaysSpread) ? C.accentGold : C.textMuted }}>
              <Plus style={{ width: 18, height: 18 }} />
              <span style={{ fontSize: 10 }}>Custom</span>
            </button>
          </div>
          <p style={{ fontSize: 12, color: C.textMuted, marginTop: 6 }}>Selected: {minimumDaysSpread} days</p>
        </div>

        {/* Info Box */}
        <div style={{ borderRadius: 12, border: '1px solid rgba(229,185,225,0.25)', background: 'rgba(229,185,225,0.08)', padding: '14px 16px' }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
            <Info style={{ width: 18, height: 18, color: C.accentPlum, flexShrink: 0, marginTop: 2 }} />
            <div style={{ fontSize: 13 }}>
              <p style={{ fontWeight: 600, color: C.accentPlum, marginBottom: 8 }}>Service Requirements:</p>
              <ul style={{ display: 'flex', flexDirection: 'column', gap: 4, color: C.textSecondary }}>
                <li>• {requiredAttempts} attempts required{requiredAttempts > 3 ? '' : ' (AM, PM, Weekend)'}</li>
                {requiredAttempts > 3 && (<><li>• First 3 must be qualifiers (AM, PM, Weekend)</li><li>• Remaining {flexibleAttempts} can be any time (8am-9pm)</li></>)}
                <li>• Minimum {minimumDaysSpread} days between first and last attempt</li>
                {dueDate && (<><li>• Due date: {format(dueDate, 'MMM d, yyyy')}</li><li>• First attempt must be by: <strong style={{ color: C.accentGold }}>{format(firstAttemptDeadline, 'MMM d, yyyy')}</strong></li></>)}
              </ul>
              {requiredAttempts === 3 && <p style={{ marginTop: 8, color: C.textMuted, fontSize: 12 }}>All qualifiers must be completed.</p>}
            </div>
          </div>
        </div>

        {/* Route Summary */}
        <div style={{ borderRadius: 12, border: `1px solid ${C.border}`, background: C.card, padding: '14px 16px' }}>
          <p style={{ fontWeight: 700, fontSize: 12, color: C.textMuted, letterSpacing: '0.06em', marginBottom: 12 }}>ROUTE SUMMARY</p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, fontSize: 13 }}>
            {[
              ['Addresses', validAddresses.length],
              ['Document Type', `${docInfo?.icon} ${docInfo?.name}`],
              ['Created by', `${user?.full_name} (${isBoss ? 'Boss' : 'Worker'})`],
              ['Assignment', isBoss ? 'Unassigned (Ready)' : 'Auto-assigned to me'],
            ].map(([label, value]) => (
              <div key={label} style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: C.textMuted }}>{label}:</span>
                <span style={{ fontWeight: 600, color: C.textPrimary }}>{value}</span>
              </div>
            ))}
            <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: `1px solid ${C.border}`, paddingTop: 8, marginTop: 4 }}>
              <span style={{ color: C.textMuted }}>Estimated Earnings:</span>
              <span style={{ fontWeight: 700, color: C.green }}>${estimatedEarnings.toFixed(2)}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Bottom Actions */}
      <div style={{ position: 'fixed', bottom: 0, left: 0, right: 0, background: 'rgba(6,9,20,0.92)', backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)', borderTop: '1px solid rgba(255,255,255,0.08)', padding: '12px 16px' }}>
        <button onClick={handleCreateRoute} disabled={isCreating || !routeName.trim() || !dueDate} style={{ width: '100%', height: 52, borderRadius: 12, background: 'rgba(34,197,94,0.18)', border: '1px solid rgba(34,197,94,0.45)', color: C.green, fontWeight: 700, fontSize: 15, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, cursor: (isCreating || !routeName.trim() || !dueDate) ? 'not-allowed' : 'pointer', opacity: (isCreating || !routeName.trim() || !dueDate) ? 0.4 : 1 }}>
          {isCreating ? (<><Loader2 style={{ width: 18, height: 18 }} className="animate-spin" />{creationProgress || 'Creating...'}</>) : (<><Check style={{ width: 18, height: 18 }} />Create Route</>)}
        </button>
      </div>

      {/* Custom Attempts Dialog */}
      <Dialog open={showCustomAttempts} onOpenChange={setShowCustomAttempts}>
        <DialogContent onInteractOutside={(e) => e.preventDefault()} onEscapeKeyDown={(e) => e.preventDefault()} style={{ background: 'rgba(11,15,30,0.97)', border: '1px solid rgba(255,255,255,0.12)', color: C.textPrimary, maxWidth: 300 }}>
          <DialogHeader><DialogTitle style={{ color: C.textPrimary }}>Custom Attempt Count</DialogTitle></DialogHeader>
          <div style={{ padding: '16px 0' }}>
            <p style={{ fontSize: 13, color: C.textMuted, marginBottom: 16 }}>Number of attempts required:</p>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 20 }}>
              <button onClick={() => setCustomAttempts(Math.max(3, customAttempts - 1))} style={{ width: 40, height: 40, borderRadius: 8, border: `1px solid ${C.border}`, background: 'transparent', color: C.textPrimary, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Minus style={{ width: 16, height: 16 }} /></button>
              <span style={{ fontSize: 32, fontWeight: 700, color: C.textPrimary, minWidth: 48, textAlign: 'center' }}>{customAttempts}</span>
              <button onClick={() => setCustomAttempts(Math.min(10, customAttempts + 1))} style={{ width: 40, height: 40, borderRadius: 8, border: `1px solid ${C.border}`, background: 'transparent', color: C.textPrimary, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Plus style={{ width: 16, height: 16 }} /></button>
            </div>
            <p style={{ fontSize: 11, color: C.textMuted, textAlign: 'center', marginTop: 8 }}>Min: 3 &nbsp; Max: 10</p>
          </div>
          <DialogFooter style={{ display: 'flex', gap: 8 }}>
            <button onClick={() => setShowCustomAttempts(false)} style={{ flex: 1, height: 42, borderRadius: 10, background: 'transparent', border: `1px solid ${C.border}`, color: C.textMuted, fontWeight: 600, cursor: 'pointer' }}>Cancel</button>
            <button onClick={handleConfirmCustomAttempts} style={{ flex: 1, height: 42, borderRadius: 10, background: 'rgba(233,195,73,0.20)', border: '1px solid rgba(233,195,73,0.50)', color: C.accentGold, fontWeight: 700, cursor: 'pointer' }}>Confirm</button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Custom Spread Dialog */}
      <Dialog open={showCustomSpread} onOpenChange={setShowCustomSpread}>
        <DialogContent onInteractOutside={(e) => e.preventDefault()} onEscapeKeyDown={(e) => e.preventDefault()} style={{ background: 'rgba(11,15,30,0.97)', border: '1px solid rgba(255,255,255,0.12)', color: C.textPrimary, maxWidth: 300 }}>
          <DialogHeader><DialogTitle style={{ color: C.textPrimary }}>Custom Days Spread</DialogTitle></DialogHeader>
          <div style={{ padding: '16px 0' }}>
            <p style={{ fontSize: 13, color: C.textMuted, marginBottom: 16 }}>Minimum days between first and last attempt:</p>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 20 }}>
              <button onClick={() => setCustomSpread(Math.max(7, customSpread - 1))} style={{ width: 40, height: 40, borderRadius: 8, border: `1px solid ${C.border}`, background: 'transparent', color: C.textPrimary, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Minus style={{ width: 16, height: 16 }} /></button>
              <span style={{ fontSize: 32, fontWeight: 700, color: C.textPrimary, minWidth: 48, textAlign: 'center' }}>{customSpread}</span>
              <button onClick={() => setCustomSpread(Math.min(30, customSpread + 1))} style={{ width: 40, height: 40, borderRadius: 8, border: `1px solid ${C.border}`, background: 'transparent', color: C.textPrimary, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Plus style={{ width: 16, height: 16 }} /></button>
            </div>
            <p style={{ fontSize: 11, color: C.textMuted, textAlign: 'center', marginTop: 8 }}>Min: 7 &nbsp; Max: 30</p>
          </div>
          <DialogFooter style={{ display: 'flex', gap: 8 }}>
            <button onClick={() => setShowCustomSpread(false)} style={{ flex: 1, height: 42, borderRadius: 10, background: 'transparent', border: `1px solid ${C.border}`, color: C.textMuted, fontWeight: 600, cursor: 'pointer' }}>Cancel</button>
            <button onClick={handleConfirmCustomSpread} style={{ flex: 1, height: 42, borderRadius: 10, background: 'rgba(233,195,73,0.20)', border: '1px solid rgba(233,195,73,0.50)', color: C.accentGold, fontWeight: 700, cursor: 'pointer' }}>Confirm</button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
