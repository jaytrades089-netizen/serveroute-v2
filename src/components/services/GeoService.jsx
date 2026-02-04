// Geolocation and distance calculation utilities

/**
 * Calculate distance between two GPS coordinates in feet
 * Uses Haversine formula
 */
export function calculateDistanceFeet(lat1, lon1, lat2, lon2) {
  if (!lat1 || !lon1 || !lat2 || !lon2) return null;
  
  const R = 20902231; // Earth's radius in feet
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
            Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Math.round(R * c);
}

/**
 * Get time-based qualifier badge
 * Returns: "am", "pm", "am_weekend", "pm_weekend"
 */
export function getTimeBadge(date = new Date()) {
  const day = date.getDay(); // 0 = Sunday, 6 = Saturday
  const hour = date.getHours();
  const isWeekend = (day === 0 || day === 6);
  const isAM = hour < 12;
  
  if (isWeekend && isAM) return "am_weekend";
  if (isWeekend && !isAM) return "pm_weekend";
  if (!isWeekend && isAM) return "am";
  return "pm";
}

/**
 * Get display label for qualifier
 */
export function getQualifierDisplayLabel(qualifier) {
  const labels = {
    am: 'AM',
    pm: 'PM',
    am_weekend: 'AM WEEKEND',
    pm_weekend: 'PM WEEKEND',
    weekend: 'WEEKEND',
    ntc: 'NTC'
  };
  return labels[qualifier] || qualifier?.toUpperCase() || '';
}

/**
 * Check if user is on mobile device
 */
export function isMobileDevice() {
  return /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
}

/**
 * Get current GPS position
 * Returns Promise with {latitude, longitude, accuracy}
 * Enhanced for PC browser compatibility with better error messages
 */
export function getCurrentPosition(options = {}) {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error('Geolocation not supported by this browser. Please use Chrome or Firefox.'));
      return;
    }
    
    const isMobile = isMobileDevice();
    
    navigator.geolocation.getCurrentPosition(
      (position) => {
        resolve({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          accuracy: position.coords.accuracy
        });
      },
      (error) => {
        console.error('Geolocation error:', error.code, error.message);
        
        let message = 'Failed to get location';
        switch (error.code) {
          case 1: // PERMISSION_DENIED
            message = 'Location permission denied. Please enable location access in your browser settings.';
            break;
          case 2: // POSITION_UNAVAILABLE
            message = isMobile 
              ? 'Location unavailable. Please ensure GPS is enabled.'
              : 'Location unavailable on this device. For best experience, use the mobile app.';
            break;
          case 3: // TIMEOUT
            message = isMobile
              ? 'Location request timed out. Please try again.'
              : 'Location request timed out. Desktop browsers may have limited GPS support.';
            break;
          default:
            message = 'Could not get location. Please try again.';
        }
        reject(new Error(message));
      },
      {
        enableHighAccuracy: !isMobile, // High accuracy more important on desktop
        timeout: isMobile ? 10000 : 20000, // Longer timeout for PC
        maximumAge: isMobile ? 0 : 60000, // Allow cached position on PC (up to 1 minute)
        ...options
      }
    );
  });
}

/**
 * Format distance for display
 */
export function formatDistance(feet) {
  if (feet === null || feet === undefined) return 'Unknown';
  if (feet < 100) return `${feet} ft`;
  if (feet < 5280) return `${feet.toLocaleString()} ft`;
  const miles = (feet / 5280).toFixed(1);
  return `${miles} mi`;
}