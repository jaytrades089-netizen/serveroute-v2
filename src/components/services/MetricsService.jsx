import { base44 } from '@/api/base44Client';
import { subDays } from 'date-fns';

export async function calculateWorkerMetrics(workerId, routes, addresses) {
  const last30Days = subDays(new Date(), 30).toISOString();
  const last60Days = subDays(new Date(), 60).toISOString();
  const last90Days = subDays(new Date(), 90).toISOString();

  // Filter worker's routes
  const workerRoutes = routes.filter(r => r.worker_id === workerId);
  const completedRoutes = workerRoutes.filter(r => r.status === 'completed');

  // Routes in different time periods
  const routes30 = completedRoutes.filter(r => 
    r.completed_at && new Date(r.completed_at) >= new Date(last30Days)
  );
  const routes90 = completedRoutes.filter(r => 
    r.completed_at && new Date(r.completed_at) >= new Date(last90Days)
  );

  // Addresses served
  const workerAddresses = addresses.filter(a => {
    const route = workerRoutes.find(r => r.id === a.route_id);
    return route && a.served;
  });

  const addresses30 = workerAddresses.filter(a => 
    a.served_at && new Date(a.served_at) >= new Date(last30Days)
  );

  // 1. Average completion time (minutes per address)
  const totalMinutes = routes30.reduce((sum, r) => sum + (r.completion_time_minutes || 0), 0);
  const totalAddresses = routes30.reduce((sum, r) => sum + (r.total_addresses || 0), 0);
  const avgCompletionTime = totalAddresses > 0 ? Math.round(totalMinutes / totalAddresses) : null;

  // 2. Completion rate
  const assignedRoutes90 = workerRoutes.filter(r => 
    r.assigned_at && new Date(r.assigned_at) >= new Date(last90Days)
  ).length;
  const completionRate = assignedRoutes90 > 0 
    ? Math.round((routes90.length / assignedRoutes90) * 100) 
    : 100;

  // 3. On-time rate
  const onTimeRoutes = routes30.filter(r => 
    r.due_date && new Date(r.completed_at) <= new Date(r.due_date)
  );
  const onTimeRate = routes30.length > 0 
    ? Math.round((onTimeRoutes.length / routes30.length) * 100) 
    : 100;

  // 4. Issue rate (flagged addresses)
  const flaggedAddresses = workerAddresses.filter(a => 
    a.status === 'flagged' && 
    a.updated_date && new Date(a.updated_date) >= new Date(last60Days)
  ).length;
  const totalAddresses60 = workerAddresses.filter(a => 
    a.updated_date && new Date(a.updated_date) >= new Date(last60Days)
  ).length;
  const issueRate = totalAddresses60 > 0 
    ? Math.round((flaggedAddresses / totalAddresses60) * 100) 
    : 0;

  // 5. Reliability score
  const reliabilityScore = calculateReliabilityScore({
    onTimeRate,
    completionRate,
    issueRate
  });

  return {
    worker_id: workerId,
    metrics: {
      avg_completion_time: avgCompletionTime,
      completion_rate: completionRate,
      on_time_rate: onTimeRate,
      issue_rate: issueRate,
      reliability_score: reliabilityScore
    },
    totals: {
      routes_30d: routes30.length,
      routes_90d: routes90.length,
      addresses_30d: addresses30.length,
      total_routes: completedRoutes.length,
      total_addresses: workerAddresses.length
    }
  };
}

function calculateReliabilityScore({ onTimeRate, completionRate, issueRate }) {
  const weights = {
    on_time: 0.40,
    completion: 0.35,
    no_issues: 0.25
  };

  return Math.round(
    (onTimeRate * weights.on_time) +
    (completionRate * weights.completion) +
    ((100 - issueRate) * weights.no_issues)
  );
}

export async function updateWorkerMetrics(workerId, metrics, totals) {
  try {
    await base44.entities.User.update(workerId, {
      avg_completion_time_minutes: metrics.avg_completion_time,
      reliability_score: metrics.reliability_score,
      total_routes_completed: totals.total_routes,
      total_addresses_completed: totals.total_addresses
    });
    return true;
  } catch (error) {
    console.error('Failed to update worker metrics:', error);
    return false;
  }
}

// Calculate today's address count for a worker
export function getTodaysAddressCount(workerId, routes, addresses) {
  const today = new Date().toISOString().split('T')[0];
  
  const todaysRoutes = routes.filter(r => 
    r.worker_id === workerId &&
    (r.assigned_at?.startsWith(today) || r.started_at?.startsWith(today) || 
     (r.status === 'active' || r.status === 'assigned'))
  );

  return todaysRoutes.reduce((sum, r) => sum + (r.total_addresses || 0), 0);
}

// Build address counts map for all workers
export function buildAddressCountsMap(workers, routes, addresses) {
  const counts = {};
  
  workers.forEach(worker => {
    counts[worker.id] = getTodaysAddressCount(worker.id, routes, addresses);
  });

  return counts;
}