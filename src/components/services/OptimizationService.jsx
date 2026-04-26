// OptimizationService.js - Cluster-First Zone-Based Route Optimization
// Groups addresses by geographic area, orders zones, then optimizes within each zone using MapQuest

const MAPQUEST_LIMIT = 25;
const ADDRESSES_PER_CLUSTER = 8; // Target addresses per cluster
const MIN_CLUSTERS = 1;
const MAX_CLUSTERS = 10;

export function calculateDistanceFeet(lat1, lon1, lat2, lon2) {
  const R = 20902231;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
            Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
            Math.sin(dLon/2) * Math.sin(dLon/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  return Math.round(R * c);
}

export function nearestNeighborSort(addresses, startLat, startLng) {
  if (addresses.length === 0) return [];
  const sorted = [];
  const remaining = [...addresses];
  let currentLat = startLat;
  let currentLng = startLng;
  while (remaining.length > 0) {
    let nearestIndex = 0;
    let nearestDistance = Infinity;
    for (let i = 0; i < remaining.length; i++) {
      const addr = remaining[i];
      const lat = addr.lat || addr.latitude;
      const lng = addr.lng || addr.longitude;
      if (!lat || !lng) continue;
      const dist = calculateDistanceFeet(currentLat, currentLng, lat, lng);
      if (dist < nearestDistance) { nearestDistance = dist; nearestIndex = i; }
    }
    const nearest = remaining.splice(nearestIndex, 1)[0];
    sorted.push(nearest);
    currentLat = nearest.lat || nearest.latitude;
    currentLng = nearest.lng || nearest.longitude;
  }
  return sorted;
}

async function optimizeChunkWithMapQuest(addresses, startLat, startLng, endLat, endLng, apiKey) {
  const locations = [
    { latLng: { lat: startLat, lng: startLng } },
    ...addresses.map(addr => ({ latLng: { lat: addr.lat || addr.latitude, lng: addr.lng || addr.longitude } })),
    { latLng: { lat: endLat, lng: endLng } }
  ];
  const url = `https://www.mapquestapi.com/directions/v2/optimizedroute?key=${apiKey}`;
  
  console.log(`  MapQuest optimizedroute: ${locations.length} locations (1 start + ${addresses.length} stops + 1 end)`);
  
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ locations, options: { routeType: 'fastest' } })
    });
    const result = await response.json();
    
    console.log(`  MapQuest response status: ${response.status}, info: ${result.info?.statuscode}, messages: ${JSON.stringify(result.info?.messages || [])}`);
    
    if (result.route?.locationSequence) {
      const sequence = result.route.locationSequence;
      console.log(`  MapQuest locationSequence: [${sequence.join(', ')}]`);
      
      const optimized = [];
      for (let i = 1; i < sequence.length - 1; i++) {
        const originalIndex = sequence[i] - 1;
        if (originalIndex >= 0 && originalIndex < addresses.length) {
          optimized.push(addresses[originalIndex]);
        } else {
          console.warn(`  MapQuest sequence index ${sequence[i]} out of bounds (addresses: ${addresses.length})`);
        }
      }
      
      // Sanity check: if the last address is significantly closer to GPS start
      // than the first address, MapQuest may have produced a reversed path.
      if (optimized.length >= 2) {
        const firstAddr = optimized[0];
        const lastAddr = optimized[optimized.length - 1];
        const firstLat = firstAddr.lat || firstAddr.latitude;
        const firstLng = firstAddr.lng || firstAddr.longitude;
        const lastLat = lastAddr.lat || lastAddr.latitude;
        const lastLng = lastAddr.lng || lastAddr.longitude;
        
        const distToFirst = calculateDistanceFeet(startLat, startLng, firstLat, firstLng);
        const distToLast = calculateDistanceFeet(startLat, startLng, lastLat, lastLng);
        
        console.log(`  Distance to first stop: ${(distToFirst / 5280).toFixed(1)} mi, to last: ${(distToLast / 5280).toFixed(1)} mi`);
        
        if (distToLast < distToFirst * 0.6) {
          console.log('  MapQuest returned reversed order — flipping to start from nearest address');
          optimized.reverse();
        }
      }
      
      return optimized;
    }
    
    console.warn(`  MapQuest optimization failed — no locationSequence. Full response info: ${JSON.stringify(result.info || {})}`);
    return null;
  } catch (error) {
    console.error('  MapQuest API error:', error.message || error);
    return null;
  }
}

