import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';

/**
 * Shared hook for fetching the current authenticated user.
 * Uses a long staleTime since user data changes rarely.
 */
export function useCurrentUser() {
  return useQuery({
    queryKey: ['currentUser'],
    queryFn: () => base44.auth.me(),
    staleTime: 10 * 60 * 1000,
    retry: 1,
  });
}