import React from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import { format } from 'date-fns';
import { Loader2, ChevronLeft, MapPin, Play, CheckCircle, Clock, Lock, FileCheck, AlertCircle, Tag } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

export default function WorkerRouteDetail() {
  const urlParams = new URLSearchParams(window.location.search);
  const routeId = urlParams.get('id') || urlParams.get('routeId');

  const { data: user } = useQuery({
    queryKey: ['currentUser'],
    queryFn: () => base44.auth.me()
  });

  const { data: route, isLoading: routeLoading } = useQuery({
    queryKey: ['route', routeId],
    queryFn: async () => {
      if (!routeId) return null;
      const routes = await base44.entities.Route.filter({ id: routeId });
      return routes[0] || null;
    },
    enabled: !!routeId
  });

  const { data: addresses = [], isLoading: addressesLoading } = useQuery({
    queryKey: ['routeAddresses', routeId],
    queryFn: async () => {
      if (!routeId) return [];
      return base44.entities.Address.filter({ route_id: routeId, deleted_at: null });
    },
    enabled: !!routeId
  });

  if (routeLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
      </div>
    );
  }

  if (!route) {
    return (
      <div className="min-h-screen bg-gray-50 p-4">
        <p className="text-center text-gray-500">Route not found</p>
      </div>
    );
  }

  const pendingAddresses = addresses.filter(a => !a.served);
  const servedAddresses = addresses.filter(a => a.served);

  return (
    <div className="min-h-screen bg-gray-50 pb-6">
      <header className="bg-blue-500 text-white px-4 py-3 flex items-center gap-3">
        <Link to={createPageUrl('WorkerRoutes')}>
          <ChevronLeft className="w-6 h-6" />
        </Link>
        <div>
          <h1 className="font-bold text-lg">{route.folder_name}</h1>
          <p className="text-sm text-blue-100">{route.description || 'No description'}</p>
        </div>
      </header>

      <main className="px-4 py-4 max-w-lg mx-auto">
        <div className="grid grid-cols-3 gap-3 mb-4">
          <Card>
            <CardContent className="p-3 text-center">
              <p className="text-2xl font-bold text-gray-900">{addresses.length}</p>
              <p className="text-xs text-gray-500">Total</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-3 text-center">
              <p className="text-2xl font-bold text-green-600">{servedAddresses.length}</p>
              <p className="text-xs text-gray-500">Served</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-3 text-center">
              <p className="text-2xl font-bold text-orange-600">{pendingAddresses.length}</p>
              <p className="text-xs text-gray-500">Pending</p>
            </CardContent>
          </Card>
        </div>

        <div className="flex items-center justify-between bg-white rounded-xl p-4 border border-gray-200 mb-4">
          <div>
            <p className="text-sm text-gray-500">Status</p>
            <span className={`text-sm font-semibold ${
              route.status === 'active' ? 'text-blue-600' :
              route.status === 'completed' ? 'text-green-600' :
              route.status === 'stalled' ? 'text-red-600' :
              'text-gray-600'
            }`}>
              {route.status.toUpperCase()}
            </span>
          </div>
          <div className="text-right">
            <p className="text-sm text-gray-500">Due Date</p>
            <p className="font-medium">
              {route.due_date ? format(new Date(route.due_date), 'MMM d, yyyy') : 'Not set'}
            </p>
          </div>
          {route.locked && (
            <div className="flex items-center gap-1 text-red-500">
              <Lock className="w-4 h-4" />
              <span className="text-xs">Locked</span>
            </div>
          )}
        </div>

        {route.status === 'assigned' && (
          <Button className="w-full bg-blue-500 hover:bg-blue-600 mb-4">
            <Play className="w-4 h-4 mr-2" /> Start Route
          </Button>
        )}

        <h2 className="text-lg font-semibold text-gray-900 mb-3">Addresses</h2>

        {addressesLoading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="w-6 h-6 animate-spin text-blue-500" />
          </div>
        ) : addresses.length === 0 ? (
          <div className="bg-gray-100 rounded-xl p-6 text-center">
            <MapPin className="w-8 h-8 text-gray-300 mx-auto mb-2" />
            <p className="text-gray-500 text-sm">No addresses in this route</p>
          </div>
        ) : (
          <div className="space-y-2">
            {addresses.map((address, index) => {
              const receiptStatus = address.receipt_status;
              const needsReceipt = !address.served && receiptStatus === 'pending';
              const receiptPending = receiptStatus === 'pending_review';
              const receiptApproved = receiptStatus === 'approved';
              const receiptNeedsRevision = receiptStatus === 'needs_revision';

              return (
                <div
                  key={address.id}
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
                      {address.served ? <CheckCircle className="w-4 h-4" /> : <span className="text-xs font-medium">{index + 1}</span>}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className={`text-sm font-medium ${address.served ? 'text-gray-500 line-through' : 'text-gray-900'}`}>
                        {address.normalized_address || address.legal_address}
                      </p>
                      <div className="flex items-center gap-2 mt-1 flex-wrap">
                        <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-600">
                          {address.serve_type}
                        </span>
                        {address.attempts_count > 0 && (
                          <span className="text-xs text-gray-500 flex items-center gap-1">
                            <Clock className="w-3 h-3" /> {address.attempts_count}
                          </span>
                        )}
                        {/* Receipt Status Badges */}
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
                      </div>

                      {/* Submit Receipt Button */}
                      {!address.served && (needsReceipt || receiptNeedsRevision) && (
                        <div className="mt-2">
                          <Link to={createPageUrl(`SubmitReceipt?addressId=${address.id}&routeId=${routeId}${address.latest_receipt_id && receiptNeedsRevision ? `&parentReceiptId=${address.latest_receipt_id}` : ''}`)}>
                            <Button 
                              size="sm" 
                              className={receiptNeedsRevision ? 'bg-orange-500 hover:bg-orange-600' : 'bg-blue-500 hover:bg-blue-600'}
                            >
                              <FileCheck className="w-3 h-3 mr-1" />
                              {receiptNeedsRevision ? 'Resubmit Receipt' : 'Submit Receipt'}
                            </Button>
                          </Link>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}