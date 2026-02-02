import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { 
  ArrowLeft, 
  ArrowRight,
  Camera,
  Check, 
  Edit2, 
  Loader2, 
  RefreshCw,
  Trash2,
  X,
  FileText,
  AlertCircle
} from 'lucide-react';
import { toast } from 'sonner';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DOCUMENT_INFO,
  PAY_RATES,
  loadScanSession,
  saveScanSession,
  categorizeConfidence
} from '@/components/scanning/ScanningService';

export default function ScanPreview() {
  const navigate = useNavigate();
  const [session, setSession] = useState(null);
  const [editingAddress, setEditingAddress] = useState(null);
  const [editForm, setEditForm] = useState({
    street: '',
    city: '',
    state: 'MI',
    zip: '',
    defendantName: ''
  });

  const urlParams = new URLSearchParams(window.location.search);
  const sessionId = urlParams.get('sessionId');

  const { data: user } = useQuery({
    queryKey: ['currentUser'],
    queryFn: () => base44.auth.me()
  });

  // Fetch related addresses for duplicate detection
  const { data: companyAddresses = [] } = useQuery({
    queryKey: ['companyAddresses', user?.company_id],
    queryFn: () => base44.entities.Address.filter({ company_id: user?.company_id, deleted_at: null }),
    enabled: !!user?.company_id
  });

  useEffect(() => {
    if (sessionId) {
      const existingSession = loadScanSession(sessionId);
      if (existingSession) {
        setSession(existingSession);
      } else {
        navigate(createPageUrl('ScanDocumentType'));
      }
    } else {
      navigate(createPageUrl('ScanDocumentType'));
    }
  }, [sessionId, navigate]);

  // Check for related addresses
  const getRelatedAddresses = (normalizedKey) => {
    if (!normalizedKey || !companyAddresses.length) return [];
    return companyAddresses.filter(a => a.normalized_key === normalizedKey);
  };

  const handleEditClick = (address) => {
    setEditingAddress(address);
    setEditForm({
      street: address.extractedData?.street || '',
      city: address.extractedData?.city || '',
      state: address.extractedData?.state || 'MI',
      zip: address.extractedData?.zip || '',
      defendantName: address.defendantName || ''
    });
  };

  const handleSaveEdit = () => {
    if (!session || !editingAddress) return;

    const updatedAddresses = session.addresses.map(addr => {
      if (addr.tempId === editingAddress.tempId) {
        return {
          ...addr,
          extractedData: {
            street: editForm.street,
            city: editForm.city,
            state: editForm.state,
            zip: editForm.zip,
            fullAddress: `${editForm.street}, ${editForm.city}, ${editForm.state} ${editForm.zip}`
          },
          defendantName: editForm.defendantName,
          manuallyEdited: true,
          status: 'extracted'
        };
      }
      return addr;
    });

    const updatedSession = {
      ...session,
      addresses: updatedAddresses,
      lastUpdated: new Date().toISOString()
    };

    setSession(updatedSession);
    saveScanSession(updatedSession);
    setEditingAddress(null);
    toast.success('Address updated');
  };

  const handleRemove = (tempId) => {
    if (!session) return;

    const updatedAddresses = session.addresses.filter(a => a.tempId !== tempId);
    const updatedSession = {
      ...session,
      addresses: updatedAddresses,
      lastUpdated: new Date().toISOString()
    };

    setSession(updatedSession);
    saveScanSession(updatedSession);
    toast.success('Address removed');
  };

  const handleScanMore = () => {
    if (!session) return;
    navigate(createPageUrl(`ScanCamera?sessionId=${session.id}`));
  };

  const handleContinue = () => {
    if (!session) return;

    const validAddresses = session.addresses.filter(
      a => a.status === 'extracted' && a.extractedData?.street
    );

    if (validAddresses.length === 0) {
      toast.error('Please have at least one valid address before continuing');
      return;
    }

    const updatedSession = {
      ...session,
      currentStep: 'route_setup',
      lastUpdated: new Date().toISOString()
    };
    saveScanSession(updatedSession);
    navigate(createPageUrl(`ScanRouteSetup?sessionId=${session.id}`));
  };

  if (!session) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
      </div>
    );
  }

  const docInfo = DOCUMENT_INFO[session.documentType];
  const validCount = session.addresses.filter(a => a.status === 'extracted' && a.extractedData?.street).length;
  const failedCount = session.addresses.filter(a => a.status === 'failed' || !a.extractedData?.street).length;
  const estimatedEarnings = validCount * PAY_RATES[session.documentType];

  return (
    <div className="min-h-screen bg-gray-50 pb-24">
      {/* Header */}
      <div className="bg-white border-b px-4 py-3 flex items-center gap-3">
        <Link to={createPageUrl(`ScanCamera?sessionId=${session.id}`)}>
          <Button variant="ghost" size="icon">
            <ArrowLeft className="w-5 h-5" />
          </Button>
        </Link>
        <h1 className="text-lg font-semibold">Review Addresses</h1>
      </div>

      {/* Summary */}
      <div className="bg-white border-b px-4 py-4">
        <div className="flex items-center gap-2 mb-2">
          <span className="text-2xl">{docInfo?.icon}</span>
          <span className="font-semibold">{validCount} {docInfo?.name} Addresses</span>
        </div>
        <p className="text-green-600 font-semibold">
          Estimated Earnings: ${estimatedEarnings.toFixed(2)}
        </p>
        {failedCount > 0 && (
          <p className="text-orange-600 text-sm mt-1">
            {failedCount} address{failedCount !== 1 ? 'es' : ''} need{failedCount === 1 ? 's' : ''} attention
          </p>
        )}
      </div>

      {/* Address List */}
      <div className="p-4 space-y-3">
        {session.addresses.map((addr) => {
          const conf = categorizeConfidence(addr.confidence);
          const relatedAddresses = getRelatedAddresses(addr.normalizedKey);
          const hasRelated = relatedAddresses.length > 0;
          const isFailed = addr.status === 'failed' || !addr.extractedData?.street;

          return (
            <Card key={addr.tempId} className={isFailed ? 'border-red-300' : ''}>
              <CardContent className="p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    {isFailed ? (
                      <div className="flex items-center gap-2 text-red-600">
                        <X className="w-5 h-5" />
                        <span className="font-medium">Could not extract address</span>
                      </div>
                    ) : (
                      <>
                        <div className="flex items-center gap-2">
                          <span className={conf.color}>{conf.icon}</span>
                          <span className="font-medium truncate">
                            {addr.extractedData?.fullAddress}
                          </span>
                        </div>
                        {addr.defendantName && (
                          <p className="text-gray-600 text-sm mt-1">
                            {addr.defendantName}
                          </p>
                        )}
                        <div className="flex items-center gap-2 mt-2">
                          <Badge className={conf.bgColor + ' ' + conf.color}>
                            {Math.round(addr.confidence * 100)}% confidence
                          </Badge>
                          {addr.manuallyEdited && (
                            <Badge variant="outline">Edited</Badge>
                          )}
                          {hasRelated && (
                            <Badge className="bg-purple-100 text-purple-700">
                              📋 +{relatedAddresses.length} other doc(s) here
                            </Badge>
                          )}
                        </div>
                      </>
                    )}
                  </div>

                  <div className="flex items-center gap-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => handleEditClick(addr)}
                    >
                      <Edit2 className="w-4 h-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="text-red-500 hover:text-red-700"
                      onClick={() => handleRemove(addr.tempId)}
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </div>

                {/* Low confidence warning */}
                {!isFailed && conf.level !== 'high' && (
                  <div className={`mt-3 p-2 rounded-lg ${conf.bgColor} flex items-center gap-2`}>
                    <AlertCircle className={`w-4 h-4 ${conf.color}`} />
                    <span className={`text-sm ${conf.color}`}>{conf.message}</span>
                  </div>
                )}

                {/* Failed - show raw text */}
                {isFailed && addr.ocrRawText && (
                  <div className="mt-3 p-2 bg-gray-100 rounded text-xs text-gray-600 max-h-20 overflow-y-auto">
                    <p className="font-medium mb-1">OCR Text:</p>
                    {addr.ocrRawText.substring(0, 200)}...
                  </div>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Bottom Actions */}
      <div className="fixed bottom-0 left-0 right-0 bg-white border-t p-4 flex gap-3">
        <Button
          variant="outline"
          className="flex-1"
          onClick={handleScanMore}
        >
          <Camera className="w-4 h-4 mr-2" />
          Scan More
        </Button>
        <Button
          className="flex-1 bg-blue-600 hover:bg-blue-700"
          onClick={handleContinue}
          disabled={validCount === 0}
        >
          Continue
          <ArrowRight className="w-4 h-4 ml-2" />
        </Button>
      </div>

      {/* Edit Dialog */}
      <Dialog open={!!editingAddress} onOpenChange={() => setEditingAddress(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>
              {editingAddress?.extractedData?.street ? 'Edit Address' : 'Enter Address Manually'}
            </DialogTitle>
            <DialogDescription>
              {editingAddress?.extractedData?.street 
                ? 'Make corrections to the extracted address.'
                : 'OCR could not extract this address. Please enter manually.'}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div>
              <Label>Street Address *</Label>
              <Input
                value={editForm.street}
                onChange={(e) => setEditForm({ ...editForm, street: e.target.value })}
                placeholder="123 Main St"
              />
            </div>

            <div>
              <Label>City *</Label>
              <Input
                value={editForm.city}
                onChange={(e) => setEditForm({ ...editForm, city: e.target.value })}
                placeholder="Detroit"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>State *</Label>
                <Select 
                  value={editForm.state} 
                  onValueChange={(value) => setEditForm({ ...editForm, state: value })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="MI">MI</SelectItem>
                    <SelectItem value="OH">OH</SelectItem>
                    <SelectItem value="IN">IN</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>ZIP *</Label>
                <Input
                  value={editForm.zip}
                  onChange={(e) => setEditForm({ ...editForm, zip: e.target.value })}
                  placeholder="48201"
                />
              </div>
            </div>

            <div>
              <Label>Defendant Name (optional)</Label>
              <Input
                value={editForm.defendantName}
                onChange={(e) => setEditForm({ ...editForm, defendantName: e.target.value })}
                placeholder="John Smith"
              />
            </div>

            {editingAddress?.ocrRawText && (
              <div className="border-t pt-4">
                <Label className="text-gray-500">Original OCR Text:</Label>
                <div className="mt-1 p-2 bg-gray-100 rounded text-xs text-gray-600 max-h-24 overflow-y-auto">
                  {editingAddress.ocrRawText}
                </div>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setEditingAddress(null)}>
              Cancel
            </Button>
            <Button 
              onClick={handleSaveEdit}
              disabled={!editForm.street || !editForm.city || !editForm.zip}
            >
              Save Changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}