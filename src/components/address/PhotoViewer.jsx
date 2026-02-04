import React, { useState } from 'react';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { ChevronLeft, ChevronRight, X } from 'lucide-react';

export default function PhotoViewer({ open, onClose, photos = [] }) {
  const [currentIndex, setCurrentIndex] = useState(0);

  const handlePrev = () => {
    setCurrentIndex((prev) => (prev > 0 ? prev - 1 : photos.length - 1));
  };

  const handleNext = () => {
    setCurrentIndex((prev) => (prev < photos.length - 1 ? prev + 1 : 0));
  };

  if (photos.length === 0) return null;

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
      <DialogContent className="max-w-2xl p-0 overflow-hidden bg-black">
        <div className="relative">
          {/* Close Button */}
          <Button
            variant="ghost"
            size="icon"
            onClick={onClose}
            className="absolute top-2 right-2 z-10 text-white bg-black/50 hover:bg-black/70"
          >
            <X className="w-5 h-5" />
          </Button>

          {/* Photo */}
          <img
            src={photos[currentIndex]}
            alt={`Evidence photo ${currentIndex + 1}`}
            className="w-full max-h-[70vh] object-contain"
          />

          {/* Navigation */}
          {photos.length > 1 && (
            <>
              <Button
                variant="ghost"
                size="icon"
                onClick={handlePrev}
                className="absolute left-2 top-1/2 -translate-y-1/2 text-white bg-black/50 hover:bg-black/70"
              >
                <ChevronLeft className="w-6 h-6" />
              </Button>
              
              <Button
                variant="ghost"
                size="icon"
                onClick={handleNext}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-white bg-black/50 hover:bg-black/70"
              >
                <ChevronRight className="w-6 h-6" />
              </Button>

              {/* Dots indicator */}
              <div className="absolute bottom-4 left-0 right-0 flex justify-center gap-2">
                {photos.map((_, idx) => (
                  <button
                    key={idx}
                    onClick={() => setCurrentIndex(idx)}
                    className={`w-2 h-2 rounded-full transition-colors ${
                      idx === currentIndex ? 'bg-white' : 'bg-white/50'
                    }`}
                  />
                ))}
              </div>
            </>
          )}

          {/* Counter */}
          <div className="absolute bottom-4 right-4 bg-black/60 text-white text-sm px-3 py-1 rounded-full">
            {currentIndex + 1} / {photos.length}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}