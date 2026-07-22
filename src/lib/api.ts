// @ts-nocheck
import { Anime } from '../types';
import { ref, get, set, onValue } from "firebase/database";
import { db } from "./firebase";

const BASE_URL = "/api/kryzox";

export interface GlobalContentSettings {
  myDatabase: boolean;
  fourAnimo: boolean;
  imported: boolean;
  hideRestrictedPlaylists: boolean;
  hideMembersOnly: boolean;
  hideEmbedDisabled: boolean;
  hideRegionLocked: boolean;
  hidePrivatePlaylists: boolean;
  hidePlaybackRestricted: boolean;
}

export let globalSettings: GlobalContentSettings = {
  myDatabase: true,
  fourAnimo: true,
  imported: true,
  hideRestrictedPlaylists: false,
  hideMembersOnly: false,
  hideEmbedDisabled: false,
  hideRegionLocked: false,
  hidePrivatePlaylists: false,
  hidePlaybackRestricted: false
};

// Check if we are running in browser context
const isBrowser = typeof window !== 'undefined';

export const brokenAnimesSet = new Set<string>();

if (isBrowser) {
  try {
    const saved = localStorage.getItem('anova_global_content_settings');
    if (saved) {
      globalSettings = { ...globalSettings, ...JSON.parse(saved) };
    }
  } catch (_) {}

  // Sync brokenAnimes from Firebase Database
  try {
    const brokenRef = ref(db, 'brokenAnimes');
    onValue(brokenRef, (snapshot) => {
      brokenAnimesSet.clear();
      if (snapshot.exists()) {
        const val = snapshot.val();
        Object.keys(val).forEach(id => {
          if (val[id] === true) {
            brokenAnimesSet.add(String(id));
          }
        });
      }
    });
  } catch (err) {
    console.error("Failed to sync brokenAnimes:", err);
  }
}

export function normalizeAndCleanEpisodes(eps: any[], animeType?: string): any[] {
  if (!Array.isArray(eps)) return [];
  
  const getYoutubeId = (url: string): string | null => {
    if (!url) return null;
    const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|\&v=)([^#\&\?]*).*/;
    const match = url.match(regExp);
    return (match && match[2].length === 11) ? match[2] : null;
  };

  const mapped = eps.map(ep => {
    const num = Number(ep.episodeNumber !== undefined ? ep.episodeNumber : ep.number);
    return {
      ...ep,
      number: num,
      episodeNumber: num,
      title: ep.title || `Episode ${num}`,
      thumbnail: ep.thumbnail || '',
      videoSources: ep.videoSources || ep.video_sources || {}
    };
  }).filter(ep => {
    // 9. Validate every episode before adding: episodeNumber must exist
    if (isNaN(ep.episodeNumber) || ep.episodeNumber === null || ep.episodeNumber === undefined) {
      return false;
    }
    
    const titleLower = (ep.title || '').toLowerCase();
    
    // 8. Ignore shorts, clips, trailers, previews and highlights
    const isShortOrPreview = titleLower.includes('short') || 
                             titleLower.includes('clip') || 
                             titleLower.includes('trailer') || 
                             titleLower.includes('preview') || 
                             titleLower.includes('highlight') ||
                             titleLower.includes('teaser') ||
                             titleLower.includes('promo') ||
                             titleLower.includes('interview');
                             
    if (isShortOrPreview) {
      return false;
    }
    
    // Validate duration if available
    let durationInSeconds = 0;
    if (ep.duration) {
      durationInSeconds = Number(ep.duration);
    } else if (ep.lengthSeconds) {
      durationInSeconds = Number(ep.lengthSeconds);
    } else if (ep.durationInSeconds) {
      durationInSeconds = Number(ep.durationInSeconds);
    } else if (ep.duration_seconds) {
      durationInSeconds = Number(ep.duration_seconds);
    }
    
    if (durationInSeconds > 0) {
      const typeLower = (animeType || '').toLowerCase();
      if (typeLower !== 'short') {
        // Remove videos shorter than 15 minutes (900 seconds)
        if (durationInSeconds < 900) {
          return false;
        }
        // duration should be at least 20 minutes (1200 seconds) for TV anime
        if (typeLower === 'tv' && durationInSeconds < 1200) {
          return false;
        }
      }
    }
    
    return true;
  });

  // Keep the longest full episode if duplicate episode numbers exist
  const dedupedByNum: Record<number, any> = {};
  mapped.forEach(ep => {
    const epNum = ep.episodeNumber;
    const existing = dedupedByNum[epNum];
    if (!existing) {
      dedupedByNum[epNum] = ep;
    } else {
      const existingDuration = Number(existing.duration || existing.lengthSeconds || existing.durationInSeconds || existing.duration_seconds || 0);
      const epDuration = Number(ep.duration || ep.lengthSeconds || ep.durationInSeconds || ep.duration_seconds || 0);
      if (epDuration > existingDuration) {
        dedupedByNum[epNum] = ep;
      }
    }
  });

  const sortedByNum = Object.values(dedupedByNum).sort((a, b) => Number(a.episodeNumber) - Number(b.episodeNumber));

  // Detect and filter out duplicate YouTube IDs across all episodes to ensure uniqueness
  // "Never assign the same video to multiple episode numbers"
  const seenVideoIdsByLanguage: Record<string, Set<string>> = {
    sub: new Set<string>(),
    eng_dub: new Set<string>(),
    hindi_dub: new Set<string>(),
    other: new Set<string>()
  };

  const finalEpisodes: any[] = [];
  sortedByNum.forEach(ep => {
    const sources = ep.videoSources || {};
    let isDuplicateVideo = false;

    ['sub', 'eng_dub', 'hindi_dub', 'other'].forEach(lang => {
      const src = sources[lang];
      if (src && src.enabled && src.url) {
        const ytId = getYoutubeId(src.url);
        if (ytId) {
          if (seenVideoIdsByLanguage[lang].has(ytId)) {
            isDuplicateVideo = true;
          } else {
            seenVideoIdsByLanguage[lang].add(ytId);
          }
        }
      }
    });

    if (!isDuplicateVideo) {
      finalEpisodes.push(ep);
    }
  });

  // Sort final episodes by episodeNumber in ascending order
  return finalEpisodes.sort((a, b) => Number(a.episodeNumber) - Number(b.episodeNumber));
}

export const CORE_CATEGORIES = new Set([
  'featured',
  'trending',
  'popular',
  'topAiring',
  'recentlyAdded',
  'latest',
  'favorite',
  'completed',
  'upcoming',
  'ongoing',
  'movies',
  'hindi-dubbed'
]);

export const hasCategory = (anime: any, category: string): boolean => {
  if (!anime || !anime.categories) return false;
  
  // Try exact key match
  if (anime.categories[category] === true) return true;
  
  // Try case-insensitive key match
  const lowerCat = category.toLowerCase();
  for (const [key, value] of Object.entries(anime.categories)) {
    if (value === true && key.toLowerCase() === lowerCat) {
      return true;
    }
  }
  
  // Try normalized slug match (alphanumeric only)
  const normCat = lowerCat.replace(/[^a-z0-9]/g, '');
  for (const [key, value] of Object.entries(anime.categories)) {
    if (value === true && key.toLowerCase().replace(/[^a-z0-9]/g, '') === normCat) {
      return true;
    }
  }

  return false;
};

export const parseAnimeGenres = (genresInput: any): string[] => {
  if (!genresInput) return [];
  let rawList: string[] = [];
  if (Array.isArray(genresInput)) {
    rawList = genresInput.map(g => String(g));
  } else if (typeof genresInput === 'string') {
    rawList = genresInput.split(/[,\/|;]+/);
  }
  
  const seen = new Set<string>();
  const normalized: string[] = [];
  rawList.forEach(g => {
    const trimmed = g.trim();
    if (!trimmed) return;
    const lower = trimmed.toLowerCase();
    if (!seen.has(lower)) {
      seen.add(lower);
      normalized.push(trimmed);
    }
  });
  return normalized;
};

export const matchGenre = (categoryNameOrSlug: string, animeGenres: string[]): boolean => {
  if (!categoryNameOrSlug) return false;
  
  const cleanString = (str: string) => {
    return str
      .toLowerCase()
      .replace(/[\u1F600-\u1F64F\u1F300-\u1F5FF\u1F680-\u1F6FF\u1F1E0-\u1F1FF\u2700-\u27BF\u1F900-\u1F9FF\u1F018-\u1F0F5\u1F300-\u1F5FF\u1F600-\u1F64F\u1F680-\u1F6FF\u1F900-\u1F9FF\u2600-\u26FF\u2700-\u27BF]/g, '')
      .replace(/[^a-z0-9 ]/g, '')
      .trim();
  };

  const normCategory = cleanString(categoryNameOrSlug);
  if (!normCategory) return false;

  return animeGenres.some(genre => {
    const normGenre = cleanString(genre);
    if (!normGenre) return false;
    
    const strictCategory = normCategory.replace(/\s+/g, '');
    const strictGenre = normGenre.replace(/\s+/g, '');
    
    if (strictCategory === strictGenre) return true;
    if (strictCategory.includes(strictGenre) || strictGenre.includes(strictCategory)) return true;
    
    const GENRE_ALIASES: Record<string, string[]> = {
      'scifi': ['scifi', 'sci-fi', 'sci fi', 'science fiction', 'sciencefiction'],
      'shounen': ['shounen', 'shonen'],
      'martialarts': ['martial arts', 'martialarts', 'martial_arts', 'martial-arts'],
      'sliceoflife': ['slice of life', 'sliceoflife', 'slice_of_life', 'slice-of-life'],
      'supernatural': ['supernatural'],
      'psychological': ['psychological'],
      'adventure': ['adventure'],
      'fantasy': ['fantasy'],
      'action': ['action'],
      'romance': ['romance'],
      'comedy': ['comedy'],
      'school': ['school'],
      'horror': ['horror'],
      'mystery': ['mystery'],
      'music': ['music'],
      'historical': ['historical'],
      'sports': ['sports', 'sport'],
      'harem': ['harem'],
      'ecchi': ['ecchi'],
      'drama': ['drama'],
      'isekai': ['isekai'],
      'thriller': ['thriller']
    };

    for (const [key, aliases] of Object.entries(GENRE_ALIASES)) {
      const normAliases = aliases.map(a => cleanString(a).replace(/\s+/g, ''));
      if (normAliases.includes(strictCategory) && normAliases.includes(strictGenre)) {
        return true;
      }
    }

    return false;
  });
};

const cache = new Map<string, { data: any, timestamp: number }>();

export function clearAnimeCaches() {
  cache.clear();
  if (typeof localStorage !== 'undefined') {
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && (key.startsWith('swr_') || key.includes('custom_category_') || key.includes('anime_info_') || key.includes('episodes_') || key.includes('api_home_data'))) {
          localStorage.removeItem(key);
          i--;
        }
      }
    } catch (_) {}
  }
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('anova_anime_updated'));
  }
}

