import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';

/**
 * Shared hook for fetching the current authenticated user.
 * Uses a long staleTime since user data changes rarely.
 */
export function useCurrentUser() {
  return useQuery({
    queryKey: ['currentUser'],
    queryFn: async () => {
      try {
        return await base44.auth.me();
      } catch (err) {
        // On network failure, do not throw — return undefined so components
        // degrade gracefully rather than crashing or triggering error states.
        // Layout.jsx handles the definitive auth check and redirect logic.
        console.warn('useCurrentUser: auth.me() failed', err?.status);
        return undefined;
      }
    },
    staleTime: 4 * 60 * 60 * 1000,
    gcTime: 24 * 60 * 60 * 1000,
    retry: 1,
    retryDelay: 3000,
    refetchOnWindowFocus: false,
  });
}