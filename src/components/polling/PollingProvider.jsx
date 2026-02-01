import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';

const POLLING_CONFIG = {
  dashboard_active: 5000,      // 5 seconds
  dashboard_background: 30000, // 30 seconds
  worker_active: 10000,        // 10 seconds
  minimal: 60000               // 60 seconds
};

const PollingContext = createContext(null);

export function usePolling() {
  return useContext(PollingContext);
}

export default function PollingProvider({ children }) {
  const [isActive, setIsActive] = useState(true);
  const [isPaused, setIsPaused] = useState(false);
  const [lastUpdate, setLastUpdate] = useState(null);
  const intervalRef = useRef(null);
  const callbacksRef = useRef({});

  // Handle visibility change
  useEffect(() => {
    const handleVisibilityChange = () => {
      setIsActive(!document.hidden);
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, []);

  // Register a polling callback
  const register = useCallback((key, callback) => {
    callbacksRef.current[key] = callback;
  }, []);

  // Unregister a polling callback
  const unregister = useCallback((key) => {
    delete callbacksRef.current[key];
  }, []);

  // Execute all callbacks
  const executeCallbacks = useCallback(async () => {
    const callbacks = Object.values(callbacksRef.current);
    await Promise.all(callbacks.map(cb => cb?.()));
    setLastUpdate(new Date());
  }, []);

  // Manual refresh
  const refresh = useCallback(async () => {
    await executeCallbacks();
  }, [executeCallbacks]);

  // Toggle pause
  const togglePause = useCallback(() => {
    setIsPaused(prev => !prev);
  }, []);

  // Setup polling interval
  useEffect(() => {
    if (isPaused) {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      return;
    }

    const interval = isActive 
      ? POLLING_CONFIG.dashboard_active 
      : POLLING_CONFIG.dashboard_background;

    // Initial fetch
    executeCallbacks();

    // Start interval
    intervalRef.current = setInterval(executeCallbacks, interval);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [isActive, isPaused, executeCallbacks]);

  return (
    <PollingContext.Provider value={{
      isActive,
      isPaused,
      lastUpdate,
      refresh,
      togglePause,
      register,
      unregister,
      config: POLLING_CONFIG
    }}>
      {children}
    </PollingContext.Provider>
  );
}