// Hook up Realtime Database listener for content source visibility settings
try {
  const settingsRef = ref(db, 'globalContentSettings');
  onValue(settingsRef, (snap) => {
    if (snap.exists()) {
      const val = snap.val();
      globalSettings = {
        myDatabase: val.myDatabase !== false,
        fourAnimo: val.fourAnimo !== false,
        imported: val.imported !== false,
        hideRestrictedPlaylists: !!val.hideRestrictedPlaylists,
        hideMembersOnly: !!val.hideMembersOnly,
        hideEmbedDisabled: !!val.hideEmbedDisabled,
        hideRegionLocked: !!val.hideRegionLocked,
        hidePrivatePlaylists: !!val.hidePrivatePlaylists,
        hidePlaybackRestricted: !!val.hidePlaybackRestricted
      };
      if (isBrowser) {
        try {
          localStorage.setItem('anova_global_content_settings', JSON.stringify(globalSettings));
          // Dispatch a custom event to trigger instant re-fetch in UI
          window.dispatchEvent(new CustomEvent('anova_content_settings_changed', { detail: globalSettings }));
        } catch (_) {}
      }
      clearAnimeCaches();
    }
  }, (err) => {
    console.error("Failed to sync globalContentSettings:", err);
  });
} catch (e) {
  console.warn("Could not set up globalContentSettings real-time sync:", e);
}
const CACHE_TTL = 10 * 60 * 1000; // 10 minutes cache TTL for ultimate speed

const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

const activePromises = new Map<string, Promise<any>>();

export function dedupeRequest<T>(key: string, fetcher: () => Promise<T>): Promise<T> {
  let active = activePromises.get(key);
  if (!active) {
    active = fetcher().then((res) => {
      activePromises.delete(key);
      return res;
    }).catch((err) => {
      activePromises.delete(key);
      throw err;
    });
    activePromises.set(key, active);
  }
  return active;
}

export function getPerfSettings() {
  const defaults = {
    smartPrefetch: true,
    smartCache: true,
    autoServerRanking: true,
    autoRetry: true,
    autoFailover: true,
    dnsPrefetch: true,
    preconnect: true,
    backgroundPreload: true,
    responseCache: true,
    compression: true,
  };
  try {
    const saved = localStorage.getItem('anova_perf_settings');
    if (saved) {
      return { ...defaults, ...JSON.parse(saved) };
    }
  } catch (_) {}
  return defaults;
}

export function safeLocalStorageSet(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch (error) {
    console.warn(`[Storage] Failed to set ${key}, attempting to clear cached data to free space:`, error);
    try {
      // Proactively clear SWR cache keys, home section caches, and resolved IDs to free up storage
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k && (
          k.startsWith('swr_') || 
          k.startsWith('resolved_ids_') || 
          k.includes('home_section_data_') || 
          k.includes('api_home_data')
        )) {
          localStorage.removeItem(k);
          i--;
        }
      }
      // Retry setting the vital key
      localStorage.setItem(key, value);
    } catch (retryError) {
      console.error(`[Storage Critical] Failed to set ${key} even after cache clear:`, retryError);
    }
  }
}

export const apiCache = {
  get: (key: string): any => {
    const settings = getPerfSettings();
    if (!settings.smartCache && !settings.responseCache) {
      return null;
    }
    // Memory Cache
    const mem = cache.get(key);
    if (mem && (Date.now() - mem.timestamp < CACHE_TTL)) {
      return mem.data;
    }
    // LocalStorage Cache
    try {
      const stored = localStorage.getItem(`swr_v4_${key}`);
      if (stored) {
        const parsed = JSON.parse(stored);
        cache.set(key, { data: parsed, timestamp: Date.now() });
        return parsed;
      }
    } catch (_) {}
    return null;
  },
  set: (key: string, data: any) => {
    const settings = getPerfSettings();
    if (!settings.smartCache && !settings.responseCache) {
      return;
    }
    if (data === null || data === undefined) return;
    cache.set(key, { data, timestamp: Date.now() });
    safeLocalStorageSet(`swr_v4_${key}`, JSON.stringify(data));
  },
  delete: (key: string) => {
    cache.delete(key);
    try {
      localStorage.removeItem(`swr_v4_${key}`);
    } catch (_) {}
  }
};

// clearAnimeCaches is declared above on line 34

export interface ApiLog {
  id: string;
  url: string;
  statusCode: number | string;
  responseBody: string;
  headers: Record<string, string>;
  timing: number;
  retryCount: number;
  error?: string;
  timestamp: number;
}

if (typeof window !== 'undefined') {
  (window as any).__anova_api_logs = (window as any).__anova_api_logs || [];
}

export function logApiRequest(log: ApiLog) {
  if (typeof window !== 'undefined') {
    (window as any).__anova_api_logs = [log, ...(window as any).__anova_api_logs].slice(0, 50);
    window.dispatchEvent(new CustomEvent('anova_api_log_added', { detail: log }));
  }
}

const withTimeout = <T>(promise: Promise<T>, ms: number, fallback: T): Promise<T> => {
  return Promise.race([
    promise.catch((err) => {
      console.warn("withTimeout promise rejected, using fallback:", err);
      return fallback;
    }),
    new Promise<T>((resolve) => setTimeout(() => resolve(fallback), ms))
  ]);
};

async function fetchApi(endpoint: string, retries = 3, delayMs = 1000, currentAttempt = 0): Promise<any> {
  const settings = getPerfSettings();
  const cacheKey = `fetch_${endpoint}`;
  const localData = apiCache.get(cacheKey);
  const fullUrl = `${BASE_URL}${endpoint}`;
  const startTime = performance.now();

  const fetcherPromise = (async () => {
    let statusCode: number | string = 'Unknown';
    let responseText = '';
    let headersObj: Record<string, string> = {};
    let errorMsg = '';

    // If autoRetry is disabled, force 0 retries
    const activeRetries = settings.autoRetry ? retries : 0;

    try {
      const controller = new AbortController();
      const tId = setTimeout(() => controller.abort(), 4500);
      const res = await fetch(fullUrl, { signal: controller.signal });
      clearTimeout(tId);
      statusCode = res.status;
      
      try {
        res.headers.forEach((val, key) => {
          headersObj[key] = val;
        });
      } catch (_) {}

      const contentType = res.headers.get('content-type') || '';
      responseText = await res.clone().text();

      if (!res.ok) {
        if (responseText.includes('cloudflare') || responseText.includes('cf-browser-verification') || responseText.includes('Just a moment...')) {
          errorMsg = `Cloudflare protection page detected. Status: ${res.status}`;
        } else if (contentType.includes('text/html') || responseText.trim().startsWith('<')) {
          errorMsg = `HTML returned instead of JSON. Status: ${res.status}`;
        } else {
          errorMsg = `HTTP Error ${res.status}`;
        }

        const duration = Math.round(performance.now() - startTime);
        
        // Log Perf metrics
        if (typeof window !== 'undefined') {
          const m = (window as any).__anova_perf_metrics || { apiResponseTimes: [], embedLoadTimes: [], playerInitTimes: [], cacheHits: 0, cacheMisses: 0, retries: 0 };
          m.apiResponseTimes.push(duration);
          m.retries += currentAttempt;
          (window as any).__anova_perf_metrics = m;
        }

        logApiRequest({
          id: `${Date.now()}-${Math.random()}`,
          url: fullUrl,
          statusCode,
          responseBody: responseText.slice(0, 500),
          headers: headersObj,
          timing: duration,
          retryCount: currentAttempt,
          error: errorMsg,
          timestamp: Date.now()
        });

        if (res.status === 429 || res.status >= 500) {
          if (activeRetries > 0) {
            await delay(delayMs);
            return fetchApi(endpoint, activeRetries - 1, delayMs * 2, currentAttempt + 1);
          }
          if (localData) return localData;
        }
        throw new Error(errorMsg);
      }

      if (contentType.includes('text/html') || responseText.trim().startsWith('<')) {
        errorMsg = "HTML returned instead of JSON despite 200 OK status";
        if (responseText.includes('cloudflare') || responseText.includes('cf-browser-verification') || responseText.includes('Just a moment...')) {
          errorMsg = "Cloudflare security/challenge block page (200 OK HTML)";
        }
        
        const duration = Math.round(performance.now() - startTime);
        
        // Log Perf metrics
        if (typeof window !== 'undefined') {
          const m = (window as any).__anova_perf_metrics || { apiResponseTimes: [], embedLoadTimes: [], playerInitTimes: [], cacheHits: 0, cacheMisses: 0, retries: 0 };
          m.apiResponseTimes.push(duration);
          m.retries += currentAttempt;
          (window as any).__anova_perf_metrics = m;
        }

        logApiRequest({
          id: `${Date.now()}-${Math.random()}`,
          url: fullUrl,
          statusCode,
          responseBody: responseText.slice(0, 500),
          headers: headersObj,
          timing: duration,
          retryCount: currentAttempt,
          error: errorMsg,
          timestamp: Date.now()
        });

        if (activeRetries > 0) {
          await delay(delayMs);
          return fetchApi(endpoint, activeRetries - 1, delayMs * 2, currentAttempt + 1);
        }
        if (localData) return localData;
        throw new Error(errorMsg);
      }

      let data;
      try {
        data = JSON.parse(responseText);
      } catch (e: any) {
        errorMsg = `JSON parsing failed: ${e.message}`;
        const duration = Math.round(performance.now() - startTime);
        logApiRequest({
          id: `${Date.now()}-${Math.random()}`,
          url: fullUrl,
          statusCode,
          responseBody: responseText.slice(0, 500),
          headers: headersObj,
          timing: duration,
          retryCount: currentAttempt,
          error: errorMsg,
          timestamp: Date.now()
        });
        throw new Error(errorMsg);
      }

      const duration = Math.round(performance.now() - startTime);

      // Log Perf metrics
      if (typeof window !== 'undefined') {
        const m = (window as any).__anova_perf_metrics || { apiResponseTimes: [], embedLoadTimes: [], playerInitTimes: [], cacheHits: 0, cacheMisses: 0, retries: 0 };
        m.apiResponseTimes.push(duration);
        m.retries += currentAttempt;
        (window as any).__anova_perf_metrics = m;
      }

      logApiRequest({
        id: `${Date.now()}-${Math.random()}`,
        url: fullUrl,
        statusCode,
        responseBody: responseText.slice(0, 100),
        headers: headersObj,
        timing: duration,
        retryCount: currentAttempt,
        timestamp: Date.now()
      });

      apiCache.set(cacheKey, data);
      return data;

    } catch (error: any) {
      if (statusCode === 'Unknown') {
        statusCode = 'CORS Blocked/Network Error';
        errorMsg = error.message || 'Network fetch rejected (likely CORS, CSP or server offline)';
      } else {
        errorMsg = error.message || 'Unknown fetch error';
      }

      const duration = Math.round(performance.now() - startTime);

      // Log Perf metrics
      if (typeof window !== 'undefined') {
        const m = (window as any).__anova_perf_metrics || { apiResponseTimes: [], embedLoadTimes: [], playerInitTimes: [], cacheHits: 0, cacheMisses: 0, retries: 0 };
        m.apiResponseTimes.push(duration);
        m.retries += currentAttempt;
        (window as any).__anova_perf_metrics = m;
      }

      logApiRequest({
        id: `${Date.now()}-${Math.random()}`,
        url: fullUrl,
        statusCode,
        responseBody: responseText ? responseText.slice(0, 500) : 'No response content available due to network error.',
        headers: headersObj,
        timing: duration,
        retryCount: currentAttempt,
        error: errorMsg,
        timestamp: Date.now()
      });

      console.warn(`AnOvA client status: fetch failed for ${endpoint} (${errorMsg}).`);
      
      if (activeRetries > 0) {
        await delay(delayMs);
        return fetchApi(endpoint, activeRetries - 1, delayMs * 2, currentAttempt + 1);
      }

      // Auto failover support: return local stale data if failover is enabled
      if (settings.autoFailover && localData) {
        console.info(`Auto Failover triggered for ${endpoint}. Returning stale local cache.`);
        return localData;
      }
      return null;
    }
  })();

  const dedupedPromise = dedupeRequest(cacheKey, () => fetcherPromise);

  if (localData) {
    dedupedPromise.catch(() => {});
    return localData;
  }

  return dedupedPromise;
}

