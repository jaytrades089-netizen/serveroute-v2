import React from 'react';

/**
 * Formats address into standard two-line ALL CAPS format:
 * Line 1: 28175 HAGGERTY ROAD
 * Line 2: NOVI, MI 48377
 */
export function formatAddress(address) {
  if (!address) return { line1: '', line2: '' };
  
  // Handle string input
  if (typeof address === 'string') {
    const parts = address.split(',').map(p => p.trim());
    if (parts.length >= 3) {
      return {
        line1: parts[0].toUpperCase(),
        line2: parts.slice(1).join(', ').toUpperCase()
      };
    }
    return { line1: address.toUpperCase(), line2: '' };
  }
  
  // Handle object input
  const street = (address.street || address.normalized_address || address.legal_address || '').toUpperCase().trim();
  const city = (address.city || '').toUpperCase().trim();
  const state = (address.state || '').toUpperCase().trim();
  const zip = (address.zip || '').trim();

  return {
    line1: street,
    line2: city && state ? `${city}, ${state} ${zip}`.trim() : zip
  };
}

/**
 * Formats address as single string
 */
export function formatAddressSingleLine(address) {
  const { line1, line2 } = formatAddress(address);
  if (!line1 && !line2) return '';
  if (!line2) return line1;
  return `${line1}, ${line2}`;
}

/**
 * Standard address display component
 */
export default function AddressDisplay({ 
  address, 
  className = '',
  size = 'md',
  showDefendant = false
}) {
  const { line1, line2 } = formatAddress(address);
  
  const sizes = {
    sm: { line1: 'text-sm font-medium', line2: 'text-xs' },
    md: { line1: 'text-base font-semibold', line2: 'text-sm' },
    lg: { line1: 'text-lg font-bold', line2: 'text-base' }
  };

  const sizeClasses = sizes[size] || sizes.md;

  return (
    <div className={className}>
      {showDefendant && address?.defendant_name && (
        <div className="text-sm text-gray-600 mb-0.5">
          {address.defendant_name}
        </div>
      )}
      <div className={`text-gray-900 ${sizeClasses.line1}`}>{line1 || 'ADDRESS NOT AVAILABLE'}</div>
      {line2 && <div className={`text-gray-600 ${sizeClasses.line2}`}>{line2}</div>}
    </div>
  );
}

/**
 * Compact inline address display
 */
export function AddressInline({ address, className = '' }) {
  const { line1, line2 } = formatAddress(address);
  return (
    <span className={`text-gray-900 ${className}`}>
      {line1}{line2 ? `, ${line2}` : ''}
    </span>
  );
}