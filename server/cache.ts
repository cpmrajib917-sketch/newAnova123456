import { initializeApp } from 'firebase/app';
import { getDatabase, ref, get, set } from 'firebase/database';
import Redis from 'ioredis';

// 1. Initialize Firebase client for server-side persistence caching
const firebaseConfig = {
  apiKey: "AIzaSyDJzeY9-2fNut_c5GKUQTuPZY5zVoWPlLI",
  authDomain: "anistreamlivechate-d6739.firebaseapp.com",
  databaseURL: "https://anistreamlivechate-d6739-default-rtdb.firebaseio.com",
  projectId: "anistreamlivechate-d6739",
  storageBucket: "anistreamlivechate-d6739.firebasestorage.app",
  messagingSenderId: "1037965971893",
  appId: "1:1037965971893:web:5e83104d14c17b9cff89fc"
};

const app = initializeApp(firebaseConfig);
export const db = getDatabase(app);

// 2. Initialize production-grade Redis client with fallback
let REDIS_URL = process.env.REDIS_URL || 'redis://default:gQAAAAAAAQsHAAIgcDI1Y2E0NDczZmIzYmM0NGI1YWRjNDk2ZmEyZDJkMmY0Yg@champion-blowfish-68359.upstash.io:6379';

// Clean up environment variables if prefixed with key name or quotes
if (REDIS_URL.startsWith('REDIS_URL=')) {
  REDIS_URL = REDIS_URL.substring('REDIS_URL='.length);
}
if ((REDIS_URL.startsWith('"') && REDIS_URL.endsWith('"')) || (REDIS_URL.startsWith("'") && REDIS_URL.endsWith("'"))) {
  REDIS_URL = REDIS_URL.substring(1, REDIS_URL.length - 1);
}

export let redis: Redis | null = null;

try {
  const connectionOptions: any = {
    maxRetriesPerRequest: 1,
    connectTimeout: 5000,
    retryStrategy(times: number) {
      if (times > 3) {
        return null; // stop retrying to prevent connection loop spam
      }
      return Math.min(times * 100, 2000);
    }
  };

  // Explicitly parse the connection URL to extract host, port, credentials and TLS options.
  // This avoids ioredis interpreting the string as a UNIX domain socket path (triggering ENOENT).
  try {
    const isTls = REDIS_URL.startsWith('rediss:') || REDIS_URL.includes('upstash.io');
    const normalizedUrl = REDIS_URL.replace(/^rediss?:/i, isTls ? 'https:' : 'http:');
    const url = new URL(normalizedUrl);
    
    connectionOptions.host = url.hostname;
    connectionOptions.port = url.port ? parseInt(url.port, 10) : 6379;
    
    if (url.username) {
      connectionOptions.username = url.username;
    }
    if (url.password) {
      connectionOptions.password = decodeURIComponent(url.password);
    }
    if (url.pathname && url.pathname !== '/') {
      const dbIndex = parseInt(url.pathname.substring(1), 10);
      if (!isNaN(dbIndex)) {
        connectionOptions.db = dbIndex;
      }
    }
    
    if (isTls) {
      connectionOptions.tls = {
        rejectUnauthorized: false
      };
    }
  } catch (urlErr: any) {
    console.warn('[Cache] Could not parse REDIS_URL as URL. Using string directly:', urlErr.message);
  }

  // Initialize with either parsed options or string fallback
  if (connectionOptions.host) {
    redis = new Redis(connectionOptions);
  } else {
    redis = new Redis(REDIS_URL, connectionOptions);
  }

  redis.on('error', (err) => {
    console.warn('[Cache] Redis error/offline. Gracefully falling back to Memory & Firebase:', err.message);
  });

  redis.on('connect', () => {
    console.log('[Cache] Redis successfully connected.');
  });
} catch (e: any) {
  console.warn('[Cache] Redis initialization failed:', e.message);
}

// Memory fallback cache in case Redis is offline or loading
const memoryCache = new Map<string, { data: any; cachedAt: number }>();

const DEFAULT_TTL_SECONDS = Number(process.env.REDIS_TTL_SECONDS) || 24 * 60 * 60;

/**
 * General high-fidelity caching fetcher with Stale-While-Revalidate architecture.
 * 1. Checks Redis (or memory cache fallback)
 * 2. If hit and fresh -> returns immediately
 * 3. If hit but stale -> returns immediately AND triggers background async revalidation
 * 4. If miss -> checks Firebase persistent database
 * 5. If hit in Firebase -> returns immediately, updates Redis, and revalidates if stale
 * 6. If both miss -> fetches from source API, saves to Firebase and Redis, and returns
 */
