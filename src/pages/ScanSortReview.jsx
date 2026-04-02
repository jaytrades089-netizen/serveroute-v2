import React from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import { loadScanSession } from '@/components/scanning/ScanningService';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { ArrowLeft, AlertTriangle } from 'lucide-react';

const PILE_BADGE_STYLES = {
  1: 'bg-orange-500 text-white',
  2: 'bg-blue-500 text-white',
  3: 'bg-green-600 text-white',
};

function getPileBadgeStyle(pileNumber) {
  if (!pileNumber) return 'bg-amber-400 text-white';
  if (pileNumber <= 3) return PILE_BADGE_STYLES[pileNumber];
  return 'bg-purple-600 text-white';
}

function getPileLabel(pileNumber) {
  if (!pileNumber) return 'Set Aside';
  return `Pile ${pileNumber}`;
}

const DOC_TYPE_STYLES = {
  serve: 'bg-blue-100 text-blue-700',
  garnishment: 'bg-purple-100 text-purple-700',
  posting: 'bg-green-100 text-green-700',
};

export default function ScanSortReview() {
  const navigate = useNavigate();
  const urlParams = new URLSearchParams(window.location.search);
  const sessionId = urlParams.get('sessionId');

  const session = sessionId ? loadScanSession(sessionId) : null;

  if (!session) {
    navigate(createPageUrl('ScanDocumentType'));
    return null;
  }

  const orderedAddresses = [...session.addresses].reverse();
  const totalCount = orderedAddresses.length;
  const assignedCount = orderedAddresses.filter(a => a.pile_number).length;

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      {/* Header */}
      <div className="bg-white border-b px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link to={createPageUrl(`BulkScanOptimize?sessionId=${session.id}`)}>
            <Button variant="ghost" size="icon">
              <ArrowLeft className="w-5 h-5" />
            </Button>
          </Link>
          <h1 className="text-lg font-semibold">Sort Documents</h1>
        </div>
        <span className="bg-gray-100 text-gray-700 text-sm font-medium px-3 py-1 rounded-full">
          {totalCount} doc{totalCount !== 1 ? 's' : ''}
        </span>
      </div>

      {/* Instruction strip */}
      <div className="bg-gray-100 border-b px-4 py-3">
        <p className="text-sm text-gray-600">
          Sort your physical stack using the pile numbers below before continuing.
        </p>
      </div>

      {/* Scrollable list */}
      <div className="flex-1 overflow-y-auto px-4 py-3 pb-32">
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">
          Scan Order — Sort by Pile
        </p>

        <div className="space-y-2">
          {orderedAddresses.map((addr, index) => {
            const scanNumber = index + 1;
            const isFailed = addr.status === 'failed' || (!addr.extractedData?.street && !addr.manualEntry);

            if (isFailed) {
              return (
                <div
                  key={addr.tempId}
                  className="bg-amber-50 border border-amber-300 rounded-lg p-3 flex items-center gap-3 min-h-[60px]"
                >
                  {/* Scan number badge */}
                  <div className="flex-shrink-0 w-11 h-11 bg-amber-400 rounded-lg flex items-center justify-center">
                    <span className="text-white font-bold text-sm">{scanNumber}</span>
                  </div>

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 mb-0.5">
                      <AlertTriangle className="w-4 h-4 text-amber-500 flex-shrink-0" />
                      <span className="font-semibold text-amber-800 text-sm">Address not extracted</span>
                    </div>
                    {addr.manualEntry ? (
                      <p className="text-gray-600 text-xs italic">{addr.manualEntry}</p>
                    ) : (
                      <p className="text-amber-700 text-xs">Set aside — needs manual entry</p>
                    )}
                  </div>

                  {/* Pile badge */}
                  <span className="flex-shrink-0 px-3 py-1 rounded-full text-sm font-semibold bg-amber-400 text-white">
                    Set Aside
                  </span>
                </div>
              );
            }

            const docType = addr.extractedData?.documentType || session.documentType;
            const docTypeStyle = DOC_TYPE_STYLES[docType] || DOC_TYPE_STYLES.serve;
            const pileBadgeStyle = getPileBadgeStyle(addr.pile_number);
            const pileLabel = getPileLabel(addr.pile_number);

            return (
              <Card key={addr.tempId} className="bg-white border shadow-sm">
                <CardContent className="p-3">
                  <div className="flex items-center gap-3 min-h-[44px]">
                    {/* Scan number badge */}
                    <div className="flex-shrink-0 w-11 h-11 bg-gray-200 rounded-lg flex items-center justify-center">
                      <span className="text-gray-700 font-bold text-sm">{scanNumber}</span>
                    </div>

                    {/* Address content */}
                    <div className="flex-1 min-w-0">
                      {addr.defendantName && (
                        <p className="text-xs text-gray-500 mb-0.5 truncate">{addr.defendantName}</p>
                      )}
                      <p className="font-bold text-sm text-gray-900 leading-tight truncate">
                        {addr.extractedData.street.toUpperCase()}
                      </p>
                      <p className="text-sm text-gray-700 truncate">
                        {addr.extractedData.city?.toUpperCase()}{addr.extractedData.city ? ', ' : ''}
                        {addr.extractedData.state?.toUpperCase()} {addr.extractedData.zip}
                      </p>
                      <span className={`inline-block mt-1 text-xs px-2 py-0.5 rounded-full ${docTypeStyle}`}>
                        {docType.charAt(0).toUpperCase() + docType.slice(1)}
                      </span>
                    </div>

                    {/* Pile badge */}
                    <span className={`flex-shrink-0 px-3 py-1 rounded-full text-sm font-semibold ${pileBadgeStyle}`}>
                      {pileLabel}
                    </span>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </div>

      {/* Fixed bottom bar */}
      <div className="fixed bottom-0 left-0 right-0 bg-white border-t p-4">
        <p className="text-xs text-gray-500 text-center mb-2">
          {assignedCount} of {totalCount} addresses assigned to piles
        </p>
        <Button
          className="w-full h-12 text-base bg-orange-500 hover:bg-orange-600 text-white"
          onClick={() => navigate(createPageUrl(`BulkRouteSetup?sessionId=${session.id}`))}
        >
          Piles Sorted — Set Up Routes →
        </Button>
      </div>
    </div>
  );
}