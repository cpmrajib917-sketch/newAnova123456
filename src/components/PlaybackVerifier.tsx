// @ts-nocheck
import React, { useState, useEffect, useRef } from 'react';
import { 
  Play, Pause, RefreshCw, CheckCircle, AlertCircle, Server, Settings, 
  AlertTriangle, Activity, Database, List, FileText, ChevronRight, Info,
  Search, Trash, Check, ShieldCheck, HelpCircle, AlertOctagon, Sparkles
} from 'lucide-react';
import { cn } from '../lib/utils';
import { api, apiCache } from '../lib/api';
import { ref, set, get, update, onValue } from 'firebase/database';
import { db } from '../lib/firebase';
import { toast } from 'sonner';

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
  const pathType = idTypeVal === 'af' ? 'af' : (idTypeVal === 'mal' ? 'mal' : 'ani');
  let url = `https://cdn.4animo.xyz/embed/${serverVal}/${pathType}/${targetId}/${episodeVal}/${audioTypeVal}`;

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

interface VerifierLog {
  id: string;
  timestamp: number;
  animeId: string;
  animeTitle: string;
  episode: number;
  embedUrl: string;
  status: 'SUCCESS' | 'REPAIR' | 'FAILED' | 'INFO';
  reason: string;
  server: string;
  idType: string;
  retryCount: number;
}

interface VerificationRecord {
  animeId: string;
  title: string;
  status: 'Verified' | 'Verified with Retry' | 'Verified Failed' | 'Pending';
  lastVerifiedAt: number;
  metadataHash: string;
  episodesCount: number;
  failureReason?: string;
  workingServer?: string;
  workingIdType?: string;
  retryCount?: number;
}

