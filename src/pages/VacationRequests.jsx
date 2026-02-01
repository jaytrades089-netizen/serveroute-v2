import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import { format } from 'date-fns';
import { 
  Loader2, 
  ChevronLeft, 
  Calendar,
  Check,
  X,
  User,
  Clock
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import BossBottomNav from '../components/boss/BossBottomNav';
import { toast } from 'sonner';

const statusConfig = {
  pending: { color: 'bg-amber-100 text-amber-700', label: 'Pending' },
  approved: { color: 'bg-green-100 text-green-700', label: 'Approved' },
  denied: { color: 'bg-red-100 text-red-700', label: 'Denied' }
};

export default function VacationRequests() {
  const queryClient = useQueryClient();
  const [filter, setFilter] = useState('pending');
  const [denyDialog, setDenyDialog] = useState(null);
  const [denyReason, setDenyReason] = useState('');

  const { data: user } = useQuery({
    queryKey: ['currentUser'],
    queryFn: () => base44.auth.me()
  });

  const companyId = user?.company_id || 'default';

  const { data: requests = [], isLoading } = useQuery({
    queryKey: ['vacationRequests', companyId],
    queryFn: async () => {
      return base44.entities.VacationRequest.filter({
        company_id: companyId
      }, '-created_date');
    },
    enabled: !!user
  });

  const { data: workers = [] } = useQuery({
    queryKey: ['companyWorkers', companyId],
    queryFn: async () => {
      const users = await base44.entities.User.list();
      return users.filter(u => u.company_id === companyId);
    },
    enabled: !!user
  });

  const reviewMutation = useMutation({
    mutationFn: async ({ requestId, approved, reason }) => {
      const request = requests.find(r => r.id === requestId);
      const worker = workers.find(w => w.id === request.server_id);

      await base44.entities.VacationRequest.update(requestId, {
        status: approved ? 'approved' : 'denied',
        reviewed_by: user.id,
        reviewed_at: new Date().toISOString(),
        denial_reason: reason || null
      });

      // Notify worker
      await base44.entities.Notification.create({
        user_id: request.server_id,
        company_id: companyId,
        recipient_role: 'server',
        type: approved ? 'vacation_approved' : 'vacation_denied',
        title: approved ? 'Time Off Approved' : 'Time Off Denied',
        body: approved 
          ? `Your request for ${format(new Date(request.start_date), 'MMM d')} - ${format(new Date(request.end_date), 'MMM d')} was approved`
          : `Your request was denied: ${reason || 'No reason provided'}`,
        priority: 'normal'
      });

      // Audit log
      await base44.entities.AuditLog.create({
        company_id: companyId,
        action_type: approved ? 'vacation_approved' : 'vacation_denied',
        actor_id: user.id,
        actor_role: 'boss',
        target_type: 'vacation_request',
        target_id: requestId,
        details: {
          worker_id: request.server_id,
          worker_name: worker?.full_name,
          start_date: request.start_date,
          end_date: request.end_date,
          denial_reason: reason
        },
        timestamp: new Date().toISOString()
      });
    },
    onSuccess: (_, { approved }) => {
      toast.success(approved ? 'Request approved' : 'Request denied');
      queryClient.invalidateQueries({ queryKey: ['vacationRequests'] });
      setDenyDialog(null);
      setDenyReason('');
    },
    onError: (error) => {
      toast.error(error.message || 'Failed to process request');
    }
  });

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
      </div>
    );
  }

  const filteredRequests = requests.filter(r => filter === 'all' || r.status === filter);
  const pendingCount = requests.filter(r => r.status === 'pending').length;

  const getWorkerName = (serverId) => {
    const worker = workers.find(w => w.id === serverId);
    return worker?.full_name || 'Unknown';
  };

  return (
    <div className="min-h-screen bg-gray-50 pb-20">
      {/* Header */}
      <header className="bg-blue-500 text-white px-4 py-3 flex items-center gap-3">
        <Link to={createPageUrl('BossDashboard')}>
          <ChevronLeft className="w-6 h-6" />
        </Link>
        <span className="font-bold text-lg">Vacation Requests</span>
        {pendingCount > 0 && (
          <Badge className="bg-white/20 text-white">{pendingCount} pending</Badge>
        )}
      </header>

      <main className="px-4 py-6 max-w-2xl mx-auto">
        {/* Filter */}
        <div className="flex gap-2 mb-4 overflow-x-auto pb-2">
          {['pending', 'approved', 'denied', 'all'].map((status) => (
            <Button
              key={status}
              variant={filter === status ? 'default' : 'outline'}
              size="sm"
              onClick={() => setFilter(status)}
              className="capitalize whitespace-nowrap"
            >
              {status}
              {status === 'pending' && pendingCount > 0 && (
                <span className="ml-1 bg-white/20 px-1.5 rounded-full text-xs">{pendingCount}</span>
              )}
            </Button>
          ))}
        </div>

        {/* Requests List */}
        {filteredRequests.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center">
              <Calendar className="w-12 h-12 text-gray-300 mx-auto mb-3" />
              <p className="text-gray-500">No {filter !== 'all' ? filter : ''} requests</p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {filteredRequests.map((request) => {
              const config = statusConfig[request.status];

              return (
                <Card key={request.id}>
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between mb-3">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-gray-100 rounded-full flex items-center justify-center">
                          <User className="w-5 h-5 text-gray-600" />
                        </div>
                        <div>
                          <h3 className="font-semibold text-gray-900">
                            {getWorkerName(request.server_id)}
                          </h3>
                          <div className="flex items-center gap-1 text-sm text-gray-500">
                            <Calendar className="w-4 h-4" />
                            {format(new Date(request.start_date), 'MMM d')} - {format(new Date(request.end_date), 'MMM d, yyyy')}
                          </div>
                        </div>
                      </div>
                      <Badge className={config.color}>{config.label}</Badge>
                    </div>

                    {request.reason && (
                      <p className="text-sm text-gray-600 mb-3 bg-gray-50 p-2 rounded">
                        "{request.reason}"
                      </p>
                    )}

                    {request.status === 'denied' && request.denial_reason && (
                      <p className="text-sm text-red-600 mb-3 bg-red-50 p-2 rounded">
                        Denied: {request.denial_reason}
                      </p>
                    )}

                    <div className="flex items-center justify-between">
                      <span className="text-xs text-gray-400">
                        Requested {format(new Date(request.created_date), 'MMM d, yyyy')}
                      </span>

                      {request.status === 'pending' && (
                        <div className="flex gap-2">
                          <Button
                            size="sm"
                            variant="outline"
                            className="text-red-600 border-red-200 hover:bg-red-50"
                            onClick={() => setDenyDialog(request)}
                          >
                            <X className="w-4 h-4 mr-1" />
                            Deny
                          </Button>
                          <Button
                            size="sm"
                            className="bg-green-600 hover:bg-green-700"
                            onClick={() => reviewMutation.mutate({ requestId: request.id, approved: true })}
                            disabled={reviewMutation.isPending}
                          >
                            <Check className="w-4 h-4 mr-1" />
                            Approve
                          </Button>
                        </div>
                      )}
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </main>

      <BossBottomNav currentPage="BossTeam" />

      {/* Deny Dialog */}
      <Dialog open={!!denyDialog} onOpenChange={() => setDenyDialog(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Deny Request</DialogTitle>
          </DialogHeader>
          <div className="py-4">
            <p className="text-sm text-gray-600 mb-3">
              Please provide a reason for denying this vacation request.
            </p>
            <Textarea
              placeholder="Reason for denial..."
              value={denyReason}
              onChange={(e) => setDenyReason(e.target.value)}
              rows={3}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDenyDialog(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => reviewMutation.mutate({ 
                requestId: denyDialog.id, 
                approved: false, 
                reason: denyReason 
              })}
              disabled={reviewMutation.isPending}
            >
              {reviewMutation.isPending && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
              Deny Request
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}