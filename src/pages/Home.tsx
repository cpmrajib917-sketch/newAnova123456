// @ts-nocheck
import React, { useEffect, useState, useRef, useCallback } from 'react';
import { Anime } from '../types';
import { HeroBanner } from '../components/HeroBanner';
import { EstimatedSchedule } from '../components/EstimatedSchedule';
import { Top10Ranked } from '../components/Top10Ranked';
import { AnimeCard } from '../components/AnimeCard';
import { api, apiCache, fallbackAnimes, brokenAnimesSet } from '../lib/api';
import { useAppStore } from '../store';
import { Play, RotateCcw, ChevronLeft, ChevronRight, Sparkles, Flame, Eye, Film, Grid, ArrowRight, Search as SearchIcon, X } from 'lucide-react';
import { Link } from 'react-router-dom';
import { HeroBannerSkeleton, Top10RankedSkeleton } from '../components/Skeletons';

const mapAnime = (a: any) => ({
  ...a,
  id: String(a.id),
  poster: a.images?.poster || a.poster,
  banner: a.images?.banner || a.banner || a.images?.poster || a.poster,
  title: a.titles?.english || a.titles?.romaji || a.title
});

const isBrokenAnime = (anime: any) => {
  if (!anime) return true;
  const idStr = String(anime.id || '');
  if (idStr === 'yt-pl-PLxSscENEp7JgVHy1m2-yD5jbgOGDyqSLc' || idStr.includes('PLxSscENEp7JgVHy1m2-yD5jbgOGDyqSLc') || brokenAnimesSet.has(idStr)) {
    return true;
  }
  if (!anime.title || anime.title === 'Unknown Title' || !anime.poster) {
    return true;
  }
  return false;
};

// Configure standard 4Animo categories
const CATEGORIES_CONFIG = [
  { id: 'trending', title: '🔥 Trending Anime', link: '/search?sort=popularity', fetch: () => api.search('', 1, { sort: 'popularity' }) },
  { id: 'latest', title: '🆕 Latest Episodes', link: '/search?sort=latest', fetch: () => api.updated() },
  { id: 'popular', title: '⭐ Popular Anime', link: '/search?sort=popularity', fetch: () => api.popular() },
  { id: 'ongoing', title: '📺 Ongoing Anime', link: '/search?status=RELEASING', fetch: () => api.search('', 1, { status: 'RELEASING' }) },
  { id: 'completed', title: '✅ Completed Anime', link: '/search?status=FINISHED', fetch: () => api.search('', 1, { status: 'FINISHED' }) },
  { id: 'movies', title: '🎬 Movies', link: '/search?type=MOVIE', fetch: () => api.search('', 1, { type: 'MOVIE' }) },
  { id: 'romance', title: '🌸 Romance', link: '/search?genre=Romance', fetch: () => api.category('romance') },
  { id: 'action', title: '⚔ Action', link: '/search?genre=Action', fetch: () => api.category('action') },
  { id: 'comedy', title: '😂 Comedy', link: '/search?genre=Comedy', fetch: () => api.category('comedy') },
  { id: 'horror', title: '👻 Horror', link: '/search?genre=Horror', fetch: () => api.category('horror') },
  { id: 'fantasy', title: '✨ Fantasy', link: '/search?genre=Fantasy', fetch: () => api.category('fantasy') },
  { id: 'scifi', title: '🚀 Sci-Fi', link: '/search?genre=Sci-Fi', fetch: () => api.category('scifi') },
  { id: 'school', title: '🏫 School', link: '/search?genre=School', fetch: () => api.category('school') },
  { id: 'isekai', title: '🌎 Isekai', link: '/search?genre=Isekai', fetch: () => api.category('isekai') },
  { id: 'shounen', title: '👊 Shounen', link: '/search?genre=Shounen', fetch: () => api.category('shounen') },
  { id: 'sliceoflife', title: '💖 Slice of Life', link: '/search?genre=Slice%20of%20Life', fetch: () => api.category('sliceoflife') },
  { id: 'drama', title: '🎭 Drama', link: '/search?genre=Drama', fetch: () => api.category('drama') },
  { id: 'mystery', title: '🕵 Mystery', link: '/search?genre=Mystery', fetch: () => api.category('mystery') },
  { id: 'music', title: '🎵 Music', link: '/search?genre=Music', fetch: () => api.category('music') },
  { id: 'kids', title: '👦 Kids', link: '/search?genre=Kids', fetch: () => api.category('kids') },
];

