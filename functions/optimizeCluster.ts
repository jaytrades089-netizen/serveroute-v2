import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

/**
 * Server-side proxy for HERE Waypoint Sequence API
 * Eliminates CORS issues by calling HERE from the server instead of browser
 */
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { hereApiKey, start, end, waypoints } = await req.json();

    // Validate required fields
    if (!hereApiKey) {
      return Response.json({ success: false, error: 'Missing HERE API key' });
    }
    if (!start || !start.lat || !start.lng) {
      return Response.json({ success: false, error: 'Missing start coordinates' });
    }
    if (!end || !end.lat || !end.lng) {
      return Response.json({ success: false, error: 'Missing end coordinates' });
    }
    if (!waypoints || !Array.isArray(waypoints) || waypoints.length === 0) {
      return Response.json({ success: false, error: 'Missing waypoints' });
    }

    // Validate waypoints have required fields
    for (let i = 0; i < waypoints.length; i++) {
      const wp = waypoints[i];
      if (!wp.id || wp.lat == null || wp.lng == null) {
        return Response.json({ 
          success: false, 
          error: `Waypoint ${i} missing required fields (id, lat, lng)` 
        });
      }
    }

    // Build HERE Waypoint Sequence API URL
    // Format: destination1=wp_id;lat,lng&destination2=wp_id;lat,lng...
    const destinationParams = waypoints.map((wp, idx) =>
      `destination${idx + 1}=wp_${wp.id};${wp.lat},${wp.lng}`
    ).join('&');

    const url = `https://wps.hereapi.com/v8/findsequence2?apiKey=${hereApiKey}` +
      `&start=origin;${start.lat},${start.lng}` +
      `&${destinationParams}` +
      `&end=endpoint;${end.lat},${end.lng}` +
      `&mode=fastest;car;traffic:enabled&improveFor=time`;

    console.log(`Calling HERE API with ${waypoints.length} waypoints...`);

    const response = await fetch(url);

    if (!response.ok) {
      const errorText = await response.text();
      console.error('HERE API error:', response.status, errorText);
      return Response.json({ 
        success: false, 
        error: `HERE returned ${response.status}: ${errorText.substring(0, 200)}` 
      });
    }

    const data = await response.json();
    const hereWaypoints = data.results?.[0]?.waypoints;

    if (!hereWaypoints || !Array.isArray(hereWaypoints)) {
      console.error('HERE response missing waypoints:', JSON.stringify(data).substring(0, 500));
      return Response.json({ 
        success: false, 
        error: 'No waypoints in HERE response' 
      });
    }

    // Extract ordered IDs, skip origin and endpoint, strip wp_ prefix
    const orderedIds = hereWaypoints
      .filter(wp => wp.id !== 'origin' && wp.id !== 'endpoint')
      .map(wp => wp.id.replace(/^wp_/, ''));

    console.log(`HERE optimization successful: ${orderedIds.length} waypoints ordered`);

    return Response.json({ success: true, orderedIds });

  } catch (error) {
    console.error('optimizeCluster error:', error);
    return Response.json({ success: false, error: error.message });
  }
});