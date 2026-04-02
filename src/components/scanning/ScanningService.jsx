// Scanning Service - Session management, rate limiting, image processing

export const PAY_RATES = {
  serve: 24.00,
  garnishment: 24.00,
  posting: 10.00
};

export const DOCUMENT_INFO = {
  serve: {
    name: 'Serve',
    icon: '📋',
    rate: 24.00,
    schedule: 'AM/PM + Weekends',
    description: 'Must attempt when people are home'
  },
  garnishment: {
    name: 'Garnishment',
    icon: '💰',
    rate: 24.00,
    schedule: 'Business hours',
    description: 'Usually served at businesses'
  },
  posting: {
    name: 'Posting',
    icon: '📌',
    rate: 10.00,
    schedule: 'Flexible (8am-9pm)',
    description: 'Post and photograph'
  }
};

export const CONFIDENCE_THRESHOLDS = {
  HIGH: 0.90,
  MEDIUM: 0.75,
  LOW: 0.50,
  REJECT: 0.30
};

export const OCR_RATE_LIMITS = {
  perMinute: 30,
  perSession: 100,
  perDay: 500
};

// Re-export from shared utility for backward compatibility
export { generateNormalizedKey } from '@/components/utils/addressUtils';

// Rate limiter class for OCR calls
class RateLimiter {
  constructor() {
    this.minuteKey = 'ocr_minute_count';
    this.dayKey = 'ocr_day_count';
    this.dayDateKey = 'ocr_day_date';
    this.sessionKey = 'ocr_session_count';
  }

  check() {
    const now = Date.now();
    
    // Check minute limit
    const minuteData = JSON.parse(sessionStorage.getItem(this.minuteKey) || '{"count":0,"reset":0}');
    if (now > minuteData.reset) {
      minuteData.count = 0;
      minuteData.reset = now + 60000;
    }
    if (minuteData.count >= OCR_RATE_LIMITS.perMinute) {
      return { allowed: false, reason: 'rate_limit_minute' };
    }

    // Check day limit
    const today = new Date().toDateString();
    const storedDate = localStorage.getItem(this.dayDateKey);
    let dayCount = parseInt(localStorage.getItem(this.dayKey) || '0', 10);
    if (storedDate !== today) {
      dayCount = 0;
      localStorage.setItem(this.dayDateKey, today);
    }
    if (dayCount >= OCR_RATE_LIMITS.perDay) {
      return { allowed: false, reason: 'rate_limit_day' };
    }

    // Check session limit
    const sessionCount = parseInt(sessionStorage.getItem(this.sessionKey) || '0', 10);
    if (sessionCount >= OCR_RATE_LIMITS.perSession) {
      return { allowed: false, reason: 'rate_limit_session' };
    }

    return { allowed: true };
  }

  record() {
    const now = Date.now();

    // Update minute count
    const minuteData = JSON.parse(sessionStorage.getItem(this.minuteKey) || '{"count":0,"reset":0}');
    if (now > minuteData.reset) {
      minuteData.count = 1;
      minuteData.reset = now + 60000;
    } else {
      minuteData.count++;
    }
    sessionStorage.setItem(this.minuteKey, JSON.stringify(minuteData));

    // Update day count
    const today = new Date().toDateString();
    const storedDate = localStorage.getItem(this.dayDateKey);
    let dayCount = parseInt(localStorage.getItem(this.dayKey) || '0', 10);
    if (storedDate !== today) {
      dayCount = 0;
      localStorage.setItem(this.dayDateKey, today);
    }
    localStorage.setItem(this.dayKey, String(dayCount + 1));

    // Update session count
    const sessionCount = parseInt(sessionStorage.getItem(this.sessionKey) || '0', 10);
    sessionStorage.setItem(this.sessionKey, String(sessionCount + 1));
  }
}

export const ocrRateLimiter = new RateLimiter();

