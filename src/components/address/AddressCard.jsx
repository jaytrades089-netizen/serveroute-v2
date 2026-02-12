import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import { base44 } from '@/api/base44Client';
import { useQueryClient, useQuery } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { 
  MapPin, 
  FileCheck, 
  MessageCircle,
  Clock,
  CheckCircle,
  AlertCircle,
  Navigation,
  Zap,
  Camera,
  Info,
  Calendar,
  MoreVertical,
  Shield,
  Check,
  Loader2,
  Image as ImageIcon,
  MessageSquare,
  FileText,
  Plus,
  Pencil,
  ArrowRightLeft,
  RotateCcw,
  ChevronDown,
  Trash2
} from 'lucide-react';
import { format } from 'date-fns';
import { toast } from 'sonner';
import { 
  calculateDistanceFeet, 
  getCurrentPosition,
  formatDistance 
} from '@/components/services/GeoService';
import { 
  getQualifiers, 
  getQualifierStorageFields,
  getNeededQualifiers 
} from '@/components/services/QualifierService';
import { QualifierBadges, QualifierBox } from '@/components/qualifier/QualifierBadge';
import EvidenceCamera from './EvidenceCamera';
import EvidenceCommentModal from './EvidenceCommentModal';
import PhotoViewer from './PhotoViewer';
import { getCompanyId } from '@/components/utils/companyUtils';
import { formatAddress as formatAddressUtil } from '@/components/utils/addressUtils';

// Re-export formatAddress for backward compatibility
export const formatAddress = formatAddressUtil;

// Outcome options for attempt logging
const OUTCOME_OPTIONS = [
  { value: 'no_answer', label: 'No Answer', color: 'bg-gray-100 hover:bg-gray-200 text-gray-700' },
  { value: 'left_with_cohabitant', label: 'Left w/ Cohabitant', color: 'bg-blue-100 hover:bg-blue-200 text-blue-700' },
  { value: 'posted', label: 'Posted', color: 'bg-purple-100 hover:bg-purple-200 text-purple-700' },
  { value: 'refused', label: 'Refused', color: 'bg-red-100 hover:bg-red-200 text-red-700' },
  { value: 'door_tag', label: 'Door Tag', color: 'bg-yellow-100 hover:bg-yellow-200 text-yellow-700' },
  { value: 'other', label: 'Other', color: 'bg-orange-100 hover:bg-orange-200 text-orange-700' }
];

