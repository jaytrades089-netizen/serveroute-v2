// OptimizationService.js - Cluster-First Zone-Based Route Optimization
// Groups addresses by geographic area, orders zones, then optimizes within each zone

import { base44 } from '@/api/base44Client';

const MAPQUEST_LIMIT = 25;
const HERE_LIMIT = 48; // 50 max waypoints minus start and end
const ADDRESSES_PER_CLUSTER = 8; // Target addresses per cluster
const MIN_CLUSTERS = 1;
const MAX_CLUSTERS = 10;

/**
 * Calculate distance between two points in feet using Haversine formula
 */
export function calculateDistanceFeet(lat1, lon1, lat2, lon2) {
  const R = 20902231; // Earth's radius in feet
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
            Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
            Math.sin(dLon/2) * Math.sin(dLon/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  return Math.round(R * c);
}

/**
 * Nearest Neighbor Algorithm
 * Starts from a point and always picks the closest unvisited address
 */
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
      if (dist < nearestDistance) {
        nearestDistance = dist;
        nearestIndex = i;
      }
    }
    
    const nearest = remaining.splice(nearestIndex, 1)[0];
    sorted.push(nearest);
    currentLat = nearest.lat || nearest.latitude;
    currentLng = nearest.lng || nearest.longitude;
  }
  
  return sorted;
}

/**
 * Call HERE Waypoint Sequence API for a chunk of addresses
 * Falls back to MapQuest if HERE fails
 */
async function optimizeChunkWithHere(addresses, startLat, startLng, endLat, endLng, hereApiKey) {
  // Build destination parameters - prefix IDs with wp_ to ensure they start with a letter
  const destinationParams = addresses.map((addr, idx) => {
    const lat = addr.lat || addr.latitude;
    const lng = addr.lng || addr.longitude;
    const waypointId = `wp_${addr.id}`;
    return `destination${idx + 1}=${waypointId};${lat},${lng}`;
  }).join('&');
  
  // PREMIUM: change to traffic:disabled for basic tier
  const mode = 'fastest;car;traffic:enabled';
  
  const url = `https://wps.hereapi.com/v8/findsequence2?apiKey=${hereApiKey}&start=origin;${startLat},${startLng}&${destinationParams}&end=endpoint;${endLat},${endLng}&mode=${mode}&improveFor=time`;
  
  try {
    const response = await fetch(url);
    
    if (!response.ok) {
      console.warn(`HERE API returned ${response.status}, will fallback to MapQuest`);
      return null; // Signal to use fallback
    }
    
    const data = await response.json();
    
    if (data.results?.[0]?.waypoints) {
      const waypoints = data.results[0].waypoints;
      const optimized = [];
      
      // Waypoints are already in optimized order
      // Skip 'origin' and 'endpoint', extract address records by ID
      for (const wp of waypoints) {
        if (wp.id === 'origin' || wp.id === 'endpoint') continue;
        
        // Strip wp_ prefix to get original record ID
        const recordId = wp.id.replace(/^wp_/, '');
        const addr = addresses.find(a => a.id === recordId);
        if (addr) {
          optimized.push(addr);
        }
      }
      
      return optimized;
    }
    
    console.warn('HERE optimization response missing waypoints');
    return null; // Signal to use fallback
  } catch (error) {
    console.error('HERE API error:', error);
    return null; // Signal to use fallback
  }
}

/**
 * Call MapQuest Optimized Route API for a chunk of addresses
 */
async function optimizeChunkWithMapQuest(addresses, startLat, startLng, endLat, endLng, apiKey) {
  const locations = [
    { latLng: { lat: startLat, lng: startLng } },
    ...addresses.map(addr => ({ 
      latLng: { lat: addr.lat || addr.latitude, lng: addr.lng || addr.longitude } 
    })),
    { latLng: { lat: endLat, lng: endLng } }
  ];
  
  const url = `https://www.mapquestapi.com/directions/v2/optimizedroute?key=${apiKey}`;
  
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        locations: locations,
        options: { 
          allToAll: false, 
          manyToOne: false,
          routeType: 'fastest'
        }
      })
    });
    
    const result = await response.json();
    
    if (result.route?.locationSequence) {
      const sequence = result.route.locationSequence;
      const optimized = [];
      
      // Skip first (start) and last (end) indices
      for (let i = 1; i < sequence.length - 1; i++) {
        const originalIndex = sequence[i] - 1;
        if (addresses[originalIndex]) {
          optimized.push(addresses[originalIndex]);
        }
      }
      
      return optimized;
    }
    
    console.warn('MapQuest optimization failed, returning original order');
    return null; // Return null to signal failure
  } catch (error) {
    console.error('MapQuest API error:', error);
    return null; // Return null to signal failure
  }
}

