import React, { useState, useRef, useEffect } from 'react';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Camera, X, Loader2, RotateCcw } from 'lucide-react';

export default function EvidenceCamera({ open, onClose, onPhotoTaken }) {
  const [capturing, setCapturing] = useState(false);
  const [error, setError] = useState(null);
  const videoRef = useRef(null);
  const streamRef = useRef(null);

  useEffect(() => {
    if (open) {
      startCamera();
    }
    return () => {
      stopCamera();
    };
  }, [open]);

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
      if (err.name === 'NotAllowedError') {
        setError('Camera permission denied. Please enable camera access.');
      } else {
        setError('Unable to access camera. Please try again.');
      }
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
      <DialogContent className="max-w-lg p-0 overflow-hidden bg-black">
        <div className="relative">
          {error ? (
            <div className="aspect-[4/3] flex flex-col items-center justify-center p-6 text-center">
              <Camera className="w-12 h-12 text-gray-500 mb-4" />
              <p className="text-white mb-4">{error}</p>
              <Button onClick={startCamera} variant="outline" className="text-white border-white">
                <RotateCcw className="w-4 h-4 mr-2" />
                Try Again
              </Button>
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
                  
                  <div className="w-20" /> {/* Spacer for centering */}
                </div>
              </div>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}