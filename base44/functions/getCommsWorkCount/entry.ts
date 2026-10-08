import { createClientFromRequest } from 'npm:@base44/sdk@0.8.52';

const COMMS_COUNT_URL = 'https://comms.achtungkraft.com/functions/getActionableWorkCount';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me().catch(() => null);
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    if (user.role !== 'admin') {
      const members = await base44.asServiceRole.entities.TeamMember.filter({ user_id: user.id });
      if (!members.some((m) => m.is_achtung_kraft_member)) {
        return Response.json({ error: 'Forbidden' }, { status: 403 });
      }
    }

    const token = Deno.env.get('COMMS_COUNT_TOKEN');
    if (!token) return Response.json({ error: 'COMMS count not configured' }, { status: 503 });

    let res;
    try {
      res = await fetch(COMMS_COUNT_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-ak-comms-token': token },
        body: '{}',
        signal: AbortSignal.timeout(8000),
      });
    } catch (e) {
      console.error('COMMS count fetch failed:', e?.name);
      return Response.json({ error: 'COMMS unavailable' }, { status: 504 });
    }

    if (!res.ok) {
      console.error('COMMS count upstream status:', res.status);
      return Response.json({ error: 'COMMS unavailable' }, { status: 502 });
    }

    const data = await res.json().catch(() => null);
    const total = data?.total;
    if (!Number.isSafeInteger(total) || total < 0) {
      return Response.json({ error: 'Invalid COMMS response' }, { status: 502 });
    }
    return Response.json({ total });
  } catch (error) {
    console.error('getCommsWorkCount error:', error?.message);
    return Response.json({ error: 'Internal error' }, { status: 500 });
  }
});