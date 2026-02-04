import React from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { 
  MapPin, 
  FileCheck, 
  MessageCircle,
  Clock,
  CheckCircle,
  AlertCircle,
  Tag,
  Navigation,
  Zap,
  Camera,
  Info,
  Calendar,
  MoreVertical,
  Shield
} from 'lucide-react';
import { format } from 'date-fns';

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

// Get attempt qualifier label
function getQualifierLabel(qualifier) {
  const labels = {
    am: 'AM SHIFT',
    pm: 'PM SHIFT',
    weekend: 'WEEKEND',
    ntc: 'NTC'
  };
  return labels[qualifier] || qualifier?.toUpperCase() || '';
}

export default function AddressCard({ 
  address, 
  index, 
  routeId,
  showActions = true,
  onMessageBoss,
  onClick,
  lastAttempt
}) {
  const navigate = useNavigate();
  const formatted = formatAddress(address);
  const receiptStatus = address.receipt_status;
  const needsReceipt = !address.served && receiptStatus === 'pending';
  const receiptPending = receiptStatus === 'pending_review';
  const receiptApproved = receiptStatus === 'approved';
  const receiptNeedsRevision = receiptStatus === 'needs_revision';
  const attemptCount = address.attempts_count || 0;
  const isVerified = address.verification_status === 'verified';

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

  // Determine card state colors
  const isServed = address.served;
  const isPriority = attemptCount >= 2 && !isServed;

  return (
    <div
      onClick={handleCardClick}
      className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden cursor-pointer transition-all duration-200 hover:shadow-lg hover:scale-[1.01] active:scale-[0.99]"
    >
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

          {/* Level/Quest Badge */}
          <div className="flex-shrink-0">
            <div className={`px-3 py-1.5 rounded-lg border-2 text-center ${
              isServed ? 'border-green-300 bg-green-50' :
              isPriority ? 'border-orange-300 bg-orange-50' :
              'border-indigo-300 bg-white'
            }`}>
              <div className={`text-[10px] font-semibold ${
                isServed ? 'text-green-600' :
                isPriority ? 'text-orange-600' :
                'text-indigo-600'
              }`}>
                {isServed ? 'SERVED' : `LVL ${attemptCount + 1}`}
              </div>
              <div className={`text-xs font-bold ${
                isServed ? 'text-green-700' :
                isPriority ? 'text-orange-700' :
                'text-indigo-700'
              }`}>
                {isServed ? '✓' : 'QUEST'}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Attempt Details Section */}
      {attemptCount > 0 && !isServed && (
        <div className="px-4 py-3 border-t border-gray-100">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-bold text-gray-700 tracking-wide">
              ATTEMPT {attemptCount} DETAILS
            </span>
            {isPriority && (
              <Badge className="bg-orange-500 text-white text-[10px] px-2 py-0.5">
                PRIORITY
              </Badge>
            )}
          </div>

          {/* Date & Time Row */}
          {lastAttempt?.attempt_time && (
            <div className="flex items-center gap-3 mb-2">
              <div className="w-10 h-10 rounded-xl bg-orange-100 flex items-center justify-center">
                <Calendar className="w-5 h-5 text-orange-500" />
              </div>
              <div>
                <div className="text-[10px] text-gray-500 font-medium">DATE & TIME</div>
                <div className="text-sm font-semibold text-gray-900">
                  {format(new Date(lastAttempt.attempt_time), "EEE, M/d/yy 'at' h:mm a")}
                </div>
              </div>
            </div>
          )}

          {/* Status Note Row */}
          {lastAttempt?.notes && (
            <div className="flex items-start gap-3 mb-3">
              <div className="w-10 h-10 rounded-xl bg-blue-100 flex items-center justify-center flex-shrink-0">
                <Info className="w-5 h-5 text-blue-500" />
              </div>
              <div>
                <div className="text-[10px] text-gray-500 font-medium">STATUS NOTE</div>
                <div className="text-sm font-semibold text-gray-900">
                  {lastAttempt.notes}
                </div>
              </div>
            </div>
          )}

          {/* Status Badges */}
          <div className="flex items-center gap-2 flex-wrap">
            {isVerified && (
              <Badge className="bg-teal-100 text-teal-700 border border-teal-200 text-[10px] font-bold px-2.5 py-1">
                VERIFIED
              </Badge>
            )}
            {lastAttempt?.qualifier && (
              <Badge className="bg-orange-100 text-orange-600 border border-orange-200 text-[10px] font-bold px-2.5 py-1">
                {getQualifierLabel(lastAttempt.qualifier)}
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
          <Link 
            to={createPageUrl(`AddressDetail?addressId=${address.id}&routeId=${routeId}`)}
            onClick={(e) => e.stopPropagation()}
            className="block"
          >
            <Button 
              className="w-full h-12 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-sm rounded-xl"
            >
              <Zap className="w-4 h-4 mr-2" />
              LOG ATTEMPT {attemptCount + 1}
            </Button>
          </Link>

          {/* Secondary Actions Row */}
          <div className="flex gap-2">
            <Link 
              to={createPageUrl(`SubmitReceipt?addressId=${address.id}&routeId=${routeId}${address.latest_receipt_id && receiptNeedsRevision ? `&parentReceiptId=${address.latest_receipt_id}` : ''}`)}
              onClick={(e) => e.stopPropagation()}
              className="flex-1"
            >
              <Button 
                className={`w-full h-14 font-bold text-xs rounded-xl flex flex-col items-center justify-center gap-1 ${
                  receiptNeedsRevision 
                    ? 'bg-orange-500 hover:bg-orange-600 text-white' 
                    : 'bg-pink-500 hover:bg-pink-600 text-white'
                }`}
              >
                <Camera className="w-5 h-5" />
                <span>{receiptNeedsRevision ? 'RESUBMIT' : 'CAPTURE EVIDENCE'}</span>
              </Button>
            </Link>
            
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
  );
}