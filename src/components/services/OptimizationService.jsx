// OptimizationService.js - Hybrid route optimization with Nearest Neighbor + MapQuest

import { base44 } from '@/api/base44Client';

const MAPQUEST_LIMIT = 25;

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
    return addresses;
  } catch (error) {
    console.error('MapQuest API error:', error);
    return addresses;
  }
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
 * MAIN HYBRID OPTIMIZATION FUNCTION
 * Use this for ALL route optimization in the app
 */
export async function optimizeWithHybrid(addresses, startLat, startLng, endLat, endLng, apiKey) {
  console.log(`Optimizing ${addresses.length} addresses...`);
  
  if (!apiKey) {
    throw new Error('MapQuest API key not configured');
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
  
  // If small enough, just use MapQuest directly
  if (validAddresses.length <= MAPQUEST_LIMIT) {
    console.log('Using MapQuest directly (under limit)');
    return await optimizeChunkWithMapQuest(validAddresses, startLat, startLng, endLat, endLng, apiKey);
  }
  
  // LARGE ROUTE: Use hybrid approach
  console.log('Large route detected, using hybrid optimization');
  
  // Step 1: Sort with Nearest Neighbor first (gets addresses roughly in order)
  console.log('Step 1: Applying Nearest Neighbor pre-sort...');
  const nnSorted = nearestNeighborSort(validAddresses, startLat, startLng);
  
  // Step 2: Split into chunks of 25
  const chunks = splitIntoChunks(nnSorted, MAPQUEST_LIMIT);
  console.log(`Step 2: Split into ${chunks.length} chunks`);
  
  // Step 3: Optimize each chunk with MapQuest
  console.log('Step 3: Optimizing each chunk with MapQuest...');
  const optimizedChunks = [];
  
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
    
    const optimizedChunk = await optimizeChunkWithMapQuest(
      chunk, chunkStartLat, chunkStartLng, chunkEndLat, chunkEndLng, apiKey
    );
    
    optimizedChunks.push(optimizedChunk);
    console.log(`  Chunk ${i + 1}/${chunks.length} optimized`);
  }
  
  // Step 4: Combine all chunks
  console.log('Step 4: Combining optimized chunks...');
  const finalOrder = optimizedChunks.flat();
  
  console.log('Optimization complete!');
  return finalOrder;
}