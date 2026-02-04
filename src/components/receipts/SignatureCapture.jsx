import React, { useRef, useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Eraser, Check, PenTool } from 'lucide-react';

export default function SignatureCapture({ onSignature, required = false, existingSignature = null }) {
  const canvasRef = useRef(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [hasSignature, setHasSignature] = useState(!!existingSignature);
  const [isSaved, setIsSaved] = useState(!!existingSignature);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    // Draw existing signature if provided
    if (existingSignature) {
      const img = new window.Image();
      img.onload = () => {
        ctx.drawImage(img, 0, 0);
      };
      img.src = existingSignature;
    }
  }, [existingSignature]);

  const getCoordinates = (e) => {
    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;

    if (e.touches) {
      return {
        x: (e.touches[0].clientX - rect.left) * scaleX,
        y: (e.touches[0].clientY - rect.top) * scaleY
      };
    }
    return {
      x: (e.clientX - rect.left) * scaleX,
      y: (e.clientY - rect.top) * scaleY
    };
  };

  const startDrawing = (e) => {
    e.preventDefault();
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    const { x, y } = getCoordinates(e);

    ctx.beginPath();
    ctx.moveTo(x, y);
    setIsDrawing(true);
    setHasSignature(true);
    setIsSaved(false);
  };

  const draw = (e) => {
    if (!isDrawing) return;
    e.preventDefault();

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    const { x, y } = getCoordinates(e);

    ctx.lineTo(x, y);
    ctx.stroke();
  };

  const stopDrawing = () => {
    setIsDrawing(false);
    // Auto-save signature when user lifts finger/mouse
    if (hasSignature || isDrawing) {
      const canvas = canvasRef.current;
      canvas.toBlob((blob) => {
        if (blob) {
          onSignature(blob);
          setIsSaved(true);
        }
      }, 'image/png');
    }
  };

  const clear = () => {
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    setHasSignature(false);
    setIsSaved(false);
    onSignature(null);
  };

  const save = () => {
    const canvas = canvasRef.current;
    canvas.toBlob((blob) => {
      if (blob) {
        onSignature(blob);
        setIsSaved(true);
      }
    }, 'image/png');
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <label className="text-sm font-medium text-gray-700 flex items-center gap-2">
          <PenTool className="w-4 h-4" />
          Signature {required && <span className="text-red-500">*</span>}
        </label>
        {hasSignature && (
          <div className="flex gap-2">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={clear}
              className="text-gray-500 h-7 px-2"
            >
              <Eraser className="w-3 h-3 mr-1" />
              Clear
            </Button>
            {!isSaved && (
              <Button
                type="button"
                size="sm"
                onClick={save}
                className="bg-green-600 hover:bg-green-700 h-7 px-2"
              >
                <Check className="w-3 h-3 mr-1" />
                Save
              </Button>
            )}
          </div>
        )}
      </div>

      <div className={`relative border-2 rounded-lg bg-white ${
        required && !hasSignature ? 'border-orange-300' : isSaved ? 'border-green-300' : 'border-gray-200'
      }`}>
        <canvas
          ref={canvasRef}
          width={400}
          height={150}
          className="w-full h-32 touch-none cursor-crosshair"
          onMouseDown={startDrawing}
          onMouseMove={draw}
          onMouseUp={stopDrawing}
          onMouseLeave={stopDrawing}
          onTouchStart={startDrawing}
          onTouchMove={draw}
          onTouchEnd={stopDrawing}
        />

        {!hasSignature && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <span className="text-gray-400 text-sm">Sign here</span>
          </div>
        )}

        {isSaved && (
          <div className="absolute top-2 right-2 bg-green-100 text-green-700 text-xs px-2 py-0.5 rounded-full flex items-center gap-1">
            <Check className="w-3 h-3" />
            Saved
          </div>
        )}
      </div>

      {required && !hasSignature && (
        <p className="text-xs text-orange-600">Signature required for this outcome</p>
      )}
    </div>
  );
}