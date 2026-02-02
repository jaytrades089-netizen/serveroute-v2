import React, { useState, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Camera, X, Plus, Loader2, Image as ImageIcon } from 'lucide-react';
import { Dialog, DialogContent } from '@/components/ui/dialog';

// Compress image to reduce file size
async function compressImage(file, options = {}) {
  const {
    maxWidth = 1920,
    maxHeight = 1920,
    quality = 0.7
  } = options;

  return new Promise((resolve, reject) => {
    const img = new window.Image();
    img.onload = () => {
      let width = img.width;
      let height = img.height;

      if (width > maxWidth || height > maxHeight) {
        const ratio = Math.min(maxWidth / width, maxHeight / height);
        width = Math.round(width * ratio);
        height = Math.round(height * ratio);
      }

      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;

      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, width, height);

      canvas.toBlob(
        (blob) => {
          if (blob) {
            // If still too large, compress more
            if (blob.size > 500 * 1024) {
              const smallerCanvas = document.createElement('canvas');
              smallerCanvas.width = Math.round(width * 0.7);
              smallerCanvas.height = Math.round(height * 0.7);
              const smallerCtx = smallerCanvas.getContext('2d');
              smallerCtx.drawImage(img, 0, 0, smallerCanvas.width, smallerCanvas.height);
              smallerCanvas.toBlob(
                (smallBlob) => {
                  resolve(new File([smallBlob || blob], file.name, { type: 'image/jpeg' }));
                },
                'image/jpeg',
                0.5
              );
            } else {
              resolve(new File([blob], file.name, { type: 'image/jpeg' }));
            }
          } else {
            reject(new Error('Failed to compress image'));
          }
        },
        'image/jpeg',
        quality
      );
    };

    img.onerror = () => reject(new Error('Failed to load image'));
    img.src = URL.createObjectURL(file);
  });
}

export default function PhotoCapture({ photos, onPhotosChange, maxPhotos = 5, minPhotos = 1 }) {
  const [showCamera, setShowCamera] = useState(false);
  const [previewPhoto, setPreviewPhoto] = useState(null);
  const [capturing, setCapturing] = useState(false);
  const fileInputRef = useRef(null);
  const videoRef = useRef(null);
  const streamRef = useRef(null);

  const handleFileSelect = async (e) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;

    setCapturing(true);
    try {
      for (const file of files) {
        if (photos.length >= maxPhotos) break;

        const compressed = await compressImage(file);
        const newPhoto = {
          id: `photo_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
          file: compressed,
          preview: URL.createObjectURL(compressed),
          status: 'pending'
        };

        onPhotosChange([...photos, newPhoto]);
      }
    } catch (error) {
      console.error('Failed to process photo:', error);
    } finally {
      setCapturing(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const startCamera = async () => {
    setShowCamera(true);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment' }
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
    } catch (error) {
      console.error('Failed to access camera:', error);
      setShowCamera(false);
    }
  };

  const captureFromCamera = async () => {
    if (!videoRef.current) return;

    setCapturing(true);
    try {
      const canvas = document.createElement('canvas');
      canvas.width = videoRef.current.videoWidth;
      canvas.height = videoRef.current.videoHeight;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(videoRef.current, 0, 0);

      const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.8));
      const file = new File([blob], `capture_${Date.now()}.jpg`, { type: 'image/jpeg' });
      const compressed = await compressImage(file);

      const newPhoto = {
        id: `photo_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        file: compressed,
        preview: URL.createObjectURL(compressed),
        status: 'pending'
      };

      onPhotosChange([...photos, newPhoto]);
      closeCamera();
    } catch (error) {
      console.error('Failed to capture:', error);
    } finally {
      setCapturing(false);
    }
  };

  const closeCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    setShowCamera(false);
  };

  const handleDelete = (photoId) => {
    const photo = photos.find(p => p.id === photoId);
    if (photo?.preview) {
      URL.revokeObjectURL(photo.preview);
    }
    onPhotosChange(photos.filter(p => p.id !== photoId));
  };

  const remaining = minPhotos - photos.length;

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-4 gap-2">
        {photos.map((photo) => (
          <div
            key={photo.id}
            className="relative aspect-square rounded-lg overflow-hidden bg-gray-100 border"
            onClick={() => setPreviewPhoto(photo)}
          >
            <img
              src={photo.preview}
              alt="Receipt photo"
              className="w-full h-full object-cover"
            />
            {photo.status === 'uploading' && (
              <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
                <Loader2 className="w-5 h-5 animate-spin text-white" />
              </div>
            )}
            <button
              className="absolute top-1 right-1 bg-red-500 text-white rounded-full p-0.5"
              onClick={(e) => {
                e.stopPropagation();
                handleDelete(photo.id);
              }}
            >
              <X className="w-3 h-3" />
            </button>
          </div>
        ))}

        {photos.length < maxPhotos && (
          <>
            <button
              className="aspect-square rounded-lg border-2 border-dashed border-gray-300 flex flex-col items-center justify-center gap-1 hover:border-blue-400 hover:bg-blue-50 transition-colors"
              onClick={startCamera}
              disabled={capturing}
            >
              <Camera className="w-5 h-5 text-gray-400" />
              <span className="text-xs text-gray-500">Camera</span>
            </button>

            <button
              className="aspect-square rounded-lg border-2 border-dashed border-gray-300 flex flex-col items-center justify-center gap-1 hover:border-blue-400 hover:bg-blue-50 transition-colors"
              onClick={() => fileInputRef.current?.click()}
              disabled={capturing}
            >
              <ImageIcon className="w-5 h-5 text-gray-400" />
              <span className="text-xs text-gray-500">Gallery</span>
            </button>
          </>
        )}
      </div>

      <p className="text-xs text-gray-500">
        {photos.length} of {maxPhotos} photos
        {remaining > 0 && (
          <span className="text-orange-600 ml-1">• {remaining} more required</span>
        )}
      </p>

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={handleFileSelect}
      />

      {/* Camera Modal */}
      <Dialog open={showCamera} onOpenChange={(open) => !open && closeCamera()}>
        <DialogContent className="max-w-md p-0 overflow-hidden">
          <div className="relative bg-black">
            <video
              ref={videoRef}
              autoPlay
              playsInline
              className="w-full aspect-[4/3] object-cover"
            />
            <div className="absolute bottom-4 left-0 right-0 flex justify-center gap-4">
              <Button
                variant="outline"
                size="sm"
                onClick={closeCamera}
                className="bg-white/90"
              >
                Cancel
              </Button>
              <Button
                onClick={captureFromCamera}
                disabled={capturing}
                className="bg-blue-600 hover:bg-blue-700"
              >
                {capturing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Camera className="w-4 h-4" />}
                <span className="ml-2">Capture</span>
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Preview Modal */}
      <Dialog open={!!previewPhoto} onOpenChange={() => setPreviewPhoto(null)}>
        <DialogContent className="max-w-lg p-2">
          {previewPhoto && (
            <img
              src={previewPhoto.preview}
              alt="Preview"
              className="w-full rounded-lg"
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}