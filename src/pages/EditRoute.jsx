import React, { useState, useEffect, useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Calendar } from '@/components/ui/calendar';
import { 
  ArrowLeft, 
  Check, 
  Loader2,
  Info,
  Plus,
  Minus
} from 'lucide-react';
import { toast } from 'sonner';
import { format, subDays } from 'date-fns';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";

const ATTEMPT_OPTIONS = [3, 5, 7];
const SPREAD_OPTIONS = [10, 14, 21];

export default function EditRoute() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const urlParams = new URLSearchParams(window.location.search);
  const routeId = urlParams.get('id');

  const [routeName, setRouteName] = useState('');
  const [dueDate, setDueDate] = useState(null);
  const [requiredAttempts, setRequiredAttempts] = useState(3);
  const [minimumDaysSpread, setMinimumDaysSpread] = useState(10);
  const [isSaving, setIsSaving] = useState(false);
  const [showCustomAttempts, setShowCustomAttempts] = useState(false);
  const [showCustomSpread, setShowCustomSpread] = useState(false);
  const [customAttempts, setCustomAttempts] = useState(4);
  const [customSpread, setCustomSpread] = useState(15);

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

  // Initialize form with route data
  useEffect(() => {
    if (route) {
      setRouteName(route.folder_name || '');
      setDueDate(route.due_date ? new Date(route.due_date) : null);
      setRequiredAttempts(route.required_attempts || 3);
      setMinimumDaysSpread(route.minimum_days_spread || 14);
    }
  }, [route]);

  // Calculate first attempt deadline
  const firstAttemptDeadline = useMemo(() => {
    if (!dueDate) return null;
    return subDays(dueDate, minimumDaysSpread);
  }, [dueDate, minimumDaysSpread]);

  // Calculate qualifier vs flexible attempts
  const qualifierAttempts = 3;
  const flexibleAttempts = Math.max(0, requiredAttempts - qualifierAttempts);

  const handleSave = async () => {
    if (!route || !user) return;

    if (!routeName.trim()) {
      toast.error('Please enter a route name');
      return;
    }

    if (!dueDate) {
      toast.error('Please select a due date');
      return;
    }

    setIsSaving(true);

    try {
      await base44.entities.Route.update(route.id, {
        folder_name: routeName,
        due_date: format(dueDate, 'yyyy-MM-dd'),
        required_attempts: requiredAttempts,
        qualifier_attempts: qualifierAttempts,
        flexible_attempts: flexibleAttempts,
        minimum_days_spread: minimumDaysSpread,
        first_attempt_deadline: firstAttemptDeadline ? format(firstAttemptDeadline, 'yyyy-MM-dd') : null,
        spread_type: String(minimumDaysSpread)
      });

      toast.success('Route updated successfully!');
      queryClient.invalidateQueries({ queryKey: ['workerRoutes'] });
      queryClient.invalidateQueries({ queryKey: ['route', routeId] });
      
      // Navigate back
      const isBoss = user.role === 'boss' || user.role === 'admin';
      if (isBoss) {
        navigate(createPageUrl('BossRoutes'));
      } else {
        navigate(createPageUrl('WorkerRoutes'));
      }

    } catch (error) {
      console.error('Error updating route:', error);
      toast.error('Failed to update route: ' + error.message);
    } finally {
      setIsSaving(false);
    }
  };

  const handleConfirmCustomAttempts = () => {
    setRequiredAttempts(customAttempts);
    setShowCustomAttempts(false);
  };

  const handleConfirmCustomSpread = () => {
    setMinimumDaysSpread(customSpread);
    setShowCustomSpread(false);
  };

  if (routeLoading || !route) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
      </div>
    );
  }

  const isBoss = user?.role === 'boss' || user?.role === 'admin';

  return (
    <div className="min-h-screen bg-gray-50 pb-24">
      {/* Header */}
      <div className="bg-white border-b px-4 py-3 flex items-center gap-3">
        <Button 
          variant="ghost" 
          size="icon"
          onClick={() => navigate(-1)}
        >
          <ArrowLeft className="w-5 h-5" />
        </Button>
        <h1 className="text-lg font-semibold">Edit Route</h1>
      </div>

      <div className="p-4 max-w-lg mx-auto space-y-6">
        {/* Route Name */}
        <div>
          <Label className="text-sm font-medium">ROUTE NAME *</Label>
          <Input
            value={routeName}
            onChange={(e) => setRouteName(e.target.value)}
            placeholder="Route name"
            className="mt-1"
          />
        </div>

        {/* Due Date Calendar */}
        <div>
          <Label className="text-sm font-medium">DUE DATE *</Label>
          <Card className="mt-2">
            <CardContent className="p-3">
              <Calendar
                mode="single"
                selected={dueDate}
                onSelect={setDueDate}
                className="mx-auto"
              />
              {dueDate && (
                <p className="text-center text-sm text-gray-600 mt-2">
                  Selected: {format(dueDate, 'MMMM d, yyyy')}
                </p>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Required Attempts */}
        <div>
          <Label className="text-sm font-medium">REQUIRED ATTEMPTS *</Label>
          <p className="text-xs text-gray-500 mb-2">How many attempts before marking unable to serve?</p>
          <div className="grid grid-cols-4 gap-2">
            {ATTEMPT_OPTIONS.map((num) => (
              <Button
                key={num}
                variant={requiredAttempts === num ? 'default' : 'outline'}
                className={`h-16 flex flex-col ${requiredAttempts === num ? 'bg-orange-500 hover:bg-orange-600' : ''}`}
                onClick={() => setRequiredAttempts(num)}
              >
                <span className="text-xl font-bold">{num}</span>
                <span className="text-xs opacity-80">
                  {num === 3 ? 'Standard' : num === 5 ? 'Standard' : 'Custom'}
                </span>
              </Button>
            ))}
            <Button
              variant={!ATTEMPT_OPTIONS.includes(requiredAttempts) ? 'default' : 'outline'}
              className={`h-16 flex flex-col ${!ATTEMPT_OPTIONS.includes(requiredAttempts) ? 'bg-orange-500 hover:bg-orange-600' : ''}`}
              onClick={() => {
                setCustomAttempts(requiredAttempts > 7 ? requiredAttempts : 4);
                setShowCustomAttempts(true);
              }}
            >
              <Plus className="w-5 h-5" />
              <span className="text-xs">Custom</span>
            </Button>
          </div>
          <p className="text-xs text-gray-600 mt-2">Selected: {requiredAttempts} attempts</p>
        </div>

        {/* Minimum Days Spread */}
        <div>
          <Label className="text-sm font-medium">MINIMUM DAYS SPREAD *</Label>
          <p className="text-xs text-gray-500 mb-2">Days required between first and last attempt</p>
          <div className="grid grid-cols-4 gap-2">
            {SPREAD_OPTIONS.map((num) => (
              <Button
                key={num}
                variant={minimumDaysSpread === num ? 'default' : 'outline'}
                className={`h-16 flex flex-col ${minimumDaysSpread === num ? 'bg-orange-500 hover:bg-orange-600' : ''}`}
                onClick={() => setMinimumDaysSpread(num)}
              >
                <span className="text-xl font-bold">{num}</span>
                <span className="text-xs opacity-80">
                  {num === 10 ? 'Default' : num === 14 ? 'Common' : 'Extended'}
                </span>
              </Button>
            ))}
            <Button
              variant={!SPREAD_OPTIONS.includes(minimumDaysSpread) ? 'default' : 'outline'}
              className={`h-16 flex flex-col ${!SPREAD_OPTIONS.includes(minimumDaysSpread) ? 'bg-orange-500 hover:bg-orange-600' : ''}`}
              onClick={() => {
                setCustomSpread(minimumDaysSpread);
                setShowCustomSpread(true);
              }}
            >
              <Plus className="w-5 h-5" />
              <span className="text-xs">Custom</span>
            </Button>
          </div>
          <p className="text-xs text-gray-600 mt-2">Selected: {minimumDaysSpread} days</p>
        </div>

        {/* Info Box */}
        <Card className="bg-blue-50 border-blue-200">
          <CardContent className="p-4">
            <div className="flex items-start gap-2">
              <Info className="w-5 h-5 text-blue-500 flex-shrink-0 mt-0.5" />
              <div className="text-sm">
                <p className="font-medium text-blue-900 mb-2">Service Requirements:</p>
                <ul className="space-y-1 text-blue-800">
                  <li>• {requiredAttempts} attempts required{requiredAttempts > 3 ? '' : ' (AM, PM, Weekend)'}</li>
                  {requiredAttempts > 3 && (
                    <>
                      <li>• First 3 must be qualifiers (AM, PM, Weekend)</li>
                      <li>• Remaining {flexibleAttempts} can be any time (8am-9pm)</li>
                    </>
                  )}
                  <li>• Minimum {minimumDaysSpread} days between first and last attempt</li>
                  {dueDate && firstAttemptDeadline && (
                    <>
                      <li>• Due date: {format(dueDate, 'MMM d, yyyy')}</li>
                      <li>• First attempt must be by: <strong>{format(firstAttemptDeadline, 'MMM d, yyyy')}</strong></li>
                    </>
                  )}
                </ul>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Route Info */}
        <Card>
          <CardContent className="p-4">
            <h3 className="font-semibold mb-3">ROUTE INFO</h3>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-600">Total Addresses:</span>
                <span className="font-medium">{route.total_addresses || 0}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">Served:</span>
                <span className="font-medium">{route.served_count || 0}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">Status:</span>
                <span className="font-medium capitalize">{route.status}</span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Bottom Actions */}
      <div className="fixed bottom-0 left-0 right-0 bg-white border-t p-4">
        <Button
          className="w-full bg-green-600 hover:bg-green-700 h-12 text-base"
          onClick={handleSave}
          disabled={isSaving || !routeName.trim() || !dueDate}
        >
          {isSaving ? (
            <>
              <Loader2 className="w-5 h-5 mr-2 animate-spin" />
              Saving...
            </>
          ) : (
            <>
              <Check className="w-5 h-5 mr-2" />
              Save Changes
            </>
          )}
        </Button>
      </div>

      {/* Custom Attempts Dialog */}
      <Dialog open={showCustomAttempts} onOpenChange={setShowCustomAttempts}>
        <DialogContent className="max-w-xs">
          <DialogHeader>
            <DialogTitle>Custom Attempt Count</DialogTitle>
          </DialogHeader>
          <div className="py-4">
            <p className="text-sm text-gray-600 mb-4">Number of attempts required:</p>
            <div className="flex items-center justify-center gap-4">
              <Button
                variant="outline"
                size="icon"
                onClick={() => setCustomAttempts(Math.max(3, customAttempts - 1))}
              >
                <Minus className="w-4 h-4" />
              </Button>
              <span className="text-3xl font-bold w-12 text-center">{customAttempts}</span>
              <Button
                variant="outline"
                size="icon"
                onClick={() => setCustomAttempts(Math.min(10, customAttempts + 1))}
              >
                <Plus className="w-4 h-4" />
              </Button>
            </div>
            <p className="text-xs text-gray-500 text-center mt-2">Min: 3 &nbsp; Max: 10</p>
          </div>
          <DialogFooter className="flex gap-2">
            <Button variant="outline" onClick={() => setShowCustomAttempts(false)} className="flex-1">
              Cancel
            </Button>
            <Button onClick={handleConfirmCustomAttempts} className="flex-1">
              Confirm
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Custom Spread Dialog */}
      <Dialog open={showCustomSpread} onOpenChange={setShowCustomSpread}>
        <DialogContent className="max-w-xs">
          <DialogHeader>
            <DialogTitle>Custom Days Spread</DialogTitle>
          </DialogHeader>
          <div className="py-4">
            <p className="text-sm text-gray-600 mb-4">Minimum days between first and last attempt:</p>
            <div className="flex items-center justify-center gap-4">
              <Button
                variant="outline"
                size="icon"
                onClick={() => setCustomSpread(Math.max(7, customSpread - 1))}
              >
                <Minus className="w-4 h-4" />
              </Button>
              <span className="text-3xl font-bold w-12 text-center">{customSpread}</span>
              <Button
                variant="outline"
                size="icon"
                onClick={() => setCustomSpread(Math.min(30, customSpread + 1))}
              >
                <Plus className="w-4 h-4" />
              </Button>
            </div>
            <p className="text-xs text-gray-500 text-center mt-2">Min: 7 &nbsp; Max: 30</p>
          </div>
          <DialogFooter className="flex gap-2">
            <Button variant="outline" onClick={() => setShowCustomSpread(false)} className="flex-1">
              Cancel
            </Button>
            <Button onClick={handleConfirmCustomSpread} className="flex-1">
              Confirm
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}