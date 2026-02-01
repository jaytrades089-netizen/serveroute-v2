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
import { Bell, Check, X } from 'lucide-react';
import { toast } from 'sonner';

export default function PushPermissionDialog({ open, onOpenChange, user }) {
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState(null); // 'success' | 'denied' | null

  const handleEnable = async () => {
    setLoading(true);
    try {
      // Check if OneSignal is loaded
      if (typeof window.OneSignal === 'undefined') {
        toast.error('Push notifications not available');
        setStatus('denied');
        return;
      }

      // Show native permission prompt
      await window.OneSignal.showNativePrompt();
      
      // Wait for subscription
      const isSubscribed = await window.OneSignal.isPushNotificationsEnabled();
      
      if (isSubscribed) {
        // Get OneSignal user ID
        const userId = await window.OneSignal.getUserId();
        
        // Save to user record
        await base44.auth.updateMe({
          push_token: userId,
          push_enabled: true
        });

        setStatus('success');
        toast.success('Push notifications enabled!');
        setTimeout(() => onOpenChange(false), 1500);
      } else {
        setStatus('denied');
      }
    } catch (error) {
      console.error('Push permission error:', error);
      setStatus('denied');
    } finally {
      setLoading(false);
    }
  };

  const handleSkip = async () => {
    await base44.auth.updateMe({ push_enabled: false });
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Bell className="w-5 h-5 text-blue-600" />
            Enable Push Notifications
          </DialogTitle>
          <DialogDescription>
            Stay updated even when the app is closed
          </DialogDescription>
        </DialogHeader>

        <div className="py-6">
          {status === 'success' ? (
            <div className="text-center">
              <div className="w-16 h-16 rounded-full bg-green-100 flex items-center justify-center mx-auto mb-4">
                <Check className="w-8 h-8 text-green-600" />
              </div>
              <p className="text-lg font-medium text-green-600">All set!</p>
              <p className="text-sm text-gray-500 mt-1">
                You'll receive notifications for important updates
              </p>
            </div>
          ) : status === 'denied' ? (
            <div className="text-center">
              <div className="w-16 h-16 rounded-full bg-red-100 flex items-center justify-center mx-auto mb-4">
                <X className="w-8 h-8 text-red-600" />
              </div>
              <p className="text-lg font-medium text-red-600">Permission Denied</p>
              <p className="text-sm text-gray-500 mt-1">
                You can enable notifications later in your browser settings
              </p>
            </div>
          ) : (
            <>
              <div className="flex justify-center mb-6">
                <div className="w-20 h-20 rounded-full bg-blue-100 flex items-center justify-center">
                  <Bell className="w-10 h-10 text-blue-600" />
                </div>
              </div>

              <p className="text-center text-gray-600 mb-6">
                Get notified when:
              </p>

              <ul className="space-y-3 mb-6">
                <li className="flex items-center gap-3 text-sm">
                  <Check className="w-4 h-4 text-green-600" />
                  New routes are assigned to you
                </li>
                <li className="flex items-center gap-3 text-sm">
                  <Check className="w-4 h-4 text-green-600" />
                  Routes are completed
                </li>
                <li className="flex items-center gap-3 text-sm">
                  <Check className="w-4 h-4 text-green-600" />
                  You receive a message
                </li>
                <li className="flex items-center gap-3 text-sm">
                  <Check className="w-4 h-4 text-green-600" />
                  Vacation requests are approved
                </li>
              </ul>

              <div className="space-y-2">
                <Button 
                  className="w-full" 
                  onClick={handleEnable}
                  disabled={loading}
                >
                  {loading ? 'Setting up...' : 'Enable Notifications'}
                </Button>
                <Button 
                  variant="ghost" 
                  className="w-full" 
                  onClick={handleSkip}
                >
                  Maybe Later
                </Button>
              </div>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}