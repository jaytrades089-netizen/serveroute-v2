import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import { DragDropContext, Droppable, Draggable } from '@hello-pangea/dnd';
import { format } from 'date-fns';
import { 
  ArrowLeft, 
  Loader2, 
  Plus, 
  GripVertical, 
  X, 
  MapPin,
  Clock,
  DollarSign,
  CheckCircle,
  AlertTriangle
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';
import BossBottomNav from '../components/boss/BossBottomNav';
import AddressCard from '../components/address/AddressCard';

export default function RouteEditor() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const urlParams = new URLSearchParams(window.location.search);
  const routeId = urlParams.get('id');
  
  const [showAddModal, setShowAddModal] = useState(false);
  const [selectedPoolIds, setSelectedPoolIds] = useState(new Set());
  const [searchQuery, setSearchQuery] = useState('');

  const { data: user } = useQuery({
    queryKey: ['currentUser'],
    queryFn: () => base44.auth.me()
  });

  const { data: route, isLoading: routeLoading } = useQuery({
    queryKey: ['route', routeId],
    queryFn: async () => {
      const routes = await base44.entities.Route.filter({ id: routeId });
      return routes[0] || null;
    },
    enabled: !!routeId
  });

  const { data: routeAddresses = [], isLoading: addressesLoading } = useQuery({
    queryKey: ['routeAddresses', routeId],
    queryFn: async () => {
      const addresses = await base44.entities.Address.filter({
        route_id: routeId,
        deleted_at: null
      });
      return addresses.sort((a, b) => (a.order_index || 0) - (b.order_index || 0));
    },
    enabled: !!routeId
  });

  // Fetch attempts for all addresses in route
  const { data: attempts = [] } = useQuery({
    queryKey: ['routeAttempts', routeId],
    queryFn: async () => {
      return base44.entities.Attempt.filter({ route_id: routeId });
    },
    enabled: !!routeId
  });

  // Create a map of latest attempt per address
  const lastAttemptMap = {};
  attempts.forEach(attempt => {
    const existing = lastAttemptMap[attempt.address_id];
    if (!existing || new Date(attempt.attempt_time) > new Date(existing.attempt_time)) {
      lastAttemptMap[attempt.address_id] = attempt;
    }
  });

  const companyId = user?.company_id || 'default';

  const { data: poolAddresses = [], isLoading: poolLoading } = useQuery({
    queryKey: ['poolAddresses', companyId],
    queryFn: async () => {
      const all = await base44.entities.Address.filter({
        company_id: companyId,
        deleted_at: null
      });
      return all.filter(a => !a.route_id);
    },
    enabled: !!user && showAddModal
  });

  const updateRouteMutation = useMutation({
    mutationFn: async (data) => {
      await base44.entities.Route.update(routeId, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['route', routeId] });
    }
  });

  const addAddressesMutation = useMutation({
    mutationFn: async (addressIds) => {
      const currentCount = routeAddresses.length;
      
      for (let i = 0; i < addressIds.length; i++) {
        await base44.entities.Address.update(addressIds[i], {
          route_id: routeId,
          order_index: currentCount + i
        });
      }
      
      await base44.entities.Route.update(routeId, {
        total_addresses: currentCount + addressIds.length
      });
      
      await base44.entities.AuditLog.create({
        company_id: companyId,
        action_type: 'route_addresses_added',
        actor_id: user.id,
        actor_role: user.role || 'boss',
        target_type: 'route',
        target_id: routeId,
        details: {
          route_name: route?.folder_name,
          address_count: addressIds.length
        },
        timestamp: new Date().toISOString()
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['routeAddresses', routeId] });
      queryClient.invalidateQueries({ queryKey: ['poolAddresses'] });
      queryClient.invalidateQueries({ queryKey: ['route', routeId] });
      setShowAddModal(false);
      setSelectedPoolIds(new Set());
      toast.success('Addresses added');
    }
  });

  const removeAddressMutation = useMutation({
    mutationFn: async (addressId) => {
      await base44.entities.Address.update(addressId, {
        route_id: null,
        order_index: null
      });
      
      await base44.entities.Route.update(routeId, {
        total_addresses: Math.max(0, (route?.total_addresses || 1) - 1)
      });
      
      await base44.entities.AuditLog.create({
        company_id: companyId,
        action_type: 'route_addresses_removed',
        actor_id: user.id,
        actor_role: user.role || 'boss',
        target_type: 'route',
        target_id: routeId,
        details: {
          route_name: route?.folder_name,
          address_id: addressId
        },
        timestamp: new Date().toISOString()
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['routeAddresses', routeId] });
      queryClient.invalidateQueries({ queryKey: ['poolAddresses'] });
      queryClient.invalidateQueries({ queryKey: ['route', routeId] });
      toast.success('Address removed');
    }
  });

  const finalizeMutation = useMutation({
    mutationFn: async () => {
      if (routeAddresses.length === 0) {
        throw new Error('Cannot finalize empty route');
      }
      
      await base44.entities.Route.update(routeId, {
        status: 'ready'
      });
      
      await base44.entities.AuditLog.create({
        company_id: companyId,
        action_type: 'route_finalized',
        actor_id: user.id,
        actor_role: user.role || 'boss',
        target_type: 'route',
        target_id: routeId,
        details: {
          route_name: route?.folder_name,
          total_addresses: routeAddresses.length
        },
        timestamp: new Date().toISOString()
      });
    },
    onSuccess: () => {
      toast.success('Route finalized and ready for assignment');
      navigate(createPageUrl('BossRoutes'));
    },
    onError: (error) => {
      toast.error(error.message);
    }
  });

  const handleDragEnd = async (result) => {
    if (!result.destination) return;
    
    const items = Array.from(routeAddresses);
    const [reorderedItem] = items.splice(result.source.index, 1);
    items.splice(result.destination.index, 0, reorderedItem);
    
    // Update order indexes
    for (let i = 0; i < items.length; i++) {
      if (items[i].order_index !== i) {
        await base44.entities.Address.update(items[i].id, { order_index: i });
      }
    }
    
    queryClient.invalidateQueries({ queryKey: ['routeAddresses', routeId] });
  };

  const getTypeColor = (type) => {
    switch (type) {
      case 'serve': return 'bg-blue-100 text-blue-700';
      case 'garnishment': return 'bg-purple-100 text-purple-700';
      case 'posting': return 'bg-orange-100 text-orange-700';
      default: return 'bg-gray-100 text-gray-700';
    }
  };

  const calculateEarnings = () => {
    return routeAddresses.reduce((sum, addr) => sum + (addr.pay_rate || 0), 0);
  };

  const getEarningsBreakdown = () => {
    const serves = routeAddresses.filter(a => a.serve_type === 'serve');
    const garnishments = routeAddresses.filter(a => a.serve_type === 'garnishment');
    const postings = routeAddresses.filter(a => a.serve_type === 'posting');
    
    return {
      serves: { count: serves.length, total: serves.length * 24 },
      garnishments: { count: garnishments.length, total: garnishments.length * 24 },
      postings: { count: postings.length, total: postings.length * 10 }
    };
  };

  const filteredPoolAddresses = poolAddresses.filter(addr =>
    addr.legal_address?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    addr.normalized_address?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  if (routeLoading || addressesLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
      </div>
    );
  }

  if (!route) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <p className="text-gray-500">Route not found</p>
      </div>
    );
  }

  const breakdown = getEarningsBreakdown();
  const hasMixedTypes = breakdown.postings.count > 0 && (breakdown.serves.count > 0 || breakdown.garnishments.count > 0);

  return (
    <div className="min-h-screen bg-gray-50 pb-20">
      {/* Header */}
      <header className="bg-white border-b px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate(createPageUrl('BossRoutes'))}>
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <div>
            <h1 className="font-semibold text-lg">{route.folder_name}</h1>
            <Badge variant="outline" className="text-xs">Draft</Badge>
          </div>
        </div>
        <Button onClick={() => finalizeMutation.mutate()} disabled={routeAddresses.length === 0}>
          Finalize →
        </Button>
      </header>

      <main className="px-4 py-4 max-w-4xl mx-auto">
        {/* Route Info */}
        <Card className="mb-4">
          <CardContent className="p-4">
            <div className="flex flex-wrap gap-4 text-sm">
              <div className="flex items-center gap-2">
                <Clock className="w-4 h-4 text-gray-400" />
                <span>Due: {format(new Date(route.due_date), 'MMM d, yyyy')}</span>
              </div>
              <div className="flex items-center gap-2">
                <MapPin className="w-4 h-4 text-gray-400" />
                <span>{routeAddresses.length} addresses</span>
              </div>
              <div className="flex items-center gap-2">
                <DollarSign className="w-4 h-4 text-gray-400" />
                <span>${calculateEarnings()} estimated</span>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Earnings Breakdown */}
        <Card className="mb-4">
          <CardContent className="p-4">
            <h3 className="font-medium mb-2">Earnings Breakdown</h3>
            <div className="text-sm space-y-1">
              <p>• Serves: {breakdown.serves.count} × $24 = ${breakdown.serves.total}</p>
              <p>• Garnishments: {breakdown.garnishments.count} × $24 = ${breakdown.garnishments.total}</p>
              <p>• Postings: {breakdown.postings.count} × $10 = ${breakdown.postings.total}</p>
            </div>
          </CardContent>
        </Card>

        {/* Mixed Types Warning */}
        {hasMixedTypes && (
          <Card className="mb-4 border-amber-200 bg-amber-50">
            <CardContent className="p-4">
              <div className="flex items-start gap-3">
                <AlertTriangle className="w-5 h-5 text-amber-600 mt-0.5" />
                <div>
                  <p className="font-medium text-amber-800">Mixed serve types detected</p>
                  <p className="text-sm text-amber-700 mt-1">
                    This route mixes Serves/Garnishments with Postings. Consider splitting for optimal scheduling.
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Addresses Section */}
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-semibold">Addresses ({routeAddresses.length})</h2>
          <Dialog open={showAddModal} onOpenChange={setShowAddModal}>
            <DialogTrigger asChild>
              <Button size="sm">
                <Plus className="w-4 h-4 mr-1" /> Add from Pool
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-lg max-h-[80vh] overflow-hidden flex flex-col">
              <DialogHeader>
                <DialogTitle>Add Addresses to {route.folder_name}</DialogTitle>
              </DialogHeader>
              <div className="flex items-center gap-2 mb-3">
                <Input
                  placeholder="Search addresses..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="flex-1"
                />
                {filteredPoolAddresses.length > 0 && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      if (selectedPoolIds.size === filteredPoolAddresses.length) {
                        setSelectedPoolIds(new Set());
                      } else {
                        setSelectedPoolIds(new Set(filteredPoolAddresses.map(a => a.id)));
                      }
                    }}
                  >
                    {selectedPoolIds.size === filteredPoolAddresses.length ? 'Deselect All' : 'Select All'}
                  </Button>
                )}
              </div>
              <div className="flex-1 overflow-y-auto space-y-2">
                {poolLoading ? (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 className="w-6 h-6 animate-spin text-blue-500" />
                  </div>
                ) : filteredPoolAddresses.length === 0 ? (
                  <p className="text-center text-gray-500 py-4">No addresses in pool</p>
                ) : (
                  filteredPoolAddresses.map(addr => (
                    <div
                      key={addr.id}
                      className={`p-3 border rounded-lg cursor-pointer transition-colors ${
                        selectedPoolIds.has(addr.id) ? 'border-blue-500 bg-blue-50' : 'hover:bg-gray-50'
                      }`}
                      onClick={() => {
                        const newSelected = new Set(selectedPoolIds);
                        if (newSelected.has(addr.id)) {
                          newSelected.delete(addr.id);
                        } else {
                          newSelected.add(addr.id);
                        }
                        setSelectedPoolIds(newSelected);
                      }}
                    >
                      <p className="font-medium text-sm truncate">
                        {addr.normalized_address || addr.legal_address}
                      </p>
                      <div className="flex items-center gap-2 mt-1">
                        <Badge className={`${getTypeColor(addr.serve_type)} text-xs`}>
                          {addr.serve_type}
                        </Badge>
                        <span className="text-xs text-gray-500">${addr.pay_rate}</span>
                      </div>
                    </div>
                  ))
                )}
              </div>
              <div className="pt-3 border-t flex items-center justify-between">
                <span className="text-sm text-gray-600">Selected: {selectedPoolIds.size}</span>
                <Button
                  onClick={() => addAddressesMutation.mutate(Array.from(selectedPoolIds))}
                  disabled={selectedPoolIds.size === 0}
                >
                  Add {selectedPoolIds.size} Addresses
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>

        {/* Address List */}
        {routeAddresses.length === 0 ? (
          <Card>
            <CardContent className="p-8 text-center">
              <MapPin className="w-12 h-12 mx-auto text-gray-300 mb-4" />
              <p className="text-gray-500">No addresses in this route</p>
              <p className="text-sm text-gray-400 mt-1">Add addresses from the pool to get started</p>
            </CardContent>
          </Card>
        ) : (
          <DragDropContext onDragEnd={handleDragEnd}>
            <Droppable droppableId="addresses">
              {(provided) => (
                <div {...provided.droppableProps} ref={provided.innerRef} className="space-y-4">
                  {routeAddresses.map((address, index) => (
                    <Draggable key={address.id} draggableId={address.id} index={index}>
                      {(provided, snapshot) => (
                        <div
                          ref={provided.innerRef}
                          {...provided.draggableProps}
                          className={`relative ${snapshot.isDragging ? 'z-50' : ''}`}
                        >
                          {/* Drag handle overlay */}
                          <div 
                            {...provided.dragHandleProps} 
                            className="absolute left-0 top-0 bottom-0 w-10 flex items-center justify-center cursor-grab z-10 bg-gradient-to-r from-gray-100/80 to-transparent rounded-l-2xl"
                          >
                            <GripVertical className="w-5 h-5 text-gray-400" />
                          </div>
                          
                          {/* Remove button overlay */}
                          <Button
                            variant="ghost"
                            size="icon"
                            className="absolute right-2 top-2 z-10 bg-white/80 hover:bg-red-50"
                            onClick={(e) => {
                              e.stopPropagation();
                              removeAddressMutation.mutate(address.id);
                            }}
                          >
                            <X className="w-4 h-4 text-gray-400 hover:text-red-500" />
                          </Button>
                          
                          <AddressCard
                            address={address}
                            index={index}
                            routeId={routeId}
                            showActions={false}
                            lastAttempt={lastAttemptMap[address.id]}
                          />
                        </div>
                      )}
                    </Draggable>
                  ))}
                  {provided.placeholder}
                </div>
              )}
            </Droppable>
          </DragDropContext>
        )}
      </main>

      <BossBottomNav currentPage="BossRoutes" />
    </div>
  );
}