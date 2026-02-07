import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import { 
  Loader2, 
  Search,
  Upload,
  Plus,
  ArrowLeft,
  MapPin,
  Trash2,
  Edit,
  CheckSquare,
  Square,
  AlertCircle,
  Tag
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import BossBottomNav from '../components/boss/BossBottomNav';

export default function AddressPool() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  
  const [searchQuery, setSearchQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [selectedIds, setSelectedIds] = useState(new Set());

  const { data: user } = useQuery({
    queryKey: ['currentUser'],
    queryFn: () => base44.auth.me()
  });

  const companyId = user?.company_id || 'default';

  const { data: addresses = [], isLoading } = useQuery({
    queryKey: ['poolAddresses', companyId],
    queryFn: async () => {
      const all = await base44.entities.Address.filter({
        company_id: companyId,
        deleted_at: null
      });
      return all.filter(a => !a.route_id);
    },
    enabled: !!user
  });

  const { data: routes = [] } = useQuery({
    queryKey: ['draftRoutes', companyId],
    queryFn: async () => {
      return base44.entities.Route.filter({
        company_id: companyId,
        status: 'draft',
        deleted_at: null
      });
    },
    enabled: !!user
  });

  const deleteAddressMutation = useMutation({
    mutationFn: async (addressId) => {
      await base44.entities.Address.update(addressId, {
        deleted_at: new Date().toISOString(),
        deleted_by: user.id
      });
      
      await base44.entities.AuditLog.create({
        company_id: companyId,
        action_type: 'address_deleted',
        actor_id: user.id,
        actor_role: user.role || 'boss',
        target_type: 'address',
        target_id: addressId,
        timestamp: new Date().toISOString()
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['poolAddresses'] });
      toast.success('Address deleted');
    },
    onError: (error) => {
      toast.error(error.message || 'Something went wrong');
    }
  });

  const addToRouteMutation = useMutation({
    mutationFn: async ({ addressIds, routeId }) => {
      for (const addressId of addressIds) {
        await base44.entities.Address.update(addressId, {
          route_id: routeId
        });
      }
      
      const route = routes.find(r => r.id === routeId);
      await base44.entities.Route.update(routeId, {
        total_addresses: (route?.total_addresses || 0) + addressIds.length
      });
      
      await base44.entities.AuditLog.create({
        company_id: companyId,
        action_type: 'route_addresses_added',
        actor_id: user.id,
        actor_role: user.role || 'boss',
        target_type: 'route',
        target_id: routeId,
        details: {
          address_count: addressIds.length
        },
        timestamp: new Date().toISOString()
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['poolAddresses'] });
      queryClient.invalidateQueries({ queryKey: ['draftRoutes'] });
      setSelectedIds(new Set());
      toast.success('Addresses added to route');
    },
    onError: (error) => {
      toast.error(error.message || 'Something went wrong');
    }
  });

  const filteredAddresses = addresses.filter(addr => {
    const matchesSearch = !searchQuery || 
      addr.legal_address?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      addr.normalized_address?.toLowerCase().includes(searchQuery.toLowerCase());
    
    const matchesType = typeFilter === 'all' || addr.serve_type === typeFilter;
    
    const matchesStatus = statusFilter === 'all' || addr.geocode_status === statusFilter;
    
    return matchesSearch && matchesType && matchesStatus;
  });

  const toggleSelect = (id) => {
    const newSelected = new Set(selectedIds);
    if (newSelected.has(id)) {
      newSelected.delete(id);
    } else {
      newSelected.add(id);
    }
    setSelectedIds(newSelected);
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === filteredAddresses.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filteredAddresses.map(a => a.id)));
    }
  };

  const getTypeColor = (type) => {
    switch (type) {
      case 'serve': return 'bg-blue-100 text-blue-700';
      case 'garnishment': return 'bg-purple-100 text-purple-700';
      case 'posting': return 'bg-orange-100 text-orange-700';
      default: return 'bg-gray-100 text-gray-700';
    }
  };

  const getStatusIcon = (status) => {
    switch (status) {
      case 'exact': return <MapPin className="w-4 h-4 text-green-500" />;
      case 'approximate': return <AlertCircle className="w-4 h-4 text-amber-500" />;
      case 'failed': return <AlertCircle className="w-4 h-4 text-red-500" />;
      default: return <Loader2 className="w-4 h-4 text-gray-400" />;
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 pb-20">
      {/* Header */}
      <header className="bg-white border-b px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate(createPageUrl('BossDashboard'))}>
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <h1 className="font-semibold text-lg">Address Pool</h1>
        </div>
        <div className="flex gap-2">
          <Link to={createPageUrl('AddressImport')}>
            <Button size="sm" variant="outline">
              <Upload className="w-4 h-4 mr-1" /> Import
            </Button>
          </Link>
          <Link to={createPageUrl('AddAddress')}>
            <Button size="sm">
              <Plus className="w-4 h-4 mr-1" /> Add
            </Button>
          </Link>
        </div>
      </header>

      <main className="px-4 py-4 max-w-4xl mx-auto">
        {/* Filters */}
        <div className="flex flex-col md:flex-row gap-3 mb-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <Input
              placeholder="Search addresses..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9"
            />
          </div>
          <Select value={typeFilter} onValueChange={setTypeFilter}>
            <SelectTrigger className="w-full md:w-40">
              <SelectValue placeholder="All Types" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Types</SelectItem>
              <SelectItem value="serve">Serve</SelectItem>
              <SelectItem value="garnishment">Garnishment</SelectItem>
              <SelectItem value="posting">Posting</SelectItem>
            </SelectContent>
          </Select>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-full md:w-40">
              <SelectValue placeholder="All Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Status</SelectItem>
              <SelectItem value="exact">Geocoded</SelectItem>
              <SelectItem value="pending">Pending</SelectItem>
              <SelectItem value="approximate">Approximate</SelectItem>
              <SelectItem value="failed">Failed</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Count & Select All */}
        <div className="flex items-center justify-between mb-4">
          <p className="text-sm text-gray-600">
            Showing {filteredAddresses.length} unassigned addresses
          </p>
          <Button variant="ghost" size="sm" onClick={toggleSelectAll}>
            {selectedIds.size === filteredAddresses.length && filteredAddresses.length > 0 ? (
              <CheckSquare className="w-4 h-4 mr-1" />
            ) : (
              <Square className="w-4 h-4 mr-1" />
            )}
            Select All
          </Button>
        </div>

        {/* Address List */}
        {filteredAddresses.length === 0 ? (
          <Card>
            <CardContent className="p-8 text-center">
              <MapPin className="w-12 h-12 mx-auto text-gray-300 mb-4" />
              <p className="text-gray-500">No addresses in pool</p>
              <p className="text-sm text-gray-400 mt-1">Import or add addresses to get started</p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-2">
            {filteredAddresses.map((address) => (
              <Card 
                key={address.id} 
                className={`cursor-pointer transition-colors ${
                  selectedIds.has(address.id) ? 'ring-2 ring-blue-500 bg-blue-50' : ''
                }`}
                onClick={() => toggleSelect(address.id)}
              >
                <CardContent className="p-4 flex items-start gap-3">
                  <div className="pt-1">
                    {selectedIds.has(address.id) ? (
                      <CheckSquare className="w-5 h-5 text-blue-600" />
                    ) : (
                      <Square className="w-5 h-5 text-gray-300" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium truncate">
                      {address.normalized_address || address.legal_address}
                    </p>
                    <div className="flex items-center gap-2 mt-1 flex-wrap">
                      <Badge className={getTypeColor(address.serve_type)}>
                        {address.serve_type}
                      </Badge>
                      <span className="text-sm text-gray-500">${address.pay_rate}</span>
                      {getStatusIcon(address.geocode_status)}
                      {address.has_dcn && (
                        <Badge className="bg-purple-100 text-purple-700 text-xs">
                          <Tag className="w-3 h-3 mr-1" />
                          DCN
                        </Badge>
                      )}
                    </div>
                  </div>
                  <div className="flex gap-1" onClick={(e) => e.stopPropagation()}>
                    <Button 
                      variant="ghost" 
                      size="icon"
                      onClick={() => navigate(createPageUrl(`EditAddress?id=${address.id}`))}
                    >
                      <Edit className="w-4 h-4" />
                    </Button>
                    <Button 
                      variant="ghost" 
                      size="icon"
                      onClick={() => {
                        if (confirm('Delete this address?')) {
                          deleteAddressMutation.mutate(address.id);
                        }
                      }}
                    >
                      <Trash2 className="w-4 h-4 text-red-500" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {/* Selected Actions */}
        {selectedIds.size > 0 && (
          <div className="fixed bottom-20 left-0 right-0 bg-white border-t p-4 shadow-lg">
            <div className="max-w-4xl mx-auto flex items-center justify-between">
              <span className="font-medium">Selected: {selectedIds.size}</span>
              <div className="flex gap-2">
                <Select 
                  onValueChange={(routeId) => {
                    addToRouteMutation.mutate({
                      addressIds: Array.from(selectedIds),
                      routeId
                    });
                  }}
                >
                  <SelectTrigger className="w-48">
                    <SelectValue placeholder="Add to Route..." />
                  </SelectTrigger>
                  <SelectContent>
                    {routes.length === 0 ? (
                      <SelectItem value="none" disabled>No draft routes</SelectItem>
                    ) : (
                      routes.map(route => (
                        <SelectItem key={route.id} value={route.id}>
                          {route.folder_name}
                        </SelectItem>
                      ))
                    )}
                  </SelectContent>
                </Select>
                <Button 
                  variant="destructive" 
                  size="sm"
                  onClick={() => {
                    if (confirm(`Delete ${selectedIds.size} addresses?`)) {
                      selectedIds.forEach(id => deleteAddressMutation.mutate(id));
                      setSelectedIds(new Set());
                    }
                  }}
                >
                  <Trash2 className="w-4 h-4" />
                </Button>
              </div>
            </div>
          </div>
        )}
      </main>

      <BossBottomNav currentPage="BossDashboard" />
    </div>
  );
}