/**
 * Optimize a chunk using HERE with MapQuest fallback
 */
async function optimizeChunk(addresses, startLat, startLng, endLat, endLng, hereApiKey, mapquestApiKey) {
  // Try HERE first if key is available
  if (hereApiKey) {
    const hereResult = await optimizeChunkWithHere(addresses, startLat, startLng, endLat, endLng, hereApiKey);
    if (hereResult) {
      return hereResult;
    }
    console.log('HERE optimization failed, falling back to MapQuest');
  }
  
  // Fallback to MapQuest
  if (mapquestApiKey) {
    const mqResult = await optimizeChunkWithMapQuest(addresses, startLat, startLng, endLat, endLng, mapquestApiKey);
    if (mqResult) {
      return mqResult;
    }
  }
  
  // Both failed - return original order
  console.error('Both HERE and MapQuest optimization failed');
  return addresses;
}

/**
 * Split addresses into chunks for MapQuest
 */
function splitIntoChunks(addresses, chunkSize) {
  const chunks = [];
  for (let i = 0; i < addresses.length; i += chunkSize) {
    chunks.push(addresses.slice(i, i + chunkSize));
  }
  return chunks;
}

/**
 * ============================================================================
 * CLUSTERING FUNCTIONS - Group addresses by geographic proximity
 * ============================================================================
 */

/**
 * Calculate cluster centroid (average lat/lng of all addresses in cluster)
 */
function calculateCentroid(addresses) {
  if (addresses.length === 0) return { lat: 0, lng: 0 };
  
  let sumLat = 0, sumLng = 0;
  for (const addr of addresses) {
    sumLat += addr.lat || addr.latitude || 0;
    sumLng += addr.lng || addr.longitude || 0;
  }
  
  return {
    lat: sumLat / addresses.length,
    lng: sumLng / addresses.length
  };
}

/**
 * Generate zone label based on majority city in cluster
 * Falls back to "Zone N" if no city data available
 */
function generateZoneLabel(addresses, zoneIndex) {
  // Count city occurrences
  const cityCounts = {};
  for (const addr of addresses) {
    const city = addr.city?.trim();
    if (city) {
      cityCounts[city] = (cityCounts[city] || 0) + 1;
    }
  }
  
  // Find majority city
  let maxCount = 0;
  let majorityCity = null;
  for (const [city, count] of Object.entries(cityCounts)) {
    if (count > maxCount) {
      maxCount = count;
      majorityCity = city;
    }
  }
  
  if (majorityCity) {
    // Capitalize first letter of each word
    const formatted = majorityCity.split(' ')
      .map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
      .join(' ');
    return `${formatted} Area`;
  }
  
  return `Zone ${zoneIndex + 1}`;
}

/**
 * Cluster addresses using proximity-based grouping (nearest neighbor clustering)
 * Returns array of clusters, each with addresses and centroid
 */