function splitIntoChunks(addresses, chunkSize) {
  const chunks = [];
  for (let i = 0; i < addresses.length; i += chunkSize) chunks.push(addresses.slice(i, i + chunkSize));
  return chunks;
}

function calculateCentroid(addresses) {
  if (addresses.length === 0) return { lat: 0, lng: 0 };
  let sumLat = 0, sumLng = 0;
  for (const addr of addresses) {
    sumLat += addr.lat || addr.latitude || 0;
    sumLng += addr.lng || addr.longitude || 0;
  }
  return { lat: sumLat / addresses.length, lng: sumLng / addresses.length };
}

function generateZoneLabel(addresses, zoneIndex) {
  const cityCounts = {};
  for (const addr of addresses) {
    const city = addr.city?.trim();
    if (city) cityCounts[city] = (cityCounts[city] || 0) + 1;
  }
  let maxCount = 0, majorityCity = null;
  for (const [city, count] of Object.entries(cityCounts)) {
    if (count > maxCount) { maxCount = count; majorityCity = city; }
  }
  if (majorityCity) {
    const formatted = majorityCity.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ');
    return `${formatted} Area`;
  }
  return `Zone ${zoneIndex + 1}`;
}

export function clusterAddresses(addresses) {
  if (addresses.length === 0) return [];
  const validAddresses = addresses.filter(addr => (addr.lat || addr.latitude) && (addr.lng || addr.longitude));
  if (validAddresses.length === 0) return [];
  let numClusters = Math.ceil(validAddresses.length / ADDRESSES_PER_CLUSTER);
  numClusters = Math.max(MIN_CLUSTERS, Math.min(MAX_CLUSTERS, numClusters));
  if (numClusters === 1 || validAddresses.length <= ADDRESSES_PER_CLUSTER) {
    return [{ addresses: validAddresses, centroid: calculateCentroid(validAddresses), label: generateZoneLabel(validAddresses, 0) }];
  }
  const centroids = [{ lat: validAddresses[0].lat || validAddresses[0].latitude, lng: validAddresses[0].lng || validAddresses[0].longitude }];
  while (centroids.length < numClusters) {
    let maxMinDist = -1, bestAddr = null;
    for (const addr of validAddresses) {
      const lat = addr.lat || addr.latitude, lng = addr.lng || addr.longitude;
      let minDist = Infinity;
      for (const c of centroids) minDist = Math.min(minDist, calculateDistanceFeet(lat, lng, c.lat, c.lng));
      if (minDist > maxMinDist) { maxMinDist = minDist; bestAddr = addr; }
    }
    if (bestAddr) centroids.push({ lat: bestAddr.lat || bestAddr.latitude, lng: bestAddr.lng || bestAddr.longitude });
  }
  const clusters = centroids.map(() => ({ addresses: [] }));
  for (const addr of validAddresses) {
    const lat = addr.lat || addr.latitude, lng = addr.lng || addr.longitude;
    let nearestIdx = 0, nearestDist = Infinity;
    for (let i = 0; i < centroids.length; i++) {
      const dist = calculateDistanceFeet(lat, lng, centroids[i].lat, centroids[i].lng);
      if (dist < nearestDist) { nearestDist = dist; nearestIdx = i; }
    }
    clusters[nearestIdx].addresses.push(addr);
  }
  let merged = true;
  while (merged) {
    merged = false;
    for (let i = clusters.length - 1; i >= 0; i--) {
      if (clusters[i].addresses.length === 1 && clusters.length > 1) {
        const loneAddr = clusters[i].addresses[0];
        const loneLat = loneAddr.lat || loneAddr.latitude, loneLng = loneAddr.lng || loneAddr.longitude;
        let nearestIdx = -1, nearestDist = Infinity;
        for (let j = 0; j < clusters.length; j++) {
          if (j === i || clusters[j].addresses.length === 0) continue;
          const dist = calculateDistanceFeet(loneLat, loneLng, calculateCentroid(clusters[j].addresses).lat, calculateCentroid(clusters[j].addresses).lng);
          if (dist < nearestDist) { nearestDist = dist; nearestIdx = j; }
        }
        if (nearestIdx >= 0) { clusters[nearestIdx].addresses.push(loneAddr); clusters.splice(i, 1); merged = true; break; }
      }
    }
  }
  const finalClusters = clusters.filter(c => c.addresses.length > 0);
  for (let i = 0; i < finalClusters.length; i++) {
    finalClusters[i].centroid = calculateCentroid(finalClusters[i].addresses);
    finalClusters[i].label = generateZoneLabel(finalClusters[i].addresses, i);
  }
  return finalClusters;
}

