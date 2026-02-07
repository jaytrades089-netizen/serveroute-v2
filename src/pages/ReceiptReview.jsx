import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import { format } from 'date-fns';
import { Loader2, ArrowLeft, MapPin, User, Clock, Camera, PenTool, CheckCircle, XCircle, AlertCircle, History, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { toast } from 'sonner';
import BossBottomNav from '../components/boss/BossBottomNav';

const QUICK_REJECTION_REASONS = [
  'Photo too blurry',
  'Wrong address',
  'Missing info',
  'Incorrect date',
  'No recipient name',
  'Photo not clear enough'
];

const OUTCOME_LABELS = {
  served: 'Served',
  partially_served: 'Partially Served',
  not_served: 'Not Served'
};

const RELATIONSHIP_LABELS = {
  defendant: 'Defendant',
  spouse: 'Spouse',
  adult_household: 'Adult Household Member',
  property_manager: 'Property Manager',
  coworker: 'Coworker',
  other: 'Other'
};

export default function ReceiptReview() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const urlParams = new URLSearchParams(window.location.search);
  const receiptId = urlParams.get('receiptId');

  const [previewImage, setPreviewImage] = useState(null);
  const [rejectDialogOpen, setRejectDialogOpen] = useState(false);
  const [revisionDialogOpen, setRevisionDialogOpen] = useState(false);
  const [rejectionReason, setRejectionReason] = useState('');
  const [revisionInstructions, setRevisionInstructions] = useState('');
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);

  const { data: user } = useQuery({
    queryKey: ['currentUser'],
    queryFn: () => base44.auth.me()
  });

  const { data: receipt, isLoading: receiptLoading } = useQuery({
    queryKey: ['receipt', receiptId],
    queryFn: async () => {
      if (!receiptId) return null;
      const receipts = await base44.entities.Receipt.filter({ id: receiptId });
      return receipts[0] || null;
    },
    enabled: !!receiptId
  });

  const { data: address } = useQuery({
    queryKey: ['receiptAddress', receipt?.address_id],
    queryFn: async () => {
      if (!receipt?.address_id) return null;
      const addresses = await base44.entities.Address.filter({ id: receipt.address_id });
      return addresses[0] || null;
    },
    enabled: !!receipt?.address_id
  });

  const { data: route } = useQuery({
    queryKey: ['receiptRoute', receipt?.route_id],
    queryFn: async () => {
      if (!receipt?.route_id) return null;
      const routes = await base44.entities.Route.filter({ id: receipt.route_id });
      return routes[0] || null;
    },
    enabled: !!receipt?.route_id
  });

  const { data: worker } = useQuery({
    queryKey: ['receiptWorker', receipt?.worker_id],
    queryFn: async () => {
      if (!receipt?.worker_id) return null;
      const users = await base44.entities.User.filter({ id: receipt.worker_id });
      return users[0] || null;
    },
    enabled: !!receipt?.worker_id
  });

  const { data: versionHistory = [] } = useQuery({
    queryKey: ['receiptHistory', receipt?.address_id],
    queryFn: async () => {
      if (!receipt?.address_id) return [];
      const all = await base44.entities.Receipt.filter({ address_id: receipt.address_id }, '-version');
      return all;
    },
    enabled: !!receipt?.address_id
  });

  // Approve mutation
  const approveMutation = useMutation({
    mutationFn: async () => {
      await base44.entities.Receipt.update(receiptId, {
        status: 'approved',
        reviewed_by: user.id,
        reviewed_at: new Date().toISOString()
      });

      await base44.entities.Address.update(receipt.address_id, {
        receipt_status: 'approved',
        receipt_approved_at: new Date().toISOString(),
        served: true,
        served_at: new Date().toISOString()
      });

      // Notify worker
      await base44.entities.Notification.create({
        company_id: receipt.company_id,
        user_id: receipt.worker_id,
        recipient_role: 'server',
        type: 'receipt_approved',
        title: 'Receipt Approved ✓',
        body: `Your receipt for ${address?.normalized_address || address?.legal_address} has been approved.`,
        data: { receipt_id: receiptId },
        action_url: `/ReceiptDetail?receiptId=${receiptId}`,
        priority: 'normal'
      });

      // Audit log
      await base44.entities.AuditLog.create({
        company_id: receipt.company_id,
        action_type: 'receipt_approved',
        actor_id: user.id,
        actor_role: 'boss',
        target_type: 'receipt',
        target_id: receiptId,
        timestamp: new Date().toISOString()
      });
    },
    onSuccess: () => {
      toast.success('Receipt approved');
      queryClient.invalidateQueries({ queryKey: ['receipt'] });
      queryClient.invalidateQueries({ queryKey: ['receiptQueue'] });
      navigate(createPageUrl('ReceiptQueue'));
    },
    onError: (error) => {
      toast.error(error.message || 'Failed to approve');
    }
  });

  // Reject mutation
  const rejectMutation = useMutation({
    mutationFn: async (reason) => {
      await base44.entities.Receipt.update(receiptId, {
        status: 'rejected',
        reviewed_by: user.id,
        reviewed_at: new Date().toISOString(),
        rejection_reason: reason
      });

      await base44.entities.Address.update(receipt.address_id, {
        receipt_status: 'rejected'
      });

      // Notify worker
      await base44.entities.Notification.create({
        company_id: receipt.company_id,
        user_id: receipt.worker_id,
        recipient_role: 'server',
        type: 'receipt_rejected',
        title: 'Receipt Rejected',
        body: `Your receipt for ${address?.normalized_address || address?.legal_address} was rejected: "${reason}"`,
        data: { receipt_id: receiptId, reason },
        action_url: `/ReceiptDetail?receiptId=${receiptId}`,
        priority: 'high'
      });

      // Audit log
      await base44.entities.AuditLog.create({
        company_id: receipt.company_id,
        action_type: 'receipt_rejected',
        actor_id: user.id,
        actor_role: 'boss',
        target_type: 'receipt',
        target_id: receiptId,
        details: { reason },
        timestamp: new Date().toISOString()
      });
    },
    onSuccess: () => {
      toast.success('Receipt rejected');
      setRejectDialogOpen(false);
      queryClient.invalidateQueries({ queryKey: ['receipt'] });
      queryClient.invalidateQueries({ queryKey: ['receiptQueue'] });
      navigate(createPageUrl('ReceiptQueue'));
    },
    onError: (error) => {
      toast.error(error.message || 'Failed to reject');
    }
  });

  // Request revision mutation
  const revisionMutation = useMutation({
    mutationFn: async (instructions) => {
      await base44.entities.Receipt.update(receiptId, {
        status: 'needs_revision',
        reviewed_by: user.id,
        reviewed_at: new Date().toISOString(),
        revision_instructions: instructions
      });

      await base44.entities.Address.update(receipt.address_id, {
        receipt_status: 'needs_revision'
      });

      // Notify worker
      await base44.entities.Notification.create({
        company_id: receipt.company_id,
        user_id: receipt.worker_id,
        recipient_role: 'server',
        type: 'receipt_needs_revision',
        title: 'Receipt Needs Revision',
        body: `Please revise your receipt for ${address?.normalized_address || address?.legal_address}: "${instructions}"`,
        data: { receipt_id: receiptId, instructions },
        action_url: `/SubmitReceipt?addressId=${receipt.address_id}&routeId=${receipt.route_id}&parentReceiptId=${receiptId}`,
        priority: 'high'
      });

      // Audit log
      await base44.entities.AuditLog.create({
        company_id: receipt.company_id,
        action_type: 'receipt_revision_requested',
        actor_id: user.id,
        actor_role: 'boss',
        target_type: 'receipt',
        target_id: receiptId,
        details: { instructions },
        timestamp: new Date().toISOString()
      });
    },
    onSuccess: () => {
      toast.success('Revision requested');
      setRevisionDialogOpen(false);
      queryClient.invalidateQueries({ queryKey: ['receipt'] });
      queryClient.invalidateQueries({ queryKey: ['receiptQueue'] });
      navigate(createPageUrl('ReceiptQueue'));
    },
    onError: (error) => {
      toast.error(error.message || 'Failed to request revision');
    }
  });

  // Delete mutation (for testing/duplicates)
  const deleteMutation = useMutation({
    mutationFn: async () => {
      // Delete the receipt
      await base44.entities.Receipt.delete(receiptId);

      // Reset address receipt status if no other receipts exist
      const remainingReceipts = await base44.entities.Receipt.filter({ address_id: receipt.address_id });
      const otherReceipts = remainingReceipts.filter(r => r.id !== receiptId);
      
      if (otherReceipts.length === 0) {
        await base44.entities.Address.update(receipt.address_id, {
          receipt_status: 'pending',
          latest_receipt_id: null,
          receipt_count: 0,
          receipt_submitted_at: null
        });
      } else {
        // Update to latest remaining receipt
        const latestReceipt = otherReceipts[0];
        await base44.entities.Address.update(receipt.address_id, {
          latest_receipt_id: latestReceipt.id,
          receipt_count: otherReceipts.length,
          receipt_status: latestReceipt.status === 'approved' ? 'approved' : 'pending_review'
        });
      }
    },
    onSuccess: () => {
      toast.success('Receipt deleted');
      setDeleteDialogOpen(false);
      queryClient.invalidateQueries({ queryKey: ['receipt'] });
      queryClient.invalidateQueries({ queryKey: ['receiptQueue'] });
      navigate(createPageUrl('ReceiptQueue'));
    },
    onError: (error) => {
      toast.error(error.message || 'Failed to delete');
    }
  });

  if (receiptLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
      </div>
    );
  }

  if (!receipt) {
    return (
      <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center p-4">
        <p className="text-gray-600 mb-4">Receipt not found</p>
        <Button onClick={() => navigate(createPageUrl('ReceiptQueue'))}>Go Back</Button>
      </div>
    );
  }

  const photoUrls = receipt.photo_urls || [];
  const isPending = receipt.status === 'pending_review';

  return (
    <div className="min-h-screen bg-gray-50 pb-24">
      {/* Header */}
      <header className="bg-white border-b sticky top-0 z-10">
        <div className="px-4 py-3 flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate(createPageUrl('ReceiptQueue'))}>
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <div className="flex-1">
            <h1 className="text-lg font-semibold">Receipt Review</h1>
            {receipt.is_resubmission && (
              <p className="text-xs text-orange-600">Resubmission v{receipt.version}</p>
            )}
          </div>
        </div>
      </header>

      <main className="px-4 py-4 max-w-2xl mx-auto space-y-4">
        {/* Address */}
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-start gap-3">
              <MapPin className="w-5 h-5 text-blue-500 mt-0.5" />
              <div>
                <p className="font-medium">{address?.normalized_address || address?.legal_address || 'Unknown'}</p>
                <p className="text-sm text-gray-500">Route: {route?.folder_name || 'Unknown'}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Worker Info */}
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-start gap-3">
              <User className="w-5 h-5 text-gray-500 mt-0.5" />
              <div>
                <p className="font-medium">{worker?.full_name || 'Unknown'}</p>
                <p className="text-sm text-gray-500">
                  Submitted: {receipt.submitted_at && format(new Date(receipt.submitted_at), 'MMM d, yyyy h:mm a')}
                </p>
                {receipt.submitted_location && (
                  <p className="text-xs text-green-600 mt-1">
                    📍 Location verified (±{Math.round(receipt.submitted_location.accuracy || 0)}m)
                  </p>
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Service Details */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Service Details</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="flex justify-between">
              <span className="text-gray-500">Outcome</span>
              <span className="font-semibold">{OUTCOME_LABELS[receipt.outcome]}</span>
            </div>
            {receipt.recipient_name && (
              <div className="flex justify-between">
                <span className="text-gray-500">Recipient</span>
                <span>
                  {receipt.recipient_name}
                  <span className="text-gray-500 text-sm">
                    {' '}({RELATIONSHIP_LABELS[receipt.recipient_relationship]}
                    {receipt.recipient_relationship === 'other' && `: ${receipt.recipient_relationship_other}`})
                  </span>
                </span>
              </div>
            )}
            <div className="flex justify-between">
              <span className="text-gray-500">Service Date/Time</span>
              <span>
                {receipt.service_date && format(new Date(receipt.service_date), 'MMM d, yyyy')}
                {receipt.service_time && ` at ${receipt.service_time}`}
              </span>
            </div>
          </CardContent>
        </Card>

        {/* Photos */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Camera className="w-4 h-4" />
              Photos ({photoUrls.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-3 gap-2">
              {photoUrls.map((url, idx) => (
                <button
                  key={idx}
                  className="aspect-square rounded-lg overflow-hidden bg-gray-100 hover:opacity-90 transition-opacity"
                  onClick={() => setPreviewImage(url)}
                >
                  <img
                    src={url}
                    alt={`Photo ${idx + 1}`}
                    className="w-full h-full object-cover"
                  />
                </button>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Signature */}
        {receipt.has_signature && receipt.signature_url && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <PenTool className="w-4 h-4" />
                Signature
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="border rounded-lg p-2 bg-white">
                <img
                  src={receipt.signature_url}
                  alt="Signature"
                  className="max-h-32 mx-auto"
                />
              </div>
            </CardContent>
          </Card>
        )}

        {/* Notes */}
        {receipt.notes && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Worker Notes</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-gray-700 whitespace-pre-wrap bg-gray-50 p-3 rounded-lg">
                "{receipt.notes}"
              </p>
            </CardContent>
          </Card>
        )}

        {/* Version History */}
        {versionHistory.length > 1 && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <History className="w-4 h-4" />
                Version History
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {versionHistory.map((v) => (
                  <div 
                    key={v.id} 
                    className={`text-sm p-2 rounded ${v.id === receipt.id ? 'bg-blue-50 border border-blue-200' : 'bg-gray-50'}`}
                  >
                    <span className="font-medium">Version {v.version}</span>
                    <span className="text-gray-500 ml-2">
                      {v.submitted_at && format(new Date(v.submitted_at), 'MMM d, h:mm a')}
                    </span>
                    <Badge className="ml-2" variant="outline">
                      {v.status}
                    </Badge>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Action Buttons - Only show if pending */}
        {isPending && (
          <Card className="border-blue-200 bg-blue-50">
            <CardContent className="pt-4">
              <div className="grid grid-cols-3 gap-2">
                <Button
                  onClick={() => approveMutation.mutate()}
                  disabled={approveMutation.isPending}
                  className="bg-green-600 hover:bg-green-700"
                >
                  {approveMutation.isPending ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <>
                      <CheckCircle className="w-4 h-4 mr-1" />
                      Approve
                    </>
                  )}
                </Button>
                <Button
                  variant="outline"
                  onClick={() => setRejectDialogOpen(true)}
                  className="border-red-300 text-red-600 hover:bg-red-50"
                >
                  <XCircle className="w-4 h-4 mr-1" />
                  Reject
                </Button>
                <Button
                  variant="outline"
                  onClick={() => setRevisionDialogOpen(true)}
                  className="border-orange-300 text-orange-600 hover:bg-orange-50"
                >
                  <AlertCircle className="w-4 h-4 mr-1" />
                  Revision
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Delete Button (for testing/duplicates) */}
        <Card className="border-gray-200">
          <CardContent className="pt-4">
            <Button
              variant="outline"
              onClick={() => setDeleteDialogOpen(true)}
              className="w-full border-red-300 text-red-600 hover:bg-red-50"
            >
              <Trash2 className="w-4 h-4 mr-2" />
              Delete Receipt (Testing)
            </Button>
          </CardContent>
        </Card>
      </main>

      <BossBottomNav currentPage="BossDashboard" />

      {/* Image Preview Dialog */}
      <Dialog open={!!previewImage} onOpenChange={() => setPreviewImage(null)}>
        <DialogContent className="max-w-3xl p-2">
          {previewImage && (
            <img src={previewImage} alt="Preview" className="w-full rounded-lg" />
          )}
        </DialogContent>
      </Dialog>

      {/* Reject Dialog */}
      <Dialog open={rejectDialogOpen} onOpenChange={setRejectDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reject Receipt</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-gray-600">Why is this receipt being rejected?</p>
            
            <div className="flex flex-wrap gap-2">
              {QUICK_REJECTION_REASONS.map((reason) => (
                <Button
                  key={reason}
                  variant="outline"
                  size="sm"
                  onClick={() => setRejectionReason(reason)}
                  className={rejectionReason === reason ? 'border-red-500 bg-red-50' : ''}
                >
                  {reason}
                </Button>
              ))}
            </div>

            <Textarea
              placeholder="Additional details (optional)..."
              value={rejectionReason}
              onChange={(e) => setRejectionReason(e.target.value)}
              rows={3}
            />

            <p className="text-xs text-orange-600">
              ⚠️ Worker will be notified of rejection.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRejectDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => rejectMutation.mutate(rejectionReason)}
              disabled={!rejectionReason.trim() || rejectMutation.isPending}
              className="bg-red-600 hover:bg-red-700"
            >
              {rejectMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Reject Receipt'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Revision Dialog */}
      <Dialog open={revisionDialogOpen} onOpenChange={setRevisionDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Request Revision</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-gray-600">What changes are needed?</p>
            
            <div className="flex flex-wrap gap-2">
              {QUICK_REJECTION_REASONS.map((reason) => (
                <Button
                  key={reason}
                  variant="outline"
                  size="sm"
                  onClick={() => setRevisionInstructions(reason)}
                  className={revisionInstructions === reason ? 'border-orange-500 bg-orange-50' : ''}
                >
                  {reason}
                </Button>
              ))}
            </div>

            <Textarea
              placeholder="Describe what needs to be fixed..."
              value={revisionInstructions}
              onChange={(e) => setRevisionInstructions(e.target.value)}
              rows={3}
            />

            <p className="text-xs text-orange-600">
              ⚠️ Worker will be asked to resubmit with corrections.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRevisionDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => revisionMutation.mutate(revisionInstructions)}
              disabled={!revisionInstructions.trim() || revisionMutation.isPending}
              className="bg-orange-600 hover:bg-orange-700"
            >
              {revisionMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Request Revision'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Dialog */}
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Receipt</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-gray-600">
              Are you sure you want to delete this receipt? This action cannot be undone.
            </p>
            <p className="text-xs text-red-600">
              ⚠️ This is intended for removing duplicates or testing purposes only.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => deleteMutation.mutate()}
              disabled={deleteMutation.isPending}
              className="bg-red-600 hover:bg-red-700"
            >
              {deleteMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Delete Receipt'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}