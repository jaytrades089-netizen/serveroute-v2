import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import { loadScanSession, saveScanSession } from '@/components/scanning/ScanningService';
import { autoSplitRoutes } from '@/components/services/OptimizationService';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { ArrowLeft, Layers, Clock, Loader2, AlertCircle, CheckCircle, Save } from 'lucide-react';
import { toast } from 'sonner';

const BULK_SAVE_KEY = 'bulk_scan_saved_session';

export function saveBulkSession(session) {
  localStorage.setItem(BULK_SAVE_KEY, JSON.stringify({
    ...session,
    savedAt: new Date().toISOString()
  }));
}

export function loadSavedBulkSession() {
  const data = localStorage.getItem(BULK_SAVE_KEY);
  if (!data) return null;
  try { return JSON.parse(data); } catch { return null; }
}

export function clearSavedBulkSession() {
  localStorage.removeItem(BULK_SAVE_KEY);
}

const TIME_OPTIONS = [
  { label: '2h', minutes: 120 },
  { label: '2.5h', minutes: 150 },
  { label: '3h', minutes: 180 },
  { label: '3.5h', minutes: 210 },
  { label: '4h', minutes: 240 },
];

const PILE_COLORS = ['bg-orange-500', 'bg-blue-500', 'bg-green-500', 'bg-purple-500'];
const PILE_TEXT_COLORS = ['text-orange-700', 'text-blue-700', 'text-green-700', 'text-purple-700'];
const PILE_BG_COLORS = ['bg-orange-50 border-orange-200', 'bg-blue-50 border-blue-200', 'bg-green-50 border-green-200', 'bg-purple-50 border-purple-200'];

function formatMinutes(mins) {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (h === 0) return `~${m} min`;
  if (m === 0) return `~${h} hr`;
  return `~${h} hr ${m} min`;
}

