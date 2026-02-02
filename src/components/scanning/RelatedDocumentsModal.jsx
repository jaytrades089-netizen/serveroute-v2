import React from 'react';
import { Link } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { MapPin, FileText, ExternalLink } from 'lucide-react';
import { DOCUMENT_INFO, PAY_RATES } from './ScanningService';

export default function RelatedDocumentsModal({ 
  open, 
  onOpenChange, 
  address, 
  relatedAddresses = [],
  routes = [],
  currentRouteId = null
}) {
  if (!address) return null;

  // Group addresses by route
  const groupedByRoute = relatedAddresses.reduce((acc, addr) => {
    const routeId = addr.route_id || 'unassigned';
    if (!acc[routeId]) {
      acc[routeId] = [];
    }
    acc[routeId].push(addr);
    return acc;
  }, {});

  const getRouteName = (routeId) => {
    if (routeId === 'unassigned') return 'Address Pool';
    const route = routes.find(r => r.id === routeId);
    return route?.folder_name || 'Unknown Route';
  };

  const getRouteStatus = (routeId) => {
    const route = routes.find(r => r.id === routeId);
    return route?.status;
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Related Documents</DialogTitle>
          <DialogDescription className="flex items-center gap-2">
            <MapPin className="w-4 h-4" />
            {address.normalized_address || address.extractedData?.fullAddress}
          </DialogDescription>
        </DialogHeader>

        <div className="py-4 space-y-4">
          {/* Current address if applicable */}
          {currentRouteId && (
            <div>
              <p className="text-sm font-medium text-gray-500 mb-2">CURRENT ROUTE</p>
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                <div className="flex items-center gap-2">
                  <span className="text-lg">
                    {DOCUMENT_INFO[address.serve_type]?.icon || '📄'}
                  </span>
                  <div className="flex-1">
                    <p className="font-medium">{address.serve_type}</p>
                    {address.defendant_name && (
                      <p className="text-sm text-gray-600">{address.defendant_name}</p>
                    )}
                  </div>
                  <Badge className="bg-blue-100 text-blue-700">
                    ${PAY_RATES[address.serve_type] || 0}
                  </Badge>
                </div>
              </div>
            </div>
          )}

          {/* Other routes */}
          {Object.keys(groupedByRoute).length > 0 ? (
            <div>
              <p className="text-sm font-medium text-gray-500 mb-2">OTHER DOCUMENTS</p>
              <div className="space-y-3">
                {Object.entries(groupedByRoute).map(([routeId, addresses]) => (
                  <div key={routeId} className="border rounded-lg overflow-hidden">
                    <div className="bg-gray-50 px-3 py-2 flex items-center justify-between">
                      <span className="font-medium text-sm">{getRouteName(routeId)}</span>
                      {routeId !== 'unassigned' && (
                        <Link to={createPageUrl(`WorkerRouteDetail?routeId=${routeId}`)}>
                          <Button variant="ghost" size="sm" className="h-6 px-2 text-xs">
                            View <ExternalLink className="w-3 h-3 ml-1" />
                          </Button>
                        </Link>
                      )}
                    </div>
                    <div className="p-2 space-y-2">
                      {addresses.map((addr) => (
                        <div 
                          key={addr.id} 
                          className="flex items-center gap-2 p-2 bg-white rounded border"
                        >
                          <span className="text-lg">
                            {DOCUMENT_INFO[addr.serve_type]?.icon || '📄'}
                          </span>
                          <div className="flex-1 min-w-0">
                            <p className="font-medium text-sm">{addr.serve_type}</p>
                            {addr.defendant_name && (
                              <p className="text-xs text-gray-500 truncate">
                                {addr.defendant_name}
                              </p>
                            )}
                            <div className="flex items-center gap-2 mt-1">
                              <Badge 
                                variant="outline" 
                                className={`text-xs ${
                                  addr.status === 'served' 
                                    ? 'bg-green-50 text-green-700' 
                                    : addr.status === 'pending'
                                    ? 'bg-yellow-50 text-yellow-700'
                                    : 'bg-gray-50'
                                }`}
                              >
                                {addr.status}
                              </Badge>
                            </div>
                          </div>
                          <Badge className="bg-green-100 text-green-700">
                            ${PAY_RATES[addr.serve_type] || addr.pay_rate || 0}
                          </Badge>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="text-center py-6 text-gray-500">
              <FileText className="w-10 h-10 mx-auto mb-2 opacity-50" />
              <p>No other documents at this address</p>
            </div>
          )}

          {/* Tip */}
          {Object.keys(groupedByRoute).length > 0 && (
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-sm text-blue-800">
              <p className="font-medium">💡 TIP</p>
              <p>When you visit this address, you can serve all documents at once for maximum efficiency!</p>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}