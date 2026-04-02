import React from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import { loadScanSession } from '@/components/scanning/ScanningService';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { ArrowLeft, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';

function PileBadge({ pileNumber, color = '#f97316' }) {
  return (
    <span
      className="text-white text-sm font-semibold px-3 py-1 rounded-full"
      style={{ backgroundColor: color }}
    >
      Pile {pileNumber}
    </span>
  );
}

export default function ScanSortReview() {
  const navigate = useNavigate();
  const urlParams = new URLSearchParams(window.location.search);
  const sessionId = urlParams.get('sessionId');

  const session = sessionId ? loadScanSession(sessionId) : null;

  if (!session) {
    navigate(createPageUrl('ScanDocumentType'));
    return null;
  }

  // Reverse to get scan order (oldest first = scan #1 at top)
  const orderedAddresses = [...session.addresses].reverse();
  const validCount = orderedAddresses.filter(a => a.extractedData?.street).length;
  const totalCount = orderedAddresses.length;

  const handleContinue = () => {
    if (validCount === 0) {
      toast.error('No addresses ready — go back and scan at least one document');
      return;
    }
    navigate(createPageUrl(`ScanRouteSetup?sessionId=${session.id}`));
  };

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      {/* Header */}
      <div className="bg-white border-b px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link to={createPageUrl(`ScanCamera?sessionId=${session.id}`)}>
            <Button variant="ghost" size="icon">
              <ArrowLeft className="w-5 h-5" />
            </Button>
          </Link>
          <div>
            <h1 className="text-lg font-semibold leading-tight">Sort Documents</h1>
          </div>
        </div>
        <span className="bg-gray-100 text-gray-700 text-sm font-medium px-3 py-1 rounded-full">
          {totalCount} document{totalCount !== 1 ? 's' : ''}
        </span>
      </div>

      {/* Summary strip */}
      <div className="bg-gray-100 border-b px-4 py-2">
        <p className="text-sm text-gray-600">
          Sort your physical stack into the piles shown below before continuing.
        </p>
      </div>

      {/* Address list */}
      <div className="flex-1 overflow-y-auto px-4 py-3">
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">
          Scan Order — Sort by Pile Number
        </p>

        <div className="space-y-2">
          {orderedAddresses.map((addr, index) => {
            const scanNumber = index + 1;
            const hasAddress = !!addr.extractedData?.street;

            if (!hasAddress) {
              return (
                <div
                  key={addr.tempId}
                  className="bg-amber-50 border border-amber-300 rounded-lg p-4 flex items-start gap-3"
                >
                  {/* Scan number badge - amber */}
                  <div className="flex-shrink-0 w-11 h-11 bg-amber-400 rounded-lg flex items-center justify-center">
                    <span className="text-white font-bold text-sm">{scanNumber}</span>
                  </div>

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 mb-1">
                      <AlertTriangle className="w-4 h-4 text-amber-500 flex-shrink-0" />
                      <span className="font-semibold text-amber-800 text-sm">Address not extracted</span>
                    </div>
                    <p className="text-amber-700 text-xs">Set aside — needs manual entry before saving</p>
                    {addr.ocrRawText && (
                      <p className="text-gray-500 text-xs italic mt-1 truncate">{addr.ocrRawText}</p>
                    )}
                  </div>

                  {/* No pile badge */}
                  <div className="flex-shrink-0">
                    <span className="text-amber-600 text-xs font-semibold">⚠ Set Aside</span>
                  </div>
                </div>
              );
            }

            const docType = addr.extractedData?.documentType || session.documentType;
            const docTypeStyle =
              docType === 'garnishment' ? 'bg-purple-100 text-purple-700' :
              docType === 'posting' ? 'bg-green-100 text-green-700' :
              'bg-blue-100 text-blue-700';

            return (
              <Card key={addr.tempId} className="bg-white border shadow-sm">
                <CardContent className="p-4">
                  <div className="flex items-center gap-3">
                    {/* Scan number badge - orange */}
                    <div className="flex-shrink-0 w-11 h-11 bg-orange-500 rounded-lg flex items-center justify-center">
                      <span className="text-white font-bold text-sm">{scanNumber}</span>
                    </div>

                    {/* Address content */}
                    <div className="flex-1 min-w-0">
                      {addr.defendantName && (
                        <p className="text-xs text-gray-500 mb-0.5">{addr.defendantName}</p>
                      )}
                      <p className="font-bold text-sm text-gray-900 leading-tight">
                        {addr.extractedData.street.toUpperCase()}
                      </p>
                      <p className="text-sm text-gray-900">
                        {addr.extractedData.city?.toUpperCase()}, {addr.extractedData.state?.toUpperCase()} {addr.extractedData.zip}
                      </p>
                      <span className={`inline-block mt-1 text-xs px-2 py-0.5 rounded-full ${docTypeStyle}`}>
                        {docType.charAt(0).toUpperCase() + docType.slice(1)}
                      </span>
                    </div>

                    {/* Pile badge */}
                    <div className="flex-shrink-0">
                      <PileBadge pileNumber={1} color="#f97316" />
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </div>

      {/* Fixed bottom bar */}
      <div className="bg-white border-t p-4">
        <p className="text-xs text-gray-500 text-center mb-2">
          {validCount} of {totalCount} ready to sort
        </p>
        <Button
          className="w-full h-12 text-base bg-orange-500 hover:bg-orange-600 text-white"
          onClick={handleContinue}
          disabled={validCount === 0}
        >
          Looks Good — Continue to Route Setup →
        </Button>
      </div>
    </div>
  );
}