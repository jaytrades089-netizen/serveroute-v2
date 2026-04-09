export function formatAddress(address) {
  const displayAddress = address.normalized_address || address.legal_address || 'Unknown Address';
  const addressParts = displayAddress.split(',');
  const line1 = addressParts[0]?.trim() || displayAddress;
  const line2 = addressParts.slice(1).join(',').trim();
  
  return { line1, line2 };
}