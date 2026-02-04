import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { format } from 'date-fns';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { 
  MapPin, 
  Calendar, 
  Info, 
  CheckCircle, 
  Camera, 
  Navigation, 
  Zap,
  Home,
  MoreVertical
} from 'lucide-react';

// Format address in required 2-line ALL CAPS format
function formatAddress(address) {
  const street = (address.normalized_address || address.legal_address || '').split(',')[0];
  const city = address.city || '';
  const state = address.state || '';
  const zip = address.zip || '';
  
  return {
    line1: street.toUpperCase().trim(),
    line2: city && state ? `${city.toUpperCase()}, ${state.toUpperCase()} ${zip}` : ''
  };
}

// Format date/time for display
function formatDateTime(isoString) {
  if (!isoString) return '';
  const date = new Date(isoString);
  return format(date, "EEE, M/d/yy 'at' h:mm a");
}

// Tab button component
function TabButton({ label, isActive, isCompleted, isHome, onClick }) {
  let bgColor = 'bg-gray-100';
  let textColor = 'text-gray-600';
  
  if (isHome) {
    bgColor = 'bg-emerald-500';
    textColor = 'text-white';
  } else if (isActive) {
    bgColor = 'bg-gray-900';
    textColor = 'text-white';
  } else if (isCompleted) {
    bgColor = 'bg-emerald-500';
    textColor = 'text-white';
  }
  
  return (
    <button
      onClick={onClick}
      className={`px-5 py-3 rounded-lg font-semibold text-sm min-w-[48px] transition-all ${bgColor} ${textColor}`}
    >
      {isCompleted && !isActive && !isHome ? '✓ ' : ''}{label}
    </button>
  );
}

