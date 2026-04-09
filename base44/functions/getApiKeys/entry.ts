import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    return Response.json({
      mapquest_api_key: Deno.env.get('MAPQUEST_API_KEY') || null,
      here_api_key: Deno.env.get('HERE_API_KEY') || null,
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});