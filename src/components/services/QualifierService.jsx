/**
 * Qualifier Service for Process Serving
 * Handles AM/PM/WEEKEND badge calculations per Michigan rules
 */

/**
 * Get qualifier badges for a given timestamp
 * @param {Date|string} timestamp - The timestamp to evaluate
 * @returns {Object} Object with badges array, count, and metadata
 */
export function getQualifiers(timestamp) {
  const date = new Date(timestamp);
  const day = date.getDay(); // 0 = Sunday, 6 = Saturday
  const hour = date.getHours();
  const minutes = date.getMinutes();
  const timeInMinutes = hour * 60 + minutes;
  
  const isWeekend = (day === 0 || day === 6);
  
  // Service hours: 8 AM (480 min) to 9 PM (1260 min)
  const SERVICE_START = 8 * 60;  // 8:00 AM = 480 minutes
  const SERVICE_END = 21 * 60;   // 9:00 PM = 1260 minutes
  const AM_END = 12 * 60;        // 12:00 PM = 720 minutes
  const PM_START = 17 * 60;      // 5:00 PM = 1020 minutes
  
  // Outside service hours
  if (timeInMinutes < SERVICE_START || timeInMinutes > SERVICE_END) {
    return { 
      badges: [], 
      count: 0, 
      display: 'Outside Hours',
      hasAM: false,
      hasPM: false,
      hasWeekend: false,
      isNTC: false,
      isOutsideHours: true
    };
  }
  
  const badges = [];
  
  if (isWeekend) {
    // Weekend logic
    badges.push('WEEKEND');
    
    if (timeInMinutes < AM_END) {
      // 8 AM - 12 PM on weekend = AM + WEEKEND
      badges.push('AM');
    } else if (timeInMinutes >= PM_START) {
      // 5 PM - 9 PM on weekend = PM + WEEKEND
      badges.push('PM');
    }
    // 12 PM - 5 PM on weekend = just WEEKEND (already added)
    
  } else {
    // Weekday logic
    if (timeInMinutes < AM_END) {
      // 8 AM - 12 PM = AM
      badges.push('AM');
    } else if (timeInMinutes >= PM_START) {
      // 5 PM - 9 PM = PM
      badges.push('PM');
    } else {
      // 12 PM - 5 PM = NTC (No Time Covered)
      badges.push('NTC');
    }
  }
  
  return {
    badges: badges,
    count: badges.filter(b => b !== 'NTC').length, // NTC doesn't count
    display: badges.join(' + '),
    hasAM: badges.includes('AM'),
    hasPM: badges.includes('PM'),
    hasWeekend: badges.includes('WEEKEND'),
    isNTC: badges.includes('NTC'),
    isOutsideHours: false
  };
}

/**
 * Get badge color styling
 * @param {string} badge - The badge type (AM, PM, WEEKEND, NTC)
 * @returns {Object} Tailwind classes for the badge
 */
export function getBadgeStyle(badge) {
  const styles = {
    'AM': { bg: 'bg-amber-100', text: 'text-amber-700', border: 'border-amber-300' },
    'PM': { bg: 'bg-blue-100', text: 'text-blue-700', border: 'border-blue-300' },
    'WEEKEND': { bg: 'bg-purple-100', text: 'text-purple-700', border: 'border-purple-300' },
    'NTC': { bg: 'bg-gray-100', text: 'text-gray-500', border: 'border-gray-300' }
  };
  return styles[badge] || styles['NTC'];
}

/**
 * Calculate what qualifiers are still needed
 * For Michigan process serving: need AM + PM + WEEKEND (or 3 attempts with different qualifiers)
 * @param {Array} attempts - Array of attempt objects
 * @returns {Object} Object with needed badges, earned flags, and completion status
 */
export function getNeededQualifiers(attempts) {
  const earned = {
    AM: false,
    PM: false,
    WEEKEND: false
  };
  
  // Check what we have from all attempts
  (attempts || []).forEach(attempt => {
    // Check stored flags first
    if (attempt.has_am) earned.AM = true;
    if (attempt.has_pm) earned.PM = true;
    if (attempt.has_weekend) earned.WEEKEND = true;
    
    // Fallback: recalculate from timestamp if flags not stored
    if (!attempt.has_am && !attempt.has_pm && !attempt.has_weekend && attempt.attempt_time) {
      const quals = getQualifiers(attempt.attempt_time);
      if (quals.hasAM) earned.AM = true;
      if (quals.hasPM) earned.PM = true;
      if (quals.hasWeekend) earned.WEEKEND = true;
    }
  });
  
  const needed = [];
  if (!earned.AM) needed.push('AM');
  if (!earned.PM) needed.push('PM');
  if (!earned.WEEKEND) needed.push('WEEKEND');
  
  return {
    needed: needed,
    earned: earned,
    earnedBadges: Object.keys(earned).filter(k => earned[k]),
    isComplete: needed.length === 0
  };
}

/**
 * Convert qualifier data to storage format for Attempt entity
 * @param {Object} qualifierData - Result from getQualifiers()
 * @returns {Object} Fields to store on Attempt entity
 */
export function getQualifierStorageFields(qualifierData) {
  return {
    qualifier: qualifierData.display.toLowerCase().replace(/ \+ /g, '_'), // "am", "pm", "weekend", "am_weekend", "pm_weekend", "ntc"
    qualifier_badges: qualifierData.badges,
    qualifier_count: qualifierData.count,
    has_am: qualifierData.hasAM,
    has_pm: qualifierData.hasPM,
    has_weekend: qualifierData.hasWeekend,
    is_ntc: qualifierData.isNTC
  };
}

/**
 * Calculate spread date based on first attempt and spread type
 * @param {Date|string} firstAttemptDate - Date of first attempt
 * @param {string} spreadType - "10" or "14" days
 * @returns {Date} The spread due date
 */
export function calculateSpreadDate(firstAttemptDate, spreadType = '14') {
  const date = new Date(firstAttemptDate);
  const spreadDays = spreadType === '14' ? 14 : 10;
  date.setDate(date.getDate() + spreadDays);
  return date;
}