// Categorize confidence score
export function categorizeConfidence(score) {
  if (score >= CONFIDENCE_THRESHOLDS.HIGH) {
    return {
      level: 'high',
      color: 'text-green-600',
      bgColor: 'bg-green-100',
      icon: '✓',
      action: 'auto_accept',
      message: 'High confidence'
    };
  } else if (score >= CONFIDENCE_THRESHOLDS.MEDIUM) {
    return {
      level: 'medium',
      color: 'text-yellow-600',
      bgColor: 'bg-yellow-100',
      icon: '⚠️',
      action: 'review',
      message: 'Please verify'
    };
  } else if (score >= CONFIDENCE_THRESHOLDS.LOW) {
    return {
      level: 'low',
      color: 'text-orange-600',
      bgColor: 'bg-orange-100',
      icon: '⚠️',
      action: 'review_required',
      message: 'Low confidence - review required'
    };
  } else {
    return {
      level: 'reject',
      color: 'text-red-600',
      bgColor: 'bg-red-100',
      icon: '✗',
      action: 'manual_entry',
      message: 'Could not extract - enter manually'
    };
  }
}

// Session management
export function createNewSession(userId, companyId, documentType) {
  const sessionId = `scan_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  
  const session = {
    id: sessionId,
    userId,
    companyId,
    documentType,
    addresses: [],
    routeInfo: {
      name: null,
      dueDate: null,
      completionRule: '14d'
    },
    currentStep: 'scanning',
    startedAt: new Date().toISOString(),
    lastUpdated: new Date().toISOString()
  };
  
  saveScanSession(session);
  return session;
}

export function saveScanSession(session) {
  session.lastUpdated = new Date().toISOString();
  // Strip base64 images before persisting — they're large and contain sensitive legal documents
  const sessionToSave = {
    ...session,
    addresses: session.addresses.map(({ imageBase64, ...rest }) => rest)
  };
  sessionStorage.setItem('scanSession_' + session.id, JSON.stringify(sessionToSave));
  sessionStorage.setItem('activeScanSession', session.id);
}

export function loadScanSession(sessionId) {
  const data = sessionStorage.getItem('scanSession_' + sessionId);
  return data ? JSON.parse(data) : null;
}

export function checkForRecoverableSession() {
  const activeId = sessionStorage.getItem('activeScanSession');
  if (!activeId) return null;
  
  const session = loadScanSession(activeId);
  if (!session) return null;
  
  // Don't recover completed sessions
  if (session.currentStep === 'complete') {
    clearScanSession(activeId);
    return null;
  }
  
  // Don't recover sessions older than 24 hours
  const lastUpdated = new Date(session.lastUpdated);
  const hoursSinceUpdate = (Date.now() - lastUpdated.getTime()) / (1000 * 60 * 60);
  if (hoursSinceUpdate > 24) {
    clearScanSession(activeId);
    return null;
  }
  
  return session;
}

export function clearScanSession(sessionId) {
  sessionStorage.removeItem('scanSession_' + sessionId);
  const activeId = sessionStorage.getItem('activeScanSession');
  if (activeId === sessionId) {
    sessionStorage.removeItem('activeScanSession');
  }
}

// Crop and compress an image blob to the center guide-box region
async function cropAndCompressBlob(blob) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      const canvas = document.createElement('canvas');
      const cropX = Math.round(img.width * 0.05);
      const cropY = Math.round(img.height * 0.20);
      const cropWidth = Math.round(img.width * 0.90);
      const cropHeight = Math.round(img.height * 0.60);
      let outputWidth = cropWidth;
      let outputHeight = cropHeight;
      const maxWidth = 1920, maxHeight = 1080;
      if (outputWidth > maxWidth || outputHeight > maxHeight) {
        const ratio = Math.min(maxWidth / outputWidth, maxHeight / outputHeight);
        outputWidth = Math.round(outputWidth * ratio);
        outputHeight = Math.round(outputHeight * ratio);
      }
      canvas.width = outputWidth;
      canvas.height = outputHeight;
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      ctx.drawImage(img, cropX, cropY, cropWidth, cropHeight, 0, 0, outputWidth, outputHeight);
      resolve(canvas.toDataURL('image/jpeg', 0.85).split(',')[1]);
    };
    img.onerror = reject;
    img.src = url;
  });
}

// Image processing — async to support ImageCapture API (Chrome Android)
// Chrome Android hardware-decodes video in a sandbox; canvas.drawImage produces a black frame.
// ImageCapture.takePhoto() bypasses that and returns a real JPEG directly from the camera.
export async function captureAndCompressImage(videoElement) {
  // Primary path: ImageCapture API (Chrome Android, Edge)
  // Re-grab track each call to avoid stale track references on Android after first capture
  if (videoElement.srcObject && typeof window.ImageCapture !== 'undefined') {
    const tracks = videoElement.srcObject.getVideoTracks();
    const track = tracks.find(t => t.readyState === 'live') || tracks[0];
    if (track && track.readyState === 'live') {
      // Try up to 2 times before falling back to canvas
      for (let attempt = 0; attempt < 2; attempt++) {
        try {
          const imageCapture = new ImageCapture(track);
          const blob = await imageCapture.takePhoto();
          return await cropAndCompressBlob(blob);
        } catch (e) {
          console.warn(`ImageCapture attempt ${attempt + 1} failed:`, e.name, e.message);
          if (attempt === 0) {
            // Short pause before retry — gives Android camera hardware time to recover
            await new Promise(r => setTimeout(r, 300));
          }
        }
      }
    }
  }

  // Fallback: canvas drawImage (Firefox, Safari, desktop Chrome)
  const videoWidth = videoElement.videoWidth;
  const videoHeight = videoElement.videoHeight;
  if (!videoWidth || !videoHeight) {
    throw new Error('Video stream not ready — dimensions unavailable');
  }
  const canvas = document.createElement('canvas');
  const cropX = Math.round(videoWidth * 0.05);
  const cropY = Math.round(videoHeight * 0.20);
  const cropWidth = Math.round(videoWidth * 0.90);
  const cropHeight = Math.round(videoHeight * 0.60);
  let outputWidth = cropWidth;
  let outputHeight = cropHeight;
  const maxWidth = 1920, maxHeight = 1080;
  if (outputWidth > maxWidth || outputHeight > maxHeight) {
    const ratio = Math.min(maxWidth / outputWidth, maxHeight / outputHeight);
    outputWidth = Math.round(outputWidth * ratio);
    outputHeight = Math.round(outputHeight * ratio);
  }
  canvas.width = outputWidth;
  canvas.height = outputHeight;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(videoElement, cropX, cropY, cropWidth, cropHeight, 0, 0, outputWidth, outputHeight);
  return canvas.toDataURL('image/jpeg', 0.85).split(',')[1];
}

// Camera helpers
export function getCameraPermissionInstructions() {
  const ua = navigator.userAgent;
  
  if (/iPhone|iPad|iPod/.test(ua)) {
    return 'Go to Settings > Safari > Camera and enable access for this site.';
  } else if (/Android/.test(ua)) {
    return 'Tap the lock icon in the address bar > Permissions > Camera > Allow.';
  } else if (/Chrome/.test(ua)) {
    return 'Click the lock icon in the address bar > Site settings > Camera > Allow.';
  } else {
    return 'Check your browser settings to enable camera access for this site.';
  }
}

export const ERROR_MESSAGES = {
  camera_not_supported: 'Your browser does not support camera access. Please use Chrome, Safari, or Firefox.',
  camera_permission_denied: 'Camera access denied. Please enable camera permissions in your browser settings.',
  camera_not_found: 'No camera found on this device.',
  ocr_not_configured: 'OCR service not configured. Please contact administrator.',
  ocr_failed: 'Could not process image. Please try again.',
  ocr_timeout: 'OCR processing timed out. Please try again.',
  rate_limit_minute: 'Too many scans. Please wait a moment before scanning more.',
  rate_limit_day: 'Daily scan limit reached. Try again tomorrow.',
  rate_limit_session: 'Maximum addresses per session reached (100). Please save this route and start a new session.',
  no_addresses: 'Please scan at least one address before creating a route.',
  invalid_address: 'Please fix all address errors before continuing.',
  missing_route_name: 'Please enter a route name.',
  missing_due_date: 'Please select a due date.',
  network_error: 'Network error. Please check your connection and try again.',
  image_too_dark: 'Image is too dark. Please try better lighting.',
  image_too_bright: 'Image is too bright/washed out.'
};