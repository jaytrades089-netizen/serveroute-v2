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