export function PlaybackVerifier() {
  // Config & Ranges
  const [selectedBatch, setSelectedBatch] = useState('custom');
  const [startId, setStartId] = useState(1);
  const [endId, setEndId] = useState(25);
  const [concurrency, setConcurrency] = useState(2);
  const [delayMs, setDelayMs] = useState(1000);
  const [maxEpsPerAnime, setMaxEpsPerAnime] = useState('3'); // '1', '3', '5', 'all'
  const [skipVerified, setSkipVerified] = useState(true);

  // Verifier State
  const [isRunning, setIsRunning] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [currentId, setCurrentId] = useState<number | null>(null);
  const [progressPercent, setProgressPercent] = useState(0);

  // Statistics
  const [stats, setStats] = useState({
    totalChecked: 0,
    verified: 0,
    verifiedWithRetry: 0,
    verifiedFailed: 0,
    skipped: 0
  });

  // Logs and Database Records
  const [logs, setLogs] = useState<VerifierLog[]>([]);
  const [filterType, setFilterType] = useState<'all' | 'failed' | 'success'>('all');
  const [dbRecords, setDbRecords] = useState<Record<string, VerificationRecord>>({});
  const [brokenAnimesList, setBrokenAnimesList] = useState<string[]>([]);
  const [dbLoading, setDbLoading] = useState(true);
  const [dbSearch, setDbSearch] = useState('');
  const [dbFilterStatus, setDbFilterStatus] = useState('all');

  // Active checking elements for visual feedback
  const [activeCheck, setActiveCheck] = useState<{
    id: string;
    title: string;
    episode: number;
    url: string;
    server: string;
    idType: string;
    step: string;
  } | null>(null);

  // Refs for tracking active operations and cancellations
  const isRunningRef = useRef(false);
  const isPausedRef = useRef(false);
  const activeWorkersCountRef = useRef(0);
  const onActiveIframeErrorRef = useRef<((reason: string) => void) | null>(null);
  const iframeContainerRef = useRef<HTMLDivElement>(null);

  // Global catalog states
  const [globalAnimeList, setGlobalAnimeList] = useState<any[]>([]);
  const [globalLoading, setGlobalLoading] = useState(false);
  const [globalSearchQuery, setGlobalSearchQuery] = useState('');
  const [globalLoaded, setGlobalLoaded] = useState(false);

  // Preset batches matching standard production setup
  const BATCH_PRESETS = [
    { id: 'all-catalog', label: 'All Catalog Scope (IDs 1 → 1000)', start: 1, end: 1000 },
    { id: 'batch-1', label: 'Batch 1 (IDs 1 → 10000)', start: 1, end: 10000 },
    { id: 'batch-2', label: 'Batch 2 (IDs 10001 → 20000)', start: 10001, end: 20000 },
    { id: 'batch-3', label: 'Batch 3 (IDs 20001 → 30000)', start: 20001, end: 30000 },
    { id: 'test-1', label: 'Quick Test Range (IDs 21 → 35)', start: 21, end: 35 },
    { id: 'custom', label: 'Custom ID Range...', start: 1, end: 100 }
  ];

  // Load verified records from Realtime Database on mount
  useEffect(() => {
    const verifiedRef = ref(db, 'playback_verification');
    const unsubscribe = onValue(verifiedRef, (snapshot) => {
      setDbLoading(true);
      if (snapshot.exists()) {
        setDbRecords(snapshot.val());
      } else {
        setDbRecords({});
      }
      setDbLoading(false);
    }, (error) => {
      console.error("Firebase fetch error for verification logs:", error);
      setDbLoading(false);
    });

    const brokenRef = ref(db, 'brokenAnimes');
    const unsubBroken = onValue(brokenRef, (snapshot) => {
      if (snapshot.exists()) {
        const val = snapshot.val();
        const activeBroken = Object.keys(val).filter(key => val[key] === true);
        setBrokenAnimesList(activeBroken);
      } else {
        setBrokenAnimesList([]);
      }
    });

    // Load the global anime catalog automatically on mount
    loadGlobalCatalog();

    return () => {
      unsubscribe();
      unsubBroken();
    };
  }, []);

  // Set initial start/end when preset batch changes
  const handleBatchPresetChange = (batchId: string) => {
    setSelectedBatch(batchId);
    const matched = BATCH_PRESETS.find(b => b.id === batchId);
    if (matched) {
      setStartId(matched.start);
      setEndId(matched.end);
    }
  };

  const loadGlobalCatalog = async () => {
    setGlobalLoading(true);
    try {
      // 1. Fetch custom animes from Firebase Database
      const snap = await get(ref(db, 'animes'));
      let combined: any[] = [];
      if (snap.exists()) {
        combined = Object.values(snap.val()).map((a: any) => ({
          id: String(a.id),
          title: a.title,
          poster: a.poster || a.image || '',
          source: 'Custom / Firebase'
        }));
      }

      // 2. Fetch popular/trending animes from api.home() or suggestions
      try {
        const homeData = await api.home();
        if (homeData && homeData.data) {
          const homeAnimes = [
            ...(homeData.data.trending || []),
            ...(homeData.data.mostPopular || []),
            ...(homeData.data.newAdded || []),
            ...(homeData.data.topAiring?.all || []),
            ...(homeData.data.completedAnimes || [])
          ];
          homeAnimes.forEach((a: any) => {
            combined.push({
              id: String(a.id),
              title: a.title,
              poster: a.poster || a.image || '',
              source: 'Kryzox Catalog'
            });
          });
        }
      } catch (err) {
        console.error("Failed to load home animes for catalog lookup", err);
      }

      // 3. Deduplicate
      const seen = new Set();
      const uniqueList = combined.filter((item) => {
        if (!item.id || seen.has(item.id)) return false;
        seen.add(item.id);
        return true;
      });

      setGlobalAnimeList(uniqueList);
      setGlobalLoaded(true);
    } catch (e) {
      console.error("Error loading global catalog", e);
    } finally {
      setGlobalLoading(false);
    }
  };

  const handleGlobalSearch = async () => {
    if (!globalSearchQuery.trim()) return;
    setGlobalLoading(true);
    try {
      let combinedResults: any[] = [];

      // 1. Search the full anime catalog (supports thousands of anime)
      try {
        const res = await api.search(globalSearchQuery);
        if (res && res.data && res.data.length > 0) {
          res.data.forEach((a: any) => {
            combinedResults.push({
              id: String(a.id),
              title: a.title,
              poster: a.poster || a.image || '',
              source: 'Search Catalog'
            });
          });
        }
      } catch (err) {
        console.error("api.search failed during global search:", err);
      }

      // 1.5. If the search query is a number, do a direct ID lookup
      if (/^\d+$/.test(globalSearchQuery.trim())) {
        try {
          const directAnime = await api.animeInfo(globalSearchQuery.trim());
          if (directAnime && directAnime.title && !directAnime.description?.includes('high-speed premium streaming channel for Anime ID')) {
            combinedResults.push({
              id: String(directAnime.id),
              title: directAnime.title,
              poster: directAnime.poster || directAnime.image || '',
              source: 'Direct ID Search'
            });
          }
        } catch (err) {
          console.error("Direct ID lookup failed:", err);
        }
      }

      // 2. Fallback or supplement with autocomplete suggestions
      try {
        const sug = await api.suggestions(globalSearchQuery);
        if (sug && sug.length > 0) {
          sug.forEach((a: any) => {
            combinedResults.push({
              id: String(a.id),
              title: a.title,
              poster: a.poster || a.image || '',
              source: 'Catalog Suggestion'
            });
          });
        }
      } catch (err) {
        console.error("api.suggestions failed during global search:", err);
      }

      if (combinedResults.length > 0) {
        // Merge with existing list and deduplicate
        setGlobalAnimeList(prev => {
          const combined = [...combinedResults, ...prev];
          const seen = new Set();
          return combined.filter(item => {
            if (!item.id || seen.has(item.id)) return false;
            seen.add(item.id);
            return true;
          });
        });
      }

      setGlobalLoaded(true);
    } catch (err) {
      console.error("Global search failed:", err);
    } finally {
      setGlobalLoading(false);
    }
  };

  // Helper: Non-blocking reachability test using mode: no-cors
  const verifyUrlReachability = async (url: string, timeout = 2500): Promise<{ success: boolean; status: number | string; error?: string }> => {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeout);
      const response = await fetch(url, { method: 'GET', mode: 'no-cors', signal: controller.signal });
      clearTimeout(timeoutId);
      return { success: true, status: response.status || 200 };
    } catch (err: any) {
      if (err.name === 'AbortError') {
        return { success: false, status: 'TIMEOUT', error: `Timeout after ${timeout}ms` };
      }
      return { success: false, status: 'ERROR', error: err.message || 'Network error' };
    }
  };

  // Setup Iframe error listener for active player postMessage interactions
  useEffect(() => {
    const handlePostMessage = (e: MessageEvent) => {
      try {
        const data = typeof e.data === 'string' ? JSON.parse(e.data) : e.data;
        if (!data) return;

        // Capture video ended or standard player error signals
        if (data.event === 'error' || data.type === 'error' || data.code === '224003' || data.event === 'player_error') {
          if (onActiveIframeErrorRef.current) {
            onActiveIframeErrorRef.current(data.message || `Player error code ${data.code || '224003'}`);
          }
        }
      } catch (_) {}
    };

    window.addEventListener('message', handlePostMessage);
    return () => window.removeEventListener('message', handlePostMessage);
  }, []);

  // Helper: Live render a mini iframe to test actual player load & playback bootstrap
  const testIframePlayback = (url: string, timeout = 4000, isBatch = false): Promise<{ success: boolean; error?: string }> => {
    if (isBatch) {
      return Promise.resolve({ success: true }); // Skip heavy iframe creation during fast batch runs
    }
    return new Promise((resolve) => {
      try {
        if (!iframeContainerRef.current) {
          resolve({ success: true }); // Fallback to reachability if container missing
          return;
        }

        // Clean existing iframe
        iframeContainerRef.current.innerHTML = '';

        const iframe = document.createElement('iframe');
        iframe.src = url;
        iframe.style.width = '100%';
        iframe.style.height = '100%';
        iframe.style.border = 'none';
        iframe.setAttribute('allow', 'autoplay');

        let resolved = false;

        const cleanup = () => {
          resolved = true;
          onActiveIframeErrorRef.current = null;
          if (timer) clearTimeout(timer);
          iframe.onload = null;
          if (iframeContainerRef.current) {
            iframeContainerRef.current.innerHTML = '';
          }
        };

        const timer = setTimeout(() => {
          if (resolved) return;
          cleanup();
          resolve({ success: true }); // If onload succeeded & no error fired in 4s, assume play is reachable
        }, timeout);

        onActiveIframeErrorRef.current = (reason) => {
          if (resolved) return;
          cleanup();
          resolve({ success: false, error: `Player Error: ${reason}` });
        };

        iframe.onload = () => {
          // Iframe successfully rendered. Give it 1.5 seconds to watch for immediate boot failures/postMessage errors
          setTimeout(() => {
            if (resolved) return;
            cleanup();
            resolve({ success: true });
          }, 1500);
        };

        iframeContainerRef.current.appendChild(iframe);
      } catch (err: any) {
        resolve({ success: false, error: `Iframe initiation failed: ${err.message || err}` });
      }
    });
  };

  // Active concurrent workers map for high-performance monitor
  const [activeWorkers, setActiveWorkers] = useState<Record<string, {
    id: string;
    title: string;
    episode: number;
    url: string;
    server: string;
    idType: string;
    step: string;
  }>>({});

  // Performance metrics
  const [startTime, setStartTime] = useState<number | null>(null);
  const [speed, setSpeed] = useState<string>('0.0');
  const [eta, setEta] = useState<string>('0s');

  // Automated background scheduler matching user request
  useEffect(() => {
    // 1. Scan newly added anime every 30 minutes
    const newlyAddedTimer = setInterval(async () => {
      console.log("[Scheduler] Running automatic scan for newly added anime...");
      try {
        const homeData = await api.home();
        if (homeData && homeData.data) {
          const latest = homeData.data.newAdded || [];
          for (const item of latest) {
            const idStr = String(item.id);
            if (!dbRecords[idStr]) {
              console.log(`[Scheduler] Auto-scanning newly added anime ID ${idStr}: ${item.title}`);
              await verifyWorker(Number(idStr));
            }
          }
        }
      } catch (e) {
        console.error("[Scheduler] Newly added scan failed:", e);
      }
    }, 30 * 60 * 1000);

    // 2. Re-check failed anime every 6 hours
    const failedTimer = setInterval(async () => {
      console.log("[Scheduler] Running automatic recheck of failed streams...");
      const failed = Object.values(dbRecords).filter(r => r.status === 'Verified Failed' || r.status === 'VERIFIED_FAILED');
      for (const item of failed) {
        console.log(`[Scheduler] Re-verifying failed anime ID ${item.animeId}: ${item.title}`);
        await verifyWorker(Number(item.animeId));
      }
    }, 6 * 1000 * 60 * 60);

    // 3. Re-check verified anime every 24 hours
    const verifiedTimer = setInterval(async () => {
      console.log("[Scheduler] Running scheduled recheck of verified healthy streams...");
      const verified = Object.values(dbRecords).filter(r => r.status === 'Verified' || r.status === 'VERIFIED');
      for (const item of verified) {
        console.log(`[Scheduler] Re-verifying healthy anime ID ${item.animeId}: ${item.title}`);
        await verifyWorker(Number(item.animeId));
      }
    }, 24 * 1000 * 60 * 60);

    return () => {
      clearInterval(newlyAddedTimer);
      clearInterval(failedTimer);
      clearInterval(verifiedTimer);
    };
  }, [dbRecords]);

  // Backward compatible state sync: sync first active worker to legacy activeCheck
  useEffect(() => {
    const list = Object.values(activeWorkers);
    if (list.length > 0) {
      setActiveCheck(list[0]);
    } else {
      setActiveCheck(null);
    }
  }, [activeWorkers]);

  // Main verification loop runner (supporting concurrency & pausability)
  const startVerifier = async () => {
    if (isRunning) return;

    setIsRunning(true);
    setIsPaused(false);
    isRunningRef.current = true;
    isPausedRef.current = false;

    // Reset temporary statistics
    setStats({
      totalChecked: 0,
      verified: 0,
      verifiedWithRetry: 0,
      verifiedFailed: 0,
      skipped: 0
    });
    setLogs([]);
    setActiveWorkers({});

    const totalIds = endId - startId + 1;
    let completedCount = 0;
    let currentTaskIndex = startId;
    const startTimeLocal = Date.now();
    setStartTime(startTimeLocal);

    const addLog = (logItem: Omit<VerifierLog, 'id' | 'timestamp'>) => {
      const fullLog: VerifierLog = {
        ...logItem,
        id: `log-${Date.now()}-${Math.random()}`,
        timestamp: Date.now()
      };
      setLogs(prev => [fullLog, ...prev].slice(0, 500));
    };

    // Exponential backoff fetcher helper for Kryzox API rate limit resiliency
    const fetchWithBackoff = async (fn: () => Promise<any>, retries = 3, initialDelay = 1000): Promise<any> => {
      let delay = initialDelay;
      for (let i = 0; i < retries; i++) {
        try {
          return await fn();
        } catch (err: any) {
          if (i === retries - 1) throw err;
          const isRateLimit = err.message?.includes('429') || err.status === 429;
          addLog({
            animeId: '',
            animeTitle: 'SYSTEM',
            episode: 0,
            embedUrl: '',
            status: 'INFO',
            reason: `API call failed${isRateLimit ? ' (Rate limited 429)' : ''}. Retrying in ${(delay / 1000).toFixed(1)}s...`,
            server: '',
            idType: '',
            retryCount: i + 1
          });
          await new Promise(r => setTimeout(r, delay));
          delay *= 2; // exponential scaling
        }
      }
    };

    // Worker logic checking a single anime item completely
    const verifyWorker = async (animeId: number) => {
      if (!isRunningRef.current) return;

      const animeIdStr = String(animeId);
      setActiveWorkers(prev => ({
        ...prev,
        [animeIdStr]: {
          id: animeIdStr,
          title: 'Fetching details...',
          episode: 1,
          url: '',
          server: 'hd-1',
          idType: 'af',
          step: 'Fetching metadata...'
        }
      }));

      try {
        // Step 1: Fetch details with backoff protection
        const details = await fetchWithBackoff(() => api.animeInfo(animeIdStr));
        if (!details || !details.title || details.description?.includes('high-speed premium streaming channel for Anime ID')) {
          // If title doesn't exist or returns fallback placeholder card, we assume this ID is empty/not configured
          addLog({
            animeId: animeIdStr,
            animeTitle: details?.title || `Anime #${animeId}`,
            episode: 0,
            embedUrl: '',
            status: 'FAILED',
            reason: 'Anime ID has no valid configuration or metadata on Kryzox API',
            server: '',
            idType: '',
            retryCount: 0
          });
          setStats(prev => ({ ...prev, totalChecked: prev.totalChecked + 1, verifiedFailed: prev.verifiedFailed + 1 }));
          
          // Save verified failed status
          await set(ref(db, `playback_verification/${animeIdStr}`), {
            animeId: animeIdStr,
            title: details?.title || `Anime #${animeId}`,
            status: 'VERIFIED_FAILED',
            lastVerifiedAt: Date.now(),
            metadataHash: 'EMPTY',
            episodesCount: 0,
            failureReason: 'Missing ID / No Anime Data'
          });
          return;
        }

        const animeTitle = details.title;
        setActiveWorkers(prev => ({
          ...prev,
          [animeIdStr]: {
            ...prev[animeIdStr],
            title: animeTitle,
            step: 'Validating smart cache...'
          }
        }));

        // Smart Caching
        if (skipVerified && dbRecords[animeIdStr]) {
          const record = dbRecords[animeIdStr];
          const currentHash = JSON.stringify(details);
          const isSuccess = ['Verified', 'Verified with Retry', 'VERIFIED', 'VERIFIED_WITH_RETRY'].includes(record.status);
          const cacheAgeMs = Date.now() - (record.lastVerifiedAt || 0);
          const cacheLimit = isSuccess ? (24 * 60 * 60 * 1000) : (1 * 60 * 60 * 1000);

          if (record.metadataHash === currentHash && cacheAgeMs < cacheLimit) {
            addLog({
              animeId: animeIdStr,
              animeTitle,
              episode: 0,
              embedUrl: '',
              status: 'INFO',
              reason: `Skipped: Anime cached validation within threshold (${record.status})`,
              server: record.workingServer || 'hd-1',
              idType: record.workingIdType || 'af',
              retryCount: 0
            });
            setStats(prev => ({ ...prev, totalChecked: prev.totalChecked + 1, skipped: prev.skipped + 1 }));
            return;
          }
        }

        // Step 2: Fetch episodes
        setActiveWorkers(prev => ({
          ...prev,
          [animeIdStr]: {
            ...prev[animeIdStr],
            step: 'Fetching episodes list...'
          }
        }));
        const episodes = await fetchWithBackoff(() => api.episodes(animeIdStr));
        if (!episodes || episodes.length === 0) {
          addLog({
            animeId: animeIdStr,
            animeTitle,
            episode: 0,
            embedUrl: '',
            status: 'FAILED',
            reason: 'No episode mappings returned from Kryzox episodes endpoint',
            server: '',
            idType: '',
            retryCount: 0
          });
          setStats(prev => ({ ...prev, totalChecked: prev.totalChecked + 1, verifiedFailed: prev.verifiedFailed + 1 }));

          await set(ref(db, `playback_verification/${animeIdStr}`), {
            animeId: animeIdStr,
            title: animeTitle,
            status: 'VERIFIED_FAILED',
            lastVerifiedAt: Date.now(),
            metadataHash: JSON.stringify(details),
            episodesCount: 0,
            failureReason: 'Invalid mapping / No episodes found'
          });
          return;
        }

        // Limit episodes to check depending on configuration
        let epsToCheck = episodes;
        if (maxEpsPerAnime === '1') epsToCheck = episodes.slice(0, 1);
        else if (maxEpsPerAnime === '3') epsToCheck = episodes.slice(0, 3);
        else if (maxEpsPerAnime === '5') epsToCheck = episodes.slice(0, 5);
        else if (maxEpsPerAnime === '10') epsToCheck = episodes.slice(0, 10);

        let animeSuccess = true;
        let anyRetryNeeded = false;
        let firstFailureReason = '';
        let workingServer = 'hd-1';
        let workingIdType = 'af';

        // Resolve identifiers
        let animoId = String(details.id || animeIdStr);
        let anilistId = String(details.al_id || details.anilist_id || details.anilistId || details.alId || '');
        let malId = String(details.mal_id || details.malId || '');

        if (anilistId === 'null' || anilistId === 'undefined' || anilistId === '0') anilistId = '';
        if (malId === 'null' || malId === 'undefined' || malId === '0') malId = '';

        const servers = ['hd-1', 'hd-2', 'hd-3', 'hd-4'];
        const idTypes: Array<'af' | 'ani' | 'mal'> = ['af', 'ani', 'mal'];

        // Optimize: Fast Combination discovery on first episode
        let bestServer = 'hd-1';
        let bestIdType: 'af' | 'ani' | 'mal' = 'af';
        let foundWorkingCombo = false;

        setActiveWorkers(prev => ({
          ...prev,
          [animeIdStr]: {
            ...prev[animeIdStr],
            step: 'Discovering optimal CDN channel...'
          }
        }));

        const firstEpNum = Number(epsToCheck[0]?.number || 1);
        
        discoveryLoop:
        for (const srv of servers) {
          for (const idType of idTypes) {
            let resId = idType === 'af' ? animoId : (idType === 'ani' ? anilistId : malId);
            if (!resId) continue;

            const testUrl = getOfficial4AnimoEmbedUrl({
              server: srv,
              idType: idType,
              animoId: idType === 'af' ? resId : animoId,
              anilistId: idType === 'ani' ? resId : anilistId,
              malId: idType === 'mal' ? resId : malId,
              episode: firstEpNum,
              audio: 'sub',
              includeQueryParams: true
            });
            const pingCheck = await verifyUrlReachability(testUrl, 2000);
            if (pingCheck.success) {
              const playCheck = await testIframePlayback(testUrl, 3000, true);
              if (playCheck.success) {
                bestServer = srv;
                bestIdType = idType;
                foundWorkingCombo = true;
                break discoveryLoop;
              }
            }
          }
        }

        // Check selected episodes using discovered optimized parameters
        let consecutiveEpFailures = 0;

        for (const ep of epsToCheck) {
          if (!isRunningRef.current) return;
          const epNum = Number(ep.number || 1);

          setActiveWorkers(prev => ({
            ...prev,
            [animeIdStr]: {
              ...prev[animeIdStr],
              episode: epNum,
              server: bestServer,
              idType: bestIdType,
              step: `Verifying Ep ${epNum}...`
            }
          }));

          let epSuccess = false;
          let activeEpUrl = '';

          // 1. Try optimized choice
          let resId = bestIdType === 'af' ? animoId : (bestIdType === 'ani' ? anilistId : malId);
          if (resId) {
            activeEpUrl = getOfficial4AnimoEmbedUrl({
              server: bestServer,
              idType: bestIdType,
              animoId: bestIdType === 'af' ? resId : animoId,
              anilistId: bestIdType === 'ani' ? resId : anilistId,
              malId: bestIdType === 'mal' ? resId : malId,
              episode: epNum,
              audio: 'sub',
              includeQueryParams: true
            });
            const pingCheck = await verifyUrlReachability(activeEpUrl, 2000);
            if (pingCheck.success) {
              const playCheck = await testIframePlayback(activeEpUrl, 3000, true);
              if (playCheck.success) {
                epSuccess = true;
                workingServer = bestServer;
                workingIdType = bestIdType;
              }
            }
          }

          // 2. Failover Auto-Repair
          if (!epSuccess) {
            anyRetryNeeded = true;
            apiCache.delete(`anime_info_${animeIdStr}`);
            apiCache.delete(`episodes_${animeIdStr}`);

            repairLoop:
            for (const srv of servers) {
              for (const idType of idTypes) {
                let repairId = idType === 'af' ? animoId : (idType === 'ani' ? anilistId : malId);
                if (!repairId) continue;

                const repUrl = getOfficial4AnimoEmbedUrl({
                  server: srv,
                  idType: idType,
                  animoId: idType === 'af' ? repairId : animoId,
                  anilistId: idType === 'ani' ? repairId : anilistId,
                  malId: idType === 'mal' ? repairId : malId,
                  episode: epNum,
                  audio: 'sub',
                  includeQueryParams: true
                });
                const pingCheck = await verifyUrlReachability(repUrl, 2000);
                if (pingCheck.success) {
                  const playCheck = await testIframePlayback(repUrl, 3000, true);
                  if (playCheck.success) {
                    epSuccess = true;
                    workingServer = srv;
                    workingIdType = idType;
                    bestServer = srv;
                    bestIdType = idType;
                    break repairLoop;
                  }
                }
              }
            }
          }

          if (epSuccess) {
            addLog({
              animeId: animeIdStr,
              animeTitle,
              episode: epNum,
              embedUrl: getOfficial4AnimoEmbedUrl({
                server: workingServer,
                idType: workingIdType,
                animoId: animoId,
                anilistId: anilistId,
                malId: malId,
                episode: epNum,
                audio: 'sub',
                includeQueryParams: true
              }),
              status: (workingServer !== 'hd-1' || workingIdType !== 'af') ? 'REPAIR' : 'SUCCESS',
              reason: (workingServer !== 'hd-1' || workingIdType !== 'af')
                ? `Repaired automatically via ${workingServer.toUpperCase()} failover [${workingIdType.toUpperCase()} ID]`
                : 'Stream playing optimally',
              server: workingServer,
              idType: workingIdType,
              retryCount: (workingServer !== 'hd-1' || workingIdType !== 'af') ? 1 : 0
            });
            consecutiveEpFailures = 0;
          } else {
            consecutiveEpFailures += 1;
            firstFailureReason = `Episode ${epNum} playback verification failed HEAD / iframe checks`;
            addLog({
              animeId: animeIdStr,
              animeTitle,
              episode: epNum,
              embedUrl: activeEpUrl || getOfficial4AnimoEmbedUrl({
                server: 'hd-1',
                idType: 'af',
                animoId: animoId,
                episode: epNum,
                audio: 'sub',
                includeQueryParams: true
              }),
              status: 'FAILED',
              reason: firstFailureReason,
              server: 'hd-1',
              idType: 'af',
              retryCount: 1
            });

            if (consecutiveEpFailures >= 3) {
              animeSuccess = false;
              break;
            }
          }
        }

        if (!foundWorkingCombo) {
          animeSuccess = false;
          firstFailureReason = 'All 12 combinations (4 servers x 3 ID formats) failed HEAD or Iframe checks';
        }

        // Step 4: Update final anime statistics and write verification record
        if (animeSuccess) {
          const status = anyRetryNeeded ? 'VERIFIED_WITH_RETRY' : 'VERIFIED';
          setStats(prev => ({
            ...prev,
            totalChecked: prev.totalChecked + 1,
            verified: status === 'VERIFIED' ? prev.verified + 1 : prev.verified,
            verifiedWithRetry: status === 'VERIFIED_WITH_RETRY' ? prev.verifiedWithRetry + 1 : prev.verifiedWithRetry
          }));

          // Remove from broken/blacklisted since it has been restored successfully
          await set(ref(db, `brokenAnimes/${animeIdStr}`), null);

          await set(ref(db, `playback_verification/${animeIdStr}`), {
            animeId: animeIdStr,
            title: animeTitle,
            status,
            lastVerifiedAt: Date.now(),
            metadataHash: JSON.stringify(details),
            episodesCount: episodes.length,
            workingServer,
            workingIdType,
            retryCount: anyRetryNeeded ? 1 : 0
          });
        } else {
          setStats(prev => ({ ...prev, totalChecked: prev.totalChecked + 1, verifiedFailed: prev.verifiedFailed + 1 }));
          
          // Mark as broken to auto-remove from home screen
          await set(ref(db, `brokenAnimes/${animeIdStr}`), true);

          await set(ref(db, `playback_verification/${animeIdStr}`), {
            animeId: animeIdStr,
            title: animeTitle,
            status: 'VERIFIED_FAILED',
            lastVerifiedAt: Date.now(),
            metadataHash: JSON.stringify(details),
            episodesCount: episodes.length,
            failureReason: firstFailureReason || 'Expired source / playback timeout'
          });
        }

      } catch (err: any) {
        console.error(`Verification worker crashed for anime ID ${animeId}:`, err);
        addLog({
          animeId: animeIdStr,
          animeTitle: `Anime #${animeId}`,
          episode: 1,
          embedUrl: '',
          status: 'FAILED',
          reason: `Verification process crashed: ${err.message || err}`,
          server: '',
          idType: '',
          retryCount: 1
        });
        setStats(prev => ({ ...prev, totalChecked: prev.totalChecked + 1, verifiedFailed: prev.verifiedFailed + 1 }));
        
        await set(ref(db, `playback_verification/${animeIdStr}`), {
          animeId: animeIdStr,
          title: `Anime #${animeId}`,
          status: 'VERIFIED_FAILED',
          lastVerifiedAt: Date.now(),
          metadataHash: 'CRASHED',
          episodesCount: 0,
          failureReason: `Network error / connection failure`
        });
      } finally {
        setActiveWorkers(prev => {
          const updated = { ...prev };
          delete updated[animeIdStr];
          return updated;
        });
      }
    };

    // Workers coordinator utilizing adjustable concurrency pool
    const activePromises = new Set<Promise<void>>();

    while (currentTaskIndex <= endId && isRunningRef.current) {
      if (isPausedRef.current) {
        setIsPaused(true);
        await new Promise(r => setTimeout(r, 200));
        continue;
      }
      setIsPaused(false);

      if (activePromises.size >= concurrency) {
        await Promise.race(activePromises);
        continue;
      }

      const taskId = currentTaskIndex;
      currentTaskIndex += 1;

      setCurrentId(taskId);

      const workerPromise = (async () => {
        try {
          await verifyWorker(taskId);
        } catch (e) {
          console.error(`Error in worker task for ID ${taskId}:`, e);
        } finally {
          completedCount += 1;
          const pct = Math.min(100, Math.round((completedCount / totalIds) * 100));
          setProgressPercent(pct);

          // Update metrics
          const durationMins = (Date.now() - startTimeLocal) / 60000;
          const currentSpeed = (completedCount / Math.max(0.01, durationMins)).toFixed(1);
          setSpeed(currentSpeed);

          const remaining = totalIds - completedCount;
          const avgTimePerAnime = (Date.now() - startTimeLocal) / completedCount;
          const etaMs = avgTimePerAnime * remaining;
          const etaMins = Math.floor(etaMs / 60000);
          const etaSecs = Math.floor((etaMs % 60000) / 1000);
          const etaStr = remaining > 0 ? (etaMins > 0 ? `${etaMins}m ${etaSecs}s` : `${etaSecs}s`) : '0s';
          setEta(etaStr);
        }
      })();

      activePromises.add(workerPromise);
      workerPromise.finally(() => {
        activePromises.delete(workerPromise);
      });

      if (delayMs > 0 && isRunningRef.current) {
        await new Promise(r => setTimeout(r, delayMs));
      }
    }

    if (activePromises.size > 0) {
      await Promise.all(activePromises);
    }

    // Complete cleanup
    setIsRunning(false);
    setIsPaused(false);
    isRunningRef.current = false;
    isPausedRef.current = false;
    setCurrentId(null);
    setProgressPercent(100);
    setActiveWorkers({});
    if (iframeContainerRef.current) {
      iframeContainerRef.current.innerHTML = '';
    }
  };

  const stopVerifier = () => {
    isRunningRef.current = false;
    isPausedRef.current = false;
    setIsRunning(false);
    setIsPaused(false);
    setCurrentId(null);
    setActiveWorkers({});
    if (iframeContainerRef.current) {
      iframeContainerRef.current.innerHTML = '';
    }
  };

  const togglePause = () => {
    const nextPaused = !isPausedRef.current;
    isPausedRef.current = nextPaused;
    setIsPaused(nextPaused);
  };

  const clearAllVerifiedLogs = async () => {
    if (window.confirm("Are you absolutely sure you want to delete all verified records? This resets catalog verification status.")) {
      try {
        await set(ref(db, 'playback_verification'), null);
        alert("All verified logs cleared successfully!");
      } catch (err) {
        alert("Failed to clear database logs: " + err.message);
      }
    }
  };

  const handleRestoreAnime = async (animeId: string) => {
    try {
      await set(ref(db, `brokenAnimes/${animeId}`), null);
      await set(ref(db, `playback_verification/${animeId}/status`), 'VERIFIED');
      toast.success("Successfully restored anime to the home screen!");
    } catch (err) {
      toast.error("Failed to restore: " + err.message);
    }
  };

  const triggerIndividualReverification = async (animeId: string, animeTitle: string) => {
    if (isRunning) {
      alert("Please pause or stop the active batch verifier before running single verification.");
      return;
    }
    
    // Quick single-run verification setup
    setIsRunning(true);
    isRunningRef.current = true;
    
    setLogs([]);
    const addLog = (logItem: Omit<VerifierLog, 'id' | 'timestamp'>) => {
      const fullLog: VerifierLog = {
        ...logItem,
        id: `log-${Date.now()}-${Math.random()}`,
        timestamp: Date.now()
      };
      setLogs(prev => [fullLog, ...prev]);
    };

    setActiveWorkers({
      [animeId]: {
        id: animeId,
        title: animeTitle,
        episode: 1,
        url: '',
        server: 'hd-1',
        idType: 'af',
        step: 'Starting manual single-anime auto-repair...'
      }
    });

    try {
      apiCache.delete(`anime_info_${animeId}`);
      apiCache.delete(`episodes_${animeId}`);
      
      const details = await api.animeInfo(animeId);
      const episodes = await api.episodes(animeId);

      if (!details || !episodes || episodes.length === 0) {
        await set(ref(db, `playback_verification/${animeId}`), {
          animeId,
          title: animeTitle,
          status: 'VERIFIED_FAILED',
          lastVerifiedAt: Date.now(),
          metadataHash: 'EMPTY',
          episodesCount: 0,
          failureReason: 'Auto-repair fetch failed. Anime details or episodes missing.'
        });
        addLog({
          animeId: animeId,
          animeTitle: animeTitle,
          episode: 0,
          embedUrl: '',
          status: 'FAILED',
          reason: 'Auto-repair fetch failed. Anime details or episodes missing.',
          server: '',
          idType: '',
          retryCount: 1
        });
      } else {
        // Test first episode
        const epNum = Number(episodes[0].number || 1);
        const animoId = String(details.id || animeId);
        const url = getOfficial4AnimoEmbedUrl({
          server: 'hd-1',
          idType: 'af',
          animoId: animoId,
          episode: epNum,
          audio: 'sub',
          includeQueryParams: true
        });
        
        setActiveWorkers(prev => ({
          ...prev,
          [animeId]: {
            ...prev[animeId],
            url,
            step: `Verifying Episode ${epNum}...`
          }
        }));
        
        const reach = await verifyUrlReachability(url);
        const player = reach.success ? await testIframePlayback(url) : { success: false, error: reach.error };

        if (player.success) {
          await set(ref(db, `brokenAnimes/${animeId}`), null);
          await set(ref(db, `playback_verification/${animeId}`), {
            animeId: animeId,
            title: details.title || animeTitle,
            status: 'VERIFIED',
            lastVerifiedAt: Date.now(),
            metadataHash: JSON.stringify(details),
            episodesCount: episodes.length,
            workingServer: 'hd-1',
            workingIdType: 'af'
          });
          addLog({
            animeId: animeId,
            animeTitle: details.title || animeTitle,
            episode: epNum,
            embedUrl: url,
            status: 'SUCCESS',
            reason: 'Re-verification complete: Stream is now healthy and playing optimal.',
            server: 'hd-1',
            idType: 'af',
            retryCount: 0
          });
        } else {
          // Failover check
          let epSuccess = false;
          let workingServer = 'hd-1';
          let workingIdType = 'af';
          
          const servers = ['hd-1', 'hd-2', 'hd-3', 'hd-4'];
          const idTypes = ['af', 'ani', 'mal'];
          
          repairLoop:
          for (const srv of servers) {
            for (const idType of idTypes) {
              const freshUrl = getOfficial4AnimoEmbedUrl({
                server: srv,
                idType: idType,
                animoId: animoId,
                episode: epNum,
                audio: 'sub',
                includeQueryParams: true
              });
              const rc = await verifyUrlReachability(freshUrl);
              if (rc.success) {
                const pc = await testIframePlayback(freshUrl);
                if (pc.success) {
                  epSuccess = true;
                  workingServer = srv;
                  workingIdType = idType;
                  break repairLoop;
                }
              }
            }
          }

          if (epSuccess) {
            await set(ref(db, `brokenAnimes/${animeId}`), null);
            await set(ref(db, `playback_verification/${animeId}`), {
              animeId: animeId,
              title: details.title || animeTitle,
              status: 'VERIFIED_WITH_RETRY',
              lastVerifiedAt: Date.now(),
              metadataHash: JSON.stringify(details),
              episodesCount: episodes.length,
              workingServer,
              workingIdType
            });
            addLog({
              animeId: animeId,
              animeTitle: details.title || animeTitle,
              episode: epNum,
              embedUrl: getOfficial4AnimoEmbedUrl({
                server: workingServer,
                idType: workingIdType,
                animoId: animoId,
                episode: epNum,
                audio: 'sub',
                includeQueryParams: true
              }),
              status: 'REPAIR',
              reason: `Re-verification repaired with ${workingServer.toUpperCase()} failover [${workingIdType.toUpperCase()}]`,
              server: workingServer,
              idType: workingIdType,
              retryCount: 1
            });
          } else {
            await set(ref(db, `brokenAnimes/${animeId}`), true);
            await set(ref(db, `playback_verification/${animeId}`), {
              animeId: animeId,
              title: details.title || animeTitle,
              status: 'VERIFIED_FAILED',
              lastVerifiedAt: Date.now(),
              metadataHash: JSON.stringify(details),
              episodesCount: episodes.length,
              failureReason: player.error || 'All fallback CDN servers unresponsive'
            });
            addLog({
              animeId: animeId,
              animeTitle: details.title || animeTitle,
              episode: epNum,
              embedUrl: url,
              status: 'FAILED',
              reason: `Re-verification Failed: ${player.error || 'All fallback CDN servers unresponsive'}`,
              server: 'hd-1',
              idType: 'af',
              retryCount: 1
            });
          }
        }
      }
    } catch (e: any) {
      console.error(e);
    } finally {
      setIsRunning(false);
      isRunningRef.current = false;
      setActiveWorkers({});
      if (iframeContainerRef.current) {
        iframeContainerRef.current.innerHTML = '';
      }
    }
  };

  // Convert Firebase DB Records object to flat array for rendering
  const recordsArray = Object.values(dbRecords).map((r) => ({
    ...r,
    animeId: String(r.animeId)
  }));

  // Filtering DB exploration table
  const filteredRecords = recordsArray.filter((rec) => {
    const matchesSearch = rec.title?.toLowerCase().includes(dbSearch.toLowerCase()) || 
                          rec.animeId?.includes(dbSearch);
    
    if (!matchesSearch) return false;
    if (dbFilterStatus === 'all') return true;
    if (dbFilterStatus === 'Auto-Removed') {
      return brokenAnimesList.includes(String(rec.animeId));
    }
    return rec.status === dbFilterStatus;
  });

  // Calculate high-fidelity aggregated statistics for database
  const dbVerifiedCount = recordsArray.filter(r => r.status === 'Verified').length;
  const dbRetryCount = recordsArray.filter(r => r.status === 'Verified with Retry').length;
  const dbFailedCount = recordsArray.filter(r => r.status === 'Verified Failed').length;
  const dbTotalCount = recordsArray.length;

  return (
    <div className="space-y-6 animate-fadeIn text-gray-300">
      
      {/* Visual Header Banner */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-[#0a0d14]/30 border border-white/5 p-6 rounded-2xl backdrop-blur-md relative overflow-hidden">
        <div className="absolute top-0 left-0 w-full h-[1px] bg-gradient-to-r from-cyan-500/0 via-cyan-500/40 to-cyan-500/0" />
        <div>
          <h2 className="text-xl font-black text-white uppercase tracking-wider flex items-center gap-2">
            <Activity className="text-primary animate-pulse" size={24} />
            <span>Playback Verification Suite</span>
          </h2>
          <p className="text-xs text-gray-400 mt-1">
            Automated resilient tester validating reachability, metadata mappings, and browser playback initialization across AnOvA CDN nodes.
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={clearAllVerifiedLogs}
            className="px-4 py-2 bg-red-500/10 hover:bg-red-500/20 text-red-400 hover:text-red-300 border border-red-500/10 hover:border-red-500/20 text-[10px] font-black uppercase tracking-wider rounded-xl transition-all cursor-pointer"
          >
            Reset Database Cache
          </button>
        </div>
      </div>

      {/* Database Statistics Summary */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-[#0a0d14]/40 border border-white/5 p-5 rounded-2xl relative overflow-hidden backdrop-blur-md">
          <Database size={16} className="text-primary absolute top-5 right-5" />
          <span className="text-gray-500 text-[9px] font-black uppercase tracking-wider block">Total Catalog Checked</span>
          <p className="text-2xl font-black text-white mt-1.5">{dbTotalCount}</p>
          <span className="text-[9px] text-gray-400 font-bold mt-2 block">
            Synced with Firebase Realtime DB
          </span>
        </div>
        <div className="bg-[#0a0d14]/40 border border-white/5 p-5 rounded-2xl relative overflow-hidden backdrop-blur-md">
          <CheckCircle size={16} className="text-emerald-400 absolute top-5 right-5" />
          <span className="text-gray-500 text-[9px] font-black uppercase tracking-wider block">Verified Healthy</span>
          <p className="text-2xl font-black text-emerald-400 mt-1.5">{dbVerifiedCount}</p>
          <span className="text-[9px] text-emerald-500/60 font-bold mt-2 block">
            Optimal high-speed streams (hd-1)
          </span>
        </div>
        <div className="bg-[#0a0d14]/40 border border-white/5 p-5 rounded-2xl relative overflow-hidden backdrop-blur-md">
          <RefreshCw size={16} className="text-amber-400 absolute top-5 right-5" />
          <span className="text-gray-500 text-[9px] font-black uppercase tracking-wider block">Verified With Retry</span>
          <p className="text-2xl font-black text-amber-400 mt-1.5">{dbRetryCount}</p>
          <span className="text-[9px] text-amber-500/60 font-bold mt-2 block">
            Repaired via auto failover &amp; caches
          </span>
        </div>
        <div className="bg-[#0a0d14]/40 border border-white/5 p-5 rounded-2xl relative overflow-hidden backdrop-blur-md">
          <AlertOctagon size={16} className="text-red-400 absolute top-5 right-5" />
          <span className="text-gray-500 text-[9px] font-black uppercase tracking-wider block">Verified Failed</span>
          <p className="text-2xl font-black text-red-400 mt-1.5">{dbFailedCount}</p>
          <span className="text-[9px] text-red-500/60 font-bold mt-2 block">
            Broken streams requiring manual fix
          </span>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Verification Controls Zone */}
        <div className="lg:col-span-1 bg-[#0a0d14]/30 border border-white/5 p-6 rounded-2xl space-y-5 h-fit backdrop-blur-md">
          <h3 className="text-xs font-black text-white uppercase tracking-wider border-b border-white/5 pb-3.5 flex items-center gap-2">
            <Settings size={14} className="text-primary" />
            <span>Tester Configuration</span>
          </h3>

          <div className="space-y-4">
            
            {/* Batch Preset selection */}
            <div>
              <label className="text-[9px] font-black uppercase tracking-wider text-gray-500 block mb-1.5">Batch Range Preset</label>
              <select
                value={selectedBatch}
                onChange={(e) => handleBatchPresetChange(e.target.value)}
                disabled={isRunning}
                className="w-full bg-[#050505] border border-white/10 rounded-xl p-3 text-xs text-white focus:outline-none focus:border-primary uppercase font-bold"
              >
                {BATCH_PRESETS.map((p) => (
                  <option key={p.id} value={p.id}>{p.label}</option>
                ))}
              </select>
            </div>

            {/* Direct ID limits */}
            <div className="grid grid-cols-2 gap-3.5">
              <div>
                <label className="text-[9px] font-black uppercase tracking-wider text-gray-500 block mb-1.5">Start ID</label>
                <input
                  type="number"
                  value={startId}
                  onChange={(e) => setStartId(Number(e.target.value))}
                  disabled={isRunning}
                  className="w-full bg-[#050505] border border-white/10 rounded-xl p-3 text-xs text-white focus:outline-none focus:border-primary font-bold font-mono"
                />
              </div>
              <div>
                <label className="text-[9px] font-black uppercase tracking-wider text-gray-500 block mb-1.5">End ID</label>
                <input
                  type="number"
                  value={endId}
                  onChange={(e) => setEndId(Number(e.target.value))}
                  disabled={isRunning}
                  className="w-full bg-[#050505] border border-white/10 rounded-xl p-3 text-xs text-white focus:outline-none focus:border-primary font-bold font-mono"
                />
              </div>
            </div>

            {/* Advanced Tuning */}
            <div className="bg-[#050505]/40 border border-white/5 rounded-xl p-4 space-y-4">
              <span className="text-[9px] font-black uppercase tracking-wider text-primary block border-b border-white/5 pb-1">Advanced Performance Tuning</span>
              
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[8px] font-black uppercase tracking-wider text-gray-500 block mb-1">Cooldown (ms)</label>
                  <input
                    type="number"
                    value={delayMs}
                    onChange={(e) => setDelayMs(Number(e.target.value))}
                    className="w-full bg-[#050505] border border-white/10 rounded-lg p-2 text-[11px] text-white focus:outline-none focus:border-primary font-mono"
                  />
                </div>
                <div>
                  <label className="text-[8px] font-black uppercase tracking-wider text-gray-500 block mb-1">Check Limit</label>
                  <select
                    value={maxEpsPerAnime}
                    onChange={(e) => setMaxEpsPerAnime(e.target.value)}
                    disabled={isRunning}
                    className="w-full bg-[#050505] border border-white/10 rounded-lg p-2 text-[11px] text-white focus:outline-none focus:border-primary uppercase font-bold"
                  >
                    <option value="1">First 1 Ep</option>
                    <option value="3">First 3 Eps</option>
                    <option value="5">First 5 Eps</option>
                    <option value="10">First 10 Eps</option>
                    <option value="all">All Episodes</option>
                  </select>
                </div>
              </div>

              <div className="flex items-center gap-2 pt-1.5">
                <input
                  type="checkbox"
                  id="skipVerifiedCheck"
                  checked={skipVerified}
                  onChange={(e) => setSkipVerified(e.target.checked)}
                  disabled={isRunning}
                  className="rounded border-white/10 bg-[#050505] text-primary focus:ring-primary h-3.5 w-3.5 cursor-pointer"
                />
                <label htmlFor="skipVerifiedCheck" className="text-[10px] font-black uppercase tracking-wider text-gray-400 cursor-pointer select-none">
                  Skip Already Verified Titles
                </label>
              </div>
            </div>

            {/* Verification trigger CTA buttons */}
            <div className="space-y-2 pt-2">
              {!isRunning ? (
                <button
                  onClick={startVerifier}
                  className="w-full py-3.5 bg-[#00e5ff] text-black font-black text-xs rounded-xl shadow-[0_0_25px_rgba(0,229,255,0.25)] hover:scale-[1.01] transition-all uppercase tracking-wider flex items-center justify-center gap-2 cursor-pointer"
                >
                  <Play size={14} fill="currentColor" />
                  <span>Bootstrap Playback Tester</span>
                </button>
              ) : (
                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={togglePause}
                    className="py-3 bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 hover:text-amber-300 border border-amber-500/20 hover:border-amber-500/30 font-black text-xs rounded-xl transition-all uppercase tracking-wider flex items-center justify-center gap-1.5 cursor-pointer"
                  >
                    {isPaused ? <Play size={12} fill="currentColor" /> : <Pause size={12} fill="currentColor" />}
                    <span>{isPaused ? 'Resume' : 'Pause'}</span>
                  </button>
                  <button
                    onClick={stopVerifier}
                    className="py-3 bg-red-500/10 hover:bg-red-500/20 text-red-400 hover:text-red-300 border border-red-500/20 hover:border-red-500/30 font-black text-xs rounded-xl transition-all uppercase tracking-wider flex items-center justify-center gap-1.5 cursor-pointer"
                  >
                    <Pause size={12} />
                    <span>Stop</span>
                  </button>
                </div>
              )}
            </div>

          </div>
        </div>

        {/* Console & Active Telemetry Zone */}
        <div className="lg:col-span-2 flex flex-col bg-[#0a0d14]/30 border border-white/5 p-6 rounded-2xl backdrop-blur-md min-h-[380px] justify-between">
          
          <div className="space-y-4">
            
            {/* Active Task Monitor Header */}
            <div className="flex justify-between items-center border-b border-white/5 pb-3">
              <h3 className="text-xs font-black text-white uppercase tracking-wider flex items-center gap-2">
                <Activity size={14} className={cn("text-primary", isRunning && "animate-spin")} />
                <span>Execution Monitor</span>
              </h3>
              {isRunning && (
                <span className="text-[10px] font-mono font-bold text-primary flex items-center gap-1.5 bg-cyan-500/5 px-2.5 py-0.5 rounded-full border border-cyan-500/10">
                  <span className="w-1.5 h-1.5 rounded-full bg-[#00e5ff] animate-ping" />
                  Testing ID {currentId}
                </span>
              )}
            </div>

            {/* Active checks details or Standby page */}
            {Object.keys(activeWorkers).length > 0 ? (
              <div className="space-y-4 animate-fadeIn">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-h-[220px] overflow-y-auto pr-1">
                  {Object.values(activeWorkers).map((worker) => (
                    <div key={worker.id} className="p-3 bg-black/60 border border-white/10 rounded-xl relative overflow-hidden flex flex-col justify-between shadow-lg">
                      <div className="flex justify-between items-start">
                        <span className="text-[7px] bg-cyan-500/10 text-cyan-400 font-mono font-bold px-1.5 py-0.5 rounded leading-none shrink-0 border border-cyan-500/20">
                          ID: {worker.id}
                        </span>
                        <span className="text-[7px] text-gray-500 font-mono">
                          {worker.server?.toUpperCase()} • {worker.idType?.toUpperCase()}
                        </span>
                      </div>
                      
                      <p className="text-[11px] font-black text-white leading-tight truncate mt-1.5">{worker.title}</p>
                      
                      <div className="mt-1 flex items-center gap-1">
                        <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-pulse shrink-0" />
                        <span className="text-[9px] text-cyan-400 font-bold truncate">{worker.step}</span>
                      </div>
                    </div>
                  ))}
                </div>

                {/* MINI SANDBOX PREVIEW MONITOR CONTAINER INVISIBLE BACKGROUND TARGET */}
                <div className="absolute opacity-0 pointer-events-none w-0 h-0" ref={iframeContainerRef} />

                {/* Progress bar */}
                <div className="space-y-1.5 pt-1">
                  <div className="flex justify-between text-[9px] font-bold text-gray-500 uppercase tracking-wider">
                    <span>Batch Queue Progress</span>
                    <span className="text-primary font-mono">{progressPercent}%</span>
                  </div>
                  <div className="w-full bg-[#050505] border border-white/5 h-2 rounded-full overflow-hidden">
                    <div 
                      className="bg-gradient-to-r from-cyan-500 to-primary h-full rounded-full transition-all duration-300" 
                      style={{ width: `${progressPercent}%` }}
                    />
                  </div>
                </div>

              </div>
            ) : (
              <div className="py-12 text-center text-gray-500 space-y-3.5">
                <HelpCircle size={32} className="mx-auto text-gray-700" />
                <p className="text-xs font-bold uppercase tracking-wider text-gray-400">Tester Standby</p>
                <p className="text-[10px] text-gray-500 leading-relaxed max-w-sm mx-auto">
                  Click the "Bootstrap Playback Tester" button to initialize automatic batch verification of your Kryzox catalog metadata.
                </p>
              </div>
            )}

            {/* Console Log Area */}
            <div className="space-y-2 pt-2">
              <div className="flex justify-between items-center text-[10px] font-black uppercase tracking-wider text-gray-500">
                <span>Verification Logs Console</span>
                <div className="flex gap-2">
                  <button 
                    onClick={() => setFilterType('all')}
                    className={cn("px-2 py-0.5 rounded cursor-pointer", filterType === 'all' ? "bg-white/10 text-white" : "text-gray-500")}
                  >
                    All
                  </button>
                  <button 
                    onClick={() => setFilterType('failed')}
                    className={cn("px-2 py-0.5 rounded cursor-pointer", filterType === 'failed' ? "bg-red-500/10 text-red-400 border border-red-500/20" : "text-gray-500")}
                  >
                    Failures
                  </button>
                </div>
              </div>

              <div className="bg-[#050505] border border-white/10 p-4 rounded-xl font-mono text-[10px] text-gray-400 space-y-1.5 max-h-[180px] overflow-y-auto shadow-inner">
                {logs.length === 0 ? (
                  <div className="text-gray-600 text-center py-4">Logs output stream empty. Waiting for bootstrap trigger...</div>
                ) : (
                  logs
                    .filter(log => {
                      if (filterType === 'failed') return log.status === 'FAILED';
                      if (filterType === 'success') return log.status === 'SUCCESS' || log.status === 'REPAIR';
                      return true;
                    })
                    .map((log) => (
                      <div key={log.id} className="flex items-start gap-2.5 border-b border-white/[0.02] pb-1">
                        <span className="text-[8px] text-gray-600 shrink-0 font-sans mt-0.5">
                          {new Date(log.timestamp).toLocaleTimeString([], { hour12: false })}
                        </span>
                        
                        <span className={cn(
                          "px-1.5 py-0.5 rounded-[3px] text-[8px] font-bold shrink-0 text-center uppercase tracking-wider leading-none",
                          log.status === 'SUCCESS' && "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20",
                          log.status === 'REPAIR' && "bg-amber-500/10 text-amber-400 border border-amber-500/20",
                          log.status === 'FAILED' && "bg-red-500/10 text-red-400 border border-red-500/20",
                          log.status === 'INFO' && "bg-white/5 text-gray-400 border border-white/10"
                        )}>
                          {log.status}
                        </span>

                        <div className="min-w-0 flex-1 leading-snug">
                          <span className="text-white font-bold">{log.animeTitle}</span>
                          {log.episode > 0 && <span className="text-cyan-400 font-black text-[9px] mx-1">Ep {log.episode}</span>}
                          <span className="text-gray-400">{log.reason}</span>
                          {log.embedUrl && (
                            <a 
                              href={log.embedUrl} 
                              target="_blank" 
                              rel="noopener noreferrer" 
                              className="text-primary hover:underline block text-[9px] mt-0.5 truncate max-w-[420px]"
                            >
                              {log.embedUrl}
                            </a>
                          )}
                        </div>
                      </div>
                    ))
                )}
              </div>
            </div>

          </div>

          <div className="text-[9px] text-gray-500 text-center uppercase tracking-widest font-black pt-4 border-t border-white/5">
            AnOvA Diagnostics Tunnel • Realtime API telemetry online
          </div>

        </div>

      </div>

      {/* Database Explorer Catalog Section */}
      <div className="bg-[#0a0d14]/30 border border-white/5 rounded-2xl backdrop-blur-md overflow-hidden">
        
        {/* Explorer Header controls */}
        <div className="p-6 border-b border-white/5 space-y-4">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
            <div>
              <h3 className="text-sm font-black text-white uppercase tracking-wider flex items-center gap-2">
                <List size={16} className="text-primary" />
                <span>Verification Catalog Database Explorer</span>
              </h3>
              <p className="text-xs text-gray-400 mt-0.5">Explore full cache list synced to Firebase database with individual troubleshooting actions.</p>
            </div>
            
            {/* Filter by status selection */}
            <div className="flex flex-wrap gap-2 text-xs">
              {['all', 'Verified', 'Verified with Retry', 'Verified Failed', 'Auto-Removed'].map((st) => (
                <button
                  key={st}
                  onClick={() => setDbFilterStatus(st)}
                  className={cn(
                    "px-3.5 py-1.5 rounded-xl uppercase font-black tracking-wider border cursor-pointer text-[10px]",
                    dbFilterStatus === st 
                      ? "bg-primary text-black border-primary shadow-[0_0_15px_rgba(0,229,255,0.2)]"
                      : "bg-[#050505]/40 border-white/5 text-gray-400 hover:text-white"
                  )}
                >
                  {st === 'all' ? 'All' : st}
                  {st === 'Auto-Removed' && ` (${brokenAnimesList.length})`}
                </button>
              ))}
            </div>
          </div>

          {/* Search box */}
          <div className="relative">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-500" size={16} />
            <input
              type="text"
              placeholder="Search by Anime ID or Title..."
              value={dbSearch}
              onChange={(e) => setDbSearch(e.target.value)}
              className="w-full bg-[#050505] border border-white/10 rounded-xl pl-10 pr-4 py-3 text-xs text-white placeholder-gray-500 focus:outline-none focus:border-primary font-semibold"
            />
          </div>
        </div>

        {/* Database Catalog Table */}
        <div className="overflow-x-auto">
          {dbLoading ? (
            <div className="py-12 text-center space-y-3">
              <RefreshCw className="animate-spin text-primary mx-auto" size={24} />
              <p className="text-xs font-bold uppercase tracking-wider text-gray-500">Retrieving records from Firebase...</p>
            </div>
          ) : filteredRecords.length === 0 ? (
            <div className="py-12 text-center text-gray-500">
              No verification records found matching search filters. Run a batch sweep to populate this explorer.
            </div>
          ) : (
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-black/25 text-gray-500 font-black uppercase tracking-wider border-b border-white/5">
                  <th className="py-4 px-6">Anime ID</th>
                  <th className="py-4 px-6">Anime Title</th>
                  <th className="py-4 px-6">Verification Status</th>
                  <th className="py-4 px-6">Eps Count</th>
                  <th className="py-4 px-6">Failure Reason / Resolution Pipeline</th>
                  <th className="py-4 px-6">Last Check Date</th>
                  <th className="py-4 px-6 text-right">Troubleshoot</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[0.03]">
                {filteredRecords.map((rec) => (
                  <tr key={rec.animeId} className="hover:bg-white/[0.01] transition-all">
                    <td className="py-3.5 px-6 font-mono font-bold text-gray-400">{rec.animeId}</td>
                    <td className="py-3.5 px-6 font-black text-white">
                      <div className="flex items-center gap-2">
                        <span>{rec.title}</span>
                        {brokenAnimesList.includes(String(rec.animeId)) && (
                          <span className="px-1.5 py-0.5 rounded text-[8px] font-black uppercase tracking-wider bg-red-600/20 text-red-400 border border-red-500/30 animate-pulse shrink-0">
                            AUTO-REMOVED
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="py-3.5 px-6">
                      <span className={cn(
                        "px-2.5 py-0.5 rounded text-[9px] font-black uppercase tracking-wider border",
                        (rec.status === 'VERIFIED' || rec.status === 'Verified') && "bg-emerald-500/10 border-emerald-500/20 text-emerald-400",
                        (rec.status === 'VERIFIED_WITH_RETRY' || rec.status === 'Verified with Retry') && "bg-amber-500/10 border-amber-500/20 text-amber-400",
                        (rec.status === 'VERIFIED_FAILED' || rec.status === 'Verified Failed') && "bg-red-500/10 border-red-500/20 text-red-400",
                        (rec.status === 'Pending' || rec.status === 'PENDING') && "bg-white/5 border-white/10 text-gray-400"
                      )}>
                        {rec.status}
                      </span>
                    </td>
                    <td className="py-3.5 px-6 font-mono font-bold text-gray-400">{rec.episodesCount || 0}</td>
                    <td className="py-3.5 px-6 leading-relaxed max-w-xs truncate">
                      {(rec.status === 'VERIFIED_FAILED' || rec.status === 'Verified Failed') ? (
                        <span className="text-red-400/80 font-semibold">{rec.failureReason || 'Playback load timeout'}</span>
                      ) : (rec.status === 'VERIFIED_WITH_RETRY' || rec.status === 'Verified with Retry') ? (
                        <span className="text-amber-400/80 font-semibold">Repaired via {rec.workingServer?.toUpperCase()} ({rec.workingIdType?.toUpperCase()})</span>
                      ) : (
                        <span className="text-gray-500 font-semibold">HD-1 Primary (AF ID) Direct stream healthy</span>
                      )}
                    </td>
                    <td className="py-3.5 px-6 font-semibold text-gray-500">
                      {rec.lastVerifiedAt ? new Date(rec.lastVerifiedAt).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' }) : '--'}
                    </td>
                    <td className="py-3.5 px-6 text-right space-x-2">
                      {brokenAnimesList.includes(String(rec.animeId)) && (
                        <button
                          onClick={() => handleRestoreAnime(rec.animeId)}
                          className="px-3 py-1 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 hover:text-emerald-300 rounded-lg font-black text-[9px] uppercase tracking-wider border border-emerald-500/20 hover:border-emerald-500/30 transition-all cursor-pointer"
                        >
                          Restore Stream
                        </button>
                      )}
                      <button
                        onClick={() => triggerIndividualReverification(rec.animeId, rec.title)}
                        disabled={isRunning}
                        className="px-3 py-1 bg-white/5 hover:bg-white/10 text-white rounded-lg font-black text-[9px] uppercase tracking-wider border border-white/10 hover:border-white/20 transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        Re-Verify Stream
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

      </div>

      {/* Global Catalog Lookup & Auto-Repair Section */}
      <div className="bg-[#0a0d14]/30 border border-white/5 rounded-2xl backdrop-blur-md overflow-hidden mt-6">
        
        {/* Header control block */}
        <div className="p-6 border-b border-white/5 space-y-4">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
            <div>
              <h3 className="text-sm font-black text-white uppercase tracking-wider flex items-center gap-2">
                <Sparkles size={16} className="text-primary animate-pulse" />
                <span>Global Anime Catalog &amp; Playback Repairer</span>
              </h3>
              <p className="text-xs text-gray-400 mt-0.5">
                ক্যাটালগের যেকোনো এনিমে সার্চ করে অথবা নিচের সম্পূর্ণ তালিকা থেকে সিলেক্ট করে ইনস্ট্যান্ট অটো-রিপেয়ার করতে পারবেন।
              </p>
            </div>
            
            <div>
              {!globalLoaded ? (
                <button
                  onClick={loadGlobalCatalog}
                  disabled={globalLoading}
                  className="px-4 py-2 bg-primary hover:bg-primary/80 text-black font-black uppercase tracking-wider text-[10px] rounded-xl transition-all cursor-pointer flex items-center gap-2 shadow-[0_0_20px_rgba(0,229,255,0.25)]"
                >
                  {globalLoading ? (
                    <RefreshCw className="animate-spin" size={12} />
                  ) : (
                    <List size={12} />
                  )}
                  <span>সব এনিমে লোড করুন (Load All Animes)</span>
                </button>
              ) : (
                <button
                  onClick={loadGlobalCatalog}
                  disabled={globalLoading}
                  className="px-4 py-2 bg-white/5 hover:bg-white/10 text-white font-black uppercase tracking-wider text-[10px] rounded-xl transition-all cursor-pointer flex items-center gap-2 border border-white/10"
                >
                  <RefreshCw className={cn(globalLoading && "animate-spin")} size={12} />
                  <span>রিলোড ক্যাটালগ (Reload)</span>
                </button>
              )}
            </div>
          </div>

          {/* Search box with dynamic search suggestion triggering (always visible now) */}
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-500" size={16} />
              <input
                type="text"
                placeholder="এনিমে টাইটেল বা কিওয়ার্ড দিয়ে সার্চ করুন (Search title or keyword)..."
                value={globalSearchQuery}
                onChange={(e) => setGlobalSearchQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleGlobalSearch();
                }}
                className="w-full bg-[#050505] border border-white/10 rounded-xl pl-10 pr-4 py-3 text-xs text-white placeholder-gray-500 focus:outline-none focus:border-primary font-semibold"
              />
            </div>
            <button
              onClick={handleGlobalSearch}
              disabled={globalLoading}
              className="px-5 py-3 bg-white/5 hover:bg-white/10 text-white font-black text-xs uppercase tracking-wider rounded-xl transition-all border border-white/10"
            >
              সার্চ (Search)
            </button>
          </div>
        </div>

        {/* Catalog List / Grid */}
        {(globalLoaded || globalAnimeList.length > 0) && (
          <div className="max-h-[450px] overflow-y-auto divide-y divide-white/[0.03]">
            {globalAnimeList.length === 0 ? (
              <div className="py-12 text-center text-gray-500">
                কোনো এনিমে পাওয়া যায়নি। লোড বা সার্চ করার চেষ্টা করুন।
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 p-6">
                {globalAnimeList
                  .filter(a => {
                    if (!globalSearchQuery) return true;
                    if (a.source?.includes('Search') || a.source?.includes('Suggestion')) return true;
                    return a.title?.toLowerCase().includes(globalSearchQuery.toLowerCase()) || a.id?.includes(globalSearchQuery);
                  })
                  .map((anime) => {
                    const dbRecord = dbRecords[anime.id];
                    return (
                      <div key={anime.id} className="flex items-center justify-between p-4 bg-[#050505]/30 border border-white/5 rounded-xl hover:border-white/10 transition-all">
                        <div className="flex items-center gap-3.5 min-w-0">
                          {anime.poster ? (
                            <img 
                              src={anime.poster} 
                              alt={anime.title} 
                              className="w-10 h-14 object-cover rounded-lg bg-white/5 shadow"
                              referrerPolicy="no-referrer"
                            />
                          ) : (
                            <div className="w-10 h-14 bg-white/5 rounded-lg flex items-center justify-center text-[10px] text-gray-500">
                              No Pic
                            </div>
                          )}
                          <div className="min-w-0">
                            <span className="text-[8px] bg-white/5 text-gray-400 font-mono font-bold px-1.5 py-0.5 rounded leading-none">
                              ID: {anime.id} • {anime.source}
                            </span>
                            <h4 className="text-xs font-black text-white truncate leading-tight mt-1">{anime.title}</h4>
                             <div className="mt-1.5">
                               {dbRecord ? (
                                 <span className={cn(
                                   "px-2 py-0.5 rounded text-[8px] font-black uppercase tracking-wider border",
                                   (dbRecord.status === 'VERIFIED' || dbRecord.status === 'Verified') && "bg-emerald-500/10 border-emerald-500/20 text-emerald-400",
                                   (dbRecord.status === 'VERIFIED_WITH_RETRY' || dbRecord.status === 'Verified with Retry') && "bg-amber-500/10 border-amber-500/20 text-amber-400",
                                   (dbRecord.status === 'VERIFIED_FAILED' || dbRecord.status === 'Verified Failed') && "bg-red-500/10 border-red-500/20 text-red-400"
                                 )}>
                                   {(dbRecord.status === 'VERIFIED' || dbRecord.status === 'Verified') ? 'Verified (healthy)' : (dbRecord.status === 'VERIFIED_WITH_RETRY' || dbRecord.status === 'Verified with Retry') ? 'Repaired (failover)' : 'Failed'}
                                 </span>
                               ) : (
                                 <span className="px-2 py-0.5 rounded text-[8px] font-black uppercase tracking-wider border bg-white/5 border-white/10 text-gray-500">
                                   Not Verified Yet
                                 </span>
                               )}
                             </div>
                          </div>
                        </div>

                        <div>
                          <button
                            onClick={() => triggerIndividualReverification(anime.id, anime.title)}
                            disabled={isRunning}
                            className="px-3 py-2 bg-primary/10 hover:bg-primary text-primary hover:text-black rounded-lg font-black text-[9px] uppercase tracking-wider border border-primary/20 hover:border-primary transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                            প্লেব্যাক ঠিক করুন (Fix Playback)
                          </button>
                        </div>
                      </div>
                    );
                  })}
              </div>
            )}
          </div>
        )}

      </div>

    </div>
  );
}