// Order clusters by nearest-first from current position
// Always starts from where the worker actually is — never overrides with end-point logic
export function orderClusters(clusters, startLat, startLng, endLat, endLng) {
  if (clusters.length <= 1) return clusters;
  const ordered = [];
  const remaining = [...clusters];
  let currentLat = startLat, currentLng = startLng;
  while (remaining.length > 1) {
    let nearestIdx = 0, nearestDist = Infinity;
    for (let i = 0; i < remaining.length; i++) {
      const dist = calculateDistanceFeet(currentLat, currentLng, remaining[i].centroid.lat, remaining[i].centroid.lng);
      if (dist < nearestDist) { nearestDist = dist; nearestIdx = i; }
    }
    const next = remaining.splice(nearestIdx, 1)[0];
    ordered.push(next);
    currentLat = next.centroid.lat;
    currentLng = next.centroid.lng;
  }
  if (remaining.length > 0) ordered.push(remaining[0]);
  return ordered;
}

// Geocode using HERE Maps (free tier, geocoding only)
// biasLat/biasLng: when provided, constrains results to a 300 km circle around that point
// so an ambiguous street like "312 W Liberty St" matches the local state instead of a far-away one.
export async function geocodeWithHere(addressString, hereApiKey, biasLat, biasLng) {
  const inParam = (biasLat != null && biasLng != null)
    ? `circle:${biasLat},${biasLng};r=300000`
    : 'countryCode:USA';
  const url = `https://geocode.search.hereapi.com/v1/geocode?q=${encodeURIComponent(addressString)}&in=${inParam}&apiKey=${hereApiKey}`;
  try {
    const response = await fetch(url);
    if (!response.ok) { console.warn(`HERE geocoding returned ${response.status}`); return null; }
    const data = await response.json();
    if (data.items?.[0]?.position) return { lat: data.items[0].position.lat, lng: data.items[0].position.lng };
    return null;
  } catch (error) { console.error('HERE geocoding error:', error); return null; }
}

// Geocode using MapQuest (fallback)
// biasLat/biasLng: when provided, appends a bounding box to prefer local results
export async function geocodeWithMapQuest(addressString, mapquestApiKey, biasLat, biasLng) {
  let url = `https://www.mapquestapi.com/geocoding/v1/address?key=${mapquestApiKey}&location=${encodeURIComponent(addressString)}`;
  // 3-degree box (~200 miles) around the bias point — keeps MapQuest from matching across the country
  if (biasLat != null && biasLng != null) {
    const delta = 3;
    url += `&boundingBox=${biasLat + delta},${biasLng - delta},${biasLat - delta},${biasLng + delta}`;
  }
  try {
    const response = await fetch(url);
    const data = await response.json();
    if (data.results?.[0]?.locations?.[0]?.latLng) {
      const coords = data.results[0].locations[0].latLng;
      return { lat: coords.lat, lng: coords.lng };
    }
    return null;
  } catch (error) { console.error('MapQuest geocoding error:', error); return null; }
}

// Try HERE first, fall back to MapQuest automatically
// biasLat/biasLng: GPS start position — pass these whenever available so ambiguous
// street names resolve to the local area instead of a same-named street in another state.
export async function geocodeAddress(addressString, hereApiKey, mapquestApiKey, biasLat, biasLng) {
  if (hereApiKey) {
    const hereResult = await geocodeWithHere(addressString, hereApiKey, biasLat, biasLng);
    if (hereResult) return hereResult;
    console.log('HERE geocoding failed, falling back to MapQuest');
  }
  if (mapquestApiKey) {
    const mqResult = await geocodeWithMapQuest(addressString, mapquestApiKey, biasLat, biasLng);
    if (mqResult) return mqResult;
  }
  console.error('Both HERE and MapQuest geocoding failed');
  return null;
}

