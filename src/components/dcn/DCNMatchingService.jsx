// DCN Matching Service - Phase 5B
// Reuses Phase 3's normalized_key algorithm for address matching

import { generateNormalizedKey } from '@/components/utils/addressUtils';

export { generateNormalizedKey };

export const CONFIDENCE_THRESHOLDS = {
  auto_match: 0.95,     // Auto-link without review
  pending_review: 0.75, // Show for boss confirmation
  no_match: 0.75        // Below this = unmatched
};

// Simple string similarity (Levenshtein-based)
export function calculateStringSimilarity(str1, str2) {
  if (!str1 || !str2) return 0;
  
  const len1 = str1.length;
  const len2 = str2.length;

  if (str1 === str2) return 1.0;
  if (len1 === 0 || len2 === 0) return 0.0;

  const matrix = [];

  for (let i = 0; i <= len1; i++) {
    matrix[i] = [i];
  }

  for (let j = 0; j <= len2; j++) {
    matrix[0][j] = j;
  }

  for (let i = 1; i <= len1; i++) {
    for (let j = 1; j <= len2; j++) {
      const cost = str1[i - 1] === str2[j - 1] ? 0 : 1;
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,
        matrix[i][j - 1] + 1,
        matrix[i - 1][j - 1] + cost
      );
    }
  }

  const distance = matrix[len1][len2];
  const maxLen = Math.max(len1, len2);

  return 1 - (distance / maxLen);
}

// Find best address match for a DCN
export function findAddressMatch(addresses, rawAddress, rawCity = '') {
  const uploadedKey = generateNormalizedKey({
    street: rawAddress,
    city: rawCity,
    state: 'MI',
    zip: ''
  });

  let bestMatch = null;
  let bestScore = 0;

  for (const addr of addresses) {
    // Skip addresses that already have a DCN linked
    if (addr.has_dcn) continue;
    
    // Method 1: Exact normalized_key match
    if (addr.normalized_key === uploadedKey) {
      return {
        address_id: addr.id,
        confidence: 1.0,
        match_type: 'exact'
      };
    }

    // Method 2: Street portion match
    const addrStreet = (addr.normalized_key || '').split('-')[0];
    const uploadStreet = uploadedKey.split('-')[0];

    if (addrStreet === uploadStreet && addrStreet.length > 5) {
      const score = 0.92;
      if (score > bestScore) {
        bestScore = score;
        bestMatch = {
          address_id: addr.id,
          confidence: score,
          match_type: 'street_exact'
        };
      }
      continue;
    }

    // Method 3: Fuzzy match
    const similarity = calculateStringSimilarity(addrStreet, uploadStreet);

    if (similarity > bestScore && similarity > 0.6) {
      bestScore = similarity;
      bestMatch = {
        address_id: addr.id,
        confidence: similarity,
        match_type: 'fuzzy'
      };
    }
  }

  return bestMatch;
}

// Column name mapping for flexible CSV headers
export const COLUMN_MAPPINGS = {
  dcn: ['dcn', 'document_control_number', 'doc_number', 'control_number', 'documentcontrolnumber'],
  address: ['address', 'street', 'street_address', 'service_address', 'streetaddress'],
  city: ['city', 'town'],
  defendant_first_name: ['defendant_first_name', 'first_name', 'defendant_first', 'firstname', 'defendantfirst'],
  defendant_last_name: ['defendant_last_name', 'last_name', 'defendant_last', 'lastname', 'defendantlast'],
  court_name: ['court_name', 'court', 'courtname'],
  case_number: ['case_number', 'case_no', 'case', 'casenumber']
};

export function mapColumnName(header) {
  const normalized = header.toLowerCase().replace(/[^a-z0-9]/g, '');

  for (const [field, aliases] of Object.entries(COLUMN_MAPPINGS)) {
    if (aliases.some(alias => alias.replace(/[^a-z0-9]/g, '') === normalized)) {
      return field;
    }
  }

  return null;
}

// Parse CSV text - handles quoted newlines
export function parseCSV(text) {
  // Split into lines respecting quoted newlines
  const lines = [];
  let current = '';
  let inQuotes = false;
  
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    
    if (char === '"') {
      inQuotes = !inQuotes;
      current += char;
    } else if ((char === '\n' || char === '\r') && !inQuotes) {
      if (current.trim()) {
        lines.push(current);
      }
      current = '';
      // Skip \r\n combo
      if (char === '\r' && text[i + 1] === '\n') i++;
    } else {
      current += char;
    }
  }
  if (current.trim()) {
    lines.push(current);
  }
  
  if (lines.length < 2) return [];

  const headers = parseCSVLine(lines[0]).map(h => h.trim().replace(/^"|"$/g, ''));
  const mappedHeaders = headers.map(h => mapColumnName(h) || h);

  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    const values = parseCSVLine(lines[i]);
    const row = {};
    mappedHeaders.forEach((header, idx) => {
      row[header] = values[idx]?.trim() || '';
    });
    rows.push(row);
  }

  return rows;
}

// Handle quoted CSV fields with escaped quotes
function parseCSVLine(line) {
  const result = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    
    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        // Escaped quote ""
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === ',' && !inQuotes) {
      result.push(current);
      current = '';
    } else {
      current += char;
    }
  }
  result.push(current);

  return result;
}