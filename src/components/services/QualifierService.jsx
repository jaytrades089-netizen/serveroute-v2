/**
 * Qualifier Service for Process Serving
 * Handles AM/PM/WEEKEND badge calculations per Michigan rules
 */

/**
 * Get qualifier badges for a given timestamp
 * @param {Date|string} timestamp - The timestamp to evaluate
 * @param {string} timezone - The timezone to use (defaults to Michigan time)
 * @returns {Object} Object with badges array, count, and metadata
 */
export function getQualifiers(timestamp, timezone = 'America/Detroit') {
  const date = new Date(timestamp);
  
  // Get hour and minute in the correct timezone
  const hourStr = new Intl.DateTimeFormat('en-US', { 
    timeZone: timezone, hour: 'numeric', hour12: false 
  }).format(date);
  const minuteStr = new Intl.DateTimeFormat('en-US', { 
    timeZone: timezone, minute: 'numeric' 
  }).format(date);
  const dayStr = new Intl.DateTimeFormat('en-US', { 
    timeZone: timezone, weekday: 'short' 
  }).format(date);
  
  const hour = parseInt(hourStr);
  const minutes = parseInt(minuteStr);
  const timeInMinutes = hour * 60 + minutes;
  
  const isWeekend = (dayStr === 'Sat' || dayStr === 'Sun');
  
  // Service hours: 8 AM to 9 PM
  const SERVICE_START = 8 * 60;
  const SERVICE_END = 21 * 60;
  const AM_END = 12 * 60;
  const PM_START = 17 * 60;
  
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
    badges.push('WEEKEND');
    if (timeInMinutes < AM_END) {
      badges.push('AM');
    } else if (timeInMinutes >= PM_START) {
      badges.push('PM');
    }
  } else {
    if (timeInMinutes < AM_END) {
      badges.push('AM');
    } else if (timeInMinutes >= PM_START) {
      badges.push('PM');
    } else {
      badges.push('NTC');
    }
  }
  
  return {
    badges: badges,
    count: badges.filter(b => b !== 'NTC').length,
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