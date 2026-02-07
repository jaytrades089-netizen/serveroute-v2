import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import { ArrowLeft, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
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

export default function AddAddress() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  
  const [form, setForm] = useState({
    address: '',
    city: '',
    state: 'MI',
    zip: '',
    serve_type: 'serve'
  });
  const [addAnother, setAddAnother] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const { data: user } = useQuery({
    queryKey: ['currentUser'],
    queryFn: () => base44.auth.me()
  });

  const createAddressMutation = useMutation({
    mutationFn: async (addressData) => {
      const fullAddress = `${addressData.address}, ${addressData.city}, ${addressData.state} ${addressData.zip}`;
      const companyId = user.company_id || 'default';
      
      const newAddress = await base44.entities.Address.create({
        company_id: companyId,
        legal_address: fullAddress,
        normalized_address: fullAddress,
        city: addressData.city,
        state: addressData.state,
        zip: addressData.zip,
        serve_type: addressData.serve_type,
        pay_rate: getPayRate(addressData.serve_type),
        geocode_status: 'pending',
        status: 'pending'
      });
      
      await base44.entities.AuditLog.create({
        company_id: companyId,
        action_type: 'address_created',
        actor_id: user.id,
        actor_role: user.role || 'boss',
        target_type: 'address',
        target_id: newAddress.id,
        details: {
          address: fullAddress,
          serve_type: addressData.serve_type
        },
        timestamp: new Date().toISOString()
      });
      
      return newAddress;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['poolAddresses'] });
      toast.success('Address added');
      
      if (addAnother) {
        setForm({
          address: '',
          city: '',
          state: form.state,
          zip: '',
          serve_type: form.serve_type
        });
      } else {
        navigate(createPageUrl('AddressPool'));
      }
    },
    onError: (error) => {
      toast.error(error.message || 'Something went wrong');
    }
  });

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (!form.address || !form.city || !form.state || !form.zip) {
      toast.error('Please fill in all fields');
      return;
    }
    
    setIsSubmitting(true);
    await createAddressMutation.mutateAsync(form);
    setIsSubmitting(false);
  };

  return (
    <div className="min-h-screen bg-gray-50 pb-20">
      {/* Header */}
      <header className="bg-white border-b px-4 py-3 flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate(createPageUrl('AddressPool'))}>
          <ArrowLeft className="w-5 h-5" />
        </Button>
        <h1 className="font-semibold text-lg">Add Address</h1>
      </header>

      <main className="px-4 py-6 max-w-lg mx-auto">
        <Card>
          <CardHeader>
            <CardTitle>New Address</CardTitle>
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
                />
              </div>
              
              <div>
                <Label htmlFor="city">City</Label>
                <Input
                  id="city"
                  value={form.city}
                  onChange={(e) => setForm({ ...form, city: e.target.value })}
                  placeholder="Detroit"
                />
              </div>
              
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="state">State</Label>
                  <Select value={form.state} onValueChange={(value) => setForm({ ...form, state: value })}>
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
                  />
                </div>
              </div>
              
              <div>
                <Label>Serve Type</Label>
                <RadioGroup 
                  value={form.serve_type} 
                  onValueChange={(value) => setForm({ ...form, serve_type: value })}
                  className="mt-2"
                >
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="serve" id="serve" />
                    <Label htmlFor="serve" className="font-normal">Serve ($24)</Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="garnishment" id="garnishment" />
                    <Label htmlFor="garnishment" className="font-normal">Garnishment ($24)</Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="posting" id="posting" />
                    <Label htmlFor="posting" className="font-normal">Posting ($10)</Label>
                  </div>
                </RadioGroup>
              </div>
              
              <div className="flex items-center space-x-2 pt-4 border-t">
                <Checkbox 
                  id="addAnother" 
                  checked={addAnother}
                  onCheckedChange={setAddAnother}
                />
                <Label htmlFor="addAnother" className="font-normal">Add another after saving</Label>
              </div>
              
              <div className="flex gap-3 pt-4">
                <Button 
                  type="button" 
                  variant="outline" 
                  onClick={() => navigate(createPageUrl('AddressPool'))}
                >
                  Cancel
                </Button>
                <Button type="submit" className="flex-1" disabled={isSubmitting}>
                  {isSubmitting ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Adding...
                    </>
                  ) : (
                    'Add Address'
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