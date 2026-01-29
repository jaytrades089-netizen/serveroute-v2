import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import { ArrowLeft, Loader2, MapPin, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { toast } from 'sonner';
import BossBottomNav from '../components/boss/BossBottomNav';

const US_STATES = [
  'AL', 'AK', 'AZ', 'AR', 'CA', 'CO', 'CT', 'DE', 'FL', 'GA',
  'HI', 'ID', 'IL', 'IN', 'IA', 'KS', 'KY', 'LA', 'ME', 'MD',
  'MA', 'MI', 'MN', 'MS', 'MO', 'MT', 'NE', 'NV', 'NH', 'NJ',
  'NM', 'NY', 'NC', 'ND', 'OH', 'OK', 'OR', 'PA', 'RI', 'SC',
  'SD', 'TN', 'TX', 'UT', 'VT', 'VA', 'WA', 'WV', 'WI', 'WY'
];

function getPayRate(serveType) {
  return serveType === 'posting' ? 10 : 24;
}

export default function EditAddress() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const urlParams = new URLSearchParams(window.location.search);
  const addressId = urlParams.get('id');
  
  const [form, setForm] = useState({
    address: '',
    city: '',
    state: '',
    zip: '',
    serve_type: 'serve'
  });
  const [originalAddress, setOriginalAddress] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const { data: user } = useQuery({
    queryKey: ['currentUser'],
    queryFn: () => base44.auth.me()
  });

  const { data: address, isLoading } = useQuery({
    queryKey: ['address', addressId],
    queryFn: async () => {
      if (!addressId) return null;
      const addresses = await base44.entities.Address.filter({ id: addressId });
      return addresses[0] || null;
    },
    enabled: !!addressId
  });

  const { data: route } = useQuery({
    queryKey: ['addressRoute', address?.route_id],
    queryFn: async () => {
      if (!address?.route_id) return null;
      const routes = await base44.entities.Route.filter({ id: address.route_id });
      return routes[0] || null;
    },
    enabled: !!address?.route_id
  });

  useEffect(() => {
    if (address) {
      // Parse the address if it's a full string
      const parts = address.normalized_address?.split(',') || [];
      const streetAddress = parts[0]?.trim() || '';
      const cityStateZip = parts[1]?.trim() || '';
      const stateZip = parts[2]?.trim() || '';
      
      setForm({
        address: streetAddress || address.legal_address,
        city: address.city || cityStateZip,
        state: address.state || (stateZip.split(' ')[0] || 'MI'),
        zip: address.zip || (stateZip.split(' ')[1] || ''),
        serve_type: address.serve_type || 'serve'
      });
      setOriginalAddress(address.normalized_address || address.legal_address);
    }
  }, [address]);

  const updateAddressMutation = useMutation({
    mutationFn: async (addressData) => {
      const fullAddress = `${addressData.address}, ${addressData.city}, ${addressData.state} ${addressData.zip}`;
      const addressChanged = fullAddress !== originalAddress;
      
      const updateData = {
        normalized_address: fullAddress,
        city: addressData.city,
        state: addressData.state,
        zip: addressData.zip,
        serve_type: addressData.serve_type,
        pay_rate: getPayRate(addressData.serve_type)
      };
      
      if (addressChanged) {
        updateData.geocode_status = 'pending';
        updateData.lat = null;
        updateData.lng = null;
      }
      
      await base44.entities.Address.update(addressId, updateData);
      
      const companyId = user.company_id || 'default';
      
      await base44.entities.AuditLog.create({
        company_id: companyId,
        action_type: 'address_updated',
        actor_id: user.id,
        actor_role: user.role || 'boss',
        target_type: 'address',
        target_id: addressId,
        details: {
          before: {
            address: originalAddress,
            serve_type: address.serve_type
          },
          after: {
            address: fullAddress,
            serve_type: addressData.serve_type
          },
          re_geocoded: addressChanged
        },
        timestamp: new Date().toISOString()
      });

      // Notify server if address is in assigned route
      if (route && ['assigned', 'active'].includes(route.status) && route.worker_id) {
        await base44.entities.Notification.create({
          user_id: route.worker_id,
          company_id: companyId,
          type: 'assignment_files_added',
          title: 'Address Updated',
          body: `An address in ${route.folder_name} has been updated: ${fullAddress}`,
          related_id: route.id,
          related_type: 'route'
        });
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['address'] });
      queryClient.invalidateQueries({ queryKey: ['poolAddresses'] });
      toast.success('Address updated');
      navigate(-1);
    }
  });

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (!form.address || !form.city || !form.state || !form.zip) {
      toast.error('Please fill in all fields');
      return;
    }
    
    setIsSubmitting(true);
    await updateAddressMutation.mutateAsync(form);
    setIsSubmitting(false);
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
      </div>
    );
  }

  if (!address) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <p className="text-gray-500">Address not found</p>
      </div>
    );
  }

  const isLocked = route && route.status === 'active';

  return (
    <div className="min-h-screen bg-gray-50 pb-20">
      {/* Header */}
      <header className="bg-white border-b px-4 py-3 flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
          <ArrowLeft className="w-5 h-5" />
        </Button>
        <h1 className="font-semibold text-lg">Edit Address</h1>
      </header>

      <main className="px-4 py-6 max-w-lg mx-auto">
        {isLocked && (
          <Alert variant="destructive" className="mb-4">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              Cannot edit - route is currently active and locked.
            </AlertDescription>
          </Alert>
        )}

        <Card>
          <CardHeader>
            <CardTitle>Edit Address</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <Label htmlFor="address">Address</Label>
                <Input
                  id="address"
                  value={form.address}
                  onChange={(e) => setForm({ ...form, address: e.target.value })}
                  placeholder="123 Main Street"
                  disabled={isLocked}
                />
              </div>
              
              <div>
                <Label htmlFor="city">City</Label>
                <Input
                  id="city"
                  value={form.city}
                  onChange={(e) => setForm({ ...form, city: e.target.value })}
                  placeholder="Detroit"
                  disabled={isLocked}
                />
              </div>
              
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="state">State</Label>
                  <Select 
                    value={form.state} 
                    onValueChange={(value) => setForm({ ...form, state: value })}
                    disabled={isLocked}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {US_STATES.map(state => (
                        <SelectItem key={state} value={state}>{state}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                
                <div>
                  <Label htmlFor="zip">Zip</Label>
                  <Input
                    id="zip"
                    value={form.zip}
                    onChange={(e) => setForm({ ...form, zip: e.target.value })}
                    placeholder="48201"
                    disabled={isLocked}
                  />
                </div>
              </div>
              
              <div>
                <Label>Serve Type</Label>
                <RadioGroup 
                  value={form.serve_type} 
                  onValueChange={(value) => setForm({ ...form, serve_type: value })}
                  className="mt-2"
                  disabled={isLocked}
                >
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="serve" id="serve" disabled={isLocked} />
                    <Label htmlFor="serve" className="font-normal">Serve ($24)</Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="garnishment" id="garnishment" disabled={isLocked} />
                    <Label htmlFor="garnishment" className="font-normal">Garnishment ($24)</Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="posting" id="posting" disabled={isLocked} />
                    <Label htmlFor="posting" className="font-normal">Posting ($10)</Label>
                  </div>
                </RadioGroup>
              </div>

              {address.lat && address.lng && (
                <div className="pt-4 border-t">
                  <Label className="text-gray-500">Current Location</Label>
                  <div className="flex items-center gap-2 mt-1">
                    <MapPin className="w-4 h-4 text-green-500" />
                    <span className="text-sm">
                      {address.lat.toFixed(4)}, {address.lng.toFixed(4)} 
                      ({address.geocode_status === 'exact' ? 'Exact match' : 'Approximate'})
                    </span>
                  </div>
                  <p className="text-xs text-amber-600 mt-2">
                    ⚠️ Changing address will trigger re-geocoding
                  </p>
                </div>
              )}
              
              <div className="flex gap-3 pt-4">
                <Button 
                  type="button" 
                  variant="outline" 
                  onClick={() => navigate(-1)}
                >
                  Cancel
                </Button>
                <Button type="submit" className="flex-1" disabled={isSubmitting || isLocked}>
                  {isSubmitting ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Saving...
                    </>
                  ) : (
                    'Save Changes'
                  )}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      </main>

      <BossBottomNav currentPage="BossDashboard" />
    </div>
  );
}