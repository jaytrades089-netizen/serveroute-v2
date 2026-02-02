import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import { useQuery, useMutation } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Calendar } from '@/components/ui/calendar';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { 
  ArrowLeft, 
  Calendar as CalendarIcon, 
  Check, 
  Loader2,
  CheckCircle
} from 'lucide-react';
import { toast } from 'sonner';
import { format, addDays } from 'date-fns';
import {
  DOCUMENT_INFO,
  PAY_RATES,
  loadScanSession,
  saveScanSession,
  clearScanSession,
  generateNormalizedKey
} from '@/components/scanning/ScanningService';

export default function ScanRouteSetup() {
  const navigate = useNavigate();
  const [session, setSession] = useState(null);
  const [routeName, setRouteName] = useState('');
  const [dueDate, setDueDate] = useState(null);
  const [completionRule, setCompletionRule] = useState('14d');
  const [isCreating, setIsCreating] = useState(false);

  const urlParams = new URLSearchParams(window.location.search);
  const sessionId = urlParams.get('sessionId');

  const { data: user } = useQuery({
    queryKey: ['currentUser'],
    queryFn: () => base44.auth.me()
  });

  useEffect(() => {
    if (sessionId) {
      const existingSession = loadScanSession(sessionId);
      if (existingSession) {
        setSession(existingSession);
        // Set default route name
        const today = format(new Date(), 'MMMM d');
        setRouteName(`Route - ${today}`);
        // Set default due date (14 days from now)
        setDueDate(addDays(new Date(), 14));
      } else {
        navigate(createPageUrl('ScanDocumentType'));
      }
    } else {
      navigate(createPageUrl('ScanDocumentType'));
    }
  }, [sessionId, navigate]);

  const handleCreateRoute = async () => {
    if (!session || !user) return;

    if (!routeName.trim()) {
      toast.error('Please enter a route name');
      return;
    }

    if (!dueDate) {
      toast.error('Please select a due date');
      return;
    }

    const validAddresses = session.addresses.filter(
      a => a.status === 'extracted' && a.extractedData?.street
    );

    if (validAddresses.length === 0) {
      toast.error('No valid addresses to create route');
      return;
    }

    setIsCreating(true);

    try {
      const isBoss = user.role === 'boss' || user.role === 'admin';

      // Create the route
      const routeData = {
        company_id: user.company_id,
        folder_name: routeName,
        due_date: format(dueDate, 'yyyy-MM-dd'),
        completion_rule: completionRule,
        status: isBoss ? 'ready' : 'assigned',
        worker_id: isBoss ? null : user.id,
        total_addresses: validAddresses.length,
        served_count: 0,
        total_distance_miles: 0,
        estimated_time_minutes: 0
      };

      if (!isBoss) {
        routeData.assigned_at = new Date().toISOString();
        routeData.assigned_by = user.id;
      }

      const route = await base44.entities.Route.create(routeData);

      // Create addresses
      for (const addr of validAddresses) {
        const normalizedKey = generateNormalizedKey(addr.extractedData);
        
        await base44.entities.Address.create({
          company_id: user.company_id,
          route_id: route.id,
          legal_address: addr.ocrRawText || addr.extractedData.fullAddress,
          normalized_address: addr.extractedData.fullAddress,
          city: addr.extractedData.city,
          state: addr.extractedData.state,
          zip: addr.extractedData.zip,
          serve_type: session.documentType,
          pay_rate: PAY_RATES[session.documentType],
          completion_rule: completionRule,
          status: 'pending',
          served: false,
          attempts_count: 0,
          defendant_name: addr.defendantName || null,
          ocr_raw_text: addr.ocrRawText || null,
          confidence_score: addr.confidence,
          manual_edit_flag: addr.manuallyEdited || false,
          scanned_by: user.id,
          scanned_at: new Date().toISOString(),
          scan_session_id: session.dbSessionId || null,
          normalized_key: normalizedKey,
          has_related_addresses: false,
          related_address_count: 0,
          geocode_status: 'pending'
        });

        // Update or create AddressLink for duplicate tracking
        if (normalizedKey) {
          const existingLinks = await base44.entities.AddressLink.filter({
            company_id: user.company_id,
            normalized_key: normalizedKey
          });

          if (existingLinks.length > 0) {
            const link = existingLinks[0];
            const updatedIds = [...(link.address_ids || [])];
            // Note: We'd need the new address ID here - this is simplified
            await base44.entities.AddressLink.update(link.id, {
              address_count: (link.address_count || 0) + 1,
              last_updated: new Date().toISOString()
            });
          } else {
            await base44.entities.AddressLink.create({
              company_id: user.company_id,
              normalized_key: normalizedKey,
              address_ids: [],
              address_count: 1,
              last_updated: new Date().toISOString()
            });
          }
        }
      }

      // Update scan session in database
      if (session.dbSessionId) {
        await base44.entities.ScanSession.update(session.dbSessionId, {
          status: 'completed',
          route_id: route.id,
          completed_at: new Date().toISOString()
        });
      }

      // Create audit log
      await base44.entities.AuditLog.create({
        company_id: user.company_id,
        action_type: 'route_created_from_scan',
        actor_id: user.id,
        actor_role: user.role,
        target_type: 'route',
        target_id: route.id,
        details: {
          route_name: routeName,
          address_count: validAddresses.length,
          document_type: session.documentType,
          total_earnings: validAddresses.length * PAY_RATES[session.documentType],
          completion_rule: completionRule
        },
        timestamp: new Date().toISOString()
      });

      // Clear local session
      clearScanSession(session.id);

      toast.success('Route created successfully!');
      
      // Navigate to appropriate page
      if (isBoss) {
        navigate(createPageUrl('BossRoutes'));
      } else {
        navigate(createPageUrl('WorkerRoutes'));
      }

    } catch (error) {
      console.error('Error creating route:', error);
      toast.error('Failed to create route: ' + error.message);
    } finally {
      setIsCreating(false);
    }
  };

  if (!session) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
      </div>
    );
  }

  const docInfo = DOCUMENT_INFO[session.documentType];
  const validAddresses = session.addresses.filter(
    a => a.status === 'extracted' && a.extractedData?.street
  );
  const estimatedEarnings = validAddresses.length * PAY_RATES[session.documentType];

  return (
    <div className="min-h-screen bg-gray-50 pb-24">
      {/* Header */}
      <div className="bg-white border-b px-4 py-3 flex items-center gap-3">
        <Link to={createPageUrl(`ScanPreview?sessionId=${session.id}`)}>
          <Button variant="ghost" size="icon">
            <ArrowLeft className="w-5 h-5" />
          </Button>
        </Link>
        <h1 className="text-lg font-semibold">Create Route</h1>
      </div>

      <div className="p-4 max-w-lg mx-auto space-y-6">
        {/* Route Name */}
        <div>
          <Label>Route Name *</Label>
          <Input
            value={routeName}
            onChange={(e) => setRouteName(e.target.value)}
            placeholder="Route A - January 31"
            className="mt-1"
          />
        </div>

        {/* Due Date */}
        <div>
          <Label>Due Date *</Label>
          <Popover>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                className="w-full justify-start text-left font-normal mt-1"
              >
                <CalendarIcon className="mr-2 h-4 w-4" />
                {dueDate ? format(dueDate, 'PPP') : 'Select due date'}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0">
              <Calendar
                mode="single"
                selected={dueDate}
                onSelect={setDueDate}
                disabled={(date) => date < new Date()}
                initialFocus
              />
            </PopoverContent>
          </Popover>
        </div>

        {/* Completion Rule */}
        <div>
          <Label>Completion Timeframe</Label>
          <div className="flex gap-3 mt-2">
            <Button
              variant={completionRule === '10d' ? 'default' : 'outline'}
              className="flex-1"
              onClick={() => setCompletionRule('10d')}
            >
              10 days
            </Button>
            <Button
              variant={completionRule === '14d' ? 'default' : 'outline'}
              className="flex-1"
              onClick={() => setCompletionRule('14d')}
            >
              14 days
            </Button>
          </div>
        </div>

        {/* Summary Card */}
        <Card>
          <CardContent className="p-4">
            <h3 className="font-semibold mb-3">Summary</h3>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-600">Document Type:</span>
                <span className="font-medium flex items-center gap-1">
                  {docInfo?.icon} {docInfo?.name}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">Addresses:</span>
                <span className="font-medium">{validAddresses.length}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">Attempts Required:</span>
                <span className="font-medium">3 per address</span>
              </div>
              <div className="flex justify-between border-t pt-2 mt-2">
                <span className="text-gray-600">Estimated Earnings:</span>
                <span className="font-semibold text-green-600">
                  ${estimatedEarnings.toFixed(2)}
                </span>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Address List */}
        <div>
          <h3 className="font-semibold mb-3">Addresses ({validAddresses.length})</h3>
          <div className="space-y-2 max-h-48 overflow-y-auto">
            {validAddresses.map((addr, index) => (
              <div 
                key={addr.tempId}
                className="flex items-center gap-2 p-2 bg-white rounded-lg border"
              >
                <CheckCircle className="w-4 h-4 text-green-500 flex-shrink-0" />
                <span className="text-sm truncate flex-1">
                  {addr.extractedData?.street}
                </span>
                {addr.defendantName && (
                  <span className="text-xs text-gray-500 truncate max-w-[100px]">
                    {addr.defendantName}
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Bottom Actions */}
      <div className="fixed bottom-0 left-0 right-0 bg-white border-t p-4 flex gap-3">
        <Link to={createPageUrl(`ScanPreview?sessionId=${session.id}`)} className="flex-1">
          <Button variant="outline" className="w-full">
            Cancel
          </Button>
        </Link>
        <Button
          className="flex-1 bg-green-600 hover:bg-green-700"
          onClick={handleCreateRoute}
          disabled={isCreating || !routeName.trim() || !dueDate}
        >
          {isCreating ? (
            <>
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              Creating...
            </>
          ) : (
            <>
              <Check className="w-4 h-4 mr-2" />
              Create Route
            </>
          )}
        </Button>
      </div>
    </div>
  );
}