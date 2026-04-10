import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import { base44 } from '@/api/base44Client';
import { useQueryClient } from '@tanstack/react-query';
import { Camera, MoreVertical, Phone, MessageSquare, Navigation, FileText, MapPin, CheckCircle, Clock, AlertCircle, FileCheck, Image as ImageIcon, ChevronDown, ChevronUp, Calendar, Tag, Pencil, X, Check, RotateCcw, Flag } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import * as DropdownMenuPrimitives from "@/components/ui/dropdown-menu";
const { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } = DropdownMenuPrimitives;
import EvidenceCamera from './EvidenceCamera';
import EvidenceCommentModal from './EvidenceCommentModal';
import RTOModal from './RTOModal';
import PhotoViewer from './PhotoViewer';
import QualifierBadge from '@/components/qualifier/QualifierBadge';

export default function AddressCard({
  address,
  index,
  routeId,
  showActions = true,
  lastAttempt,
  allAttempts = [],
  onMessageBoss,
  editMode = false,
  route,
  showZoneLabels = true,
  preserveOrder = false,
  comboRouteIds = null,
}) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [isExpanded, setIsExpanded] = useState(false);
  const [showCamera, setShowCamera] = useState(false);
  const [showCommentModal, setShowCommentModal] = useState(false);
  const [showRTOModal, setShowRTOModal] = useState(false);
  const [showPhotoViewer, setShowPhotoViewer] = useState(false);
  const [photoViewerIndex, setPhotoViewerIndex] = useState(0);
  const [activeTab, setActiveTab] = useState(0);
  const [savingRTO, setSavingRTO] = useState(false);
  const [savingAttempt, setSavingAttempt] = useState(false);
  const [isEditingAddress, setIsEditingAddress] = useState(false);
  const [editFields, setEditFields] = useState({});
  const [savingEdit, setSavingEdit] = useState(false);
  const [isSavingPostingComplete, setIsSavingPostingComplete] = useState(false);

  const isServed = address.served || address.status === 'served';
  const isRTO = address.status === 'rto';
  const attemptCount = allAttempts.length;
  const sortedAttempts = [...allAttempts].sort((a, b) => new Date(b.attempt_time) - new Date(a.attempt_time));
  const selectedAttempt = sortedAttempts[activeTab - 1] || null;
  const isVerified = address.verification_status === 'verified';

  // Check for in-progress attempt (has photo but no qualifier yet — posting flow)
  const hasInProgressAttempt = sortedAttempts.some(a =>
    a.photo_urls?.length > 0 &&
    !a.qualifier &&
    (!a.qualifier_badges || a.qualifier_badges.length === 0) &&
    address.serve_type === 'posting'
  );
  const inProgressAttempt = hasInProgressAttempt
    ? sortedAttempts.find(a => a.photo_urls?.length > 0 && !a.qualifier && (!a.qualifier_badges || a.qualifier_badges.length === 0))
    : null;

  // Card border color based on status
  const cardBorder = isServed
    ? '1px solid rgba(34,197,94,0.35)'
    : isRTO
    ? '1px solid rgba(239,68,68,0.35)'
    : hasInProgressAttempt
    ? '1px solid rgba(233,195,73,0.50)'
    : '1px solid rgba(255,255,255,0.08)';

  const cardBg = isServed
    ? 'rgba(34,197,94,0.05)'
    : isRTO
    ? 'rgba(239,68,68,0.05)'
    : hasInProgressAttempt
    ? 'rgba(233,195,73,0.05)'
    : 'rgba(28,27,29,0.85)';

  const handleNavigate = (e) => {
    e.stopPropagation();
    const addr = address.normalized_address || address.legal_address;
    if (addr) {
      window.open(`https://maps.apple.com/?daddr=${encodeURIComponent(addr)}`, '_blank');
    }
  };

  const handleCameraOpen = (e) => {
    e.stopPropagation();
    setShowCamera(true);
  };

  const handlePhotoSaved = async (photoUrl) => {
    setShowCamera(false);

    if (address.serve_type === 'posting') {
      // For postings, create an attempt record immediately with the photo
      // but without qualifier — worker will finalize later
      try {
        const existingInProgress = sortedAttempts.find(a =>
          a.photo_urls?.length > 0 &&
          !a.qualifier &&
          (!a.qualifier_badges || a.qualifier_badges.length === 0)
        );

        if (existingInProgress) {
          // Add photo to existing in-progress attempt
          const updatedPhotos = [...(existingInProgress.photo_urls || []), photoUrl];
          await base44.entities.Attempt.update(existingInProgress.id, {
            photo_urls: updatedPhotos
          });
        } else {
          // Create new in-progress attempt
          await base44.entities.Attempt.create({
            address_id: address.id,
            route_id: routeId,
            photo_urls: [photoUrl],
            attempt_time: new Date().toISOString(),
            serve_type: address.serve_type || 'serve',
          });
        }

        await queryClient.invalidateQueries({ queryKey: ['routeAttempts', routeId] });
        toast.success('Photo saved — tap Finalize Posting when ready');
      } catch (err) {
        console.error('Failed to save posting photo:', err);
        toast.error('Failed to save photo');
      }
      return;
    }

    // Non-posting: open comment modal
    setShowCommentModal(true);
  };

  const handleAttemptSave = async ({ comment, qualifier, qualifierBadges, photoUrl: modalPhotoUrl }) => {
    if (savingAttempt) return;
    setSavingAttempt(true);
    try {
      const now = new Date().toISOString();

      if (!hasInProgressAttempt && !comment.trim() && address.serve_type !== 'posting') {
        toast.error('Please add a comment before saving');
        setSavingAttempt(false);
        return;
      }

      const newAttemptCount = attemptCount + 1;
      const isLastAttempt = route?.required_attempts && newAttemptCount >= route.required_attempts;
      const isServedAttempt = qualifier === 'served' || qualifier === 'SERVED';

      let photoUrls = [];
      if (modalPhotoUrl) photoUrls = [modalPhotoUrl];

      const attemptData = {
        address_id: address.id,
        route_id: routeId,
        attempt_time: now,
        comment: comment || '',
        qualifier: qualifier || null,
        qualifier_badges: qualifierBadges || [],
        photo_urls: photoUrls,
        serve_type: address.serve_type || 'serve',
        attempt_number: newAttemptCount,
      };

      await base44.entities.Attempt.create(attemptData);

      const addressUpdates = {
        attempts_count: newAttemptCount,
        last_attempt_date: now,
      };

      if (isServedAttempt) {
        addressUpdates.served = true;
        addressUpdates.status = 'served';
        addressUpdates.served_at = now;
      } else if (isLastAttempt) {
        addressUpdates.status = 'rto';
      } else {
        addressUpdates.status = 'attempted';
      }

      if (!address.first_attempt_date) {
        addressUpdates.first_attempt_date = now;
      }

      await base44.entities.Address.update(address.id, addressUpdates);

      if (isServedAttempt) {
        const currentRoute = await base44.entities.Route.filter({ id: routeId });
        const routeData = currentRoute[0];
        if (routeData) {
          await base44.entities.Route.update(routeId, {
            served_count: (routeData.served_count || 0) + 1
          });
        }
      }

      await queryClient.invalidateQueries({ queryKey: ['routeAttempts', routeId] });
      await queryClient.invalidateQueries({ queryKey: ['routeAddresses', routeId] });

      setShowCommentModal(false);
      toast.success(isServedAttempt ? 'Served! ✓' : 'Attempt logged');
    } catch (error) {
      console.error('Failed to save attempt:', error);
      toast.error('Failed to save attempt');
    } finally {
      setSavingAttempt(false);
    }
  };

  const handleFinalizePosting = async () => {
    if (isSavingPostingComplete) return;
    setIsSavingPostingComplete(true);
    try {
      const isPosting = address.serve_type === 'posting';
      const now = new Date().toISOString();

      if (isPosting && inProgressAttempt) {
        // Finalize the in-progress posting attempt
        await base44.entities.Attempt.update(inProgressAttempt.id, {
          qualifier: 'POSTING',
          qualifier_badges: ['POSTING'],
          attempt_time: now,
          serve_type: 'posting',
          attempt_number: attemptCount + 1,
        });
      }

      const newAttemptCount = attemptCount + 1;
      const addressUpdates = {
        served: true,
        status: 'served',
        served_at: now,
        attempts_count: newAttemptCount,
        last_attempt_date: now,
      };

      if (!address.first_attempt_date) {
        addressUpdates.first_attempt_date = now;
      }

      await base44.entities.Address.update(address.id, addressUpdates);

      // Update route served count
      const currentRoute = await base44.entities.Route.filter({ id: routeId });
      const routeData = currentRoute[0];
      if (routeData) {
        await base44.entities.Route.update(routeId, {
          served_count: (routeData.served_count || 0) + 1
        });
      }

      // Notify boss
      try {
        const allUsers = await base44.entities.User.filter({ company_id: routeData?.company_id });
        const bosses = allUsers.filter(u => u.role === 'boss' || u.role === 'admin');
        for (const boss of bosses) {
          await base44.entities.Notification.create({
            user_id: boss.id,
            company_id: routeData?.company_id,
            recipient_role: 'boss',
            type: 'posting_completed',
            title: 'Posting Completed ✓',
            body: `Posting completed at ${address.normalized_address || address.legal_address}`,
            data: { route_id: routeId, address_id: address.id },
            action_url: `/BossRouteDetail?id=${routeId}`,
            priority: 'normal',
            details: { route_id: routeId, serve_type: 'posting', attempt_count: newAttemptCount },
          });
        }
      } catch (notifErr) {
        console.warn('Failed to notify boss:', notifErr);
      }

      // Audit log
      try {
        await base44.entities.AuditLog.create({
          action_type: 'posting_completed',
          target_type: 'address',
          target_id: address.id,
          timestamp: now,
        });
      } catch (auditErr) {
        console.warn('Audit log failed:', auditErr);
      }

      await queryClient.invalidateQueries({ queryKey: ['routeAttempts', routeId] });
      await queryClient.invalidateQueries({ queryKey: ['routeAddresses', routeId] });
      toast.success('Posting complete! ✓');
    } catch (error) {
      console.error('Failed to finalize posting:', error);
      toast.error('Failed to complete posting');
    } finally {
      setIsSavingPostingComplete(false);
    }
  };

  const handleRTO = async ({ rtoDate, notes }) => {
    if (savingRTO) return;
    setSavingRTO(true);
    try {
      await base44.entities.Address.update(address.id, {
        status: 'rto',
        rto_date: rtoDate,
        rto_notes: notes,
        served: false,
      });
      await queryClient.invalidateQueries({ queryKey: ['routeAddresses', routeId] });
      setShowRTOModal(false);
      toast.success('RTO logged');
    } catch (error) {
      toast.error('Failed to log RTO');
    } finally {
      setSavingRTO(false);
    }
  };

  const handleSaveEdit = async () => {
    if (savingEdit) return;
    setSavingEdit(true);
    try {
      await base44.entities.Address.update(address.id, {
        legal_address: editFields.legal_address,
        normalized_address: editFields.normalized_address,
        defendant_name: editFields.defendant_name,
        serve_type: editFields.serve_type,
        notes: editFields.notes,
      });
      await queryClient.invalidateQueries({ queryKey: ['routeAddresses', routeId] });
      setIsEditingAddress(false);
      toast.success('Address updated');
    } catch (error) {
      toast.error('Failed to update address');
    } finally {
      setSavingEdit(false);
    }
  };

  const handleSaveNotes = async () => {
    try {
      await base44.entities.Address.update(address.id, { notes: editFields.notes });
      await queryClient.invalidateQueries({ queryKey: ['routeAddresses', routeId] });
      toast.success('Notes saved');
    } catch (error) {
      toast.error('Failed to save notes');
    }
  };

  const displayAddress = address.normalized_address || address.legal_address || 'Unknown Address';
  const addressParts = displayAddress.split(',');
  const streetLine = addressParts[0]?.trim() || displayAddress;
  const cityStateLine = addressParts.slice(1).join(',').trim();

  return (
    <>
      <div
        className="rounded-2xl overflow-hidden"
        style={{ background: cardBg, border: cardBorder, backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)' }}
      >
        {/* In-progress posting warning banner */}
        {hasInProgressAttempt && !isServed && (
          <div
            className={`px-4 py-2 flex items-center gap-2 cursor-pointer ${
              isExpanded
                ? 'bg-red-950/20 border-b border-red-900/40'
                : 'bg-red-950/40 border-red-800/50 animate-pulse cursor-pointer'
            }`}
            onClick={() => setIsExpanded(!isExpanded)}
          >
            <AlertCircle className="w-4 h-4 flex-shrink-0" style={{ color: '#f87171' }} />
            <span className="text-xs font-bold" style={{ color: '#f87171' }}>
              Posting in progress — tap to finalize
            </span>
          </div>
        )}

        {/* RTO Warning Banner */}
        {isRTO && !isServed && (
          <div className="px-4 pb-3 bg-red-950/20 border-b border-red-900/40">
            <div className="pt-3 flex items-start gap-2">
              <Flag className="w-4 h-4 flex-shrink-0 mt-0.5" style={{ color: '#f87171' }} />
              <div className="flex-1">
                <p className="text-xs font-bold" style={{ color: '#f87171' }}>Return to Office</p>
                {address.rto_date && (
                  <p className="text-xs" style={{ color: '#9ca3af' }}>
                    Scheduled: {new Date(address.rto_date).toLocaleDateString()}
                  </p>
                )}
                {address.rto_notes && (
                  <p className="text-xs mt-1" style={{ color: '#9ca3af' }}>{address.rto_notes}</p>
                )}
                <div className="flex flex-wrap gap-1 mt-1">
                  {sortedAttempts.slice(0, 3).map((attempt, i) => (
                    <span key={i} className="text-[10px] px-1.5 py-0.5 rounded" style={{ background: 'rgba(239,68,68,0.15)', color: '#f87171' }}>
                      {attempt.qualifier || 'Attempt'} {attempt.photo_urls?.length > 0 && <ImageIcon className="w-4 h-4 text-blue-500" />}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Main card tap area */}
        <div
          className="px-4 pt-3 pb-2 cursor-pointer"
          onClick={() => {
            if (editMode) {
              navigate(createPageUrl(`EditAddress?id=${address.id}&routeId=${routeId}`));
              return;
            }
            setIsExpanded(!isExpanded);
          }}
        >
          <div className="flex items-start justify-between gap-2">
            <div className="flex-1 min-w-0">
              {/* Zone label */}
              {showZoneLabels && address.zone_label && (
                <div className="flex items-center gap-1 mb-1">
                  <Tag className="w-3 h-3" style={{ color: '#e5b9e1' }} />
                  <span className="text-[10px] font-bold uppercase tracking-wide" style={{ color: '#e5b9e1' }}>{address.zone_label}</span>
                </div>
              )}
              {/* Folder name for combo routes */}
              {address._folderName && (
                <div className="text-[10px] font-bold uppercase tracking-wide mb-0.5" style={{ color: '#8a7f87' }}>
                  {address._folderName}
                </div>
              )}
              <p className="font-bold text-base leading-tight" style={{ color: '#e6e1e4' }}>{streetLine}</p>
              {cityStateLine && <p className="text-xs mt-0.5" style={{ color: '#8a7f87' }}>{cityStateLine}</p>}
              {address.defendant_name && (
                <p className="text-sm mt-1 font-medium" style={{ color: '#d0c3cb' }}>{address.defendant_name}</p>
              )}
            </div>

            {/* Stop number badge */}
            {index !== undefined && (
              <div className="w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 font-bold text-xs"
                style={{ background: isServed ? 'rgba(34,197,94,0.20)' : 'rgba(255,255,255,0.10)', color: isServed ? '#86efac' : '#e6e1e4', border: isServed ? '1px solid rgba(34,197,94,0.40)' : '1px solid rgba(255,255,255,0.15)' }}>
                {isServed ? <CheckCircle className="w-4 h-4" /> : index + 1}
              </div>
            )}
          </div>
        </div>

        {/* Action buttons — only show when not served and showActions is true */}
        {!isServed && showActions && !editMode && (
          <>
            {/* Posting in-progress expanded view */}
            {hasInProgressAttempt && isExpanded && (
              <div className="px-4 pb-3 bg-red-950/20 border-b border-red-900/40">
                <div className="bg-red-950/20 rounded-lg p-3 mb-3 border border-red-900/40">
                  <p className="text-xs font-semibold mb-2" style={{ color: '#f87171' }}>Photos taken ({inProgressAttempt?.photo_urls?.length || 0})</p>
                  {inProgressAttempt?.photo_urls?.length > 0 && (
                    <div className="flex gap-2 flex-wrap">
                      {inProgressAttempt.photo_urls.map((url, i) => (
                        <img
                          key={i}
                          src={url}
                          alt="Evidence"
                          className="w-16 h-16 rounded-lg object-cover cursor-pointer"
                          onClick={() => { setPhotoViewerIndex(i); setShowPhotoViewer(true); }}
                        />
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Regular attempt tabs */}
            {hasInProgressAttempt && !isServed && address.serve_type !== 'posting' && (
              <div className="px-4 pb-2">
                <p className="text-xs" style={{ color: '#8a7f87' }}>Attempt in progress</p>
              </div>
            )}

            {attemptCount > 0 && address.serve_type !== 'posting' && (
              <div className="px-4 pb-2 flex gap-1 overflow-x-auto">
                <button
                  onClick={(e) => { e.stopPropagation(); setActiveTab(0); setIsExpanded(true); }}
                  className={`flex-1 py-2.5 text-xs font-bold transition-colors ${activeTab === 0 ? 'bg-green-500 text-white' : 'bg-[#2a2a2c] text-[#8a7d87] hover:bg-[#363436]'}`}
                  style={{ borderRadius: 8 }}
                >
                  Summary
                </button>
                {sortedAttempts.map((attempt, i) => (
                  <button
                    key={attempt.id}
                    onClick={(e) => { e.stopPropagation(); setActiveTab(i + 1); setIsExpanded(true); }}
                    className={`flex-1 py-2.5 text-xs font-bold transition-colors ${activeTab === i + 1 ? 'bg-blue-500 text-white' : 'bg-[#2a2a2c] text-[#8a7d87] hover:bg-[#363436]'}`}
                    style={{ borderRadius: 8 }}
                  >
                    #{i + 1}
                  </button>
                ))}
              </div>
            )}

            {isExpanded && activeTab === 0 && (
              <div className="px-4 pb-3 border-t border-[#363436]">
                <div className="pt-3">
                  {address.serve_type === 'posting' ? (
                    <>
                      {sortedAttempts.length > 0 && (
                        <>
                          <div className="flex gap-1 flex-wrap mb-3">
                            {sortedAttempts.map((attempt, i) => (
                              <div key={i} className="flex items-center gap-1 text-xs px-2 py-1 rounded-lg" style={{ background: 'rgba(255,255,255,0.06)', color: '#d0c3cb' }}>
                                <span>#{i + 1}</span>
                                {attempt.photo_urls?.length > 0 && <ImageIcon className="w-4 h-4 text-blue-500" />}
                              </div>
                            ))}
                          </div>
                          <div className="flex items-center gap-2 flex-wrap mt-3">
                            <Badge variant="outline" className="text-[10px] font-bold px-2.5 py-1" style={{ background: 'rgba(34,197,94,0.15)', color: '#86efac', border: '1px solid rgba(34,197,94,0.35)' }}>POSTING</Badge>
                            {isVerified && <Badge className="bg-teal-900/30 text-teal-300 border border-teal-800/40 text-[10px] font-bold px-2.5 py-1">VERIFIED</Badge>}
                            {address.has_dcn && <Badge className="bg-purple-900/30 text-purple-300 border border-purple-800/40 text-[10px] font-bold px-2.5 py-1">DCN</Badge>}
                          </div>
                        </>
                      )}
                    </>
                  ) : (
                    <>
                      <div className="flex items-center justify-between mb-3">
                        <span className="text-xs font-bold text-[#d0c3cb] tracking-wide">ATTEMPTS SUMMARY</span>
                      </div>
                      <div className="space-y-2">
                        {sortedAttempts.map((attempt, i) => (
                          <div key={attempt.id} className="flex items-center gap-3 p-2 rounded-lg" style={{ background: 'rgba(255,255,255,0.04)' }}>
                            <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold bg-purple-900/30 text-purple-300">
                              #{i + 1}
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-xs font-medium" style={{ color: '#d0c3cb' }}>
                                {new Date(attempt.attempt_time).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
                              </p>
                              {attempt.comment && <p className="text-xs truncate" style={{ color: '#8a7f87' }}>{attempt.comment}</p>}
                            </div>
                            <QualifierBadge badges={attempt.qualifier_badges || [attempt.qualifier?.toUpperCase()]} size="small" />
                          </div>
                        ))}
                      </div>
                      {address.has_dcn && <Badge className="bg-purple-900/30 text-purple-300 border border-purple-800/40 text-[10px] font-bold px-2.5 py-1 mt-2">DCN</Badge>}
                    </>
                  )}
                </div>
              </div>
            )}
          </>
        )}

        {/* Attempt detail tab */}
        {attemptCount > 0 && !isServed && activeTab > 0 && selectedAttempt && address.serve_type !== 'posting' && (
          <div className="px-4 pb-3 border-t border-[#363436]">
            <div className="pt-3">
              <QualifierBadge badges={selectedAttempt.qualifier_badges || [selectedAttempt.qualifier?.toUpperCase()]} size="default" />
              <p className="text-xs mt-2" style={{ color: '#8a7f87' }}>
                {new Date(selectedAttempt.attempt_time).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true })}
              </p>
              {selectedAttempt.comment && (
                <p className="text-sm mt-1" style={{ color: '#d0c3cb' }}>{selectedAttempt.comment}</p>
              )}
              {selectedAttempt.photo_urls?.length > 0 && (
                <div className="flex gap-2 flex-wrap mt-2">
                  {selectedAttempt.photo_urls.map((url, i) => (
                    <img
                      key={i}
                      src={url}
                      alt="Evidence"
                      className="w-16 h-16 rounded-lg object-cover cursor-pointer"
                      onClick={() => { setPhotoViewerIndex(i); setShowPhotoViewer(true); }}
                    />
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Notes section when expanded */}
        {isExpanded && showActions && !editMode && (
          <div className="px-4 pb-3 border-t border-[#363436]">
            <div className="pt-3">
              <div className="w-10 h-10 rounded-lg bg-green-900/30 flex items-center justify-center">
                <FileText className="w-5 h-5" style={{ color: '#86efac' }} />
              </div>
              <div className="bg-blue-950/30 rounded-xl p-4 mb-4 border border-blue-800/40 mt-3">
                <p className="text-xs font-bold mb-2" style={{ color: '#93c5fd' }}>NOTES</p>
                <textarea
                  className="w-full bg-transparent text-sm resize-none outline-none"
                  style={{ color: '#d0c3cb', minHeight: 60 }}
                  placeholder="Add notes..."
                  value={editFields.notes ?? address.notes ?? ''}
                  onChange={(e) => setEditFields(f => ({ ...f, notes: e.target.value }))}
                />
                <div className="flex justify-end gap-2 mt-2">
                  <Button size="sm" onClick={(e) => { e.stopPropagation(); handleSaveNotes(); }} className="flex-1 bg-blue-500 hover:bg-blue-600 text-white">Save</Button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Bottom action bar */}
        {!isServed && showActions && !editMode && (
          <div className="px-3 py-2 border-t border-[#363436] flex items-center gap-2">
            {/* RTO button */}
            <Button
              variant="outline"
              size="sm"
              onClick={(e) => { e.stopPropagation(); setShowRTOModal(true); }}
              className="h-12 border-red-300 text-red-600 hover:bg-red-500 hover:text-white hover:border-red-500 active:bg-red-600 active:border-red-600 transition-all duration-200 text-xs font-bold flex flex-col items-center justify-center gap-0.5 px-1"
              style={{ minWidth: 44 }}
            >
              <RotateCcw className="w-4 h-4" />
              <span>RTO</span>
            </Button>

            {/* Serve type + status badges */}
            <div className="flex items-center gap-1 flex-wrap flex-1 px-1">
              <Badge variant="outline" className="text-[10px] font-bold px-2.5 py-1" style={
                address.serve_type === 'garnishment' ? { background: 'rgba(168,85,247,0.15)', color: '#d8b4fe', border: '1px solid rgba(168,85,247,0.35)' } :
                address.serve_type === 'posting' ? { background: 'rgba(34,197,94,0.15)', color: '#86efac', border: '1px solid rgba(34,197,94,0.35)' } :
                { background: 'rgba(59,130,246,0.15)', color: '#93c5fd', border: '1px solid rgba(59,130,246,0.35)' }
              }>
                {(address.serve_type || 'serve').toUpperCase()}
              </Badge>
              {isVerified && <Badge className="bg-teal-900/30 text-teal-300 border border-teal-800/40 text-[10px] font-bold px-2.5 py-1">VERIFIED</Badge>}
              {address.has_dcn && <Badge className="bg-purple-900/30 text-purple-300 border border-purple-800/40 text-[10px] font-bold px-2.5 py-1">DCN</Badge>}
              <span className="text-xs text-[#8a7d87] ml-auto">No attempts yet</span>
            </div>
          </div>
        )}

        {/* Served state */}
        {isServed && (
          <div className={`px-4 py-3 border-t ${isRTO ? 'border-red-900/40 bg-red-950/20' : 'border-[#363436] bg-green-950/20'}`}>
            <div className="flex items-center gap-2 flex-wrap">
              {isRTO ? (
                <Badge className="bg-red-900/30 text-red-300 border border-red-800/40 text-[10px] font-bold px-2.5 py-1">
                  RTO
                </Badge>
              ) : address.receipt_status === 'approved' ? (
                <Badge className="bg-green-900/30 text-green-300 border border-green-800/40 text-[10px] font-bold px-2.5 py-1"><FileCheck className="w-3 h-3 mr-1" />RECEIPT APPROVED</Badge>
              ) : address.receipt_status === 'pending_review' ? (
                <Badge className="bg-yellow-900/30 text-yellow-300 border border-yellow-800/40 text-[10px] font-bold px-2.5 py-1"><Clock className="w-3 h-3 mr-1" />PENDING REVIEW</Badge>
              ) : (
                <Badge className="bg-green-900/30 text-green-300 border border-green-800/40 text-[10px] font-bold px-2.5 py-1">SERVED</Badge>
              )}
              {address.served_at && (
                <span className="text-xs ml-auto" style={{ color: '#8a7f87' }}>
                  {new Date(address.served_at).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true })}
                </span>
              )}
            </div>
          </div>
        )}

        {/* Action buttons row — Take Photo, Add Photo, Details, Navigate */}
        {!isServed && showActions && !editMode && (
          <div className="px-3 pb-3 space-y-2">
            {/* Take Photo button */}
            <Button
              onClick={handleCameraOpen}
              className="w-full font-bold text-sm h-11"
              style={{ background: 'rgba(59,130,246,0.85)', color: 'white' }}
            >
              <Camera className="w-4 h-4 mr-2" />
              TAKE PHOTO
            </Button>

            <div className="flex gap-2">
              {/* Add Photo from library */}
              <Button
                onClick={(e) => { e.stopPropagation(); setShowCommentModal(true); }}
                className="flex-1 font-bold text-sm h-11"
                style={{ background: 'rgba(59,130,246,0.85)', color: 'white' }}
              >
                <span className="text-lg mr-1">+</span>
                ADD PHOTO
              </Button>

              {/* Details */}
              <Button
                variant="outline"
                onClick={(e) => { e.stopPropagation(); setIsExpanded(!isExpanded); }}
                className="flex-1 font-bold text-sm h-11"
                style={{ background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.15)', color: '#d0c3cb' }}
              >
                <FileText className="w-4 h-4 mr-1" />
                DETAILS
              </Button>
            </div>

            {/* Navigate row */}
            <div className="flex items-center gap-2">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-11 px-3"
                    style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', color: '#9ca3af' }}
                    onClick={(e) => e.stopPropagation()}
                  >
                    <MoreVertical className="w-4 h-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" style={{ background: '#1c1b1d', border: '1px solid #363436' }}>
                  <DropdownMenuItem
                    onClick={(e) => { e.stopPropagation(); setShowRTOModal(true); }}
                    style={{ color: '#f87171' }}
                  >
                    <RotateCcw className="w-4 h-4 mr-2" />
                    Log RTO
                  </DropdownMenuItem>
                  {onMessageBoss && (
                    <DropdownMenuItem
                      onClick={(e) => { e.stopPropagation(); onMessageBoss(address); }}
                      style={{ color: '#d0c3cb' }}
                    >
                      <MessageSquare className="w-4 h-4 mr-2" />
                      Message Boss
                    </DropdownMenuItem>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>

              <Button
                onClick={handleNavigate}
                className="flex-1 font-bold text-sm h-11"
                style={hasInProgressAttempt
                  ? { background: 'rgba(34,197,94,0.20)', border: '1px solid rgba(34,197,94,0.40)', color: '#86efac' }
                  : { background: 'rgba(229,185,225,0.12)', border: '1px solid rgba(229,185,225,0.30)', color: '#e5b9e1' }}
              >
                <Navigation className="w-4 h-4 mr-2" />
                NAVIGATE
              </Button>
            </div>

            {/* Finalize Posting button */}
            {address.serve_type === 'posting' && hasInProgressAttempt && (
              <Button
                onClick={(e) => { e.stopPropagation(); handleFinalizePosting(); }}
                disabled={isSavingPostingComplete}
                className="w-full font-bold text-sm h-11 mt-1"
                style={{ background: 'rgba(34,197,94,0.20)', border: '1px solid rgba(34,197,94,0.40)', color: '#86efac' }}
              >
                <CheckCircle className="w-4 h-4 mr-2" />
                FINALIZE POSTING
              </Button>
            )}
          </div>
        )}

        {/* Boss-only address detail view when showActions=false */}
        {!showActions && (
          <div className="px-4 pb-4">
            {attemptCount > 0 && (
              <div className="mt-3 space-y-2">
                <p className="text-xs font-bold" style={{ color: '#8a7f87' }}>ATTEMPTS</p>
                {sortedAttempts.map((attempt, i) => (
                  <div key={attempt.id} className="p-3 rounded-xl" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs font-bold" style={{ color: '#d0c3cb' }}>Attempt #{i + 1}</span>
                      <span className="text-xs" style={{ color: '#8a7f87' }}>
                        {new Date(attempt.attempt_time).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true })}
                      </span>
                    </div>
                    <QualifierBadge badges={attempt.qualifier_badges || [attempt.qualifier?.toUpperCase()]} size="small" />
                    {attempt.comment && <p className="text-xs mt-1" style={{ color: '#8a7f87' }}>{attempt.comment}</p>}
                    {attempt.photo_urls?.length > 0 && (
                      <div className="flex gap-2 flex-wrap mt-2">
                        {attempt.photo_urls.map((url, j) => (
                          <img key={j} src={url} alt="Evidence" className="w-14 h-14 rounded-lg object-cover cursor-pointer"
                            onClick={() => { setPhotoViewerIndex(j); setShowPhotoViewer(true); }} />
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
            {attemptCount === 0 && (
              <div className="mt-2 flex items-center gap-2 flex-wrap">
                <Badge variant="outline" className="text-[10px] font-bold px-2.5 py-1" style={
                  address.serve_type === 'garnishment' ? { background: 'rgba(168,85,247,0.15)', color: '#d8b4fe', border: '1px solid rgba(168,85,247,0.35)' } :
                  address.serve_type === 'posting' ? { background: 'rgba(34,197,94,0.15)', color: '#86efac', border: '1px solid rgba(34,197,94,0.35)' } :
                  { background: 'rgba(59,130,246,0.15)', color: '#93c5fd', border: '1px solid rgba(59,130,246,0.35)' }
                }>
                  {(address.serve_type || 'serve').toUpperCase()}
                </Badge>
                {isVerified && <Badge className="bg-teal-900/30 text-teal-300 border border-teal-800/40 text-[10px] font-bold px-2.5 py-1">VERIFIED</Badge>}
                {address.has_dcn && <Badge className="bg-purple-900/30 text-purple-300 border border-purple-800/40 text-[10px] font-bold px-2.5 py-1">DCN</Badge>}
                <span className="text-xs text-[#8a7d87] ml-auto">No attempts yet</span>
              </div>
            )}
          </div>
        )}

        {/* Edit mode address form */}
        {isEditingAddress && editMode && (
          <div className="px-4 pb-4 border-t border-[#363436] pt-3 space-y-3">
            <div>
              <label className="text-xs font-bold" style={{ color: '#8a7f87' }}>Street Address</label>
              <input
                className="w-full mt-1 px-3 py-2 rounded-lg text-sm"
                style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', color: '#e6e1e4' }}
                value={editFields.legal_address ?? address.legal_address ?? ''}
                onChange={e => setEditFields(f => ({ ...f, legal_address: e.target.value }))}
              />
            </div>
            <div>
              <label className="text-xs font-bold" style={{ color: '#8a7f87' }}>Normalized Address</label>
              <input
                className="w-full mt-1 px-3 py-2 rounded-lg text-sm"
                style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', color: '#e6e1e4' }}
                value={editFields.normalized_address ?? address.normalized_address ?? ''}
                onChange={e => setEditFields(f => ({ ...f, normalized_address: e.target.value }))}
              />
            </div>
            <div>
              <label className="text-xs font-bold" style={{ color: '#8a7f87' }}>Defendant Name</label>
              <input
                className="w-full mt-1 px-3 py-2 rounded-lg text-sm"
                style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', color: '#e6e1e4' }}
                value={editFields.defendant_name ?? address.defendant_name ?? ''}
                onChange={e => setEditFields(f => ({ ...f, defendant_name: e.target.value }))}
              />
            </div>
            <div>
              <label className="text-xs font-bold" style={{ color: '#8a7f87' }}>Serve Type</label>
              <select
                className="w-full mt-1 px-3 py-2 rounded-lg text-sm"
                style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', color: '#e6e1e4' }}
                value={editFields.serve_type ?? address.serve_type ?? 'serve'}
                onChange={e => setEditFields(f => ({ ...f, serve_type: e.target.value }))}
              >
                <option value="serve">Serve</option>
                <option value="posting">Posting</option>
                <option value="garnishment">Garnishment</option>
              </select>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" className="flex-1" onClick={() => setIsEditingAddress(false)} style={{ border: '1px solid rgba(255,255,255,0.15)', color: '#9ca3af' }}>Cancel</Button>
              <Button size="sm" className="flex-1" onClick={handleSaveEdit} disabled={savingEdit} style={{ background: 'rgba(229,185,225,0.20)', border: '1px solid rgba(229,185,225,0.35)', color: '#e5b9e1' }}>
                {savingEdit ? 'Saving...' : 'Save Changes'}
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* Modals */}
      {showCamera && (
        <EvidenceCamera
          address={address}
          onClose={() => setShowCamera(false)}
          onPhotoSaved={handlePhotoSaved}
        />
      )}

      {showCommentModal && (
        <EvidenceCommentModal
          address={address}
          open={showCommentModal}
          onClose={() => setShowCommentModal(false)}
          onSave={handleAttemptSave}
          saving={savingAttempt}
          requireComment={!hasInProgressAttempt && address.serve_type !== 'posting'}
          existingPhotos={address.serve_type === 'posting' ? (sortedAttempts[0]?.photo_urls || []) : (selectedAttempt?.photo_urls || [])}
        />
      )}

      {showPhotoViewer && (
        <PhotoViewer
          photos={selectedAttempt?.photo_urls || inProgressAttempt?.photo_urls || []}
          initialIndex={photoViewerIndex}
          onClose={() => setShowPhotoViewer(false)}
        />
      )}

      {showRTOModal && (
        <RTOModal open={showRTOModal} onClose={() => setShowRTOModal(false)} onSubmit={handleRTO} address={address} saving={savingRTO} />
      )}
    </>
  );
}