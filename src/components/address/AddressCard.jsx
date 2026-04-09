import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import { base44 } from '@/api/base44Client';
import { useQueryClient, useQuery } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import * as DropdownMenuPrimitives from "@/components/ui/dropdown-menu";
const {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} = DropdownMenuPrimitives;
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
  Trash2,
  Copy
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
import RTOModal from './RTOModal';
import { getCompanyId } from '@/components/utils/companyUtils';
import { formatAddress as formatAddressUtil } from '@/components/utils/addressUtils';
import { handleRTO as executeRTO } from './RTOHandler';
import BossAddAttemptPanel from './BossAddAttemptPanel';
import BossRequestAttemptPanel from './BossRequestAttemptPanel';

// Re-export formatAddress for backward compatibility
export const formatAddress = formatAddressUtil;

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
  editMode = false,
  isHighlighted = false,
  folderName,
  comboRouteIds = null
}) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const actualRouteId = address.route_id || routeId;
  const formatted = formatAddressUtil(address);
  const receiptStatus = address.receipt_status;
  const needsReceipt = !address.served && receiptStatus === 'pending';
  const receiptPending = receiptStatus === 'pending_review';
  const receiptApproved = receiptStatus === 'approved';
  const receiptNeedsRevision = receiptStatus === 'needs_revision';
  const isVerified = address.verification_status === 'verified';
  
  const [localAttempts, setLocalAttempts] = useState(allAttempts);
  const attemptCount = localAttempts.length;
  const [activeTab, setActiveTab] = useState(0);
  const [showCamera, setShowCamera] = useState(false);
  const [showCommentModal, setShowCommentModal] = useState(false);
  const [capturedPhoto, setCapturedPhoto] = useState(null);
  const [savingEvidence, setSavingEvidence] = useState(false);
  const [showPhotoViewer, setShowPhotoViewer] = useState(false);
  const [finalizingAttempt, setFinalizingAttempt] = useState(false);
  const [editingNotes, setEditingNotes] = useState(false);
  const [editedNotesText, setEditedNotesText] = useState('');
  const [showBossAddAttempt, setShowBossAddAttempt] = useState(false);
  const [showRequestAttempt, setShowRequestAttempt] = useState(false);
  const [showMoveModal, setShowMoveModal] = useState(false);
  const [showRequestDetail, setShowRequestDetail] = useState(false);
  const [workerReplyText, setWorkerReplyText] = useState('');
  const [isEditing, setIsEditing] = useState(false);
  const [showRTOModal, setShowRTOModal] = useState(false);
  const [savingRTO, setSavingRTO] = useState(false);
  const [editFields, setEditFields] = useState({
    defendant_name: address.defendant_name || '',
    normalized_address: address.normalized_address || address.legal_address || '',
    city: address.city || '',
    state: address.state || '',
    zip: address.zip || '',
    serve_type: address.serve_type || 'serve'
  });

  const invalidateAttemptQueries = () => {
    if (comboRouteIds) {
      queryClient.invalidateQueries({ queryKey: ['comboDetailAttempts', comboRouteIds] });
      queryClient.invalidateQueries({ queryKey: ['comboDetailAddresses', comboRouteIds] });
    }
    queryClient.invalidateQueries({ queryKey: ['routeAttempts', actualRouteId] });
    queryClient.invalidateQueries({ queryKey: ['routeAddresses', actualRouteId] });
    if (routeId !== actualRouteId) {
      queryClient.invalidateQueries({ queryKey: ['routeAttempts', routeId] });
      queryClient.invalidateQueries({ queryKey: ['routeAddresses', routeId] });
    }
  };

  const { data: user } = useQuery({
    queryKey: ['currentUser'],
    queryFn: () => base44.auth.me()
  });

  const canEditAttemptTimes = React.useMemo(() => {
    if (!user) return false;
    if (user.role === 'boss' || user.role === 'admin') return true;
    const createdAt = user.created_date ? new Date(user.created_date) : null;
    if (createdAt) {
      const daysSinceCreated = Math.floor((Date.now() - createdAt.getTime()) / (1000 * 60 * 60 * 24));
      if (daysSinceCreated <= 5) return true;
    }
    if (user.editing_enabled) return true;
    return false;
  }, [user]);
  
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
  
  React.useEffect(() => {
    setLocalAttempts(prev => {
      const pendingTemps = prev.filter(a => a.id?.startsWith('temp_'));
      if (pendingTemps.length === 0) return allAttempts;
      const serverIds = new Set(allAttempts.map(a => a.id));
      return [...allAttempts, ...pendingTemps.filter(t => !serverIds.has(t.id))];
    });
  }, [allAttempts]);

  React.useEffect(() => {
    if (showCamera) {
      document.body.classList.add('camera-active');
    } else {
      document.body.classList.remove('camera-active');
    }
    return () => document.body.classList.remove('camera-active');
  }, [showCamera]);
  
  const sortedAttempts = [...localAttempts].sort((a, b) => 
    new Date(a.attempt_time) - new Date(b.attempt_time)
  );
  
  const inProgressAttempt = sortedAttempts.find(a => a.status === 'in_progress');
  const hasInProgressAttempt = !!inProgressAttempt;

  const handleNavigate = (e) => {
    e.stopPropagation();
    const streetLine = formatted.line1 || '';
    const match = streetLine.match(/^(\d+)\s+([A-Za-z]{1,2})/i);
    if (match) {
      const clipboardText = `${match[1]} ${match[2].toUpperCase()}`;
      try {
        navigator.clipboard.writeText(clipboardText);
        toast.success(`Copied: ${clipboardText}`);
      } catch (err) {
        toast.info(`Address: ${clipboardText}`);
      }
    }
    const addressStr = `${formatted.line1}, ${formatted.line2}`;
    const encoded = encodeURIComponent(addressStr);
    window.open(`https://www.google.com/maps/dir/?api=1&destination=${encoded}`, '_blank');
  };

  const handleCardClick = () => {
    if (onClick) onClick(address);
  };

  const handleCaptureEvidence = (e) => {
    e.stopPropagation();
    setShowCamera(true);
  };

  const handlePhotoTaken = async ({ file, dataUrl }) => {
    setCapturedPhoto({ file, dataUrl });
    setShowCamera(false);
    setShowCommentModal(true);
  };

  const handleSaveEvidence = async (comment) => {
    if (!capturedPhoto) return;
    if (!hasInProgressAttempt && !comment.trim() && address.serve_type !== 'posting') {
      toast.error('Please add a description');
      return;
    }
    const photoToUpload = capturedPhoto;
    setSavingEvidence(true);
    try {
      const { file_url } = await base44.integrations.Core.UploadFile({ file: photoToUpload.file });
      setCapturedPhoto(null);
      setShowCommentModal(false);
      if (hasInProgressAttempt) {
        const existingPhotos = inProgressAttempt.photo_urls || [];
        const existingNotes = inProgressAttempt.notes || '';
        const newNotes = comment.trim() ? (existingNotes ? `${existingNotes}\n\n${comment}` : comment) : existingNotes;
        await base44.entities.Attempt.update(inProgressAttempt.id, {
          photo_urls: [...existingPhotos, file_url],
          notes: newNotes
        });
        const updatedAttempts = localAttempts.map(a => 
          a.id === inProgressAttempt.id ? { ...a, photo_urls: [...existingPhotos, file_url], notes: newNotes } : a
        );
        setLocalAttempts(updatedAttempts);
        toast.success('Photo added!');
      } else {
        if (user?.role === 'server') {
          try {
            const routes = await base44.entities.Route.filter({ id: actualRouteId });
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
        if (qualifierData.isOutsideHours) {
          const proceed = window.confirm(
            'This attempt is outside service hours (8 AM - 9 PM Michigan time). ' +
            'It will NOT earn any qualifier credit (AM/PM/WEEKEND). Continue?'
          );
          if (!proceed) return;
        }
        const qualifierFields = getQualifierStorageFields(qualifierData);
        const attemptNumber = attemptCount + 1;
        const companyId = user.company_id || user.data?.company_id || address.company_id || 'default';
        const isPosting = address.serve_type === 'posting';
        const tempAttempt = {
          id: 'temp_' + Date.now(),
          address_id: address.id,
          route_id: actualRouteId,
          server_id: user.id,
          company_id: companyId,
          attempt_number: attemptNumber,
          status: isPosting ? 'completed' : 'in_progress',
          outcome: isPosting ? 'posted' : undefined,
          attempt_time: now.toISOString(),
          attempt_timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
          ...qualifierFields,
          notes: comment,
          photo_urls: [photoToUpload.dataUrl],
        };
        setLocalAttempts(prev => [...prev, tempAttempt]);
        setTimeout(() => setActiveTab(attemptNumber), 50);
        let userLat = null, userLon = null, distanceFeet = null;
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
        const newAttempt = await base44.entities.Attempt.create({
          address_id: address.id,
          route_id: actualRouteId,
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
        setLocalAttempts(prev => prev.map(a => a.id === tempAttempt.id ? newAttempt : a));
        if (attemptNumber === 1 && actualRouteId) {
          try {
            const currentRoute = await base44.entities.Route.filter({ id: actualRouteId });
            if (currentRoute[0] && !currentRoute[0].first_attempt_date) {
              await base44.entities.Route.update(actualRouteId, { first_attempt_date: now.toISOString() });
            }
          } catch (e) {
            console.warn('Failed to set first_attempt_date:', e);
          }
        }
        await base44.entities.Address.update(address.id, {
          attempts_count: attemptNumber,
          status: address.status === 'pending' ? 'attempted' : address.status
        });
        if (isPosting) {
          toast.success('Photo saved! Review and submit the receipt.');
          const returnParam = comboRouteIds ? `&returnTo=WorkerComboRouteDetail?id=${routeId}` : '';
          navigate(createPageUrl(`SubmitReceipt?addressId=${address.id}&routeId=${actualRouteId}&attemptId=${newAttempt.id}&finalize=true${returnParam}`));
          return;
        }
        toast.success(`Evidence saved - ${qualifierData.display}`);
      }
      invalidateAttemptQueries();
    } catch (error) {
      console.error('Failed to save evidence:', error);
      toast.error('Failed to save - please try again');
    } finally {
      setSavingEvidence(false);
    }
  };

  const handleLogAttempt = async (e) => {
    e.stopPropagation();
    if (!user) { toast.error('Please log in first'); return; }
    if (!hasInProgressAttempt) { toast.error('Take a photo first! Tap Evidence to start.'); return; }
    if (!inProgressAttempt.photo_urls || inProgressAttempt.photo_urls.length === 0) {
      toast.error('You must take at least one photo before logging'); return;
    }
    setFinalizingAttempt(true);
    try {
      const now = new Date();
      const companyId = getCompanyId(user) || address.company_id;
      const updatedAttempts = localAttempts.map(a => 
        a.id === inProgressAttempt.id ? { ...a, status: 'completed', outcome: 'other' } : a
      );
      setLocalAttempts(updatedAttempts);
      toast.success(`Attempt ${inProgressAttempt.attempt_number} logged!`);
      await base44.entities.Attempt.update(inProgressAttempt.id, { status: 'completed', outcome: 'other' });
      if (onAttemptLogged) onAttemptLogged();
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
      });
      invalidateAttemptQueries();
      queryClient.invalidateQueries({ queryKey: ['address', address.id] });
    } catch (error) {
      console.error('Failed to log attempt:', error);
      toast.error('Failed to log attempt');
    } finally {
      setFinalizingAttempt(false);
    }
  };

  const handleFinalizePosting = async (e) => {
    e.stopPropagation();
    if (!user) { toast.error('Please log in first'); return; }
    setFinalizingAttempt(true);
    try {
      const now = new Date();
      const companyId = getCompanyId(user) || address.company_id;
      await base44.entities.Address.update(address.id, { served: true, served_at: now.toISOString(), status: 'served' });
      try {
        const openServes = await base44.entities.ScheduledServe.filter({ address_id: address.id, status: 'open' });
        for (const serve of openServes) {
          await base44.entities.ScheduledServe.update(serve.id, { status: 'completed', completed_at: now.toISOString() });
        }
      } catch (ssErr) {
        console.warn('Failed to complete scheduled serves:', ssErr);
      }
      await base44.entities.AuditLog.create({
        company_id: companyId,
        action_type: 'posting_completed',
        actor_id: user.id,
        actor_role: user.role || 'server',
        target_type: 'address',
        target_id: address.id,
        details: { route_id: routeId, serve_type: 'posting', attempt_count: attemptCount },
        timestamp: now.toISOString()
      });
      if (onAttemptLogged) onAttemptLogged();
      if (onServed) onServed();
      toast.success('Posting completed! ✓');
      invalidateAttemptQueries();
      queryClient.invalidateQueries({ queryKey: ['address', address.id] });
      queryClient.invalidateQueries({ queryKey: ['scheduledServes', routeId] });
      queryClient.invalidateQueries({ queryKey: ['scheduledServesCount', routeId] });
    } catch (error) {
      console.error('Failed to finalize posting:', error);
      toast.error('Failed to complete posting');
    } finally {
      setFinalizingAttempt(false);
    }
  };

  const handleEditNotes = (e) => {
    e.stopPropagation();
    if (selectedAttempt) {
      setEditedNotesText(selectedAttempt.notes || '');
      setEditingNotes(true);
    }
  };

  const handleEditAttemptTime = async (attempt, newTimeValue) => {
    if (!newTimeValue) return;
    const newTime = new Date(newTimeValue);
    try {
      const qualifierData = getQualifiers(newTime);
      const qualifierFields = getQualifierStorageFields(qualifierData);
      await base44.entities.Attempt.update(attempt.id, {
        attempt_time: newTime.toISOString(),
        ...qualifierFields,
        manually_edited: true
      });
      const updatedAttempts = localAttempts.map(a => 
        a.id === attempt.id ? { ...a, attempt_time: newTime.toISOString(), ...qualifierFields, manually_edited: true } : a
      );
      setLocalAttempts(updatedAttempts);
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
      invalidateAttemptQueries();
    } catch (error) {
      console.error('Failed to edit attempt time:', error);
      toast.error('Failed to update time');
    }
  };

  const handleRTO = async (comment) => {
    setSavingRTO(true);
    try {
      await executeRTO({ comment, address, routeId: actualRouteId, user, attemptCount, queryClient });
      setShowRTOModal(false);
      if (onAttemptLogged) onAttemptLogged();
      if (onServed) onServed();
    } catch (error) {
      console.error('Failed to mark as RTO:', error);
      if (error.message !== 'Comment required') toast.error('Failed to process RTO');
    } finally {
      setSavingRTO(false);
    }
  };

  const handleDeleteAddress = async () => {
    const confirmed = window.confirm(
      `Delete this address?\n\n${formatted.line1}\n${formatted.line2}\n\nAll attempts for this address will also be deleted.`
    );
    if (!confirmed) return;
    try {
      await base44.entities.Address.update(address.id, { deleted_at: new Date().toISOString() });
      for (const attempt of localAttempts) {
        await base44.entities.Attempt.delete(attempt.id);
      }
      if (actualRouteId) {
        const remainingAddresses = await base44.entities.Address.filter({ route_id: actualRouteId, deleted_at: null });
        await base44.entities.Route.update(actualRouteId, {
          total_addresses: remainingAddresses.length,
          served_count: remainingAddresses.filter(a => a.served).length
        });
      }
      toast.success('Address deleted');
      invalidateAttemptQueries();
      queryClient.invalidateQueries({ queryKey: ['route', routeId] });
      queryClient.invalidateQueries({ queryKey: ['route', actualRouteId] });
    } catch (error) {
      console.error('Failed to delete address:', error);
      toast.error('Failed to delete address');
    }
  };

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

  const handleDeleteAttempt = async (attempt) => {
    const confirmed = window.confirm(
      `Delete Attempt ${attempt.attempt_number}?\n\nThis will permanently remove this attempt and its photos.`
    );
    if (!confirmed) return;
    try {
      await base44.entities.Attempt.delete(attempt.id);
      const updatedAttempts = localAttempts.filter(a => a.id !== attempt.id);
      setLocalAttempts(updatedAttempts);
      setActiveTab(0);
      await base44.entities.Address.update(address.id, {
        attempts_count: Math.max(0, (address.attempts_count || attemptCount) - 1)
      });
      if (updatedAttempts.length === 0) {
        await base44.entities.Address.update(address.id, { status: 'pending' });
      }
      toast.success(`Attempt ${attempt.attempt_number} deleted`);
      invalidateAttemptQueries();
    } catch (error) {
      console.error('Failed to delete attempt:', error);
      toast.error('Failed to delete attempt');
    }
  };

  const handleSaveNotes = async () => {
    if (!selectedAttempt) return;
    try {
      await base44.entities.Attempt.update(selectedAttempt.id, { notes: editedNotesText });
      const updatedAttempts = localAttempts.map(a => 
        a.id === selectedAttempt.id ? { ...a, notes: editedNotesText } : a
      );
      setLocalAttempts(updatedAttempts);
      setEditingNotes(false);
      toast.success('Notes updated');
      invalidateAttemptQueries();
    } catch (error) {
      console.error('Failed to save notes:', error);
      toast.error('Failed to save notes');
    }
  };

  const isServed = address.served;
  const isRTO = address.status === 'returned';
  const isPriority = attemptCount >= 2 && !isServed;

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

  const selectedAttempt = activeTab > 0 ? sortedAttempts[activeTab - 1] : null;

  return (
    <>
      <div
        className={`relative rounded-2xl shadow-md shadow-black/40 overflow-hidden transition-all duration-200 ${
          !isBossView && address.has_pending_request && pendingRequest
            ? 'border-2 border-red-500 animate-request-pulse shadow-red-900/30 shadow-lg'
            : isRTO
            ? 'border-2 border-red-400'
            : 'border border-[#e5b9e1]/30'
        }`}
        style={{
          background: 'rgba(11, 15, 30, 0.45)',
          backdropFilter: 'blur(16px)',
          WebkitBackdropFilter: 'blur(16px)',
          boxShadow: '0 0 10px rgba(229,179,225,0.10), inset 0 0 0 1px rgba(229,179,225,0.06)'
        }}
      >
        {editMode && !isEditing && !isServed && (
          <button
            onClick={(e) => { e.stopPropagation(); setIsEditing(true); }}
            className="absolute top-3 right-3 p-2 bg-blue-100 rounded-lg hover:bg-blue-200 transition-colors z-10"
          >
            <Pencil className="w-4 h-4 text-blue-600" />
          </button>
        )}

        {address.has_pending_request && pendingRequest && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              if (!isBossView) setShowRequestDetail(!showRequestDetail);
            }}
            className={`w-full text-left px-4 py-2 border-b ${
              isBossView 
                ? 'bg-red-950/20 border-red-900/40'
                : 'bg-red-950/40 border-red-800/50 animate-pulse cursor-pointer'
            }`}
          >
            <div className="flex items-center gap-2">
              <RotateCcw className="w-4 h-4 text-red-600" />
              <span className="text-xs font-bold text-red-300">
                ATTEMPT REQUESTED: {pendingRequest.required_qualifiers?.join(' + ')}
              </span>
              {!isBossView && (
                <ChevronDown className={`w-3 h-3 text-red-500 ml-auto transition-transform ${showRequestDetail ? 'rotate-180' : ''}`} />
              )}
            </div>
            {!showRequestDetail && pendingRequest.boss_note && (
              <p className="text-xs text-red-400 mt-1 pl-6 truncate">"{pendingRequest.boss_note}"</p>
            )}
          </button>
        )}

        {!isBossView && showRequestDetail && pendingRequest && (
          <div className="px-4 pb-3 bg-red-950/20 border-b border-red-900/40">
            <div className="bg-[#201f21] border border-red-900/40 rounded-xl p-4 mt-2">
              <h4 className="text-sm font-bold text-red-200 mb-2">Attempt Requested</h4>
              <div className="flex gap-2 mb-3 flex-wrap">
                {pendingRequest.required_qualifiers?.map(q => (
                  <span key={q} className={`px-3 py-1.5 rounded-full text-sm font-bold ${
                    q === 'AM' ? 'bg-sky-100 text-sky-700' :
                    q === 'PM' ? 'bg-indigo-100 text-indigo-700' :
                    q === 'WEEKEND' ? 'bg-orange-100 text-orange-700' :
                    'bg-gray-100 text-gray-700'
                  }`}>{q === 'ANYTIME' ? 'ANYTIME' : q}</span>
                ))}
              </div>
              {pendingRequest.boss_note && (
                <div className="bg-red-950/20 rounded-lg p-3 mb-3 border border-red-900/40">
                  <p className="text-xs text-[#8a7d87] font-semibold mb-1">FROM BOSS:</p>
                  <p className="text-sm text-[#e6e1e4]">{pendingRequest.boss_note}</p>
                </div>
              )}
              {!pendingRequest.worker_reply ? (
                <div className="mb-3">
                  <textarea
                    value={workerReplyText}
                    onChange={(e) => setWorkerReplyText(e.target.value)}
                    placeholder="Reply to boss (optional)..."
                    className="w-full border border-[#363436] bg-[#1c1b1d] text-[#e6e1e4] rounded-lg px-3 py-2 text-sm resize-none"
                    rows={2}
                    maxLength={500}
                    onClick={(e) => e.stopPropagation()}
                  />
                  <Button size="sm" variant="outline" onClick={(e) => { e.stopPropagation(); handleWorkerReply(); }} className="mt-2" disabled={!workerReplyText.trim()}>
                    <MessageSquare className="w-3 h-3 mr-1" />Send Reply
                  </Button>
                </div>
              ) : (
                <div className="bg-blue-950/30 rounded-lg p-3 mb-3 border border-blue-900/40">
                  <p className="text-xs text-[#8a7d87] font-semibold mb-1">YOUR REPLY:</p>
                  <p className="text-sm text-[#e6e1e4]">{pendingRequest.worker_reply}</p>
                </div>
              )}
              <p className="text-xs text-red-400 font-medium">
                Complete a {pendingRequest.required_qualifiers?.join(' + ')} attempt to fulfill this request.
              </p>
            </div>
          </div>
        )}

        {hasInProgressAttempt && !isServed && address.serve_type !== 'posting' && (
          <div className="px-4 py-2 bg-amber-950/30 border-b border-amber-900/40 animate-pulse-glow">
            <div className="flex items-center gap-2 text-amber-300">
              <Camera className="w-4 h-4" />
              <span className="text-xs font-bold">Evidence captured — tap LOG ATTEMPT to finalize</span>
            </div>
          </div>
        )}

        {attemptCount > 0 && address.serve_type !== 'posting' && (
          <div className="flex border-b border-[#363436]">
            <button
              onClick={(e) => { e.stopPropagation(); setActiveTab(0); }}
              className={`flex-1 py-2.5 text-xs font-bold transition-colors ${activeTab === 0 ? 'bg-green-500 text-white' : 'bg-[#2a2a2c] text-[#8a7d87] hover:bg-[#363436]'}`}
            >
              <Check className="w-4 h-4 mx-auto" />
            </button>
            {[1, 2, 3, 4, 5].map((num) => {
              const attempt = sortedAttempts[num - 1];
              const hasAttempt = !!attempt;
              const isActive = activeTab === num;
              const isInProgress = attempt?.status === 'in_progress';
              return (
                <button
                  key={num}
                  onClick={(e) => { e.stopPropagation(); if (hasAttempt) setActiveTab(num); }}
                  disabled={!hasAttempt}
                  className={`flex-1 py-2.5 text-xs font-bold transition-colors relative ${
                    isActive ? isInProgress ? 'bg-amber-500 text-white' : 'bg-indigo-600 text-white'
                    : hasAttempt ? isInProgress ? 'bg-amber-900/40 text-amber-300 hover:bg-amber-900/60 animate-pulse' : 'bg-[#2a2a2c] text-[#d0c3cb] hover:bg-[#363436]'
                    : 'bg-[#1c1b1d] text-[#363436] cursor-not-allowed'
                  }`}
                >
                  A{num}
                  {hasAttempt && !isInProgress && <Check className="w-2.5 h-2.5 absolute top-1 right-1" />}
                </button>
              );
            })}
          </div>
        )}

        <div className={`px-4 py-4 ${
          isRTO ? 'bg-gradient-to-r from-[#2a1010] to-[#1c1b1d]' :
          isServed ? 'bg-gradient-to-r from-[#0d2218] to-[#1c1b1d]' : 
          hasInProgressAttempt ? 'bg-gradient-to-r from-[#2a1e0a] via-[#201f21] to-[#1c1b1d]' :
          'bg-gradient-to-r from-[#1e1520] via-[#1c1b1d] to-[#1c1b1d]'
        }`}>
          <div className="flex flex-col">
            <div>
              <p className={`text-lg font-bold leading-tight ${isRTO ? 'text-red-300' : isServed ? 'text-[#8a7d87]' : 'text-[#e6e1e4]'}`}>
                {formatted.line1}
              </p>
              <p className={`text-sm ${isRTO ? 'text-red-400' : isServed ? 'text-[#8a7d87]' : 'text-[#8a7d87]'}`}>
                {formatted.line2}
              </p>
            </div>
            {(address.defendant_name || folderName || address._folderName) && (
              <>
                <div className="border-t border-[#363436] my-3" />
                <div className="flex items-center gap-2 flex-wrap">
                  {address.defendant_name && (
                    <p className={`text-sm font-medium ${isServed ? 'text-[#8a7d87]' : 'text-[#d0c3cb]'}`}>
                      {address.defendant_name}
                    </p>
                  )}
                  {(folderName || address._folderName) && (
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-purple-900/30 text-purple-300 border border-purple-800/40 whitespace-nowrap">
                      {folderName || address._folderName}
                    </span>
                  )}
                </div>
              </>
            )}
          </div>
        </div>

        {attemptCount > 0 && !isServed && activeTab === 0 && (
          <div className="px-4 py-3 border-t border-[#363436]">
            {address.serve_type === 'posting' ? (
              <>
                <div className="flex items-center justify-between mb-3">
                  <span className="text-xs font-bold text-[#d0c3cb] tracking-wide">POSTED SUMMARY</span>
                </div>
                <div className="space-y-2">
                  {sortedAttempts.map((attempt, idx) => (
                    <div key={attempt.id} className="flex items-center gap-3 p-2 rounded-lg bg-[#201f21] hover:bg-[#2a2a2c] cursor-pointer"
                      onClick={(e) => { e.stopPropagation(); if (attempt.photo_urls?.length > 0) setShowPhotoViewer(true); }}>
                      <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold bg-purple-900/30 text-purple-300">
                        <FileText className="w-4 h-4" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-semibold text-[#e6e1e4]">{format(new Date(attempt.attempt_time), "M/d/yy h:mm a")}</div>
                        <span className="text-[10px] text-purple-600 font-bold">POSTED</span>
                      </div>
                      {attempt.photo_urls?.length > 0 && <ImageIcon className="w-4 h-4 text-blue-500" />}
                    </div>
                  ))}
                </div>
                <div className="flex items-center gap-2 flex-wrap mt-3">
                  <Badge className="bg-green-900/30 text-green-300 border border-green-800/40 text-[10px] font-bold px-2.5 py-1">POSTING</Badge>
                  {isVerified && <Badge className="bg-teal-900/30 text-teal-300 border border-teal-800/40 text-[10px] font-bold px-2.5 py-1">VERIFIED</Badge>}
                  {address.has_dcn && <Badge className="bg-purple-900/30 text-purple-300 border border-purple-800/40 text-[10px] font-bold px-2.5 py-1">DCN</Badge>}
                </div>
              </>
            ) : (
              <>
                <div className="flex items-center justify-between mb-3">
                  <span className="text-xs font-bold text-[#d0c3cb] tracking-wide">ATTEMPTS SUMMARY</span>
                </div>
                <div className="space-y-2">
                  {sortedAttempts.map((attempt, idx) => {
                    const isInProgress = attempt.status === 'in_progress';
                    return (
                      <div key={attempt.id}
                        className={`flex items-center gap-3 p-2 rounded-lg cursor-pointer ${isInProgress ? 'bg-amber-950/30 border border-amber-900/40 hover:bg-amber-950/50' : 'bg-[#201f21] hover:bg-[#2a2a2c]'}`}
                        onClick={(e) => { e.stopPropagation(); setActiveTab(idx + 1); }}>
                        <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold ${isInProgress ? 'bg-amber-900/40 text-amber-300' : 'bg-indigo-900/30 text-indigo-400'}`}>
                          A{idx + 1}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-semibold text-[#e6e1e4]">{format(new Date(attempt.attempt_time), "M/d/yy h:mm a")}</div>
                          <div className="flex items-center gap-1.5">
                            <QualifierBadges badges={attempt.qualifier_badges || [attempt.qualifier?.toUpperCase()]} size="small" />
                            {isInProgress && <span className="text-[10px] text-amber-300 font-bold">AWAITING OUTCOME</span>}
                            {attempt.distance_feet && <span className="text-[10px] text-blue-500">{attempt.distance_feet} ft from address</span>}
                          </div>
                        </div>
                        {attempt.photo_urls?.length > 0 && <ImageIcon className="w-4 h-4 text-blue-500" />}
                      </div>
                    );
                  })}
                </div>
                <div className="flex items-center gap-2 flex-wrap mt-3">
                  {isVerified && <Badge className="bg-teal-900/30 text-teal-300 border border-teal-800/40 text-[10px] font-bold px-2.5 py-1">VERIFIED</Badge>}
                  {address.has_dcn && <Badge className="bg-purple-900/30 text-purple-300 border border-purple-800/40 text-[10px] font-bold px-2.5 py-1">DCN</Badge>}
                </div>
              </>
            )}
          </div>
        )}

        {attemptCount > 0 && !isServed && activeTab > 0 && selectedAttempt && address.serve_type !== 'posting' && (
          <div className="px-4 py-3 border-t border-[#363436]">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-semibold text-[#8a7d87]">
                ATTEMPT {activeTab} {selectedAttempt.status === 'in_progress' && '(IN PROGRESS)'}
              </h3>
              <QualifierBadges badges={selectedAttempt.qualifier_badges || [selectedAttempt.qualifier?.toUpperCase()]} size="default" />
            </div>
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-lg bg-amber-900/30 flex items-center justify-center">
                <Calendar className="w-5 h-5 text-amber-400" />
              </div>
              <div className="flex-1">
                <p className="text-xs text-[#8a7d87] font-medium">DATE &amp; TIME</p>
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
                    className="w-full border border-[#363436] bg-[#1c1b1d] text-[#e6e1e4] rounded-lg px-3 py-2 text-sm font-semibold focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                ) : (
                  <p className="text-base font-semibold text-[#e6e1e4]">
                    {new Date(selectedAttempt.attempt_time).toLocaleString('en-US', { weekday: 'short', month: 'numeric', day: 'numeric', year: '2-digit', hour: 'numeric', minute: '2-digit', hour12: true })}
                  </p>
                )}
              </div>
            </div>
            {selectedAttempt.user_latitude && selectedAttempt.user_longitude && (
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 rounded-lg bg-indigo-900/30 flex items-center justify-center">
                  <MapPin className="w-5 h-5 text-indigo-400" />
                </div>
                <div>
                  <p className="text-xs text-[#8a7d87] font-medium">COORDINATES</p>
                  <p className="text-base font-semibold text-[#e6e1e4]">
                    {selectedAttempt.user_latitude?.toFixed(6)}, {selectedAttempt.user_longitude?.toFixed(6)}
                  </p>
                </div>
              </div>
            )}
            {selectedAttempt.distance_feet != null && (
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 rounded-lg bg-green-900/30 flex items-center justify-center">
                  <Navigation className="w-5 h-5 text-green-400" />
                </div>
                <div>
                  <p className="text-xs text-[#8a7d87] font-medium">DISTANCE</p>
                  <p className="text-base font-semibold text-[#e6e1e4]">{selectedAttempt.distance_feet?.toLocaleString()} feet from address</p>
                </div>
              </div>
            )}
            {editingNotes ? (
              <div className="bg-blue-950/30 rounded-xl p-4 mb-4 border border-blue-800/40">
                <div className="flex items-center gap-2 mb-2">
                  <MessageSquare className="w-4 h-4 text-blue-600" />
                  <span className="text-xs text-blue-600 font-medium">EDIT NOTES</span>
                </div>
                <textarea
                  value={editedNotesText}
                  onChange={(e) => setEditedNotesText(e.target.value)}
                  className="w-full p-3 border border-[#363436] bg-[#1c1b1d] text-[#e6e1e4] rounded-lg text-sm resize-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  rows={4}
                  autoFocus
                  onClick={(e) => e.stopPropagation()}
                />
                <div className="flex gap-2 mt-3">
                  <Button variant="outline" size="sm" onClick={(e) => { e.stopPropagation(); navigator.clipboard.writeText(editedNotesText); toast.success('Notes copied to clipboard'); }} className="flex-1">
                    <Copy className="w-4 h-4 mr-1" />Copy
                  </Button>
                  <Button size="sm" onClick={(e) => { e.stopPropagation(); handleSaveNotes(); }} className="flex-1 bg-blue-500 hover:bg-blue-600 text-white">Save</Button>
                </div>
              </div>
            ) : selectedAttempt.notes ? (
              <div onClick={handleEditNotes} className="bg-[#201f21] rounded-xl p-4 mb-4 cursor-pointer hover:bg-[#2a2a2c] transition">
                <div className="flex items-center gap-2 mb-2">
                  <MessageSquare className="w-4 h-4 text-gray-500" />
                  <span className="text-xs text-[#8a7d87] font-medium">NOTES</span>
                </div>
                <p className="text-sm text-[#e6e1e4] whitespace-pre-wrap">{selectedAttempt.notes}</p>
                <p className="text-xs text-blue-500 mt-2">Tap to edit</p>
              </div>
            ) : null}
            <div className="grid grid-cols-3 gap-2">
              <Button variant="outline" onClick={(e) => { e.stopPropagation(); handleDeleteAttempt(selectedAttempt); }}
                className="h-12 border-red-300 text-red-600 hover:bg-red-500 hover:text-white hover:border-red-500 active:bg-red-600 active:border-red-600 transition-all duration-200 text-xs font-bold flex flex-col items-center justify-center gap-0.5 px-1">
                <Trash2 className="w-4 h-4" /><span>Delete</span>
              </Button>
              <Button variant="outline" onClick={handleCaptureEvidence}
                className="h-12 border-amber-300 text-amber-700 hover:bg-amber-50 text-xs font-bold flex flex-col items-center justify-center gap-0.5 px-1">
                <Plus className="w-4 h-4" /><span>Add Photo</span>
              </Button>
              <Button variant="outline" onClick={(e) => { e.stopPropagation(); setShowPhotoViewer(true); }} disabled={!selectedAttempt.photo_urls?.length}
                className="h-12 text-xs font-bold flex flex-col items-center justify-center gap-0.5 px-1">
                <Camera className="w-4 h-4" /><span>Photos{selectedAttempt.photo_urls?.length ? ` (${selectedAttempt.photo_urls.length})` : ''}</span>
              </Button>
            </div>
          </div>
        )}

        {attemptCount === 0 && !isServed && (
          <div className="px-4 py-3 border-t border-[#363436]">
            <div className="flex items-center gap-2 flex-wrap">
              <Badge className={`text-[10px] font-bold px-2.5 py-1 ${
                address.serve_type === 'garnishment' ? 'bg-purple-900/30 text-purple-300 border border-purple-800/40' :
                address.serve_type === 'posting' ? 'bg-green-900/30 text-green-300 border border-green-800/40' :
                'bg-blue-900/30 text-blue-300 border border-blue-800/40'
              }`}>
                {(address.serve_type || 'serve').toUpperCase()}
              </Badge>
              {isVerified && <Badge className="bg-teal-900/30 text-teal-300 border border-teal-800/40 text-[10px] font-bold px-2.5 py-1">VERIFIED</Badge>}
              {address.has_dcn && <Badge className="bg-purple-900/30 text-purple-300 border border-purple-800/40 text-[10px] font-bold px-2.5 py-1">DCN</Badge>}
              <span className="text-xs text-[#8a7d87] ml-auto">No attempts yet</span>
            </div>
          </div>
        )}

        {isServed && (
          <div className={`px-4 py-3 border-t ${isRTO ? 'border-red-900/40 bg-red-950/20' : 'border-[#363436] bg-green-950/20'}`}>
            <div className="flex items-center gap-2 flex-wrap">
              {isRTO ? (
                <Badge className="bg-red-900/30 text-red-300 border border-red-800/40 text-[10px] font-bold px-2.5 py-1">
                  <RotateCcw className="w-3 h-3 mr-1" />RETURNED TO OFFICE
                </Badge>
              ) : (
                <Badge className="bg-green-900/30 text-green-300 border border-green-800/40 text-[10px] font-bold px-2.5 py-1">SERVED</Badge>
              )}
              {!isRTO && receiptApproved ? (
                <Badge className="bg-green-900/30 text-green-300 border border-green-800/40 text-[10px] font-bold px-2.5 py-1"><FileCheck className="w-3 h-3 mr-1" />RECEIPT APPROVED</Badge>
              ) : !isRTO && receiptPending ? (
                <Badge className="bg-yellow-900/30 text-yellow-300 border border-yellow-800/40 text-[10px] font-bold px-2.5 py-1"><Clock className="w-3 h-3 mr-1" />PENDING REVIEW</Badge>
              ) : !isRTO && receiptNeedsRevision ? (
                <Badge className="bg-orange-900/30 text-orange-300 border border-orange-800/40 text-[10px] font-bold px-2.5 py-1"><AlertCircle className="w-3 h-3 mr-1" />NEEDS REVISION</Badge>
              ) : null}
              {isRTO && address.rto_at && <span className="text-xs text-red-300 ml-auto">{format(new Date(address.rto_at), "M/d/yy 'at' h:mm a")}</span>}
              {!isRTO && address.served_at && <span className="text-xs text-gray-500 ml-auto">{format(new Date(address.served_at), "M/d/yy 'at' h:mm a")}</span>}
            </div>
            {isRTO && address.rto_reason && (
              <div className="mt-2 bg-[#201f21] border border-red-900/40 rounded-lg px-3 py-2">
                <p className="text-xs font-semibold text-red-400 mb-0.5">Return Reason:</p>
                <p className="text-xs text-red-300">{address.rto_reason}</p>
              </div>
            )}
            <Button variant="outline" size="sm"
              onClick={async (e) => {
                e.stopPropagation();
                const confirmed = window.confirm('Mark this address as NOT served?\n\nThis will move it back to your active addresses.');
                if (!confirmed) return;
                try {
                  await base44.entities.Address.update(address.id, { served: false, served_at: null, status: localAttempts.length > 0 ? 'attempted' : 'pending', receipt_status: 'pending' });
                  if (actualRouteId) {
                    const routeAddresses = await base44.entities.Address.filter({ route_id: actualRouteId, deleted_at: null });
                    const newServedCount = routeAddresses.filter(a => a.served && a.id !== address.id).length;
                    await base44.entities.Route.update(actualRouteId, { served_count: newServedCount });
                  }
                  toast.success('Address marked as not served');
                  invalidateAttemptQueries();
                  queryClient.invalidateQueries({ queryKey: ['route', routeId] });
                  queryClient.invalidateQueries({ queryKey: ['route', actualRouteId] });
                } catch (error) {
                  console.error('Failed to unserve:', error);
                  toast.error('Failed to update address');
                }
              }}
              className="mt-3 w-full text-red-400 border-red-900/40 hover:bg-red-950/30"
            >
              <RotateCcw className="w-4 h-4 mr-2" />Mark as NOT Served
            </Button>
          </div>
        )}

        {showActions && !isServed && (
          <div className="px-4 py-3 space-y-2">
            {isBossView ? (
              <>
                <div className="grid grid-cols-3 gap-2">
                  <Button onClick={(e) => { e.stopPropagation(); navigate(createPageUrl(`EditAddress?addressId=${address.id}&routeId=${actualRouteId}`)); }}
                    className="h-14 bg-blue-500 hover:bg-blue-600 text-white font-bold text-xs rounded-xl flex flex-col items-center justify-center gap-1">
                    <Pencil className="w-5 h-5" /><span>EDIT</span>
                  </Button>
                  <Button onClick={(e) => { e.stopPropagation(); setShowBossAddAttempt(!showBossAddAttempt); setShowRequestAttempt(false); }}
                    className={`h-14 font-bold text-xs rounded-xl flex flex-col items-center justify-center gap-1 ${showBossAddAttempt ? 'bg-amber-600 hover:bg-amber-700 text-white' : 'bg-amber-500 hover:bg-amber-600 text-white'}`}>
                    <Plus className="w-5 h-5" /><span>ADD ATTEMPT</span>
                  </Button>
                  <Button onClick={(e) => { e.stopPropagation(); setShowRequestAttempt(!showRequestAttempt); setShowBossAddAttempt(false); }}
                    className={`h-14 font-bold text-xs rounded-xl flex flex-col items-center justify-center gap-1 ${showRequestAttempt ? 'bg-red-600 hover:bg-red-700 text-white' : 'bg-red-500 hover:bg-red-600 text-white'}`}>
                    <RotateCcw className="w-5 h-5" /><span>REQUEST</span>
                  </Button>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <Button onClick={(e) => { e.stopPropagation(); navigate(createPageUrl(`AddressDetail?addressId=${address.id}&routeId=${actualRouteId}`)); }}
                    variant="outline" className="h-12 font-bold text-xs rounded-xl flex items-center justify-center gap-2">
                    <FileText className="w-4 h-4" />DETAILS
                  </Button>
                  <Button onClick={(e) => { e.stopPropagation(); setShowMoveModal(true); }}
                    variant="outline" className="h-12 font-bold text-xs rounded-xl flex items-center justify-center gap-2">
                    <ArrowRightLeft className="w-4 h-4" />MOVE
                  </Button>
                </div>
              </>
            ) : (
              <>
                {address.serve_type === 'posting' ? (
                  <>
                    {attemptCount > 0 ? (
                      <Button onClick={handleFinalizePosting} disabled={finalizingAttempt}
                        className="w-full h-12 bg-orange-500 hover:bg-orange-600 text-white font-bold text-sm rounded-xl animate-pulse">
                        {finalizingAttempt ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Shield className="w-4 h-4 mr-2" />}
                        FINALIZE POSTING
                      </Button>
                    ) : (
                      <Button onClick={handleCaptureEvidence} className="w-full h-12 bg-blue-500 hover:bg-blue-600 text-white font-bold text-sm rounded-xl">
                        <Camera className="w-4 h-4 mr-2" />TAKE PHOTO
                      </Button>
                    )}
                    <div className="grid grid-cols-2 gap-2">
                      <Button onClick={handleCaptureEvidence} className="h-14 bg-blue-500 hover:bg-blue-600 text-white font-bold text-xs rounded-xl flex flex-col items-center justify-center gap-1">
                        <Plus className="w-5 h-5" /><span>ADD PHOTO</span>
                      </Button>
                      <Button onClick={(e) => { e.stopPropagation(); navigate(createPageUrl(`AddressDetail?addressId=${address.id}&routeId=${actualRouteId}`)); }}
                        className="h-14 bg-gray-500 hover:bg-gray-600 text-white font-bold text-xs rounded-xl flex flex-col items-center justify-center gap-1">
                        <FileText className="w-5 h-5" /><span>DETAILS</span>
                      </Button>
                    </div>
                  </>
                ) : (
                  <>
                    {hasInProgressAttempt ? (
                      <Button onClick={handleLogAttempt} disabled={finalizingAttempt} className="w-full h-12 font-bold text-sm rounded-xl animate-pulse"
                        style={{ background: 'rgba(233,195,73,0.18)', backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)', border: '1px solid rgba(233,195,73,0.40)', color: '#e9c349' }}>
                        {finalizingAttempt ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Zap className="w-4 h-4 mr-2" />}
                        LOG ATTEMPT {inProgressAttempt.attempt_number}
                      </Button>
                    ) : (
                      <Button onClick={handleCaptureEvidence} className="w-full h-12 font-bold text-sm rounded-xl"
                        style={{ background: 'rgba(233,195,73,0.15)', backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)', border: '1px solid rgba(233,195,73,0.35)', color: '#e9c349' }}>
                        <Camera className="w-4 h-4 mr-2" />TAKE EVIDENCE
                      </Button>
                    )}
                    <div className="flex gap-2">
                      <Link to={createPageUrl(`SubmitReceipt?addressId=${address.id}&routeId=${actualRouteId}&attemptId=${selectedAttempt?.id || localAttempts?.[localAttempts.length - 1]?.id || ''}&finalize=true${comboRouteIds ? `&returnTo=WorkerComboRouteDetail?id=${routeId}` : ''}`)}
                        onClick={(e) => e.stopPropagation()} className="flex-1">
                        <Button className="w-full h-14 font-bold text-sm rounded-xl flex items-center justify-center gap-2"
                          style={{ background: 'rgba(233,195,73,0.15)', backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)', border: '1px solid rgba(233,195,73,0.35)', color: '#e9c349' }}>
                          <Shield className="w-5 h-5" /><span>SERVED</span>
                        </Button>
                      </Link>
                    </div>
                  </>
                )}

                <div className={`flex items-center border border-[#363436] rounded-xl overflow-hidden ${isHighlighted ? 'flash-purple' : ''}`}>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <button className="p-3 border-r border-[#363436] hover:bg-[#2a2a2c] transition-colors">
                        <MoreVertical className="w-5 h-5 text-gray-400" />
                      </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="start" side="top">
                      {onMessageBoss && (
                        <DropdownMenuItem onClick={(e) => { e.stopPropagation(); onMessageBoss(address); }}>
                          <MessageCircle className="w-4 h-4 mr-2" />Message Boss
                        </DropdownMenuItem>
                      )}
                      <DropdownMenuItem onClick={(e) => { e.stopPropagation(); setIsEditing(true); }}>
                        <Pencil className="w-4 h-4 mr-2" />Edit Address
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={(e) => { e.stopPropagation(); navigate(createPageUrl(`CreateScheduledServe?addressId=${address.id}&routeId=${actualRouteId}`)); }}>
                        <Clock className="w-4 h-4 mr-2" />Schedule Serve
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={(e) => { e.stopPropagation(); setShowRTOModal(true); }} className="text-red-600 focus:text-red-600">
                        <RotateCcw className="w-4 h-4 mr-2" /><span className="text-red-600 font-bold">RTO</span>
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={(e) => { e.stopPropagation(); handleDeleteAddress(); }} className="text-red-600 focus:text-red-600">
                        <Trash2 className="w-4 h-4 mr-2" />Delete Address
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                  <button onClick={handleNavigate}
                    className={`flex-1 flex items-center justify-center gap-2 py-3 hover:bg-[#2a2a2c] transition-colors ${isHighlighted ? 'text-violet-600' : ''}`}>
                    <Navigation className={`w-5 h-5 ${isHighlighted ? 'text-violet-600' : 'text-green-600'}`} />
                    <span className={`font-bold tracking-wide ${isHighlighted ? 'text-violet-600' : 'text-green-600'}`}>NAVIGATE</span>
                  </button>
                </div>
              </>
            )}
          </div>
        )}

        {isBossView && showBossAddAttempt && (
          <BossAddAttemptPanel address={address} routeId={routeId} user={user} localAttempts={localAttempts}
            onAttemptAdded={(newAttempt) => { setLocalAttempts(prev => [...prev, newAttempt]); invalidateAttemptQueries(); }}
            onClose={() => setShowBossAddAttempt(false)} queryClient={queryClient} />
        )}

        {isBossView && showRequestAttempt && (
          <BossRequestAttemptPanel address={address} routeId={routeId} user={user}
            onClose={() => setShowRequestAttempt(false)} queryClient={queryClient} />
        )}

        {isEditing && (
          <div className="px-4 py-3 border-t border-[#363436] bg-[#201f21]" onClick={(e) => e.stopPropagation()}>
            <div className="space-y-3">
              <div>
                <label className="text-xs font-semibold text-[#8a7d87]">Defendant Name</label>
                <input type="text" value={editFields.defendant_name} onChange={(e) => setEditFields(prev => ({ ...prev, defendant_name: e.target.value }))}
                  className="w-full border border-[#363436] bg-[#1c1b1d] text-[#e6e1e4] rounded-lg px-3 py-2 text-sm mt-1" placeholder="Defendant name" />
              </div>
              <div>
                <label className="text-xs font-semibold text-[#8a7d87]">Street Address</label>
                <input type="text" value={editFields.normalized_address} onChange={(e) => setEditFields(prev => ({ ...prev, normalized_address: e.target.value }))}
                  className="w-full border border-[#363436] bg-[#1c1b1d] text-[#e6e1e4] rounded-lg px-3 py-2 text-sm mt-1" />
              </div>
              <div className="grid grid-cols-3 gap-2">
                <div>
                  <label className="text-xs font-semibold text-[#8a7d87]">City</label>
                  <input type="text" value={editFields.city} onChange={(e) => setEditFields(prev => ({ ...prev, city: e.target.value }))}
                    className="w-full border border-[#363436] bg-[#1c1b1d] text-[#e6e1e4] rounded-lg px-3 py-2 text-sm mt-1" />
                </div>
                <div>
                  <label className="text-xs font-semibold text-[#8a7d87]">State</label>
                  <input type="text" value={editFields.state} onChange={(e) => setEditFields(prev => ({ ...prev, state: e.target.value }))}
                    className="w-full border border-[#363436] bg-[#1c1b1d] text-[#e6e1e4] rounded-lg px-3 py-2 text-sm mt-1" />
                </div>
                <div>
                  <label className="text-xs font-semibold text-[#8a7d87]">Zip</label>
                  <input type="text" value={editFields.zip} onChange={(e) => setEditFields(prev => ({ ...prev, zip: e.target.value }))}
                    className="w-full border border-[#363436] bg-[#1c1b1d] text-[#e6e1e4] rounded-lg px-3 py-2 text-sm mt-1" />
                </div>
              </div>
              <div>
                <label className="text-xs font-semibold text-[#8a7d87]">Serve Type</label>
                <select value={editFields.serve_type} onChange={(e) => setEditFields(prev => ({ ...prev, serve_type: e.target.value }))}
                  className="w-full border border-[#363436] bg-[#1c1b1d] text-[#e6e1e4] rounded-lg px-3 py-2 text-sm mt-1">
                  <option value="serve">Serve</option>
                  <option value="garnishment">Garnishment</option>
                  <option value="posting">Posting</option>
                </select>
              </div>
              <div className="flex gap-2">
                <Button onClick={handleSaveEdit} className="flex-1 bg-blue-500 hover:bg-blue-600 text-white">Save Changes</Button>
                <Button variant="outline" onClick={() => setIsEditing(false)}>Cancel</Button>
              </div>
            </div>
          </div>
        )}

        {receiptNeedsRevision && (
          <div className="px-4 py-2 bg-orange-950/30 border-t border-orange-900/40">
            <div className="flex items-center gap-2 text-orange-300">
              <AlertCircle className="w-4 h-4" />
              <span className="text-xs font-medium">Receipt needs revision - please resubmit</span>
            </div>
          </div>
        )}
        {receiptPending && (
          <div className="px-4 py-2 bg-yellow-950/30 border-t border-yellow-900/40">
            <div className="flex items-center gap-2 text-yellow-300">
              <Clock className="w-4 h-4" />
              <span className="text-xs font-medium">Receipt pending review</span>
            </div>
          </div>
        )}
      </div>

      <EvidenceCamera open={showCamera} onClose={() => setShowCamera(false)} onPhotoTaken={handlePhotoTaken} />

      <EvidenceCommentModal
        open={showCommentModal}
        onClose={() => { setShowCommentModal(false); setCapturedPhoto(null); }}
        onSave={handleSaveEvidence}
        photoPreview={capturedPhoto?.dataUrl}
        saving={savingEvidence}
        requireComment={!hasInProgressAttempt && address.serve_type !== 'posting'}
      />

      <PhotoViewer
        open={showPhotoViewer}
        onClose={() => setShowPhotoViewer(false)}
        photos={address.serve_type === 'posting' ? (sortedAttempts[0]?.photo_urls || []) : (selectedAttempt?.photo_urls || [])}
      />

      <RTOModal open={showRTOModal} onClose={() => setShowRTOModal(false)} onSubmit={handleRTO} address={address} saving={savingRTO} />
    </>
  );
}
