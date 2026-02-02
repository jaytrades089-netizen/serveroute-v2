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

// Generate normalized key for duplicate detection
export function generateNormalizedKey(address) {
  if (!address || !address.street) return null;
  
  const street = address.street
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')
    .replace(/street/g, 'st')
    .replace(/avenue/g, 'ave')
    .replace(/boulevard/g, 'blvd')
    .replace(/drive/g, 'dr')
    .replace(/road/g, 'rd')
    .replace(/lane/g, 'ln')
    .replace(/court/g, 'ct')
    .replace(/place/g, 'pl')
    .replace(/way/g, 'way')
    .replace(/circle/g, 'cir')
    .replace(/apartment/g, 'apt')
    .replace(/suite/g, 'ste')
    .replace(/unit/g, 'unit');
  
  const city = (address.city || '').toLowerCase().replace(/[^a-z]/g, '');
  const state = (address.state || '').toUpperCase();
  const zip = (address.zip || '').replace(/\D/g, '').substring(0, 5);
  
  return `${street}-${city}-${state}-${zip}`;
}

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
  localStorage.setItem('scanSession_' + session.id, JSON.stringify(session));
  localStorage.setItem('activeScanSession', session.id);
}

export function loadScanSession(sessionId) {
  const data = localStorage.getItem('scanSession_' + sessionId);
  return data ? JSON.parse(data) : null;
}

export function checkForRecoverableSession() {
  const activeId = localStorage.getItem('activeScanSession');
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
  localStorage.removeItem('scanSession_' + sessionId);
  const activeId = localStorage.getItem('activeScanSession');
  if (activeId === sessionId) {
    localStorage.removeItem('activeScanSession');
  }
}

// Image processing
export function captureAndCompressImage(videoElement) {
  const canvas = document.createElement('canvas');
  
  const maxWidth = 1920;
  const maxHeight = 1080;
  
  let width = videoElement.videoWidth;
  let height = videoElement.videoHeight;
  
  if (width > maxWidth || height > maxHeight) {
    const ratio = Math.min(maxWidth / width, maxHeight / height);
    width = Math.round(width * ratio);
    height = Math.round(height * ratio);
  }
  
  canvas.width = width;
  canvas.height = height;
  
  const ctx = canvas.getContext('2d');
  ctx.drawImage(videoElement, 0, 0, width, height);
  
  const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
  return dataUrl.split(',')[1];
}

export async function checkImageQuality(imageBase64) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = Math.min(img.width, 100);
      canvas.height = Math.min(img.height, 100);
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      
      let totalBrightness = 0;
      for (let i = 0; i < imageData.data.length; i += 4) {
        const r = imageData.data[i];
        const g = imageData.data[i + 1];
        const b = imageData.data[i + 2];
        totalBrightness += (r + g + b) / 3;
      }
      const avgBrightness = totalBrightness / (imageData.data.length / 4);
      
      const issues = [];
      if (avgBrightness < 50) issues.push({ type: 'dark', message: 'Image is too dark. Try better lighting.' });
      if (avgBrightness > 220) issues.push({ type: 'bright', message: 'Image is too bright/washed out.' });
      
      resolve({
        quality: issues.length === 0 ? 'good' : 'poor',
        issues,
        brightness: avgBrightness,
        canProcess: avgBrightness >= 30 && avgBrightness <= 240
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