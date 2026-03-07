// RTOHandler.js - Extracted RTO logic from AddressCard
import { base44 } from '@/api/base44Client';
import { toast } from 'sonner';
import { getCompanyId } from '@/components/utils/companyUtils';

/**
 * Handle RTO (Return to Office) logic
 * Marks address as returned, creates audit log, and notifies all bosses
 */
export async function handleRTO({ 
  comment, 
  address, 
  routeId, 
  user, 
  attemptCount,
  queryClient 
}) {
  if (!comment.trim()) {
    toast.error('Please provide a reason for the return');
    throw new Error('Comment required');
  }
  
  const now = new Date();
  const companyId = getCompanyId(user) || address.company_id;
  
  // Update address with RTO status — mark served so it moves to completed and counts for payroll
  await base44.entities.Address.update(address.id, {
    status: 'returned',
    served: true,
    served_at: now.toISOString(),
    receipt_status: 'not_required',
    rto_at: now.toISOString(),
    rto_reason: comment.trim(),
    rto_by: user?.id
  });
  
  // Create audit log
  await base44.entities.AuditLog.create({
    company_id: companyId,
    action_type: 'address_rto',
    actor_id: user?.id,
    actor_role: user?.role || 'server',
    target_type: 'address',
    target_id: address.id,
    details: {
      route_id: routeId,
      reason: comment.trim(),
      attempt_count: attemptCount
    },
    timestamp: now.toISOString()
  });
  
  // Notify all boss/admin users about the RTO (non-fatal)
  try {
    const allUsers = await base44.entities.User.filter({ company_id: companyId });
    const bosses = allUsers.filter(u => u.role === 'boss' || u.role === 'admin');
    for (const boss of bosses) {
      await base44.entities.Notification.create({
        user_id: boss.id,
        company_id: companyId,
        recipient_role: 'boss',
        type: 'address_rto',
        title: 'Address Returned to Office',
        body: `${user?.full_name || 'A server'} returned ${address.normalized_address || address.legal_address}: ${comment.trim()}`,
        related_id: address.id,
        related_type: 'address',
        priority: 'urgent',
        data: {
          address_id: address.id,
          route_id: routeId,
          reason: comment.trim(),
          worker_id: user?.id
        }
      });
    }
  } catch (notifyError) {
    console.warn('RTO notification step failed (non-fatal):', notifyError);
  }
  
  // Auto-complete any open scheduled serves for this address
  try {
    const openServes = await base44.entities.ScheduledServe.filter({
      address_id: address.id,
      status: 'open'
    });
    for (const serve of openServes) {
      await base44.entities.ScheduledServe.update(serve.id, {
        status: 'completed',
        completed_at: now.toISOString()
      });
    }
  } catch (ssErr) {
    console.warn('Failed to complete scheduled serves:', ssErr);
  }

  // Update route served count (RTO counts as "done" for route progress)
  if (routeId) {
    const routeAddresses = await base44.entities.Address.filter({
      route_id: routeId,
      deleted_at: null
    });
    const doneCount = routeAddresses.filter(a => 
      a.served || a.status === 'returned' || (a.id === address.id)
    ).length;
    await base44.entities.Route.update(routeId, {
      served_count: doneCount
    });
  }
  
  // Invalidate queries
  queryClient.invalidateQueries({ queryKey: ['routeAddresses', routeId] });
  queryClient.invalidateQueries({ queryKey: ['route', routeId] });
  queryClient.invalidateQueries({ queryKey: ['scheduledServes', routeId] });
  queryClient.invalidateQueries({ queryKey: ['scheduledServesCount', routeId] });
  
  toast.success('Address marked as RTO');
}