import React, { useState, useEffect, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { 
  ArrowLeft, 
  Camera, 
  Loader2, 
  X, 
  Upload, 
  AlertCircle,
  CheckCircle,
  AlertTriangle,
  XCircle,
  Pencil,
  Save
} from 'lucide-react';
import { toast } from 'sonner';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
  ERROR_MESSAGES
} from '@/components/scanning/ScanningService';

export default function ScanCamera() {
  const navigate = useNavigate();
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const fileInputRef = useRef(null);
  
  const [session, setSession] = useState(null);
  const [documentType, setDocumentType] = useState('serve');
  const [cameraStatus, setCameraStatus] = useState('initializing');
  const [isProcessing, setIsProcessing] = useState(false);
  const [processingText, setProcessingText] = useState('');

  const urlParams = new URLSearchParams(window.location.search);
  const initialType = urlParams.get('type');
  const sessionId = urlParams.get('sessionId');

  const { data: user } = useQuery({
    queryKey: ['currentUser'],
    queryFn: () => base44.auth.me()
  });

  // Initialize session
  useEffect(() => {
    if (!user) return;

    if (sessionId) {
      const existingSession = loadScanSession(sessionId);
      if (existingSession) {
        setSession(existingSession);
        setDocumentType(existingSession.documentType);
        return;
      }
    }

    const type = initialType || 'serve';
    if (['serve', 'garnishment', 'posting'].includes(type)) {
      setDocumentType(type);
      const newSession = createNewSession(user.id, user.company_id, type);
      setSession(newSession);
      
      base44.entities.ScanSession.create({
        user_id: user.id,
        company_id: user.company_id,
        document_type: type,
        status: 'active',
        started_at: new Date().toISOString(),
        last_activity_at: new Date().toISOString()
      }).then(dbSession => {
        const updatedSession = { ...newSession, dbSessionId: dbSession.id };
        setSession(updatedSession);
        saveScanSession(updatedSession);
      });
    }
  }, [user, initialType, sessionId]);

  // Start camera
  useEffect(() => {
    if (!session) return;

    async function startCamera() {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        setCameraStatus('error');
        toast.error(ERROR_MESSAGES.camera_not_supported);
        return;
      }

      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: 'environment',
            width: { ideal: 1920 },
            height: { ideal: 1080 }
          },
          audio: false
        });

        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
        }
        setCameraStatus('active');
      } catch (error) {
        console.error('Camera error:', error);
        if (error.name === 'NotAllowedError') {
          setCameraStatus('denied');
        } else {
          setCameraStatus('error');
        }
      }
    }

    startCamera();

    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
      }
    };
  }, [session]);

  // Auto-save session
  useEffect(() => {
    if (!session) return;
    
    const interval = setInterval(() => saveScanSession(session), 5000);
    const handleVisibility = () => {
      if (document.visibilityState === 'hidden') saveScanSession(session);
    };
    document.addEventListener('visibilitychange', handleVisibility);

    return () => {
      clearInterval(interval);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [session]);

  const processImage = async (imageBase64) => {
    if (!session) return;

    setIsProcessing(true);
    setProcessingText('Processing image...');

    try {
      const quality = await checkImageQuality(imageBase64);
      if (!quality.canProcess) {
        toast.error(quality.issues[0]?.message || 'Poor image quality');
        setIsProcessing(false);
        return;
      }

      setProcessingText('Extracting address...');

      const response = await base44.functions.invoke('processOCR', {
        imageBase64,
        documentType: session.documentType,
        sessionId: session.dbSessionId
      });

      const result = response.data;

      const newAddress = {
        tempId: `temp_${Date.now()}`,
        imageBase64,
        ocrRawText: result.rawText,
        extractedData: result.parsedAddress ? {
          street: result.parsedAddress.street,
          city: result.parsedAddress.city,
          state: result.parsedAddress.state,
          zip: result.parsedAddress.zip,
          fullAddress: `${result.parsedAddress.street}, ${result.parsedAddress.city}, ${result.parsedAddress.state} ${result.parsedAddress.zip}`
        } : null,
        defendantName: result.defendantName,
        confidence: result.confidence,
        normalizedKey: result.normalizedKey,
        needsReview: result.requiresReview,
        manuallyEdited: false,
        status: result.success ? 'extracted' : 'failed',
        error: result.success ? null : 'Could not extract address'
      };

      const updatedAddresses = [...session.addresses, newAddress];
      const updatedSession = {
        ...session,
        addresses: updatedAddresses,
        lastUpdated: new Date().toISOString()
      };

      setSession(updatedSession);
      saveScanSession(updatedSession);

      if (session.dbSessionId) {
        base44.entities.ScanSession.update(session.dbSessionId, {
          address_count: updatedAddresses.length,
          completed_count: updatedAddresses.filter(a => a.status === 'extracted').length,
          failed_count: updatedAddresses.filter(a => a.status === 'failed').length,
          last_activity_at: new Date().toISOString()
        });
      }

      if (result.success) {
        toast.success('Address extracted');
      } else {
        toast.warning('Could not extract - needs manual entry');
      }

    } catch (error) {
      console.error('OCR error:', error);
      toast.error(error.message || ERROR_MESSAGES.ocr_failed);
    } finally {
      setIsProcessing(false);
      setProcessingText('');
    }
  };

  const handleCapture = async () => {
    if (!videoRef.current || isProcessing) return;
    const imageBase64 = captureAndCompressImage(videoRef.current);
    await processImage(imageBase64);
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
    if (!session) return;
    const updatedAddresses = session.addresses.filter(a => a.tempId !== tempId);
    const updatedSession = {
      ...session,
      addresses: updatedAddresses,
      lastUpdated: new Date().toISOString()
    };
    setSession(updatedSession);
    saveScanSession(updatedSession);
  };

  const handleSaveRoute = () => {
    if (!session || session.addresses.length === 0) return;
    
    const updatedSession = {
      ...session,
      currentStep: 'route_setup',
      lastUpdated: new Date().toISOString()
    };
    saveScanSession(updatedSession);
    navigate(createPageUrl(`ScanRouteSetup?sessionId=${session.id}`));
  };

  const handleDocTypeChange = (newType) => {
    if (!session) return;
    setDocumentType(newType);
    const updatedSession = {
      ...session,
      documentType: newType,
      lastUpdated: new Date().toISOString()
    };
    setSession(updatedSession);
    saveScanSession(updatedSession);
    
    if (session.dbSessionId) {
      base44.entities.ScanSession.update(session.dbSessionId, {
        document_type: newType,
        last_activity_at: new Date().toISOString()
      });
    }
  };

  const isBoss = user?.role === 'boss' || user?.role === 'admin';

  if (!session) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
      </div>
    );
  }

  const docInfo = DOCUMENT_INFO[documentType];
  const validCount = session.addresses.filter(a => a.status === 'extracted').length;

  const getConfidenceDisplay = (confidence) => {
    if (confidence >= 0.90) return { icon: CheckCircle, color: 'text-green-500', bg: 'bg-green-50', label: `${Math.round(confidence * 100)}%` };
    if (confidence >= 0.75) return { icon: AlertTriangle, color: 'text-yellow-500', bg: 'bg-yellow-50', label: 'Tap to edit' };
    return { icon: XCircle, color: 'text-red-500', bg: 'bg-red-50', label: 'Tap to fix' };
  };

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      {/* Header */}
      <div className="bg-white border-b px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link to={createPageUrl(isBoss ? 'BossDashboard' : 'WorkerHome')}>
            <Button variant="ghost" size="icon">
              <ArrowLeft className="w-5 h-5" />
            </Button>
          </Link>
          <h1 className="text-lg font-semibold">Scan Documents</h1>
        </div>
      </div>

      {/* Camera View - 30% height */}
      <div className="h-[30vh] bg-gray-900 relative">
        {cameraStatus === 'active' && (
          <>
            <video
              ref={videoRef}
              className="absolute inset-0 w-full h-full object-cover"
              playsInline
              muted
            />
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <div className="border-2 border-white/50 rounded-lg w-[90%] h-[70%] flex items-center justify-center">
                <p className="text-white/70 text-xs bg-black/40 px-2 py-1 rounded">
                  Align address here
                </p>
              </div>
            </div>
          </>
        )}

        {cameraStatus === 'denied' && (
          <div className="absolute inset-0 flex items-center justify-center p-4">
            <div className="text-center text-white">
              <AlertCircle className="w-10 h-10 mx-auto mb-2 text-yellow-400" />
              <p className="text-sm mb-2">Camera not available</p>
              <Button 
                size="sm" 
                variant="outline"
                className="text-white border-white"
                onClick={() => fileInputRef.current?.click()}
              >
                <Upload className="w-4 h-4 mr-1" />
                Upload Photo
              </Button>
            </div>
          </div>
        )}

        {cameraStatus === 'error' && (
          <div className="absolute inset-0 flex items-center justify-center p-4">
            <div className="text-center text-white">
              <X className="w-10 h-10 mx-auto mb-2 text-red-400" />
              <p className="text-sm">Camera error</p>
            </div>
          </div>
        )}

        {isProcessing && (
          <div className="absolute inset-0 bg-black/70 flex items-center justify-center">
            <div className="text-center text-white">
              <Loader2 className="w-8 h-8 animate-spin mx-auto mb-2" />
              <p className="text-sm">{processingText}</p>
            </div>
          </div>
        )}
      </div>

      {/* Capture Bar */}
      <div className="bg-white border-b px-4 py-3 flex items-center justify-between gap-3">
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={handleFileUpload}
        />
        
        {cameraStatus === 'active' ? (
          <Button
            className="bg-orange-500 hover:bg-orange-600 text-white gap-2"
            onClick={handleCapture}
            disabled={isProcessing}
          >
            <Camera className="w-5 h-5" />
            Capture
          </Button>
        ) : (
          <Button
            className="bg-orange-500 hover:bg-orange-600 text-white gap-2"
            onClick={() => fileInputRef.current?.click()}
            disabled={isProcessing}
          >
            <Upload className="w-5 h-5" />
            Upload
          </Button>
        )}

        <div className="flex items-center gap-2">
          <span className="text-sm text-gray-600">Type:</span>
          <Select value={documentType} onValueChange={handleDocTypeChange}>
            <SelectTrigger className="w-[140px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="serve">📄 Serve - $24</SelectItem>
              <SelectItem value="garnishment">💰 Garnishment - $24</SelectItem>
              <SelectItem value="posting">📌 Posting - $10</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Address List - Scrollable */}
      <div className="flex-1 overflow-y-auto bg-gray-50 px-4 py-3">
        <p className="text-sm font-medium text-gray-700 mb-3">
          SCANNED ADDRESSES ({session.addresses.length})
        </p>

        {session.addresses.length === 0 ? (
          <div className="text-center py-8 text-gray-500">
            <Camera className="w-10 h-10 mx-auto mb-2 text-gray-300" />
            <p className="text-sm">No addresses scanned yet</p>
            <p className="text-xs">Capture or upload documents to begin</p>
          </div>
        ) : (
          <div className="space-y-2">
            {session.addresses.map((addr) => {
              const conf = getConfidenceDisplay(addr.confidence || 0);
              const ConfIcon = conf.icon;
              
              return (
                <Card key={addr.tempId} className={`${conf.bg} border`}>
                  <CardContent className="p-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-start gap-2 flex-1 min-w-0">
                        <ConfIcon className={`w-5 h-5 ${conf.color} flex-shrink-0 mt-0.5`} />
                        <div className="min-w-0 flex-1">
                          <p className="font-medium text-sm truncate">
                            {addr.extractedData?.fullAddress || addr.extractedData?.street || 'Failed to extract'}
                          </p>
                          <p className={`text-xs ${conf.color}`}>
                            Confidence: {conf.label}
                          </p>
                          {addr.defendantName && (
                            <p className="text-xs text-gray-500 truncate">
                              {addr.defendantName}
                            </p>
                          )}
                        </div>
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-gray-400 hover:text-red-500"
                        onClick={() => handleRemoveAddress(addr.tempId)}
                      >
                        <X className="w-4 h-4" />
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>

      {/* Save Route Button - Fixed Bottom */}
      <div className="bg-white border-t p-4">
        <Button
          className="w-full bg-orange-500 hover:bg-orange-600 text-white h-12 text-base"
          onClick={handleSaveRoute}
          disabled={session.addresses.length === 0}
        >
          <Save className="w-5 h-5 mr-2" />
          Save Route ({session.addresses.length} address{session.addresses.length !== 1 ? 'es' : ''})
        </Button>
      </div>
    </div>
  );
}