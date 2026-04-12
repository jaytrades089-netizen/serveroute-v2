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
  const [cameraReady, setCameraReady] = useState(false);
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

  // Load photos from attempt when attempt data arrives
  useEffect(() => {
    if (attempt?.photo_urls?.length > 0 && photos.length === 0) {
      setPhotos(attempt.photo_urls);
    }
  }, [attempt]);

  const checkExistingReceipt = async () => {
    if (!address?.id || parentReceipt) return;
    try {
      // Only mark as already submitted if address is already served
      // This prevents false "Already Submitted" when re-opening the page
      if (address.served && address.receipt_status && address.receipt_status !== 'pending') {
        const existingReceipts = await base44.entities.Receipt.filter({ address_id: address.id });
        if (existingReceipts.length > 0) {
          setHasSubmitted(true);
        }
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
      console.warn('Geolocation error:', error.code, error.message);
      // Graceful fallback - use address coordinates if available
      if (address?.lat && address?.lng) {
        setServeCoordinates({
          latitude: address.lat,
          longitude: address.lng,
          accuracy: null,
          fallback: true
        });
        setServeDistance(0);
      }
    } finally {
      setGettingLocation(false);
    }
  };

  // Camera functions
  const startCamera = async () => {
    setCameraReady(false);
    setShowCamera(true);
    document.body.classList.add('camera-active');
    
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment', width: { ideal: 1920 }, height: { ideal: 1080 } },
        audio: false
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        // Wait for video to be ready before allowing capture
        videoRef.current.onloadedmetadata = () => {
          videoRef.current.play();
          setCameraReady(true);
        };
      }
    } catch (error) {
      toast.error('Could not access camera. Please check permissions.');
      console.error('Camera error:', error);
      setShowCamera(false);
    }
  };

  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    setCameraReady(false);
    setShowCamera(false);
    document.body.classList.remove('camera-active');
  };

  const capturePhoto = async () => {
    if (!videoRef.current) return;
    
    const canvas = document.createElement('canvas');
    canvas.width = videoRef.current.videoWidth;
    canvas.height = videoRef.current.videoHeight;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(videoRef.current, 0, 0);
    
    canvas.toBlob(async (blob) => {
      if (blob.size > 10 * 1024 * 1024) {
        toast.error('Photo too large. Maximum size is 10MB.');
        return;
      }
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
    
    if (file.size > 10 * 1024 * 1024) {
      toast.error('Photo too large. Maximum size is 10MB.');
      return;
    }
    
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
      // Verify worker owns this route before creating receipt
      if (user?.role === 'server' && route?.worker_id !== user?.id) {
        toast.error('You cannot submit receipts for routes assigned to other workers');
        setSubmitting(false);
        return;
      }

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

      setHasSubmitted(true);
      
      toast.success('Receipt sent to boss for review!', {
        duration: 2000,
        icon: '✅'
      });

      // Complete any open scheduled serves BEFORE navigating
      try {
        const openServes = await base44.entities.ScheduledServe.filter({
          address_id: address.id,
          status: 'open'
        });
        for (const serve of openServes) {
          await base44.entities.ScheduledServe.update(serve.id, {
            status: 'completed',
            completed_at: new Date().toISOString()
          });
        }
      } catch (ssErr) {
        console.warn('Failed to complete scheduled serves:', ssErr);
      }
      
      // Navigate after scheduled serves are cleaned up
      if (onSuccess) {
        onSuccess(receipt);
      }

      // Background tasks - don't block navigation
      (async () => {
        try {
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
        } catch (bgError) {
          console.warn('Background task error:', bgError);
        }
      })();

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
      <div className="rounded-xl p-4" style={{ background: 'rgba(14,20,44,0.55)', backdropFilter: 'blur(14px)', WebkitBackdropFilter: 'blur(14px)', border: '1px solid rgba(255,255,255,0.10)' }}>
          <div className="flex items-start gap-3">
            <MapPin className="w-5 h-5 mt-0.5" style={{ color: '#e9c349' }} />
            <div>
              <p className="font-medium" style={{ color: '#E6E1E4' }}>{address.normalized_address || address.legal_address}</p>
              <p className="text-sm" style={{ color: '#6B7280' }}>Route: {route.folder_name}</p>
            </div>
          </div>
      </div>

      {/* Resubmission Notice */}
      {parentReceipt && (
        <div className="rounded-xl p-4" style={{ background: 'rgba(233,195,73,0.10)', border: '1px solid rgba(233,195,73,0.30)' }}>
            <div className="flex items-start gap-3">
              <AlertCircle className="w-5 h-5" style={{ color: '#e9c349' }} />
              <div>
                <p className="font-medium" style={{ color: '#e9c349' }}>Resubmission Required</p>
                <p className="text-sm mt-1" style={{ color: '#c9a030' }}>
                  {parentReceipt.revision_instructions || parentReceipt.rejection_reason}
                </p>
              </div>
            </div>
        </div>
      )}

      {/* Recipient Information */}
      <div className="rounded-xl p-4" style={{ background: 'rgba(14,20,44,0.55)', backdropFilter: 'blur(14px)', WebkitBackdropFilter: 'blur(14px)', border: '1px solid rgba(255,255,255,0.10)' }}>
        <p className="text-sm font-medium flex items-center gap-2 mb-4" style={{ color: '#9CA3AF' }}>
          <User className="w-4 h-4" />
          Recipient Information
        </p>
        <div className="space-y-4">
          <div>
            <Label htmlFor="recipientName" style={{ color: '#9CA3AF' }}>Name *</Label>
            <Input id="recipientName" value={recipientName} onChange={(e) => setRecipientName(e.target.value)} placeholder="Name of person served" className="mt-1" style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', color: '#E6E1E4' }} />
          </div>
          <div>
            <Label style={{ color: '#9CA3AF' }}>Relationship to Defendant *</Label>
            <Select value={recipientRelationship} onValueChange={setRecipientRelationship}>
              <SelectTrigger className="mt-1" style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', color: '#E6E1E4' }}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {RELATIONSHIP_OPTIONS.map(opt => (
                  <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {recipientRelationship === 'other' && (
            <div>
              <Label htmlFor="otherRelationship" style={{ color: '#9CA3AF' }}>Specify Relationship *</Label>
              <Input id="otherRelationship" value={recipientRelationshipOther} onChange={(e) => setRecipientRelationshipOther(e.target.value)} placeholder="Enter relationship" className="mt-1" style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', color: '#E6E1E4' }} />
            </div>
          )}
        </div>
      </div>

      {/* Service Location */}
      <div className="rounded-xl p-4" style={{ background: 'rgba(14,20,44,0.55)', backdropFilter: 'blur(14px)', WebkitBackdropFilter: 'blur(14px)', border: '1px solid rgba(255,255,255,0.10)' }}>
        <p className="text-sm font-medium flex items-center gap-2 mb-4" style={{ color: '#9CA3AF' }}>
          <MapPin className="w-4 h-4" />
          Service Location
        </p>
        <div className="space-y-4">
          <div className="flex gap-2">
            <button type="button" onClick={() => setLocationType('address_on_file')}
              className="flex-1 py-3 px-4 rounded-lg font-semibold text-sm transition"
              style={locationType === 'address_on_file'
                ? { background: 'rgba(233,195,73,0.18)', border: '1px solid rgba(233,195,73,0.40)', color: '#e9c349', backdropFilter: 'blur(12px)' }
                : { background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.10)', color: '#6B7280' }}
            >📍 Address on File</button>
            <button type="button" onClick={() => setLocationType('meeting_place')}
              className="flex-1 py-3 px-4 rounded-lg font-semibold text-sm transition"
              style={locationType === 'meeting_place'
                ? { background: 'rgba(233,195,73,0.18)', border: '1px solid rgba(233,195,73,0.40)', color: '#e9c349', backdropFilter: 'blur(12px)' }
                : { background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.10)', color: '#6B7280' }}
            >🤝 Meeting Place</button>
          </div>
          {locationType === 'address_on_file' && (
            <div className="rounded-lg p-4" style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.10)' }}>
              <p className="font-semibold" style={{ color: '#E6E1E4' }}>{addressDisplay.street}</p>
              <p style={{ color: '#9CA3AF' }}>{addressDisplay.cityStateZip}</p>
              <p className="text-xs mt-2" style={{ color: '#22c55e' }}>✓ Using address from case file</p>
            </div>
          )}
          {locationType === 'meeting_place' && (
            <div className="space-y-3">
              <Input value={meetingPlaceAddress} onChange={(e) => setMeetingPlaceAddress(e.target.value)} placeholder="Enter full address of meeting place" style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', color: '#E6E1E4' }} />
              <p className="text-xs" style={{ color: '#6B7280' }}>Enter the address where service was completed (restaurant, workplace, etc.)</p>
            </div>
          )}
        </div>
      </div>

      {/* GPS Location Data — fixed min-height prevents layout jump when location resolves */}
      <div className="rounded-xl p-4" style={{ background: 'rgba(14,20,44,0.55)', backdropFilter: 'blur(14px)', WebkitBackdropFilter: 'blur(14px)', border: '1px solid rgba(255,255,255,0.10)', minHeight: '140px' }}>
        <p className="text-sm font-medium mb-3" style={{ color: '#9CA3AF' }}>Service Location Data</p>
          {serveCoordinates ? (
            <div className="rounded-lg p-3" style={serveCoordinates.fallback
              ? { background: 'rgba(233,195,73,0.10)', border: '1px solid rgba(233,195,73,0.25)' }
              : { background: 'rgba(34,197,94,0.10)', border: '1px solid rgba(34,197,94,0.25)' }}>
              <div className="flex items-center gap-2 mb-2">
                <MapPin className="w-4 h-4" style={{ color: serveCoordinates.fallback ? '#e9c349' : '#22c55e' }} />
                <span className="text-sm font-semibold" style={{ color: serveCoordinates.fallback ? '#e9c349' : '#22c55e' }}>
                  {serveCoordinates.fallback ? 'Using Address Location' : 'Location Captured'}
                </span>
              </div>
              {serveCoordinates.fallback ? (
                <p className="text-xs" style={{ color: '#c9a030' }}>GPS unavailable — using address on file coordinates.</p>
              ) : (
                <>
                  <p className="text-xs mb-1" style={{ color: '#9CA3AF' }}>Coordinates: {serveCoordinates.latitude.toFixed(6)}, {serveCoordinates.longitude.toFixed(6)}</p>
                  {serveDistance !== null && <p className="text-xs" style={{ color: '#9CA3AF' }}>Distance from address on file: {serveDistance.toLocaleString()} feet</p>}
                </>
              )}
            </div>
          ) : (
            <div className="rounded-lg p-3" style={{ background: 'rgba(233,195,73,0.08)', border: '1px solid rgba(233,195,73,0.20)' }}>
              <p className="text-sm" style={{ color: '#c9a030' }}>Location not captured yet</p>
            </div>
          )}
          <Button type="button" onClick={captureServeLocation} disabled={gettingLocation} variant="outline" className="w-full mt-3" style={{ border: '1px solid rgba(255,255,255,0.15)', color: '#9CA3AF', background: 'rgba(255,255,255,0.05)' }}>
            {gettingLocation ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Getting Location...</> : <><RefreshCw className="w-4 h-4 mr-2" /> Refresh Location</>}
          </Button>
      </div>

      {/* Service Date & Time */}
      <div className="rounded-xl p-4" style={{ background: 'rgba(14,20,44,0.55)', backdropFilter: 'blur(14px)', WebkitBackdropFilter: 'blur(14px)', border: '1px solid rgba(255,255,255,0.10)' }}>
        <p className="text-sm font-medium flex items-center gap-2 mb-3" style={{ color: '#9CA3AF' }}><Clock className="w-4 h-4" />Service Date &amp; Time</p>
        <div className="grid grid-cols-2 gap-3">
          <div><Label htmlFor="serviceDate" style={{ color: '#9CA3AF' }}>Date</Label><Input id="serviceDate" type="date" value={serviceDate} onChange={(e) => setServiceDate(e.target.value)} className="mt-1" style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', color: '#E6E1E4' }} /></div>
          <div><Label htmlFor="serviceTime" style={{ color: '#9CA3AF' }}>Time</Label><Input id="serviceTime" type="time" value={serviceTime} onChange={(e) => setServiceTime(e.target.value)} className="mt-1" style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', color: '#E6E1E4' }} /></div>
        </div>
      </div>

      {/* Photos */}
      <div className="rounded-xl p-4" style={{ background: 'rgba(14,20,44,0.55)', backdropFilter: 'blur(14px)', WebkitBackdropFilter: 'blur(14px)', border: '1px solid rgba(255,255,255,0.10)' }}>
        <p className="text-sm font-medium mb-3" style={{ color: '#9CA3AF' }}>Photos * ({minPhotos}-{maxPhotos} required)</p>
          {photos.length > 0 && (
            <div className="grid grid-cols-3 gap-2 mb-3">
              {photos.map((url, index) => (
                <div key={index} className="relative aspect-square">
                  <img src={url} alt={`Photo ${index + 1}`} className="w-full h-full object-cover rounded-lg" />
                  <button type="button" onClick={() => removePhoto(index)} className="absolute -top-2 -right-2 w-6 h-6 bg-red-500 text-white rounded-full flex items-center justify-center text-sm">×</button>
                </div>
              ))}
            </div>
          )}
          {photos.length < maxPhotos && (
            <div className="flex gap-2">
              <Button type="button" onClick={startCamera} variant="outline" className="flex-1" style={{ border: '1px solid rgba(255,255,255,0.15)', color: '#9CA3AF', background: 'rgba(255,255,255,0.05)' }}><Camera className="w-4 h-4 mr-2" />Take Photo</Button>
              <Button type="button" onClick={() => fileInputRef.current?.click()} variant="outline" className="flex-1" style={{ border: '1px solid rgba(255,255,255,0.15)', color: '#9CA3AF', background: 'rgba(255,255,255,0.05)' }}><Upload className="w-4 h-4 mr-2" />Upload</Button>
            </div>
          )}
          <input type="file" ref={fileInputRef} accept="image/*" className="hidden" onChange={handleFileUpload} />
      </div>

      {/* Signature */}
      <div className="rounded-xl p-4" style={{ background: 'rgba(14,20,44,0.55)', backdropFilter: 'blur(14px)', WebkitBackdropFilter: 'blur(14px)', border: '1px solid rgba(255,255,255,0.10)' }}>
        <p className="text-sm font-medium mb-3" style={{ color: '#9CA3AF' }}>Server Signature {isSignatureRequired ? '*' : '(Optional)'}</p>
          {signature ? (
            <div className="border rounded-lg p-2 mb-3" style={{ borderColor: 'rgba(255,255,255,0.10)', background: 'rgba(255,255,255,0.05)' }}>
              <img src={signature} alt="Signature" className="max-h-24 mx-auto" />
            </div>
          ) : (
            <div className="border-2 border-dashed rounded-lg p-8 mb-3 text-center" style={{ borderColor: 'rgba(255,255,255,0.15)', color: '#4B5563' }}>No signature</div>
          )}
          <div className="space-y-2">
            {savedSignature && (
              <Button type="button" onClick={() => setSignature(savedSignature)} variant="outline" className="w-full" style={{ border: '1px solid rgba(34,197,94,0.35)', color: '#22c55e', background: 'rgba(34,197,94,0.08)' }}><CheckCircle className="w-4 h-4 mr-2" />Use Saved Signature</Button>
            )}
            <Button type="button" onClick={() => setShowSignaturePad(true)} variant="outline" className="w-full" style={{ border: '1px solid rgba(255,255,255,0.15)', color: '#9CA3AF', background: 'rgba(255,255,255,0.05)' }}><Edit3 className="w-4 h-4 mr-2" />{signature ? 'Draw New Signature' : 'Add Signature'}</Button>
            {signature && (
              <Button type="button" onClick={() => setSignature(null)} variant="outline" className="w-full" style={{ border: '1px solid rgba(239,68,68,0.35)', color: '#ef4444', background: 'rgba(239,68,68,0.08)' }}>Clear Signature</Button>
            )}
          </div>
      </div>

      {/* Notes */}
      <div className="rounded-xl p-4" style={{ background: 'rgba(14,20,44,0.55)', backdropFilter: 'blur(14px)', WebkitBackdropFilter: 'blur(14px)', border: '1px solid rgba(255,255,255,0.10)' }}>
        <p className="text-sm font-medium flex items-center gap-2 mb-3" style={{ color: '#9CA3AF' }}><FileText className="w-4 h-4" />Notes</p>
          <Textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            onFocus={(e) => {
              // Move cursor to end of existing text when field is focused
              const len = e.target.value.length;
              e.target.setSelectionRange(len, len);
            }}
            placeholder="Add any additional notes about the service..."
            rows={3}
            style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', color: '#E6E1E4' }}
          />
      </div>

      {/* Actions */}
      <div className="flex gap-3 pt-2">
        <Button type="button" variant="outline" onClick={onCancel} disabled={submitting} className="flex-1" style={{ border: '1px solid rgba(255,255,255,0.15)', color: '#9CA3AF', background: 'rgba(255,255,255,0.05)' }}>Cancel</Button>
        <Button
          type="submit"
          disabled={submitting || (hasSubmitted && !parentReceipt)}
          className="flex-1 font-bold"
          style={hasSubmitted && !parentReceipt
            ? { background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.10)', color: '#6B7280', cursor: 'not-allowed' }
            : { background: 'rgba(233,195,73,0.18)', backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)', border: '1px solid rgba(233,195,73,0.40)', color: '#e9c349' }}
        >
          {submitting ? <><Loader2 className="w-4 h-4 animate-spin mr-2" /> Submitting...</>
            : hasSubmitted && !parentReceipt ? <><CheckCircle className="w-4 h-4 mr-2" /> Already Submitted</>
            : <><Send className="w-4 h-4 mr-2" /> Submit Receipt</>}
        </Button>
      </div>
      {hasSubmitted && !parentReceipt && (
        <p className="text-center text-sm mt-2" style={{ color: '#22c55e' }}>✓ This receipt has been sent to your boss for review</p>
      )}

      {/* Camera Modal */}
      {showCamera && (
        <div className="fixed inset-x-0 top-0 bottom-0 z-50 flex items-center justify-center bg-black/50">
          <div className="relative w-full max-w-lg overflow-hidden">
            {/* Close X button - top right */}
            <button
              type="button"
              onClick={stopCamera}
              className="absolute top-3 right-3 z-20 text-white/80 hover:text-white"
            >
              <X className="w-6 h-6" />
            </button>
            
            {/* Loading state */}
            {!cameraReady && (
              <div className="absolute inset-0 flex items-center justify-center bg-black z-10">
                <div className="text-center">
                  <Loader2 className="w-8 h-8 animate-spin text-white mx-auto mb-2" />
                  <p className="text-white text-sm">Starting camera...</p>
                </div>
              </div>
            )}
            
            {/* Video */}
            <video 
              ref={videoRef} 
              autoPlay 
              playsInline 
              muted
              className="w-full aspect-[4/3] object-cover"
            />
            
            {/* Controls overlaid at bottom */}
            <div className="absolute bottom-0 left-0 right-0 p-4 bg-gradient-to-t from-black/80 to-transparent">
              <div className="flex items-center justify-center gap-4">
                {/* Cancel Button */}
                <button
                  type="button"
                  onClick={stopCamera}
                  className="flex items-center gap-1 px-3 py-2 rounded-md bg-white/20 border border-white/40 text-white text-sm hover:bg-white/30"
                >
                  <X className="w-4 h-4" />
                  Cancel
                </button>
                
                {/* Capture Button - type="button" prevents form submission */}
                <button
                  type="button"
                  onClick={capturePhoto}
                  disabled={!cameraReady}
                  className="w-16 h-16 rounded-full bg-white border-4 border-gray-300 flex items-center justify-center hover:bg-gray-100 disabled:opacity-50 transition-all active:scale-95"
                >
                  {!cameraReady ? (
                    <Loader2 className="w-6 h-6 animate-spin text-gray-600" />
                  ) : (
                    <div className="w-12 h-12 rounded-full bg-red-500" />
                  )}
                </button>
                
                {/* Upload Button */}
                <button
                  type="button"
                  onClick={() => {
                    stopCamera();
                    fileInputRef.current?.click();
                  }}
                  className="flex items-center gap-1 px-3 py-2 rounded-md bg-white/20 border border-white/40 text-white text-sm hover:bg-white/30"
                >
                  <Upload className="w-4 h-4" />
                  Upload
                </button>
              </div>
            </div>
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
