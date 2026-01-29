import React from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Loader2, LogOut, User, Key, Building } from 'lucide-react';
import { toast } from 'sonner';
import BossBottomNav from '../components/boss/BossBottomNav';

export default function BossSettings() {
  const queryClient = useQueryClient();

  const { data: user, isLoading: userLoading } = useQuery({
    queryKey: ['currentUser'],
    queryFn: () => base44.auth.me()
  });

  const { data: bossSettings, isLoading: settingsLoading } = useQuery({
    queryKey: ['bossSettings', user?.id],
    queryFn: async () => {
      if (!user?.id) return null;
      const allSettings = await base44.entities.BossSettings.filter({ boss_id: user.id });
      return allSettings[0] || null;
    },
    enabled: !!user?.id
  });

  const { data: userSettings } = useQuery({
    queryKey: ['userSettings', user?.id],
    queryFn: async () => {
      if (!user?.id) return null;
      const allSettings = await base44.entities.UserSettings.filter({ user_id: user.id });
      return allSettings[0] || null;
    },
    enabled: !!user?.id
  });

  const updateUserSettingsMutation = useMutation({
    mutationFn: async (data) => {
      if (userSettings?.id) {
        return base44.entities.UserSettings.update(userSettings.id, data);
      } else {
        return base44.entities.UserSettings.create({ user_id: user.id, ...data });
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['userSettings'] });
      toast.success('Settings saved');
    }
  });

  const handleLogout = () => {
    base44.auth.logout('/');
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
      <header className="bg-white border-b px-4 py-3">
        <h1 className="font-semibold text-lg">Settings</h1>
      </header>
      
      <main className="px-4 py-6 max-w-lg mx-auto space-y-4">
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
              <Key className="w-5 h-5" /> API Keys
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label>MapQuest API Key</Label>
              <Input
                type="password"
                placeholder="Enter your MapQuest API key"
                value={userSettings?.mapquest_api_key || ''}
                onChange={(e) => updateUserSettingsMutation.mutate({ 
                  mapquest_api_key: e.target.value,
                  mapquest_key_validated: false
                })}
              />
              <p className="text-xs text-gray-500 mt-1">
                Required for route optimization. Get one at developer.mapquest.com
              </p>
              {userSettings?.mapquest_key_validated && (
                <p className="text-xs text-green-600 mt-1">✓ Key validated</p>
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-lg flex items-center gap-2">
              <Building className="w-5 h-5" /> Company
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-gray-500">
              Company ID: {user?.company_id || 'Not set'}
            </p>
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

      <BossBottomNav currentPage="BossSettings" />
    </div>
  );
}