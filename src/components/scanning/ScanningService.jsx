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

// Image processing - crops to center 90% width x 85% height area (the clear box)
export function captureAndCompressImage(videoElement) {
  const canvas = document.createElement('canvas');
  
  const videoWidth = videoElement.videoWidth;
  const videoHeight = videoElement.videoHeight;
  
  // Calculate the crop region (matching the visible box: 90% width, 85% height, centered)
  const cropX = Math.round(videoWidth * 0.05);  // 5% from left
  const cropY = Math.round(videoHeight * 0.075); // 7.5% from top
  const cropWidth = Math.round(videoWidth * 0.90);  // 90% width
  const cropHeight = Math.round(videoHeight * 0.85); // 85% height
  
  // Set max output dimensions
  const maxWidth = 1920;
  const maxHeight = 1080;
  
  let outputWidth = cropWidth;
  let outputHeight = cropHeight;
  
  if (outputWidth > maxWidth || outputHeight > maxHeight) {
    const ratio = Math.min(maxWidth / outputWidth, maxHeight / outputHeight);
    outputWidth = Math.round(outputWidth * ratio);
    outputHeight = Math.round(outputHeight * ratio);
  }
  
  canvas.width = outputWidth;
  canvas.height = outputHeight;
  
  const ctx = canvas.getContext('2d');
  // Draw only the cropped region (inside the clear box)
  ctx.drawImage(
    videoElement, 
    cropX, cropY, cropWidth, cropHeight,  // Source rectangle
    0, 0, outputWidth, outputHeight        // Destination rectangle
  );
  
  const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
  return dataUrl.split(',')[1];
}

export async function checkImageQuality(imageBase64) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      const sampleSize = 100;
      canvas.width = Math.min(img.width, sampleSize);
      canvas.height = Math.min(img.height, sampleSize);
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const data = imageData.data;
      const pixelCount = data.length / 4;
      
      // Calculate brightness
      let totalBrightness = 0;
      const grayscale = [];
      for (let i = 0; i < data.length; i += 4) {
        const r = data[i];
        const g = data[i + 1];
        const b = data[i + 2];
        const gray = (r + g + b) / 3;
        totalBrightness += gray;
        grayscale.push(gray);
      }
      const avgBrightness = totalBrightness / pixelCount;
      
      // Calculate Laplacian variance for blur detection
      const width = canvas.width;
      const height = canvas.height;
      let laplacianSum = 0;
      let laplacianCount = 0;
      
      for (let y = 1; y < height - 1; y++) {
        for (let x = 1; x < width - 1; x++) {
          const idx = y * width + x;
          const laplacian = 
            grayscale[idx - width] + 
            grayscale[idx + width] + 
            grayscale[idx - 1] + 
            grayscale[idx + 1] - 
            4 * grayscale[idx];
          laplacianSum += laplacian * laplacian;
          laplacianCount++;
        }
      }
      const laplacianVariance = laplacianCount > 0 ? laplacianSum / laplacianCount : 0;
      
      const issues = [];
      
      // Brightness checks
      if (avgBrightness < 50) {
        issues.push({ type: 'dark', message: 'Image is too dark. Try better lighting.' });
      }
      if (avgBrightness > 220) {
        issues.push({ type: 'bright', message: 'Image is too bright/washed out.' });
      }
      
      // Blur check - threshold tuned for document scanning
      const BLUR_THRESHOLD = 100;
      if (laplacianVariance < BLUR_THRESHOLD) {
        issues.push({ type: 'blur', message: 'Image appears blurry. Hold steady and try again.' });
      }
      
      resolve({
        quality: issues.length === 0 ? 'good' : 'poor',
        issues,
        brightness: avgBrightness,
        sharpness: laplacianVariance,
        canProcess: avgBrightness >= 30 && avgBrightness <= 240 && laplacianVariance >= BLUR_THRESHOLD * 0.5
      });
    };
    img.onerror = () => resolve({ quality: 'unknown', issues: [], canProcess: true });
    img.src = 'data:image/jpeg;base64,' + imageBase64;
  });
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