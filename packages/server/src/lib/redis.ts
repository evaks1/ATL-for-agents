import Redis from "ioredis";

const redisUrl = process.env.REDIS_URL ?? "redis://localhost:6379";

export const redis = new Redis(redisUrl, {
  maxRetriesPerRequest: 3,
  lazyConnect: true,
});

/**
 * Atomically check-and-set a nonce. Returns true if nonce is new (no replay),
 * false if already seen.
 */
export async function checkNonce(nonce: string, ttlSeconds = 86400): Promise<boolean> {
  const key = `nonce:${nonce}`;
  const result = await redis.set(key, "1", "EX", ttlSeconds, "NX");
  return result === "OK";
}

/**
 * Increment a sliding window counter for frequency limiting.
 * Returns current count within the window.
 */
export async function incrementFrequencyCounter(
  grantId: string,
  windowSeconds: number
): Promise<number> {
  const key = `freq:${grantId}:${Math.floor(Date.now() / 1000 / windowSeconds)}`;
  const count = await redis.incr(key);
  if (count === 1) {
    await redis.expire(key, windowSeconds);
  }
  return count;
}