export const fallbackAnimes = [
  {
    id: "another",
    title: "Another",
    poster: "https://images.unsplash.com/photo-1509198397868-475647b2a1e5?w=300&auto=format&fit=crop&q=65",
    banner: "https://images.unsplash.com/photo-1509198397868-475647b2a1e5?w=800&auto=format&fit=crop&q=65",
    type: "TV",
    status: "Completed",
    episodes: 12,
    rating: "8.5",
    description: "In 1972, a popular student in Yomiyama North Middle School's class 3-3 named Misaki passed away during the school year. Since then, the town of Yomiyama has been shrouded by a fearful atmosphere, from the dark secrets in the school's history.",
    genres: ["Horror", "Mystery", "Supernatural", "Thriller"],
    studio: "P.A. Works"
  },
  {
    id: "tokyoghoul",
    title: "Tokyo Ghoul",
    poster: "https://images.unsplash.com/photo-1563089145-599997674d42?w=300&auto=format&fit=crop&q=65",
    banner: "https://images.unsplash.com/photo-1563089145-599997674d42?w=800&auto=format&fit=crop&q=65",
    type: "TV",
    status: "Completed",
    episodes: 12,
    rating: "8.5",
    description: "Tokyo has become a cruel and merciless city—a place where vicious creatures called ghouls exist alongside humans. Kaneki Ken is a quiet, bookish college student who gets attacked by a ghoul, transforming him into a half-ghoul half-human hybrid.",
    genres: ["Action", "Horror", "Mystery", "Supernatural"],
    studio: "Studio Pierrot"
  },
  {
    id: "mierukochan",
    title: "Mieruko-chan",
    poster: "https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=300&auto=format&fit=crop&q=65",
    banner: "https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=800&auto=format&fit=crop&q=65",
    type: "TV",
    status: "Completed",
    episodes: 12,
    rating: "8.1",
    description: "Miko Yotsuya's eyes water as she threads a fine line between keeping her sanity and escaping the grotesque monsters that haunt her daily life.",
    genres: ["Comedy", "Horror", "Supernatural"],
    studio: "Passione"
  },
  {
    id: "12",
    title: "One Piece",
    poster: "https://api.kryzox.xyz/poster/12.jpg",
    banner: "https://api.kryzox.xyz/banner/12.jpg",
    type: "TV",
    status: "Ongoing",
    episodes: 1100,
    rating: "9.1",
    description: "Gold Roger was known as the Pirate King, the strongest and most infamous being to have sailed the Grand Line. The capture and execution of Roger by the World Government brought a change throughout the world. His last words before his death revealed the existence of the greatest treasure in the world, One Piece. It was this revelation that brought about the Grand Age of Pirates, men who dreamed of finding One Piece—which promises an unlimited amount of riches and fame—and quite possibly the pinnacle of glory and the title of the Pirate King.",
    genres: ["Action", "Adventure", "Fantasy", "Shounen"],
    studio: "Toei Animation"
  },
  {
    id: "11",
    title: "Naruto: Shippuden",
    poster: "https://images.unsplash.com/photo-1578632767115-351597cf2477?w=600&auto=format&fit=crop&q=80",
    banner: "https://images.unsplash.com/photo-1533174072545-7a4b6ad7a6c3?w=1200&auto=format&fit=crop&q=80",
    type: "TV",
    status: "Completed",
    episodes: 500,
    rating: "8.6",
    description: "It has been two and a half years since Naruto Uzumaki left Konohagakure, the Hidden Leaf Village, for intense training following events which fueled his desire to be stronger. Now the Akatsuki, the mysterious organization of elite rogue ninja, is closing in on their grand plan which may threaten the safety of the entire shinobi world.",
    genres: ["Action", "Adventure", "Fantasy", "Shounen"],
    studio: "Studio Pierrot"
  },
  {
    id: "6436",
    title: "Attack on Titan",
    poster: "https://images.unsplash.com/photo-1620641788421-7a1c342ea42e?w=600&auto=format&fit=crop&q=80",
    banner: "https://images.unsplash.com/photo-1613376023733-0a73315d9b06?w=1200&auto=format&fit=crop&q=80",
    type: "TV",
    status: "Completed",
    episodes: 75,
    rating: "9.0",
    description: "Centuries ago, mankind was slaughtered to near extinction by monstrous humanoid creatures called titans, forcing humans to hide in fear behind enormous concentric walls. What makes these giants truly terrifying is that their taste for human flesh is not born of hunger but what seems to be out of pleasure. To ensure their survival, the remnants of humanity began living within defensive barriers, resulting in one hundred years without a single titan encounter.",
    genres: ["Action", "Drama", "Fantasy", "Mystery"],
    studio: "MAPPA"
  },
  {
    id: "15334",
    title: "Demon Slayer: Kimetsu no Yaiba",
    poster: "https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=600&auto=format&fit=crop&q=80",
    banner: "https://images.unsplash.com/photo-1534447677768-be436bb09401?w=1200&auto=format&fit=crop&q=80",
    type: "TV",
    status: "Ongoing",
    episodes: 55,
    rating: "8.7",
    description: "Ever since the death of his father, the burden of supporting the family has fallen upon Tanjirou Kamado's shoulders. Though living impoverished on a remote mountain, the Kamado family are able to enjoy a relatively peaceful and happy life. One day, Tanjirou decides to go down to the local village to make a little money by selling charcoal. On his way back, night falls, forcing Tanjirou to shelter in the house of a strange man, who warns him of the existence of flesh-eating demons that lurk in the woods at night.",
    genres: ["Action", "Fantasy", "Historical", "Shounen"],
    studio: "ufotable"
  },
  {
    id: "11777",
    title: "Jujutsu Kaisen",
    poster: "https://images.unsplash.com/photo-1509198397868-475647b2a1e5?w=600&auto=format&fit=crop&q=80",
    banner: "https://images.unsplash.com/photo-1518709268805-4e9042af9f23?w=1200&auto=format&fit=crop&q=80",
    type: "TV",
    status: "Completed",
    episodes: 47,
    rating: "8.8",
    description: "Idly indulging in baseless paranormal activities with the Occult Club, high schooler Yuuji Itadori spends his days at either the clubroom or the hospital, where he visits his bedridden grandfather. However, this leisurely lifestyle soon takes a turn for the strange when he unknowingly encounters a cursed item. Triggering a chain of supernatural occurrences, Yuuji finds himself suddenly thrust into the world of Curses—terrible beings formed from human malice and negativity—after swallowing the said item, revealed to be a finger belonging to the demon Ryomen Sukuna, the 'King of Curses.'",
    genres: ["Action", "Fantasy", "School", "Shounen"],
    studio: "MAPPA"
  },
  {
    id: "16262",
    title: "Solo Leveling",
    poster: "https://images.unsplash.com/photo-1563089145-599997674d42?w=600&auto=format&fit=crop&q=80",
    banner: "https://images.unsplash.com/photo-1542751371-adc38448a05e?w=1200&auto=format&fit=crop&q=80",
    type: "TV",
    status: "Ongoing",
    episodes: 12,
    rating: "8.5",
    description: "In a world where hunters, humans who possess supernatural abilities, must battle deadly monsters to protect mankind from quite certain annihilation, a notoriously weak hunter named Sung Jinwoo finds himself in a struggle for survival. After narrowly surviving an overwhelmingly powerful double dungeon that nearly wipes out his entire party, a mysterious program called the System selects him as its sole player and in turn, gives him the extremely rare ability to level up in strength, possibly beyond any known limits.",
    genres: ["Action", "Adventure", "Fantasy"],
    studio: "A-1 Pictures"
  },
  {
    id: "13508",
    title: "Chainsaw Man",
    poster: "https://images.unsplash.com/photo-1613376023733-0a73315d9b06?w=600&auto=format&fit=crop&q=80",
    banner: "https://images.unsplash.com/photo-1620641788421-7a1c342ea42e?w=1200&auto=format&fit=crop&q=80",
    type: "TV",
    status: "Completed",
    episodes: 12,
    rating: "8.6",
    description: "Denji has a simple dream—to live a happy and peaceful life, spending time with a girl he likes. This is a far cry from reality, however, as Denji is forced by the yakuza into killing devils in order to pay off his crushing debts. Using his pet devil Pochita as a weapon, he is ready to do anything for a bit of cash. Unfortunately, he outlives his usefulness and is murdered by a devil in contract with the yakuza. However, in an unexpected turn of events, Pochita merges with Denji's dead body and grants him the powers of a chainsaw devil.",
    genres: ["Action", "Comedy", "Drama", "Fantasy"],
    studio: "MAPPA"
  },
  {
    id: "16467",
    title: "Frieren: Beyond Journey's End",
    poster: "https://images.unsplash.com/photo-1448375240586-882707db888b?w=600&auto=format&fit=crop&q=80",
    banner: "https://images.unsplash.com/photo-1550684848-fac1c5b4e853?w=1200&auto=format&fit=crop&q=80",
    type: "TV",
    status: "Completed",
    episodes: 28,
    rating: "9.2",
    description: "The demon king has been defeated, and the victorious hero party returns home before disbanding. The four—mage Frieren, hero Himmel, priest Heiter, and warrior Eisen—recall their decade-long journey as the moment to bid each other farewell arrives. But the passage of time is different for elves, thus Frieren witnesses her companions slowly pass away one by one. Before his death, Heiter manages to foist a young human apprentice named Fern onto Frieren. Driven by her desire to collect countless magic spells, the duo embarks on a journey, revisiting the places that the heroes of yore once visited.",
    genres: ["Adventure", "Drama", "Fantasy"],
    studio: "Madhouse"
  },
  {
    id: "174070",
    title: "Sakamoto Days",
    poster: "https://images.unsplash.com/photo-1533174072545-7a4b6ad7a6c3?w=600&auto=format&fit=crop&q=80",
    banner: "https://images.unsplash.com/photo-1578632767115-351597cf2477?w=1200&auto=format&fit=crop&q=80",
    type: "TV",
    status: "Ongoing",
    episodes: 12,
    rating: "8.4",
    description: "Taro Sakamoto was an elite assassin, feared by bad guys and admired by other assassins. But one day, he fell in love! He quit his job, got married, had a child, and got fat. Now, he's a happy-go-lucky convenience store owner. But can Sakamoto keep his peaceful family life safe from the underworld?",
    genres: ["Action", "Comedy"],
    studio: "TMS Entertainment"
  },
  {
    id: "171018",
    title: "Dandadan",
    poster: "https://images.unsplash.com/photo-1550684848-fac1c5b4e853?w=600&auto=format&fit=crop&q=80",
    banner: "https://images.unsplash.com/photo-1509198397868-475647b2a1e5?w=1200&auto=format&fit=crop&q=80",
    type: "TV",
    status: "Ongoing",
    episodes: 12,
    rating: "8.3",
    description: "A high school girl named Momo Ayase who believes in ghosts, and her classmate Ken Takakura, an occult geek who believes in aliens. To determine who is correct, they bet and visit separate paranormal hotspots, only to find that both ghosts and aliens are very real!",
    genres: ["Action", "Comedy", "Supernatural"],
    studio: "Science SARU"
  },
  {
    id: "111536",
    title: "Overflow",
    poster: "https://images.unsplash.com/photo-1541562232579-512a21360020?w=600&auto=format&fit=crop&q=80",
    banner: "https://images.unsplash.com/photo-1541562232579-512a21360020?w=1200&auto=format&fit=crop&q=80",
    type: "ONA",
    status: "Completed",
    episodes: 8,
    rating: "8.2",
    description: "A playful romantic comedy story centered around the warm, unexpected experiences between longtime childhood friends as they grow up.",
    genres: ["Comedy", "Romance"],
    studio: "Studio Hokiboshi"
  },
  {
    id: "238",
    title: "Bleach",
    poster: "https://api.kryzox.xyz/poster/238.jpg",
    banner: "https://api.kryzox.xyz/banner/238.jpg",
    type: "TV",
    status: "Completed",
    episodes: 366,
    rating: "8.5",
    description: "High school student Ichigo Kurosaki, who has the ability to see ghosts, obtains the powers of a Soul Reaper to protect his family and friends.",
    genres: ["Action", "Adventure", "Fantasy"],
    studio: "Studio Pierrot"
  },
  {
    id: "8568",
    title: "Black Clover",
    poster: "https://api.kryzox.xyz/poster/8568.jpg",
    banner: "https://api.kryzox.xyz/banner/8568.jpg",
    type: "TV",
    status: "Completed",
    episodes: 170,
    rating: "8.1",
    description: "Asta and Yuno are orphans raised together on the outskirts of the Clover Kingdom. In a world where everyone has magic, Asta has none, but gains an ultra-rare five-leaf grimoire.",
    genres: ["Action", "Adventure", "Fantasy", "Comedy"],
    studio: "Studio Pierrot"
  },
  {
    id: "15818",
    title: "Witch Hat Atelier",
    poster: "https://images.unsplash.com/photo-1448375240586-882707db888b?w=600&auto=format&fit=crop&q=80",
    banner: "https://images.unsplash.com/photo-1448375240586-882707db888b?w=1200&auto=format&fit=crop&q=80",
    type: "TV",
    status: "Ongoing",
    episodes: 12,
    rating: "8.6",
    description: "In a world where magic is a closely guarded secret, a young girl named Coco dreams of becoming a witch, only to realize that magic is drawn rather than spoken.",
    genres: ["Adventure", "Drama", "Fantasy"],
    studio: "Bug Films"
  },
  {
    id: "33456",
    title: "Crowned in a Hundred Days",
    poster: "https://images.unsplash.com/photo-1507525428034-b723cf961d3e?w=600&auto=format&fit=crop&q=80",
    banner: "https://images.unsplash.com/photo-1507525428034-b723cf961d3e?w=1200&auto=format&fit=crop&q=80",
    type: "TV",
    status: "Ongoing",
    episodes: 12,
    rating: "8.0",
    description: "A classic epic tale of royal lineages and grand battles as a hidden heir rises to power within exactly one hundred days.",
    genres: ["Action", "Historical", "Drama"],
    studio: "Toei Animation"
  },
  {
    id: "16809",
    title: "Pokémon Horizons: The Series",
    poster: "https://images.unsplash.com/photo-1607604276583-eef5d076aa5f?w=600&auto=format&fit=crop&q=80",
    banner: "https://images.unsplash.com/photo-1607604276583-eef5d076aa5f?w=1200&auto=format&fit=crop&q=80",
    type: "TV",
    status: "Ongoing",
    episodes: 142,
    rating: "7.9",
    description: "Join Liko and Roy as they embark on endless adventures across multiple regions, discovering mysterious pocket monsters and uncovering ancient secrets.",
    genres: ["Adventure", "Fantasy", "Kids"],
    studio: "OLM"
  },
  {
    id: "55530",
    title: "I Became a Legend After My 10 Years in the Noob Academy",
    poster: "https://images.unsplash.com/photo-1542751371-adc38448a05e?w=300&auto=format&fit=crop&q=65",
    banner: "https://images.unsplash.com/photo-1542751371-adc38448a05e?w=800&auto=format&fit=crop&q=65",
    type: "ONA",
    status: "Ongoing",
    episodes: 24,
    rating: "8.1",
    description: "After being stuck in the starter academy for ten full years due to a system glitch, our protagonist emerges with unparalleled stats, ready to shock the entire world.",
    genres: ["Action", "Comedy", "Fantasy"],
    studio: "AnOvA Production"
  },
  {
    id: "8127",
    title: "Your Name (Kimi no Na wa)",
    poster: "https://images.unsplash.com/photo-1534447677768-be436bb09401?w=300&auto=format&fit=crop&q=65",
    banner: "https://images.unsplash.com/photo-1534447677768-be436bb09401?w=800&auto=format&fit=crop&q=65",
    type: "Movie",
    status: "Completed",
    episodes: 1,
    rating: "9.3",
    description: "Mitsuha Miyamizu, a high school girl, yearns to live the life of a boy in Tokyo. Meanwhile, Taki Tachibana, a high school boy, juggles school, work, and architecture aspirations. One day, they wake up to find themselves in each other's bodies. As they adapt, a deep, mystical connection forms, leading them to search for one another across space and time.",
    genres: ["Drama", "Romance", "Supernatural", "Award Winning"],
    studio: "CoMix Wave Films"
  },
  {
    id: "15358",
    title: "Suzume no Tojimari",
    poster: "https://images.unsplash.com/photo-1507525428034-b723cf961d3e?w=300&auto=format&fit=crop&q=65",
    banner: "https://images.unsplash.com/photo-1507525428034-b723cf961d3e?w=800&auto=format&fit=crop&q=65",
    type: "Movie",
    status: "Completed",
    episodes: 1,
    rating: "8.9",
    description: "A modern action-adventure road movie where a 17-year-old girl named Suzume helps a mysterious young man close portals that are releasing disasters all across Japan.",
    genres: ["Adventure", "Fantasy", "Drama"],
    studio: "CoMix Wave Films"
  },
  {
    id: "7678",
    title: "A Silent Voice (Koe no Katachi)",
    poster: "https://images.unsplash.com/photo-1448375240586-882707db888b?w=300&auto=format&fit=crop&q=65",
    banner: "https://images.unsplash.com/photo-1448375240586-882707db888b?w=800&auto=format&fit=crop&q=65",
    type: "Movie",
    status: "Completed",
    episodes: 1,
    rating: "9.0",
    description: "A former class bully attempts to make amends with a deaf girl he tormented in elementary school, in an emotionally resonant masterpiece dealing with guilt, growth, and redemption.",
    genres: ["Drama", "Shounen", "Award Winning"],
    studio: "Kyoto Animation"
  },
  {
    id: "10832",
    title: "Weathering With You (Tenki no Ko)",
    poster: "https://images.unsplash.com/photo-1620641788421-7a1c342ea42e?w=300&auto=format&fit=crop&q=65",
    banner: "https://images.unsplash.com/photo-1613376023733-0a73315d9b06?w=800&auto=format&fit=crop&q=65",
    type: "Movie",
    status: "Completed",
    episodes: 1,
    rating: "8.7",
    description: "A high-school boy who has run away to Tokyo befriends a girl who appears to be able to control the weather by praying, leading to beautiful cosmic adventures.",
    genres: ["Drama", "Romance", "Fantasy"],
    studio: "CoMix Wave Films"
  }
];