export async function optimizeWithHybrid(addresses, startLat, startLng, endLat, endLng, apiKey) {
  console.log(`Optimizing ${addresses.length} addresses — GPS-locked MapQuest sequencing...`);
  if (!apiKey) throw new Error('MapQuest API key required for route optimization');

  const CHUNK_SIZE = 23; // MapQuest max 25 total; start + end = 2 fixed, so 23 middle

  const validAddresses = addresses.filter(addr => (addr.lat || addr.latitude) && (addr.lng || addr.longitude));
  const invalidAddresses = addresses.filter(addr => !(addr.lat || addr.latitude) || !(addr.lng || addr.longitude));

  if (validAddresses.length === 0) { console.warn('No addresses with coordinates to optimize'); return addresses; }

  console.log(`  Start GPS: ${startLat.toFixed(5)}, ${startLng.toFixed(5)}`);
  console.log(`  End point: ${endLat?.toFixed(5)}, ${endLng?.toFixed(5)}`);
  console.log(`  ${validAddresses.length} geocoded, ${invalidAddresses.length} without coords`);

  // Step 1: Zone labels (cosmetic only — does not affect sequence)
  console.log('Step 1: Building zone labels...');
  const clusters = clusterAddresses(validAddresses);
  const zoneLabelMap = {};
  for (const cluster of clusters) {
    for (const addr of cluster.addresses) {
      zoneLabelMap[addr.id] = cluster.label;
    }
  }

  // Step 2: Nearest-neighbor pre-sort from GPS
  console.log('Step 2: Nearest-neighbor pre-sort from GPS...');
  const preSorted = nearestNeighborSort(validAddresses, startLat, startLng);

  // Resolve end point — if not set, use last address in pre-sort
  let effectiveEndLat = endLat;
  let effectiveEndLng = endLng;
  if (!effectiveEndLat || !effectiveEndLng) {
    const lastPreSorted = preSorted[preSorted.length - 1];
    effectiveEndLat = lastPreSorted.lat || lastPreSorted.latitude;
    effectiveEndLng = lastPreSorted.lng || lastPreSorted.longitude;
    console.log('  No end location set — using last pre-sorted address as end point');
  }

  // Step 3: Split into chunks and run MapQuest on each
  console.log('Step 3: MapQuest road-network sequencing by chunk...');
  const chunks = [];
  for (let i = 0; i < preSorted.length; i += CHUNK_SIZE) {
    chunks.push(preSorted.slice(i, i + CHUNK_SIZE));
  }

  console.log('  Pre-sort order (nearest-neighbor from GPS):');
  preSorted.forEach((addr, idx) => {
    const addrLabel = (addr.normalized_address || addr.legal_address || '').substring(0, 30);
    console.log(`    ${idx + 1}. ${addrLabel} (${(addr.lat || addr.latitude)?.toFixed(4)}, ${(addr.lng || addr.longitude)?.toFixed(4)})`);
  });

  const sequencedAddresses = [];
  let chunkStartLat = startLat;
  let chunkStartLng = startLng;
  let mapquestUsed = false;

  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i];
    console.log(`  Chunk ${i + 1}/${chunks.length}: ${chunk.length} addresses, start: ${chunkStartLat.toFixed(5)}, ${chunkStartLng.toFixed(5)}`);

    const mqResult = await optimizeChunkWithMapQuest(
      chunk,
      chunkStartLat,
      chunkStartLng,
      effectiveEndLat,
      effectiveEndLng,
      apiKey
    );

    if (mqResult && mqResult.length > 0) {
      console.log(`  Chunk ${i + 1}: MapQuest succeeded — resequenced ${mqResult.length} addresses`);
      mapquestUsed = true;
      sequencedAddresses.push(...mqResult);
      const lastAddr = mqResult[mqResult.length - 1];
      chunkStartLat = lastAddr.lat || lastAddr.latitude;
      chunkStartLng = lastAddr.lng || lastAddr.longitude;
    } else {
      console.warn(`  Chunk ${i + 1}: MapQuest FAILED — using nearest-neighbor fallback`);
      sequencedAddresses.push(...chunk);
      const lastAddr = chunk[chunk.length - 1];
      chunkStartLat = lastAddr.lat || lastAddr.latitude;
      chunkStartLng = lastAddr.lng || lastAddr.longitude;
    }
  }

  console.log(`  Final sequence (${mapquestUsed ? 'MapQuest' : 'nearest-neighbor ONLY'}):`);
  sequencedAddresses.forEach((addr, idx) => {
    const addrLabel = (addr.normalized_address || addr.legal_address || '').substring(0, 30);
    console.log(`    ${idx + 1}. ${addrLabel}`);
  });

  if (sequencedAddresses.length > 0) {
    const firstAddr = sequencedAddresses[0];
    const lastAddr = sequencedAddresses[sequencedAddresses.length - 1];
    const distToFirst = calculateDistanceFeet(startLat, startLng, firstAddr.lat || firstAddr.latitude, firstAddr.lng || firstAddr.longitude);
    const distToLast = calculateDistanceFeet(startLat, startLng, lastAddr.lat || lastAddr.latitude, lastAddr.lng || lastAddr.longitude);
    console.log(`  First stop: ${(distToFirst / 5280).toFixed(1)} mi from your GPS`);
    console.log(`  Last stop: ${(distToLast / 5280).toFixed(1)} mi from your GPS`);
  }

  // Step 5: Assign zone labels only — order_index is never written to Address records.
  // Array position is the order. RouteOptimizeModal saves IDs as route.optimized_order.
  console.log('Step 4: Building final order...');
  const finalOrder = [];
  for (const addr of sequencedAddresses) {
    finalOrder.push({ ...addr, zone_label: zoneLabelMap[addr.id] || null });
  }
  for (const addr of invalidAddresses) {
    finalOrder.push({ ...addr, zone_label: 'No Location' });
  }

  if (invalidAddresses.length > 0) console.warn(`${invalidAddresses.length} addresses had no coordinates — appended to end`);
  console.log(`Optimization complete! ${finalOrder.length} addresses sequenced from your GPS.`);
  return finalOrder;
}

