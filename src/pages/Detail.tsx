// @ts-nocheck
import React, { useEffect, useState } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { api, apiCache, fallbackAnimes } from '../lib/api';
import { Play, Heart, Bookmark, Star, ArrowLeft, Calendar, Film, Shield, BookOpen, MessageSquare } from 'lucide-react';
import { useAppStore } from '../store';
import { CommentSystem } from '../components/CommentSystem';

export function Detail() {
  const { id } = useParams();
  const navigate = useNavigate();

  const currentAnimeIdRef = React.useRef(id);
  const lastIdRef = React.useRef(id);

  // Sync current ID ref instantly
  currentAnimeIdRef.current = id;

  const [anime, setAnime] = useState<any>(() => {
    if (!id) return null;
    const cached = apiCache.get(`anime_info_${id}`);
    if (cached) return cached;
    // Instantly match fallback anime to load pages instantaneously
    const matched = fallbackAnimes.find(a => String(a.id) === String(id));
    if (matched) return matched;
    return null;
  });

  const [episodes, setEpisodes] = useState<any[]>(() => {
    if (!id) return [];
    const cached = apiCache.get(`episodes_${id}`);
    if (cached && cached.length > 0) return cached;
    // Instantly generate initial list of episodes for fallback anime so links are immediately clickable
    const matched = fallbackAnimes.find(a => String(a.id) === String(id));
    if (matched) {
      const totalEp = matched.episodes || 24;
      const eps = [];
      for (let i = 1; i <= Math.min(totalEp, 200); i++) {
        eps.push({ id: `${id}-ep-${i}`, number: i, title: `Episode ${i}` });
      }
      return eps;
    }
    return [];
  });

  // Track smoothly preloaded image URLs to prevent empty / skeleton or black flashes
  const [displayedPoster, setDisplayedPoster] = useState(() => anime?.poster || '');
  const [displayedBanner, setDisplayedBanner] = useState(() => anime?.banner || anime?.poster || '');

  // Render-phase State synchronization: Lock current anime data and load instantly on id param change
  if (id !== lastIdRef.current) {
    lastIdRef.current = id;
    
    const initialAnime = (() => {
      if (!id) return null;
      const cached = apiCache.get(`anime_info_${id}`);
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
        return eps;
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

  const [activeTab, setActiveTab] = useState('overview');
  const { favorites, bookmarks, addFavorite, removeFavorite, addBookmark, removeBookmark } = useAppStore();

  const isLoggedIn = localStorage.getItem('isLoggedIn') === 'true';
  const currentUserEmail = localStorage.getItem('userEmail') || '';

  useEffect(() => {
    if (!id) return;

    const controller = new AbortController();

    // Set a timer to load fallback/placeholder anime if the real API takes more than 1.5 seconds
    const fallbackTimer = setTimeout(() => {
      if (currentAnimeIdRef.current !== id) return;

      setAnime((currentAnime) => {
        if (currentAnime) return currentAnime; // already loaded!
        console.warn(`[Detail Fallback] Anime details taking too long (>1.5s). Forcing fallback to avoid infinite skeleton loading...`);
        const matched = fallbackAnimes.find(a => String(a.id) === String(id));
        if (matched) return matched;
        return {
          id: String(id),
          title: `Anime Title #${id}`,
          poster: "https://images.unsplash.com/photo-1578632767115-351597cf2477?w=600&auto=format&fit=crop&q=80",
          banner: "https://images.unsplash.com/photo-1578632767115-351597cf2477?w=1200&auto=format&fit=crop&q=80",
          type: "TV",
          status: "Ongoing",
          episodes: 24,
          rating: "8.5",
          description: `This is a high-speed premium streaming channel for Anime ID #${id}. Start watching your favorite episodes instantly with zero ads, seamless sub/dub switching, and ultra-high speed servers.`,
          genres: ["Action", "Sci-Fi", "Adventure"],
          studio: "AnOvA Production"
        };
      });
      
      setEpisodes((currentEpisodes) => {
        if (currentEpisodes && currentEpisodes.length > 0) return currentEpisodes;
        // Pre-populate fallback episodes
        const eps = [];
        for (let i = 1; i <= 24; i++) {
          eps.push({ id: `${id}-ep-${i}`, number: i, title: `Episode ${i}` });
        }
        return eps;
      });
    }, 1500);

    // Background fetch (stale-while-revalidate) with AbortController and ID checking
    api.animeInfo(id).then((res) => {
      if (controller.signal.aborted) return;
      if (currentAnimeIdRef.current !== id) {
        console.log(`[API Race Avoided] Detail animeInfo callback for id=${id} ignored because current id is ${currentAnimeIdRef.current}`);
        return;
      }
      if (res) {
        setAnime(res);
      }
    }).catch((err) => {
      console.error("api.animeInfo failed:", err);
    });

    api.episodes(id).then((res) => {
      if (controller.signal.aborted) return;
      if (currentAnimeIdRef.current !== id) {
        console.log(`[API Race Avoided] Detail episodes callback for id=${id} ignored because current id is ${currentAnimeIdRef.current}`);
        return;
      }
      if (res && res.length > 0) {
        setEpisodes(res);
      }
    }).catch((err) => {
      console.error("api.episodes failed:", err);
    });

    return () => {
      controller.abort();
      clearTimeout(fallbackTimer);
    };
  }, [id]);

  if (!anime) {
    return (
      <div className="min-h-screen bg-[#050505] pt-20">
        <div className="h-[40vh] md:h-[55vh] w-full bg-gradient-to-b from-[#0b1528]/40 to-[#050505] animate-pulse" />
        <div className="max-w-7xl mx-auto px-4 md:px-8 -mt-24 relative z-10 grid grid-cols-[100px_1fr] md:grid-cols-[180px_1fr] gap-4 md:gap-8">
          <div className="aspect-[2/3] rounded-lg bg-white/5 animate-pulse" />
          <div className="space-y-3 pt-6">
            <div className="h-6 md:h-8 w-2/3 rounded bg-white/5 animate-pulse" />
            <div className="h-3 w-1/3 rounded bg-white/5 animate-pulse" />
            <div className="h-3 w-full rounded bg-white/5 animate-pulse" />
            <div className="h-3 w-5/6 rounded bg-white/5 animate-pulse" />
          </div>
        </div>
      </div>
    );
  }

  const isFav = favorites.some(f => f.id === anime.id);
  const isBookmarked = bookmarks.some(b => b.id === anime.id);

  return (
    <div className="min-h-screen pb-24 relative bg-[#050505]">
      {/* Floating Back Button - Styled sleeker and smaller with thin border */}
      <div className="absolute top-20 left-4 md:left-8 z-40">
        <button 
          onClick={() => navigate(-1)}
          className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-[#050c18]/80 hover:bg-[#00e5ff]/10 border border-[#00e5ff]/20 hover:border-[#00e5ff]/40 text-xs text-gray-300 hover:text-white font-bold transition-all duration-300 backdrop-blur-md shadow-lg hover:scale-105 active:scale-95 group cursor-pointer"
        >
          <ArrowLeft size={12} className="group-hover:-translate-x-1 transition-transform text-[#00e5ff]" />
          <span>Back</span>
        </button>
      </div>

      {/* Hero Cover Image & Back Banner - Fits beautifully and elegantly centered */}
      <div className="relative h-[40vh] md:h-[55vh] w-full overflow-hidden border-b border-white/5">
        <img 
          src={displayedBanner || 'https://images.unsplash.com/photo-1542751371-adc38448a05e?w=1600&auto=format&fit=crop&q=80'} 
          alt="" 
          referrerPolicy="no-referrer"
          className="w-full h-full object-cover object-[center_20%] opacity-40 md:opacity-25" 
          onError={(e) => {
            e.currentTarget.src = 'https://images.unsplash.com/photo-1542751371-adc38448a05e?w=1600&auto=format&fit=crop&q=80';
          }}
        />
        <div className="absolute inset-0 bg-gradient-to-t from-[#050505] via-[#050505]/40 to-transparent" />
        
        {/* Poster & details overlay - left aligned like the reference */}
        <div className="absolute bottom-0 left-0 w-full px-4 md:px-8 max-w-7xl pb-6">
          <div className="flex items-end gap-4 text-left">
            {/* Main Poster */}
            <img
              src={displayedPoster || 'https://images.unsplash.com/photo-1578632767115-351597cf2477?w=300&auto=format&fit=crop&q=80'}
              alt={anime.title}
              referrerPolicy="no-referrer"
              className="w-28 md:w-44 rounded-2xl shadow-[0_4px_30px_rgba(0,0,0,0.8)] border border-white/10 shrink-0"
              onError={(e) => {
                e.currentTarget.src = 'https://images.unsplash.com/photo-1578632767115-351597cf2477?w=300&auto=format&fit=crop&q=80';
              }}
            />

            <div className="flex-1 min-w-0 space-y-2 pb-1 md:max-w-[420px]">
              <h1 className="text-lg md:text-2xl font-black text-white leading-tight drop-shadow-md line-clamp-2">
                {anime.title}
              </h1>

              {/* Compact stacked action buttons */}
              <div className="flex flex-col gap-2 w-full">
                <Link
                  to={anime.type === 'Trailer' ? `/watch/${anime.id}?ep=1` : `/watch/${anime.id}`}
                  className="flex items-center justify-center gap-2 bg-primary hover:bg-[#00cce0] text-black w-full py-2.5 md:py-3 rounded-xl font-black text-xs md:text-sm transition-all active:scale-[0.98] shadow-[0_0_15px_rgba(0,229,255,0.35)]"
                >
                  <Play size={16} fill="currentColor" /> {anime.type === 'Trailer' ? 'Play Trailer' : 'Watch Now'}
                </Link>

                <button
                  onClick={() => isFav ? removeFavorite(anime.id) : addFavorite(anime)}
                  className={`flex items-center justify-center gap-2 w-full py-2.5 rounded-xl font-bold text-xs md:text-sm border transition-all active:scale-[0.98] ${
                    isFav
                      ? 'bg-pink-500/10 text-pink-400 border-pink-500/40'
                      : 'bg-white/[0.03] text-white border-white/10 hover:bg-white/5'
                  }`}
                >
                  <Heart size={14} fill={isFav ? "currentColor" : "none"} />
                  <span>{isFav ? 'Added to List' : '+ Add to List'}</span>
                </button>

                <button
                  onClick={() => isBookmarked ? removeBookmark(anime.id) : addBookmark(anime)}
                  className={`flex items-center justify-center gap-2 w-full py-2.5 rounded-xl font-bold text-xs md:text-sm border transition-all active:scale-[0.98] ${
                    isBookmarked
                      ? 'bg-blue-500/10 text-blue-400 border-blue-500/40'
                      : 'bg-white/[0.03] text-white border-white/10 hover:bg-white/5'
                  }`}
                >
                  <Bookmark size={14} fill={isBookmarked ? "currentColor" : "none"} />
                  <span>More Seasons</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Meta strip below hero */}
      <div className="max-w-7xl mx-auto px-4 md:px-8 mt-6">
        <div className="flex flex-wrap items-center gap-2 text-xs font-bold">
          <span className="flex items-center gap-1 text-yellow-400 bg-yellow-400/10 border border-yellow-400/30 px-2.5 py-1.5 rounded-lg">
            <Star size={12} fill="currentColor" /> {anime.rating || '8.5'}
          </span>
          <span className="bg-white/5 border border-white/10 px-2.5 py-1.5 rounded-lg text-gray-200">{anime.type || 'TV'}</span>
          <span className="bg-white/5 border border-white/10 px-2.5 py-1.5 rounded-lg text-gray-200">{anime.episodes || 12} Eps</span>
        </div>
        {anime.status && <p className="text-sm text-gray-400 mt-2 font-semibold">{anime.status}</p>}
        <p className="mt-2 text-sm text-yellow-400 font-bold flex items-center gap-1.5">
          <Star size={14} fill="currentColor" /> {anime.rating || '8.5'} — Rated for mature audiences
        </p>
      </div>


      {/* Tabs list bar */}
      <div className="max-w-7xl mx-auto px-4 md:px-8 mt-8">
        <div className="flex gap-6 border-b border-white/5 pb-3 overflow-x-auto hide-scrollbar text-xs md:text-sm font-bold uppercase tracking-wider">
          {['overview', 'episodes', 'comments'].map(tab => (
            <button 
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`pb-3 -mb-[13px] border-b-2 transition-all whitespace-nowrap ${
                activeTab === tab 
                  ? 'text-primary border-primary font-black drop-shadow-[0_0_10px_rgba(0,229,255,0.4)]' 
                  : 'text-gray-400 border-transparent hover:text-white'
              }`}
            >
              {tab}
            </button>
          ))}
        </div>

        {/* Dynamic Tab Body content */}
        <div className="mt-8">
          
          {/* OVERVIEW TAB */}
          {activeTab === 'overview' && (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
              <div className="md:col-span-2 space-y-4">
                <h3 className="text-base md:text-lg font-black text-white flex items-center gap-2">
                  <BookOpen size={18} className="text-primary" />
                  Synopsis
                </h3>
                <p 
                  className="text-gray-300 text-xs md:text-sm leading-relaxed whitespace-pre-wrap bg-[#0a0d14]/30 border border-white/5 rounded-xl p-5"
                  dangerouslySetInnerHTML={{ __html: anime.description || 'No detailed synopsis available.' }}
                />
              </div>
              
              <div className="space-y-4 bg-[#0a0d14]/40 p-6 rounded-2xl border border-white/5 h-fit">
                <h4 className="text-xs font-black text-white uppercase tracking-widest border-b border-white/5 pb-2 mb-2">Details</h4>
                <div>
                  <span className="text-gray-500 text-[10px] uppercase font-bold tracking-wider">Studio</span>
                  <p className="text-xs font-bold text-gray-200">{anime.studio || 'Unknown Studio'}</p>
                </div>
                <div>
                  <span className="text-gray-500 text-[10px] uppercase font-bold tracking-wider">Genres</span>
                  <div className="flex flex-wrap gap-1.5 mt-1.5">
                    {anime.genres?.map((g: string) => (
                      <span key={g} className="bg-white/5 border border-white/10 px-2.5 py-1 rounded text-[10px] text-gray-300 font-bold">{g}</span>
                    ))}
                  </div>
                </div>
                <div>
                  <span className="text-gray-500 text-[10px] uppercase font-bold tracking-wider">Format</span>
                  <p className="text-xs font-bold text-primary">{anime.type || 'TV Series'}</p>
                </div>
              </div>
            </div>
          )}
          
          {/* EPISODES TAB */}
          {activeTab === 'episodes' && (
            <div className="space-y-4">
              <div className="mb-4">
                <h3 className="text-base md:text-lg font-black text-white flex items-center gap-2">
                  <Film size={18} className="text-primary" />
                  Episodes List ({episodes.length})
                </h3>
              </div>
              {episodes.length === 0 ? (
                <div className="py-12 text-center text-gray-500 bg-white/[0.01] rounded-xl border border-white/5 border-dashed">
                  <p className="text-xs">No episodes listed yet for this series.</p>
                </div>
              ) : (
                <div className="grid grid-cols-4 sm:grid-cols-6 md:grid-cols-8 lg:grid-cols-10 gap-2.5">
                  {episodes.map((ep: any) => (
                    <Link
                      key={ep.id}
                      to={`/watch/${anime.id}?ep=${ep.number}`}
                      className="bg-[#0a0d14]/50 border border-white/5 hover:border-primary/50 text-gray-300 hover:text-primary py-2.5 rounded-xl flex items-center justify-center text-xs font-black transition-all hover:scale-105 active:scale-95 shadow-sm"
                    >
                      EP {ep.number}
                    </Link>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* COMMENTS TAB */}
          {activeTab === 'comments' && (
            <div className="max-w-4xl">
              <CommentSystem animeId={anime.id} />
            </div>
          )}

        </div>
      </div>
    </div>
  );
}
