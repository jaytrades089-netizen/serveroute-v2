import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import { ArrowLeft, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { format, addDays } from 'date-fns';
import { CalendarIcon } from 'lucide-react';
import { toast } from 'sonner';
import BossBottomNav from '../components/boss/BossBottomNav';

export default function CreateRoute() {
  const navigate = useNavigate();
  
  const [form, setForm] = useState({
    folder_name: '',
    due_date: addDays(new Date(), 14),
    completion_rule: '14d'
  });
  const [isSubmitting, setIsSubmitting] = useState(false);

  const { data: user } = useQuery({
    queryKey: ['currentUser'],
    queryFn: () => base44.auth.me()
  });

  const createRouteMutation = useMutation({
    mutationFn: async (routeData) => {
      const newRoute = await base44.entities.Route.create({
        company_id: user.company_id,
        folder_name: routeData.folder_name,
        due_date: format(routeData.due_date, 'yyyy-MM-dd'),
        completion_rule: routeData.completion_rule,
        status: 'draft',
        total_addresses: 0,
        served_count: 0
      });
      
      await base44.entities.AuditLog.create({
        company_id: user.company_id,
        action_type: 'route_created',
        actor_id: user.id,
        actor_role: user.role || 'boss',
        target_type: 'route',
        target_id: newRoute.id,
        details: {
          route_name: routeData.folder_name,
          due_date: format(routeData.due_date, 'yyyy-MM-dd'),
          completion_rule: routeData.completion_rule
        },
        timestamp: new Date().toISOString()
      });
      
      return newRoute;
    },
    onSuccess: (newRoute) => {
      toast.success('Route created');
      navigate(createPageUrl(`RouteEditor?id=${newRoute.id}`));
    }
  });

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (!form.folder_name.trim()) {
      toast.error('Please enter a route name');
      return;
    }
    
    setIsSubmitting(true);
    await createRouteMutation.mutateAsync(form);
    setIsSubmitting(false);
  };

  return (
    <div className="min-h-screen bg-gray-50 pb-20">
      {/* Header */}
      <header className="bg-white border-b px-4 py-3 flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate(createPageUrl('BossDashboard'))}>
          <ArrowLeft className="w-5 h-5" />
        </Button>
        <h1 className="font-semibold text-lg">Create New Route</h1>
      </header>

      <main className="px-4 py-6 max-w-lg mx-auto">
        <Card>
          <CardHeader>
            <CardTitle>Route Details</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <Label htmlFor="name">Route Name</Label>
                <Input
                  id="name"
                  value={form.folder_name}
                  onChange={(e) => setForm({ ...form, folder_name: e.target.value })}
                  placeholder="Route A"
                />
              </div>
              
              <div>
                <Label>Due Date</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" className="w-full justify-start text-left font-normal">
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {format(form.due_date, 'MMMM d, yyyy')}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0">
                    <Calendar
                      mode="single"
                      selected={form.due_date}
                      onSelect={(date) => date && setForm({ ...form, due_date: date })}
                      initialFocus
                    />
                  </PopoverContent>
                </Popover>
              </div>
              
              <div>
                <Label>Completion Rule</Label>
                <RadioGroup 
                  value={form.completion_rule} 
                  onValueChange={(value) => setForm({ ...form, completion_rule: value })}
                  className="mt-2"
                >
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="10d" id="10d" />
                    <Label htmlFor="10d" className="font-normal">10 days from assignment</Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="14d" id="14d" />
                    <Label htmlFor="14d" className="font-normal">14 days from assignment</Label>
                  </div>
                </RadioGroup>
              </div>
              
              <div className="flex gap-3 pt-4">
                <Button 
                  type="button" 
                  variant="outline" 
                  onClick={() => navigate(createPageUrl('BossDashboard'))}
                >
                  Cancel
                </Button>
                <Button type="submit" className="flex-1" disabled={isSubmitting}>
                  {isSubmitting ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Creating...
                    </>
                  ) : (
                    'Create Route'
                  )}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      </main>

      <BossBottomNav currentPage="BossRoutes" />
    </div>
  );
}