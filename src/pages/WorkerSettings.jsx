import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import Header from '../components/layout/Header';
import BottomNav from '../components/layout/BottomNav';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2, LogOut, User, MapPin, Key, Navigation } from 'lucide-react';
import { toast } from 'sonner';
import LocationPermissionDialog from '../components/notifications/LocationPermissionDialog';

export default function WorkerSettings() {
  const queryClient = useQueryClient();
  const [showLocationDialog, setShowLocationDialog] = useState(false);

  const { data: user, isLoading: userLoading } = useQuery({
    queryKey: ['currentUser'],
    queryFn: () => base44.auth.me()
  });

  const { data: settings, isLoading: settingsLoading } = useQuery({
    queryKey: ['userSettings', user?.id],
    queryFn: async () => {
      if (!user?.id) return null;
      const allSettings = await base44.entities.UserSettings.filter({ user_id: user.id });
      return allSettings[0] || null;
    },
    enabled: !!user?.id
  });

  const updateSettingsMutation = useMutation({
    mutationFn: async (data) => {
      if (settings?.id) {
        return base44.entities.UserSettings.update(settings.id, data);
      } else {
        return base44.entities.UserSettings.create({ user_id: user.id, ...data });
      }
    },
    onSuccess: () => {
      queryClient.refetchQueries({ queryKey: ['userSettings'] });
      toast.success('Settings saved');
    },
    onError: (error) => {
      toast.error(error.message || 'Something went wrong');
    }
  });

  const handleLogout = () => {
    base44.auth.logout('/');
  };

  if (userLoading || settingsLoading) {
    return (
      <div style={{ minHeight: '100vh', background: 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Loader2 className="w-8 h-8 animate-spin" style={{ color: '#e9c349' }} />
      </div>
    );
  }

  return (
    <div style={{ minHeight: '100vh', background: 'transparent', paddingBottom: 80 }}>
      <Header user={user} />
      
      <main className="px-4 py-6 max-w-lg mx-auto space-y-4">
        <h1 className="text-2xl font-bold" style={{ color: '#e6e1e4' }}>Settings</h1>

        {/* Profile */}
        <div style={{ background: 'rgba(14,20,44,0.55)', backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)', border: '1px solid rgba(255,255,255,0.10)', borderRadius: 12 }} className="p-4">
          <h3 className="text-lg font-semibold flex items-center gap-2 mb-3" style={{ color: '#e6e1e4' }}>
            <User className="w-5 h-5" /> Profile
          </h3>
          <div className="space-y-3">
            <div>
              <Label className="text-xs" style={{ color: '#8a7f87' }}>Name</Label>
              <p className="font-medium" style={{ color: '#e6e1e4' }}>{user?.full_name}</p>
            </div>
            <div>
              <Label className="text-xs" style={{ color: '#8a7f87' }}>Email</Label>
              <p className="font-medium" style={{ color: '#e6e1e4' }}>{user?.email}</p>
            </div>
            <div>
              <Label className="text-xs" style={{ color: '#8a7f87' }}>Role</Label>
              <p className="font-medium capitalize" style={{ color: '#e6e1e4' }}>{user?.role}</p>
            </div>
          </div>
        </div>

        {/* Map Settings */}
        <div style={{ background: 'rgba(14,20,44,0.55)', backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)', border: '1px solid rgba(255,255,255,0.10)', borderRadius: 12 }} className="p-4">
          <h3 className="text-lg font-semibold flex items-center gap-2 mb-3" style={{ color: '#e6e1e4' }}><MapPin className="w-5 h-5" /> Map Settings</h3>
          <div className="space-y-4">
            <div>
              <Label style={{ color: '#e6e1e4' }}>Default Map Provider</Label>
              <Select
                value={settings?.default_map_provider || 'mapquest'}
                onValueChange={(value) => updateSettingsMutation.mutate({ default_map_provider: value })}
              >
                <SelectTrigger style={{ background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.12)', color: '#e6e1e4' }}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="mapquest">MapQuest</SelectItem>
                  <SelectItem value="google">Google Maps</SelectItem>
                  <SelectItem value="apple">Apple Maps</SelectItem>
                  <SelectItem value="waze">Waze</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label style={{ color: '#e6e1e4' }}>Default Starting Location</Label>
              <Input placeholder="Enter address" value={settings?.default_starting_location || ''} onChange={(e) => updateSettingsMutation.mutate({ default_starting_location: e.target.value })} style={{ background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.12)', color: '#e6e1e4' }} />
            </div>
            <div>
              <Label style={{ color: '#e6e1e4' }}>Default Ending Location</Label>
              <Input placeholder="Enter address" value={settings?.default_ending_location || ''} onChange={(e) => updateSettingsMutation.mutate({ default_ending_location: e.target.value })} style={{ background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.12)', color: '#e6e1e4' }} />
            </div>
            <div className="flex items-center justify-between pt-2" style={{ borderTop: '1px solid rgba(255,255,255,0.08)' }}>
              <div>
                <Label style={{ color: '#e6e1e4' }}>Show Area Labels on Route</Label>
                <p className="text-xs" style={{ color: '#8a7f87' }}>Groups stops by area when viewing an optimized route</p>
              </div>
              <Switch checked={settings?.show_zone_labels !== false} onCheckedChange={(checked) => updateSettingsMutation.mutate({ show_zone_labels: checked })} />
            </div>
          </div>
        </div>

        {/* Preferences — includes Location Sharing */}
        <div style={{ background: 'rgba(14,20,44,0.55)', backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)', border: '1px solid rgba(255,255,255,0.10)', borderRadius: 12 }} className="p-4">
          <h3 className="text-lg font-semibold flex items-center gap-2 mb-3" style={{ color: '#e6e1e4' }}><Navigation className="w-5 h-5" /> Preferences</h3>
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <Label style={{ color: '#e6e1e4' }}>Left-handed Mode</Label>
              <Switch checked={settings?.left_handed_mode || false} onCheckedChange={(checked) => updateSettingsMutation.mutate({ left_handed_mode: checked })} />
            </div>
            <div className="flex items-center justify-between" style={{ borderTop: '1px solid rgba(255,255,255,0.08)', paddingTop: 16 }}>
              <Label style={{ color: '#e6e1e4' }}>Dark Mode</Label>
              <Switch checked={settings?.dark_mode || false} onCheckedChange={(checked) => updateSettingsMutation.mutate({ dark_mode: checked })} />
            </div>
            <div className="flex items-center justify-between" style={{ borderTop: '1px solid rgba(255,255,255,0.08)', paddingTop: 16 }}>
              <div>
                <Label style={{ color: '#e6e1e4' }}>Location Sharing</Label>
                <p className="text-xs" style={{ color: '#8a7f87' }}>Share location while working</p>
              </div>
              {user?.location_permission ? (
                <span className="text-xs font-medium" style={{ color: '#22c55e' }}>✓ Enabled</span>
              ) : (
                <Button variant="outline" size="sm" onClick={() => setShowLocationDialog(true)}>Enable</Button>
              )}
            </div>
          </div>
        </div>

        <Button 
          variant="destructive" 
          className="w-full"
          onClick={handleLogout}
        >
          <LogOut className="w-4 h-4 mr-2" />
          Sign Out
        </Button>
      </main>

      <BottomNav currentPage="WorkerSettings" />

      <LocationPermissionDialog 
        open={showLocationDialog} 
        onOpenChange={setShowLocationDialog}
        user={user}
      />
    </div>
  );
}
