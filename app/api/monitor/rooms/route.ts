import { env } from 'cloudflare:workers';

// Only aggregate counts are exposed to the owner's monitoring process.
export async function GET(request: Request) {
  const token = (env as unknown as Record<string, string>).ROOM_MONITOR_TOKEN;
  if (!token || request.headers.get('authorization') !== `Bearer ${token}`) {
    return new Response(null, { status: 404 });
  }
  const db = env.DB;
  if (!db) return new Response(null, { status: 503 });
  const now = Date.now();
  const result = await db.prepare('SELECT COUNT(*) AS count FROM rooms WHERE expires_at > ?')
    .bind(now).first<{ count: number }>();
  return Response.json({ activeRooms: result?.count ?? 0, checkedAt: new Date(now).toISOString() },
    { headers: { 'Cache-Control': 'no-store, private', 'Vary': 'Authorization' } });
}
