/**
 * localStorage persistence for React Query.
 * Saves query cache to device storage so data loads instantly on app open.
 * Background sync keeps data fresh from the cloud.
 */

const CACHE_KEY = 'sr_query_cache';
const CACHE_VERSION = 1;
const MAX_AGE_MS = 24 * 60 * 60 * 1000; // 24 hours max age

// Keys we persist to device (routes, addresses, attempts, user, settings)
const PERSIST_PREFIXES = [
  'workerRoutes',
  'workerAddresses',
  'workerAttempts',
  'currentUser',
  'userSettings',
  'notifications',
  'routeAddresses',
  'routeAttempts',
  'workerScheduledServes',
  'route',
];

function shouldPersist(queryKey) {
  const keyStr = Array.isArray(queryKey) ? queryKey[0] : queryKey;
  return PERSIST_PREFIXES.some(prefix => keyStr === prefix || keyStr?.startsWith?.(prefix));
}

/**
 * Save current query cache to localStorage
 */
export function saveToDevice(queryClient) {
  try {
    const cache = queryClient.getQueryCache();
    const queries = cache.getAll();
    const persistable = {};

    for (const query of queries) {
      if (!shouldPersist(query.queryKey)) continue;
      if (query.state.status !== 'success') continue;
      if (!query.state.data) continue;

      const key = JSON.stringify(query.queryKey);
      persistable[key] = {
        data: query.state.data,
        dataUpdatedAt: query.state.dataUpdatedAt,
        queryKey: query.queryKey,
      };
    }

    const payload = {
      version: CACHE_VERSION,
      timestamp: Date.now(),
      queries: persistable,
    };

    localStorage.setItem(CACHE_KEY, JSON.stringify(payload));
  } catch (e) {
    // localStorage full or blocked — silently fail
    console.warn('Cache save failed:', e.message);
  }
}

/**
 * Restore query cache from localStorage into React Query
 */
export function restoreFromDevice(queryClient) {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return false;

    const payload = JSON.parse(raw);

    // Version mismatch or too old — discard
    if (payload.version !== CACHE_VERSION) {
      localStorage.removeItem(CACHE_KEY);
      return false;
    }

    if (Date.now() - payload.timestamp > MAX_AGE_MS) {
      localStorage.removeItem(CACHE_KEY);
      return false;
    }

    let restored = 0;
    for (const [, entry] of Object.entries(payload.queries)) {
      if (!entry.data || !entry.queryKey) continue;

      queryClient.setQueryData(entry.queryKey, entry.data, {
        updatedAt: entry.dataUpdatedAt,
      });
      restored++;
    }

    console.log(`Restored ${restored} queries from device cache`);
    return restored > 0;
  } catch (e) {
    console.warn('Cache restore failed:', e.message);
    localStorage.removeItem(CACHE_KEY);
    return false;
  }
}

/**
 * Set up auto-save: saves to device whenever queries succeed.
 * Call once at app init.
 */
export function setupPersistence(queryClient) {
  // Restore on init
  restoreFromDevice(queryClient);

  // Save after every successful query fetch
  const cache = queryClient.getQueryCache();
  const unsubscribe = cache.subscribe((event) => {
    if (event?.type === 'updated' && event?.action?.type === 'success') {
      if (shouldPersist(event.query.queryKey)) {
        // Debounce saves — batch multiple rapid updates
        clearTimeout(window._cacheDebounce);
        window._cacheDebounce = setTimeout(() => saveToDevice(queryClient), 1000);
      }
    }
  });

  // Also save on page hide (user leaves / closes app)
  const handleVisibilityChange = () => {
    if (document.hidden) {
      saveToDevice(queryClient);
    }
  };
  document.addEventListener('visibilitychange', handleVisibilityChange);

  // Save before unload
  const handleBeforeUnload = () => saveToDevice(queryClient);
  window.addEventListener('beforeunload', handleBeforeUnload);

  return () => {
    unsubscribe();
    document.removeEventListener('visibilitychange', handleVisibilityChange);
    window.removeEventListener('beforeunload', handleBeforeUnload);
  };
}