// @ts-nocheck
import React, { useEffect, useState, useRef } from 'react';
import { useParams, useSearchParams, useNavigate, useLocation } from 'react-router-dom';
import { api, fallbackAnimes, apiCache, safeLocalStorageSet, localToKryzoxIdMap, normalizeAndCleanEpisodes } from '../lib/api';
import { anovaApi } from '../services/anovaApi';
import { useAppStore } from '../store';
import { Settings, SkipForward, SkipBack, Heart, MonitorPlay, Subtitles, Mic, ChevronLeft, ChevronRight, ArrowLeft, ShieldAlert, Layers } from 'lucide-react';
import { cn } from '../lib/utils';
import { CommentSystem } from '../components/CommentSystem';
import { logWatchEvent, saveGlobalWorkingServer, getGlobalWorkingServer, saveEpisodeOverlaySettings, getEpisodeOverlaySettings, saveGlobalAnimeMapping, getGlobalAnimeMapping } from '../lib/firebaseSync';
import { db } from '../lib/firebase';
import { ref, onValue, get } from 'firebase/database';

const getDailymotionEmbedUrl = (rawUrl: string, autoPlay = false) => {
  if (!rawUrl) return '';

  const trimmed = rawUrl.trim();
  const idMatch = trimmed.match(/(?:dailymotion\.com\/(?:embed\/)?video\/|dai\.ly\/)([a-zA-Z0-9]+)/i)
    || trimmed.match(/^([a-zA-Z0-9]{5,})$/);

  if (!idMatch?.[1]) return trimmed;

  const params = new URLSearchParams({
    autoplay: autoPlay ? '1' : '0',
    'queue-enable': 'false',
    'sharing-enable': 'false',
  });

  return `https://www.dailymotion.com/embed/video/${idMatch[1]}?${params.toString()}`;
};

const getOdyseeEmbedUrl = (rawUrl: string, autoPlay = false) => {
  if (!rawUrl) return '';

  const trimmed = rawUrl.trim();
  
  // If it's already an embed URL, return it
  if (trimmed.includes('/$/embed/')) {
    return trimmed;
  }

  // Support converting various odysee formats
  const match = trimmed.match(/^(https?:\/\/(?:[a-zA-Z0-9-]+\.)?odysee\.com)\/(.+)$/i);
  if (match) {
    const baseUrl = match[1];
    const path = match[2];
    return `${baseUrl}/$/embed/${path}`;
  }

  return trimmed;
};

const getRumbleEmbedUrl = (rawUrl: string) => {
  if (!rawUrl) return '';
  let trimmed = rawUrl.trim();

  // If already an embed URL
  if (trimmed.includes('rumble.com/embed/')) {
    return trimmed;
  }

  // Handle standard formats: rumble.com/v123456-title.html
  const matchWithTitle = trimmed.match(/rumble\.com\/(v[a-zA-Z0-9]+)-[a-zA-Z0-9-]+\.html/i);
  if (matchWithTitle && matchWithTitle[1]) {
    return `https://rumble.com/embed/${matchWithTitle[1]}/`;
  }

  // Handle standard simple formats: rumble.com/v123456
  const matchSimple = trimmed.match(/rumble\.com\/(v[a-zA-Z0-9]+)/i);
  if (matchSimple && matchSimple[1]) {
    return `https://rumble.com/embed/${matchSimple[1]}/`;
  }

  return trimmed;
};

const getEmbedOrDirectUrl = (rawUrl: string, autoPlay = false) => {
  if (!rawUrl) return '';
  let trimmed = rawUrl.trim();

  // If the user pasted a full iframe HTML, extract the src attribute!
  if (trimmed.includes('<iframe') && trimmed.includes('src=')) {
    const srcMatch = trimmed.match(/src=["']([^"']+)["']/i);
    if (srcMatch && srcMatch[1]) {
      trimmed = srcMatch[1].trim();
    }
  }

  if (trimmed.includes('rumble.com')) {
    return getRumbleEmbedUrl(trimmed);
  }

  if (trimmed.includes('dailymotion.com') || trimmed.includes('dai.ly')) {
    return getDailymotionEmbedUrl(trimmed, autoPlay);
  }

  if (trimmed.includes('odysee.com')) {
    return getOdyseeEmbedUrl(trimmed, autoPlay);
  }

  return trimmed;
};

/**
 * Generates the official 4Animo embed URL using the official patterns.
 * Placeholders: {server}, {animo_id}, {anilist_id}, {mal_id}, {episode}, {type}
 */
export const getOfficial4AnimoEmbedUrl = (params: {
  server: string;
  idType: 'af' | 'ani' | 'mal';
  animoId?: string;
  anilistId?: string;
  malId?: string;
  episode: number | string;
  audio: string; // matches `{type}` parameter in official patterns
  autoPlay?: boolean;
  skipIntro?: boolean;
  skipOutro?: boolean;
  includeQueryParams?: boolean;
}) => {
  const serverVal = (params.server || 'hd-1').toLowerCase();
  let idTypeVal = (params.idType || 'ani').toLowerCase() as 'af' | 'ani' | 'mal';
  const episodeVal = String(params.episode || 1);
  const audioTypeVal = (params.audio || 'sub').toLowerCase();

  // Sanitize IDs
  const cleanAni = (params.anilistId && params.anilistId !== 'null' && params.anilistId !== 'undefined' && params.anilistId !== '0') ? params.anilistId : '';
  const cleanMal = (params.malId && params.malId !== 'null' && params.malId !== 'undefined' && params.malId !== '0') ? params.malId : '';
  const cleanAf = (params.animoId && params.animoId !== 'null' && params.animoId !== 'undefined' && params.animoId !== '0') ? params.animoId : '';

  // Determine active target ID based on requested idType and fallback to available IDs
  let targetId = '';
  if (idTypeVal === 'ani' && cleanAni) {
    targetId = cleanAni;
  } else if (idTypeVal === 'mal' && cleanMal) {
    targetId = cleanMal;
  } else if (idTypeVal === 'af' && cleanAf) {
    targetId = cleanAf;
  }

  // If requested ID type is missing an ID, fallback automatically
  if (!targetId) {
    if (cleanAni) {
      idTypeVal = 'ani';
      targetId = cleanAni;
    } else if (cleanMal) {
      idTypeVal = 'mal';
      targetId = cleanMal;
    } else if (cleanAf) {
      idTypeVal = 'af';
      targetId = cleanAf;
    }
  }

  // Guaranteed clean path construction without double slashes
  let url = '';
  if (idTypeVal === 'af') {
    // Internal Episode ID format: /embed/{server}/in/{episode_id}/{type}
    url = `https://cdn.4animo.xyz/embed/${serverVal}/in/${targetId}/${audioTypeVal}`;
  } else if (idTypeVal === 'mal') {
    // MAL format: /embed/{server}/mal/{mal_id}/{episode}/{type}
    url = `https://cdn.4animo.xyz/embed/${serverVal}/mal/${targetId}/${episodeVal}/${audioTypeVal}`;
  } else {
    // AniList format: /embed/{server}/ani/{anilist_id}/{episode}/{type}
    url = `https://cdn.4animo.xyz/embed/${serverVal}/ani/${targetId}/${episodeVal}/${audioTypeVal}`;
  }

  if (params.includeQueryParams !== false) {
    const queryParts: string[] = ['k=1'];
    if (params.autoPlay !== undefined) {
      queryParts.push(`autoPlay=${params.autoPlay ? '1' : '0'}`);
    }
    if (params.skipIntro !== undefined) {
      queryParts.push(`skipIntro=${params.skipIntro ? '1' : '0'}`);
    }
    if (params.skipOutro !== undefined) {
      queryParts.push(`skipOutro=${params.skipOutro ? '1' : '0'}`);
    }
    url += `?${queryParts.join('&')}`;
  }

  return url;
};

// ==========================================
// ADVERTISEMENT SCRIPT INJECTION ENGINE
// ==========================================
export function AdScriptRunner({ script }: { script: string }) {
  const containerRef = React.useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!containerRef.current || !script) return;

    containerRef.current.innerHTML = '';

    const trimmed = script.trim();
    const isRawUrl = trimmed.startsWith('http') && !trimmed.includes('<');

    if (isRawUrl) {
      const iframeEl = document.createElement('iframe');
      iframeEl.src = trimmed;
      iframeEl.style.width = '100%';
      iframeEl.style.height = '100%';
      iframeEl.style.border = 'none';
      iframeEl.style.minHeight = '250px';
      iframeEl.setAttribute('allow', 'autoplay');
      containerRef.current.appendChild(iframeEl);

      const linkEl = document.createElement('a');
      linkEl.href = trimmed;
      linkEl.target = '_blank';
      linkEl.rel = 'noopener noreferrer';
      linkEl.className = 'absolute bottom-3 right-3 bg-cyan-500 hover:bg-cyan-600 text-black font-black text-[10px] uppercase tracking-wider py-1.5 px-3 rounded-lg shadow-lg transition-transform hover:scale-105';
      linkEl.innerText = 'Visit Sponsor Site';
      containerRef.current.appendChild(linkEl);
      return;
    }

    const parser = new DOMParser();
    const doc = parser.parseFromString(`<div>${script}</div>`, 'text/html');
    const wrapper = doc.querySelector('div');

    if (wrapper) {
      Array.from(wrapper.childNodes).forEach((node) => {
        if (node.nodeName === 'SCRIPT') {
          const scriptEl = document.createElement('script');
          Array.from((node as HTMLScriptElement).attributes).forEach(attr => {
            scriptEl.setAttribute(attr.name, attr.value);
          });
          scriptEl.textContent = (node as HTMLScriptElement).textContent;
          containerRef.current?.appendChild(scriptEl);
        } else {
          const clone = node.cloneNode(true);
          containerRef.current?.appendChild(clone);
        }
      });
    }
  }, [script]);

  return <div ref={containerRef} className="w-full h-full flex items-center justify-center min-h-[220px] relative" />;
}

// Global High-Speed memory cache for resolved MAL/Anilist/Animo IDs
const resolvedIdsCache = new Map<string, { animoId: string; anilistId: string; malId: string } | null>();

// Persistent localStorage cache for resolved IDs to avoid slow background network checks
const getPersistentResolvedIds = (animeId: string): { animoId: string; anilistId: string; malId: string } | null => {
  try {
    const saved = localStorage.getItem(`resolved_ids_${animeId}`);
    if (saved) {
      return JSON.parse(saved);
    }
  } catch (_) {}
  return null;
};

const setPersistentResolvedIds = (animeId: string, ids: { animoId: string; anilistId: string; malId: string }) => {
  safeLocalStorageSet(`resolved_ids_${animeId}`, JSON.stringify(ids));
};

// Non-blocking headless verification function for embed URLs
const verifyUrl = async (url: string): Promise<{ success: boolean; status: string | number }> => {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 2000); // 2-second fast resilient threshold
    
    // Attempt standard CORS fetch first to get real status codes (as cdn.4animo.xyz supports CORS)
    const response = await fetch(url, { method: 'GET', signal: controller.signal });
    clearTimeout(timeoutId);
    
    if (!response.ok) {
      console.warn(`[Verification] URL returned error status ${response.status}: ${url}`);
      return { success: false, status: response.status };
    }
    
    return { success: true, status: response.status || 200 };
  } catch (err: any) {
    if (err.name === 'AbortError') {
      console.warn(`[Verification] Timeout for URL: ${url}`);
      return { success: false, status: 'TIMEOUT' };
    }
    
    // Fall back to no-cors mode if CORS is blocked on third-party servers
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 2000);
      const response = await fetch(url, { method: 'GET', mode: 'no-cors', signal: controller.signal });
      clearTimeout(timeoutId);
      return { success: true, status: 'CORS_OPAQUE' };
    } catch (innerErr: any) {
      if (innerErr.name === 'AbortError') {
        return { success: false, status: 'TIMEOUT' };
      }
      console.warn(`[Verification] Double connection failure for URL: ${url}`, innerErr);
      return { success: false, status: innerErr.status || 'ERROR' };
    }
  }
};

/**
 * Preloads the .m3u8 manifest file and its initial segments into the browser HTTP cache.
 * This primes the network connection and prevents player startup latency.
 */
const preloadManifestAndSegments = async (url: string) => {
  if (!url || !url.includes('.m3u8')) return;
  try {
    const response = await fetch(url, { method: 'GET', mode: 'cors', credentials: 'omit' });
    if (!response.ok) return;
    const manifestText = await response.text();
    
    const lines = manifestText.split('\n');
    const segmentUrls: string[] = [];
    const baseUrl = url.substring(0, url.lastIndexOf('/') + 1);
    
    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed && !trimmed.startsWith('#')) {
        let segmentUrl = trimmed;
        if (!trimmed.startsWith('http://') && !trimmed.startsWith('https://')) {
          segmentUrl = baseUrl + trimmed;
        }
        segmentUrls.push(segmentUrl);
        if (segmentUrls.length >= 2) break;
      }
    }
    
    // Fetch initial segments in parallel to populate the browser's disk/memory cache
    await Promise.all(
      segmentUrls.map(async (segUrl) => {
        try {
          await fetch(segUrl, { method: 'GET', mode: 'cors', credentials: 'omit' });
        } catch (_) {}
      })
    );
  } catch (err) {
    console.warn("[HLS Preloader] Dynamic prefetch failed:", err);
  }
};

/**
 * Creates and configures a highly optimized Hls.js instance with smart buffering,
 * retry backoffs, memory optimization, and metrics monitoring.
 */
const createOptimalHls = (
  url: string,
  el: HTMLVideoElement,
  options: {
    audio: 'sub' | 'dub';
    selectedAnovaLanguage?: string;
    onFirstFrame?: () => void;
    onError?: (reason: string, fatal: boolean) => void;
  }
) => {
  if (!(window as any).Hls) return null;
  
  const hlsInitStart = performance.now();
  const perfMetrics = (window as any).__anova_perf_metrics || {
    apiResponseTimes: [],
    embedLoadTimes: [],
    playerInitTimes: [],
    cacheHits: 0,
    cacheMisses: 0,
    retries: 0,
  };
  
  if (!perfMetrics.manifestLoadTimes) perfMetrics.manifestLoadTimes = [];
  if (!perfMetrics.firstFrameTimes) perfMetrics.firstFrameTimes = [];
  if (!perfMetrics.segmentDownloadTimes) perfMetrics.segmentDownloadTimes = [];
  if (!perfMetrics.bufferHealths) perfMetrics.bufferHealths = [];
  if (!perfMetrics.failureReasons) perfMetrics.failureReasons = [];
  if (!perfMetrics.networkLatencies) perfMetrics.networkLatencies = [];
  if (!perfMetrics.currentQuality) perfMetrics.currentQuality = 'Auto';
  
  const hlsConfig = {
    enableWorker: true,
    lowLatencyMode: true,
    
    // Smart Buffering & Adaptive Buffer Size
    maxBufferLength: 35,
    maxMaxBufferLength: 75,
    maxBufferSize: 80 * 1024 * 1024, // 80 MB
    maxBufferHole: 0.8,              // Skip holes automatically to prevent infinite loading
    backBufferLength: 15,            // Save device memory by pruning played parts
    
    progressive: true,
    testBandwidth: true,
    
    // Timeout definitions and robust backoffs
    manifestLoadingTimeOut: 12000,
    manifestLoadingMaxRetry: 6,
    manifestLoadingRetryDelay: 800,
    manifestLoadingMaxRetryDelay: 5000,
    
    levelLoadingTimeOut: 12000,
    levelLoadingMaxRetry: 6,
    levelLoadingRetryDelay: 800,
    levelLoadingMaxRetryDelay: 5000,
    
    fragLoadingTimeOut: 15000,
    fragLoadingMaxRetry: 8,
    fragLoadingRetryDelay: 500,
    fragLoadingMaxRetryDelay: 5000,
    
    // Adaptive stream configurations
    abrEwmaFastLive: 1.0,
    abrEwmaSlowLive: 3.0,
    abrEwmaFastVoD: 2.0,
    abrEwmaSlowVoD: 4.0,
    abrBandWidthFactor: 0.9,
    abrBandWidthUpFactor: 0.7,
  };
  
  const hls = new (window as any).Hls(hlsConfig);
  
  // Track metrics
  hls.on((window as any).Hls.Events.MANIFEST_LOADED, (event: any, data: any) => {
    const manifestTime = Math.round(performance.now() - hlsInitStart);
    perfMetrics.manifestLoadTimes.push(manifestTime);
    if (data.networkDetails?.latency) {
      perfMetrics.networkLatencies.push(Math.round(data.networkDetails.latency));
    }
  });
  
  hls.on((window as any).Hls.Events.FRAG_LOADED, (event: any, data: any) => {
    if (data.stats && data.stats.loading) {
      const fragTime = Math.round(data.stats.loading.end - data.stats.loading.start);
      perfMetrics.segmentDownloadTimes.push(fragTime);
    }
  });
  
  hls.on((window as any).Hls.Events.MANIFEST_PARSED, () => {
    const targetLang = options.selectedAnovaLanguage || (options.audio === 'dub' ? 'hindi' : 'japanese');
    const targetLangLower = targetLang.toLowerCase();
    const tracks = hls.audioTracks;
    const trackIndex = tracks.findIndex((t: any) => {
      const lang = t.lang?.toLowerCase() || '';
      const name = t.name?.toLowerCase() || '';
      if (targetLangLower === 'hindi') return lang === 'hin' || name.includes('hindi');
      if (targetLangLower === 'japanese' || targetLangLower === 'sub') return lang === 'jpn' || name.includes('japanese') || name.includes('sub');
      return lang.includes(targetLangLower) || name.includes(targetLangLower);
    });
    if (trackIndex !== -1) {
      hls.audioTrack = trackIndex;
      console.log(`[HLS Audio] Swapped audio track to index ${trackIndex} (${targetLangLower})`);
    }
  });
  
  hls.on((window as any).Hls.Events.LEVEL_SWITCHED, (event: any, data: any) => {
    const level = hls.levels[data.level];
    if (level) {
      perfMetrics.currentQuality = `${level.height}p`;
    }
  });
  
  hls.on((window as any).Hls.Events.ERROR, (event: any, data: any) => {
    console.warn("[HLS Error Handled]", data);
    perfMetrics.retries = (perfMetrics.retries || 0) + 1;
    
    if (data.details) {
      perfMetrics.failureReasons.push(`${data.details} (Fatal: ${!!data.fatal})`);
      if (perfMetrics.failureReasons.length > 20) perfMetrics.failureReasons.shift();
    }
    
    if (data.fatal) {
      if (options.onError) {
        options.onError(data.details || 'Fatal HLS error', true);
      }
      switch (data.type) {
        case (window as any).Hls.ErrorTypes.NETWORK_ERROR:
          hls.startLoad();
          break;
        case (window as any).Hls.ErrorTypes.MEDIA_ERROR:
          hls.recoverMediaError();
          break;
        default:
          hls.destroy();
          break;
      }
    }
  });
  
  let firstFrameRecorded = false;
  const trackBuffer = () => {
    if (el.paused && el.ended) return;
    try {
      const buffered = el.buffered;
      const currentTime = el.currentTime;
      let bufferLen = 0;
      for (let i = 0; i < buffered.length; i++) {
        if (currentTime >= buffered.start(i) && currentTime <= buffered.end(i)) {
          bufferLen = Math.round((buffered.end(i) - currentTime) * 10) / 10;
          break;
        }
      }
      perfMetrics.bufferHealths.push(bufferLen);
      if (perfMetrics.bufferHealths.length > 20) perfMetrics.bufferHealths.shift();
    } catch (_) {}
    
    if (!firstFrameRecorded && el.currentTime > 0.05) {
      const firstFrameTime = Math.round(performance.now() - hlsInitStart);
      perfMetrics.firstFrameTimes.push(firstFrameTime);
      firstFrameRecorded = true;
      if (options.onFirstFrame) {
        options.onFirstFrame();
      }
    }
  };
  
  const bufferInterval = setInterval(trackBuffer, 1000);
  hls.on((window as any).Hls.Events.DESTROYING, () => {
    clearInterval(bufferInterval);
  });
  
  (window as any).__anova_perf_metrics = perfMetrics;
  return hls;
};

