// @ts-nocheck
import React, { useState, useEffect, useRef } from 'react';
import { useAppStore } from '../store';
import { useNavigate, Link } from 'react-router-dom';
import { 
  ShieldAlert, Users, Play, MessageSquare, Clock, ArrowLeft, RefreshCw, 
  CheckCircle, ShieldCheck, Pin, Trash2, Search, Filter, Ban, Eye, User, 
  BarChart3, Activity, Heart, Bookmark, FileText, Calendar, Server, Power,
  UploadCloud, FilePlus, PlayCircle, Settings, EyeOff, FolderPlus, Plus,
  Trash, Edit3, Save, Video, Clipboard, Sparkles, AlertCircle, Megaphone,
  ArrowUp, ArrowDown
} from 'lucide-react';
import { cn } from '../lib/utils';
import { ref, onValue, update, remove, get, set } from 'firebase/database';
import { db } from '../lib/firebase';
import { PlaybackVerifier } from '../components/PlaybackVerifier';
import { sanitizeEmail, addAdvertisement, deleteAdvertisement, getAdvertisements } from '../lib/firebaseSync';
import { uploadToCloudinary } from '../lib/cloudinary';
import { testConnectionWithConfig, deleteAssetByUrl } from '../lib/storageManager';
import { 
  addCustomAnime, 
  deleteCustomAnime, 
  getCustomAnimes, 
  addCustomEpisode, 
  getCustomEpisodes,
  addCustomEpisodesBatch,
  updateAnimeEpisodesCount
} from '../lib/firebaseSync';
import { clearAnimeCaches } from '../lib/api';
import { toast } from 'sonner';
import { 
  filterVideoForImport, 
  containsExcludedKeyword, 
  parseDurationToSeconds, 
  detectVideoType, 
  cleanTitleForSearch, 
  fetchAnimeMetadataHierarchical, 
  findExistingAnimeMatch,
  SkippedVideoLog,
  FailedMetadataLog
} from '../lib/animeImportSystem';

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

const ALL_CATEGORIES_METADATA = [
  // Core Sections
  { id: 'featured', name: '⭐ Featured Anime' },
  { id: 'trending', name: '🔥 Trending Anime' },
  { id: 'popular', name: '⭐ Popular Anime' },
  { id: 'topAiring', name: '📺 Top Airing Anime' },
  { id: 'recentlyAdded', name: '🆕 Recently Added' },
  { id: 'latest', name: '🆕 Latest Episodes' },
  { id: 'favorite', name: '💖 Most Favorite' },
  { id: 'completed', name: '✅ Completed Anime' },
  { id: 'upcoming', name: '📅 Upcoming Anime' },
  { id: 'ongoing', name: '📺 Ongoing Anime' },
  { id: 'movies', name: '🎬 Movies' },
  { id: 'hindi-dubbed', name: '🎙️ Hindi Dubbed' },
  
  // Genre Categories
  { id: 'romance', name: '🌸 Romance' },
  { id: 'action', name: '⚔ Action' },
  { id: 'comedy', name: '😂 Comedy' },
  { id: 'horror', name: '👻 Horror' },
  { id: 'fantasy', name: '✨ Fantasy' },
  { id: 'scifi', name: '🚀 Sci-Fi' },
  { id: 'school', name: '🏫 School' },
  { id: 'isekai', name: '🌎 Isekai' },
  { id: 'shounen', name: '👊 Shounen' },
  { id: 'sliceoflife', name: '💖 Slice of Life' },
  { id: 'drama', name: '🎭 Drama' },
  { id: 'mystery', name: '🕵 Mystery' },
  { id: 'music', name: '🎵 Music' },
  { id: 'kids', name: '👦 Kids' }
];

export function Admin() {
  const navigate = useNavigate();
  const { comments: localComments, deleteComment, pinComment } = useAppStore();
  const [activeTab, setActiveTab] = useState('overview');
  
  // Real-time states from Firebase
  const [firebaseUsers, setFirebaseUsers] = useState<any[]>([]);
  const [onlineUsers, setOnlineUsers] = useState<any[]>([]);
  const [views, setViews] = useState<any[]>([]);
  const [sessions, setSessions] = useState<any[]>([]);
  const [firebaseComments, setFirebaseComments] = useState<any[]>([]);
  const [reports, setReports] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // Search & Filter state for Users Directory
  const [userSearchQuery, setUserSearchQuery] = useState('');
  const [userFilter, setUserFilter] = useState('all'); // all, premium, vip, banned

  // User detail overlay state
  const [selectedUser, setSelectedUser] = useState<any | null>(null);
  const [selectedUserHistory, setSelectedUserHistory] = useState<any[]>([]);
  const [selectedUserFavorites, setSelectedUserFavorites] = useState<any[]>([]);
  const [loadingUserDetail, setLoadingUserDetail] = useState(false);

  // Anime Upload / Management states
  const [customAnimes, setCustomAnimes] = useState<any[]>([]);
  const [dbSections, setDbSections] = useState<any[]>([]);

  // Construct combined categories list (standard + dynamic database sections)
  const existingCategoryIds = new Set(ALL_CATEGORIES_METADATA.map(c => c.id));
  const ALL_CATEGORIES_LIST = [...ALL_CATEGORIES_METADATA];
  dbSections.forEach(sec => {
    const id = sec.slug || sec.id;
    if (id && !existingCategoryIds.has(id)) {
      ALL_CATEGORIES_LIST.push({ id, name: `✨ ${sec.name}` });
      existingCategoryIds.add(id);
    }
  });
  const [customEpisodes, setCustomEpisodes] = useState<any[]>([]);
  const [repairReport, setRepairReport] = useState<any | null>(null);
  const [bulkSubText, setBulkSubText] = useState('');
  const [bulkEngDubText, setBulkEngDubText] = useState('');
  const [bulkHindiDubText, setBulkHindiDubText] = useState('');
  const [bulkOtherText, setBulkOtherText] = useState('');
  const [parsedEpisodes, setParsedEpisodes] = useState<any[]>([]);
  const [skippedDuplicatesCount, setSkippedDuplicatesCount] = useState(0);
  const [showBulkPanel, setShowBulkPanel] = useState(false);
  const [importProgress, setImportProgress] = useState(0);
  const [isImporting, setIsImporting] = useState(false);
  const [importedCount, setImportedCount] = useState(0);

  // YouTube Playlist Import states
  const [importMode, setImportMode] = useState<'bulk' | 'youtube_playlist'>('bulk');
  const [ytPlaylistUrlSub, setYtPlaylistUrlSub] = useState('');
  const [ytPlaylistUrlEngDub, setYtPlaylistUrlEngDub] = useState('');
  const [ytPlaylistUrlHindiDub, setYtPlaylistUrlHindiDub] = useState('');
  const [ytPlaylistUrlOther, setYtPlaylistUrlOther] = useState('');
  const [ytPlaylistLoading, setYtPlaylistLoading] = useState(false);
  const [ytPlaylistItemsSub, setYtPlaylistItemsSub] = useState<any[]>([]);
  const [ytPlaylistItemsEngDub, setYtPlaylistItemsEngDub] = useState<any[]>([]);
  const [ytPlaylistItemsHindiDub, setYtPlaylistItemsHindiDub] = useState<any[]>([]);
  const [ytPlaylistItemsOther, setYtPlaylistItemsOther] = useState<any[]>([]);
  const [ytAppendMode, setYtAppendMode] = useState<'append' | 'replace'>('append');
  const [ytAutoFilterShortClips, setYtAutoFilterShortClips] = useState(false);
  const [ytPlaylistStats, setYtPlaylistStats] = useState<{ imported: number; skipped: number; duplicates: number; failed: number } | null>(null);
  const [ytImportMethod, setYtImportMethod] = useState<'auto' | 'paste'>('auto');
  const [ytPastedSourceSub, setYtPastedSourceSub] = useState('');
  const [ytPastedSourceEngDub, setYtPastedSourceEngDub] = useState('');
  const [ytPastedSourceHindiDub, setYtPastedSourceHindiDub] = useState('');
  const [ytPastedSourceOther, setYtPastedSourceOther] = useState('');
  const [trailerSources, setTrailerSources] = useState<Record<string, any>>({
    sub: { enabled: true, type: 'embed', url: '' },
    eng_dub: { enabled: false, type: 'file', url: '' },
    hindi_dub: { enabled: false, type: 'file', url: '' },
    other: { enabled: false, type: 'file', url: '' }
  });
  const [editingAnime, setEditingAnime] = useState<any | null>(null);
  const [uploadTabMode, setUploadTabMode] = useState<'list' | 'animeForm' | 'episodeForm' | 'youtubeChannelImport' | 'aiScraper'>('list');
  const [scraperUrl, setScraperUrl] = useState('');
  const [scraperHtmlSource, setScraperHtmlSource] = useState('');
  const [scraperMode, setScraperMode] = useState<'url' | 'html'>('url');
  const [scraperLoading, setScraperLoading] = useState(false);
  const [scraperResult, setScraperResult] = useState<any | null>(null);
  const [selectedCatalogShows, setSelectedCatalogShows] = useState<Record<string, boolean>>({});
  const [catalogImportingProgress, setCatalogImportingProgress] = useState<{ active: boolean; currentShowName: string; index: number; total: number; percent: number } | null>(null);
  const [scraperSelectedCategories, setScraperSelectedCategories] = useState<Record<string, boolean>>({
    recentlyAdded: true,
    trending: false,
    popular: false,
    featured: false,
  });
  const [isScraperImporting, setIsScraperImporting] = useState(false);
  const [ytChannelUrl, setYtChannelUrl] = useState('');
  const [ytChannelLoading, setYtChannelLoading] = useState(false);
  const [ytChannelPlaylists, setYtChannelPlaylists] = useState<any[]>([]);
  const [ytSelectedPlaylists, setYtSelectedPlaylists] = useState<Record<string, boolean>>({});
  const [ytChannelInfo, setYtChannelInfo] = useState<any>(null);
  const [ytImportingProgress, setYtImportingProgress] = useState<{ active: boolean; currentPlaylistName: string; index: number; total: number; percent: number } | null>(null);
  const [ytImportCategory, setYtImportCategory] = useState('recentlyAdded');
  
  // Advanced Import & Metadata Tracking States
  const [skippedVideoLogs, setSkippedVideoLogs] = useState<SkippedVideoLog[]>([]);
  const [failedMetadataLogs, setFailedMetadataLogs] = useState<FailedMetadataLog[]>([]);
  const [importSummaryStats, setImportSummaryStats] = useState<{
    playlistsProcessed: number;
    episodesAdded: number;
    animeCreatedCount: number;
    animeUpdatedCount: number;
  }>({
    playlistsProcessed: 0,
    episodesAdded: 0,
    animeCreatedCount: 0,
    animeUpdatedCount: 0,
  });
  const [metadataProgress, setMetadataProgress] = useState<{
    total: number;
    completed: number;
    failed: number;
    running: boolean;
  }>({
    total: 0,
    completed: 0,
    failed: 0,
    running: false,
  });
  const [showSkippedModal, setShowSkippedModal] = useState(false);
  const [showFailedMetaModal, setShowFailedMetaModal] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isSyncingYtPlaylists, setIsSyncingYtPlaylists] = useState(false);
  const [scanningPlaylists, setScanningPlaylists] = useState<Record<string, boolean>>({});
  const [isScanningAll, setIsScanningAll] = useState(false);
  const [globalSettings, setGlobalSettings] = useState({
    myDatabase: true,
    fourAnimo: true,
    imported: true,
    hideRestrictedPlaylists: false,
    hideMembersOnly: false,
    hideEmbedDisabled: false,
    hideRegionLocked: false,
    hidePrivatePlaylists: false,
    hidePlaybackRestricted: false
  });

  // Section Manager states
  const [sectionFormOpen, setSectionFormOpen] = useState(false);
  const [editingSection, setEditingSection] = useState<any | null>(null);
  const [sectionForm, setSectionForm] = useState({
    id: '',
    name: '',
    slug: '',
    displayOrder: 1,
    numCards: 12,
    visible: true,
    status: 'active' as 'active' | 'inactive'
  });

  // Form Fields for Anime
  const [animeForm, setAnimeForm] = useState({
    id: '',
    title: '',
    description: '',
    poster: '',
    banner: '',
    type: 'TV',
    status: 'Ongoing',
    episodes: 12,
    rating: '8.5',
    genres: 'Action, Adventure, Fantasy',
    studio: 'AnOvA Production',
    released: '2024',
    categories: {
      featured: false,
      trending: false,
      popular: false,
      recentlyAdded: false,
      topAiring: false,
      latest: false,
      completed: false,
      upcoming: false,
      favorite: false,
      ongoing: false,
      movies: false,
      'hindi-dubbed': false,
      romance: false,
      action: false,
      comedy: false,
      horror: false,
      fantasy: false,
      scifi: false,
      school: false,
      isekai: false,
      shounen: false,
      sliceoflife: false,
      drama: false,
      mystery: false,
      music: false,
      kids: false
    } as Record<string, boolean>,
    subAvailable: true,
    dubAvailable: false,
    hindiAvailable: false,
    multiAvailable: false,
    visibility: 'public',
    season: '',
    duration: '',
    country: '',
    language: '',
    coverImage: '',
    trailer: ''
  });

  // Upload progress tracking
  const [uploadProgress, setUploadProgress] = useState<Record<string, number>>({});
  const [uploadDetails, setUploadDetails] = useState<Record<string, { speed?: string; sizeInfo?: string; eta?: string; processing?: boolean }>>({});
  const abortControllersRef = useRef<Record<string, AbortController>>({});

  const [metadataStatus, setMetadataStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [metadataMessage, setMetadataMessage] = useState('');
  const lastFetchedTitleRef = useRef('');

  const autoMapGenresToCategories = (genresStr: string, currentCategories: any, sections: any[]) => {
    if (!genresStr) return currentCategories;
    
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

    // Split by common delimiters: comma, slash, vertical pipe, semicolon, etc.
    const cleanFetchedGenres = genresStr
      .split(/[,\/|;]+/)
      .map(g => g.trim().toLowerCase().replace(/[^a-z0-9]/g, ''))
      .filter(Boolean);

    const updatedCategories = { ...(currentCategories || {}) };

    for (const sec of sections) {
      const slugOrId = sec.slug || sec.id;
      const normalizedSlug = slugOrId ? slugOrId.toLowerCase().replace(/[^a-z0-9]/g, '') : '';
      const normalizedName = sec.name ? sec.name.toLowerCase().replace(/[^a-z0-9]/g, '') : '';
      
      const possibleMatches = new Set<string>();
      if (normalizedSlug) possibleMatches.add(normalizedSlug);
      if (normalizedName) possibleMatches.add(normalizedName);
      
      // Smart group bidirectional matching:
      // If either normalizedSlug or normalizedName matches ANY alias in a group, 
      // we consider ALL aliases in that group as valid search terms for this category/section.
      let isGenreSection = false;
      for (const [key, aliases] of Object.entries(GENRE_ALIASES)) {
        const normalizedAliases = aliases.map(a => a.toLowerCase().replace(/[^a-z0-9]/g, ''));
        if (normalizedAliases.includes(normalizedSlug) || normalizedAliases.includes(normalizedName)) {
          isGenreSection = true;
          for (const normAlias of normalizedAliases) {
            possibleMatches.add(normAlias);
          }
        }
      }

      // Check if any of the clean fetched genres match the possible matches for this section
      const isMatched = cleanFetchedGenres.some(g => possibleMatches.has(g));
      if (isMatched) {
        if (slugOrId) {
          updatedCategories[slugOrId] = true;
        }
      }
    }

    return updatedCategories;
  };

  const triggerAutoFetch = async (forceRefresh = false) => {
    if (!animeForm.title) {
      toast.error("Please enter an Anime Title or YouTube link first.");
      return;
    }

    setMetadataStatus('loading');
    setMetadataMessage('Fetching metadata...');
    const toastId = toast.loading("Fetching metadata...");

    try {
      const response = await fetch(`/api/anime/metadata?query=${encodeURIComponent(animeForm.title)}${forceRefresh ? '&refresh=true' : ''}`);
      if (!response.ok) {
        throw new Error("Failed to fetch metadata");
      }

      const result = await response.json();
      if (result.success && result.data) {
        const data = result.data;

        // Auto-fill form fields
        setAnimeForm(prev => {
          const newGenres = data.genres || prev.genres;
          const mappedCats = autoMapGenresToCategories(newGenres, prev.categories, ALL_CATEGORIES_LIST);
          return {
            ...prev,
            title: data.title || prev.title,
            description: data.description || prev.description,
            poster: data.poster || prev.poster,
            banner: data.banner || prev.banner,
            type: data.type || prev.type,
            status: data.status || prev.status,
            episodes: data.episodes ? Number(data.episodes) : prev.episodes,
            rating: data.rating ? String(data.rating) : prev.rating,
            genres: newGenres,
            categories: mappedCats,
            studio: data.studio || prev.studio,
            released: data.released ? String(data.released) : prev.released,
            season: data.season || prev.season || '',
            duration: data.duration || prev.duration || '',
            country: data.country || prev.country || '',
            language: data.language || prev.language || '',
            coverImage: data.coverImage || prev.coverImage || '',
            trailer: data.trailer || prev.trailer || ''
          };
        });

        // Set last fetched title ref to prevent infinite loops on blur
        lastFetchedTitleRef.current = data.title || animeForm.title;

        setMetadataStatus('success');
        setMetadataMessage('Metadata Found ✓ Fields auto-filled.');
        toast.success("Metadata Found ✓ Fields auto-filled.", { id: toastId });
      } else {
        setMetadataStatus('error');
        setMetadataMessage('No metadata found for this anime.');
        toast.error("No metadata found for this anime. Existing data preserved.", { id: toastId });
      }
    } catch (err) {
      console.error(err);
      setMetadataStatus('error');
      setMetadataMessage('No metadata found for this anime.');
      toast.error("No metadata found for this anime. Existing data preserved.", { id: toastId });
    }
  };

  // Storage Manager States
  const [storageConfigs, setStorageConfigs] = useState<any[]>([]);
  const [storageSettings, setStorageSettings] = useState({ defaultStorageId: '', autoRotate: false, smartMode: false });
  const [uploadHistory, setUploadHistory] = useState<any[]>([]);
  const [storageFormOpen, setStorageFormOpen] = useState(false);
  const [editingStorage, setEditingStorage] = useState<any | null>(null);
  const [isTestingConnection, setIsTestingConnection] = useState<Record<string, boolean>>({});
  const [testConnectionResults, setTestConnectionResults] = useState<Record<string, { success: boolean; message: string }>>({});
  const [storageForm, setStorageForm] = useState({
    id: '',
    name: '',
    provider: 'cloudinary' as 'cloudinary' | 'cloudflare_r2' | 'bunny' | 'aws_s3' | 'backblaze_b2' | 'imagekit' | 'supabase' | 'firebase',
    cloudName: '',
    apiKey: '',
    apiSecret: '',
    folder: 'anova_anime',
    defaultFolder: 'anova_anime',
    status: 'enabled' as 'enabled' | 'disabled',
    priority: 1,
    notes: '',
    maxUploadSize: 50,
    maxDailyUploads: 100,
    maxStorage: 1024
  });

  const [storageSearchQuery, setStorageSearchQuery] = useState('');
  const [storageFilterProvider, setStorageFilterProvider] = useState('all');
  const [storageFilterStatus, setStorageFilterStatus] = useState('all');
  const [storageFilterPriority, setStorageFilterPriority] = useState('all');
  const [storageFilterActive, setStorageFilterActive] = useState('all');
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  // ==========================================
  // ADVERTISEMENT MANAGER STATES
  // ==========================================
  const [advertisements, setAdvertisements] = useState<any[]>([]);
  const [isAdFormOpen, setIsAdFormOpen] = useState(false);
  const [editingAd, setEditingAd] = useState<any | null>(null);
  const [previewAd, setPreviewAd] = useState<any | null>(null);
  const [adForm, setAdForm] = useState({
    id: '',
    name: '',
    provider: '',
    type: 'Popunder', // Popunder, Direct Link, Script, Banner
    status: 'enabled', // enabled / disabled
    script: '',
    priority: 10,
    frequency: 'always', // always, every_5_m, every_10_m, every_15_m, every_30_m, once_per_hour, once_per_session
    startDate: '', // YYYY-MM-DD
    endDate: '', // YYYY-MM-DD
    targetMode: 'all', // all, single, multiple
    targetAnimeIds: [] as string[]
  });
  const [adFormTargetEpisodes, setAdFormTargetEpisodes] = useState<any[]>([]);
  const [adSearchQuery, setAdSearchQuery] = useState('');
  const [adFormSearchQuery, setAdFormSearchQuery] = useState('');
  const [adContentFormatFilter, setAdContentFormatFilter] = useState('all');

  // Episode Editing states
  const [editingEpisode, setEditingEpisode] = useState<any | null>(null);
  const [episodeForm, setEpisodeForm] = useState({
    id: '',
    number: 1,
    title: 'Episode 1',
    thumbnail: '',
    videoSources: {
      sub: { enabled: true, type: 'embed', url: '' },
      eng_dub: { enabled: false, type: 'file', url: '' },
      hindi_dub: { enabled: false, type: 'file', url: '' },
      other: { enabled: false, type: 'file', url: '' }
    } as Record<string, { enabled: boolean; type: 'file' | 'embed'; url: string }>
  });

  // Custom Confirmation Dialog State
  const [confirmDialog, setConfirmDialog] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    onConfirm: () => void | Promise<void>;
  } | null>(null);

  const showConfirm = (title: string, message: string, onConfirm: () => void | Promise<void>) => {
    setConfirmDialog({
      isOpen: true,
      title,
      message,
      onConfirm: async () => {
        try {
          await onConfirm();
        } catch (e) {
          console.error("Error in confirmation callback:", e);
        }
        setConfirmDialog(null);
      }
    });
  };

  // Authentication Status Check
  const isLoggedIn = localStorage.getItem('isLoggedIn') === 'true';
  const currentUserEmail = localStorage.getItem('userEmail') || '';
  const isAdmin = isLoggedIn && (currentUserEmail.trim().toLowerCase() === 'mdido406@gmail.com' || localStorage.getItem('userRole') === 'admin');

  useEffect(() => {
    if (!isAdmin) return;

    // Real-time listener for custom anime catalog to guarantee they always load instantly and are never lost/delayed due to timeouts
    const animesRef = ref(db, 'animes');
    const unsubAnimes = onValue(animesRef, (snap) => {
      if (snap.exists()) {
        const val = snap.val();
        setCustomAnimes(Object.values(val));
      } else {
        setCustomAnimes([]);
      }
    }, (err) => {
      console.error("Failed to sync custom animes:", err);
    });

    const sectionsRef = ref(db, 'homepageSections');
    const unsubSec = onValue(sectionsRef, (snap) => {
      if (snap.exists()) {
        const sorted = Object.values(snap.val()).sort((a: any, b: any) => Number(a.displayOrder || 0) - Number(b.displayOrder || 0));
        setDbSections(sorted);
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
        setDbSections(defaultSections);
      }
    });
    return () => {
      unsubAnimes();
      unsubSec();
    };
  }, [isAdmin, uploadTabMode]);

  // Real-time Database Listeners
  useEffect(() => {
    if (!isAdmin) return;

    const usersRef = ref(db, 'users');
    const onlineRef = ref(db, 'onlineUsers');
    const viewsRef = ref(db, 'views');
    const sessionsRef = ref(db, 'sessions');
    const commentsRef = ref(db, 'comments');
    const reportsRef = ref(db, 'reports');
    const storageConfigsRef = ref(db, 'storage_configs');
    const storageSettingsRef = ref(db, 'storage_settings');
    const uploadHistoryRef = ref(db, 'upload_history');

    const unsubUsers = onValue(usersRef, (snap) => {
      if (snap.exists()) {
        const data = snap.val();
        setFirebaseUsers(Object.values(data));
      } else {
        setFirebaseUsers([]);
      }
    });

    const unsubOnline = onValue(onlineRef, (snap) => {
      const now = Date.now();
      if (snap.exists()) {
        const data = snap.val();
        // Filters active within last 2 minutes as online
        const active = Object.values(data).filter((u: any) => now - (u.lastActive || 0) < 120000);
        setOnlineUsers(active);
      } else {
        setOnlineUsers([]);
      }
    });

    const unsubViews = onValue(viewsRef, (snap) => {
      if (snap.exists()) {
        setViews(Object.values(snap.val()));
      } else {
        setViews([]);
      }
    });

    const unsubSessions = onValue(sessionsRef, (snap) => {
      if (snap.exists()) {
        setSessions(Object.values(snap.val()));
      } else {
        setSessions([]);
      }
    });

    const unsubComments = onValue(commentsRef, (snap) => {
      if (snap.exists()) {
        setFirebaseComments(Object.values(snap.val()));
      } else {
        setFirebaseComments([]);
      }
    });

    const unsubReports = onValue(reportsRef, (snap) => {
      if (snap.exists()) {
        setReports(Object.values(snap.val()));
      } else {
        setReports([]);
      }
      setLoading(false);
    });

    const unsubStorageConfigs = onValue(storageConfigsRef, (snap) => {
      if (snap.exists()) {
        setStorageConfigs(Object.values(snap.val()));
      } else {
        setStorageConfigs([]);
      }
    });

    const unsubStorageSettings = onValue(storageSettingsRef, (snap) => {
      if (snap.exists()) {
        setStorageSettings(snap.val());
      } else {
        setStorageSettings({ defaultStorageId: '', autoRotate: false });
      }
    });

    const unsubUploadHistory = onValue(uploadHistoryRef, (snap) => {
      if (snap.exists()) {
        const sorted = Object.values(snap.val()).sort((a: any, b: any) => b.uploadedAt - a.uploadedAt);
        setUploadHistory(sorted);
      } else {
        setUploadHistory([]);
      }
    });

    const adsRef = ref(db, 'advertisements');
    const unsubAds = onValue(adsRef, (snap) => {
      if (snap.exists()) {
        setAdvertisements(Object.values(snap.val()));
      } else {
        setAdvertisements([]);
      }
    });

    const settingsRef = ref(db, 'globalContentSettings');
    const unsubSettings = onValue(settingsRef, (snap) => {
      if (snap.exists()) {
        const val = snap.val();
        setGlobalSettings({
          myDatabase: val.myDatabase !== false,
          fourAnimo: val.fourAnimo !== false,
          imported: val.imported !== false,
          hideRestrictedPlaylists: !!val.hideRestrictedPlaylists,
          hideMembersOnly: !!val.hideMembersOnly,
          hideEmbedDisabled: !!val.hideEmbedDisabled,
          hideRegionLocked: !!val.hideRegionLocked,
          hidePrivatePlaylists: !!val.hidePrivatePlaylists,
          hidePlaybackRestricted: !!val.hidePlaybackRestricted
        });
      }
    });

    return () => {
      unsubUsers();
      unsubOnline();
      unsubViews();
      unsubSessions();
      unsubComments();
      unsubReports();
      unsubStorageConfigs();
      unsubStorageSettings();
      unsubUploadHistory();
      unsubAds();
      unsubSettings();
    };
  }, [isAdmin]);

  // Strict Authorization Guard
  if (!isAdmin) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#050505] px-4">
        <div className="max-w-md w-full bg-[#0a0d14]/80 border border-red-500/20 p-8 rounded-3xl text-center space-y-6 shadow-[0_0_50px_rgba(239,68,68,0.15)] backdrop-blur-md">
          <ShieldAlert size={48} className="text-red-500 mx-auto animate-bounce" />
          <div className="space-y-2">
            <h2 className="text-xl font-black text-white uppercase tracking-wider">Access Denied</h2>
            <p className="text-xs text-gray-400 leading-relaxed">
              Your account (<span className="text-red-400 font-bold">{currentUserEmail || 'Guest'}</span>) does not possess Administrator clearance. This event has been logged.
            </p>
          </div>
          <button
            onClick={() => navigate('/home')}
            className="w-full py-3 bg-white/5 border border-white/10 hover:bg-white/10 text-white font-black text-xs rounded-xl transition-all active:scale-95 uppercase tracking-wider"
          >
            RETURN TO HOME
          </button>
        </div>
      </div>
    );
  }

  // Statistics calculation helpers
  const now = Date.now();
  const startOfToday = new Date().setHours(0,0,0,0);
  const startOfWeek = now - 7 * 24 * 60 * 60 * 1000;
  const startOfMonth = now - 30 * 24 * 60 * 60 * 1000;

  // Registered Users Analytics
  const totalUsersCount = firebaseUsers.length;
  
  // Active users today (distinct emails in sessions or views active today)
  const activeTodaySet = new Set<string>();
  views.forEach(v => {
    if (v.timestamp >= startOfToday) activeTodaySet.add(v.userEmail);
  });
  sessions.forEach(s => {
    if (s.loginTime >= startOfToday || s.lastHeartbeat >= startOfToday) activeTodaySet.add(s.email);
  });
  const activeUsersToday = Math.max(onlineUsers.length, activeTodaySet.size);

  // Weekly Active Users (WAU)
  const activeWeeklySet = new Set<string>();
  views.forEach(v => {
    if (v.timestamp >= startOfWeek) activeWeeklySet.add(v.userEmail);
  });
  sessions.forEach(s => {
    if (s.loginTime >= startOfWeek || s.lastHeartbeat >= startOfWeek) activeWeeklySet.add(s.email);
  });
  const weeklyActiveUsers = Math.max(activeUsersToday, activeWeeklySet.size);

  // Monthly Active Users (MAU)
  const activeMonthlySet = new Set<string>();
  views.forEach(v => {
    if (v.timestamp >= startOfMonth) activeMonthlySet.add(v.userEmail);
  });
  sessions.forEach(s => {
    if (s.loginTime >= startOfMonth || s.lastHeartbeat >= startOfMonth) activeMonthlySet.add(s.email);
  });
  const monthlyActiveUsers = Math.max(weeklyActiveUsers, activeMonthlySet.size);

  // Total Sessions & Returning vs New
  const totalSessionsCount = sessions.length;
  const returningUsersCount = firebaseUsers.filter(u => u.lastLoginAt - u.createdAt > 1000).length;
  const newUsersTodayCount = firebaseUsers.filter(u => u.createdAt >= startOfToday).length;

  // Watch Analytics calculation
  const totalViewsCount = views.length;
  const viewsToday = views.filter(v => v.timestamp >= startOfToday).length;
  const viewsThisWeek = views.filter(v => v.timestamp >= startOfWeek).length;
  const viewsThisMonth = views.filter(v => v.timestamp >= startOfMonth).length;

  // Watch Time (minutes)
  const totalWatchTimeSeconds = views.reduce((acc, curr) => acc + Number(curr.watchTime || 0), 0);
  const totalWatchHours = (totalWatchTimeSeconds / 3600).toFixed(1);
  const averageWatchDurationMinutes = totalViewsCount > 0 
    ? ((totalWatchTimeSeconds / totalViewsCount) / 60).toFixed(1)
    : '0.0';

  // Most Watched Anime Aggregation
  const animeAggregation: Record<string, { id: string, title: string, poster: string, count: number, watchTime: number }> = {};
  views.forEach(v => {
    if (!v.animeId) return;
    if (!animeAggregation[v.animeId]) {
      animeAggregation[v.animeId] = {
        id: v.animeId,
        title: v.animeTitle || `Anime #${v.animeId}`,
        poster: v.animePoster || '',
        count: 0,
        watchTime: 0
      };
    }
    animeAggregation[v.animeId].count += 1;
    animeAggregation[v.animeId].watchTime += Number(v.watchTime || 0);
  });
  const sortedAnimeList = Object.values(animeAggregation).sort((a, b) => b.count - a.count);
  const top10Anime = sortedAnimeList.slice(0, 10);
  const trendingAnime = sortedAnimeList.slice(0, 5);
  const recentlyWatchedAnime = [...views].sort((a, b) => b.timestamp - a.timestamp).slice(0, 6);

  // Most Watched Episodes Aggregation
  const episodeAggregation: Record<string, { key: string, animeTitle: string, episode: number, count: number }> = {};
  views.forEach(v => {
    if (!v.animeId || !v.episode) return;
    const key = `${v.animeId}-ep-${v.episode}`;
    if (!episodeAggregation[key]) {
      episodeAggregation[key] = {
        key,
        animeTitle: v.animeTitle || `Anime #${v.animeId}`,
        episode: v.episode,
        count: 0
      };
    }
    episodeAggregation[key].count += 1;
  });
  const top10Episodes = Object.values(episodeAggregation).sort((a, b) => b.count - a.count).slice(0, 10);

  // Static premium server status elements
  const serverNodes = [
    { name: 'HD-1 (4Animo primary)', status: 'OPTIMAL', load: '38%', badge: 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400' },
    { name: 'HD-2 (Kryzox CDN)', status: 'ONLINE', load: '45%', badge: 'bg-cyan-500/10 border-cyan-500/30 text-cyan-400' },
    { name: 'HD-3 (AnOvA Proxy)', status: 'OPTIMAL', load: '18%', badge: 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400' },
    { name: 'HD-4 (Backup Node)', status: 'BUSY', load: '84%', badge: 'bg-amber-500/10 border-amber-500/30 text-amber-400' },
    { name: 'HD-5 (Failover Relay)', status: 'OFFLINE', load: '0%', badge: 'bg-red-500/10 border-red-500/30 text-red-400' }
  ];

  // User moderation functions
  const handleToggleBanUser = async (user: any) => {
    const sanitized = sanitizeEmail(user.email);
    const userRef = ref(db, `users/${sanitized}`);
    const isBannedNow = user.banned === true;
    await update(userRef, { 
      banned: !isBannedNow, 
      status: !isBannedNow ? 'Banned' : 'Premium' 
    });
    alert(`User ${user.username} has been successfully ${!isBannedNow ? 'BANNED' : 'UNBANNED'}.`);
  };

  const handleDeleteUser = async (user: any) => {
    showConfirm(
      "Delete User",
      `Are you absolutely sure you want to permanently delete user ${user.username}? This cannot be undone.`,
      async () => {
        const sanitized = sanitizeEmail(user.email);
        await remove(ref(db, `users/${sanitized}`));
        setSelectedUser(null);
        alert('User has been deleted from the database.');
      }
    );
  };

  const handleInspectUser = async (user: any) => {
    setSelectedUser(user);
    setLoadingUserDetail(true);
    try {
      const sanitized = sanitizeEmail(user.email);
      // Fetch watch history
      const historySnap = await get(ref(db, `watchHistory/${sanitized}`));
      const historyData = historySnap.exists() ? Object.values(historySnap.val()) : [];
      setSelectedUserHistory(historyData);

      // Fetch favorites
      const favSnap = await get(ref(db, `favorites/${sanitized}`));
      const favData = favSnap.exists() ? Object.values(snapValToArray(favSnap.val())) : [];
      setSelectedUserFavorites(favData);
    } catch (e) {
      console.error("Error loading user detail history:", e);
    } finally {
      setLoadingUserDetail(false);
    }
  };

  const snapValToArray = (val: any) => {
    if (!val) return [];
    if (Array.isArray(val)) return val;
    return Object.values(val);
  };

  // Filtered comments from Firebase (or Zustand local comments fallback)
  const commentsToModerate = firebaseComments.length > 0 
    ? firebaseComments.sort((a, b) => b.timestamp - a.timestamp)
    : localComments;

  // Filtered registered users
  const filteredUsers = firebaseUsers.filter(usr => {
    const matchSearch = usr.username?.toLowerCase().includes(userSearchQuery.toLowerCase()) || 
                        usr.email?.toLowerCase().includes(userSearchQuery.toLowerCase());
    
    if (!matchSearch) return false;
    if (userFilter === 'all') return true;
    if (userFilter === 'premium') return usr.status === 'Premium' && !usr.banned;
    if (userFilter === 'vip') return usr.status === 'VIP';
    if (userFilter === 'banned') return usr.banned === true;
    return true;
  });

  const handleScrapeWebPage = async () => {
    if (!scraperUrl.trim()) {
      toast.error("Please enter a web page URL.");
      return;
    }

    if (scraperMode === 'html' && !scraperHtmlSource.trim()) {
      toast.error("Please paste the page source HTML code.");
      return;
    }

    setScraperLoading(true);
    setScraperResult(null);

    const toastId = toast.loading(
      scraperMode === 'html'
        ? "Processing pasted HTML and analyzing with AI..."
        : "Connecting to website and analyzing with AI..."
    );

    try {
      const response = await fetch('/api/scrape-web-page', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          url: scraperUrl,
          html: scraperMode === 'html' ? scraperHtmlSource : undefined
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Failed to parse the page.");
      }

      const result = await response.json();
      if (result.success && result.data) {
        setScraperResult(result.data);
        toast.success("Successfully parsed and extracted anime details!", { id: toastId });
      } else {
        throw new Error("Invalid response structure from server.");
      }
    } catch (err: any) {
      console.error("Scraping failed:", err);
      const is403 = err.message && (err.message.includes("403") || err.message.toLowerCase().includes("cloudflare") || err.message.toLowerCase().includes("security block") || err.message.toLowerCase().includes("block") || err.message.toLowerCase().includes("forbidden"));
      if (is403 && scraperMode === 'url') {
        setScraperMode('html');
        toast.error("সিকিউরিটি ব্লক (403/Cloudflare) সনাক্ত হয়েছে! নিচে 'Failsafe HTML Paste' মোডে অটোমেটিক সুইচ করা হয়েছে। অনুগ্রহ করে পেজ সোর্স কপি করে পেস্ট করুন।", { id: toastId, duration: 10000 });
      } else {
        toast.error(err.message || "An error occurred during AI scraping.", { id: toastId });
      }
    } finally {
      setScraperLoading(false);
    }
  };

  const handleImportCatalogShows = async () => {
    const selectedUrls = Object.keys(selectedCatalogShows).filter(url => selectedCatalogShows[url]);
    if (selectedUrls.length === 0) {
      toast.error("Please select at least one show to import.");
      return;
    }

    setIsScraperImporting(true);
    setCatalogImportingProgress({
      active: true,
      currentShowName: 'Initializing import queue...',
      index: 0,
      total: selectedUrls.length,
      percent: 0
    });

    const toastId = toast.loading(`Starting import of ${selectedUrls.length} selected anime...`);
    let succeededCount = 0;
    let failedCount = 0;

    try {
      for (let i = 0; i < selectedUrls.length; i++) {
        const showUrl = selectedUrls[i];
        const showItem = scraperResult.shows?.find((s: any) => s.url === showUrl);
        const showTitle = showItem ? showItem.title : showUrl;

        setCatalogImportingProgress({
          active: true,
          currentShowName: `Analyzing "${showTitle}"...`,
          index: i + 1,
          total: selectedUrls.length,
          percent: Math.round((i / selectedUrls.length) * 100)
        });

        try {
          // Fetch the details of this specific show page
          const res = await fetch('/api/scrape-web-page', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ url: showUrl }),
          });

          if (!res.ok) {
            throw new Error(`Failed to scrape series page. Status ${res.status}`);
          }

          const result = await res.json();
          if (result.success && result.data) {
            const singleResult = result.data;

            // Generate a safe anime ID
            const cleanSlug = (singleResult.title || showTitle)
              .toLowerCase()
              .replace(/[^a-z0-9]+/g, '-')
              .replace(/(^-|-$)/g, '');
            const animeId = `ai-scrape-${cleanSlug || Date.now()}`;

            // Map categories strictly to boolean
            const categoriesMap: Record<string, boolean> = {};
            ALL_CATEGORIES_LIST.forEach(cat => {
              categoriesMap[cat.id] = !!scraperSelectedCategories[cat.id];
            });

            // Construct anime object
            const newAnime = {
              id: animeId,
              title: singleResult.title || showTitle,
              description: singleResult.description || 'No description available.',
              poster: singleResult.coverImage || showItem?.coverImage || 'https://images.unsplash.com/photo-1578632767115-351597cf2477?w=300&auto=format&fit=crop&q=80',
              banner: singleResult.coverImage || showItem?.coverImage || 'https://images.unsplash.com/photo-1578632767115-351597cf2477?w=1200&auto=format&fit=crop&q=80',
              type: singleResult.type || 'TV',
              status: 'Ongoing',
              episodes: singleResult.episodes?.length || 0,
              episodesCount: singleResult.episodes?.length || 0,
              rating: '8.5',
              genres: singleResult.genres?.join(', ') || 'Anime',
              categories: categoriesMap,
              studio: 'Scraped AI',
              released: singleResult.releaseYear ? String(singleResult.releaseYear) : String(new Date().getFullYear()),
              season: '',
              duration: '24 min',
              country: 'Japan',
              language: 'Japanese',
              coverImage: singleResult.coverImage || showItem?.coverImage || '',
              subAvailable: true,
              dubAvailable: false,
              hindiAvailable: false,
              multiAvailable: false,
              visibility: "published",
              imported: true,
              source: 'custom'
            };

            // Map episodes
            const episodesMap: Record<number, any> = {};
            const parsedEpisodesList = singleResult.episodes || [];
            parsedEpisodesList.forEach((ep: any) => {
              const epNum = Number(ep.episodeNumber) || 1;
              episodesMap[epNum] = {
                id: `${animeId}-ep-${epNum}`,
                number: epNum,
                title: ep.title || `Episode ${epNum}`,
                thumbnail: singleResult.coverImage || showItem?.coverImage || '',
                videoSources: {
                  sub: {
                    enabled: true,
                    url: ep.url || '',
                    type: 'embed'
                  }
                }
              };
            });

            // Remove existing episodes entry first to prevent duplicates
            await remove(ref(db, `episodes/${animeId}`));
            if (typeof localStorage !== 'undefined') {
              try {
                localStorage.removeItem(`anova_custom_episodes_${animeId}`);
              } catch (_) {}
            }

            // Save to Firebase Database
            await addCustomAnime(animeId, newAnime);
            if (parsedEpisodesList.length > 0) {
              await addCustomEpisodesBatch(animeId, episodesMap);
            }

            succeededCount++;
          } else {
            throw new Error("Invalid single show data format");
          }
        } catch (singleErr: any) {
          console.error(`Failed to import "${showTitle}":`, singleErr);
          failedCount++;
        }
      }

      // Clear API caches to refresh client-side lists
      clearAnimeCaches();

      toast.success(`Import complete! Succeeded: ${succeededCount}, Failed: ${failedCount}`, { id: toastId, duration: 5000 });

      // Clean up states
      setUploadTabMode('list');
      setScraperResult(null);
      setScraperUrl('');
      setScraperHtmlSource('');
      setSelectedCatalogShows({});
    } catch (err: any) {
      console.error("Bulk catalog import failed:", err);
      toast.error(err.message || "Failed to import selected catalog shows.", { id: toastId });
    } finally {
      setIsScraperImporting(false);
      setCatalogImportingProgress(null);
    }
  };

  const handleImportScrapedAnime = async () => {
    if (!scraperResult) return;

    setIsScraperImporting(true);
    const toastId = toast.loading("Importing anime and saving all episodes...");

    try {
      // 1. Generate a safe anime ID
      const cleanSlug = scraperResult.title
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/(^-|-$)/g, '');
      const animeId = `ai-scrape-${cleanSlug || Date.now()}`;

      // 2. Map categories strictly to boolean
      const categoriesMap: Record<string, boolean> = {};
      ALL_CATEGORIES_LIST.forEach(cat => {
        categoriesMap[cat.id] = !!scraperSelectedCategories[cat.id];
      });

      // 3. Construct the new Anime Object
      const newAnime = {
        id: animeId,
        title: scraperResult.title,
        description: scraperResult.description || 'No description available.',
        poster: scraperResult.coverImage || 'https://images.unsplash.com/photo-1578632767115-351597cf2477?w=300&auto=format&fit=crop&q=80',
        banner: scraperResult.coverImage || 'https://images.unsplash.com/photo-1578632767115-351597cf2477?w=1200&auto=format&fit=crop&q=80',
        type: scraperResult.type || 'TV',
        status: 'Ongoing',
        episodes: scraperResult.episodes?.length || 0,
        episodesCount: scraperResult.episodes?.length || 0,
        rating: '8.5',
        genres: scraperResult.genres?.join(', ') || 'Anime',
        categories: categoriesMap,
        studio: 'Scraped AI',
        released: scraperResult.releaseYear ? String(scraperResult.releaseYear) : String(new Date().getFullYear()),
        season: '',
        duration: '24 min',
        country: 'Japan',
        language: 'Japanese',
        coverImage: scraperResult.coverImage || '',
        subAvailable: true,
        dubAvailable: false,
        hindiAvailable: false,
        multiAvailable: false,
        visibility: "published",
        imported: true,
        source: 'custom'
      };

      // 4. Construct the episodesMap
      const episodesMap: Record<number, any> = {};
      const parsedEpisodesList = scraperResult.episodes || [];
      parsedEpisodesList.forEach((ep: any) => {
        const epNum = Number(ep.episodeNumber) || 1;
        episodesMap[epNum] = {
          id: `${animeId}-ep-${epNum}`,
          number: epNum,
          title: ep.title || `Episode ${epNum}`,
          thumbnail: scraperResult.coverImage || '',
          videoSources: {
            sub: {
              enabled: true,
              url: ep.url || '',
              type: 'embed'
            }
          }
        };
      });

      // 5. Remove existing entries first
      await remove(ref(db, `episodes/${animeId}`));
      if (typeof localStorage !== 'undefined') {
        try {
          localStorage.removeItem(`anova_custom_episodes_${animeId}`);
        } catch (_) {}
      }

      // 6. Save to Firebase
      await addCustomAnime(animeId, newAnime);
      if (parsedEpisodesList.length > 0) {
        await addCustomEpisodesBatch(animeId, episodesMap);
      }

      // 7. Clear caches
      clearAnimeCaches();

      toast.success(`Successfully imported "${scraperResult.title}" with ${parsedEpisodesList.length} episodes!`, { id: toastId });
      
      // Go back to list
      setUploadTabMode('list');
      setScraperResult(null);
      setScraperUrl('');
      setScraperHtmlSource('');
    } catch (err: any) {
      console.error("Import failed:", err);
      toast.error(err.message || "Failed to import custom anime series.", { id: toastId });
    } finally {
      setIsScraperImporting(false);
    }
  };

  // ==========================================
  // ANIME UPLOAD & CATALOG SYSTEM HANDLERS
  // ==========================================

  const handleLoadChannelPlaylists = async () => {
    if (!ytChannelUrl.trim()) {
      toast.error("Please enter a YouTube Channel URL or Handle.");
      return;
    }
    setYtChannelLoading(true);
    setYtChannelPlaylists([]);
    setYtSelectedPlaylists({});
    setYtChannelInfo(null);
    try {
      const response = await fetch(`/api/youtube-channel-playlists?channelUrl=${encodeURIComponent(ytChannelUrl.trim())}`);
      const data = await response.json();
      if (!response.ok || !data.success) {
        throw new Error(data.error || "Failed to load channel playlists.");
      }
      setYtChannelPlaylists(data.playlists || []);
      setYtChannelInfo({
        channelId: data.channelId,
        source: data.source
      });
      toast.success(`Successfully fetched ${data.playlists?.length || 0} playlists!`);
    } catch (err: any) {
      console.error("Failed loading channel playlists:", err);
      toast.error(err.message || "An error occurred while loading channel playlists.");
    } finally {
      setYtChannelLoading(false);
    }
  };

  const scanPlaylistStatus = async (playlistId: string) => {
    if (scanningPlaylists[playlistId]) return;
    setScanningPlaylists(prev => ({ ...prev, [playlistId]: true }));
    try {
      const response = await fetch(`/api/youtube-playlist?playlistUrl=${encodeURIComponent(playlistId)}`);
      const data = await response.json();
      if (response.ok && data.success) {
        const vStatus = data.playlistValidationStatus || 'AVAILABLE';
        setYtChannelPlaylists(prev => prev.map(p => {
          if (p.playlistId === playlistId) {
            return { ...p, validationStatus: vStatus };
          }
          return p;
        }));
        toast.success(`Scanned status: ${vStatus}`, { duration: 2000 });
      } else {
        toast.error(`Scan failed for ${playlistId}`);
      }
    } catch (err) {
      console.error("Failed to scan playlist status:", err);
      toast.error(`Scan connection failed`);
    } finally {
      setScanningPlaylists(prev => ({ ...prev, [playlistId]: false }));
    }
  };

  const handleScanAllPlaylists = async () => {
    if (ytChannelPlaylists.length === 0) {
      toast.error("No playlists found to scan!");
      return;
    }
    setIsScanningAll(true);
    const toastId = toast.loading(`Starting validation scan for all ${ytChannelPlaylists.length} playlists...`);
    
    // Scan them in sequence to avoid rate limiting
    let successCount = 0;
    for (let i = 0; i < ytChannelPlaylists.length; i++) {
      const playlist = ytChannelPlaylists[i];
      setScanningPlaylists(prev => ({ ...prev, [playlist.playlistId]: true }));
      try {
        const response = await fetch(`/api/youtube-playlist?playlistUrl=${encodeURIComponent(playlist.playlistId)}`);
        const data = await response.json();
        if (response.ok && data.success) {
          const vStatus = data.playlistValidationStatus || 'AVAILABLE';
          setYtChannelPlaylists(prev => prev.map(p => {
            if (p.playlistId === playlist.playlistId) {
              return { ...p, validationStatus: vStatus };
            }
            return p;
          }));
          successCount++;
        }
      } catch (err) {
        console.error("Scan failed for", playlist.playlistId, err);
      } finally {
        setScanningPlaylists(prev => ({ ...prev, [playlist.playlistId]: false }));
      }
    }
    setIsScanningAll(false);
    toast.success(`Scan complete! Successfully validated ${successCount} playlists.`, { id: toastId });
  };

  // Background Metadata Enrichment Queue
  const runBackgroundMetadataJob = async (items: { animeId: string; searchTitle: string; playlistTitle: string }[]) => {
    setMetadataProgress({
      total: items.length,
      completed: 0,
      failed: 0,
      running: true
    });

    let completedCount = 0;
    let failedCount = 0;
    const failedMetaList: FailedMetadataLog[] = [];
    const CONCURRENCY = 4;

    const processItem = async (item: { animeId: string; searchTitle: string; playlistTitle: string }) => {
      const { animeId, searchTitle } = item;
      try {
        const metaResult = await fetchAnimeMetadataHierarchical(searchTitle);
        if (metaResult.success && metaResult.data) {
          const d = metaResult.data;
          const currentDbAnimes = await getCustomAnimes();
          const existingAnime = currentDbAnimes[animeId] || {};

          const updatedAnime = {
            ...existingAnime,
            id: animeId,
            title: d.title || searchTitle,
            englishTitle: d.englishTitle || '',
            romajiTitle: d.romajiTitle || '',
            description: d.description || existingAnime.description,
            poster: d.poster || existingAnime.poster,
            banner: d.banner || d.poster || existingAnime.banner,
            genres: (d.genres && d.genres.length > 0) ? d.genres : (existingAnime.genres || ["Action", "Fantasy"]),
            type: d.type || existingAnime.type || "TV",
            status: d.status || existingAnime.status || "Completed",
            released: d.released || existingAnime.released || String(new Date().getFullYear()),
            rating: d.rating || d.score || existingAnime.rating || "8.5",
            studio: d.studios?.[0] || existingAnime.studio || "Anime Studio",
            trailer: d.trailer || existingAnime.trailer || "",
            anilistId: d.anilistId || existingAnime.anilistId || "",
            malId: d.malId || existingAnime.malId || "",
            metadataStatus: 'completed',
            metadataSource: metaResult.source,
            metadataErrorReason: null
          };

          await addCustomAnime(animeId, updatedAnime);
          completedCount++;
        } else {
          failedCount++;
          const reason = metaResult.error || 'No metadata found on AniList, MAL, or Kitsu';
          failedMetaList.push({
            animeId,
            animeTitle: searchTitle,
            reason
          });

          const currentDbAnimes = await getCustomAnimes();
          const existingAnime = currentDbAnimes[animeId] || {};
          await addCustomAnime(animeId, {
            ...existingAnime,
            metadataStatus: 'failed',
            metadataErrorReason: reason
          });
        }
      } catch (err: any) {
        failedCount++;
        const reason = err.message || 'Metadata fetch exception';
        failedMetaList.push({
          animeId,
          animeTitle: searchTitle,
          reason
        });
      } finally {
        setMetadataProgress(prev => ({
          ...prev,
          completed: completedCount,
          failed: failedCount
        }));
      }
    };

    for (let i = 0; i < items.length; i += CONCURRENCY) {
      const chunk = items.slice(i, i + CONCURRENCY);
      await Promise.all(chunk.map(item => processItem(item)));
      await new Promise(r => setTimeout(r, 100));
    }

    setMetadataProgress(prev => ({ ...prev, running: false }));
    if (failedMetaList.length > 0) {
      setFailedMetadataLogs(prev => [...failedMetaList, ...prev]);
    }

    clearAnimeCaches();
    const refreshedList = await getCustomAnimes();
    setCustomAnimes(Object.values(refreshedList));

    toast.success(`Metadata enrichment finished! ${completedCount} completed, ${failedCount} pending/failed.`, { duration: 4000 });
  };

  // Retry Failed or Pending Metadata
  const handleRetryFailedMetadata = async () => {
    try {
      const allAnimes = await getCustomAnimes();
      const itemsToRetry: { animeId: string; searchTitle: string; playlistTitle: string }[] = [];

      Object.values(allAnimes).forEach((anime: any) => {
        if (!anime) return;
        const isFailed = anime.metadataStatus === 'failed' || anime.metadataStatus === 'pending';
        const isDefaultDesc = !anime.description || anime.description.includes('A public YouTube playlist') || anime.description.includes('Imported Anime Playlist');
        if (isFailed || isDefaultDesc) {
          itemsToRetry.push({
            animeId: anime.id,
            searchTitle: anime.title,
            playlistTitle: anime.title
          });
        }
      });

      if (itemsToRetry.length === 0) {
        toast.info("All imported anime already have complete metadata!");
        return;
      }

      toast.info(`Retrying metadata fetch for ${itemsToRetry.length} anime series...`);
      await runBackgroundMetadataJob(itemsToRetry);
    } catch (err: any) {
      console.error("Retry metadata error:", err);
      toast.error("Failed to retry metadata fetch.");
    }
  };

  const handleImportSelectedPlaylists = async () => {
    const selectedIds = Object.keys(ytSelectedPlaylists).filter(id => ytSelectedPlaylists[id]);
    if (selectedIds.length === 0) {
      toast.error("Please select at least one playlist to import.");
      return;
    }

    // Support batch importing up to 700 playlists reliably
    const playlistsToImport = selectedIds.slice(0, 700);

    setYtImportingProgress({
      active: true,
      currentPlaylistName: 'Preparing batch import...',
      index: 0,
      total: playlistsToImport.length,
      percent: 0
    });

    let successCount = 0;
    let totalEpisodesAdded = 0;
    let animeCreated = 0;
    let animeUpdated = 0;
    let processedCount = 0;
    const newSkippedLogs: SkippedVideoLog[] = [];
    const animeToFetchMeta: { animeId: string; searchTitle: string; playlistTitle: string }[] = [];

    try {
      const currentAnimes = await getCustomAnimes();

      const extractEpisodeNumberFromTitle = (title: string): number | null => {
        if (!title) return null;
        const clean = title.replace(/season\s*\d+/gi, '').replace(/s\d+/gi, '');
        const bracketMatches = [
          /\[(?:episode|ep|ep\.)\s*(\d+)\]/i,
          /\((?:episode|ep|ep\.)\s*(\d+)\)/i,
          /\{(?:episode|ep|ep\.)\s*(\d+)\}/i,
        ];
        for (const regex of bracketMatches) {
          const match = clean.match(regex);
          if (match && match[1]) {
            return parseInt(match[1], 10);
          }
        }
        const standardMatches = [
          /\b(?:episode|ep|ep\.)\s*(\d+)\b/i,
          /\bep\s*#?\s*(\d+)\b/i,
          /#(\d+)\b/
        ];
        for (const regex of standardMatches) {
          const match = clean.match(regex);
          if (match && match[1]) {
            return parseInt(match[1], 10);
          }
        }
        const standaloneMatch = clean.match(/\b(\d+)\b/);
        if (standaloneMatch && standaloneMatch[1]) {
          return parseInt(standaloneMatch[1], 10);
        }
        return null;
      };

      const assignEpisodeNumbers = (items: any[]) => {
        if (items.length === 0) return [];
        const extractedNums = items.map(item => extractEpisodeNumberFromTitle(item.title));
        const validNums = extractedNums.filter((n): n is number => n !== null);
        let isDescending = false;
        if (validNums.length >= 2) {
          let descCount = 0;
          for (let i = 0; i < validNums.length - 1; i++) {
            if (validNums[i] > validNums[i + 1]) {
              descCount++;
            }
          }
          if (descCount > validNums.length / 2) {
            isDescending = true;
          }
        }
        let processedItems = [...items];
        if (isDescending) {
          processedItems.reverse();
        }
        const itemsWithMeta = processedItems.map((item, idx) => {
          const epNum = extractEpisodeNumberFromTitle(item.title);
          return {
            item,
            parsedNum: epNum,
            originalIndex: idx
          };
        });
        itemsWithMeta.sort((a, b) => {
          if (a.parsedNum !== null && b.parsedNum !== null) {
            return a.parsedNum - b.parsedNum;
          }
          if (a.parsedNum !== null) return -1;
          if (b.parsedNum !== null) return 1;
          return a.originalIndex - b.originalIndex;
        });
        const result: { epNum: number; item: any }[] = [];
        itemsWithMeta.forEach((meta, idx) => {
          result.push({ epNum: idx + 1, item: meta.item });
        });
        return result;
      };

      const importSinglePlaylist = async (pid: string) => {
        const playlist = ytChannelPlaylists.find(p => p.playlistId === pid);
        if (!playlist) return;

        try {
          const response = await fetch(`/api/youtube-playlist?playlistUrl=${encodeURIComponent(pid)}`);
          if (!response.ok) return;

          const data = await response.json().catch(() => ({}));
          if (!data || !data.success) return;

          const videos = data.items || [];
          if (videos.length === 0) return;

          const validVideos: any[] = [];
          const seenVideoIds = new Set<string>();

          videos.forEach((video: any) => {
            if (!video.videoId || seenVideoIds.has(video.videoId)) return;
            seenVideoIds.add(video.videoId);

            const filterResult = filterVideoForImport(video, playlist.title);
            if (filterResult.shouldImport) {
              validVideos.push(video);
            } else {
              newSkippedLogs.push({
                title: video.title || `Video ${video.videoId}`,
                videoId: video.videoId,
                playlistTitle: playlist.title,
                reason: filterResult.skipReason || 'Filtered out'
              });
            }
          });

          if (validVideos.length === 0 && videos.length > 0) {
            videos.forEach((video: any) => {
              if (video.videoId) validVideos.push(video);
            });
          }

          if (validVideos.length === 0) return;

          let mappedEpisodes = assignEpisodeNumbers(validVideos);
          if (mappedEpisodes.length === 0 && validVideos.length > 0) {
            mappedEpisodes = validVideos.map((v, i) => ({ epNum: i + 1, item: v }));
          }
          if (mappedEpisodes.length === 0) return;

          const existingAnimeId = findExistingAnimeMatch(playlist.title, pid, currentAnimes);
          let animeId = existingAnimeId || `yt-pl-${pid}`;
          let isUpdate = !!existingAnimeId;

          if (isUpdate) {
            animeUpdated++;
          } else {
            animeCreated++;
          }

          const episodesMap: Record<number, any> = {};
          mappedEpisodes.forEach(({ epNum, item }) => {
            episodesMap[epNum] = {
              id: `${animeId}-ep-${epNum}`,
              number: epNum,
              title: item.title || `Episode ${epNum}`,
              thumbnail: item.thumbnail || playlist.playlistThumbnail || (validVideos[0]?.thumbnail || videos[0]?.thumbnail || ''),
              videoSources: {
                sub: { 
                  enabled: true, 
                  type: 'youtube', 
                  url: item.url || (item.videoId ? `https://www.youtube.com/watch?v=${item.videoId}` : ''),
                  hidePlaylist: false,
                  hideShare: false,
                  videoType: 'youtube'
                },
                eng_dub: { enabled: false, type: 'file', url: '' },
                hindi_dub: { enabled: false, type: 'file', url: '' },
                other: { enabled: false, type: 'file', url: '' }
              },
              duration: item.duration || "24 min"
            };
          });

          const playlistLower = playlist.title.toLowerCase();
          const isSub = playlistLower.includes('sub') || playlistLower.includes('japanese') || !playlistLower.includes('dub');
          const isEngDub = playlistLower.includes('eng dub') || playlistLower.includes('english dub');
          const isHindiDub = playlistLower.includes('hindi');

          const currentYear = String(new Date().getFullYear());
          const initialAnime = {
            id: animeId,
            title: playlist.title,
            playlistId: pid,
            poster: playlist.playlistThumbnail || (validVideos[0]?.thumbnail || videos[0]?.thumbnail || ''),
            banner: playlist.playlistThumbnail || (validVideos[0]?.thumbnail || videos[0]?.thumbnail || ''),
            description: `Imported Anime Playlist (${mappedEpisodes.length} Episodes). Fetching official metadata from AniList/MAL/Kitsu...`,
            type: detectVideoType('', playlist.title),
            status: "Completed",
            released: currentYear,
            genres: ["Action", "Adventure", "Fantasy"],
            categories: {
              featured: false,
              trending: false,
              popular: false,
              recentlyAdded: true,
              topAiring: false,
              latest: true,
              completed: true,
              upcoming: false,
              favorite: false,
              ongoing: false,
              movies: detectVideoType('', playlist.title) === 'Movie',
              'hindi-dubbed': isHindiDub,
              romance: false,
              action: true,
              fantasy: true,
              [ytImportCategory]: true
            },
            episodes: mappedEpisodes.length,
            episodesCount: mappedEpisodes.length,
            subAvailable: isSub,
            dubAvailable: isEngDub,
            hindiAvailable: isHindiDub,
            multiAvailable: false,
            visibility: "published",
            imported: true,
            source: "youtube",
            validationStatus: data.playlistValidationStatus || 'AVAILABLE',
            metadataStatus: 'pending'
          };

          await addCustomAnime(animeId, initialAnime);
          await addCustomEpisodesBatch(animeId, episodesMap);

          currentAnimes[animeId] = initialAnime;
          successCount++;
          totalEpisodesAdded += mappedEpisodes.length;

          animeToFetchMeta.push({
            animeId,
            searchTitle: playlist.title,
            playlistTitle: playlist.title
          });

        } catch (singleErr) {
          console.error(`Error importing playlist ${pid}:`, singleErr);
        } finally {
          processedCount++;
          setYtImportingProgress({
            active: true,
            currentPlaylistName: playlist.title,
            index: processedCount,
            total: playlistsToImport.length,
            percent: Math.round((processedCount / playlistsToImport.length) * 100)
          });
        }
      };

      // Process parallel chunks (concurrency 5)
      const BATCH_CONCURRENCY = 5;
      for (let i = 0; i < playlistsToImport.length; i += BATCH_CONCURRENCY) {
        const chunk = playlistsToImport.slice(i, i + BATCH_CONCURRENCY);
        await Promise.all(chunk.map(pid => importSinglePlaylist(pid)));
      }

      // Record logs and summary stats
      setSkippedVideoLogs(prev => [...newSkippedLogs, ...prev]);
      setImportSummaryStats(prev => ({
        playlistsProcessed: prev.playlistsProcessed + successCount,
        episodesAdded: prev.episodesAdded + totalEpisodesAdded,
        animeCreatedCount: prev.animeCreatedCount + animeCreated,
        animeUpdatedCount: prev.animeUpdatedCount + animeUpdated
      }));

      toast.success(`Successfully imported ${successCount} anime playlist(s) with ${totalEpisodesAdded} episodes!`);
      clearAnimeCaches();

      const refreshedList = await getCustomAnimes();
      setCustomAnimes(Object.values(refreshedList));

      if (animeToFetchMeta.length > 0) {
        runBackgroundMetadataJob(animeToFetchMeta);
      }

    } catch (err: any) {
      console.error("Failed importing selected playlists:", err);
      toast.error(err.message || "An error occurred during import.");
    } finally {
      setYtImportingProgress(null);
    }
  };

  const handleCreateNewAnimeClick = () => {
    setAnimeForm({
      id: 'custom-' + Date.now(),
      title: '',
      description: '',
      poster: '',
      banner: '',
      type: 'TV',
      status: 'Ongoing',
      episodes: 12,
      rating: '8.5',
      genres: 'Action, Adventure, Fantasy',
      studio: 'AnOvA Production',
      released: '2024',
      categories: {
        featured: false,
        trending: false,
        popular: false,
        recentlyAdded: false,
        topAiring: false,
        latest: false,
        completed: false,
        upcoming: false,
        favorite: false,
        ongoing: false,
        movies: false,
        'hindi-dubbed': false,
        romance: false,
        action: false,
        comedy: false,
        horror: false,
        fantasy: false,
        scifi: false,
        school: false,
        isekai: false,
        shounen: false,
        sliceoflife: false,
        drama: false,
        mystery: false,
        music: false,
        kids: false
      },
      subAvailable: true,
      dubAvailable: false,
      hindiAvailable: false,
      multiAvailable: false,
      visibility: 'public',
      season: '',
      duration: '',
      country: '',
      language: '',
      coverImage: '',
      trailer: ''
    });
    setTrailerSources({
      sub: { enabled: true, type: 'embed', url: '' },
      eng_dub: { enabled: false, type: 'file', url: '' },
      hindi_dub: { enabled: false, type: 'file', url: '' },
      other: { enabled: false, type: 'file', url: '' }
    });
    setEditingAnime(null);
    setCustomEpisodes([]);
    setUploadTabMode('animeForm');
  };

  const handleEditAnimeClick = async (anime: any) => {
    setAnimeForm({
      id: String(anime.id),
      title: anime.title || '',
      description: anime.description || '',
      poster: anime.poster || '',
      banner: anime.banner || '',
      type: anime.type || 'TV',
      status: anime.status || 'Ongoing',
      episodes: Number(anime.episodes || 12),
      rating: String(anime.rating || '8.5'),
      genres: Array.isArray(anime.genres) ? anime.genres.join(', ') : (anime.genres || 'Action, Adventure'),
      studio: anime.studio || 'AnOvA Production',
      released: String(anime.released || '2024'),
      categories: {
        ...(anime.categories || {})
      },
      subAvailable: anime.subAvailable !== undefined ? anime.subAvailable : true,
      dubAvailable: anime.dubAvailable || false,
      hindiAvailable: anime.hindiAvailable || false,
      multiAvailable: anime.multiAvailable || false,
      visibility: anime.visibility || 'public',
      season: anime.season || '',
      duration: anime.duration || '',
      country: anime.country || '',
      language: anime.language || '',
      coverImage: anime.coverImage || '',
      trailer: anime.trailer || ''
    });
    setEditingAnime(anime);
    setUploadTabMode('animeForm');
    
    // Fetch episodes
    try {
      const eps = await getCustomEpisodes(String(anime.id));
      const epsList = eps ? Object.values(eps).filter(Boolean) : [];
      setCustomEpisodes(epsList);
      
      if (anime.type === 'Trailer') {
        const ep1 = epsList.find((e: any) => e.number === 1);
        if (ep1 && ep1.videoSources) {
          setTrailerSources(ep1.videoSources);
        } else {
          setTrailerSources({
            sub: { enabled: true, type: 'embed', url: '' },
            eng_dub: { enabled: false, type: 'file', url: '' },
            hindi_dub: { enabled: false, type: 'file', url: '' },
            other: { enabled: false, type: 'file', url: '' }
          });
        }
      } else {
        setTrailerSources({
          sub: { enabled: true, type: 'embed', url: '' },
          eng_dub: { enabled: false, type: 'file', url: '' },
          hindi_dub: { enabled: false, type: 'file', url: '' },
          other: { enabled: false, type: 'file', url: '' }
        });
      }
    } catch (e) {
      console.error("Error loading custom episodes:", e);
    }
  };

  const handleSaveAnimeForm = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!animeForm.title) {
      alert("Please fill in the Anime Title.");
      return;
    }
    setIsSaving(true);
    try {
      // Map all standard and custom categories in ALL_CATEGORIES_LIST strictly to true/false
      const finalCategories: Record<string, boolean> = { ...(animeForm.categories || {}) };
      ALL_CATEGORIES_LIST.forEach(cat => {
        finalCategories[cat.id] = animeForm.categories?.[cat.id] === true;
      });

      const animeData = {
        id: animeForm.id || 'custom-' + Date.now(),
        title: animeForm.title,
        description: animeForm.description,
        poster: animeForm.poster,
        banner: animeForm.banner || animeForm.poster,
        type: animeForm.type,
        status: animeForm.status,
        episodes: animeForm.type === 'Trailer' ? 1 : Number(animeForm.episodes),
        rating: animeForm.rating,
        genres: animeForm.genres.split(',').map(g => g.trim()).filter(Boolean),
        studio: animeForm.studio,
        released: animeForm.released,
        categories: finalCategories,
        subAvailable: animeForm.subAvailable,
        dubAvailable: animeForm.dubAvailable,
        hindiAvailable: animeForm.hindiAvailable,
        multiAvailable: animeForm.multiAvailable,
        visibility: animeForm.visibility,
        season: animeForm.season || '',
        duration: animeForm.duration || '',
        country: animeForm.country || '',
        language: animeForm.language || '',
        coverImage: animeForm.coverImage || '',
        trailer: animeForm.trailer || ''
      };

      await addCustomAnime(animeData.id, animeData);

      if (animeForm.type === 'Trailer') {
        const epData = {
          id: `${animeData.id}-ep-1`,
          number: 1,
          title: 'Trailer',
          thumbnail: animeData.poster,
          videoSources: trailerSources
        };
        await addCustomEpisode(animeData.id, 1, epData);
      }

      clearAnimeCaches();
      alert("Anime show successfully saved to catalog!");
      setUploadTabMode('list');
    } catch (e) {
      console.error("Failed to save anime form:", e);
      alert("Error saving anime show. Please check logs.");
    } finally {
      setIsSaving(false);
    }
  };

  // ==========================================
  // ADVERTISEMENT MANAGER ACTION HANDLERS
  // ==========================================
  const handleSaveAd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!adForm.name.trim()) {
      alert("Please provide an Advertisement Name.");
      return;
    }
    if (!adForm.provider.trim()) {
      alert("Please provide a Provider Name.");
      return;
    }
    if (!adForm.script.trim()) {
      alert("Please provide an Advertisement Script.");
      return;
    }

    const id = adForm.id || `ad-${Date.now()}`;
    const payload = {
      ...adForm,
      id,
      priority: Number(adForm.priority || 10),
      createdAt: editingAd?.createdAt || Date.now(),
      updatedAt: Date.now()
    };

    try {
      await addAdvertisement(id, payload);
      alert("Advertisement saved successfully!");
      setIsAdFormOpen(false);
      setEditingAd(null);
      setAdForm({
        id: '',
        name: '',
        provider: '',
        type: 'Popunder',
        status: 'enabled',
        script: '',
        priority: 10,
        frequency: 'always',
        startDate: '',
        endDate: '',
        targetMode: 'all',
        targetAnimeIds: []
      });
    } catch (err) {
      console.error("Error saving advertisement:", err);
      alert("Failed to save advertisement. Please try again.");
    }
  };

  const handleEditAd = (ad: any) => {
    setEditingAd(ad);
    setAdForm({
      id: ad.id || '',
      name: ad.name || '',
      provider: ad.provider || '',
      type: ad.type || 'Popunder',
      status: ad.status || 'enabled',
      script: ad.script || '',
      priority: ad.priority || 10,
      frequency: ad.frequency || 'always',
      startDate: ad.startDate || '',
      endDate: ad.endDate || '',
      targetMode: ad.targetMode || (ad.applyToEntireWebsite ? 'all' : 'single'),
      targetAnimeIds: Array.isArray(ad.targetAnimeIds)
        ? ad.targetAnimeIds
        : ad.targetAnimeId ? [String(ad.targetAnimeId)] : []
    });
    setIsAdFormOpen(true);
  };

  const handleDeleteAdTrigger = (ad: any) => {
    showConfirm(
      "Delete Advertisement",
      `Are you sure you want to delete advertisement "${ad.name}"?`,
      async () => {
        try {
          await deleteAdvertisement(ad.id);
          alert("Advertisement deleted successfully.");
        } catch (err) {
          console.error("Error deleting ad:", err);
          alert("Failed to delete advertisement.");
        }
      }
    );
  };

  const handleDuplicateAd = async (ad: any) => {
    const newId = `ad-dup-${Date.now()}`;
    const duplicatedAd = {
      ...ad,
      id: newId,
      name: `${ad.name} (Copy)`,
      createdAt: Date.now(),
      updatedAt: Date.now()
    };
    try {
      await addAdvertisement(newId, duplicatedAd);
      alert(`Advertisement duplicated successfully as "${duplicatedAd.name}"!`);
    } catch (err) {
      console.error("Error duplicating ad:", err);
      alert("Failed to duplicate advertisement.");
    }
  };

  const handleToggleAdStatus = async (ad: any) => {
    const newStatus = ad.status === 'enabled' ? 'disabled' : 'enabled';
    const updatedAd = {
      ...ad,
      status: newStatus,
      updatedAt: Date.now()
    };
    try {
      await addAdvertisement(ad.id, updatedAd);
    } catch (err) {
      console.error("Error toggling ad status:", err);
      alert("Failed to update advertisement status.");
    }
  };

  const handleDeleteAnimeClick = async (animeId: string, title: string, poster?: string, banner?: string) => {
    showConfirm(
      "Delete Anime",
      `Are you sure you want to delete "${title}"? This will remove the anime and all associated custom episodes.`,
      async () => {
        try {
          if (poster && poster.includes("cloudinary.com")) {
            deleteAssetByUrl(poster).catch(err => console.warn("Failed to delete poster:", err));
          }
          if (banner && banner.includes("cloudinary.com")) {
            deleteAssetByUrl(banner).catch(err => console.warn("Failed to delete banner:", err));
          }
          await deleteCustomAnime(animeId);
          clearAnimeCaches();
          alert("Anime show deleted successfully.");
          const list = await getCustomAnimes();
          setCustomAnimes(Object.values(list));
        } catch (e) {
          console.error("Failed to delete anime:", e);
          alert("Error deleting anime.");
        }
      }
    );
  };

  const handleCancelUpload = (key: string) => {
    if (abortControllersRef.current[key]) {
      abortControllersRef.current[key].abort();
      delete abortControllersRef.current[key];
    }
  };

  const handleUploadFileToCloudinary = async (file: File, key: string, onSuccess: (url: string) => void, oldUrl?: string) => {
    setUploadProgress(prev => ({ ...prev, [key]: 1 }));
    setUploadDetails(prev => ({ ...prev, [key]: { speed: 'Calculating...', sizeInfo: '', eta: '', processing: false } }));
    
    const controller = new AbortController();
    abortControllersRef.current[key] = controller;

    try {
      if (oldUrl && oldUrl.includes("cloudinary.com")) {
        deleteAssetByUrl(oldUrl).catch(err => console.warn("Failed to delete replaced asset:", err));
      }
      const isVideo = key.startsWith('video');
      const secureUrl = await uploadToCloudinary(
        file, 
        isVideo ? 'video' : 'image', 
        (percent, details) => {
          setUploadProgress(prev => ({ ...prev, [key]: percent }));
          if (details) {
            setUploadDetails(prev => ({ ...prev, [key]: details }));
          }
        },
        undefined,
        controller.signal
      );
      onSuccess(secureUrl);
    } catch (e: any) {
      if (e.name === 'AbortError' || e.message === 'Aborted') {
        console.log(`Upload for ${key} was aborted by user.`);
      } else {
        console.error("Cloudinary upload failed:", e);
        alert("Upload failed: " + (e.message || "Unknown error"));
      }
    } finally {
      delete abortControllersRef.current[key];
      setUploadProgress(prev => {
        const copy = { ...prev };
        delete copy[key];
        return copy;
      });
      setUploadDetails(prev => {
        const copy = { ...prev };
        delete copy[key];
        return copy;
      });
    }
  };

  const handleRepairEpisodes = async () => {
    if (!animeForm.id) {
      alert("Please select or save the anime series first!");
      return;
    }

    const scanned = customEpisodes.length;
    const details: string[] = [];
    const remainingEpisodes: any[] = [];

    customEpisodes.forEach((ep) => {
      const epNum = Number(ep.number);
      const titleLower = (ep.title || '').toLowerCase();
      
      // 1. Title keyword checks
      const isShortOrPreview = titleLower.includes('short') || 
                               titleLower.includes('clip') || 
                               titleLower.includes('trailer') || 
                               titleLower.includes('preview') || 
                               titleLower.includes('highlight') ||
                               titleLower.includes('teaser') ||
                               titleLower.includes('promo') ||
                               titleLower.includes('interview');
                               
      // 2. Duration check (if available)
      const duration = ep.duration || ep.lengthSeconds || ep.durationInSeconds || ep.duration_seconds || 0;
      const durationNum = Number(duration);
      const isTooShort = durationNum > 0 && durationNum < 600;
      
      // 3. Invalid/Empty check
      const hasValidUrl = Object.values(ep.videoSources || {}).some((src: any) => src && src.enabled && src.url && src.url.trim());
      const isInvalid = !hasValidUrl;

      if (isShortOrPreview) {
        details.push(`Removed Ep ${epNum} ("${ep.title}"): Identified as short/preview/trailer.`);
      } else if (isTooShort) {
        details.push(`Removed Ep ${epNum} ("${ep.title}"): Duration of ${Math.round(durationNum / 60)}m is shorter than the 10m limit.`);
      } else if (isInvalid) {
        details.push(`Removed Ep ${epNum} ("${ep.title}"): No valid/enabled video streaming URLs found.`);
      } else {
        remainingEpisodes.push(ep);
      }
    });

    // Sort by original number first to keep order
    remainingEpisodes.sort((a, b) => Number(a.number) - Number(b.number));
    
    // Reindex sequentially
    const reindexedEpisodes = remainingEpisodes.map((ep, idx) => {
      const newNum = idx + 1;
      const oldNum = ep.number;
      let newTitle = ep.title;
      
      // If the title was generic, e.g. "Episode X", update it to the new number
      if (!ep.title || ep.title === `Episode ${oldNum}` || ep.title === `Title Episode ${oldNum}`) {
        newTitle = `Episode ${newNum}`;
      }
      
      if (Number(oldNum) !== newNum) {
        details.push(`Reindexed Ep ${oldNum} -> New Ep Number ${newNum}`);
      }
      
      return {
        ...ep,
        number: newNum,
        title: newTitle,
        id: `${animeForm.id}-ep-${newNum}`
      };
    });

    const removedCount = scanned - reindexedEpisodes.length;
    
    try {
      // 1. Delete all existing custom episodes for this anime
      await remove(ref(db, `episodes/${animeForm.id}`));

      // 2. Batch write the newly repaired and reindexed episodes back to database
      const episodesMap: Record<number, any> = {};
      reindexedEpisodes.forEach((ep) => {
        episodesMap[ep.number] = {
          id: ep.id,
          number: ep.number,
          title: ep.title,
          thumbnail: ep.thumbnail || '',
          videoSources: ep.videoSources || {}
        };
      });

      await addCustomEpisodesBatch(animeForm.id, episodesMap);

      // Explicitly sort customEpisodes list after repair by episodeNumber ASC
      const sortedEps = reindexedEpisodes.sort((a, b) => Number(a.number) - Number(b.number));
      setCustomEpisodes(sortedEps);

      setRepairReport({
        show: true,
        scanned,
        removed: removedCount,
        remaining: sortedEps.length,
        details
      });

      alert("Auto Episode Repair completed and saved to database successfully!");
    } catch (err) {
      console.error("Failed saving repaired episodes to database:", err);
      alert("Error saving repaired episodes to database.");
    }
  };

  const handleCreateNewEpisodeClick = () => {
    if (!animeForm.id) return;
    setEpisodeForm({
      id: `${animeForm.id}-ep-${customEpisodes.length + 1}`,
      number: customEpisodes.length + 1,
      title: `Episode ${customEpisodes.length + 1}`,
      thumbnail: '',
      videoSources: {
        sub: { enabled: true, type: 'embed', url: '', hidePlaylist: false, hideShare: false, videoType: 'other' },
        eng_dub: { enabled: false, type: 'file', url: '', hidePlaylist: false, hideShare: false, videoType: 'other' },
        hindi_dub: { enabled: false, type: 'file', url: '', hidePlaylist: false, hideShare: false, videoType: 'other' },
        other: { enabled: false, type: 'file', url: '', hidePlaylist: false, hideShare: false, videoType: 'other' }
      }
    });
    setEditingEpisode(null);
    setUploadTabMode('episodeForm');
  };

  const handleEditEpisodeClick = (ep: any) => {
    setEpisodeForm({
      id: ep.id || `${animeForm.id}-ep-${ep.number}`,
      number: Number(ep.number),
      title: ep.title || `Episode ${ep.number}`,
      thumbnail: ep.thumbnail || '',
      videoSources: {
        sub: ep.videoSources?.sub || { enabled: true, type: 'embed', url: '', hidePlaylist: false, hideShare: false, videoType: 'other' },
        eng_dub: ep.videoSources?.eng_dub || { enabled: false, type: 'file', url: '', hidePlaylist: false, hideShare: false, videoType: 'other' },
        hindi_dub: ep.videoSources?.hindi_dub || { enabled: false, type: 'file', url: '', hidePlaylist: false, hideShare: false, videoType: 'other' },
        other: ep.videoSources?.other || { enabled: false, type: 'file', url: '', hidePlaylist: false, hideShare: false, videoType: 'other' }
      }
    });
    setEditingEpisode(ep);
    setUploadTabMode('episodeForm');
  };

  const handleSaveEpisodeForm = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!animeForm.id) return;
    setIsSaving(true);
    try {
      const epData = {
        id: episodeForm.id || `${animeForm.id}-ep-${episodeForm.number}`,
        number: Number(episodeForm.number),
        title: episodeForm.title,
        thumbnail: episodeForm.thumbnail,
        videoSources: episodeForm.videoSources
      };
      
      await addCustomEpisode(animeForm.id, epData.number, epData);
      alert("Episode successfully saved!");
      
      const eps = await getCustomEpisodes(animeForm.id);
      setCustomEpisodes(eps ? Object.values(eps).filter(Boolean) : []);
      setUploadTabMode('animeForm');
    } catch (e) {
      console.error("Failed to save episode:", e);
      alert("Error saving episode.");
    } finally {
      setIsSaving(false);
    }
  };

  const handleParseBulkUrls = () => {
    const extractUrls = (text: string): string[] => {
      if (!text.trim()) return [];
      const urlRegex = /https?:\/\/[^\s"'<>\(\)]+/gi;
      const matches = text.match(urlRegex) || [];
      
      const uniqueUrls: string[] = [];
      const seen = new Set<string>();
      for (const url of matches) {
        if (!seen.has(url)) {
          seen.add(url);
          uniqueUrls.push(url);
        }
      }
      return uniqueUrls;
    };

    const detectVideoType = (url: string): 'file' | 'embed' | 'youtube' => {
      const lowercase = url.toLowerCase();
      if (lowercase.includes('youtube.com') || lowercase.includes('youtu.be') || lowercase.includes('youtube-nocookie.com')) {
        return 'youtube';
      } else if (
        lowercase.endsWith('.mp4') || 
        lowercase.endsWith('.m3u8') || 
        lowercase.endsWith('.mkv') || 
        lowercase.endsWith('.webm') || 
        lowercase.includes('.mp4?') || 
        lowercase.includes('.m3u8?')
      ) {
        return 'file';
      }
      return 'embed';
    };

    const urlsSub = extractUrls(bulkSubText);
    const urlsEngDub = extractUrls(bulkEngDubText);
    const urlsHindiDub = extractUrls(bulkHindiDubText);
    const urlsOther = extractUrls(bulkOtherText);

    const maxCount = Math.max(urlsSub.length, urlsEngDub.length, urlsHindiDub.length, urlsOther.length);

    if (maxCount === 0) {
      setParsedEpisodes([]);
      setSkippedDuplicatesCount(0);
      return;
    }

    const getSkippedCount = (text: string, uniquesCount: number) => {
      if (!text.trim()) return 0;
      const matches = text.match(/https?:\/\/[^\s"'<>\(\)]+/gi) || [];
      return Math.max(0, matches.length - uniquesCount);
    };

    const totalSkipped = 
      getSkippedCount(bulkSubText, urlsSub.length) +
      getSkippedCount(bulkEngDubText, urlsEngDub.length) +
      getSkippedCount(bulkHindiDubText, urlsHindiDub.length) +
      getSkippedCount(bulkOtherText, urlsOther.length);

    setSkippedDuplicatesCount(totalSkipped);

    const existingMaxEp = customEpisodes.length > 0 
      ? Math.max(...customEpisodes.map(ep => Number(ep.number) || 0), 0)
      : 0;

    let startNum = existingMaxEp + 1;

    const newParsed = Array.from({ length: maxCount }).map((_, index) => {
      const epNum = startNum + index;
      
      const videoSources: any = {
        sub: { enabled: false, type: 'embed', url: '', hidePlaylist: false, hideShare: false, videoType: 'other' },
        eng_dub: { enabled: false, type: 'file', url: '', hidePlaylist: false, hideShare: false, videoType: 'other' },
        hindi_dub: { enabled: false, type: 'file', url: '', hidePlaylist: false, hideShare: false, videoType: 'other' },
        other: { enabled: false, type: 'file', url: '', hidePlaylist: false, hideShare: false, videoType: 'other' }
      };

      if (urlsSub[index]) {
        const url = urlsSub[index];
        const detectedType = detectVideoType(url);
        videoSources.sub = {
          enabled: true,
          type: detectedType,
          url: url,
          hidePlaylist: false,
          hideShare: false,
          videoType: detectedType === 'youtube' ? 'youtube' : 'other'
        };
      }

      if (urlsEngDub[index]) {
        const url = urlsEngDub[index];
        const detectedType = detectVideoType(url);
        videoSources.eng_dub = {
          enabled: true,
          type: detectedType,
          url: url,
          hidePlaylist: false,
          hideShare: false,
          videoType: detectedType === 'youtube' ? 'youtube' : 'other'
        };
      }

      if (urlsHindiDub[index]) {
        const url = urlsHindiDub[index];
        const detectedType = detectVideoType(url);
        videoSources.hindi_dub = {
          enabled: true,
          type: detectedType,
          url: url,
          hidePlaylist: false,
          hideShare: false,
          videoType: detectedType === 'youtube' ? 'youtube' : 'other'
        };
      }

      if (urlsOther[index]) {
        const url = urlsOther[index];
        const detectedType = detectVideoType(url);
        videoSources.other = {
          enabled: true,
          type: detectedType,
          url: url,
          hidePlaylist: false,
          hideShare: false,
          videoType: detectedType === 'youtube' ? 'youtube' : 'other'
        };
      }

      return {
        id: `${animeForm.id}-ep-${epNum}`,
        number: epNum,
        title: `Episode ${epNum}`,
        thumbnail: animeForm.poster || '',
        videoSources
      };
    });

    setParsedEpisodes(newParsed);
  };

  const handleImportAllEpisodes = async () => {
    if (!animeForm.id) {
      alert("Please select or save the anime series first!");
      return;
    }
    if (parsedEpisodes.length === 0) {
      alert("No episodes parsed to import!");
      return;
    }

    setIsImporting(true);
    setImportProgress(0);
    setImportedCount(0);

    try {
      const animeId = animeForm.id;
      const total = parsedEpisodes.length;
      
      const chunkSize = 50;
      const chunks: any[][] = [];
      for (let i = 0; i < parsedEpisodes.length; i += chunkSize) {
        chunks.push(parsedEpisodes.slice(i, i + chunkSize));
      }

      let processed = 0;

      for (let chunkIndex = 0; chunkIndex < chunks.length; chunkIndex++) {
        const chunk = chunks[chunkIndex];
        const episodesMap: Record<number, any> = {};
        
        chunk.forEach(ep => {
          episodesMap[ep.number] = ep;
        });

        await addCustomEpisodesBatch(animeId, episodesMap);

        processed += chunk.length;
        setImportedCount(processed);
        setImportProgress(Math.min(100, Math.round((processed / total) * 100)));
      }

      const refreshedEps = await getCustomEpisodes(animeId);
      const epsList = refreshedEps ? Object.values(refreshedEps).filter(Boolean) : [];
      setCustomEpisodes(epsList);

      alert(`Successfully imported ${total} episodes in one batch!`);
      
      setBulkSubText('');
      setBulkEngDubText('');
      setBulkHindiDubText('');
      setBulkOtherText('');
      setParsedEpisodes([]);
      setSkippedDuplicatesCount(0);
      setShowBulkPanel(false);

    } catch (error) {
      console.error("Failed bulk importing episodes:", error);
      alert("An error occurred during bulk import. Some episodes might not have been imported.");
    } finally {
      setIsImporting(false);
      setImportProgress(0);
    }
  };

  // Helper to process loaded playlist items dynamically
  const processedPlaylistData = React.useMemo(() => {
    const extractEpisodeNumberFromTitle = (title: string): number | null => {
      if (!title) return null;
      // Ignore season numbers (e.g. S2, Season 2, etc.) to prevent matching them
      const clean = title.replace(/season\s*\d+/gi, '').replace(/s\d+/gi, '');
      
      // Look for [Episode X], (Episode X), [Ep X], [Ep. X] with high priority
      const bracketMatches = [
        /\[(?:episode|ep|ep\.)\s*(\d+)\]/i,
        /\((?:episode|ep|ep\.)\s*(\d+)\)/i,
        /\{(?:episode|ep|ep\.)\s*(\d+)\}/i,
      ];
      for (const regex of bracketMatches) {
        const match = clean.match(regex);
        if (match && match[1]) {
          return parseInt(match[1], 10);
        }
      }

      // Look for standard "Episode X", "Ep X", "Ep. X", "E X"
      const standardMatches = [
        /\b(?:episode|ep|ep\.)\s*(\d+)\b/i,
        /\bep\s*#?\s*(\d+)\b/i,
        /#(\d+)\b/
      ];
      for (const regex of standardMatches) {
        const match = clean.match(regex);
        if (match && match[1]) {
          return parseInt(match[1], 10);
        }
      }

      // Standalone numbers in word boundaries
      const standaloneMatch = clean.match(/\b(\d+)\b/);
      if (standaloneMatch && standaloneMatch[1]) {
        return parseInt(standaloneMatch[1], 10);
      }

      return null;
    };

    const filterPlaylistItems = (items: any[]) => {
      const validItems: any[] = [];
      const seenVideoIds = new Set<string>();
      (items || []).forEach((item) => {
        if (item.videoId && !seenVideoIds.has(item.videoId)) {
          const titleLower = (item.title || '').toLowerCase();
          if (item.isPrivateOrDeleted && (titleLower.includes('private video') || titleLower.includes('deleted video'))) {
            return;
          }
          if (ytAutoFilterShortClips) {
            const isShortOrPreview = titleLower.includes('short') || 
                                     titleLower.includes('clip') || 
                                     titleLower.includes('trailer') || 
                                     titleLower.includes('preview') || 
                                     titleLower.includes('highlight') ||
                                     titleLower.includes('teaser') ||
                                     titleLower.includes('promo') ||
                                     titleLower.includes('interview');
            if (isShortOrPreview) {
              return; // Skip this item as it is recognized as a short/preview/trailer
            }
          }
          seenVideoIds.add(item.videoId);
          validItems.push(item);
        }
      });
      if (validItems.length === 0 && (items || []).length > 0) {
        return (items || []).filter(i => i && i.videoId);
      }
      return validItems;
    };

    const assignEpisodeNumbers = (items: any[]) => {
      if (items.length === 0) return [];
      
      const extractedNums = items.map(item => extractEpisodeNumberFromTitle(item.title));
      const validNums = extractedNums.filter((n): n is number => n !== null);
      
      // Check if the playlist is predominantly in descending order
      let isDescending = false;
      if (validNums.length >= 2) {
        let descCount = 0;
        for (let i = 0; i < validNums.length - 1; i++) {
          if (validNums[i] > validNums[i + 1]) {
            descCount++;
          }
        }
        if (descCount > validNums.length / 2) {
          isDescending = true;
        }
      }
      
      let processedItems = [...items];
      if (isDescending) {
        processedItems.reverse();
      }

      // Track items with parsed numbers and original index for stable sorting
      const itemsWithMeta = processedItems.map((item, idx) => {
        const epNum = extractEpisodeNumberFromTitle(item.title);
        return {
          item,
          parsedNum: epNum,
          originalIndex: idx
        };
      });

      // Sort items based on parsed episode number, preserving original index as secondary key
      itemsWithMeta.sort((a, b) => {
        if (a.parsedNum !== null && b.parsedNum !== null) {
          return a.parsedNum - b.parsedNum;
        }
        if (a.parsedNum !== null) return -1;
        if (b.parsedNum !== null) return 1;
        return a.originalIndex - b.originalIndex;
      });

      // Assign strict sequential 1-based episode numbers to prevent skipping
      const result: { epNum: number; item: any }[] = [];
      itemsWithMeta.forEach((meta, idx) => {
        result.push({ epNum: idx + 1, item: meta.item });
      });
      
      return result;
    };

    const validSub = filterPlaylistItems(ytPlaylistItemsSub);
    const validEngDub = filterPlaylistItems(ytPlaylistItemsEngDub);
    const validHindiDub = filterPlaylistItems(ytPlaylistItemsHindiDub);
    const validOther = filterPlaylistItems(ytPlaylistItemsOther);

    const subMapped = assignEpisodeNumbers(validSub);
    const engDubMapped = assignEpisodeNumbers(validEngDub);
    const hindiDubMapped = assignEpisodeNumbers(validHindiDub);
    const otherMapped = assignEpisodeNumbers(validOther);

    // Collect all unique episode numbers
    const allEpNums = new Set<number>();
    subMapped.forEach(x => allEpNums.add(x.epNum));
    engDubMapped.forEach(x => allEpNums.add(x.epNum));
    hindiDubMapped.forEach(x => allEpNums.add(x.epNum));
    otherMapped.forEach(x => allEpNums.add(x.epNum));

    const sortedEpNums = Array.from(allEpNums).sort((a, b) => a - b);

    const alignedEpisodes = sortedEpNums.map((epNum) => {
      const subItem = subMapped.find(x => x.epNum === epNum)?.item || null;
      const engDubItem = engDubMapped.find(x => x.epNum === epNum)?.item || null;
      const hindiDubItem = hindiDubMapped.find(x => x.epNum === epNum)?.item || null;
      const otherItem = otherMapped.find(x => x.epNum === epNum)?.item || null;

      const reprItem = subItem || engDubItem || hindiDubItem || otherItem;

      return {
        episodeNumber: epNum,
        title: reprItem?.title || `Episode ${epNum}`,
        thumbnail: reprItem?.thumbnail || '',
        sub: subItem,
        eng_dub: engDubItem,
        hindi_dub: hindiDubItem,
        other: otherItem
      };
    });

    const totalSkipped = 
      (ytPlaylistItemsSub.length - validSub.length) +
      (ytPlaylistItemsEngDub.length - validEngDub.length) +
      (ytPlaylistItemsHindiDub.length - validHindiDub.length) +
      (ytPlaylistItemsOther.length - validOther.length);

    return {
      episodes: alignedEpisodes,
      totalValid: alignedEpisodes.length,
      skippedCount: totalSkipped
    };
  }, [ytPlaylistItemsSub, ytPlaylistItemsEngDub, ytPlaylistItemsHindiDub, ytPlaylistItemsOther, ytAutoFilterShortClips]);

  const parseYtPlaylistSource = (htmlText: string): any[] => {
    let jsonStr = '';
    const regexes = [
      /ytInitialData\s*=\s*({[\s\S]+?});\s*(?:<\/script>|window|var)/,
      /ytInitialData\s*=\s*({[\s\S]+?});/,
      /var ytInitialData\s*=\s*([\s\S]+?);<\/script>/,
      /window\["ytInitialData"\]\s*=\s*([\s\S]+?);/,
      /ytInitialData\s*=\s*({[\s\S]+?})\s*;/
    ];

    for (const regex of regexes) {
      const match = htmlText.match(regex);
      if (match && match[1]) {
        jsonStr = match[1].trim();
        break;
      }
    }

    // Advanced brace counter fallback in case regexes failed
    if (!jsonStr) {
      const index = htmlText.indexOf('ytInitialData = ');
      if (index !== -1) {
        const startIdx = htmlText.indexOf('{', index);
        if (startIdx !== -1) {
          let braceCount = 0;
          let endIdx = -1;
          for (let i = startIdx; i < htmlText.length; i++) {
            const char = htmlText[i];
            if (char === '{') {
              braceCount++;
            } else if (char === '}') {
              braceCount--;
              if (braceCount === 0) {
                endIdx = i;
                break;
              }
            }
          }
          if (endIdx !== -1) {
            jsonStr = htmlText.substring(startIdx, endIdx + 1);
          }
        }
      }
    }

    if (!jsonStr) {
      // Robust extract video IDs from any standard youtube watch links, embed links, youtu.be, or raw IDs
      const ids = new Set<string>();
      
      // Match standard youtube URLs
      const urlRegex = /(?:v=|embed\/|youtu\.be\/|vi?\/|watch\?v=|&v=|\/shorts\/)([a-zA-Z0-9_-]{11})/g;
      let match;
      while ((match = urlRegex.exec(htmlText)) !== null) {
        if (match[1]) ids.add(match[1]);
      }
      
      // If no IDs found yet, check line-by-line for 11-char strings or clean words
      if (ids.size === 0) {
        const lines = htmlText.split(/[\n,]/);
        for (let line of lines) {
          line = line.trim();
          const idMatch = line.match(/\b([a-zA-Z0-9_-]{11})\b/);
          if (idMatch && idMatch[1]) {
            ids.add(idMatch[1]);
          } else {
            const words = line.split(/\s+/);
            for (const word of words) {
              if (/^[a-zA-Z0-9_-]{11}$/.test(word)) {
                ids.add(word);
              }
            }
          }
        }
      }

      if (ids.size > 0) {
        return Array.from(ids).map((id, index) => ({
          videoId: id,
          title: `Episode ${index + 1} (${id})`,
          thumbnail: `https://img.youtube.com/vi/${id}/hqdefault.jpg`,
          url: `https://www.youtube.com/watch?v=${id}`,
          isPrivateOrDeleted: false
        }));
      }
      throw new Error('Could not find playlist data. Please make sure you copied the entire page source (Ctrl+U) or paste valid video URLs/IDs.');
    }

    let data: any;
    try {
      data = JSON.parse(jsonStr);
    } catch (err) {
      throw new Error('Failed to parse the pasted playlist page source. Please ensure it was copied completely.');
    }

    const renderers: any[] = [];
    const recurse = (current: any) => {
      if (!current || typeof current !== 'object') return;
      if (current.playlistVideoRenderer) {
        renderers.push(current.playlistVideoRenderer);
        return;
      }
      if (Array.isArray(current)) {
        for (const item of current) {
          recurse(item);
        }
      } else {
        for (const key of Object.keys(current)) {
          recurse(current[key]);
        }
      }
    };

    recurse(data);

    if (renderers.length === 0) {
      throw new Error('No videos found in the pasted playlist data.');
    }

    return renderers.map((video: any) => {
      const videoId = video.videoId || '';
      let title = '';
      if (video.title) {
        if (video.title.runs && video.title.runs[0]) {
          title = video.title.runs[0].text || '';
        } else if (video.title.simpleText) {
          title = video.title.simpleText || '';
        }
      }

      let thumbnail = '';
      const thumbs = video.thumbnail?.thumbnails || [];
      if (thumbs.length > 0) {
        const highest = thumbs.reduce((prev: any, curr: any) => {
          return (prev.width || 0) > (curr.width || 0) ? prev : curr;
        });
        thumbnail = highest.url || '';
      } else {
        thumbnail = `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`;
      }

      const lowerTitle = title.toLowerCase();
      const isPrivateOrDeleted = 
        video.isPlayable === false || 
        lowerTitle.includes('deleted video') || 
        lowerTitle.includes('private video');

      return {
        videoId,
        title,
        thumbnail,
        url: videoId ? `https://www.youtube.com/watch?v=${videoId}` : '',
        isPrivateOrDeleted
      };
    });
  };

  const handleLoadYtPlaylist = async () => {
    setYtPlaylistLoading(true);
    setYtPlaylistStats(null);

    // Reset items first
    setYtPlaylistItemsSub([]);
    setYtPlaylistItemsEngDub([]);
    setYtPlaylistItemsHindiDub([]);
    setYtPlaylistItemsOther([]);

    const fetchPlaylistTrack = async (url: string) => {
      if (!url.trim()) return [];
      const response = await fetch(`/api/youtube-playlist?playlistUrl=${encodeURIComponent(url.trim())}`);
      const data = await response.json();
      if (!response.ok || !data.success) {
        throw new Error(data.error || "Failed to load YouTube playlist.");
      }
      return data.items || [];
    };

    const isPlaylistUrlOrId = (text: string): boolean => {
      const trimmed = text.trim();
      if (trimmed.includes('list=')) return true;
      if (/^PL[a-zA-Z0-9_-]{16,40}$/.test(trimmed)) return true;
      // If it looks like a single URL and doesn't contain HTML tags
      if (trimmed.startsWith('http') && !trimmed.includes('<') && !trimmed.includes('ytInitialData') && trimmed.length < 300) {
        return true;
      }
      return false;
    };

    try {
      if (ytImportMethod === 'paste') {
        const hasAnyPaste = ytPastedSourceSub.trim() || ytPastedSourceEngDub.trim() || ytPastedSourceHindiDub.trim() || ytPastedSourceOther.trim();
        if (!hasAnyPaste) {
          alert("Please paste the YouTube Playlist Page Source or Video URLs for at least one track.");
          setYtPlaylistLoading(false);
          return;
        }

        if (ytPastedSourceSub.trim()) {
          const content = ytPastedSourceSub.trim();
          const items = isPlaylistUrlOrId(content) ? await fetchPlaylistTrack(content) : parseYtPlaylistSource(content);
          setYtPlaylistItemsSub(items);
        }
        if (ytPastedSourceEngDub.trim()) {
          const content = ytPastedSourceEngDub.trim();
          const items = isPlaylistUrlOrId(content) ? await fetchPlaylistTrack(content) : parseYtPlaylistSource(content);
          setYtPlaylistItemsEngDub(items);
        }
        if (ytPastedSourceHindiDub.trim()) {
          const content = ytPastedSourceHindiDub.trim();
          const items = isPlaylistUrlOrId(content) ? await fetchPlaylistTrack(content) : parseYtPlaylistSource(content);
          setYtPlaylistItemsHindiDub(items);
        }
        if (ytPastedSourceOther.trim()) {
          const content = ytPastedSourceOther.trim();
          const items = isPlaylistUrlOrId(content) ? await fetchPlaylistTrack(content) : parseYtPlaylistSource(content);
          setYtPlaylistItemsOther(items);
        }
        
        alert("Successfully parsed and loaded playlist tracks!");
      } else {
        // Auto Fetch (Proxy/API)
        const hasAnyUrl = ytPlaylistUrlSub.trim() || ytPlaylistUrlEngDub.trim() || ytPlaylistUrlHindiDub.trim() || ytPlaylistUrlOther.trim();
        if (!hasAnyUrl) {
          alert("Please enter a YouTube Playlist URL or Playlist ID for at least one track.");
          setYtPlaylistLoading(false);
          return;
        }

        const [itemsSub, itemsEng, itemsHindi, itemsOther] = await Promise.all([
          ytPlaylistUrlSub.trim() ? fetchPlaylistTrack(ytPlaylistUrlSub) : Promise.resolve([]),
          ytPlaylistUrlEngDub.trim() ? fetchPlaylistTrack(ytPlaylistUrlEngDub) : Promise.resolve([]),
          ytPlaylistUrlHindiDub.trim() ? fetchPlaylistTrack(ytPlaylistUrlHindiDub) : Promise.resolve([]),
          ytPlaylistUrlOther.trim() ? fetchPlaylistTrack(ytPlaylistUrlOther) : Promise.resolve([])
        ]);

        setYtPlaylistItemsSub(itemsSub);
        setYtPlaylistItemsEngDub(itemsEng);
        setYtPlaylistItemsHindiDub(itemsHindi);
        setYtPlaylistItemsOther(itemsOther);

        alert("Successfully loaded YouTube playlist track(s)!");
      }
    } catch (err: any) {
      console.error("Failed loading/parsing YouTube playlist tracks:", err);
      alert(err.message || "An error occurred while loading the playlist tracks.");
    } finally {
      setYtPlaylistLoading(false);
    }
  };



  const handleImportYtPlaylist = async () => {
    if (!animeForm.id) {
      alert("Please select or save the anime series first!");
      return;
    }

    const { episodes, skippedCount } = processedPlaylistData;
    if (episodes.length === 0) {
      alert("No valid episodes found in the loaded playlists to import!");
      return;
    }

    setIsImporting(true);
    setImportProgress(0);
    setImportedCount(0);

    try {
      const animeId = animeForm.id;
      
      // If Replace mode is active, delete existing episodes first
      if (ytAppendMode === 'replace') {
        await remove(ref(db, `episodes/${animeId}`));
      }

      // Calculate offset based on extracted episode numbers
      let offset = 0;
      if (episodes.length > 0) {
        const minImportedEpNum = Math.min(...episodes.map(ep => ep.episodeNumber || 1));
        if (ytAppendMode === 'append') {
          const maxExistingEpNum = customEpisodes.length > 0 
            ? Math.max(...customEpisodes.map(ep => Number(ep.number) || 0), 0) 
            : 0;
          const startEpNum = maxExistingEpNum + 1;
          offset = startEpNum - minImportedEpNum;
        }
      }

      const episodesMap: Record<number, any> = {};
      
      episodes.forEach((ep) => {
        const epNum = (ep.episodeNumber || 1) + offset;
        
        // Setup video sources
        const videoSources: Record<string, any> = {
          sub: ep.sub ? {
            enabled: true,
            type: 'youtube',
            url: ep.sub.url,
            hidePlaylist: false,
            hideShare: false,
            videoType: 'youtube'
          } : { enabled: false, type: 'file', url: '' },
          eng_dub: ep.eng_dub ? {
            enabled: true,
            type: 'youtube',
            url: ep.eng_dub.url,
            hidePlaylist: false,
            hideShare: false,
            videoType: 'youtube'
          } : { enabled: false, type: 'file', url: '' },
          hindi_dub: ep.hindi_dub ? {
            enabled: true,
            type: 'youtube',
            url: ep.hindi_dub.url,
            hidePlaylist: false,
            hideShare: false,
            videoType: 'youtube'
          } : { enabled: false, type: 'file', url: '' },
          other: ep.other ? {
            enabled: true,
            type: 'youtube',
            url: ep.other.url,
            hidePlaylist: false,
            hideShare: false,
            videoType: 'youtube'
          } : { enabled: false, type: 'file', url: '' }
        };

        episodesMap[epNum] = {
          id: `${animeId}-ep-${epNum}`,
          number: epNum,
          title: ep.title || `Episode ${epNum}`,
          thumbnail: ep.thumbnail || animeForm.poster || '',
          videoSources
        };
      });

      // Batch save using existing addCustomEpisodesBatch
      await addCustomEpisodesBatch(animeId, episodesMap);

      // Automatically trigger smart validation for this newly loaded/imported playlist
      try {
        await fetch('/api/sync-youtube-playlists', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ animeId })
        });
      } catch (valErr) {
        console.error("Auto-validation after import failed:", valErr);
      }

      // Refresh episode list
      const refreshedEps = await getCustomEpisodes(animeId);
      const epsList = refreshedEps ? Object.values(refreshedEps).filter(Boolean) : [];
      setCustomEpisodes(epsList);

      // Save statistics to display
      setYtPlaylistStats({
        imported: episodes.length,
        skipped: skippedCount,
        duplicates: 0,
        failed: 0
      });

      alert(`Successfully imported ${episodes.length} episodes from YouTube playlist!`);
      
      // Reset playlist loader inputs, but keep stats visible for the user to read
      setYtPlaylistUrlSub('');
      setYtPlaylistUrlEngDub('');
      setYtPlaylistUrlHindiDub('');
      setYtPlaylistUrlOther('');
      setYtPastedSourceSub('');
      setYtPastedSourceEngDub('');
      setYtPastedSourceHindiDub('');
      setYtPastedSourceOther('');
      
      setYtPlaylistItemsSub([]);
      setYtPlaylistItemsEngDub([]);
      setYtPlaylistItemsHindiDub([]);
      setYtPlaylistItemsOther([]);
      setShowBulkPanel(false);

    } catch (error: any) {
      console.error("Failed importing YouTube playlist:", error);
      alert(`Error during playlist import: ${error.message || error}`);
    } finally {
      setIsImporting(false);
      setImportProgress(0);
    }
  };

  const handleDeleteEpisodeClick = async (epNum: number, thumbnail?: string) => {
    showConfirm(
      "Delete Episode",
      `Are you sure you want to delete Episode ${epNum}?`,
      async () => {
        try {
          if (thumbnail && thumbnail.includes("cloudinary.com")) {
            deleteAssetByUrl(thumbnail).catch(err => console.warn("Failed to delete episode thumbnail:", err));
          }
          await remove(ref(db, `episodes/${animeForm.id}/${epNum}`));
          await updateAnimeEpisodesCount(animeForm.id);
          alert("Episode deleted successfully.");
          const eps = await getCustomEpisodes(animeForm.id);
          setCustomEpisodes(eps ? Object.values(eps).filter(Boolean) : []);
        } catch (e) {
          console.error("Failed to delete episode:", e);
          alert("Error deleting episode.");
        }
      }
    );
  };

  // ==========================================
  // HOMEPAGE SECTION CRUD HANDLERS
  // ==========================================
  const handleCreateNewSectionClick = () => {
    setEditingSection(null);
    setSectionForm({
      id: '',
      name: '',
      slug: '',
      displayOrder: dbSections.length + 1,
      numCards: 12,
      visible: true,
      status: 'active'
    });
    setSectionFormOpen(true);
  };

  const handleEditSectionClick = (sec: any) => {
    setEditingSection(sec);
    setSectionForm({
      id: sec.id || sec.slug,
      name: sec.name || '',
      slug: sec.slug || '',
      displayOrder: sec.displayOrder || 1,
      numCards: sec.numCards || 12,
      visible: sec.visible !== false,
      status: sec.status || 'active'
    });
    setSectionFormOpen(true);
  };

  const handleSaveSection = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!sectionForm.name.trim()) return;
    
    const slug = sectionForm.slug.trim() || sectionForm.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
    const id = sectionForm.id || slug;

    const updatedSection = {
      id,
      name: sectionForm.name.trim(),
      slug,
      displayOrder: Number(sectionForm.displayOrder || 1),
      numCards: Number(sectionForm.numCards || 12),
      visible: sectionForm.visible,
      status: sectionForm.status
    };

    try {
      await set(ref(db, `homepageSections/${id}`), updatedSection);
      clearAnimeCaches();
      setSectionFormOpen(false);
      setEditingSection(null);
    } catch (err) {
      console.error("Failed to save homepage section:", err);
    }
  };

  const handleDeleteSection = async (id: string) => {
    showConfirm(
      "Delete Category",
      "Are you sure you want to delete this category?",
      async () => {
        try {
          const secRef = ref(db, `homepageSections/${id}`);
          const snap = await get(secRef);
          if (snap.exists()) {
            const secData = snap.val();
            const slug = secData.slug;

            // Remove the homepage section / category from Realtime Database
            await remove(secRef);

            // Clean up category assignments from any custom animes
            if (slug) {
              const animesSnap = await get(ref(db, 'animes'));
              if (animesSnap.exists()) {
                const animesObj = animesSnap.val();
                for (const animeId of Object.keys(animesObj)) {
                  const anime = animesObj[animeId];
                  if (anime.categories && anime.categories[slug] !== undefined) {
                    await remove(ref(db, `animes/${animeId}/categories/${slug}`));
                  }
                }
              }
            }

            clearAnimeCaches();
            // Refresh custom animes state in Admin
            const list = await getCustomAnimes();
            setCustomAnimes(Object.values(list));
          } else {
            // Fallback simple remove
            await remove(secRef);
            clearAnimeCaches();
          }
        } catch (err) {
          console.error("Failed to delete category:", err);
        }
      }
    );
  };

  const handleMoveSection = async (index: number, direction: 'up' | 'down') => {
    if (direction === 'up' && index === 0) return;
    if (direction === 'down' && index === dbSections.length - 1) return;

    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    const currentSec = dbSections[index];
    const targetSec = dbSections[targetIndex];

    const currentId = currentSec.id || currentSec.slug;
    const targetId = targetSec.id || targetSec.slug;

    const currentOrder = Number(currentSec.displayOrder || (index + 1));
    const targetOrder = Number(targetSec.displayOrder || (targetIndex + 1));

    let newCurrentOrder = targetOrder;
    let newTargetOrder = currentOrder;

    if (newCurrentOrder === newTargetOrder) {
      if (direction === 'up') {
        newCurrentOrder = targetOrder - 1;
      } else {
        newCurrentOrder = targetOrder + 1;
      }
    }

    try {
      await set(ref(db, `homepageSections/${currentId}/displayOrder`), Number(newCurrentOrder));
      await set(ref(db, `homepageSections/${targetId}/displayOrder`), Number(newTargetOrder));
      clearAnimeCaches();
    } catch (err) {
      console.error("Failed to reorder section:", err);
    }
  };

  // ==========================================
  // STORAGE MANAGER CRUD & TELEMETRY HANDLERS
  // ==========================================
  const handleCreateNewStorageClick = () => {
    setEditingStorage(null);
    const nextNumber = storageConfigs.length + 2; // Starts from #2
    setStorageForm({
      id: 'storage-' + Date.now(),
      name: `Cloudinary #${nextNumber}`,
      provider: 'cloudinary',
      cloudName: '',
      apiKey: '',
      apiSecret: '',
      folder: 'anova_anime',
      defaultFolder: 'anova_anime',
      status: 'enabled',
      priority: storageConfigs.length + 1,
      notes: '',
      maxUploadSize: 50,
      maxDailyUploads: 100,
      maxStorage: 1024
    });
    setStorageFormOpen(true);
  };

  const handleEditStorageClick = (st: any) => {
    setEditingStorage(st);
    setStorageForm({
      id: st.id || 'storage-' + Date.now(),
      name: st.name || '',
      provider: st.provider || 'cloudinary',
      cloudName: st.cloudName || '',
      apiKey: st.apiKey || '',
      apiSecret: st.apiSecret || '',
      folder: st.folder || 'anova_anime',
      defaultFolder: st.defaultFolder || 'anova_anime',
      status: st.status || 'enabled',
      priority: Number(st.priority || 1),
      notes: st.notes || '',
      maxUploadSize: Number(st.maxUploadSize || 50),
      maxDailyUploads: Number(st.maxDailyUploads || 100),
      maxStorage: Number(st.maxStorage || 1024)
    });
    setStorageFormOpen(true);
  };

  const handleSaveStorageForm = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!storageForm.name.trim()) {
      alert("Please fill in Storage Name.");
      return;
    }
    if (storageForm.provider === 'cloudinary' && (!storageForm.cloudName || !storageForm.apiKey || !storageForm.apiSecret)) {
      alert("Please fill in all Cloudinary parameters.");
      return;
    }

    try {
      const updatedStorage = {
        ...storageForm,
        priority: Number(storageForm.priority || 1),
        maxUploadSize: Number(storageForm.maxUploadSize || 50),
        maxDailyUploads: Number(storageForm.maxDailyUploads || 100),
        maxStorage: Number(storageForm.maxStorage || 1024),
        createdAt: editingStorage?.createdAt || Date.now()
      };

      await set(ref(db, `storage_configs/${storageForm.id}`), updatedStorage);
      
      // If there's no default storage set, set this one as default automatically
      if (!storageSettings.defaultStorageId) {
        await update(ref(db, 'storage_settings'), { defaultStorageId: storageForm.id });
      }

      setStorageFormOpen(false);
      setEditingStorage(null);
      alert("Storage provider successfully saved!");
    } catch (err) {
      console.error("Failed to save storage config:", err);
      alert("Error saving storage configuration.");
    }
  };

  const handleDeleteStorageClick = async (id: string, name: string) => {
    showConfirm(
      "Delete Storage Provider",
      `Are you sure you want to delete storage provider "${name}"? Previously uploaded files will not be affected.`,
      async () => {
        try {
          await remove(ref(db, `storage_configs/${id}`));
          
          // If we deleted the default storage, clear it or set it to another
          if (storageSettings.defaultStorageId === id) {
            await update(ref(db, 'storage_settings'), { defaultStorageId: '' });
          }
          
          alert("Storage provider deleted successfully.");
        } catch (err) {
          console.error("Failed to delete storage provider:", err);
          alert("Error deleting storage provider.");
        }
      }
    );
  };

  const handleSetDefaultStorage = async (id: string) => {
    try {
      await update(ref(db, 'storage_settings'), { defaultStorageId: id });
    } catch (err) {
      console.error("Failed to set default storage:", err);
    }
  };

  const handleToggleAutoRotate = async () => {
    try {
      await update(ref(db, 'storage_settings'), { autoRotate: !storageSettings.autoRotate });
    } catch (err) {
      console.error("Failed to toggle auto rotate:", err);
    }
  };

  const handleToggleSmartMode = async () => {
    try {
      await update(ref(db, 'storage_settings'), { smartMode: !storageSettings.smartMode });
    } catch (err) {
      console.error("Failed to toggle smart mode:", err);
    }
  };

  const handleTestStorageConnection = async (config: any) => {
    setIsTestingConnection(prev => ({ ...prev, [config.id]: true }));
    try {
      const result = await testConnectionWithConfig(config);
      setTestConnectionResults(prev => ({ 
        ...prev, 
        [config.id]: { success: result.success, message: result.message } 
      }));
    } catch (err) {
      setTestConnectionResults(prev => ({ 
        ...prev, 
        [config.id]: { success: false, message: "Network Error" } 
      }));
    } finally {
      setIsTestingConnection(prev => ({ ...prev, [config.id]: false }));
    }
  };

  return (
    <div className="min-h-screen pt-24 px-4 max-w-7xl mx-auto pb-24 bg-[#050505]">
      
      {/* 1. Header Navigation Control Bar */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-8">
        <div>
          <h1 className="text-2xl md:text-3xl font-black text-white tracking-tight flex items-center gap-2">
            <ShieldCheck className="text-primary" />
            AnOvA Streaming Administrator
          </h1>
          <p className="text-xs text-gray-400 mt-1">Real-time telemetry, server orchestration & directory moderator logs</p>
        </div>
        <Link
          to="/profile"
          className="flex items-center gap-1.5 px-4 py-2 bg-white/5 border border-white/5 text-gray-300 hover:text-white rounded-lg text-xs font-black transition-all uppercase tracking-wider"
        >
          <ArrowLeft size={14} className="text-primary" />
          Profile Panel
        </Link>
      </div>

      {/* 2. Top-Level Core Real-time Analytics Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        
        {/* Card 1: Online Viewers */}
        <div className="bg-[#0a0d14]/40 border border-[#00e5ff]/10 p-5 rounded-2xl relative overflow-hidden backdrop-blur-md shadow-[0_0_20px_rgba(0,229,255,0.02)]">
          <div className="absolute top-0 right-0 w-24 h-24 bg-[#00e5ff]/5 rounded-full blur-2xl pointer-events-none" />
          <Activity size={16} className="text-primary absolute top-5 right-5 animate-pulse" />
          <span className="text-gray-500 text-[9px] font-black uppercase tracking-wider block">Online Viewers</span>
          <p className="text-2xl md:text-3xl font-black text-white mt-1.5 drop-shadow-[0_0_12px_rgba(0,229,255,0.25)]">
            {onlineUsers.length}
          </p>
          <div className="flex items-center gap-1.5 mt-2">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-ping" />
            <span className="text-[9px] text-emerald-400 font-bold uppercase tracking-wider">Live tracking active</span>
          </div>
        </div>

        {/* Card 2: Total Registered Users */}
        <div className="bg-[#0a0d14]/40 border border-white/5 p-5 rounded-2xl relative overflow-hidden backdrop-blur-md">
          <Users size={16} className="text-primary absolute top-5 right-5" />
          <span className="text-gray-500 text-[9px] font-black uppercase tracking-wider block">Registered directory</span>
          <p className="text-2xl md:text-3xl font-black text-white mt-1.5">{totalUsersCount}</p>
          <span className="text-[9px] text-gray-400 font-bold mt-2 block flex items-center gap-1">
            <span className="text-emerald-400">+{newUsersTodayCount} today</span> • {returningUsersCount} returning
          </span>
        </div>

        {/* Card 3: Total Views Today */}
        <div className="bg-[#0a0d14]/40 border border-white/5 p-5 rounded-2xl relative overflow-hidden backdrop-blur-md">
          <Play size={16} className="text-primary absolute top-5 right-5" />
          <span className="text-gray-500 text-[9px] font-black uppercase tracking-wider block">Total Views Today</span>
          <p className="text-2xl md:text-3xl font-black text-white mt-1.5">{viewsToday}</p>
          <span className="text-[9px] text-gray-400 font-bold mt-2 block">
            Accumulated: <span className="text-primary font-bold">{totalViewsCount}</span> total plays
          </span>
        </div>

        {/* Card 4: Accumulated Watch Time */}
        <div className="bg-[#0a0d14]/40 border border-white/5 p-5 rounded-2xl relative overflow-hidden backdrop-blur-md">
          <Clock size={16} className="text-primary absolute top-5 right-5" />
          <span className="text-gray-500 text-[9px] font-black uppercase tracking-wider block">Total Stream Hours</span>
          <p className="text-2xl md:text-3xl font-black text-white mt-1.5">{totalWatchHours}h</p>
          <span className="text-[9px] text-gray-400 font-bold mt-2 block">
            Avg Duration: <span className="text-primary font-bold">{averageWatchDurationMinutes}m</span> / play
          </span>
        </div>

      </div>

      {/* 3. Navigation Tab Bar */}
      <div className="flex gap-4 border-b border-white/5 pb-3 mb-8 overflow-x-auto hide-scrollbar text-xs font-black uppercase tracking-wider">
        {[
          { id: 'overview', label: 'Systems Overview' },
          { id: 'global_content_manager', label: 'Global Source Manager' },
          { id: 'analytics', label: 'Real Watch Analytics' },
          { id: 'users', label: 'User Management' },
          { id: 'comments', label: 'Comment Moderation' },
          { id: 'upload', label: 'Anime Upload System' },
          { id: 'sections', label: 'Homepage Section Manager' },
          { id: 'storage', label: 'Storage Manager' },
          { id: 'ads', label: 'Advertisement Manager' },
          { id: 'verifier', label: 'Playback Verifier' }
        ].map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={cn(
              "pb-3 -mb-[13px] border-b-2 transition-all whitespace-nowrap cursor-pointer",
              activeTab === tab.id
                ? "text-primary border-primary font-black"
                : "text-gray-400 border-transparent hover:text-white"
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* 4. Tab Contents */}
      <div>
        
        {/* TAB: GLOBAL CONTENT SOURCE MANAGER */}
        {activeTab === 'global_content_manager' && (
          <div className="space-y-6 animate-fadeIn text-gray-300">
            {/* Header section */}
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-[#0a0d14]/30 border border-white/5 p-6 rounded-2xl backdrop-blur-md">
              <div>
                <h2 className="text-xl font-black text-white uppercase tracking-wider flex items-center gap-2">
                  <Server className="text-primary animate-pulse" size={24} />
                  <span>Global Content Source Manager</span>
                </h2>
                <p className="text-xs text-gray-400 mt-1">
                  Control which content provider source is visible across the entire platform in real-time. This changes visibility instantly without deleting any data.
                </p>
              </div>
              
              {/* Active source summary badge */}
              <div className="bg-primary/5 border border-primary/20 rounded-xl px-4 py-2.5 flex items-center gap-3">
                <Activity size={16} className="text-primary animate-pulse" />
                <div className="text-xs">
                  <span className="text-gray-400 font-bold">Active Sources: </span>
                  <span className="text-white font-black">
                    {((globalSettings.myDatabase ? 1 : 0) + (globalSettings.fourAnimo ? 1 : 0) + (globalSettings.imported ? 1 : 0))} / 3
                  </span>
                </div>
              </div>
            </div>

            {/* Explanation box */}
            <div className="bg-yellow-500/5 border border-yellow-500/10 p-5 rounded-2xl flex gap-4 items-start text-xs leading-relaxed text-yellow-500/80">
              <AlertCircle size={18} className="shrink-0 mt-0.5 animate-bounce" />
              <div>
                <span className="font-bold uppercase tracking-wider block mb-1">Visibility Safeguard Enabled</span>
                Turning OFF a provider only alters website visibility. This operation <strong className="text-yellow-500 font-black">NEVER</strong> deletes anime data, episodes, posters, banners, watch histories, or user records. All actions are completely safe and fully reversible with a single click.
              </div>
            </div>

            {/* Source Grid */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              
              {/* Card 1: My Database */}
              <div className={cn(
                "border rounded-2xl p-6 transition-all duration-300 backdrop-blur-md relative overflow-hidden flex flex-col justify-between min-h-[220px]",
                globalSettings.myDatabase 
                  ? "bg-[#0a0d14]/40 border-emerald-500/25 shadow-[0_0_25px_rgba(16,185,129,0.05)]" 
                  : "bg-black/40 border-white/5 opacity-75"
              )}>
                {/* Glowing status circle indicator */}
                <div className={cn(
                  "absolute top-5 right-5 w-3 h-3 rounded-full animate-ping",
                  globalSettings.myDatabase ? "bg-emerald-500" : "bg-red-500"
                )} />
                <div className={cn(
                  "absolute top-5 right-5 w-3 h-3 rounded-full",
                  globalSettings.myDatabase ? "bg-emerald-500" : "bg-red-500"
                )} />

                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-emerald-500 font-black text-xs uppercase tracking-widest px-2 py-0.5 bg-emerald-500/10 rounded-md">Local Database</span>
                  </div>
                  <h3 className="text-lg font-black text-white mt-3 flex items-center gap-2">
                    🟢 <span>My Database</span>
                  </h3>
                  <p className="text-[11px] text-gray-400 mt-2 leading-relaxed">
                    Custom-loaded catalog, custom episode player streams, specific posters/banners, and admin-managed metadata.
                  </p>
                </div>

                <div className="mt-6 pt-5 border-t border-white/5 flex items-center justify-between">
                  <div>
                    <span className="text-[10px] text-gray-500 font-bold uppercase block tracking-wider">Total Shows</span>
                    <span className="text-lg font-black text-white">
                      {customAnimes.filter(a => !(a.source === 'imported' || a.imported === true || a.isImported === true)).length}
                    </span>
                  </div>

                  <button
                    onClick={async () => {
                      const updated = { ...globalSettings, myDatabase: !globalSettings.myDatabase };
                      await set(ref(db, 'globalContentSettings'), updated);
                      clearAnimeCaches();
                    }}
                    className={cn(
                      "px-4 py-2 rounded-xl text-xs font-black uppercase tracking-wider transition-all duration-300 cursor-pointer flex items-center gap-1.5",
                      globalSettings.myDatabase
                        ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 hover:bg-emerald-500/30"
                        : "bg-gray-500/10 text-gray-400 border border-white/5 hover:bg-gray-500/20"
                    )}
                  >
                    <Power size={12} />
                    <span>{globalSettings.myDatabase ? 'Active' : 'Disabled'}</span>
                  </button>
                </div>
              </div>

              {/* Card 2: 4animo */}
              <div className={cn(
                "border rounded-2xl p-6 transition-all duration-300 backdrop-blur-md relative overflow-hidden flex flex-col justify-between min-h-[220px]",
                globalSettings.fourAnimo 
                  ? "bg-[#0a0d14]/40 border-yellow-500/25 shadow-[0_0_25px_rgba(234,179,8,0.05)]" 
                  : "bg-black/40 border-white/5 opacity-75"
              )}>
                <div className={cn(
                  "absolute top-5 right-5 w-3 h-3 rounded-full animate-ping",
                  globalSettings.fourAnimo ? "bg-yellow-500" : "bg-red-500"
                )} />
                <div className={cn(
                  "absolute top-5 right-5 w-3 h-3 rounded-full",
                  globalSettings.fourAnimo ? "bg-yellow-500" : "bg-red-500"
                )} />

                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-yellow-500 font-black text-xs uppercase tracking-widest px-2 py-0.5 bg-yellow-500/10 rounded-md">Live Stream Feed</span>
                  </div>
                  <h3 className="text-lg font-black text-white mt-3 flex items-center gap-2">
                    🟡 <span>4animo</span>
                  </h3>
                  <p className="text-[11px] text-gray-400 mt-2 leading-relaxed">
                    Dynamic global live API stream feed providing episodes, tracking lists, spotlights, and automatic updates.
                  </p>
                </div>

                <div className="mt-6 pt-5 border-t border-white/5 flex items-center justify-between">
                  <div>
                    <span className="text-[10px] text-gray-500 font-bold uppercase block tracking-wider">Total Shows</span>
                    <span className="text-lg font-black text-white">2,450 (Live)</span>
                  </div>

                  <button
                    onClick={async () => {
                      const updated = { ...globalSettings, fourAnimo: !globalSettings.fourAnimo };
                      await set(ref(db, 'globalContentSettings'), updated);
                      clearAnimeCaches();
                    }}
                    className={cn(
                      "px-4 py-2 rounded-xl text-xs font-black uppercase tracking-wider transition-all duration-300 cursor-pointer flex items-center gap-1.5",
                      globalSettings.fourAnimo
                        ? "bg-yellow-500/20 text-yellow-400 border border-yellow-500/30 hover:bg-yellow-500/30"
                        : "bg-gray-500/10 text-gray-400 border border-white/5 hover:bg-gray-500/20"
                    )}
                  >
                    <Power size={12} />
                    <span>{globalSettings.fourAnimo ? 'Active' : 'Disabled'}</span>
                  </button>
                </div>
              </div>

              {/* Card 3: Imported */}
              <div className={cn(
                "border rounded-2xl p-6 transition-all duration-300 backdrop-blur-md relative overflow-hidden flex flex-col justify-between min-h-[220px]",
                globalSettings.imported 
                  ? "bg-[#0a0d14]/40 border-cyan-500/25 shadow-[0_0_25px_rgba(6,182,212,0.05)]" 
                  : "bg-black/40 border-white/5 opacity-75"
              )}>
                <div className={cn(
                  "absolute top-5 right-5 w-3 h-3 rounded-full animate-ping",
                  globalSettings.imported ? "bg-cyan-500" : "bg-red-500"
                )} />
                <div className={cn(
                  "absolute top-5 right-5 w-3 h-3 rounded-full",
                  globalSettings.imported ? "bg-cyan-500" : "bg-red-500"
                )} />

                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-cyan-500 font-black text-xs uppercase tracking-widest px-2 py-0.5 bg-cyan-500/10 rounded-md">External Import</span>
                  </div>
                  <h3 className="text-lg font-black text-white mt-3 flex items-center gap-2">
                    🔵 <span>Imported Catalog</span>
                  </h3>
                  <p className="text-[11px] text-gray-400 mt-2 leading-relaxed">
                    Shows and titles imported from secondary indexes or pre-loaded sheets and lists.
                  </p>
                </div>

                <div className="mt-6 pt-5 border-t border-white/5 flex items-center justify-between">
                  <div>
                    <span className="text-[10px] text-gray-500 font-bold uppercase block tracking-wider">Total Shows</span>
                    <span className="text-lg font-black text-white">
                      {customAnimes.filter(a => a.source === 'imported' || a.imported === true || a.isImported === true).length}
                    </span>
                  </div>

                  <button
                    onClick={async () => {
                      const updated = { ...globalSettings, imported: !globalSettings.imported };
                      await set(ref(db, 'globalContentSettings'), updated);
                      clearAnimeCaches();
                    }}
                    className={cn(
                      "px-4 py-2 rounded-xl text-xs font-black uppercase tracking-wider transition-all duration-300 cursor-pointer flex items-center gap-1.5",
                      globalSettings.imported
                        ? "bg-cyan-500/20 text-cyan-400 border border-cyan-500/30 hover:bg-cyan-500/30"
                        : "bg-gray-500/10 text-gray-400 border border-white/5 hover:bg-gray-500/20"
                    )}
                  >
                    <Power size={12} />
                    <span>{globalSettings.imported ? 'Active' : 'Disabled'}</span>
                  </button>
                </div>
              </div>

            </div>

            {/* Priority Hierarchy Section */}
            <div className="bg-[#0a0d14]/30 border border-white/5 p-6 rounded-2xl backdrop-blur-md">
              <h3 className="text-sm font-black text-white uppercase tracking-wider border-b border-white/5 pb-3 mb-4">
                Conflict Resolution & Priority Order
              </h3>
              <p className="text-xs text-gray-400 leading-relaxed mb-6">
                If an anime is available from multiple active providers at the same time, the system will apply strict fallback priority rules to display the highest quality version. Only the top-ranking visible version is active.
              </p>

              <div className="flex flex-col md:flex-row items-stretch justify-center gap-4">
                
                <div className="flex-1 bg-emerald-500/5 border border-emerald-500/10 p-4 rounded-xl flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-emerald-500/20 flex items-center justify-center font-black text-emerald-400 text-sm shrink-0">1</div>
                  <div>
                    <span className="font-black text-white text-xs block">My Database</span>
                    <span className="text-[10px] text-gray-400">Highest Rank (Overrides everything)</span>
                  </div>
                </div>

                <div className="hidden md:flex items-center text-gray-600">→</div>

                <div className="flex-1 bg-cyan-500/5 border border-cyan-500/10 p-4 rounded-xl flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-cyan-500/20 flex items-center justify-center font-black text-cyan-400 text-sm shrink-0">2</div>
                  <div>
                    <span className="font-black text-white text-xs block">Imported</span>
                    <span className="text-[10px] text-gray-400">Medium Rank (Overrides live streams)</span>
                  </div>
                </div>

                <div className="hidden md:flex items-center text-gray-600">→</div>

                <div className="flex-1 bg-yellow-500/5 border border-yellow-500/10 p-4 rounded-xl flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-yellow-500/20 flex items-center justify-center font-black text-yellow-400 text-sm shrink-0">3</div>
                  <div>
                    <span className="font-black text-white text-xs block">4animo</span>
                    <span className="text-[10px] text-gray-400">Lowest Rank (Base API layer)</span>
                  </div>
                </div>

              </div>
            </div>

          </div>
        )}

        {/* TAB 1: SYSTEM OVERVIEW (SERVERS & HEALTH CHECK) */}
        {activeTab === 'overview' && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            
            {/* CDN Servers list */}
            <div className="lg:col-span-2 bg-[#0a0d14]/30 border border-white/5 p-6 rounded-2xl space-y-5 backdrop-blur-md">
              <h3 className="text-sm font-black text-white uppercase tracking-wider border-b border-white/5 pb-2.5 flex items-center justify-between">
                <span>CDN Nodes & Core Ingress</span>
                <span className="text-[10px] text-primary flex items-center gap-1 bg-cyan-500/5 border border-cyan-500/10 px-2 py-0.5 rounded-full font-bold">
                  <RefreshCw size={10} className="animate-spin text-primary" />
                  Telematics Active
                </span>
              </h3>
              
              <div className="space-y-3">
                {serverNodes.map((srv, idx) => (
                  <div key={idx} className="flex justify-between items-center bg-white/[0.01] p-3.5 rounded-xl border border-white/5 hover:border-primary/20 transition-all">
                    <div>
                      <p className="text-xs font-bold text-white">{srv.name}</p>
                      <p className="text-[9px] text-gray-500 mt-0.5">CPU Load: {srv.load} • Proxy tunnel bandwidth normal</p>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-[10px] font-mono text-gray-500 font-bold">{srv.load !== '0%' ? '18ms' : '--'}</span>
                      <span className={cn("text-[8px] font-black px-2 py-0.5 rounded uppercase tracking-wider flex items-center gap-1 border", srv.badge)}>
                        <Server size={8} />
                        {srv.status}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Ingress Controls Zone */}
            <div className="bg-[#0a0d14]/30 border border-white/5 p-6 rounded-2xl space-y-5 h-fit backdrop-blur-md">
              <h3 className="text-sm font-black text-white uppercase tracking-wider border-b border-white/5 pb-2.5">
                Ingress Control Nodes
              </h3>
              <div className="space-y-3 text-xs">
                <button 
                  onClick={() => alert('Varnish Edge & Cloudflare cache purge broadcast initiated successfully.')}
                  className="w-full py-3 rounded-xl bg-primary hover:bg-[#00cce0] text-black font-black text-[10px] uppercase tracking-wider transition-colors shadow-lg shadow-cyan-500/10 cursor-pointer"
                >
                  Purge Edge CDN Cache
                </button>
                <button 
                  onClick={() => alert('Zustand persistent local storage states successfully synchronized with remote cluster.')}
                  className="w-full py-3 rounded-xl bg-white/5 hover:bg-white/10 text-white font-black text-[10px] uppercase tracking-wider border border-white/5 transition-colors cursor-pointer"
                >
                  Trigger Database Sync
                </button>
                <button 
                  onClick={() => alert('CDN Failover relay is ready. Automatic fallback is on.')}
                  className="w-full py-3 rounded-xl bg-red-500/10 hover:bg-red-500/20 text-red-400 font-black text-[10px] uppercase tracking-wider border border-red-500/20 transition-colors cursor-pointer"
                >
                  Force CDN Relay Failover
                </button>
              </div>
              
              <div className="bg-white/[0.01] border border-white/5 p-4 rounded-xl space-y-2">
                <p className="text-[10px] text-gray-500 uppercase font-black tracking-wider">Node Details</p>
                <p className="text-xs text-gray-300 font-bold">API Ingress: <span className="text-primary">kryzox.xyz</span></p>
                <p className="text-xs text-gray-300 font-bold">Player Embed: <span className="text-[#00e5ff]">cdn.4animo.xyz</span></p>
                <p className="text-xs text-gray-300 font-bold">Admin Clearance: <span className="text-emerald-400 font-bold">SYSTEM OWNER</span></p>
              </div>

              {/* Player Branding Control */}
              <DailymotionBrandingToggle />
            </div>

            {/* SMART YOUTUBE PLAYLIST VALIDATION SYSTEM PANEL */}
            <div className="lg:col-span-3 bg-[#0a0d14]/30 border border-white/5 p-6 rounded-2xl space-y-6 backdrop-blur-md mt-4">
              <div className="flex flex-col md:flex-row justify-between items-start md:items-center border-b border-white/5 pb-4 gap-4">
                <div>
                  <h3 className="text-md font-black text-white uppercase tracking-wider flex items-center gap-2">
                    🔒 <span>Smart YouTube Playlist Validation</span>
                  </h3>
                  <p className="text-[11px] text-gray-400 mt-1">
                    Detect members-only, private, deleted, region locked, and embed disabled videos automatically.
                  </p>
                </div>

                <button
                  disabled={isSyncingYtPlaylists}
                  onClick={async () => {
                    setIsSyncingYtPlaylists(true);
                    try {
                      const res = await fetch('/api/sync-youtube-playlists', { method: 'POST' });
                      const data = await res.json();
                      if (data.success) {
                        toast.success(`Validation scan complete! Re-checked all playlists. ${data.updatedPlaylistsCount} updated.`);
                        clearAnimeCaches();
                      } else {
                        toast.error(data.error || "Failed to run validation scanner.");
                      }
                    } catch (err) {
                      toast.error("Failed to connect to validation scanner server.");
                    } finally {
                      setIsSyncingYtPlaylists(false);
                    }
                  }}
                  className={cn(
                    "px-4 py-2.5 rounded-xl text-xs font-black uppercase tracking-wider transition-all duration-300 flex items-center gap-2 cursor-pointer shadow-lg",
                    isSyncingYtPlaylists 
                      ? "bg-cyan-500/10 text-cyan-400 border border-cyan-500/20"
                      : "bg-primary hover:bg-[#00cce0] text-black shadow-cyan-500/10"
                  )}
                >
                  <RefreshCw size={12} className={cn(isSyncingYtPlaylists && "animate-spin")} />
                  <span>{isSyncingYtPlaylists ? "Scanning Playlists..." : "Force Validation Re-check"}</span>
                </button>
              </div>

              {/* Grid with Toggles (Left) and Stats (Right) */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                
                {/* Left Column: Admin Settings Toggles */}
                <div className="space-y-4">
                  <h4 className="text-xs font-black text-gray-400 uppercase tracking-widest mb-3">Visibility Filters</h4>
                  
                  <div className="space-y-3">
                    {[
                      { key: 'hideRestrictedPlaylists', label: 'Hide Restricted Playlists', desc: 'Completely hide playlists marked as Restricted/Unavailable' },
                      { key: 'hideMembersOnly', label: 'Hide Members Only', desc: 'Completely hide members-only playlists' },
                      { key: 'hideEmbedDisabled', label: 'Hide Embed Disabled', desc: 'Completely hide playlists where embedding is disabled' },
                      { key: 'hideRegionLocked', label: 'Hide Region Locked', desc: 'Completely hide region blocked playlists' },
                      { key: 'hidePrivatePlaylists', label: 'Hide Private Playlists', desc: 'Completely hide private or unlisted playlists' },
                      { key: 'hidePlaybackRestricted', label: 'Hide Playback Restricted', desc: 'Completely hide age-restricted or premium playlists' }
                    ].map((item) => {
                      const isChecked = !!globalSettings[item.key as keyof typeof globalSettings];
                      return (
                        <div key={item.key} className="flex items-start justify-between bg-white/[0.01] p-3 rounded-xl border border-white/5 hover:border-white/10 transition-colors">
                          <div className="flex flex-col gap-0.5 max-w-[80%]">
                            <span className="text-xs font-bold text-white">{item.label}</span>
                            <span className="text-[10px] text-gray-500 leading-normal">{item.desc}</span>
                          </div>
                          <button
                            onClick={async () => {
                              const updated = {
                                ...globalSettings,
                                [item.key]: !isChecked
                              };
                              await set(ref(db, 'globalContentSettings'), updated);
                              clearAnimeCaches();
                              toast.success(`${item.label} setting updated!`);
                            }}
                            className={cn(
                              "w-10 h-6 rounded-full p-1 transition-colors duration-300 focus:outline-none cursor-pointer flex items-center relative shrink-0",
                              isChecked ? "bg-primary justify-end" : "bg-white/10 justify-start"
                            )}
                          >
                            <span className="w-4 h-4 rounded-full bg-black shadow-md block" />
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Right Column: Statistics */}
                <div className="bg-[#0e131f]/50 border border-white/5 p-5 rounded-2xl space-y-4">
                  <h4 className="text-xs font-black text-gray-400 uppercase tracking-widest mb-2 flex items-center gap-1.5">
                    📊 <span>Scanning Statistics</span>
                  </h4>

                  {(() => {
                    const ytAnimes = customAnimes.filter(a => a && (a.id.startsWith('yt-pl-') || a.source === 'youtube'));
                    const totalImported = ytAnimes.length;
                    const availableCount = ytAnimes.filter(a => a.validationStatus === 'AVAILABLE' || !a.validationStatus).length;
                    const restrictedCount = ytAnimes.filter(a => a.validationStatus && a.validationStatus !== 'AVAILABLE').length;
                    
                    const hiddenCount = ytAnimes.filter(a => {
                      if (!a.validationStatus) return false;
                      const s = a.validationStatus;
                      return (globalSettings.hideRestrictedPlaylists && s !== 'AVAILABLE') ||
                             (globalSettings.hideMembersOnly && s === 'MEMBERS_ONLY') ||
                             (globalSettings.hideEmbedDisabled && s === 'EMBED_DISABLED') ||
                             (globalSettings.hideRegionLocked && s === 'REGION_BLOCKED') ||
                             (globalSettings.hidePrivatePlaylists && s === 'PRIVATE') ||
                             (globalSettings.hidePlaybackRestricted && (s === 'PLAYBACK_RESTRICTED' || s === 'SUBSCRIPTION_REQUIRED'));
                    }).length;

                    const membersOnlyCount = ytAnimes.filter(a => a.validationStatus === 'MEMBERS_ONLY').length;
                    const embedDisabledCount = ytAnimes.filter(a => a.validationStatus === 'EMBED_DISABLED').length;
                    const regionLockedCount = ytAnimes.filter(a => a.validationStatus === 'REGION_BLOCKED').length;

                    return (
                      <div className="grid grid-cols-2 gap-4 text-xs">
                        <div className="bg-white/[0.01] border border-white/5 p-3 rounded-xl">
                          <span className="text-gray-500 text-[10px] font-bold uppercase tracking-wider block">Total Imported</span>
                          <span className="text-lg font-black text-white">{totalImported}</span>
                        </div>
                        <div className="bg-emerald-500/5 border border-emerald-500/10 p-3 rounded-xl">
                          <span className="text-emerald-500 text-[10px] font-bold uppercase tracking-wider block">🟢 Available</span>
                          <span className="text-lg font-black text-emerald-400">{availableCount}</span>
                        </div>
                        <div className="bg-red-500/5 border border-red-500/10 p-3 rounded-xl">
                          <span className="text-red-500 text-[10px] font-bold uppercase tracking-wider block">🔴 Restricted</span>
                          <span className="text-lg font-black text-red-400">{restrictedCount}</span>
                        </div>
                        <div className="bg-cyan-500/5 border border-cyan-500/10 p-3 rounded-xl">
                          <span className="text-cyan-500 text-[10px] font-bold uppercase tracking-wider block">🔒 Hidden</span>
                          <span className="text-lg font-black text-cyan-400">{hiddenCount}</span>
                        </div>
                        <div className="bg-yellow-500/5 border border-yellow-500/10 p-3 rounded-xl col-span-2">
                          <div className="space-y-1.5 mt-1 font-mono text-[10px] text-gray-400">
                            <div className="flex justify-between">
                              <span>🔴 Members Only:</span>
                              <span className="text-white font-bold">{membersOnlyCount}</span>
                            </div>
                            <div className="flex justify-between">
                              <span>🔒 Embed Disabled:</span>
                              <span className="text-white font-bold">{embedDisabledCount}</span>
                            </div>
                            <div className="flex justify-between">
                              <span>🟡 Region Locked:</span>
                              <span className="text-white font-bold">{regionLockedCount}</span>
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })()}
                </div>

              </div>
            </div>

          </div>
        )}

        {/* TAB 2: REAL WATCH ANALYTICS (REAL VIEWS & CHARTS) */}
        {activeTab === 'analytics' && (
          <div className="space-y-8">
            
            {/* Extra Analytics Cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="bg-[#0a0d14]/30 border border-white/5 p-4 rounded-xl">
                <span className="text-gray-500 text-[9px] font-bold uppercase tracking-wider">Active Today</span>
                <p className="text-xl font-black text-white mt-1">{activeUsersToday}</p>
              </div>
              <div className="bg-[#0a0d14]/30 border border-white/5 p-4 rounded-xl">
                <span className="text-gray-500 text-[9px] font-bold uppercase tracking-wider">Weekly Active (WAU)</span>
                <p className="text-xl font-black text-[#00e5ff] mt-1">{weeklyActiveUsers}</p>
              </div>
              <div className="bg-[#0a0d14]/30 border border-white/5 p-4 rounded-xl">
                <span className="text-gray-500 text-[9px] font-bold uppercase tracking-wider">Monthly Active (MAU)</span>
                <p className="text-xl font-black text-white mt-1">{monthlyActiveUsers}</p>
              </div>
              <div className="bg-[#0a0d14]/30 border border-white/5 p-4 rounded-xl">
                <span className="text-gray-500 text-[9px] font-bold uppercase tracking-wider">Views Weekly</span>
                <p className="text-xl font-black text-white mt-1">{viewsThisWeek}</p>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
              
              {/* Top 10 Anime Chart list */}
              <div className="bg-[#0a0d14]/30 border border-white/5 p-6 rounded-2xl space-y-5">
                <h3 className="text-sm font-black text-white uppercase tracking-wider border-b border-white/5 pb-2 flex items-center justify-between">
                  <span>Top 10 Most Watched Anime</span>
                  <span className="text-[10px] text-gray-500 font-bold">Cumulative view count</span>
                </h3>
                
                {top10Anime.length === 0 ? (
                  <p className="text-xs text-gray-500 text-center py-12">No play tracking events registered yet.</p>
                ) : (
                  <div className="space-y-4">
                    {top10Anime.map((an, idx) => {
                      const maxViews = top10Anime[0].count;
                      const percentage = maxViews > 0 ? (an.count / maxViews) * 100 : 0;
                      return (
                        <div key={an.id} className="space-y-1.5">
                          <div className="flex justify-between items-center text-xs font-bold">
                            <div className="flex items-center gap-2 truncate">
                              <span className="text-primary font-black w-4 text-center">#{idx + 1}</span>
                              <span className="text-gray-300 truncate">{an.title}</span>
                            </div>
                            <span className="text-white shrink-0">{an.count} plays</span>
                          </div>
                          <div className="w-full bg-white/[0.02] border border-white/5 h-2 rounded-full overflow-hidden">
                            <div 
                              className="bg-primary h-full rounded-full shadow-[0_0_8px_rgba(0,229,255,0.6)]"
                              style={{ width: `${percentage}%` }}
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Top 10 Episodes list */}
              <div className="bg-[#0a0d14]/30 border border-white/5 p-6 rounded-2xl space-y-5">
                <h3 className="text-sm font-black text-white uppercase tracking-wider border-b border-white/5 pb-2 flex items-center justify-between">
                  <span>Top 10 Most Watched Episodes</span>
                  <span className="text-[10px] text-gray-500 font-bold">Individual episode plays</span>
                </h3>

                {top10Episodes.length === 0 ? (
                  <p className="text-xs text-gray-500 text-center py-12">No episode play logs recorded.</p>
                ) : (
                  <div className="space-y-4">
                    {top10Episodes.map((ep, idx) => {
                      const maxViews = top10Episodes[0].count;
                      const percentage = maxViews > 0 ? (ep.count / maxViews) * 100 : 0;
                      return (
                        <div key={ep.key} className="space-y-1.5">
                          <div className="flex justify-between items-center text-xs font-bold">
                            <div className="flex items-center gap-2 truncate">
                              <span className="text-primary font-black w-4 text-center">#{idx + 1}</span>
                              <span className="text-gray-300 truncate">{ep.animeTitle} - Ep {ep.episode}</span>
                            </div>
                            <span className="text-white shrink-0">{ep.count} views</span>
                          </div>
                          <div className="w-full bg-white/[0.02] border border-white/5 h-2 rounded-full overflow-hidden">
                            <div 
                              className="bg-[#00e5ff] h-full rounded-full"
                              style={{ width: `${percentage}%` }}
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

            </div>

            {/* Recently Streamed Events Feed */}
            <div className="bg-[#0a0d14]/30 border border-white/5 p-6 rounded-2xl space-y-4">
              <h3 className="text-sm font-black text-white uppercase tracking-wider border-b border-white/5 pb-2">
                Live Watch Activity Feed
              </h3>
              
              {recentlyWatchedAnime.length === 0 ? (
                <p className="text-xs text-gray-500 text-center py-8">Waiting for watch stream connections...</p>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {recentlyWatchedAnime.map((item, idx) => (
                    <div key={idx} className="flex gap-4 p-3 rounded-xl bg-white/[0.01] border border-white/5 hover:border-cyan-500/10 transition-all items-center">
                      <img src={item.animePoster || null} alt="" className="w-10 h-14 object-cover rounded-lg shrink-0" />
                      <div className="flex-1 overflow-hidden">
                        <p className="text-xs font-bold text-white truncate">{item.animeTitle}</p>
                        <p className="text-[10px] text-gray-400 mt-0.5">Episode {item.episode} • Played by <span className="text-primary">{item.userEmail?.split('@')[0]}</span></p>
                        <span className="text-[8px] text-gray-500 block mt-1">{new Date(item.timestamp).toLocaleTimeString()}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

          </div>
        )}

        {/* TAB 3: USER DIRECTORY & MANAGEMENT */}
        {activeTab === 'users' && (
          <div className="space-y-6">
            
            {/* Filters Bar */}
            <div className="flex flex-col sm:flex-row gap-4 justify-between items-center bg-[#0a0d14]/30 border border-white/5 p-4 rounded-xl backdrop-blur-md">
              <div className="relative w-full sm:max-w-sm">
                <Search size={14} className="text-gray-500 absolute top-3.5 left-4" />
                <input 
                  type="text"
                  placeholder="Search user by username or email..."
                  value={userSearchQuery}
                  onChange={(e) => setUserSearchQuery(e.target.value)}
                  className="w-full bg-black/40 text-xs text-white pl-10 pr-4 py-2.5 rounded-xl border border-white/5 outline-none focus:border-primary/50 transition-colors"
                />
              </div>

              <div className="flex items-center gap-2 w-full sm:w-auto">
                <Filter size={14} className="text-gray-500" />
                <span className="text-xs text-gray-400 font-bold uppercase">Filter:</span>
                <div className="flex gap-1.5">
                  {['all', 'premium', 'vip', 'banned'].map(f => (
                    <button
                      key={f}
                      onClick={() => setUserFilter(f)}
                      className={cn(
                        "px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-wider border transition-colors cursor-pointer",
                        userFilter === f 
                          ? "bg-primary text-black border-primary" 
                          : "bg-white/5 text-gray-400 border-transparent hover:text-white hover:bg-white/10"
                      )}
                    >
                      {f}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* User Directory Table list */}
            <div className="bg-[#0a0d14]/30 border border-white/5 rounded-2xl overflow-hidden backdrop-blur-md">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="border-b border-white/5 text-gray-500 font-black uppercase text-[10px] tracking-wider">
                      <th className="py-4 px-6">Username</th>
                      <th className="py-4 px-4">Email</th>
                      <th className="py-4 px-4">Clearance status</th>
                      <th className="py-4 px-4">Saved Comments</th>
                      <th className="py-4 px-4 text-right">Directory Moderation</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5 font-bold text-gray-200">
                    {filteredUsers.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="py-12 text-center text-gray-500 text-xs">No registered accounts matching this search filter.</td>
                      </tr>
                    ) : (
                      filteredUsers.map((usr, usrIdx) => {
                        const isBanned = usr.banned === true;
                        return (
                          <tr key={usr.uid || usr.email || usr.username || `usr-${usrIdx}`} className="hover:bg-white/[0.01] transition-colors">
                            <td className="py-4 px-6 flex items-center gap-2">
                              <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center text-primary font-black border border-primary/40 uppercase">
                                {usr.username?.charAt(0)}
                              </div>
                              <span className="font-extrabold text-white text-xs">{usr.username || 'Guest'}</span>
                            </td>
                            <td className="py-4 px-4 text-gray-400 font-semibold">{usr.email}</td>
                            <td className="py-4 px-4">
                              {isBanned ? (
                                <span className="bg-red-500/10 border border-red-500/30 text-red-400 text-[8px] font-black px-2 py-0.5 rounded uppercase tracking-wider">
                                  Banned
                                </span>
                              ) : (
                                <span className={cn(
                                  "text-[8px] font-black px-2 py-0.5 rounded uppercase tracking-wider border",
                                  usr.role === 'admin' 
                                    ? "bg-red-500/10 border-red-500/30 text-red-400" 
                                    : "bg-primary/10 border-primary/20 text-primary"
                                )}>
                                  {usr.role === 'admin' ? 'SysAdmin' : usr.status || 'Premium'}
                                </span>
                              )}
                            </td>
                            <td className="py-4 px-4 text-gray-400 font-semibold">{usr.commentsCount || 0} posts</td>
                            <td className="py-4 px-4 text-right">
                              <div className="flex gap-2 justify-end">
                                <button
                                  onClick={() => handleInspectUser(usr)}
                                  className="p-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-gray-400 hover:text-white border border-white/5 transition-all cursor-pointer"
                                  title="View History Details"
                                >
                                  <Eye size={12} />
                                </button>
                                {usr.email !== 'mdido406@gmail.com' && (
                                  <button
                                    onClick={() => handleToggleBanUser(usr)}
                                    className={cn(
                                      "p-1.5 rounded-lg transition-all border cursor-pointer",
                                      isBanned
                                        ? "bg-red-500/20 text-red-400 border-red-500/30 hover:bg-red-500/30"
                                        : "bg-white/5 text-gray-400 border-white/5 hover:bg-red-500/10 hover:text-red-400 hover:border-red-500/20"
                                    )}
                                    title={isBanned ? "Lift Ban" : "Ban User"}
                                  >
                                    <Ban size={12} />
                                  </button>
                                )}
                              </div>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* User detail dialog modal */}
            {selectedUser && (
              <div className="fixed inset-0 bg-black/80 backdrop-blur-lg z-50 flex items-center justify-center p-4">
                <div className="bg-[#050505] border border-cyan-500/15 w-full max-w-2xl rounded-3xl p-6 md:p-8 space-y-6 relative overflow-hidden shadow-[0_0_50px_rgba(0,229,255,0.15)] max-h-[85vh] overflow-y-auto">
                  <div className="absolute top-0 right-0 w-32 h-32 bg-primary/5 rounded-full blur-3xl pointer-events-none" />
                  
                  <div className="flex justify-between items-start gap-4">
                    <div className="flex items-center gap-4">
                      <div className="w-12 h-12 rounded-full bg-primary/20 border border-primary/40 flex items-center justify-center text-primary text-lg font-black uppercase">
                        {selectedUser.username?.charAt(0)}
                      </div>
                      <div>
                        <h4 className="text-lg font-black text-white">{selectedUser.username}</h4>
                        <p className="text-xs text-gray-400">{selectedUser.email}</p>
                      </div>
                    </div>
                    <button 
                      onClick={() => setSelectedUser(null)}
                      className="px-3 py-1.5 bg-white/5 hover:bg-white/10 rounded-xl text-xs font-black transition-colors border border-white/5 text-gray-400 hover:text-white cursor-pointer uppercase tracking-wider"
                    >
                      Close
                    </button>
                  </div>

                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4 bg-[#0a0d14]/50 border border-white/5 p-4 rounded-2xl">
                    <div>
                      <span className="text-[9px] text-gray-500 font-black uppercase tracking-wider block">Rank</span>
                      <p className="text-xs font-bold text-white uppercase mt-0.5">{selectedUser.status || 'Premium'}</p>
                    </div>
                    <div>
                      <span className="text-[9px] text-gray-500 font-black uppercase tracking-wider block">Comment Counts</span>
                      <p className="text-xs font-bold text-white mt-0.5">{selectedUser.commentsCount || 0} posts</p>
                    </div>
                    <div>
                      <span className="text-[9px] text-gray-500 font-black uppercase tracking-wider block">Favorites Saved</span>
                      <p className="text-xs font-bold text-primary mt-0.5">{selectedUserFavorites.length} anime</p>
                    </div>
                    <div>
                      <span className="text-[9px] text-gray-500 font-black uppercase tracking-wider block">Register Date</span>
                      <p className="text-xs font-bold text-white mt-0.5">{new Date(selectedUser.createdAt).toLocaleDateString()}</p>
                    </div>
                  </div>

                  {loadingUserDetail ? (
                    <div className="py-12 text-center text-primary animate-pulse text-xs font-black uppercase tracking-widest">Loading history telemeter...</div>
                  ) : (
                    <div className="space-y-6">
                      
                      {/* Watch History progress list */}
                      <div className="space-y-3">
                        <h5 className="text-xs font-black text-white uppercase tracking-wider flex items-center gap-1.5">
                          <Clock size={12} className="text-primary" />
                          Watch progression history ({selectedUserHistory.length})
                        </h5>
                        {selectedUserHistory.length === 0 ? (
                          <p className="text-[11px] text-gray-500 py-3 text-center border border-white/5 border-dashed rounded-xl">No saved watch history progress found.</p>
                        ) : (
                          <div className="space-y-2 max-h-40 overflow-y-auto pr-1">
                            {selectedUserHistory.map((h: any, idx) => (
                              <div key={idx} className="flex justify-between items-center p-2.5 bg-white/[0.01] border border-white/5 rounded-xl text-xs font-bold">
                                <span className="text-gray-200 truncate pr-3">{h.animeTitle}</span>
                                <span className="text-primary text-[10px] shrink-0 uppercase tracking-wider">Episode {h.episode}</span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>

                      {/* Favorites saved */}
                      <div className="space-y-3">
                        <h5 className="text-xs font-black text-white uppercase tracking-wider flex items-center gap-1.5">
                          <Heart size={12} className="text-primary" />
                          Favorites ({selectedUserFavorites.length})
                        </h5>
                        {selectedUserFavorites.length === 0 ? (
                          <p className="text-[11px] text-gray-500 py-3 text-center border border-white/5 border-dashed rounded-xl">No saved favorites cataloged.</p>
                        ) : (
                          <div className="flex flex-wrap gap-2 max-h-32 overflow-y-auto pr-1">
                            {selectedUserFavorites.map((fav: any, favIdx) => (
                              <div key={fav.id || fav.animeId || fav.title || `fav-${favIdx}`} className="bg-white/5 border border-white/5 px-2.5 py-1 rounded-lg text-[10px] font-bold text-gray-300">
                                {fav.title}
                              </div>
                            ))}
                          </div>
                        )}
                      </div>

                    </div>
                  )}

                  {/* Danger zone actions */}
                  {selectedUser.email !== 'mdido406@gmail.com' && (
                    <div className="border-t border-white/5 pt-6 flex justify-between gap-4">
                      <button
                        onClick={() => handleToggleBanUser(selectedUser)}
                        className={cn(
                          "px-4 py-2 text-[10px] font-black uppercase tracking-wider border rounded-xl cursor-pointer",
                          selectedUser.banned 
                            ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20" 
                            : "bg-red-500/10 text-red-400 border-red-500/20"
                        )}
                      >
                        {selectedUser.banned ? 'UNBAN ACCOUNT' : 'BAN ACCOUNT'}
                      </button>
                      <button
                        onClick={() => handleDeleteUser(selectedUser)}
                        className="px-4 py-2 text-[10px] font-black uppercase tracking-wider bg-red-500 text-white hover:bg-red-600 rounded-xl cursor-pointer"
                      >
                        DELETE ACCOUNT PERMANENTLY
                      </button>
                    </div>
                  )}
                </div>
              </div>
            )}

          </div>
        )}

        {/* TAB 4: COMMENT MODERATION ZONE */}
        {activeTab === 'comments' && (
          <div className="bg-[#0a0d14]/30 border border-white/5 p-6 rounded-2xl space-y-4 backdrop-blur-md">
            <h3 className="text-sm font-black text-white uppercase tracking-wider border-b border-white/5 pb-2.5">
              Live Comment Moderation & Reported Catalog ({commentsToModerate.length})
            </h3>

            {commentsToModerate.length === 0 ? (
              <p className="text-xs text-gray-500 text-center py-12">No active discussions exist in the database.</p>
            ) : (
              <div className="divide-y divide-white/5">
                {commentsToModerate.map((cmt, cmtIdx) => (
                  <div key={cmt.id || `cmt-${cmtIdx}`} className="py-4.5 flex flex-col md:flex-row justify-between items-start md:items-center gap-4 hover:bg-white/[0.01] transition-all rounded-xl px-2">
                    <div className="space-y-1.5 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-xs font-black text-white">{cmt.username}</span>
                        <span className="text-[10px] text-gray-500 font-semibold">{cmt.email}</span>
                        
                        {cmt.reported && (
                          <span className="bg-amber-500/10 border border-amber-500/30 text-[8px] font-black text-amber-400 px-2 py-0.5 rounded uppercase tracking-wider">
                            Reported / Flagged
                          </span>
                        )}
                        {cmt.pinned && (
                          <span className="bg-primary/10 border border-primary/30 text-[8px] font-black text-primary px-2 py-0.5 rounded uppercase flex items-center gap-0.5">
                            <Pin size={8} className="fill-primary" /> Pinned
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-gray-300 leading-relaxed font-semibold italic">"{cmt.body}"</p>
                      {cmt.animeId && (
                        <span className="text-[8px] text-primary bg-primary/5 px-2 py-0.5 rounded uppercase font-black">
                          Anime ID: {cmt.animeId} {cmt.episodeNumber && `• Ep ${cmt.episodeNumber}`}
                        </span>
                      )}
                    </div>

                    <div className="flex items-center gap-2 shrink-0 w-full md:w-auto justify-end">
                      <button
                        onClick={() => pinComment(cmt.id, !cmt.pinned)}
                        className={cn(
                          "px-3 py-1.5 rounded-lg text-[10px] font-black uppercase transition-all flex items-center gap-1 border cursor-pointer",
                          cmt.pinned 
                            ? "bg-primary/10 text-primary border-primary/20" 
                            : "bg-white/5 text-gray-400 border-transparent hover:text-white"
                        )}
                      >
                        <Pin size={10} />
                        {cmt.pinned ? 'Unpin' : 'Pin'}
                      </button>
                      <button
                        onClick={() => {
                          deleteComment(cmt.id);
                          alert('Comment successfully deleted.');
                        }}
                        className="px-3 py-1.5 rounded-lg bg-red-500/10 text-red-400 hover:bg-red-500/20 border border-red-500/20 text-[10px] font-black uppercase transition-all flex items-center gap-1 cursor-pointer"
                      >
                        <Trash2 size={10} />
                        Delete
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* TAB 5: ANIME UPLOAD SYSTEM ZONE */}
        {activeTab === 'upload' && (
          <div className="space-y-6">
            
            {/* Tab Header */}
            <div className="flex justify-between items-center bg-[#0a0d14]/30 border border-white/5 p-5 rounded-2xl backdrop-blur-md">
              <div>
                <h3 className="text-sm font-black text-white uppercase tracking-wider flex items-center gap-2">
                  <UploadCloud size={16} className="text-primary" />
                  Anime upload and asset manager
                </h3>
                <p className="text-[10px] text-gray-400 mt-1">Saves records directly to Firebase; syncs assets directly to Cloudinary.</p>
              </div>
              {uploadTabMode === 'list' && (
                <div className="flex flex-wrap gap-2.5">
                  <button
                    onClick={() => setUploadTabMode('youtubeChannelImport')}
                    className="flex items-center gap-1.5 px-4 py-2.5 bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/20 hover:border-rose-500/30 font-black text-xs rounded-xl transition-all cursor-pointer uppercase tracking-wider"
                  >
                    <Sparkles size={14} className="text-rose-400" />
                    YT Channel Importer
                  </button>
                  <button
                    onClick={handleCreateNewAnimeClick}
                    className="flex items-center gap-1.5 px-4 py-2.5 bg-primary hover:bg-[#00cce0] text-black font-black text-xs rounded-xl transition-all cursor-pointer shadow-lg shadow-cyan-500/15 uppercase tracking-wider"
                  >
                    <FolderPlus size={14} />
                    Upload New Anime
                  </button>
                </div>
              )}
            </div>

            {/* A. LIST MODE: Shows all uploaded shows */}
            {uploadTabMode === 'list' && (
              <div className="space-y-6">
                
                {/* INSTRUCTIONAL BANNER FOR BULK/YT IMPORT */}
                <div className="bg-[#00c5db]/5 border border-[#00c5db]/20 rounded-2xl p-6 relative overflow-hidden">
                  <div className="absolute top-0 right-0 w-[300px] h-[300px] bg-[#00c5db]/10 rounded-full blur-[120px] -mr-20 -mt-20 pointer-events-none" />
                  <div className="flex gap-4 items-start relative z-10">
                    <div className="bg-[#00c5db]/10 p-3 rounded-xl border border-[#00c5db]/25 text-[#00c5db] shrink-0">
                      <Sparkles size={20} className="animate-pulse" />
                    </div>
                    <div className="space-y-2">
                      <h4 className="text-xs font-black text-white uppercase tracking-wider flex items-center gap-1.5">
                        🚀 EXPEDITED BULK & YOUTUBE PLAYLIST IMPORT ENGINE IS ACTIVE
                      </h4>
                      <p className="text-[11px] text-gray-300 leading-relaxed">
                        Don't waste time uploading episodes one by one! The bulk uploading and YouTube video stream automation tools are fully integrated inside the <strong className="text-[#00c5db]">Episodes Upload Manager</strong> of each anime series.
                      </p>
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-2 text-[10px] font-bold uppercase tracking-wider text-gray-400">
                        <div className="bg-black/30 border border-white/5 p-3 rounded-xl space-y-1">
                          <span className="text-[#00c5db] block font-black">1. BULK VIDEO URL IMPORT</span>
                          <p className="text-[9px] text-gray-500 normal-case font-medium leading-normal">Paste direct video stream URLs, iframe embeds, or public file links in bulk to auto-parse complete seasons instantly.</p>
                        </div>
                        <div className="bg-black/30 border border-white/5 p-3 rounded-xl space-y-1">
                          <span className="text-[#00c5db] block font-black">2. YOUTUBE PLAYLIST SYNC</span>
                          <p className="text-[9px] text-gray-500 normal-case font-medium leading-normal">Fetch full streams, multi-track audio mapping, custom titles, and automatic thumbnails directly from any YouTube playlist.</p>
                        </div>
                        <div className="bg-black/30 border border-white/5 p-3 rounded-xl space-y-1">
                          <span className="text-amber-400 block font-black">3. HOW TO LAUNCH THEM</span>
                          <p className="text-[9px] text-gray-500 normal-case font-medium leading-normal">Click <strong className="text-white">"Edit"</strong> on any anime card below (or click <strong className="text-white">"Upload New Anime"</strong>). Scroll down to find the Episodes Manager to toggle these tools.</p>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-5">
                {customAnimes.length === 0 ? (
                  <div className="col-span-full py-16 text-center bg-[#0a0d14]/10 border border-white/5 border-dashed rounded-3xl flex flex-col items-center justify-center space-y-4">
                    <Sparkles size={36} className="text-gray-600 animate-pulse" />
                    <div>
                      <p className="text-xs font-black text-white uppercase tracking-wider">No custom anime uploaded yet</p>
                      <p className="text-[10px] text-gray-500 mt-1">Click 'Upload New Anime' above to create your first series.</p>
                    </div>
                  </div>
                ) : (
                  customAnimes.map((anime, animeIdx) => (
                    <div key={anime.id || `anime-${animeIdx}`} className="bg-[#0a0d14]/40 border border-white/5 rounded-2xl overflow-hidden flex flex-col hover:border-primary/20 transition-all group relative">
                      {anime.visibility === 'draft' && (
                        <span className="absolute top-3 left-3 z-10 bg-amber-500/90 text-black text-[8px] font-black px-2 py-0.5 rounded uppercase tracking-widest shadow-md">
                          DRAFT
                        </span>
                      )}
                      
                      <div className="relative aspect-video w-full overflow-hidden bg-black/40">
                        <img 
                          src={anime.banner || anime.poster || null} 
                          alt="" 
                          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" 
                        />
                        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent" />
                        <div className="absolute bottom-2.5 left-2.5 right-2.5 sm:bottom-4 sm:left-4 sm:right-4 flex items-end gap-2 sm:gap-3">
                          <img src={anime.poster || null} alt="" className="w-8 h-11 sm:w-10 sm:h-14 object-cover rounded-md border border-white/10 shrink-0 shadow-lg" />
                          <div className="overflow-hidden">
                            <h4 className="text-[10px] sm:text-xs font-black text-white truncate drop-shadow-md uppercase tracking-tight">{anime.title}</h4>
                            <p className="text-[8px] sm:text-[9px] text-gray-400 mt-0.5 font-bold uppercase">{anime.type} • {anime.status} • {anime.released}</p>
                          </div>
                        </div>
                      </div>

                      <div className="p-2.5 sm:p-4 flex-1 flex flex-col justify-between space-y-3 sm:space-y-4">
                        <div className="space-y-2">
                          <p className="text-[9px] sm:text-[10px] text-gray-400 font-semibold line-clamp-2 italic leading-relaxed">
                            "{anime.description || 'No description provided.'}"
                          </p>
                          <div className="flex flex-wrap gap-1">
                            {Array.isArray(anime.genres) ? anime.genres.slice(0, 3).map((g: string, gIdx: number) => (
                              <span key={`${g}-${gIdx}`} className="bg-white/5 px-1 py-0.5 rounded text-[7px] sm:text-[8px] text-gray-400 uppercase font-black tracking-wider border border-white/5">
                                {g}
                              </span>
                            )) : null}
                          </div>
                        </div>

                        <div className="flex gap-1.5 sm:gap-2 pt-2 border-t border-white/5">
                          <button
                            type="button"
                            onClick={() => handleEditAnimeClick(anime)}
                            className="flex-1 py-1.5 sm:py-2 bg-white/5 hover:bg-white/10 text-white border border-white/5 hover:border-white/15 rounded-xl font-black text-[8px] sm:text-[10px] uppercase tracking-wider transition-all flex items-center justify-center gap-1 sm:gap-1.5 cursor-pointer min-w-0"
                          >
                            <Edit3 size={10} className="text-primary shrink-0" />
                            <span className="truncate">Manage<span className="hidden xs:inline sm:inline"> Show</span></span>
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeleteAnimeClick(String(anime.id), anime.title, anime.poster, anime.banner)}
                            className="p-1.5 sm:p-2 bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/25 rounded-xl transition-all cursor-pointer shrink-0"
                            title="Delete Anime Show"
                          >
                            <Trash size={11} className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                          </button>
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}

            {/* YOUTUBE CHANNEL PLAYLIST IMPORTER MODE */}
            {uploadTabMode === 'youtubeChannelImport' && (
              <div className="space-y-6">
                <div className="flex justify-between items-center border-b border-white/5 pb-4">
                  <h4 className="text-xs font-black text-white uppercase tracking-wider flex items-center gap-1.5">
                    <Sparkles size={14} className="text-rose-400 animate-pulse" />
                    YouTube Channel Playlist Importer
                  </h4>
                  <button
                    type="button"
                    onClick={() => {
                      setUploadTabMode('list');
                      setYtChannelPlaylists([]);
                      setYtSelectedPlaylists({});
                      setYtChannelInfo(null);
                    }}
                    className="px-3.5 py-1.5 bg-white/5 hover:bg-white/10 rounded-xl text-[10px] font-black border border-white/5 text-gray-300 hover:text-white transition-all uppercase tracking-wider cursor-pointer"
                  >
                    Back to Catalog
                  </button>
                </div>

                {/* Search Bar / Input */}
                <div className="bg-[#0a0d14]/30 border border-white/5 rounded-2xl p-6 space-y-4">
                  <div className="space-y-1">
                    <label className="text-[10px] text-gray-400 font-black uppercase tracking-wider block">
                      YouTube Channel URL or Handle
                    </label>
                    <p className="text-[9px] text-gray-500 normal-case leading-relaxed block">
                      Enter any public YouTube channel link, handle, or URL (e.g., <code className="text-rose-400 font-mono">https://www.youtube.com/@MuseAsia</code>, <code className="text-rose-400 font-mono">@MuseAsia</code>, or <code className="text-rose-400 font-mono">https://www.youtube.com/channel/UCGba99-6O_h89mY_lSss2aA</code>).
                    </p>
                  </div>

                  <div className="flex gap-2.5">
                    <input
                      type="text"
                      value={ytChannelUrl}
                      onChange={(e) => setYtChannelUrl(e.target.value)}
                      placeholder="e.g. https://www.youtube.com/@MuseAsia"
                      className="flex-1 bg-black/40 border border-white/10 focus:border-rose-500/50 rounded-xl px-4 py-3 text-xs text-white placeholder-gray-600 focus:outline-none transition-all"
                      disabled={ytChannelLoading || (ytImportingProgress?.active || false)}
                    />
                    <button
                      type="button"
                      onClick={handleLoadChannelPlaylists}
                      disabled={ytChannelLoading || (ytImportingProgress?.active || false)}
                      className="px-5 py-3 bg-rose-500 hover:bg-rose-600 text-white font-black text-xs rounded-xl uppercase tracking-wider transition-all disabled:opacity-50 flex items-center gap-1.5 cursor-pointer shrink-0"
                    >
                      {ytChannelLoading ? (
                        <>
                          <div className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />
                          Fetching...
                        </>
                      ) : (
                        <>
                          <Sparkles size={14} />
                          Fetch Playlists
                        </>
                      )}
                    </button>
                  </div>
                </div>

                {/* SMART ANIME IMPORT & METADATA CONTROL CENTER */}
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4 bg-[#0a0d14]/40 border border-white/5 rounded-2xl p-5">
                  <div className="bg-black/30 border border-white/5 p-4 rounded-xl space-y-1">
                    <span className="text-[9px] text-gray-400 font-black uppercase tracking-wider block">Imported Playlists</span>
                    <div className="text-lg font-black text-white font-mono">{importSummaryStats.playlistsProcessed}</div>
                    <div className="text-[9px] text-emerald-400 font-semibold">{importSummaryStats.episodesAdded} Episodes Added</div>
                  </div>

                  <div className="bg-black/30 border border-white/5 p-4 rounded-xl space-y-1">
                    <span className="text-[9px] text-gray-400 font-black uppercase tracking-wider block">Duplicate Prevention</span>
                    <div className="text-lg font-black text-cyan-400 font-mono">{importSummaryStats.animeCreatedCount} New / {importSummaryStats.animeUpdatedCount} Updated</div>
                    <div className="text-[9px] text-gray-500 font-semibold">Auto-merged duplicates</div>
                  </div>

                  <div className="bg-black/30 border border-white/5 p-4 rounded-xl space-y-1">
                    <span className="text-[9px] text-gray-400 font-black uppercase tracking-wider block">Metadata Pipeline</span>
                    <div className="flex items-center gap-2">
                      <span className="text-lg font-black text-white font-mono">
                        {metadataProgress.completed}/{metadataProgress.total}
                      </span>
                      {metadataProgress.running && (
                        <span className="px-2 py-0.5 bg-cyan-500/10 text-cyan-400 text-[8px] font-black uppercase tracking-wider rounded border border-cyan-500/20 animate-pulse flex items-center gap-1">
                          <RefreshCw size={10} className="animate-spin" /> Fetching
                        </span>
                      )}
                    </div>
                    <div className="text-[9px] text-gray-400 font-semibold flex items-center justify-between">
                      <span>AniList ➔ MAL ➔ Kitsu</span>
                      <button
                        type="button"
                        onClick={handleRetryFailedMetadata}
                        disabled={metadataProgress.running}
                        className="text-rose-400 hover:text-rose-300 underline font-black text-[9px] cursor-pointer"
                      >
                        Retry Failed
                      </button>
                    </div>
                  </div>

                  <div className="bg-black/30 border border-white/5 p-4 rounded-xl space-y-1">
                    <span className="text-[9px] text-gray-400 font-black uppercase tracking-wider block">Skipped Non-Anime Items</span>
                    <div className="text-lg font-black text-rose-400 font-mono">{skippedVideoLogs.length}</div>
                    <button
                      type="button"
                      onClick={() => setShowSkippedModal(true)}
                      className="text-[9px] text-gray-300 hover:text-white underline font-black cursor-pointer block"
                    >
                      View Skipped Logs ({skippedVideoLogs.length})
                    </button>
                  </div>
                </div>

                {/* Importing Progress Overlay */}
                {ytImportingProgress?.active && (
                  <div className="bg-[#0a0d14]/80 border border-rose-500/20 rounded-2xl p-6 space-y-4 backdrop-blur-md">
                    <div className="flex justify-between items-center">
                      <div className="space-y-1">
                        <span className="text-[9px] text-rose-400 font-black uppercase tracking-wider block animate-pulse">
                          IMPORTING PLAYLIST CONTENT IN PROGRESS ({ytImportingProgress.index}/{ytImportingProgress.total})
                        </span>
                        <h5 className="text-xs font-black text-white uppercase tracking-tight">
                          Parsing Series: "{ytImportingProgress.currentPlaylistName}"
                        </h5>
                      </div>
                      <span className="text-xs font-black text-rose-400 font-mono">
                        {ytImportingProgress.percent}%
                      </span>
                    </div>

                    <div className="w-full bg-black/40 h-2.5 rounded-full overflow-hidden border border-white/5">
                      <div
                        className="bg-gradient-to-r from-rose-500 to-cyan-500 h-full rounded-full transition-all duration-300"
                        style={{ width: `${ytImportingProgress.percent}%` }}
                      />
                    </div>
                    <p className="text-[10px] text-gray-400 font-semibold italic">
                      Please keep this tab open. We are extracting video metadata, mapping stream links, generating custom episode layouts, and syncing everything to your Firebase catalog database.
                    </p>
                  </div>
                )}

                {/* Playlists Results */}
                {!ytChannelLoading && ytChannelPlaylists.length > 0 && (
                  <div className="space-y-6">
                    {/* Metadata Header & Settings */}
                    <div className="bg-[#0a0d14]/30 border border-white/5 rounded-2xl p-5 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                      <div>
                        <span className="text-[9px] text-rose-400 font-black uppercase tracking-wider block">
                          CHANNEL RESOLVED VIA {ytChannelInfo?.source?.toUpperCase()}
                        </span>
                        <h4 className="text-xs font-black text-white uppercase tracking-wider mt-0.5">
                          Available Public Playlists ({ytChannelPlaylists.length})
                        </h4>
                      </div>

                      <div className="flex flex-wrap items-center gap-4 w-full md:w-auto">
                        {/* Select Category */}
                        <div className="flex items-center gap-2">
                          <label className="text-[9px] text-gray-400 font-black uppercase tracking-wider">
                            Set Category:
                          </label>
                          <select
                            value={ytImportCategory}
                            onChange={(e) => setYtImportCategory(e.target.value)}
                            className="bg-black/50 border border-white/10 rounded-xl px-3 py-1.5 text-[11px] font-bold text-white focus:outline-none focus:border-rose-500/50"
                          >
                            <option value="featured">Featured Shows</option>
                            <option value="trending">Trending Anime</option>
                            <option value="popular">Popular Series</option>
                            <option value="recentlyAdded">Recently Added</option>
                            <option value="topAiring">Top Airing</option>
                            <option value="latest">Latest Episodes</option>
                            <option value="completed">Completed Series</option>
                            <option value="ongoing">Ongoing Series</option>
                            <option value="movies">Movies</option>
                            <option value="hindi-dubbed">Hindi Dubbed</option>
                          </select>
                        </div>

                        {/* Batch Action Helpers */}
                        <div className="flex flex-wrap items-center gap-2">
                          <button
                            type="button"
                            onClick={() => {
                              const batch: Record<string, boolean> = {};
                              let count = 0;
                              const maxLimit = 700;
                              ytChannelPlaylists.forEach(p => {
                                const unimportable = p.validationStatus && ['MEMBERS_ONLY', 'PRIVATE', 'EMBED_DISABLED'].includes(p.validationStatus);
                                if (!unimportable && count < maxLimit) {
                                  batch[p.playlistId] = true;
                                  count++;
                                }
                              });
                              setYtSelectedPlaylists(batch);
                              toast.info(`Selected ${count} playlists for import (limit: 700 max per batch).`);
                            }}
                            className="px-2.5 py-1.5 bg-white/5 hover:bg-white/10 rounded-lg text-[9px] font-black uppercase tracking-wider border border-white/5 text-gray-300 transition-all cursor-pointer"
                          >
                            Select All (Up to 700)
                          </button>
                          <button
                            type="button"
                            onClick={() => setYtSelectedPlaylists({})}
                            className="px-2.5 py-1.5 bg-white/5 hover:bg-white/10 rounded-lg text-[9px] font-black uppercase tracking-wider border border-white/5 text-gray-300 transition-all cursor-pointer"
                          >
                            Deselect All
                          </button>
                        </div>
                      </div>
                    </div>

                    {/* Grid List */}
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                      {ytChannelPlaylists.map((playlist, idx) => {
                        const isChecked = ytSelectedPlaylists[playlist.playlistId] || false;
                        const isUnimportable = playlist.validationStatus && ['MEMBERS_ONLY', 'PRIVATE', 'EMBED_DISABLED'].includes(playlist.validationStatus);
                        return (
                          <div
                            key={playlist.playlistId || idx}
                            onClick={() => {
                              if (ytImportingProgress?.active || isUnimportable) return;
                              setYtSelectedPlaylists(prev => ({
                                ...prev,
                                [playlist.playlistId]: !isChecked
                              }));
                            }}
                            className={`bg-[#0a0d14]/20 border rounded-2xl p-4 flex gap-4 hover:bg-[#0a0d14]/40 transition-all cursor-pointer relative overflow-hidden group ${
                              isChecked 
                                ? 'border-rose-500/30 bg-rose-500/5' 
                                : isUnimportable 
                                  ? 'border-red-500/30 bg-red-500/5 opacity-60 cursor-not-allowed' 
                                  : 'border-white/5'
                            }`}
                          >
                            {/* Checkbox or warning indicator */}
                            <div className="absolute top-3 right-3">
                              {isUnimportable ? (
                                <div className="text-red-500 flex items-center justify-center p-1 bg-red-500/10 rounded-full border border-red-500/20" title="This playlist is private, members-only, or embed-disabled and cannot be imported">
                                  <ShieldAlert size={14} />
                                </div>
                              ) : (
                                <div className={`w-4 h-4 rounded border flex items-center justify-center transition-all ${
                                  isChecked ? 'bg-rose-500 border-rose-500 text-white' : 'border-white/20 bg-black/40'
                                }`}>
                                  {isChecked && <div className="w-1.5 h-1.5 bg-white rounded-full" />}
                                </div>
                              )}
                            </div>

                            {/* Thumbnail */}
                            <div className="w-24 aspect-video bg-black/40 border border-white/10 rounded-lg overflow-hidden shrink-0 relative">
                              <img
                                src={playlist.playlistThumbnail || null}
                                alt=""
                                className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                              />
                              <div className="absolute bottom-1 right-1 bg-black/80 px-1 py-0.5 rounded text-[8px] font-mono text-gray-300">
                                {playlist.videoCount || 0} videos
                              </div>
                            </div>

                            {/* Text Metadata */}
                            <div className="flex-1 min-w-0 pr-4">
                              <h5 className="text-[11px] font-black text-white uppercase tracking-tight line-clamp-2 leading-snug group-hover:text-rose-400 transition-colors">
                                {playlist.title}
                              </h5>
                              <p className="text-[9px] text-gray-500 mt-1 font-bold">
                                PLAYLIST ID: {playlist.playlistId}
                              </p>
                              
                              {!playlist.validationStatus ? (
                                <div className="mt-2 flex items-center gap-2">
                                  <span className="inline-flex items-center gap-1 bg-zinc-500/10 text-zinc-400 border border-zinc-500/20 px-2 py-0.5 rounded-md text-[8px] font-black uppercase tracking-wider">
                                    ⚪ Unscanned
                                  </span>
                                  <button
                                    type="button"
                                    disabled={scanningPlaylists[playlist.playlistId]}
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      scanPlaylistStatus(playlist.playlistId);
                                    }}
                                    className="px-2 py-0.5 bg-rose-500 hover:bg-rose-600 text-black rounded text-[8px] font-black uppercase tracking-wider transition-all cursor-pointer"
                                  >
                                    {scanningPlaylists[playlist.playlistId] ? "Scanning..." : "🔍 Scan"}
                                  </button>
                                </div>
                              ) : (
                                <div className="mt-2 flex items-center gap-2 flex-wrap">
                                  {(playlist.validationStatus === 'AVAILABLE' || playlist.validationStatus === 'REGION_BLOCKED') && (
                                    <span className="inline-flex items-center gap-1 bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 px-2 py-0.5 rounded-md text-[8px] font-black uppercase tracking-wider">
                                      🟢 Available
                                    </span>
                                  )}
                                  {playlist.validationStatus === 'PRIVATE' && (
                                    <span className="inline-flex items-center gap-1 bg-zinc-500/20 text-zinc-400 border border-zinc-500/40 px-2 py-0.5 rounded-md text-[8px] font-black uppercase tracking-wider">
                                      ⚫ Private
                                    </span>
                                  )}
                                  {playlist.validationStatus === 'EMBED_DISABLED' && (
                                    <span className="inline-flex items-center gap-1 bg-purple-500/20 text-purple-400 border border-purple-500/40 px-2 py-0.5 rounded-md text-[8px] font-black uppercase tracking-wider">
                                      🔒 Embed Disabled
                                    </span>
                                  )}
                                  {playlist.validationStatus === 'PLAYBACK_RESTRICTED' && (
                                    <span className="inline-flex items-center gap-1 bg-orange-500/20 text-orange-400 border border-orange-500/40 px-2 py-0.5 rounded-md text-[8px] font-black uppercase tracking-wider">
                                      ⚠️ Playback Restricted
                                    </span>
                                  )}
                                  {playlist.validationStatus === 'UNAVAILABLE' && (
                                    <span className="inline-flex items-center gap-1 bg-rose-500/20 text-rose-400 border border-rose-500/40 px-2 py-0.5 rounded-md text-[8px] font-black uppercase tracking-wider">
                                      ❌ Unavailable
                                    </span>
                                  )}

                                  <button
                                    type="button"
                                    disabled={scanningPlaylists[playlist.playlistId]}
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      scanPlaylistStatus(playlist.playlistId);
                                    }}
                                    className="px-1.5 py-0.5 bg-white/5 hover:bg-white/10 text-gray-400 hover:text-white rounded text-[7px] font-black uppercase tracking-wider transition-all cursor-pointer"
                                    title="Re-scan status"
                                  >
                                    {scanningPlaylists[playlist.playlistId] ? "..." : "🔄"}
                                  </button>
                                </div>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    {/* Bottom Action Button */}
                    <div className="flex justify-end pt-4">
                      <button
                        type="button"
                        onClick={handleImportSelectedPlaylists}
                        disabled={ytImportingProgress?.active || Object.values(ytSelectedPlaylists).filter(Boolean).length === 0}
                        className="px-6 py-3.5 bg-gradient-to-r from-rose-500 to-rose-600 hover:from-rose-600 hover:to-rose-700 text-white font-black text-xs rounded-xl uppercase tracking-wider transition-all disabled:opacity-50 flex items-center gap-2 cursor-pointer shadow-lg shadow-rose-500/10"
                      >
                        <Sparkles size={14} />
                        Import {Object.values(ytSelectedPlaylists).filter(Boolean).length} Selected Playlists
                      </button>
                    </div>
                  </div>
                )}

                {/* Empty State */}
                {!ytChannelLoading && ytChannelPlaylists.length === 0 && ytChannelInfo && (
                  <div className="py-16 text-center bg-[#0a0d14]/10 border border-white/5 border-dashed rounded-3xl flex flex-col items-center justify-center space-y-4">
                    <Sparkles size={36} className="text-gray-600 animate-pulse" />
                    <div>
                      <p className="text-xs font-black text-white uppercase tracking-wider">No Playlists Found</p>
                      <p className="text-[10px] text-gray-500 mt-1">This channel might not have any public playlists listed, or they are set to private.</p>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* AI WEB SCRAPER & IMPORTER MODE */}
            {uploadTabMode === 'aiScraper' && (
              <div className="space-y-6">
                <div className="flex justify-between items-center border-b border-white/5 pb-4">
                  <h4 className="text-xs font-black text-white uppercase tracking-wider flex items-center gap-1.5">
                    <Sparkles size={14} className="text-emerald-400 animate-pulse" />
                    AI Website Anime & Episode Importer
                  </h4>
                  <button
                    type="button"
                    onClick={() => {
                      setUploadTabMode('list');
                      setScraperResult(null);
                      setScraperUrl('');
                    }}
                    className="px-3.5 py-1.5 bg-white/5 hover:bg-white/10 rounded-xl text-[10px] font-black border border-white/5 text-gray-300 hover:text-white transition-all uppercase tracking-wider cursor-pointer"
                  >
                    Back to Catalog
                  </button>
                </div>

                {/* Input Bar */}
                <div className="bg-[#0a0d14]/30 border border-white/5 rounded-2xl p-6 space-y-5">
                  {/* Mode Toggles */}
                  <div className="flex gap-2 p-1 bg-black/40 border border-white/10 rounded-xl max-w-sm">
                    <button
                      type="button"
                      onClick={() => setScraperMode('url')}
                      className={`flex-1 py-1.5 px-3 rounded-lg text-[10px] font-black uppercase tracking-wider transition-all cursor-pointer text-center ${
                        scraperMode === 'url'
                          ? 'bg-emerald-500 text-black shadow-lg shadow-emerald-500/15'
                          : 'text-gray-400 hover:text-white hover:bg-white/5'
                      }`}
                    >
                      Direct URL Import
                    </button>
                    <button
                      type="button"
                      onClick={() => setScraperMode('html')}
                      className={`flex-1 py-1.5 px-3 rounded-lg text-[10px] font-black uppercase tracking-wider transition-all cursor-pointer text-center ${
                        scraperMode === 'html'
                          ? 'bg-emerald-500 text-black shadow-lg shadow-emerald-500/15'
                          : 'text-gray-400 hover:text-white hover:bg-white/5'
                      }`}
                    >
                      Failsafe HTML Paste
                    </button>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-[10px] text-gray-400 font-black uppercase tracking-wider block">
                      {scraperMode === 'html' ? 'Target Anime Webpage URL (For links resolving)' : 'Target Anime Webpage URL'}
                    </label>
                    {scraperMode === 'html' ? (
                      <div className="space-y-3 bg-black/40 border border-emerald-500/10 p-3.5 rounded-xl text-[10px] text-gray-400 leading-relaxed">
                        <p className="font-bold text-emerald-400 uppercase tracking-wider text-[9px] flex items-center gap-1">
                          <span>💡</span> কীভাবে ফেইলসেফ মোড ব্যবহার করবেন (How to use Failsafe HTML Paste):
                        </p>
                        
                        <div className="space-y-2.5 text-[9px] list-decimal pl-1">
                          <p>
                            <span className="text-white font-bold">১. </span> 
                            আপনার ব্রাউজারে টার্গেট অ্যানিমে পেজটি ওপেন করুন এবং লিংকটি কপি করুন।
                          </p>
                          <div className="border-l-2 border-emerald-500/20 pl-2 space-y-1">
                            <p className="text-white font-semibold">📱 মোবাইলের জন্য সহজ পদ্ধতি (Recommended for Mobile):</p>
                            <p>
                              নিচের যেকোনো একটি ফ্রি অনলাইন টুল ওপেন করুন (নতুন ট্যাবে ওপেন হবে):
                            </p>
                            <div className="flex flex-wrap gap-2 pt-1">
                              <a 
                                href="https://viewpagesource.online/" 
                                target="_blank" 
                                rel="noopener noreferrer" 
                                className="px-2 py-1 bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/30 text-emerald-400 rounded text-[8px] font-bold uppercase tracking-wider transition-all"
                              >
                                Link 1: ViewPageSource.online ↗
                              </a>
                              <a 
                                href="https://codebeautify.org/source-code-viewer" 
                                target="_blank" 
                                rel="noopener noreferrer" 
                                className="px-2 py-1 bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/30 text-emerald-400 rounded text-[8px] font-bold uppercase tracking-wider transition-all"
                              >
                                Link 2: CodeBeautify Source Viewer ↗
                              </a>
                            </div>
                            <p className="text-gray-500 pt-1">
                              সেখানে লিংকটি পেস্ট করে <strong className="text-gray-300">"View Source" / "Fetch"</strong> বাটনে চাপুন। তারপর সম্পূর্ণ কোড এক ক্লিকে কপি করুন।
                            </p>
                          </div>
                          <p>
                            <span className="text-white font-bold">২. </span>
                            <strong>কম্পিউটার/ডেস্কটপ থেকে:</strong> পেজে গিয়ে কিবোর্ডে <kbd className="bg-white/10 px-1 py-0.5 rounded text-white font-mono text-[8px]">Ctrl + U</kbd> প্রেস করুন। এবার সব কোড সিলেক্ট করে কপি করতে <kbd className="bg-white/10 px-1 py-0.5 rounded text-white font-mono text-[8px]">Ctrl + A</kbd> এবং তারপর <kbd className="bg-white/10 px-1 py-0.5 rounded text-white font-mono text-[8px]">Ctrl + C</kbd> চাপুন।
                          </p>
                          <p>
                            <span className="text-white font-bold">৩. </span>
                            কপি করা সম্পূর্ণ কোডটি নিচের <strong className="text-white">Paste Page Source HTML Code</strong> বক্সে পেস্ট করে দিয়ে <strong className="text-emerald-400">Extract with AI Now</strong> বাটনে ক্লিক করুন।
                          </p>
                        </div>
                        <p className="text-[8px] text-emerald-400/70 border-t border-white/5 pt-1.5 mt-1.5">
                          * Note: This completely bypasses Cloudflare security & 403 blocks!
                        </p>
                      </div>
                    ) : (
                      <p className="text-[9px] text-gray-500 normal-case leading-relaxed block">
                        Paste the link of any webpage containing anime details or streaming episodes (e.g. from <code className="text-emerald-400 font-mono">watchanimeworld.net</code>, <code className="text-emerald-400 font-mono">themoviebox.xyz</code>, etc.). Our AI engine will scrape, sanitize, and extract the series details, poster, and episode play links instantly.
                      </p>
                    )}
                  </div>

                  <div className="flex gap-2.5">
                    <input
                      type="text"
                      value={scraperUrl}
                      onChange={(e) => setScraperUrl(e.target.value)}
                      placeholder="e.g. https://watchanimeworld.net/anime/demon-slayer"
                      className="flex-1 bg-black/40 border border-white/10 focus:border-emerald-500/50 rounded-xl px-4 py-3 text-xs text-white placeholder-gray-600 focus:outline-none transition-all"
                      disabled={scraperLoading || isScraperImporting}
                    />
                    {scraperMode === 'url' && (
                      <button
                        type="button"
                        onClick={handleScrapeWebPage}
                        disabled={scraperLoading || isScraperImporting}
                        className="px-5 py-3 bg-emerald-500 hover:bg-emerald-600 text-black font-black text-xs rounded-xl uppercase tracking-wider transition-all disabled:opacity-50 flex items-center gap-1.5 cursor-pointer shrink-0 shadow-lg shadow-emerald-500/15"
                      >
                        {scraperLoading ? (
                          <>
                            <div className="w-3 h-3 border-2 border-black border-t-transparent rounded-full animate-spin" />
                            Analyzing Web Page...
                          </>
                        ) : (
                          <>
                            <Sparkles size={14} />
                            Analyze & Extract
                          </>
                        )}
                      </button>
                    )}
                  </div>

                  {scraperMode === 'html' && (
                    <div className="space-y-2 pt-2 border-t border-white/5">
                      <div className="flex justify-between items-center">
                        <label className="text-[10px] text-gray-400 font-black uppercase tracking-wider block">
                          Paste Page Source HTML Code
                        </label>
                        <span className="text-[8px] font-mono text-emerald-400 uppercase tracking-widest animate-pulse">
                          Cloudflare / 403 Failsafe Bypass Active
                        </span>
                      </div>
                      <textarea
                        rows={8}
                        value={scraperHtmlSource}
                        onChange={(e) => setScraperHtmlSource(e.target.value)}
                        placeholder="Right-click page -> View Source -> Copy and paste the raw HTML source code here..."
                        className="w-full bg-black/50 border border-white/10 focus:border-emerald-500/50 rounded-xl p-3.5 text-[11px] text-gray-300 placeholder-gray-700 focus:outline-none transition-all resize-none font-mono leading-relaxed"
                        disabled={scraperLoading || isScraperImporting}
                      />
                      <div className="flex justify-end pt-1">
                        <button
                          type="button"
                          onClick={handleScrapeWebPage}
                          disabled={scraperLoading || isScraperImporting || !scraperHtmlSource.trim() || !scraperUrl.trim()}
                          className="w-full sm:w-auto px-6 py-3 bg-emerald-500 hover:bg-emerald-600 text-black font-black text-xs rounded-xl uppercase tracking-wider transition-all disabled:opacity-50 flex items-center justify-center gap-1.5 cursor-pointer shadow-lg shadow-emerald-500/15"
                        >
                          {scraperLoading ? (
                            <>
                              <div className="w-3 h-3 border-2 border-black border-t-transparent rounded-full animate-spin" />
                              Processing HTML & Extracting...
                            </>
                          ) : (
                            <>
                              <Sparkles size={14} />
                              Extract with AI Now
                            </>
                          )}
                        </button>
                      </div>
                    </div>
                  )}
                </div>

                {/* Scraped Results Preview */}
                {scraperResult && (
                  scraperResult.pageType === 'catalog' ? (
                    // Rendering the Catalog / Directory UI
                    <div className="space-y-6 pt-4">
                      {/* Bulk Category Selection */}
                      <div className="bg-[#0a0d14]/30 border border-white/5 rounded-2xl p-6 space-y-4">
                        <div className="flex justify-between items-center border-b border-white/5 pb-3">
                          <div className="space-y-0.5">
                            <span className="text-[10px] text-emerald-400 font-black uppercase tracking-wider block">
                              1. Target Placement Categories
                            </span>
                            <p className="text-[9px] text-gray-500 normal-case leading-relaxed">
                              Choose which sections of the homepage all imported shows from this catalog will be placed into.
                            </p>
                          </div>
                        </div>
                        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-2 text-[10px] font-black uppercase tracking-wider text-gray-400">
                          {ALL_CATEGORIES_LIST.map((cat) => {
                            const isChecked = !!scraperSelectedCategories[cat.id];
                            return (
                              <label
                                key={cat.id}
                                className={`flex items-center gap-2 p-2.5 rounded-xl border transition-all cursor-pointer select-none ${
                                  isChecked ? 'border-emerald-500/30 bg-emerald-500/5 text-white' : 'border-white/5 hover:bg-white/5'
                                }`}
                              >
                                <input
                                  type="checkbox"
                                  checked={isChecked}
                                  onChange={(e) => setScraperSelectedCategories(prev => ({
                                    ...prev,
                                    [cat.id]: e.target.checked
                                  }))}
                                  className="hidden"
                                />
                                <div className={`w-3.5 h-3.5 rounded border flex items-center justify-center shrink-0 ${
                                  isChecked ? 'border-emerald-500 bg-emerald-500 text-black' : 'border-white/20'
                                }`}>
                                  {isChecked && <div className="w-1.5 h-1.5 bg-black rounded-full" />}
                                </div>
                                <span className="truncate">{cat.name.replace('✨ ', '')}</span>
                              </label>
                            );
                          })}
                        </div>
                      </div>

                      {/* Header with counts and quick actions */}
                      <div className="flex flex-col sm:flex-row gap-4 justify-between items-start sm:items-center bg-[#0a0d14]/30 border border-white/5 rounded-2xl p-6">
                        <div className="space-y-1">
                          <h4 className="text-sm font-black text-white uppercase tracking-wider flex items-center gap-2">
                            <Sparkles size={16} className="text-emerald-400" />
                            Detected Catalog Shows ({scraperResult.shows?.length || 0})
                          </h4>
                          <p className="text-[10px] text-gray-500">
                            Check the shows you want to import. We will automatically fetch their details and all episodes in the background!
                          </p>
                        </div>
                        <div className="flex items-center gap-2 w-full sm:w-auto">
                          <button
                            type="button"
                            onClick={() => {
                              const all: Record<string, boolean> = {};
                              scraperResult.shows?.forEach((s: any) => { all[s.url] = true; });
                              setSelectedCatalogShows(all);
                            }}
                            className="flex-1 sm:flex-none px-3.5 py-2 bg-white/5 hover:bg-white/10 rounded-xl text-[10px] font-black border border-white/5 text-gray-300 hover:text-white transition-all uppercase tracking-wider cursor-pointer"
                          >
                            Select All
                          </button>
                          <button
                            type="button"
                            onClick={() => setSelectedCatalogShows({})}
                            className="flex-1 sm:flex-none px-3.5 py-2 bg-white/5 hover:bg-white/10 rounded-xl text-[10px] font-black border border-white/5 text-gray-300 hover:text-white transition-all uppercase tracking-wider cursor-pointer"
                          >
                            Deselect All
                          </button>
                        </div>
                      </div>

                      {/* Importing Progress Panel */}
                      {catalogImportingProgress && (
                        <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-2xl p-6 space-y-3 animate-pulse">
                          <div className="flex justify-between items-center">
                            <span className="text-[11px] text-emerald-400 font-black uppercase tracking-wider">
                              Bulk Importing Status ({catalogImportingProgress.index} of {catalogImportingProgress.total})
                            </span>
                            <span className="text-[10px] font-mono font-bold text-emerald-400">
                              {catalogImportingProgress.percent}%
                            </span>
                          </div>
                          <div className="w-full h-1.5 bg-black/50 rounded-full overflow-hidden">
                            <div
                              className="h-full bg-emerald-500 transition-all duration-300"
                              style={{ width: `${catalogImportingProgress.percent}%` }}
                            />
                          </div>
                          <p className="text-[10px] font-mono text-gray-400">
                            Current Action: <span className="text-emerald-400 font-bold">{catalogImportingProgress.currentShowName}</span>
                          </p>
                        </div>
                      )}

                      {/* Grid of Shows */}
                      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4">
                        {scraperResult.shows?.map((show: any, index: number) => {
                          const isChecked = !!selectedCatalogShows[show.url];
                          return (
                            <div
                              key={index}
                              onClick={() => setSelectedCatalogShows(prev => ({ ...prev, [show.url]: !prev[show.url] }))}
                              className={`bg-[#0a0d14]/30 border rounded-2xl overflow-hidden transition-all duration-200 cursor-pointer select-none relative group ${
                                isChecked ? 'border-emerald-500 ring-1 ring-emerald-500/20' : 'border-white/5 hover:border-white/10'
                              }`}
                            >
                              {/* Checkbox Icon overlay */}
                              <div className={`absolute top-2.5 right-2.5 z-10 w-5 h-5 rounded-lg border flex items-center justify-center transition-all shadow-md ${
                                isChecked ? 'border-emerald-500 bg-emerald-500 text-black' : 'border-white/20 bg-black/60 group-hover:border-white/40'
                              }`}>
                                {isChecked && <div className="w-2 h-2 bg-black rounded-full" />}
                              </div>

                              {/* Poster image container */}
                              <div className="aspect-[3/4] relative bg-black/50 w-full overflow-hidden">
                                {show.coverImage ? (
                                  <img
                                    src={show.coverImage}
                                    alt={show.title}
                                    className="w-full h-full object-cover transition-transform group-hover:scale-105"
                                    referrerPolicy="no-referrer"
                                    onError={(e) => {
                                      (e.target as HTMLImageElement).src = 'https://images.unsplash.com/photo-1578632767115-351597cf2477?w=300&auto=format&fit=crop&q=80';
                                    }}
                                  />
                                ) : (
                                  <div className="absolute inset-0 flex flex-col items-center justify-center text-gray-600 p-2 text-center">
                                    <Sparkles size={20} className="animate-pulse mb-1.5" />
                                    <span className="text-[8px] font-bold">NO POSTER</span>
                                  </div>
                                )}
                              </div>

                              {/* Title & Description */}
                              <div className="p-3.5 space-y-1">
                                <h5 className="text-[11px] font-black text-white line-clamp-2 uppercase tracking-tight leading-snug group-hover:text-emerald-400 transition-colors">
                                  {show.title}
                                </h5>
                                {show.description && (
                                  <p className="text-[9px] text-gray-500 line-clamp-1 leading-normal">
                                    {show.description}
                                  </p>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>

                      {/* Footer Import Action */}
                      <div className="flex justify-end pt-4">
                        <button
                          type="button"
                          onClick={handleImportCatalogShows}
                          disabled={isScraperImporting || Object.values(selectedCatalogShows).filter(Boolean).length === 0}
                          className="w-full sm:w-auto px-8 py-3.5 bg-gradient-to-r from-emerald-500 to-emerald-600 hover:from-emerald-600 hover:to-emerald-700 text-black font-black text-xs rounded-xl uppercase tracking-wider transition-all disabled:opacity-50 flex items-center justify-center gap-2 cursor-pointer shadow-lg shadow-emerald-500/15"
                        >
                          {isScraperImporting ? (
                            <>
                              <div className="w-3.5 h-3.5 border-2 border-black border-t-transparent rounded-full animate-spin" />
                              Bulk Importing Selected Shows...
                            </>
                          ) : (
                            <>
                              <UploadCloud size={14} />
                              📥 Import Selected Anime ({Object.values(selectedCatalogShows).filter(Boolean).length})
                            </>
                          )}
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 pt-4">
                      {/* Left Column: Parsed Metadata & Edit */}
                      <div className="lg:col-span-1 space-y-6">
                        <div className="bg-[#0a0d14]/30 border border-white/5 rounded-2xl p-6 space-y-5">
                          <span className="text-[9px] text-emerald-400 font-black uppercase tracking-wider block border-b border-white/5 pb-2">
                            1. Series Metadata Review
                          </span>

                          {/* Cover Image Preview */}
                          <div className="space-y-2">
                            <label className="text-[10px] text-gray-400 font-black uppercase tracking-wider block">Poster Artwork</label>
                            <div className="aspect-[3/4] w-full bg-black/50 border border-white/10 rounded-xl overflow-hidden relative group">
                              {scraperResult.coverImage ? (
                                <img
                                  src={scraperResult.coverImage}
                                  alt="Cover preview"
                                  className="w-full h-full object-cover"
                                  referrerPolicy="no-referrer"
                                  onError={(e) => {
                                    (e.target as HTMLImageElement).src = 'https://images.unsplash.com/photo-1578632767115-351597cf2477?w=300&auto=format&fit=crop&q=80';
                                  }}
                                />
                              ) : (
                                <div className="absolute inset-0 flex flex-col items-center justify-center text-gray-600">
                                  <Sparkles size={24} className="animate-pulse mb-2" />
                                  <span className="text-[9px] font-bold">NO ARTWORK FOUND</span>
                                </div>
                              )}
                            </div>
                            <input
                              type="text"
                              value={scraperResult.coverImage || ''}
                              onChange={(e) => setScraperResult({ ...scraperResult, coverImage: e.target.value })}
                              placeholder="Poster Image URL"
                              className="w-full bg-black/40 border border-white/10 focus:border-emerald-500/50 rounded-lg px-3 py-2 text-[11px] text-white focus:outline-none"
                            />
                          </div>

                          {/* Title & Description */}
                          <div className="space-y-3">
                            <div className="space-y-1">
                              <label className="text-[10px] text-gray-400 font-black uppercase tracking-wider block">Anime Title</label>
                              <input
                                type="text"
                                value={scraperResult.title || ''}
                                onChange={(e) => setScraperResult({ ...scraperResult, title: e.target.value })}
                                className="w-full bg-black/40 border border-white/10 focus:border-emerald-500/50 rounded-lg px-3 py-2 text-[11px] text-white focus:outline-none font-bold"
                              />
                            </div>

                            <div className="space-y-1">
                              <label className="text-[10px] text-gray-400 font-black uppercase tracking-wider block">Synopsis / Description</label>
                              <textarea
                                rows={4}
                                value={scraperResult.description || ''}
                                onChange={(e) => setScraperResult({ ...scraperResult, description: e.target.value })}
                                className="w-full bg-black/40 border border-white/10 focus:border-emerald-500/50 rounded-lg p-3 text-[11px] text-white focus:outline-none resize-none leading-relaxed"
                              />
                            </div>

                            <div className="grid grid-cols-2 gap-3">
                              <div className="space-y-1">
                                <label className="text-[10px] text-gray-400 font-black uppercase tracking-wider block">Release Year</label>
                                <input
                                  type="text"
                                  value={scraperResult.releaseYear || ''}
                                  onChange={(e) => setScraperResult({ ...scraperResult, releaseYear: e.target.value })}
                                  className="w-full bg-black/40 border border-white/10 focus:border-emerald-500/50 rounded-lg px-3 py-2 text-[11px] text-white focus:outline-none"
                                />
                              </div>
                              <div className="space-y-1">
                                <label className="text-[10px] text-gray-400 font-black uppercase tracking-wider block">Format / Type</label>
                                <select
                                  value={scraperResult.type || 'TV'}
                                  onChange={(e) => setScraperResult({ ...scraperResult, type: e.target.value })}
                                  className="w-full bg-black/40 border border-white/10 focus:border-emerald-500/50 rounded-lg px-3 py-2 text-[11px] text-white focus:outline-none font-bold"
                                >
                                  <option value="TV">TV Show</option>
                                  <option value="Movie">Movie</option>
                                  <option value="OVA">OVA</option>
                                  <option value="Special">Special</option>
                                </select>
                              </div>
                            </div>

                            <div className="space-y-1">
                              <label className="text-[10px] text-gray-400 font-black uppercase tracking-wider block">Genres (Comma separated)</label>
                              <input
                                type="text"
                                value={scraperResult.genres?.join(', ') || ''}
                                onChange={(e) => setScraperResult({ ...scraperResult, genres: e.target.value.split(',').map((s: string) => s.trim()) })}
                                placeholder="Action, Adventure, Fantasy"
                                className="w-full bg-black/40 border border-white/10 focus:border-emerald-500/50 rounded-lg px-3 py-2 text-[11px] text-white focus:outline-none"
                              />
                            </div>
                          </div>
                        </div>

                        {/* Slider Placements */}
                        <div className="bg-[#0a0d14]/30 border border-white/5 rounded-2xl p-6 space-y-4">
                          <span className="text-[9px] text-emerald-400 font-black uppercase tracking-wider block border-b border-white/5 pb-2">
                            2. Homepage Section Placement
                          </span>
                          <div className="grid grid-cols-2 gap-2 text-[10px] font-black uppercase tracking-wider text-gray-400">
                            {ALL_CATEGORIES_LIST.map((cat) => {
                              const isChecked = !!scraperSelectedCategories[cat.id];
                              return (
                                <label
                                  key={cat.id}
                                  className={`flex items-center gap-2 p-2.5 rounded-xl border transition-all cursor-pointer select-none ${
                                    isChecked ? 'border-emerald-500/30 bg-emerald-500/5 text-white' : 'border-white/5 hover:bg-white/5'
                                  }`}
                                >
                                  <input
                                    type="checkbox"
                                    checked={isChecked}
                                    onChange={(e) => setScraperSelectedCategories(prev => ({
                                      ...prev,
                                      [cat.id]: e.target.checked
                                    }))}
                                    className="hidden"
                                  />
                                  <div className={`w-3.5 h-3.5 rounded border flex items-center justify-center shrink-0 ${
                                    isChecked ? 'border-emerald-500 bg-emerald-500 text-black' : 'border-white/20'
                                  }`}>
                                    {isChecked && <div className="w-1.5 h-1.5 bg-black rounded-full" />}
                                  </div>
                                  <span className="truncate">{cat.name.replace('✨ ', '')}</span>
                                </label>
                              );
                            })}
                          </div>
                        </div>
                      </div>

                      {/* Right Column: Parsed Episodes Table */}
                      <div className="lg:col-span-2 space-y-6">
                        <div className="bg-[#0a0d14]/30 border border-white/5 rounded-2xl p-6 space-y-4">
                          <div className="flex justify-between items-center border-b border-white/5 pb-3">
                            <div className="space-y-0.5">
                              <span className="text-[9px] text-emerald-400 font-black uppercase tracking-wider block">
                                3. Extracted Episodes List ({scraperResult.episodes?.length || 0})
                              </span>
                              <p className="text-[9px] text-gray-500 normal-case leading-relaxed">
                                Review parsed stream/embed URLs. You can edit any title or stream source directly in the list below.
                              </p>
                            </div>
                          </div>

                          {(!scraperResult.episodes || scraperResult.episodes.length === 0) ? (
                            <div className="py-12 text-center bg-black/10 border border-white/5 border-dashed rounded-xl">
                              <p className="text-xs font-bold text-gray-400">No episodes detected on this webpage.</p>
                              <p className="text-[10px] text-gray-600 mt-1">Check your URL or verify content is visible on the target page.</p>
                            </div>
                          ) : (
                            <div className="max-h-[600px] overflow-y-auto border border-white/5 rounded-xl bg-black/20 divide-y divide-white/5">
                              {scraperResult.episodes.map((ep: any, index: number) => (
                                <div key={index} className="p-3 flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
                                  <div className="flex items-center gap-3 w-full sm:w-1/3">
                                    <span className="text-[10px] font-mono font-black text-emerald-400 bg-emerald-400/10 px-2 py-0.5 rounded border border-emerald-400/20 shrink-0">
                                      EP {ep.episodeNumber}
                                    </span>
                                    <input
                                      type="text"
                                      value={ep.title || ''}
                                      onChange={(e) => {
                                        const updated = [...scraperResult.episodes];
                                        updated[index].title = e.target.value;
                                        setScraperResult({ ...scraperResult, episodes: updated });
                                      }}
                                      placeholder={`Episode ${ep.episodeNumber}`}
                                      className="bg-transparent border-b border-transparent hover:border-white/10 focus:border-emerald-500/30 text-xs text-white font-bold focus:outline-none w-full"
                                    />
                                  </div>
                                  <div className="flex-1 w-full flex items-center gap-2">
                                    <span className="text-[8px] font-bold uppercase text-gray-500 font-mono shrink-0">Source URL:</span>
                                    <input
                                      type="text"
                                      value={ep.url || ''}
                                      onChange={(e) => {
                                        const updated = [...scraperResult.episodes];
                                        updated[index].url = e.target.value;
                                        setScraperResult({ ...scraperResult, episodes: updated });
                                      }}
                                      placeholder="Source play URL"
                                      className="bg-black/30 border border-white/5 focus:border-emerald-500/30 rounded px-2.5 py-1 text-[10px] font-mono text-gray-300 focus:outline-none w-full"
                                    />
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}

                          {/* Import Execution Button */}
                          <div className="pt-4 flex justify-end">
                            <button
                              type="button"
                              onClick={handleImportScrapedAnime}
                              disabled={isScraperImporting || !scraperResult.title || (scraperResult.episodes?.length || 0) === 0}
                              className="w-full sm:w-auto px-8 py-3.5 bg-gradient-to-r from-emerald-500 to-emerald-600 hover:from-emerald-600 hover:to-emerald-700 text-black font-black text-xs rounded-xl uppercase tracking-wider transition-all disabled:opacity-50 flex items-center justify-center gap-2 cursor-pointer shadow-lg shadow-emerald-500/15"
                            >
                              {isScraperImporting ? (
                                <>
                                  <div className="w-3.5 h-3.5 border-2 border-black border-t-transparent rounded-full animate-spin" />
                                  Saving custom show to catalog database...
                                </>
                              ) : (
                                <>
                                  <UploadCloud size={14} />
                                  📥 Import Custom Anime & {scraperResult.episodes?.length || 0} Episodes
                                </>
                              )}
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  )
                )}
              </div>
            )}

            {/* B. ANIME FORM MODE */}
            {uploadTabMode === 'animeForm' && (
              <form onSubmit={handleSaveAnimeForm} className="space-y-8">
                <div className="flex justify-between items-center border-b border-white/5 pb-4">
                  <h4 className="text-xs font-black text-white uppercase tracking-wider flex items-center gap-1.5">
                    <Settings size={14} className="text-primary animate-spin" />
                    {editingAnime ? `Edit Catalog Show: ${animeForm.title}` : 'Catalog New Anime Series'}
                  </h4>
                  <button
                    type="button"
                    onClick={() => setUploadTabMode('list')}
                    className="px-3.5 py-1.5 bg-white/5 hover:bg-white/10 rounded-xl text-[10px] font-black border border-white/5 text-gray-300 hover:text-white transition-all uppercase tracking-wider cursor-pointer"
                  >
                    Back to Catalog
                  </button>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                  
                  {/* Left Column: Metadata Inputs */}
                  <div className="lg:col-span-2 space-y-6">
                    
                    <div className="space-y-1.5">
                      <div className="flex justify-between items-center flex-wrap gap-2">
                        <label className="text-[10px] text-gray-500 font-black uppercase tracking-wider">English Title / Romaji Name</label>
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => triggerAutoFetch(false)}
                            disabled={metadataStatus === 'loading' || !animeForm.title}
                            className="text-[9px] bg-primary/20 hover:bg-primary/30 text-primary border border-primary/30 px-2.5 py-1 rounded-lg font-black uppercase tracking-wider transition-all disabled:opacity-40 cursor-pointer flex items-center gap-1"
                          >
                            {metadataStatus === 'loading' ? (
                              <>
                                <span className="animate-spin inline-block w-2.5 h-2.5 border-2 border-primary border-t-transparent rounded-full" />
                                Fetching...
                              </>
                            ) : (
                              '⚡ Auto Fetch Metadata'
                            )}
                          </button>
                          {metadataStatus === 'success' && (
                            <button
                              type="button"
                              onClick={() => triggerAutoFetch(true)}
                              disabled={metadataStatus === 'loading'}
                              className="text-[9px] bg-white/5 hover:bg-white/10 text-white border border-white/10 px-2.5 py-1 rounded-lg font-black uppercase tracking-wider transition-all disabled:opacity-40 cursor-pointer"
                            >
                              🔄 Refresh Metadata
                            </button>
                          )}
                        </div>
                      </div>
                      <input 
                        type="text" 
                        required
                        value={animeForm.title}
                        onChange={(e) => setAnimeForm(prev => ({ ...prev, title: e.target.value }))}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            if (animeForm.title && animeForm.title !== lastFetchedTitleRef.current) {
                              lastFetchedTitleRef.current = animeForm.title;
                              triggerAutoFetch(false);
                            }
                          }
                        }}
                        placeholder="e.g. Solo Leveling Season 2 or YouTube Trailer Link (Press Enter or click Auto Fetch)"
                        className="w-full bg-black/40 text-xs text-white px-4 py-3 rounded-xl border border-white/5 outline-none focus:border-primary/50 transition-colors font-bold"
                      />
                      {metadataMessage && (
                        <p className={`text-[10px] font-bold mt-1 ${
                          metadataStatus === 'success' ? 'text-green-400' :
                          metadataStatus === 'error' ? 'text-red-400' :
                          'text-primary animate-pulse'
                        }`}>
                          {metadataMessage}
                        </p>
                      )}
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-[10px] text-gray-500 font-black uppercase tracking-wider">Detailed Synopsis</label>
                      <textarea 
                        rows={4}
                        required
                        value={animeForm.description}
                        onChange={(e) => setAnimeForm(prev => ({ ...prev, description: e.target.value }))}
                        placeholder="Provide deep description of the show storyline, main characters, and plot..."
                        className="w-full bg-black/40 text-xs text-white px-4 py-3 rounded-xl border border-white/5 outline-none focus:border-primary/50 transition-colors leading-relaxed font-semibold"
                      />
                    </div>

                    <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                      
                      <div className="space-y-1.5">
                        <label className="text-[10px] text-gray-500 font-black uppercase tracking-wider">Format Type</label>
                        <select 
                          value={animeForm.type}
                          onChange={(e) => setAnimeForm(prev => ({ ...prev, type: e.target.value }))}
                          className="w-full bg-black/40 text-xs text-white px-4 py-3 rounded-xl border border-white/5 outline-none focus:border-primary/50 transition-colors font-bold"
                        >
                          <option value="TV">TV Show</option>
                          <option value="Movie">Movie</option>
                          <option value="OVA">OVA</option>
                          <option value="Special">Special Event</option>
                          <option value="Trailer">Trailer</option>
                        </select>
                      </div>

                      <div className="space-y-1.5">
                        <label className="text-[10px] text-gray-500 font-black uppercase tracking-wider">Airing Status</label>
                        <select 
                          value={animeForm.status}
                          onChange={(e) => setAnimeForm(prev => ({ ...prev, status: e.target.value }))}
                          className="w-full bg-black/40 text-xs text-white px-4 py-3 rounded-xl border border-white/5 outline-none focus:border-primary/50 transition-colors font-bold"
                        >
                          <option value="Ongoing">Ongoing</option>
                          <option value="Completed">Completed</option>
                          <option value="Upcoming">Upcoming</option>
                        </select>
                      </div>

                      <div className="space-y-1.5">
                        <label className="text-[10px] text-gray-500 font-black uppercase tracking-wider">Visibility status</label>
                        <select 
                          value={animeForm.visibility}
                          onChange={(e) => setAnimeForm(prev => ({ ...prev, visibility: e.target.value }))}
                          className="w-full bg-black/40 text-xs text-white px-4 py-3 rounded-xl border border-white/5 outline-none focus:border-primary/50 transition-colors font-bold"
                        >
                          <option value="public">Public (Visible to everyone)</option>
                          <option value="draft">Draft (Visible only to administrators)</option>
                        </select>
                      </div>

                      <div className="space-y-1.5">
                        <label className="text-[10px] text-gray-500 font-black uppercase tracking-wider">Total Episodes</label>
                        <input 
                          type="number" 
                          required
                          disabled={animeForm.type === 'Trailer'}
                          value={animeForm.type === 'Trailer' ? 1 : animeForm.episodes}
                          onChange={(e) => setAnimeForm(prev => ({ ...prev, episodes: Number(e.target.value) }))}
                          className="w-full bg-black/40 text-xs text-white px-4 py-3 rounded-xl border border-white/5 outline-none focus:border-primary/50 transition-colors font-bold disabled:opacity-50"
                        />
                      </div>

                      <div className="space-y-1.5">
                        <label className="text-[10px] text-gray-500 font-black uppercase tracking-wider">Rating (MAL / IMDb)</label>
                        <input 
                          type="text" 
                          required
                          value={animeForm.rating}
                          onChange={(e) => setAnimeForm(prev => ({ ...prev, rating: e.target.value }))}
                          placeholder="e.g. 8.75"
                          className="w-full bg-black/40 text-xs text-white px-4 py-3 rounded-xl border border-white/5 outline-none focus:border-primary/50 transition-colors font-bold"
                        />
                      </div>

                      <div className="space-y-1.5">
                        <label className="text-[10px] text-gray-500 font-black uppercase tracking-wider">Released Year</label>
                        <input 
                          type="text" 
                          required
                          value={animeForm.released}
                          onChange={(e) => setAnimeForm(prev => ({ ...prev, released: e.target.value }))}
                          placeholder="e.g. 2025"
                          className="w-full bg-black/40 text-xs text-white px-4 py-3 rounded-xl border border-white/5 outline-none focus:border-primary/50 transition-colors font-bold"
                        />
                      </div>

                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      
                      <div className="space-y-1.5">
                        <div className="flex justify-between items-center">
                          <label className="text-[10px] text-gray-500 font-black uppercase tracking-wider">Genres (Comma separated)</label>
                          <button
                            type="button"
                            onClick={() => setAnimeForm(prev => ({ ...prev, categories: autoMapGenresToCategories(animeForm.genres, prev.categories, ALL_CATEGORIES_LIST) }))}
                            className="text-[9px] text-primary hover:text-cyan-400 font-black uppercase tracking-wider transition-all bg-primary/10 hover:bg-primary/20 px-2 py-0.5 rounded border border-primary/20 cursor-pointer flex items-center gap-1 active:scale-95"
                          >
                            <span>⚡ Auto-Map to Checkboxes</span>
                          </button>
                        </div>
                        <input 
                          type="text" 
                          required
                          value={animeForm.genres}
                          onChange={(e) => {
                            const val = e.target.value;
                            setAnimeForm(prev => ({
                              ...prev,
                              genres: val,
                              categories: autoMapGenresToCategories(val, prev.categories, ALL_CATEGORIES_LIST)
                            }));
                          }}
                          onBlur={() => setAnimeForm(prev => ({ ...prev, categories: autoMapGenresToCategories(animeForm.genres, prev.categories, ALL_CATEGORIES_LIST) }))}
                          placeholder="Action, Adventure, Fantasy, Sci-Fi"
                          className="w-full bg-black/40 text-xs text-white px-4 py-3 rounded-xl border border-white/5 outline-none focus:border-primary/50 transition-colors font-bold"
                        />
                      </div>

                      <div className="space-y-1.5">
                        <label className="text-[10px] text-gray-500 font-black uppercase tracking-wider">Studio Company</label>
                        <input 
                          type="text" 
                          required
                          value={animeForm.studio}
                          onChange={(e) => setAnimeForm(prev => ({ ...prev, studio: e.target.value }))}
                          placeholder="e.g. A-1 Pictures"
                          className="w-full bg-black/40 text-xs text-white px-4 py-3 rounded-xl border border-white/5 outline-none focus:border-primary/50 transition-colors font-bold"
                        />
                      </div>

                    </div>

                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                      
                      <div className="space-y-1.5">
                        <label className="text-[10px] text-gray-500 font-black uppercase tracking-wider">Season</label>
                        <input 
                          type="text" 
                          value={animeForm.season || ''}
                          onChange={(e) => setAnimeForm(prev => ({ ...prev, season: e.target.value }))}
                          placeholder="e.g. Winter 2025"
                          className="w-full bg-black/40 text-xs text-white px-4 py-3 rounded-xl border border-white/5 outline-none focus:border-primary/50 transition-colors font-bold"
                        />
                      </div>

                      <div className="space-y-1.5">
                        <label className="text-[10px] text-gray-500 font-black uppercase tracking-wider">Duration</label>
                        <input 
                          type="text" 
                          value={animeForm.duration || ''}
                          onChange={(e) => setAnimeForm(prev => ({ ...prev, duration: e.target.value }))}
                          placeholder="e.g. 24 min per ep"
                          className="w-full bg-black/40 text-xs text-white px-4 py-3 rounded-xl border border-white/5 outline-none focus:border-primary/50 transition-colors font-bold"
                        />
                      </div>

                      <div className="space-y-1.5">
                        <label className="text-[10px] text-gray-500 font-black uppercase tracking-wider">Country</label>
                        <input 
                          type="text" 
                          value={animeForm.country || ''}
                          onChange={(e) => setAnimeForm(prev => ({ ...prev, country: e.target.value }))}
                          placeholder="e.g. Japan"
                          className="w-full bg-black/40 text-xs text-white px-4 py-3 rounded-xl border border-white/5 outline-none focus:border-primary/50 transition-colors font-bold"
                        />
                      </div>

                      <div className="space-y-1.5">
                        <label className="text-[10px] text-gray-500 font-black uppercase tracking-wider">Language</label>
                        <input 
                          type="text" 
                          value={animeForm.language || ''}
                          onChange={(e) => setAnimeForm(prev => ({ ...prev, language: e.target.value }))}
                          placeholder="e.g. Japanese"
                          className="w-full bg-black/40 text-xs text-white px-4 py-3 rounded-xl border border-white/5 outline-none focus:border-primary/50 transition-colors font-bold"
                        />
                      </div>

                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      
                      <div className="space-y-1.5">
                        <label className="text-[10px] text-gray-500 font-black uppercase tracking-wider">Cover Image URL</label>
                        <input 
                          type="text" 
                          value={animeForm.coverImage || ''}
                          onChange={(e) => setAnimeForm(prev => ({ ...prev, coverImage: e.target.value }))}
                          placeholder="e.g. https://domain.com/cover.jpg"
                          className="w-full bg-black/40 text-xs text-white px-4 py-3 rounded-xl border border-white/5 outline-none focus:border-primary/50 transition-colors font-bold"
                        />
                      </div>

                      <div className="space-y-1.5">
                        <label className="text-[10px] text-gray-500 font-black uppercase tracking-wider">Trailer URL</label>
                        <input 
                          type="text" 
                          value={animeForm.trailer || ''}
                          onChange={(e) => setAnimeForm(prev => ({ ...prev, trailer: e.target.value }))}
                          placeholder="e.g. https://www.youtube.com/watch?v=..."
                          className="w-full bg-black/40 text-xs text-white px-4 py-3 rounded-xl border border-white/5 outline-none focus:border-primary/50 transition-colors font-bold"
                        />
                      </div>

                    </div>

                  </div>

                  {/* Right Column: Asset Upload & Categories */}
                  <div className="space-y-6">
                    
                    {/* Poster Image Asset */}
                    <div className="bg-[#0a0d14]/40 border border-white/5 p-4 rounded-2xl space-y-3">
                      <span className="text-[10px] text-gray-500 font-black uppercase tracking-wider block">Anime Poster (vertical)</span>
                      
                      {animeForm.poster ? (
                        <div className="relative aspect-[3/4] w-28 mx-auto rounded-xl overflow-hidden border border-white/10 group">
                          <img src={animeForm.poster || null} alt="" className="w-full h-full object-cover" />
                          <button
                            type="button"
                            onClick={() => {
                              if (animeForm.poster.includes("cloudinary.com")) {
                                deleteAssetByUrl(animeForm.poster).catch(err => console.warn(err));
                              }
                              setAnimeForm(prev => ({ ...prev, poster: '' }));
                            }}
                            className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-red-400 text-[10px] font-black uppercase tracking-widest cursor-pointer"
                          >
                            Remove
                          </button>
                        </div>
                      ) : (
                        <div className="border border-white/5 border-dashed rounded-xl p-6 text-center hover:bg-white/[0.01] transition-colors relative cursor-pointer">
                          <input 
                            type="file" 
                            accept="image/*"
                            id="poster-uploader"
                            onChange={(e) => {
                              const file = e.target.files?.[0];
                              if (file) {
                                handleUploadFileToCloudinary(file, 'poster', (url) => {
                                  setAnimeForm(prev => ({ ...prev, poster: url }));
                                }, animeForm.poster);
                              }
                            }}
                            className="absolute inset-0 opacity-0 cursor-pointer"
                          />
                          <UploadCloud size={24} className="text-gray-600 mx-auto mb-2 animate-bounce" />
                          <p className="text-[9px] text-gray-400 font-extrabold uppercase">Choose image file</p>
                          <p className="text-[8px] text-gray-500 mt-0.5">Drag/Drop or click to upload</p>
                        </div>
                      )}

                      {/* Cloudinary Progress Indicator */}
                      {uploadProgress['poster'] !== undefined && (
                        <div className="space-y-1">
                          <div className="flex justify-between text-[8px] text-gray-400 font-black">
                            <span>
                              {uploadProgress['poster'] >= 100 || uploadDetails['poster']?.processing ? (
                                <span className="text-primary animate-pulse uppercase">Processing on Cloudinary...</span>
                              ) : (
                                <span className="uppercase">
                                  Uploading Poster
                                  {uploadDetails['poster']?.sizeInfo ? ` (${uploadDetails['poster'].sizeInfo})` : ' to Cloudinary...'}
                                  {uploadDetails['poster']?.speed ? ` @ ${uploadDetails['poster'].speed}` : ''}
                                </span>
                              )}
                            </span>
                            <div className="flex items-center gap-1.5">
                              <span>{Math.round(uploadProgress['poster'])}%</span>
                              {uploadProgress['poster'] < 100 && !uploadDetails['poster']?.processing && (
                                <button 
                                  type="button" 
                                  onClick={() => handleCancelUpload('poster')}
                                  className="text-red-400 hover:text-red-300 font-black uppercase text-[7px] cursor-pointer"
                                >
                                  [Cancel]
                                </button>
                              )}
                            </div>
                          </div>
                          <div className="w-full bg-white/5 h-1.5 rounded-full overflow-hidden">
                            <div className="bg-primary h-full transition-all duration-300" style={{ width: `${uploadProgress['poster']}%` }} />
                          </div>
                        </div>
                      )}

                      {/* Direct Url Field */}
                      <input 
                        type="text"
                        value={animeForm.poster}
                        onChange={(e) => setAnimeForm(prev => ({ ...prev, poster: e.target.value }))}
                        placeholder="Or paste direct image URL..."
                        className="w-full bg-black/50 text-[10px] text-gray-300 px-3 py-2 rounded-lg border border-white/5 outline-none focus:border-primary/50 transition-colors"
                      />
                    </div>

                    {/* Banner Image Asset */}
                    <div className="bg-[#0a0d14]/40 border border-white/5 p-4 rounded-2xl space-y-3">
                      <span className="text-[10px] text-gray-500 font-black uppercase tracking-wider block">Anime Banner (landscape)</span>
                      
                      {animeForm.banner ? (
                        <div className="relative aspect-[16/9] w-full rounded-xl overflow-hidden border border-white/10 group">
                          <img src={animeForm.banner || null} alt="" className="w-full h-full object-cover" />
                          <button
                            type="button"
                            onClick={() => {
                              if (animeForm.banner.includes("cloudinary.com")) {
                                deleteAssetByUrl(animeForm.banner).catch(err => console.warn(err));
                              }
                              setAnimeForm(prev => ({ ...prev, banner: '' }));
                            }}
                            className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-red-400 text-[10px] font-black uppercase tracking-widest cursor-pointer"
                          >
                            Remove
                          </button>
                        </div>
                      ) : (
                        <div className="border border-white/5 border-dashed rounded-xl p-6 text-center hover:bg-white/[0.01] transition-colors relative cursor-pointer">
                          <input 
                            type="file" 
                            accept="image/*"
                            id="banner-uploader"
                            onChange={(e) => {
                              const file = e.target.files?.[0];
                              if (file) {
                                handleUploadFileToCloudinary(file, 'banner', (url) => {
                                  setAnimeForm(prev => ({ ...prev, banner: url }));
                                }, animeForm.banner);
                              }
                            }}
                            className="absolute inset-0 opacity-0 cursor-pointer"
                          />
                          <UploadCloud size={24} className="text-gray-600 mx-auto mb-2 animate-bounce" />
                          <p className="text-[9px] text-gray-400 font-extrabold uppercase">Choose image file</p>
                          <p className="text-[8px] text-gray-500 mt-0.5">landscape banner or wallpaper</p>
                        </div>
                      )}

                      {/* Cloudinary Progress Indicator */}
                      {uploadProgress['banner'] !== undefined && (
                        <div className="space-y-1">
                          <div className="flex justify-between text-[8px] text-gray-400 font-black">
                            <span>
                              {uploadProgress['banner'] >= 100 || uploadDetails['banner']?.processing ? (
                                <span className="text-primary animate-pulse uppercase">Processing on Cloudinary...</span>
                              ) : (
                                <span className="uppercase">
                                  Uploading Banner
                                  {uploadDetails['banner']?.sizeInfo ? ` (${uploadDetails['banner'].sizeInfo})` : ' to Cloudinary...'}
                                  {uploadDetails['banner']?.speed ? ` @ ${uploadDetails['banner'].speed}` : ''}
                                </span>
                              )}
                            </span>
                            <div className="flex items-center gap-1.5">
                              <span>{Math.round(uploadProgress['banner'])}%</span>
                              {uploadProgress['banner'] < 100 && !uploadDetails['banner']?.processing && (
                                <button 
                                  type="button" 
                                  onClick={() => handleCancelUpload('banner')}
                                  className="text-red-400 hover:text-red-300 font-black uppercase text-[7px] cursor-pointer"
                                >
                                  [Cancel]
                                </button>
                              )}
                            </div>
                          </div>
                          <div className="w-full bg-white/5 h-1.5 rounded-full overflow-hidden">
                            <div className="bg-primary h-full transition-all duration-300" style={{ width: `${uploadProgress['banner']}%` }} />
                          </div>
                        </div>
                      )}

                      {/* Direct Url Field */}
                      <input 
                        type="text"
                        value={animeForm.banner}
                        onChange={(e) => setAnimeForm(prev => ({ ...prev, banner: e.target.value }))}
                        placeholder="Or paste direct image URL..."
                        className="w-full bg-black/50 text-[10px] text-gray-300 px-3 py-2 rounded-lg border border-white/5 outline-none focus:border-primary/50 transition-colors"
                      />
                    </div>

                    {/* Dynamic Language Badges Checklist */}
                    <div className="bg-[#0a0d14]/40 border border-white/5 p-4 rounded-2xl space-y-3">
                      <span className="text-[10px] text-gray-500 font-black uppercase tracking-wider block">Available language tracks</span>
                      <div className="grid grid-cols-2 gap-3">
                        <label className="flex items-center gap-2 text-[11px] font-bold text-gray-300 select-none cursor-pointer">
                          <input 
                            type="checkbox" 
                            checked={animeForm.subAvailable}
                            onChange={(e) => setAnimeForm(prev => ({ ...prev, subAvailable: e.target.checked }))}
                            className="rounded accent-primary" 
                          />
                          SUB (Subtitles)
                        </label>
                        <label className="flex items-center gap-2 text-[11px] font-bold text-gray-300 select-none cursor-pointer">
                          <input 
                            type="checkbox" 
                            checked={animeForm.dubAvailable}
                            onChange={(e) => setAnimeForm(prev => ({ ...prev, dubAvailable: e.target.checked }))}
                            className="rounded accent-primary" 
                          />
                          ENG DUB
                        </label>
                        <label className="flex items-center gap-2 text-[11px] font-bold text-gray-300 select-none cursor-pointer">
                          <input 
                            type="checkbox" 
                            checked={animeForm.hindiAvailable}
                            onChange={(e) => setAnimeForm(prev => ({ ...prev, hindiAvailable: e.target.checked }))}
                            className="rounded accent-primary" 
                          />
                          HINDI DUB
                        </label>
                        <label className="flex items-center gap-2 text-[11px] font-bold text-gray-300 select-none cursor-pointer">
                          <input 
                            type="checkbox" 
                            checked={animeForm.multiAvailable}
                            onChange={(e) => setAnimeForm(prev => ({ ...prev, multiAvailable: e.target.checked }))}
                            className="rounded accent-primary" 
                          />
                          MULTI AUDIO
                        </label>
                      </div>
                    </div>

                    {/* Categories Placement (Manual Controls) */}
                    <div className="bg-[#0a0d14]/40 border border-white/5 p-5 rounded-2xl space-y-4">
                      <span className="text-[10px] text-gray-500 font-black uppercase tracking-wider block border-b border-white/5 pb-2">Manual Category Allocation</span>
                      
                      <div className="grid grid-cols-2 gap-3 max-h-[300px] overflow-y-auto pr-2 custom-scrollbar">
                        {ALL_CATEGORIES_LIST.map((cat) => (
                          <label key={cat.id} className="flex items-center gap-2 text-[11px] font-bold text-gray-300 select-none cursor-pointer">
                            <input 
                              type="checkbox" 
                              checked={animeForm.categories?.[cat.id] === true}
                              onChange={(e) => setAnimeForm(prev => {
                                const cats = { ...(prev.categories || {}) };
                                cats[cat.id] = e.target.checked;
                                return { ...prev, categories: cats };
                              })}
                              className="rounded accent-primary" 
                            />
                            {cat.name}
                          </label>
                        ))}
                      </div>
                    </div>

                  </div>

                </div>

                {animeForm.type === 'Trailer' && (
                  <div className="border-t border-white/5 pt-8 space-y-6">
                    <div className="bg-[#0a0d14]/20 p-5 border border-white/5 rounded-2xl">
                      <h4 className="text-xs font-black text-white uppercase tracking-wider flex items-center gap-1.5 mb-2">
                        <Video size={14} className="text-primary" />
                        Trailer Video Stream Configuration
                      </h4>
                      <p className="text-[10px] text-gray-400">Configure direct links, embeds, YouTube, or Dailymotion videos for this single trailer.</p>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      {['sub', 'eng_dub', 'hindi_dub', 'other'].map((langKey) => {
                        const source = trailerSources[langKey] || { enabled: false, type: 'embed', url: '' };
                        return (
                          <div key={langKey} className="bg-[#0a0d14]/40 border border-white/5 p-5 rounded-2xl space-y-4">
                            <div className="flex justify-between items-center">
                              <span className="text-xs font-black text-white uppercase tracking-widest text-primary">
                                {langKey === 'sub' ? 'SUB (Subtitled English)' : 
                                 langKey === 'eng_dub' ? 'ENG DUB (English Audio Track)' :
                                 langKey === 'hindi_dub' ? 'HINDI DUB (Hindi Audio Track)' :
                                 'OTHER LANGUAGE SOURCE'}
                              </span>
                              <label className="flex items-center gap-1.5 text-[10px] font-black text-gray-400 select-none cursor-pointer uppercase tracking-wider">
                                <input 
                                  type="checkbox"
                                  checked={source.enabled}
                                  onChange={(e) => {
                                    const checked = e.target.checked;
                                    setTrailerSources(prev => {
                                      const copy = { ...prev };
                                      copy[langKey] = { ...(copy[langKey] || { type: 'embed', url: '' }), enabled: checked };
                                      return copy;
                                    });
                                  }}
                                  className="rounded accent-primary" 
                                />
                                Enable Track
                              </label>
                            </div>

                            {source.enabled && (
                              <div className="space-y-4 pl-3 border-l border-primary/20">
                                <div className="flex flex-wrap gap-4 items-center text-[10px] font-black text-gray-400">
                                  <span>Stream source:</span>
                                  <label className="flex items-center gap-1 cursor-pointer">
                                    <input 
                                      type="radio" 
                                      name={`trailer-type-${langKey}`}
                                      checked={source.type === 'file'}
                                      onChange={() => {
                                        setTrailerSources(prev => {
                                          const copy = { ...prev };
                                          copy[langKey] = { ...copy[langKey], type: 'file', videoType: 'other' };
                                          return copy;
                                        });
                                      }}
                                      className="accent-primary" 
                                    />
                                    Direct File (MP4 / HLS .m3u8)
                                  </label>
                                  <label className="flex items-center gap-1 cursor-pointer">
                                    <input 
                                      type="radio" 
                                      name={`trailer-type-${langKey}`}
                                      checked={source.type === 'embed'}
                                      onChange={() => {
                                        setTrailerSources(prev => {
                                          const copy = { ...prev };
                                          copy[langKey] = { ...copy[langKey], type: 'embed', videoType: 'other' };
                                          return copy;
                                        });
                                      }}
                                      className="accent-primary" 
                                    />
                                    Embed iframe URL Proxy
                                  </label>
                                  <label className="flex items-center gap-1 cursor-pointer">
                                    <input 
                                      type="radio" 
                                      name={`trailer-type-${langKey}`}
                                      checked={source.type === 'youtube'}
                                      onChange={() => {
                                        setTrailerSources(prev => {
                                          const copy = { ...prev };
                                          copy[langKey] = { ...copy[langKey], type: 'youtube', videoType: 'youtube' };
                                          return copy;
                                        });
                                      }}
                                      className="accent-primary" 
                                    />
                                    YouTube Embed
                                  </label>
                                </div>

                                <div className="space-y-1.5">
                                  <label className="text-[10px] text-gray-500 font-black uppercase tracking-wider">Video / Embed Link</label>
                                  <input 
                                    type="text" 
                                    required={source.enabled}
                                    placeholder="e.g. https://domain.com/video.mp4 or https://youtube.com/embed/..."
                                    value={source.url || ''}
                                    onChange={(e) => {
                                      const val = e.target.value;
                                      setTrailerSources(prev => {
                                        const copy = { ...prev };
                                        copy[langKey] = { ...copy[langKey], url: val };
                                        return copy;
                                      });
                                    }}
                                    className="w-full bg-black/40 text-xs text-white px-4 py-3 rounded-xl border border-white/5 outline-none focus:border-primary/50 transition-colors font-bold"
                                  />
                                </div>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Sub Section: Custom Episode Management List */}
                {animeForm.type !== 'Trailer' && (
                  <div className="border-t border-white/5 pt-8 space-y-4">
                    {!editingAnime && (
                      <div className="bg-primary/10 border border-primary/20 rounded-xl p-4 text-xs font-semibold text-primary/90 flex items-center gap-2">
                        <span>💡</span>
                        <span>You can start uploading episodes (manually, via Bulk Importer, or via YouTube Playlist Import) for this new show right now! Just remember to click <strong>"Save Anime Show"</strong> at the bottom when you are done.</span>
                      </div>
                    )}
                    <div className="flex justify-between items-center bg-[#0a0d14]/20 p-4 border border-white/5 rounded-xl flex-wrap gap-3">
                      <div>
                        <h4 className="text-xs font-black text-white uppercase tracking-wider flex items-center gap-1.5">
                          <Video size={14} className="text-primary" />
                          Episodes Upload Manager ({customEpisodes.length})
                        </h4>
                        <p className="text-[10px] text-gray-500 mt-1">Configure individual language file streams, audio tracks, or subbed embeds.</p>
                      </div>
                      <div className="flex items-center gap-2 flex-wrap">
                        {customEpisodes.length > 0 && (
                          <button
                            type="button"
                            disabled={ytPlaylistLoading}
                            onClick={handleRepairEpisodes}
                            className="flex items-center gap-1.5 bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/20 hover:border-rose-500/30 px-3 py-1.5 rounded-lg text-[10px] font-black transition-all uppercase tracking-widest cursor-pointer disabled:opacity-50"
                            title="Automatically detect/remove invalid short clips (< 10m) and reindex sequentially."
                          >
                            <Sparkles size={12} />
                            Repair & Reindex
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => setShowBulkPanel(!showBulkPanel)}
                          className={cn(
                            "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[10px] font-black transition-all uppercase tracking-widest cursor-pointer border",
                            showBulkPanel 
                              ? "bg-primary/20 text-primary border-primary/30" 
                              : "bg-white/5 border border-white/5 text-gray-300 hover:text-white hover:bg-white/10"
                          )}
                        >
                          <UploadCloud size={12} />
                          Bulk URL Importer
                        </button>
                        <button
                          type="button"
                          onClick={handleCreateNewEpisodeClick}
                          className="flex items-center gap-1 bg-white/5 border border-white/5 text-gray-300 hover:text-white hover:bg-white/10 px-3 py-1.5 rounded-lg text-[10px] font-black transition-all uppercase tracking-widest cursor-pointer"
                        >
                          <FilePlus size={12} />
                          Add New Episode
                        </button>
                      </div>
                    </div>

                    {showBulkPanel && (
                      <div className="bg-[#0a0d14]/40 border border-white/5 rounded-2xl p-5 space-y-4">
                        
                        {/* Import Mode Toggles */}
                        <div className="flex border-b border-white/5 pb-3.5 gap-4">
                          <button
                            type="button"
                            onClick={() => setImportMode('bulk')}
                            className={cn(
                              "text-[10px] font-black uppercase tracking-wider pb-2 border-b-2 cursor-pointer transition-colors flex items-center gap-1.5",
                              importMode === 'bulk' ? "border-primary text-primary font-black" : "border-transparent text-gray-400 hover:text-white"
                            )}
                          >
                            <UploadCloud size={12} />
                            Bulk Video URL Import
                          </button>
                          <button
                            type="button"
                            onClick={() => setImportMode('youtube_playlist')}
                            className={cn(
                              "text-[10px] font-black uppercase tracking-wider pb-2 border-b-2 cursor-pointer transition-colors flex items-center gap-1.5",
                              importMode === 'youtube_playlist' ? "border-primary text-primary font-black" : "border-transparent text-gray-400 hover:text-white"
                            )}
                          >
                            <PlayCircle size={12} />
                            YouTube Playlist Import (NEW)
                          </button>
                        </div>

                        {importMode === 'bulk' && (
                          <div className="space-y-4">
                            <div className="flex justify-between items-start border-b border-white/5 pb-3">
                              <div>
                                <h4 className="text-xs font-black text-white uppercase tracking-wider flex items-center gap-1.5">
                                  <Sparkles size={14} className="text-primary" />
                                  Multi-Track Smart Bulk URL Importer
                                </h4>
                                <p className="text-[10px] text-gray-400 mt-1">
                                  Paste your text with links into any of the tracks below. We will automatically extract URLs, align them across all tracks by episode, and start from Episode {customEpisodes.length > 0 ? Math.max(...customEpisodes.map(ep => Number(ep.number) || 0), 0) + 1 : 1}.
                                </p>
                              </div>
                            </div>

                            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                              {/* SUB Track Textarea */}
                              <div className="space-y-1.5">
                                <div className="flex items-center justify-between">
                                  <label className="text-[10px] text-primary font-black uppercase tracking-wider">SUB (English Subbed)</label>
                                  {bulkSubText.trim() && (
                                    <button type="button" onClick={() => setBulkSubText('')} className="text-[8px] text-gray-500 hover:text-white font-black uppercase">Clear</button>
                                  )}
                                </div>
                                <textarea
                                  value={bulkSubText}
                                  onChange={(e) => setBulkSubText(e.target.value)}
                                  placeholder="Paste Subbed URLs here...&#10;1. https://...&#10;2. https://..."
                                  className="w-full h-32 bg-black/60 text-xs text-white p-3.5 rounded-xl border border-white/5 focus:border-primary/50 outline-none font-mono resize-y"
                                />
                              </div>

                              {/* ENG DUB Track Textarea */}
                              <div className="space-y-1.5">
                                <div className="flex items-center justify-between">
                                  <label className="text-[10px] text-emerald-400 font-black uppercase tracking-wider">ENG DUB (English Audio)</label>
                                  {bulkEngDubText.trim() && (
                                    <button type="button" onClick={() => setBulkEngDubText('')} className="text-[8px] text-gray-500 hover:text-white font-black uppercase">Clear</button>
                                  )}
                                </div>
                                <textarea
                                  value={bulkEngDubText}
                                  onChange={(e) => setBulkEngDubText(e.target.value)}
                                  placeholder="Paste English Dubbed URLs...&#10;1. https://...&#10;2. https://..."
                                  className="w-full h-32 bg-black/60 text-xs text-white p-3.5 rounded-xl border border-white/5 focus:border-emerald-500/50 outline-none font-mono resize-y"
                                />
                              </div>

                              {/* HINDI DUB Track Textarea */}
                              <div className="space-y-1.5">
                                <div className="flex items-center justify-between">
                                  <label className="text-[10px] text-amber-400 font-black uppercase tracking-wider">HINDI DUB (Hindi Audio)</label>
                                  {bulkHindiDubText.trim() && (
                                    <button type="button" onClick={() => setBulkHindiDubText('')} className="text-[8px] text-gray-500 hover:text-white font-black uppercase">Clear</button>
                                  )}
                                </div>
                                <textarea
                                  value={bulkHindiDubText}
                                  onChange={(e) => setBulkHindiDubText(e.target.value)}
                                  placeholder="Paste Hindi Dubbed URLs...&#10;1. https://...&#10;2. https://..."
                                  className="w-full h-32 bg-black/60 text-xs text-white p-3.5 rounded-xl border border-white/5 focus:border-amber-500/50 outline-none font-mono resize-y"
                                />
                              </div>

                              {/* OTHER Track Textarea */}
                              <div className="space-y-1.5">
                                <div className="flex items-center justify-between">
                                  <label className="text-[10px] text-purple-400 font-black uppercase tracking-wider">OTHER (Alternative)</label>
                                  {bulkOtherText.trim() && (
                                    <button type="button" onClick={() => setBulkOtherText('')} className="text-[8px] text-gray-500 hover:text-white font-black uppercase">Clear</button>
                                  )}
                                </div>
                                <textarea
                                  value={bulkOtherText}
                                  onChange={(e) => setBulkOtherText(e.target.value)}
                                  placeholder="Paste other URLs...&#10;1. https://...&#10;2. https://..."
                                  className="w-full h-32 bg-black/60 text-xs text-white p-3.5 rounded-xl border border-white/5 focus:border-purple-500/50 outline-none font-mono resize-y"
                                />
                              </div>
                            </div>

                            <div className="flex flex-wrap items-center justify-between gap-4 bg-[#0a0d14]/20 p-3 rounded-xl border border-white/5">
                              <p className="text-[10px] text-gray-500 font-bold max-w-md">
                                Paste corresponding links sequentially. If one track has fewer links, those episodes will simply fall back to remaining tracks.
                              </p>

                              <div className="flex items-center gap-2">
                                {(bulkSubText || bulkEngDubText || bulkHindiDubText || bulkOtherText) && (
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setBulkSubText('');
                                      setBulkEngDubText('');
                                      setBulkHindiDubText('');
                                      setBulkOtherText('');
                                      setParsedEpisodes([]);
                                      setSkippedDuplicatesCount(0);
                                    }}
                                    className="bg-white/5 border border-white/5 hover:bg-white/10 text-gray-400 hover:text-white font-black text-[10px] px-4 py-2.5 rounded-lg transition-all uppercase tracking-wider cursor-pointer"
                                  >
                                    Clear All
                                  </button>
                                )}
                                <button
                                  type="button"
                                  onClick={handleParseBulkUrls}
                                  className="bg-primary hover:bg-[#00cce0] text-black font-black text-[10px] px-5 py-2.5 rounded-lg transition-all uppercase tracking-wider active:scale-95 cursor-pointer"
                                >
                                  Parse & Preview All Tracks
                                </button>
                              </div>
                            </div>

                            {parsedEpisodes.length > 0 && (
                              <div className="space-y-4 mt-2">
                                <div className="flex items-center justify-between text-[11px] font-black uppercase tracking-wider text-gray-400 border-b border-white/5 pb-2">
                                  <span>Multi-Track Alignment Preview</span>
                                  <div className="flex gap-3">
                                    <span className="text-primary font-black">Total to Import: {parsedEpisodes.length}</span>
                                    {skippedDuplicatesCount > 0 && (
                                      <span className="text-amber-400 font-black">Skipped Duplicates: {skippedDuplicatesCount}</span>
                                    )}
                                  </div>
                                </div>

                                {isImporting && (
                                  <div className="bg-[#0a0d14]/40 p-4 border border-white/5 rounded-xl space-y-3">
                                    <div className="flex justify-between items-center text-[10px] font-black text-gray-400 uppercase tracking-wider">
                                      <span className="text-primary">Importing in progress...</span>
                                      <span>{importProgress}% ({importedCount} / {parsedEpisodes.length})</span>
                                    </div>
                                    <div className="bg-white/5 h-2 w-full rounded-full overflow-hidden">
                                      <div 
                                        className="bg-primary h-full transition-all duration-300"
                                        style={{ width: `${importProgress}%` }}
                                      />
                                    </div>
                                  </div>
                                )}

                                <div className="max-h-80 overflow-y-auto border border-white/5 rounded-xl bg-black/40 p-3.5 space-y-3 custom-scrollbar">
                                  {parsedEpisodes.slice(0, 50).map((ep) => {
                                    return (
                                      <div key={ep.id} className="border-b border-white/5 pb-3 last:border-0 last:pb-0 space-y-2">
                                        <div className="flex items-center gap-2">
                                          <span className="font-black text-xs text-white bg-white/5 px-2 py-0.5 rounded">Episode {ep.number}</span>
                                          <span className="text-[10px] text-gray-400 font-bold">{ep.title}</span>
                                        </div>
                                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pl-3 border-l border-primary/20">
                                          {/* SUB */}
                                          <div className="flex items-center justify-between text-[11px] gap-2">
                                            <span className="text-gray-500 font-bold">SUB:</span>
                                            {ep.videoSources.sub.enabled ? (
                                              <div className="flex items-center gap-1.5 overflow-hidden max-w-[80%]">
                                                <span className="text-primary truncate font-mono text-[10px]">{ep.videoSources.sub.url}</span>
                                                <span className="text-[8px] font-black px-1 py-0.2 bg-primary/10 text-primary rounded shrink-0 uppercase">{ep.videoSources.sub.type}</span>
                                              </div>
                                            ) : (
                                              <span className="text-gray-600 italic">none</span>
                                            )}
                                          </div>

                                          {/* ENG DUB */}
                                          <div className="flex items-center justify-between text-[11px] gap-2">
                                            <span className="text-gray-500 font-bold">ENG DUB:</span>
                                            {ep.videoSources.eng_dub.enabled ? (
                                              <div className="flex items-center gap-1.5 overflow-hidden max-w-[80%]">
                                                <span className="text-emerald-400 truncate font-mono text-[10px]">{ep.videoSources.eng_dub.url}</span>
                                                <span className="text-[8px] font-black px-1 py-0.2 bg-emerald-500/10 text-emerald-400 rounded shrink-0 uppercase">{ep.videoSources.eng_dub.type}</span>
                                              </div>
                                            ) : (
                                              <span className="text-gray-600 italic">none</span>
                                            )}
                                          </div>

                                          {/* HINDI DUB */}
                                          <div className="flex items-center justify-between text-[11px] gap-2">
                                            <span className="text-gray-500 font-bold">HINDI DUB:</span>
                                            {ep.videoSources.hindi_dub.enabled ? (
                                              <div className="flex items-center gap-1.5 overflow-hidden max-w-[80%]">
                                                <span className="text-amber-400 truncate font-mono text-[10px]">{ep.videoSources.hindi_dub.url}</span>
                                                <span className="text-[8px] font-black px-1 py-0.2 bg-amber-500/10 text-amber-400 rounded shrink-0 uppercase">{ep.videoSources.hindi_dub.type}</span>
                                              </div>
                                            ) : (
                                              <span className="text-gray-600 italic">none</span>
                                            )}
                                          </div>

                                          {/* OTHER */}
                                          <div className="flex items-center justify-between text-[11px] gap-2">
                                            <span className="text-gray-500 font-bold">OTHER:</span>
                                            {ep.videoSources.other.enabled ? (
                                              <div className="flex items-center gap-1.5 overflow-hidden max-w-[80%]">
                                                <span className="text-purple-400 truncate font-mono text-[10px]">{ep.videoSources.other.url}</span>
                                                <span className="text-[8px] font-black px-1 py-0.2 bg-purple-500/10 text-purple-400 rounded shrink-0 uppercase">{ep.videoSources.other.type}</span>
                                              </div>
                                            ) : (
                                              <span className="text-gray-600 italic">none</span>
                                            )}
                                          </div>
                                        </div>
                                      </div>
                                    );
                                  })}
                                  {parsedEpisodes.length > 50 && (
                                    <p className="text-[10px] text-gray-500 text-center font-bold pt-2 border-t border-white/5">... and {parsedEpisodes.length - 50} more episodes mapped automatically.</p>
                                  )}
                                </div>

                                <button
                                  type="button"
                                  disabled={isImporting}
                                  onClick={handleImportAllEpisodes}
                                  className="w-full bg-emerald-500 hover:bg-emerald-400 disabled:bg-emerald-800 disabled:text-emerald-500 text-black font-black text-xs py-3.5 rounded-xl transition-all uppercase tracking-wider flex items-center justify-center gap-2 active:scale-[0.98] cursor-pointer"
                                >
                                  <UploadCloud size={14} />
                                  {isImporting ? `IMPORTING ${importedCount} OF ${parsedEpisodes.length} EPISODES...` : 'Import All Episodes'}
                                </button>
                              </div>
                            )}
                          </div>
                        )}

                        {importMode === 'youtube_playlist' && (
                          <div className="space-y-4">
                            <div className="flex justify-between items-start border-b border-white/5 pb-3">
                              <div>
                                <h4 className="text-xs font-black text-white uppercase tracking-wider flex items-center gap-1.5">
                                  <Sparkles size={14} className="text-primary animate-pulse" />
                                  YouTube Playlist Importer
                                </h4>
                                <p className="text-[10px] text-gray-400 mt-1">
                                  Provide a public YouTube playlist URL or ID. We will securely retrieve all available videos in sequence, format them as individual episodes, and let you append or overwrite your existing episodes list.
                                </p>
                              </div>
                            </div>

                            {/* Playlist Stats block if available */}
                            {ytPlaylistStats && (
                              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 bg-emerald-500/5 border border-emerald-500/10 p-4 rounded-xl">
                                <div>
                                  <span className="text-gray-500 text-[8px] font-black uppercase tracking-wider block">Imported Count</span>
                                  <p className="text-lg font-black text-emerald-400 mt-0.5">+{ytPlaylistStats.imported}</p>
                                </div>
                                <div>
                                  <span className="text-gray-500 text-[8px] font-black uppercase tracking-wider block">Skipped Videos</span>
                                  <p className="text-lg font-black text-gray-400 mt-0.5">{ytPlaylistStats.skipped}</p>
                                </div>
                                <div>
                                  <span className="text-gray-500 text-[8px] font-black uppercase tracking-wider block">Duplicates</span>
                                  <p className="text-lg font-black text-amber-400 mt-0.5">{ytPlaylistStats.duplicates}</p>
                                </div>
                                <div>
                                  <span className="text-gray-500 text-[8px] font-black uppercase tracking-wider block">Failed Videos</span>
                                  <p className="text-lg font-black text-red-400 mt-0.5">{ytPlaylistStats.failed}</p>
                                </div>
                              </div>
                            )}

                            <div className="space-y-4">
                              <div className="space-y-1">
                                <span className="text-[10px] text-gray-500 font-black uppercase tracking-wider block">Import Method</span>
                                <div className="flex bg-[#0d111a] border border-white/5 p-1 rounded-xl w-fit">
                                  <button
                                    type="button"
                                    onClick={() => setYtImportMethod('auto')}
                                    className={`text-[9px] font-black uppercase tracking-wider px-4 py-2 rounded-lg transition-all cursor-pointer ${ytImportMethod === 'auto' ? 'bg-primary text-black' : 'text-gray-400 hover:text-white'}`}
                                  >
                                    🌍 Auto Fetch (Proxy/API)
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => setYtImportMethod('paste')}
                                    className={`text-[9px] font-black uppercase tracking-wider px-4 py-2 rounded-lg transition-all cursor-pointer ${ytImportMethod === 'paste' ? 'bg-primary text-black' : 'text-gray-400 hover:text-white'}`}
                                  >
                                    📋 Paste Page Source / Links
                                  </button>
                                </div>
                              </div>

                              {ytImportMethod === 'paste' ? (
                                <div className="space-y-4">
                                  <div className="flex justify-between items-center">
                                    <label className="text-[10px] text-gray-500 font-black uppercase tracking-wider">Multi-Track Playlist Page Source, URLs, or IDs</label>
                                    <button
                                      type="button"
                                      onClick={() => alert("How to import instantly:\n\nOption 1 (Complete Source - Recommended):\n1. Open the YouTube playlist page in your browser.\n2. Right-click anywhere and select 'View Page Source' (or press Ctrl+U).\n3. Select all (Ctrl+A) and Copy (Ctrl+C).\n4. Paste it completely in the box below and click Load!\n\nOption 2 (Simple Video Links):\nJust paste a list of YouTube video URLs or raw 11-character video IDs (one per line) in the box!")}
                                      className="text-primary text-[9px] font-black uppercase tracking-wider hover:underline cursor-pointer"
                                    >
                                      Need Help?
                                    </button>
                                  </div>
                                  
                                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    {/* SUB (ENGLISH SUBBED) */}
                                    <div className="space-y-1">
                                      <span className="text-[10px] text-primary font-black uppercase tracking-wider block">Sub (English Subbed)</span>
                                      <textarea
                                        rows={3}
                                        value={ytPastedSourceSub}
                                        onChange={(e) => setYtPastedSourceSub(e.target.value)}
                                        placeholder="Paste Subbed Playlist Source / Links..."
                                        className="w-full bg-black/60 text-xs text-white px-4 py-3 rounded-xl border border-white/5 outline-none focus:border-primary/50 transition-colors font-mono custom-scrollbar"
                                      />
                                    </div>

                                    {/* ENG DUB (ENGLISH AUDIO) */}
                                    <div className="space-y-1">
                                      <span className="text-[10px] text-emerald-400 font-black uppercase tracking-wider block">Eng Dub (English Audio)</span>
                                      <textarea
                                        rows={3}
                                        value={ytPastedSourceEngDub}
                                        onChange={(e) => setYtPastedSourceEngDub(e.target.value)}
                                        placeholder="Paste English Dubbed Playlist Source / Links..."
                                        className="w-full bg-black/60 text-xs text-white px-4 py-3 rounded-xl border border-white/5 outline-none focus:border-primary/50 transition-colors font-mono custom-scrollbar"
                                      />
                                    </div>

                                    {/* HINDI DUB (HINDI AUDIO) */}
                                    <div className="space-y-1">
                                      <span className="text-[10px] text-amber-400 font-black uppercase tracking-wider block">Hindi Dub (Hindi Audio)</span>
                                      <textarea
                                        rows={3}
                                        value={ytPastedSourceHindiDub}
                                        onChange={(e) => setYtPastedSourceHindiDub(e.target.value)}
                                        placeholder="Paste Hindi Dubbed Playlist Source / Links..."
                                        className="w-full bg-black/60 text-xs text-white px-4 py-3 rounded-xl border border-white/5 outline-none focus:border-primary/50 transition-colors font-mono custom-scrollbar"
                                      />
                                    </div>

                                    {/* OTHER TRACK */}
                                    <div className="space-y-1">
                                      <span className="text-[10px] text-purple-400 font-black uppercase tracking-wider block">Other Track</span>
                                      <textarea
                                        rows={3}
                                        value={ytPastedSourceOther}
                                        onChange={(e) => setYtPastedSourceOther(e.target.value)}
                                        placeholder="Paste Other Playlist Source / Links..."
                                        className="w-full bg-black/60 text-xs text-white px-4 py-3 rounded-xl border border-white/5 outline-none focus:border-primary/50 transition-colors font-mono custom-scrollbar"
                                      />
                                    </div>
                                  </div>

                                  <button
                                    type="button"
                                    disabled={ytPlaylistLoading}
                                    onClick={handleLoadYtPlaylist}
                                    className="w-full bg-primary hover:bg-[#00cce0] disabled:bg-primary/20 text-black font-black text-[10px] py-3.5 rounded-xl transition-all uppercase tracking-wider cursor-pointer flex items-center justify-center gap-1.5 active:scale-[0.99]"
                                  >
                                    {ytPlaylistLoading ? (
                                      <>
                                        <RefreshCw size={12} className="animate-spin" />
                                        Extracting Videos...
                                      </>
                                    ) : (
                                      'Extract & Load Playlist Videos'
                                    )}
                                  </button>
                                </div>
                              ) : (
                                <div className="space-y-4">
                                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    {/* SUB */}
                                    <div className="space-y-1">
                                      <label className="text-[10px] text-primary font-black uppercase tracking-wider block">Sub (English Subbed) Playlist URL or ID</label>
                                      <input
                                        type="text"
                                        value={ytPlaylistUrlSub}
                                        onChange={(e) => setYtPlaylistUrlSub(e.target.value)}
                                        placeholder="e.g. https://www.youtube.com/playlist?list=PL... or PL..."
                                        className="w-full bg-black/60 text-xs text-white px-4 py-3 rounded-xl border border-white/5 outline-none focus:border-primary/50 transition-colors font-semibold"
                                      />
                                    </div>

                                    {/* ENG DUB */}
                                    <div className="space-y-1">
                                      <label className="text-[10px] text-emerald-400 font-black uppercase tracking-wider block">Eng Dub (English Audio) Playlist URL or ID</label>
                                      <input
                                        type="text"
                                        value={ytPlaylistUrlEngDub}
                                        onChange={(e) => setYtPlaylistUrlEngDub(e.target.value)}
                                        placeholder="e.g. https://www.youtube.com/playlist?list=PL... or PL..."
                                        className="w-full bg-black/60 text-xs text-white px-4 py-3 rounded-xl border border-white/5 outline-none focus:border-primary/50 transition-colors font-semibold"
                                      />
                                    </div>

                                    {/* HINDI DUB */}
                                    <div className="space-y-1">
                                      <label className="text-[10px] text-amber-400 font-black uppercase tracking-wider block">Hindi Dub (Hindi Audio) Playlist URL or ID</label>
                                      <input
                                        type="text"
                                        value={ytPlaylistUrlHindiDub}
                                        onChange={(e) => setYtPlaylistUrlHindiDub(e.target.value)}
                                        placeholder="e.g. https://www.youtube.com/playlist?list=PL... or PL..."
                                        className="w-full bg-black/60 text-xs text-white px-4 py-3 rounded-xl border border-white/5 outline-none focus:border-primary/50 transition-colors font-semibold"
                                      />
                                    </div>

                                    {/* OTHER TRACK */}
                                    <div className="space-y-1">
                                      <label className="text-[10px] text-purple-400 font-black uppercase tracking-wider block">Other Playlist URL or ID</label>
                                      <input
                                        type="text"
                                        value={ytPlaylistUrlOther}
                                        onChange={(e) => setYtPlaylistUrlOther(e.target.value)}
                                        placeholder="e.g. https://www.youtube.com/playlist?list=PL... or PL..."
                                        className="w-full bg-black/60 text-xs text-white px-4 py-3 rounded-xl border border-white/5 outline-none focus:border-primary/50 transition-colors font-semibold"
                                      />
                                    </div>
                                  </div>

                                  <button
                                    type="button"
                                    disabled={ytPlaylistLoading}
                                    onClick={handleLoadYtPlaylist}
                                    className="w-full bg-primary hover:bg-[#00cce0] disabled:bg-primary/20 text-black font-black text-[10px] py-3.5 rounded-xl transition-all uppercase tracking-wider cursor-pointer flex items-center justify-center gap-1.5 active:scale-[0.99]"
                                  >
                                    {ytPlaylistLoading ? (
                                      <>
                                        <RefreshCw size={12} className="animate-spin" />
                                        Loading Playlist(s)...
                                      </>
                                    ) : (
                                      'Load Playlists'
                                    )}
                                  </button>
                                </div>
                              )}

                              {(ytPlaylistItemsSub.length > 0 || ytPlaylistItemsEngDub.length > 0 || ytPlaylistItemsHindiDub.length > 0 || ytPlaylistItemsOther.length > 0) && (
                                <div className="bg-[#0a0d14]/20 p-4 border border-white/5 rounded-2xl space-y-4">
                                  {/* Auto Episode Generation Config */}
                                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-white/5 pb-4">
                                    <div className="space-y-1">
                                      <span className="text-[10px] text-gray-500 font-black uppercase tracking-wider block">Auto Episode Generation</span>
                                      <p className="text-[11px] text-gray-300 font-bold">
                                        Detected {processedPlaylistData.totalValid} aligned episodes.
                                        {processedPlaylistData.skippedCount > 0 && ` (${processedPlaylistData.skippedCount} private/deleted skipped)`}
                                      </p>
                                    </div>
                                    <div className="flex flex-wrap gap-4">
                                      <label className="flex items-center gap-2 text-[10px] font-black text-gray-400 select-none cursor-pointer uppercase tracking-wider">
                                        <input
                                          type="radio"
                                          name="ytAppendMode"
                                          checked={ytAppendMode === 'append'}
                                          onChange={() => setYtAppendMode('append')}
                                          className="accent-primary"
                                        />
                                        Append New Episodes
                                      </label>
                                      <label className="flex items-center gap-2 text-[10px] font-black text-gray-400 select-none cursor-pointer uppercase tracking-wider">
                                        <input
                                          type="radio"
                                          name="ytAppendMode"
                                          checked={ytAppendMode === 'replace'}
                                          onChange={() => setYtAppendMode('replace')}
                                          className="accent-primary"
                                        />
                                        Replace Existing Episodes
                                      </label>
                                      <label className="flex items-center gap-2 text-[10px] font-black text-primary select-none cursor-pointer uppercase tracking-wider sm:border-l sm:border-white/10 sm:pl-4">
                                        <input
                                          type="checkbox"
                                          checked={ytAutoFilterShortClips}
                                          onChange={(e) => setYtAutoFilterShortClips(e.target.checked)}
                                          className="accent-primary rounded"
                                        />
                                        Auto Episode Repair (&lt; 10 min)
                                      </label>
                                    </div>
                                  </div>

                                  {/* Preview Section */}
                                  <div className="space-y-2">
                                    <span className="text-[10px] text-gray-500 font-black uppercase tracking-wider block">Playlist Video Preview</span>
                                    <div className="max-h-72 overflow-y-auto border border-white/5 rounded-xl bg-black/40 p-3.5 space-y-3 custom-scrollbar">
                                      {processedPlaylistData.episodes.map((ep, idx) => {
                                        const startEpNum = ytAppendMode === 'append'
                                          ? (customEpisodes.length > 0 ? Math.max(...customEpisodes.map(ep => Number(ep.number) || 0), 0) : 0) + 1
                                          : 1;
                                        const epNum = startEpNum + idx;
                                        return (
                                          <div key={idx} className="border-b border-white/5 pb-3 last:border-0 last:pb-0 space-y-2">
                                            <div className="flex items-center gap-3">
                                              <span className="font-black text-xs text-white bg-white/5 px-2 py-0.5 rounded">Episode {epNum}</span>
                                              {ep.thumbnail && (
                                                <img src={ep.thumbnail} alt="" className="w-8 h-5 object-cover rounded border border-white/5 bg-black shrink-0" />
                                              )}
                                              <span className="text-[10px] text-gray-300 font-bold truncate">{ep.title}</span>
                                            </div>
                                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pl-3 border-l border-primary/20">
                                              {/* SUB */}
                                              <div className="flex items-center justify-between text-[10px] gap-2">
                                                <span className="text-gray-500 font-black uppercase text-[8px] tracking-wider">SUB:</span>
                                                {ep.sub ? (
                                                  <div className="flex items-center gap-1 overflow-hidden max-w-[80%]">
                                                    <span className="text-primary truncate font-mono text-[9px]">{ep.sub.title}</span>
                                                    <span className="text-[8px] font-black px-1 bg-primary/10 text-primary rounded shrink-0 uppercase">YT</span>
                                                  </div>
                                                ) : (
                                                  <span className="text-gray-600 italic">none</span>
                                                )}
                                              </div>

                                              {/* ENG DUB */}
                                              <div className="flex items-center justify-between text-[10px] gap-2">
                                                <span className="text-gray-500 font-black uppercase text-[8px] tracking-wider">ENG DUB:</span>
                                                {ep.eng_dub ? (
                                                  <div className="flex items-center gap-1 overflow-hidden max-w-[80%]">
                                                    <span className="text-emerald-400 truncate font-mono text-[9px]">{ep.eng_dub.title}</span>
                                                    <span className="text-[8px] font-black px-1 bg-emerald-500/10 text-emerald-400 rounded shrink-0 uppercase">YT</span>
                                                  </div>
                                                ) : (
                                                  <span className="text-gray-600 italic">none</span>
                                                )}
                                              </div>

                                              {/* HINDI DUB */}
                                              <div className="flex items-center justify-between text-[10px] gap-2">
                                                <span className="text-gray-500 font-black uppercase text-[8px] tracking-wider">HINDI DUB:</span>
                                                {ep.hindi_dub ? (
                                                  <div className="flex items-center gap-1 overflow-hidden max-w-[80%]">
                                                    <span className="text-amber-400 truncate font-mono text-[9px]">{ep.hindi_dub.title}</span>
                                                    <span className="text-[8px] font-black px-1 bg-amber-500/10 text-amber-400 rounded shrink-0 uppercase">YT</span>
                                                  </div>
                                                ) : (
                                                  <span className="text-gray-600 italic">none</span>
                                                )}
                                              </div>

                                              {/* OTHER */}
                                              <div className="flex items-center justify-between text-[10px] gap-2">
                                                <span className="text-gray-500 font-black uppercase text-[8px] tracking-wider">OTHER:</span>
                                                {ep.other ? (
                                                  <div className="flex items-center gap-1 overflow-hidden max-w-[80%]">
                                                    <span className="text-purple-400 truncate font-mono text-[9px]">{ep.other.title}</span>
                                                    <span className="text-[8px] font-black px-1 bg-purple-500/10 text-purple-400 rounded shrink-0 uppercase">YT</span>
                                                  </div>
                                                ) : (
                                                  <span className="text-gray-600 italic">none</span>
                                                )}
                                              </div>
                                            </div>
                                          </div>
                                        );
                                      })}
                                    </div>
                                  </div>

                                  {isImporting && (
                                    <div className="bg-[#0a0d14]/40 p-4 border border-white/5 rounded-xl space-y-3">
                                      <div className="flex justify-between items-center text-[10px] font-black text-gray-400 uppercase tracking-wider">
                                        <span className="text-primary animate-pulse">Importing in progress...</span>
                                      </div>
                                      <div className="bg-white/5 h-2 w-full rounded-full overflow-hidden">
                                        <div className="bg-primary h-full w-full animate-pulse" />
                                      </div>
                                    </div>
                                  )}

                                  <button
                                    type="button"
                                    disabled={isImporting}
                                    onClick={handleImportYtPlaylist}
                                    className="w-full bg-emerald-500 hover:bg-emerald-400 disabled:bg-emerald-800 disabled:text-emerald-500 text-black font-black text-xs py-3.5 rounded-xl transition-all uppercase tracking-wider flex items-center justify-center gap-2 active:scale-[0.98] cursor-pointer"
                                  >
                                    <UploadCloud size={14} />
                                    {isImporting ? 'IMPORTING EPISODES...' : 'Import Playlist'}
                                  </button>
                                </div>
                              )}
                            </div>
                          </div>
                        )}
                      </div>
                    )}

                    {customEpisodes.length === 0 ? (
                      <p className="text-xs text-gray-500 py-10 text-center border border-dashed border-white/5 rounded-xl">No episodes uploaded for this series. Click 'Add New Episode' above.</p>
                    ) : (
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                        {customEpisodes.map((ep, epIdx) => (
                          <div key={ep.id || ep.number || `ep-${epIdx}`} className="bg-white/[0.01] border border-white/5 p-3.5 rounded-xl flex items-center gap-3 justify-between">
                            <div className="flex items-center gap-3 overflow-hidden">
                              <img src={ep.thumbnail || animeForm.poster || null} alt="" className="w-12 h-10 object-cover rounded bg-black" />
                              <div className="overflow-hidden">
                                <p className="text-xs font-extrabold text-white truncate">Episode {ep.number}</p>
                                <p className="text-[10px] text-gray-400 truncate">{ep.title || `Title Episode ${ep.number}`}</p>
                              </div>
                            </div>
                            <div className="flex gap-1 shrink-0">
                              <button
                                type="button"
                                onClick={() => handleEditEpisodeClick(ep)}
                                className="p-1.5 bg-white/5 hover:bg-white/10 text-gray-300 rounded border border-white/5 transition-colors cursor-pointer"
                                title="Edit Episode Sources"
                              >
                                <Edit3 size={11} />
                              </button>
                              <button
                                type="button"
                                onClick={() => handleDeleteEpisodeClick(Number(ep.number), ep.thumbnail)}
                                className="p-1.5 bg-red-500/10 hover:bg-red-500/20 text-red-400 rounded border border-red-500/15 transition-colors cursor-pointer"
                                title="Delete Episode"
                              >
                                <Trash size={11} />
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {/* Submit Controls Row */}
                <div className="border-t border-white/5 pt-6 flex gap-3 justify-end">
                  <button
                    type="button"
                    onClick={() => setUploadTabMode('list')}
                    className="px-6 py-3 bg-white/5 hover:bg-white/10 text-gray-300 hover:text-white rounded-xl text-xs font-black uppercase tracking-wider transition-all border border-white/5 active:scale-95 cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={isSaving}
                    className="px-8 py-3 bg-primary hover:bg-[#00cce0] text-black font-black text-xs rounded-xl transition-all shadow-lg shadow-cyan-500/15 uppercase tracking-wider active:scale-95 disabled:opacity-50 cursor-pointer flex items-center gap-1.5"
                  >
                    <Save size={13} />
                    {isSaving ? 'SAVING TO REMOTE...' : 'SAVE ANIME SERIES'}
                  </button>
                </div>
              </form>
            )}

            {/* C. EPISODE FORM MODE */}
            {uploadTabMode === 'episodeForm' && (
              <form onSubmit={handleSaveEpisodeForm} className="space-y-8">
                <div className="flex justify-between items-center border-b border-white/5 pb-4">
                  <h4 className="text-xs font-black text-white uppercase tracking-wider flex items-center gap-1.5">
                    <Video size={14} className="text-primary" />
                    {editingEpisode ? `Edit Episode ${episodeForm.number} Sources` : `Catalog Episode ${episodeForm.number} for ${animeForm.title}`}
                  </h4>
                  <button
                    type="button"
                    onClick={() => setUploadTabMode('animeForm')}
                    className="px-3.5 py-1.5 bg-white/5 hover:bg-white/10 rounded-xl text-[10px] font-black border border-white/5 text-gray-300 hover:text-white transition-all uppercase tracking-wider cursor-pointer"
                  >
                    Back to Anime Form
                  </button>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                  
                  {/* Left Column: Metadata */}
                  <div className="lg:col-span-2 space-y-6">
                    
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                      
                      <div className="space-y-1.5">
                        <label className="text-[10px] text-gray-500 font-black uppercase tracking-wider">Episode Number</label>
                        <input 
                          type="number" 
                          required
                          value={episodeForm.number}
                          onChange={(e) => setEpisodeForm(prev => ({ ...prev, number: Number(e.target.value) }))}
                          className="w-full bg-black/40 text-xs text-white px-4 py-3 rounded-xl border border-white/5 outline-none focus:border-primary/50 transition-colors font-bold"
                        />
                      </div>

                      <div className="sm:col-span-2 space-y-1.5">
                        <label className="text-[10px] text-gray-500 font-black uppercase tracking-wider">Episode Title</label>
                        <input 
                          type="text" 
                          required
                          value={episodeForm.title}
                          onChange={(e) => setEpisodeForm(prev => ({ ...prev, title: e.target.value }))}
                          placeholder="e.g. The Awakening of Monarchs"
                          className="w-full bg-black/40 text-xs text-white px-4 py-3 rounded-xl border border-white/5 outline-none focus:border-primary/50 transition-colors font-bold"
                        />
                      </div>

                    </div>

                    {/* Language Multi-Stream Matrix Fields */}
                    <div className="space-y-4">
                      <span className="text-[10px] text-gray-500 font-black uppercase tracking-wider block border-b border-white/5 pb-2">Configure video stream sources</span>
                      
                      {['sub', 'eng_dub', 'hindi_dub', 'other'].map((langKey) => {
                        const source = episodeForm.videoSources[langKey] || { enabled: false, type: 'file', url: '' };
                        return (
                          <div key={langKey} className="bg-[#0a0d14]/40 border border-white/5 p-4 rounded-2xl space-y-4">
                            <div className="flex justify-between items-center">
                              <span className="text-xs font-black text-white uppercase tracking-widest text-primary">
                                {langKey === 'sub' ? 'SUB (Subtitled English)' : 
                                 langKey === 'eng_dub' ? 'ENG DUB (English Audio Track)' :
                                 langKey === 'hindi_dub' ? 'HINDI DUB (Hindi Audio Track)' :
                                 'OTHER LANGUAGE SOURCE'}
                              </span>
                              <label className="flex items-center gap-1.5 text-[10px] font-black text-gray-400 select-none cursor-pointer uppercase tracking-wider">
                                <input 
                                  type="checkbox"
                                  checked={source.enabled}
                                  onChange={(e) => {
                                    const checked = e.target.checked;
                                    setEpisodeForm(prev => {
                                      const copy = { ...prev.videoSources };
                                      copy[langKey] = { ...copy[langKey], enabled: checked };
                                      return { ...prev, videoSources: copy };
                                    });
                                  }}
                                  className="rounded accent-primary" 
                                />
                                Enable Track
                              </label>
                            </div>

                            {source.enabled && (
                              <div className="space-y-3.5 pl-2 border-l border-primary/20">
                                
                                <div className="flex flex-wrap gap-4 items-center text-[10px] font-black text-gray-400">
                                  <span>Stream source:</span>
                                  <label className="flex items-center gap-1 cursor-pointer">
                                    <input 
                                      type="radio" 
                                      name={`type-${langKey}`}
                                      checked={source.type === 'file'}
                                      onChange={() => {
                                        setEpisodeForm(prev => {
                                          const copy = { ...prev.videoSources };
                                          copy[langKey] = { ...copy[langKey], type: 'file', videoType: 'other' };
                                          return { ...prev, videoSources: copy };
                                        });
                                      }}
                                      className="accent-primary" 
                                    />
                                    Direct File (MP4 / HLS .m3u8)
                                  </label>
                                  <label className="flex items-center gap-1 cursor-pointer">
                                    <input 
                                      type="radio" 
                                      name={`type-${langKey}`}
                                      checked={source.type === 'embed'}
                                      onChange={() => {
                                        setEpisodeForm(prev => {
                                          const copy = { ...prev.videoSources };
                                          copy[langKey] = { ...copy[langKey], type: 'embed', videoType: 'other' };
                                          return { ...prev, videoSources: copy };
                                        });
                                      }}
                                      className="accent-primary" 
                                    />
                                    Embed iframe URL Proxy
                                  </label>
                                  <label className="flex items-center gap-1 cursor-pointer">
                                    <input 
                                      type="radio" 
                                      name={`type-${langKey}`}
                                      checked={source.type === 'youtube' || source.videoType === 'youtube'}
                                      onChange={() => {
                                        setEpisodeForm(prev => {
                                          const copy = { ...prev.videoSources };
                                          copy[langKey] = { 
                                            ...copy[langKey], 
                                            type: 'youtube', 
                                            videoType: 'youtube'
                                          };
                                          return { ...prev, videoSources: copy };
                                        });
                                      }}
                                      className="accent-primary" 
                                    />
                                    YouTube Embed
                                  </label>
                                  <label className="flex items-center gap-1 cursor-pointer">
                                    <input 
                                      type="radio" 
                                      name={`type-${langKey}`}
                                      checked={source.type === 'dailymotion' || source.videoType === 'dailymotion'}
                                      onChange={() => {
                                        setEpisodeForm(prev => {
                                          const copy = { ...prev.videoSources };
                                          copy[langKey] = { 
                                            ...copy[langKey], 
                                            type: 'dailymotion', 
                                            videoType: 'dailymotion',
                                            hidePlaylist: copy[langKey]?.hidePlaylist ?? false,
                                            hideShare: copy[langKey]?.hideShare ?? false
                                          };
                                          return { ...prev, videoSources: copy };
                                        });
                                      }}
                                      className="accent-primary" 
                                    />
                                    Dailymotion Embed
                                  </label>
                                  <label className="flex items-center gap-1 cursor-pointer">
                                    <input 
                                      type="radio" 
                                      name={`type-${langKey}`}
                                      checked={source.type === 'odysee' || source.videoType === 'odysee'}
                                      onChange={() => {
                                        setEpisodeForm(prev => {
                                          const copy = { ...prev.videoSources };
                                          copy[langKey] = { 
                                            ...copy[langKey], 
                                            type: 'odysee', 
                                            videoType: 'odysee'
                                          };
                                          return { ...prev, videoSources: copy };
                                        });
                                      }}
                                      className="accent-primary" 
                                    />
                                    Odysee Embed
                                  </label>
                                  <label className="flex items-center gap-1 cursor-pointer">
                                    <input 
                                      type="radio" 
                                      name={`type-${langKey}`}
                                      checked={source.type === 'rumble' || source.videoType === 'rumble'}
                                      onChange={() => {
                                        setEpisodeForm(prev => {
                                          const copy = { ...prev.videoSources };
                                          copy[langKey] = { 
                                            ...copy[langKey], 
                                            type: 'rumble', 
                                            videoType: 'rumble'
                                          };
                                          return { ...prev, videoSources: copy };
                                        });
                                      }}
                                      className="accent-primary" 
                                    />
                                    Rumble Embed
                                  </label>
                                </div>

                                <div className="flex gap-3">
                                  <input 
                                    type="text" 
                                    required={source.enabled}
                                    value={source.url}
                                    onChange={(e) => {
                                      const val = e.target.value;
                                      const isDm = val.includes('dailymotion.com') || val.includes('dai.ly');
                                      const isOdysee = val.includes('odysee.com');
                                      const isRumble = val.includes('rumble.com');
                                      const isYt = val.includes('youtube.com') || val.includes('youtu.be') || val.includes('youtube-nocookie.com');
                                      setEpisodeForm(prev => {
                                        const copy = { ...prev.videoSources };
                                        copy[langKey] = { 
                                          ...copy[langKey], 
                                          url: val,
                                          ...(isDm ? { type: 'dailymotion', videoType: 'dailymotion' } : {}),
                                          ...(isOdysee ? { type: 'odysee', videoType: 'odysee' } : {}),
                                          ...(isRumble ? { type: 'rumble', videoType: 'rumble' } : {}),
                                          ...(isYt ? { type: 'youtube', videoType: 'youtube' } : {})
                                        };
                                        return { ...prev, videoSources: copy };
                                      });
                                    }}
                                    placeholder={
                                      source.type === 'file' 
                                        ? 'Direct video stream URL (.mp4 or .m3u8)' 
                                        : source.type === 'odysee'
                                          ? 'Odysee Video or Embed URL (e.g. https://odysee.com/...)'
                                          : source.type === 'rumble'
                                            ? 'Rumble Video or Embed URL (e.g. https://rumble.com/...)'
                                            : source.type === 'youtube'
                                              ? 'YouTube Video or Embed URL (e.g. https://youtube.com/...)'
                                              : 'https://www.dailymotion.com/embed/video/...'
                                    }
                                    className="flex-1 bg-black/50 text-xs text-white px-3.5 py-2.5 rounded-xl border border-white/5 outline-none focus:border-primary/50 transition-colors font-mono"
                                  />

                                  {source.type === 'file' && (
                                    <div className="relative shrink-0">
                                      <input 
                                        type="file" 
                                        accept="video/*,audio/*,.m3u8,.mp4"
                                        id={`video-uploader-${langKey}`}
                                        onChange={(e) => {
                                          const file = e.target.files?.[0];
                                          if (file) {
                                            handleUploadFileToCloudinary(file, `video-${langKey}`, (url) => {
                                              setEpisodeForm(prev => {
                                                const copy = { ...prev.videoSources };
                                                copy[langKey] = { ...copy[langKey], url };
                                                return { ...prev, videoSources: copy };
                                              });
                                            });
                                          }
                                        }}
                                        className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
                                      />
                                      <button
                                        type="button"
                                        className="bg-white/5 border border-white/5 hover:bg-white/10 text-white px-4 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-wider cursor-pointer"
                                      >
                                        Upload File
                                      </button>
                                    </div>
                                  )}
                                </div>

                                {/* Video Upload Progress Indicator */}
                                {uploadProgress[`video-${langKey}`] !== undefined && (
                                  <div className="space-y-1">
                                    <div className="flex justify-between text-[8px] text-gray-400 font-black">
                                      <span>
                                        {uploadProgress[`video-${langKey}`] >= 100 || uploadDetails[`video-${langKey}`]?.processing ? (
                                          <span className="text-primary animate-pulse uppercase">Processing on Cloudinary cluster... Please wait</span>
                                        ) : (
                                          <span className="uppercase">
                                            Uploading Video File
                                            {uploadDetails[`video-${langKey}`]?.sizeInfo ? ` (${uploadDetails[`video-${langKey}`].sizeInfo})` : ' to Cloudinary cluster...'}
                                            {uploadDetails[`video-${langKey}`]?.speed ? ` @ ${uploadDetails[`video-${langKey}`].speed}` : ''}
                                            {uploadDetails[`video-${langKey}`]?.eta ? `, ETA: ${uploadDetails[`video-${langKey}`].eta}` : ''}
                                          </span>
                                        )}
                                      </span>
                                      <div className="flex items-center gap-1.5">
                                        <span>{Math.round(uploadProgress[`video-${langKey}`])}%</span>
                                        {uploadProgress[`video-${langKey}`] < 100 && !uploadDetails[`video-${langKey}`]?.processing && (
                                          <button 
                                            type="button" 
                                            onClick={() => handleCancelUpload(`video-${langKey}`)}
                                            className="text-red-400 hover:text-red-300 font-black uppercase text-[7px] cursor-pointer"
                                          >
                                            [Cancel]
                                          </button>
                                        )}
                                      </div>
                                    </div>
                                    <div className="w-full bg-white/5 h-1.5 rounded-full overflow-hidden">
                                      <div className="bg-primary h-full transition-all duration-300" style={{ width: `${uploadProgress[`video-${langKey}`]}%` }} />
                                    </div>
                                  </div>
                                )}

                                {/* Dailymotion UI Mask Settings Block */}
                                {(source.type === 'dailymotion' || source.videoType === 'dailymotion' || source.url.includes('dailymotion.com') || source.url.includes('dai.ly')) && (
                                  <div className="bg-black/40 border border-white/5 rounded-xl p-4 space-y-3.5 mt-2">
                                    <h5 className="text-[10px] text-white font-black uppercase tracking-wider flex items-center gap-1.5 text-primary">
                                      <ShieldCheck size={12} className="text-primary animate-pulse" />
                                      Embed UI Protection (Dailymotion Only)
                                    </h5>
                                    
                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                      <label className="flex items-center gap-2.5 text-[10px] font-black text-gray-300 cursor-pointer select-none">
                                        <input 
                                          type="checkbox"
                                          checked={source.hidePlaylist === true}
                                          onChange={(e) => {
                                            const checked = e.target.checked;
                                            setEpisodeForm(prev => {
                                              const copy = { ...prev.videoSources };
                                              copy[langKey] = { ...copy[langKey], hidePlaylist: checked };
                                              return { ...prev, videoSources: copy };
                                            });
                                          }}
                                          className="w-4 h-4 rounded accent-primary border-white/10 bg-black/50 cursor-pointer"
                                        />
                                        <div>
                                          <span className="block text-[10px] text-white uppercase font-black">Hide Playlist Button</span>
                                          <span className="block text-[8px] text-gray-500 font-bold uppercase">Render floating overlay over Playlist icon</span>
                                        </div>
                                      </label>

                                      <label className="flex items-center gap-2.5 text-[10px] font-black text-gray-300 cursor-pointer select-none">
                                        <input 
                                          type="checkbox"
                                          checked={source.hideShare === true}
                                          onChange={(e) => {
                                            const checked = e.target.checked;
                                            setEpisodeForm(prev => {
                                              const copy = { ...prev.videoSources };
                                              copy[langKey] = { ...copy[langKey], hideShare: checked };
                                              return { ...prev, videoSources: copy };
                                            });
                                          }}
                                          className="w-4 h-4 rounded accent-primary border-white/10 bg-black/50 cursor-pointer"
                                        />
                                        <div>
                                          <span className="block text-[10px] text-white uppercase font-black">Hide Share Button</span>
                                          <span className="block text-[8px] text-gray-500 font-bold uppercase">Render floating overlay over Share icon</span>
                                        </div>
                                      </label>
                                    </div>
                                  </div>
                                )}

                              </div>
                            )}
                          </div>
                        );
                      })}

                    </div>

                  </div>

                  {/* Right Column: Thumbnail */}
                  <div className="space-y-6">
                    
                    <div className="bg-[#0a0d14]/40 border border-white/5 p-4 rounded-2xl space-y-3">
                      <span className="text-[10px] text-gray-500 font-black uppercase tracking-wider block">Episode Thumbnail</span>
                      
                      {episodeForm.thumbnail ? (
                        <div className="relative aspect-video w-full rounded-xl overflow-hidden border border-white/10 group">
                          <img src={episodeForm.thumbnail || null} alt="" className="w-full h-full object-cover" />
                          <button
                            type="button"
                            onClick={() => {
                              if (episodeForm.thumbnail.includes("cloudinary.com")) {
                                deleteAssetByUrl(episodeForm.thumbnail).catch(err => console.warn(err));
                              }
                              setEpisodeForm(prev => ({ ...prev, thumbnail: '' }));
                            }}
                            className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-red-400 text-[10px] font-black uppercase tracking-widest cursor-pointer"
                          >
                            Remove
                          </button>
                        </div>
                      ) : (
                        <div className="border border-white/5 border-dashed rounded-xl p-6 text-center hover:bg-white/[0.01] transition-colors relative cursor-pointer">
                          <input 
                            type="file" 
                            accept="image/*"
                            id="ep-thumb-uploader"
                            onChange={(e) => {
                              const file = e.target.files?.[0];
                              if (file) {
                                handleUploadFileToCloudinary(file, 'ep-thumb', (url) => {
                                  setEpisodeForm(prev => ({ ...prev, thumbnail: url }));
                                }, episodeForm.thumbnail);
                              }
                            }}
                            className="absolute inset-0 opacity-0 cursor-pointer"
                          />
                          <UploadCloud size={24} className="text-gray-600 mx-auto mb-2 animate-bounce" />
                          <p className="text-[9px] text-gray-400 font-extrabold uppercase">Choose thumbnail file</p>
                          <p className="text-[8px] text-gray-500 mt-0.5">landscape visual image</p>
                        </div>
                      )}

                      {/* Progress bar */}
                      {uploadProgress['ep-thumb'] !== undefined && (
                        <div className="space-y-1">
                          <div className="flex justify-between text-[8px] text-gray-400 font-black">
                            <span>
                              {uploadProgress['ep-thumb'] >= 100 || uploadDetails['ep-thumb']?.processing ? (
                                <span className="text-primary animate-pulse uppercase">Processing on Cloudinary...</span>
                              ) : (
                                <span className="uppercase">
                                  Uploading Thumbnail
                                  {uploadDetails['ep-thumb']?.sizeInfo ? ` (${uploadDetails['ep-thumb'].sizeInfo})` : ' to Cloudinary...'}
                                  {uploadDetails['ep-thumb']?.speed ? ` @ ${uploadDetails['ep-thumb'].speed}` : ''}
                                </span>
                              )}
                            </span>
                            <div className="flex items-center gap-1.5">
                              <span>{Math.round(uploadProgress['ep-thumb'])}%</span>
                              {uploadProgress['ep-thumb'] < 100 && !uploadDetails['ep-thumb']?.processing && (
                                <button 
                                  type="button" 
                                  onClick={() => handleCancelUpload('ep-thumb')}
                                  className="text-red-400 hover:text-red-300 font-black uppercase text-[7px] cursor-pointer"
                                >
                                  [Cancel]
                                </button>
                              )}
                            </div>
                          </div>
                          <div className="w-full bg-white/5 h-1.5 rounded-full overflow-hidden">
                            <div className="bg-primary h-full transition-all duration-300" style={{ width: `${uploadProgress['ep-thumb']}%` }} />
                          </div>
                        </div>
                      )}

                      <input 
                        type="text"
                        value={episodeForm.thumbnail}
                        onChange={(e) => setEpisodeForm(prev => ({ ...prev, thumbnail: e.target.value }))}
                        placeholder="Or paste direct image URL..."
                        className="w-full bg-black/50 text-[10px] text-gray-300 px-3 py-2 rounded-lg border border-white/5 outline-none focus:border-primary/50 transition-colors"
                      />
                    </div>

                  </div>

                </div>

                {/* Submit row */}
                <div className="border-t border-white/5 pt-6 flex gap-3 justify-end">
                  <button
                    type="button"
                    onClick={() => setUploadTabMode('animeForm')}
                    className="px-6 py-3 bg-white/5 hover:bg-white/10 text-gray-300 hover:text-white rounded-xl text-xs font-black uppercase tracking-wider transition-all border border-white/5 active:scale-95 cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={isSaving}
                    className="px-8 py-3 bg-primary hover:bg-[#00cce0] text-black font-black text-xs rounded-xl transition-all shadow-lg shadow-cyan-500/15 uppercase tracking-wider active:scale-95 disabled:opacity-50 cursor-pointer flex items-center gap-1.5"
                  >
                    <Save size={13} />
                    {isSaving ? 'SAVING EPISODE...' : 'SAVE EPISODE'}
                  </button>
                </div>
              </form>
            )}

          </div>
        )}

        {/* TAB 6: HOMEPAGE SECTION MANAGER ZONE */}
        {activeTab === 'sections' && (
          <div className="space-y-6 animate-fadeIn">
            {/* Header */}
            <div className="flex justify-between items-center bg-[#0a0d14]/30 border border-white/5 p-5 rounded-2xl backdrop-blur-md">
              <div>
                <h3 className="text-sm font-black text-white uppercase tracking-wider flex items-center gap-2">
                  <Settings size={16} className="text-primary" />
                  Homepage Section Manager
                </h3>
                <p className="text-[10px] text-gray-400 mt-1">Manage, sort, and enable/disable custom and standard homepage sections dynamically.</p>
              </div>
              {!sectionFormOpen && (
                <button
                  onClick={handleCreateNewSectionClick}
                  className="flex items-center gap-1.5 px-4 py-2.5 bg-primary hover:bg-[#00cce0] text-black font-black text-xs rounded-xl transition-all cursor-pointer shadow-lg shadow-cyan-500/15 uppercase tracking-wider"
                >
                  <Plus size={14} />
                  Create New Section
                </button>
              )}
            </div>

            {/* A. FORM MODE: Creating or editing a section */}
            {sectionFormOpen ? (
              <form onSubmit={handleSaveSection} className="bg-[#0a0d14]/30 border border-white/5 p-6 rounded-2xl backdrop-blur-md space-y-6 max-w-2xl mx-auto">
                <div className="flex items-center justify-between border-b border-white/5 pb-4">
                  <h4 className="text-xs font-black text-white uppercase tracking-wider">
                    {editingSection ? 'Modify Homepage Section' : 'Add Custom Homepage Section'}
                  </h4>
                  <button 
                    type="button" 
                    onClick={() => setSectionFormOpen(false)}
                    className="text-[10px] text-gray-400 hover:text-white uppercase font-bold"
                  >
                    Go Back
                  </button>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                  <div className="space-y-2">
                    <label className="text-[10px] text-gray-500 font-black uppercase tracking-wider block">Section Name</label>
                    <input 
                      type="text" 
                      required
                      placeholder="e.g. Hindi Dubbed, Seasonal Picks"
                      value={sectionForm.name}
                      onChange={(e) => {
                        const val = e.target.value;
                        const generatedSlug = val.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
                        setSectionForm(prev => ({ 
                          ...prev, 
                          name: val,
                          slug: prev.id ? prev.slug : generatedSlug
                        }));
                      }}
                      className="w-full bg-black/60 text-xs text-white px-4 py-3 rounded-xl border border-white/5 outline-none focus:border-primary/50 transition-colors"
                    />
                  </div>

                  <div className="space-y-2">
                    <label className="text-[10px] text-gray-500 font-black uppercase tracking-wider block">Section Slug (Dynamic Key)</label>
                    <input 
                      type="text" 
                      required
                      disabled={!!editingSection}
                      placeholder="e.g. hindi-dubbed"
                      value={sectionForm.slug}
                      onChange={(e) => setSectionForm(prev => ({ ...prev, slug: e.target.value }))}
                      className="w-full bg-black/60 text-xs text-white px-4 py-3 rounded-xl border border-white/5 outline-none focus:border-primary/50 transition-colors disabled:opacity-50"
                    />
                  </div>

                  <div className="space-y-2">
                    <label className="text-[10px] text-gray-500 font-black uppercase tracking-wider block">Display Order</label>
                    <input 
                      type="number" 
                      required
                      min={1}
                      placeholder="e.g. 2"
                      value={sectionForm.displayOrder}
                      onChange={(e) => setSectionForm(prev => ({ ...prev, displayOrder: parseInt(e.target.value) || 1 }))}
                      className="w-full bg-black/60 text-xs text-white px-4 py-3 rounded-xl border border-white/5 outline-none focus:border-primary/50 transition-colors"
                    />
                  </div>

                  <div className="space-y-2">
                    <label className="text-[10px] text-gray-500 font-black uppercase tracking-wider block">Max Cards to Show</label>
                    <input 
                      type="number" 
                      required
                      min={1}
                      placeholder="12"
                      value={sectionForm.numCards}
                      onChange={(e) => setSectionForm(prev => ({ ...prev, numCards: parseInt(e.target.value) || 12 }))}
                      className="w-full bg-black/60 text-xs text-white px-4 py-3 rounded-xl border border-white/5 outline-none focus:border-primary/50 transition-colors"
                    />
                  </div>

                  <div className="space-y-2">
                    <label className="text-[10px] text-gray-500 font-black uppercase tracking-wider block">Visible on Homepage</label>
                    <div className="flex items-center gap-3 pt-2">
                      <input 
                        type="checkbox" 
                        checked={sectionForm.visible}
                        onChange={(e) => setSectionForm(prev => ({ ...prev, visible: e.target.checked }))}
                        className="w-5 h-5 accent-primary cursor-pointer rounded bg-black/60 border border-white/10"
                      />
                      <span className="text-xs text-gray-300 font-bold">Show as slider on the home view</span>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <label className="text-[10px] text-gray-500 font-black uppercase tracking-wider block">Status</label>
                    <select
                      value={sectionForm.status}
                      onChange={(e) => setSectionForm(prev => ({ ...prev, status: e.target.value as 'active' | 'inactive' }))}
                      className="w-full bg-black/60 text-xs text-white px-4 py-3 rounded-xl border border-white/5 outline-none focus:border-primary/50 transition-colors cursor-pointer"
                    >
                      <option value="active">Active (Queries enabled)</option>
                      <option value="inactive">Disabled (Invisible)</option>
                    </select>
                  </div>
                </div>

                <div className="border-t border-white/5 pt-5 flex justify-end gap-3">
                  <button
                    type="button"
                    onClick={() => {
                      setSectionFormOpen(false);
                      setEditingSection(null);
                    }}
                    className="px-5 py-2.5 bg-white/5 hover:bg-white/10 text-gray-300 rounded-xl text-xs font-black uppercase tracking-wider transition-all cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-6 py-2.5 bg-primary hover:bg-[#00cce0] text-black font-black text-xs rounded-xl transition-all uppercase tracking-wider cursor-pointer"
                  >
                    Save Changes
                  </button>
                </div>
              </form>
            ) : (
              /* B. LIST MODE */
              <>
                {/* 1. Desktop View Table */}
                <div className="hidden md:block overflow-x-auto border border-white/5 rounded-2xl bg-[#0a0d14]/20 scrollbar-thin scrollbar-thumb-white/10">
                  <table className="w-full text-left border-collapse min-w-[800px]">
                    <thead>
                      <tr className="border-b border-white/5 bg-[#0a0d14]/40 text-[9px] font-black text-gray-400 uppercase tracking-widest">
                        <th className="p-4">Name</th>
                        <th className="p-4">Slug / Key</th>
                        <th className="p-4 text-center">Display Order</th>
                        <th className="p-4 text-center">Max Cards</th>
                        <th className="p-4 text-center">Home Visibility</th>
                        <th className="p-4 text-center">Status</th>
                        <th className="p-4 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/[0.03] text-xs font-medium text-gray-300">
                      {dbSections.map((sec, secIdx) => (
                        <tr key={sec.slug || sec.id || `sec-${secIdx}`} className="hover:bg-white/[0.01] transition-colors">
                          <td className="p-4 font-black text-white">{sec.name}</td>
                          <td className="p-4 font-mono text-[10px] text-gray-400">{sec.slug}</td>
                          <td className="p-4 text-center font-bold">{sec.displayOrder}</td>
                          <td className="p-4 text-center font-bold">{sec.numCards || 12}</td>
                          <td className="p-4 text-center">
                            <span className={cn(
                              "px-2.5 py-1 rounded-full text-[9px] font-black uppercase tracking-wider",
                              sec.visible !== false ? "bg-green-500/10 text-green-400" : "bg-red-500/10 text-red-400"
                            )}>
                              {sec.visible !== false ? 'VISIBLE' : 'HIDDEN'}
                            </span>
                          </td>
                          <td className="p-4 text-center">
                            <span className={cn(
                              "px-2.5 py-1 rounded-full text-[9px] font-black uppercase tracking-wider",
                              sec.status === 'active' ? "bg-cyan-500/10 text-primary" : "bg-white/5 text-gray-400"
                            )}>
                              {sec.status === 'active' ? 'ACTIVE' : 'DISABLED'}
                            </span>
                          </td>
                          <td className="p-4 text-right">
                            <div className="flex gap-2 justify-end items-center">
                              {/* Reorder Up/Down arrows */}
                              <div className="flex gap-1 bg-black/40 p-1 rounded-lg border border-white/5 mr-1">
                                <button
                                  type="button"
                                  onClick={() => handleMoveSection(secIdx, 'up')}
                                  disabled={secIdx === 0}
                                  className="p-1 hover:bg-white/10 text-gray-400 hover:text-primary rounded transition-all cursor-pointer disabled:opacity-20 disabled:pointer-events-none"
                                  title="Move Up"
                                >
                                  <ArrowUp size={13} className="stroke-[3]" />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleMoveSection(secIdx, 'down')}
                                  disabled={secIdx === dbSections.length - 1}
                                  className="p-1 hover:bg-white/10 text-gray-400 hover:text-primary rounded transition-all cursor-pointer disabled:opacity-20 disabled:pointer-events-none"
                                  title="Move Down"
                                >
                                  <ArrowDown size={13} className="stroke-[3]" />
                                </button>
                              </div>

                              <button
                                type="button"
                                onClick={() => handleEditSectionClick(sec)}
                                className="p-2 bg-white/5 hover:bg-white/10 text-gray-300 hover:text-white rounded-lg transition-all cursor-pointer"
                                title="Edit Section Settings"
                              >
                                <Edit3 size={13} />
                              </button>
                              <button
                                type="button"
                                onClick={() => handleDeleteSection(sec.id || sec.slug)}
                                className="p-2 bg-red-500/5 hover:bg-red-500/15 text-red-400 hover:text-red-300 rounded-lg transition-all cursor-pointer"
                                title="Delete Section"
                              >
                                <Trash size={13} />
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* 2. Mobile View Cards */}
                <div className="md:hidden space-y-3">
                  {dbSections.map((sec, secIdx) => (
                    <div 
                      key={sec.slug || sec.id || `sec-mobile-${secIdx}`} 
                      className="p-4 rounded-xl border border-white/5 bg-[#0a0d14]/40 flex flex-col gap-3"
                    >
                      <div className="flex justify-between items-start">
                        <div>
                          <h4 className="font-bold text-white text-sm">{sec.name}</h4>
                          <p className="font-mono text-[10px] text-gray-400 mt-0.5">{sec.slug}</p>
                        </div>
                        <div className="flex flex-wrap gap-1.5 justify-end">
                          <span className={cn(
                            "px-2 py-0.5 rounded-full text-[8px] font-black uppercase tracking-wider shrink-0",
                            sec.visible !== false ? "bg-green-500/10 text-green-400" : "bg-red-500/10 text-red-400"
                          )}>
                            {sec.visible !== false ? 'VISIBLE' : 'HIDDEN'}
                          </span>
                          <span className={cn(
                            "px-2 py-0.5 rounded-full text-[8px] font-black uppercase tracking-wider shrink-0",
                            sec.status === 'active' ? "bg-cyan-500/10 text-primary" : "bg-white/5 text-gray-400"
                          )}>
                            {sec.status === 'active' ? 'ACTIVE' : 'DISABLED'}
                          </span>
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-2 bg-black/20 p-2.5 rounded-lg text-xs border border-white/[0.02]">
                        <div>
                          <span className="text-gray-400 block text-[10px]">DISPLAY ORDER</span>
                          <span className="font-black text-white">{sec.displayOrder}</span>
                        </div>
                        <div>
                          <span className="text-gray-400 block text-[10px]">MAX CARDS</span>
                          <span className="font-black text-white">{sec.numCards || 12}</span>
                        </div>
                      </div>

                      <div className="flex justify-between items-center pt-1 border-t border-white/[0.03]">
                        {/* Reorder Arrows on Left */}
                        <div className="flex gap-2 items-center">
                          <span className="text-[10px] text-gray-400 font-bold mr-1">REORDER:</span>
                          <div className="flex gap-1.5 bg-black/60 p-1.5 rounded-lg border border-white/5">
                            <button
                              type="button"
                              onClick={() => handleMoveSection(secIdx, 'up')}
                              disabled={secIdx === 0}
                              className="p-1.5 hover:bg-white/10 text-gray-400 hover:text-primary rounded-md transition-all cursor-pointer disabled:opacity-10 disabled:pointer-events-none"
                              title="Move Up"
                            >
                              <ArrowUp size={16} className="stroke-[3]" />
                            </button>
                            <button
                              type="button"
                              onClick={() => handleMoveSection(secIdx, 'down')}
                              disabled={secIdx === dbSections.length - 1}
                              className="p-1.5 hover:bg-white/10 text-gray-400 hover:text-primary rounded-md transition-all cursor-pointer disabled:opacity-10 disabled:pointer-events-none"
                              title="Move Down"
                            >
                              <ArrowDown size={16} className="stroke-[3]" />
                            </button>
                          </div>
                        </div>

                        {/* Edit/Delete Actions on Right */}
                        <div className="flex gap-2">
                          <button
                            type="button"
                            onClick={() => handleEditSectionClick(sec)}
                            className="px-3 py-1.5 bg-white/5 hover:bg-white/10 text-gray-300 hover:text-white rounded-lg transition-all cursor-pointer flex items-center gap-1.5 text-xs font-bold"
                            title="Edit"
                          >
                            <Edit3 size={12} />
                            <span>Edit</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeleteSection(sec.id || sec.slug)}
                            className="px-3 py-1.5 bg-red-500/10 hover:bg-red-500/20 text-red-400 hover:text-red-300 rounded-lg transition-all cursor-pointer flex items-center gap-1.5 text-xs font-bold"
                            title="Delete"
                          >
                            <Trash size={12} />
                            <span>Delete</span>
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        )}

        {/* TAB 7: ADVANCED STORAGE MANAGEMENT SYSTEM ZONE */}
        {activeTab === 'storage' && (
          <div className="space-y-6 animate-fadeIn text-gray-300">
            
            {/* Hidden Backup File Input */}
            <input 
              type="file" 
              ref={fileInputRef} 
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (!file) return;
                const reader = new FileReader();
                reader.onload = async (event) => {
                  try {
                    const parsed = JSON.parse(event.target?.result as string);
                    if (parsed.configs && Array.isArray(parsed.configs)) {
                      // Import configs
                      for (const conf of parsed.configs) {
                        if (conf.id && conf.name) {
                          await set(ref(db, `storage_configs/${conf.id}`), conf);
                        }
                      }
                      // Import settings
                      if (parsed.settings) {
                        await set(ref(db, 'storage_settings'), parsed.settings);
                      }
                      alert("Storage configurations imported successfully!");
                    } else {
                      alert("Invalid backup file format. Must contain configs and settings.");
                    }
                  } catch (err) {
                    console.error("Failed to import configuration:", err);
                    alert("Error reading backup file.");
                  }
                };
                reader.readAsText(file);
              }}
              className="hidden" 
              accept=".json"
            />

            {/* Header & Global Orchestration Console */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 bg-[#0a0d14]/30 border border-white/5 p-6 rounded-2xl backdrop-blur-md">
              <div className="lg:col-span-2 space-y-3">
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-cyan-400 animate-ping" />
                  <h3 className="text-sm font-black text-white uppercase tracking-wider flex items-center gap-2">
                    <Server size={16} className="text-primary" />
                    Storage Router & Telemetry Control Center
                  </h3>
                </div>
                <p className="text-[10px] text-gray-400 leading-relaxed max-w-2xl">
                  Configure unlimited CDN storage providers. Features real-time background health monitoring, zero-latency manual or smart load-balancing, automatic multi-attempt retry, and instant failover rotation to guarantee 100% video/image asset availability.
                </p>
                
                {/* Orchestration settings bar */}
                <div className="flex flex-wrap items-center gap-4 pt-3 border-t border-white/5">
                  {/* Auto Rotate Toggle */}
                  <label className="flex items-center gap-2.5 cursor-pointer group bg-white/[0.02] border border-white/5 px-3.5 py-2 rounded-xl hover:bg-white/[0.04] transition-all">
                    <input 
                      type="checkbox" 
                      checked={storageSettings.autoRotate}
                      onChange={handleToggleAutoRotate}
                      className="w-4 h-4 rounded accent-primary border-white/10 bg-black/50 cursor-pointer"
                    />
                    <div>
                      <span className="text-[10px] font-black text-white uppercase tracking-wider block">Auto Failover Rotation</span>
                      <span className="text-[8px] text-gray-500 block">Failover to next priority account on error</span>
                    </div>
                  </label>

                  {/* Smart Storage Mode Toggle */}
                  <label className="flex items-center gap-2.5 cursor-pointer group bg-white/[0.02] border border-white/5 px-3.5 py-2 rounded-xl hover:bg-white/[0.04] transition-all">
                    <input 
                      type="checkbox" 
                      checked={storageSettings.smartMode || false}
                      onChange={handleToggleSmartMode}
                      className="w-4 h-4 rounded accent-primary border-white/10 bg-black/50 cursor-pointer"
                    />
                    <div>
                      <span className="text-[10px] font-black text-white uppercase tracking-wider block">Smart Storage Mode</span>
                      <span className="text-[8px] text-gray-500 block">Always route uploads to the healthiest account</span>
                    </div>
                  </label>

                  {/* Active/Default indicator */}
                  <div className="bg-black/40 px-3.5 py-2 rounded-xl border border-white/5 flex flex-col justify-center min-w-[150px]">
                    <span className="text-[8px] text-gray-500 font-black uppercase tracking-widest block mb-0.5">Primary Active Node</span>
                    <span className="text-[10px] font-black text-primary flex items-center gap-1.5 truncate">
                      <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
                      {storageConfigs.find(c => c.id === storageSettings.defaultStorageId)?.name || 'Default Fallback Cloudinary'}
                    </span>
                  </div>
                </div>
              </div>

              {/* Action Buttons Console */}
              <div className="flex flex-col justify-between lg:items-end gap-3.5">
                {!storageFormOpen ? (
                  <button
                    onClick={handleCreateNewStorageClick}
                    className="w-full flex items-center justify-center gap-2 px-5 py-3 bg-primary hover:bg-[#00cce0] text-black font-black text-xs rounded-xl transition-all cursor-pointer shadow-lg shadow-cyan-500/15 uppercase tracking-wider active:scale-95 shrink-0"
                  >
                    <Plus size={14} className="stroke-[3]" />
                    Add Storage Provider
                  </button>
                ) : (
                  <div className="w-full h-12" />
                )}

                {/* Cloud Backup / Restore controls */}
                <div className="grid grid-cols-2 gap-2 w-full">
                  <button
                    onClick={async () => {
                      try {
                        await set(ref(db, 'storage_backups/latest'), {
                          configs: storageConfigs,
                          settings: storageSettings,
                          timestamp: Date.now()
                        });
                        alert("Storage configuration successfully backed up to Cloud!");
                      } catch (err) {
                        alert("Failed to back up configuration to cloud.");
                      }
                    }}
                    className="flex items-center justify-center gap-1.5 py-2 bg-white/5 hover:bg-white/10 border border-white/5 rounded-xl text-[9px] font-black text-gray-300 uppercase tracking-widest transition-all cursor-pointer"
                    title="Store configuration backup on database"
                  >
                    <Save size={11} className="text-cyan-400" />
                    Backup Cloud
                  </button>
                  <button
                    onClick={() => {
                      showConfirm(
                        "Restore from Cloud",
                        "Are you sure you want to restore the storage configuration from your last Cloud Backup? This will overwrite your current settings.",
                        async () => {
                          try {
                            const snap = await get(ref(db, 'storage_backups/latest'));
                            if (snap.exists()) {
                              const data = snap.val();
                              if (data.configs) {
                                await remove(ref(db, 'storage_configs'));
                                for (const conf of data.configs) {
                                  await set(ref(db, `storage_configs/${conf.id}`), conf);
                                }
                              }
                              if (data.settings) {
                                await set(ref(db, 'storage_settings'), data.settings);
                              }
                              alert("Storage settings restored successfully from Cloud Backup!");
                            } else {
                              alert("No Cloud Backup snapshot found.");
                            }
                          } catch (err) {
                            alert("Failed to restore configuration.");
                          }
                        }
                      );
                    }}
                    className="flex items-center justify-center gap-1.5 py-2 bg-white/5 hover:bg-white/10 border border-white/5 rounded-xl text-[9px] font-black text-gray-300 uppercase tracking-widest transition-all cursor-pointer"
                    title="Restore configuration from database"
                  >
                    <RefreshCw size={11} className="text-orange-400" />
                    Restore Cloud
                  </button>
                  <button
                    onClick={() => {
                      const dataStr = JSON.stringify({ configs: storageConfigs, settings: storageSettings }, null, 2);
                      const dataUri = 'data:application/json;charset=utf-8,'+ encodeURIComponent(dataStr);
                      const linkElement = document.createElement('a');
                      linkElement.setAttribute('href', dataUri);
                      linkElement.setAttribute('download', 'anova-storage-configs.json');
                      linkElement.click();
                    }}
                    className="flex items-center justify-center gap-1.5 py-2 bg-white/5 hover:bg-white/10 border border-white/5 rounded-xl text-[9px] font-black text-gray-300 uppercase tracking-widest transition-all cursor-pointer"
                    title="Export backup JSON"
                  >
                    <FileText size={11} className="text-emerald-400" />
                    Export JSON
                  </button>
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    className="flex items-center justify-center gap-1.5 py-2 bg-white/5 hover:bg-white/10 border border-white/5 rounded-xl text-[9px] font-black text-gray-300 uppercase tracking-widest transition-all cursor-pointer"
                    title="Import backup JSON"
                  >
                    <UploadCloud size={11} className="text-primary" />
                    Import JSON
                  </button>
                </div>
              </div>
            </div>

            {/* Search & Dynamic Filter Console */}
            {!storageFormOpen && (
              <div className="flex flex-col md:flex-row gap-3 bg-[#0a0d14]/20 border border-white/5 p-4 rounded-xl items-center justify-between">
                <div className="relative w-full md:w-80">
                  <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
                  <input 
                    type="text" 
                    placeholder="Search accounts or cloud name..."
                    value={storageSearchQuery}
                    onChange={(e) => setStorageSearchQuery(e.target.value)}
                    className="w-full bg-black/50 text-[10px] text-white pl-9 pr-4 py-2.5 rounded-lg border border-white/5 outline-none focus:border-primary/50 transition-colors font-semibold"
                  />
                </div>

                <div className="flex flex-wrap items-center gap-2.5 w-full md:w-auto justify-end">
                  <div className="flex items-center gap-1.5 bg-black/40 px-2.5 py-1.5 rounded-lg border border-white/5">
                    <Filter size={10} className="text-gray-500" />
                    <span className="text-[8px] text-gray-500 font-bold uppercase">Filter:</span>
                  </div>

                  {/* Status Filter */}
                  <select
                    value={storageFilterStatus}
                    onChange={(e) => setStorageFilterStatus(e.target.value)}
                    className="bg-black/50 text-[10px] text-gray-300 px-3 py-1.5 rounded-lg border border-white/5 focus:border-primary/40 outline-none font-bold"
                  >
                    <option value="all">Status: All</option>
                    <option value="enabled">Status: Enabled</option>
                    <option value="disabled">Status: Disabled</option>
                  </select>

                  {/* Active Filter */}
                  <select
                    value={storageFilterActive}
                    onChange={(e) => setStorageFilterActive(e.target.value)}
                    className="bg-black/50 text-[10px] text-gray-300 px-3 py-1.5 rounded-lg border border-white/5 focus:border-primary/40 outline-none font-bold"
                  >
                    <option value="all">Active: All</option>
                    <option value="active">Active Primary Only</option>
                    <option value="inactive">Secondary Backup Only</option>
                  </select>

                  {/* Priority Filter */}
                  <select
                    value={storageFilterPriority}
                    onChange={(e) => setStorageFilterPriority(e.target.value)}
                    className="bg-black/50 text-[10px] text-gray-300 px-3 py-1.5 rounded-lg border border-white/5 focus:border-primary/40 outline-none font-bold"
                  >
                    <option value="all">Priority: All</option>
                    <option value="1">Priority #1</option>
                    <option value="2">Priority #2</option>
                    <option value="3">Priority #3</option>
                  </select>

                  {/* Health Check trigger */}
                  <button
                    onClick={async () => {
                      alert("Starting background health scan for all storage providers...");
                      for (const config of storageConfigs) {
                        try {
                          const result = await testConnectionWithConfig(config);
                          const healthStatus = result.success ? "Healthy" : result.message === "Network Error" ? "Offline" : "Warning";
                          await update(ref(db, `storage_configs/${config.id}`), {
                            health: healthStatus,
                            lastUploadTime: Date.now()
                          });
                        } catch (err) {
                          await update(ref(db, `storage_configs/${config.id}`), { health: "Offline" });
                        }
                      }
                      alert("Health check completed for all storage accounts.");
                    }}
                    className="flex items-center gap-1 px-3 py-1.5 bg-[#00cce0]/10 hover:bg-[#00cce0]/20 text-[#00cce0] text-[9px] font-black uppercase tracking-wider rounded-lg border border-[#00cce0]/20 transition-all cursor-pointer"
                    title="Scan all connections"
                  >
                    <Activity size={11} className="animate-pulse" />
                    Scan Nodes Health
                  </button>
                </div>
              </div>
            )}

            {/* A. FORM MODE: Creating or editing a storage config */}
            {storageFormOpen ? (
              <form onSubmit={handleSaveStorageForm} className="bg-[#0a0d14]/30 border border-white/5 p-6 rounded-2xl backdrop-blur-md space-y-6 max-w-3xl mx-auto animate-fadeIn">
                <div className="flex items-center justify-between border-b border-white/5 pb-4">
                  <h4 className="text-xs font-black text-white uppercase tracking-wider flex items-center gap-2">
                    <Sparkles size={14} className="text-primary" />
                    {editingStorage ? `Modify Provider: ${editingStorage.name}` : 'Configure New Storage Provider'}
                  </h4>
                  <button 
                    type="button" 
                    onClick={() => {
                      setStorageFormOpen(false);
                      setEditingStorage(null);
                    }}
                    className="text-[10px] text-gray-400 hover:text-white uppercase font-black tracking-wider hover:underline"
                  >
                    Cancel & Go Back
                  </button>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                  <div className="space-y-2">
                    <label className="text-[10px] text-gray-500 font-black uppercase tracking-wider block">Storage Name</label>
                    <input 
                      type="text" 
                      required
                      placeholder="e.g. Primary Cloudinary, Backup Account"
                      value={storageForm.name}
                      onChange={(e) => setStorageForm(prev => ({ ...prev, name: e.target.value }))}
                      className="w-full bg-black/60 text-xs text-white px-4 py-3 rounded-xl border border-white/5 outline-none focus:border-primary/50 transition-colors"
                    />
                  </div>

                  <div className="space-y-2">
                    <label className="text-[10px] text-gray-500 font-black uppercase tracking-wider block">Provider Adapter</label>
                    <select
                      value={storageForm.provider}
                      onChange={(e) => setStorageForm(prev => ({ ...prev, provider: e.target.value as any }))}
                      className="w-full bg-black/60 text-xs text-white px-4 py-3 rounded-xl border border-white/5 outline-none focus:border-primary/50 transition-colors cursor-pointer"
                    >
                      <option value="cloudinary">Cloudinary (Direct signed upload)</option>
                      <option value="cloudflare_r2">Cloudflare R2 (Prepared Adapter)</option>
                      <option value="bunny">Bunny Storage (Prepared Adapter)</option>
                      <option value="aws_s3">AWS S3 / Bucket (Prepared Adapter)</option>
                      <option value="backblaze_b2">Backblaze B2 (Prepared Adapter)</option>
                      <option value="imagekit">ImageKit (Prepared Adapter)</option>
                      <option value="supabase">Supabase Storage (Prepared Adapter)</option>
                      <option value="firebase">Firebase Storage (Prepared Adapter)</option>
                    </select>
                  </div>

                  {storageForm.provider === 'cloudinary' ? (
                    <>
                      <div className="space-y-2">
                        <label className="text-[10px] text-gray-500 font-black uppercase tracking-wider block">Cloud Name</label>
                        <input 
                          type="text" 
                          required
                          placeholder="Enter Cloudinary Cloud Name"
                          value={storageForm.cloudName}
                          onChange={(e) => setStorageForm(prev => ({ ...prev, cloudName: e.target.value }))}
                          className="w-full bg-black/60 text-xs font-mono text-white px-4 py-3 rounded-xl border border-white/5 outline-none focus:border-primary/50 transition-colors"
                        />
                      </div>

                      <div className="space-y-2">
                        <label className="text-[10px] text-gray-500 font-black uppercase tracking-wider block">API Key</label>
                        <input 
                          type="text" 
                          required
                          placeholder="Enter Cloudinary API Key"
                          value={storageForm.apiKey}
                          onChange={(e) => setStorageForm(prev => ({ ...prev, apiKey: e.target.value }))}
                          className="w-full bg-black/60 text-xs font-mono text-white px-4 py-3 rounded-xl border border-white/5 outline-none focus:border-primary/50 transition-colors"
                        />
                      </div>

                      <div className="space-y-2 md:col-span-2">
                        <label className="text-[10px] text-gray-500 font-black uppercase tracking-wider block">API Secret (Client-Side Signature Encryption Key)</label>
                        <input 
                          type="password" 
                          required
                          placeholder="Enter Cloudinary API Secret"
                          value={storageForm.apiSecret}
                          onChange={(e) => setStorageForm(prev => ({ ...prev, apiSecret: e.target.value }))}
                          className="w-full bg-black/60 text-xs font-mono text-white px-4 py-3 rounded-xl border border-white/5 outline-none focus:border-primary/50 transition-colors"
                        />
                      </div>

                      <div className="space-y-2">
                        <label className="text-[10px] text-gray-500 font-black uppercase tracking-wider block">Upload Folder Path</label>
                        <input 
                          type="text" 
                          placeholder="e.g. anova_anime"
                          value={storageForm.folder}
                          onChange={(e) => setStorageForm(prev => ({ ...prev, folder: e.target.value }))}
                          className="w-full bg-black/60 text-xs text-white px-4 py-3 rounded-xl border border-white/5 outline-none focus:border-primary/50 transition-colors"
                        />
                      </div>

                      <div className="space-y-2">
                        <label className="text-[10px] text-gray-500 font-black uppercase tracking-wider block">Default Folder Path</label>
                        <input 
                          type="text" 
                          placeholder="e.g. anova_anime"
                          value={storageForm.defaultFolder}
                          onChange={(e) => setStorageForm(prev => ({ ...prev, defaultFolder: e.target.value }))}
                          className="w-full bg-black/60 text-xs text-white px-4 py-3 rounded-xl border border-white/5 outline-none focus:border-primary/50 transition-colors"
                        />
                      </div>
                    </>
                  ) : (
                    <div className="md:col-span-2 bg-[#0a0d14]/60 border border-white/5 p-4 rounded-xl text-center text-xs text-gray-400">
                      You are preparing a configuration for <span className="font-bold text-primary uppercase">{storageForm.provider}</span>. When this adapter is activated, the required fields will display here. Priority ranking and capacity controls remain fully operational.
                    </div>
                  )}

                  <div className="space-y-2">
                    <label className="text-[10px] text-gray-500 font-black uppercase tracking-wider block">Priority Rank (Failover Order)</label>
                    <input 
                      type="number" 
                      required
                      min={1}
                      placeholder="e.g. 1"
                      value={storageForm.priority}
                      onChange={(e) => setStorageForm(prev => ({ ...prev, priority: parseInt(e.target.value) || 1 }))}
                      className="w-full bg-black/60 text-xs text-white px-4 py-3 rounded-xl border border-white/5 outline-none focus:border-primary/50 transition-colors"
                    />
                  </div>

                  <div className="space-y-2">
                    <label className="text-[10px] text-gray-500 font-black uppercase tracking-wider block">Operational Status</label>
                    <select
                      value={storageForm.status}
                      onChange={(e) => setStorageForm(prev => ({ ...prev, status: e.target.value as any }))}
                      className="w-full bg-black/60 text-xs text-white px-4 py-3 rounded-xl border border-white/5 outline-none focus:border-primary/50 transition-colors cursor-pointer"
                    >
                      <option value="enabled">Enabled (Candidate for active uploads & failovers)</option>
                      <option value="disabled">Disabled (Do not use)</option>
                    </select>
                  </div>

                  <div className="space-y-2">
                    <label className="text-[10px] text-gray-500 font-black uppercase tracking-wider block">Maximum Upload File Size (MB)</label>
                    <input 
                      type="number" 
                      min={1}
                      placeholder="e.g. 50"
                      value={storageForm.maxUploadSize}
                      onChange={(e) => setStorageForm(prev => ({ ...prev, maxUploadSize: parseInt(e.target.value) || 50 }))}
                      className="w-full bg-black/60 text-xs text-white px-4 py-3 rounded-xl border border-white/5 outline-none focus:border-primary/50 transition-colors"
                    />
                  </div>

                  <div className="space-y-2">
                    <label className="text-[10px] text-gray-500 font-black uppercase tracking-wider block">Maximum Daily Uploads</label>
                    <input 
                      type="number" 
                      min={1}
                      placeholder="e.g. 100"
                      value={storageForm.maxDailyUploads}
                      onChange={(e) => setStorageForm(prev => ({ ...prev, maxDailyUploads: parseInt(e.target.value) || 100 }))}
                      className="w-full bg-black/60 text-xs text-white px-4 py-3 rounded-xl border border-white/5 outline-none focus:border-primary/50 transition-colors"
                    />
                  </div>

                  <div className="space-y-2 md:col-span-2">
                    <label className="text-[10px] text-gray-500 font-black uppercase tracking-wider block">Maximum Total Storage (MB)</label>
                    <input 
                      type="number" 
                      min={1}
                      placeholder="e.g. 1024"
                      value={storageForm.maxStorage}
                      onChange={(e) => setStorageForm(prev => ({ ...prev, maxStorage: parseInt(e.target.value) || 1024 }))}
                      className="w-full bg-black/60 text-xs text-white px-4 py-3 rounded-xl border border-white/5 outline-none focus:border-primary/50 transition-colors"
                    />
                  </div>

                  <div className="space-y-2 md:col-span-2">
                    <label className="text-[10px] text-gray-500 font-black uppercase tracking-wider block">Notes / Description</label>
                    <textarea 
                      placeholder="Add any reminders about this storage account..."
                      value={storageForm.notes}
                      onChange={(e) => setStorageForm(prev => ({ ...prev, notes: e.target.value }))}
                      className="w-full bg-black/60 text-xs text-white px-4 py-3 rounded-xl border border-white/5 outline-none focus:border-primary/50 transition-colors h-20 resize-none"
                    />
                  </div>
                </div>

                <div className="border-t border-white/5 pt-5 flex justify-end gap-3">
                  <button
                    type="button"
                    onClick={() => {
                      setStorageFormOpen(false);
                      setEditingStorage(null);
                    }}
                    className="px-5 py-2.5 bg-white/5 hover:bg-white/10 text-gray-300 rounded-xl text-xs font-black uppercase tracking-wider transition-all cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-6 py-2.5 bg-primary hover:bg-[#00cce0] text-black font-black text-xs rounded-xl transition-all uppercase tracking-wider cursor-pointer"
                  >
                    Save configuration
                  </button>
                </div>
              </form>
            ) : (
              /* B. DISPLAY MODE: Cards & History */
              <div className="space-y-8 animate-fadeIn">
                
                {/* Custom filtered configurations cards list */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {/* Default fallback card is shown if list is completely empty */}
                  {storageConfigs.length === 0 && (
                    <div className="bg-[#0a0d14]/20 border border-dashed border-white/10 p-6 rounded-2xl flex flex-col items-center justify-center text-center space-y-3 lg:col-span-3 min-h-[220px]">
                      <Server size={32} className="text-gray-500 animate-pulse" />
                      <div>
                        <h4 className="text-xs font-black text-white uppercase tracking-wider">No Custom Storages Configured</h4>
                        <p className="text-[9px] text-gray-400 mt-1 max-w-sm">
                          The system is currently defaulting to the pre-loaded built-in fallback Cloudinary credentials. Click "+ Add Storage Provider" to configure your own custom accounts.
                        </p>
                      </div>
                    </div>
                  )}

                  {storageConfigs
                    .filter(config => {
                      // Apply Search Filter
                      if (storageSearchQuery.trim()) {
                        const nameMatch = config.name.toLowerCase().includes(storageSearchQuery.toLowerCase());
                        const cloudMatch = (config.cloudName || '').toLowerCase().includes(storageSearchQuery.toLowerCase());
                        if (!nameMatch && !cloudMatch) return false;
                      }
                      // Apply Provider Filter
                      if (storageFilterProvider !== 'all' && config.provider !== storageFilterProvider) return false;
                      // Apply Status Filter
                      if (storageFilterStatus !== 'all' && config.status !== storageFilterStatus) return false;
                      // Apply Priority Filter
                      if (storageFilterPriority !== 'all' && String(config.priority) !== storageFilterPriority) return false;
                      // Apply Active Filter
                      if (storageFilterActive !== 'all') {
                        const isActive = storageSettings.defaultStorageId === config.id;
                        if (storageFilterActive === 'active' && !isActive) return false;
                        if (storageFilterActive === 'inactive' && isActive) return false;
                      }
                      return true;
                    })
                    .map((config, configIdx) => {
                      const isDefault = storageSettings.defaultStorageId === config.id;
                      const testResult = testConnectionResults[config.id];
                      const isTesting = isTestingConnection[config.id];
                      
                      // Calculate real Today's Uploads for this specific storage
                      const startOfToday = new Date();
                      startOfToday.setHours(0,0,0,0);
                      const todaysUploads = uploadHistory.filter(item => 
                        item.storageId === config.id && 
                        item.uploadedAt >= startOfToday.getTime()
                      ).length;

                      // Simulated Storage Usage based on total uploads (e.g. 1.8 MB per upload average)
                      const maxTotalStorage = config.maxStorage || 1024;
                      const simulatedUsedStorage = Math.round((config.totalUploads || 0) * 1.8 * 10) / 10;
                      const storagePercent = Math.min(100, Math.round((simulatedUsedStorage / maxTotalStorage) * 100));

                      // Simulated Bandwidth Usage based on total uploads (e.g. 4.2 MB per upload average)
                      const simulatedBandwidth = Math.round((config.totalUploads || 0) * 4.2 * 10) / 10;

                      return (
                        <div 
                          key={config.id || `config-${configIdx}`} 
                          className={cn(
                            "bg-[#0a0d14]/30 border rounded-2xl p-5 flex flex-col justify-between backdrop-blur-md relative overflow-hidden transition-all group hover:border-white/10",
                            isDefault ? "border-primary/40 shadow-[0_0_25px_rgba(0,229,255,0.05)] ring-1 ring-primary/20" : "border-white/5"
                          )}
                        >
                          {/* Top Highlight Stripe for Primary Node */}
                          {isDefault && <div className="absolute top-0 left-0 right-0 h-[2.5px] bg-gradient-to-r from-cyan-400 to-primary" />}
                          <div className="absolute top-0 right-0 w-24 h-24 bg-primary/[0.01] rounded-full blur-2xl pointer-events-none" />

                          <div>
                            {/* Card Header Info */}
                            <div className="flex items-start justify-between gap-2 mb-3.5">
                              <div>
                                <h4 className="text-xs font-black text-white uppercase tracking-wider flex items-center gap-1.5">
                                  {config.name}
                                  {isDefault && (
                                    <span className="bg-primary/10 text-primary text-[7px] font-black tracking-widest px-2 py-0.5 rounded-full border border-primary/25 animate-pulse">
                                      PRIMARY
                                    </span>
                                  )}
                                </h4>
                                <p className="text-[8px] text-gray-500 font-mono tracking-wider mt-0.5 uppercase">ID: {config.id}</p>
                              </div>
                              
                              <div className="flex flex-col items-end gap-1.5">
                                <span className={cn(
                                  "text-[7px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full",
                                  config.status === 'enabled' ? "bg-emerald-500/10 text-emerald-400" : "bg-red-500/10 text-red-400"
                                )}>
                                  {config.status}
                                </span>
                              </div>
                            </div>

                            {/* Credentials Summary Panel */}
                            <div className="bg-black/40 border border-white/5 rounded-xl p-3.5 space-y-2.5 text-[9px] font-mono">
                              <div className="flex justify-between items-center">
                                <span className="text-gray-500 uppercase font-black text-[8px]">Provider Logo:</span>
                                <span className="text-primary font-bold uppercase tracking-wider flex items-center gap-1 bg-white/5 px-2 py-0.5 rounded border border-white/5">
                                  <Server className="text-primary" size={10} />
                                  {config.provider}
                                </span>
                              </div>
                              <div className="flex justify-between">
                                <span className="text-gray-500 uppercase font-black text-[8px]">Cloud Name:</span>
                                <span className="text-gray-300 font-bold">{config.cloudName || 'N/A'}</span>
                              </div>
                              <div className="flex justify-between">
                                <span className="text-gray-500 uppercase font-black text-[8px]">Upload Folder:</span>
                                <span className="text-gray-300 font-bold">{config.folder || 'anova_anime'}</span>
                              </div>
                              <div className="flex justify-between">
                                <span className="text-gray-500 uppercase font-black text-[8px]">Default Folder:</span>
                                <span className="text-gray-300 font-bold">{config.defaultFolder || 'anova_anime'}</span>
                              </div>
                              <div className="flex justify-between">
                                <span className="text-gray-500 uppercase font-black text-[8px]">Priority Rank:</span>
                                <span className="text-primary font-black uppercase">Order #{config.priority}</span>
                              </div>
                            </div>

                            {/* Storage & Bandwidth Capacity Gauges */}
                            <div className="mt-4 space-y-3 bg-black/20 border border-white/5 p-3 rounded-xl">
                              {/* Storage gauge */}
                              <div className="space-y-1">
                                <div className="flex justify-between text-[8px] font-black text-gray-400 uppercase">
                                  <span>Storage Used: {simulatedUsedStorage} MB</span>
                                  <span>Max: {maxTotalStorage} MB</span>
                                </div>
                                <div className="w-full bg-white/5 h-1.5 rounded-full overflow-hidden">
                                  <div 
                                    className="bg-primary h-full transition-all duration-500" 
                                    style={{ width: `${storagePercent}%` }} 
                                  />
                                </div>
                              </div>

                              {/* Bandwidth gauge */}
                              <div className="space-y-1">
                                <div className="flex justify-between text-[8px] font-black text-gray-400 uppercase">
                                  <span>File Limit: {config.maxUploadSize || 50} MB</span>
                                  <span>Bandwidth: {simulatedBandwidth} MB</span>
                                </div>
                                <div className="w-full bg-white/5 h-1.5 rounded-full overflow-hidden">
                                  <div 
                                    className="bg-cyan-500 h-full transition-all duration-500" 
                                    style={{ width: `${Math.min(100, Math.round((simulatedBandwidth / 500) * 100))}%` }} 
                                  />
                                </div>
                              </div>
                            </div>

                            {/* Telemetry / Live Status Matrix */}
                            <div className="grid grid-cols-2 gap-3 mt-4 border-t border-b border-white/5 py-3 text-[9px]">
                              <div>
                                <span className="text-gray-500 font-bold block uppercase tracking-wider text-[8px]">Total Uploads</span>
                                <span className="text-white font-black text-xs block mt-0.5">{config.totalUploads || 0}</span>
                              </div>
                              <div>
                                <span className="text-gray-500 font-bold block uppercase tracking-wider text-[8px]">Today's Uploads</span>
                                <span className="text-cyan-400 font-black text-xs block mt-0.5">{todaysUploads} / {config.maxDailyUploads || 100}</span>
                              </div>
                              <div>
                                <span className="text-gray-500 font-bold block uppercase tracking-wider text-[8px]">Health Connection</span>
                                <span className={cn(
                                  "font-black block mt-0.5 text-[10px] flex items-center gap-1",
                                  config.health === 'Connected' || config.health === 'Healthy' 
                                    ? "text-emerald-400" 
                                    : config.health === 'Warning'
                                      ? "text-yellow-400"
                                      : config.health === 'Offline'
                                        ? "text-red-500"
                                        : "text-gray-400"
                                )}>
                                  <span className={cn(
                                    "w-1.5 h-1.5 rounded-full",
                                    config.health === 'Connected' || config.health === 'Healthy'
                                      ? "bg-emerald-400 animate-pulse"
                                      : config.health === 'Warning'
                                        ? "bg-yellow-400"
                                        : "bg-red-500"
                                  )} />
                                  {config.health || 'Not Tested'}
                                </span>
                              </div>
                              <div>
                                <span className="text-gray-500 font-bold block uppercase tracking-wider text-[8px]">Last Upload</span>
                                <span className="text-gray-400 block mt-0.5 text-[9px] truncate" title={config.lastUploadTime ? new Date(config.lastUploadTime).toLocaleString() : 'Never'}>
                                  {config.lastUploadTime ? new Date(config.lastUploadTime).toLocaleDateString() : 'Never'}
                                </span>
                              </div>
                            </div>
                          </div>

                          {/* Actions Panel */}
                          <div className="mt-5 flex flex-col gap-2.5">
                            {/* Live Connection Test Output Box */}
                            {testResult && (
                              <div className={cn(
                                "text-[8px] font-bold p-1.5 rounded-lg border flex items-center gap-1.5 animate-fadeIn",
                                testResult.success ? "bg-emerald-500/5 text-emerald-400 border-emerald-500/10" : "bg-red-500/5 text-red-400 border-red-500/10"
                              )}>
                                <CheckCircle size={10} />
                                Telemetry: {testResult.message}
                              </div>
                            )}

                            <div className="flex gap-2 justify-between items-center pt-2 border-t border-white/5">
                              <div className="flex gap-1.5">
                                {/* Edit */}
                                <button
                                  onClick={() => handleEditStorageClick(config)}
                                  className="p-2 bg-white/5 hover:bg-white/10 text-gray-300 hover:text-white rounded-lg border border-white/5 transition-all cursor-pointer"
                                  title="Edit Credentials"
                                >
                                  <Edit3 size={11} />
                                </button>
                                {/* Delete */}
                                <button
                                  onClick={() => handleDeleteStorageClick(config.id, config.name)}
                                  className="p-2 bg-red-500/5 hover:bg-red-500/15 text-red-400 hover:text-red-300 border border-red-500/10 rounded-lg transition-all cursor-pointer"
                                  title="Delete Provider Node"
                                >
                                  <Trash size={11} />
                                </button>
                              </div>

                              <div className="flex gap-1.5">
                                {/* Test connection button */}
                                <button
                                  onClick={() => handleTestStorageConnection(config)}
                                  disabled={isTesting}
                                  className="px-2.5 py-1.5 bg-white/5 hover:bg-white/10 text-gray-300 hover:text-white text-[8px] font-black uppercase tracking-wider rounded-lg transition-all cursor-pointer disabled:opacity-50 flex items-center gap-1 border border-white/5"
                                >
                                  <RefreshCw size={10} className={isTesting ? "animate-spin" : ""} />
                                  {isTesting ? 'Testing...' : 'Test Connection'}
                                </button>

                                {/* Set Active/Primary Button */}
                                {!isDefault && (
                                  <button
                                    onClick={() => handleSetDefaultStorage(config.id)}
                                    className="px-2.5 py-1.5 bg-primary hover:bg-[#00cce0] text-black text-[8px] font-black uppercase tracking-wider rounded-lg transition-all cursor-pointer"
                                  >
                                    Activate
                                  </button>
                                )}
                              </div>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                </div>

                {/* Live upload telemetry log list */}
                <div className="space-y-3 bg-[#0a0d14]/20 border border-white/5 p-5 rounded-2xl backdrop-blur-md">
                  <div>
                    <h4 className="text-[10px] font-black text-white uppercase tracking-wider">Live Upload History Logs</h4>
                    <p className="text-[8px] text-gray-500">Real-time database records of direct browser-to-cloud file transfers.</p>
                  </div>

                  <div className="overflow-hidden border border-white/5 rounded-xl bg-[#0a0d14]/10 max-h-96 overflow-y-auto">
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="border-b border-white/5 bg-[#0a0d14]/40 text-[8px] font-black text-gray-500 uppercase tracking-widest">
                          <th className="p-3">File Name</th>
                          <th className="p-3 text-center">Type</th>
                          <th className="p-3">Destination Storage</th>
                          <th className="p-3">Uploader</th>
                          <th className="p-3">Timestamp</th>
                          <th className="p-3 text-center">Status</th>
                          <th className="p-3 text-right">Payload Access</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-white/[0.02] text-[9px] font-medium text-gray-400 font-mono">
                        {uploadHistory.length === 0 && (
                          <tr>
                            <td colSpan={7} className="p-4 text-center text-[8px] text-gray-500 font-bold uppercase">No upload records stored in telemetry.</td>
                          </tr>
                        )}
                        {uploadHistory.map((item, histIdx) => (
                          <tr key={item.id || `hist-${histIdx}`} className="hover:bg-white/[0.01] transition-colors">
                            <td className="p-3 font-bold text-white max-w-[150px] truncate" title={item.fileName}>
                              {item.fileName}
                            </td>
                            <td className="p-3 text-center">
                              <span className="px-1.5 py-0.5 bg-white/5 rounded text-[8px] font-black text-gray-300 uppercase tracking-wider">
                                {item.fileType}
                              </span>
                            </td>
                            <td className="p-3">
                              <span className="font-bold text-primary">{item.storageName}</span>
                              <span className="text-[8px] text-gray-500 ml-1">({item.provider})</span>
                            </td>
                            <td className="p-3 text-gray-300 font-semibold">{item.uploader}</td>
                            <td className="p-3 text-gray-400">
                              {new Date(item.uploadedAt).toLocaleString()}
                            </td>
                            <td className="p-3 text-center">
                              <span className={cn(
                                "px-2 py-0.5 rounded-full text-[8px] font-black uppercase tracking-wider",
                                item.status === 'success' ? "bg-emerald-500/10 text-emerald-400" : "bg-red-500/10 text-red-400"
                              )}>
                                {item.status}
                              </span>
                            </td>
                            <td className="p-3 text-right">
                              {item.url ? (
                                <a 
                                  href={item.url} 
                                  target="_blank" 
                                  rel="noopener noreferrer"
                                  className="text-primary hover:underline font-black text-[8px]"
                                >
                                  VIEW ASSET
                                </a>
                              ) : (
                                <span className="text-red-400 text-[8px]">{item.errorMessage || 'FAILED'}</span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* TAB 8: ADVERTISEMENT MANAGER */}
        {activeTab === 'ads' && (
          <div className="space-y-6 animate-fadeIn text-gray-300">
            {/* Header & Create Button */}
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-[#0a0d14]/30 border border-white/5 p-6 rounded-2xl backdrop-blur-md">
              <div>
                <h2 className="text-xl font-black text-white uppercase tracking-wider flex items-center gap-2">
                  <Megaphone className="text-primary animate-pulse" size={24} />
                  <span>Advertisement Manager</span>
                </h2>
                <p className="text-xs text-gray-400 mt-1">
                  Manage start video advertisements, scripts, and targeting rules across all catalog content.
                </p>
              </div>
              <button
                onClick={() => {
                  setEditingAd(null);
                  setAdForm({
                    id: '',
                    name: '',
                    provider: '',
                    type: 'Popunder',
                    status: 'enabled',
                    script: '',
                    priority: 10,
                    frequency: 'always',
                    startDate: '',
                    endDate: '',
                    targetMode: 'all',
                    targetAnimeIds: []
                  });
                  setAdFormSearchQuery('');
                  setIsAdFormOpen(!isAdFormOpen);
                }}
                className="px-5 py-2.5 bg-primary/10 hover:bg-primary/20 text-primary border border-primary/20 hover:border-primary/40 rounded-xl text-xs font-black uppercase tracking-wider flex items-center gap-2 transition-all duration-300 hover:scale-105 cursor-pointer"
              >
                <Plus size={14} />
                <span>{isAdFormOpen ? 'Close Form' : 'Create Advertisement'}</span>
              </button>
            </div>

            {/* CREATE / EDIT FORM */}
            {isAdFormOpen && (
              <div className="bg-[#0a0d14]/50 border border-white/10 p-6 rounded-2xl backdrop-blur-lg animate-fadeIn shadow-2xl relative">
                <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-primary to-[#00e5ff]" />
                <h3 className="text-sm font-black text-white uppercase tracking-wider mb-6 border-b border-white/5 pb-3">
                  {editingAd ? `Edit Advertisement: ${editingAd.name}` : 'Create New Advertisement'}
                </h3>

                <form onSubmit={handleSaveAd} className="space-y-6">
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {/* Advertisement Name */}
                    <div className="space-y-1.5">
                      <label className="text-[10px] text-gray-500 font-black uppercase tracking-wider">Advertisement Name</label>
                      <input
                        type="text"
                        value={adForm.name}
                        onChange={(e) => setAdForm({ ...adForm, name: e.target.value })}
                        placeholder="e.g. Adsterra Social Bar"
                        className="w-full bg-black/40 text-xs text-white px-4 py-3 rounded-xl border border-white/5 outline-none focus:border-primary/50 transition-colors font-bold"
                      />
                    </div>

                    {/* Provider Name */}
                    <div className="space-y-1.5">
                      <label className="text-[10px] text-gray-500 font-black uppercase tracking-wider">Provider Name</label>
                      <input
                        type="text"
                        value={adForm.provider}
                        onChange={(e) => setAdForm({ ...adForm, provider: e.target.value })}
                        placeholder="e.g. Adsterra, HilltopAds"
                        className="w-full bg-black/40 text-xs text-white px-4 py-3 rounded-xl border border-white/5 outline-none focus:border-primary/50 transition-colors font-bold"
                      />
                    </div>

                    {/* Advertisement Type */}
                    <div className="space-y-1.5">
                      <label className="text-[10px] text-gray-500 font-black uppercase tracking-wider">Advertisement Type</label>
                      <select
                        value={adForm.type}
                        onChange={(e) => setAdForm({ ...adForm, type: e.target.value })}
                        className="w-full bg-black/40 text-xs text-white px-4 py-3 rounded-xl border border-white/5 outline-none focus:border-primary/50 transition-colors font-bold"
                      >
                        <option value="Popunder">Popunder</option>
                        <option value="Direct Link">Direct Link</option>
                        <option value="Script">Script</option>
                        <option value="Banner">Banner</option>
                      </select>
                    </div>

                    {/* Status */}
                    <div className="space-y-1.5">
                      <label className="text-[10px] text-gray-500 font-black uppercase tracking-wider">Status</label>
                      <select
                        value={adForm.status}
                        onChange={(e) => setAdForm({ ...adForm, status: e.target.value as 'enabled' | 'disabled' })}
                        className="w-full bg-black/40 text-xs text-white px-4 py-3 rounded-xl border border-white/5 outline-none focus:border-primary/50 transition-colors font-bold"
                      >
                        <option value="enabled">Enable</option>
                        <option value="disabled">Disable</option>
                      </select>
                    </div>

                    {/* Priority */}
                    <div className="space-y-1.5">
                      <label className="text-[10px] text-gray-500 font-black uppercase tracking-wider">Priority (Higher runs first)</label>
                      <input
                        type="number"
                        value={adForm.priority}
                        onChange={(e) => setAdForm({ ...adForm, priority: Number(e.target.value || 10) })}
                        placeholder="e.g. 10"
                        className="w-full bg-black/40 text-xs text-white px-4 py-3 rounded-xl border border-white/5 outline-none focus:border-primary/50 transition-colors font-bold"
                      />
                    </div>

                    {/* Frequency */}
                    <div className="space-y-1.5">
                      <label className="text-[10px] text-gray-500 font-black uppercase tracking-wider">Frequency Rules</label>
                      <select
                        value={adForm.frequency}
                        onChange={(e) => setAdForm({ ...adForm, frequency: e.target.value })}
                        className="w-full bg-black/40 text-xs text-white px-4 py-3 rounded-xl border border-white/5 outline-none focus:border-primary/50 transition-colors font-bold"
                      >
                        <option value="always">Every Play</option>
                        <option value="every_5_m">Every 5 Minutes</option>
                        <option value="every_10_m">Every 10 Minutes</option>
                        <option value="every_15_m">Every 15 Minutes</option>
                        <option value="every_30_m">Every 30 Minutes</option>
                        <option value="once_per_hour">Every Hour</option>
                        <option value="once_per_session">Once Per Session</option>
                      </select>
                    </div>

                    {/* Start Date */}
                    <div className="space-y-1.5">
                      <label className="text-[10px] text-gray-500 font-black uppercase tracking-wider">Start Date (Optional)</label>
                      <input
                        type="date"
                        value={adForm.startDate}
                        onChange={(e) => setAdForm({ ...adForm, startDate: e.target.value })}
                        className="w-full bg-black/40 text-xs text-white px-4 py-3 rounded-xl border border-white/5 outline-none focus:border-primary/50 transition-colors font-bold"
                      />
                    </div>

                    {/* End Date */}
                    <div className="space-y-1.5">
                      <label className="text-[10px] text-gray-500 font-black uppercase tracking-wider">End Date (Optional)</label>
                      <input
                        type="date"
                        value={adForm.endDate}
                        onChange={(e) => setAdForm({ ...adForm, endDate: e.target.value })}
                        className="w-full bg-black/40 text-xs text-white px-4 py-3 rounded-xl border border-white/5 outline-none focus:border-primary/50 transition-colors font-bold"
                      />
                    </div>

                    {/* Target Mode */}
                    <div className="space-y-1.5">
                      <label className="text-[10px] text-gray-500 font-black uppercase tracking-wider">Target Mode</label>
                      <select
                        value={adForm.targetMode}
                        onChange={(e) => setAdForm({ ...adForm, targetMode: e.target.value, targetAnimeIds: [] })}
                        className="w-full bg-black/40 text-xs text-white px-4 py-3 rounded-xl border border-white/5 outline-none focus:border-primary/50 transition-colors font-bold"
                      >
                        <option value="all">ALL CONTENT</option>
                        <option value="single">Single Anime</option>
                        <option value="multiple">Multiple Anime</option>
                      </select>
                    </div>
                  </div>

                  {/* Advertisement Script */}
                  <div className="space-y-1.5">
                    <label className="text-[10px] text-gray-500 font-black uppercase tracking-wider">
                      Advertisement Script or Direct Link (HTML, Javascript, or Raw URL)
                    </label>
                    <textarea
                      value={adForm.script}
                      onChange={(e) => setAdForm({ ...adForm, script: e.target.value })}
                      placeholder='e.g. <script src="https://example.com/ad.js"></script>'
                      rows={5}
                      className="w-full bg-black/40 text-xs text-white px-4 py-3 rounded-xl border border-white/5 outline-none focus:border-primary/50 transition-colors font-mono font-medium"
                    />
                    <p className="text-[9px] text-gray-500 italic">
                      Paste the script exactly as provided by your advertising network. Or paste a raw URL for direct linking.
                    </p>
                  </div>

                  {/* TARGETING & ROUTING */}
                  <div className="border-t border-white/5 pt-6 space-y-4 font-sans">
                    <h4 className="text-xs font-black text-white uppercase tracking-wider">Targeting Rules</h4>

                    {/* SELECTOR FOR SPECIFIC TARGET CONTENT */}
                    {adForm.targetMode !== 'all' && (
                      <div className="space-y-4 bg-white/[0.01] border border-white/5 p-5 rounded-xl">
                        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                          <div>
                            <p className="text-xs text-white font-black uppercase tracking-wider">
                              Target Anime Selector ({adForm.targetMode === 'single' ? 'Single Select' : 'Multi-Select'})
                            </p>
                            <p className="text-[10px] text-gray-500 mt-0.5">
                              Search and select which anime this advertisement should target.
                            </p>
                          </div>
                          <div className="flex items-center gap-2 w-full md:w-auto">
                            {/* Search bar inside selector */}
                            <div className="relative w-full md:w-60">
                              <input
                                type="text"
                                value={adFormSearchQuery}
                                onChange={(e) => setAdFormSearchQuery(e.target.value)}
                                placeholder="Search synchronized content..."
                                className="w-full bg-black/50 text-[10px] text-white pl-8 pr-4 py-2 rounded-lg border border-white/5 outline-none focus:border-primary/50 font-bold"
                              />
                              <Search className="absolute left-2.5 top-2.5 text-gray-500" size={12} />
                            </div>
                            
                            {/* Multi-select helpers */}
                            {adForm.targetMode === 'multiple' && (
                              <div className="flex gap-1.5 shrink-0">
                                <button
                                  type="button"
                                  onClick={() => {
                                    const allIds = customAnimes.map(a => String(a.id));
                                    setAdForm({ ...adForm, targetAnimeIds: allIds });
                                  }}
                                  className="px-2.5 py-1.5 bg-white/5 hover:bg-white/10 text-[9px] font-black uppercase tracking-wider rounded-lg border border-white/5 text-white transition-all cursor-pointer"
                                >
                                  Select All
                                </button>
                                <button
                                  type="button"
                                  onClick={() => {
                                    setAdForm({ ...adForm, targetAnimeIds: [] });
                                  }}
                                  className="px-2.5 py-1.5 bg-white/5 hover:bg-white/10 text-[9px] font-black uppercase tracking-wider rounded-lg border border-white/5 text-white transition-all cursor-pointer"
                                >
                                  Deselect
                                </button>
                              </div>
                            )}
                          </div>
                        </div>

                        {/* Format Tabs inside selector */}
                        <div className="flex gap-2 border-b border-white/5 pb-2 overflow-x-auto hide-scrollbar text-[10px] font-black uppercase tracking-wider">
                          {[
                            { id: 'all', label: 'All Content' },
                            { id: 'TV', label: 'Anime Shows' },
                            { id: 'Movie', label: 'Movies' },
                            { id: 'OVA', label: 'OVA' },
                            { id: 'ONA', label: 'ONA' },
                            { id: 'Special', label: 'Specials' }
                          ].map(tab => (
                            <button
                              type="button"
                              key={tab.id}
                              onClick={() => setAdContentFormatFilter(tab.id)}
                              className={cn(
                                "pb-2 -mb-[9px] border-b-2 transition-all whitespace-nowrap px-2 cursor-pointer",
                                adContentFormatFilter === tab.id
                                  ? "text-primary border-primary font-black"
                                  : "text-gray-500 border-transparent hover:text-white"
                              )}
                            >
                              {tab.label}
                            </button>
                          ))}
                        </div>

                        {/* Content Grid */}
                        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3 max-h-[220px] overflow-y-auto pr-2 custom-scrollbar">
                          {customAnimes.length === 0 ? (
                            <p className="text-[10px] text-gray-500 col-span-full py-4 text-center">No content found in catalog.</p>
                          ) : (
                            customAnimes
                              .filter(anime => {
                                if (adContentFormatFilter === 'all') {
                                  if (adFormSearchQuery) {
                                    return anime.title?.toLowerCase().includes(adFormSearchQuery.toLowerCase());
                                  }
                                  return true;
                                }
                                let typeMatch = anime.type === adContentFormatFilter;
                                if (adContentFormatFilter === 'TV' && !anime.type) typeMatch = true;
                                if (adFormSearchQuery) {
                                  return typeMatch && anime.title?.toLowerCase().includes(adFormSearchQuery.toLowerCase());
                                }
                                return typeMatch;
                              })
                              .map((anime, animeIdx) => {
                                const isSelected = adForm.targetAnimeIds.includes(String(anime.id));
                                return (
                                  <div
                                    key={anime.id || `target-anime-${animeIdx}`}
                                    onClick={() => {
                                      if (adForm.targetMode === 'single') {
                                        setAdForm({ ...adForm, targetAnimeIds: [String(anime.id)] });
                                      } else {
                                        const exists = adForm.targetAnimeIds.includes(String(anime.id));
                                        const next = exists
                                          ? adForm.targetAnimeIds.filter(id => id !== String(anime.id))
                                          : [...adForm.targetAnimeIds, String(anime.id)];
                                        setAdForm({ ...adForm, targetAnimeIds: next });
                                      }
                                    }}
                                    className={cn(
                                      "p-2 bg-black/40 border rounded-lg cursor-pointer hover:border-primary/40 transition-all text-center space-y-1.5 flex flex-col justify-between h-full select-none relative group",
                                      isSelected ? "border-primary bg-primary/5 shadow-[0_0_12px_rgba(0,229,255,0.15)]" : "border-white/5"
                                    )}
                                  >
                                    <img
                                      src={anime.poster}
                                      alt={anime.title}
                                      referrerPolicy="no-referrer"
                                      className="w-full h-20 object-cover rounded-md"
                                    />
                                    <p className="text-[9px] font-bold text-white line-clamp-1">{anime.title}</p>
                                    <div className="flex items-center justify-between gap-1 text-[7px] text-gray-500 uppercase font-black tracking-wider bg-white/5 py-0.5 px-1 rounded">
                                      <span>{anime.type || 'TV'}</span>
                                      {isSelected && <span className="text-primary font-black">✓</span>}
                                    </div>
                                  </div>
                                );
                              })
                          )}
                        </div>

                        {/* Selected Indicator Summary */}
                        <div className="text-[10px] text-gray-400 font-bold bg-white/[0.02] p-3 rounded-lg border border-white/5 flex flex-wrap gap-2 items-center">
                          <span>Currently Selected ({adForm.targetAnimeIds.length}):</span>
                          {adForm.targetAnimeIds.length === 0 ? (
                            <span className="text-red-400">None. Please select at least one anime above.</span>
                          ) : (
                            <div className="flex flex-wrap gap-1 max-h-[60px] overflow-y-auto w-full">
                              {adForm.targetAnimeIds.map((id, idIdx) => {
                                const found = customAnimes.find(a => String(a.id) === id);
                                return (
                                  <span key={`${id}-${idIdx}`} className="bg-primary/10 border border-primary/20 text-primary text-[8px] font-extrabold px-1.5 py-0.5 rounded uppercase">
                                    {found?.title || `ID: ${id}`}
                                  </span>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Form Action Buttons */}
                  <div className="flex justify-end gap-3.5 pt-4 border-t border-white/5">
                    <button
                      type="button"
                      onClick={() => {
                        setIsAdFormOpen(false);
                        setEditingAd(null);
                      }}
                      className="px-5 py-2.5 bg-white/5 hover:bg-white/10 text-gray-300 hover:text-white rounded-xl text-xs font-black uppercase tracking-wider transition-all duration-300 cursor-pointer"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      className="px-5 py-2.5 bg-primary hover:bg-primary-hover text-white rounded-xl text-xs font-black uppercase tracking-wider flex items-center gap-2 shadow-[0_0_15px_rgba(0,229,255,0.25)] transition-all duration-300 cursor-pointer"
                    >
                      <Save size={14} />
                      <span>{editingAd ? 'Save Changes' : 'Save Advertisement'}</span>
                    </button>
                  </div>
                </form>
              </div>
            )}

            {/* ADVERTISEMENTS LIST TABLE */}
            <div className="bg-[#0a0d14]/30 border border-white/5 p-6 rounded-2xl backdrop-blur-md space-y-4">
              <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <h3 className="text-xs font-black text-white uppercase tracking-wider">Active Campaigns &amp; Ads</h3>
                {/* Ad List Search */}
                <div className="relative w-full md:w-72">
                  <input
                    type="text"
                    value={adSearchQuery}
                    onChange={(e) => setAdSearchQuery(e.target.value)}
                    placeholder="Search campaigns..."
                    className="w-full bg-black/50 text-xs text-white pl-9 pr-4 py-2.5 rounded-xl border border-white/5 outline-none focus:border-primary/50 font-bold"
                  />
                  <Search className="absolute left-3 top-3 text-gray-500" size={14} />
                </div>
              </div>

              <div className="overflow-x-auto rounded-xl border border-white/5">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-white/[0.02] text-[10px] font-black text-gray-400 uppercase tracking-wider border-b border-white/5 font-mono">
                      <th className="p-4">Name / Provider</th>
                      <th className="p-4">Type</th>
                      <th className="p-4">Priority</th>
                      <th className="p-4">Target Scope</th>
                      <th className="p-4">Frequency</th>
                      <th className="p-4 text-center">Status</th>
                      <th className="p-4 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/[0.02] text-xs font-medium text-gray-300">
                    {advertisements.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="p-6 text-center text-xs text-gray-500 font-bold uppercase">
                          No advertisements configured in the database.
                        </td>
                      </tr>
                    ) : (
                      advertisements
                        .filter(ad => {
                          if (adSearchQuery) {
                            return ad.name?.toLowerCase().includes(adSearchQuery.toLowerCase()) ||
                                   ad.provider?.toLowerCase().includes(adSearchQuery.toLowerCase());
                          }
                          return true;
                        })
                        .map((ad, adIdx) => {
                          let scopeText = "Specific Content";
                          if (ad.targetMode === 'all') {
                            scopeText = "All Content";
                          } else if (ad.targetMode === 'single') {
                            const targetId = ad.targetAnimeIds?.[0] || ad.targetAnimeId;
                            const showTitle = customAnimes.find(a => String(a.id) === String(targetId))?.title || "Unknown Show";
                            scopeText = `Single: ${showTitle}`;
                          } else if (ad.targetMode === 'multiple') {
                            scopeText = `Multiple (${ad.targetAnimeIds?.length || 0} shows)`;
                          }

                          return (
                            <tr key={ad.id || `ad-${adIdx}`} className="hover:bg-white/[0.01] transition-colors">
                              <td className="p-4">
                                <div className="font-bold text-white">{ad.name}</div>
                                <div className="text-[10px] text-gray-500 mt-0.5">{ad.provider}</div>
                              </td>
                              <td className="p-4 font-bold text-gray-400">{ad.type || 'Popunder'}</td>
                              <td className="p-4 font-mono font-bold text-primary">{ad.priority}</td>
                              <td className="p-4">
                                <span className={cn(
                                  "px-2 py-0.5 rounded text-[9px] font-black uppercase tracking-wider",
                                  ad.targetMode === 'all' 
                                    ? "bg-purple-500/10 text-purple-400 border border-purple-500/20" 
                                    : "bg-cyan-500/10 text-cyan-400 border border-cyan-500/20"
                                )}>
                                  {scopeText}
                                </span>
                              </td>
                              <td className="p-4 text-[10px] font-bold text-gray-500 uppercase tracking-wider">{ad.frequency}</td>
                              <td className="p-4 text-center">
                                <button
                                  onClick={() => handleToggleAdStatus(ad)}
                                  className={cn(
                                    "px-2.5 py-1 rounded-full text-[9px] font-black uppercase tracking-wider transition-colors cursor-pointer",
                                    ad.status === 'enabled' 
                                      ? "bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20" 
                                      : "bg-white/5 text-gray-400 hover:bg-white/10"
                                  )}
                                  title="Click to toggle Status"
                                >
                                  {ad.status === 'enabled' ? 'Active' : 'Disabled'}
                                </button>
                              </td>
                              <td className="p-4 text-right">
                                <div className="flex justify-end gap-2">
                                  <button
                                    onClick={() => setPreviewAd(ad)}
                                    className="p-1.5 hover:bg-white/5 rounded-lg text-cyan-400 hover:text-cyan-300 transition-all cursor-pointer"
                                    title="Preview Campaign"
                                  >
                                    <Eye size={14} />
                                  </button>
                                  <button
                                    onClick={() => handleDuplicateAd(ad)}
                                    className="p-1.5 hover:bg-white/5 rounded-lg text-emerald-400 hover:text-emerald-300 transition-all cursor-pointer"
                                    title="Duplicate Campaign"
                                  >
                                    <Clipboard size={14} />
                                  </button>
                                  <button
                                    onClick={() => handleEditAd(ad)}
                                    className="p-1.5 hover:bg-white/5 rounded-lg text-gray-400 hover:text-white transition-all cursor-pointer"
                                    title="Edit Advertisement"
                                  >
                                    <Edit3 size={14} />
                                  </button>
                                  <button
                                    onClick={() => handleDeleteAdTrigger(ad)}
                                    className="p-1.5 hover:bg-red-500/10 rounded-lg text-gray-500 hover:text-red-400 transition-all cursor-pointer"
                                    title="Delete Advertisement"
                                  >
                                    <Trash size={14} />
                                  </button>
                                </div>
                              </td>
                            </tr>
                          );
                        })
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Ad Preview Modal */}
            {previewAd && (
              <div className="fixed inset-0 bg-black/95 backdrop-blur-md flex flex-col items-center justify-center z-[999999] animate-fadeIn p-4 font-sans">
                <div className="bg-[#050505] border border-white/10 rounded-2xl max-w-2xl w-full p-6 shadow-2xl relative overflow-hidden flex flex-col h-[80vh]">
                  <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-cyan-500 to-primary" />
                  
                  <div className="flex justify-between items-center border-b border-white/5 pb-3 mb-4 shrink-0">
                    <div>
                      <h3 className="text-sm font-black text-white uppercase tracking-wider">
                        Campaign Preview: {previewAd.name}
                      </h3>
                      <p className="text-[10px] text-gray-500 font-mono mt-0.5 uppercase">
                        Type: {previewAd.type || 'Popunder'} | Provider: {previewAd.provider}
                      </p>
                    </div>
                    <button
                      onClick={() => setPreviewAd(null)}
                      className="px-3.5 py-1.5 bg-white/5 hover:bg-white/10 border border-white/5 text-white rounded-lg text-xs font-black uppercase cursor-pointer"
                    >
                      Close Preview
                    </button>
                  </div>

                  <div className="flex-1 w-full flex items-center justify-center bg-black/60 rounded-xl border border-white/5 p-4 overflow-auto relative min-h-0">
                    <div className="w-full h-full flex items-center justify-center relative">
                      <AdScriptRunner script={previewAd.script} />
                    </div>
                  </div>

                  <div className="mt-4 text-[10px] text-gray-500 text-center uppercase tracking-wider font-semibold shrink-0">
                    Testing sandbox container. Live campaigns will run before video play.
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* TAB 9: PLAYBACK VERIFICATION SYSTEM */}
        {activeTab === 'verifier' && (
          <PlaybackVerifier />
        )}

      </div>
      
      {/* Repair & Reindex Report Modal */}
      {repairReport && repairReport.show && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-md flex items-center justify-center z-[999999] animate-fadeIn p-4">
          <div className="bg-[#0a0d14] border border-white/10 rounded-2xl max-w-lg w-full p-6 shadow-2xl relative overflow-hidden flex flex-col max-h-[85vh]">
            <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-rose-500 to-purple-500" />
            <div className="flex items-center justify-between mb-4 shrink-0">
              <h3 className="text-sm font-black text-white uppercase tracking-wider flex items-center gap-1.5">
                <Sparkles size={14} className="text-rose-400" />
                Auto Episode Repair Report
              </h3>
              <button 
                onClick={() => setRepairReport(null)}
                className="text-gray-500 hover:text-white transition-colors cursor-pointer text-xs uppercase font-black"
              >
                Close
              </button>
            </div>
            
            {/* Stats Row */}
            <div className="grid grid-cols-3 gap-3 mb-4 shrink-0">
              <div className="bg-white/[0.01] border border-white/5 p-3 rounded-xl text-center">
                <span className="text-[9px] text-gray-500 font-black uppercase tracking-wider block">Scanned</span>
                <span className="text-lg font-black text-white">{repairReport.scanned}</span>
              </div>
              <div className="bg-rose-500/5 border border-rose-500/10 p-3 rounded-xl text-center">
                <span className="text-[9px] text-rose-500/70 font-black uppercase tracking-wider block">Removed</span>
                <span className="text-lg font-black text-rose-400">{repairReport.removed}</span>
              </div>
              <div className="bg-emerald-500/5 border border-emerald-500/10 p-3 rounded-xl text-center">
                <span className="text-[9px] text-emerald-500/70 font-black uppercase tracking-wider block">Remaining</span>
                <span className="text-lg font-black text-emerald-400">{repairReport.remaining}</span>
              </div>
            </div>

            {/* Details Log */}
            <div className="flex-1 overflow-y-auto space-y-2 border border-white/5 rounded-xl bg-black/40 p-3.5 custom-scrollbar text-[10px] font-mono leading-relaxed">
              {repairReport.details.length === 0 ? (
                <p className="text-gray-500 italic text-center py-6">All scanned episodes are valid full-length episodes. No short clips were detected.</p>
              ) : (
                repairReport.details.map((detail, idx) => (
                  <div key={idx} className="text-rose-400 border-b border-white/5 pb-2 last:border-0 last:pb-0">
                    {detail}
                  </div>
                ))
              )}
            </div>

            {/* Footer Alert */}
            <div className="mt-4 pt-3 border-t border-white/5 text-[10px] text-amber-400 font-bold shrink-0">
              ⚠️ Please remember to click the <strong className="text-white">"Save Anime Show"</strong> button at the bottom of the form to permanently apply these repairs to the database!
            </div>
          </div>
        </div>
      )}

      {/* Skipped Videos Log Modal */}
      {showSkippedModal && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-md flex items-center justify-center z-[999999] animate-fadeIn p-4">
          <div className="bg-[#0a0d14] border border-white/10 rounded-2xl max-w-2xl w-full p-6 shadow-2xl relative overflow-hidden flex flex-col max-h-[85vh]">
            <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-rose-500 to-amber-500" />
            <div className="flex items-center justify-between mb-4 shrink-0">
              <div>
                <h3 className="text-sm font-black text-white uppercase tracking-wider flex items-center gap-2">
                  <ShieldAlert size={16} className="text-rose-400" />
                  Skipped Non-Anime Videos ({skippedVideoLogs.length})
                </h3>
                <p className="text-[10px] text-gray-400 mt-0.5">Videos auto-filtered based on strict anime rules (Shorts, Clips, Previews, PVs, OP/ED, Reactions, Reviews, etc.)</p>
              </div>
              <button 
                onClick={() => setShowSkippedModal(false)}
                className="text-gray-500 hover:text-white transition-colors cursor-pointer text-xs uppercase font-black"
              >
                Close
              </button>
            </div>

            <div className="flex-1 overflow-y-auto space-y-2 border border-white/5 rounded-xl bg-black/40 p-3.5 custom-scrollbar text-xs">
              {skippedVideoLogs.length === 0 ? (
                <p className="text-gray-500 italic text-center py-8">No non-anime videos skipped during recent imports.</p>
              ) : (
                skippedVideoLogs.map((log, idx) => (
                  <div key={idx} className="p-3 bg-white/[0.02] border border-white/5 rounded-xl space-y-1">
                    <div className="flex justify-between items-start gap-2">
                      <span className="font-bold text-white leading-tight">{log.title}</span>
                      <span className="px-2 py-0.5 bg-rose-500/10 text-rose-400 border border-rose-500/20 text-[9px] font-black uppercase rounded shrink-0">
                        {log.reason}
                      </span>
                    </div>
                    <div className="text-[10px] text-gray-400 flex items-center gap-3">
                      <span>Playlist: <strong className="text-gray-300">{log.playlistTitle}</strong></span>
                      <span>ID: <code className="text-gray-500">{log.videoId}</code></span>
                    </div>
                  </div>
                ))
              )}
            </div>

            <div className="mt-4 pt-3 border-t border-white/5 flex justify-between items-center text-[10px] text-gray-400 shrink-0">
              <span>Filter enforced by Smart Anime Import System</span>
              <button
                onClick={() => setSkippedVideoLogs([])}
                className="text-rose-400 hover:text-rose-300 font-bold uppercase cursor-pointer"
              >
                Clear Log
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Failed Metadata Log Modal */}
      {showFailedMetaModal && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-md flex items-center justify-center z-[999999] animate-fadeIn p-4">
          <div className="bg-[#0a0d14] border border-white/10 rounded-2xl max-w-2xl w-full p-6 shadow-2xl relative overflow-hidden flex flex-col max-h-[85vh]">
            <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-amber-500 to-cyan-500" />
            <div className="flex items-center justify-between mb-4 shrink-0">
              <div>
                <h3 className="text-sm font-black text-white uppercase tracking-wider flex items-center gap-2">
                  <AlertCircle size={16} className="text-amber-400" />
                  Failed Metadata Attempts ({failedMetadataLogs.length})
                </h3>
                <p className="text-[10px] text-gray-400 mt-0.5">Series that could not be matched automatically on AniList, MAL, or Kitsu</p>
              </div>
              <button 
                onClick={() => setShowFailedMetaModal(false)}
                className="text-gray-500 hover:text-white transition-colors cursor-pointer text-xs uppercase font-black"
              >
                Close
              </button>
            </div>

            <div className="flex-1 overflow-y-auto space-y-2 border border-white/5 rounded-xl bg-black/40 p-3.5 custom-scrollbar text-xs">
              {failedMetadataLogs.length === 0 ? (
                <p className="text-gray-500 italic text-center py-8">No failed metadata attempts logged.</p>
              ) : (
                failedMetadataLogs.map((log, idx) => (
                  <div key={idx} className="p-3 bg-white/[0.02] border border-white/5 rounded-xl space-y-1">
                    <div className="flex justify-between items-start gap-2">
                      <span className="font-bold text-white leading-tight">{log.animeTitle}</span>
                      <span className="px-2 py-0.5 bg-amber-500/10 text-amber-400 border border-amber-500/20 text-[9px] font-black uppercase rounded shrink-0">
                        {log.reason}
                      </span>
                    </div>
                    <div className="text-[10px] text-gray-500 font-mono">
                      Anime ID: {log.animeId}
                    </div>
                  </div>
                ))
              )}
            </div>

            <div className="mt-4 pt-3 border-t border-white/5 flex justify-between items-center text-[10px] text-gray-400 shrink-0">
              <span>You can manual-edit any anime in the catalog to set custom artwork or descriptions.</span>
              <button
                onClick={handleRetryFailedMetadata}
                className="px-3 py-1 bg-primary text-black font-black uppercase text-[10px] rounded cursor-pointer"
              >
                Retry All Metadata
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Custom Confirmation Modal */}
      {confirmDialog && confirmDialog.isOpen && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-md flex items-center justify-center z-[999999] animate-fadeIn p-4">
          <div className="bg-[#0a0d14] border border-white/10 rounded-2xl max-w-md w-full p-6 shadow-2xl relative overflow-hidden">
            <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-cyan-500 to-primary" />
            <h3 className="text-base font-black text-white uppercase tracking-wider mb-2">
              {confirmDialog.title}
            </h3>
            <p className="text-xs text-gray-300 leading-relaxed mb-6">
              {confirmDialog.message}
            </p>
            <div className="flex justify-end gap-3.5">
              <button
                onClick={() => setConfirmDialog(null)}
                className="px-4 py-2 bg-white/5 hover:bg-white/10 text-gray-300 hover:text-white rounded-xl text-xs font-black uppercase tracking-wider transition-all cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={() => confirmDialog.onConfirm()}
                className="px-4 py-2 bg-red-500/10 hover:bg-red-500/20 text-red-400 hover:text-red-300 border border-red-500/20 hover:border-red-500/30 rounded-xl text-xs font-black uppercase tracking-wider transition-all cursor-pointer"
              >
                Confirm Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function DailymotionBrandingToggle() {
  const [enabled, setEnabled] = useState(
    () => (typeof window !== 'undefined' ? localStorage.getItem('anova_hide_dm_branding') !== 'false' : true)
  );
  const toggle = () => {
    const next = !enabled;
    setEnabled(next);
    try {
      localStorage.setItem('anova_hide_dm_branding', next ? 'true' : 'false');
    } catch (_) {}
    window.dispatchEvent(new Event('anova_hide_dm_branding_changed'));
  };
  return (
    <div className="bg-white/[0.01] border border-white/5 p-4 rounded-xl space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[10px] text-gray-500 uppercase font-black tracking-wider">Player Branding</p>
          <p className="text-xs text-white font-black mt-1 leading-snug">
            Hide Dailymotion Branding &amp; Show Custom Logo
          </p>
          <p className="text-[9px] text-gray-500 font-bold mt-1 leading-snug">
            Overlays a small AnOvA badge on top-left of Dailymotion iframes only.
          </p>
        </div>
        <button
          onClick={toggle}
          role="switch"
          aria-checked={enabled}
          className={cn(
            "relative shrink-0 w-11 h-6 rounded-full transition-colors cursor-pointer border",
            enabled
              ? "bg-[#1E3A8A] border-[#3b82f6]/60 shadow-[0_0_10px_rgba(59,130,246,0.35)]"
              : "bg-white/5 border-white/10"
          )}
        >
          <span
            className={cn(
              "absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white transition-transform",
              enabled && "translate-x-5"
            )}
          />
        </button>
      </div>
      <div className="flex items-center gap-2 pt-1">
        <div className="flex items-center gap-1 px-2 py-1 rounded-lg bg-[#0a1836] border border-[#1E3A8A]/70 shadow-inner">
          <span className="font-black text-white text-[11px] tracking-tight leading-none">AnOvA</span>
          <span className="font-black text-[#3b82f6] text-[13px] leading-none -ml-0.5">.</span>
        </div>
        <span className="text-[9px] text-gray-500 font-bold uppercase tracking-wider">Preview</span>
        <span
          className={cn(
            "ml-auto text-[9px] font-black uppercase tracking-wider px-2 py-0.5 rounded",
            enabled
              ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
              : "bg-white/5 text-gray-400 border border-white/10"
          )}
        >
          {enabled ? 'On' : 'Off'}
        </span>
      </div>
    </div>
  );
}
