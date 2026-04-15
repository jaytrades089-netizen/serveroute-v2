import { QueryClient } from '@tanstack/react-query';

// OFFLINE-FIRST MODEL:
// staleTime: Infinity means queries never auto-refetch in the background.
// Data is served instantly from cache on every read. Cloud refetches only
// happen when a write explicitly invalidates the relevant query key.
// This is critical for field workers on phones with bad connectivity —
// the app should feel instant and never block on a network call.
export const queryClientInstance = new QueryClient({
	defaultOptions: {
		queries: {
			staleTime: Infinity,
			refetchOnWindowFocus: false,
			retry: 1,
		},
	},
});