export default function AddressCard({ 
  address, 
  index, 
  routeId,
  showActions = true,
  isBossView = false,
  onMessageBoss,
  onClick,
  lastAttempt,
  allAttempts = [],
  onAttemptLogged,
  onServed,
  isAttemptedToday = false,
  isCompleted = false,
  editMode = false
}) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const formatted = formatAddressUtil(address);
  const receiptStatus = address.receipt_status;
  const needsReceipt = !address.served && receiptStatus === 'pending';
  const receiptPending = receiptStatus === 'pending_review';
  const receiptApproved = receiptStatus === 'approved';
  const receiptNeedsRevision = receiptStatus === 'needs_revision';
  const isVerified = address.verification_status === 'verified';
  
  // Local attempts state (can be updated after logging)
  const [localAttempts, setLocalAttempts] = useState(allAttempts);
  const attemptCount = localAttempts.length;
  
  // Tab state - 0 = home/summary, 1-5 = attempt details
  const [activeTab, setActiveTab] = useState(0);
  
  // Evidence capture state
  const [showCamera, setShowCamera] = useState(false);
  const [showCommentModal, setShowCommentModal] = useState(false);
  const [capturedPhoto, setCapturedPhoto] = useState(null);
  const [savingEvidence, setSavingEvidence] = useState(false);
  const [showPhotoViewer, setShowPhotoViewer] = useState(false);
  
  // Attempt logging state
  const [finalizingAttempt, setFinalizingAttempt] = useState(false);
  
  // Edit notes state
  const [editingNotes, setEditingNotes] = useState(false);
  const [editedNotesText, setEditedNotesText] = useState('');
  

  
  // Boss action states
  const [showBossAddAttempt, setShowBossAddAttempt] = useState(false);
  const [showRequestAttempt, setShowRequestAttempt] = useState(false);
  const [showMoveModal, setShowMoveModal] = useState(false);
  const [bossAttemptTime, setBossAttemptTime] = useState(new Date().toISOString().slice(0, 16));
  const [bossAttemptOutcome, setBossAttemptOutcome] = useState(null);
  const [bossAttemptNotes, setBossAttemptNotes] = useState('');
  const [bossCreatingAttempt, setBossCreatingAttempt] = useState(false);
  const [requestQualifiers, setRequestQualifiers] = useState([]);
  const [requestNote, setRequestNote] = useState('');
  const [creatingRequest, setCreatingRequest] = useState(false);
  
  // Worker request states
  const [showRequestDetail, setShowRequestDetail] = useState(false);
  const [workerReplyText, setWorkerReplyText] = useState('');
  
  // Edit mode state
  const [isEditing, setIsEditing] = useState(false);
  const [editFields, setEditFields] = useState({
    defendant_name: address.defendant_name || '',
    normalized_address: address.normalized_address || address.legal_address || '',
    city: address.city || '',
    state: address.state || '',
    zip: address.zip || '',
    serve_type: address.serve_type || 'serve'
  });

  // Get current user
  const { data: user } = useQuery({
    queryKey: ['currentUser'],
    queryFn: () => base44.auth.me()
  });

  // Determine if current user can edit attempt times
  const canEditAttemptTimes = React.useMemo(() => {
    if (!user) return false;
    
    // Boss can always edit
    if (user.role === 'boss' || user.role === 'admin') return true;
    
    // Check grace period (5 days from account creation)
    const createdAt = user.created_date ? new Date(user.created_date) : null;
    if (createdAt) {
      const daysSinceCreated = Math.floor((Date.now() - createdAt.getTime()) / (1000 * 60 * 60 * 24));
      if (daysSinceCreated <= 5) return true;
    }
    
    // Check boss-enabled editing
    if (user.editing_enabled) return true;
    
    return false;
  }, [user]);
  
  // Fetch pending request for this address
  const { data: pendingRequest } = useQuery({
    queryKey: ['attemptRequest', address.id],
    queryFn: async () => {
      const requests = await base44.entities.AttemptRequest.filter({
        address_id: address.id,
        status: 'pending'
      });
      return requests[0] || null;
    },
    enabled: !!address.has_pending_request
  });
  
  // Sync local attempts with props
  React.useEffect(() => {
    setLocalAttempts(allAttempts);
  }, [allAttempts]);

  // Hide bottom nav when camera is open
  React.useEffect(() => {
    if (showCamera) {
      document.body.classList.add('camera-active');
    } else {
      document.body.classList.remove('camera-active');
    }
    return () => document.body.classList.remove('camera-active');
  }, [showCamera]);
  
  // Sort attempts by date for consistent ordering
  const sortedAttempts = [...localAttempts].sort((a, b) => 
    new Date(a.attempt_time) - new Date(b.attempt_time)
  );
  
  // Find in-progress attempt (evidence taken but not finalized)
  const inProgressAttempt = sortedAttempts.find(a => a.status === 'in_progress');
  const hasInProgressAttempt = !!inProgressAttempt;

  const handleNavigate = (e) => {
    e.stopPropagation();
    const addressStr = `${formatted.line1}, ${formatted.line2}`;
    const encoded = encodeURIComponent(addressStr);
    window.open(`https://www.google.com/maps/dir/?api=1&destination=${encoded}`, '_blank');
  };

  // Card click only triggers if custom onClick is provided
  const handleCardClick = () => {
    if (onClick) {
      onClick(address);
    }
  };

  // CAPTURE EVIDENCE - Opens camera
  // If there's already an in_progress attempt, this adds more photos to it
  // If no in_progress attempt, this will create a new draft attempt on save
  const handleCaptureEvidence = (e) => {
    e.stopPropagation();
    setShowCamera(true);
  };

  // Photo taken from camera
  const handlePhotoTaken = async ({ file, dataUrl }) => {
    setCapturedPhoto({ file, dataUrl });
    setShowCamera(false);
    setShowCommentModal(true);
  };

  // Save evidence with comment - THIS CREATES THE DRAFT ATTEMPT
  // OPTIMISTIC UI: Close modal immediately, save in background
  const handleSaveEvidence = async (comment) => {
    if (!capturedPhoto) return;
    
    // Comment is required for new attempts, EXCEPT postings
    if (!hasInProgressAttempt && !comment.trim() && address.serve_type !== 'posting') {
      toast.error('Please add a description');
      return;
    }
    
    // OPTIMISTIC: Close modal immediately for instant feedback
    const photoToUpload = capturedPhoto;
    setCapturedPhoto(null);
    setShowCommentModal(false);
    
    // Show instant feedback
    toast.success('Saving evidence...', { duration: 1500 });
    
    // Continue upload in background
    try {
      // Upload photo
      const { file_url } = await base44.integrations.Core.UploadFile({ 
        file: photoToUpload.file 
      });
      
      if (hasInProgressAttempt) {
        // Add photo to existing in_progress attempt
        const existingPhotos = inProgressAttempt.photo_urls || [];
        const existingNotes = inProgressAttempt.notes || '';
        const newNotes = comment.trim() 
          ? (existingNotes ? `${existingNotes}\n\n${comment}` : comment)
          : existingNotes;
        
        await base44.entities.Attempt.update(inProgressAttempt.id, {
          photo_urls: [...existingPhotos, file_url],
          notes: newNotes
        });
        
        // Update local state
        const updatedAttempts = localAttempts.map(a => 
          a.id === inProgressAttempt.id 
            ? { ...a, photo_urls: [...existingPhotos, file_url], notes: newNotes }
            : a
        );
        setLocalAttempts(updatedAttempts);
        
        toast.success('Photo added!');
      } else {
        // CREATE NEW IN_PROGRESS ATTEMPT
        
        // Verify worker owns this route before creating attempt
        if (user?.role === 'server') {
          // Need to check route ownership - fetch route if not passed
          try {
            const routes = await base44.entities.Route.filter({ id: routeId });
            const route = routes[0];
            if (route && route.worker_id !== user.id) {
              toast.error('You are not assigned to this route');
              return;
            }
          } catch (e) {
            console.warn('Could not verify route ownership:', e);
          }
        }
        
        const now = new Date();
        const qualifierData = getQualifiers(now);

        // Warn about outside-hours attempts
        if (qualifierData.isOutsideHours) {
          const proceed = window.confirm(
            'This attempt is outside service hours (8 AM - 9 PM Michigan time). ' +
            'It will NOT earn any qualifier credit (AM/PM/WEEKEND). Continue?'
          );
          if (!proceed) {
            return;
          }
        }

        const qualifierFields = getQualifierStorageFields(qualifierData);
        const attemptNumber = attemptCount + 1;
        const companyId = user.company_id || user.data?.company_id || address.company_id || 'default';
        
        // For postings: create as completed immediately, for serves: in_progress
        const isPosting = address.serve_type === 'posting';
        
        // OPTIMISTIC: Create local attempt immediately
        const tempAttempt = {
          id: 'temp_' + Date.now(),
          address_id: address.id,
          route_id: routeId,
          server_id: user.id,
          company_id: companyId,
          attempt_number: attemptNumber,
          status: isPosting ? 'completed' : 'in_progress',
          outcome: isPosting ? 'posted' : undefined,
          attempt_time: now.toISOString(),
          attempt_timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
          ...qualifierFields,
          notes: comment,
          photo_urls: [photoToUpload.dataUrl], // Use dataUrl temporarily
        };
        
        // Update local state immediately
        setLocalAttempts(prev => [...prev, tempAttempt]);
        setTimeout(() => setActiveTab(attemptNumber), 50);
        
        // Get GPS location (don't block)
        let userLat = null;
        let userLon = null;
        let distanceFeet = null;
        
        try {
          const position = await getCurrentPosition();
          userLat = position.latitude;
          userLon = position.longitude;
          
          if (address.lat && address.lng) {
            distanceFeet = calculateDistanceFeet(userLat, userLon, address.lat, address.lng);
          }
        } catch (geoError) {
          console.warn('Geolocation failed:', geoError.message);
        }
        
        // Create the real attempt in database
        const newAttempt = await base44.entities.Attempt.create({
          address_id: address.id,
          route_id: routeId,
          server_id: user.id,
          company_id: companyId,
          attempt_number: attemptNumber,
          status: isPosting ? 'completed' : 'in_progress',
          outcome: isPosting ? 'posted' : undefined,
          attempt_time: now.toISOString(),
          attempt_timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
          ...qualifierFields,
          user_latitude: userLat,
          user_longitude: userLon,
          distance_feet: distanceFeet,
          notes: comment,
          photo_urls: [file_url],
          synced_at: new Date().toISOString()
        });
        
        // Replace temp attempt with real one
        setLocalAttempts(prev => prev.map(a => 
          a.id === tempAttempt.id ? newAttempt : a
        ));
        
        // Set first_attempt_date on route if this is the first attempt
        if (attemptNumber === 1 && routeId) {
          try {
            const currentRoute = await base44.entities.Route.filter({ id: routeId });
            if (currentRoute[0] && !currentRoute[0].first_attempt_date) {
              await base44.entities.Route.update(routeId, {
                first_attempt_date: now.toISOString()
              });
            }
          } catch (e) {
            console.warn('Failed to set first_attempt_date:', e);
          }
        }

        // Update Address attempts_count
        await base44.entities.Address.update(address.id, {
          attempts_count: attemptNumber,
          status: address.status === 'pending' ? 'attempted' : address.status
        });
        
        // For postings, auto-navigate to SubmitReceipt page
        if (isPosting) {
          toast.success('Photo saved! Review and submit the receipt.');
          navigate(createPageUrl(
            `SubmitReceipt?addressId=${address.id}&routeId=${routeId}&attemptId=${newAttempt.id}&finalize=true`
          ));
          return; // Skip the normal toast below
        }
        
        toast.success(`Evidence saved - ${qualifierData.display}`);
      }
      
      // Invalidate queries in background
      queryClient.invalidateQueries({ queryKey: ['routeAttempts', routeId] });
      queryClient.invalidateQueries({ queryKey: ['routeAddresses', routeId] });
      
    } catch (error) {
      console.error('Failed to save evidence:', error);
      toast.error('Failed to save - please try again');
    }
  };

  // LOG ATTEMPT - Shows outcome selector, then logs with selected outcome
  const handleLogAttempt = async (e) => {
    e.stopPropagation();
    
    if (!user) {
      toast.error('Please log in first');
      return;
    }
    
    // Must have an in_progress attempt to finalize
    if (!hasInProgressAttempt) {
      toast.error('Take a photo first! Tap Evidence to start.');
      return;
    }
    
    // Validate: must have at least 1 photo
    if (!inProgressAttempt.photo_urls || inProgressAttempt.photo_urls.length === 0) {
      toast.error('You must take at least one photo before logging');
      return;
    }
    
    // Log attempt directly - no modal needed
    setFinalizingAttempt(true);
    
    try {
      const now = new Date();
      const companyId = getCompanyId(user) || address.company_id;
      
      // OPTIMISTIC: Update local state immediately for instant feedback
      const updatedAttempts = localAttempts.map(a => 
        a.id === inProgressAttempt.id 
          ? { ...a, status: 'completed', outcome: 'other' }
          : a
      );
      setLocalAttempts(updatedAttempts);
      
      // Trigger animation to move card to bottom IMMEDIATELY
      if (onAttemptLogged) {
        onAttemptLogged();
      }
      
      toast.success(`Attempt ${inProgressAttempt.attempt_number} logged!`);
      
      // Update the attempt to completed in background
      await Promise.allSettled([
        base44.entities.Attempt.update(inProgressAttempt.id, {
          status: 'completed',
          outcome: 'other'
        }),
        base44.entities.AuditLog.create({
          company_id: companyId,
          action_type: 'attempt_logged',
          actor_id: user.id,
          actor_role: user.role || 'server',
          target_type: 'address',
          target_id: address.id,
          details: {
            attempt_id: inProgressAttempt.id,
            attempt_number: inProgressAttempt.attempt_number,
            qualifier: inProgressAttempt.qualifier,
            qualifier_badges: inProgressAttempt.qualifier_badges,
            outcome: 'other',
            route_id: routeId,
            distance_feet: inProgressAttempt.distance_feet
          },
          timestamp: now.toISOString()
        })
      ]);
      
      // Invalidate queries in background
      queryClient.invalidateQueries({ queryKey: ['routeAttempts', routeId] });
      queryClient.invalidateQueries({ queryKey: ['routeAddresses', routeId] });
      queryClient.invalidateQueries({ queryKey: ['address', address.id] });
      
    } catch (error) {
      console.error('Failed to log attempt:', error);
      toast.error('Failed to log attempt');
    } finally {
      setFinalizingAttempt(false);
    }
  };

  // FINALIZE POSTING - Marks address as served/completed
  const handleFinalizePosting = async (e) => {
    e.stopPropagation();
    
    if (!user) {
      toast.error('Please log in first');
      return;
    }
    
    setFinalizingAttempt(true);
    
    try {
      const now = new Date();
      const companyId = getCompanyId(user) || address.company_id;
      
      // Mark address as served
      await base44.entities.Address.update(address.id, {
        served: true,
        served_at: now.toISOString(),
        status: 'served'
      });
      
      // Create audit log
      await base44.entities.AuditLog.create({
        company_id: companyId,
        action_type: 'posting_completed',
        actor_id: user.id,
        actor_role: user.role || 'server',
        target_type: 'address',
        target_id: address.id,
        details: {
          route_id: routeId,
          serve_type: 'posting',
          attempt_count: attemptCount
        },
        timestamp: now.toISOString()
      });
      
      // Trigger parent callbacks to move card to completed section
      if (onAttemptLogged) onAttemptLogged();
      if (onServed) onServed();
      
      toast.success('Posting completed! ✓');
      
      // Invalidate queries
      queryClient.invalidateQueries({ queryKey: ['routeAttempts', routeId] });
      queryClient.invalidateQueries({ queryKey: ['routeAddresses', routeId] });
      queryClient.invalidateQueries({ queryKey: ['address', address.id] });
      
    } catch (error) {
      console.error('Failed to finalize posting:', error);
      toast.error('Failed to complete posting');
    } finally {
      setFinalizingAttempt(false);
    }
  };
  


  // Edit notes handler
  const handleEditNotes = (e) => {
    e.stopPropagation();
    if (selectedAttempt) {
      setEditedNotesText(selectedAttempt.notes || '');
      setEditingNotes(true);
    }
  };

  // Edit attempt time — recalculates qualifiers
  const handleEditAttemptTime = async (attempt, newTimeValue) => {
    if (!newTimeValue) return;
    
    const newTime = new Date(newTimeValue);
    
    try {
      // Recalculate qualifiers for the new time
      const qualifierData = getQualifiers(newTime);
      const qualifierFields = getQualifierStorageFields(qualifierData);
      
      // Update attempt in database
      await base44.entities.Attempt.update(attempt.id, {
        attempt_time: newTime.toISOString(),
        ...qualifierFields,
        manually_edited: true
      });
      
      // Update local state
      const updatedAttempts = localAttempts.map(a => 
        a.id === attempt.id 
          ? { 
              ...a, 
              attempt_time: newTime.toISOString(), 
              ...qualifierFields,
              manually_edited: true 
            }
          : a
      );
      setLocalAttempts(updatedAttempts);
      
      // Create audit log
      const companyId = getCompanyId(user) || address.company_id;
      await base44.entities.AuditLog.create({
        company_id: companyId,
        action_type: 'attempt_time_edited',
        actor_id: user.id,
        actor_role: user.role || 'server',
        target_type: 'attempt',
        target_id: attempt.id,
        details: {
          old_time: attempt.attempt_time,
          new_time: newTime.toISOString(),
          old_qualifier: attempt.qualifier,
          new_qualifier: qualifierData.qualifier,
          address_id: address.id,
          route_id: routeId
        },
        timestamp: new Date().toISOString()
      });
      
      toast.success(`Time updated — ${qualifierData.display}`);
      
      // Invalidate queries
      queryClient.invalidateQueries({ queryKey: ['routeAttempts', routeId] });
      
    } catch (error) {
      console.error('Failed to edit attempt time:', error);
      toast.error('Failed to update time');
    }
  };

  // Delete address handler
  const handleDeleteAddress = async () => {
    const confirmed = window.confirm(
      `Delete this address?\n\n${formatted.line1}\n${formatted.line2}\n\nAll attempts for this address will also be deleted.`
    );
    if (!confirmed) return;
    
    try {
      // Soft-delete the address
      await base44.entities.Address.update(address.id, {
        deleted_at: new Date().toISOString()
      });
      
      // Delete all attempts for this address
      for (const attempt of localAttempts) {
        await base44.entities.Attempt.delete(attempt.id);
      }
      
      // Update route address count
      if (routeId) {
        const remainingAddresses = await base44.entities.Address.filter({
          route_id: routeId,
          deleted_at: null
        });
        await base44.entities.Route.update(routeId, {
          total_addresses: remainingAddresses.length,
          served_count: remainingAddresses.filter(a => a.served).length
        });
      }
      
      toast.success('Address deleted');
      
      queryClient.invalidateQueries({ queryKey: ['routeAddresses', routeId] });
      queryClient.invalidateQueries({ queryKey: ['routeAttempts', routeId] });
      queryClient.invalidateQueries({ queryKey: ['route', routeId] });
    } catch (error) {
      console.error('Failed to delete address:', error);
      toast.error('Failed to delete address');
    }
  };

  // Save edit handler
  const handleSaveEdit = async () => {
    try {
      await base44.entities.Address.update(address.id, {
        defendant_name: editFields.defendant_name,
        normalized_address: editFields.normalized_address,
        city: editFields.city,
        state: editFields.state,
        zip: editFields.zip,
        serve_type: editFields.serve_type,
        manual_edit_flag: true
      });
      
      setIsEditing(false);
      toast.success('Address updated');
      queryClient.invalidateQueries({ queryKey: ['routeAddresses', routeId] });
    } catch (error) {
      console.error('Failed to update address:', error);
      toast.error('Failed to save changes');
    }
  };

  // Delete attempt handler
  const handleDeleteAttempt = async (attempt) => {
    const confirmed = window.confirm(
      `Delete Attempt ${attempt.attempt_number}?\n\nThis will permanently remove this attempt and its photos.`
    );
    if (!confirmed) return;
    
    try {
      // Delete the attempt
      await base44.entities.Attempt.delete(attempt.id);
      
      // Update local state
      const updatedAttempts = localAttempts.filter(a => a.id !== attempt.id);
      setLocalAttempts(updatedAttempts);
      setActiveTab(0); // Go back to summary
      
      // Update address attempt count
      await base44.entities.Address.update(address.id, {
        attempts_count: Math.max(0, (address.attempts_count || attemptCount) - 1)
      });
      
      // If we deleted the only attempt, reset address status
      if (updatedAttempts.length === 0) {
        await base44.entities.Address.update(address.id, {
          status: 'pending'
        });
      }
      
      toast.success(`Attempt ${attempt.attempt_number} deleted`);
      
      queryClient.invalidateQueries({ queryKey: ['routeAttempts', routeId] });
      queryClient.invalidateQueries({ queryKey: ['routeAddresses', routeId] });
    } catch (error) {
      console.error('Failed to delete attempt:', error);
      toast.error('Failed to delete attempt');
    }
  };

  // Save edited notes
  const handleSaveNotes = async () => {
    if (!selectedAttempt) return;
    
    try {
      await base44.entities.Attempt.update(selectedAttempt.id, {
        notes: editedNotesText
      });
      
      // Update local state
      const updatedAttempts = localAttempts.map(a => 
        a.id === selectedAttempt.id 
          ? { ...a, notes: editedNotesText }
          : a
      );
      setLocalAttempts(updatedAttempts);
      
      setEditingNotes(false);
      toast.success('Notes updated');
      
      queryClient.invalidateQueries({ queryKey: ['routeAttempts', routeId] });
    } catch (error) {
      console.error('Failed to save notes:', error);
      toast.error('Failed to save notes');
    }
  };

  // Determine card state colors
  const isServed = address.served;
  const isPriority = attemptCount >= 2 && !isServed;

  // Boss: Create attempt on behalf of worker
  const handleBossCreateAttempt = async () => {
    if (!bossAttemptOutcome || !bossAttemptTime) return;
    
    setBossCreatingAttempt(true);
    try {
      const attemptTime = new Date(bossAttemptTime);
      const qualifierData = getQualifiers(attemptTime);
      const qualifierFields = getQualifierStorageFields(qualifierData);
      const attemptNumber = (localAttempts?.length || 0) + 1;
      const companyId = getCompanyId(user) || address.company_id;

      const newAttempt = await base44.entities.Attempt.create({
        address_id: address.id,
        route_id: routeId,
        server_id: address.server_id || user.id,
        company_id: companyId,
        attempt_number: attemptNumber,
        status: 'completed',
        outcome: bossAttemptOutcome,
        attempt_time: attemptTime.toISOString(),
        attempt_timezone: 'America/Detroit',
        ...qualifierFields,
        notes: bossAttemptNotes 
          ? `[Added by boss] ${bossAttemptNotes}` 
          : '[Added by boss]',
        manually_edited: true,
        photo_urls: [],
        synced_at: new Date().toISOString()
      });

      setLocalAttempts(prev => [...prev, newAttempt]);

      await base44.entities.Address.update(address.id, {
        attempts_count: attemptNumber,
        status: address.status === 'pending' ? 'attempted' : address.status
      });

      await base44.entities.AuditLog.create({
        company_id: companyId,
        action_type: 'attempt_added_by_boss',
        actor_id: user.id,
        actor_role: 'boss',
        target_type: 'address',
        target_id: address.id,
        details: {
          attempt_number: attemptNumber,
          outcome: bossAttemptOutcome,
          attempt_time: attemptTime.toISOString(),
          route_id: routeId
        },
        timestamp: new Date().toISOString()
      });

      toast.success(`Attempt ${attemptNumber} added`);
      
      setShowBossAddAttempt(false);
      setBossAttemptOutcome(null);
      setBossAttemptNotes('');
      setBossAttemptTime(new Date().toISOString().slice(0, 16));
      
      queryClient.invalidateQueries({ queryKey: ['routeAttempts', routeId] });
      queryClient.invalidateQueries({ queryKey: ['routeAddresses', routeId] });
    } catch (error) {
      console.error('Failed to create attempt:', error);
      toast.error('Failed to add attempt');
    } finally {
      setBossCreatingAttempt(false);
    }
  };

  // Boss: Create attempt request
  const handleCreateRequest = async () => {
    if (requestQualifiers.length === 0) return;
    
    setCreatingRequest(true);
    try {
      const companyId = getCompanyId(user) || address.company_id;
      
      await base44.entities.AttemptRequest.create({
        address_id: address.id,
        route_id: routeId,
        company_id: companyId,
        requested_by: user.id,
        assigned_to: address.server_id || null,
        required_qualifiers: requestQualifiers,
        status: 'pending',
        boss_note: requestNote || null
      });

      await base44.entities.Address.update(address.id, {
        has_pending_request: true,
        pending_request_qualifiers: requestQualifiers
      });

      if (address.server_id) {
        await base44.entities.Notification.create({
          user_id: address.server_id,
          company_id: companyId,
          recipient_role: 'server',
          type: 'attempt_requested',
          title: 'New Attempt Requested',
          body: `${requestQualifiers.join(' + ')} attempt needed at ${address.normalized_address || address.legal_address}`,
          priority: 'urgent',
          data: {
            address_id: address.id,
            route_id: routeId,
            qualifiers: requestQualifiers
          }
        });
      }

      await base44.entities.AuditLog.create({
        company_id: companyId,
        action_type: 'attempt_requested',
        actor_id: user.id,
        actor_role: 'boss',
        target_type: 'address',
        target_id: address.id,
        details: {
          qualifiers: requestQualifiers,
          note: requestNote,
          route_id: routeId
        },
        timestamp: new Date().toISOString()
      });

      toast.success(`Request sent: ${requestQualifiers.join(' + ')}`);
      
      setShowRequestAttempt(false);
      setRequestQualifiers([]);
      setRequestNote('');
      
      queryClient.invalidateQueries({ queryKey: ['routeAddresses', routeId] });
      queryClient.invalidateQueries({ queryKey: ['attemptRequest', address.id] });
    } catch (error) {
      console.error('Failed to create request:', error);
      toast.error('Failed to send request');
    } finally {
      setCreatingRequest(false);
    }
  };

  // Worker: Reply to request
  const handleWorkerReply = async () => {
    if (!workerReplyText.trim() || !pendingRequest) return;
    
    try {
      await base44.entities.AttemptRequest.update(pendingRequest.id, {
        worker_reply: workerReplyText.trim(),
        worker_replied_at: new Date().toISOString()
      });

      const companyId = getCompanyId(user) || address.company_id;
      await base44.entities.Notification.create({
        user_id: pendingRequest.requested_by,
        company_id: companyId,
        recipient_role: 'boss',
        type: 'request_reply',
        title: 'Worker Replied to Request',
        body: `Reply on ${address.normalized_address || address.legal_address}: "${workerReplyText.trim().substring(0, 100)}"`,
        priority: 'normal'
      });

      toast.success('Reply sent');
      setWorkerReplyText('');
      queryClient.invalidateQueries({ queryKey: ['attemptRequest', address.id] });
    } catch (error) {
      toast.error('Failed to send reply');
    }
  };

  // Get selected attempt data
  const selectedAttempt = activeTab > 0 ? sortedAttempts[activeTab - 1] : null;

  return (
    <>
      <div
        className={`relative bg-white rounded-2xl shadow-md overflow-hidden transition-all duration-200 ${
          !isBossView && address.has_pending_request && pendingRequest
            ? 'border-2 border-red-500 animate-request-pulse shadow-red-100 shadow-lg'
            : 'border border-gray-300'
        }`}
      >
        {/* Edit button — shows in edit mode */}
        {editMode && !isEditing && !isServed && (
          <button
            onClick={(e) => { e.stopPropagation(); setIsEditing(true); }}
            className="absolute top-3 right-3 p-2 bg-blue-100 rounded-lg hover:bg-blue-200 transition-colors z-10"
          >
            <Pencil className="w-4 h-4 text-blue-600" />
          </button>
        )}
        {/* Pending Request Banner */}
        {address.has_pending_request && pendingRequest && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              if (!isBossView) setShowRequestDetail(!showRequestDetail);
            }}
            className={`w-full text-left px-4 py-2 border-b ${
              isBossView 
                ? 'bg-red-50 border-red-200'
                : 'bg-red-100 border-red-300 animate-pulse cursor-pointer hover:bg-red-150'
            }`}
          >
            <div className="flex items-center gap-2">
              <RotateCcw className="w-4 h-4 text-red-600" />
              <span className="text-xs font-bold text-red-700">
                ATTEMPT REQUESTED: {pendingRequest.required_qualifiers?.join(' + ')}
              </span>
              {!isBossView && (
                <ChevronDown className={`w-3 h-3 text-red-500 ml-auto transition-transform ${
                  showRequestDetail ? 'rotate-180' : ''
                }`} />
              )}
            </div>
            {!showRequestDetail && pendingRequest.boss_note && (
              <p className="text-xs text-red-600 mt-1 pl-6 truncate">
                "{pendingRequest.boss_note}"
              </p>
            )}
          </button>
        )}

        {/* Worker Request Detail Panel */}
        {!isBossView && showRequestDetail && pendingRequest && (
          <div className="px-4 pb-3 bg-red-50 border-b border-red-200">
            <div className="bg-white border border-red-200 rounded-xl p-4 mt-2">
              <h4 className="text-sm font-bold text-red-800 mb-2">Attempt Requested</h4>
              
              <div className="flex gap-2 mb-3 flex-wrap">
                {pendingRequest.required_qualifiers?.map(q => (
                  <span key={q} className={`px-3 py-1.5 rounded-full text-sm font-bold ${
                    q === 'AM' ? 'bg-sky-100 text-sky-700' :
                    q === 'PM' ? 'bg-indigo-100 text-indigo-700' :
                    q === 'WEEKEND' ? 'bg-orange-100 text-orange-700' :
                    'bg-gray-100 text-gray-700'
                  }`}>
                    {q === 'ANYTIME' ? 'ANYTIME' : q}
                  </span>
                ))}
              </div>

              {pendingRequest.boss_note && (
                <div className="bg-red-50 rounded-lg p-3 mb-3 border border-red-100">
                  <p className="text-xs text-gray-500 font-semibold mb-1">FROM BOSS:</p>
                  <p className="text-sm text-gray-800">{pendingRequest.boss_note}</p>
                </div>
              )}

              {!pendingRequest.worker_reply ? (
                <div className="mb-3">
                  <textarea
                    value={workerReplyText}
                    onChange={(e) => setWorkerReplyText(e.target.value)}
                    placeholder="Reply to boss (optional)..."
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm resize-none"
                    rows={2}
                    maxLength={500}
                    onClick={(e) => e.stopPropagation()}
                  />
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={(e) => { e.stopPropagation(); handleWorkerReply(); }}
                    className="mt-2"
                    disabled={!workerReplyText.trim()}
                  >
                    <MessageSquare className="w-3 h-3 mr-1" />
                    Send Reply
                  </Button>
                </div>
              ) : (
                <div className="bg-blue-50 rounded-lg p-3 mb-3 border border-blue-100">
                  <p className="text-xs text-gray-500 font-semibold mb-1">YOUR REPLY:</p>
                  <p className="text-sm text-gray-800">{pendingRequest.worker_reply}</p>
                </div>
              )}

              <p className="text-xs text-red-600 font-medium">
                Complete a {pendingRequest.required_qualifiers?.join(' + ')} attempt to fulfill this request.
              </p>
            </div>
          </div>
        )}

        {/* In-Progress Banner — not for postings (they auto-complete) */}
        {hasInProgressAttempt && !isServed && address.serve_type !== 'posting' && (
          <div className="px-4 py-2 bg-amber-50 border-b border-amber-200 animate-pulse-glow">
            <div className="flex items-center gap-2 text-amber-700">
              <Camera className="w-4 h-4" />
              <span className="text-xs font-bold">
                Evidence captured — tap LOG ATTEMPT to finalize
              </span>
            </div>
          </div>
        )}

        {/* Attempt Tabs - Only show if there are attempts AND not a posting */}
        {attemptCount > 0 && address.serve_type !== 'posting' && (
          <div className="flex border-b border-gray-100">
            {/* Home/Summary Tab */}
            <button
              onClick={(e) => { e.stopPropagation(); setActiveTab(0); }}
              className={`flex-1 py-2.5 text-xs font-bold transition-colors ${
                activeTab === 0
                  ? 'bg-green-500 text-white'
                  : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
              }`}
            >
              <Check className="w-4 h-4 mx-auto" />
            </button>
            
            {/* Attempt Tabs A1-A5 */}
            {[1, 2, 3, 4, 5].map((num) => {
              const attempt = sortedAttempts[num - 1];
              const hasAttempt = !!attempt;
              const isActive = activeTab === num;
              const isInProgress = attempt?.status === 'in_progress';
              
              return (
                <button
                  key={num}
                  onClick={(e) => { 
                    e.stopPropagation(); 
                    if (hasAttempt) setActiveTab(num); 
                  }}
                  disabled={!hasAttempt}
                  className={`flex-1 py-2.5 text-xs font-bold transition-colors relative ${
                    isActive
                      ? isInProgress 
                        ? 'bg-amber-500 text-white'
                        : 'bg-indigo-600 text-white'
                      : hasAttempt
                        ? isInProgress
                          ? 'bg-amber-100 text-amber-700 hover:bg-amber-200 animate-pulse'
                          : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                        : 'bg-gray-50 text-gray-300 cursor-not-allowed'
                  }`}
                >
                  A{num}
                  {hasAttempt && !isInProgress && (
                    <Check className="w-2.5 h-2.5 absolute top-1 right-1" />
                  )}
                </button>
              );
            })}
          </div>
        )}

        {/* Header Section with Gradient */}
        <div className={`px-4 py-4 ${
          isServed ? 'bg-gradient-to-r from-green-50 to-emerald-50' : 
          hasInProgressAttempt ? 'bg-gradient-to-r from-amber-50 via-orange-50 to-yellow-50' :
          'bg-gradient-to-r from-indigo-50 via-purple-50 to-pink-50'
        }`}>
          <div className="flex items-start gap-3">
            {/* Location Pin Icon */}
            <div className={`w-12 h-12 rounded-full flex items-center justify-center flex-shrink-0 ${
              isServed ? 'bg-green-100' : 
              hasInProgressAttempt ? 'bg-amber-100' :
              'bg-indigo-100'
            }`}>
              {isServed ? (
                <CheckCircle className="w-6 h-6 text-green-600" />
              ) : hasInProgressAttempt ? (
                <Camera className="w-6 h-6 text-amber-600" />
              ) : (
                <MapPin className="w-6 h-6 text-indigo-600" />
              )}
            </div>
            
            <div className="flex-1 min-w-0">
              {/* Address Display - 2 lines, ALL CAPS, Bold */}
              <div className="flex items-start justify-between gap-2">
                <p className={`text-lg font-bold leading-tight ${
                  isServed ? 'text-gray-500' : 'text-gray-900'
                }`}>
                  {formatted.line1}
                </p>
                {address.defendant_name && (
                  <p className="text-xs text-gray-400 italic whitespace-nowrap">
                    {address.defendant_name}
                  </p>
                )}
              </div>
              <p className={`text-sm ${isServed ? 'text-gray-400' : 'text-gray-500'}`}>
                {formatted.line2}
              </p>
            </div>
          </div>
        </div>

        {/* HOME TAB - Summary with all qualifiers/times */}
        {attemptCount > 0 && !isServed && activeTab === 0 && (
          <div className="px-4 py-3 border-t border-gray-100">
            {address.serve_type === 'posting' ? (
              /* ===== POSTING SUMMARY — simplified, no qualifiers ===== */
              <>
                <div className="flex items-center justify-between mb-3">
                  <span className="text-xs font-bold text-gray-700 tracking-wide">
                    POSTED SUMMARY
                  </span>
                </div>

                {/* Posting Timeline — just date/time + photo icon */}
                <div className="space-y-2">
                  {sortedAttempts.map((attempt, idx) => (
                    <div 
                      key={attempt.id} 
                      className="flex items-center gap-3 p-2 rounded-lg bg-gray-50 hover:bg-gray-100 cursor-pointer"
                      onClick={(e) => { 
                        e.stopPropagation(); 
                        if (attempt.photo_urls?.length > 0) {
                          setShowPhotoViewer(true);
                        }
                      }}
                    >
                      <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold bg-purple-100 text-purple-600">
                        <FileText className="w-4 h-4" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-semibold text-gray-900">
                          {format(new Date(attempt.attempt_time), "M/d/yy h:mm a")}
                        </div>
                        <span className="text-[10px] text-purple-600 font-bold">
                          POSTED
                        </span>
                      </div>
                      {attempt.photo_urls?.length > 0 && (
                        <ImageIcon className="w-4 h-4 text-blue-500" />
                      )}
                    </div>
                  ))}
                </div>

                {/* Status Badges */}
                <div className="flex items-center gap-2 flex-wrap mt-3">
                  <Badge className="bg-green-100 text-green-700 border border-green-200 text-[10px] font-bold px-2.5 py-1">
                    POSTING
                  </Badge>
                  {isVerified && (
                    <Badge className="bg-teal-100 text-teal-700 border border-teal-200 text-[10px] font-bold px-2.5 py-1">
                      VERIFIED
                    </Badge>
                  )}
                  {address.has_dcn && (
                    <Badge className="bg-purple-100 text-purple-700 border border-purple-200 text-[10px] font-bold px-2.5 py-1">
                      DCN
                    </Badge>
                  )}
                </div>
              </>
            ) : (
              /* ===== REGULAR SERVE SUMMARY — unchanged ===== */
              <>
                <div className="flex items-center justify-between mb-3">
                  <span className="text-xs font-bold text-gray-700 tracking-wide">
                    ATTEMPTS SUMMARY
                  </span>
                  {isPriority && (
                    <Badge className="bg-orange-500 text-white text-[10px] px-2 py-0.5">
                      PRIORITY
                    </Badge>
                  )}
                </div>

                {/* Attempt Timeline */}
                <div className="space-y-2">
                  {sortedAttempts.map((attempt, idx) => {
                    const isInProgress = attempt.status === 'in_progress';
                    return (
                      <div 
                        key={attempt.id} 
                        className={`flex items-center gap-3 p-2 rounded-lg cursor-pointer ${
                          isInProgress 
                            ? 'bg-amber-50 border border-amber-200 hover:bg-amber-100' 
                            : 'bg-gray-50 hover:bg-gray-100'
                        }`}
                        onClick={(e) => { e.stopPropagation(); setActiveTab(idx + 1); }}
                      >
                        <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold ${
                          isInProgress 
                            ? 'bg-amber-200 text-amber-700' 
                            : 'bg-indigo-100 text-indigo-600'
                        }`}>
                          A{idx + 1}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-semibold text-gray-900">
                            {format(new Date(attempt.attempt_time), "M/d/yy h:mm a")}
                          </div>
                          <div className="flex items-center gap-1.5">
                            <QualifierBadges 
                              badges={attempt.qualifier_badges || [attempt.qualifier?.toUpperCase()]} 
                              size="small" 
                            />
                            {isInProgress ? (
                              <span className="text-[10px] text-amber-600 font-bold">
                                AWAITING OUTCOME
                              </span>
                            ) : (
                              <span className="text-[10px] text-gray-500 capitalize">
                                {attempt.outcome?.replace('_', ' ')}
                              </span>
                            )}
                            {attempt.distance_feet && (
                              <span className="text-[10px] text-blue-500">
                                {formatDistance(attempt.distance_feet)}
                              </span>
                            )}
                          </div>
                        </div>
                        {attempt.photo_urls?.length > 0 && (
                          <ImageIcon className="w-4 h-4 text-blue-500" />
                        )}
                      </div>
                    );
                  })}
                </div>

                {/* What's Earned / What's Needed Summary */}
                <div className="grid grid-cols-2 gap-2 mt-3">
                  <QualifierBox 
                    label="EARNED" 
                    badges={(() => {
                      const completedAttempts = sortedAttempts.filter(a => a.status !== 'in_progress');
                      const { earnedBadges } = getNeededQualifiers(completedAttempts);
                      return earnedBadges;
                    })()}
                    emptyText="None yet"
                    variant="success"
                  />
                  <QualifierBox 
                    label="STILL NEED" 
                    badges={(() => {
                      const completedAttempts = sortedAttempts.filter(a => a.status !== 'in_progress');
                      const { needed, isComplete } = getNeededQualifiers(completedAttempts);
                      return isComplete ? [] : needed;
                    })()}
                    emptyText="✓ Complete!"
                    variant="warning"
                  />
                </div>

                {/* Status Badges */}
                <div className="flex items-center gap-2 flex-wrap mt-3">
                  {isVerified && (
                    <Badge className="bg-teal-100 text-teal-700 border border-teal-200 text-[10px] font-bold px-2.5 py-1">
                      VERIFIED
                    </Badge>
                  )}
                  {address.has_dcn && (
                    <Badge className="bg-purple-100 text-purple-700 border border-purple-200 text-[10px] font-bold px-2.5 py-1">
                      DCN
                    </Badge>
                  )}
                </div>
              </>
            )}
          </div>
        )}

        {/* ATTEMPT TAB - Individual attempt details (not for postings) */}
        {attemptCount > 0 && !isServed && activeTab > 0 && selectedAttempt && address.serve_type !== 'posting' && (
          <div className="px-4 py-3 border-t border-gray-100">
            {/* Header with qualifier badges */}
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-semibold text-gray-500">
                ATTEMPT {activeTab} {selectedAttempt.status === 'in_progress' && '(IN PROGRESS)'}
              </h3>
              <QualifierBadges 
                badges={selectedAttempt.qualifier_badges || [selectedAttempt.qualifier?.toUpperCase()]} 
                size="default" 
              />
            </div>

            {/* Date & Time — editable when allowed */}
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-lg bg-amber-100 flex items-center justify-center">
                <Calendar className="w-5 h-5 text-amber-600" />
              </div>
              <div className="flex-1">
                <p className="text-xs text-gray-500 font-medium">DATE & TIME</p>
                {canEditAttemptTimes && selectedAttempt.status === 'completed' ? (
                  <input
                    type="datetime-local"
                    value={(() => {
                      const d = new Date(selectedAttempt.attempt_time);
                      const offset = d.getTimezoneOffset();
                      const local = new Date(d.getTime() - offset * 60000);
                      return local.toISOString().slice(0, 16);
                    })()}
                    onChange={(e) => handleEditAttemptTime(selectedAttempt, e.target.value)}
                    onClick={(e) => e.stopPropagation()}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm font-semibold focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                ) : (
                  <p className="text-base font-semibold">
                    {new Date(selectedAttempt.attempt_time).toLocaleString('en-US', {
                      weekday: 'short',
                      month: 'numeric',
                      day: 'numeric',
                      year: '2-digit',
                      hour: 'numeric',
                      minute: '2-digit',
                      hour12: true
                    })}
                  </p>
                )}
              </div>
            </div>

            {/* Outcome - only for completed attempts */}
            {selectedAttempt.status !== 'in_progress' && selectedAttempt.outcome && (
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 rounded-lg bg-green-100 flex items-center justify-center">
                  <CheckCircle className="w-5 h-5 text-green-600" />
                </div>
                <div>
                  <p className="text-xs text-gray-500 font-medium">OUTCOME</p>
                  <p className="text-base font-semibold capitalize">
                    {selectedAttempt.outcome?.replace('_', ' ')}
                  </p>
                </div>
              </div>
            )}

            {/* Coordinates */}
            {selectedAttempt.user_latitude && selectedAttempt.user_longitude && (
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 rounded-lg bg-indigo-100 flex items-center justify-center">
                  <MapPin className="w-5 h-5 text-indigo-600" />
                </div>
                <div>
                  <p className="text-xs text-gray-500 font-medium">COORDINATES</p>
                  <p className="text-base font-semibold">
                    {selectedAttempt.user_latitude?.toFixed(6)}, {selectedAttempt.user_longitude?.toFixed(6)}
                  </p>
                </div>
              </div>
            )}

            {/* Distance */}
            {selectedAttempt.distance_feet != null && (
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 rounded-lg bg-green-100 flex items-center justify-center">
                  <Navigation className="w-5 h-5 text-green-600" />
                </div>
                <div>
                  <p className="text-xs text-gray-500 font-medium">DISTANCE</p>
                  <p className="text-base font-semibold">
                    {selectedAttempt.distance_feet?.toLocaleString()} feet from address
                  </p>
                </div>
              </div>
            )}

            {/* Notes (editable) */}
            {editingNotes ? (
              <div className="bg-blue-50 rounded-xl p-4 mb-4 border border-blue-200">
                <div className="flex items-center gap-2 mb-2">
                  <MessageSquare className="w-4 h-4 text-blue-600" />
                  <span className="text-xs text-blue-600 font-medium">EDIT NOTES</span>
                </div>
                <textarea
                  value={editedNotesText}
                  onChange={(e) => setEditedNotesText(e.target.value)}
                  className="w-full p-3 border border-gray-300 rounded-lg text-sm resize-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  rows={4}
                  autoFocus
                  onClick={(e) => e.stopPropagation()}
                />
                <div className="flex gap-2 mt-3">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={(e) => { e.stopPropagation(); setEditingNotes(false); }}
                    className="flex-1"
                  >
                    Cancel
                  </Button>
                  <Button
                    size="sm"
                    onClick={(e) => { e.stopPropagation(); handleSaveNotes(); }}
                    className="flex-1 bg-blue-500 hover:bg-blue-600 text-white"
                  >
                    Save
                  </Button>
                </div>
              </div>
            ) : selectedAttempt.notes ? (
              <div 
                onClick={handleEditNotes}
                className="bg-gray-50 rounded-xl p-4 mb-4 cursor-pointer hover:bg-gray-100 transition"
              >
                <div className="flex items-center gap-2 mb-2">
                  <MessageSquare className="w-4 h-4 text-gray-500" />
                  <span className="text-xs text-gray-500 font-medium">NOTES</span>
                </div>
                <p className="text-sm text-gray-800 whitespace-pre-wrap">
                  {selectedAttempt.notes}
                </p>
                <p className="text-xs text-blue-500 mt-2">Tap to edit</p>
              </div>
            ) : null}

            {/* View Photos Button */}
            {selectedAttempt.photo_urls?.length > 0 && (
              <Button
                variant="outline"
                onClick={(e) => { e.stopPropagation(); setShowPhotoViewer(true); }}
                className="w-full mb-3"
              >
                <Camera className="w-4 h-4 mr-2" />
                View Evidence Photos ({selectedAttempt.photo_urls.length})
              </Button>
            )}
            
            {/* Add More Photos button for in_progress attempts */}
            {selectedAttempt.status === 'in_progress' && (
              <Button
                variant="outline"
                onClick={handleCaptureEvidence}
                className="w-full border-amber-300 text-amber-700 hover:bg-amber-50"
              >
                <Plus className="w-4 h-4 mr-2" />
                Add More Photos
              </Button>
            )}

            {/* Delete Attempt button — always available to workers */}
            {!isBossView && selectedAttempt && (
              <Button
                variant="outline"
                onClick={(e) => { e.stopPropagation(); handleDeleteAttempt(selectedAttempt); }}
                className="w-full mt-2 border-red-200 text-red-600 hover:bg-red-50 hover:text-red-700"
              >
                <Trash2 className="w-4 h-4 mr-2" />
                Delete Attempt {activeTab}
              </Button>
            )}
            </div>
            )}

        {/* No Attempts Yet - Show badges */}
        {attemptCount === 0 && !isServed && (
          <div className="px-4 py-3 border-t border-gray-100">
            <div className="flex items-center gap-2 flex-wrap">
              <Badge className={`text-[10px] font-bold px-2.5 py-1 ${
                address.serve_type === 'garnishment' ? 'bg-purple-100 text-purple-700 border border-purple-200' :
                address.serve_type === 'posting' ? 'bg-green-100 text-green-700 border border-green-200' :
                'bg-blue-100 text-blue-700 border border-blue-200'
              }`}>
                {(address.serve_type || 'serve').toUpperCase()}
              </Badge>
              {isVerified && (
                <Badge className="bg-teal-100 text-teal-700 border border-teal-200 text-[10px] font-bold px-2.5 py-1">
                  VERIFIED
                </Badge>
              )}
              {address.has_dcn && (
                <Badge className="bg-purple-100 text-purple-700 border border-purple-200 text-[10px] font-bold px-2.5 py-1">
                  DCN
                </Badge>
              )}
              <span className="text-xs text-gray-500 ml-auto">No attempts yet</span>
            </div>
          </div>
        )}

        {/* Served State - Show completion info */}
        {isServed && (
          <div className="px-4 py-3 border-t border-gray-100 bg-green-50/50">
            <div className="flex items-center gap-2 flex-wrap">
              <Badge className="bg-green-100 text-green-700 border border-green-200 text-[10px] font-bold px-2.5 py-1">
                SERVED
              </Badge>
              {receiptApproved ? (
                <Badge className="bg-green-100 text-green-700 border border-green-200 text-[10px] font-bold px-2.5 py-1">
                  <FileCheck className="w-3 h-3 mr-1" />
                  RECEIPT APPROVED
                </Badge>
              ) : receiptPending ? (
                <Badge className="bg-yellow-100 text-yellow-700 border border-yellow-200 text-[10px] font-bold px-2.5 py-1">
                  <Clock className="w-3 h-3 mr-1" />
                  PENDING REVIEW
                </Badge>
              ) : receiptNeedsRevision ? (
                <Badge className="bg-orange-100 text-orange-700 border border-orange-200 text-[10px] font-bold px-2.5 py-1">
                  <AlertCircle className="w-3 h-3 mr-1" />
                  NEEDS REVISION
                </Badge>
              ) : null}
              {address.served_at && (
                <span className="text-xs text-gray-500 ml-auto">
                  {format(new Date(address.served_at), "M/d/yy 'at' h:mm a")}
                </span>
              )}
            </div>
          </div>
        )}

        {/* Action Buttons */}
        {showActions && !isServed && (
          <div className="px-4 py-3 space-y-2">
            {isBossView ? (
              /* ========== BOSS ACTIONS ========== */
              <>
                {/* Primary row: 3 equal buttons */}
                <div className="grid grid-cols-3 gap-2">
                  <Button 
                    onClick={(e) => {
                      e.stopPropagation();
                      navigate(createPageUrl(`EditAddress?addressId=${address.id}&routeId=${routeId}`));
                    }}
                    className="h-14 bg-blue-500 hover:bg-blue-600 text-white font-bold text-xs rounded-xl flex flex-col items-center justify-center gap-1"
                  >
                    <Pencil className="w-5 h-5" />
                    <span>EDIT</span>
                  </Button>

                  <Button 
                    onClick={(e) => {
                      e.stopPropagation();
                      setShowBossAddAttempt(!showBossAddAttempt);
                      setShowRequestAttempt(false);
                    }}
                    className={`h-14 font-bold text-xs rounded-xl flex flex-col items-center justify-center gap-1 ${
                      showBossAddAttempt 
                        ? 'bg-amber-600 hover:bg-amber-700 text-white' 
                        : 'bg-amber-500 hover:bg-amber-600 text-white'
                    }`}
                  >
                    <Plus className="w-5 h-5" />
                    <span>ADD ATTEMPT</span>
                  </Button>

                  <Button 
                    onClick={(e) => {
                      e.stopPropagation();
                      setShowRequestAttempt(!showRequestAttempt);
                      setShowBossAddAttempt(false);
                    }}
                    className={`h-14 font-bold text-xs rounded-xl flex flex-col items-center justify-center gap-1 ${
                      showRequestAttempt 
                        ? 'bg-red-600 hover:bg-red-700 text-white' 
                        : 'bg-red-500 hover:bg-red-600 text-white'
                    }`}
                  >
                    <RotateCcw className="w-5 h-5" />
                    <span>REQUEST</span>
                  </Button>
                </div>

                {/* Secondary row: 2 buttons */}
                <div className="grid grid-cols-2 gap-2">
                  <Button 
                    onClick={(e) => {
                      e.stopPropagation();
                      navigate(createPageUrl(`AddressDetail?addressId=${address.id}&routeId=${routeId}`));
                    }}
                    variant="outline"
                    className="h-12 font-bold text-xs rounded-xl flex items-center justify-center gap-2"
                  >
                    <FileText className="w-4 h-4" />
                    DETAILS
                  </Button>

                  <Button 
                    onClick={(e) => {
                      e.stopPropagation();
                      setShowMoveModal(true);
                    }}
                    variant="outline"
                    className="h-12 font-bold text-xs rounded-xl flex items-center justify-center gap-2"
                  >
                    <ArrowRightLeft className="w-4 h-4" />
                    MOVE
                  </Button>
                </div>
              </>
            ) : (
              /* ========== WORKER ACTIONS ========== */
              <>
                {address.serve_type === 'posting' ? (
                  /* === POSTING BUTTONS === */
                  <>
                    {/* Main Action Button */}
                    {attemptCount > 0 ? (
                      /* Evidence already taken — show FINALIZE POSTING */
                      <Button 
                        onClick={handleFinalizePosting}
                        disabled={finalizingAttempt}
                        className="w-full h-12 bg-orange-500 hover:bg-orange-600 text-white font-bold text-sm rounded-xl animate-pulse"
                      >
                        {finalizingAttempt ? (
                          <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        ) : (
                          <Shield className="w-4 h-4 mr-2" />
                        )}
                        FINALIZE POSTING
                      </Button>
                    ) : (
                      /* No evidence yet — show TAKE PHOTO */
                      <Button 
                        onClick={handleCaptureEvidence}
                        className="w-full h-12 bg-blue-500 hover:bg-blue-600 text-white font-bold text-sm rounded-xl"
                      >
                        <Camera className="w-4 h-4 mr-2" />
                        TAKE PHOTO
                      </Button>
                    )}

                    {/* Posting: 2 buttons — ADD PHOTO + DETAILS */}
                    <div className="grid grid-cols-2 gap-2">
                      <Button 
                        onClick={handleCaptureEvidence}
                        className="h-14 bg-blue-500 hover:bg-blue-600 text-white font-bold text-xs rounded-xl flex flex-col items-center justify-center gap-1"
                      >
                        <Plus className="w-5 h-5" />
                        <span>ADD PHOTO</span>
                      </Button>
                      
                      <Button 
                        onClick={(e) => {
                          e.stopPropagation();
                          navigate(createPageUrl(`AddressDetail?addressId=${address.id}&routeId=${routeId}`));
                        }}
                        className="h-14 bg-gray-500 hover:bg-gray-600 text-white font-bold text-xs rounded-xl flex flex-col items-center justify-center gap-1"
                      >
                        <FileText className="w-5 h-5" />
                        <span>DETAILS</span>
                      </Button>
                    </div>
                  </>
                ) : (
                  /* === REGULAR SERVE BUTTONS === */
                  <>
                    {/* Main Action - Changes based on state */}
                    {hasInProgressAttempt ? (
                      <Button 
                        onClick={handleLogAttempt}
                        disabled={finalizingAttempt}
                        className="w-full h-12 bg-orange-500 hover:bg-orange-600 text-white font-bold text-sm rounded-xl animate-pulse"
                      >
                        {finalizingAttempt ? (
                          <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        ) : (
                          <Zap className="w-4 h-4 mr-2" />
                        )}
                        LOG ATTEMPT {inProgressAttempt.attempt_number}
                      </Button>
                    ) : (
                      <Button 
                        onClick={handleCaptureEvidence}
                        className="w-full h-12 bg-blue-500 hover:bg-blue-600 text-white font-bold text-sm rounded-xl"
                      >
                        <Camera className="w-4 h-4 mr-2" />
                        TAKE EVIDENCE
                      </Button>
                    )}

                    {/* Secondary Actions Row - 3 buttons */}
                    <div className="grid grid-cols-3 gap-2">
                      {hasInProgressAttempt ? (
                        <Button 
                          onClick={handleCaptureEvidence}
                          className="h-14 bg-blue-500 hover:bg-blue-600 text-white font-bold text-xs rounded-xl flex flex-col items-center justify-center gap-1"
                        >
                          <Plus className="w-5 h-5" />
                          <span>ADD PHOTO</span>
                        </Button>
                      ) : (
                        <Button 
                          onClick={handleLogAttempt}
                          disabled
                          className="h-14 bg-gray-300 text-gray-500 font-bold text-xs rounded-xl flex flex-col items-center justify-center gap-1 cursor-not-allowed"
                        >
                          <Zap className="w-5 h-5" />
                          <span>LOG</span>
                        </Button>
                      )}
                      
                      <Button 
                        onClick={(e) => {
                          e.stopPropagation();
                          navigate(createPageUrl(`AddressDetail?addressId=${address.id}&routeId=${routeId}`));
                        }}
                        className="h-14 bg-gray-500 hover:bg-gray-600 text-white font-bold text-xs rounded-xl flex flex-col items-center justify-center gap-1"
                      >
                        <FileText className="w-5 h-5" />
                        <span>DETAILS</span>
                      </Button>
                      
                      <Link 
                        to={createPageUrl(`SubmitReceipt?addressId=${address.id}&routeId=${routeId}&attemptId=${selectedAttempt?.id || localAttempts?.[localAttempts.length - 1]?.id || ''}&finalize=true`)}
                        onClick={(e) => e.stopPropagation()}
                      >
                        <Button 
                          className="w-full h-14 bg-emerald-500 hover:bg-emerald-600 text-white font-bold text-xs rounded-xl flex flex-col items-center justify-center gap-1"
                        >
                          <Shield className="w-5 h-5" />
                          <span>FINALIZE</span>
                        </Button>
                      </Link>
                    </div>
                  </>
                )}

                {/* Navigate Button — ONLY in worker view */}
                <div className="flex items-center border border-gray-200 rounded-xl overflow-hidden">
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <button className="p-3 border-r border-gray-200 hover:bg-gray-50 transition-colors">
                        <MoreVertical className="w-5 h-5 text-gray-400" />
                      </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="start" side="top">
                      {onMessageBoss && (
                        <DropdownMenuItem onClick={(e) => { e.stopPropagation(); onMessageBoss(address); }}>
                          <MessageCircle className="w-4 h-4 mr-2" />
                          Message Boss
                        </DropdownMenuItem>
                      )}
                      <DropdownMenuItem 
                        onClick={(e) => { e.stopPropagation(); handleDeleteAddress(); }}
                        className="text-red-600 focus:text-red-600"
                      >
                        <Trash2 className="w-4 h-4 mr-2" />
                        Delete Address
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                  <button 
                    onClick={handleNavigate}
                    className="flex-1 flex items-center justify-center gap-2 py-3 hover:bg-gray-50 transition-colors"
                  >
                    <Navigation className="w-5 h-5 text-green-600" />
                    <span className="font-bold text-green-600 tracking-wide">NAVIGATE</span>
                  </button>
                </div>
                </>
                )}
          </div>
        )}

        {/* Boss Add Attempt — Inline Panel */}
        {isBossView && showBossAddAttempt && (
          <div className="px-4 pb-4">
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
              <h4 className="text-sm font-bold text-amber-800 mb-3">Add Attempt</h4>
              
              <div className="mb-3">
                <label className="text-xs font-semibold text-gray-600 block mb-1">DATE & TIME</label>
                <input
                  type="datetime-local"
                  value={bossAttemptTime}
                  onChange={(e) => setBossAttemptTime(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                  onClick={(e) => e.stopPropagation()}
                />
              </div>

              <div className="mb-3">
                <label className="text-xs font-semibold text-gray-600 block mb-1">OUTCOME</label>
                <div className="grid grid-cols-3 gap-2">
                  {OUTCOME_OPTIONS.map((opt) => (
                    <button
                      key={opt.value}
                      onClick={(e) => { e.stopPropagation(); setBossAttemptOutcome(opt.value); }}
                      className={`p-2 rounded-lg text-xs font-semibold transition-all ${
                        bossAttemptOutcome === opt.value 
                          ? 'ring-2 ring-amber-500 ' + opt.color
                          : opt.color + ' opacity-60'
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="mb-3">
                <label className="text-xs font-semibold text-gray-600 block mb-1">NOTES</label>
                <textarea
                  value={bossAttemptNotes}
                  onChange={(e) => setBossAttemptNotes(e.target.value)}
                  placeholder="Optional notes..."
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm resize-none"
                  rows={2}
                  onClick={(e) => e.stopPropagation()}
                />
              </div>

              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={(e) => { e.stopPropagation(); setShowBossAddAttempt(false); }}
                  className="flex-1"
                >
                  Cancel
                </Button>
                <Button
                  size="sm"
                  onClick={(e) => { e.stopPropagation(); handleBossCreateAttempt(); }}
                  disabled={!bossAttemptOutcome || !bossAttemptTime || bossCreatingAttempt}
                  className="flex-1 bg-amber-500 hover:bg-amber-600 text-white"
                >
                  {bossCreatingAttempt ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : null}
                  Save Attempt
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* Boss Request Attempt — Inline Panel */}
        {isBossView && showRequestAttempt && (
          <div className="px-4 pb-4">
            <div className="bg-red-50 border border-red-200 rounded-xl p-4">
              <h4 className="text-sm font-bold text-red-800 mb-3">Request New Attempt</h4>
              <p className="text-xs text-red-600 mb-3">
                Worker will see this request highlighted on their route
              </p>
              
              <div className="mb-3">
                <label className="text-xs font-semibold text-gray-600 block mb-2">
                  REQUIRED TIME FRAME (tap all that apply)
                </label>
                <div className="grid grid-cols-4 gap-2">
                  {[
                    { value: 'AM', label: 'AM', desc: 'Before noon', bg: 'bg-sky-100 text-sky-700 border-sky-300' },
                    { value: 'PM', label: 'PM', desc: '5 PM - 9 PM', bg: 'bg-indigo-100 text-indigo-700 border-indigo-300' },
                    { value: 'WEEKEND', label: 'WKND', desc: 'Sat or Sun', bg: 'bg-orange-100 text-orange-700 border-orange-300' },
                    { value: 'ANYTIME', label: 'ANY', desc: 'Any time', bg: 'bg-gray-100 text-gray-700 border-gray-300' },
                  ].map(q => {
                    const isSelected = requestQualifiers.includes(q.value);
                    const isAnytime = q.value === 'ANYTIME';
                    
                    return (
                      <button
                        key={q.value}
                        onClick={(e) => {
                          e.stopPropagation();
                          if (isAnytime) {
                            setRequestQualifiers(['ANYTIME']);
                          } else {
                            setRequestQualifiers(prev => {
                              const filtered = prev.filter(v => v !== 'ANYTIME');
                              return filtered.includes(q.value)
                                ? filtered.filter(v => v !== q.value)
                                : [...filtered, q.value];
                            });
                          }
                        }}
                        className={`p-3 rounded-xl text-center border-2 transition-all ${
                          isSelected 
                            ? `${q.bg} border-current ring-2 ring-offset-1` 
                            : 'bg-gray-50 text-gray-400 border-gray-200'
                        }`}
                      >
                        <span className="block text-sm font-bold">{q.label}</span>
                        <span className="block text-[10px] mt-0.5">{q.desc}</span>
                      </button>
                    );
                  })}
                </div>
                
                <div className="flex gap-2 mt-2">
                  <button
                    onClick={(e) => { e.stopPropagation(); setRequestQualifiers(['WEEKEND', 'PM']); }}
                    className="text-[10px] px-2 py-1 rounded-full bg-gray-100 text-gray-600 hover:bg-gray-200"
                  >
                    WKND + PM
                  </button>
                  <button
                    onClick={(e) => { e.stopPropagation(); setRequestQualifiers(['WEEKEND', 'AM']); }}
                    className="text-[10px] px-2 py-1 rounded-full bg-gray-100 text-gray-600 hover:bg-gray-200"
                  >
                    WKND + AM
                  </button>
                </div>
              </div>

              <div className="mb-3">
                <label className="text-xs font-semibold text-gray-600 block mb-1">NOTE TO WORKER</label>
                <textarea
                  value={requestNote}
                  onChange={(e) => setRequestNote(e.target.value)}
                  placeholder="Law office requires another attempt because..."
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm resize-none"
                  rows={2}
                  maxLength={500}
                  onClick={(e) => e.stopPropagation()}
                />
              </div>

              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={(e) => { 
                    e.stopPropagation(); 
                    setShowRequestAttempt(false);
                    setRequestQualifiers([]);
                    setRequestNote('');
                  }}
                  className="flex-1"
                >
                  Cancel
                </Button>
                <Button
                  size="sm"
                  onClick={(e) => { e.stopPropagation(); handleCreateRequest(); }}
                  disabled={requestQualifiers.length === 0 || creatingRequest}
                  className="flex-1 bg-red-500 hover:bg-red-600 text-white"
                >
                  {creatingRequest ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : null}
                  Send Request
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* Edit Panel — shows when editMode + user taps edit */}
        {isEditing && (
          <div className="px-4 py-3 border-t border-blue-200 bg-blue-50" onClick={(e) => e.stopPropagation()}>
            <div className="space-y-3">
              <div>
                <label className="text-xs font-semibold text-gray-600">Defendant Name</label>
                <input
                  type="text"
                  value={editFields.defendant_name}
                  onChange={(e) => setEditFields(prev => ({ ...prev, defendant_name: e.target.value }))}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm mt-1"
                  placeholder="Defendant name"
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-600">Street Address</label>
                <input
                  type="text"
                  value={editFields.normalized_address}
                  onChange={(e) => setEditFields(prev => ({ ...prev, normalized_address: e.target.value }))}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm mt-1"
                />
              </div>
              <div className="grid grid-cols-3 gap-2">
                <div>
                  <label className="text-xs font-semibold text-gray-600">City</label>
                  <input
                    type="text"
                    value={editFields.city}
                    onChange={(e) => setEditFields(prev => ({ ...prev, city: e.target.value }))}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm mt-1"
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold text-gray-600">State</label>
                  <input
                    type="text"
                    value={editFields.state}
                    onChange={(e) => setEditFields(prev => ({ ...prev, state: e.target.value }))}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm mt-1"
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold text-gray-600">Zip</label>
                  <input
                    type="text"
                    value={editFields.zip}
                    onChange={(e) => setEditFields(prev => ({ ...prev, zip: e.target.value }))}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm mt-1"
                  />
                </div>
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-600">Serve Type</label>
                <select
                  value={editFields.serve_type}
                  onChange={(e) => setEditFields(prev => ({ ...prev, serve_type: e.target.value }))}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm mt-1"
                >
                  <option value="serve">Serve</option>
                  <option value="garnishment">Garnishment</option>
                  <option value="posting">Posting</option>
                </select>
              </div>
              <div className="flex gap-2">
                <Button
                  onClick={handleSaveEdit}
                  className="flex-1 bg-blue-500 hover:bg-blue-600 text-white"
                >
                  Save Changes
                </Button>
                <Button
                  variant="outline"
                  onClick={() => setIsEditing(false)}
                >
                  Cancel
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* Receipt Status Alert */}
        {receiptNeedsRevision && (
          <div className="px-4 py-2 bg-orange-50 border-t border-orange-200">
            <div className="flex items-center gap-2 text-orange-700">
              <AlertCircle className="w-4 h-4" />
              <span className="text-xs font-medium">Receipt needs revision - please resubmit</span>
            </div>
          </div>
        )}
        {receiptPending && (
          <div className="px-4 py-2 bg-yellow-50 border-t border-yellow-200">
            <div className="flex items-center gap-2 text-yellow-700">
              <Clock className="w-4 h-4" />
              <span className="text-xs font-medium">Receipt pending review</span>
            </div>
          </div>
        )}
      </div>

      {/* Evidence Camera Modal */}
      <EvidenceCamera
        open={showCamera}
        onClose={() => setShowCamera(false)}
        onPhotoTaken={handlePhotoTaken}
      />

      {/* Evidence Comment Modal */}
      <EvidenceCommentModal
        open={showCommentModal}
        onClose={() => {
          setShowCommentModal(false);
          setCapturedPhoto(null);
        }}
        onSave={handleSaveEvidence}
        photoPreview={capturedPhoto?.dataUrl}
        saving={savingEvidence}
        requireComment={!hasInProgressAttempt && address.serve_type !== 'posting'}
      />



      {/* Photo Viewer */}
      <PhotoViewer
        open={showPhotoViewer}
        onClose={() => setShowPhotoViewer(false)}
        photos={address.serve_type === 'posting' 
          ? (sortedAttempts[0]?.photo_urls || [])
          : (selectedAttempt?.photo_urls || [])
        }
      />


    </>
  );
}