// ─── Bulk Scan Auto-Split Functions ───────────────────────────────────────────

function clusterByLongitude(addresses, n) {
  const sorted = [...addresses].sort(
    (a, b) => (a.lng || a.longitude || 0) - (b.lng || b.longitude || 0)
  );
  const groups = [];
  const groupSize = Math.ceil(sorted.length / n);
  for (let i = 0; i < n; i++) {
    const slice = sorted.slice(i * groupSize, (i + 1) * groupSize);
    if (slice.length > 0) groups.push(slice);
  }
  return groups;
}

async function getClusterRouteTime(addresses, apiKey, dwellMinutes) {
  if (addresses.length === 0) return 0;
  const centroid = calculateCentroid(addresses);
  const locations = [
    { latLng: { lat: centroid.lat, lng: centroid.lng } },
    ...addresses.map(addr => ({
      latLng: { lat: addr.lat || addr.latitude, lng: addr.lng || addr.longitude }
    })),
    { latLng: { lat: centroid.lat, lng: centroid.lng } }
  ];
  const url = `https://www.mapquestapi.com/directions/v2/optimizedroute?key=${apiKey}`;
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ locations, options: { routeType: 'fastest' } })
    });
    const result = await response.json();
    if (result.route?.time !== undefined) {
      const driveMinutes = result.route.time / 60;
      const dwellTotal = addresses.length * dwellMinutes;
      return driveMinutes + dwellTotal;
    }
    return null;
  } catch (error) {
    console.error('Route time estimation failed:', error);
    return null;
  }
}

export async function autoSplitRoutes(addresses, maxMinutes, apiKey, dwellMinutes = 2) {
  if (!apiKey) return null;

  const validAddresses = addresses.filter(
    a => (a.lat || a.latitude) && (a.lng || a.longitude)
  );

  if (validAddresses.length === 0) return null;

  const singleTime = await getClusterRouteTime(validAddresses, apiKey, dwellMinutes);
  if (singleTime !== null && singleTime <= maxMinutes) {
    return {
      groups: [{
        pileNumber: 1,
        addresses: validAddresses,
        estimatedMinutes: Math.round(singleTime)
      }],
      allUnderLimit: true,
      singleRoute: true
    };
  }

  for (let n = 2; n <= 6; n++) {
    const groups = clusterByLongitude(validAddresses, n);
    const times = await Promise.all(
      groups.map(g => getClusterRouteTime(g, apiKey, dwellMinutes))
    );

    if (times.some(t => t === null)) continue;

    const allUnderLimit = times.every(t => t <= maxMinutes);

    if (allUnderLimit || n === 6) {
      return {
        groups: groups.map((groupAddresses, i) => ({
          pileNumber: i + 1,
          addresses: groupAddresses,
          estimatedMinutes: Math.round(times[i])
        })),
        allUnderLimit
      };
    }
  }

  return null;
}
