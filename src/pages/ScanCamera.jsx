import React, { useState, useEffect, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import { getCompanyId } from '@/components/utils/companyUtils';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { 
  ArrowLeft, 
  Camera, 
  Loader2, 
  Upload, 
  AlertCircle,
  CheckCircle,
  AlertTriangle,
  XCircle,
  Save,
  MoreVertical,
  Pencil,
  Trash2
} from 'lucide-react';
import { toast } from 'sonner';

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { geocodeWithMapQuest } from '@/components/services/OptimizationService';
import {
  DOCUMENT_INFO,
  PAY_RATES,
  createNewSession,
  loadScanSession,
  saveScanSession,
  captureAndCompressImage,
  checkImageQuality,
  categorizeConfidence,
  getCameraPermissionInstructions,
  ERROR_MESSAGES,
  ocrRateLimiter
} from '@/components/scanning/ScanningService';

export default function ScanCamera() {
  const navigate = useNavigate();
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const fileInputRef = useRef(null);
  
  const [session, setSession] = useState(null);
  const sessionRef = useRef(null);
  const [documentType, setDocumentType] = useState('serve');
  const [cameraStatus, setCameraStatus] = useState('initializing');
  const [isProcessing, setIsProcessing] = useState(false);
  const [processingText, setProcessingText] = useState('');
  const [showShutter, setShowShutter] = useState(false);

  const processingLockRef = useRef(false);

  // Reset the processing lock if the component unmounts mid-capture.
  // Without this, a stale `true` can survive across a navigate-away / navigate-back
  // and block all future captures on the next mount until force-close.
  useEffect(() => {
    return () => {
      processingLockRef.current = false;
    };
  }, []);

  const updateSession = (newSession) => {
    sessionRef.current = newSession;
    setSession(newSession);
  };

  const urlParams = new URLSearchParams(window.location.search);
  const initialType = urlParams.get('type');
  const sessionId = urlParams.get('sessionId');
  // isBulkScan is TRUE if either the URL has ?bulk=true OR the resumed session
  // was created in bulk mode. Without the session fallback, resuming a bulk
  // session loses the flag and Save Route jumps to the wrong screen.
  const urlBulkFlag = urlParams.get('bulk') === 'true';
  const isBulkScan = urlBulkFlag || (session?.isBulk === true);

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

  useEffect(() => {
    if (!user) return;

    if (sessionId) {
      const existingSession = loadScanSession(sessionId);
      if (existingSession) {
        updateSession(existingSession);
        setDocumentType(existingSession.documentType);
        return;
      }
    }

    const type = initialType || 'serve';
    if (['serve', 'garnishment', 'posting'].includes(type)) {
      setDocumentType(type);
      const newSession = createNewSession(user.id, getCompanyId(user), type);
      // Stamp bulk flag on the session so recovery/resume preserves the mode.
      if (urlBulkFlag) newSession.isBulk = true;
      updateSession(newSession);
      
      base44.entities.ScanSession.create({
        user_id: user.id,
        company_id: getCompanyId(user),
        document_type: type,
        status: 'active',
        started_at: new Date().toISOString(),
        last_activity_at: new Date().toISOString()
      }).then(dbSession => {
        const updatedSession = { ...newSession, dbSessionId: dbSession.id };
        updateSession(updatedSession);
        saveScanSession(updatedSession);
      });
    }
  }, [user, initialType, sessionId]);

  useEffect(() => {
    if (!session) return;

    let mounted = true;

    // Teardown helper ported from EvidenceCamera.jsx.
    // Detach srcObject FIRST, then stop tracks. Stopping tracks while srcObject
    // is still attached leaves Android Chrome in a state where the next
    // getUserMedia() hangs silently — which is the force-close symptom.
    const stopCamera = () => {
      if (videoRef.current && videoRef.current.srcObject) {
        try { videoRef.current.pause(); } catch {}
        videoRef.current.srcObject = null;
      }
      if (streamRef.current) {
        try {
          streamRef.current.getTracks().forEach(track => {
            try { track.stop(); } catch {}
          });
        } catch {}
        streamRef.current = null;
      }
    };

    async function startCamera() {
      if (!navigator.mediaDevices) {
        setCameraStatus('error');
        return;
      }

      // Fully release any prior stream before asking for a new one.
      // Android Chromium will hang getUserMedia if a prior stream hasn't been
      // torn down from this video element. Explicit stop + microdelay fixes it.
      stopCamera();
      await new Promise(resolve => setTimeout(resolve, 150));
      if (!mounted) return;

      await new Promise(resolve => setTimeout(resolve, 100));
      if (!mounted) return;

      try {
        let stream = null;
        
        const constraints = [
          { video: { facingMode: { exact: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false },
          { video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false },
          { video: true, audio: false }
        ];

        for (const constraint of constraints) {
          try {
            stream = await navigator.mediaDevices.getUserMedia(constraint);
            break;
          } catch (e) {
            continue;
          }
        }

        if (!stream) throw new Error('Could not access any camera');
        if (!mounted) { stream.getTracks().forEach(track => track.stop()); return; }

        streamRef.current = stream;
        
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          
          const playVideo = async () => {
            try {
              await videoRef.current.play();
              if (mounted) setCameraStatus('active');
            } catch (playErr) {
              if (mounted) setCameraStatus('active');
            }
          };

          if (videoRef.current.readyState >= 2) {
            playVideo();
          } else {
            videoRef.current.onloadeddata = playVideo;
            setTimeout(() => {
              if (mounted && cameraStatus === 'initializing') playVideo();
            }, 1000);
          }
        }
      } catch (error) {
        if (!mounted) return;
        if (error.name === 'NotAllowedError' || error.name === 'PermissionDeniedError') {
          setCameraStatus('denied');
        } else {
          setCameraStatus('error');
        }
      }
    }

    startCamera();

    return () => {
      mounted = false;
      stopCamera();
    };
  }, [session?.id]);

  // Session-save interval: depend only on session?.id, and read from sessionRef
  // inside the callbacks. Previously this effect depended on the whole `session`
  // object, so the interval tore down and restarted after every single scan.
  useEffect(() => {
    if (!session?.id) return;
    const interval = setInterval(() => {
      if (sessionRef.current) saveScanSession(sessionRef.current);
    }, 5000);
    const handleVisibility = () => {
      if (document.visibilityState === 'hidden' && sessionRef.current) {
        saveScanSession(sessionRef.current);
      }
    };
    document.addEventListener('visibilitychange', handleVisibility);
    return () => {
      clearInterval(interval);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [session?.id]);

  const processImage = async (imageBase64) => {
    const currentSession = sessionRef.current;
    if (!currentSession) return;

    setIsProcessing(true);
    setProcessingText('Processing image...');

    try {
      const rateCheck = ocrRateLimiter.check();
      if (!rateCheck.allowed) {
        toast.error(ERROR_MESSAGES[rateCheck.reason] || 'Rate limit exceeded');
        setIsProcessing(false);
        return;
      }

      const quality = await checkImageQuality(imageBase64);
      if (!quality.canProcess) {
        toast.error(quality.issues[0]?.message || 'Poor image quality');
        setIsProcessing(false);
        return;
      }

      setProcessingText('Extracting address...');

      let response;
      try {
        // 30-second client-side timeout around the OCR function call.
        // Without this, a hung Base44 function (cold start, Vision API lag,
        // serverless congestion) would leave the user staring at
        // "Extracting address..." forever — which reads as a freeze and
        // triggers force-close.
        const OCR_TIMEOUT_MS = 30000;
        const timeoutPromise = new Promise((_, reject) =>
          setTimeout(() => reject(new Error('OCR_TIMEOUT')), OCR_TIMEOUT_MS)
        );
        response = await Promise.race([
          base44.functions.invoke('processOCR', {
            imageBase64,
            documentType: currentSession.documentType,
            sessionId: currentSession.dbSessionId
          }),
          timeoutPromise
        ]);
      } catch (invokeError) {
        if (invokeError?.message === 'OCR_TIMEOUT') {
          toast.error('OCR taking too long — check signal and try again');
        } else {
          toast.error('Network error — check your connection and try again');
        }
        setIsProcessing(false);
        setProcessingText('');
        return;
      }

      if (!response || !response.data) {
        toast.error('Server error — please try again');
        setIsProcessing(false);
        return;
      }

      const result = response.data;

      if (result.error) {
        toast.error(result.error === 'OCR service not configured' ? 'OCR not available' : 'Failed to process image');
        setIsProcessing(false);
        return;
      }

      if (!result.success || !result.parsedAddress) {
        if (!isBulkScan) {
          toast.error('No address found — try centering the document and scanning again');
          setIsProcessing(false);
          setProcessingText('');
          return;
        }
        const failedAddress = {
          tempId: `temp_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
          imageBase64,
          ocrRawText: result.rawText || '',
          extractedData: null,
          manualEntry: '',
          status: 'failed',
          error: 'OCR could not extract an address'
        };
        const latestSession = sessionRef.current;
        const updatedAddresses = [failedAddress, ...latestSession.addresses];
        const updatedSession = { ...latestSession, addresses: updatedAddresses, lastUpdated: new Date().toISOString() };
        updateSession(updatedSession);
        saveScanSession(updatedSession);
        toast.error('Could not read address — type it in below before continuing');
        return;
      }

      const newAddress = {
        tempId: `temp_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
        imageBase64,
        ocrRawText: result.rawText,
        extractedData: {
          street: result.parsedAddress.street,
          city: result.parsedAddress.city,
          state: result.parsedAddress.state,
          zip: result.parsedAddress.zip,
          fullAddress: `${result.parsedAddress.street}, ${result.parsedAddress.city}, ${result.parsedAddress.state} ${result.parsedAddress.zip}`,
          documentType: currentSession.documentType
        },
        defendantName: result.defendantName,
        confidence: result.confidence,
        normalizedKey: result.normalizedKey,
        needsReview: result.requiresReview,
        manuallyEdited: false,
        status: 'extracted',
        error: null
      };

      if (isBulkScan) {
        const apiKey = userSettings?.mapquest_api_key;
        if (apiKey && newAddress.extractedData?.fullAddress) {
          try {
            const coords = await geocodeWithMapQuest(newAddress.extractedData.fullAddress, apiKey);
            if (coords) { newAddress.lat = coords.lat; newAddress.lng = coords.lng; }
          } catch (err) {
            console.warn('Geocode failed for:', newAddress.extractedData.fullAddress);
          }
        }
      }

      const latestSession = sessionRef.current;
      const updatedAddresses = [newAddress, ...latestSession.addresses];
      const updatedSession = { ...latestSession, addresses: updatedAddresses, lastUpdated: new Date().toISOString() };

      updateSession(updatedSession);
      saveScanSession(updatedSession);

      if (latestSession.dbSessionId) {
        base44.entities.ScanSession.update(latestSession.dbSessionId, {
          address_count: updatedAddresses.length,
          completed_count: updatedAddresses.filter(a => a.status === 'extracted').length,
          failed_count: updatedAddresses.filter(a => a.status === 'failed').length,
          last_activity_at: new Date().toISOString()
        });
      }

      ocrRateLimiter.record();
      toast.success('Address extracted');

    } catch (error) {
      toast.error(error.message || ERROR_MESSAGES.ocr_failed);
    } finally {
      setIsProcessing(false);
      setProcessingText('');
    }
  };

  const handleCapture = async () => {
    if (!videoRef.current || processingLockRef.current) return;
    processingLockRef.current = true;
    try {
      const imageBase64 = await captureAndCompressImage(videoRef.current);
      setShowShutter(true);
      await processImage(imageBase64);
      await new Promise(resolve => setTimeout(resolve, 800));
    } catch (err) {
      toast.error(err.message || 'Capture failed — please try again');
    } finally {
      setShowShutter(false);
      await new Promise(resolve => setTimeout(resolve, 200));
      processingLockRef.current = false;
    }
  };

  const handleFileUpload = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (e) => {
      const base64 = e.target.result.split(',')[1];
      await processImage(base64);
    };
    reader.readAsDataURL(file);
    event.target.value = '';
  };

  const handleRemoveAddress = (tempId) => {
    const current = sessionRef.current;
    if (!current) return;
    const updatedAddresses = current.addresses.filter(a => a.tempId !== tempId);
    const updatedSession = { ...current, addresses: updatedAddresses, lastUpdated: new Date().toISOString() };
    updateSession(updatedSession);
    saveScanSession(updatedSession);
  };

  const isAddToRouteMode = urlParams.get('mode') === 'addToRoute';

  const handleSaveRoute = () => {
    if (!session || session.addresses.length === 0) return;
    const updatedSession = { ...session, currentStep: 'route_setup', lastUpdated: new Date().toISOString() };
    saveScanSession(updatedSession);
    if (isAddToRouteMode) {
      navigate(createPageUrl(`ScanAddToRoute?sessionId=${session.id}`));
    } else if (isBulkScan) {
      navigate(createPageUrl(`BulkScanOptimize?sessionId=${session.id}`));
    } else {
      navigate(createPageUrl(`ScanPreview?sessionId=${session.id}`));
    }
  };

  const handleDocTypeChange = (newType) => {
    const current = sessionRef.current;
    if (!current) return;
    setDocumentType(newType);
    const updatedSession = { ...current, documentType: newType, lastUpdated: new Date().toISOString() };
    updateSession(updatedSession);
    saveScanSession(updatedSession);
    if (current.dbSessionId) {
      base44.entities.ScanSession.update(current.dbSessionId, { document_type: newType, last_activity_at: new Date().toISOString() });
    }
  };

  const isBoss = user?.role === 'boss' || user?.role === 'admin';

  if (!session) {
    return (
      <div style={{ minHeight: '100vh', background: 'transparent' }} className="flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin" style={{ color: '#e9c349' }} />
      </div>
    );
  }

  const getConfidenceDisplay = (confidence) => {
    if (confidence >= 0.90) return { icon: CheckCircle, color: 'text-green-500', label: `${Math.round(confidence * 100)}%` };
    if (confidence >= 0.75) return { icon: AlertTriangle, color: 'text-yellow-500', label: 'Tap to edit' };
    return { icon: XCircle, color: 'text-red-500', label: 'Tap to fix' };
  };

  return (
    <div style={{ minHeight: '100vh', background: 'transparent' }} className="flex flex-col">
      {/* Header */}
      <div style={{ background: 'rgba(11,15,30,0.75)', backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)', borderBottom: '1px solid rgba(255,255,255,0.08)' }} className="px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link to={createPageUrl(isBoss ? 'BossDashboard' : 'WorkerHome')}>
            <Button variant="ghost" size="icon" style={{ color: '#e6e1e4' }}>
              <ArrowLeft className="w-5 h-5" />
            </Button>
          </Link>
          <h1 className="text-lg font-semibold" style={{ color: isBulkScan ? '#e9c349' : '#e6e1e4' }}>
            {isBulkScan ? '⬡ Bulk Scan' : 'Scan Documents'}
          </h1>
        </div>
        {isBulkScan && (
          <span className="text-xs px-2 py-1 rounded-full" style={{ background: 'rgba(233,195,73,0.2)', color: '#e9c349', border: '1px solid rgba(233,195,73,0.4)' }}>
            BULK MODE
          </span>
        )}
      </div>

      {/* Camera View */}
      <div className="h-[30vh] bg-gray-900 relative">
        <video
          ref={videoRef}
          className={`absolute inset-0 w-full h-full object-cover ${cameraStatus === 'active' ? '' : 'hidden'}`}
          playsInline muted autoPlay
        />
        
        {cameraStatus === 'active' && (
          <>
            <div className="absolute top-0 left-0 right-0 h-[24%] backdrop-blur-sm bg-black/45" />
            <div className="absolute bottom-0 left-0 right-0 h-[24%] backdrop-blur-sm bg-black/45" />
            <div className="absolute top-[24%] left-0 w-[15%] h-[52%] backdrop-blur-sm bg-black/45" />
            <div className="absolute top-[24%] right-0 w-[15%] h-[52%] backdrop-blur-sm bg-black/45" />
            <div className="absolute top-[24%] left-[15%] w-[70%] h-[52%] border-2 border-white/70 rounded-lg pointer-events-none" />
            <div className="absolute top-[48%] left-1/2 -translate-x-1/2 text-white/60 text-xs font-medium pointer-events-none">
              Keep only one address inside this box
            </div>
          </>
        )}

        {cameraStatus === 'initializing' && (
          <div className="absolute inset-0 flex items-center justify-center p-4">
            <div className="text-center text-white">
              <Loader2 className="w-10 h-10 mx-auto mb-2 animate-spin text-orange-400" />
              <p className="text-sm">Starting camera...</p>
            </div>
          </div>
        )}

        {cameraStatus === 'denied' && (
          <div className="absolute inset-0 flex items-center justify-center p-4">
            <div className="text-center text-white">
              <AlertCircle className="w-10 h-10 mx-auto mb-2 text-yellow-400" />
              <p className="text-sm mb-2">Camera permission denied</p>
              <Button size="sm" className="bg-orange-500 hover:bg-orange-600" onClick={() => fileInputRef.current?.click()}>
                <Upload className="w-4 h-4 mr-1" /> Upload Photo Instead
              </Button>
            </div>
          </div>
        )}

        {cameraStatus === 'error' && (
          <div className="absolute inset-0 flex items-center justify-center p-4">
            <div className="text-center text-white">
              <AlertCircle className="w-10 h-10 mx-auto mb-2 text-red-400" />
              <p className="text-sm mb-2">Camera unavailable</p>
              <Button size="sm" className="bg-orange-500 hover:bg-orange-600" onClick={() => fileInputRef.current?.click()}>
                <Upload className="w-4 h-4 mr-1" /> Upload Photo Instead
              </Button>
            </div>
          </div>
        )}

        {(showShutter || isProcessing) && (
          <div className={`absolute inset-0 flex items-center justify-center transition-colors duration-150 ${showShutter ? 'bg-black' : 'bg-black/70'}`}>
            {isProcessing && (
              <div className="text-center text-white">
                <Loader2 className="w-8 h-8 animate-spin mx-auto mb-2" />
                <p className="text-sm">{processingText}</p>
              </div>
            )}
          </div>
        )}
      </div>

      <p className="text-center text-xs py-1.5" style={{ color: '#8a7f87', background: 'rgba(11,15,30,0.70)', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
        Hold closer and keep just one address inside the box
      </p>

      {/* Capture Bar */}
      <div style={{ background: 'rgba(11,15,30,0.75)', backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)', borderBottom: '1px solid rgba(255,255,255,0.08)' }} className="px-4 py-3 flex items-center justify-between gap-3">
        <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleFileUpload} />
        
        {cameraStatus === 'active' ? (
          <Button
            style={{ background: 'rgba(233,195,73,0.20)', border: '1px solid rgba(233,195,73,0.50)', color: '#e9c349' }}
            className="gap-2 hover:opacity-90"
            onClick={handleCapture}
            disabled={isProcessing || showShutter}
          >
            <Camera className="w-5 h-5" /> Capture
          </Button>
        ) : (
          <Button
            style={{ background: 'rgba(233,195,73,0.20)', border: '1px solid rgba(233,195,73,0.50)', color: '#e9c349' }}
            className="gap-2 hover:opacity-90"
            onClick={() => fileInputRef.current?.click()}
            disabled={isProcessing}
          >
            <Upload className="w-5 h-5" /> Upload
          </Button>
        )}

        <div className="flex items-center gap-1">
          {['serve', 'garnishment', 'posting'].map(type => (
            <button
              key={type}
              onClick={() => handleDocTypeChange(type)}
              className="px-3 py-1.5 rounded-lg text-xs font-semibold transition-all capitalize"
              style={documentType === type
                ? { background: 'rgba(233,195,73,0.25)', border: '1px solid rgba(233,195,73,0.60)', color: '#e9c349' }
                : { background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', color: '#8a7f87' }
              }
            >
              {type.charAt(0).toUpperCase() + type.slice(1)}
            </button>
          ))}
        </div>
      </div>

      {/* Address List */}
      <div className="flex-1 overflow-y-auto px-4 py-3" style={{ background: 'transparent' }}>
        <p className="text-sm font-bold mb-3 uppercase tracking-wide" style={{ color: '#8a7f87' }}>
          SCANNED ADDRESSES ({session.addresses.length})
        </p>

        {session.addresses.length === 0 ? (
          <div className="text-center py-8">
            <Camera className="w-10 h-10 mx-auto mb-2" style={{ color: '#363436' }} />
            <p className="text-sm" style={{ color: '#6B7280' }}>No addresses scanned yet</p>
            <p className="text-xs" style={{ color: '#4B5563' }}>Capture or upload documents to begin</p>
          </div>
        ) : (
          <div className="space-y-2">
            {session.addresses.map((addr) => {
              if (addr.status === 'failed') {
                return (
                  <div key={addr.tempId} className="rounded-xl p-4" style={{ background: 'rgba(239,68,68,0.12)', border: '1px solid rgba(239,68,68,0.40)' }}>
                    <div className="flex items-start gap-3">
                      <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5" style={{ color: '#ef4444' }} />
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-sm" style={{ color: '#fca5a5' }}>Could not extract address</p>
                        <p className="text-xs mb-2" style={{ color: '#f87171' }}>{addr.error}</p>
                        <input
                          type="text"
                          className="w-full rounded-lg px-3 py-2 text-sm focus:outline-none"
                          style={{ background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(239,68,68,0.40)', color: '#e6e1e4' }}
                          placeholder="Type address manually..."
                          value={addr.manualEntry || ''}
                          onChange={(e) => {
                            const val = e.target.value;
                            const current = sessionRef.current;
                            if (!current) return;
                            const updatedAddresses = current.addresses.map(a =>
                              a.tempId === addr.tempId
                                ? { ...a, manualEntry: val, status: val.length > 5 ? 'resolved' : 'failed' }
                                : a
                            );
                            const updatedSession = { ...current, addresses: updatedAddresses, lastUpdated: new Date().toISOString() };
                            updateSession(updatedSession);
                            saveScanSession(updatedSession);
                          }}
                        />
                      </div>
                      <Button variant="ghost" size="icon" className="h-8 w-8" style={{ color: '#f87171' }} onClick={() => handleRemoveAddress(addr.tempId)}>
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                );
              }

              const conf = getConfidenceDisplay(addr.confidence || 0);
              const ConfIcon = conf.icon;
              const confColor = conf.color.includes('green') ? '#22c55e' : conf.color.includes('yellow') ? '#eab308' : '#ef4444';
              
              return (
                <div key={addr.tempId} className="rounded-xl p-4" style={{ background: 'rgba(14,20,44,0.55)', backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)', border: '1px solid rgba(255,255,255,0.12)' }}>
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-start gap-3 flex-1 min-w-0">
                      <ConfIcon className="w-5 h-5 flex-shrink-0 mt-0.5" style={{ color: confColor }} />
                      <div className="min-w-0 flex-1">
                        <p className="font-semibold text-sm break-words" style={{ color: '#d0c3cb' }}>
                          {addr.defendantName || 'Unknown Defendant'}
                        </p>
                        <p className="font-bold text-sm break-words" style={{ color: '#e6e1e4' }}>
                          {addr.extractedData?.street?.toUpperCase() || 'FAILED TO EXTRACT ADDRESS'}
                        </p>
                        <p className="text-sm break-words" style={{ color: '#e6e1e4' }}>
                          {addr.extractedData?.city ? `${addr.extractedData.city.toUpperCase()}, ${addr.extractedData.state.toUpperCase()} ${addr.extractedData.zip}` : ''}
                        </p>
                        <div className="flex items-center gap-2 mt-1">
                          <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: 'rgba(255,255,255,0.10)', color: '#8a7f87' }}>
                            {(addr.extractedData?.documentType || documentType).charAt(0).toUpperCase() + (addr.extractedData?.documentType || documentType).slice(1)}
                          </span>
                          <span className="text-xs" style={{ color: confColor }}>{conf.label}</span>
                        </div>
                      </div>
                    </div>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-8 w-8" style={{ color: '#6B7280' }}>
                          <MoreVertical className="w-4 h-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => { const updatedSession = { ...session, currentStep: 'route_setup', lastUpdated: new Date().toISOString() }; saveScanSession(updatedSession); navigate(createPageUrl(`ScanRouteSetup?sessionId=${session.id}&edit=${addr.tempId}`)); }}>
                          <Pencil className="w-4 h-4 mr-2" /> Edit Address
                        </DropdownMenuItem>
                        <DropdownMenuItem className="text-red-600" onClick={() => handleRemoveAddress(addr.tempId)}>
                          <Trash2 className="w-4 h-4 mr-2" /> Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Save Button */}
      {(() => {
        const hasUnresolvedFailures = isBulkScan && session.addresses.some(a => a.status === 'failed');
        return (
          <div className="p-4" style={{ borderTop: '1px solid rgba(255,255,255,0.08)', background: 'rgba(11,15,30,0.75)', backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)' }}>
            {hasUnresolvedFailures && (
              <p className="text-xs text-red-400 text-center mb-2">Resolve all failed scans before continuing</p>
            )}
            <button
              className="w-full h-12 text-base font-bold rounded-xl flex items-center justify-center gap-2 transition-opacity disabled:opacity-40"
              style={isAddToRouteMode
                ? { background: 'rgba(99,102,241,0.20)', border: '1px solid rgba(99,102,241,0.50)', color: '#a5b4fc' }
                : isBulkScan
                ? { background: 'rgba(233,195,73,0.30)', border: '2px solid rgba(233,195,73,0.70)', color: '#e9c349' }
                : { background: 'rgba(233,195,73,0.20)', border: '1px solid rgba(233,195,73,0.50)', color: '#e9c349' }
              }
              onClick={handleSaveRoute}
              disabled={session.addresses.length === 0 || hasUnresolvedFailures}
            >
              <Save className="w-5 h-5" />
              {isAddToRouteMode
                ? `Add to Route (${session.addresses.length})`
                : isBulkScan
                ? `Optimize Routes (${session.addresses.length} scanned) →`
                : `Save Route (${session.addresses.length} address${session.addresses.length !== 1 ? 'es' : ''})`
              }
            </button>
          </div>
        );
      })()}
    </div>
  );
}