export default function BulkScanOptimize() {
  const navigate = useNavigate();
  const urlParams = new URLSearchParams(window.location.search);
  const sessionId = urlParams.get('sessionId');

  const [session, setSession] = useState(null);
  const [selectedMinutes, setSelectedMinutes] = useState(210);
  const [isOptimizing, setIsOptimizing] = useState(false);
  const [result, setResult] = useState(null);
  const [showResult, setShowResult] = useState(false);

  useEffect(() => {
    if (!sessionId) {
      navigate(createPageUrl('ScanDocumentType'));
      return;
    }
    const s = loadScanSession(sessionId);
    if (!s) {
      navigate(createPageUrl('ScanDocumentType'));
      return;
    }
    setSession(s);
  }, [sessionId]);

  const { data: user } = useQuery({
    queryKey: ['currentUser'],
    queryFn: () => base44.auth.me(),
  });

  const { data: userSettings } = useQuery({
    queryKey: ['userSettings', user?.id],
    queryFn: async () => {
      if (!user?.id) return null;
      const settings = await base44.entities.UserSettings.filter({ user_id: user.id });
      return settings[0] || null;
    },
    enabled: !!user?.id,
  });

  const apiKey = userSettings?.mapquest_api_key || null;

  const validAddresses = session
    ? session.addresses.filter(
        (a) => (a.status === 'extracted' || a.status === 'resolved') && a.extractedData?.street
      )
    : [];

  const handleOptimize = async () => {
    if (!session || isOptimizing) return;
    setIsOptimizing(true);
    setShowResult(false);
    setResult(null);

    try {
      const res = await autoSplitRoutes(validAddresses, selectedMinutes, apiKey, 2);

      if (!res) {
        toast.error('Optimization failed — check your connection and try again');
        return;
      }

      if (res.singleRoute) {
        toast.success('All addresses fit in one route');
        navigate(createPageUrl(`ScanRouteSetup?sessionId=${session.id}`));
        return;
      }

      // Write pile_number back to session addresses
      const updatedAddresses = session.addresses.map((addr) => {
        let pile = addr.pile_number || null;
        res.groups.forEach((group, idx) => {
          if (group.addresses.some((a) => a.tempId === addr.tempId)) {
            pile = idx + 1;
          }
        });
        return { ...addr, pile_number: pile };
      });

      const updatedSession = { ...session, addresses: updatedAddresses, lastUpdated: new Date().toISOString() };
      saveScanSession(updatedSession);
      setSession(updatedSession);
      setResult(res);
      setShowResult(true);
    } finally {
      setIsOptimizing(false);
    }
  };

  const handleLooksGood = () => {
    navigate(createPageUrl(`ScanSortReview?sessionId=${session.id}`));
  };

  const handleSaveScans = () => {
    if (!session) return;
    saveBulkSession(session);
    toast.success(`${validAddresses.length} scanned addresses saved — reload anytime from Bulk Scan`);
  };

  if (!session) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-orange-500" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      {/* Header */}
      <div className="bg-white border-b px-4 py-3 flex items-center gap-3">
        <Link to={createPageUrl(`ScanCamera?type=serve&bulk=true&sessionId=${session.id}`)}>
          <Button variant="ghost" size="icon">
            <ArrowLeft className="w-5 h-5" />
          </Button>
        </Link>
        <h1 className="text-lg font-semibold">Route Optimizer</h1>
      </div>

      {/* Body */}
      <div className="flex-1 p-4 max-w-lg mx-auto w-full pb-32">
        {/* Summary card */}
        <Card className="bg-white border">
          <CardContent className="p-4 flex items-start gap-3">
            <div className="w-10 h-10 rounded-lg bg-orange-100 flex items-center justify-center flex-shrink-0">
              <Layers className="w-5 h-5 text-orange-600" />
            </div>
            <div>
              <p className="font-semibold text-gray-900">
                {validAddresses.length} address{validAddresses.length !== 1 ? 'es' : ''} scanned and ready
              </p>
              <p className="text-xs text-gray-500 mt-0.5">
                Set your time limit per route, then tap Optimize
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Time limit selector */}
        <div className="mt-6">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-0.5">
            MAX TIME PER ROUTE
          </p>
          <p className="text-xs text-gray-400 mb-3 flex items-center gap-1">
            <Clock className="w-3 h-3" />
            Including 2 min per stop for door time
          </p>
          <div className="grid grid-cols-5 gap-2">
            {TIME_OPTIONS.map((opt) => (
              <Button
                key={opt.minutes}
                variant={selectedMinutes === opt.minutes ? 'default' : 'outline'}
                className={`h-12 text-sm font-semibold ${selectedMinutes === opt.minutes ? 'bg-orange-500 hover:bg-orange-600 border-orange-500' : ''}`}
                onClick={() => setSelectedMinutes(opt.minutes)}
              >
                {opt.label}
              </Button>
            ))}
          </div>
        </div>

        {/* API key warning or Optimize button */}
        <div className="mt-6">
          {!apiKey ? (
            <Card className="bg-amber-50 border-amber-200">
              <CardContent className="p-4 flex items-start gap-3">
                <AlertCircle className="w-5 h-5 text-amber-500 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="font-semibold text-amber-800 text-sm">MapQuest API key required</p>
                  <p className="text-xs text-amber-700 mt-0.5">
                    Add it in{' '}
                    <Link to={createPageUrl('WorkerSettings')} className="underline font-medium">
                      Settings
                    </Link>{' '}
                    to enable route optimization.
                  </p>
                </div>
              </CardContent>
            </Card>
          ) : !isOptimizing && !showResult ? (
            <Button
              className="w-full h-12 text-base bg-orange-500 hover:bg-orange-600 text-white"
              onClick={handleOptimize}
              disabled={validAddresses.length === 0}
            >
              Optimize Routes
            </Button>
          ) : null}
        </div>

        {/* Loading state */}
        {isOptimizing && (
          <div className="mt-8 flex flex-col items-center gap-3">
            <Loader2 className="w-8 h-8 animate-spin text-orange-500" />
            <p className="text-sm text-gray-600">Analyzing {validAddresses.length} addresses...</p>
          </div>
        )}

        {/* Result cards */}
        {showResult && result && (
          <div className="mt-6">
            <div className="flex items-center gap-2 mb-3">
              <CheckCircle className="w-5 h-5 text-green-600" />
              <p className="font-semibold text-gray-900">
                {result.groups.length} route{result.groups.length !== 1 ? 's' : ''} found
              </p>
            </div>

            <div className="space-y-3">
              {result.groups.map((group, idx) => {
                const colorIdx = Math.min(idx, PILE_COLORS.length - 1);
                return (
                  <Card key={idx} className={`border ${PILE_BG_COLORS[colorIdx]}`}>
                    <CardContent className="p-4 flex items-center gap-3">
                      <div className={`w-3 h-3 rounded-full flex-shrink-0 ${PILE_COLORS[colorIdx]}`} />
                      <div className="flex-1">
                        <p className={`font-semibold text-sm ${PILE_TEXT_COLORS[colorIdx]}`}>
                          Pile {idx + 1}
                        </p>
                        <p className="text-xs text-gray-600">
                          {group.addresses.length} address{group.addresses.length !== 1 ? 'es' : ''}
                        </p>
                      </div>
                      <p className="text-sm font-medium text-gray-700">
                        {formatMinutes(group.estimatedMinutes || 0)}
                      </p>
                    </CardContent>
                  </Card>
                );
              })}
            </div>

            {!result.allUnderLimit && (
              <Card className="mt-3 bg-amber-50 border-amber-200">
                <CardContent className="p-4 flex items-start gap-3">
                  <AlertCircle className="w-5 h-5 text-amber-500 flex-shrink-0 mt-0.5" />
                  <p className="text-sm text-amber-800">
                    Some routes may exceed your time limit. Proceed anyway?
                  </p>
                </CardContent>
              </Card>
            )}
          </div>
        )}
      </div>

      {/* Fixed bottom bar — always visible once session loaded */}
      <div className="fixed bottom-0 left-0 right-0 bg-white border-t p-4">
        <div className="max-w-lg mx-auto flex gap-3">
          {showResult ? (
            <>
              <Button
                variant="outline"
                className="flex-1"
                onClick={() => setShowResult(false)}
              >
                Re-optimize
              </Button>
              <Button
                variant="outline"
                className="flex items-center gap-1 px-3"
                onClick={handleSaveScans}
                title="Save scanned addresses so you can reload them next time"
              >
                <Save className="w-4 h-4" />
              </Button>
              <Button
                className="flex-1 bg-orange-500 hover:bg-orange-600 text-white"
                onClick={handleLooksGood}
              >
                Sort Documents →
              </Button>
            </>
          ) : (
            <Button
              variant="outline"
              className="flex items-center gap-2"
              onClick={handleSaveScans}
              disabled={validAddresses.length === 0}
            >
              <Save className="w-4 h-4" />
              Save Scans ({validAddresses.length})
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