const mapAnime = (item: any): Anime => {
  if (!item) return item;

  // On-the-fly Unsplash poster optimization to keep files tiny, lightweight and ultra fast loading
  let poster = item.images?.poster || item.poster || '';
  if (poster.includes('unsplash.com')) {
    poster = poster.replace(/w=\d+/, 'w=300').replace(/q=\d+/, 'q=60');
    if (!poster.includes('w=')) {
      poster += (poster.includes('?') ? '&' : '?') + 'w=300&q=60';
    }
  }

  let banner = item.images?.banner || item.banner || item.images?.poster || item.poster || '';
  if (banner.includes('unsplash.com')) {
    banner = banner.replace(/w=\d+/, 'w=800').replace(/q=\d+/, 'q=65');
    if (!banner.includes('w=')) {
      banner += (banner.includes('?') ? '&' : '?') + 'w=800&q=65';
    }
  }

  let id = String(item.id);
  let title = item.titles?.english || item.titles?.romaji || item.title || 'Unknown Title';
  let al_id = item.al_id;
  let mal_id = item.mal_id;

  // Intercept and resolve broken Black Clover Season 2 records dynamically to the main high-fidelity master series
  if (
    id === '19706' || 
    String(al_id) === '195604' || 
    String(mal_id) === '61967' || 
    title.toLowerCase() === 'black clover season 2' || 
    title.toLowerCase().includes('black clover 2nd season')
  ) {
    id = '8568'; // Map to Black Clover (real Kryzox ID)
    title = 'Black Clover';
    al_id = 97940;
    mal_id = 34572;
    poster = "https://api.kryzox.xyz/poster/8568.jpg";
    banner = "https://api.kryzox.xyz/banner/8568.jpg";
  }

  return {
    id,
    title,
    poster,
    banner,
    type: item.type,
    status: item.status,
    episodes: item.episodes_count || item.episodes,
    rating: item.rating,
    description: item.description || item.synopsis,
    genres: item.genres,
    studio: item.studios?.[0]?.name || item.studio,
    al_id: al_id,
    mal_id: mal_id,
    source: item.source || (String(item.id).startsWith('custom-') ? 'my_database' : 'four_animo'),
  };
};

const mapAnimeList = (data: any) => {
  if (!data) return [];
  if (Array.isArray(data)) return data.map(mapAnime).filter(Boolean);
  if (data?.data?.data && Array.isArray(data.data.data)) return data.data.data.map(mapAnime).filter(Boolean);
  if (data?.data && Array.isArray(data.data)) return data.data.map(mapAnime).filter(Boolean);
  if (data?.animes && Array.isArray(data.animes)) return data.animes.map(mapAnime).filter(Boolean);
  if (data?.suggestions && Array.isArray(data.suggestions)) return data.suggestions.map(mapAnime).filter(Boolean);
  if (data?.data?.animes && Array.isArray(data.data.animes)) return data.data.animes.map(mapAnime).filter(Boolean);
  
  if (typeof data === 'object') {
    for (const key in data) {
      if (Array.isArray(data[key])) return data[key].map(mapAnime).filter(Boolean);
    }
  }
  return [];
};

