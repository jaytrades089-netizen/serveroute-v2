/**
 * localStorage persistence for React Query.
 * Saves query cache to device storage so data loads instantly on app open.
 *
 * OFFLINE-FIRST MODEL: With staleTime: Infinity in query-client.js, restored
 * cache is treated as fresh and served instantly. Refetches only happen when
 * a write invalidates a query key — never automatically on app open or focus.
 */

const CACHE_KEY = 'sr_query_cache';
const CACHE_VERSION = 1;
const MAX_AGE_MS = 24 * 60 * 60 * 1000; // 24 hours max age

// Keys we persist to device. Every query key prefix that the worker app
// reads during normal use must be listed here, or it will refetch from cloud
// on every app open instead of loading instantly from local storage.
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
  // Combo route reads
  'activeComboRoutes',
  'comboRoute',
  'comboRoutes',
  'comboAddresses',
  'comboDetailAddresses',
  'comboDetailAttempts',
  'comboDetailRoutes',
  // Scheduled serves
  'scheduledServes',
  'scheduledServesCount',
  'scheduledServeAddresses',
  // Saved locations + worker home screen reads
  'savedLocations',
  'workerAttemptsHome',
  'allWorkerAddressesHome',
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
 * Restore query cache from localStorage into React Query.
 *
 * Restored entries keep their original dataUpdatedAt. Combined with
 * staleTime: Infinity, this means cached data is treated as fresh —
 * no automatic refetches on app open. Writes invalidate keys explicitly
 * when the cloud needs to be re-read.
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