export function clusterAddresses(addresses) {
  if (addresses.length === 0) return [];
  
  // Filter to valid addresses with coordinates
  const validAddresses = addresses.filter(addr => {
    const lat = addr.lat || addr.latitude;
    const lng = addr.lng || addr.longitude;
    return lat && lng;
  });
  
  if (validAddresses.length === 0) return [];
  
  // Calculate number of clusters (1 per 8-10 addresses)
  let numClusters = Math.ceil(validAddresses.length / ADDRESSES_PER_CLUSTER);
  numClusters = Math.max(MIN_CLUSTERS, Math.min(MAX_CLUSTERS, numClusters));
  
  // If only 1 cluster needed, return all addresses as one cluster
  if (numClusters === 1 || validAddresses.length <= ADDRESSES_PER_CLUSTER) {
    const centroid = calculateCentroid(validAddresses);
    const label = generateZoneLabel(validAddresses, 0);
    return [{
      addresses: validAddresses,
      centroid,
      label
    }];
  }
  
  // K-means style clustering with smart initialization
  // Step 1: Pick initial centroids using furthest-first selection
  const centroids = [];
  const assigned = new Set();
  
  // First centroid: pick a random address
  centroids.push({
    lat: validAddresses[0].lat || validAddresses[0].latitude,
    lng: validAddresses[0].lng || validAddresses[0].longitude
  });
  
  // Remaining centroids: pick address furthest from existing centroids
  while (centroids.length < numClusters) {
    let maxMinDist = -1;
    let bestAddr = null;
    
    for (const addr of validAddresses) {
      const lat = addr.lat || addr.latitude;
      const lng = addr.lng || addr.longitude;
      
      // Find minimum distance to any existing centroid
      let minDist = Infinity;
      for (const c of centroids) {
        const dist = calculateDistanceFeet(lat, lng, c.lat, c.lng);
        minDist = Math.min(minDist, dist);
      }
      
      if (minDist > maxMinDist) {
        maxMinDist = minDist;
        bestAddr = addr;
      }
    }
    
    if (bestAddr) {
      centroids.push({
        lat: bestAddr.lat || bestAddr.latitude,
        lng: bestAddr.lng || bestAddr.longitude
      });
    }
  }
  
  // Step 2: Assign addresses to nearest centroid
  const clusters = centroids.map(() => ({ addresses: [] }));
  
  for (const addr of validAddresses) {
    const lat = addr.lat || addr.latitude;
    const lng = addr.lng || addr.longitude;
    
    let nearestIdx = 0;
    let nearestDist = Infinity;
    
    for (let i = 0; i < centroids.length; i++) {
      const dist = calculateDistanceFeet(lat, lng, centroids[i].lat, centroids[i].lng);
      if (dist < nearestDist) {
        nearestDist = dist;
        nearestIdx = i;
      }
    }
    
    clusters[nearestIdx].addresses.push(addr);
  }
  
  // Step 3: Merge any single-address clusters into nearest cluster
  let merged = true;
  while (merged) {
    merged = false;
    for (let i = clusters.length - 1; i >= 0; i--) {
      if (clusters[i].addresses.length === 1 && clusters.length > 1) {
        const loneAddr = clusters[i].addresses[0];
        const loneLat = loneAddr.lat || loneAddr.latitude;
        const loneLng = loneAddr.lng || loneAddr.longitude;
        
        // Find nearest other cluster
        let nearestIdx = -1;
        let nearestDist = Infinity;
        
        for (let j = 0; j < clusters.length; j++) {
          if (j === i || clusters[j].addresses.length === 0) continue;
          
          const otherCentroid = calculateCentroid(clusters[j].addresses);
          const dist = calculateDistanceFeet(loneLat, loneLng, otherCentroid.lat, otherCentroid.lng);
          
          if (dist < nearestDist) {
            nearestDist = dist;
            nearestIdx = j;
          }
        }
        
        if (nearestIdx >= 0) {
          clusters[nearestIdx].addresses.push(loneAddr);
          clusters.splice(i, 1);
          merged = true;
          break;
        }
      }
    }
  }
  
  // Remove empty clusters
  const finalClusters = clusters.filter(c => c.addresses.length > 0);
  
  // Step 4: Recalculate centroids and generate labels
  for (let i = 0; i < finalClusters.length; i++) {
    finalClusters[i].centroid = calculateCentroid(finalClusters[i].addresses);
    finalClusters[i].label = generateZoneLabel(finalClusters[i].addresses, i);
  }
  
  return finalClusters;
}

/**
 * Order clusters by proximity starting from start point
 * Last cluster is the one closest to the end point
 */
