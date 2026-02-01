import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from '@/components/ui/button';
import { MapPin, Check, X, Shield } from 'lucide-react';
import { toast } from 'sonner';

export default function LocationPermissionDialog({ open, onOpenChange, user }) {
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState(null);

  const handleEnable = async () => {
    setLoading(true);
    
    if (!navigator.geolocation) {
      toast.error('Location not supported on this device');
      setStatus('denied');
      setLoading(false);
      return;
    }

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
          setStatus('success');
          toast.success('Location enabled!');
          setTimeout(() => onOpenChange(false), 1500);
        } catch (error) {
          toast.error('Failed to save location');
          setStatus('denied');
        } finally {
          setLoading(false);
        }
      },
      (error) => {
        console.error('Location error:', error);
        setStatus('denied');
        setLoading(false);
        if (error.code === 1) {
          toast.error('Location permission denied');
        } else {
          toast.error('Could not get location');
        }
      },
      { enableHighAccuracy: false, timeout: 10000 }
    );
  };

  const handleSkip = async () => {
    await base44.auth.updateMe({ location_permission: false });
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <MapPin className="w-5 h-5 text-blue-600" />
            Enable Location Sharing
          </DialogTitle>
          <DialogDescription>
            Help your team track progress in real-time
          </DialogDescription>
        </DialogHeader>

        <div className="py-6">
          {status === 'success' ? (
            <div className="text-center">
              <div className="w-16 h-16 rounded-full bg-green-100 flex items-center justify-center mx-auto mb-4">
                <Check className="w-8 h-8 text-green-600" />
              </div>
              <p className="text-lg font-medium text-green-600">Location Enabled</p>
              <p className="text-sm text-gray-500 mt-1">
                Your location will be shared while you're working
              </p>
            </div>
          ) : status === 'denied' ? (
            <div className="text-center">
              <div className="w-16 h-16 rounded-full bg-red-100 flex items-center justify-center mx-auto mb-4">
                <X className="w-8 h-8 text-red-600" />
              </div>
              <p className="text-lg font-medium text-red-600">Permission Denied</p>
              <p className="text-sm text-gray-500 mt-1">
                You can enable location later in your browser settings
              </p>
              <Button 
                variant="outline" 
                className="mt-4" 
                onClick={() => onOpenChange(false)}
              >
                Close
              </Button>
            </div>
          ) : (
            <>
              <div className="flex justify-center mb-6">
                <div className="w-20 h-20 rounded-full bg-blue-100 flex items-center justify-center">
                  <MapPin className="w-10 h-10 text-blue-600" />
                </div>
              </div>

              <p className="text-center text-gray-600 mb-6">
                Location sharing helps your admin:
              </p>

              <ul className="space-y-3 mb-6">
                <li className="flex items-center gap-3 text-sm">
                  <Check className="w-4 h-4 text-green-600" />
                  See team progress on a map
                </li>
                <li className="flex items-center gap-3 text-sm">
                  <Check className="w-4 h-4 text-green-600" />
                  Assign nearby routes more efficiently
                </li>
                <li className="flex items-center gap-3 text-sm">
                  <Check className="w-4 h-4 text-green-600" />
                  Better coordinate with your team
                </li>
              </ul>

              <div className="bg-gray-50 rounded-lg p-3 mb-6">
                <div className="flex items-start gap-2">
                  <Shield className="w-4 h-4 text-gray-500 mt-0.5" />
                  <p className="text-xs text-gray-500">
                    Your location is only shared while you're actively working. 
                    It's cleared when you go offline.
                  </p>
                </div>
              </div>

              <div className="space-y-2">
                <Button 
                  className="w-full" 
                  onClick={handleEnable}
                  disabled={loading}
                >
                  {loading ? 'Getting location...' : 'Enable Location'}
                </Button>
                <Button 
                  variant="ghost" 
                  className="w-full" 
                  onClick={handleSkip}
                >
                  Not Now
                </Button>
              </div>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}