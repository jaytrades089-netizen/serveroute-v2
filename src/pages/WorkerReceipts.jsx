import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { Link, useNavigate } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import { format, formatDistanceToNow } from 'date-fns';
import { Loader2, ArrowLeft, FileCheck, Clock, CheckCircle, XCircle, AlertCircle, Camera, PenTool, Filter } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import BottomNav from '../components/layout/BottomNav';

const STATUS_CONFIG = {
  pending_review: { label: 'Pending Review', icon: Clock, color: 'bg-yellow-100 text-yellow-700', iconColor: 'text-yellow-500' },
  approved: { label: 'Approved', icon: CheckCircle, color: 'bg-green-100 text-green-700', iconColor: 'text-green-500' },
  rejected: { label: 'Rejected', icon: XCircle, color: 'bg-red-100 text-red-700', iconColor: 'text-red-500' },
  needs_revision: { label: 'Needs Revision', icon: AlertCircle, color: 'bg-orange-100 text-orange-700', iconColor: 'text-orange-500' }
};

const OUTCOME_CONFIG = {
  served: { label: 'Served', color: 'text-green-600' },
  partially_served: { label: 'Partially Served', color: 'text-yellow-600' },
  not_served: { label: 'Not Served', color: 'text-red-600' }
};

export default function WorkerReceipts() {
  const navigate = useNavigate();
  const [statusFilter, setStatusFilter] = useState('all');

  const { data: user, isLoading: userLoading } = useQuery({
    queryKey: ['currentUser'],
    queryFn: () => base44.auth.me()
  });

  const { data: receipts = [], isLoading: receiptsLoading } = useQuery({
    queryKey: ['workerReceipts', user?.id],
    queryFn: async () => {
      if (!user?.id) return [];
      return base44.entities.Receipt.filter({ worker_id: user.id }, '-submitted_at', 100);
    },
    enabled: !!user?.id
  });

  const { data: addresses = [] } = useQuery({
    queryKey: ['receiptAddresses', receipts],
    queryFn: async () => {
      if (receipts.length === 0) return [];
      const addressIds = [...new Set(receipts.map(r => r.address_id))];
      const addressPromises = addressIds.map(id => 
        base44.entities.Address.filter({ id })
      );
      const results = await Promise.all(addressPromises);
      return results.flat();
    },
    enabled: receipts.length > 0
  });

  const addressMap = addresses.reduce((acc, a) => ({ ...acc, [a.id]: a }), {});

  const filteredReceipts = statusFilter === 'all' 
    ? receipts 
    : receipts.filter(r => r.status === statusFilter);

  const isLoading = userLoading || receiptsLoading;

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
      </div>
    );
  }

  const statusCounts = {
    all: receipts.length,
    pending: receipts.filter(r => r.status === 'pending_review').length,
    needs_revision: receipts.filter(r => r.status === 'needs_revision').length,
    approved: receipts.filter(r => r.status === 'approved').length,
    rejected: receipts.filter(r => r.status === 'rejected').length
  };

  return (
    <div className="min-h-screen bg-gray-50 pb-24">
      {/* Header */}
      <header className="bg-white border-b sticky top-0 z-10">
        <div className="px-4 py-3 flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <div className="flex-1">
            <h1 className="text-lg font-semibold">My Receipts</h1>
            <p className="text-xs text-gray-500">{receipts.length} total receipts</p>
          </div>
        </div>
      </header>

      <main className="px-4 py-4 max-w-lg mx-auto">
        {/* Filters */}
        <div className="flex items-center gap-2 mb-4">
          <Filter className="w-4 h-4 text-gray-400" />
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-48">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All ({statusCounts.all})</SelectItem>
              <SelectItem value="pending_review">Pending ({statusCounts.pending})</SelectItem>
              <SelectItem value="needs_revision">Needs Revision ({statusCounts.needs_revision})</SelectItem>
              <SelectItem value="approved">Approved ({statusCounts.approved})</SelectItem>
              <SelectItem value="rejected">Rejected ({statusCounts.rejected})</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Receipts List */}
        {filteredReceipts.length === 0 ? (
          <div className="text-center py-12">
            <FileCheck className="w-12 h-12 text-gray-300 mx-auto mb-3" />
            <p className="text-gray-500">No receipts found</p>
          </div>
        ) : (
          <div className="space-y-3">
            {filteredReceipts.map((receipt) => {
              const address = addressMap[receipt.address_id];
              const statusConfig = STATUS_CONFIG[receipt.status];
              const outcomeConfig = OUTCOME_CONFIG[receipt.outcome];
              const StatusIcon = statusConfig?.icon || Clock;

              return (
                <Card key={receipt.id} className="overflow-hidden">
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between mb-2">
                      <div className="flex-1">
                        <p className="font-medium text-sm line-clamp-1">
                          {address?.normalized_address || address?.legal_address || 'Unknown Address'}
                        </p>
                        <p className="text-xs text-gray-500">
                          {receipt.submitted_at 
                            ? formatDistanceToNow(new Date(receipt.submitted_at), { addSuffix: true })
                            : 'Unknown date'
                          }
                        </p>
                      </div>
                      <Badge className={statusConfig?.color || 'bg-gray-100'}>
                        <StatusIcon className="w-3 h-3 mr-1" />
                        {statusConfig?.label || receipt.status}
                      </Badge>
                    </div>

                    <div className="flex items-center gap-4 text-xs text-gray-600 mb-3">
                      <span className={outcomeConfig?.color || ''}>
                        {outcomeConfig?.label || receipt.outcome}
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
                        <Badge variant="outline" className="text-xs">v{receipt.version}</Badge>
                      )}
                    </div>

                    {/* Show rejection/revision reason */}
                    {(receipt.status === 'rejected' || receipt.status === 'needs_revision') && (
                      <div className="bg-orange-50 border border-orange-200 rounded-lg p-2 mb-3">
                        <p className="text-xs text-orange-700">
                          {receipt.revision_instructions || receipt.rejection_reason}
                        </p>
                      </div>
                    )}

                    {/* Actions */}
                    <div className="flex gap-2">
                      <Link 
                        to={createPageUrl(`ReceiptDetail?receiptId=${receipt.id}`)}
                        className="flex-1"
                      >
                        <Button variant="outline" size="sm" className="w-full">
                          View Details
                        </Button>
                      </Link>

                      {receipt.status === 'needs_revision' && (
                        <Link 
                          to={createPageUrl(`SubmitReceipt?addressId=${receipt.address_id}&routeId=${receipt.route_id}&parentReceiptId=${receipt.id}`)}
                          className="flex-1"
                        >
                          <Button size="sm" className="w-full bg-orange-500 hover:bg-orange-600">
                            Resubmit
                          </Button>
                        </Link>
                      )}
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </main>

      <BottomNav currentPage="WorkerRoutes" />
    </div>
  );
}