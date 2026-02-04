import React, { useState } from 'react';
import { Monitor, X } from 'lucide-react';
import { isMobileDevice } from '@/components/services/GeoService';

export default function DesktopWarningBanner() {
  const [dismissed, setDismissed] = useState(false);
  
  // Only show on desktop
  if (isMobileDevice() || dismissed) {
    return null;
  }
  
  return (
    <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 mb-4 text-sm text-amber-700">
      <div className="flex items-start gap-2">
        <Monitor className="w-4 h-4 mt-0.5 flex-shrink-0" />
        <div className="flex-1">
          <strong>Desktop Mode:</strong> For best experience with GPS and camera features, use the mobile app on your phone.
        </div>
        <button 
          onClick={() => setDismissed(true)}
          className="text-amber-500 hover:text-amber-700"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}