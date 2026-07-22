// AnOvA API Service Layer
// Base URL: https://backup--idplaypoinbdb.replit.app

export interface AnovaSearchResult {
  title: string;
  anime_id: string;
  poster: string;
}

export interface AnovaAnimeDetails {
  title: string;
  anime_id: string;
  poster: string;
  overview?: string;
  genres?: string[];
  year?: string;
  seasons?: string;
  episodes?: string;
  rating?: string;
}

import { safeLocalStorageSet } from '../lib/api';

export interface AnovaEpisode {
  title: string;
  season: string;
  episode: string;
  image: string;
}

export interface AnovaStreamLink {
  type: 'stream' | 'server';
  language?: string;
  server?: string;
  link: string;
}

export interface AnovaDownloadLink {
  label: string;
  link: string;
}

export interface AnovaDownloadResponse {
  downloads: AnovaDownloadLink[];
  streams: { language: string; link: string }[];
}

const BASE_URL = '/api/anova';

// Local storage cache for mapped IDs to avoid redundant API search queries
const mappingCacheKey = 'anova_local_to_anova_id_map';
const idMappingCache: Record<string, string> = (() => {
  try {
    const saved = localStorage.getItem(mappingCacheKey);
    return saved ? JSON.parse(saved) : {};
  } catch (_) {
    return {};
  }
})();

const saveIdMapping = (localId: string, anovaId: string) => {
  idMappingCache[localId] = anovaId;
  safeLocalStorageSet(mappingCacheKey, JSON.stringify(idMappingCache));
};

// Hardcoded initial high-fidelity mappings for core titles
const staticIdMappings: Record<string, string> = {
  "1": "one-piece",
  "2": "naruto",
  "3": "attack-on-titan",
  "4": "demon-slayer",
  "5": "jujutsu-kaisen",
  "6": "solo-leveling",
  "7": "chainsaw-man",
  "8": "frieren",
  "9": "sakamoto-days",
  "10": "dandadan",
  "11": "overflow",
  "12": "bleach",
  "13": "black-clover",
  "14": "witch-hat-atelier",
  "15": "crowned-in-a-hundred-days",
  "19706": "black-clover" // Black Clover Season 2 maps to Black Clover
};