export function filterAndDeduplicateAnimes(animes: any[]): any[] {
  if (!animes) return [];

  // Filter based on active global settings and valid playable metadata
  const filteredAnimes = animes.filter(anime => {
    if (!anime) return false;

    const idStr = String(anime.id || '');
    // Filter out known broken custom playlist/anime IDs that are non-functional
    if (idStr === 'yt-pl-PLxSscENEp7JgVHy1m2-yD5jbgOGDyqSLc' || idStr.includes('PLxSscENEp7JgVHy1m2-yD5jbgOGDyqSLc') || brokenAnimesSet.has(idStr)) {
      return false;
    }

    // Filter out entries that lack basic metadata required for playing (e.g. no title, or poster)
    if (!anime.title || anime.title === 'Unknown Title' || !anime.poster) {
      return false;
    }

    const isImported = anime.source === 'imported' || anime.imported === true || anime.isImported === true;
    const source = anime.source || (isImported ? 'imported' : (String(anime.id).startsWith('custom-') ? 'my_database' : 'four_animo'));
    
    // Evaluate smart YouTube playlist restriction hiding
    if (anime.validationStatus) {
      const vStatus = anime.validationStatus;
      if (globalSettings.hideRestrictedPlaylists && vStatus !== 'AVAILABLE') {
        return false;
      }
      if (globalSettings.hideMembersOnly && vStatus === 'MEMBERS_ONLY') {
        return false;
      }
      if (globalSettings.hideEmbedDisabled && vStatus === 'EMBED_DISABLED') {
        return false;
      }
      if (globalSettings.hideRegionLocked && vStatus === 'REGION_BLOCKED') {
        return false;
      }
      if (globalSettings.hidePrivatePlaylists && vStatus === 'PRIVATE') {
        return false;
      }
      if (globalSettings.hidePlaybackRestricted && (vStatus === 'PLAYBACK_RESTRICTED' || vStatus === 'SUBSCRIPTION_REQUIRED')) {
        return false;
      }
    }

    if (source === 'my_database') return globalSettings.myDatabase;
    if (source === 'imported') return globalSettings.imported;
    if (source === 'four_animo') {
      return globalSettings.fourAnimo;
    }
    return true;
  });

  // Deduplicate based on ID with priority: my_database > imported > four_animo
  const grouped = new Map<string, any>();

  filteredAnimes.forEach(anime => {
    if (!anime) return;
    const id = String(anime.id);
    const existing = grouped.get(id);

    if (!existing) {
      grouped.set(id, anime);
      return;
    }

    const existingIsImported = existing.source === 'imported' || existing.imported === true || existing.isImported === true;
    const existingSource = existing.source || (existingIsImported ? 'imported' : (String(existing.id).startsWith('custom-') ? 'my_database' : 'four_animo'));

    const currentIsImported = anime.source === 'imported' || anime.imported === true || anime.isImported === true;
    const currentSource = anime.source || (currentIsImported ? 'imported' : (String(anime.id).startsWith('custom-') ? 'my_database' : 'four_animo'));

    const priorityScore = (src: string) => {
      if (src === 'my_database') return 3;
      if (src === 'imported') return 2;
      if (src === 'four_animo') return 1;
      return 0;
    };

    if (priorityScore(currentSource) > priorityScore(existingSource)) {
      grouped.set(id, anime);
    }
  });

  return Array.from(grouped.values());
}

const getCustomByCategory = async (category: string): Promise<Anime[]> => {
  const cacheKey = `custom_category_${category}`;
  const cached = apiCache.get(cacheKey);

  const fetcher = async () => {
    try {
      const animesRef = ref(db, 'animes');
      const snap = await withTimeout(get(animesRef), 3000, null);
      if (snap && snap.exists()) {
        const val = snap.val();
        const data = Object.values(val)
          .filter((a: any) => {
            if (a.visibility === 'draft') return false;
            
            // For custom/imported animes in the database, if they have categories assigned, respect those strictly
            if (a.categories) {
              return hasCategory(a, category);
            }

            // Fallback for animes without a categories object (e.g. legacy or freshly imported but not yet edited)
            const isCore = CORE_CATEGORIES.has(category);
            if (isCore) {
              return a.categories?.[category] === true;
            }

            const parsedGenres = parseAnimeGenres(a.genres);
            return matchGenre(category, parsedGenres);
          })
          .map((a: any) => {
            const isImported = a.source === 'imported' || a.imported === true || a.isImported === true;
            return {
              ...a,
              id: String(a.id),
              source: isImported ? 'imported' : 'my_database'
            };
          });
        apiCache.set(cacheKey, data);
        return data;
      }
    } catch (e) {
      console.error("Failed to fetch custom animes for category:", category, e);
    }
    return cached || [];
  };

  const dedupedPromise = dedupeRequest(cacheKey, fetcher);

  if (cached) {
    dedupedPromise.catch(() => {});
    return cached;
  }

  return dedupedPromise;
};

export const legacyToRealIdMap: Record<string, string> = {
  "1": "12",      // One Piece
  "2": "11",      // Naruto
  "3": "6436",    // Attack on Titan
  "4": "15334",   // Demon Slayer
  "5": "11777",   // Jujutsu Kaisen
  "6": "16262",   // Solo Leveling
  "7": "13508",   // Chainsaw Man
  "8": "16467",   // Frieren
  "9": "174070",  // Sakamoto Days
  "10": "171018", // Dandadan
  "13": "8568",   // Black Clover
  "14": "15818",  // Witch Hat Atelier
  "15": "33456",  // Crowned in a Hundred Days
  "16": "16809",  // Pokémon Horizons
  "17": "55530",  // Noob Academy
  "18": "8127",   // Your Name
  "19": "15358",  // Suzume
  "20": "7678",   // A Silent Voice
  "21": "10832",  // Weathering With You
};

export const localToKryzoxIdMap: Record<string, string> = {
  "1": "12",      // One Piece
  "2": "11",      // Naruto
  "3": "6436",    // Attack on Titan
  "4": "15334",   // Demon Slayer
  "5": "11777",   // Jujutsu Kaisen
  "6": "16262",   // Solo Leveling
  "7": "13508",   // Chainsaw Man
  "8": "16467",   // Frieren
  "9": "174070",  // Sakamoto Days
  "10": "171018", // Dandadan
  "13": "8568",   // Black Clover
  "14": "15818",  // Witch Hat Atelier
  "15": "33456",  // Crowned in a Hundred Days
  "16": "16809",  // Pokémon Horizons
  "18": "8127",   // Your Name
  "19": "15358",  // Suzume
  "20": "7678",   // A Silent Voice
  "21": "10832",  // Weathering With You
};

