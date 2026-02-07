import React, { useState, useEffect, useRef } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { format } from 'date-fns';
import { 
  Loader2, MapPin, Clock, User, FileText, AlertCircle, Camera, Upload, 
  CheckCircle, Edit3, RefreshCw, Send, X 
} from 'lucide-react';
import { toast } from 'sonner';
import { calculateDistanceFeet } from '@/components/services/GeoService';
import { getCompanyId } from '@/components/utils/companyUtils';

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
  parentReceipt = null,
  onSuccess,
  onCancel 
}) {
  const [submitting, setSubmitting] = useState(false);
  const [hasSubmitted, setHasSubmitted] = useState(false);
  const fileInputRef = useRef(null);
  const signatureCanvasRef = useRef(null);

  // Location state
  const [serveCoordinates, setServeCoordinates] = useState(null);
  const [serveDistance, setServeDistance] = useState(null);
  const [gettingLocation, setGettingLocation] = useState(false);

  // Form state
  const [recipientName, setRecipientName] = useState(parentReceipt?.recipient_name || '');
  const [recipientRelationship, setRecipientRelationship] = useState(parentReceipt?.recipient_relationship || 'defendant');
  const [recipientRelationshipOther, setRecipientRelationshipOther] = useState(parentReceipt?.recipient_relationship_other || '');
  const [locationType, setLocationType] = useState(parentReceipt?.location_type || 'address_on_file');
  const [meetingPlaceAddress, setMeetingPlaceAddress] = useState(parentReceipt?.location_type === 'meeting_place' ? parentReceipt?.serve_address : '');
  const [serviceDate, setServiceDate] = useState(parentReceipt?.service_date || format(new Date(), 'yyyy-MM-dd'));
  const [serviceTime, setServiceTime] = useState(parentReceipt?.service_time || format(new Date(), 'HH:mm'));
  const [photos, setPhotos] = useState([]);
  const [signature, setSignature] = useState(null);
  const [savedSignature, setSavedSignature] = useState(null);
  const [showSignaturePad, setShowSignaturePad] = useState(false);
  const [notes, setNotes] = useState(parentReceipt?.notes || '');
  
  // Camera state
  const [showCamera, setShowCamera] = useState(false);
  const videoRef = useRef(null);
  const streamRef = useRef(null);

  // Signature drawing state
  const [isDrawing, setIsDrawing] = useState(false);
  const [lastPos, setLastPos] = useState({ x: 0, y: 0 });

  // Settings
  const minPhotos = bossSettings?.min_photos_per_receipt || 1;
  const maxPhotos = bossSettings?.max_photos_per_receipt || 5;
  const isSignatureRequired = bossSettings?.signature_required ?? false;

  // Auto-fill recipient name from address data
  useEffect(() => {
    if (!recipientName && (address?.defendant_name || address?.recipient_name)) {
      setRecipientName(address.defendant_name || address.recipient_name);
    }
  }, [address, recipientName]);

  // Check for existing receipt on mount
  useEffect(() => {
    checkExistingReceipt();
    loadSavedSignature();
    captureServeLocation();
  }, []);

  const checkExistingReceipt = async () => {
    if (!address?.id || parentReceipt) return;
    try {
      const existingReceipts = await base44.entities.Receipt.filter({ address_id: address.id });
      if (existingReceipts.length > 0) {
        setHasSubmitted(true);
      }
    } catch (error) {
      console.log('Error checking receipts:', error);
    }
  };

  const loadSavedSignature = async () => {
    if (!user?.id) return;
    try {
      const settings = await base44.entities.UserSettings.filter({ user_id: user.id });
      if (settings[0]?.saved_signature) {
        setSavedSignature(settings[0].saved_signature);
        setSignature(settings[0].saved_signature);
      }
    } catch (error) {
      console.log('No saved signature found');
    }
  };

  const captureServeLocation = async () => {
    setGettingLocation(true);
    try {
      const position = await new Promise((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(resolve, reject, {
          enableHighAccuracy: true,
          timeout: 15000,
          maximumAge: 0
        });
      });
      
      const coords = {
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
        accuracy: position.coords.accuracy
      };
      
      setServeCoordinates(coords);
      
      if (address?.lat && address?.lng) {
        const distance = calculateDistanceFeet(
          coords.latitude,
          coords.longitude,
          address.lat,
          address.lng
        );
        setServeDistance(Math.round(distance));
      }
    } catch (error) {
      console.log('Could not get location:', error.message);
    } finally {
      setGettingLocation(false);
    }
  };

  // Camera functions
  const startCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment', width: { ideal: 1920 }, height: { ideal: 1080 } },
        audio: false
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
      setShowCamera(true);
    } catch (error) {
      toast.error('Could not access camera');
      console.error('Camera error:', error);
    }
  };

  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    setShowCamera(false);
  };

  const capturePhoto = async () => {
    if (!videoRef.current) return;
    
    const canvas = document.createElement('canvas');
    canvas.width = videoRef.current.videoWidth;
    canvas.height = videoRef.current.videoHeight;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(videoRef.current, 0, 0);
    
    canvas.toBlob(async (blob) => {
      try {
        const file = new File([blob], `receipt_photo_${Date.now()}.jpg`, { type: 'image/jpeg' });
        const { file_url } = await base44.integrations.Core.UploadFile({ file });
        setPhotos(prev => [...prev, file_url]);
        toast.success('Photo added');
        stopCamera();
      } catch (error) {
        toast.error('Failed to upload photo');
      }
    }, 'image/jpeg', 0.85);
  };

  const handleFileUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    try {
      const { file_url } = await base44.integrations.Core.UploadFile({ file });
      setPhotos(prev => [...prev, file_url]);
      toast.success('Photo added');
    } catch (error) {
      toast.error('Failed to upload photo');
    }
    e.target.value = '';
  };

  const removePhoto = (index) => {
    setPhotos(prev => prev.filter((_, i) => i !== index));
  };

  // Signature drawing functions
  const getPos = (e) => {
    const canvas = signatureCanvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;
    return {
      x: (clientX - rect.left) * (canvas.width / rect.width),
      y: (clientY - rect.top) * (canvas.height / rect.height)
    };
  };

  const startDrawing = (e) => {
    e.preventDefault();
    setIsDrawing(true);
    setLastPos(getPos(e));
  };

  const draw = (e) => {
    if (!isDrawing) return;
    e.preventDefault();
    
    const canvas = signatureCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const pos = getPos(e);
    
    ctx.beginPath();
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    ctx.moveTo(lastPos.x, lastPos.y);
    ctx.lineTo(pos.x, pos.y);
    ctx.stroke();
    
    setLastPos(pos);
  };

  const stopDrawing = () => {
    setIsDrawing(false);
  };

  const clearCanvas = () => {
    const canvas = signatureCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
  };

  const useSignatureFromCanvas = () => {
    const canvas = signatureCanvasRef.current;
    if (!canvas) return;
    const dataUrl = canvas.toDataURL('image/png');
    setSignature(dataUrl);
    setShowSignaturePad(false);
  };

  const saveSignatureTemplate = async () => {
    const canvas = signatureCanvasRef.current;
    if (!canvas) return;
    
    try {
      const dataUrl = canvas.toDataURL('image/png');
      const blob = await fetch(dataUrl).then(r => r.blob());
      const file = new File([blob], `signature_${user.id}.png`, { type: 'image/png' });
      const { file_url } = await base44.integrations.Core.UploadFile({ file });
      
      const settings = await base44.entities.UserSettings.filter({ user_id: user.id });
      if (settings[0]) {
        await base44.entities.UserSettings.update(settings[0].id, { saved_signature: file_url });
      } else {
        await base44.entities.UserSettings.create({ user_id: user.id, saved_signature: file_url });
      }
      
      setSavedSignature(file_url);
      setSignature(file_url);
      setShowSignaturePad(false);
      toast.success('Signature saved as template!');
    } catch (error) {
      toast.error('Failed to save signature');
    }
  };

  const validateForm = () => {
    if (!recipientName.trim()) {
      toast.error('Please enter recipient name');
      return false;
    }

    if (recipientRelationship === 'other' && !recipientRelationshipOther.trim()) {
      toast.error('Please specify the relationship');
      return false;
    }

    if (photos.length < minPhotos) {
      toast.error(`At least ${minPhotos} photo(s) required`);
      return false;
    }

    if (isSignatureRequired && !signature) {
      toast.error('Signature required');
      return false;
    }

    if (locationType === 'meeting_place' && !meetingPlaceAddress.trim()) {
      toast.error('Please enter the meeting place address');
      return false;
    }

    return true;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (submitting || hasSubmitted) {
      if (hasSubmitted && !parentReceipt) {
        toast.error('Receipt already submitted for this address');
      }
      return;
    }

    if (!validateForm()) return;

    setSubmitting(true);

    try {
      // Upload signature if it's a data URL
      let signatureUrl = signature;
      if (signature && signature.startsWith('data:')) {
        const blob = await fetch(signature).then(r => r.blob());
        const file = new File([blob], `sig_${Date.now()}.png`, { type: 'image/png' });
        const { file_url } = await base44.integrations.Core.UploadFile({ file });
        signatureUrl = file_url;
      }

      // Determine serve address
      const serveAddress = locationType === 'meeting_place' 
        ? meetingPlaceAddress 
        : `${address.normalized_address || address.legal_address}`;

      // Determine version
      let version = 1;
      let isResubmission = false;
      if (parentReceipt) {
        version = (parentReceipt.version || 1) + 1;
        isResubmission = true;
      }

      // Create receipt
      const receipt = await base44.entities.Receipt.create({
        company_id: getCompanyId(user),
        address_id: address.id,
        route_id: route.id,
        worker_id: user.id,
        attempt_id: attempt?.id,
        parent_receipt_id: parentReceipt?.id || null,
        version,
        is_resubmission: isResubmission,
        submitted_at: new Date().toISOString(),
        submitted_location: serveCoordinates,
        outcome: 'served',
        recipient_name: recipientName,
        recipient_relationship: recipientRelationship,
        recipient_relationship_other: recipientRelationship === 'other' ? recipientRelationshipOther : null,
        location_type: locationType,
        serve_address: serveAddress,
        serve_latitude: serveCoordinates?.latitude,
        serve_longitude: serveCoordinates?.longitude,
        serve_distance_feet: serveDistance,
        service_date: serviceDate,
        service_time: serviceTime,
        photo_urls: photos,
        photo_count: photos.length,
        signature_url: signatureUrl,
        has_signature: !!signatureUrl,
        notes,
        status: 'pending_review'
      });

      // Update attempt if exists
      if (attempt?.id) {
        await base44.entities.Attempt.update(attempt.id, {
          has_receipt: true,
          receipt_id: receipt.id,
          outcome: 'served'
        });
      }

      // Update address
      const addressUpdate = {
        receipt_status: 'pending_review',
        latest_receipt_id: receipt.id,
        receipt_submitted_at: new Date().toISOString(),
        served: true,
        served_at: new Date().toISOString(),
        status: 'served'
      };
      
      await base44.entities.Address.update(address.id, addressUpdate);
      
      // Update route served count - read AFTER write to reduce race window
      const routeAddresses = await base44.entities.Address.filter({ 
        route_id: route.id, 
        deleted_at: null 
      });
      const servedCount = routeAddresses.filter(a => a.served).length;
      await base44.entities.Route.update(route.id, {
        served_count: servedCount
      });

      // Notify bosses/admins
      const allUsers = await base44.entities.User.filter({ 
        company_id: getCompanyId(user) 
      });
      const bosses = allUsers.filter(u => u.role === 'boss' || u.role === 'admin');

      for (const boss of bosses) {
        await base44.entities.Notification.create({
          company_id: getCompanyId(user),
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
        company_id: getCompanyId(user),
        action_type: isResubmission ? 'receipt_resubmitted' : 'receipt_submitted',
        actor_id: user.id,
        actor_role: 'server',
        target_type: 'receipt',
        target_id: receipt.id,
        details: {
          address_id: address.id,
          outcome: 'served',
          photo_count: photos.length,
          has_signature: !!signatureUrl,
          version,
          location_type: locationType
        },
        timestamp: new Date().toISOString()
      });

      setHasSubmitted(true);
      
      toast.success('Receipt sent to boss for review!', {
        duration: 4000,
        icon: '✅'
      });
      
      setTimeout(() => {
        onSuccess?.(receipt);
      }, 1500);

    } catch (error) {
      console.error('Failed to submit receipt:', error);
      toast.error(error.message || 'Failed to submit receipt');
    } finally {
      setSubmitting(false);
    }
  };

  // Format address for display
  const formatAddressDisplay = () => {
    const street = (address.normalized_address || address.legal_address || '').split(',')[0];
    const city = address.city || '';
    const state = address.state || '';
    const zip = address.zip || '';
    return { street, cityStateZip: `${city}, ${state} ${zip}` };
  };

  const addressDisplay = formatAddressDisplay();

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

      {/* Recipient Information */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <User className="w-4 h-4" />
            Recipient Information
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label htmlFor="recipientName">Name *</Label>
            <Input
              id="recipientName"
              value={recipientName}
              onChange={(e) => setRecipientName(e.target.value)}
              placeholder="Name of person served"
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

      {/* Service Location */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <MapPin className="w-4 h-4" />
            Service Location
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Location Type Tabs */}
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setLocationType('address_on_file')}
              className={`flex-1 py-3 px-4 rounded-lg font-semibold text-sm transition ${
                locationType === 'address_on_file'
                  ? 'bg-orange-500 text-white'
                  : 'bg-gray-100 text-gray-600'
              }`}
            >
              📍 Address on File
            </button>
            <button
              type="button"
              onClick={() => setLocationType('meeting_place')}
              className={`flex-1 py-3 px-4 rounded-lg font-semibold text-sm transition ${
                locationType === 'meeting_place'
                  ? 'bg-orange-500 text-white'
                  : 'bg-gray-100 text-gray-600'
              }`}
            >
              🤝 Meeting Place
            </button>
          </div>

          {/* Address on File */}
          {locationType === 'address_on_file' && (
            <div className="bg-gray-50 rounded-lg p-4 border border-gray-200">
              <p className="font-semibold">{addressDisplay.street}</p>
              <p className="text-gray-600">{addressDisplay.cityStateZip}</p>
              <p className="text-xs text-green-600 mt-2">✓ Using address from case file</p>
            </div>
          )}

          {/* Meeting Place */}
          {locationType === 'meeting_place' && (
            <div className="space-y-3">
              <Input
                value={meetingPlaceAddress}
                onChange={(e) => setMeetingPlaceAddress(e.target.value)}
                placeholder="Enter full address of meeting place"
              />
              <p className="text-xs text-gray-500">
                Enter the address where service was completed (restaurant, workplace, etc.)
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* GPS Location Data */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium">Service Location Data</CardTitle>
        </CardHeader>
        <CardContent>
          {serveCoordinates ? (
            <div className="bg-green-50 rounded-lg p-3 border border-green-200">
              <div className="flex items-center gap-2 mb-2">
                <MapPin className="w-4 h-4 text-green-600" />
                <span className="text-sm font-semibold text-green-700">Location Captured</span>
              </div>
              <p className="text-xs text-gray-600 mb-1">
                Coordinates: {serveCoordinates.latitude.toFixed(6)}, {serveCoordinates.longitude.toFixed(6)}
              </p>
              {serveDistance !== null && (
                <p className="text-xs text-gray-600">
                  Distance from address on file: {serveDistance.toLocaleString()} feet
                </p>
              )}
            </div>
          ) : (
            <div className="bg-amber-50 rounded-lg p-3 border border-amber-200">
              <p className="text-sm text-amber-700">Location not captured yet</p>
            </div>
          )}
          
          <Button
            type="button"
            onClick={captureServeLocation}
            disabled={gettingLocation}
            variant="outline"
            className="w-full mt-3"
          >
            {gettingLocation ? (
              <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Getting Location...</>
            ) : (
              <><RefreshCw className="w-4 h-4 mr-2" /> Refresh Location</>
            )}
          </Button>
        </CardContent>
      </Card>

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
          {/* Photo Grid */}
          {photos.length > 0 && (
            <div className="grid grid-cols-3 gap-2 mb-3">
              {photos.map((url, index) => (
                <div key={index} className="relative aspect-square">
                  <img src={url} alt={`Photo ${index + 1}`} className="w-full h-full object-cover rounded-lg" />
                  <button
                    type="button"
                    onClick={() => removePhoto(index)}
                    className="absolute -top-2 -right-2 w-6 h-6 bg-red-500 text-white rounded-full flex items-center justify-center text-sm"
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
          )}
          
          {/* Add Photo Buttons */}
          {photos.length < maxPhotos && (
            <div className="flex gap-2">
              <Button
                type="button"
                onClick={startCamera}
                variant="outline"
                className="flex-1"
              >
                <Camera className="w-4 h-4 mr-2" />
                Take Photo
              </Button>
              <Button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                variant="outline"
                className="flex-1"
              >
                <Upload className="w-4 h-4 mr-2" />
                Upload
              </Button>
            </div>
          )}
          
          <input
            type="file"
            ref={fileInputRef}
            accept="image/*"
            className="hidden"
            onChange={handleFileUpload}
          />
        </CardContent>
      </Card>

      {/* Signature */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium">
            Server Signature {isSignatureRequired ? '*' : '(Optional)'}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {/* Show current signature or placeholder */}
          {signature ? (
            <div className="border rounded-lg p-2 mb-3 bg-gray-50">
              <img src={signature} alt="Signature" className="max-h-24 mx-auto" />
            </div>
          ) : (
            <div className="border-2 border-dashed rounded-lg p-8 mb-3 text-center text-gray-400">
              No signature
            </div>
          )}
          
          {/* Signature Buttons */}
          <div className="space-y-2">
            {savedSignature && (
              <Button
                type="button"
                onClick={() => setSignature(savedSignature)}
                variant="outline"
                className="w-full border-green-300 text-green-700 hover:bg-green-50"
              >
                <CheckCircle className="w-4 h-4 mr-2" />
                Use Saved Signature
              </Button>
            )}
            
            <Button
              type="button"
              onClick={() => setShowSignaturePad(true)}
              variant="outline"
              className="w-full"
            >
              <Edit3 className="w-4 h-4 mr-2" />
              {signature ? 'Draw New Signature' : 'Add Signature'}
            </Button>
            
            {signature && (
              <Button
                type="button"
                onClick={() => setSignature(null)}
                variant="outline"
                className="w-full text-red-600 border-red-200"
              >
                Clear Signature
              </Button>
            )}
          </div>
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
          disabled={submitting || (hasSubmitted && !parentReceipt)}
          className={`flex-1 ${
            hasSubmitted && !parentReceipt
              ? 'bg-gray-400 cursor-not-allowed' 
              : 'bg-green-500 hover:bg-green-600'
          } text-white`}
        >
          {submitting ? (
            <><Loader2 className="w-4 h-4 animate-spin mr-2" /> Submitting...</>
          ) : hasSubmitted && !parentReceipt ? (
            <><CheckCircle className="w-4 h-4 mr-2" /> Already Submitted</>
          ) : (
            <><Send className="w-4 h-4 mr-2" /> Submit Receipt</>
          )}
        </Button>
      </div>

      {hasSubmitted && !parentReceipt && (
        <p className="text-center text-sm text-green-600 mt-2">
          ✓ This receipt has been sent to your boss for review
        </p>
      )}

      {/* Camera Modal */}
      {showCamera && (
        <div className="fixed inset-0 bg-black z-50 flex flex-col">
          <div className="flex items-center justify-between p-4 bg-black/50">
            <span className="text-white font-medium">Take Photo</span>
            <button onClick={stopCamera} className="text-white">
              <X className="w-6 h-6" />
            </button>
          </div>
          <div className="flex-1 flex items-center justify-center">
            <video 
              ref={videoRef} 
              autoPlay 
              playsInline 
              className="max-h-full max-w-full"
            />
          </div>
          <div className="p-6 bg-black/50 flex justify-center">
            <button
              onClick={capturePhoto}
              className="w-16 h-16 rounded-full bg-white border-4 border-gray-300"
            />
          </div>
        </div>
      )}

      {/* Signature Pad Modal */}
      {showSignaturePad && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl p-4 w-full max-w-md">
            <h3 className="text-lg font-bold mb-3">Draw Your Signature</h3>
            
            <div className="border-2 border-gray-300 rounded-lg mb-3 bg-white">
              <canvas
                ref={signatureCanvasRef}
                width={350}
                height={150}
                className="w-full touch-none"
                onMouseDown={startDrawing}
                onMouseMove={draw}
                onMouseUp={stopDrawing}
                onMouseLeave={stopDrawing}
                onTouchStart={startDrawing}
                onTouchMove={draw}
                onTouchEnd={stopDrawing}
              />
            </div>
            
            <div className="flex gap-2 mb-3">
              <Button type="button" variant="outline" className="flex-1" onClick={clearCanvas}>
                Clear
              </Button>
            </div>
            
            <div className="flex gap-2">
              <Button
                type="button"
                variant="outline"
                className="flex-1"
                onClick={() => setShowSignaturePad(false)}
              >
                Cancel
              </Button>
              <Button
                type="button"
                className="flex-1 bg-orange-500 hover:bg-orange-600 text-white"
                onClick={useSignatureFromCanvas}
              >
                Use
              </Button>
              <Button
                type="button"
                className="flex-1 bg-green-500 hover:bg-green-600 text-white"
                onClick={saveSignatureTemplate}
              >
                Save Template
              </Button>
            </div>
          </div>
        </div>
      )}
    </form>
  );
}