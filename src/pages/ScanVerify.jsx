import React, { useState, useEffect, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import { getCompanyId } from '@/components/utils/companyUtils';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import {
  ArrowLeft,
  Camera,
  Loader2,
  Upload,
  CheckCircle,
  AlertTriangle,
  XCircle,
  Send
} from 'lucide-react';
import { toast } from 'sonner';
import { formatAddress, generateNormalizedKey } from '@/components/utils/addressUtils';

const C = {
  card: '#1c1b1d',
  border: '#363436',
  textPrimary: '#e6e1e4',
  textMuted: '#8a7f87',
  accentGold: '#e9c349',
  green: '#22c55e',
  red: '#ef4444',
};

export default function ScanVerify() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const fileInputRef = useRef(null);

  const [cameraStatus, setCameraStatus] = useState('initializing');
  const [isProcessing, setIsProcessing] = useState(false);
  const [scannedKeys, setScannedKeys] = useState([]);
  const [verificationResults, setVerificationResults] = useState(null);

  const urlParams = new URLSearchParams(window.location.search);
  const routeId = urlParams.get('routeId');

  const { data: user } = useQuery({ queryKey: ['currentUser'], queryFn: () => base44.auth.me() });

  const { data: route } = useQuery({
    queryKey: ['route', routeId],
    queryFn: async () => {
      if (!routeId) return null;
      const routes = await base44.entities.Route.filter({ id: routeId });
      return routes[0] || null;
    },
    enabled: !!routeId
  });

  const { data: addresses = [] } = useQuery({
    queryKey: ['routeAddresses', routeId],
    queryFn: async () => {
      if (!routeId) return [];
      return base44.entities.Address.filter({ route_id: routeId, deleted_at: null });
    },
    enabled: !!routeId
  });

  useEffect(() => {
    let mounted = true;
    async function startCamera() {
      if (!navigator.mediaDevices) { setCameraStatus('error'); return; }
      await new Promise(resolve => setTimeout(resolve, 100));
      if (!mounted) return;
      try {
        const constraints = [
          { video: { facingMode: { exact: 'environment' } }, audio: false },
          { video: { facingMode: 'environment' }, audio: false },
          { video: true, audio: false }
        ];
        let stream = null;
        for (const constraint of constraints) {
          try { stream = await navigator.mediaDevices.getUserMedia(constraint); break; } catch (e) { continue; }
        }
        if (!stream) throw new Error('Could not access camera');
        if (!mounted) { stream.getTracks().forEach(track => track.stop()); return; }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.onloadeddata = async () => {
            try { await videoRef.current.play(); if (mounted) setCameraStatus('active'); }
            catch (err) { if (mounted) setCameraStatus('active'); }
          };
        }
      } catch (error) {
        if (!mounted) return;
        if (error.name === 'NotAllowedError') { setCameraStatus('denied'); } else { setCameraStatus('error'); }
      }
    }
    startCamera();
    return () => { mounted = false; if (streamRef.current) { streamRef.current.getTracks().forEach(track => track.stop()); } };
  }, []);

  const processImage = async (imageBase64) => {
    setIsProcessing(true);
    try {
      const response = await base44.functions.invoke('processOCR', { imageBase64, documentType: 'serve', sessionId: null });
      const result = response.data;
      if (!result.success || !result.parsedAddress) { toast.error('Could not extract address'); return; }
      const normalizedKey = result.normalizedKey || generateNormalizedKey(result.parsedAddress);
      if (!scannedKeys.includes(normalizedKey)) { setScannedKeys(prev => [...prev, normalizedKey]); toast.success('Address scanned'); }
      else { toast.info('Address already scanned'); }
    } catch (error) {
      console.error('OCR error:', error);
      toast.error('Failed to process image');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleCapture = async () => {
    if (!videoRef.current || isProcessing) return;
    const canvas = document.createElement('canvas');
    canvas.width = videoRef.current.videoWidth;
    canvas.height = videoRef.current.videoHeight;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(videoRef.current, 0, 0);
    const imageBase64 = canvas.toDataURL('image/jpeg', 0.85).split(',')[1];
    await processImage(imageBase64);
  };

  const handleFileUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (event) => { const base64 = event.target.result.split(',')[1]; await processImage(base64); };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const handleVerify = () => {
    const matched = [], missing = [];
    addresses.forEach(addr => {
      if (scannedKeys.includes(addr.normalized_key)) { matched.push(addr); } else { missing.push(addr); }
    });
    setVerificationResults({ matched, missing });
  };

  const handleConfirmVerification = async () => {
    if (!verificationResults) return;
    try {
      for (const addr of verificationResults.matched) {
        await base44.entities.Address.update(addr.id, { verification_status: 'verified', verified_at: new Date().toISOString(), verified_by: user.id });
      }
      for (const addr of verificationResults.missing) {
        await base44.entities.Address.update(addr.id, { verification_status: 'missing' });
      }
      queryClient.refetchQueries({ queryKey: ['routeAddresses', routeId] });
      toast.success('Verification complete');
      navigate(createPageUrl(`WorkerRouteDetail?id=${routeId}`));
    } catch (error) {
      console.error('Error saving verification:', error);
      toast.error('Failed to save verification');
    }
  };

  const handleReportMissing = async () => {
    if (!verificationResults?.missing.length) return;
    try {
      const bosses = await base44.entities.User.filter({ company_id: getCompanyId(user), role: 'boss' });
      const missingAddrs = verificationResults.missing.map(a => { const f = formatAddress(a); return `${f.line1}, ${f.line2}`; }).join('\n');
      for (const boss of bosses) {
        await base44.entities.Notification.create({
          user_id: boss.id, company_id: getCompanyId(user), recipient_role: 'boss', type: 'address_flagged',
          title: 'Missing Documents Reported',
          body: `${user.full_name} reports ${verificationResults.missing.length} missing documents for route ${route?.folder_name}`,
          related_id: routeId, related_type: 'route', data: { missing_addresses: missingAddrs }, priority: 'urgent'
        });
      }
      await handleConfirmVerification();
      toast.success('Missing documents reported to boss');
    } catch (error) {
      console.error('Error reporting missing:', error);
      toast.error('Failed to report');
    }
  };

  // Results View
  if (verificationResults) {
    return (
      <div style={{ minHeight: '100vh', background: 'transparent', paddingBottom: 88 }}>
        <header style={{ background: 'rgba(6,9,20,0.85)', backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)', borderBottom: '1px solid rgba(255,255,255,0.08)', padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 12, position: 'sticky', top: 0, zIndex: 50 }}>
          <button onClick={() => setVerificationResults(null)} style={{ width: 40, height: 40, borderRadius: 8, border: `1px solid ${C.border}`, background: 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
            <ArrowLeft style={{ width: 20, height: 20, color: C.textPrimary }} />
          </button>
          <h1 style={{ fontSize: 17, fontWeight: 700, color: C.textPrimary }}>Verification Results</h1>
        </header>

        <div style={{ padding: 16, maxWidth: 480, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* Matched */}
          <div>
            <h2 style={{ fontSize: 12, fontWeight: 700, color: C.green, marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
              <CheckCircle style={{ width: 14, height: 14 }} /> MATCHED ({verificationResults.matched.length})
            </h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {verificationResults.matched.map((addr) => {
                const f = formatAddress(addr);
                return (
                  <div key={addr.id} style={{ borderRadius: 10, padding: '10px 12px', background: 'rgba(34,197,94,0.10)', border: '1px solid rgba(34,197,94,0.30)' }}>
                    <p style={{ fontWeight: 700, fontSize: 13, color: C.textPrimary }}>{f.line1}</p>
                    <p style={{ fontSize: 12, color: C.textMuted }}>{f.line2}</p>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Missing */}
          {verificationResults.missing.length > 0 && (
            <div>
              <h2 style={{ fontSize: 12, fontWeight: 700, color: C.red, marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
                <XCircle style={{ width: 14, height: 14 }} /> MISSING FROM SCAN ({verificationResults.missing.length})
              </h2>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {verificationResults.missing.map((addr) => {
                  const f = formatAddress(addr);
                  return (
                    <div key={addr.id} style={{ borderRadius: 10, padding: '10px 12px', background: 'rgba(239,68,68,0.10)', border: '1px solid rgba(239,68,68,0.30)' }}>
                      <p style={{ fontWeight: 700, fontSize: 13, color: C.textPrimary }}>{f.line1}</p>
                      <p style={{ fontSize: 12, color: C.textMuted }}>{f.line2}</p>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        <div style={{ position: 'fixed', bottom: 0, left: 0, right: 0, background: 'rgba(6,9,20,0.92)', backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)', borderTop: '1px solid rgba(255,255,255,0.08)', padding: '12px 16px', display: 'flex', gap: 10 }}>
          {verificationResults.missing.length > 0 && (
            <button onClick={handleReportMissing} style={{ flex: 1, height: 48, borderRadius: 12, background: 'rgba(239,68,68,0.12)', border: '1px solid rgba(239,68,68,0.40)', color: C.red, fontWeight: 700, fontSize: 13, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, cursor: 'pointer' }}>
              <Send style={{ width: 15, height: 15 }} /> Report Missing
            </button>
          )}
          <button onClick={handleConfirmVerification} style={{ flex: 1, height: 48, borderRadius: 12, background: 'rgba(34,197,94,0.18)', border: '1px solid rgba(34,197,94,0.45)', color: C.green, fontWeight: 700, fontSize: 13, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, cursor: 'pointer' }}>
            <CheckCircle style={{ width: 15, height: 15 }} /> Confirm & Start Route
          </button>
        </div>
      </div>
    );
  }

  // Scanning View
  return (
    <div style={{ minHeight: '100vh', background: 'transparent', display: 'flex', flexDirection: 'column' }}>
      <header style={{ background: 'rgba(6,9,20,0.85)', backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)', borderBottom: '1px solid rgba(255,255,255,0.08)', padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 12 }}>
        <Link to={createPageUrl(`WorkerRouteDetail?id=${routeId}`)}>
          <button style={{ width: 40, height: 40, borderRadius: 8, border: `1px solid ${C.border}`, background: 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
            <ArrowLeft style={{ width: 20, height: 20, color: C.textPrimary }} />
          </button>
        </Link>
        <div>
          <h1 style={{ fontSize: 17, fontWeight: 700, color: C.textPrimary }}>Verify Documents</h1>
          <p style={{ fontSize: 12, color: C.textMuted }}>{route?.folder_name}</p>
        </div>
      </header>

      {/* Camera View */}
      <div style={{ height: '35vh', background: '#060914', position: 'relative' }}>
        <video ref={videoRef} className={`absolute inset-0 w-full h-full object-cover ${cameraStatus === 'active' ? '' : 'hidden'}`} playsInline muted autoPlay />
        {cameraStatus === 'active' && (
          <div style={{ position: 'absolute', top: '7.5%', left: '5%', width: '90%', height: '85%', border: '2px solid rgba(255,255,255,0.7)', borderRadius: 8, pointerEvents: 'none' }} />
        )}
        {cameraStatus === 'initializing' && (
          <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <div style={{ textAlign: 'center', color: 'white' }}>
              <Loader2 className="w-10 h-10 mx-auto mb-2 animate-spin" style={{ color: C.accentGold }} />
              <p style={{ fontSize: 13 }}>Starting camera...</p>
            </div>
          </div>
        )}
        {(cameraStatus === 'denied' || cameraStatus === 'error') && (
          <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
            <div style={{ textAlign: 'center', color: 'white' }}>
              <AlertTriangle className="w-10 h-10 mx-auto mb-2" style={{ color: '#eab308' }} />
              <p style={{ fontSize: 13, marginBottom: 12 }}>Camera unavailable</p>
              <button onClick={() => fileInputRef.current?.click()} style={{ padding: '8px 16px', borderRadius: 8, background: 'rgba(233,195,73,0.20)', border: '1px solid rgba(233,195,73,0.50)', color: C.accentGold, fontWeight: 600, cursor: 'pointer' }}>
                Upload Photo
              </button>
            </div>
          </div>
        )}
        {isProcessing && (
          <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Loader2 className="w-8 h-8 animate-spin" style={{ color: 'white' }} />
          </div>
        )}
      </div>

      {/* Capture Bar */}
      <div style={{ background: 'rgba(6,9,20,0.85)', backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)', borderBottom: '1px solid rgba(255,255,255,0.08)', padding: '12px 16px' }}>
        <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleFileUpload} />
        <button onClick={cameraStatus === 'active' ? handleCapture : () => fileInputRef.current?.click()} disabled={isProcessing} style={{ width: '100%', height: 48, borderRadius: 12, background: 'rgba(233,195,73,0.20)', border: '1px solid rgba(233,195,73,0.50)', color: C.accentGold, fontWeight: 700, fontSize: 14, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, cursor: isProcessing ? 'not-allowed' : 'pointer', opacity: isProcessing ? 0.5 : 1 }}>
          <Camera style={{ width: 18, height: 18 }} />
          {cameraStatus === 'active' ? 'Capture' : 'Upload'}
        </button>
      </div>

      {/* Progress */}
      <div style={{ flex: 1, overflowY: 'auto', padding: 16 }}>
        <div style={{ maxWidth: 480, margin: '0 auto' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
            <p style={{ fontSize: 13, fontWeight: 600, color: C.textPrimary }}>SCANNED: {scannedKeys.length} / {addresses.length}</p>
            <p style={{ fontSize: 13, color: C.textMuted }}>{addresses.length > 0 ? Math.round((scannedKeys.length / addresses.length) * 100) : 0}%</p>
          </div>
          <div style={{ width: '100%', background: 'rgba(255,255,255,0.10)', borderRadius: 99, height: 6, marginBottom: 12 }}>
            <div style={{ height: '100%', background: C.green, borderRadius: 99, transition: 'width 0.3s', width: `${addresses.length > 0 ? (scannedKeys.length / addresses.length) * 100 : 0}%` }} />
          </div>
          <p style={{ fontSize: 13, color: C.textMuted }}>Scan each document you received to verify. Missing documents will be flagged.</p>
        </div>
      </div>

      {/* Verify Button */}
      <div style={{ background: 'rgba(6,9,20,0.92)', backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)', borderTop: '1px solid rgba(255,255,255,0.08)', padding: '12px 16px' }}>
        <button onClick={handleVerify} disabled={scannedKeys.length === 0} style={{ width: '100%', height: 52, borderRadius: 12, background: 'rgba(34,197,94,0.18)', border: '1px solid rgba(34,197,94,0.45)', color: C.green, fontWeight: 700, fontSize: 15, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, cursor: scannedKeys.length === 0 ? 'not-allowed' : 'pointer', opacity: scannedKeys.length === 0 ? 0.4 : 1 }}>
          <CheckCircle style={{ width: 18, height: 18 }} />
          Verify ({scannedKeys.length} scanned)
        </button>
      </div>
    </div>
  );
}
