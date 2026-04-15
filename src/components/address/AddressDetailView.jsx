import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { format } from 'date-fns';
import { Button } from '@/components/ui/button';
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

// Brand colors
const C = {
  bg: '#060914',
  card: '#1c1b1d',
  cardElevated: '#201f21',
  cardHighest: '#363436',
  textPrimary: '#e6e1e4',
  textSecondary: '#d0c3cb',
  textMuted: '#8a7f87',
  accentGold: '#e9c349',
  accentPlum: '#e5b9e1',
  containerPlum: '#502f50',
  border: '#363436',
  green: '#22c55e',
  orange: '#f97316',
};

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
  let bg = 'transparent';
  let color = C.textMuted;
  let border = `1px solid ${C.border}`;

  if (isHome) {
    bg = C.green;
    color = '#0F0B10';
    border = 'none';
  } else if (isActive) {
    bg = C.containerPlum;
    color = C.accentPlum;
    border = `1px solid ${C.accentPlum}`;
  } else if (isCompleted) {
    bg = 'rgba(34,197,94,0.15)';
    color = C.green;
    border = `1px solid rgba(34,197,94,0.4)`;
  }

  return (
    <button
      onClick={onClick}
      style={{
        padding: '8px 16px',
        borderRadius: 8,
        fontWeight: 600,
        fontSize: 13,
        minWidth: 44,
        background: bg,
        color,
        border,
        cursor: 'pointer',
        transition: 'all 0.15s',
        whiteSpace: 'nowrap',
      }}
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
    <div style={{ margin: '16px', borderRadius: 16, overflow: 'hidden', border: `1px solid ${C.border}`, background: C.card }}>

      {/* Tab Navigation */}
      <div style={{ display: 'flex', gap: 6, padding: '10px 12px', overflowX: 'auto', background: 'rgba(255,255,255,0.03)', borderBottom: `1px solid ${C.border}` }}>
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
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14, padding: '14px 16px', borderBottom: `1px solid ${C.border}` }}>
        <div style={{ width: 44, height: 44, borderRadius: 12, background: 'rgba(233,195,73,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <MapPin style={{ width: 22, height: 22, color: C.accentGold }} />
        </div>
        <div style={{ flex: 1 }}>
          <h2 style={{ fontSize: 17, fontWeight: 700, color: C.textPrimary, lineHeight: 1.3, marginBottom: 2 }}>
            {formatted.line1}
          </h2>
          <p style={{ fontSize: 13, color: C.textMuted }}>
            {formatted.line2}
          </p>
          {isPriority && (
            <span style={{ display: 'inline-block', marginTop: 6, fontSize: 10, fontWeight: 700, background: 'rgba(229,185,225,0.15)', color: C.accentPlum, border: `1px solid ${C.accentPlum}`, borderRadius: 4, padding: '2px 8px' }}>
              PRIORITY
            </span>
          )}
        </div>
      </div>

      {/* Attempt Details or Home Summary */}
      {currentTab !== 'home' && currentAttempt ? (
        <div style={{ padding: '14px 16px', borderBottom: `1px solid ${C.border}` }}>
          <p style={{ fontSize: 11, fontWeight: 700, color: C.textMuted, letterSpacing: '0.08em', marginBottom: 14 }}>
            ATTEMPT {currentAttemptNum} DETAILS
          </p>

          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14 }}>
            <div style={{ width: 40, height: 40, borderRadius: 10, background: 'rgba(233,195,73,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Calendar style={{ width: 18, height: 18, color: C.accentGold }} />
            </div>
            <div>
              <p style={{ fontSize: 10, color: C.textMuted, fontWeight: 600 }}>DATE & TIME</p>
              <p style={{ fontSize: 14, fontWeight: 600, color: C.textPrimary }}>
                {formatDateTime(currentAttempt.attempt_time)}
              </p>
            </div>
          </div>

          {currentAttempt.notes && (
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, marginBottom: 14 }}>
              <div style={{ width: 40, height: 40, borderRadius: 10, background: 'rgba(229,185,225,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <Info style={{ width: 18, height: 18, color: C.accentPlum }} />
              </div>
              <div>
                <p style={{ fontSize: 10, color: C.textMuted, fontWeight: 600 }}>STATUS NOTE</p>
                <p style={{ fontSize: 14, fontWeight: 500, color: C.textPrimary }}>
                  {currentAttempt.notes}
                </p>
              </div>
            </div>
          )}

          {isVerified && (
            <span style={{ display: 'inline-block', fontSize: 11, fontWeight: 700, background: 'rgba(34,197,94,0.15)', color: C.green, border: '1px solid rgba(34,197,94,0.4)', borderRadius: 6, padding: '4px 12px' }}>
              VERIFIED
            </span>
          )}
        </div>
      ) : (
        <div style={{ padding: '14px 16px', borderBottom: `1px solid ${C.border}` }}>
          <p style={{ fontSize: 11, fontWeight: 700, color: C.textMuted, letterSpacing: '0.08em', marginBottom: 14 }}>
            ADDRESS SUMMARY
          </p>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div style={{ background: C.cardElevated, borderRadius: 10, padding: '12px 14px', border: `1px solid ${C.border}` }}>
              <p style={{ fontSize: 24, fontWeight: 700, color: C.textPrimary }}>{attempts.length}</p>
              <p style={{ fontSize: 11, color: C.textMuted }}>Attempts Made</p>
            </div>
            <div style={{ background: C.cardElevated, borderRadius: 10, padding: '12px 14px', border: `1px solid ${C.border}` }}>
              <p style={{ fontSize: 24, fontWeight: 700, color: address.served ? C.green : C.textPrimary }}>
                {address.served ? 'Yes' : 'No'}
              </p>
              <p style={{ fontSize: 11, color: C.textMuted }}>Served</p>
            </div>
          </div>

          {isVerified && (
            <span style={{ display: 'inline-block', marginTop: 12, fontSize: 11, fontWeight: 700, background: 'rgba(34,197,94,0.15)', color: C.green, border: '1px solid rgba(34,197,94,0.4)', borderRadius: 6, padding: '4px 12px' }}>
              VERIFIED
            </span>
          )}
        </div>
      )}

      {/* Action Buttons */}
      <div style={{ padding: '14px 16px' }}>
        {!address.served && (
          <button
            onClick={handleLogAttempt}
            style={{ width: '100%', height: 52, borderRadius: 12, background: 'rgba(249,115,22,0.20)', border: '1px solid rgba(249,115,22,0.50)', color: '#f97316', fontWeight: 700, fontSize: 15, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, cursor: 'pointer', marginBottom: 10 }}
          >
            <Zap style={{ width: 18, height: 18 }} />
            LOG ATTEMPT {nextAttemptNum}
          </button>
        )}

        <div style={{ display: 'flex', gap: 10, marginBottom: 10 }}>
          <button
            onClick={handleCaptureEvidence}
            style={{ flex: 1, height: 52, borderRadius: 12, background: 'rgba(229,185,225,0.12)', border: `1px solid rgba(229,185,225,0.35)`, color: C.accentPlum, fontWeight: 700, fontSize: 12, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 3, cursor: 'pointer' }}
          >
            <Camera style={{ width: 18, height: 18 }} />
            CAPTURE EVIDENCE
          </button>

          <button
            onClick={handleFinalizeService}
            style={{ flex: 1, height: 52, borderRadius: 12, background: 'rgba(34,197,94,0.15)', border: '1px solid rgba(34,197,94,0.40)', color: C.green, fontWeight: 700, fontSize: 12, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 3, cursor: 'pointer' }}
          >
            <CheckCircle style={{ width: 18, height: 18 }} />
            FINALIZE SERVICE
          </button>
        </div>

        <button
          onClick={handleNavigate}
          style={{ width: '100%', height: 48, borderRadius: 12, background: 'transparent', border: `1px solid ${C.border}`, color: C.accentGold, fontWeight: 600, fontSize: 14, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, cursor: 'pointer' }}
        >
          <Navigation style={{ width: 18, height: 18 }} />
          NAVIGATE
        </button>
      </div>
    </div>
  );
}
