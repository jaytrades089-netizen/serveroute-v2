// RTOHandler.js - Extracted RTO logic from AddressCard
import { base44 } from '@/api/base44Client';
import { toast } from 'sonner';
import { getCompanyId } from '@/components/utils/companyUtils';

/**
 * Handle RTO (Return to Office) logic — OFFLINE-FIRST PATTERN
 *
 * The critical write is Address.update (status=returned, served=true). Everything else
 * (audit log, boss notifications, scheduled serve cleanup, route served count) is
 * non-critical for the field experience and runs in the background so the modal
 * closes immediately and the worker can move to the next stop.
 *
 * If the Address.update fails, we throw so the modal stays open and the worker knows
 * to retry — that's the one write we cannot lose.
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
  
  // CRITICAL WRITE — this is the one that MUST succeed. Mark the address as returned.
  // If this fails, throw so the modal stays open and the user can retry.
  await base44.entities.Address.update(address.id, {
    status: 'returned',
    served: true,
    served_at: now.toISOString(),
    receipt_status: 'not_required',
    rto_at: now.toISOString(),
    rto_reason: comment.trim(),
    rto_by: user?.id
  });

  // Optimistically refetch the address cache so the card flips to RTO state immediately.
  queryClient.refetchQueries({ queryKey: ['routeAddresses', routeId] });
  queryClient.refetchQueries({ queryKey: ['route', routeId] });

  toast.success('Address marked as RTO');

  // BACKGROUND — audit log, boss notifications, scheduled-serve cleanup, route count.
  // None of these are time-critical for the worker at the door. Log failures but do
  // NOT toast errors — the worker is already gone. These self-heal on next refresh.
  (async () => {
    try {
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
    } catch (e) {
      console.warn('RTO audit log failed (non-fatal):', e);
    }

    try {
      const allUsers = await base44.entities.User.filter({ company_id: companyId });
      const bosses = allUsers.filter(u => u.role === 'boss' || u.role === 'admin');
      for (const boss of bosses) {
        try {
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
        } catch (notifyErr) {
          console.warn('Single-boss notification failed (non-fatal):', notifyErr);
        }
      }
    } catch (e) {
      console.warn('RTO boss-notification step failed (non-fatal):', e);
    }

    try {
      const openServes = await base44.entities.ScheduledServe.filter({
        address_id: address.id,
        status: 'open'
      });
      for (const serve of openServes) {
        try {
          await base44.entities.ScheduledServe.update(serve.id, {
            status: 'completed',
            completed_at: now.toISOString()
          });
        } catch (ssErr) {
          console.warn('Scheduled-serve cleanup for one entry failed (non-fatal):', ssErr);
        }
      }
    } catch (ssErr) {
      console.warn('Scheduled-serve filter failed (non-fatal):', ssErr);
    }

    if (routeId) {
      try {
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
      } catch (e) {
        console.warn('RTO route-count update failed (non-fatal):', e);
      }
    }

    // Final refetch pass so the cache reflects the background writes.
    queryClient.refetchQueries({ queryKey: ['scheduledServes', routeId] });
    queryClient.refetchQueries({ queryKey: ['scheduledServesCount', routeId] });
    queryClient.refetchQueries({ queryKey: ['routeAddresses', routeId] });
    queryClient.refetchQueries({ queryKey: ['route', routeId] });
  })();
}