export const api = {
  _homeInternal: async () => {
    // Parallelize all three calls: customAnimes, dynamicSections, and liveData
    const customAnimesPromise = (async () => {
      const cacheKey = "all_custom_animes";
      const cached = apiCache.get(cacheKey);
      try {
        const snap = await withTimeout(get(ref(db, 'animes')), 4000, null);
        if (snap && snap.exists()) {
          const val = snap.val();
          const mapped = Object.values(val)
            .filter((a: any) => a.visibility !== 'draft')
            .map((a: any) => {
              const isImported = a.source === 'imported' || a.imported === true || a.isImported === true;
              return {
                ...a,
                id: String(a.id),
                source: isImported ? 'imported' : 'my_database'
              };
            });
          apiCache.set(cacheKey, mapped);
          return mapped;
        }
      } catch (e) {
        console.error("Firebase custom animes fetch failed:", e);
      }
      return cached || [];
    })();

    const dynamicSectionsPromise = (async () => {
      try {
        const snap = await withTimeout(get(ref(db, 'homepageSections')), 3000, null);
        if (snap && snap.exists()) {
          const rawSecs = Object.values(snap.val()) as any[];
          return rawSecs.sort((a, b) => Number(a.displayOrder || 0) - Number(b.displayOrder || 0));
        } else {
          const defaultSections = [
            { id: 'featured', name: 'Featured', slug: 'featured', displayOrder: 1, numCards: 12, visible: true, status: 'active' },
            { id: 'trending', name: 'Trending', slug: 'trending', displayOrder: 2, numCards: 12, visible: true, status: 'active' },
            { id: 'popular', name: 'Popular', slug: 'popular', displayOrder: 3, numCards: 12, visible: true, status: 'active' },
            { id: 'topAiring', name: 'Top Airing', slug: 'topAiring', displayOrder: 4, numCards: 12, visible: true, status: 'active' },
            { id: 'recentlyAdded', name: 'Recently Added', slug: 'recentlyAdded', displayOrder: 5, numCards: 12, visible: true, status: 'active' },
            { id: 'latest', name: 'Latest', slug: 'latest', displayOrder: 6, numCards: 12, visible: true, status: 'active' },
            { id: 'favorite', name: 'Most Favorite', slug: 'favorite', displayOrder: 7, numCards: 12, visible: true, status: 'active' },
            { id: 'completed', name: 'Completed', slug: 'completed', displayOrder: 8, numCards: 12, visible: true, status: 'active' },
            { id: 'upcoming', name: 'Upcoming', slug: 'upcoming', displayOrder: 9, numCards: 12, visible: true, status: 'active' },
            { id: 'hindi-dubbed', name: 'Hindi Dubbed', slug: 'hindi-dubbed', displayOrder: 10, numCards: 12, visible: true, status: 'active' },
          ];
          for (const sec of defaultSections) {
            set(ref(db, `homepageSections/${sec.id}`), sec).catch(() => {});
          }
          return [...defaultSections].sort((a, b) => Number(a.displayOrder || 0) - Number(b.displayOrder || 0));
        }
      } catch (e) {
        console.error("Firebase dynamic sections fetch/seed failed:", e);
      }
      return [];
    })();

    const liveDataPromise = (async () => {
      try {
        const live = await withTimeout(fetchApi("/home"), 4500, null);
        if (live && live.data) {
          const d = live.data;
          // Normalize newer kryzox API key names to what the Home page expects
          return {
            ...d,
            mostFavoriteAnimes: d.mostFavoriteAnimes || d.mostFavorite || [],
            completedAnimes: d.completedAnimes || d.justCompleted || [],
            topUpcomingAnimes: d.topUpcomingAnimes || d.topUpcoming || [],
            trending: d.trending || d.spotlight || [],
          };
        }
      } catch (e) {
        console.error("Home API fetch failed, falling back to mock dataset:", e);
      }
      return null;
    })();

    const [customAnimesRaw, rawDynamicSections, liveDataRaw] = await Promise.all([
      customAnimesPromise,
      dynamicSectionsPromise,
      liveDataPromise
    ]);

    const customAnimes = customAnimesRaw as any[];
    const dynamicSections = rawDynamicSections as any[];

    const getCustomLocal = (catName: string) => {
      return customAnimes
        .filter(a => hasCategory(a, catName))
        .map(a => ({
          ...a,
          id: String(a.id)
        }));
    };

    let liveData = liveDataRaw;
    if (!liveData) {
      liveData = {
        trending: fallbackAnimes.slice(0, 8),
        mostPopular: fallbackAnimes.slice(3, 11),
        newAdded: fallbackAnimes.slice(5, 13),
        topAiring: {
          all: fallbackAnimes.slice(2, 10)
        },
        latestEpisode: fallbackAnimes.slice(4, 12),
        completedAnimes: fallbackAnimes.filter(a => a.status === 'Completed'),
        topUpcomingAnimes: fallbackAnimes.filter(a => a.status === 'Ongoing').slice(0, 8),
        mostFavoriteAnimes: fallbackAnimes.slice(1, 9)
      };
    }

    const allVisibleCustom = filterAndDeduplicateAnimes(
      customAnimes.map(a => mapAnime({
        ...a,
        id: String(a.id),
        source: a.source || 'my_database'
      }))
    );

    let trendingList = [];
    if (globalSettings.fourAnimo) {
      trendingList = filterAndDeduplicateAnimes([...getCustomLocal('trending'), ...(liveData.trending || []).map(mapAnime)]);
      if (trendingList.length === 0) {
        trendingList = fallbackAnimes.slice(0, 5).map(mapAnime);
      }
    } else {
      trendingList = filterAndDeduplicateAnimes(getCustomLocal('trending'));
    }

    let mostPopularList = [];
    if (globalSettings.fourAnimo) {
      mostPopularList = filterAndDeduplicateAnimes([...getCustomLocal('popular'), ...(liveData.mostPopular || []).map(mapAnime)]);
      if (mostPopularList.length === 0) {
        mostPopularList = fallbackAnimes.slice(3, 11).map(mapAnime);
      }
    } else {
      mostPopularList = filterAndDeduplicateAnimes(getCustomLocal('popular'));
    }

    let newAddedList = [];
    if (globalSettings.fourAnimo) {
      newAddedList = filterAndDeduplicateAnimes([...getCustomLocal('recentlyAdded'), ...(liveData.newAdded || []).map(mapAnime)]);
      if (newAddedList.length === 0) {
        newAddedList = fallbackAnimes.slice(5, 10).map(mapAnime);
      }
    } else {
      newAddedList = filterAndDeduplicateAnimes(getCustomLocal('recentlyAdded'));
    }

    let topAiringList = [];
    if (globalSettings.fourAnimo) {
      topAiringList = filterAndDeduplicateAnimes([...getCustomLocal('topAiring'), ...(liveData.topAiring?.all || []).map(mapAnime)]);
      if (topAiringList.length === 0) {
        topAiringList = fallbackAnimes.slice(2, 10).map(mapAnime);
      }
    } else {
      topAiringList = filterAndDeduplicateAnimes(getCustomLocal('topAiring'));
    }

    let latestEpisodeList = [];
    if (globalSettings.fourAnimo) {
      latestEpisodeList = filterAndDeduplicateAnimes([...getCustomLocal('latest'), ...(liveData.latestEpisode || []).map(mapAnime)]);
      if (latestEpisodeList.length === 0) {
        latestEpisodeList = fallbackAnimes.slice(4, 12).map(mapAnime);
      }
    } else {
      latestEpisodeList = filterAndDeduplicateAnimes(getCustomLocal('latest'));
    }

    let completedAnimesList = [];
    if (globalSettings.fourAnimo) {
      completedAnimesList = filterAndDeduplicateAnimes([...getCustomLocal('completed'), ...(liveData.completedAnimes || []).map(mapAnime)]);
      if (completedAnimesList.length === 0) {
        completedAnimesList = fallbackAnimes.filter(a => a.status === 'Completed').map(mapAnime);
      }
    } else {
      completedAnimesList = filterAndDeduplicateAnimes(getCustomLocal('completed'));
    }

    let topUpcomingAnimesList = [];
    if (globalSettings.fourAnimo) {
      topUpcomingAnimesList = filterAndDeduplicateAnimes([...getCustomLocal('upcoming'), ...(liveData.topUpcomingAnimes || []).map(mapAnime)]);
      if (topUpcomingAnimesList.length === 0) {
        topUpcomingAnimesList = fallbackAnimes.filter(a => a.status === 'Ongoing').slice(0, 8).map(mapAnime);
      }
    } else {
      topUpcomingAnimesList = filterAndDeduplicateAnimes(getCustomLocal('upcoming'));
    }

    let mostFavoriteAnimesList = [];
    if (globalSettings.fourAnimo) {
      mostFavoriteAnimesList = filterAndDeduplicateAnimes([...getCustomLocal('favorite'), ...(liveData.mostFavoriteAnimes || []).map(mapAnime)]);
      if (mostFavoriteAnimesList.length === 0) {
        mostFavoriteAnimesList = fallbackAnimes.slice(1, 9).map(mapAnime);
      }
    } else {
      mostFavoriteAnimesList = filterAndDeduplicateAnimes(getCustomLocal('favorite'));
    }

    return {
      data: {
        trending: trendingList,
        mostPopular: mostPopularList,
        newAdded: newAddedList,
        topAiring: {
          all: topAiringList
        },
        latestEpisode: latestEpisodeList,
        completedAnimes: completedAnimesList,
        topUpcomingAnimes: topUpcomingAnimesList,
        mostFavoriteAnimes: mostFavoriteAnimesList
      },
      dynamicSections: dynamicSections.map(sec => {
        let sectionAnimes: any[] = [];
        const normSlug = sec.slug ? sec.slug.toLowerCase().replace(/[^a-z0-9]/g, '') : '';
        const normId = sec.id ? sec.id.toLowerCase().replace(/[^a-z0-9]/g, '') : '';
        const normName = sec.name ? sec.name.toLowerCase().replace(/[^a-z0-9]/g, '') : '';

        const isMatch = (key: string) => {
          const normKey = key.toLowerCase().replace(/[^a-z0-9]/g, '');
          return normSlug === normKey || normId === normKey || normName === normKey;
        };

        if (isMatch('trending') || isMatch('trendinganime')) {
          sectionAnimes = trendingList;
        } else if (isMatch('popular') || isMatch('mostpopular')) {
          sectionAnimes = mostPopularList;
        } else if (isMatch('recentlyadded') || isMatch('recent')) {
          sectionAnimes = newAddedList;
        } else if (isMatch('topairing')) {
          sectionAnimes = topAiringList;
        } else if (isMatch('latest') || isMatch('updated')) {
          sectionAnimes = latestEpisodeList;
        } else if (isMatch('completed')) {
          sectionAnimes = completedAnimesList;
        } else if (isMatch('upcoming')) {
          sectionAnimes = topUpcomingAnimesList;
        } else if (isMatch('favorite')) {
          sectionAnimes = mostFavoriteAnimesList;
        } else if (isMatch('featured')) {
          const customFeatured = getCustomLocal('featured');
          if (customFeatured.length > 0) {
            sectionAnimes = filterAndDeduplicateAnimes(customFeatured.map(mapAnime));
          } else if (globalSettings.fourAnimo) {
            sectionAnimes = trendingList;
          } else {
            sectionAnimes = [];
          }
        } else if (isMatch('hindi-dubbed') || isMatch('hindidubbed')) {
          const customHindi = getCustomLocal('hindi-dubbed');
          if (customHindi.length > 0) {
            sectionAnimes = filterAndDeduplicateAnimes(customHindi.map(mapAnime));
          } else if (globalSettings.fourAnimo) {
            sectionAnimes = filterAndDeduplicateAnimes(fallbackAnimes.filter(a => a.hindiAvailable || a.language?.toLowerCase().includes('hindi')).map(mapAnime));
          } else {
            sectionAnimes = [];
          }
        } else if (isMatch('ongoing')) {
          const customOngoing = getCustomLocal('ongoing');
          if (customOngoing.length > 0) {
            sectionAnimes = filterAndDeduplicateAnimes(customOngoing.map(mapAnime));
          } else if (globalSettings.fourAnimo) {
            sectionAnimes = filterAndDeduplicateAnimes(fallbackAnimes.filter(a => a.status === 'Ongoing').map(mapAnime));
          } else {
            sectionAnimes = [];
          }
        } else if (isMatch('movies') || isMatch('movie')) {
          const customMovies = getCustomLocal('movies');
          if (customMovies.length > 0) {
            sectionAnimes = filterAndDeduplicateAnimes(customMovies.map(mapAnime));
          } else if (globalSettings.fourAnimo) {
            sectionAnimes = filterAndDeduplicateAnimes(fallbackAnimes.filter(a => a.type === 'Movie').map(mapAnime));
          } else {
            sectionAnimes = [];
          }
        } else {
          // Custom category/section (e.g. comedy, shounen, music, mystery, etc.) or genres
          const sectionKey = sec.slug || sec.id || sec.name || '';
          
          // STRICT source of truth check: check if any custom database animes are checked for this custom sectionKey!
          const matchedCustom = customAnimes.filter(a => hasCategory(a, sectionKey));
          
          if (matchedCustom.length > 0) {
            sectionAnimes = filterAndDeduplicateAnimes(matchedCustom.map(mapAnime));
          } else if (globalSettings.fourAnimo) {
            // Only fall back to static/demo fallbackAnimes if there are no custom ones AND fourAnimo is ON!
            const matchedFallback = fallbackAnimes.filter(a => {
              return matchGenre(sectionKey, parseAnimeGenres(a.genres));
            });
            sectionAnimes = filterAndDeduplicateAnimes(matchedFallback.map(mapAnime));
          } else {
            sectionAnimes = [];
          }
        }

        console.log(`Homepage [${sec.slug || sec.id}]: Found ${sectionAnimes.length} anime`);
        return {
          ...sec,
          animes: sectionAnimes.slice(0, sec.numCards || 12)
        };
      })
    };
  },
  home: async (forceFresh = false) => {
    const cacheKey = "api_home_data";
    const cached = apiCache.get(cacheKey);

    const fetcherPromise = api._homeInternal().then((res) => {
      apiCache.set(cacheKey, res);
      return res;
    });

    const dedupedPromise = dedupeRequest(cacheKey, () => fetcherPromise);

    if (cached && !forceFresh) {
      dedupedPromise.catch(() => {});
      return cached;
    }

    return dedupedPromise;
  },
  category: async (categorySlug: string): Promise<Anime[]> => {
    // 1. Get custom local animes explicitly checked for this category
    const custom = await getCustomByCategory(categorySlug);
    console.log(`Homepage [${categorySlug}]: Found ${custom.length} anime`);
    
    if (custom.length > 0) {
      // If there are custom animes explicitly assigned here, return ONLY those!
      return filterAndDeduplicateAnimes(custom.map(mapAnime));
    }
    
    // 2. If no custom animes assigned, fall back to static/demo fallbackAnimes only if globalSettings.fourAnimo is ON
    if (globalSettings.fourAnimo) {
      const GENRE_ALIASES: Record<string, string[]> = {
        'scifi': ['scifi', 'sci-fi', 'sci fi', 'science fiction', 'sciencefiction'],
        'shounen': ['shounen', 'shonen'],
        'martialarts': ['martial arts', 'martialarts', 'martial_arts', 'martial-arts'],
        'sliceoflife': ['slice of life', 'sliceoflife', 'slice_of_life', 'slice-of-life'],
        'supernatural': ['supernatural'],
        'psychological': ['psychological'],
        'adventure': ['adventure'],
        'fantasy': ['fantasy'],
        'action': ['action'],
        'romance': ['romance'],
        'comedy': ['comedy'],
        'school': ['school'],
        'horror': ['horror'],
        'mystery': ['mystery'],
        'music': ['music'],
        'historical': ['historical'],
        'sports': ['sports', 'sport'],
        'harem': ['harem'],
        'ecchi': ['ecchi'],
        'drama': ['drama'],
        'isekai': ['isekai'],
        'thriller': ['thriller'],
        'mecha': ['mecha', 'robot'],
        'military': ['military', 'war'],
        'shoujo': ['shoujo', 'shojo'],
        'seinen': ['seinen'],
        'josei': ['josei'],
        'demons': ['demons', 'demon'],
        'magic': ['magic'],
        'game': ['game', 'gaming'],
        'superpower': ['super power', 'superpower'],
        'gore': ['gore'],
        'suspense': ['suspense'],
        'cultivation': ['cultivation']
      };

      const validAliases = new Set<string>();
      validAliases.add(categorySlug.toLowerCase().replace(/[^a-z0-9]/g, ''));
      for (const [key, aliases] of Object.entries(GENRE_ALIASES)) {
        const normalizedAliases = aliases.map(al => al.toLowerCase().replace(/[^a-z0-9]/g, ''));
        if (normalizedAliases.includes(categorySlug.toLowerCase().replace(/[^a-z0-9]/g, ''))) {
          normalizedAliases.forEach(al => validAliases.add(al));
        }
      }

      const matchedFallback = fallbackAnimes.filter(a => {
        const animeGenres = (Array.isArray(a.genres) ? a.genres : (typeof a.genres === 'string' ? a.genres.split(/[,\/|;]+/) : []))
          .map(g => g.trim().toLowerCase().replace(/[^a-z0-9]/g, ''))
          .filter(Boolean);
        return animeGenres.some(g => validAliases.has(g));
      });
      return filterAndDeduplicateAnimes(matchedFallback.map(mapAnime));
    }
    
    return [];
  },
  getAllGenres: async (): Promise<string[]> => {
    try {
      const animesRef = ref(db, 'animes');
      const snap = await get(animesRef);
      const uniqueGenres = new Set<string>();
      
      const baselineGenres = [
        'Action', 'Adventure', 'Comedy', 'Drama', 'Fantasy', 'Horror', 'Mystery', 
        'Romance', 'Sci-Fi', 'Slice of Life', 'Sports', 'Supernatural', 'Thriller', 
        'Ecchi', 'Harem', 'Isekai', 'Mecha', 'Psychological', 'School', 
        'Seinen', 'Shoujo', 'Shounen'
      ];

      if (snap && snap.exists()) {
        const val = snap.val();
        Object.values(val).forEach((a: any) => {
          if (a.visibility === 'draft') return;
          const parsed = parseAnimeGenres(a.genres);
          parsed.forEach(g => {
            const matchedBaseline = baselineGenres.find(b => b.toLowerCase() === g.toLowerCase());
            if (matchedBaseline) {
              uniqueGenres.add(matchedBaseline);
            } else {
              const titleCased = g.split(' ').map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()).join(' ');
              uniqueGenres.add(titleCased);
            }
          });
        });
      }
      
      if (uniqueGenres.size === 0) {
        baselineGenres.forEach(g => uniqueGenres.add(g));
      }
      
      return Array.from(uniqueGenres).sort();
    } catch (e) {
      console.error("Failed to read genres from Anime database:", e);
      return [
        'Action', 'Adventure', 'Comedy', 'Drama', 'Fantasy', 'Horror', 'Mystery', 
        'Romance', 'Sci-Fi', 'Slice of Life', 'Sports', 'Supernatural', 'Thriller', 
        'Ecchi', 'Harem', 'Isekai', 'Mecha', 'Psychological', 'School', 
        'Seinen', 'Shoujo', 'Shounen'
      ];
    }
  },
  trending: async () => {
    let liveList: Anime[] = [];
    try {
      const live = await fetchApi("/anime/trending");
      if (live) liveList = mapAnimeList(live);
    } catch (e) {
      console.error("Trending API failed:", e);
      liveList = fallbackAnimes.slice(0, 8);
    }
    const custom = await getCustomByCategory('trending');
    return filterAndDeduplicateAnimes([...custom, ...liveList]);
  },
  topAiring: async () => {
    let liveList: Anime[] = [];
    try {
      const live = await fetchApi("/anime/top-airing");
      if (live) liveList = mapAnimeList(live);
    } catch (e) {
      console.error("Top Airing API failed:", e);
      liveList = fallbackAnimes.slice(2, 10);
    }
    const custom = await getCustomByCategory('topAiring');
    return filterAndDeduplicateAnimes([...custom, ...liveList]);
  },
  popular: async () => {
    let liveList: Anime[] = [];
    try {
      const live = await fetchApi("/anime/most-popular");
      if (live) liveList = mapAnimeList(live);
    } catch (e) {
      console.error("Popular API failed:", e);
      liveList = fallbackAnimes.slice(4, 10);
    }
    const custom = await getCustomByCategory('popular');
    return filterAndDeduplicateAnimes([...custom, ...liveList]);
  },
  recent: async () => {
    let liveList: Anime[] = [];
    try {
      const live = await fetchApi("/anime/recently-added");
      if (live) liveList = mapAnimeList(live);
    } catch (e) {
      console.error("Recent API failed:", e);
      liveList = fallbackAnimes.slice(5, 10);
    }
    const custom = await getCustomByCategory('recentlyAdded');
    return filterAndDeduplicateAnimes([...custom, ...liveList]);
  },
  updated: async () => {
    let liveList: Anime[] = [];
    try {
      const live = await fetchApi("/anime/recently-updated");
      if (live) liveList = mapAnimeList(live);
    } catch (e) {
      console.error("Updated API failed:", e);
      liveList = fallbackAnimes.slice(1, 7);
    }
    const custom = await getCustomByCategory('latest');
    return filterAndDeduplicateAnimes([...custom, ...liveList]);
  },
  search: async (keyword: string, page = 1, filters: { type?: string; status?: string; season?: string; year?: string } = {}) => {
    let customResults: any[] = [];
    try {
      const animesRef = ref(db, 'animes');
      const snap = await withTimeout(get(animesRef), 3000, null);
      if (snap && snap.exists()) {
        const val = snap.val();
        const kw = keyword.toLowerCase().trim();
        customResults = Object.values(val)
          .filter((a: any) => {
            if (a.visibility === 'draft') return false;
            
            // Check keyword
            const title = (a.title || '').toLowerCase();
            const desc = (a.description || '').toLowerCase();
            const studio = (a.studio || '').toLowerCase();
            const genres = a.genres || [];
            const matchesKw = !kw || title.includes(kw) || desc.includes(kw) || studio.includes(kw) || genres.some((g: string) => g.toLowerCase().includes(kw));
            if (!matchesKw) return false;

            // Check filters
            if (filters.type && a.type !== filters.type) return false;
            if (filters.status && a.status !== filters.status) return false;
            if (filters.year && String(a.season_year || a.year) !== String(filters.year)) return false;

            return true;
          })
          .map((a: any) => {
            const isImported = a.source === 'imported' || a.imported === true || a.isImported === true;
            return {
              ...a,
              id: String(a.id),
              source: isImported ? 'imported' : 'my_database'
            };
          });
      }
    } catch (e) {
      console.error("Firebase custom search failed:", e);
    }

    let liveResults: any[] = [];
    let total = customResults.length;
    let pages = 10; // Allow infinite scroll for All Anime

    // If keyword is completely empty, aggregate multiple lists on Page 1 to ensure nothing is missed!
    if (!keyword && page === 1) {
      try {
        const promises = [
          fetchApi("/anime/most-popular").catch(() => null),
          fetchApi("/anime/trending").catch(() => null),
          fetchApi("/anime/recently-added").catch(() => null),
          fetchApi("/anime/recently-updated").catch(() => null),
          fetchApi("/anime/top-airing").catch(() => null),
          fetchApi(`/anime/search?keyword=a&page=1${filters.type ? `&type=${filters.type}` : ''}`).catch(() => null)
        ];

        const results = await Promise.all(promises);
        const aggregatedList: any[] = [];
        
        // Add fallback animes too
        fallbackAnimes.forEach(item => aggregatedList.push(mapAnime(item)));

        results.forEach(res => {
          if (res) {
            const mapped = mapAnimeList(res);
            aggregatedList.push(...mapped);
          }
        });

        // Unique filter
        const seenIds = new Set<string>();
        liveResults = aggregatedList.filter(item => {
          if (!item || !item.id) return false;
          const idStr = String(item.id);
          if (seenIds.has(idStr)) return false;
          seenIds.add(idStr);
          
          // Apply filters
          if (filters.type && item.type !== filters.type) return false;
          if (filters.status && item.status !== filters.status) return false;
          
          return true;
        });

        total = liveResults.length + customResults.length;
        pages = 200; // Allow infinite scrolling up to 200 pages
      } catch (e) {
        console.error("Failed to aggregate All Anime list:", e);
      }
    } else if (!keyword && page > 1) {
      // Dynamic Alphabetic Pagination: cycle through the alphabet so the list never runs dry!
      try {
        const alphabet = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j', 'k', 'l', 'm', 'n', 'o', 'p', 'q', 'r', 's', 't', 'u', 'v', 'w', 'x', 'y', 'z'];
        let queryKeyword = 'a';
        let targetPage = 2;

        if (page === 2) {
          queryKeyword = 'a';
          targetPage = 2;
        } else {
          const offset = page - 3;
          // Query each letter of the alphabet for 3 pages sequentially
          const letterIndex = Math.floor(offset / 3) + 1;
          const alphabetIndex = letterIndex % alphabet.length;
          queryKeyword = alphabet[alphabetIndex];
          targetPage = (offset % 3) + 1;
        }

        let url = `/anime/search?keyword=${encodeURIComponent(queryKeyword)}&page=${targetPage}`;
        if (filters.type) url += `&type=${filters.type}`;
        if (filters.status) url += `&status=${filters.status}`;
        if (filters.season) url += `&season=${filters.season}`;
        if (filters.year) url += `&year=${filters.year}`;

        const apiResponse = await fetchApi(url);
        if (apiResponse) {
          liveResults = mapAnimeList(apiResponse);
          pages = 200; // Keep pages limit high to allow continuous scrolling
          total = 2000;
        }
      } catch (e) {
        console.error("Alphabetic Search API failed:", e);
      }
    } else {
      try {
        const queryKeyword = keyword;
        let url = `/anime/search?keyword=${encodeURIComponent(queryKeyword)}&page=${page}`;
        if (filters.type) url += `&type=${filters.type}`;
        if (filters.status) url += `&status=${filters.status}`;
        if (filters.season) url += `&season=${filters.season}`;
        if (filters.year) url += `&year=${filters.year}`;

        const apiResponse = await fetchApi(url);
        if (apiResponse) {
          liveResults = mapAnimeList(apiResponse);
          // Safely extract pagination metadata
          const liveTotal = apiResponse.total || apiResponse.data?.total || liveResults.length;
          const livePages = apiResponse.pages || apiResponse.data?.pages || 1;
          total += liveTotal;
          pages = Math.max(pages, livePages);
        }
      } catch (e) {
        console.error("Search API failed:", e);
      }
    }

    // Prevent duplicate cards across custom and live results
    const customIds = new Set(customResults.map(a => String(a.id)));
    const filteredLiveResults = liveResults.filter(a => !customIds.has(String(a.id)));

    // Return custom results at the top ONLY on Page 1, and append matching fallbackAnimes to keep lists populated
    let finalData = page === 1 
      ? [...customResults, ...filteredLiveResults]
      : filteredLiveResults;

    if (page === 1 && keyword) {
      const kw = keyword.toLowerCase().trim();
      const fallbackMatches = fallbackAnimes.filter(a => {
        const title = a.title.toLowerCase();
        if (title.includes(kw)) return true;
        if (kw.includes("ovar") || kw.includes("overf") || kw.includes("flow")) {
          if (title.includes("overflow")) return true;
        }
        return a.genres.some(g => g.toLowerCase().includes(kw));
      }).map(mapAnime);

      const existingIds = new Set(finalData.map(a => String(a.id)));
      for (const item of fallbackMatches) {
        if (!existingIds.has(String(item.id))) {
          finalData.push(item);
        }
      }
    }

    return {
      data: filterAndDeduplicateAnimes(finalData),
      total: Math.max(total, finalData.length),
      pages,
      page
    };
  },
  suggestions: async (query: string) => {
    let customResults: any[] = [];
    try {
      const animesRef = ref(db, 'animes');
      const snap = await withTimeout(get(animesRef), 3000, null);
      if (snap && snap.exists()) {
        const val = snap.val();
        const q = query.toLowerCase().trim();
        customResults = Object.values(val)
          .filter((a: any) => {
            if (a.visibility === 'draft') return false;
            const title = (a.title || '').toLowerCase();
            return title.includes(q);
          })
          .map((a: any) => {
            const isImported = a.source === 'imported' || a.imported === true || a.isImported === true;
            return {
              ...a,
              id: String(a.id),
              source: isImported ? 'imported' : 'my_database'
            };
          });
      }
    } catch (e) {
      console.error("Firebase custom suggestions search failed:", e);
    }

    let liveResults: any[] = [];
    try {
      const live = await fetchApi(`/suggestion?q=${encodeURIComponent(query)}`);
      if (live) {
        liveResults = mapAnimeList(live);
      }
    } catch (e) {
      console.error("Suggestions API failed:", e);
    }

    if (liveResults.length === 0 && customResults.length === 0) {
      const q = query.toLowerCase().trim();
      const filtered = fallbackAnimes.filter(a => {
        const title = a.title.toLowerCase();
        if (title.includes(q)) return true;
        if (q.includes("ovar") || q.includes("overf") || q.includes("flow")) {
          if (title.includes("overflow")) return true;
        }
        return false;
      });
      return filterAndDeduplicateAnimes(filtered);
    }

    return filterAndDeduplicateAnimes([...customResults, ...liveResults]);
  },
  animeInfo: async (id: string) => {
    // Resolve legacy or aliased IDs
    let targetId = id;
    if (id === '19706' || id === '195604' || id === '61967') {
      targetId = '8568'; // Black Clover Season 2 aliased to Black Clover Master
    } else if (legacyToRealIdMap[id]) {
      targetId = legacyToRealIdMap[id];
    }
    const cacheKey = `anime_info_${targetId}`;
    const cached = apiCache.get(cacheKey);

    const fetcher = async () => {
      try {
        const animeRef = ref(db, `animes/${targetId}`);
        const snap = await withTimeout(get(animeRef), 2500, null);
        if (snap && snap.exists && snap.exists()) {
          const val = snap.val();
          const isImported = val.source === 'imported' || val.imported === true || val.isImported === true;
          const mapped = {
            ...val,
            id: String(val.id),
            source: isImported ? 'imported' : 'my_database'
          };
          apiCache.set(cacheKey, mapped);
          return mapped;
        }
      } catch (e) {
        console.error("Firebase custom animeInfo failed:", e);
      }

      const realKryzoxId = localToKryzoxIdMap[targetId];
      try {
        const liveId = realKryzoxId || targetId;
        const live = await fetchApi(`/anime/${liveId}`);
        if (live) {
          const mapped = mapAnime(live);
          // Overwrite ID to remain the local ID so routing and internal links don't break
          mapped.id = String(targetId);
          mapped.source = 'four_animo';
          
          // Ensure we preserve the fallback anime title, poster and banner if available for visual consistency,
          // BUT only if they are missing in the API response or are not Unsplash stock photos.
          const matchedFallback = fallbackAnimes.find(a => String(a.id) === String(targetId));
          if (matchedFallback) {
            mapped.title = matchedFallback.title || mapped.title;
            if (!mapped.poster || (matchedFallback.poster && !matchedFallback.poster.includes("unsplash.com") && mapped.poster.includes("unsplash.com"))) {
              mapped.poster = matchedFallback.poster;
            }
            if (!mapped.banner || (matchedFallback.banner && !matchedFallback.banner.includes("unsplash.com") && mapped.banner.includes("unsplash.com"))) {
              mapped.banner = matchedFallback.banner;
            }
          }

          apiCache.set(cacheKey, mapped);
          return mapped;
        }
      } catch (e) {
        console.error("Anime Info API failed:", e);
      }
      const matched = fallbackAnimes.find(a => String(a.id) === String(targetId));
      if (matched) {
        return {
          ...matched,
          source: 'four_animo'
        };
      }
      
      return {
        id: String(targetId),
        title: `Anime #${targetId}`,
        poster: "https://images.unsplash.com/photo-1578632767115-351597cf2477?w=600&auto=format&fit=crop&q=80",
        banner: "https://images.unsplash.com/photo-1578632767115-351597cf2477?w=1200&auto=format&fit=crop&q=80",
        type: "TV",
        status: "Ongoing",
        episodes: 24,
        rating: "8.5",
        description: `This is a high-speed premium streaming channel for Anime ID #${targetId}. Start watching your favorite episodes instantly with zero ads, seamless sub/dub switching, and ultra-high speed servers.`,
        genres: ["Action", "Sci-Fi", "Adventure"],
        studio: "AnOvA Production",
        source: 'four_animo'
      };
    };

    const getResult = async () => {
      if (cached) {
        return cached;
      }
      return dedupeRequest(cacheKey, fetcher);
    };

    const result = await getResult();
    if (!result) return null;

    let source = result.source;
    if (!source) {
      const isImported = result.source === 'imported' || result.imported === true || result.isImported === true;
      source = isImported ? 'imported' : (String(result.id).startsWith('custom-') ? 'my_database' : 'four_animo');
    }

    if (source === 'my_database' && !globalSettings.myDatabase) {
      return null;
    }
    if (source === 'imported' && !globalSettings.imported) {
      return null;
    }
    if (source === 'four_animo' && !globalSettings.fourAnimo) {
      return null;
    }

    return result;
  },

  episodes: async (id: string) => {
    // Check if the parent anime is active and visible
    const parentAnime = await api.animeInfo(id);
    if (!parentAnime) {
      return [];
    }

    let targetId = id;
    if (id === '19706' || id === '195604' || id === '61967') {
      targetId = '8568';
    } else if (legacyToRealIdMap[id]) {
      targetId = legacyToRealIdMap[id];
    }
    const cacheKey = `episodes_${targetId}`;
    const cached = apiCache.get(cacheKey);

    const fetcher = async () => {
      let episodesResult: any[] = [];
      try {
        const episodesRef = ref(db, `episodes/${targetId}`);
        const snap = await withTimeout(get(episodesRef), 2500, null);
        if (snap && snap.exists && snap.exists()) {
          const epsObj = snap.val();
          episodesResult = Object.values(epsObj).filter(Boolean);
        }
      } catch (e) {
        console.error("Firebase custom episodes fetch failed:", e);
      }

      if (episodesResult.length === 0) {
        const realKryzoxId = localToKryzoxIdMap[targetId];
        try {
          const liveId = realKryzoxId || targetId;
          const data = await fetchApi(`/anime/${liveId}/episodes`);
          if (data) {
            let eps: any[] = [];
            if (Array.isArray(data)) eps = data;
            else if (Array.isArray(data?.data)) eps = data.data;
            else if (Array.isArray(data?.episodes)) eps = data.episodes;
            else if (data?.data?.data && Array.isArray(data.data.data)) eps = data.data.data;
            else if (typeof data === 'object') {
              for (const key in data) {
                if (Array.isArray(data[key])) {
                  eps = data[key];
                  break;
                }
              }
            }
            if (eps.length > 0) {
              episodesResult = eps;
            }
          }
        } catch (e) {
          console.error("Episodes API failed:", e);
        }
      }

      if (episodesResult.length === 0) {
        const matched = fallbackAnimes.find(a => String(a.id) === String(targetId));
        const totalEp = matched?.episodes || 24;
        const eps = [];
        for (let i = 1; i <= Math.min(totalEp, 200); i++) {
          eps.push({ id: `${targetId}-ep-${i}`, number: i, title: `Episode ${i}` });
        }
        episodesResult = eps;
      }

      const finalEpisodes = normalizeAndCleanEpisodes(episodesResult, parentAnime?.type);
      apiCache.set(cacheKey, finalEpisodes);
      return finalEpisodes;
    };

    const dedupedPromise = dedupeRequest(cacheKey, fetcher);

    if (cached) {
      dedupedPromise.catch(() => {});
      return cached;
    }

    return dedupedPromise;
  },
  characters: async (id: string) => {
    const liveId = localToKryzoxIdMap[id] || id;
    try {
      return await fetchApi(`/anime/${liveId}/characters`);
    } catch (e) {
      return [];
    }
  },
  staff: async (id: string) => {
    const liveId = localToKryzoxIdMap[id] || id;
    try {
      return await fetchApi(`/anime/${liveId}/staff`);
    } catch (e) {
      return [];
    }
  },
  relations: async (id: string) => {
    const liveId = localToKryzoxIdMap[id] || id;
    try {
      return await fetchApi(`/anime/${liveId}/relations`);
    } catch (e) {
      return [];
    }
  },
  recommendations: async (id: string) => {
    const liveId = localToKryzoxIdMap[id] || id;
    try {
      return await fetchApi(`/anime/${liveId}/recommendations`);
    } catch (e) {
      return [];
    }
  },
};

export function prefetchAnime(id: string) {
  if (typeof window === 'undefined' || !id) return;
  const runner = () => {
    api.animeInfo(id).catch(() => {});
    api.episodes(id).catch(() => {});
  };
  if ('requestIdleCallback' in window) {
    (window as any).requestIdleCallback(runner);
  } else {
    setTimeout(runner, 1000);
  }
}
