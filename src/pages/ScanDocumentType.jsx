import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { ArrowLeft, Loader2, FolderPlus, Layers } from 'lucide-react';
import { 
  DOCUMENT_INFO, 
  checkForRecoverableSession,
  clearScanSession 
} from '@/components/scanning/ScanningService';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export default function ScanDocumentType() {
  const navigate = useNavigate();
  const [showRecoveryDialog, setShowRecoveryDialog] = useState(false);
  const [recoverableSession, setRecoverableSession] = useState(null);

  const { data: user, isLoading } = useQuery({
    queryKey: ['currentUser'],
    queryFn: () => base44.auth.me()
  });

  useEffect(() => {
    const session = checkForRecoverableSession();
    if (session) {
      setRecoverableSession(session);
      setShowRecoveryDialog(true);
    }
  }, []);

  const handleBulkScanTap = () => {
    navigate(createPageUrl('ScanCamera?type=serve&bulk=true'));
  };

  const handleSelectType = (documentType) => {
    navigate(createPageUrl(`ScanCamera?type=${documentType}`));
  };

  const handleResumeSession = () => {
    if (recoverableSession) {
      // Preserve bulk mode on resume — without this flag, Save Route jumps to
      // the standard ScanPreview screen instead of BulkScanOptimize.
      const bulkParam = recoverableSession.isBulk ? '&bulk=true' : '';
      if (recoverableSession.currentStep === 'scanning') {
        navigate(createPageUrl(`ScanCamera?sessionId=${recoverableSession.id}${bulkParam}`));
      } else if (recoverableSession.currentStep === 'preview') {
        navigate(createPageUrl(`ScanPreview?sessionId=${recoverableSession.id}`));
      } else if (recoverableSession.currentStep === 'route_setup') {
        // Bulk sessions route_setup step belongs to BulkScanOptimize, not ScanRouteSetup
        if (recoverableSession.isBulk) {
          navigate(createPageUrl(`BulkScanOptimize?sessionId=${recoverableSession.id}`));
        } else {
          navigate(createPageUrl(`ScanRouteSetup?sessionId=${recoverableSession.id}`));
        }
      }
    }
    setShowRecoveryDialog(false);
  };

  const handleStartFresh = () => {
    if (recoverableSession) {
      clearScanSession(recoverableSession.id);
    }
    setRecoverableSession(null);
    setShowRecoveryDialog(false);
  };

  const isBoss = user?.role === 'boss' || user?.role === 'admin';

  if (isLoading) {
    return (
      <div style={{ minHeight: '100vh', background: 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Loader2 className="w-8 h-8 animate-spin" style={{ color: '#e9c349' }} />
      </div>
    );
  }

  return (
    <div style={{ minHeight: '100vh', background: 'transparent' }} className="flex flex-col">
      {/* Header */}
      <div style={{ background: 'rgba(11,15,30,0.75)', backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)', borderBottom: '1px solid rgba(255,255,255,0.08)' }} className="px-4 py-3 flex items-center gap-3">
        <Link to={createPageUrl(isBoss ? 'BossDashboard' : 'WorkerHome')}>
          <Button variant="ghost" size="icon" style={{ color: '#e6e1e4' }}>
            <ArrowLeft className="w-5 h-5" />
          </Button>
        </Link>
        <h1 className="text-lg font-semibold" style={{ color: '#e6e1e4' }}>Scan Documents</h1>
      </div>

      <div className="flex-1 p-4 max-w-lg mx-auto w-full">
        <p className="mb-6 text-center" style={{ color: '#8a7f87' }}>
          What type of document are you scanning?
        </p>

        <div className="space-y-4">
          {/* Regular Scan card (Serve type under the hood) */}
          {(() => { const info = DOCUMENT_INFO['serve']; return (
            <div
              key="serve"
              className="cursor-pointer rounded-2xl p-4 transition-opacity hover:opacity-90"
              style={{ background: 'rgba(14,20,44,0.55)', backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)', border: '1px solid rgba(255,255,255,0.12)' }}
              onClick={() => handleSelectType('serve')}
            >
              <div className="flex items-center gap-3">
                <div className="text-3xl">{info.icon}</div>
                <div className="flex-1">
                  <div className="flex items-center justify-between">
                    <h3 className="text-lg font-semibold" style={{ color: '#e6e1e4' }}>Regular Scan</h3>
                    <p className="text-lg font-bold" style={{ color: '#22c55e' }}>${info.rate}</p>
                  </div>
                  <p className="text-xs" style={{ color: '#8a7f87' }}>{info.schedule} • {info.description}</p>
                </div>
              </div>
            </div>
          ); })()}

          {/* Bulk Scan card — TEST VERSION */}
          <div
            className="cursor-pointer rounded-2xl p-4 transition-opacity hover:opacity-90"
            style={{ background: 'rgba(14,20,44,0.55)', backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)', border: '1px solid rgba(233,195,73,0.35)' }}
            onClick={handleBulkScanTap}
          >
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-lg flex items-center justify-center" style={{ background: 'rgba(233,195,73,0.15)' }}>
                <Layers className="w-6 h-6" style={{ color: '#e9c349' }} />
              </div>
              <div className="flex-1">
                <h3 className="text-lg font-semibold" style={{ color: '#e9c349' }}>Bulk Scan</h3>
                <p className="text-xs" style={{ color: '#8a7f87' }}>Scan a large batch and sort into piles before saving</p>
              </div>
            </div>
          </div>

          {/* Garnishment and Posting cards — HIDDEN FOR NOW. Logic in ScanningService
              and ScanCamera remains intact; uncomment to restore entry points. */}
          {false && Object.entries(DOCUMENT_INFO).filter(([type]) => type !== 'serve').map(([type, info]) => (
            <div
              key={type}
              className="cursor-pointer rounded-2xl p-4 transition-opacity hover:opacity-90"
              style={{ background: 'rgba(14,20,44,0.55)', backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)', border: '1px solid rgba(255,255,255,0.12)' }}
              onClick={() => handleSelectType(type)}
            >
              <div className="flex items-center gap-3">
                <div className="text-3xl">{info.icon}</div>
                <div className="flex-1">
                  <div className="flex items-center justify-between">
                    <h3 className="text-lg font-semibold" style={{ color: '#e6e1e4' }}>{info.name}</h3>
                    <p className="text-lg font-bold" style={{ color: '#22c55e' }}>${info.rate}</p>
                  </div>
                  <p className="text-xs" style={{ color: '#8a7f87' }}>{info.schedule} • {info.description}</p>
                </div>
              </div>
            </div>
          ))}

          {/* Divider */}
          <div className="flex items-center gap-3 pt-2">
            <div className="flex-1 h-px bg-gray-200" />
            <span className="text-xs text-gray-400 font-medium">OR</span>
            <div className="flex-1 h-px bg-gray-200" />
          </div>

          {/* Add to Existing Route */}
          <div
            className="cursor-pointer rounded-2xl p-4 transition-opacity hover:opacity-90"
            style={{ background: 'rgba(14,20,44,0.55)', backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)', border: '1px solid rgba(99,102,241,0.35)', borderStyle: 'dashed' }}
            onClick={() => navigate(createPageUrl('ScanCamera?type=serve&mode=addToRoute'))}
          >
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-full flex items-center justify-center" style={{ background: 'rgba(99,102,241,0.15)' }}>
                <FolderPlus className="w-6 h-6" style={{ color: '#a5b4fc' }} />
              </div>
              <div className="flex-1">
                <h3 className="text-lg font-semibold" style={{ color: '#a5b4fc' }}>Add to Existing Route</h3>
                <p className="text-xs" style={{ color: '#8a7f87' }}>Scan addresses and add them to a route you already have</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Fixed Cancel Button at Bottom */}
      <div className="p-4 max-w-lg mx-auto w-full" style={{ borderTop: '1px solid rgba(255,255,255,0.08)', background: 'rgba(11,15,30,0.75)', backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)' }}>
        <Link to={createPageUrl(isBoss ? 'BossDashboard' : 'WorkerHome')}>
          <button className="w-full py-3 rounded-xl font-semibold transition-opacity hover:opacity-90" style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.12)', color: '#8a7f87' }}>
            Cancel
          </button>
        </Link>
      </div>

      {/* Session Recovery Dialog */}
      <Dialog open={showRecoveryDialog} onOpenChange={setShowRecoveryDialog}>
        <DialogContent style={{ background: 'rgba(11,15,30,0.97)', border: '1px solid rgba(255,255,255,0.12)', color: '#e6e1e4' }}>
          <DialogHeader>
            <DialogTitle style={{ color: '#e6e1e4' }}>Resume Previous Session?</DialogTitle>
            <DialogDescription style={{ color: '#8a7f87' }}>
              You have an unfinished scanning session.
            </DialogDescription>
          </DialogHeader>
          {recoverableSession && (
            <div className="py-4 space-y-2">
              <p className="flex items-center gap-2">
                <span>{DOCUMENT_INFO[recoverableSession.documentType]?.icon}</span>
                <span className="font-medium" style={{ color: '#e6e1e4' }}>
                  Type: {DOCUMENT_INFO[recoverableSession.documentType]?.name}
                </span>
              </p>
              <p style={{ color: '#8a7f87' }}>
                📍 Addresses scanned: {recoverableSession.addresses?.length || 0}
              </p>
              <p className="text-sm" style={{ color: '#6B7280' }}>
                🕐 Last activity: {new Date(recoverableSession.lastUpdated).toLocaleString()}
              </p>
            </div>
          )}
          <DialogFooter className="flex-col gap-2 sm:flex-col">
            <button
              onClick={handleResumeSession}
              className="w-full py-3 rounded-xl font-bold transition-opacity hover:opacity-90"
              style={{ background: 'rgba(233,195,73,0.20)', border: '1px solid rgba(233,195,73,0.50)', color: '#e9c349' }}
            >
              Resume Session
            </button>
            <button
              onClick={handleStartFresh}
              className="w-full py-3 rounded-xl font-semibold transition-opacity hover:opacity-90"
              style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.12)', color: '#8a7f87' }}
            >
              Start Fresh (discard previous)
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

    </div>
  );
}
