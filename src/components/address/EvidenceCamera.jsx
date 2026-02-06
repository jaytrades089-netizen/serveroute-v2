import React, { useState, useRef, useEffect } from 'react';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Camera, X, Loader2, RotateCcw, Upload } from 'lucide-react';

export default function EvidenceCamera({ open, onClose, onPhotoTaken }) {
  const [capturing, setCapturing] = useState(false);
  const [error, setError] = useState(null);
  const [hasCamera, setHasCamera] = useState(true);
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const fileInputRef = useRef(null);

  useEffect(() => {
    if (open) {
      checkCameraAndStart();
    }
    return () => {
      stopCamera();
    };
  }, [open]);

  const checkCameraAndStart = async () => {
    setError(null);
    try {
      // Check if any camera devices exist
      const devices = await navigator.mediaDevices.enumerateDevices();
      const videoDevices = devices.filter(device => device.kind === 'videoinput');
      
      if (videoDevices.length === 0) {
        setHasCamera(false);
        setError('No camera detected. You can upload a photo instead.');
        return;
      }
      
      setHasCamera(true);
      await startCamera();
    } catch (err) {
      console.error('Device check error:', err);
      setHasCamera(false);
      setError('Camera not available. You can upload a photo instead.');
    }
  };

  const startCamera = async () => {
    setError(null);
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
      }
    } catch (err) {
      console.error('Camera error:', err);
      setHasCamera(false);
      if (err.name === 'NotAllowedError') {
        setError('Camera permission denied. You can upload a photo instead.');
      } else if (err.name === 'NotFoundError') {
        setError('No camera found. You can upload a photo instead.');
      } else {
        setError('Unable to access camera. You can upload a photo instead.');
      }
    }
  };

  const handleFileUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    setCapturing(true);
    try {
      // Read file as data URL for preview
      const dataUrl = await new Promise((resolve) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.readAsDataURL(file);
      });
      
      onPhotoTaken({ file, dataUrl });
    } catch (err) {
      console.error('File upload error:', err);
      setError('Failed to process photo');
    } finally {
      setCapturing(false);
    }
  };

  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
  };

  const capturePhoto = async () => {
    if (!videoRef.current) return;
    
    setCapturing(true);
    try {
      const canvas = document.createElement('canvas');
      canvas.width = videoRef.current.videoWidth;
      canvas.height = videoRef.current.videoHeight;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(videoRef.current, 0, 0);
      
      // Compress to JPEG
      const blob = await new Promise(resolve => 
        canvas.toBlob(resolve, 'image/jpeg', 0.85)
      );
      
      const file = new File([blob], `evidence_${Date.now()}.jpg`, { type: 'image/jpeg' });
      const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
      
      stopCamera();
      onPhotoTaken({ file, dataUrl });
    } catch (err) {
      console.error('Capture error:', err);
      setError('Failed to capture photo');
    } finally {
      setCapturing(false);
    }
  };

  const handleClose = () => {
    stopCamera();
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && handleClose()}>
      <DialogContent className="max-w-lg p-0 overflow-hidden bg-black" aria-describedby={undefined}>
        <DialogTitle className="sr-only">Capture Evidence</DialogTitle>
        {/* Hidden file input for upload fallback */}
        <input 
          type="file" 
          ref={fileInputRef}
          accept="image/*"
          capture="environment"
          className="hidden"
          onChange={handleFileUpload}
        />
        
        <div className="relative">
          {error ? (
            <div className="aspect-[4/3] flex flex-col items-center justify-center p-6 text-center">
              <Camera className="w-12 h-12 text-gray-500 mb-4" />
              <p className="text-white mb-4">{error}</p>
              <div className="flex flex-col gap-3">
                {/* Upload photo button - always available */}
                <Button 
                  onClick={() => fileInputRef.current?.click()} 
                  className="bg-blue-500 hover:bg-blue-600 text-white"
                  disabled={capturing}
                >
                  {capturing ? (
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  ) : (
                    <Upload className="w-4 h-4 mr-2" />
                  )}
                  Upload Photo
                </Button>
                
                {/* Try camera again - only if camera might exist */}
                {hasCamera && (
                  <Button onClick={checkCameraAndStart} variant="outline" className="text-white border-white">
                    <RotateCcw className="w-4 h-4 mr-2" />
                    Try Camera Again
                  </Button>
                )}
              </div>
            </div>
          ) : (
            <>
              <video
                ref={videoRef}
                autoPlay
                playsInline
                muted
                className="w-full aspect-[4/3] object-cover"
              />
              
              {/* Capture Controls */}
              <div className="absolute bottom-0 left-0 right-0 p-4 bg-gradient-to-t from-black/80 to-transparent">
                <div className="flex items-center justify-center gap-4">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleClose}
                    className="bg-white/20 border-white/40 text-white hover:bg-white/30"
                  >
                    <X className="w-4 h-4 mr-1" />
                    Cancel
                  </Button>
                  
                  <button
                    onClick={capturePhoto}
                    disabled={capturing}
                    className="w-16 h-16 rounded-full bg-white border-4 border-gray-300 flex items-center justify-center hover:bg-gray-100 disabled:opacity-50 transition-all active:scale-95"
                  >
                    {capturing ? (
                      <Loader2 className="w-6 h-6 animate-spin text-gray-600" />
                    ) : (
                      <div className="w-12 h-12 rounded-full bg-red-500" />
                    )}
                  </button>
                  
                  {/* Upload fallback button */}
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => fileInputRef.current?.click()}
                    className="bg-white/20 border-white/40 text-white hover:bg-white/30"
                  >
                    <Upload className="w-4 h-4 mr-1" />
                    Upload
                  </Button>
                </div>
              </div>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}