const STANDARD_SECTION_METADATA: Record<string, { title: string; link: string }> = {
  featured: { title: '⭐ Featured Anime', link: '/search?sort=popularity' },
  trending: { title: '🔥 Trending Anime', link: '/search?sort=popularity' },
  popular: { title: '⭐ Popular Anime', link: '/search?sort=popularity' },
  topAiring: { title: '📺 Top Airing Anime', link: '/search?status=RELEASING' },
  recentlyAdded: { title: '🆕 Recently Added', link: '/search?sort=latest' },
  latest: { title: '🆕 Latest Episodes', link: '/search?sort=latest' },
  favorite: { title: '💖 Most Favorite', link: '/search?sort=popularity' },
  completed: { title: '✅ Completed Anime', link: '/search?status=FINISHED' },
  upcoming: { title: '📅 Upcoming Anime', link: '/search?status=NOT_YET_RELEASED' },
  'hindi-dubbed': { title: '🎙️ Hindi Dubbed', link: '/search?q=hindi' },
};

export function LazyCategorySection({ id, title, link, fetchFn, initialData, alreadyShownIds, onDataLoaded }: any) {
  const containerRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [data, setData] = useState<Anime[]>([]);
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const hasNotifiedLoadedRef = useRef(false);
  const [showLeftArrow, setShowLeftArrow] = useState(false);
  const [showRightArrow, setShowRightArrow] = useState(true);
  const [isIntersecting, setIsIntersecting] = useState(false);

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]) {
          setIsIntersecting(entries[0].isIntersecting);
        }
      },
      { rootMargin: '300px' }
    );

    if (containerRef.current) {
      observer.observe(containerRef.current);
    }

    return () => observer.disconnect();
  }, []);

  const loadData = async () => {
    if (initialData) {
      const mapped = initialData.map(mapAnime).filter(a => !isBrokenAnime(a));
      const unique = Array.from(new Map(mapped.map((item: any) => [item.id, item])).values()) as Anime[];
      setData(unique.slice(0, 18));
      if (onDataLoaded && !hasNotifiedLoadedRef.current) {
        hasNotifiedLoadedRef.current = true;
        onDataLoaded(unique.map((a: Anime) => String(a.id)));
      }
      setLoaded(true);
      return;
    }

    setLoading(true);
    try {
      const res = await fetchFn();
      const items = Array.isArray(res) ? res : (res?.data || []);
      
      const mapped = items.map(mapAnime).filter(a => !isBrokenAnime(a));
      const unique = Array.from(new Map(mapped.map((item: any) => [item.id, item])).values()) as Anime[];
      
      setData(unique.slice(0, 18));
      if (onDataLoaded && !hasNotifiedLoadedRef.current) {
        hasNotifiedLoadedRef.current = true;
        onDataLoaded(unique.map((a: Anime) => String(a.id)));
      }
      setLoaded(true);
    } catch (e) {
      console.error(`Failed to load category section ${title}:`, e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isIntersecting && !loaded && !loading) {
      loadData();
    }
  }, [isIntersecting, loaded, loading]);

  useEffect(() => {
    if (initialData && !loaded) {
      const mapped = initialData.map(mapAnime).filter(a => !isBrokenAnime(a));
      const unique = Array.from(new Map(mapped.map((item: any) => [item.id, item])).values()) as Anime[];
      setData(unique.slice(0, 18));
      if (onDataLoaded && !hasNotifiedLoadedRef.current) {
        hasNotifiedLoadedRef.current = true;
        onDataLoaded(unique.map((a: Anime) => String(a.id)));
      }
      setLoaded(true);
    }
  }, [initialData, loaded]);

  useEffect(() => {
    const handleUpdate = () => {
      if (!initialData) {
        setData([]);
        setLoaded(false);
      }
    };
    window.addEventListener('anova_anime_updated', handleUpdate);
    window.addEventListener('anova_content_settings_changed', handleUpdate);
    return () => {
      window.removeEventListener('anova_anime_updated', handleUpdate);
      window.removeEventListener('anova_content_settings_changed', handleUpdate);
    };
  }, [initialData]);

  const handleScroll = () => {
    if (scrollRef.current) {
      const { scrollLeft, scrollWidth, clientWidth } = scrollRef.current;
      setShowLeftArrow(scrollLeft > 10);
      setShowRightArrow(scrollLeft < scrollWidth - clientWidth - 10);
    }
  };

  const scroll = (direction: 'left' | 'right') => {
    if (scrollRef.current) {
      const { scrollLeft, clientWidth } = scrollRef.current;
      const amount = clientWidth * 0.75;
      scrollRef.current.scrollTo({
        left: direction === 'left' ? scrollLeft - amount : scrollLeft + amount,
        behavior: 'smooth'
      });
    }
  };

  if (!loading && loaded && data.length === 0) {
    return (
      <div ref={containerRef} className="py-4 border-b border-white/5 relative group">
        <div className="flex items-center justify-between mb-3 px-1">
          <h2 className="text-sm md:text-base font-black text-white tracking-tight flex items-center gap-1.5 uppercase">
            <span className="w-1 h-4 bg-primary rounded-full shadow-[0_0_10px_rgba(0,229,255,0.8)] animate-pulse" />
            {title}
          </h2>
          <Link 
            to={link}
            className="text-[10px] md:text-xs text-[#00e5ff] hover:text-cyan-400 font-extrabold uppercase tracking-widest transition-colors flex items-center gap-1"
          >
            <span>View All</span>
            <ArrowRight size={12} />
          </Link>
        </div>
        <div className="w-full py-6 flex flex-col items-center justify-center border border-dashed border-white/10 bg-[#0a0d14]/20 rounded-2xl">
          <span className="text-[10px] text-gray-500 font-bold uppercase tracking-widest">No Anime Added Yet</span>
        </div>
      </div>
    );
  }

  return (
    <div ref={containerRef} className="py-4 border-b border-white/5 relative group">
      <div className="flex items-center justify-between mb-3 px-1">
        <h2 className="text-sm md:text-base font-black text-white tracking-tight flex items-center gap-1.5 uppercase">
          <span className="w-1 h-4 bg-primary rounded-full shadow-[0_0_10px_rgba(0,229,255,0.8)] animate-pulse" />
          {title}
        </h2>
        <Link 
          to={link}
          className="text-[10px] md:text-xs text-[#00e5ff] hover:text-cyan-400 font-extrabold uppercase tracking-widest transition-colors flex items-center gap-1"
        >
          <span>View All</span>
          <ArrowRight size={12} />
        </Link>
      </div>

      {loading ? (
        <div className="flex gap-2 pb-2 overflow-hidden">
          {Array.from({ length: 7 }).map((_, i) => (
            <div 
              key={i} 
              className="w-[120px] sm:w-[145px] md:w-[165px] lg:w-[175px] xl:w-[185px] shrink-0 animate-pulse bg-card/30 border border-white/5 rounded-xl aspect-[9/14]" 
            />
          ))}
        </div>
      ) : (
        <div className="relative">
          {/* Scroll Buttons visible on hover */}
          {showLeftArrow && (
            <button
              onClick={() => scroll('left')}
              className="absolute left-1.5 top-1/2 -translate-y-1/2 z-30 bg-black/80 hover:bg-[#00e5ff] text-white hover:text-black p-2 rounded-full border border-white/10 hover:border-transparent opacity-0 group-hover:opacity-100 transition-all duration-300 shadow-[0_0_15px_rgba(0,0,0,0.6)] cursor-pointer"
            >
              <ChevronLeft size={18} />
            </button>
          )}
          {showRightArrow && (
            <button
              onClick={() => scroll('right')}
              className="absolute right-1.5 top-1/2 -translate-y-1/2 z-30 bg-black/80 hover:bg-[#00e5ff] text-white hover:text-black p-2 rounded-full border border-white/10 hover:border-transparent opacity-0 group-hover:opacity-100 transition-all duration-300 shadow-[0_0_15px_rgba(0,0,0,0.6)] cursor-pointer"
            >
              <ChevronRight size={18} />
            </button>
          )}

          {/* Horizontally scrollable list */}
          <div
            ref={scrollRef}
            onScroll={handleScroll}
            className="flex gap-2 md:gap-3 overflow-x-auto scrollbar-none snap-x snap-mandatory scroll-smooth pb-2"
          >
            {data.map((anime) => (
              <div
                key={anime.id}
                className="w-[120px] sm:w-[145px] md:w-[165px] lg:w-[175px] xl:w-[185px] shrink-0 snap-start"
              >
                <AnimeCard anime={anime} />
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export function Home() {
  const [loading, setLoading] = useState(true);
  const [trending, setTrending] = useState<Anime[]>([]);
  const [top10, setTop10] = useState<Anime[]>([]);
  const [alreadyShownIds, setAlreadyShownIds] = useState<Set<string>>(new Set());
  const [dbSections, setDbSections] = useState<any[]>([]);

  // Infinite Catalog States
  const [catalogItems, setCatalogItems] = useState<Anime[]>([]);
  const [catalogLoading, setCatalogLoading] = useState(false);
  const [hasMoreCatalog, setHasMoreCatalog] = useState(true);
  const [activeFilter, setActiveFilter] = useState('all');
  const [catalogSearch, setCatalogSearch] = useState('');

  const catalogPageRef = useRef(1);
  const isFetchingRef = useRef(false);
  const catalogShownIdsRef = useRef<Set<string>>(new Set());
  const consecutiveEmptyPagesRef = useRef(0);

  const sentinelRef = useRef<HTMLDivElement>(null);

  // Sync watchlist / continue watching
  const { watchHistory } = useAppStore();
  const continueWatchingList = Object.values(watchHistory || {})
    .sort((a: any, b: any) => b.updatedAt - a.updatedAt)
    .slice(0, 6);

  // Handle category loaded items to avoid duplicate cards on homepage
  const handleDataLoaded = useCallback((ids: string[]) => {
    if (!ids || ids.length === 0) return;
    setAlreadyShownIds(prev => {
      let hasNew = false;
      for (const id of ids) {
        if (!prev.has(id)) {
          hasNew = true;
          break;
        }
      }
      if (!hasNew) return prev;
      const next = new Set(prev);
      ids.forEach(id => next.add(id));
      return next;
    });
  }, []);

  // 1. Initial Spotlight & Custom/API Section Configuration Fetcher
  useEffect(() => {
    let active = true;
    
    const loadHeroAndMeta = async () => {
      try {
        const homeData = await api.home(true);
        if (active && homeData) {
          const trendList = (homeData.data?.trending || []).map(mapAnime).filter(a => !isBrokenAnime(a));
          setTrending(trendList);

          const popular = (homeData.data?.mostPopular || []).map(mapAnime).filter(a => !isBrokenAnime(a));
          const updatedPopular = popular.map(item => {
            if (String(item.id) === "12") {
              const bleachFallback = fallbackAnimes.find(a => String(a.id) === "238");
              if (bleachFallback) {
                return mapAnime(bleachFallback);
              }
            }
            return item;
          }).filter(a => !isBrokenAnime(a));
          setTop10(updatedPopular.slice(0, 10));

          // Load and sort dynamic sections from Firebase/Admin
          if (homeData.dynamicSections) {
            const activeDbSections = homeData.dynamicSections.filter(
              (sec: any) => sec.status === 'active' && sec.visible !== false
            );
            setDbSections(activeDbSections);
          }
        }
      } catch (e) {
        console.error("Failed to load hero banner spotlight:", e);
      } finally {
        if (active) setLoading(false);
      }
    };

    loadHeroAndMeta();

    const handleSettingsChange = () => {
      if (active) {
        // Clear already shown IDs to avoid filter issues when changing sources
        setAlreadyShownIds(new Set());
        loadHeroAndMeta();
      }
    };

    const handleAnimeUpdated = () => {
      if (active) {
        setAlreadyShownIds(new Set());
        loadHeroAndMeta();
      }
    };

    window.addEventListener('anova_content_settings_changed', handleSettingsChange);
    window.addEventListener('anova_anime_updated', handleAnimeUpdated);

    return () => { 
      active = false;
      window.removeEventListener('anova_content_settings_changed', handleSettingsChange);
      window.removeEventListener('anova_anime_updated', handleAnimeUpdated);
    };
  }, []);

  // 2. Main Explore Paginated Catalog Fetcher (Load More / Infinite Scroll)
  const loadNextCatalogPage = async () => {
    if (isFetchingRef.current || !hasMoreCatalog) return;
    isFetchingRef.current = true;
    setCatalogLoading(true);
    
    const pageToFetch = catalogPageRef.current;
    try {
      let keywordToSearch = catalogSearch.trim();
      let filterOpts: any = {};
      if (activeFilter === 'MOVIE') {
        filterOpts.type = 'MOVIE';
      } else if (activeFilter !== 'all') {
        keywordToSearch = activeFilter;
      }

      const res = await api.search(keywordToSearch, pageToFetch, filterOpts);
      if (res && res.data) {
        const mapped = res.data.map(mapAnime).filter(a => !isBrokenAnime(a));
        
        // Prevent duplicate cards globally in the bottom catalog
        const uniqueIncoming = mapped.filter((item: Anime) => {
          const idStr = String(item.id);
          if (catalogShownIdsRef.current.has(idStr)) return false;
          return true;
        });

        if (uniqueIncoming.length > 0) {
          uniqueIncoming.forEach((x: Anime) => catalogShownIdsRef.current.add(String(x.id)));
          setCatalogItems(prev => [...prev, ...uniqueIncoming]);
          catalogPageRef.current = pageToFetch + 1;
          consecutiveEmptyPagesRef.current = 0;
        } else if (mapped.length === 0) {
          if (!keywordToSearch) {
            // Empty catalog search, try the next letter page
            consecutiveEmptyPagesRef.current += 1;
            if (consecutiveEmptyPagesRef.current >= 50) {
              setHasMoreCatalog(false);
            } else {
              catalogPageRef.current = pageToFetch + 1;
              setTimeout(() => {
                loadNextCatalogPage();
              }, 150);
            }
          } else {
            setHasMoreCatalog(false);
          }
        } else {
          // All items returned were duplicates, try next page automatically
          catalogPageRef.current = pageToFetch + 1;
          setTimeout(() => {
            loadNextCatalogPage();
          }, 150);
        }

        if (!keywordToSearch) {
          if (consecutiveEmptyPagesRef.current >= 50) {
            setHasMoreCatalog(false);
          }
        } else {
          if (res.page >= res.pages || mapped.length === 0) {
            setHasMoreCatalog(false);
          }
        }
      } else {
        setHasMoreCatalog(false);
      }
    } catch (e) {
      console.error("Failed to fetch next catalog page:", e);
    } finally {
      isFetchingRef.current = false;
      setCatalogLoading(false);
    }
  };

  // Reset catalog when filters change with a small debounce on text search
  useEffect(() => {
    let active = true;
    const delayDebounceFn = setTimeout(() => {
      if (!active) return;
      
      setCatalogItems([]);
      setHasMoreCatalog(true);
      catalogPageRef.current = 1;
      catalogShownIdsRef.current = new Set();
      consecutiveEmptyPagesRef.current = 0;
      isFetchingRef.current = false;
      
      const fetchPageOne = async () => {
        isFetchingRef.current = true;
        setCatalogLoading(true);
        try {
          let keywordToSearch = catalogSearch.trim();
          let filterOpts: any = {};
          if (activeFilter === 'MOVIE') {
            filterOpts.type = 'MOVIE';
          } else if (activeFilter !== 'all') {
            keywordToSearch = activeFilter;
          }
          
          const res = await api.search(keywordToSearch, 1, filterOpts);
          if (active && res && res.data) {
            const mapped = res.data.map(mapAnime).filter(a => !isBrokenAnime(a));
            const uniqueIncoming = mapped.filter((item: Anime) => {
              const idStr = String(item.id);
              if (catalogShownIdsRef.current.has(idStr)) return false;
              return true;
            });
            
            uniqueIncoming.forEach((x: Anime) => catalogShownIdsRef.current.add(String(x.id)));
            setCatalogItems(uniqueIncoming);
            catalogPageRef.current = 2;
            
            if (!keywordToSearch) {
              // Endless pages allowed for empty search
              setHasMoreCatalog(true);
            } else {
              if (res.page >= res.pages || mapped.length === 0) {
                setHasMoreCatalog(false);
              }
            }
          } else if (active) {
            setHasMoreCatalog(false);
          }
        } catch (e) {
          console.error("Failed to fetch initial catalog page:", e);
        } finally {
          if (active) {
            isFetchingRef.current = false;
            setCatalogLoading(false);
          }
        }
      };
      
      fetchPageOne();
    }, 400); // 400ms debounce

    return () => {
      active = false;
      clearTimeout(delayDebounceFn);
    };
  }, [activeFilter, catalogSearch]);

  // Trigger Infinite scroll when sentinel in view
  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel) return;

    const observer = new IntersectionObserver((entries) => {
      if (entries[0].isIntersecting && !isFetchingRef.current && hasMoreCatalog) {
        loadNextCatalogPage();
      }
    }, { rootMargin: '400px' });

    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [hasMoreCatalog, activeFilter, catalogSearch]);

  if (loading && trending.length === 0) {
    return (
      <div className="pb-24 min-h-screen bg-[#050505]">
        <HeroBannerSkeleton />
        <div className="max-w-7xl mx-auto px-4 md:px-8 space-y-6 mt-4">
          <Top10RankedSkeleton />
        </div>
      </div>
    );
  }

  return (
    <div className="pb-24 min-h-screen bg-[#050505]">
      {/* Cinematic Hero Spotlight Carousel */}
      <HeroBanner trending={trending.length > 0 ? trending : top10} />
      
      {/* Main Container - Space-optimized layout */}
      <div className="max-w-7xl mx-auto px-4 md:px-8 space-y-1 mt-4 relative z-10">
        
        {/* CONTINUE WATCHING - Displays if watch history contains data */}
        {continueWatchingList.length > 0 && (
          <div className="py-4 border-b border-white/5">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-sm md:text-base font-black text-white tracking-tight flex items-center gap-1.5 uppercase">
                <RotateCcw size={14} className="text-primary animate-spin-[reverse] duration-1000" />
                Continue Watching
              </h2>
            </div>
            
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
              {continueWatchingList.map((item: any) => (
                <Link 
                  key={item.animeId} 
                  to={`/watch/${item.animeId}?ep=${item.episode}`}
                  className="flex gap-3 bg-[#0a0d14]/80 p-2 rounded-xl border border-white/5 hover:border-primary/50 transition-all duration-300 group hover:shadow-[0_0_15px_rgba(0,229,255,0.08)]"
                >
                  <div className="w-14 h-20 relative overflow-hidden rounded-lg shrink-0">
                    <img 
                      src={item.animePoster || null} 
                      alt={item.animeTitle} 
                      referrerPolicy="no-referrer"
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" 
                    />
                    <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                      <Play fill="white" size={14} className="text-white" />
                    </div>
                  </div>
                  <div className="flex-1 flex flex-col justify-between py-1">
                    <div>
                      <h3 className="font-extrabold text-xs text-gray-200 line-clamp-1 group-hover:text-primary transition-colors">{item.animeTitle}</h3>
                      <p className="text-[10px] text-gray-400 mt-0.5">Episode {item.episode}</p>
                    </div>
                    <div className="w-full bg-[#10141f] rounded-full h-1">
                      <div 
                        className="bg-primary h-1 rounded-full shadow-[0_0_8px_rgba(0,229,255,0.8)]" 
                        style={{ width: item.duration > 0 ? `${(item.time / item.duration) * 100}%` : '40%' }}
                      />
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        )}

        {/* TOP 10 TODAY (Netflix Ranked Design) */}
        <Top10Ranked animes={top10} />

        {/* 20+ LAZY-LOADED CATEGORY TRACKS */}
        <div className="space-y-2">
          {/* A. Dynamically load all active & visible sections from Admin Homepage Section Manager in their precise sorted display order */}
          {dbSections.map((sec) => {
            const meta = STANDARD_SECTION_METADATA[sec.slug] || STANDARD_SECTION_METADATA[sec.id];
            const title = meta ? meta.title : `✨ ${sec.name}`;
            const link = meta ? meta.link : `/search?q=${encodeURIComponent(sec.name)}`;
            return (
              <LazyCategorySection
                key={sec.slug || sec.id}
                id={sec.slug || sec.id}
                title={title}
                link={link}
                fetchFn={async () => sec.animes || []}
                initialData={sec.animes}
                alreadyShownIds={alreadyShownIds}
                onDataLoaded={handleDataLoaded}
              />
            );
          })}

          {/* B. Render other secondary categories (genres, etc) that are not managed by the dynamic database sections */}
          {CATEGORIES_CONFIG.filter((cat) => {
            const dbSlugs = new Set(dbSections.map((sec) => sec.slug || sec.id));
            return !dbSlugs.has(cat.id);
          }).map((cat) => (
            <LazyCategorySection
              key={cat.id}
              id={cat.id}
              title={cat.title}
              link={cat.link}
              fetchFn={cat.fetch}
              alreadyShownIds={alreadyShownIds}
              onDataLoaded={handleDataLoaded}
            />
          ))}
        </div>

        {/* ESTIMATED BROADCAST SCHEDULE */}
        <div className="pt-4 border-t border-white/5">
          <EstimatedSchedule />
        </div>

        {/* MAIN PAGINATED CATALOG GRID */}
        <div id="explore-all-anime" className="pt-10 mt-10 border-t border-white/5 relative">
          {/* Subtle cosmic background glow */}
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-full max-w-4xl h-80 bg-gradient-to-b from-primary/5 to-transparent blur-[120px] pointer-events-none rounded-full" />
          
          <div className="relative z-10">
            {/* Header section with Title and Description */}
            <div className="mb-8 flex flex-col md:flex-row items-start md:items-center justify-between gap-4 px-1">
              <div>
                <h2 className="text-sm md:text-base font-black text-white tracking-tight flex items-center gap-2.5 uppercase">
                  <span className="p-1.5 bg-[#00e5ff]/10 rounded-lg border border-[#00e5ff]/20 text-primary shadow-[0_0_15px_rgba(0,229,255,0.15)] flex items-center justify-center">
                    <Grid size={16} />
                  </span>
                  Explore All Anime
                </h2>
                <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest mt-1">
                  Continuous live scroll • Find any series or movie instantly
                </p>
              </div>

              {/* Integrated mini search input */}
              <div className="relative w-full md:w-80 flex items-center">
                <SearchIcon className="absolute left-3 text-gray-500" size={14} />
                <input
                  type="text"
                  value={catalogSearch}
                  onChange={(e) => setCatalogSearch(e.target.value)}
                  placeholder="Filter by title, genre, or studio..."
                  className="w-full bg-[#0a0d14]/75 backdrop-blur-md border border-white/10 hover:border-white/20 focus:border-[#00e5ff] rounded-full py-2 pl-9 pr-8 text-xs text-white placeholder-gray-500 focus:outline-none focus:ring-1 focus:ring-[#00e5ff] shadow-lg transition-all duration-300"
                />
                {catalogSearch && (
                  <button
                    onClick={() => setCatalogSearch('')}
                    className="absolute right-3 text-gray-500 hover:text-white transition-colors"
                  >
                    <X size={12} />
                  </button>
                )}
              </div>
            </div>

            {/* Scrolling genre pills row */}
            <div className="mb-6 flex items-center gap-2 overflow-x-auto pb-3 scrollbar-none">
              {[
                { id: 'all', label: '🌐 All Anime' },
                { id: 'Action', label: '⚔ Action' },
                { id: 'Adventure', label: '🧭 Adventure' },
                { id: 'Romance', label: '🌸 Romance' },
                { id: 'Comedy', label: '😂 Comedy' },
                { id: 'Fantasy', label: '✨ Fantasy' },
                { id: 'Sci-Fi', label: '🚀 Sci-Fi' },
                { id: 'Shounen', label: '👊 Shounen' },
                { id: 'MOVIE', label: '🎬 Movies' }
              ].map((pill) => {
                const isActive = activeFilter === pill.id;
                return (
                  <button
                    key={pill.id}
                    onClick={() => setActiveFilter(pill.id)}
                    className={`px-3 py-1.5 rounded-full text-[10px] font-black uppercase tracking-wider border whitespace-nowrap transition-all duration-300 cursor-pointer ${
                      isActive
                        ? 'bg-gradient-to-r from-[#00e5ff] to-cyan-500 text-black border-transparent shadow-[0_0_12px_rgba(0,229,255,0.4)] scale-105 font-black'
                        : 'bg-[#0a0d14]/60 hover:bg-[#00e5ff]/5 text-gray-400 hover:text-white border-white/5 hover:border-[#00e5ff]/20'
                    }`}
                  >
                    {pill.label}
                  </button>
                );
              })}
            </div>

            {/* High-density grid with exact 4Animo specifications */}
            {catalogItems.length > 0 ? (
              <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-8 gap-1.5 sm:gap-3">
                {catalogItems.map((anime) => (
                  <AnimeCard key={anime.id} anime={anime} />
                ))}
              </div>
            ) : (
              !catalogLoading && (
                <div className="text-center py-16 bg-[#0a0d14]/40 border border-white/5 rounded-2xl max-w-xl mx-auto p-6">
                  <p className="text-sm text-gray-300 font-bold mb-1">No matching anime found</p>
                  <p className="text-xs text-gray-500">Try adjusting your filters or typing another keyword.</p>
                </div>
              )
            )}

            {/* Loading sentinel and indicators */}
            <div ref={sentinelRef} className="pt-8 pb-4 flex flex-col items-center justify-center gap-3">
              {catalogLoading && (
                <div className="flex flex-col items-center justify-center py-6 gap-2">
                  <div className="relative w-8 h-8">
                    <div className="absolute inset-0 rounded-full border-2 border-[#00e5ff]/10 border-t-[#00e5ff] animate-spin" />
                  </div>
                  <p className="text-gray-400 text-[10px] font-bold uppercase tracking-widest animate-pulse">Loading Next Page...</p>
                </div>
              )}

              {!hasMoreCatalog && catalogItems.length > 0 && (
                <div className="flex items-center gap-2 text-gray-600 text-[10px] font-extrabold uppercase tracking-widest mt-4 bg-[#0a0d14]/50 border border-white/5 px-4 py-2 rounded-full">
                  <span className="w-1.5 h-1.5 bg-green-500 rounded-full animate-ping" />
                  ✓ All matching titles fully loaded
                </div>
              )}
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}
