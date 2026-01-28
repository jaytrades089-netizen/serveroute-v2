import React from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import Header from '../components/layout/Header';
import BottomNav from '../components/layout/BottomNav';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Loader2, LogOut, User, MapPin, Bell, Key } from 'lucide-react';
import { toast } from 'sonner';

export default function WorkerSettings() {
  const queryClient = useQueryClient();

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
      queryClient.invalidateQueries({ queryKey: ['userSettings'] });
      toast.success('Settings saved');
    }
  });

  const handleLogout = async () => {
    try {
      await base44.auth.logout();
    } catch (e) {
      // Ignore errors
    }
    // Force redirect to login
    base44.auth.redirectToLogin(window.location.origin);
  };

  if (userLoading || settingsLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 pb-20">
      <Header user={user} />
      
      <main className="px-4 py-6 max-w-lg mx-auto space-y-4">
        <h1 className="text-2xl font-bold text-gray-900">Settings</h1>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-lg flex items-center gap-2">
              <User className="w-5 h-5" /> Profile
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div>
              <Label className="text-gray-500 text-sm">Name</Label>
              <p className="font-medium">{user?.full_name}</p>
            </div>
            <div>
              <Label className="text-gray-500 text-sm">Email</Label>
              <p className="font-medium">{user?.email}</p>
            </div>
            <div>
              <Label className="text-gray-500 text-sm">Role</Label>
              <p className="font-medium capitalize">{user?.role}</p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-lg flex items-center gap-2">
              <MapPin className="w-5 h-5" /> Map Settings
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label>Default Map Provider</Label>
              <Select
                value={settings?.default_map_provider || 'mapquest'}
                onValueChange={(value) => updateSettingsMutation.mutate({ default_map_provider: value })}
              >
                <SelectTrigger>
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
              <Label>Default Starting Location</Label>
              <Input
                placeholder="Enter address"
                value={settings?.default_starting_location || ''}
                onChange={(e) => updateSettingsMutation.mutate({ default_starting_location: e.target.value })}
              />
            </div>

            <div>
              <Label>Default Ending Location</Label>
              <Input
                placeholder="Enter address"
                value={settings?.default_ending_location || ''}
                onChange={(e) => updateSettingsMutation.mutate({ default_ending_location: e.target.value })}
              />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-lg flex items-center gap-2">
              <Key className="w-5 h-5" /> API Keys
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label>MapQuest API Key</Label>
              <Input
                type="password"
                placeholder="Enter your MapQuest API key"
                value={settings?.mapquest_api_key || ''}
                onChange={(e) => updateSettingsMutation.mutate({ 
                  mapquest_api_key: e.target.value,
                  mapquest_key_validated: false
                })}
              />
              {settings?.mapquest_key_validated && (
                <p className="text-xs text-green-600 mt-1">✓ Key validated</p>
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-lg flex items-center gap-2">
              <Bell className="w-5 h-5" /> Preferences
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <Label>Left-handed Mode</Label>
              <Switch
                checked={settings?.left_handed_mode || false}
                onCheckedChange={(checked) => updateSettingsMutation.mutate({ left_handed_mode: checked })}
              />
            </div>
            <div className="flex items-center justify-between">
              <Label>Dark Mode</Label>
              <Switch
                checked={settings?.dark_mode || false}
                onCheckedChange={(checked) => updateSettingsMutation.mutate({ dark_mode: checked })}
              />
            </div>
          </CardContent>
        </Card>

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
    </div>
  );
}