import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';

/**
 * Shared hook for fetching UserSettings for the current user.
 * Returns the first settings record found, or null if none exists.
 */
export function useUserSettings(userId) {
  return useQuery({
    queryKey: ['userSettings', userId],
    queryFn: async () => {
      if (!userId) return null;
      const settings = await base44.entities.UserSettings.filter({ user_id: userId });
      return settings[0] || null;
    },
    enabled: !!userId,
    staleTime: 4 * 60 * 60 * 1000,
    gcTime: 24 * 60 * 60 * 1000,
  });
}