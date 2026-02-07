import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { format } from 'date-fns';
import { Loader2, ArrowLeft, MapPin, User, Clock, Camera, PenTool, CheckCircle, XCircle, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent } from '@/components/ui/dialog';

const STATUS_CONFIG = {
  pending: { label: 'Pending Review', color: 'bg-yellow-100 text-yellow-700', icon: Clock },
  approved: { label: 'Approved', color: 'bg-green-100 text-green-700', icon: CheckCircle },
  rejected: { label: 'Rejected', color: 'bg-red-100 text-red-700', icon: XCircle },
  needs_revision: { label: 'Needs Revision', color: 'bg-orange-100 text-orange-700', icon: AlertCircle }
};

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

export default function ReceiptDetail() {
  const navigate = useNavigate();
  const urlParams = new URLSearchParams(window.location.search);
  const receiptId = urlParams.get('receiptId');
  const [previewImage, setPreviewImage] = useState(null);

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

  const { data: reviewer } = useQuery({
    queryKey: ['receiptReviewer', receipt?.reviewed_by],
    queryFn: async () => {
      if (!receipt?.reviewed_by) return null;
      const users = await base44.entities.User.filter({ id: receipt.reviewed_by });
      return users[0] || null;
    },
    enabled: !!receipt?.reviewed_by
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
        <Button onClick={() => navigate(-1)}>Go Back</Button>
      </div>
    );
  }

  // Ownership check - workers can only view their own receipts
  if (user?.role === 'server' && receipt && receipt.worker_id !== user.id) {
    return (
      <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center p-4">
        <p className="text-gray-600 mb-4">You don't have access to this receipt</p>
        <Button onClick={() => navigate(-1)}>Go Back</Button>
      </div>
    );
  }

  const statusConfig = STATUS_CONFIG[receipt.status];
  const StatusIcon = statusConfig?.icon || Clock;
  const photoUrls = receipt.photo_urls || [];

  return (
    <div className="min-h-screen bg-gray-50 pb-8">
      {/* Header */}
      <header className="bg-white border-b sticky top-0 z-10">
        <div className="px-4 py-3 flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <div className="flex-1">
            <h1 className="text-lg font-semibold">Receipt Details</h1>
          </div>
          <Badge className={statusConfig?.color}>
            <StatusIcon className="w-3 h-3 mr-1" />
            {statusConfig?.label}
          </Badge>
        </div>
      </header>

      <main className="px-4 py-4 max-w-lg mx-auto space-y-4">
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

        {/* Rejection/Revision Notice */}
        {(receipt.status === 'rejected' || receipt.status === 'needs_revision') && (
          <Card className="border-orange-200 bg-orange-50">
            <CardContent className="pt-4">
              <div className="flex items-start gap-3">
                <AlertCircle className="w-5 h-5 text-orange-500" />
                <div>
                  <p className="font-medium text-orange-800">
                    {receipt.status === 'rejected' ? 'Rejected' : 'Revision Required'}
                  </p>
                  <p className="text-sm text-orange-700 mt-1">
                    {receipt.revision_instructions || receipt.rejection_reason}
                  </p>
                  {reviewer && (
                    <p className="text-xs text-orange-600 mt-2">
                      By {reviewer.full_name} • {receipt.reviewed_at && format(new Date(receipt.reviewed_at), 'MMM d, h:mm a')}
                    </p>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Service Details */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Service Details</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex justify-between">
              <span className="text-gray-500">Outcome</span>
              <span className="font-medium">{OUTCOME_LABELS[receipt.outcome] || receipt.outcome}</span>
            </div>
            {receipt.recipient_name && (
              <div className="flex justify-between">
                <span className="text-gray-500">Recipient</span>
                <span className="font-medium">
                  {receipt.recipient_name}
                  {receipt.recipient_relationship && (
                    <span className="text-gray-500 font-normal">
                      {' '}({RELATIONSHIP_LABELS[receipt.recipient_relationship] || receipt.recipient_relationship}
                      {receipt.recipient_relationship === 'other' && receipt.recipient_relationship_other && 
                        `: ${receipt.recipient_relationship_other}`})
                    </span>
                  )}
                </span>
              </div>
            )}
            <div className="flex justify-between">
              <span className="text-gray-500">Service Date</span>
              <span className="font-medium">
                {receipt.service_date && format(new Date(receipt.service_date), 'MMM d, yyyy')}
                {receipt.service_time && ` at ${receipt.service_time}`}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">Submitted</span>
              <span className="font-medium">
                {receipt.submitted_at && format(new Date(receipt.submitted_at), 'MMM d, yyyy h:mm a')}
              </span>
            </div>
            {receipt.is_resubmission && (
              <div className="flex justify-between">
                <span className="text-gray-500">Version</span>
                <Badge variant="outline">v{receipt.version} (Resubmission)</Badge>
              </div>
            )}
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
            {photoUrls.length > 0 ? (
              <div className="grid grid-cols-3 gap-2">
                {photoUrls.map((url, idx) => (
                  <button
                    key={idx}
                    className="aspect-square rounded-lg overflow-hidden bg-gray-100"
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
            ) : (
              <p className="text-gray-500 text-sm">No photos</p>
            )}
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
              <CardTitle className="text-sm font-medium">Notes</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-gray-700 whitespace-pre-wrap">{receipt.notes}</p>
            </CardContent>
          </Card>
        )}

        {/* Approval Info */}
        {receipt.status === 'approved' && reviewer && (
          <Card className="border-green-200 bg-green-50">
            <CardContent className="pt-4">
              <div className="flex items-center gap-3">
                <CheckCircle className="w-5 h-5 text-green-500" />
                <div>
                  <p className="font-medium text-green-800">Approved</p>
                  <p className="text-sm text-green-700">
                    By {reviewer.full_name} • {receipt.reviewed_at && format(new Date(receipt.reviewed_at), 'MMM d, h:mm a')}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        )}
      </main>

      {/* Image Preview Dialog */}
      <Dialog open={!!previewImage} onOpenChange={() => setPreviewImage(null)}>
        <DialogContent className="max-w-2xl p-2">
          {previewImage && (
            <img
              src={previewImage}
              alt="Preview"
              className="w-full rounded-lg"
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}