export function orderClusters(clusters, startLat, startLng, endLat, endLng) {
  if (clusters.length <= 1) return clusters;
  
  const ordered = [];
  const remaining = [...clusters];
  let currentLat = startLat;
  let currentLng = startLng;
  
  // Order all but the last cluster by nearest-first from current position
  while (remaining.length > 1) {
    let nearestIdx = 0;
    let nearestDist = Infinity;
    
    // If only 2 remaining, pick the one NOT closest to endpoint for next
    // (save the one closest to endpoint for last)
    if (remaining.length === 2 && endLat && endLng) {
      const dist0 = calculateDistanceFeet(remaining[0].centroid.lat, remaining[0].centroid.lng, endLat, endLng);
      const dist1 = calculateDistanceFeet(remaining[1].centroid.lat, remaining[1].centroid.lng, endLat, endLng);
      nearestIdx = dist0 < dist1 ? 1 : 0; // Pick the one FURTHER from end
    } else {
      for (let i = 0; i < remaining.length; i++) {
        const dist = calculateDistanceFeet(currentLat, currentLng, 
          remaining[i].centroid.lat, remaining[i].centroid.lng);
        if (dist < nearestDist) {
          nearestDist = dist;
          nearestIdx = i;
        }
      }
    }
    
    const next = remaining.splice(nearestIdx, 1)[0];
    ordered.push(next);
    currentLat = next.centroid.lat;
    currentLng = next.centroid.lng;
  }
  
  // Add the last remaining cluster
  if (remaining.length > 0) {
    ordered.push(remaining[0]);
  }
  
  return ordered;
}

/**
 * ============================================================================
 * GEOCODING FUNCTIONS
 * ============================================================================
 */

/**
 * Geocode an address using HERE Maps
 * Returns { lat, lng } or null if failed
 */
export async function geocodeWithHere(addressString, hereApiKey) {
  const url = `https://geocode.search.hereapi.com/v1/geocode?q=${encodeURIComponent(addressString)}&in=countryCode:USA&apiKey=${hereApiKey}`;
  
  try {
    const response = await fetch(url);
    
    if (!response.ok) {
      console.warn(`HERE geocoding returned ${response.status}`);
      return null;
    }
    
    const data = await response.json();
    
    if (data.items?.[0]?.position) {
      return {
        lat: data.items[0].position.lat,
        lng: data.items[0].position.lng
      };
    }
    
    return null;
  } catch (error) {
    console.error('HERE geocoding error:', error);
    return null;
  }
}

/**
 * Geocode an address using MapQuest
 * Returns { lat, lng } or null if failed
 */
export async function geocodeWithMapQuest(addressString, mapquestApiKey) {
  const url = `https://www.mapquestapi.com/geocoding/v1/address?key=${mapquestApiKey}&location=${encodeURIComponent(addressString)}`;
  
  try {
    const response = await fetch(url);
    const data = await response.json();
    
    if (data.results?.[0]?.locations?.[0]?.latLng) {
      const coords = data.results[0].locations[0].latLng;
      return {
        lat: coords.lat,
        lng: coords.lng
      };
    }
    
    return null;
  } catch (error) {
    console.error('MapQuest geocoding error:', error);
    return null;
  }
}

/**
 * Geocode an address with HERE fallback to MapQuest
 */
export async function geocodeAddress(addressString, hereApiKey, mapquestApiKey) {
  // Try HERE first if key is available
  if (hereApiKey) {
    const hereResult = await geocodeWithHere(addressString, hereApiKey);
    if (hereResult) {
      return hereResult;
    }
    console.log('HERE geocoding failed, falling back to MapQuest');
  }
  
  // Fallback to MapQuest
  if (mapquestApiKey) {
    const mqResult = await geocodeWithMapQuest(addressString, mapquestApiKey);
    if (mqResult) {
      return mqResult;
    }
  }
  
  // Both failed
  console.error('Both HERE and MapQuest geocoding failed');
  return null;
}

/**
 * MAIN HYBRID OPTIMIZATION FUNCTION
 * Use this for ALL route optimization in the app
 * Now supports HERE Maps with MapQuest fallback
 */
