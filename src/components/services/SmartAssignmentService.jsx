import { base44 } from '@/api/base44Client';

const SCORE_WEIGHTS = {
  capacity: 35,
  geographic_zone: 30,
  performance: 20,
  work_type_match: 10,
  current_proximity: 5
};

export async function generateSuggestions(route, workers, addresses, addressCounts) {
  // Get route details
  const routeAddresses = addresses.filter(a => a.route_id === route.id);
  const routeZones = extractZones(routeAddresses);
  const workType = routeAddresses[0]?.serve_type || 'serve';

  // Filter available workers
  const availableWorkers = workers.filter(w => 
    w.worker_status !== 'paused' &&
    (w.role === 'server' || w.role === 'user')
  );

  // Calculate scores for each worker
  const scoredWorkers = availableWorkers.map(worker => {
    const scores = calculateWorkerScores(
      worker, 
      route, 
      routeZones, 
      workType,
      addressCounts[worker.id] || 0
    );
    return {
      worker_id: worker.id,
      worker_name: worker.full_name,
      ...scores
    };
  });

  // Sort by total score
  scoredWorkers.sort((a, b) => b.fit_score - a.fit_score);

  // Return top 5
  return scoredWorkers.slice(0, 5);
}

function calculateWorkerScores(worker, route, routeZones, workType, todaysAddresses) {
  const scores = {
    capacity: 0,
    geographic_zone: 0,
    performance: 0,
    work_type_match: 0,
    current_proximity: 0
  };

  const reasons = [];
  const capacityLimit = worker.capacity_limit || 50;

  // 1. CAPACITY SCORE (35 points)
  const capacityUsed = todaysAddresses / capacityLimit;
  const capacityRemaining = capacityLimit - todaysAddresses;

  if (capacityUsed >= 1.0) {
    scores.capacity = 0;
    reasons.push('❌ At capacity');
  } else if (capacityUsed >= 0.85) {
    scores.capacity = 10;
    reasons.push('⚠️ Near capacity');
  } else if (capacityUsed >= 0.5) {
    scores.capacity = 25;
    reasons.push('✓ Has capacity');
  } else {
    scores.capacity = 35;
    reasons.push('✓ Plenty of capacity');
  }

  // 2. GEOGRAPHIC ZONE SCORE (30 points)
  const workerZones = worker.preferred_zones || [];
  const zoneMatches = routeZones.filter(z =>
    workerZones.some(wz => wz.toLowerCase() === z.toLowerCase())
  );

  if (zoneMatches.length > 0) {
    scores.geographic_zone = 30;
    reasons.push(`✓ Works in ${zoneMatches[0]}`);
  } else if (workerZones.length === 0) {
    scores.geographic_zone = 15;
    reasons.push('○ No zone preference');
  } else {
    scores.geographic_zone = 5;
    reasons.push('○ Different zone');
  }

  // 3. PERFORMANCE SCORE (20 points)
  const reliability = worker.reliability_score || 80;

  if (reliability >= 95) {
    scores.performance = 20;
    reasons.push('⭐ Top performer');
  } else if (reliability >= 85) {
    scores.performance = 15;
    reasons.push('✓ Reliable');
  } else if (reliability >= 70) {
    scores.performance = 10;
    reasons.push('○ Average performance');
  } else {
    scores.performance = 5;
    reasons.push('⚠️ Below average');
  }

  // 4. WORK TYPE MATCH (10 points)
  const preferredTypes = worker.preferred_work_types || [];

  if (preferredTypes.length === 0 || preferredTypes.includes(workType)) {
    scores.work_type_match = 10;
    reasons.push(`✓ Does ${workType} work`);
  } else {
    scores.work_type_match = 3;
    reasons.push(`○ Prefers ${preferredTypes[0]}`);
  }

  // 5. CURRENT PROXIMITY (5 points)
  if (zoneMatches.length > 0) {
    scores.current_proximity = 5;
  } else {
    scores.current_proximity = 2;
  }

  // Calculate total
  const fit_score = Object.values(scores).reduce((a, b) => a + b, 0);

  return {
    fit_score,
    capacity_remaining: capacityRemaining,
    zone_match: zoneMatches.length > 0,
    performance_score: reliability,
    reasons,
    scores
  };
}

function extractZones(addresses) {
  const zones = [...new Set(addresses.map(a => a.city).filter(Boolean))];
  return zones;
}

export async function autoAssignAllRoutes(
  unassignedRoutes, 
  workers, 
  addresses, 
  addressCounts,
  userId,
  companyId
) {
  const results = [];

  for (const route of unassignedRoutes) {
    const suggestions = await generateSuggestions(route, workers, addresses, addressCounts);

    if (suggestions.length === 0) {
      results.push({
        route_id: route.id,
        route_name: route.folder_name,
        success: false,
        reason: 'No available workers'
      });
      continue;
    }

    const topSuggestion = suggestions[0];

    // Check capacity
    if (topSuggestion.capacity_remaining < (route.total_addresses || 0)) {
      results.push({
        route_id: route.id,
        route_name: route.folder_name,
        success: false,
        reason: `${topSuggestion.worker_name} doesn't have enough capacity`
      });
      continue;
    }

    // Assign route
    try {
      await base44.entities.Route.update(route.id, {
        worker_id: topSuggestion.worker_id,
        status: 'assigned',
        assigned_at: new Date().toISOString(),
        assigned_by: userId
      });

      // Update worker
      await base44.entities.User.update(topSuggestion.worker_id, {
        current_route_id: route.id,
        worker_status: 'active',
        last_active_at: new Date().toISOString()
      });

      // Notify worker
      await base44.entities.Notification.create({
        user_id: topSuggestion.worker_id,
        company_id: companyId,
        recipient_role: 'server',
        type: 'route_assigned',
        title: 'New Route Assigned',
        body: `${route.folder_name}: ${route.total_addresses || 0} addresses`,
        data: { route_id: route.id },
        action_url: `/WorkerRouteDetail?routeId=${route.id}`,
        priority: 'normal'
      });

      // Update address counts for next iteration
      addressCounts[topSuggestion.worker_id] = 
        (addressCounts[topSuggestion.worker_id] || 0) + (route.total_addresses || 0);

      results.push({
        route_id: route.id,
        route_name: route.folder_name,
        success: true,
        assigned_to: topSuggestion.worker_name,
        fit_score: topSuggestion.fit_score
      });
    } catch (error) {
      results.push({
        route_id: route.id,
        route_name: route.folder_name,
        success: false,
        reason: error.message
      });
    }
  }

  // Audit log
  await base44.entities.AuditLog.create({
    company_id: companyId,
    action_type: 'bulk_auto_assign',
    actor_id: userId,
    actor_role: 'boss',
    target_type: 'route',
    details: {
      total_routes: unassignedRoutes.length,
      assigned: results.filter(r => r.success).length,
      failed: results.filter(r => !r.success).length
    },
    timestamp: new Date().toISOString()
  });

  return results;
}