import React, { useState, useEffect, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import { getCompanyId } from '@/components/utils/companyUtils';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
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
import { formatAddress } from '@/components/address/AddressCard';
import { generateNormalizedKey } from '@/components/scanning/ScanningService';

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

  const { data: user } = useQuery({
    queryKey: ['currentUser'],
    queryFn: () => base44.auth.me()
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

  const { data: addresses = [] } = useQuery({
    queryKey: ['routeAddresses', routeId],
    queryFn: async () => {
      if (!routeId) return [];
      return base44.entities.Address.filter({ route_id: routeId, deleted_at: null });
    },
    enabled: !!routeId
  });

  // Start camera
  useEffect(() => {
    let mounted = true;

    async function startCamera() {
      if (!navigator.mediaDevices) {
        setCameraStatus('error');
        return;
      }

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
          try {
            stream = await navigator.mediaDevices.getUserMedia(constraint);
            break;
          } catch (e) {
            continue;
          }
        }

        if (!stream) throw new Error('Could not access camera');
        if (!mounted) {
          stream.getTracks().forEach(track => track.stop());
          return;
        }

        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.onloadeddata = async () => {
            try {
              await videoRef.current.play();
              if (mounted) setCameraStatus('active');
            } catch (err) {
              if (mounted) setCameraStatus('active');
            }
          };
        }
      } catch (error) {
        if (!mounted) return;
        if (error.name === 'NotAllowedError') {
          setCameraStatus('denied');
        } else {
          setCameraStatus('error');
        }
      }
    }

    startCamera();
    return () => {
      mounted = false;
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
      }
    };
  }, []);

  const processImage = async (imageBase64) => {
    setIsProcessing(true);

    try {
      const response = await base44.functions.invoke('processOCR', {
        imageBase64,
        documentType: 'serve',
        sessionId: null
      });

      const result = response.data;

      if (!result.success || !result.parsedAddress) {
        toast.error('Could not extract address');
        return;
      }

      const normalizedKey = result.normalizedKey || generateNormalizedKey(result.parsedAddress);
      
      if (!scannedKeys.includes(normalizedKey)) {
        setScannedKeys(prev => [...prev, normalizedKey]);
        toast.success('Address scanned');
      } else {
        toast.info('Address already scanned');
      }

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
    reader.onload = async (event) => {
      const base64 = event.target.result.split(',')[1];
      await processImage(base64);
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const handleVerify = () => {
    // Match scanned addresses to route addresses
    const matched = [];
    const missing = [];

    addresses.forEach(addr => {
      const addrKey = addr.normalized_key;
      if (scannedKeys.includes(addrKey)) {
        matched.push(addr);
      } else {
        missing.push(addr);
      }
    });

    setVerificationResults({ matched, missing });
  };

  const handleConfirmVerification = async () => {
    if (!verificationResults) return;

    try {
      // Update matched addresses as verified
      for (const addr of verificationResults.matched) {
        await base44.entities.Address.update(addr.id, {
          verification_status: 'verified',
          verified_at: new Date().toISOString(),
          verified_by: user.id
        });
      }

      // Update missing addresses
      for (const addr of verificationResults.missing) {
        await base44.entities.Address.update(addr.id, {
          verification_status: 'missing'
        });
      }

      queryClient.invalidateQueries({ queryKey: ['routeAddresses', routeId] });
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
      // Get boss users
      const bosses = await base44.entities.User.filter({ 
        company_id: getCompanyId(user), 
        role: 'boss' 
      });

      const missingAddrs = verificationResults.missing.map(a => {
        const f = formatAddress(a);
        return `${f.line1}, ${f.line2}`;
      }).join('\n');

      for (const boss of bosses) {
        await base44.entities.Notification.create({
          user_id: boss.id,
          company_id: getCompanyId(user),
          recipient_role: 'boss',
          type: 'address_flagged',
          title: 'Missing Documents Reported',
          body: `${user.full_name} reports ${verificationResults.missing.length} missing documents for route ${route?.folder_name}`,
          related_id: routeId,
          related_type: 'route',
          data: { missing_addresses: missingAddrs },
          priority: 'urgent'
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
      <div className="min-h-screen bg-gray-50 pb-24">
        <header className="bg-white border-b px-4 py-3 flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => setVerificationResults(null)}>
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <h1 className="text-lg font-semibold">Verification Results</h1>
        </header>

        <div className="p-4 max-w-lg mx-auto space-y-4">
          {/* Matched */}
          <div>
            <h2 className="text-sm font-semibold text-green-700 mb-2 flex items-center gap-2">
              <CheckCircle className="w-4 h-4" />
              MATCHED ({verificationResults.matched.length})
            </h2>
            <div className="space-y-2">
              {verificationResults.matched.map((addr) => {
                const f = formatAddress(addr);
                return (
                  <Card key={addr.id} className="bg-green-50 border-green-200">
                    <CardContent className="p-3">
                      <p className="font-bold text-sm">{f.line1}</p>
                      <p className="text-sm text-gray-700">{f.line2}</p>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </div>

          {/* Missing */}
          {verificationResults.missing.length > 0 && (
            <div>
              <h2 className="text-sm font-semibold text-red-700 mb-2 flex items-center gap-2">
                <XCircle className="w-4 h-4" />
                MISSING FROM SCAN ({verificationResults.missing.length})
              </h2>
              <div className="space-y-2">
                {verificationResults.missing.map((addr) => {
                  const f = formatAddress(addr);
                  return (
                    <Card key={addr.id} className="bg-red-50 border-red-200">
                      <CardContent className="p-3">
                        <p className="font-bold text-sm">{f.line1}</p>
                        <p className="text-sm text-gray-700">{f.line2}</p>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="fixed bottom-0 left-0 right-0 bg-white border-t p-4">
          <div className="max-w-lg mx-auto flex gap-3">
            {verificationResults.missing.length > 0 && (
              <Button
                variant="outline"
                className="flex-1 border-red-300 text-red-700"
                onClick={handleReportMissing}
              >
                <Send className="w-4 h-4 mr-2" />
                Report Missing to Boss
              </Button>
            )}
            <Button
              className="flex-1 bg-green-600 hover:bg-green-700"
              onClick={handleConfirmVerification}
            >
              <CheckCircle className="w-4 h-4 mr-2" />
              Confirm & Start Route
            </Button>
          </div>
        </div>
      </div>
    );
  }

  // Scanning View
  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <header className="bg-white border-b px-4 py-3 flex items-center gap-3">
        <Link to={createPageUrl(`WorkerRouteDetail?id=${routeId}`)}>
          <Button variant="ghost" size="icon">
            <ArrowLeft className="w-5 h-5" />
          </Button>
        </Link>
        <div>
          <h1 className="text-lg font-semibold">Verify Documents</h1>
          <p className="text-sm text-gray-500">{route?.folder_name}</p>
        </div>
      </header>

      {/* Camera View */}
      <div className="h-[35vh] bg-gray-900 relative">
        <video
          ref={videoRef}
          className={`absolute inset-0 w-full h-full object-cover ${cameraStatus === 'active' ? '' : 'hidden'}`}
          playsInline
          muted
          autoPlay
        />

        {cameraStatus === 'active' && (
          <div className="absolute top-[7.5%] left-[5%] w-[90%] h-[85%] border-2 border-white/70 rounded-lg pointer-events-none" />
        )}

        {cameraStatus === 'initializing' && (
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="text-center text-white">
              <Loader2 className="w-10 h-10 mx-auto mb-2 animate-spin" />
              <p className="text-sm">Starting camera...</p>
            </div>
          </div>
        )}

        {(cameraStatus === 'denied' || cameraStatus === 'error') && (
          <div className="absolute inset-0 flex items-center justify-center p-4">
            <div className="text-center text-white">
              <AlertTriangle className="w-10 h-10 mx-auto mb-2 text-yellow-400" />
              <p className="text-sm mb-3">Camera unavailable</p>
              <Button onClick={() => fileInputRef.current?.click()}>
                <Upload className="w-4 h-4 mr-2" />
                Upload Photo
              </Button>
            </div>
          </div>
        )}

        {isProcessing && (
          <div className="absolute inset-0 bg-black/70 flex items-center justify-center">
            <Loader2 className="w-8 h-8 animate-spin text-white" />
          </div>
        )}
      </div>

      {/* Capture Bar */}
      <div className="bg-white border-b px-4 py-3">
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={handleFileUpload}
        />
        
        <Button
          className="w-full bg-orange-500 hover:bg-orange-600"
          onClick={cameraStatus === 'active' ? handleCapture : () => fileInputRef.current?.click()}
          disabled={isProcessing}
        >
          <Camera className="w-5 h-5 mr-2" />
          {cameraStatus === 'active' ? 'Capture' : 'Upload'}
        </Button>
      </div>

      {/* Progress */}
      <div className="flex-1 overflow-y-auto p-4">
        <div className="max-w-lg mx-auto">
          <div className="flex items-center justify-between mb-3">
            <p className="text-sm font-medium text-gray-700">
              SCANNED: {scannedKeys.length} / {addresses.length}
            </p>
            <p className="text-sm text-gray-500">
              {Math.round((scannedKeys.length / addresses.length) * 100)}%
            </p>
          </div>
          
          <div className="w-full bg-gray-200 rounded-full h-2 mb-4">
            <div 
              className="bg-green-500 h-2 rounded-full transition-all"
              style={{ width: `${(scannedKeys.length / addresses.length) * 100}%` }}
            />
          </div>

          <p className="text-sm text-gray-600 mb-4">
            Scan each document you received to verify. Missing documents will be flagged.
          </p>
        </div>
      </div>

      {/* Verify Button */}
      <div className="bg-white border-t p-4">
        <Button
          className="w-full bg-green-600 hover:bg-green-700 h-12"
          onClick={handleVerify}
          disabled={scannedKeys.length === 0}
        >
          <CheckCircle className="w-5 h-5 mr-2" />
          Verify ({scannedKeys.length} scanned)
        </Button>
      </div>
    </div>
  );
}