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

  const handleSelectType = (documentType) => {
    navigate(createPageUrl(`ScanCamera?type=${documentType}`));
  };

  const handleResumeSession = () => {
    if (recoverableSession) {
      if (recoverableSession.currentStep === 'scanning') {
        navigate(createPageUrl(`ScanCamera?sessionId=${recoverableSession.id}`));
      } else if (recoverableSession.currentStep === 'preview') {
        navigate(createPageUrl(`ScanPreview?sessionId=${recoverableSession.id}`));
      } else if (recoverableSession.currentStep === 'route_setup') {
        navigate(createPageUrl(`ScanRouteSetup?sessionId=${recoverableSession.id}`));
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
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      {/* Header */}
      <div className="bg-white border-b px-4 py-3 flex items-center gap-3">
        <Link to={createPageUrl(isBoss ? 'BossDashboard' : 'WorkerHome')}>
          <Button variant="ghost" size="icon">
            <ArrowLeft className="w-5 h-5" />
          </Button>
        </Link>
        <h1 className="text-lg font-semibold">Scan Documents</h1>
      </div>

      <div className="flex-1 p-4 max-w-lg mx-auto w-full">
        <p className="text-gray-600 mb-6 text-center">
          What type of document are you scanning?
        </p>

        <div className="space-y-4">
          {/* Part 1: Serve card */}
          {(() => { const info = DOCUMENT_INFO['serve']; return (
            <Card
              key="serve"
              className="cursor-pointer hover:shadow-md transition-shadow border-2 hover:border-blue-300"
              onClick={() => handleSelectType('serve')}
            >
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <div className="text-3xl">{info.icon}</div>
                  <div className="flex-1">
                    <div className="flex items-center justify-between">
                      <h3 className="text-lg font-semibold">{info.name}</h3>
                      <p className="text-lg font-bold text-green-600">${info.rate}</p>
                    </div>
                    <p className="text-xs text-gray-500">{info.schedule} • {info.description}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          ); })()}

          {/* Part 2: Bulk Scan card */}
          <Card
            className="cursor-pointer hover:shadow-md transition-shadow border-2 border-orange-300 hover:border-orange-500 bg-orange-50/50"
            onClick={() => navigate(createPageUrl('ScanCamera?type=serve'))}
          >
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-lg bg-orange-100 flex items-center justify-center">
                  <Layers className="w-6 h-6 text-orange-600" />
                </div>
                <div className="flex-1">
                  <h3 className="text-lg font-semibold text-orange-800">Bulk Scan</h3>
                  <p className="text-xs text-gray-500">Scan a large batch and sort into piles before saving</p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Part 3: Garnishment and Posting cards */}
          {Object.entries(DOCUMENT_INFO).filter(([type]) => type !== 'serve').map(([type, info]) => (
            <Card
              key={type}
              className="cursor-pointer hover:shadow-md transition-shadow border-2 hover:border-blue-300"
              onClick={() => handleSelectType(type)}
            >
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <div className="text-3xl">{info.icon}</div>
                  <div className="flex-1">
                    <div className="flex items-center justify-between">
                      <h3 className="text-lg font-semibold">{info.name}</h3>
                      <p className="text-lg font-bold text-green-600">${info.rate}</p>
                    </div>
                    <p className="text-xs text-gray-500">{info.schedule} • {info.description}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}

          {/* Divider */}
          <div className="flex items-center gap-3 pt-2">
            <div className="flex-1 h-px bg-gray-200" />
            <span className="text-xs text-gray-400 font-medium">OR</span>
            <div className="flex-1 h-px bg-gray-200" />
          </div>

          {/* Add to Existing Route */}
          <Card 
            className="cursor-pointer hover:shadow-md transition-shadow border-2 border-dashed border-blue-300 hover:border-blue-500 bg-blue-50/50"
            onClick={() => navigate(createPageUrl('ScanCamera?type=serve&mode=addToRoute'))}
          >
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-full bg-blue-100 flex items-center justify-center">
                  <FolderPlus className="w-6 h-6 text-blue-600" />
                </div>
                <div className="flex-1">
                  <h3 className="text-lg font-semibold text-blue-800">Add to Existing Route</h3>
                  <p className="text-xs text-gray-500">Scan addresses and add them to a route you already have</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Fixed Cancel Button at Bottom */}
      <div className="bg-white border-t p-4 max-w-lg mx-auto w-full">
        <Link to={createPageUrl(isBoss ? 'BossDashboard' : 'WorkerHome')}>
          <Button variant="outline" className="w-full">
            Cancel
          </Button>
        </Link>
      </div>

      {/* Session Recovery Dialog */}
      <Dialog open={showRecoveryDialog} onOpenChange={setShowRecoveryDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Resume Previous Session?</DialogTitle>
            <DialogDescription>
              You have an unfinished scanning session.
            </DialogDescription>
          </DialogHeader>
          
          {recoverableSession && (
            <div className="py-4 space-y-2">
              <p className="flex items-center gap-2">
                <span>{DOCUMENT_INFO[recoverableSession.documentType]?.icon}</span>
                <span className="font-medium">
                  Type: {DOCUMENT_INFO[recoverableSession.documentType]?.name}
                </span>
              </p>
              <p className="text-gray-600">
                📍 Addresses scanned: {recoverableSession.addresses?.length || 0}
              </p>
              <p className="text-gray-500 text-sm">
                🕐 Last activity: {new Date(recoverableSession.lastUpdated).toLocaleString()}
              </p>
            </div>
          )}

          <DialogFooter className="flex-col gap-2 sm:flex-col">
            <Button onClick={handleResumeSession} className="w-full">
              Resume Session
            </Button>
            <Button variant="outline" onClick={handleStartFresh} className="w-full">
              Start Fresh (discard previous)
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}