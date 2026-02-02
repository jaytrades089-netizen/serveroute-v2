import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import { formatDistanceToNow } from 'date-fns';
import { Loader2, ArrowLeft, FileCheck, Clock, CheckCircle, XCircle, AlertCircle, Camera, PenTool, Filter, RefreshCw, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import BossBottomNav from '../components/boss/BossBottomNav';

const STATUS_CONFIG = {
  pending: { label: 'Pending', icon: Clock, color: 'bg-yellow-100 text-yellow-700' },
  approved: { label: 'Approved', icon: CheckCircle, color: 'bg-green-100 text-green-700' },
  rejected: { label: 'Rejected', icon: XCircle, color: 'bg-red-100 text-red-700' },
  needs_revision: { label: 'Needs Revision', icon: AlertCircle, color: 'bg-orange-100 text-orange-700' }
};

const OUTCOME_CONFIG = {
  served: { label: 'Served', color: 'text-green-600', dot: 'bg-green-500' },
  partially_served: { label: 'Partially Served', color: 'text-yellow-600', dot: 'bg-yellow-500' },
  not_served: { label: 'Not Served', color: 'text-red-600', dot: 'bg-red-500' }
};

export default function ReceiptQueue() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [statusFilter, setStatusFilter] = useState('pending');
  const [workerFilter, setWorkerFilter] = useState('all');
  const [refreshing, setRefreshing] = useState(false);

  const { data: user, isLoading: userLoading } = useQuery({
    queryKey: ['currentUser'],
    queryFn: () => base44.auth.me()
  });

  const companyId = user?.company_id;

  const { data: receipts = [], isLoading: receiptsLoading } = useQuery({
    queryKey: ['receiptQueue', companyId],
    queryFn: async () => {
      if (!companyId) return [];
      return base44.entities.Receipt.filter({ company_id: companyId }, '-submitted_at', 200);
    },
    enabled: !!companyId,
    refetchInterval: 30000 // Poll every 30 seconds
  });

  const { data: workers = [] } = useQuery({
    queryKey: ['companyWorkers', companyId],
    queryFn: async () => {
      if (!companyId) return [];
      const users = await base44.entities.User.list();
      return users.filter(u => u.company_id === companyId && (u.role === 'server' || u.role === 'user'));
    },
    enabled: !!companyId
  });

  const { data: addresses = [] } = useQuery({
    queryKey: ['receiptAddresses', receipts],
    queryFn: async () => {
      if (receipts.length === 0) return [];
      const addressIds = [...new Set(receipts.map(r => r.address_id))];
      const all = await base44.entities.Address.filter({ company_id: companyId });
      return all.filter(a => addressIds.includes(a.id));
    },
    enabled: receipts.length > 0
  });

  const workerMap = workers.reduce((acc, w) => ({ ...acc, [w.id]: w }), {});
  const addressMap = addresses.reduce((acc, a) => ({ ...acc, [a.id]: a }), {});

  const handleRefresh = async () => {
    setRefreshing(true);
    await queryClient.invalidateQueries({ queryKey: ['receiptQueue'] });
    setTimeout(() => setRefreshing(false), 500);
  };

  // Filter receipts
  let filteredReceipts = receipts;
  if (statusFilter !== 'all') {
    filteredReceipts = filteredReceipts.filter(r => r.status === statusFilter);
  }
  if (workerFilter !== 'all') {
    filteredReceipts = filteredReceipts.filter(r => r.worker_id === workerFilter);
  }

  const isLoading = userLoading || receiptsLoading;

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
      </div>
    );
  }

  const pendingCount = receipts.filter(r => r.status === 'pending').length;

  return (
    <div className="min-h-screen bg-gray-50 pb-24">
      {/* Header */}
      <header className="bg-white border-b sticky top-0 z-10">
        <div className="px-4 py-3 flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate(createPageUrl('BossDashboard'))}>
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <div className="flex-1">
            <h1 className="text-lg font-semibold">Receipt Review</h1>
            {pendingCount > 0 && (
              <p className="text-xs text-orange-600">{pendingCount} pending review</p>
            )}
          </div>
          <Button variant="ghost" size="icon" onClick={handleRefresh} disabled={refreshing}>
            <RefreshCw className={`w-5 h-5 ${refreshing ? 'animate-spin' : ''}`} />
          </Button>
        </div>
      </header>

      <main className="px-4 py-4 max-w-2xl mx-auto">
        {/* Filters */}
        <div className="flex gap-2 mb-4 flex-wrap">
          <div className="flex items-center gap-2">
            <Filter className="w-4 h-4 text-gray-400" />
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-36">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="pending">Pending</SelectItem>
                <SelectItem value="needs_revision">Needs Revision</SelectItem>
                <SelectItem value="approved">Approved</SelectItem>
                <SelectItem value="rejected">Rejected</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="flex items-center gap-2">
            <Users className="w-4 h-4 text-gray-400" />
            <Select value={workerFilter} onValueChange={setWorkerFilter}>
              <SelectTrigger className="w-40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Workers</SelectItem>
                {workers.map(w => (
                  <SelectItem key={w.id} value={w.id}>{w.full_name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Receipts List */}
        {filteredReceipts.length === 0 ? (
          <div className="text-center py-12">
            <FileCheck className="w-12 h-12 text-gray-300 mx-auto mb-3" />
            <p className="text-gray-500">
              {statusFilter === 'pending' ? 'No receipts pending review' : 'No receipts found'}
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {filteredReceipts.map((receipt) => {
              const worker = workerMap[receipt.worker_id];
              const address = addressMap[receipt.address_id];
              const statusConfig = STATUS_CONFIG[receipt.status];
              const outcomeConfig = OUTCOME_CONFIG[receipt.outcome];
              const StatusIcon = statusConfig?.icon || Clock;

              return (
                <Card key={receipt.id} className="overflow-hidden hover:shadow-md transition-shadow">
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between mb-2">
                      <div className="flex-1">
                        <p className="font-medium text-sm line-clamp-1">
                          {address?.normalized_address || address?.legal_address || 'Unknown Address'}
                        </p>
                        <p className="text-xs text-gray-500">
                          Worker: {worker?.full_name || 'Unknown'}
                        </p>
                      </div>
                      <div className="flex flex-col items-end gap-1">
                        <Badge className={statusConfig?.color}>
                          <StatusIcon className="w-3 h-3 mr-1" />
                          {statusConfig?.label}
                        </Badge>
                        <span className="text-xs text-gray-400">
                          {receipt.submitted_at 
                            ? formatDistanceToNow(new Date(receipt.submitted_at), { addSuffix: true })
                            : ''
                          }
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center gap-4 text-xs text-gray-600 mb-3">
                      <span className="flex items-center gap-1">
                        <span className={`w-2 h-2 rounded-full ${outcomeConfig?.dot}`} />
                        {outcomeConfig?.label}
                      </span>
                      <span className="flex items-center gap-1">
                        <Camera className="w-3 h-3" />
                        {receipt.photo_count || 0} photos
                      </span>
                      {receipt.has_signature && (
                        <span className="flex items-center gap-1">
                          <PenTool className="w-3 h-3" />
                          Signed
                        </span>
                      )}
                      {receipt.is_resubmission && (
                        <Badge variant="outline" className="text-xs bg-orange-50">
                          Resubmission v{receipt.version}
                        </Badge>
                      )}
                    </div>

                    <Link to={createPageUrl(`ReceiptReview?receiptId=${receipt.id}`)}>
                      <Button variant="outline" size="sm" className="w-full">
                        Review →
                      </Button>
                    </Link>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </main>

      <BossBottomNav currentPage="BossDashboard" />
    </div>
  );
}