import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import { useQuery, useMutation } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { 
  ArrowLeft, 
  Camera, 
  Check, 
  Loader2, 
  X, 
  Upload, 
  AlertCircle,
  Settings
} from 'lucide-react';
import { toast } from 'sonner';
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
  const [cameraStatus, setCameraStatus] = useState('initializing'); // initializing, active, denied, error
  const [isProcessing, setIsProcessing] = useState(false);
  const [processingText, setProcessingText] = useState('');

  const urlParams = new URLSearchParams(window.location.search);
  const documentType = urlParams.get('type');
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
        return;
      }
    }

    if (documentType && ['serve', 'garnishment', 'posting'].includes(documentType)) {
      const newSession = createNewSession(user.id, user.company_id, documentType);
      setSession(newSession);
      
      // Create ScanSession in database
      base44.entities.ScanSession.create({
        user_id: user.id,
        company_id: user.company_id,
        document_type: documentType,
        status: 'active',
        started_at: new Date().toISOString(),
        last_activity_at: new Date().toISOString()
      }).then(dbSession => {
        const updatedSession = { ...newSession, dbSessionId: dbSession.id };
        setSession(updatedSession);
        saveScanSession(updatedSession);
      });
    } else {
      navigate(createPageUrl('ScanDocumentType'));
    }
  }, [user, documentType, sessionId, navigate]);

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
        } else if (error.name === 'NotFoundError') {
          setCameraStatus('error');
          toast.error(ERROR_MESSAGES.camera_not_found);
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

  // Auto-save session periodically
  useEffect(() => {
    if (!session) return;
    
    const interval = setInterval(() => {
      saveScanSession(session);
    }, 5000);

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        saveScanSession(session);
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      clearInterval(interval);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [session]);

  const processImage = async (imageBase64) => {
    if (!session) return;

    setIsProcessing(true);
    setProcessingText('Processing image...');

    try {
      // Check image quality
      const quality = await checkImageQuality(imageBase64);
      if (!quality.canProcess) {
        toast.error(quality.issues[0]?.message || 'Poor image quality');
        setIsProcessing(false);
        return;
      }

      setProcessingText('Extracting address...');

      // Call OCR backend function
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

      // Update database session
      if (session.dbSessionId) {
        base44.entities.ScanSession.update(session.dbSessionId, {
          address_count: updatedAddresses.length,
          completed_count: updatedAddresses.filter(a => a.status === 'extracted').length,
          failed_count: updatedAddresses.filter(a => a.status === 'failed').length,
          last_activity_at: new Date().toISOString()
        });
      }

      if (result.success) {
        toast.success('Address extracted successfully');
      } else {
        toast.warning('Could not extract address - will need manual entry');
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

  const handleDone = () => {
    if (!session) return;
    
    const updatedSession = {
      ...session,
      currentStep: 'preview',
      lastUpdated: new Date().toISOString()
    };
    saveScanSession(updatedSession);
    navigate(createPageUrl(`ScanPreview?sessionId=${session.id}`));
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

  if (!session) {
    return (
      <div className="min-h-screen bg-gray-900 flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-white" />
      </div>
    );
  }

  const docInfo = DOCUMENT_INFO[session.documentType];
  const successCount = session.addresses.filter(a => a.status === 'extracted').length;
  const failedCount = session.addresses.filter(a => a.status === 'failed').length;

  return (
    <div className="min-h-screen bg-gray-900 flex flex-col">
      {/* Header */}
      <div className="bg-gray-800 px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link to={createPageUrl('ScanDocumentType')}>
            <Button variant="ghost" size="icon" className="text-white hover:bg-gray-700">
              <ArrowLeft className="w-5 h-5" />
            </Button>
          </Link>
          <div>
            <h1 className="text-white font-semibold">
              Scanning: {docInfo?.name}
            </h1>
            <p className="text-gray-400 text-sm">${docInfo?.rate} each</p>
          </div>
        </div>
        <Button variant="ghost" size="icon" className="text-white hover:bg-gray-700">
          <Settings className="w-5 h-5" />
        </Button>
      </div>

      {/* Camera View */}
      <div className="flex-1 relative">
        {cameraStatus === 'active' && (
          <>
            <video
              ref={videoRef}
              className="absolute inset-0 w-full h-full object-cover"
              playsInline
              muted
            />
            {/* Alignment Guide */}
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <div className="border-2 border-white/50 rounded-lg w-4/5 h-1/3 flex items-center justify-center">
                <p className="text-white/70 text-sm bg-black/30 px-3 py-1 rounded">
                  Align address in this area
                </p>
              </div>
            </div>
          </>
        )}

        {cameraStatus === 'denied' && (
          <div className="absolute inset-0 flex items-center justify-center p-6">
            <Card className="max-w-sm">
              <CardContent className="p-6 text-center">
                <AlertCircle className="w-12 h-12 text-yellow-500 mx-auto mb-4" />
                <h3 className="font-semibold mb-2">Camera Not Available</h3>
                <p className="text-gray-600 text-sm mb-4">
                  Camera access was denied or unavailable.
                </p>
                <p className="text-gray-500 text-xs mb-4">
                  {getCameraPermissionInstructions()}
                </p>
                <div className="border-t pt-4 mt-4">
                  <p className="text-sm text-gray-600 mb-3">Or upload photos instead:</p>
                  <Button 
                    variant="outline" 
                    className="w-full"
                    onClick={() => fileInputRef.current?.click()}
                  >
                    <Upload className="w-4 h-4 mr-2" />
                    Choose Photos from Gallery
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {cameraStatus === 'error' && (
          <div className="absolute inset-0 flex items-center justify-center p-6">
            <Card className="max-w-sm">
              <CardContent className="p-6 text-center">
                <X className="w-12 h-12 text-red-500 mx-auto mb-4" />
                <h3 className="font-semibold mb-2">Camera Error</h3>
                <p className="text-gray-600 text-sm mb-4">
                  Could not access camera. Please try uploading photos instead.
                </p>
                <Button 
                  variant="outline" 
                  className="w-full"
                  onClick={() => fileInputRef.current?.click()}
                >
                  <Upload className="w-4 h-4 mr-2" />
                  Choose Photos from Gallery
                </Button>
              </CardContent>
            </Card>
          </div>
        )}

        {isProcessing && (
          <div className="absolute inset-0 bg-black/70 flex items-center justify-center">
            <div className="text-center text-white">
              <Loader2 className="w-12 h-12 animate-spin mx-auto mb-4" />
              <p>{processingText}</p>
            </div>
          </div>
        )}
      </div>

      {/* Scanned Addresses Preview */}
      {session.addresses.length > 0 && (
        <div className="bg-gray-800 px-4 py-3 max-h-32 overflow-y-auto">
          <p className="text-white text-sm mb-2">
            Scanned: {session.addresses.length} address{session.addresses.length !== 1 ? 'es' : ''}
          </p>
          <div className="flex flex-wrap gap-2">
            {session.addresses.map((addr) => {
              const conf = categorizeConfidence(addr.confidence);
              return (
                <div 
                  key={addr.tempId}
                  className="flex items-center gap-1 bg-gray-700 rounded-full px-3 py-1"
                >
                  <span className={conf.color}>{conf.icon}</span>
                  <span className="text-white text-xs truncate max-w-[120px]">
                    {addr.extractedData?.street || 'Failed'}
                  </span>
                  <button 
                    onClick={() => handleRemoveAddress(addr.tempId)}
                    className="text-gray-400 hover:text-red-400 ml-1"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Controls */}
      <div className="bg-gray-800 px-4 py-4 flex items-center justify-center gap-4">
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={handleFileUpload}
        />
        
        {cameraStatus === 'active' && (
          <Button
            size="lg"
            className="w-20 h-20 rounded-full bg-white hover:bg-gray-200 text-gray-900"
            onClick={handleCapture}
            disabled={isProcessing}
          >
            <Camera className="w-8 h-8" />
          </Button>
        )}

        {(cameraStatus === 'denied' || cameraStatus === 'error') && (
          <Button
            size="lg"
            className="px-8"
            onClick={() => fileInputRef.current?.click()}
            disabled={isProcessing}
          >
            <Upload className="w-5 h-5 mr-2" />
            Upload Photo
          </Button>
        )}

        {session.addresses.length > 0 && (
          <Button
            size="lg"
            className="bg-green-600 hover:bg-green-700"
            onClick={handleDone}
            disabled={isProcessing}
          >
            <Check className="w-5 h-5 mr-2" />
            Done ({session.addresses.length})
          </Button>
        )}
      </div>
    </div>
  );
}