export const anovaApi = {
  getHome: async (): Promise<any> => {
    try {
      const res = await fetch(`${BASE_URL}/api`);
      if (!res.ok) throw new Error(`HTTP error ${res.status}`);
      const data = await res.json();
      return data;
    } catch (err) {
      console.error("[AnOvA API] Error fetching home data:", err);
      throw err;
    }
  },

  getSeries: async (page = 1): Promise<any> => {
    try {
      const res = await fetch(`${BASE_URL}/api/series?page=${page}`);
      if (!res.ok) throw new Error(`HTTP error ${res.status}`);
      const data = await res.json();
      return data;
    } catch (err) {
      console.error("[AnOvA API] Error fetching series page:", page, err);
      throw err;
    }
  },

  getMovies: async (page = 1): Promise<any> => {
    try {
      const res = await fetch(`${BASE_URL}/api/movies?page=${page}`);
      if (!res.ok) throw new Error(`HTTP error ${res.status}`);
      const data = await res.json();
      return data;
    } catch (err) {
      console.error("[AnOvA API] Error fetching movies page:", page, err);
      throw err;
    }
  },

  search: async (query: string): Promise<AnovaSearchResult[]> => {
    if (!query || !query.trim()) return [];
    try {
      const res = await fetch(`${BASE_URL}/api/search?s=${encodeURIComponent(query.trim())}`);
      if (!res.ok) throw new Error(`HTTP error ${res.status}`);
      const data = await res.json();
      
      // Handle the various nesting formats of search results
      if (Array.isArray(data)) return data;
      if (data.results && Array.isArray(data.results)) return data.results;
      if (data.results?.results && Array.isArray(data.results.results)) return data.results.results;
      if (data.data?.results && Array.isArray(data.data.results)) return data.data.results;
      if (data.data?.results?.results && Array.isArray(data.data.results.results)) return data.data.results.results;
      return [];
    } catch (err) {
      console.error("[AnOvA API] Error searching query:", query, err);
      return [];
    }
  },

  getInfo: async (animeId: string): Promise<AnovaAnimeDetails | null> => {
    try {
      const res = await fetch(`${BASE_URL}/api/info?id=${encodeURIComponent(animeId)}`);
      if (!res.ok) throw new Error(`HTTP error ${res.status}`);
      const data = await res.json();
      return data?.data || data || null;
    } catch (err) {
      console.error("[AnOvA API] Error fetching info:", animeId, err);
      return null;
    }
  },

  getEpisodes: async (animeId: string, season = "1"): Promise<AnovaEpisode[]> => {
    try {
      const res = await fetch(`${BASE_URL}/api/episode?id=${encodeURIComponent(animeId)}&season=${season}`);
      if (!res.ok) throw new Error(`HTTP error ${res.status}`);
      const data = await res.json();
      
      if (Array.isArray(data)) return data;
      if (data.data && Array.isArray(data.data)) return data.data;
      if (data.results && Array.isArray(data.results)) return data.results;
      return [];
    } catch (err) {
      console.error("[AnOvA API] Error fetching episodes:", animeId, season, err);
      return [];
    }
  },

  getStream: async (animeId: string, season = "1", ep = 1): Promise<AnovaStreamLink[]> => {
    try {
      const res = await fetch(`${BASE_URL}/api/stream?id=${encodeURIComponent(animeId)}&season=${season}&ep=${ep}`);
      if (!res.ok) {
        if (res.status === 404) {
          console.warn(`[AnOvA API] Stream links not found (404) for: ${animeId} S${season}E${ep}`);
          return [];
        }
        throw new Error(`HTTP error ${res.status}`);
      }
      const data = await res.json();
      
      if (Array.isArray(data)) return data;
      if (data.results && Array.isArray(data.results)) return data.results;
      if (data.data && Array.isArray(data.data)) return data.data;
      return [];
    } catch (err) {
      console.warn("[AnOvA API] Failed to fetch stream links:", animeId, season, ep, err);
      return [];
    }
  },

  getMovieStream: async (movieId: string): Promise<any> => {
    try {
      const res = await fetch(`${BASE_URL}/api/movie?id=${encodeURIComponent(movieId)}`);
      if (!res.ok) {
        if (res.status === 404) {
          console.warn(`[AnOvA API] Movie stream not found (404) for: ${movieId}`);
          return null;
        }
        throw new Error(`HTTP error ${res.status}`);
      }
      const data = await res.json();
      return data?.results || data || null;
    } catch (err) {
      console.warn("[AnOvA API] Failed to fetch movie stream:", movieId, err);
      return null;
    }
  },

  getDownload: async (animeId: string, season = "1", ep = 1): Promise<AnovaDownloadResponse | null> => {
    try {
      const res = await fetch(`${BASE_URL}/api/download?id=${encodeURIComponent(animeId)}&season=${season}&ep=${ep}`);
      if (!res.ok) throw new Error(`HTTP error ${res.status}`);
      const data = await res.json();
      return data?.data || data || null;
    } catch (err) {
      console.error("[AnOvA API] Error fetching download links:", animeId, season, ep, err);
      return null;
    }
  },

  // Smart matching utility to match local/kryzox anime ID and title to AnOvA slug-based anime ID
  resolveAnovaId: async (localId: string, title?: string): Promise<string> => {
    if (!localId || localId.startsWith('custom-')) return '';
    
    // 1. Check static hardcoded mappings
    if (staticIdMappings[localId]) {
      return staticIdMappings[localId];
    }

    // 2. Check local persistence cache
    if (idMappingCache[localId]) {
      return idMappingCache[localId];
    }

    // 3. Dynamic title-based search and smart matching
    if (title) {
      console.log(`[AnOvA Matcher] Resolving ID dynamically for: "${title}" (Local ID: ${localId})`);
      const results = await anovaApi.search(title);
      if (results && results.length > 0) {
        const cleanTitle = title.toLowerCase().replace(/[^a-z0-9]/g, '');
        
        // Look for close title matches
        for (const item of results) {
          const cleanItemTitle = item.title.toLowerCase().replace(/[^a-z0-9]/g, '');
          if (cleanItemTitle === cleanTitle || cleanItemTitle.includes(cleanTitle) || cleanTitle.includes(cleanItemTitle)) {
            console.log(`[AnOvA Matcher] Matched dynamically via search: ${localId} -> ${item.anime_id}`);
            saveIdMapping(localId, item.anime_id);
            return item.anime_id;
          }
        }
        
        // Fallback to first result if no perfect match
        console.log(`[AnOvA Matcher] Fallback dynamic match: ${localId} -> ${results[0].anime_id}`);
        saveIdMapping(localId, results[0].anime_id);
        return results[0].anime_id;
      }
    }

    // Default: try slugifying the title or return localId
    if (title) {
      const slugified = title.toLowerCase()
        .replace(/[^a-z0-9\s-]/g, '')
        .replace(/\s+/g, '-')
        .replace(/-+/g, '-');
      return slugified;
    }

    return localId;
  }
};
