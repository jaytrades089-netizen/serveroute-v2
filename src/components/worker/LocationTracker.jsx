import React, { useEffect, useRef, useCallback } from 'react';
import { base44 } from '@/api/base44Client';

const LOCATION_UPDATE_INTERVAL = 2 * 60 * 1000; // 2 minutes

export default function LocationTracker({ user, enabled = false }) {
  const intervalRef = useRef(null);

  const updateLocation = useCallback(async () => {
    if (!navigator.geolocation || !user?.id) return;

    navigator.geolocation.getCurrentPosition(
      async (position) => {
        try {
          await base44.auth.updateMe({
            current_location: {
              latitude: position.coords.latitude,
              longitude: position.coords.longitude,
              accuracy: position.coords.accuracy,
              updated_at: new Date().toISOString()
            },
            location_permission: true
          });
        } catch (error) {
          console.error('Failed to update location:', error);
        }
      },
      (error) => {
        console.error('Location error:', error);
      },
      {
        enableHighAccuracy: false,
        timeout: 10000,
        maximumAge: 60000
      }
    );
  }, [user?.id]);

  const clearLocation = useCallback(async () => {
    if (!user?.id) return;
    try {
      await base44.auth.updateMe({
        current_location: null
      });
    } catch (error) {
      console.error('Failed to clear location:', error);
    }
  }, [user?.id]);

  useEffect(() => {
    if (!enabled || !user?.location_permission) {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      return;
    }

    // Initial update
    updateLocation();

    // Start interval
    intervalRef.current = setInterval(updateLocation, LOCATION_UPDATE_INTERVAL);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
      clearLocation();
    };
  }, [enabled, user?.location_permission, updateLocation, clearLocation]);

  return null; // This is a utility component with no UI
}

// Hook for requesting location permission
export function useLocationPermission() {
  const requestPermission = useCallback(async () => {
    if (!navigator.geolocation) {
      return { success: false, reason: 'not_supported' };
    }

    return new Promise((resolve) => {
      navigator.geolocation.getCurrentPosition(
        async (position) => {
          try {
            await base44.auth.updateMe({
              location_permission: true,
              current_location: {
                latitude: position.coords.latitude,
                longitude: position.coords.longitude,
                accuracy: position.coords.accuracy,
                updated_at: new Date().toISOString()
              }
            });
            resolve({ success: true });
          } catch (error) {
            resolve({ success: false, reason: 'save_failed' });
          }
        },
        (error) => {
          resolve({
            success: false,
            reason: error.code === 1 ? 'denied' : 'error',
            message: error.message
          });
        },
        { enableHighAccuracy: false }
      );
    });
  }, []);

  return { requestPermission };
}