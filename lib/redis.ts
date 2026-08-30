// lib/redis.ts — Upstash Redis (REST API) cache layer.
//
// HTTP-based, no persistent connection — safe for Vercel serverless where
// every invocation is a fresh process. Used as an L2 cache sitting BEHIND
// webhook.ts's existing in-memory per-instance caches: the in-memory cache
// (fetchManagerDataCached etc.) only helps within one warm instance, but
// under concurrent/burst traffic Vercel spins up several instances in
// parallel, each starting with an empty in-memory cache. Redis is shared
// across all of them, so it's the layer that actually helps at real scale.
//
// Every function here fails soft (returns null / no-ops) on any error or if
// the env vars aren't configured — a cache miss or Redis hiccup must never
// break a request; the caller always falls back to Supabase.
const REDIS_URL = process.env.UPSTASH_REDIS_REST_URL;
const REDIS_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN;
const configured = !!(REDIS_URL && REDIS_TOKEN);

async function redisCommand<T = any>(cmd: (string | number)[]): Promise<T | null> {
  if (!configured) return null;
  try {
    const res = await fetch(REDIS_URL!, {
      method: 'POST',
      headers: { Authorization: `Bearer ${REDIS_TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(cmd),
    });
    if (!res.ok) {
      console.error('[redis]', res.status, await res.text());
      return null;
    }
    const data: any = await res.json();
    return (data?.result ?? null) as T;
  } catch (e: any) {
    console.error('[redis]', e?.message);
    return null;
  }
}

// Reads a JSON value previously stored with redisSetJSON. Returns null on a
// cache miss, parse failure, or any Redis error — never throws.
export async function redisGetJSON<T = any>(key: string): Promise<T | null> {
  const raw = await redisCommand<string>(['GET', key]);
  if (raw == null) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

// Stores a JSON-serializable value with a TTL (seconds). Fire-and-forget —
// callers should not await this on the response-critical path.
export async function redisSetJSON(key: string, value: any, ttlSeconds: number): Promise<void> {
  await redisCommand(['SET', key, JSON.stringify(value), 'EX', ttlSeconds]);
}

// Deletes a key — used to invalidate the L2 cache at the same points the
// existing in-memory cache is invalidated, so writes stay consistent.
export async function redisDel(key: string): Promise<void> {
  await redisCommand(['DEL', key]);
}
