import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import { format } from 'date-fns';
import { 
  Loader2, ArrowLeft, FileText, CheckCircle, Clock, AlertCircle, 
  XCircle, Search, ChevronLeft, ChevronRight 
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import BossBottomNav from '../components/boss/BossBottomNav';

const STATUS_CONFIG = {
  auto_matched: { label: 'Auto-matched', icon: CheckCircle, color: 'bg-green-100 text-green-700' },
  manually_matched: { label: 'Confirmed', icon: CheckCircle, color: 'bg-blue-100 text-blue-700' },
  pending_review: { label: 'Pending', icon: Clock, color: 'bg-yellow-100 text-yellow-700' },
  unmatched: { label: 'Unmatched', icon: AlertCircle, color: 'bg-gray-100 text-gray-700' },
  rejected: { label: 'Rejected', icon: XCircle, color: 'bg-red-100 text-red-700' }
};

export default function DCNBatchDetail() {
  const navigate = useNavigate();
  const urlParams = new URLSearchParams(window.location.search);
  const batchId = urlParams.get('batchId');
  const [statusFilter, setStatusFilter] = useState('all');
  const [page, setPage] = useState(1);
  const pageSize = 20;

  const { data: batch, isLoading: batchLoading } = useQuery({
    queryKey: ['dcnBatch', batchId],
    queryFn: async () => {
      if (!batchId) return null;
      const batches = await base44.entities.DCNUploadBatch.filter({ id: batchId });
      return batches[0] || null;
    },
    enabled: !!batchId
  });

  const { data: dcnRecords = [], isLoading: dcnLoading } = useQuery({
    queryKey: ['batchDCNs', batchId, statusFilter],
    queryFn: async () => {
      if (!batchId) return [];
      const filter = { upload_batch_id: batchId };
      if (statusFilter !== 'all') {
        filter.match_status = statusFilter;
      }
      return base44.entities.DCNRecord.filter(filter, 'source_row_number', 500);
    },
    enabled: !!batchId
  });

  const { data: addresses = [] } = useQuery({
    queryKey: ['batchAddresses', dcnRecords],
    queryFn: async () => {
      if (dcnRecords.length === 0) return [];
      const addressIds = [...new Set(dcnRecords.map(d => d.address_id || d.suggested_address_id).filter(Boolean))];
      if (addressIds.length === 0) return [];
      const allAddrs = await base44.entities.Address.filter({});
      return allAddrs.filter(a => addressIds.includes(a.id));
    },
    enabled: dcnRecords.length > 0
  });

  const addressMap = addresses.reduce((acc, a) => ({ ...acc, [a.id]: a }), {});

  // Pagination
  const totalRecords = dcnRecords.length;
  const totalPages = Math.ceil(totalRecords / pageSize);
  const paginatedRecords = dcnRecords.slice((page - 1) * pageSize, page * pageSize);

  // Calculate current stats
  const currentStats = {
    auto_matched: dcnRecords.filter(d => d.match_status === 'auto_matched').length,
    manually_matched: dcnRecords.filter(d => d.match_status === 'manually_matched').length,
    pending_review: dcnRecords.filter(d => d.match_status === 'pending_review').length,
    unmatched: dcnRecords.filter(d => d.match_status === 'unmatched').length,
    rejected: dcnRecords.filter(d => d.match_status === 'rejected').length
  };
  const totalMatched = currentStats.auto_matched + currentStats.manually_matched;

  if (batchLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
      </div>
    );
  }

  if (!batch) {
    return (
      <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center p-4">
        <p className="text-gray-600 mb-4">Batch not found</p>
        <Button onClick={() => navigate(createPageUrl('DCNUpload'))}>Go Back</Button>
      </div>
    );
  }

  const validationErrors = batch.validation_errors || [];

  return (
    <div className="min-h-screen bg-gray-50 pb-24">
      <header className="bg-white border-b sticky top-0 z-10">
        <div className="px-4 py-3 flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate(createPageUrl('DCNUpload'))}>
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <div className="flex-1">
            <h1 className="text-lg font-semibold">Batch Details</h1>
          </div>
        </div>
      </header>

      <main className="px-4 py-4 max-w-2xl mx-auto space-y-4">
        {/* Batch Info */}
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-start gap-3">
              <FileText className="w-6 h-6 text-gray-400" />
              <div>
                <p className="font-medium">{batch.filename}</p>
                <p className="text-sm text-gray-500">
                  Uploaded: {batch.uploaded_at && format(new Date(batch.uploaded_at), 'MMM d, yyyy h:mm a')}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Summary Stats */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Summary</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-4 gap-2 text-center">
              <div className="p-2 bg-gray-50 rounded">
                <p className="text-xl font-bold">{batch.total_rows || 0}</p>
                <p className="text-xs text-gray-500">Total</p>
              </div>
              <div className="p-2 bg-green-50 rounded">
                <p className="text-xl font-bold text-green-700">{totalMatched}</p>
                <p className="text-xs text-gray-500">Matched</p>
              </div>
              <div className="p-2 bg-yellow-50 rounded">
                <p className="text-xl font-bold text-yellow-700">{currentStats.pending_review}</p>
                <p className="text-xs text-gray-500">Pending</p>
              </div>
              <div className="p-2 bg-gray-50 rounded">
                <p className="text-xl font-bold text-gray-600">{currentStats.unmatched}</p>
                <p className="text-xs text-gray-500">Unmatched</p>
              </div>
            </div>
            {currentStats.pending_review > 0 && (
              <Button 
                size="sm" 
                onClick={() => navigate(createPageUrl('DCNMatching'))}
                className="w-full mt-3 bg-orange-500 hover:bg-orange-600"
              >
                Review {currentStats.pending_review} Pending Matches
              </Button>
            )}
          </CardContent>
        </Card>

        {/* Validation Errors */}
        {validationErrors.length > 0 && (
          <Card className="border-red-200">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-red-700 flex items-center gap-2">
                <AlertCircle className="w-4 h-4" />
                Validation Errors ({validationErrors.length})
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-1 max-h-32 overflow-y-auto">
                {validationErrors.slice(0, 10).map((err, idx) => (
                  <p key={idx} className="text-sm text-red-600">
                    Row {err.row}: {err.error}
                  </p>
                ))}
                {validationErrors.length > 10 && (
                  <p className="text-sm text-gray-500">...and {validationErrors.length - 10} more</p>
                )}
              </div>
            </CardContent>
          </Card>
        )}

        {/* DCN List */}
        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-medium">DCNs in this Batch</CardTitle>
              <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v); setPage(1); }}>
                <SelectTrigger className="w-36 h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Status</SelectItem>
                  <SelectItem value="auto_matched">Auto-matched</SelectItem>
                  <SelectItem value="manually_matched">Confirmed</SelectItem>
                  <SelectItem value="pending_review">Pending</SelectItem>
                  <SelectItem value="unmatched">Unmatched</SelectItem>
                  <SelectItem value="rejected">Rejected</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardHeader>
          <CardContent>
            {dcnLoading ? (
              <div className="flex justify-center py-4">
                <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
              </div>
            ) : paginatedRecords.length === 0 ? (
              <p className="text-center text-gray-500 py-4">No DCNs found</p>
            ) : (
              <>
                <div className="divide-y">
                  {paginatedRecords.map((dcn) => {
                    const statusConfig = STATUS_CONFIG[dcn.match_status];
                    const StatusIcon = statusConfig?.icon || Clock;
                    const linkedAddr = dcn.address_id ? addressMap[dcn.address_id] : null;

                    return (
                      <div key={dcn.id} className="py-2 flex items-center justify-between">
                        <div className="flex-1 min-w-0">
                          <p className="font-mono text-sm font-medium truncate">{dcn.dcn}</p>
                          <p className="text-xs text-gray-500 truncate">{dcn.raw_address}</p>
                          {linkedAddr && (
                            <p className="text-xs text-green-600 truncate">
                              → {linkedAddr.normalized_address || linkedAddr.legal_address}
                            </p>
                          )}
                        </div>
                        <Badge className={`${statusConfig?.color} ml-2 flex-shrink-0`}>
                          <StatusIcon className="w-3 h-3 mr-1" />
                          {statusConfig?.label}
                        </Badge>
                      </div>
                    );
                  })}
                </div>

                {/* Pagination */}
                {totalPages > 1 && (
                  <div className="flex items-center justify-between mt-4 pt-4 border-t">
                    <p className="text-sm text-gray-500">
                      Showing {(page - 1) * pageSize + 1}-{Math.min(page * pageSize, totalRecords)} of {totalRecords}
                    </p>
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={page === 1}
                        onClick={() => setPage(p => p - 1)}
                      >
                        <ChevronLeft className="w-4 h-4" />
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={page === totalPages}
                        onClick={() => setPage(p => p + 1)}
                      >
                        <ChevronRight className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                )}
              </>
            )}
          </CardContent>
        </Card>
      </main>

      <BossBottomNav currentPage="BossDashboard" />
    </div>
  );
}