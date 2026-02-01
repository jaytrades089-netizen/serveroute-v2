import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import { format, addDays } from 'date-fns';
import { 
  Loader2, 
  ChevronLeft, 
  Calendar,
  Check,
  X,
  Clock,
  AlertCircle
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Calendar as CalendarPicker } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import BottomNav from '../components/layout/BottomNav';
import { toast } from 'sonner';

const statusConfig = {
  pending: { color: 'bg-amber-100 text-amber-700', label: 'Pending', icon: Clock },
  approved: { color: 'bg-green-100 text-green-700', label: 'Approved', icon: Check },
  denied: { color: 'bg-red-100 text-red-700', label: 'Denied', icon: X }
};

export default function WorkerVacationRequest() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [startDate, setStartDate] = useState(null);
  const [endDate, setEndDate] = useState(null);
  const [reason, setReason] = useState('');

  const { data: user } = useQuery({
    queryKey: ['currentUser'],
    queryFn: () => base44.auth.me()
  });

  const companyId = user?.company_id || 'default';

  const { data: requests = [], isLoading } = useQuery({
    queryKey: ['myVacationRequests', user?.id],
    queryFn: async () => {
      return base44.entities.VacationRequest.filter({
        server_id: user.id
      }, '-created_date');
    },
    enabled: !!user?.id
  });

  const submitMutation = useMutation({
    mutationFn: async () => {
      // Create request
      const request = await base44.entities.VacationRequest.create({
        server_id: user.id,
        company_id: companyId,
        start_date: format(startDate, 'yyyy-MM-dd'),
        end_date: format(endDate, 'yyyy-MM-dd'),
        reason: reason || null,
        status: 'pending'
      });

      // Notify bosses
      const users = await base44.entities.User.list();
      const bosses = users.filter(u => 
        u.company_id === companyId && 
        (u.role === 'boss' || u.role === 'admin')
      );

      for (const boss of bosses) {
        await base44.entities.Notification.create({
          user_id: boss.id,
          company_id: companyId,
          recipient_role: 'boss',
          type: 'vacation_request',
          title: 'Vacation Request',
          body: `${user.full_name}: ${format(startDate, 'MMM d')} - ${format(endDate, 'MMM d')}`,
          data: { request_id: request.id, worker_id: user.id },
          action_url: '/VacationRequests',
          priority: 'normal'
        });
      }

      // Audit log
      await base44.entities.AuditLog.create({
        company_id: companyId,
        action_type: 'vacation_requested',
        actor_id: user.id,
        actor_role: 'server',
        target_type: 'vacation_request',
        target_id: request.id,
        details: {
          start_date: format(startDate, 'yyyy-MM-dd'),
          end_date: format(endDate, 'yyyy-MM-dd')
        },
        timestamp: new Date().toISOString()
      });

      return request;
    },
    onSuccess: () => {
      toast.success('Vacation request submitted');
      setStartDate(null);
      setEndDate(null);
      setReason('');
      queryClient.invalidateQueries({ queryKey: ['myVacationRequests'] });
    },
    onError: (error) => {
      toast.error(error.message || 'Failed to submit request');
    }
  });

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
      </div>
    );
  }

  const canSubmit = startDate && endDate && startDate <= endDate && startDate >= new Date();

  return (
    <div className="min-h-screen bg-gray-50 pb-20">
      {/* Header */}
      <header className="bg-blue-500 text-white px-4 py-3 flex items-center gap-3">
        <Link to={createPageUrl('WorkerSettings')}>
          <ChevronLeft className="w-6 h-6" />
        </Link>
        <span className="font-bold text-lg">Request Time Off</span>
      </header>

      <main className="px-4 py-6 max-w-lg mx-auto">
        {/* New Request Form */}
        <Card className="mb-6">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold">New Request</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Start Date</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" className="w-full justify-start mt-1">
                      <Calendar className="w-4 h-4 mr-2" />
                      {startDate ? format(startDate, 'MMM d, yyyy') : 'Select'}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0">
                    <CalendarPicker
                      mode="single"
                      selected={startDate}
                      onSelect={setStartDate}
                      disabled={(date) => date < new Date()}
                    />
                  </PopoverContent>
                </Popover>
              </div>
              <div>
                <Label>End Date</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" className="w-full justify-start mt-1">
                      <Calendar className="w-4 h-4 mr-2" />
                      {endDate ? format(endDate, 'MMM d, yyyy') : 'Select'}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0">
                    <CalendarPicker
                      mode="single"
                      selected={endDate}
                      onSelect={setEndDate}
                      disabled={(date) => date < (startDate || new Date())}
                    />
                  </PopoverContent>
                </Popover>
              </div>
            </div>

            <div>
              <Label>Reason (optional)</Label>
              <Textarea
                placeholder="Why do you need time off?"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                rows={3}
                className="mt-1"
              />
            </div>

            <Button 
              className="w-full"
              disabled={!canSubmit || submitMutation.isPending}
              onClick={() => submitMutation.mutate()}
            >
              {submitMutation.isPending ? (
                <Loader2 className="w-4 h-4 animate-spin mr-2" />
              ) : (
                <Calendar className="w-4 h-4 mr-2" />
              )}
              Submit Request
            </Button>
          </CardContent>
        </Card>

        {/* My Requests */}
        <h2 className="text-sm font-semibold text-gray-600 mb-3">My Requests</h2>
        
        {requests.length === 0 ? (
          <Card>
            <CardContent className="py-8 text-center">
              <Calendar className="w-10 h-10 text-gray-300 mx-auto mb-2" />
              <p className="text-gray-500 text-sm">No vacation requests yet</p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {requests.map((request) => {
              const config = statusConfig[request.status];
              const Icon = config.icon;

              return (
                <Card key={request.id}>
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between">
                      <div>
                        <div className="flex items-center gap-2 text-sm text-gray-600 mb-1">
                          <Calendar className="w-4 h-4" />
                          {format(new Date(request.start_date), 'MMM d')} - {format(new Date(request.end_date), 'MMM d, yyyy')}
                        </div>
                        {request.reason && (
                          <p className="text-sm text-gray-500">{request.reason}</p>
                        )}
                        {request.status === 'denied' && request.denial_reason && (
                          <div className="flex items-start gap-1 mt-2 text-sm text-red-600">
                            <AlertCircle className="w-4 h-4 mt-0.5" />
                            <span>{request.denial_reason}</span>
                          </div>
                        )}
                      </div>
                      <Badge className={config.color}>
                        <Icon className="w-3 h-3 mr-1" />
                        {config.label}
                      </Badge>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </main>

      <BottomNav currentPage="WorkerSettings" />
    </div>
  );
}