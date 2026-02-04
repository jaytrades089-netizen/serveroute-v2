import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import { base44 } from '@/api/base44Client';
import { useQueryClient, useQuery } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
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
  MessageSquare
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

// Format address in required 2-line ALL CAPS format
export function formatAddress(address) {
  const street = (address.normalized_address || address.legal_address || '').split(',')[0];
  const city = address.city || '';
  const state = address.state || '';
  const zip = address.zip || '';
  
  return {
    line1: street.toUpperCase(),
    line2: city && state ? `${city.toUpperCase()}, ${state.toUpperCase()} ${zip}` : ''
  };
}

export default function AddressCard({ 
  address, 
  index, 
  routeId,
  showActions = true,
  onMessageBoss,
  onClick,
  lastAttempt,
  allAttempts = []
}) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const formatted = formatAddress(address);
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
  
  // Log attempt state
  const [loggingAttempt, setLoggingAttempt] = useState(false);
  
  // Evidence capture state
  const [showCamera, setShowCamera] = useState(false);
  const [showCommentModal, setShowCommentModal] = useState(false);
  const [capturedPhoto, setCapturedPhoto] = useState(null);
  const [savingEvidence, setSavingEvidence] = useState(false);
  const [showPhotoViewer, setShowPhotoViewer] = useState(false);

  // Get current user
  const { data: user } = useQuery({
    queryKey: ['currentUser'],
    queryFn: () => base44.auth.me()
  });
  
  // Sync local attempts with props
  React.useEffect(() => {
    setLocalAttempts(allAttempts);
  }, [allAttempts]);
  
  // Sort attempts by date for consistent ordering
  const sortedAttempts = [...localAttempts].sort((a, b) => 
    new Date(a.attempt_time) - new Date(b.attempt_time)
  );

  const handleNavigate = (e) => {
    e.stopPropagation();
    const addressStr = `${formatted.line1}, ${formatted.line2}`;
    const encoded = encodeURIComponent(addressStr);
    window.open(`https://www.google.com/maps/dir/?api=1&destination=${encoded}`, '_blank');
  };

  const handleCardClick = () => {
    if (onClick) {
      onClick(address);
    } else {
      navigate(createPageUrl(`AddressDetail?addressId=${address.id}&routeId=${routeId}`));
    }
  };

  // LOG ATTEMPT - Logs attempt in-place without navigation
  const handleLogAttempt = async (e) => {
    e.stopPropagation();
    
    if (!user) {
      toast.error('Please log in first');
      return;
    }
    
    setLoggingAttempt(true);
    
    try {
      // 1. Get user's current GPS location
      const position = await getCurrentPosition();
      
      // 2. Calculate distance from address
      const distanceFeet = calculateDistanceFeet(
        position.latitude,
        position.longitude,
        address.lat,
        address.lng
      );
      
      // 3. Get timestamp and qualifier data
      const now = new Date();
      const qualifierData = getQualifiers(now);
      const qualifierFields = getQualifierStorageFields(qualifierData);
      const attemptNumber = attemptCount + 1;
      
      // 4. Create Attempt record with full qualifier data
      const newAttempt = await base44.entities.Attempt.create({
        address_id: address.id,
        route_id: routeId,
        server_id: user.id,
        company_id: user.company_id,
        attempt_number: attemptNumber,
        attempt_time: now.toISOString(),
        attempt_timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        ...qualifierFields,
        outcome: 'no_answer',
        user_latitude: position.latitude,
        user_longitude: position.longitude,
        distance_feet: distanceFeet,
        notes: '',
        photo_urls: []
      });
      
      // 5. Update address attempts count
      await base44.entities.Address.update(address.id, {
        attempts_count: attemptNumber,
        status: attemptNumber === 1 ? 'attempted' : address.status
      });
      
      // 6. Update local state to show new tab immediately
      const updatedAttempts = [...localAttempts, newAttempt];
      setLocalAttempts(updatedAttempts);
      setActiveTab(attemptNumber); // Switch to new attempt tab
      
      // 7. Invalidate queries to refresh data
      queryClient.invalidateQueries({ queryKey: ['routeAttempts', routeId] });
      queryClient.invalidateQueries({ queryKey: ['routeAddresses', routeId] });
      
      // 8. Show success message with qualifier info
      const distanceDisplay = distanceFeet !== null ? formatDistance(distanceFeet) : 'unknown distance';
      if (qualifierData.isNTC) {
        toast.warning(`Attempt ${attemptNumber} logged - NTC (No Time Covered) - ${distanceDisplay}`);
      } else if (qualifierData.isOutsideHours) {
        toast.warning(`Attempt ${attemptNumber} logged - Outside Service Hours - ${distanceDisplay}`);
      } else {
        toast.success(`Attempt ${attemptNumber} logged - ${qualifierData.display} qualifier earned! ${distanceDisplay}`);
      }
      
    } catch (error) {
      console.error('Failed to log attempt:', error);
      if (error.message.includes('permission')) {
        toast.error('Please enable location services to log attempts');
      } else {
        toast.error('Failed to log attempt: ' + error.message);
      }
    } finally {
      setLoggingAttempt(false);
    }
  };

  // CAPTURE EVIDENCE - Opens camera
  const handleCaptureEvidence = (e) => {
    e.stopPropagation();
    
    if (attemptCount === 0) {
      toast.error('Please log an attempt first');
      return;
    }
    
    setShowCamera(true);
  };

  // Photo taken from camera
  const handlePhotoTaken = async ({ file, dataUrl }) => {
    setCapturedPhoto({ file, dataUrl });
    setShowCamera(false);
    setShowCommentModal(true);
  };

  // Save evidence with comment
  const handleSaveEvidence = async (comment) => {
    if (!capturedPhoto) return;
    
    setSavingEvidence(true);
    
    try {
      // Upload photo
      const { file_url } = await base44.integrations.Core.UploadFile({ 
        file: capturedPhoto.file 
      });
      
      // Get current attempt (most recent or selected)
      const currentAttemptIndex = activeTab > 0 ? activeTab - 1 : sortedAttempts.length - 1;
      const currentAttempt = sortedAttempts[currentAttemptIndex];
      
      if (!currentAttempt) {
        toast.error('No attempt found');
        return;
      }
      
      // Update attempt with photo and notes
      const existingPhotos = currentAttempt.photo_urls || [];
      const existingNotes = currentAttempt.notes || '';
      const newNotes = existingNotes 
        ? `${existingNotes}\n\n${comment}` 
        : comment;
      
      await base44.entities.Attempt.update(currentAttempt.id, {
        photo_urls: [...existingPhotos, file_url],
        notes: newNotes
      });
      
      // Update local state
      const updatedAttempts = localAttempts.map(a => 
        a.id === currentAttempt.id 
          ? { ...a, photo_urls: [...existingPhotos, file_url], notes: newNotes }
          : a
      );
      setLocalAttempts(updatedAttempts);
      
      // Invalidate queries
      queryClient.invalidateQueries({ queryKey: ['routeAttempts', routeId] });
      
      // Reset state
      setCapturedPhoto(null);
      setShowCommentModal(false);
      toast.success('Evidence saved');
      
    } catch (error) {
      console.error('Failed to save evidence:', error);
      toast.error('Failed to save evidence');
    } finally {
      setSavingEvidence(false);
    }
  };

  // Determine card state colors
  const isServed = address.served;
  const isPriority = attemptCount >= 2 && !isServed;

  // Get selected attempt data
  const selectedAttempt = activeTab > 0 ? sortedAttempts[activeTab - 1] : null;

  return (
    <>
      <div
        onClick={handleCardClick}
        className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden cursor-pointer transition-all duration-200 hover:shadow-lg hover:scale-[1.01] active:scale-[0.99]"
      >
        {/* Attempt Tabs - Only show if there are attempts */}
        {attemptCount > 0 && (
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
              const hasAttempt = sortedAttempts[num - 1];
              const isActive = activeTab === num;
              
              return (
                <button
                  key={num}
                  onClick={(e) => { 
                    e.stopPropagation(); 
                    if (hasAttempt) setActiveTab(num); 
                  }}
                  disabled={!hasAttempt}
                  className={`flex-1 py-2.5 text-xs font-bold transition-colors ${
                    isActive
                      ? 'bg-indigo-600 text-white'
                      : hasAttempt
                        ? 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                        : 'bg-gray-50 text-gray-300 cursor-not-allowed'
                  }`}
                >
                  A{num}
                </button>
              );
            })}
          </div>
        )}

        {/* Header Section with Gradient */}
        <div className={`px-4 py-4 ${
          isServed ? 'bg-gradient-to-r from-green-50 to-emerald-50' : 
          'bg-gradient-to-r from-indigo-50 via-purple-50 to-pink-50'
        }`}>
          <div className="flex items-start gap-3">
            {/* Location Pin Icon */}
            <div className={`w-12 h-12 rounded-full flex items-center justify-center flex-shrink-0 ${
              isServed ? 'bg-green-100' : 'bg-indigo-100'
            }`}>
              {isServed ? (
                <CheckCircle className="w-6 h-6 text-green-600" />
              ) : (
                <MapPin className="w-6 h-6 text-indigo-600" />
              )}
            </div>
            
            <div className="flex-1 min-w-0">
              {/* Address Display - 2 lines, ALL CAPS, Bold */}
              <p className={`text-lg font-bold leading-tight ${
                isServed ? 'text-gray-500' : 'text-gray-900'
              }`}>
                {formatted.line1}
              </p>
              <p className={`text-sm ${isServed ? 'text-gray-400' : 'text-gray-500'}`}>
                {formatted.line2}
              </p>
            </div>


          </div>
        </div>

        {/* HOME TAB - Summary with all qualifiers/times */}
        {attemptCount > 0 && !isServed && activeTab === 0 && (
          <div className="px-4 py-3 border-t border-gray-100">
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
              {sortedAttempts.map((attempt, idx) => (
                <div 
                  key={attempt.id} 
                  className="flex items-center gap-3 p-2 bg-gray-50 rounded-lg cursor-pointer hover:bg-gray-100"
                  onClick={(e) => { e.stopPropagation(); setActiveTab(idx + 1); }}
                >
                  <div className="w-8 h-8 rounded-full bg-indigo-100 flex items-center justify-center text-xs font-bold text-indigo-600">
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
                      <span className="text-[10px] text-gray-500 capitalize">
                        {attempt.outcome?.replace('_', ' ')}
                      </span>
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
              ))}
            </div>

            {/* What's Earned / What's Needed Summary */}
            <div className="grid grid-cols-2 gap-2 mt-3">
              <QualifierBox 
                label="EARNED" 
                badges={(() => {
                  const { earnedBadges } = getNeededQualifiers(sortedAttempts);
                  return earnedBadges;
                })()}
                emptyText="None yet"
                variant="success"
              />
              <QualifierBox 
                label="STILL NEED" 
                badges={(() => {
                  const { needed, isComplete } = getNeededQualifiers(sortedAttempts);
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
          </div>
        )}

        {/* ATTEMPT TAB - Individual attempt details */}
        {attemptCount > 0 && !isServed && activeTab > 0 && selectedAttempt && (
          <div className="px-4 py-3 border-t border-gray-100">
            {/* Header with qualifier badges */}
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-semibold text-gray-500">
                ATTEMPT {activeTab} DETAILS
              </h3>
              <QualifierBadges 
                badges={selectedAttempt.qualifier_badges || [selectedAttempt.qualifier?.toUpperCase()]} 
                size="default" 
              />
            </div>

            {/* Date & Time */}
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-lg bg-amber-100 flex items-center justify-center">
                <Calendar className="w-5 h-5 text-amber-600" />
              </div>
              <div>
                <p className="text-xs text-gray-500 font-medium">DATE & TIME</p>
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
              </div>
            </div>

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
            {selectedAttempt.notes && (
              <div 
                onClick={(e) => { e.stopPropagation(); /* TODO: handleEditNotes */ }}
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
            )}

            {/* View Photos Button */}
            {selectedAttempt.photo_urls?.length > 0 && (
              <Button
                variant="outline"
                onClick={(e) => { e.stopPropagation(); setShowPhotoViewer(true); }}
                className="w-full"
              >
                <Camera className="w-4 h-4 mr-2" />
                View Evidence Photos ({selectedAttempt.photo_urls.length})
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
              {receiptApproved && (
                <Badge className="bg-green-100 text-green-700 border border-green-200 text-[10px] font-bold px-2.5 py-1">
                  <FileCheck className="w-3 h-3 mr-1" />
                  RECEIPT APPROVED
                </Badge>
              )}
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
            {/* Main Action - Log Attempt */}
            <Button 
              onClick={handleLogAttempt}
              disabled={loggingAttempt}
              className="w-full h-12 bg-orange-500 hover:bg-orange-600 text-white font-bold text-sm rounded-xl"
            >
              {loggingAttempt ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Logging...
                </>
              ) : (
                <>
                  <Zap className="w-4 h-4 mr-2" />
                  LOG ATTEMPT {attemptCount + 1}
                </>
              )}
            </Button>

            {/* Secondary Actions Row */}
            <div className="flex gap-2">
              <Button 
                onClick={handleCaptureEvidence}
                className="flex-1 h-14 bg-blue-500 hover:bg-blue-600 text-white font-bold text-xs rounded-xl flex flex-col items-center justify-center gap-1"
              >
                <Camera className="w-5 h-5" />
                <span>CAPTURE EVIDENCE</span>
              </Button>
              
              <Link 
                to={createPageUrl(`SubmitReceipt?addressId=${address.id}&routeId=${routeId}&finalize=true`)}
                onClick={(e) => e.stopPropagation()}
                className="flex-1"
              >
                <Button 
                  className="w-full h-14 bg-emerald-500 hover:bg-emerald-600 text-white font-bold text-xs rounded-xl flex flex-col items-center justify-center gap-1"
                >
                  <Shield className="w-5 h-5" />
                  <span>FINALIZE SERVICE</span>
                </Button>
              </Link>
            </div>

            {/* Navigate Button */}
            <div className="flex items-center border border-gray-200 rounded-xl overflow-hidden">
              <button 
                onClick={(e) => { e.stopPropagation(); onMessageBoss && onMessageBoss(address); }}
                className="p-3 border-r border-gray-200 hover:bg-gray-50 transition-colors"
              >
                <MoreVertical className="w-5 h-5 text-gray-400" />
              </button>
              <button 
                onClick={handleNavigate}
                className="flex-1 flex items-center justify-center gap-2 py-3 hover:bg-gray-50 transition-colors"
              >
                <Navigation className="w-5 h-5 text-green-600" />
                <span className="font-bold text-green-600 tracking-wide">NAVIGATE</span>
              </button>
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
      />

      {/* Photo Viewer */}
      <PhotoViewer
        open={showPhotoViewer}
        onClose={() => setShowPhotoViewer(false)}
        photos={selectedAttempt?.photo_urls || []}
      />
    </>
  );
}