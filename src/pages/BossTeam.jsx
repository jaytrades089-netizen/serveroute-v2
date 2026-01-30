import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import { Loader2, FileText, Bell, User, Mail, MapPin, UserPlus } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { toast } from 'sonner';
import BossBottomNav from '../components/boss/BossBottomNav';

export default function BossTeam() {
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [isInviting, setIsInviting] = useState(false);

  const { data: user } = useQuery({
    queryKey: ['currentUser'],
    queryFn: () => base44.auth.me()
  });

  const companyId = user?.company_id || 'default';

  const { data: servers = [], isLoading, refetch: refetchServers } = useQuery({
    queryKey: ['companyServers', companyId],
    queryFn: async () => {
      const users = await base44.entities.User.list();
      // Include users with role 'server' or 'user' (default role from invite)
      return users.filter(u => u.company_id === companyId && (u.role === 'server' || u.role === 'user'));
    },
    enabled: !!user
  });

  const { data: availableServers = [], refetch: refetchAvailable } = useQuery({
    queryKey: ['availableServers'],
    queryFn: async () => {
      const users = await base44.entities.User.list();
      // Show users without a company who are servers OR regular users (not bosses/admins)
      return users.filter(u => !u.company_id && (u.role === 'server' || u.role === 'user' || !u.role));
    },
    enabled: !!user
  });

  const { data: routes = [] } = useQuery({
    queryKey: ['allRoutes', companyId],
    queryFn: async () => {
      return base44.entities.Route.filter({
        company_id: companyId,
        deleted_at: null
      });
    },
    enabled: !!user
  });

  const handleInviteServer = async () => {
    if (!inviteEmail || !inviteEmail.includes('@')) {
      toast.error('Please enter a valid email address');
      return;
    }

    setIsInviting(true);
    try {
      await base44.users.inviteUser(inviteEmail, 'user');
      toast.success(`Invitation sent to ${inviteEmail}`);
      setInviteEmail('');
      setShowInviteModal(false);
      refetchServers();
    } catch (error) {
      toast.error(error.message || 'Failed to send invitation');
    }
    setIsInviting(false);
  };

  const handleRequestToJoin = async (server) => {
    try {
      // Create a notification for the server asking them to join
      await base44.entities.Notification.create({
        user_id: server.id,
        company_id: companyId,
        type: 'system_alert',
        title: 'Team Invitation',
        body: `${user.full_name || 'A boss'} has invited you to join their team. Would you like to accept?`,
        related_id: user.id,
        related_type: 'user',
        read: false
      });
      toast.success(`Invitation sent to ${server.full_name}`);
    } catch (error) {
      toast.error(error.message || 'Failed to send invitation');
    }
  };

  const { data: notifications = [] } = useQuery({
    queryKey: ['bossNotifications', user?.id],
    queryFn: async () => {
      if (!user?.id) return [];
      return base44.entities.Notification.filter({
        user_id: user.id,
        read: false
      });
    },
    enabled: !!user?.id
  });

  const getServerStats = (serverId) => {
    const serverRoutes = routes.filter(r => r.worker_id === serverId);
    const activeRoutes = serverRoutes.filter(r => ['assigned', 'active'].includes(r.status));
    const completedRoutes = serverRoutes.filter(r => r.status === 'completed');
    
    const assignedMinutes = activeRoutes.reduce((sum, r) => sum + (r.estimated_time_minutes || 0), 0);
    const assignedHours = Math.round(assignedMinutes / 60);
    const targetHours = 40;
    const percentage = Math.min(Math.round((assignedHours / targetHours) * 100), 100);
    
    const totalAddresses = activeRoutes.reduce((sum, r) => sum + (r.total_addresses || 0), 0);
    const servedAddresses = activeRoutes.reduce((sum, r) => sum + (r.served_count || 0), 0);
    
    return {
      activeRoutes: activeRoutes.length,
      completedRoutes: completedRoutes.length,
      assignedHours,
      targetHours,
      percentage,
      totalAddresses,
      servedAddresses
    };
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 pb-20">
      {/* Header */}
      <header className="bg-blue-500 text-white px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <FileText className="w-6 h-6" />
          <span className="font-bold text-lg">Team</span>
        </div>
        <div className="flex items-center gap-3">
          <Link to={createPageUrl('Notifications')} className="relative">
            <Bell className="w-6 h-6" />
            {notifications.length > 0 && (
              <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center">
                {notifications.length > 9 ? '9+' : notifications.length}
              </span>
            )}
          </Link>
          <Dialog open={showInviteModal} onOpenChange={setShowInviteModal}>
            <DialogTrigger asChild>
              <Button size="sm" variant="secondary">
                <UserPlus className="w-4 h-4 mr-1" /> Invite
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Invite Server</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 pt-4">
                <div>
                  <Label htmlFor="email">Email Address</Label>
                  <Input
                    id="email"
                    type="email"
                    placeholder="server@example.com"
                    value={inviteEmail}
                    onChange={(e) => setInviteEmail(e.target.value)}
                  />
                </div>
                <p className="text-sm text-gray-500">
                  An invitation email will be sent to this address. They'll be able to create an account and join your team as a server.
                </p>
                <div className="flex gap-3">
                  <Button variant="outline" onClick={() => setShowInviteModal(false)}>
                    Cancel
                  </Button>
                  <Button 
                    className="flex-1" 
                    onClick={handleInviteServer}
                    disabled={isInviting}
                  >
                    {isInviting ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        Sending...
                      </>
                    ) : (
                      'Send Invitation'
                    )}
                  </Button>
                </div>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </header>

      <main className="px-4 py-4 max-w-4xl mx-auto">
        <h2 className="font-semibold text-lg mb-4">Servers ({servers.length})</h2>
        
        {servers.length === 0 ? (
          <Card>
            <CardContent className="p-8 text-center">
              <User className="w-12 h-12 mx-auto text-gray-300 mb-4" />
              <p className="text-gray-500">No servers in your team</p>
              <p className="text-sm text-gray-400 mt-1">Invite servers to get started</p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {servers.map((server) => {
              const stats = getServerStats(server.id);
              
              return (
                <Card key={server.id}>
                  <CardContent className="p-4">
                    <div className="flex items-start gap-4">
                      <div className="w-12 h-12 bg-blue-100 rounded-full flex items-center justify-center">
                        <span className="text-blue-600 font-bold">
                          {server.full_name?.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2) || 'U'}
                        </span>
                      </div>
                      
                      <div className="flex-1">
                        <h3 className="font-semibold">{server.full_name}</h3>
                        <p className="text-sm text-gray-500 flex items-center gap-1">
                          <Mail className="w-3 h-3" />
                          {server.email}
                        </p>
                        
                        <div className="mt-3 space-y-2">
                          <div className="flex items-center justify-between text-sm">
                            <span className="text-gray-600">Weekly Capacity</span>
                            <span className="font-medium">
                              {stats.assignedHours}h / {stats.targetHours}h
                              {stats.percentage >= 100 && (
                                <Badge className="ml-2 bg-red-100 text-red-700">FULL</Badge>
                              )}
                            </span>
                          </div>
                          <Progress value={stats.percentage} className="h-2" />
                          
                          <div className="flex flex-wrap gap-4 text-sm text-gray-600 mt-2">
                            <div className="flex items-center gap-1">
                              <MapPin className="w-4 h-4" />
                              <span>{stats.activeRoutes} active routes</span>
                            </div>
                            <div>
                              {stats.servedAddresses}/{stats.totalAddresses} addresses served
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}

        {/* Available Servers Section */}
        <h2 className="font-semibold text-lg mt-8 mb-4">Available Servers ({availableServers.length})</h2>
        <p className="text-sm text-gray-500 mb-3">These servers don't have a team yet. Send them an invite to join yours.</p>
        {availableServers.length > 0 ? (
            <div className="space-y-3">
              {availableServers.map((server) => (
                <Card key={server.id}>
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-gray-100 rounded-full flex items-center justify-center">
                          <span className="text-gray-600 font-bold text-sm">
                            {server.full_name?.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2) || 'U'}
                          </span>
                        </div>
                        <div>
                          <h3 className="font-medium">{server.full_name}</h3>
                          <p className="text-sm text-gray-500">{server.email}</p>
                        </div>
                      </div>
                      <Button 
                        size="sm" 
                        onClick={() => handleRequestToJoin(server)}
                      >
                        <UserPlus className="w-4 h-4 mr-1" /> Invite
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
        ) : (
          <Card>
            <CardContent className="p-6 text-center">
              <User className="w-10 h-10 mx-auto text-gray-300 mb-3" />
              <p className="text-gray-500 text-sm">No available servers found</p>
              <p className="text-xs text-gray-400 mt-1">Use the Invite button above to invite new servers by email</p>
            </CardContent>
          </Card>
        )}
      </main>

      <BossBottomNav currentPage="BossTeam" />
    </div>
  );
}