/**
 * Shared address utilities - Single source of truth
 * Used by: ScanningService, DCNMatchingService, AddressCard, ScanVerify
 */

/**
 * Generate normalized key for duplicate detection and DCN matching
 * @param {Object} address - Address object with street/city/state/zip OR legal_address
 * @returns {string|null} Normalized key like "123mainst-detroit-mi-48201"
 */
export function generateNormalizedKey(address) {
  if (!address) return null;
  
  // Handle different input formats
  let street, city, state, zip;
  
  if (address.street) {
    // Format from OCR parsing: { street, city, state, zip }
    street = address.street;
    city = address.city || '';
    state = address.state || '';
    zip = address.zip || '';
  } else if (address.legal_address || address.normalized_address) {
    // Format from Address entity - parse from full address
    const fullAddress = address.legal_address || address.normalized_address || '';
    const parts = fullAddress.split(',').map(p => p.trim());
    street = parts[0] || '';
    
    // Try to extract city, state, zip from remaining parts
    if (parts.length >= 2) {
      const lastPart = parts[parts.length - 1];
      const stateZipMatch = lastPart.match(/([A-Za-z]{2})\s*(\d{5})/);
      if (stateZipMatch) {
        state = stateZipMatch[1];
        zip = stateZipMatch[2];
        // City is everything before state/zip in last part
        city = lastPart.replace(stateZipMatch[0], '').trim();
        if (!city && parts.length >= 3) {
          city = parts[parts.length - 2];
        }
      }
    }
    
    // Fallback to entity fields if available
    city = city || address.city || '';
    state = state || address.state || '';
    zip = zip || address.zip || '';
  } else {
    return null;
  }
  
  if (!street) return null;
  
  // Normalize street
  const normalizedStreet = street
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
  
  const normalizedCity = (city || '').toLowerCase().replace(/[^a-z]/g, '');
  const normalizedState = (state || '').toUpperCase().replace(/MICHIGAN/i, 'MI').replace(/OHIO/i, 'OH');
  const normalizedZip = (zip || '').replace(/\D/g, '').substring(0, 5);
  
  return `${normalizedStreet}-${normalizedCity}-${normalizedState}-${normalizedZip}`;
}

/**
 * Convert a stored ISO timestamp (UTC) into a "YYYY-MM-DD" key representing the
 * calendar day in the user's LOCAL timezone.
 *
 * Why: ScheduledServe rows store scheduled_datetime as a UTC ISO string. A serve
 * set for 8:30 PM ET on April 16 is stored as "2026-04-17T00:30:00Z" — its UTC
 * date is April 17. Grouping by str.split('T')[0] reads the UTC date and puts
 * evening serves under the wrong day (tomorrow instead of today).
 *
 * This helper extracts the local calendar date (year-month-day) so day-group
 * keys match what the user actually sees on their phone.
 *
 * @param {string|Date|null} isoOrDate - UTC ISO string or Date, or null
 * @returns {string|null} "YYYY-MM-DD" in local time, or null if input is invalid
 */
export function getLocalDateKey(isoOrDate) {
  if (!isoOrDate) return null;
  const d = isoOrDate instanceof Date ? isoOrDate : new Date(isoOrDate);
  if (isNaN(d.getTime())) return null;
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/**
 * Parse a full address string and return ONLY the street portion.
 * Handles the common dirty-data case where the whole address ended up in the
 * street field: "782 ABBEY LN, Milford, MI 48381" → "782 ABBEY LN".
 *
 * Strategy:
 *  1. If there's a comma, take everything before the first comma.
 *  2. Otherwise, if there's a state+zip pattern (e.g. "MI 48381"), take
 *     everything before that pattern.
 *  3. Otherwise, return the input unchanged (already clean, or nothing to parse).
 *
 * Apartment/unit suffixes attached to the street (e.g. "LN #407", "LN APT 4")
 * stay with the street because they live before the first comma.
 *
 * @param {string} str - raw address string
 * @returns {string} street-only portion, trimmed
 */
export function parseStreetOnly(str) {
  if (!str || typeof str !== 'string') return '';
  const trimmed = str.trim();
  if (!trimmed) return '';

  // Preferred: split on the first comma.
  const commaIdx = trimmed.indexOf(',');
  if (commaIdx !== -1) {
    return trimmed.slice(0, commaIdx).trim();
  }

  // Fallback: look for a " [STATE] [ZIP]" tail, strip it off.
  // Matches "MI 48381", "Mi 48381-1234", etc.
  const stateZipMatch = trimmed.match(/\s+[A-Za-z]{2}\s+\d{5}(-\d{4})?\s*$/);
  if (stateZipMatch) {
    return trimmed.slice(0, stateZipMatch.index).trim();
  }

  // No dirt detected — return as-is.
  return trimmed;
}

/**
 * Split a full address string into its components.
 * Used by Edit forms to auto-clean dirty records when opened.
 *
 * "782 ABBEY LN, Milford, MI 48381" → { street: "782 ABBEY LN", city: "Milford", state: "MI", zip: "48381" }
 *
 * When parts cannot be extracted, they return as empty strings — the caller
 * should fall back to entity fields (address.city, address.state, etc.) rather
 * than overwriting known-good values with empty ones.
 *
 * @param {string} str - raw address string
 * @returns {{street: string, city: string, state: string, zip: string}}
 */
export function splitFullAddress(str) {
  const empty = { street: '', city: '', state: '', zip: '' };
  if (!str || typeof str !== 'string') return empty;

  const trimmed = str.trim();
  if (!trimmed) return empty;

  const parts = trimmed.split(',').map(p => p.trim()).filter(Boolean);

  const street = parts[0] || '';
  let city = '';
  let state = '';
  let zip = '';

  if (parts.length >= 2) {
    // Last part usually contains "STATE ZIP" — possibly "City STATE ZIP" if no
    // comma between city and state.
    const lastPart = parts[parts.length - 1];
    const stateZipMatch = lastPart.match(/([A-Za-z]{2})\s+(\d{5}(?:-\d{4})?)/);
    if (stateZipMatch) {
      state = stateZipMatch[1].toUpperCase();
      zip = stateZipMatch[2];
      // Anything before the state+zip inside the last part is the city (only
      // happens when city/state weren't comma-separated in the source).
      const beforeStateZip = lastPart.slice(0, stateZipMatch.index).trim();
      if (beforeStateZip && parts.length === 2) {
        city = beforeStateZip;
      } else if (parts.length >= 3) {
        city = parts[parts.length - 2];
      }
    } else {
      // No state+zip pattern in last part — assume parts[1] is city.
      city = parts[1];
    }
  }

  return { street, city, state, zip };
}

/**
 * Format address in required 2-line ALL CAPS format
 * @param {Object} address - Address entity
 * @returns {Object} { line1, line2 }
 */
export function formatAddress(address) {
  if (!address) return { line1: '', line2: '' };
  
  const street = (address.normalized_address || address.legal_address || '').split(',')[0];
  const city = address.city || '';
  const state = address.state || '';
  const zip = address.zip || '';
  
  return {
    line1: street.toUpperCase(),
    line2: city && state ? `${city.toUpperCase()}, ${state.toUpperCase()} ${zip}` : ''
  };
}