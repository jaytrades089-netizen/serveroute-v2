import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { format } from 'date-fns';
import { Loader2, MapPin, Clock, User, FileText, AlertCircle } from 'lucide-react';
import PhotoCapture from './PhotoCapture';
import SignatureCapture from './SignatureCapture';
import { toast } from 'sonner';

const RELATIONSHIP_OPTIONS = [
  { value: 'defendant', label: 'Defendant' },
  { value: 'spouse', label: 'Spouse' },
  { value: 'adult_household', label: 'Adult Household Member' },
  { value: 'property_manager', label: 'Property Manager' },
  { value: 'coworker', label: 'Coworker' },
  { value: 'other', label: 'Other' }
];

export default function ReceiptForm({ 
  address, 
  route, 
  attempt,
  bossSettings,
  user,
  parentReceipt = null, // For resubmissions
  onSuccess,
  onCancel 
}) {
  const [submitting, setSubmitting] = useState(false);
  const [location, setLocation] = useState(null);
  const [locationError, setLocationError] = useState(null);

  // Form state
  const [outcome, setOutcome] = useState(parentReceipt?.outcome || 'served');
  const [recipientName, setRecipientName] = useState(parentReceipt?.recipient_name || '');
  const [recipientRelationship, setRecipientRelationship] = useState(parentReceipt?.recipient_relationship || 'defendant');
  const [recipientRelationshipOther, setRecipientRelationshipOther] = useState(parentReceipt?.recipient_relationship_other || '');
  const [serviceDate, setServiceDate] = useState(parentReceipt?.service_date || format(new Date(), 'yyyy-MM-dd'));
  const [serviceTime, setServiceTime] = useState(parentReceipt?.service_time || format(new Date(), 'HH:mm'));
  const [photos, setPhotos] = useState([]);
  const [signatureBlob, setSignatureBlob] = useState(null);
  const [notes, setNotes] = useState(parentReceipt?.notes || '');

  // Settings
  const minPhotos = bossSettings?.min_photos_per_receipt || 1;
  const maxPhotos = bossSettings?.max_photos_per_receipt || 5;
  const receiptRequiredFor = bossSettings?.receipt_required_for || ['served', 'partially_served'];
  const signatureRequiredFor = bossSettings?.signature_required_for || ['served'];
  const isSignatureRequired = bossSettings?.signature_required && signatureRequiredFor.includes(outcome);

  // Get current location
  useEffect(() => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          setLocation({
            latitude: pos.coords.latitude,
            longitude: pos.coords.longitude,
            accuracy: pos.coords.accuracy
          });
        },
        (err) => {
          setLocationError('Could not get location');
          console.error('Location error:', err);
        },
        { enableHighAccuracy: true, timeout: 10000 }
      );
    }
  }, []);

  const validateForm = () => {
    if (photos.length < minPhotos) {
      toast.error(`At least ${minPhotos} photo(s) required`);
      return false;
    }

    if (isSignatureRequired && !signatureBlob) {
      toast.error('Signature required for this outcome');
      return false;
    }

    if (outcome !== 'not_served' && !recipientName.trim()) {
      toast.error('Recipient name required');
      return false;
    }

    if (recipientRelationship === 'other' && !recipientRelationshipOther.trim()) {
      toast.error('Please specify the relationship');
      return false;
    }

    return true;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (!validateForm()) return;

    setSubmitting(true);

    try {
      // Upload photos
      const photoUrls = [];
      for (const photo of photos) {
        const { file_url } = await base44.integrations.Core.UploadFile({ file: photo.file });
        photoUrls.push(file_url);
      }

      // Upload signature if provided
      let signatureUrl = null;
      if (signatureBlob) {
        const sigFile = new File([signatureBlob], `signature_${Date.now()}.png`, { type: 'image/png' });
        const { file_url } = await base44.integrations.Core.UploadFile({ file: sigFile });
        signatureUrl = file_url;
      }

      // Determine version
      let version = 1;
      let isResubmission = false;
      if (parentReceipt) {
        version = (parentReceipt.version || 1) + 1;
        isResubmission = true;
      }

      // Create receipt
      const receipt = await base44.entities.Receipt.create({
        company_id: user.company_id,
        address_id: address.id,
        route_id: route.id,
        worker_id: user.id,
        attempt_id: attempt?.id,
        parent_receipt_id: parentReceipt?.id || null,
        version,
        is_resubmission: isResubmission,
        submitted_at: new Date().toISOString(),
        submitted_location: location,
        outcome,
        recipient_name: recipientName,
        recipient_relationship: recipientRelationship,
        recipient_relationship_other: recipientRelationship === 'other' ? recipientRelationshipOther : null,
        service_date: serviceDate,
        service_time: serviceTime,
        photo_urls: photoUrls,
        photo_count: photoUrls.length,
        signature_url: signatureUrl,
        has_signature: !!signatureUrl,
        notes,
        status: 'pending'
      });

      // Update attempt if exists
      if (attempt?.id) {
        await base44.entities.Attempt.update(attempt.id, {
          has_receipt: true,
          receipt_id: receipt.id,
          outcome
        });
      }

      // Update address - also mark as served if outcome is served
      const receiptCount = await base44.entities.Receipt.filter({ address_id: address.id });
      const addressUpdate = {
        receipt_status: 'pending_review',
        latest_receipt_id: receipt.id,
        receipt_count: receiptCount.length,
        receipt_submitted_at: new Date().toISOString()
      };
      
      // Mark address as served if outcome is served or partially_served
      if (outcome === 'served' || outcome === 'partially_served') {
        addressUpdate.served = true;
        addressUpdate.served_at = new Date().toISOString();
        addressUpdate.status = 'served';
      }
      
      await base44.entities.Address.update(address.id, addressUpdate);
      
      // Update route served count if address was served
      if (outcome === 'served' || outcome === 'partially_served') {
        const routeAddresses = await base44.entities.Address.filter({ route_id: route.id });
        const servedCount = routeAddresses.filter(a => a.served || a.id === address.id).length;
        await base44.entities.Route.update(route.id, {
          served_count: servedCount
        });
      }

      // Notify bosses/admins
      const bosses = await base44.entities.User.filter({ 
        company_id: user.company_id, 
        role: 'admin' 
      });

      for (const boss of bosses) {
        await base44.entities.Notification.create({
          company_id: user.company_id,
          user_id: boss.id,
          recipient_role: 'boss',
          type: 'receipt_submitted',
          title: isResubmission ? 'Receipt Resubmitted' : 'New Receipt Submitted',
          body: `${user.full_name} submitted receipt for ${address.normalized_address || address.legal_address}`,
          data: { receipt_id: receipt.id, address_id: address.id, is_resubmission: isResubmission },
          action_url: `/ReceiptReview?receiptId=${receipt.id}`,
          priority: 'normal'
        });
      }

      // Audit log
      await base44.entities.AuditLog.create({
        company_id: user.company_id,
        action_type: isResubmission ? 'receipt_resubmitted' : 'receipt_submitted',
        actor_id: user.id,
        actor_role: 'server',
        target_type: 'receipt',
        target_id: receipt.id,
        details: {
          address_id: address.id,
          outcome,
          photo_count: photoUrls.length,
          has_signature: !!signatureUrl,
          version
        },
        timestamp: new Date().toISOString()
      });

      toast.success('Receipt submitted successfully');
      
      // Navigate immediately after success - call onSuccess and return to prevent further code execution
      onSuccess?.(receipt);
      return;

    } catch (error) {
      console.error('Failed to submit receipt:', error);
      toast.error(error.message || 'Failed to submit receipt');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {/* Address Info */}
      <Card>
        <CardContent className="pt-4">
          <div className="flex items-start gap-3">
            <MapPin className="w-5 h-5 text-blue-500 mt-0.5" />
            <div>
              <p className="font-medium">{address.normalized_address || address.legal_address}</p>
              <p className="text-sm text-gray-500">Route: {route.folder_name}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Resubmission Notice */}
      {parentReceipt && (
        <Card className="border-orange-200 bg-orange-50">
          <CardContent className="pt-4">
            <div className="flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-orange-500" />
              <div>
                <p className="font-medium text-orange-800">Resubmission Required</p>
                <p className="text-sm text-orange-700 mt-1">
                  {parentReceipt.revision_instructions || parentReceipt.rejection_reason}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Outcome Selection */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium">Service Outcome</CardTitle>
        </CardHeader>
        <CardContent>
          <RadioGroup value={outcome} onValueChange={setOutcome}>
            <div className="flex items-center space-x-2">
              <RadioGroupItem value="served" id="served" />
              <Label htmlFor="served" className="flex items-center gap-2 cursor-pointer">
                <span className="w-3 h-3 rounded-full bg-green-500" />
                Served
              </Label>
            </div>
            <div className="flex items-center space-x-2">
              <RadioGroupItem value="partially_served" id="partially_served" />
              <Label htmlFor="partially_served" className="flex items-center gap-2 cursor-pointer">
                <span className="w-3 h-3 rounded-full bg-yellow-500" />
                Partially Served
              </Label>
            </div>
            <div className="flex items-center space-x-2">
              <RadioGroupItem value="not_served" id="not_served" />
              <Label htmlFor="not_served" className="flex items-center gap-2 cursor-pointer">
                <span className="w-3 h-3 rounded-full bg-red-500" />
                Not Served
              </Label>
            </div>
          </RadioGroup>
        </CardContent>
      </Card>

      {/* Recipient Information - only for served/partially served */}
      {outcome !== 'not_served' && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <User className="w-4 h-4" />
              Recipient Information
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div>
              <Label htmlFor="recipientName">Name *</Label>
              <Input
                id="recipientName"
                value={recipientName}
                onChange={(e) => setRecipientName(e.target.value)}
                placeholder="Enter recipient's name"
              />
            </div>

            <div>
              <Label>Relationship to Defendant *</Label>
              <Select value={recipientRelationship} onValueChange={setRecipientRelationship}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {RELATIONSHIP_OPTIONS.map(opt => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {recipientRelationship === 'other' && (
              <div>
                <Label htmlFor="otherRelationship">Specify Relationship *</Label>
                <Input
                  id="otherRelationship"
                  value={recipientRelationshipOther}
                  onChange={(e) => setRecipientRelationshipOther(e.target.value)}
                  placeholder="Enter relationship"
                />
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Service Date & Time */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <Clock className="w-4 h-4" />
            Service Date & Time
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="serviceDate">Date</Label>
              <Input
                id="serviceDate"
                type="date"
                value={serviceDate}
                onChange={(e) => setServiceDate(e.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="serviceTime">Time</Label>
              <Input
                id="serviceTime"
                type="time"
                value={serviceTime}
                onChange={(e) => setServiceTime(e.target.value)}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Photos */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium">
            Photos * ({minPhotos}-{maxPhotos} required)
          </CardTitle>
        </CardHeader>
        <CardContent>
          <PhotoCapture
            photos={photos}
            onPhotosChange={setPhotos}
            maxPhotos={maxPhotos}
            minPhotos={minPhotos}
          />
        </CardContent>
      </Card>

      {/* Signature */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium">
            Signature {isSignatureRequired ? '*' : '(Optional)'}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <SignatureCapture
            onSignature={setSignatureBlob}
            required={isSignatureRequired}
          />
        </CardContent>
      </Card>

      {/* Notes */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <FileText className="w-4 h-4" />
            Notes
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Add any additional notes about the service..."
            rows={3}
          />
        </CardContent>
      </Card>

      {/* Location Status */}
      {locationError && (
        <p className="text-xs text-gray-400 text-center">{locationError} (optional)</p>
      )}
      {location && (
        <p className="text-xs text-green-600 text-center flex items-center justify-center gap-1">
          <MapPin className="w-3 h-3" />
          Location captured (±{Math.round(location.accuracy)}m)
        </p>
      )}

      {/* Actions */}
      <div className="flex gap-3 pt-2">
        <Button
          type="button"
          variant="outline"
          onClick={onCancel}
          disabled={submitting}
          className="flex-1"
        >
          Cancel
        </Button>
        <Button
          type="submit"
          disabled={submitting}
          className="flex-1 bg-blue-600 hover:bg-blue-700"
        >
          {submitting ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin mr-2" />
              Submitting...
            </>
          ) : (
            'Submit Receipt'
          )}
        </Button>
      </div>
    </form>
  );
}