export async function optimizeWithHybrid(addresses, startLat, startLng, endLat, endLng, apiKey, hereApiKey = null) {
  console.log(`Optimizing ${addresses.length} addresses...`);
  
  // Need at least one API key
  if (!apiKey && !hereApiKey) {
    throw new Error('No API key configured (HERE or MapQuest required)');
  }
  
  // Filter out addresses without coordinates
  const validAddresses = addresses.filter(addr => {
    const lat = addr.lat || addr.latitude;
    const lng = addr.lng || addr.longitude;
    return lat && lng;
  });
  
  if (validAddresses.length === 0) {
    console.warn('No addresses with coordinates to optimize');
    return addresses;
  }
  
  // Determine chunk size based on which service we'll use
  const chunkSize = hereApiKey ? HERE_LIMIT : MAPQUEST_LIMIT;
  const serviceName = hereApiKey ? 'HERE' : 'MapQuest';
  
  // If small enough, optimize directly
  if (validAddresses.length <= chunkSize) {
    console.log(`Using ${serviceName} directly (under limit)`);
    const optimized = await optimizeChunk(validAddresses, startLat, startLng, endLat, endLng, hereApiKey, apiKey);
    
    if (!optimized || optimized.length === 0) {
      throw new Error('Route optimization failed - both services returned errors');
    }
    
    // Append addresses without coordinates
    const invalidAddresses = addresses.filter(addr => {
      const lat = addr.lat || addr.latitude;
      const lng = addr.lng || addr.longitude;
      return !lat || !lng;
    });
    
    return [...optimized, ...invalidAddresses];
  }
  
  // LARGE ROUTE: Use hybrid approach
  console.log('Large route detected, using hybrid optimization');
  
  // Step 1: Sort with Nearest Neighbor first (gets addresses roughly in order)
  console.log('Step 1: Applying Nearest Neighbor pre-sort...');
  const nnSorted = nearestNeighborSort(validAddresses, startLat, startLng);
  
  // Step 2: Split into chunks
  const chunks = splitIntoChunks(nnSorted, chunkSize);
  console.log(`Step 2: Split into ${chunks.length} chunks (${chunkSize} per chunk)`);
  
  // Step 3: Optimize each chunk
  console.log(`Step 3: Optimizing each chunk with ${serviceName}...`);
  const optimizedChunks = [];
  let anyChunkFailed = false;
  
  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i];
    
    // Determine start point for this chunk
    let chunkStartLat, chunkStartLng;
    if (i === 0) {
      chunkStartLat = startLat;
      chunkStartLng = startLng;
    } else {
      // Start from last address of previous chunk
      const prevChunk = optimizedChunks[i - 1];
      const lastAddr = prevChunk[prevChunk.length - 1];
      chunkStartLat = lastAddr.lat || lastAddr.latitude;
      chunkStartLng = lastAddr.lng || lastAddr.longitude;
    }
    
    // Determine end point for this chunk
    let chunkEndLat, chunkEndLng;
    if (i === chunks.length - 1) {
      // Last chunk ends at final destination
      chunkEndLat = endLat;
      chunkEndLng = endLng;
    } else {
      // End at the first address of next chunk (after NN sort, they're close)
      const nextChunk = chunks[i + 1];
      chunkEndLat = nextChunk[0].lat || nextChunk[0].latitude;
      chunkEndLng = nextChunk[0].lng || nextChunk[0].longitude;
    }
    
    const optimizedChunk = await optimizeChunk(
      chunk, chunkStartLat, chunkStartLng, chunkEndLat, chunkEndLng, hereApiKey, apiKey
    );
    
    // Check if this chunk optimization returned original order (both APIs failed)
    if (optimizedChunk === chunk) {
      anyChunkFailed = true;
    }
    
    optimizedChunks.push(optimizedChunk);
    console.log(`  Chunk ${i + 1}/${chunks.length} optimized`);
  }
  
  // Step 4: Combine all chunks
  console.log('Step 4: Combining optimized chunks...');
  const finalOrder = optimizedChunks.flat();
  
  // Step 5: Append addresses that had no coordinates (don't lose them)
  const invalidAddresses = addresses.filter(addr => {
    const lat = addr.lat || addr.latitude;
    const lng = addr.lng || addr.longitude;
    return !lat || !lng;
  });
  
  if (invalidAddresses.length > 0) {
    console.warn(`${invalidAddresses.length} addresses had no coordinates - appended to end of route`);
  }
  
  if (anyChunkFailed) {
    console.warn('Some chunks could not be optimized - using nearest neighbor order for those');
  }
  
  console.log('Optimization complete!');
  return [...finalOrder, ...invalidAddresses];
}