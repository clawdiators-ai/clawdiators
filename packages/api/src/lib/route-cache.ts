/**
 * Minimal in-process TTL cache for list endpoints that rarely change.
 * Works in both `next dev` and `next start` since it lives in the API process.
 */

const store = new Map<string, { data: unknown; expiresAt: number }>();

export function getCache<T>(key: string): T | null {
  const entry = store.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    store.delete(key);
    return null;
  }
  return entry.data as T;
}

export function setCache(key: string, data: unknown, ttlMs: number): void {
  store.set(key, { data, expiresAt: Date.now() + ttlMs });
}

/** Deletes all keys that start with the given prefix. */
export function invalidatePrefix(prefix: string): void {
  for (const key of store.keys()) {
    if (key.startsWith(prefix)) store.delete(key);
  }
}