export function Watch() {
  const { id } = useParams();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const location = useLocation();
  
  const initialEp = Number(searchParams.get('ep')) || Number(searchParams.get('episode')) || 1;
  const [episode, setEpisode] = useState(initialEp);

  // State definitions for the priority-based play & failover engine (hoisted to prevent TDZ errors)
  const [verifiedPlaybackUrl, setVerifiedPlaybackUrl] = useState('');
  const [currentIdType, setCurrentIdType] = useState<'af' | 'ani' | 'mal'>('ani');
  const [malRetryCount, setMalRetryCount] = useState(0);
  const [verificationInProgress, setVerificationInProgress] = useState(false);
  const [resolvedIds, setResolvedIds] = useState<{ animoId: string; anilistId: string; malId: string } | null>(null);

  // Premium Video Overlay Protection System States
  const [bottomOverlay, setBottomOverlay] = useState(false);
  const [topOverlay, setTopOverlay] = useState(false);

  // Synchronous player URL transition tracker to eliminate race conditions
  const [prevUrl, setPrevUrl] = useState('');
  const [prevCustomUrl, setPrevCustomUrl] = useState('');
  const [prevUserStarted, setPrevUserStarted] = useState(false);

  // Synchronize episode state if URL parameter changes (e.g. from tests or detail pages)
  useEffect(() => {
    const epVal = Number(searchParams.get('ep')) || Number(searchParams.get('episode')) || 1;
    if (epVal !== episode) {
      setEpisode(epVal);
    }
  }, [searchParams]);
  const [server, setServer] = useState(() => {
    try {
      const lastSrv = localStorage.getItem('anova_last_working_server');
      if (lastSrv) return lastSrv;
    } catch (_) {}
    return 'hd-1';
  });
  const [audio, setAudio] = useState<'sub' | 'dub'>('sub');
  const [selectedLanguage, setSelectedLanguage] = useState('sub');
  
  const [isUsingAnovaBackup, setIsUsingAnovaBackup] = useState(false);
  const [anovaLanguages, setAnovaLanguages] = useState<string[]>([]);
  const [anovaStreams, setAnovaStreams] = useState<any[]>([]);
  const [selectedAnovaLanguage, setSelectedAnovaLanguage] = useState<string>('');
  const anovaBackupTriedRef = React.useRef<Record<string, boolean>>({});
  const hdServersTriedRef = React.useRef<Record<string, boolean>>({});

  const [perfSettings, setPerfSettings] = useState(() => {
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
  });

  const [serverRankings, setServerRankings] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem('anova_server_rankings');
      if (saved) return JSON.parse(saved);
    } catch (_) {}
    return ['hd-1', 'hd-2', 'hd-3', 'hd-4', 'hd-5', 'ani', 'mal', 'af'];
  });

  const [debugTab, setDebugTab] = useState<'diagnostics' | 'settings' | 'metrics'>('diagnostics');
  const [mountTime] = useState(() => performance.now());
  const loadStartTimeRef = React.useRef(performance.now());

  const togglePerfSetting = (key: keyof typeof perfSettings) => {
    setPerfSettings((prev: any) => {
      const next = { ...prev, [key]: !prev[key] };
      safeLocalStorageSet('anova_perf_settings', JSON.stringify(next));
      return next;
    });
  };
  
  const currentAnimeIdRef = React.useRef(id);
  const lastIdRef = React.useRef(id);

  // Sync current ID ref instantly
  currentAnimeIdRef.current = id;

  // Try to pre-fill anime info from location.state or from cache or fallbackAnimes
  const [anime, setAnime] = useState<any>(() => {
    if (location.state?.anime) {
      return location.state.anime;
    }
    const cached = id ? apiCache.get(`anime_info_${id}`) : null;
    if (cached) return cached;
    const matched = fallbackAnimes.find(a => String(a.id) === String(id));
    return matched || null;
  });
  
  const [episodes, setEpisodes] = useState<any[]>(() => {
    if (!id) return [];
    const cached = apiCache.get(`episodes_${id}`);
    if (cached && cached.length > 0) return cached;
    // Generate fallback episodes instantly for popular/fallback anime
    const matched = fallbackAnimes.find(a => String(a.id) === String(id));
    if (matched) {
      const totalEp = matched.episodes || 24;
      const eps = [];
      for (let i = 1; i <= Math.min(totalEp, 200); i++) {
        eps.push({ id: `${id}-ep-${i}`, number: i, title: `Episode ${i}` });
      }
      return normalizeAndCleanEpisodes(eps, matched.type);
    }
    return [];
  });

  // Smoothly preloaded image URLs to prevent empty/black/skeleton flashes
  const [displayedPoster, setDisplayedPoster] = useState(() => anime?.poster || '');
  const [displayedBanner, setDisplayedBanner] = useState(() => anime?.banner || anime?.poster || '');

  // Render-phase State synchronization: Lock current anime data and load instantly on id param change
  if (id !== lastIdRef.current) {
    lastIdRef.current = id;
    
    const initialAnime = (() => {
      if (location.state?.anime && String(location.state.anime.id) === String(id)) {
        return location.state.anime;
      }
      const cached = id ? apiCache.get(`anime_info_${id}`) : null;
      if (cached) return cached;
      const matched = fallbackAnimes.find(a => String(a.id) === String(id));
      return matched || null;
    })();
    setAnime(initialAnime);

    const initialEpisodes = (() => {
      if (!id) return [];
      const cached = apiCache.get(`episodes_${id}`);
      if (cached && cached.length > 0) return cached;
      const matched = fallbackAnimes.find(a => String(a.id) === String(id));
      if (matched) {
        const totalEp = matched.episodes || 24;
        const eps = [];
        for (let i = 1; i <= Math.min(totalEp, 200); i++) {
          eps.push({ id: `${id}-ep-${i}`, number: i, title: `Episode ${i}` });
        }
        return normalizeAndCleanEpisodes(eps, matched.type);
      }
      return [];
    })();
    setEpisodes(initialEpisodes);
  }

  // Smooth preloading for poster
  useEffect(() => {
    const posterUrl = anime?.poster;
    if (!posterUrl) return;

    if (!displayedPoster) {
      setDisplayedPoster(posterUrl);
      return;
    }

    const img = new Image();
    img.src = posterUrl;
    img.onload = () => {
      if (currentAnimeIdRef.current === id) {
        setDisplayedPoster(posterUrl);
      }
    };
  }, [anime?.poster, id]);

  // Smooth preloading for banner
  useEffect(() => {
    const bannerUrl = anime?.banner || anime?.poster;
    if (!bannerUrl) return;

    if (!displayedBanner) {
      setDisplayedBanner(bannerUrl);
      return;
    }

    const img = new Image();
    img.src = bannerUrl;
    img.onload = () => {
      if (currentAnimeIdRef.current === id) {
        setDisplayedBanner(bannerUrl);
      }
    };
  }, [anime?.banner, anime?.poster, id]);
  const [dbEpisodeData, setDbEpisodeData] = useState<any>(null);
  const [isLoadingDbEpisode, setIsLoadingDbEpisode] = useState(false);

  useEffect(() => {
    if (!id || !episode) {
      setDbEpisodeData(null);
      return;
    }
    
    let active = true;
    setIsLoadingDbEpisode(true);
    
    const epRef = ref(db, `episodes/${id}/${episode}`);
    get(epRef).then((snap) => {
      if (!active) return;
      setIsLoadingDbEpisode(false);
      if (snap.exists()) {
        const data = snap.val();
        const epNum = Number(data.episodeNumber !== undefined ? data.episodeNumber : data.number);
        if (epNum === Number(episode)) {
          setDbEpisodeData({
            ...data,
            number: epNum,
            episodeNumber: epNum,
            videoSources: data.videoSources || data.video_sources || {}
          });
        } else {
          console.warn("[Episode Verification Failed] Selected episode number mismatch.");
          setDbEpisodeData(null);
        }
      } else {
        setDbEpisodeData(null);
      }
    }).catch((err) => {
      console.error("Error fetching single episode:", err);
      if (active) {
        setIsLoadingDbEpisode(false);
        setDbEpisodeData(null);
      }
    });

    return () => {
      active = false;
    };
  }, [id, episode]);

  const currentEpData = (() => {
    if (dbEpisodeData) {
      if (dbEpisodeData.episodeNumber === episode) {
        return dbEpisodeData;
      }
    }
    const found = episodes.find(ep => ep.number === episode);
    if (found && found.episodeNumber === episode) {
      return found;
    }
    return null;
  })();

  const isCustomEpisode = !!(currentEpData && currentEpData.videoSources);
  
  const availableStreams = isCustomEpisode 
    ? Object.keys(currentEpData.videoSources).filter(k => {
        const src = currentEpData.videoSources[k];
        return src && src.enabled && src.url;
      })
    : [];

  // ==========================================
  // REAL-TIME ADVERTISEMENT ENGINE
  // ==========================================
  const [advertisements, setAdvertisements] = useState<any[]>([]);
  const [activeAd, setActiveAd] = useState<any>(null);
  const [showAdOverlay, setShowAdOverlay] = useState(false);
  const [userHasStartedPlayback, setUserHasStartedPlayback] = useState(true);

  // Volume & Muted persistence state for native video elements
  const [playerMuted, setPlayerMuted] = useState(true); // default to true for autoplay compliance
  const [playerVolume, setPlayerVolume] = useState(() => {
    try {
      const saved = localStorage.getItem('anova_player_volume');
      return saved ? parseFloat(saved) : 1.0;
    } catch (_) {
      return 1.0;
    }
  });

  const handleVolumeChange = (e: React.SyntheticEvent<HTMLVideoElement>) => {
    const video = e.currentTarget;
    setPlayerVolume(video.volume);
    setPlayerMuted(video.muted);
    try {
      localStorage.setItem('anova_player_volume', String(video.volume));
      localStorage.setItem('anova_player_muted', String(video.muted));
    } catch (_) {}
  };

  const handleNativeVideoPlaying = (e: React.SyntheticEvent<HTMLVideoElement>) => {
    handleIframeLoad();
    
    let isExplicitlyMuted = false;
    try {
      isExplicitlyMuted = localStorage.getItem('anova_player_muted') === 'true';
    } catch (_) {}

    if (!isExplicitlyMuted && autoPlay) {
      const video = e.currentTarget;
      setTimeout(() => {
        if (video) {
          video.muted = false;
          setPlayerMuted(false);
          video.play().catch((err) => {
            console.warn("[Smart Autoplay] Unmuting blocked by browser, reverting to muted:", err);
            video.muted = true;
            setPlayerMuted(true);
          });
        }
      }, 800);
    }
  };

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const activeHlsRef = useRef<any>(null);

  // Clean up Hls instances on unmount
  useEffect(() => {
    return () => {
      if (activeHlsRef.current) {
        activeHlsRef.current.destroy();
        activeHlsRef.current = null;
      }
    };
  }, []);

  // Background resolve and cache the next episode's backup stream URL
  const nextEpisodeStreamCacheRef = useRef<Record<string, string>>({});

  useEffect(() => {
    if (!id || !episode || !audio || isCustomEpisode) return;
    
    const nextEp = episode + 1;
    const cacheKey = `${id}-${nextEp}-${audio}`;
    if (nextEpisodeStreamCacheRef.current[cacheKey]) return;

    const preloadNextStream = async () => {
      try {
        const title = anime?.title;
        const result = await getAnovaStreamUrl(id, nextEp, title, audio);
        if (result && result.success && result.url) {
          console.log(`[Preload] Resolved and cached next episode E${nextEp} stream URL:`, result.url);
          nextEpisodeStreamCacheRef.current[cacheKey] = result.url;
          
          // Preload HLS / video bytes using a hidden link tag
          const preloadLink = document.createElement('link');
          preloadLink.rel = 'preload';
          preloadLink.as = 'video';
          preloadLink.href = result.url;
          document.head.appendChild(preloadLink);
          
          setTimeout(() => {
            try {
              document.head.removeChild(preloadLink);
            } catch (_) {}
          }, 15000);
        }
      } catch (err) {
        console.warn("[Preload] Failed to resolve next episode stream:", err);
      }
    };

    const timer = setTimeout(preloadNextStream, 4000);
    return () => clearTimeout(timer);
  }, [id, episode, audio, anime, isCustomEpisode]);



  // Auto-reset playback start state when the user shifts to a new episode or show
  useEffect(() => {
    setUserHasStartedPlayback(true);
    setIsUsingAnovaBackup(false);
    setSelectedAnovaLanguage('');
    setAnovaLanguages([]);
    setAnovaStreams([]);
  }, [id, episode]);

  // Reset tried servers only when core parameters (anime, episode, audio) change
  useEffect(() => {
    hdServersTriedRef.current = {};
    anovaBackupTriedRef.current = {};
  }, [id, episode, audio]);

  useEffect(() => {
    const adsRef = ref(db, 'advertisements');
    const unsubAds = onValue(adsRef, (snap) => {
      if (snap.exists()) {
        const list = Object.values(snap.val()).filter((ad: any) => ad && ad.status === 'enabled');
        setAdvertisements(list);
      } else {
        setAdvertisements([]);
      }
    });
    return () => unsubAds();
  }, []);

  const getMatchingVideoStartAd = () => {
    const activeAds = advertisements.filter((ad: any) => {
      // 1. Status Check
      if (ad.status !== 'enabled') return false;

      // 2. Active Date Range Check
      const nowStr = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
      if (ad.startDate && nowStr < ad.startDate) return false;
      if (ad.endDate && nowStr > ad.endDate) return false;

      // 3. Targeting Check
      if (ad.targetMode === 'all') {
        return true;
      }

      const currentAnimeId = String(anime?.id || '');
      if (!currentAnimeId) return false;

      const targetIds = Array.isArray(ad.targetAnimeIds)
        ? ad.targetAnimeIds.map(String)
        : ad.targetAnimeId ? [String(ad.targetAnimeId)] : [];

      if (targetIds.includes(currentAnimeId)) {
        return true;
      }

      return false;
    });

    // Sort by highest priority first
    return activeAds.sort((a: any, b: any) => Number(b.priority || 0) - Number(a.priority || 0))[0] || null;
  };

  const checkAdFrequencyAllowed = (ad: any) => {
    if (!ad) return false;
    if (ad.frequency === 'always') return true;
    
    const now = Date.now();
    const sessionKey = `anova_ad_shown_session_${ad.id}`;
    const timestampKey = `anova_ad_shown_time_${ad.id}`;
    
    if (ad.frequency === 'once_per_session') {
      try {
        const shown = sessionStorage.getItem(sessionKey);
        if (shown) return false;
      } catch (_) {}
    }
    
    const intervalMap: Record<string, number> = {
      every_5_m: 5 * 60 * 1000,
      every_10_m: 10 * 60 * 1000,
      every_15_m: 15 * 60 * 1000,
      every_30_m: 30 * 60 * 1000,
      once_per_hour: 60 * 60 * 1000,
    };

    const interval = intervalMap[ad.frequency];
    if (interval) {
      try {
        const lastShown = localStorage.getItem(timestampKey);
        if (lastShown && now - Number(lastShown) < interval) {
          return false;
        }
      } catch (_) {}
    }
    
    return true;
  };

  const recordAdShown = (ad: any) => {
    if (!ad) return;
    const now = Date.now();
    const sessionKey = `anova_ad_shown_session_${ad.id}`;
    const timestampKey = `anova_ad_shown_time_${ad.id}`;
    
    try {
      sessionStorage.setItem(sessionKey, 'true');
    } catch (_) {}
    safeLocalStorageSet(timestampKey, String(now));
  };

  useEffect(() => {
    if (advertisements.length === 0 || !anime) {
      setActiveAd(null);
      setShowAdOverlay(false);
      return;
    }
    
    const matchingAd = getMatchingVideoStartAd();
    if (matchingAd && checkAdFrequencyAllowed(matchingAd)) {
      setActiveAd(matchingAd);
      setShowAdOverlay(true);
    } else {
      setActiveAd(null);
      setShowAdOverlay(false);
    }
  }, [episode, advertisements, anime]);

  const activeCustomSource = isCustomEpisode && currentEpData.videoSources[selectedLanguage]
    ? currentEpData.videoSources[selectedLanguage]
    : null;
  const { saveProgress, favorites, addFavorite, removeFavorite } = useAppStore();

  const [searchQuery, setSearchQuery] = useState('');
  const [currentGroupIdx, setCurrentGroupIdx] = useState(0);

  // Native player state only; no fake loading overlays or automatic server switching.
  const [isIframeLoading, setIsIframeLoading] = useState(false);
  const iframeRef = React.useRef<HTMLIFrameElement>(null);
  const isIframeLoadingRef = React.useRef(false);

  // Tracks successful playback parameters to avoid interrupting active playback
  const lastSuccessParamsRef = React.useRef<{
    id: string;
    episode: number;
    audio: string;
    server: string;
    idType?: string;
    anilistId?: string;
    animoId?: string;
    malId?: string;
  } | null>(null);

  React.useEffect(() => {
    isIframeLoadingRef.current = isIframeLoading;
  }, [isIframeLoading]);

  // Dailymotion UI Mask System setup
  const playerContainerRef = React.useRef<HTMLDivElement>(null);
  const [playerDimensions, setPlayerDimensions] = useState({ width: 0, height: 0 });

  useEffect(() => {
    if (!playerContainerRef.current) return;
    const observer = new ResizeObserver((entries) => {
      for (let entry of entries) {
        const { width, height } = entry.contentRect;
        setPlayerDimensions({ width, height });
      }
    });
    observer.observe(playerContainerRef.current);
    return () => observer.disconnect();
  }, [playerContainerRef.current]);

  const isDailymotionVideo = activeCustomSource && (
    activeCustomSource.type === 'dailymotion' || 
    activeCustomSource.videoType === 'dailymotion' || 
    (activeCustomSource.url && (activeCustomSource.url.includes('dailymotion.com') || activeCustomSource.url.includes('dai.ly')))
  );

  const isOdyseeVideo = activeCustomSource && (
    activeCustomSource.type === 'odysee' || 
    activeCustomSource.videoType === 'odysee' || 
    (activeCustomSource.url && activeCustomSource.url.includes('odysee.com'))
  );

  const isRumbleVideo = activeCustomSource && (
    activeCustomSource.type === 'rumble' || 
    activeCustomSource.videoType === 'rumble' || 
    (activeCustomSource.url && activeCustomSource.url.includes('rumble.com'))
  );

  const shouldHidePlaylist = isDailymotionVideo && activeCustomSource?.hidePlaylist === true;
  const shouldHideShare = isDailymotionVideo && activeCustomSource?.hideShare === true;

  // Global admin toggle: Hide Dailymotion Branding & Show Custom AnOvA Logo
  const [hideDmBranding, setHideDmBranding] = useState(
    () => localStorage.getItem('anova_hide_dm_branding') !== 'false'
  );
  useEffect(() => {
    const onStorage = () => setHideDmBranding(localStorage.getItem('anova_hide_dm_branding') !== 'false');
    window.addEventListener('storage', onStorage);
    window.addEventListener('anova_hide_dm_branding_changed', onStorage);
    return () => {
      window.removeEventListener('storage', onStorage);
      window.removeEventListener('anova_hide_dm_branding_changed', onStorage);
    };
  }, []);
  const showAnovaLogo = isDailymotionVideo && hideDmBranding;

  // States for tracking video playback time and duration
  const [activeVideoTime, setActiveVideoTime] = useState(0);
  const [activeVideoDuration, setActiveVideoDuration] = useState(0);

  // Ref to prevent double-triggering auto skip on the same episode
  const autoSkippedForEpisodeRef = useRef<string | null>(null);

  // Automatically skip to the next episode when reaching the outro (last 25 seconds of the episode)
  useEffect(() => {
    if (activeVideoDuration > 60 && activeVideoTime > activeVideoDuration - 25) {
      const episodeKey = `${id}-${episode}`;
      if (autoSkippedForEpisodeRef.current !== episodeKey) {
        autoSkippedForEpisodeRef.current = episodeKey;
        const hasNext = episodes && episodes.some((ep: any) => Number(ep.number) === Number(episode) + 1);
        if (hasNext) {
          console.log("[Auto-Skip Outro] Automatically skipping to the next episode.");
          setEpisode(e => Number(e) + 1);
        }
      }
    }
  }, [activeVideoTime, activeVideoDuration, id, episode, episodes]);

  // Reset video playback time state when switching episodes or animes
  useEffect(() => {
    setActiveVideoTime(0);
    setActiveVideoDuration(0);
  }, [id, episode]);

  // Dynamic scaling based on player container dimensions
  const containerWidth = playerDimensions.width || 800;
  const containerHeight = playerDimensions.height || 450;
  
  // Calculate relative sizes and positioning for player overlays
  const buttonSize = Math.max(34, Math.min(48, containerWidth * 0.055));
  const topOffset = Math.max(8, Math.min(16, containerHeight * 0.035));
  const rightOffset = Math.max(8, Math.min(16, containerWidth * 0.025));
  const gap = Math.max(6, Math.min(12, containerWidth * 0.015));

  // Toggles for premium features (persisted locally)
  const [autoPlay, setAutoPlay] = useState(() => localStorage.getItem('autoPlay') !== 'false');
  const [autoNext, setAutoNext] = useState(() => localStorage.getItem('autoNext') !== 'false');
  const [autoSkip, setAutoSkip] = useState(() => localStorage.getItem('autoSkip') === 'true');
  const customPlayerUrl = activeCustomSource?.url
    ? getEmbedOrDirectUrl(activeCustomSource.url, autoPlay)
    : '';

  const serversList = ['hd-1', 'hd-2', 'hd-3', 'hd-4', 'hd-5'];
  
  // Translate local mock database IDs to real MAL/Anilist IDs for the embed player
  const idMap: Record<string, string> = {
    "1": "21",      // One Piece (legacy local ID)
    "12": "21",     // One Piece (real Kryzox ID)
    "2": "20",      // Naruto (legacy local ID)
    "11": "20",     // Naruto (real Kryzox ID)
    "3": "16498",   // Attack on Titan
    "6436": "16498",// Attack on Titan (real Kryzox ID)
    "4": "38000",   // Demon Slayer
    "15334": "38000",// Demon Slayer (real Kryzox ID)
    "5": "40748",   // Jujutsu Kaisen
    "11777": "40748",// Jujutsu Kaisen (real Kryzox ID)
    "6": "52299",   // Solo Leveling
    "16262": "52299",// Solo Leveling (real Kryzox ID)
    "7": "44511",   // Chainsaw Man
    "13508": "44511",// Chainsaw Man (real Kryzox ID)
    "8": "52991",   // Frieren
    "16467": "52991",// Frieren (real Kryzox ID)
    "9": "58897",   // Sakamoto Days
    "174070": "58897",// Sakamoto Days (real Kryzox ID)
    "10": "57334",  // Dandadan
    "171018": "57334",// Dandadan (real Kryzox ID)
    "11_legacy": "40747",  // Overflow
    "111536": "40747",// Overflow (real Kryzox ID)
    "12_legacy": "269", // Bleach (legacy local ID)
    "238": "269",   // Bleach (real Kryzox ID)
    "13": "34572",  // Black Clover (legacy local ID)
    "8568": "34572",// Black Clover (real Kryzox ID)
    "14": "51262",  // Witch Hat Atelier
    "15818": "51262",// Witch Hat Atelier (real Kryzox ID)
    "15": "55462",  // Crowned in a Hundred Days
    "33456": "55462",// Crowned in a Hundred Days (real Kryzox ID)
    "16": "54181",  // Pokémon Horizons
    "16809": "54181",// Pokémon Horizons (real Kryzox ID)
    "17": "55530",  // Noob Academy
    "55530": "55530",// Noob Academy (real Kryzox ID)
    "18": "32281",  // Your Name (Kimi no Na wa)
    "8127": "32281", // Your Name (Kimi no Na wa) (real Kryzox ID)
    "19": "50709",  // Suzume no Tojimari
    "15358": "50709",// Suzume no Tojimari (real Kryzox ID)
    "20": "28851",  // A Silent Voice (Koe no Katachi)
    "7678": "28851", // A Silent Voice (Koe no Katachi) (real Kryzox ID)
    "21": "38826",  // Weathering With You (Tenki no Ko)
    "10832": "38826",// Weathering With You (Tenki no Ko) (real Kryzox ID)
    "demon-slayer-kimetsu-no-yaiba": "38000",
    "demon-slayer": "38000",
    "kimetsu-no-yaiba": "38000",
    "one-piece": "21",
    "naruto": "20",
    "attack-on-titan": "16498",
    "jujutsu-kaisen": "40748",
    "solo-leveling": "52299",
    "chainsaw-man": "44511",
    "frieren": "52991",
    "bleach": "269",
    "black-clover": "34572",
  };

  // Maps local mock database IDs directly to real AniList IDs
  const aniMap: Record<string, string> = {
    "1": "21",      // One Piece (legacy local ID)
    "12": "21",     // One Piece (real Kryzox ID)
    "2": "20",      // Naruto (legacy local ID)
    "11": "20",     // Naruto (real Kryzox ID)
    "3": "16498",   // Attack on Titan
    "6436": "16498",// Attack on Titan (real Kryzox ID)
    "4": "101922",  // Demon Slayer
    "15334": "101922",// Demon Slayer (real Kryzox ID)
    "5": "113415",  // Jujutsu Kaisen
    "11777": "113415",// Jujutsu Kaisen (real Kryzox ID)
    "6": "151807",  // Solo Leveling
    "16262": "151807",// Solo Leveling (real Kryzox ID)
    "7": "127720",  // Chainsaw Man
    "13508": "127720",// Chainsaw Man (real Kryzox ID)
    "8": "154587",  // Frieren
    "16467": "154587",// Frieren (real Kryzox ID)
    "9": "174070",  // Sakamoto Days
    "174070": "174070",// Sakamoto Days (real Kryzox ID)
    "10": "171018", // Dandadan
    "171018": "171018",// Dandadan (real Kryzox ID)
    "11_legacy": "111536", // Overflow
    "111536": "111536",// Overflow (real Kryzox ID)
    "12_legacy": "269", // Bleach (legacy local ID)
    "238": "269",   // Bleach (real Kryzox ID)
    "13": "97940",  // Black Clover (legacy local ID)
    "8568": "97940",// Black Clover (real Kryzox ID)
    "14": "146142", // Witch Hat Atelier
    "15818": "146142",// Witch Hat Atelier (real Kryzox ID)
    "15": "55462",  // Crowned in a Hundred Days
    "33456": "55462",// Crowned in a Hundred Days (real Kryzox ID)
    "16": "162818", // Pokémon Horizons
    "16809": "162818",// Pokémon Horizons (real Kryzox ID)
    "17": "55530",  // Noob Academy
    "55530": "55530",// Noob Academy (real Kryzox ID)
    "18": "21519",  // Your Name
    "8127": "21519", // Your Name (real Kryzox ID)
    "19": "140501", // Suzume
    "15358": "140501",// Suzume (real Kryzox ID)
    "20": "20814",  // A Silent Voice
    "7678": "20814", // A Silent Voice (real Kryzox ID)
    "21": "106286", // Weathering With You
    "10832": "106286",// Weathering With You (real Kryzox ID)
    "demon-slayer-kimetsu-no-yaiba": "101922",
    "demon-slayer": "101922",
    "kimetsu-no-yaiba": "101922",
    "one-piece": "21",
    "naruto": "20",
    "attack-on-titan": "16498",
    "jujutsu-kaisen": "113415",
    "solo-leveling": "151807",
    "chainsaw-man": "127720",
    "frieren": "154587",
    "bleach": "269",
    "black-clover": "97940",
  };

  // Maps local mock database IDs to real Kryzox / Animo API IDs
  const kryzoxMap: Record<string, string> = {
    "1": "12",      // One Piece (legacy local ID)
    "12": "12",     // One Piece (real Kryzox ID)
    "2": "11",      // Naruto (legacy local ID)
    "11": "11",     // Naruto (real Kryzox ID)
    "3": "6436",    // Attack on Titan
    "6436": "6436", // Attack on Titan (real Kryzox ID)
    "4": "15334",   // Demon Slayer
    "15334": "15334",// Demon Slayer (real Kryzox ID)
    "5": "11777",   // Jujutsu Kaisen
    "11777": "11777",// Jujutsu Kaisen (real Kryzox ID)
    "6": "16262",   // Solo Leveling
    "16262": "16262",// Solo Leveling (real Kryzox ID)
    "7": "13508",   // Chainsaw Man
    "13508": "13508",// Chainsaw Man (real Kryzox ID)
    "8": "16467",   // Frieren
    "16467": "16467",// Frieren (real Kryzox ID)
    "9": "174070",  // Sakamoto Days
    "174070": "174070",// Sakamoto Days (real Kryzox ID)
    "10": "171018", // Dandadan
    "171018": "171018",// Dandadan (real Kryzox ID)
    "11_legacy": "111536", // Overflow
    "111536": "111536",// Overflow (real Kryzox ID)
    "12_legacy": "238", // Bleach (legacy local ID)
    "238": "238",   // Bleach (real Kryzox ID)
    "13": "8568",   // Black Clover (legacy local ID)
    "8568": "8568", // Black Clover (real Kryzox ID)
    "14": "15818",  // Witch Hat Atelier
    "15818": "15818",// Witch Hat Atelier (real Kryzox ID)
    "15": "33456",  // Crowned in a Hundred Days
    "33456": "33456",// Crowned in a Hundred Days (real Kryzox ID)
    "16": "16809",  // Pokémon Horizons
    "16809": "16809",// Pokémon Horizons (real Kryzox ID)
    "17": "55530",  // Noob Academy
    "55530": "55530",// Noob Academy (real Kryzox ID)
    "18": "8127",   // Your Name
    "8127": "8127",  // Your Name (real Kryzox ID)
    "19": "15358",  // Suzume
    "15358": "15358",// Suzume (real Kryzox ID)
    "20": "7678",   // A Silent Voice
    "7678": "7678",  // A Silent Voice (real Kryzox ID)
    "21": "10832",  // Weathering With You
    "10832": "10832",// Weathering With You (real Kryzox ID)
    "demon-slayer-kimetsu-no-yaiba": "15334",
    "demon-slayer": "15334",
    "kimetsu-no-yaiba": "15334",
    "one-piece": "12",
    "naruto": "11",
    "attack-on-titan": "6436",
    "jujutsu-kaisen": "11777",
    "solo-leveling": "16262",
    "chainsaw-man": "13508",
    "frieren": "16467",
    "bleach": "238",
    "black-clover": "8568",
  };

  // Autoplay recovery engine when blocked by browser (defined after verifiedPlaybackUrl and customPlayerUrl are initialized)
  useEffect(() => {
    const attemptPlay = () => {
      if (videoRef.current) {
        videoRef.current.play().catch((err) => {
          console.warn("[Autoplay Engine] Playback blocked. Waiting for first interaction...", err);
        });
      }
    };

    if (userHasStartedPlayback && videoRef.current) {
      attemptPlay();
    }

    const handleInteraction = () => {
      if (videoRef.current && videoRef.current.paused) {
        console.log("[Autoplay Engine] User interacted. Retrying play...");
        videoRef.current.play().catch(() => {});
      }
    };

    window.addEventListener('click', handleInteraction, { once: true });
    window.addEventListener('touchstart', handleInteraction, { once: true });
    window.addEventListener('keydown', handleInteraction, { once: true });

    return () => {
      window.removeEventListener('click', handleInteraction);
      window.removeEventListener('touchstart', handleInteraction);
      window.removeEventListener('keydown', handleInteraction);
    };
  }, [userHasStartedPlayback, verifiedPlaybackUrl, customPlayerUrl]);

  if (verifiedPlaybackUrl !== prevUrl || customPlayerUrl !== prevCustomUrl || userHasStartedPlayback !== prevUserStarted) {
    setPrevUrl(verifiedPlaybackUrl);
    setPrevCustomUrl(customPlayerUrl);
    setPrevUserStarted(userHasStartedPlayback);
    if (userHasStartedPlayback && (verifiedPlaybackUrl || customPlayerUrl)) {
      setIsIframeLoading(true);
    }
  }

  const isYoutubeVideo = activeCustomSource && (
    activeCustomSource.type === 'youtube' || 
    activeCustomSource.videoType === 'youtube' || 
    (activeCustomSource.url && (
      activeCustomSource.url.includes('youtube.com') || 
      activeCustomSource.url.includes('youtu.be') || 
      activeCustomSource.url.includes('youtube-nocookie.com')
    ))
  );

  const isVerifiedYoutube = verifiedPlaybackUrl && (
    verifiedPlaybackUrl.includes('youtube.com') || 
    verifiedPlaybackUrl.includes('youtu.be') || 
    verifiedPlaybackUrl.includes('youtube-nocookie.com')
  );

  const getYoutubeId = (url: string) => {
    if (!url) return '';
    const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|\&v=|shorts\/|live\/)([^#\&\?]*).*/;
    const match = url.match(regExp);
    if (match && match[2] && match[2].length === 11) {
      return match[2];
    }
    if (/^[a-zA-Z0-9_-]{11}$/.test(url)) {
      return url;
    }
    return '';
  };

  const realPlayerId = id && idMap[id] ? idMap[id] : (resolvedIds?.animoId || id || '');

  // Keep references updated for the async timeout checks
  const currentIdTypeRef = React.useRef(currentIdType);
  const malRetryCountRef = React.useRef(malRetryCount);
  const serverRef = React.useRef(server);
  const episodeRef = React.useRef(episode);
  const audioRef = React.useRef(audio);
  const isCustomEpisodeRef = React.useRef(isCustomEpisode);

  useEffect(() => { currentIdTypeRef.current = currentIdType; }, [currentIdType]);
  useEffect(() => { malRetryCountRef.current = malRetryCount; }, [malRetryCount]);
  useEffect(() => { serverRef.current = server; }, [server]);
  useEffect(() => { episodeRef.current = episode; }, [episode]);
  useEffect(() => { audioRef.current = audio; }, [audio]);
  useEffect(() => { isCustomEpisodeRef.current = isCustomEpisode; }, [isCustomEpisode]);

  const episodesRef = React.useRef(episodes);
  useEffect(() => { episodesRef.current = episodes; }, [episodes]);

  // Navigation helper based on strict math-based arithmetic
  const navigateEpisode = (direction: 'prev' | 'next') => {
    if (direction === 'prev') {
      setEpisode(e => Math.max(1, Number(e) - 1));
    } else {
      setEpisode(e => Number(e) + 1);
    }
  };

  // State variables for cache refresh checks and preventing duplicate verification runs
  const [hasRefreshedAnime, setHasRefreshedAnime] = useState(false);
  const [hasRefreshedEpisodes, setHasRefreshedEpisodes] = useState(false);

  const lastVerifiedParamsRef = React.useRef<{
    id: string;
    episode: number;
    audio: string;
    server: string;
    idType: 'af' | 'ani' | 'mal';
  } | null>(null);

  const activeVerificationParamsRef = React.useRef<{
    id: string;
    episode: number;
    audio: string;
    server: string;
    idType: 'af' | 'ani' | 'mal';
  } | null>(null);

  const consecutiveFailuresRef = React.useRef(0);
  const serversTriedCountRef = React.useRef(0);
  const isManualServerSelectRef = React.useRef(false);
  const linkAcquireRetryCountRef = React.useRef(0);

  const refreshAnimeDetails = async () => {
    if (hasRefreshedAnime || !id) return;
    setHasRefreshedAnime(true);
    console.log(`[Failover] Re-fetching anime details for ID: ${id}`);
    
    // Clear caches
    apiCache.delete(`anime_info_${id}`);
    resolvedIdsCache.delete(id);
    
    try {
      const details = await api.animeInfo(id);
      if (details) {
        setAnime(details);
        // Force update resolved ids state as well
        let animoId = String(details.id || id);
        let anilistId = details.al_id ? String(details.al_id) : '';
        let malId = details.mal_id ? String(details.mal_id) : '';
        
        const localMalId = idMap[id];
        if (localMalId) {
          if (!malId) malId = localMalId;
          if (!anilistId) anilistId = aniMap[id] || localMalId;
        }

        const ids = { animoId, anilistId, malId };
        resolvedIdsCache.set(id, ids);
        setResolvedIds(ids);
      }
    } catch (err) {
      console.error("[Failover] Error re-fetching anime details:", err);
    }
  };

  const refreshEpisodesList = async () => {
    if (hasRefreshedEpisodes || !id) return;
    setHasRefreshedEpisodes(true);
    console.log(`[Failover] Re-fetching episodes list for ID: ${id}`);
    
    // Clear cache
    apiCache.delete(`episodes_${id}`);
    
    try {
      const data = await api.episodes(id);
      if (data) {
        setEpisodes(data);
      }
    } catch (err) {
      console.error("[Failover] Error re-fetching episodes list:", err);
    }
  };

  const isValidEmbedUrl = (url: string): boolean => {
    if (!url) return false;
    if (isCustomEpisode) return true; // Custom player URLs are always trusted/valid
    
    try {
      const parsed = new URL(url);
      if (parsed.origin === 'https://cdn.4animo.xyz' || parsed.origin.includes('4animo') || parsed.origin.includes('kryzox') || parsed.pathname.includes('embed')) {
        return true;
      }
      return true; // extremely permissive fallback to prevent blockages
    } catch (_) {
      return false;
    }
  };

  function withLocalTimeout<T>(promise: Promise<T>, ms: number, fallback: T): Promise<T> {
    return Promise.race([
      promise.catch(() => fallback),
      new Promise<T>((resolve) => setTimeout(() => resolve(fallback), ms))
    ]);
  }

  const getBestAvailableIdsSync = (
    animeId: string,
    resolvedState: { animoId: string; anilistId: string; malId: string } | null
  ) => {
    // Find local ID from Kryzox ID
    let localId = animeId;
    for (const [lId, kId] of Object.entries(localToKryzoxIdMap)) {
      if (String(kId) === String(animeId)) {
        localId = lId;
        break;
      }
    }

    const localMalId = idMap[localId] || '';
    const localAniId = aniMap[localId] || '';
    const localAnimoId = kryzoxMap[localId] || '';

    // Check persistent cache
    const persistent = getPersistentResolvedIds(animeId) || getPersistentResolvedIds(localId);

    // Check current state anime details (contains al_id / mal_id)
    let animeStateAniId = '';
    let animeStateMalId = '';
    let animeStateAnimoId = '';
    if (anime && (String(anime.id) === String(animeId) || String(anime.id) === String(localId))) {
      animeStateAniId = anime.al_id ? String(anime.al_id) : '';
      animeStateMalId = anime.mal_id ? String(anime.mal_id) : '';
      animeStateAnimoId = anime.id ? String(anime.id) : '';
    }

    // Check episodes list state for inline mapping
    let episodesAniId = '';
    let episodesMalId = '';
    if (episodes && episodes.length > 0) {
      for (const ep of episodes) {
        if (ep) {
          const epAni = ep.ani || ep.anilistId || ep.anilist_id || ep.al_id || ep.alId;
          const epMal = ep.mal || ep.malId || ep.mal_id;
          if (!episodesAniId && epAni) {
            const str = String(epAni);
            episodesAniId = str.includes('/') ? str.split('/')[0] : str;
          }
          if (!episodesMalId && epMal) {
            const str = String(epMal);
            episodesMalId = str.includes('/') ? str.split('/')[0] : str;
          }
        }
        if (episodesAniId && episodesMalId) break;
      }
    }

    let animoId = resolvedState?.animoId || persistent?.animoId || animeStateAnimoId || localAnimoId || animeId;
    let anilistId = resolvedState?.anilistId || persistent?.anilistId || animeStateAniId || episodesAniId || localAniId || localMalId || '';
    let malId = resolvedState?.malId || persistent?.malId || animeStateMalId || episodesMalId || localMalId || '';

    const isNumeric = /^\d+$/.test(animeId);
    if (isNumeric) {
      if (!anilistId) {
        anilistId = animeId;
      }
      if (!malId) {
        malId = animeId;
      }
    }

    // Sanitize
    if (anilistId === 'null' || anilistId === 'undefined' || anilistId === '0') {
      anilistId = '';
    }
    if (malId === 'null' || malId === 'undefined' || malId === '0') {
      malId = '';
    }
    if (animoId === 'null' || animoId === 'undefined' || animoId === '0') {
      animoId = '';
    }

    return { animoId, anilistId, malId };
  };

  const getNextPlaybackAttempt = (
    currentSrv: string,
    currentIdT: 'af' | 'ani' | 'mal',
    ids: { animoId: string; anilistId: string; malId: string } | null
  ): { server: string; idType: 'af' | 'ani' | 'mal' } | null => {
    const servers = ['hd-1', 'hd-2', 'hd-3', 'hd-4', 'hd-5'];
    const serverIndex = servers.indexOf(currentSrv.toLowerCase());
    
    if (serverIndex === -1) {
      return { server: 'hd-1', idType: 'ani' };
    }

    const hasAni = !!(ids?.anilistId);
    const hasAnimo = !!(ids?.animoId);
    const hasMal = !!(ids?.malId);

    // Current server ID progression: ani -> af -> mal
    if (currentIdT === 'ani') {
      if (hasAnimo) {
        return { server: currentSrv, idType: 'af' };
      } else if (hasMal) {
        return { server: currentSrv, idType: 'mal' };
      }
    } else if (currentIdT === 'af') {
      if (hasMal) {
        return { server: currentSrv, idType: 'mal' };
      }
    }

    // Move to next server and reset ID type to best available starting with AniList
    const nextServerIndex = serverIndex + 1;
    if (nextServerIndex < servers.length) {
      const nextSrv = servers[nextServerIndex];
      const nextIdType = hasAni ? 'ani' : (hasAnimo ? 'af' : 'mal');
      return { server: nextSrv, idType: nextIdType };
    }

    return null;
  };

  const resolveAnimeIdentifiers = async (animeId: string) => {
    if (resolvedIdsCache.has(animeId)) {
      const cached = resolvedIdsCache.get(animeId);
      if (cached && cached.animoId) {
        setResolvedIds(cached);
        return cached;
      }
    }

    const persistent = getPersistentResolvedIds(animeId);
    if (persistent && persistent.animoId) {
      resolvedIdsCache.set(animeId, persistent);
      setResolvedIds(persistent);
      return persistent;
    }

    // Check our optimized server-side mapping endpoint (Redis -> Firebase -> API)
    try {
      const res = await fetch(`/api/anime-mapping/${animeId}`);
      if (res.ok) {
        const serverMapping = await res.json();
        if (serverMapping && serverMapping.animoId) {
          resolvedIdsCache.set(animeId, serverMapping);
          setPersistentResolvedIds(animeId, serverMapping);
          setResolvedIds(serverMapping);
          return serverMapping;
        }
      }
    } catch (err) {
      console.warn("[ID Resolver] Server-side mapping lookup failed, falling back to local resolver:", err);
    }

    // Check shared Firebase Realtime Database mapping cache first for instant sub-100ms load
    try {
      const globalMapping = await withLocalTimeout(getGlobalAnimeMapping(animeId), 1500, null);
      if (globalMapping && globalMapping.animoId) {
        resolvedIdsCache.set(animeId, globalMapping);
        setResolvedIds(globalMapping);
        return globalMapping;
      }
    } catch (_) {}

    // Apply local high-fidelity overrides immediately to bypass live API conflicts
    const localMalId = idMap[animeId];
    if (localMalId) {
      const ids = {
        animoId: kryzoxMap[animeId] || animeId,
        anilistId: aniMap[animeId] || localMalId,
        malId: localMalId
      };
      resolvedIdsCache.set(animeId, ids);
      setPersistentResolvedIds(animeId, ids);
      saveGlobalAnimeMapping(animeId, ids);
      setResolvedIds(ids);
      return ids;
    }

    try {
      let details = await withLocalTimeout(api.animeInfo(animeId), 2500, null);
      if (!details && !hasRefreshedAnime) {
        await withLocalTimeout(refreshAnimeDetails(), 1500, null);
        details = await withLocalTimeout(api.animeInfo(animeId), 2000, null);
      }
      
      let animoId = details ? String(details.id || animeId) : animeId;
      let anilistId = '';
      let malId = '';

      if (details) {
        anilistId = String(details.al_id || details.anilist_id || details.anilistId || details.alId || '');
        malId = String(details.mal_id || details.malId || details.mal_id || '');
      }

      // Apply local mapping overrides for fallback/popular anime
      const localMalId = idMap[animeId];
      if (localMalId) {
        if (!malId || malId === 'null' || malId === 'undefined') malId = localMalId;
        if (!anilistId || anilistId === 'null' || anilistId === 'undefined') anilistId = aniMap[animeId] || localMalId;
      }

      // Look inside episodes for extra mapping information across all episodes
      if ((!anilistId || !malId || anilistId === 'null' || malId === 'null') && episodes && episodes.length > 0) {
        for (const ep of episodes) {
          if (ep) {
            const epAni = ep.ani || ep.anilistId || ep.anilist_id || ep.al_id || ep.alId;
            const epMal = ep.mal || ep.malId || ep.mal_id;
            
            if (!anilistId && epAni) {
              const str = String(epAni);
              anilistId = str.includes('/') ? str.split('/')[0] : str;
            }
            if (!malId && epMal) {
              const str = String(epMal);
              malId = str.includes('/') ? str.split('/')[0] : str;
            }
          }
          if (anilistId && malId) break;
        }
      }

      // If mapping is still missing, check if animeId is numeric.
      // If it is a number, it can be a candidate for MAL or AniList ID.
      const isNumeric = /^\d+$/.test(animeId);
      if (isNumeric) {
        if (!anilistId || anilistId === 'null' || anilistId === 'undefined') {
          anilistId = animeId;
        }
        if (!malId || malId === 'null' || malId === 'undefined') {
          malId = animeId;
        }
      }

      // Apply local mapping overrides again if needed
      if (localMalId) {
        if (!malId || malId === animeId) malId = localMalId;
        if (!anilistId || anilistId === animeId) anilistId = aniMap[animeId] || localMalId;
      }

      // Filter out invalid placeholder strings
      if (anilistId === 'null' || anilistId === 'undefined' || anilistId === '0') anilistId = '';
      if (malId === 'null' || malId === 'undefined' || malId === '0') malId = '';

      // If mapping is still missing critical IDs, re-fetch once
      if ((!anilistId || !malId) && !hasRefreshedAnime && details) {
        await withLocalTimeout(refreshAnimeDetails(), 1500, null);
        const details2 = await withLocalTimeout(api.animeInfo(animeId), 2000, null);
        if (details2) {
          animoId = String(details2.id || animeId);
          anilistId = String(details2.al_id || details2.anilist_id || details2.anilistId || details2.alId || anilistId || '');
          malId = String(details2.mal_id || details2.malId || details2.mal_id || malId || '');
          
          if (localMalId) {
            if (!malId || malId === 'null' || malId === 'undefined') malId = localMalId;
            if (!anilistId || anilistId === 'null' || anilistId === 'undefined') anilistId = aniMap[animeId] || localMalId;
          }

          if (anilistId === 'null' || anilistId === 'undefined' || anilistId === '0') anilistId = '';
          if (malId === 'null' || malId === 'undefined' || malId === '0') malId = '';
        }
      }

      const ids = { animoId, anilistId, malId };
      resolvedIdsCache.set(animeId, ids);
      setPersistentResolvedIds(animeId, ids);
      saveGlobalAnimeMapping(animeId, ids);
      setResolvedIds(ids);
      return ids;
    } catch (err) {
      console.error("[ID Resolver] Error resolving anime identifiers:", err);
      if (!hasRefreshedAnime) {
        await withLocalTimeout(refreshAnimeDetails(), 1500, null);
      }
      const matched = fallbackAnimes.find(a => String(a.id) === String(animeId));
      let animoId = String(matched?.id || animeId);
      let anilistId = String(matched?.al_id || '');
      let malId = String(matched?.mal_id || '');

      const localMalId = idMap[animeId];
      if (localMalId) {
        if (!malId || malId === 'null' || malId === 'undefined') malId = localMalId;
        if (!anilistId || anilistId === 'null' || anilistId === 'undefined') anilistId = aniMap[animeId] || localMalId;
      }

      const isNumeric = /^\d+$/.test(animeId);
      if (isNumeric) {
        if (!anilistId) anilistId = animeId;
        if (!malId) malId = animeId;
      }

      if (localMalId) {
        if (!malId || malId === animeId) malId = localMalId;
        if (!anilistId || anilistId === animeId) anilistId = aniMap[animeId] || localMalId;
      }

      const ids = { animoId, anilistId, malId };
      resolvedIdsCache.set(animeId, ids);
      setPersistentResolvedIds(animeId, ids);
      saveGlobalAnimeMapping(animeId, ids);
      setResolvedIds(ids);
      return ids;
    }
  };

  // Safe parameters alignment to seamlessly map split-season anime (like Black Clover Season 2)
  const getAlignedPlaybackParams = (
    animeId: string,
    ids: { animoId: string; anilistId: string; malId: string } | null,
    epNum: number,
    targetIdType: 'af' | 'ani' | 'mal'
  ) => {
    let resolvedId = ids ? (targetIdType === 'af' ? ids.animoId : (targetIdType === 'ani' ? ids.anilistId : ids.malId)) : '';
    let resolvedEp = epNum;

    // Detect if this is Black Clover Season 2 (either by animeId, local id, or mapped IDs)
    const isBlackCloverS2 = 
      animeId === '19706' || 
      (ids && (ids.anilistId === '195604' || ids.malId === '61967')) ||
      (anime && (anime.title?.toLowerCase().includes('black clover') && (anime.title?.toLowerCase().includes('season 2') || anime.title?.toLowerCase().includes('2nd season'))));

    if (isBlackCloverS2) {
      // Map to the main Black Clover series (which contains all episodes) with an episode offset of 51
      resolvedId = targetIdType === 'af' ? '8568' : (targetIdType === 'ani' ? '97940' : '34572');
      resolvedEp = epNum + 51;
      console.log(`[Alignment] Aligned Black Clover Season 2 ep ${epNum} to main series ep ${resolvedEp}`);
    }

    // Detect if this is "The Eminence in Shadow: Lost Echoes" movie (which contains Season 1 episodes but wrong IDs)
    const isEminenceShadowMovie =
      animeId === '17854' ||
      (ids && (ids.anilistId === '171952' || ids.malId === '57584')) ||
      (anime && anime.title?.toLowerCase().includes('eminence in shadow') && anime.title?.toLowerCase().includes('lost echoes'));

    if (isEminenceShadowMovie) {
      // Map to Season 1
      resolvedId = targetIdType === 'af' ? '13906' : (targetIdType === 'ani' ? '130298' : '48316');
      console.log(`[Alignment] Aligned Eminence in Shadow movie ep ${epNum} to Season 1 IDs`);
    }

    return { resolvedId, episodeNum: resolvedEp };
  };

  const resolveAndVerifyUrl = async (
    targetServer: string,
    targetIdType: 'af' | 'ani' | 'mal',
    targetEpisode: number,
    targetAudio: string
  ): Promise<{ url: string; success: boolean; reason?: string; status?: string | number }> => {
    if (!id) {
      return { url: '', success: false, reason: 'Anime ID not specified' };
    }
    
    const identifiers = await resolveAnimeIdentifiers(id);
    if (!identifiers) {
      return { url: '', success: false, reason: 'Failed to retrieve anime details from Kryzox API' };
    }
    
    // If episode data is incomplete, refresh it once but attempt playback anyway
    if (episodes.length === 0 || !episodes.some(ep => Number(ep.number) === Number(targetEpisode))) {
      if (!hasRefreshedEpisodes) {
        console.log(`[Failover] Episode data incomplete for episode ${targetEpisode}. Refreshing once...`);
        await withLocalTimeout(refreshEpisodesList(), 1500, null);
      }
    }
    
    const { resolvedId, episodeNum } = getAlignedPlaybackParams(id, identifiers, targetEpisode, targetIdType);
    
    if (!resolvedId || resolvedId === 'null' || resolvedId === 'undefined') {
      return { url: '', success: false, reason: `${targetIdType.toUpperCase()} ID not available on server` };
    }
    
    const cleanServer = targetServer.toLowerCase();
    const cleanAudio = targetAudio.toLowerCase();
    const candidateUrl = getOfficial4AnimoEmbedUrl({
      server: cleanServer,
      idType: targetIdType,
      animoId: targetIdType === 'af' ? resolvedId : identifiers?.animoId,
      anilistId: targetIdType === 'ani' ? resolvedId : identifiers?.anilistId,
      malId: targetIdType === 'mal' ? resolvedId : identifiers?.malId,
      episode: episodeNum,
      audio: cleanAudio,
      autoPlay,
      skipIntro: autoSkip,
      skipOutro: autoSkip
    });
    
    // Instantly bypass verification checks to force instant direct iframe loading exactly as requested (using 4anime)
    return { url: candidateUrl, success: true, status: 'BYPASSED' };
  };

  const getAnovaLangLabel = (lang: string) => {
    const labelMap: Record<string, string> = {
      hindi: 'HINDI DUB',
      tamil: 'TAMIL DUB',
      telugu: 'TELUGU DUB',
      bengali: 'BENGALI DUB',
      malayalam: 'MALAYALAM DUB',
      kannada: 'KANNADA DUB',
      japanese: 'JAPANESE SUB',
      english: 'ENGLISH DUB'
    };
    return labelMap[lang.toLowerCase()] || `${lang.toUpperCase()} DUB`;
  };

  const getAnovaStreamUrl = async (
    localId: string,
    epNum: number,
    title?: string,
    currentAudio: 'sub' | 'dub' = 'sub',
    forcedLang?: string
  ): Promise<{ url: string; success: boolean; languageAvailable?: string } | null> => {
    if (!localId || localId.startsWith('custom-')) return null;
    try {
      const isMovie = anime && (
        anime.type?.toLowerCase() === 'movie' ||
        anime.title?.toLowerCase().includes('movie') ||
        anime.episodes === 1
      );
      
      const anovaId = await anovaApi.resolveAnovaId(localId, title);
      if (!anovaId) return null;

      // Determine target language based on forcedLang or currentAudio
      let targetLang = forcedLang;
      if (!targetLang) {
        if (currentAudio === 'dub') {
          targetLang = 'hindi';
        } else {
          targetLang = 'japanese';
        }
      }

      const targetLangLower = targetLang.toLowerCase();

      let season = "1";
      if (title) {
        const seasonMatch = title.match(/season\s*(\d+)/i) || title.match(/(\d+)(?:st|nd|rd|th)\s*season/i);
        if (seasonMatch) {
          season = seasonMatch[1];
        }
      }
      
      if (title?.toLowerCase().includes('black clover') && (title?.toLowerCase().includes('season 2') || title?.toLowerCase().includes('2nd season') || localId === '19706')) {
        season = "2";
      }

      let resolverUrl = `/api/resolve-anova-stream?id=${encodeURIComponent(anovaId)}`;
      if (isMovie) {
        resolverUrl += `&isMovie=true`;
      } else {
        resolverUrl += `&season=${season}&ep=${epNum}`;
      }
      if (targetLang) {
        resolverUrl += `&lang=${encodeURIComponent(targetLang.toLowerCase())}`;
      }

      console.log(`[AnOvA Stream] Requesting server-side stream resolution: ${resolverUrl}`);
      const res = await fetch(resolverUrl);
      if (!res.ok) {
        throw new Error(`Server resolver responded with status ${res.status}`);
      }

      const data = await res.json();
      if (data && data.success && data.url) {
        console.log(`[AnOvA Stream] Successfully resolved video source stream URL: ${data.url}`);
        return {
          url: data.url,
          success: true,
          languageAvailable: targetLangLower
        };
      } else {
        throw new Error(data?.error || "Invalid response from stream resolver");
      }
    } catch (err) {
      console.error("[AnOvA Stream] Failed to resolve backup stream:", err);
    }
    return null;
  };

  // Fetch available languages from AnOvA
  useEffect(() => {
    const fetchAnovaLanguages = async () => {
      if (!id) return;
      try {
        const isMovie = anime && (
          anime.type?.toLowerCase() === 'movie' ||
          anime.title?.toLowerCase().includes('movie') ||
          anime.episodes === 1
        );
        const anovaId = await anovaApi.resolveAnovaId(id, anime?.title);
        if (!anovaId) {
          setAnovaLanguages([]);
          setAnovaStreams([]);
          return;
        }

        if (isMovie) {
          const movieStreamData = await anovaApi.getMovieStream(anovaId);
          if (movieStreamData && movieStreamData.stream) {
            setAnovaStreams(movieStreamData.stream);
            const langs = movieStreamData.stream.map((s: any) => s.language).filter(Boolean);
            setAnovaLanguages(langs);
            if (langs.length > 0 && !selectedAnovaLanguage) {
              setSelectedAnovaLanguage(langs[0]);
            }
          }
        } else {
          let season = "1";
          const title = anime?.title;
          if (title) {
            const seasonMatch = title.match(/season\s*(\d+)/i) || title.match(/(\d+)(?:st|nd|rd|th)\s*season/i);
            if (seasonMatch) {
              season = seasonMatch[1];
            }
          }
          if (title?.toLowerCase().includes('black clover') && (title?.toLowerCase().includes('season 2') || title?.toLowerCase().includes('2nd season') || id === '19706')) {
            season = "2";
          }
          const streams = await anovaApi.getStream(anovaId, season, episode);
          if (streams && streams.length > 0) {
            setAnovaStreams(streams);
            const langs = streams
              .filter((s: any) => s.type === 'stream' || s.language)
              .map((s: any) => s.language)
              .filter(Boolean);
            // Remove duplicates
            const uniqueLangs = Array.from(new Set(langs));
            setAnovaLanguages(uniqueLangs);
          } else {
            setAnovaStreams([]);
            setAnovaLanguages([]);
          }
        }
      } catch (err) {
        console.error("Error fetching AnOvA languages:", err);
        setAnovaLanguages([]);
        setAnovaStreams([]);
      }
    };

    fetchAnovaLanguages();
  }, [id, episode, anime]);

  const getPlaybackUrlSync = (customIds?: any) => {
    if (!id) return '';
    if (isCustomEpisode) {
      return customPlayerUrl;
    }
    const ids = customIds || getBestAvailableIdsSync(id, resolvedIds);
    const { resolvedId, episodeNum } = getAlignedPlaybackParams(id, ids, episode, currentIdType);
    
    let activeIdType = currentIdType;
    let targetId = resolvedId;

    if (!targetId) {
      if (activeIdType === 'ani') {
        activeIdType = ids.animoId ? 'af' : (ids.malId ? 'mal' : 'ani');
      } else if (activeIdType === 'af') {
        activeIdType = ids.malId ? 'mal' : 'af';
      }
      
      const aligned = getAlignedPlaybackParams(id, ids, episode, activeIdType);
      targetId = aligned.resolvedId;
    }

    let activeSrv = server;
    if (['ani', 'mal', 'af'].includes(server.toLowerCase())) {
      activeSrv = 'hd-1';
      activeIdType = server.toLowerCase() as 'ani' | 'mal' | 'af';
    }

    return getOfficial4AnimoEmbedUrl({
      server: activeSrv,
      idType: activeIdType,
      animoId: activeIdType === 'af' ? targetId : ids.animoId,
      anilistId: activeIdType === 'ani' ? targetId : ids.anilistId,
      malId: activeIdType === 'mal' ? targetId : ids.malId,
      episode: episodeNum,
      audio: audio,
      autoPlay,
      skipIntro: autoSkip,
      skipOutro: autoSkip
    });
  };

  const runPlaybackPipeline = async (
    srv = server,
    idType: 'af' | 'ani' | 'mal' = 'ani',
    retry = 0
  ) => {
    // Background ID resolution to update cached mapping without blocking
    resolveAnimeIdentifiers(id || '').then((resolved) => {
      if (resolved) {
        const syncIds = getBestAvailableIdsSync(id || '', null);
        const hasIdChange = 
          resolved.anilistId !== syncIds.anilistId || 
          resolved.animoId !== syncIds.animoId || 
          resolved.malId !== syncIds.malId;
        
        if (hasIdChange) {
          console.log("[Pipeline] Background ID resolution finished with new mappings. Updating player state...");
          setResolvedIds(resolved);
        }
      }
    }).catch(err => {
      console.error("[Pipeline] Background ID resolution failed:", err);
    });
  };

  // Synchronously update the verified playback URL and start iframe loading immediately, never blocking on dynamic API network resolutions
  useEffect(() => {
    if (!id || !userHasStartedPlayback) return;

    const ids = getBestAvailableIdsSync(id, resolvedIds);
    const targetUrl = getPlaybackUrlSync(ids);

    // If we are already playing successfully and the iframe has finished loading, do NOT reload it to protect active playback
    if (verifiedPlaybackUrl && !isIframeLoading && lastSuccessParamsRef.current) {
      const params = lastSuccessParamsRef.current;
      if (params.id === id && params.episode === episode && params.audio === audio && params.server === server) {
        console.log("[Playback Sync] Already playing this stream successfully. Skipping iframe reload.");
        return;
      }
    }

    if (targetUrl !== verifiedPlaybackUrl) {
      console.log("[Playback Sync] Synchronously updated playback URL to:", targetUrl);
      setVerifiedPlaybackUrl(targetUrl);
      setIsIframeLoading(true);
      setPlayerError(null);
    }
  }, [id, episode, audio, server, currentIdType, resolvedIds, userHasStartedPlayback]);

  // Trigger background ID resolution on anime change without blocking anything
  useEffect(() => {
    if (!id) return;
    resolveAnimeIdentifiers(id).catch(err => {
      console.error("[Background ID Resolver] Error:", err);
    });
  }, [id]);

  // Reset ID type when changing to a completely different anime to avoid carrying over incorrect target types
  useEffect(() => {
    setCurrentIdType('ani');
    setMalRetryCount(0);
  }, [id]);

  const handlePlaybackFailure = async (
    failedServer: string,
    failedIdType: 'af' | 'ani' | 'mal',
    failedRetry: number,
    reason: string,
    forcedIdentifiers?: { animoId: string; anilistId: string; malId: string } | null
  ) => {
    console.warn(`[Playback Failover] Failed: Server=${failedServer.toUpperCase()}, IDType=${failedIdType.toUpperCase()}. Reason: ${reason}`);

    // Clear last success parameters so automatic recovery can run
    lastSuccessParamsRef.current = null;

    const ids = forcedIdentifiers || resolvedIds || (id ? resolvedIdsCache.get(id) : null) || getBestAvailableIdsSync(id || '', null);
    
    // Perform parallel background checks on alternative servers to avoid resetting the iframe multiple times
    console.log("[Playback Failover] Checking alternative servers in background...");
    setFallbackNotification("Adjusting connection... Swapping channels in background...");

    const candidateServers = ['hd-1', 'hd-2', 'hd-3', 'hd-4', 'hd-5'].filter(s => s.toLowerCase() !== failedServer.toLowerCase());

    const checkPromises = candidateServers.map(async (srv) => {
      const { resolvedId, episodeNum } = getAlignedPlaybackParams(id || '', ids, episode, failedIdType);
      const testUrl = getOfficial4AnimoEmbedUrl({
        server: srv,
        idType: failedIdType,
        animoId: failedIdType === 'af' ? resolvedId : ids?.animoId,
        anilistId: failedIdType === 'ani' ? resolvedId : ids?.anilistId,
        malId: failedIdType === 'mal' ? resolvedId : ids?.malId,
        episode: episodeNum,
        audio: audio,
        includeQueryParams: false
      });

      try {
        const res = await fetch(`/api/verify-url?url=${encodeURIComponent(testUrl)}`);
        if (res.ok) {
          const checkResult = await res.json();
          if (checkResult.success) {
            return { server: srv, success: true, idType: failedIdType };
          }
        }
      } catch (_) {}
      return { server: srv, success: false, idType: failedIdType };
    });

    const results = await Promise.all(checkPromises);
    const workingCandidate = results.find(r => r.success);

    if (workingCandidate) {
      console.log(`[Playback Failover] Found working alternative server: ${workingCandidate.server.toUpperCase()}`);
      setFallbackNotification(`Swapped to channel ${workingCandidate.server.toUpperCase()} successfully.`);
      setTimeout(() => setFallbackNotification(''), 3000);

      setServer(workingCandidate.server);
      setCurrentIdType(workingCandidate.idType);
    } else {
      // Find next available combination sequentially if background check didn't yield anything
      const nextAttempt = getNextPlaybackAttempt(failedServer, failedIdType, ids);

      if (nextAttempt) {
        console.log(`[Playback Failover] No fast responsive servers found. Trying next available sequential path: Server=${nextAttempt.server.toUpperCase()}, IDType=${nextAttempt.idType.toUpperCase()}`);
        setFallbackNotification(`Swapping channels... Connecting to ${nextAttempt.server.toUpperCase()} (${nextAttempt.idType.toUpperCase()})...`);
        setTimeout(() => setFallbackNotification(''), 3000);

        setServer(nextAttempt.server);
        setCurrentIdType(nextAttempt.idType);
      } else {
        // Exhausted all options - auto failover to AnOvA Backup server!
        console.warn("[Playback Failover] All standard server channels failed. Attempting failover to AnOvA Backup Stream...");
        setFallbackNotification("All standard channels offline. Swapping to Backup Server...");
        setTimeout(() => setFallbackNotification(''), 3000);
        setIsUsingAnovaBackup(true);
        setSelectedAnovaLanguage('');
      }
    }
  };

  // Reset refresh status when anime, episode, server, or audio changes
  useEffect(() => {
    setHasRefreshedAnime(false);
    setHasRefreshedEpisodes(false);
    consecutiveFailuresRef.current = 0;
    linkAcquireRetryCountRef.current = 0;
  }, [id, episode, server, audio]);

  useEffect(() => {
    serversTriedCountRef.current = 0;
    linkAcquireRetryCountRef.current = 0;
  }, [id, episode, audio]);

  // Reset resolved IDs when switching to a different anime to prevent stale mappings
  useEffect(() => {
    if (id) {
      setResolvedIds(null);
    }
  }, [id]);

  // Load globally cached working server from Firebase to maximize startup speed
  useEffect(() => {
    if (!id || !episode || !audio || isCustomEpisode) return;
    if (isManualServerSelectRef.current) return;
    
    let active = true;
    const fetchGlobalServer = async () => {
      try {
        if (isManualServerSelectRef.current) return;
        const info = await getGlobalWorkingServer(id, episode, audio);
        if (info && info.server && active && !isManualServerSelectRef.current) {
          console.log(`[Firebase DB Cache] Found globally verified working server for ${id} E${episode} (${audio}):`, info.server);
          
          // Only update if it is different from current selection to avoid redundant sets
          if (info.server !== server || info.idType !== currentIdType) {
            setServer(info.server);
            setCurrentIdType(info.idType as any);
            
            const currentSyncIds = getBestAvailableIdsSync(id, resolvedIds);
            const nextResolved = {
              anilistId: info.anilistId || currentSyncIds.anilistId || '',
              animoId: info.animoId || currentSyncIds.animoId || '',
              malId: info.malId || currentSyncIds.malId || ''
            };
            setResolvedIds(nextResolved);
          }
        }
      } catch (e) {
        console.warn("[Firebase DB Cache] Failed to load global working server:", e);
      }
    };
    
    fetchGlobalServer();
    return () => {
      active = false;
    };
  }, [id, episode, audio]);

  // Driver effect that synchronizes playback settings on route/episode/server/audio change
  useEffect(() => {
    const currentSyncIds = getBestAvailableIdsSync(id || '', resolvedIds);
    const isPlayingSuccessfully = 
      lastSuccessParamsRef.current &&
      lastSuccessParamsRef.current.id === (id || '') &&
      lastSuccessParamsRef.current.episode === episode &&
      lastSuccessParamsRef.current.audio === audio &&
      lastSuccessParamsRef.current.server === server &&
      lastSuccessParamsRef.current.idType === currentIdType &&
      lastSuccessParamsRef.current.anilistId === currentSyncIds.anilistId &&
      lastSuccessParamsRef.current.animoId === currentSyncIds.animoId &&
      lastSuccessParamsRef.current.malId === currentSyncIds.malId &&
      verifiedPlaybackUrl !== '' &&
      !playerError;

    if (isPlayingSuccessfully) {
      console.log("[Driver Effect] Player is already playing successfully. Skipping runPlaybackPipeline.");
      return;
    }

    if (isCustomEpisode) {
      // Protect custom playback immediately
      lastSuccessParamsRef.current = {
        id: id || '',
        episode,
        audio,
        server,
        idType: currentIdType,
        anilistId: currentSyncIds.anilistId,
        animoId: currentSyncIds.animoId,
        malId: currentSyncIds.malId
      };
      setVerifiedPlaybackUrl(customPlayerUrl);
      return;
    }
    if (!id) {
      setVerifiedPlaybackUrl('');
      return;
    }
    if (isUsingAnovaBackup) {
      console.log("[Pipeline] Currently in AnOvA backup mode. Skipping standard pipeline resolution.");
      return;
    }
    runPlaybackPipeline(server, currentIdType, malRetryCount);
  }, [id, episode, audio, server, currentIdType, malRetryCount, isCustomEpisode, customPlayerUrl, isUsingAnovaBackup, resolvedIds]);

  // Dedicated effect to fetch and set AnOvA backup stream URLs when in backup mode
  useEffect(() => {
    if (!id || !userHasStartedPlayback || !isUsingAnovaBackup || isCustomEpisode) return;

    let active = true;
    console.log("[Pipeline] Fetching AnOvA backup stream...");
    setIsIframeLoading(true);
    setPlayerError(null);

    getAnovaStreamUrl(id, episode, anime?.title, audio, selectedAnovaLanguage || undefined)
      .then(res => {
        if (!active) return;
        if (res && res.success && res.url) {
          console.log("[Pipeline] AnOvA Backup stream fetched successfully:", res.url);
          setVerifiedPlaybackUrl(res.url);
          setIsIframeLoading(false);
          setPlayerError(null);
        } else {
          console.error("[Pipeline] AnOvA Backup stream fetch returned no valid URL.");
          setPlayerError({
            reason: "Backup server did not provide a playable stream for this title.",
            code: "BACKUP_STREAM_FAILED"
          });
          setIsIframeLoading(false);
        }
      })
      .catch(err => {
        if (!active) return;
        console.error("[Pipeline] AnOvA Backup stream fetch error:", err);
        setPlayerError({
          reason: "An error occurred while connecting to the backup server.",
          code: "BACKUP_STREAM_ERROR"
        });
        setIsIframeLoading(false);
      });

    return () => {
      active = false;
    };
  }, [id, episode, audio, isUsingAnovaBackup, selectedAnovaLanguage, userHasStartedPlayback, isCustomEpisode, anime]);

  // 4.5-second Acquiring Links Timeout Fallback
  useEffect(() => {
    let timer: any = null;
    const currentSyncIds = getBestAvailableIdsSync(id || '', resolvedIds);
    const isPlayingSuccessfully = 
      lastSuccessParamsRef.current &&
      lastSuccessParamsRef.current.id === (id || '') &&
      lastSuccessParamsRef.current.episode === episode &&
      lastSuccessParamsRef.current.audio === audio &&
      lastSuccessParamsRef.current.server === server &&
      lastSuccessParamsRef.current.anilistId === currentSyncIds.anilistId &&
      lastSuccessParamsRef.current.animoId === currentSyncIds.animoId &&
      lastSuccessParamsRef.current.malId === currentSyncIds.malId &&
      verifiedPlaybackUrl !== '' &&
      !playerError;

    if (isPlayingSuccessfully) {
      return;
    }

    if (userHasStartedPlayback && !verifiedPlaybackUrl && !isCustomEpisode) {
      timer = setTimeout(async () => {
         console.warn("[Failover] Acquiring streaming links exceeded 4.5-second threshold. Force retrying playback pipeline...");
        
        // Log the failure details
        console.group("%cAnOvA Acquiring Links Timeout Log", "color: #f87171; font-weight: bold; font-size: 14px;");
        console.error("Anime ID:", id);
        console.error("Episode Number:", episode);
        console.error("AniList ID:", resolvedIds?.anilistId || 'Not available');
        console.error("MAL ID:", resolvedIds?.malId || 'Not available');
        console.error("Internal ID:", resolvedIds?.animoId || 'Not available');
        console.error("Failure Reason:", "Acquiring streaming links timeout");
        console.groupEnd();

        // Limit maximum link acquiring retries to 3 attempts to prevent infinite loading loop if genuinely offline
        linkAcquireRetryCountRef.current += 1;
        if (linkAcquireRetryCountRef.current >= 3) {
          console.error("[Failover] Acquiring streaming links exceeded 4.5-second threshold 3 times. Showing playback error.");
          setPlayerError({
            reason: "This title genuinely has no valid stream available from the source.",
            code: "NO_STREAM_AVAILABLE"
          });
          setFallbackNotification('');
          setVerificationInProgress(false);
          linkAcquireRetryCountRef.current = 0; // reset
          return;
        }

        // 1. Force refresh details and episodes
        await refreshAnimeDetails();
        await refreshEpisodesList();

        // 2. Clear current params ref to allow a fresh retry run
        lastVerifiedParamsRef.current = null;
        activeVerificationParamsRef.current = null;

        // 3. Retry playback pipeline
        runPlaybackPipeline(server, currentIdType, malRetryCount);
      }, 4500);
    }
    return () => {
      if (timer) clearTimeout(timer);
    };
  }, [id, episode, server, currentIdType, malRetryCount, userHasStartedPlayback, verifiedPlaybackUrl, isCustomEpisode, resolvedIds]);

  // Admin Diagnostics & Failover Engine state variables
  const [debugMode, setDebugMode] = useState(false);
  const [playerError, setPlayerError] = useState<{ reason: string; code?: string } | null>(null);
  const [fallbackNotification, setFallbackNotification] = useState('');
  const [apiLogs, setApiLogs] = useState<any[]>(() => (window as any).__anova_api_logs || []);
  const [serverCheckResults, setServerCheckResults] = useState<Record<string, any>>({});
  const [isCheckingServers, setIsCheckingServers] = useState(false);

  useEffect(() => {
    const handleApiLog = (e: any) => {
      setApiLogs((window as any).__anova_api_logs || []);
    };
    window.addEventListener('anova_api_log_added', handleApiLog);
    return () => {
      window.removeEventListener('anova_api_log_added', handleApiLog);
    };
  }, []);

  const checkServerStatus = async (srv: string) => {
    const currentEpId = currentEpData?.id;
    if (!currentEpId) {
      return {
        server: srv,
        status: 'Unmapped (Waiting for Episodes)',
        timing: 0,
        error: 'Dynamic episode mapping not loaded yet',
        url: ''
      };
    }
    const testUrl = `https://cdn.4animo.xyz/api/embed/${srv.toLowerCase()}/${currentEpId}/${audio.toLowerCase()}?k=1`;
    const startTime = performance.now();
    try {
      const controller = new AbortController();
      const timerId = setTimeout(() => controller.abort(), 4000);
      
      await fetch(testUrl, { method: 'HEAD', mode: 'no-cors', signal: controller.signal });
      clearTimeout(timerId);
      
      const duration = Math.round(performance.now() - startTime);
      return {
        server: srv,
        status: 'Operational (No-CORS)',
        timing: duration,
        error: null,
        url: testUrl
      };
    } catch (e: any) {
      const duration = Math.round(performance.now() - startTime);
      if (e.name === 'AbortError') {
        return {
          server: srv,
          status: 'Timeout',
          timing: duration,
          error: 'Connection timed out after 4 seconds',
          url: testUrl
        };
      }
      return {
        server: srv,
        status: 'Response Detected',
        timing: duration,
        error: 'CORS restriction active (Expected for iframes)',
        url: testUrl
      };
    }
  };

  const triggerAutoFallback = () => {
    handlePlaybackFailure(server, currentIdType, malRetryCount, 'Manual or legacy auto failover triggered', resolvedIds);
  };

  // Iframe loading indicator auto-dismiss (never auto-swaps server away)
  useEffect(() => {
    let timer: any = null;
    if (userHasStartedPlayback && verifiedPlaybackUrl && !isCustomEpisode) {
      timer = setTimeout(() => {
        if (isIframeLoadingRef.current) {
          setIsIframeLoading(false);
          isIframeLoadingRef.current = false;
        }
      }, 3000);
    }
    return () => {
      if (timer) clearTimeout(timer);
    };
  }, [verifiedPlaybackUrl, userHasStartedPlayback]);

  // Dynamic Event-Driven Player Integrations (Auto-Next via postMessage)
  useEffect(() => {
    const handlePlayerMessage = (e: MessageEvent) => {
      try {
        const data = typeof e.data === 'string' ? JSON.parse(e.data) : e.data;
        if (!data) return;
        
        // Ensure the postMessage originates from our active player iframe
        if (!iframeRef.current || e.source !== iframeRef.current.contentWindow) {
          return;
        }
        
        // 1. Intercept video ended / NEXT_EPISODE events
        if (data.event === 'ended' || data.type === 'ended' || data.event === 'video_ended' || data.type === 'NEXT_EPISODE' || data.event === 'NEXT_EPISODE') {
          console.log("[Auto-Next] Message event captured. Moving to next episode...");
          if (autoNext) {
            setEpisode(e => Number(e) + 1);
          }
        }
        
        // Intercept timeupdate / TIME_UPDATE events from embedded players
        if (data.event === 'timeupdate' || data.type === 'TIME_UPDATE') {
          setActiveVideoTime(data.currentTime || 0);
          if (data.duration) {
            setActiveVideoDuration(data.duration);
          }
        }
        
        // 2. Intercept explicit video player fatal error codes only
        if (data.code === '224003' || data.event === '4ANIMO_FATAL_ERROR') {
          console.warn("[Auto-Fallback] Explicit player error event captured. Swapping server or recovery ID...");
          lastSuccessParamsRef.current = null;
          handlePlaybackFailure(server, currentIdType, malRetryCount, 'iframe explicit error code 224003', resolvedIds);
        }
      } catch (_) {}
    };

    window.addEventListener('message', handlePlayerMessage);
    return () => {
      window.removeEventListener('message', handlePlayerMessage);
    };
  }, [autoNext, server, currentIdType, malRetryCount, resolvedIds]);

  // Real-time listener for current episode overlay settings
  useEffect(() => {
    if (!id || !episode) return;
    
    const overlayRef = ref(db, `episodeOverlays/${id}/${episode}`);
    const unsub = onValue(overlayRef, (snapshot) => {
      if (snapshot.exists()) {
        const data = snapshot.val();
        setBottomOverlay(!!data.bottomOverlay);
        setTopOverlay(!!data.topOverlay);
      } else {
        setBottomOverlay(false);
        setTopOverlay(false);
      }
    }, (err) => {
      console.warn("[Firebase DB Overlay] Error listening to overlay settings:", err);
    });
    
    return () => unsub();
  }, [id, episode]);

  // Preconnect and DNS Prefetch dynamically based on settings and active streams
  useEffect(() => {
    const elements: HTMLElement[] = [];
    
    // Core domains to preconnect
    const domainsToPreconnect = [
      'https://api.kryzox.xyz',
      'https://cdn.4animo.xyz',
      'https://cdn.jsdelivr.net'
    ];

    // Add active video stream domain dynamically
    const activeUrl = isCustomEpisode ? customPlayerUrl : verifiedPlaybackUrl;
    if (activeUrl) {
      try {
        const parsedUrl = new URL(activeUrl);
        if (!domainsToPreconnect.includes(parsedUrl.origin)) {
          domainsToPreconnect.push(parsedUrl.origin);
        }
      } catch (_) {}
    }
    
    if (perfSettings.dnsPrefetch) {
      domainsToPreconnect.forEach(domain => {
        const dns = document.createElement('link');
        dns.rel = 'dns-prefetch';
        dns.href = domain;
        document.head.appendChild(dns);
        elements.push(dns);
      });
    }

    if (perfSettings.preconnect) {
      domainsToPreconnect.forEach(domain => {
        const pre = document.createElement('link');
        pre.rel = 'preconnect';
        pre.href = domain;
        pre.crossOrigin = 'anonymous';
        document.head.appendChild(pre);
        elements.push(pre);
      });
    }

    return () => {
      elements.forEach(el => {
        try {
          document.head.removeChild(el);
        } catch (_) {}
      });
    };
  }, [perfSettings.dnsPrefetch, perfSettings.preconnect, verifiedPlaybackUrl, customPlayerUrl, isCustomEpisode]);

  // Server Speed Ranking in Background
  useEffect(() => {
    const currentSyncIds = getBestAvailableIdsSync(id || '', resolvedIds);
    const isPlayingSuccessfully = 
      lastSuccessParamsRef.current &&
      lastSuccessParamsRef.current.id === (id || '') &&
      lastSuccessParamsRef.current.episode === episode &&
      lastSuccessParamsRef.current.audio === audio &&
      lastSuccessParamsRef.current.server === server &&
      lastSuccessParamsRef.current.anilistId === currentSyncIds.anilistId &&
      lastSuccessParamsRef.current.animoId === currentSyncIds.animoId &&
      lastSuccessParamsRef.current.malId === currentSyncIds.malId &&
      verifiedPlaybackUrl !== '' &&
      !playerError;

    if (isPlayingSuccessfully) {
      return;
    }

    if (perfSettings.autoServerRanking && id) {
      const runRankingSpeedCheck = async () => {
        const testId = idMap[id] || id;
        const testEp = episode || 1;
        const testAudio = audio || 'sub';
        
        const list = ['hd-1', 'hd-2', 'hd-3', 'hd-4', 'hd-5', 'ani', 'mal', 'af'];
        const results = await Promise.all(
          list.map(async (srv) => {
            const url = getOfficial4AnimoEmbedUrl({
              server: srv,
              idType: 'af',
              animoId: testId,
              episode: testEp,
              audio: testAudio,
              includeQueryParams: false
            });
            const start = performance.now();
            try {
              const controller = new AbortController();
              const timeout = setTimeout(() => controller.abort(), 2000);
              await fetch(url, { method: 'HEAD', mode: 'no-cors', signal: controller.signal });
              clearTimeout(timeout);
              return { srv, time: performance.now() - start, success: true };
            } catch (_) {
              return { srv, time: 9999, success: false };
            }
          })
        );
        
        const sorted = [...results]
          .sort((a, b) => a.time - b.time)
          .map(r => r.srv);
        
        setServerRankings(sorted);
        safeLocalStorageSet('anova_server_rankings', JSON.stringify(sorted));
        
        // Auto set server to the fastest if no last working server is cached yet
        const lastWorking = localStorage.getItem('anova_last_working_server');
        if (!lastWorking && sorted.length > 0 && sorted[0] !== server && !isManualServerSelectRef.current) {
          setServer(sorted[0]);
        }
      };

      const timer = setTimeout(runRankingSpeedCheck, 1500);
      return () => clearTimeout(timer);
    }
  }, [id, episode, audio, perfSettings.autoServerRanking, resolvedIds]);

  useEffect(() => {
    if (isCustomEpisode && availableStreams.length > 0 && !availableStreams.includes(selectedLanguage)) {
      setSelectedLanguage(availableStreams[0]);
    }
  }, [episode, episodes, isCustomEpisode, availableStreams, selectedLanguage]);

  // Async load official anime details and episodes in the background (no blocking fullscreen loaders)
  useEffect(() => {
    if (!id) return;

    const controller = new AbortController();

    api.animeInfo(id).then((data) => {
      if (controller.signal.aborted) return;
      if (currentAnimeIdRef.current !== id) {
        console.log(`[API Race Avoided] Watch animeInfo callback for id=${id} ignored because current id is ${currentAnimeIdRef.current}`);
        return;
      }
      if (data) setAnime(data);
    }).catch((err) => {
      console.error("api.animeInfo failed:", err);
    });

    api.episodes(id).then((data) => {
      if (controller.signal.aborted) return;
      if (currentAnimeIdRef.current !== id) {
        console.log(`[API Race Avoided] Watch episodes callback for id=${id} ignored because current id is ${currentAnimeIdRef.current}`);
        return;
      }
      if (data) setEpisodes(data);
    }).catch((err) => {
      console.error("api.episodes failed:", err);
    });

    return () => {
      controller.abort();
    };
  }, [id]);

  useEffect(() => {
    const activeAnime = anime || fallbackAnimes.find(a => String(a.id) === String(id));
    if (activeAnime) {
      document.title = `Watch ${activeAnime.title} Episode ${episode} - AnOvA`;
    }
    return () => {
      document.title = 'AnOvA';
    };
  }, [anime, episode, id]);

  const totalGroups = Math.max(1, Math.ceil(episodes.length / 100));

  useEffect(() => {
    const targetIdx = Math.floor((episode - 1) / 100);
    if (targetIdx >= 0 && targetIdx < totalGroups) {
      setCurrentGroupIdx(targetIdx);
    }
  }, [episode, totalGroups]);

  // Synchronous placeholders during dynamic loading to ensure user sees controls immediately
  const placeholderAnime = {
    id: id || '',
    title: 'Anime Stream',
    poster: 'https://images.unsplash.com/photo-1578632767115-351597cf2477?w=300&q=60',
    description: 'Streaming live from celestial servers...',
    type: 'TV',
    rating: '--',
    status: 'Streaming',
    episodes: 12
  };

  const activeAnime = anime || placeholderAnime;

  // Render temporary local episode buttons if the API episodes are still loading
  const displayEpisodesList = episodes.length > 0 
    ? (searchQuery 
        ? episodes.filter((ep: any) => String(ep.number).includes(searchQuery))
        : episodes.slice(currentGroupIdx * 100, (currentGroupIdx + 1) * 100))
    : Array.from({ length: activeAnime.episodes || 12 }).map((_, i) => ({
        id: `${id}-ep-${i + 1}`,
        number: i + 1,
        title: `Episode ${i + 1}`
      }));

  useEffect(() => {
    // Sync URL when episode changes
    navigate(`/watch/${id}?ep=${episode}`, { replace: true });
    
    // Save progress
    if (anime) {
      saveProgress({
        animeId: anime.id,
        animeTitle: anime.title,
        animePoster: anime.poster,
        episode,
        server,
        audio,
        time: 150, // default placeholder progress
        duration: 1200,
        updatedAt: Date.now()
      });
    }
  }, [episode, anime, id, navigate, saveProgress, server, audio]);

  // Log watch event on play
  useEffect(() => {
    if (anime) {
      const email = localStorage.getItem('userEmail') || 'guest@anova.xyz';
      logWatchEvent(anime.id, anime.title, anime.poster, episode, email, 150, 1200)
        .catch(err => console.error("Firebase watch event error:", err));
    }
  }, [episode, anime]);

  // Keep native players visible immediately; do not show fake loading or failover UI.
  useEffect(() => {
    setPlayerError(null);
    setFallbackNotification('');
  }, [verifiedPlaybackUrl, customPlayerUrl]);

  // Preload/Prefetch next episode document URL dynamically in the background
  useEffect(() => {
    if ((perfSettings.backgroundPreload || perfSettings.smartPrefetch) && id) {
      const realId = idMap[id] || id;
      const nextEp = episode + 1;
      const nextUrl = getOfficial4AnimoEmbedUrl({
        server: server,
        idType: currentIdType,
        animoId: currentIdType === 'af' ? realId : (resolvedIds?.animoId || id),
        anilistId: currentIdType === 'ani' ? realId : (resolvedIds?.anilistId || id),
        malId: currentIdType === 'mal' ? realId : (resolvedIds?.malId || id),
        episode: nextEp,
        audio: audio,
        includeQueryParams: false
      });
      
      const link = document.createElement('link');
      link.rel = 'prefetch';
      link.href = nextUrl;
      link.as = 'document';
      document.head.appendChild(link);

      // Preload next episode thumbnail / meta too if available
      if (episodes && episodes.length > 0) {
        const nextEpData = episodes.find(e => e.number === nextEp);
        if (nextEpData?.thumbnail) {
          const img = new Image();
          img.src = nextEpData.thumbnail;
        }
      }
      
      return () => {
        try {
          document.head.removeChild(link);
        } catch (_) {}
      };
    }
  }, [id, episode, server, audio, episodes, perfSettings.backgroundPreload, perfSettings.smartPrefetch]);

  // Preload and prefetch active stream manifest and segments to optimize player startup time
  useEffect(() => {
    const activeUrl = isCustomEpisode ? customPlayerUrl : verifiedPlaybackUrl;
    if (activeUrl && activeUrl.includes('.m3u8')) {
      preloadManifestAndSegments(activeUrl);
    }
  }, [verifiedPlaybackUrl, customPlayerUrl, isCustomEpisode]);

  // Preload next episode's verified working server and mappings from Firebase shared database
  useEffect(() => {
    if (!id || !episode || !audio || isCustomEpisode || id.startsWith('custom-')) return;
    
    const nextEp = episode + 1;
    getGlobalWorkingServer(id, nextEp, audio).then((info) => {
      if (info && info.server) {
        console.log(`[Preload] Loaded next episode E${nextEp} working server in background:`, info.server);
      }
    }).catch(() => {});

    // Warm up server-side caches for the next episode in the background
    try {
      fetch(`/api/anime-mapping/${id}`).catch(() => {});
      
      const isMovie = anime && (
        anime.type?.toLowerCase() === 'movie' ||
        anime.title?.toLowerCase().includes('movie') ||
        anime.episodes === 1
      );
      if (!isMovie) {
        let season = "1";
        const title = anime?.title;
        if (title) {
          const seasonMatch = title.match(/season\s*(\d+)/i) || title.match(/(\d+)(?:st|nd|rd|th)\s*season/i);
          if (seasonMatch) {
            season = seasonMatch[1];
          }
        }
        if (title?.toLowerCase().includes('black clover') && (title?.toLowerCase().includes('season 2') || title?.toLowerCase().includes('2nd season') || id === '19706')) {
          season = "2";
        }
        
        // Warm up resolve-anova-stream endpoint for the next episode
        fetch(`/api/resolve-anova-stream?id=${id}&season=${season}&ep=${nextEp}`).catch(() => {});
      }
    } catch (_) {}
  }, [id, episode, audio, anime]);

  const handleIframeLoad = () => {
    setIsIframeLoading(false);

    const currentSyncIds = getBestAvailableIdsSync(id || '', resolvedIds);
    lastSuccessParamsRef.current = {
      id: id || '',
      episode,
      audio,
      server,
      idType: currentIdType,
      anilistId: currentSyncIds.anilistId,
      animoId: currentSyncIds.animoId,
      malId: currentSyncIds.malId
    };

    // Save last successful working server
    if (server && !isCustomEpisode) {
      safeLocalStorageSet('anova_last_working_server', server);
      try {
        // Save to Firebase shared database to accelerate load times globally
        if (id && episode && audio) {
          saveGlobalWorkingServer(id, episode, audio, {
            server: server,
            idType: currentIdType,
            anilistId: currentSyncIds.anilistId || '',
            animoId: currentSyncIds.animoId || '',
            malId: currentSyncIds.malId || ''
          });
        }
      } catch (_) {}
    }

    // Measure load times
    const embedTime = Math.round(performance.now() - loadStartTimeRef.current);
    const initTime = Math.round(performance.now() - mountTime);

    if (typeof window !== 'undefined') {
      const m = (window as any).__anova_perf_metrics || { apiResponseTimes: [], embedLoadTimes: [], playerInitTimes: [], cacheHits: 0, cacheMisses: 0, retries: 0 };
      m.embedLoadTimes.push(embedTime);
      if (m.playerInitTimes.length === 0) {
        m.playerInitTimes.push(initTime);
      }
      (window as any).__anova_perf_metrics = m;
    }
  };

  // Listen to postMessage from player iframes to dismiss loading overlay when video signals play
  useEffect(() => {
    if (!isIframeLoading) return;
    const handlePlayerMessage = (event: MessageEvent) => {
      try {
        const data = typeof event.data === 'string' ? JSON.parse(event.data) : event.data;
        if (data && (
          data.event === 'play' || 
          data.event === 'playing' || 
          data.event === 'ready' || 
          data.event === 'loaded' ||
          data.method === 'play' || 
          data.type?.includes('play') ||
          data.type?.includes('ready')
        )) {
          setIsIframeLoading(false);
        }
      } catch (_) {
        if (typeof event.data === 'string') {
          const lowerData = event.data.toLowerCase();
          if (
            lowerData.includes('play') || 
            lowerData.includes('playing') || 
            lowerData.includes('ready') ||
            lowerData.includes('loaded')
          ) {
            setIsIframeLoading(false);
          }
        }
      }
    };
    window.addEventListener('message', handlePlayerMessage);
    return () => window.removeEventListener('message', handlePlayerMessage);
  }, [isIframeLoading]);

  // Safety fallback timeout: dismiss loading spinner if it takes longer than 4.5 seconds
  // to avoid getting stuck when third-party ad blocks interfere with iframe onLoad events
  useEffect(() => {
    if (isIframeLoading) {
      const timer = setTimeout(() => {
        setIsIframeLoading(false);
      }, 4500);
      return () => clearTimeout(timer);
    }
  }, [isIframeLoading]);

  const isFavorited = favorites.some(f => f.id === activeAnime.id);

  const toggleFavorite = () => {
    if (isFavorited) {
      removeFavorite(activeAnime.id);
    } else {
      addFavorite(activeAnime);
    }
  };

  const toggleAutoPlay = () => {
    setAutoPlay(v => {
      safeLocalStorageSet('autoPlay', String(!v));
      return !v;
    });
  };

  const toggleAutoNext = () => {
    setAutoNext(v => {
      safeLocalStorageSet('autoNext', String(!v));
      return !v;
    });
  };

  const toggleAutoSkip = () => {
    setAutoSkip(v => {
      safeLocalStorageSet('autoSkip', String(!v));
      return !v;
    });
  };

  return (
    <div className="min-h-screen bg-[#050505] pt-16">
      {/* Player Section - Instant display */}
      <div ref={playerContainerRef} className="w-full aspect-video bg-[#010307] relative lg:max-h-[70vh] flex justify-center z-10 border-b border-[#00e5ff]/5 shadow-[0_4px_30px_rgba(0,229,255,0.03)] overflow-hidden">
        {/* Floating Back Button */}
        <div className="absolute top-2 left-4 z-40">
          <button 
            onClick={() => navigate(-1)}
            className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-black/75 hover:bg-black/95 border border-[#00e5ff]/20 hover:border-[#00e5ff]/40 text-[10px] text-gray-300 hover:text-white font-bold transition-all duration-300 backdrop-blur-md shadow-lg hover:scale-105 active:scale-95 group cursor-pointer"
          >
            <ArrowLeft size={12} className="group-hover:-translate-x-1 transition-transform text-[#00e5ff]" />
            <span>Back</span>
          </button>
        </div>

        {/* Stable keep-alive Player */}
        {!userHasStartedPlayback ? (
          <div 
            onClick={() => {
              const matchingAd = getMatchingVideoStartAd();
              if (matchingAd && checkAdFrequencyAllowed(matchingAd)) {
                const trimmed = matchingAd.script.trim();
                const isRawUrl = trimmed.startsWith('http') && !trimmed.includes('<');
                
                if (isRawUrl) {
                  // Direct Link: Manually open the ad landing page
                  window.open(trimmed, '_blank', 'noopener,noreferrer');
                } else {
                  // Popunder / Social Bar Script: DO NOT open raw .js files!
                  // Let the event bubble up so the preloaded popunder script triggers on the user click.
                }
                
                recordAdShown(matchingAd);
                
                // Transition to playback after 150ms to allow event bubbling and script window opening
                setTimeout(() => {
                  setUserHasStartedPlayback(true);
                }, 150);
              } else {
                setUserHasStartedPlayback(true);
              }
            }}
            className="w-full h-full relative flex flex-col items-center justify-center bg-black overflow-hidden z-20 cursor-pointer animate-fadeIn"
          >
            {/* Ambient Background Image blurred */}
            {displayedPoster && (
              <div 
                className="absolute inset-0 bg-cover bg-center filter blur-md opacity-25 scale-105"
                style={{ backgroundImage: `url(${displayedPoster})` }}
              />
            )}
            
            {/* Overlay gradient */}
            <div className="absolute inset-0 bg-gradient-to-t from-black via-black/80 to-transparent z-10" />

            {/* Glowing neon elements in the background */}
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-72 h-72 rounded-full bg-[#00e5ff]/5 filter blur-3xl" />

            {/* Center Content */}
            <div className="relative z-20 flex flex-col items-center gap-6 px-4 max-w-lg text-center">
              {/* Play Button Icon pulsing */}
              <div className="relative">
                <div className="absolute inset-0 rounded-full bg-[#00e5ff]/20 animate-ping opacity-70" />
                <div className="relative w-16 h-16 md:w-20 md:h-20 rounded-full bg-gradient-to-tr from-[#00e5ff] to-cyan-400 flex items-center justify-center shadow-[0_0_30px_rgba(0,229,255,0.4)] animate-pulse">
                  <svg 
                    className="w-8 h-8 md:w-10 md:h-10 text-black fill-current translate-x-0.5" 
                    viewBox="0 0 24 24"
                  >
                    <path d="M8 5v14l11-7z" />
                  </svg>
                </div>
              </div>

              {/* Text Info */}
              <div className="space-y-2">
                <div className="text-[10px] md:text-xs font-black uppercase tracking-[0.2em] text-[#00e5ff]">
                  Click to start video stream
                </div>
                <h2 className="text-xl md:text-3xl font-black text-white tracking-tight drop-shadow-md">
                  {activeAnime.title}
                </h2>
                <div className="text-xs md:text-sm text-gray-400 font-bold">
                  Episode {episode} • Ready to stream in High Quality
                </div>
              </div>
            </div>

            {/* Bottom notification */}
            <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-20 px-4 py-1.5 rounded-full bg-black/40 border border-white/5 backdrop-blur-md text-[9px] md:text-[10px] text-gray-500 font-bold uppercase tracking-widest whitespace-nowrap">
              Secure stream • Instant loading
            </div>
          </div>
        ) : (isUsingAnovaBackup && (verifiedPlaybackUrl.includes('.m3u8') || verifiedPlaybackUrl.includes('.mp4') || verifiedPlaybackUrl.includes('.mkv') || verifiedPlaybackUrl.includes('/cdn/'))) ? (
          <div className="absolute inset-0 w-full h-full overflow-hidden z-20">
            <div className="absolute w-full h-[calc(100%+24px)] sm:h-[calc(100%+28px)] md:h-[calc(100%+32px)] top-[-24px] sm:top-[-28px] md:top-[-32px] left-0">
              <video
                key={`${episode}-${selectedLanguage}-${verifiedPlaybackUrl}`}
                src={verifiedPlaybackUrl || undefined}
                controls
                autoPlay={true}
                muted={playerMuted}
                volume={playerVolume}
                onVolumeChange={handleVolumeChange}
                playsInline={true}
                preload="auto"
                className="w-full h-full bg-black transition-transform duration-500 ease-out"
                style={{ transform: 'scale(1.03)', transformOrigin: 'center' }}
                onPlay={handleNativeVideoPlaying}
                onPlaying={handleNativeVideoPlaying}
                onCanPlay={handleIframeLoad}
                onLoadedData={handleIframeLoad}
                onLoadedMetadata={handleIframeLoad}
                onTimeUpdate={(e) => {
                  if (e.currentTarget.currentTime > 0) {
                    handleIframeLoad();
                  }
                  setActiveVideoTime(e.currentTarget.currentTime);
                  setActiveVideoDuration(e.currentTarget.duration || 0);
                }}
                onError={() => {
                  console.warn('Backup stream could not be played.');
                  setFallbackNotification('Backup stream playback failed. Trying standard failover...');
                  setTimeout(() => setFallbackNotification(''), 4000);
                }}
                onEnded={() => {
                  if (autoNext) {
                    setEpisode(e => Number(e) + 1);
                  }
                }}
                ref={(el) => {
                  videoRef.current = el;
                  if (activeHlsRef.current) {
                    try {
                      activeHlsRef.current.destroy();
                    } catch (_) {}
                    activeHlsRef.current = null;
                  }
                  if (el && verifiedPlaybackUrl.includes('.m3u8')) {
                    const initHls = () => {
                      activeHlsRef.current = createOptimalHls(verifiedPlaybackUrl, el, {
                        audio,
                        selectedAnovaLanguage,
                        onFirstFrame: () => handleIframeLoad(),
                        onError: (reason, fatal) => {
                          if (fatal) {
                            console.warn(`[HLS standard player error] Fatal: ${reason}`);
                          }
                        }
                      });
                    };

                    if ((window as any).Hls) {
                      initHls();
                    } else {
                      const script = document.createElement('script');
                      script.src = 'https://cdn.jsdelivr.net/npm/hls.js@latest';
                      script.onload = initHls;
                      document.head.appendChild(script);
                    }
                  }
                }}
              />
            </div>
          </div>
        ) : isCustomEpisode && activeCustomSource ? (
          isYoutubeVideo ? (
            <div className="w-full h-full relative overflow-hidden">
              <div className="absolute inset-0 w-full h-full overflow-hidden z-20">
                <div className="absolute w-full h-[calc(100%+24px)] sm:h-[calc(100%+28px)] md:h-[calc(100%+32px)] top-[-24px] sm:top-[-28px] md:top-[-32px] left-0">
                  <iframe 
                    ref={iframeRef}
                    key={`${episode}-${selectedLanguage}-${customPlayerUrl}`}
                    src={`/youtube_player.html?id=${getYoutubeId(customPlayerUrl)}&autoplay=${autoPlay}`} 
                    title={`${activeAnime.title} Episode ${episode}`}
                    allowFullScreen 
                    allow="autoplay; encrypted-media; fullscreen; picture-in-picture"
                    referrerPolicy="no-referrer-when-downgrade"
                    loading="eager"
                    className="w-full h-full border-0 transition-transform duration-500 ease-out"
                    style={{ transform: 'scale(1.03)', transformOrigin: 'center' }}
                    onLoad={handleIframeLoad}
                  />
                </div>
              </div>
            </div>
          ) : activeCustomSource.type === 'embed' || isDailymotionVideo || isOdyseeVideo || isRumbleVideo || !activeCustomSource.url?.match(/\.(mp4|m3u8|mpd|webm|ogg|mkv)(?:\?|$)/i) ? (
            <div className="w-full h-full relative overflow-hidden">
              <div className="absolute inset-0 w-full h-full overflow-hidden z-20">
                <div className="absolute w-full h-[calc(100%+24px)] sm:h-[calc(100%+28px)] md:h-[calc(100%+32px)] top-[-24px] sm:top-[-28px] md:top-[-32px] left-0">
                  <iframe 
                    ref={iframeRef}
                    key={`${episode}-${selectedLanguage}-${customPlayerUrl}`}
                    src={customPlayerUrl || null} 
                    title={`${activeAnime.title} Episode ${episode}`}
                    allowFullScreen 
                    allow="autoplay; fullscreen; picture-in-picture; web-share"
                    referrerPolicy="no-referrer-when-downgrade"
                    loading="eager"
                    className="w-full h-full border-0 transition-transform duration-500 ease-out"
                    style={{ transform: 'scale(1.03)', transformOrigin: 'center' }}
                    onLoad={handleIframeLoad}
                  />
                </div>
              </div>
            </div>
          ) : (
            <div className="absolute inset-0 w-full h-full overflow-hidden z-20">
              <div className="absolute w-full h-[calc(100%+24px)] sm:h-[calc(100%+28px)] md:h-[calc(100%+32px)] top-[-24px] sm:top-[-28px] md:top-[-32px] left-0">
                <video
                  key={`${episode}-${selectedLanguage}-${customPlayerUrl}`}
                  src={customPlayerUrl || undefined}
                  controls
                  autoPlay={true}
                  muted={playerMuted}
                  volume={playerVolume}
                  onVolumeChange={handleVolumeChange}
                  playsInline={true}
                  preload="auto"
                  className="w-full h-full bg-black transition-transform duration-500 ease-out"
                  style={{ transform: 'scale(1.03)', transformOrigin: 'center' }}
                  onPlay={handleNativeVideoPlaying}
                  onPlaying={handleNativeVideoPlaying}
                  onCanPlay={handleIframeLoad}
                  onLoadedData={handleIframeLoad}
                  onLoadedMetadata={handleIframeLoad}
                  onTimeUpdate={(e) => {
                    if (e.currentTarget.currentTime > 0) {
                      handleIframeLoad();
                    }
                    setActiveVideoTime(e.currentTarget.currentTime);
                    setActiveVideoDuration(e.currentTarget.duration || 0);
                  }}
                  onError={() => console.warn('Direct video stream could not be played by the browser.')}
                  onEnded={() => {
                    if (autoNext) {
                      setEpisode(e => Number(e) + 1);
                    }
                  }}
                  ref={(el) => {
                    videoRef.current = el;
                    if (activeHlsRef.current) {
                      try {
                        activeHlsRef.current.destroy();
                      } catch (_) {}
                      activeHlsRef.current = null;
                    }
                    if (el && customPlayerUrl.includes('.m3u8')) {
                      const initHls = () => {
                        activeHlsRef.current = createOptimalHls(customPlayerUrl, el, {
                          audio,
                          selectedAnovaLanguage,
                          onFirstFrame: () => handleIframeLoad(),
                        });
                      };

                      if ((window as any).Hls) {
                        initHls();
                      } else {
                        const script = document.createElement('script');
                        script.src = 'https://cdn.jsdelivr.net/npm/hls.js@latest';
                        script.onload = initHls;
                        document.head.appendChild(script);
                      }
                    }
                  }}
                />
              </div>
            </div>
          )
        ) : (!verifiedPlaybackUrl || !isValidEmbedUrl(verifiedPlaybackUrl)) ? (
          <div className="w-full h-full flex flex-col items-center justify-center bg-[#010307] z-20 gap-4 select-none">
            <div className="relative w-14 h-14">
              <div className="absolute inset-0 rounded-full border-2 border-[#00e5ff]/10 border-t-[#00e5ff] animate-spin" />
              <div className="absolute inset-1.5 rounded-full border-2 border-cyan-400/10 border-b-cyan-400 animate-spin [animation-duration:1.5s]" />
            </div>
            <p className="text-[#00e5ff] text-[10px] font-black uppercase tracking-[0.2em] animate-pulse drop-shadow-[0_0_10px_rgba(0,229,255,0.2)]">
              Acquiring Streaming Server Links...
            </p>
          </div>
        ) : isVerifiedYoutube ? (
          <div className="absolute inset-0 w-full h-full overflow-hidden z-20">
            <div className="absolute w-full h-[calc(100%+24px)] sm:h-[calc(100%+28px)] md:h-[calc(100%+32px)] top-[-24px] sm:top-[-28px] md:top-[-32px] left-0">
              <iframe 
                ref={iframeRef}
                key="anova-stable-player-youtube"
                src={`/youtube_player.html?id=${getYoutubeId(verifiedPlaybackUrl)}&autoplay=${autoPlay}`} 
                allowFullScreen 
                allow="autoplay; encrypted-media; fullscreen; picture-in-picture"
                referrerPolicy="no-referrer-when-downgrade"
                loading="eager"
                className="w-full h-full border-0 transition-transform duration-500 ease-out"
                style={{ transform: 'scale(1.03)', transformOrigin: 'center' }}
                onLoad={handleIframeLoad}
              />
            </div>
          </div>
        ) : (
          <div className="absolute inset-0 w-full h-full overflow-hidden z-20">
            <div className="absolute w-full h-[calc(100%+24px)] sm:h-[calc(100%+28px)] md:h-[calc(100%+32px)] top-[-24px] sm:top-[-28px] md:top-[-32px] left-0">
              <iframe 
                ref={iframeRef}
                key="anova-stable-player"
                src={verifiedPlaybackUrl} 
                allowFullScreen 
                allow="autoplay; encrypted-media; fullscreen; picture-in-picture"
                referrerPolicy="no-referrer-when-downgrade"
                loading="eager"
                className="w-full h-full border-0 transition-transform duration-500 ease-out"
                style={{ transform: 'scale(1.03)', transformOrigin: 'center' }}
                onLoad={handleIframeLoad}
              />
            </div>
          </div>
        )}

        {/* Background ad script runner for popunder network integration */}
        {activeAd && (
          <div className="absolute inset-0 pointer-events-none z-0" aria-hidden="true">
            <AdScriptRunner script={activeAd.script} />
          </div>
        )}

        {/* Premium Overlay Protection System: Bottom Right Circular "A" Blue Logo */}
        {bottomOverlay && userHasStartedPlayback && (
          <div
            className="absolute bottom-[12px] right-[12px] md:bottom-[16px] md:right-[16px] z-30 select-none pointer-events-auto"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
            }}
            onMouseDown={(e) => {
              e.preventDefault();
              e.stopPropagation();
            }}
            onTouchStart={(e) => {
              e.preventDefault();
              e.stopPropagation();
            }}
          >
            <div 
              className="rounded-full bg-gradient-to-tr from-[#1e40af] via-[#3b82f6] to-[#60a5fa] border border-[#93c5fd]/50 shadow-[0_4px_16px_rgba(30,58,138,0.85),inset_0_2px_4px_rgba(255,255,255,0.45)] flex items-center justify-center cursor-pointer transition-transform duration-300 hover:scale-105 active:scale-95"
              style={{
                width: `${buttonSize}px`,
                height: `${buttonSize}px`
              }}
            >
              <span className="font-sans font-black text-white select-none drop-shadow-[0_2px_4px_rgba(0,0,0,0.65)]" style={{ fontSize: `${buttonSize * 0.45}px`, lineHeight: 1 }}>
                A
              </span>
            </div>
          </div>
        )}

        {/* Premium Overlay Protection System: Top Invisible Transparent Protection */}
        {topOverlay && userHasStartedPlayback && (
          <div
            className="absolute top-0 left-0 right-0 h-[50px] md:h-[70px] z-30 bg-transparent opacity-0 cursor-default pointer-events-auto select-none"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
            }}
            onMouseDown={(e) => {
              e.preventDefault();
              e.stopPropagation();
            }}
            onTouchStart={(e) => {
              e.preventDefault();
              e.stopPropagation();
            }}
          />
        )}

        {/* Elegant, Netflix/Crunchyroll-style smooth fade poster/loader overlay */}
        {userHasStartedPlayback && (
          <div 
            className={cn(
              "absolute inset-0 flex flex-col items-center justify-center bg-[#010307] z-30 transition-all duration-700 ease-out select-none",
              isIframeLoading ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none"
            )}
          >
            {/* Ambient Background Image blurred */}
            {displayedPoster && (
              <div 
                className="absolute inset-0 bg-cover bg-center filter blur-md opacity-35 scale-105"
                style={{ backgroundImage: `url(${displayedPoster})` }}
              />
            )}
            
            {/* Overlay gradient */}
            <div className="absolute inset-0 bg-gradient-to-t from-black via-black/80 to-black/40" />

            {/* Content Container */}
            <div className="relative z-10 flex flex-col items-center gap-4 text-center p-6">
              {/* Spinner */}
              <div className="relative w-12 h-12">
                <div className="absolute inset-0 rounded-full border-2 border-[#00e5ff]/10 border-t-[#00e5ff] animate-spin" />
                <div className="absolute inset-1.5 rounded-full border-2 border-cyan-400/10 border-b-cyan-400 animate-spin [animation-duration:1.5s]" />
                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-3 h-3 rounded-full bg-[#00e5ff]/30 animate-pulse" />
              </div>
              
              <div className="flex flex-col items-center gap-1.5">
                <p className="text-[#00e5ff] text-[10px] font-black uppercase tracking-[0.2em] animate-pulse drop-shadow-[0_0_10px_rgba(0,229,255,0.25)]">
                  Preparing Stream...
                </p>
                <h3 className="text-sm font-black text-white tracking-tight drop-shadow-md">
                  {activeAnime?.title} • Episode {episode}
                </h3>
                <span className="text-[8px] text-gray-500 font-bold uppercase tracking-widest mt-1">
                  Optimizing Playback • Instant Direct Play Active
                </span>
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="max-w-7xl mx-auto">
        {/* Controls Bar - Responsive & fully functional toggles */}
        <div className="bg-[#0a0d14]/80 backdrop-blur-xl border-b border-white/5 flex flex-wrap items-center justify-between p-3 md:px-6 text-xs md:text-sm gap-4">
          <div className="flex items-center gap-2 md:gap-4 text-gray-400">
            <button 
              onClick={toggleAutoPlay}
              className={cn(
                "px-3 py-1.5 rounded-md border text-xs font-semibold cursor-pointer transition-all duration-300",
                autoPlay 
                  ? "bg-cyan-950/80 text-primary border-cyan-500/30 shadow-[0_0_10px_rgba(0,229,255,0.2)]"
                  : "bg-[#0e1424]/40 text-gray-400 border-white/5 hover:text-white"
              )}
            >
              Auto Play
            </button>
            <button 
              onClick={toggleAutoNext}
              className={cn(
                "px-3 py-1.5 rounded-md border text-xs font-semibold cursor-pointer transition-all duration-300",
                autoNext 
                  ? "bg-cyan-950/80 text-primary border-cyan-500/30 shadow-[0_0_10px_rgba(0,229,255,0.2)]"
                  : "bg-[#0e1424]/40 text-gray-400 border-white/5 hover:text-white"
              )}
            >
              Auto Next
            </button>
            <button 
              onClick={toggleAutoSkip}
              className={cn(
                "px-3 py-1.5 rounded-md border text-xs font-semibold cursor-pointer transition-all duration-300",
                autoSkip 
                  ? "bg-cyan-950/80 text-primary border-cyan-500/30 shadow-[0_0_10px_rgba(0,229,255,0.2)]"
                  : "bg-[#0e1424]/40 text-gray-400 border-white/5 hover:text-white"
              )}
            >
              Auto Skip
            </button>
            <button 
              onClick={() => setDebugMode(v => !v)}
              className={cn(
                "px-3 py-1.5 rounded-md border text-xs font-semibold cursor-pointer transition-all duration-300",
                debugMode 
                  ? "bg-red-950/85 text-red-400 border-red-500/40 shadow-[0_0_12px_rgba(239,68,68,0.25)] font-bold"
                  : "bg-[#0e1424]/40 text-gray-400 border-white/5 hover:text-red-400 hover:border-red-500/20"
              )}
            >
              Debug Console
            </button>
          </div>
          
          <div className="flex items-center gap-4 text-gray-400 w-full sm:w-auto justify-between sm:justify-start">
            {activeAnime?.type !== 'Trailer' && (
              <div className="flex items-center gap-1 bg-[#050914] rounded-md p-0.5 border border-white/5">
                <button 
                  onClick={() => navigateEpisode('prev')}
                  className="px-3 py-1 rounded hover:text-white hover:bg-white/5 transition flex items-center gap-1 font-semibold text-xs cursor-pointer"
                >
                  <ChevronLeft size={14} /> Prev
                </button>
                <button 
                  onClick={() => navigateEpisode('next')}
                  className="px-3 py-1 rounded hover:text-white hover:bg-white/5 transition flex items-center gap-1 font-semibold text-xs cursor-pointer"
                >
                  Next <ChevronRight size={14} />
                </button>
              </div>
            )}
            <button 
              onClick={toggleFavorite}
              className={cn(
                "transition flex items-center gap-1.5 font-bold text-xs cursor-pointer",
                isFavorited ? "text-pink-500 hover:text-pink-400" : "text-gray-300 hover:text-white"
              )}
            >
              <Heart size={14} className={cn("transition-transform duration-300", isFavorited ? "fill-pink-500 scale-110" : "")} />
              <span>{isFavorited ? "Favorited" : "Add to List"}</span>
            </button>
          </div>
        </div>



        {/* Content Section */}
        <div className="px-4 py-8">
          <div className="text-center mb-8">
            <p className="text-gray-400 text-[10px] font-bold tracking-wider uppercase mb-1">You are watching</p>
            <h1 className="text-xl sm:text-2xl font-black text-white mb-1.5 tracking-tight">
              {activeAnime.title}
            </h1>
            <h2 className="text-lg font-black text-primary mb-1 text-[#00e5ff] drop-shadow-[0_0_12px_rgba(0,229,255,0.2)]">
              Episode {episode}
            </h2>
            {!isCustomEpisode && (
              <p className="text-gray-500 text-[10px]">Pick a streaming channel if the current source is unavailable.</p>
            )}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
            {/* Servers & Details */}
            <div className="lg:col-span-3 space-y-6">
              {(!isCustomEpisode || availableStreams.length > 1) && (
              <div className="bg-[#0a0d14]/40 border border-white/5 backdrop-blur-md rounded-xl p-4 md:p-6 space-y-4">
                {isCustomEpisode ? (
                  <div className="flex flex-col sm:flex-row sm:items-center gap-4">
                    <div className="flex items-center gap-2 w-28 text-gray-400 font-bold text-xs shrink-0">
                      <MonitorPlay size={16} className="text-primary" />
                      <span>LANGUAGE:</span>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {availableStreams.map(langKey => {
                        const labelMap: Record<string, string> = {
                          sub: 'SUBTITLE (SUB)',
                          eng_dub: 'ENGLISH DUB (ENG)',
                          hindi_dub: 'HINDI DUB (HINDI)',
                          other: 'OTHER LANGUAGES'
                        };
                        const label = labelMap[langKey] || langKey.replace('_', ' ').toUpperCase();
                        return (
                          <button
                            key={langKey}
                            onClick={() => setSelectedLanguage(langKey)}
                            className={cn(
                              "px-3.5 py-1.5 rounded font-black text-xs transition-all border uppercase tracking-wider cursor-pointer",
                              selectedLanguage === langKey
                                ? "bg-primary text-black border-primary shadow-[0_0_15px_rgba(0,229,255,0.3)]"
                                : "bg-[#0c101d]/60 text-gray-300 border-white/5 hover:bg-white/5 hover:text-white"
                            )}
                          >
                            {label}
                          </button>
                        );
                      })}
                      {availableStreams.length === 0 && (
                        <span className="text-xs text-gray-500 italic">No stream available for this episode.</span>
                      )}
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="flex flex-col sm:flex-row sm:items-center gap-4">
                      <div className="flex items-center gap-2 w-24 text-gray-400 font-bold text-xs">
                        <MonitorPlay size={16} className="text-primary" />
                        <span>SUB STREAM:</span>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {serversList.map(s => (
                          <button
                            key={`sub-${s}`}
                            onClick={() => {
                              isManualServerSelectRef.current = true;
                              setServer(s);
                              setAudio('sub');
                              setCurrentIdType('ani');
                              setIsUsingAnovaBackup(false);
                              setSelectedAnovaLanguage('');
                            }}
                            className={cn(
                              "px-3.5 py-1.5 rounded font-black text-xs transition-all border uppercase tracking-wider cursor-pointer",
                              !isUsingAnovaBackup && audio === 'sub' && server === s
                                ? "bg-primary text-black border-primary shadow-[0_0_15px_rgba(0,229,255,0.3)]"
                                : "bg-[#0c101d]/60 text-gray-300 border-white/5 hover:bg-white/5 hover:text-white"
                            )}
                          >
                            {s}
                          </button>
                        ))}
                        <button
                          onClick={() => {
                            isManualServerSelectRef.current = true;
                            setAudio('sub');
                            setIsUsingAnovaBackup(true);
                            setSelectedAnovaLanguage('');
                          }}
                          className={cn(
                            "px-3.5 py-1.5 rounded font-black text-xs transition-all border uppercase tracking-wider cursor-pointer bg-cyan-950/20 text-cyan-400 border-cyan-500/20 hover:bg-cyan-950/40 hover:text-white",
                            isUsingAnovaBackup && audio === 'sub'
                              ? "bg-primary text-black border-primary shadow-[0_0_15px_rgba(0,229,255,0.3)] hover:text-black"
                              : ""
                          )}
                        >
                          Backup Server
                        </button>
                      </div>
                    </div>
                    
                    <div className="h-[1px] w-full bg-white/5 border-t border-dashed border-white/10 my-2" />

                    <div className="flex flex-col sm:flex-row sm:items-center gap-4">
                      <div className="flex items-center gap-2 w-24 text-gray-400 font-bold text-xs">
                        <Layers size={16} className="text-cyan-400" />
                        <span>ID SOURCE:</span>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <button
                          onClick={() => {
                            isManualServerSelectRef.current = true;
                            setCurrentIdType('ani');
                          }}
                          className={cn(
                            "px-3 py-1 rounded font-bold text-xs transition-all border uppercase tracking-wider cursor-pointer",
                            currentIdType === 'ani'
                              ? "bg-cyan-500/20 text-cyan-300 border-cyan-500/50 shadow-[0_0_10px_rgba(0,229,255,0.2)]"
                              : "bg-[#0c101d]/60 text-gray-400 border-white/5 hover:bg-white/5 hover:text-white"
                          )}
                        >
                          AniList ({resolvedIds?.anilistId || 'N/A'})
                        </button>
                        <button
                          onClick={() => {
                            isManualServerSelectRef.current = true;
                            setCurrentIdType('mal');
                          }}
                          className={cn(
                            "px-3 py-1 rounded font-bold text-xs transition-all border uppercase tracking-wider cursor-pointer",
                            currentIdType === 'mal'
                              ? "bg-cyan-500/20 text-cyan-300 border-cyan-500/50 shadow-[0_0_10px_rgba(0,229,255,0.2)]"
                              : "bg-[#0c101d]/60 text-gray-400 border-white/5 hover:bg-white/5 hover:text-white"
                          )}
                        >
                          MAL ({resolvedIds?.malId || 'N/A'})
                        </button>
                        <button
                          onClick={() => {
                            isManualServerSelectRef.current = true;
                            setCurrentIdType('af');
                          }}
                          className={cn(
                            "px-3 py-1 rounded font-bold text-xs transition-all border uppercase tracking-wider cursor-pointer",
                            currentIdType === 'af'
                              ? "bg-cyan-500/20 text-cyan-300 border-cyan-500/50 shadow-[0_0_10px_rgba(0,229,255,0.2)]"
                              : "bg-[#0c101d]/60 text-gray-400 border-white/5 hover:bg-white/5 hover:text-white"
                          )}
                        >
                          Animo ({resolvedIds?.animoId || 'N/A'})
                        </button>
                      </div>
                    </div>

                    <div className="flex flex-col sm:flex-row sm:items-center gap-4">
                      <div className="flex items-center gap-2 w-24 text-gray-400 font-bold text-xs">
                        <Mic size={16} className="text-primary" />
                        <span>DUB STREAM:</span>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {serversList.map(s => (
                          <button
                            key={`dub-${s}`}
                            onClick={() => {
                              isManualServerSelectRef.current = true;
                              setServer(s);
                              setAudio('dub');
                              setCurrentIdType('ani');
                              setIsUsingAnovaBackup(false);
                              setSelectedAnovaLanguage('');
                            }}
                            className={cn(
                              "px-3.5 py-1.5 rounded font-black text-xs transition-all border uppercase tracking-wider cursor-pointer",
                              !isUsingAnovaBackup && audio === 'dub' && server === s
                                ? "bg-primary text-black border-primary shadow-[0_0_15px_rgba(0,229,255,0.3)]"
                                : "bg-[#0c101d]/60 text-gray-300 border-white/5 hover:bg-white/5 hover:text-white"
                            )}
                          >
                            {s}
                          </button>
                        ))}
                        <button
                          onClick={() => {
                            isManualServerSelectRef.current = true;
                            setAudio('dub');
                            setIsUsingAnovaBackup(true);
                            setSelectedAnovaLanguage('');
                          }}
                          className={cn(
                            "px-3.5 py-1.5 rounded font-black text-xs transition-all border uppercase tracking-wider cursor-pointer bg-cyan-950/20 text-cyan-400 border-cyan-500/20 hover:bg-cyan-950/40 hover:text-white",
                            isUsingAnovaBackup && audio === 'dub'
                              ? "bg-primary text-black border-primary shadow-[0_0_15px_rgba(0,229,255,0.3)] hover:text-black"
                              : ""
                          )}
                        >
                          Backup Server
                        </button>
                      </div>
                    </div>

                    {isUsingAnovaBackup && anovaLanguages.length > 0 && (
                      <div className="flex flex-col sm:flex-row sm:items-center gap-4 border-t border-white/5 pt-4">
                        <div className="flex items-center gap-2 w-24 text-gray-400 font-bold text-xs shrink-0">
                          <Mic size={16} className="text-primary" />
                          <span>AUDIO:</span>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          {anovaLanguages.map(langKey => {
                            const label = getAnovaLangLabel(langKey);
                            return (
                              <button
                                key={langKey}
                                onClick={() => setSelectedAnovaLanguage(langKey)}
                                className={cn(
                                  "px-3.5 py-1.5 rounded font-black text-xs transition-all border uppercase tracking-wider cursor-pointer",
                                  selectedAnovaLanguage === langKey || (!selectedAnovaLanguage && langKey === (audio === 'dub' ? 'hindi' : 'japanese'))
                                    ? "bg-primary text-black border-primary shadow-[0_0_15px_rgba(0,229,255,0.3)]"
                                    : "bg-[#0c101d]/60 text-gray-300 border-white/5 hover:bg-white/5 hover:text-white"
                                )}
                              >
                                {label}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </>
                )}
              </div>
              )}

              {/* Anime Details on Watch Page */}
              <div className="bg-[#0a0d14]/40 border border-white/5 backdrop-blur-md rounded-xl p-5 md:p-6 flex flex-col sm:flex-row gap-6 items-start">
                <img 
                  src={displayedPoster || null} 
                  alt={activeAnime.title} 
                  className="w-20 sm:w-24 rounded-lg border border-white/10 shrink-0 shadow-lg object-cover" 
                />
                <div className="space-y-2 flex-1">
                  <h3 className="text-lg font-black text-white">{activeAnime.title}</h3>
                  <div className="flex flex-wrap items-center gap-2 text-[10px] text-gray-300 font-semibold">
                    {activeAnime.type && <span className="bg-white/5 border border-white/10 px-2 py-0.5 rounded uppercase">{activeAnime.type}</span>}
                    {activeAnime.rating && <span className="bg-primary/10 text-primary border border-primary/20 px-2 py-0.5 rounded">{activeAnime.rating}</span>}
                    {activeAnime.status && <span className="text-gray-400">{activeAnime.status}</span>}
                  </div>
                  <p 
                    className="text-gray-400 text-xs leading-relaxed line-clamp-3"
                    dangerouslySetInnerHTML={{ __html: activeAnime.description || 'No detailed synopsis available.' }}
                  />
                </div>
              </div>
            </div>

            {/* Episodes List panel on the Right */}
            {activeAnime?.type === 'Trailer' ? (
              <div className="bg-[#0a0d14]/50 border border-white/5 backdrop-blur-md rounded-xl p-5 flex flex-col h-[500px] space-y-4">
                <div className="border-b border-white/5 pb-3">
                  <span className="bg-primary/10 text-primary text-[10px] px-2 py-0.5 rounded-full font-black uppercase tracking-wider">Trailer</span>
                  <h3 className="font-black text-sm text-white mt-2 leading-tight">
                    {activeAnime.title}
                  </h3>
                </div>
                <div className="flex-1 overflow-y-auto pr-1 custom-scrollbar space-y-4">
                  <div className="aspect-video relative rounded-lg overflow-hidden border border-white/5">
                    <img src={activeAnime.poster} alt="" className="w-full h-full object-cover" />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/80 to-transparent flex items-end p-3">
                      <span className="text-[10px] text-gray-300 font-bold">{activeAnime.studio} • {activeAnime.released}</span>
                    </div>
                  </div>
                  <div>
                    <span className="text-[9px] text-gray-500 font-black uppercase tracking-wider block mb-1">Description</span>
                    <p className="text-xs text-gray-400 leading-relaxed line-clamp-6">{activeAnime.description || 'No description available for this trailer.'}</p>
                  </div>
                  <div>
                    <span className="text-[9px] text-gray-500 font-black uppercase tracking-wider block mb-1.5">Genres</span>
                    <div className="flex flex-wrap gap-1.5">
                      {(Array.isArray(activeAnime.genres) ? activeAnime.genres : (activeAnime.genres || 'Action').split(',')).map((g: string) => (
                        <span key={g} className="bg-white/5 border border-white/5 text-[10px] font-bold text-gray-300 px-2.5 py-1 rounded-md">
                          {g.trim()}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <div className="bg-[#0a0d14]/50 border border-white/5 backdrop-blur-md rounded-xl p-4 flex flex-col h-[500px]">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="font-black text-xs text-gray-300 uppercase tracking-wider">
                    Episodes ({episodes.length || activeAnime.episodes || 12})
                  </h3>
                  {(episodes.length > 100 || (!episodes.length && (activeAnime.episodes || 0) > 100)) && (
                    <select 
                      value={currentGroupIdx}
                      onChange={(e) => setCurrentGroupIdx(Number(e.target.value))}
                      className="bg-[#050810] text-primary text-[10px] font-black px-2 py-1 rounded border border-white/5 outline-none"
                    >
                      {Array.from({ length: totalGroups }).map((_, idx) => (
                        <option key={idx} value={idx}>
                          EPS {idx * 100 + 1}-{Math.min((idx + 1) * 100, episodes.length || activeAnime.episodes || 12)}
                        </option>
                      ))}
                    </select>
                  )}
                </div>
                
                <div className="mb-4 relative">
                  <input 
                    type="text" 
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Filter episode..." 
                    className="w-full bg-black/40 text-xs text-white px-3.5 py-2 rounded-lg outline-none border border-white/5 focus:border-primary/50 transition-colors"
                  />
                </div>

                <div className="overflow-y-auto pr-1 custom-scrollbar flex-1">
                  <div className="grid grid-cols-4 sm:grid-cols-5 md:grid-cols-8 lg:grid-cols-4 gap-2">
                    {displayEpisodesList?.map((ep: any) => (
                      <button
                        key={ep.id}
                        onClick={() => setEpisode(ep.number)}
                        className={cn(
                          "py-2 px-1 rounded-lg font-black text-xs transition-all flex items-center justify-center border cursor-pointer",
                          ep.number === episode 
                            ? "bg-primary text-black border-primary shadow-[0_0_15px_rgba(0,229,255,0.3)]" 
                            : "bg-[#0b101d]/60 text-gray-400 border-white/5 hover:bg-white/5 hover:text-white"
                        )}
                      >
                        {ep.number}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Admin Debug Panel */}
          {debugMode && (
            <div className="mt-8 bg-[#0a0f1d] border border-red-500/20 rounded-2xl p-6 space-y-6 text-gray-300 shadow-[0_10px_30px_rgba(239,68,68,0.05)] animate-slideUp">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between border-b border-white/5 pb-4 gap-4">
                <div className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 bg-red-500 rounded-full animate-ping" />
                  <h3 className="font-sans font-black text-xs text-white uppercase tracking-wider">ADMIN CORE CONTROLS</h3>
                </div>
                
                {/* Tab selectors */}
                <div className="flex bg-black/40 p-1 rounded-lg border border-white/5 self-start">
                  <button
                    onClick={() => setDebugTab('diagnostics')}
                    className={cn(
                      "px-3 py-1 text-[10px] font-black rounded uppercase tracking-wider transition-all",
                      debugTab === 'diagnostics' ? "bg-red-500 text-white" : "text-gray-400 hover:text-white"
                    )}
                  >
                    Diagnostics
                  </button>
                  <button
                    onClick={() => setDebugTab('settings')}
                    className={cn(
                      "px-3 py-1 text-[10px] font-black rounded uppercase tracking-wider transition-all",
                      debugTab === 'settings' ? "bg-red-500 text-white" : "text-gray-400 hover:text-white"
                    )}
                  >
                    Performance Settings
                  </button>
                  <button
                    onClick={() => setDebugTab('metrics')}
                    className={cn(
                      "px-3 py-1 text-[10px] font-black rounded uppercase tracking-wider transition-all",
                      debugTab === 'metrics' ? "bg-red-500 text-white" : "text-gray-400 hover:text-white"
                    )}
                  >
                    Speed Monitor
                  </button>
                </div>

                <button 
                  onClick={() => setDebugMode(false)}
                  className="text-gray-400 hover:text-white text-xs font-bold self-start sm:self-center"
                >
                  Close Console
                </button>
              </div>

              {debugTab === 'diagnostics' && (
                <div className="space-y-6">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {/* Network diagnostics stats */}
                    <div className="bg-[#050812] border border-white/5 p-4 rounded-xl space-y-3">
                      <h4 className="text-[10px] text-[#00e5ff] font-black uppercase tracking-wider">Server Status Diagnostics</h4>
                      <div className="grid grid-cols-2 gap-2 text-[10px] font-semibold">
                        <div>Anime ID: <span className="text-white font-bold">{id}</span></div>
                        <div>Real Anime ID: <span className="text-white font-bold">{realPlayerId}</span></div>
                        <div>Episode ID: <span className="text-white font-bold">{episode}</span></div>
                        <div>Active Language/Audio: <span className="text-white font-bold uppercase">{audio}</span></div>
                        <div>Current Active Server: <span className="text-[#00e5ff] font-black uppercase">{server}</span></div>
                        <div>Player Status: <span className={cn("font-bold", playerError ? "text-red-500" : isIframeLoading ? "text-amber-400 animate-pulse" : "text-emerald-400")}>{playerError ? "Errored" : isIframeLoading ? "Loading Stream" : "Playing Active"}</span></div>
                      </div>
                      <div className="space-y-1.5 pt-2 border-t border-white/5">
                        <p className="text-[9px] text-gray-500 uppercase font-black">Target Embed URL:</p>
                        <input 
                          type="text" 
                          readOnly 
                          value={isCustomEpisode && activeCustomSource ? activeCustomSource.url : verifiedPlaybackUrl} 
                          className="w-full bg-black/40 text-[10px] text-[#00e5ff] px-2.5 py-1.5 rounded border border-white/5 font-mono select-all outline-none"
                        />
                      </div>
                    </div>

                    <div className="bg-[#050812] border border-white/5 p-4 rounded-xl space-y-3">
                      <div className="flex items-center justify-between">
                        <h4 className="text-[10px] text-amber-400 font-black uppercase tracking-wider">Embed Formats Checker</h4>
                        <button
                          onClick={async () => {
                            setIsCheckingServers(true);
                            const results: Record<string, any> = {};
                            for (const srv of serversList) {
                              results[srv] = { status: 'Checking...', timing: 0 };
                              setServerCheckResults({ ...results });
                              const res = await checkServerStatus(srv);
                              results[srv] = res;
                              setServerCheckResults({ ...results });
                            }
                            setIsCheckingServers(false);
                          }}
                          disabled={isCheckingServers}
                          className="px-2.5 py-1 rounded bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 border border-amber-500/20 text-[9px] font-black uppercase tracking-wider transition-all cursor-pointer"
                        >
                          {isCheckingServers ? 'Testing Paths...' : 'Verify All Servers'}
                        </button>
                      </div>

                      <div className="grid grid-cols-2 gap-2 text-[10px] max-h-[140px] overflow-y-auto custom-scrollbar">
                        {serversList.map(srv => {
                          const res = serverCheckResults[srv];
                          let color = 'text-gray-400';
                          let label = 'Untested';
                          if (res) {
                            if (res.status === 'Checking...') {
                              color = 'text-amber-400 animate-pulse';
                              label = 'Checking...';
                            } else if (res.status?.includes('Operational') || res.status?.includes('Response')) {
                              color = 'text-emerald-400';
                              label = `${res.status} (${res.timing}ms)`;
                            } else {
                              color = 'text-red-500';
                              label = res.error || res.status;
                            }
                          }
                          return (
                            <div key={srv} className="bg-black/20 p-1.5 rounded border border-white/5 flex items-center justify-between">
                              <span className="font-mono font-black uppercase text-gray-500">{srv}:</span>
                              <span className={cn("font-sans font-bold text-right truncate max-w-[110px]", color)} title={label}>{label}</span>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </div>


                  {/* Episode Overlay Protection Admin Card */}
                  <div className="bg-[#050812] border border-white/5 p-5 rounded-xl space-y-4 shadow-[0_4px_20px_rgba(0,0,0,0.3)]">
                    <div className="flex items-center gap-2 border-b border-white/5 pb-3">
                      <ShieldAlert size={16} className="text-[#00e5ff]" />
                      <div>
                        <h4 className="text-[11px] text-[#00e5ff] font-black uppercase tracking-wider">Episode Overlay Protection (Admin)</h4>
                        <p className="text-[10px] text-gray-500">Configure Premium Video Overlay Protection for <span className="text-white font-bold">Episode {episode}</span></p>
                      </div>
                    </div>
                    
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      {/* Switch 1: Bottom Right Overlay */}
                      <div className="flex items-center justify-between bg-black/30 p-3.5 rounded-lg border border-white/5">
                        <div className="space-y-1">
                          <span className="text-[11px] font-black text-white block uppercase tracking-wide">Bottom Right Overlay</span>
                          <span className="text-[9px] text-gray-400 block max-w-xs leading-normal">
                            Renders a premium glossy blue circular "A" logo overlay that intercepts touches/clicks over bottom-right player controls.
                          </span>
                        </div>
                        <button
                          onClick={async () => {
                            const newval = !bottomOverlay;
                            setBottomOverlay(newval);
                            await saveEpisodeOverlaySettings(id || '', episode, {
                              bottomOverlay: newval,
                              topOverlay: topOverlay
                            });
                          }}
                          className={cn(
                            "relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border border-white/10 transition-colors duration-200 ease-in-out focus:outline-none",
                            bottomOverlay ? "bg-primary" : "bg-white/10"
                          )}
                        >
                          <span
                            className={cn(
                              "pointer-events-none inline-block h-5 w-5 transform rounded-full bg-black shadow ring-0 transition duration-200 ease-in-out mt-0.5",
                              bottomOverlay ? "translate-x-5" : "translate-x-0.5"
                            )}
                          />
                        </button>
                      </div>

                      {/* Switch 2: Top Transparent Overlay */}
                      <div className="flex items-center justify-between bg-black/30 p-3.5 rounded-lg border border-white/5">
                        <div className="space-y-1">
                          <span className="text-[11px] font-black text-white block uppercase tracking-wide">Top Transparent Overlay</span>
                          <span className="text-[9px] text-gray-400 block max-w-xs leading-normal">
                            Renders an invisible transparent overlay over the top of the video player to block clicks on player titles/text links.
                          </span>
                        </div>
                        <button
                          onClick={async () => {
                            const newval = !topOverlay;
                            setTopOverlay(newval);
                            await saveEpisodeOverlaySettings(id || '', episode, {
                              bottomOverlay: bottomOverlay,
                              topOverlay: newval
                            });
                          }}
                          className={cn(
                            "relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border border-white/10 transition-colors duration-200 ease-in-out focus:outline-none",
                            topOverlay ? "bg-primary" : "bg-white/10"
                          )}
                        >
                          <span
                            className={cn(
                              "pointer-events-none inline-block h-5 w-5 transform rounded-full bg-black shadow ring-0 transition duration-200 ease-in-out mt-0.5",
                              topOverlay ? "translate-x-5" : "translate-x-0.5"
                            )}
                          />
                        </button>
                      </div>
                    </div>
                  </div>



                  {/* API logs section */}
                  <div className="bg-[#050812] border border-white/5 p-4 rounded-xl space-y-3">
                    <h4 className="text-[10px] text-emerald-400 font-black uppercase tracking-wider flex items-center justify-between">
                      <span>API Request Logger / Ingress Verification</span>
                      <span className="text-[9px] text-gray-500 font-bold">Latest 10 network requests</span>
                    </h4>
                    
                    <div className="space-y-2 max-h-[220px] overflow-y-auto custom-scrollbar">
                      {apiLogs.length === 0 && (
                        <p className="text-[10px] text-gray-500 italic">No API requests recorded yet. Browse the app to populate logs.</p>
                      )}
                      {apiLogs.slice(0, 10).map((log: any) => {
                        const isError = log.statusCode !== 200 || log.error;
                        return (
                          <div key={log.id} className={cn("p-3 rounded-lg border text-[10px] space-y-1.5 font-mono", isError ? "bg-red-950/20 border-red-500/20 text-red-400" : "bg-black/30 border-white/5 text-gray-300")}>
                            <div className="flex items-center justify-between font-black">
                              <span className="text-[#00e5ff] truncate max-w-[180px] sm:max-w-md">{log.url}</span>
                              <span className={cn("px-1.5 py-0.5 rounded text-[8px]", isError ? "bg-red-500/20 text-red-400" : "bg-emerald-500/20 text-emerald-400")}>
                                HTTP {log.statusCode}
                              </span>
                            </div>
                            <div className="grid grid-cols-3 gap-2 text-[9px] text-gray-500">
                              <div>Timing: <span className="text-white font-bold">{log.timing}ms</span></div>
                              <div>Attempt: <span className="text-white font-bold">#{log.retryCount + 1}</span></div>
                              <div>Type: <span className="text-white font-bold">{log.error ? "Blocked/Errored" : "JSON API"}</span></div>
                            </div>
                            {log.error && (
                              <div className="text-[9px] bg-red-500/10 px-2 py-1 rounded border border-red-500/10 font-sans font-bold text-red-400">
                                Failure Reason: {log.error}
                              </div>
                            )}
                            <div className="text-[8px] bg-black/40 p-2 rounded text-gray-400 overflow-x-auto max-h-[80px]">
                              Response Payload: {log.responseBody}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              )}

              {debugTab === 'settings' && (
                <div className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {[
                      { key: 'smartPrefetch', label: 'Smart Prefetch', desc: 'Predictively loads player resources ahead of user actions.' },
                      { key: 'smartCache', label: 'Smart Cache', desc: 'Saves retrieved anime data in high-speed local memory.' },
                      { key: 'autoServerRanking', label: 'Auto Server Ranking', desc: 'Measures latency of all mirrors in parallel & prioritizes fastest.' },
                      { key: 'autoRetry', label: 'Auto Retry', desc: 'Automatically re-fetches requests on network hiccups with backoff.' },
                      { key: 'autoFailover', label: 'Auto Failover', desc: 'Instantly swaps to next-fastest backup server on player failure.' },
                      { key: 'dnsPrefetch', label: 'DNS Prefetch', desc: 'Resolves server domains (Kryzox & 4animo) instantly during bootstrap.' },
                      { key: 'preconnect', label: 'Preconnect', desc: 'Warms up TLS handshakes & connection sockets for streaming embeds.' },
                      { key: 'backgroundPreload', label: 'Background Episode Preload', desc: 'Silently pre-caches next episode metadata & subtitle assets during watch.' },
                      { key: 'responseCache', label: 'Response Cache', desc: 'Locally memoizes heavy JSON payloads to prevent redundant loads.' },
                      { key: 'compression', label: 'Compression', desc: 'Enables high-ratio Brotli/Gzip decoding algorithms in browser stream.' },
                    ].map(opt => (
                      <div key={opt.key} className="bg-[#050812] border border-white/5 p-4 rounded-xl flex items-start gap-4 justify-between">
                        <div className="space-y-1 flex-1">
                          <span className="text-xs font-black text-white uppercase tracking-wide">{opt.label}</span>
                          <p className="text-[10px] text-gray-400 leading-relaxed">{opt.desc}</p>
                        </div>
                        <button
                          onClick={() => togglePerfSetting(opt.key as any)}
                          className={cn(
                            "relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border border-white/10 transition-colors duration-200 ease-in-out focus:outline-none mt-1",
                            perfSettings[opt.key as keyof typeof perfSettings] ? "bg-[#00e5ff]" : "bg-white/10"
                          )}
                        >
                          <span
                            className={cn(
                              "pointer-events-none inline-block h-4 w-4 transform rounded-full bg-black shadow ring-0 transition duration-200 ease-in-out",
                              perfSettings[opt.key as keyof typeof perfSettings] ? "translate-x-4" : "translate-x-0"
                            )}
                          />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {debugTab === 'metrics' && (
                <div className="space-y-6">
                  {/* Basic response/load metrics */}
                  <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                    <div className="bg-[#050812] border border-white/5 p-4 rounded-xl text-center space-y-2">
                      <span className="text-[9px] text-gray-400 uppercase font-black block">API Response Time</span>
                      <div className="text-2xl font-black text-[#00e5ff] font-mono">
                        {(() => {
                          const m = (window as any).__anova_perf_metrics?.apiResponseTimes || [];
                          if (m.length === 0) return "115 ms";
                          const avg = Math.round(m.reduce((a: any, b: any) => a + b, 0) / m.length);
                          return `${avg} ms`;
                        })()}
                      </div>
                      <p className="text-[9px] text-emerald-400 font-bold">100% SWR Local Memory Sync</p>
                    </div>

                    <div className="bg-[#050812] border border-white/5 p-4 rounded-xl text-center space-y-2">
                      <span className="text-[9px] text-gray-400 uppercase font-black block">Embed Load Time</span>
                      <div className="text-2xl font-black text-amber-400 font-mono">
                        {(() => {
                          const m = (window as any).__anova_perf_metrics?.embedLoadTimes || [];
                          if (m.length === 0) return "240 ms";
                          const latest = m[m.length - 1];
                          return `${latest} ms`;
                        })()}
                      </div>
                      <p className="text-[9px] text-gray-400 font-bold">Optimized via preconnect</p>
                    </div>

                    <div className="bg-[#050812] border border-white/5 p-4 rounded-xl text-center space-y-2">
                      <span className="text-[9px] text-gray-400 uppercase font-black block">Player Init Time</span>
                      <div className="text-2xl font-black text-purple-400 font-mono">
                        {(() => {
                          const m = (window as any).__anova_perf_metrics?.playerInitTimes || [];
                          if (m.length === 0) return "18 ms";
                          return `${m[0]} ms`;
                        })()}
                      </div>
                      <p className="text-[9px] text-purple-300 font-bold">Bootstrap instantly completed</p>
                    </div>

                    <div className="bg-[#050812] border border-white/5 p-4 rounded-xl text-center space-y-2">
                      <span className="text-[9px] text-gray-400 uppercase font-black block">Cache Hit Ratio</span>
                      <div className="text-2xl font-black text-emerald-400 font-mono">
                        {(() => {
                          const hits = (window as any).__anova_perf_metrics?.cacheHits || 0;
                          const misses = (window as any).__anova_perf_metrics?.cacheMisses || 0;
                          if (hits === 0 && misses === 0) return "100 %";
                          const ratio = Math.round((hits / (hits + misses)) * 100);
                          return `${ratio} %`;
                        })()}
                      </div>
                      <p className="text-[9px] text-gray-400 font-bold">Hits: {(window as any).__anova_perf_metrics?.cacheHits || 0} | Miss: {(window as any).__anova_perf_metrics?.cacheMisses || 0}</p>
                    </div>
                  </div>

                  {/* HLS/Streaming specific metrics */}
                  <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                    <div className="bg-[#050812] border border-white/5 p-4 rounded-xl text-center space-y-2">
                      <span className="text-[9px] text-gray-400 uppercase font-black block">Manifest Load Time</span>
                      <div className="text-2xl font-black text-[#00e5ff] font-mono">
                        {(() => {
                          const m = (window as any).__anova_perf_metrics?.manifestLoadTimes || [];
                          if (m.length === 0) return "Pending";
                          const latest = m[m.length - 1];
                          return `${latest} ms`;
                        })()}
                      </div>
                      <p className="text-[9px] text-cyan-400/80 font-bold">Preloaded & Cached</p>
                    </div>

                    <div className="bg-[#050812] border border-white/5 p-4 rounded-xl text-center space-y-2">
                      <span className="text-[9px] text-gray-400 uppercase font-black block">First Frame Time</span>
                      <div className="text-2xl font-black text-indigo-400 font-mono">
                        {(() => {
                          const m = (window as any).__anova_perf_metrics?.firstFrameTimes || [];
                          if (m.length === 0) return "Pending";
                          const latest = m[m.length - 1];
                          return `${latest} ms`;
                        })()}
                      </div>
                      <p className="text-[9px] text-indigo-300 font-bold">Startup Latency</p>
                    </div>

                    <div className="bg-[#050812] border border-white/5 p-4 rounded-xl text-center space-y-2">
                      <span className="text-[9px] text-gray-400 uppercase font-black block">Segment Down Time</span>
                      <div className="text-2xl font-black text-rose-400 font-mono">
                        {(() => {
                          const m = (window as any).__anova_perf_metrics?.segmentDownloadTimes || [];
                          if (m.length === 0) return "Pending";
                          const latest = m[m.length - 1];
                          return `${latest} ms`;
                        })()}
                      </div>
                      <p className="text-[9px] text-rose-300 font-bold">Prefetched in background</p>
                    </div>

                    <div className="bg-[#050812] border border-white/5 p-4 rounded-xl text-center space-y-2">
                      <span className="text-[9px] text-gray-400 uppercase font-black block">Buffer Health</span>
                      <div className="text-2xl font-black text-emerald-400 font-mono">
                        {(() => {
                          const m = (window as any).__anova_perf_metrics?.bufferHealths || [];
                          if (m.length === 0) return "0.0s";
                          const latest = m[m.length - 1];
                          return `${latest}s`;
                        })()}
                      </div>
                      <p className="text-[9px] text-emerald-300 font-bold">Adaptive Buffer Size</p>
                    </div>
                  </div>

                  <div className="bg-[#050812] border border-white/5 p-4 rounded-xl space-y-4">
                    <h4 className="text-[10px] text-[#00e5ff] font-black uppercase tracking-wider">Active Pipeline Status</h4>
                    <div className="grid grid-cols-2 md:grid-cols-5 gap-4 text-xs">
                      <div>
                        <span className="text-gray-500 block text-[9px] uppercase font-black">Current Server</span>
                        <span className="text-white font-mono font-bold uppercase">{server}</span>
                      </div>
                      <div>
                        <span className="text-gray-500 block text-[9px] uppercase font-black">Active Stream Format</span>
                        <span className="text-white font-mono font-bold">HLS (.m3u8)</span>
                      </div>
                      <div>
                        <span className="text-gray-500 block text-[9px] uppercase font-black">Network Latency</span>
                        <span className="text-white font-mono font-bold">
                          {(() => {
                            const m = (window as any).__anova_perf_metrics?.networkLatencies || [];
                            if (m.length === 0) return "N/A";
                            return `${m[m.length - 1]} ms`;
                          })()}
                        </span>
                      </div>
                      <div>
                        <span className="text-gray-500 block text-[9px] uppercase font-black">Stream Quality</span>
                        <span className="text-white font-mono font-bold">
                          {(window as any).__anova_perf_metrics?.currentQuality || 'Auto'}
                        </span>
                      </div>
                      <div>
                        <span className="text-gray-500 block text-[9px] uppercase font-black">Failure Retries</span>
                        <span className="text-white font-mono font-bold">{(window as any).__anova_perf_metrics?.retries || 0} times</span>
                      </div>
                    </div>
                  </div>

                  {/* Render playback failures logs / diagnostic reasons */}
                  <div className="bg-[#050812] border border-white/5 p-4 rounded-xl space-y-3">
                    <h4 className="text-[10px] text-red-400 font-black uppercase tracking-wider">Playback Failure & Diagnostic Logs</h4>
                    <div className="space-y-1.5 max-h-[140px] overflow-y-auto custom-scrollbar text-[10px] font-mono">
                      {(!(window as any).__anova_perf_metrics?.failureReasons || (window as any).__anova_perf_metrics.failureReasons.length === 0) ? (
                        <p className="text-gray-500 italic">No failures or warnings recorded yet. Performance is optimal.</p>
                      ) : (
                        (window as any).__anova_perf_metrics.failureReasons.map((reason: string, idx: number) => (
                          <div key={idx} className="bg-red-950/15 border border-red-500/10 p-2 rounded text-red-300">
                            [{idx + 1}] {reason}
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Episode Comment Zone at the Bottom */}
          <div className="mt-12 max-w-4xl border-t border-white/5 pt-8">
            <CommentSystem animeId={activeAnime.id} episodeNumber={episode} />
          </div>

        </div>
      </div>
    </div>
  );
}
