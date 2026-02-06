/**
 * Safely extracts company_id from user object with fallback
 * Handles both direct user.company_id and user.data?.company_id patterns
 */
export function getCompanyId(user, fallback = 'default') {
  if (!user) return fallback;
  return user.company_id || user.data?.company_id || fallback;
}