import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import { formatDistanceToNow } from 'date-fns';
import { 
  Loader2, ArrowLeft, Check, X, Search, MapPin, FileText, 
  AlertCircle, ChevronRight, Filter
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { toast } from 'sonner';
import BossBottomNav from '../components/boss/BossBottomNav';
import { calculateStringSimilarity } from '../components/dcn/DCNMatchingService';

export default function DCNMatching() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [statusFilter, setStatusFilter] = useState('pending_review');
  const [searchModalOpen, setSearchModalOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedDCN, setSelectedDCN] = useState(null);

  const { data: user } = useQuery({
    queryKey: ['currentUser'],
    queryFn: () => base44.auth.me()
  });

  const companyId = user?.company_id;

  const { data: dcnRecords = [], isLoading: dcnLoading } = useQuery({
    queryKey: ['dcnRecords', companyId, statusFilter],
    queryFn: async () => {
      if (!companyId) return [];
      const filter = { company_id: companyId };
      if (statusFilter !== 'all') {
        filter.match_status = statusFilter;
      }
      return base44.entities.DCNRecord.filter(filter, '-uploaded_at', 100);
    },
    enabled: !!companyId
  });

  const { data: addresses = [] } = useQuery({
    queryKey: ['companyAddresses', companyId],
    queryFn: async () => {
      if (!companyId) return [];
      return base44.entities.Address.filter({ company_id: companyId, deleted_at: null });
    },
    enabled: !!companyId
  });

  const { data: routes = [] } = useQuery({
    queryKey: ['companyRoutes', companyId],
    queryFn: async () => {
      if (!companyId) return [];
      return base44.entities.Route.filter({ company_id: companyId, deleted_at: null });
    },
    enabled: !!companyId
  });

  const addressMap = addresses.reduce((acc, a) => ({ ...acc, [a.id]: a }), {});
  const routeMap = routes.reduce((acc, r) => ({ ...acc, [r.id]: r }), {});

  // Confirm match mutation
  const confirmMutation = useMutation({
    mutationFn: async ({ dcnId, addressId }) => {
      const dcn = dcnRecords.find(d => d.id === dcnId);
      
      // Check if address already has a DCN
      const targetAddr = addresses.find(a => a.id === addressId);
      if (targetAddr?.has_dcn && targetAddr?.dcn_id) {
        throw new Error('This address already has a DCN linked. Unlink the existing DCN first.');
      }
      
      await base44.entities.DCNRecord.update(dcnId, {
        address_id: addressId,
        match_status: 'manually_matched',
        matched_by: user.id,
        matched_at: new Date().toISOString()
      });

      await base44.entities.Address.update(addressId, {
        dcn_id: dcnId,
        has_dcn: true,
        dcn_linked_at: new Date().toISOString(),
        dcn_linked_by: user.id
      });

      await base44.entities.AuditLog.create({
        company_id: companyId,
        action_type: 'dcn_manually_matched',
        actor_id: user.id,
        actor_role: 'boss',
        target_type: 'dcn_record',
        target_id: dcnId,
        details: { address_id: addressId },
        timestamp: new Date().toISOString()
      });
    },
    onSuccess: () => {
      toast.success('Match confirmed');
      queryClient.invalidateQueries({ queryKey: ['dcnRecords'] });
      queryClient.invalidateQueries({ queryKey: ['companyAddresses'] });
    },
    onError: (error) => {
      toast.error(error.message || 'Something went wrong');
    }
  });

  // Reject mutation
  const rejectMutation = useMutation({
    mutationFn: async (dcnId) => {
      await base44.entities.DCNRecord.update(dcnId, {
        match_status: 'rejected',
        address_id: null,
        suggested_address_id: null,
        matched_by: user.id,
        matched_at: new Date().toISOString()
      });

      await base44.entities.AuditLog.create({
        company_id: companyId,
        action_type: 'dcn_match_rejected',
        actor_id: user.id,
        actor_role: 'boss',
        target_type: 'dcn_record',
        target_id: dcnId,
        timestamp: new Date().toISOString()
      });
    },
    onSuccess: () => {
      toast.success('Match rejected');
      queryClient.invalidateQueries({ queryKey: ['dcnRecords'] });
    },
    onError: (error) => {
      toast.error(error.message || 'Something went wrong');
    }
  });

  // Search addresses
  const searchResults = searchQuery.length > 2 
    ? addresses.filter(a => {
        const addrStr = (a.normalized_address || a.legal_address || '').toLowerCase();
        return addrStr.includes(searchQuery.toLowerCase());
      }).slice(0, 10)
    : [];

  const openSearchModal = (dcn) => {
    setSelectedDCN(dcn);
    setSearchQuery('');
    setSearchModalOpen(true);
  };

  const handleSelectAddress = (addressId) => {
    if (selectedDCN) {
      confirmMutation.mutate({ dcnId: selectedDCN.id, addressId });
      setSearchModalOpen(false);
      setSelectedDCN(null);
    }
  };

  const pendingCount = dcnRecords.filter(d => d.match_status === 'pending_review').length;
  const unmatchedCount = dcnRecords.filter(d => d.match_status === 'unmatched').length;

  if (dcnLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 pb-24">
      <header className="bg-white border-b sticky top-0 z-10">
        <div className="px-4 py-3 flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate(createPageUrl('DCNUpload'))}>
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <div className="flex-1">
            <h1 className="text-lg font-semibold">DCN Matching Review</h1>
            <p className="text-xs text-gray-500">
              {pendingCount} pending • {unmatchedCount} unmatched
            </p>
          </div>
        </div>
      </header>

      <main className="px-4 py-4 max-w-2xl mx-auto">
        {/* Filters */}
        <div className="flex items-center gap-2 mb-4">
          <Filter className="w-4 h-4 text-gray-400" />
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-44">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="pending_review">Pending Review</SelectItem>
              <SelectItem value="unmatched">Unmatched</SelectItem>
              <SelectItem value="auto_matched">Auto-Matched</SelectItem>
              <SelectItem value="manually_matched">Manually Matched</SelectItem>
              <SelectItem value="rejected">Rejected</SelectItem>
              <SelectItem value="all">All Status</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* DCN List */}
        {dcnRecords.length === 0 ? (
          <div className="text-center py-12">
            <FileText className="w-12 h-12 text-gray-300 mx-auto mb-3" />
            <p className="text-gray-500">
              {statusFilter === 'pending_review' ? 'No DCNs pending review' : 'No DCNs found'}
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {dcnRecords.map((dcn) => {
              const suggestedAddr = dcn.suggested_address_id ? addressMap[dcn.suggested_address_id] : null;
              const linkedAddr = dcn.address_id ? addressMap[dcn.address_id] : null;
              const route = suggestedAddr?.route_id ? routeMap[suggestedAddr.route_id] : 
                           linkedAddr?.route_id ? routeMap[linkedAddr.route_id] : null;
              const confidencePercent = dcn.match_confidence ? Math.round(dcn.match_confidence * 100) : null;

              return (
                <Card key={dcn.id}>
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between mb-3">
                      <div>
                        <p className="font-mono font-semibold text-sm">{dcn.dcn}</p>
                        <p className="text-xs text-gray-500">
                          {dcn.uploaded_at && formatDistanceToNow(new Date(dcn.uploaded_at), { addSuffix: true })}
                        </p>
                      </div>
                      {confidencePercent !== null && dcn.match_status === 'pending_review' && (
                        <Badge className={confidencePercent >= 90 ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'}>
                          {confidencePercent}% match
                        </Badge>
                      )}
                      {dcn.match_status === 'auto_matched' && (
                        <Badge className="bg-green-100 text-green-700">Auto-matched</Badge>
                      )}
                      {dcn.match_status === 'manually_matched' && (
                        <Badge className="bg-blue-100 text-blue-700">Confirmed</Badge>
                      )}
                      {dcn.match_status === 'rejected' && (
                        <Badge className="bg-red-100 text-red-700">Rejected</Badge>
                      )}
                      {dcn.match_status === 'unmatched' && (
                        <Badge className="bg-gray-100 text-gray-700">Unmatched</Badge>
                      )}
                    </div>

                    {/* From File */}
                    <div className="mb-3">
                      <p className="text-xs text-gray-500 mb-1">FROM FILE:</p>
                      <p className="text-sm font-medium">{dcn.raw_address}</p>
                    </div>

                    {/* Suggested/Linked Match */}
                    {(suggestedAddr || linkedAddr) && (
                      <div className="bg-gray-50 rounded-lg p-3 mb-3">
                        <p className="text-xs text-gray-500 mb-1">
                          {dcn.match_status === 'pending_review' ? 'SUGGESTED MATCH:' : 'LINKED ADDRESS:'}
                        </p>
                        <p className="text-sm font-medium">
                          {(suggestedAddr || linkedAddr)?.normalized_address || (suggestedAddr || linkedAddr)?.legal_address}
                        </p>
                        {route && (
                          <p className="text-xs text-gray-500 mt-1">
                            Route: {route.folder_name}
                          </p>
                        )}
                      </div>
                    )}

                    {/* No Match Found */}
                    {dcn.match_status === 'unmatched' && !suggestedAddr && (
                      <div className="bg-yellow-50 rounded-lg p-3 mb-3 flex items-center gap-2">
                        <AlertCircle className="w-4 h-4 text-yellow-600" />
                        <p className="text-sm text-yellow-700">No matching address found</p>
                      </div>
                    )}

                    {/* Actions */}
                    {dcn.match_status === 'pending_review' && suggestedAddr && (
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          onClick={() => confirmMutation.mutate({ dcnId: dcn.id, addressId: suggestedAddr.id })}
                          disabled={confirmMutation.isPending}
                          className="flex-1 bg-green-600 hover:bg-green-700"
                        >
                          <Check className="w-4 h-4 mr-1" />
                          Confirm Match
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => rejectMutation.mutate(dcn.id)}
                          disabled={rejectMutation.isPending}
                          className="border-red-300 text-red-600 hover:bg-red-50"
                        >
                          <X className="w-4 h-4 mr-1" />
                          Reject
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => openSearchModal(dcn)}
                        >
                          <Search className="w-4 h-4" />
                        </Button>
                      </div>
                    )}

                    {dcn.match_status === 'unmatched' && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => openSearchModal(dcn)}
                        className="w-full"
                      >
                        <Search className="w-4 h-4 mr-2" />
                        Search Addresses
                      </Button>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </main>

      <BossBottomNav currentPage="BossDashboard" />

      {/* Address Search Modal */}
      <Dialog open={searchModalOpen} onOpenChange={setSearchModalOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Search for Address</DialogTitle>
          </DialogHeader>

          {selectedDCN && (
            <div className="mb-4">
              <p className="text-sm text-gray-500">DCN: <span className="font-mono">{selectedDCN.dcn}</span></p>
              <p className="text-sm">Original: {selectedDCN.raw_address}</p>
            </div>
          )}

          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <Input
              placeholder="Search addresses..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10"
            />
          </div>

          <div className="max-h-64 overflow-y-auto space-y-2">
            {searchResults.length === 0 && searchQuery.length > 2 && (
              <p className="text-center text-gray-500 py-4">No addresses found</p>
            )}
            {searchResults.map((addr) => {
              const route = addr.route_id ? routeMap[addr.route_id] : null;
              return (
                <div
                  key={addr.id}
                  className="border rounded-lg p-3 hover:bg-gray-50 cursor-pointer"
                  onClick={() => handleSelectAddress(addr.id)}
                >
                  <div className="flex items-center gap-2">
                    <MapPin className="w-4 h-4 text-gray-400" />
                    <p className="text-sm font-medium">{addr.normalized_address || addr.legal_address}</p>
                  </div>
                  {route && (
                    <p className="text-xs text-gray-500 ml-6">Route: {route.folder_name}</p>
                  )}
                </div>
              );
            })}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setSearchModalOpen(false)}>
              Cancel
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}