export async function getOrFetch<T>(
  cacheKey: string,
  fetchFn: () => Promise<T>,
  ttlSeconds = DEFAULT_TTL_SECONDS, // Configurable Redis TTL
  staleThresholdMs = 1 * 60 * 60 * 1000 // 1 hour stale threshold
): Promise<T> {
  const firebaseSafeKey = Buffer.from(cacheKey).toString('base64url');
  
  let cachedData: any = null;
  let cachedAt = 0;
  let source = 'miss';

  // Step 1: Check Redis
  if (redis && redis.status === 'ready') {
    try {
      const redisVal = await redis.get(cacheKey);
      if (redisVal) {
        const parsed = JSON.parse(redisVal);
        cachedData = parsed.data;
        cachedAt = parsed.cachedAt || Date.now();
        source = 'redis';
      }
    } catch (e) {
      // Redis fail, fall through to memory fallback
    }
  }

  // Fallback to local memory cache if Redis didn't yield anything
  if (!cachedData) {
    const memCached = memoryCache.get(cacheKey);
    if (memCached) {
      cachedData = memCached.data;
      cachedAt = memCached.cachedAt;
      source = 'memory';
    }
  }

  // Step 2: Check Firebase Database
  if (!cachedData) {
    try {
      const firebaseRef = ref(db, `kryzox_cache/${firebaseSafeKey}`);
      const snap = await get(firebaseRef);
      if (snap && snap.exists && snap.exists()) {
        const val = snap.val();
        cachedData = val.data;
        cachedAt = val.cachedAt || Date.now();
        source = 'firebase';

        // Update Redis and Memory Cache to align them
        if (redis && redis.status === 'ready') {
          redis.setex(cacheKey, ttlSeconds, JSON.stringify({ data: cachedData, cachedAt })).catch(() => {});
        }
        memoryCache.set(cacheKey, { data: cachedData, cachedAt });
      }
    } catch (e) {
      console.error(`[Cache] Firebase read failed for ${cacheKey}:`, e);
    }
  }

  const now = Date.now();

  // Handle cache hit (both fresh and stale)
  if (cachedData !== null && cachedData !== undefined) {
    const isStale = (now - cachedAt) > staleThresholdMs;
    console.log(`[Cache HIT] Key: ${cacheKey} from [${source.toUpperCase()}] ${isStale ? '(STALE - Revalidating)' : '(FRESH)'}`);

    if (isStale) {
      // Trigger background revalidation asynchronously
      revalidateBackground(cacheKey, firebaseSafeKey, fetchFn, ttlSeconds).catch(err => {
        console.error(`[Cache] Stale revalidation failed for ${cacheKey}:`, err);
      });
    }

    return cachedData as T;
  }

  // Step 3: Cache Miss -> Fetch from API origin synchronously
  console.log(`[Cache MISS] Key: ${cacheKey}. Fetching from origin API...`);
  const freshData = await fetchFn();

  if (freshData !== null && freshData !== undefined) {
    await saveToCache(cacheKey, firebaseSafeKey, freshData, ttlSeconds);
  }

  return freshData;
}

/**
 * Saves a key-value payload to Memory, Redis, and Firebase
 */
async function saveToCache(cacheKey: string, firebaseSafeKey: string, data: any, ttlSeconds: number) {
  const cachedAt = Date.now();
  const payload = { data, cachedAt };

  // 1. Write to Memory Cache
  memoryCache.set(cacheKey, payload);

  // 2. Write to Redis (asynchronously)
  if (redis && redis.status === 'ready') {
    try {
      await redis.setex(cacheKey, ttlSeconds, JSON.stringify(payload));
    } catch (e) {
      // Redis set fail
    }
  }

  // 3. Write to Firebase Realtime Database (asynchronously)
  try {
    const firebaseRef = ref(db, `kryzox_cache/${firebaseSafeKey}`);
    await set(firebaseRef, payload);
  } catch (e) {
    console.error(`[Cache] Firebase save failed for ${cacheKey}:`, e);
  }
}

/**
 * Refreshes cache data in the background asynchronously
 */
async function revalidateBackground(cacheKey: string, firebaseSafeKey: string, fetchFn: () => Promise<any>, ttlSeconds: number) {
  try {
    const freshData = await fetchFn();
    if (freshData !== null && freshData !== undefined) {
      await saveToCache(cacheKey, firebaseSafeKey, freshData, ttlSeconds);
      console.log(`[Cache Revalidate SUCCESS] Updated key: ${cacheKey}`);
    }
  } catch (e) {
    console.error(`[Cache Revalidate FAIL] Key: ${cacheKey} error:`, e);
  }
}
