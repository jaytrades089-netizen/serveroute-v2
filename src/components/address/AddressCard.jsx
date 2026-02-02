import React from 'react';
import { Link } from 'react-router-dom';
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
  Navigation
} from 'lucide-react';

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
  onMessageBoss 
}) {
  const formatted = formatAddress(address);
  const receiptStatus = address.receipt_status;
  const needsReceipt = !address.served && receiptStatus === 'pending';
  const receiptPending = receiptStatus === 'pending_review';
  const receiptApproved = receiptStatus === 'approved';
  const receiptNeedsRevision = receiptStatus === 'needs_revision';

  const getServeTypeBadge = () => {
    const type = address.serve_type || 'serve';
    const colors = {
      serve: 'bg-blue-100 text-blue-700',
      garnishment: 'bg-purple-100 text-purple-700',
      posting: 'bg-green-100 text-green-700'
    };
    return (
      <span className={`text-xs px-2 py-0.5 rounded-full ${colors[type] || colors.serve}`}>
        {type.charAt(0).toUpperCase() + type.slice(1)}
      </span>
    );
  };

  const handleNavigate = () => {
    const addressStr = `${formatted.line1}, ${formatted.line2}`;
    const encoded = encodeURIComponent(addressStr);
    window.open(`https://www.google.com/maps/dir/?api=1&destination=${encoded}`, '_blank');
  };

  return (
    <div
      className={`bg-white border rounded-xl p-3 ${
        address.served ? 'border-green-200 bg-green-50' : 
        receiptNeedsRevision ? 'border-orange-200 bg-orange-50' :
        'border-gray-200'
      }`}
    >
      <div className="flex items-start gap-3">
        <div className={`w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 ${
          address.served ? 'bg-green-500 text-white' : 'bg-gray-200 text-gray-600'
        }`}>
          {address.served ? (
            <CheckCircle className="w-4 h-4" />
          ) : (
            <span className="text-xs font-medium">{index + 1}</span>
          )}
        </div>
        
        <div className="flex-1 min-w-0">
          {/* Address Display - 2 lines, ALL CAPS */}
          <p className={`text-sm font-bold ${address.served ? 'text-gray-500 line-through' : 'text-gray-900'}`}>
            {formatted.line1}
          </p>
          <p className={`text-sm ${address.served ? 'text-gray-400' : 'text-gray-700'}`}>
            {formatted.line2}
          </p>

          {/* Badges Row */}
          <div className="flex items-center gap-2 mt-2 flex-wrap">
            {getServeTypeBadge()}
            
            {address.attempts_count > 0 && (
              <span className="text-xs text-gray-500 flex items-center gap-1">
                <Clock className="w-3 h-3" /> {address.attempts_count}
              </span>
            )}
            
            {receiptPending && (
              <Badge className="bg-yellow-100 text-yellow-700 text-xs">
                <Clock className="w-3 h-3 mr-1" />
                Pending Review
              </Badge>
            )}
            {receiptApproved && (
              <Badge className="bg-green-100 text-green-700 text-xs">
                <FileCheck className="w-3 h-3 mr-1" />
                Approved
              </Badge>
            )}
            {receiptNeedsRevision && (
              <Badge className="bg-orange-100 text-orange-700 text-xs">
                <AlertCircle className="w-3 h-3 mr-1" />
                Needs Revision
              </Badge>
            )}
            {address.has_dcn && (
              <Badge className="bg-purple-100 text-purple-700 text-xs">
                <Tag className="w-3 h-3 mr-1" />
                DCN
              </Badge>
            )}
            {address.has_question && (
              <Badge className="bg-blue-100 text-blue-700 text-xs">
                <MessageCircle className="w-3 h-3 mr-1" />
                Question
              </Badge>
            )}
          </div>

          {/* Action Buttons */}
          {showActions && !address.served && (
            <div className="flex items-center gap-2 mt-3 flex-wrap">
              <Button
                size="sm"
                variant="outline"
                className="h-8 text-xs"
                onClick={handleNavigate}
              >
                <Navigation className="w-3 h-3 mr-1" />
                Navigate
              </Button>
              
              {(needsReceipt || receiptNeedsRevision) && (
                <Link to={createPageUrl(`SubmitReceipt?addressId=${address.id}&routeId=${routeId}${address.latest_receipt_id && receiptNeedsRevision ? `&parentReceiptId=${address.latest_receipt_id}` : ''}`)}>
                  <Button 
                    size="sm" 
                    className={`h-8 text-xs ${receiptNeedsRevision ? 'bg-orange-500 hover:bg-orange-600' : 'bg-blue-500 hover:bg-blue-600'}`}
                  >
                    <FileCheck className="w-3 h-3 mr-1" />
                    {receiptNeedsRevision ? 'Resubmit' : 'Receipt'}
                  </Button>
                </Link>
              )}
              
              {onMessageBoss && (
                <Button
                  size="sm"
                  variant="outline"
                  className="h-8 text-xs"
                  onClick={() => onMessageBoss(address)}
                >
                  <MessageCircle className="w-3 h-3 mr-1" />
                  Message Boss
                </Button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}