export default function AddressDetailView({ 
  address, 
  routeId,
  onBack,
  onLogAttempt,
  onCaptureEvidence,
  onFinalizeService
}) {
  const navigate = useNavigate();
  const [currentTab, setCurrentTab] = useState('home');
  
  // Fetch attempts for this address
  const { data: attempts = [] } = useQuery({
    queryKey: ['addressAttempts', address?.id],
    queryFn: async () => {
      if (!address?.id) return [];
      return base44.entities.Attempt.filter({ address_id: address.id }, 'attempt_time');
    },
    enabled: !!address?.id
  });

  if (!address) return null;

  const formatted = formatAddress(address);
  const isPriority = address.priority || false;
  const isVerified = address.verification_status === 'verified';
  
  // Get current attempt data based on selected tab
  const currentAttemptNum = currentTab === 'home' ? null : parseInt(currentTab);
  const currentAttempt = currentAttemptNum ? attempts[currentAttemptNum - 1] : null;
  const nextAttemptNum = attempts.length + 1;

  const handleNavigate = () => {
    const addressStr = `${formatted.line1}, ${formatted.line2}`;
    const encoded = encodeURIComponent(addressStr);
    window.open(`https://www.google.com/maps/dir/?api=1&destination=${encoded}`, '_blank');
  };

  const handleLogAttempt = () => {
    if (onLogAttempt) {
      onLogAttempt(address.id);
    } else {
      navigate(createPageUrl(`SubmitReceipt?addressId=${address.id}&routeId=${routeId}`));
    }
  };

  const handleCaptureEvidence = () => {
    if (onCaptureEvidence) {
      onCaptureEvidence(address.id);
    } else {
      navigate(createPageUrl(`SubmitReceipt?addressId=${address.id}&routeId=${routeId}`));
    }
  };

  const handleFinalizeService = () => {
    if (onFinalizeService) {
      onFinalizeService(address.id);
    } else {
      navigate(createPageUrl(`SubmitReceipt?addressId=${address.id}&routeId=${routeId}&finalize=true`));
    }
  };

  return (
    <div className="bg-white rounded-2xl shadow-lg overflow-hidden mx-4 my-4">
      {/* Tab Navigation */}
      <div className="flex gap-1 p-3 overflow-x-auto bg-gray-50">
        <TabButton
          label="H"
          isHome={true}
          isActive={currentTab === 'home'}
          onClick={() => onBack ? onBack() : setCurrentTab('home')}
        />
        {attempts.map((attempt, index) => {
          const attemptNum = index + 1;
          const isCompleted = attempt.outcome === 'served';
          return (
            <TabButton
              key={attemptNum}
              label={attemptNum.toString()}
              isActive={currentTab === attemptNum.toString()}
              isCompleted={isCompleted}
              onClick={() => setCurrentTab(attemptNum.toString())}
            />
          );
        })}
      </div>

      {/* Address Header */}
      <div className="flex items-start gap-4 p-4 border-b border-gray-200">
        <div className="w-12 h-12 rounded-xl bg-indigo-100 flex items-center justify-center flex-shrink-0">
          <MapPin className="w-6 h-6 text-indigo-600" />
        </div>
        <div className="flex-1">
          <h2 className="text-xl font-bold text-gray-900 leading-tight">
            {formatted.line1}
          </h2>
          <p className="text-sm text-gray-600">
            {formatted.line2}
          </p>
        </div>
      </div>

      {/* Attempt Details Section */}
      {currentTab !== 'home' && currentAttempt ? (
        <div className="p-4 border-b border-gray-200">
          {/* Header with Priority Badge */}
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold text-gray-500 tracking-wide">
              ATTEMPT {currentAttemptNum} DETAILS
            </h3>
            {isPriority && (
              <Badge className="bg-purple-500 text-white px-3 py-1">
                PRIORITY
              </Badge>
            )}
          </div>

          {/* Date & Time */}
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-lg bg-amber-100 flex items-center justify-center">
              <Calendar className="w-5 h-5 text-amber-600" />
            </div>
            <div>
              <p className="text-xs text-gray-500 font-medium">DATE & TIME</p>
              <p className="text-base font-semibold text-gray-900">
                {formatDateTime(currentAttempt.attempt_time)}
              </p>
            </div>
          </div>

          {/* Status Note */}
          {currentAttempt.notes && (
            <div className="flex items-start gap-3 mb-4">
              <div className="w-10 h-10 rounded-lg bg-blue-100 flex items-center justify-center">
                <Info className="w-5 h-5 text-blue-600" />
              </div>
              <div>
                <p className="text-xs text-gray-500 font-medium">STATUS NOTE</p>
                <p className="text-base font-medium text-gray-900">
                  {currentAttempt.notes}
                </p>
              </div>
            </div>
          )}

          {/* Verified Badge */}
          {isVerified && (
            <Badge className="bg-emerald-100 text-emerald-700 border border-emerald-500 px-4 py-1.5">
              VERIFIED
            </Badge>
          )}
        </div>
      ) : (
        /* Home Tab Content - Summary */
        <div className="p-4 border-b border-gray-200">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold text-gray-500 tracking-wide">
              ADDRESS SUMMARY
            </h3>
            {isPriority && (
              <Badge className="bg-purple-500 text-white px-3 py-1">
                PRIORITY
              </Badge>
            )}
          </div>
          
          <div className="grid grid-cols-2 gap-4">
            <div className="bg-gray-50 rounded-lg p-3">
              <p className="text-2xl font-bold text-gray-900">{attempts.length}</p>
              <p className="text-xs text-gray-500">Attempts Made</p>
            </div>
            <div className="bg-gray-50 rounded-lg p-3">
              <p className="text-2xl font-bold text-gray-900">
                {address.served ? 'Yes' : 'No'}
              </p>
              <p className="text-xs text-gray-500">Served</p>
            </div>
          </div>

          {isVerified && (
            <Badge className="mt-4 bg-emerald-100 text-emerald-700 border border-emerald-500 px-4 py-1.5">
              VERIFIED
            </Badge>
          )}
        </div>
      )}

      {/* Action Buttons */}
      <div className="p-4">
        {/* Log Attempt - Primary */}
        {!address.served && (
          <Button
            onClick={handleLogAttempt}
            className="w-full h-14 rounded-xl bg-orange-500 hover:bg-orange-600 text-white text-base font-bold mb-3 flex items-center justify-center gap-2"
          >
            <Zap className="w-5 h-5" />
            LOG ATTEMPT {nextAttemptNum}
          </Button>
        )}

        {/* Capture Evidence & Finalize Row */}
        <div className="flex gap-3 mb-3">
          <Button
            onClick={handleCaptureEvidence}
            className="flex-1 h-14 rounded-xl bg-blue-500 hover:bg-blue-600 text-white flex flex-col items-center justify-center gap-1"
          >
            <Camera className="w-5 h-5" />
            <span className="text-xs font-semibold">CAPTURE EVIDENCE</span>
          </Button>
          
          <Button
            onClick={handleFinalizeService}
            className="flex-1 h-14 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-white flex flex-col items-center justify-center gap-1"
          >
            <CheckCircle className="w-5 h-5" />
            <span className="text-xs font-semibold">FINALIZE SERVICE</span>
          </Button>
        </div>

        {/* Navigate Button */}
        <Button
          onClick={handleNavigate}
          variant="outline"
          className="w-full h-12 rounded-xl border-2 border-gray-200 text-orange-500 font-semibold flex items-center justify-center gap-2"
        >
          <MoreVertical className="w-4 h-4 text-gray-400 absolute left-4" />
          <Navigation className="w-5 h-5" />
          NAVIGATE
        </Button>
      </div>
    </div>
  );
}