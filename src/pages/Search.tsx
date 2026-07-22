// @ts-nocheck
import React, { useState, useEffect, useRef } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { api } from '../lib/api';
import { AnimeCard } from '../components/AnimeCard';
import { Search as SearchIcon, X, SlidersHorizontal, ArrowLeft, ArrowRight, Grid, Calendar, Film, CheckCircle2, Volume2, ArrowUpDown } from 'lucide-react';
import { useAppStore } from '../store';

let GENRES_LIST = [
  'Action', 'Adventure', 'Comedy', 'Drama', 'Fantasy', 'Horror', 'Mystery', 
  'Romance', 'Sci-Fi', 'Slice of Life', 'Sports', 'Supernatural', 'Thriller', 
  'Ecchi', 'Harem', 'Isekai', 'Mecha', 'Psychological', 'School', 
  'Seinen', 'Shoujo', 'Shounen'
];

const findGenreMatch = (text: string): string => {
  if (!text) return '';
  const clean = text.trim().toLowerCase();
  
  // Custom synonyms mapping for highly responsive category matching
  if (clean === 'scifi' || clean === 'sci-fi' || clean === 'science fiction') return 'Sci-Fi';
  if (clean === 'slice of life' || clean === 'slice-of-life' || clean === 'sol') return 'Slice of Life';
  if (clean === 'shonen') return 'Shounen';
  if (clean === 'shojo') return 'Shoujo';
  
  // Direct match lookup
  const matched = GENRES_LIST.find(g => g.toLowerCase() === clean);
  if (matched) return matched;
  
  // Word match fallback (e.g. "horror anime" -> "Horror")
  const words = clean.split(/\s+/);
  for (const word of words) {
    if (word.length >= 3) {
      const subMatch = GENRES_LIST.find(g => g.toLowerCase() === word);
      if (subMatch) return subMatch;
    }
  }
  
  return '';
};

const YEARS_LIST = Array.from({ length: 27 }, (_, i) => String(2026 - i));

export function Search() {
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  
  const [genresList, setGenresList] = useState(GENRES_LIST);

  useEffect(() => {
    let active = true;
    api.getAllGenres().then(list => {
      if (active && list && list.length > 0) {
        GENRES_LIST = list;
        setGenresList(list);
      }
    });
    return () => { active = false; };
  }, []);
  
  // Search state
  const initialQuery = searchParams.get('q') || '';
  const [query, setQuery] = useState(initialQuery);
  const [debouncedQuery, setDebouncedQuery] = useState(initialQuery);
  
  // Filters state initialized from URL
  const [selectedGenre, setSelectedGenre] = useState(() => searchParams.get('genre') || '');
  const [selectedType, setSelectedType] = useState(() => searchParams.get('type') || '');
  const [selectedYear, setSelectedYear] = useState(() => searchParams.get('year') || '');
  const [selectedSeason, setSelectedSeason] = useState(() => searchParams.get('season') || '');
  const [selectedStatus, setSelectedStatus] = useState(() => searchParams.get('status') || '');
  const [selectedLanguage, setSelectedLanguage] = useState(() => searchParams.get('language') || '');
  const [selectedSort, setSelectedSort] = useState(() => searchParams.get('sort') || '');
  
  // Pagination & results state
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalResults, setTotalResults] = useState(0);
  const [results, setResults] = useState([]);
  const [suggestions, setSuggestions] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  
  const [showFilters, setShowFilters] = useState(true);
  const { searchHistory, addSearchHistory } = useAppStore();
  const resultsContainerRef = useRef(null);

  // Sync query state and filters from search parameters on load/history click
  useEffect(() => {
    const q = searchParams.get('q');
    if (q !== null && q !== query) {
      setQuery(q);
      setDebouncedQuery(q);
    }
    
    const genre = searchParams.get('genre') || '';
    setSelectedGenre(genre);
    
    const type = searchParams.get('type') || '';
    setSelectedType(type);
    
    const year = searchParams.get('year') || '';
    setSelectedYear(year);
    
    const season = searchParams.get('season') || '';
    setSelectedSeason(season);
    
    const status = searchParams.get('status') || '';
    setSelectedStatus(status);
    
    const language = searchParams.get('language') || '';
    setSelectedLanguage(language);
    
    const sort = searchParams.get('sort') || '';
    setSelectedSort(sort);
  }, [searchParams]);

  // Debounce search query changes
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedQuery(query);
    }, 300); // Faster, more fluid results loading
    return () => clearTimeout(timer);
  }, [query]);

  // Handle suggestions debounced
  useEffect(() => {
    let active = true;
    const q = query.trim();
    if (q.length >= 2) {
      const timer = setTimeout(() => {
        api.suggestions(q).then((sugg) => {
          if (active) {
            setSuggestions(sugg || []);
          }
        });
      }, 150); // High-speed network throttle debounce
      return () => {
        active = false;
        clearTimeout(timer);
      };
    } else {
      setSuggestions([]);
    }
  }, [query]);

  // Reset pagination page when filters change to avoid empty pages
  useEffect(() => {
    setPage(1);
  }, [debouncedQuery, selectedGenre, selectedType, selectedYear, selectedSeason, selectedStatus, selectedLanguage, selectedSort]);

  // Core Data Fetcher
  useEffect(() => {
    let active = true;
    const fetchData = async () => {
      setLoading(true);
      setError(null);
      try {
        let queryKeyword = selectedGenre || debouncedQuery || '';
        
        // Autodetect genre searching in search input (e.g. typing "horror")
        if (!selectedGenre && debouncedQuery) {
          const matched = findGenreMatch(debouncedQuery);
          if (matched) {
            queryKeyword = matched;
          }
        }
        
        const res = await api.search(queryKeyword, page, {
          type: selectedType,
          status: selectedStatus,
          season: selectedSeason,
          year: selectedYear
        });

        if (active && res) {
          let items = res.data || [];

          // Client-side Language Filtering
          if (selectedLanguage === 'SUB') {
            items = items.filter(x => x.subAvailable || (x.sub_count && x.sub_count > 0) || x.sub === true);
          } else if (selectedLanguage === 'DUB') {
            items = items.filter(x => x.dubAvailable || (x.dub_count && x.dub_count > 0) || x.dub === true);
          }

          // Client-side Sorting
          if (selectedSort === 'score') {
            items = [...items].sort((a, b) => Number(b.score || 0) - Number(a.score || 0));
          } else if (selectedSort === 'latest') {
            items = [...items].sort((a, b) => {
              const yearA = a.season_year || a.year || 0;
              const yearB = b.season_year || b.year || 0;
              return Number(yearB) - Number(yearA);
            });
          }

          setResults(items);
          setTotalResults(res.total || items.length);
          setTotalPages(res.pages || 1);
        }
      } catch (err) {
        console.error("Catalog fetch failed:", err);
        if (active) {
          setError("Failed to fetch catalog. Please check your connection and try again.");
        }
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    };

    fetchData();
    return () => {
      active = false;
    };
  }, [page, debouncedQuery, selectedGenre, selectedType, selectedYear, selectedSeason, selectedStatus, selectedLanguage, selectedSort]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (query.trim()) {
      addSearchHistory(query.trim());
      setSearchParams({ q: query.trim() });
    }
  };

  const handlePageChange = (newPage: number) => {
    if (newPage >= 1 && newPage <= totalPages) {
      setPage(newPage);
      if (resultsContainerRef.current) {
        resultsContainerRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
      } else {
        window.scrollTo({ top: 0, behavior: 'smooth' });
      }
    }
  };

  const handleGenreToggle = (genre: string) => {
    if (selectedGenre === genre) {
      setSelectedGenre('');
    } else {
      setSelectedGenre(genre);
      setQuery(''); // Reset textual search when clicking a structured genre filter
      setSearchParams({});
    }
  };

  const handleClearFilters = () => {
    setQuery('');
    setSelectedGenre('');
    setSelectedType('');
    setSelectedYear('');
    setSelectedSeason('');
    setSelectedStatus('');
    setSelectedLanguage('');
    setSelectedSort('');
    setSearchParams({});
    setPage(1);
  };

  // Helper to generate elegant 4Animo-style page ranges with ellipsis
  const getPageRange = () => {
    const range = [];
    const maxVisible = 5;
    
    if (totalPages <= maxVisible) {
      for (let i = 1; i <= totalPages; i++) range.push(i);
    } else {
      range.push(1);
      let start = Math.max(2, page - 1);
      let end = Math.min(totalPages - 1, page + 1);
      
      if (page <= 2) {
        end = 4;
      } else if (page >= totalPages - 1) {
        start = totalPages - 3;
      }
      
      if (start > 2) range.push('...');
      for (let i = start; i <= end; i++) range.push(i);
      if (end < totalPages - 1) range.push('...');
      range.push(totalPages);
    }
    return range;
  };

  return (
    <div className="min-h-screen pt-20 md:pt-24 px-4 max-w-7xl mx-auto pb-24" ref={resultsContainerRef}>
      {/* Search form bar */}
      <form onSubmit={handleSearchSubmit} className="relative max-w-2xl mx-auto mb-8">
        <div className="relative flex items-center">
          <SearchIcon className="absolute left-4 text-gray-400" size={20} />
          <input
            type="text"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              if (selectedGenre) setSelectedGenre(''); // Clear genre capsule when user types
            }}
            placeholder="Search anime, characters, studios..."
            className="w-full bg-card/60 backdrop-blur-md border border-white/10 rounded-full py-3.5 pl-12 pr-12 text-white placeholder-gray-500 focus:outline-none focus:border-[#00e5ff] focus:ring-1 focus:ring-[#00e5ff] text-base shadow-xl transition-all duration-300"
          />
          {query && (
            <button
              type="button"
              onClick={() => { setQuery(''); setSearchParams({}); }}
              className="absolute right-4 text-gray-400 hover:text-white transition-colors"
            >
              <X size={18} />
            </button>
          )}
        </div>

        {/* Floating live suggestion suggestions drop down */}
        {suggestions.length > 0 && (
          <div className="absolute top-full left-0 right-0 mt-2 bg-[#0a0d14]/95 backdrop-blur-xl border border-white/10 rounded-2xl shadow-2xl overflow-hidden z-50 animate-fadeIn">
            {suggestions.map((s: any, i) => (
              <button
                key={i}
                type="button"
                onClick={() => { 
                  addSearchHistory(s.title);
                  setQuery(s.title);
                  setSuggestions([]);
                  navigate(`/anime/${s.id}`);
                }}
                className="w-full text-left px-5 py-3 hover:bg-[#00e5ff]/10 text-gray-300 hover:text-white transition-colors border-b border-white/5 last:border-0 flex items-center justify-between font-medium text-sm"
              >
                <span>{s.title}</span>
                {s.type && <span className="text-[9px] bg-[#00e5ff]/20 text-[#00e5ff] font-extrabold px-1.5 py-0.5 rounded tracking-wide uppercase">{s.type}</span>}
              </button>
            ))}
          </div>
        )}
      </form>

      {/* Grid of genre capsules (Clickable like 4Animo) */}
      <div className="mb-6">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-xs font-black uppercase tracking-widest text-[#00e5ff] drop-shadow-[0_0_10px_rgba(0,229,255,0.15)] flex items-center gap-2">
            <Grid size={14} />
            Browse Genres
          </h3>
          {(query || selectedGenre || selectedType || selectedYear || selectedSeason || selectedStatus || selectedLanguage || selectedSort) && (
            <button 
              onClick={handleClearFilters}
              className="text-[10px] bg-red-500/10 hover:bg-red-500/25 text-red-400 border border-red-500/20 px-2.5 py-1 rounded-md font-bold transition-all duration-300 uppercase tracking-wider cursor-pointer"
            >
              Reset Filters
            </button>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          {genresList.map((genre) => {
            const isHighlighted = (selectedGenre === genre) || (findGenreMatch(query) === genre);
            return (
              <button
                key={genre}
                onClick={() => handleGenreToggle(genre)}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold uppercase tracking-wider border transition-all duration-300 cursor-pointer ${
                  isHighlighted
                    ? 'bg-gradient-to-r from-[#00e5ff] to-cyan-500 text-black border-transparent shadow-[0_0_15px_rgba(0,229,255,0.3)] scale-105 font-black'
                    : 'bg-[#0a0d14]/40 hover:bg-[#00e5ff]/5 text-gray-400 hover:text-white border-white/5 hover:border-[#00e5ff]/20'
                }`}
              >
                {genre}
              </button>
            );
          })}
        </div>
      </div>

      {/* Multi-Filter dropdowns bar */}
      <div className="bg-[#070a12]/30 border border-white/5 rounded-xl p-4 mb-8">
        <div className="flex items-center justify-between mb-4 border-b border-white/5 pb-2">
          <div className="flex items-center gap-2 text-white font-bold text-sm">
            <SlidersHorizontal size={14} className="text-[#00e5ff]" />
            <span>Search Filters</span>
          </div>
          <button 
            onClick={() => setShowFilters(!showFilters)}
            className="text-xs text-[#00e5ff] hover:underline cursor-pointer font-bold"
          >
            {showFilters ? 'Hide Filters' : 'Show Filters'}
          </button>
        </div>

        {showFilters && (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-7 gap-3 animate-fadeIn">
            {/* Type */}
            <div className="space-y-1">
              <label className="text-[9px] uppercase font-bold tracking-widest text-gray-500 flex items-center gap-1">
                <Film size={10} /> Type
              </label>
              <select
                value={selectedType}
                onChange={(e) => setSelectedType(e.target.value)}
                className="w-full bg-[#0a0d14] border border-white/10 rounded-lg py-1.5 px-2 text-xs text-gray-300 focus:outline-none focus:border-[#00e5ff] cursor-pointer"
              >
                <option value="">ALL TYPES</option>
                <option value="TV">TV SERIES</option>
                <option value="MOVIE">MOVIE</option>
                <option value="OVA">OVA</option>
                <option value="ONA">ONA</option>
                <option value="SPECIAL">SPECIAL</option>
              </select>
            </div>

            {/* Year */}
            <div className="space-y-1">
              <label className="text-[9px] uppercase font-bold tracking-widest text-gray-500 flex items-center gap-1">
                <Calendar size={10} /> Year
              </label>
              <select
                value={selectedYear}
                onChange={(e) => setSelectedYear(e.target.value)}
                className="w-full bg-[#0a0d14] border border-white/10 rounded-lg py-1.5 px-2 text-xs text-gray-300 focus:outline-none focus:border-[#00e5ff] cursor-pointer"
              >
                <option value="">ALL YEARS</option>
                {YEARS_LIST.map(y => (
                  <option key={y} value={y}>{y}</option>
                ))}
              </select>
            </div>

            {/* Season */}
            <div className="space-y-1">
              <label className="text-[9px] uppercase font-bold tracking-widest text-gray-500 flex items-center gap-1">
                <Calendar size={10} /> Season
              </label>
              <select
                value={selectedSeason}
                onChange={(e) => setSelectedSeason(e.target.value)}
                className="w-full bg-[#0a0d14] border border-white/10 rounded-lg py-1.5 px-2 text-xs text-gray-300 focus:outline-none focus:border-[#00e5ff] cursor-pointer"
              >
                <option value="">ALL SEASONS</option>
                <option value="WINTER">WINTER</option>
                <option value="SPRING">SPRING</option>
                <option value="SUMMER">SUMMER</option>
                <option value="FALL">FALL</option>
              </select>
            </div>

            {/* Status */}
            <div className="space-y-1">
              <label className="text-[9px] uppercase font-bold tracking-widest text-gray-500 flex items-center gap-1">
                <CheckCircle2 size={10} /> Status
              </label>
              <select
                value={selectedStatus}
                onChange={(e) => setSelectedStatus(e.target.value)}
                className="w-full bg-[#0a0d14] border border-white/10 rounded-lg py-1.5 px-2 text-xs text-gray-300 focus:outline-none focus:border-[#00e5ff] cursor-pointer"
              >
                <option value="">ALL STATUS</option>
                <option value="FINISHED">COMPLETED</option>
                <option value="RELEASING">ONGOING</option>
              </select>
            </div>

            {/* Language */}
            <div className="space-y-1">
              <label className="text-[9px] uppercase font-bold tracking-widest text-gray-500 flex items-center gap-1">
                <Volume2 size={10} /> Language
              </label>
              <select
                value={selectedLanguage}
                onChange={(e) => setSelectedLanguage(e.target.value)}
                className="w-full bg-[#0a0d14] border border-white/10 rounded-lg py-1.5 px-2 text-xs text-gray-300 focus:outline-none focus:border-[#00e5ff] cursor-pointer"
              >
                <option value="">SUB & DUB</option>
                <option value="SUB">SUBTITLED (SUB)</option>
                <option value="DUB">DUBBED (DUB)</option>
              </select>
            </div>

            {/* Sort */}
            <div className="space-y-1">
              <label className="text-[9px] uppercase font-bold tracking-widest text-gray-500 flex items-center gap-1">
                <ArrowUpDown size={10} /> Sort By
              </label>
              <select
                value={selectedSort}
                onChange={(e) => setSelectedSort(e.target.value)}
                className="w-full bg-[#0a0d14] border border-white/10 rounded-lg py-1.5 px-2 text-xs text-gray-300 focus:outline-none focus:border-[#00e5ff] cursor-pointer"
              >
                <option value="">POPULARITY</option>
                <option value="score">TOP RATED</option>
                <option value="latest">LATEST RELEASED</option>
              </select>
            </div>

            {/* Clear button inside block */}
            <div className="flex items-end">
              <button
                type="button"
                onClick={handleClearFilters}
                className="w-full bg-white/5 hover:bg-white/10 border border-white/10 text-gray-300 hover:text-white transition py-1.5 rounded-lg text-xs font-bold uppercase tracking-wider cursor-pointer"
              >
                Clear All
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Search results catalog metadata banner */}
      <div className="flex items-center justify-between mb-6 border-b border-white/5 pb-3">
        <div>
          <h2 className="text-sm font-black uppercase tracking-[0.2em] text-[#00e5ff] drop-shadow-[0_0_12px_rgba(0,229,255,0.2)]">
            Filter Results
          </h2>
          <p className="text-[10px] text-gray-500 font-bold uppercase tracking-widest mt-0.5">
            {loading ? 'Finding titles...' : `${totalResults.toLocaleString()} titles matches`}
          </p>
        </div>
        <div className="text-[10px] text-gray-400 font-bold uppercase tracking-widest bg-[#0a0d14]/40 border border-white/5 px-3 py-1.5 rounded-lg">
          Page {page} of {totalPages}
        </div>
      </div>

      {/* Main content grid or loader */}
      {error && (
        <div className="bg-red-500/10 border border-red-500/20 text-red-400 p-4 rounded-xl text-center text-sm font-semibold max-w-xl mx-auto my-12">
          {error}
        </div>
      )}

      {loading ? (
        <div className="flex flex-col items-center justify-center py-24 gap-4">
          <div className="relative w-16 h-16">
            <div className="absolute inset-0 rounded-full border-4 border-[#00e5ff]/10 border-t-[#00e5ff] animate-spin" />
            <div className="absolute inset-2 rounded-full border-4 border-cyan-400/10 border-b-cyan-400 animate-spin [animation-duration:1.5s]" />
          </div>
          <p className="text-gray-400 text-xs font-bold uppercase tracking-widest animate-pulse">Scanning server repository...</p>
        </div>
      ) : (
        <>
          {results.length > 0 ? (
            <div className="grid grid-cols-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-5 gap-4 md:gap-5">
              {results.map((anime: any) => (
                <AnimeCard key={anime.id} anime={anime} />
              ))}
            </div>
          ) : (
            !error && (
              <div className="text-center py-20 bg-[#0a0d14]/20 border border-white/5 rounded-2xl max-w-xl mx-auto my-6 p-8">
                <p className="text-base text-gray-400 font-bold mb-1">No matches found</p>
                <p className="text-xs text-gray-500">Try modifying your filtering keywords, clearing active genres, or checking another language track.</p>
              </div>
            )
          )}

          {/* Dynamic 4Animo-style Pagination controls */}
          {totalPages > 1 && (
            <div className="flex flex-col items-center gap-4 mt-16 border-t border-white/5 pt-8">
              <div className="flex items-center gap-1 bg-[#070a12]/50 border border-white/5 rounded-xl p-1.5">
                {/* Previous Page */}
                <button
                  onClick={() => handlePageChange(page - 1)}
                  disabled={page === 1}
                  className="p-2 rounded-lg text-gray-400 hover:text-white hover:bg-white/5 disabled:opacity-30 disabled:pointer-events-none transition cursor-pointer"
                  title="Previous Page"
                >
                  <ArrowLeft size={16} />
                </button>

                {/* Page numbers list */}
                {getPageRange().map((p, idx) => (
                  <React.Fragment key={idx}>
                    {p === '...' ? (
                      <span className="px-2 text-gray-600 font-bold select-none text-xs">...</span>
                    ) : (
                      <button
                        onClick={() => handlePageChange(p)}
                        className={`min-w-[32px] h-8 px-2 rounded-lg text-xs font-black uppercase tracking-wider transition-all duration-200 cursor-pointer ${
                          page === p
                            ? 'bg-gradient-to-r from-[#00e5ff] to-cyan-500 text-black shadow-[0_0_12px_rgba(0,229,255,0.25)]'
                            : 'text-gray-400 hover:text-white hover:bg-white/5'
                        }`}
                      >
                        {p}
                      </button>
                    )}
                  </React.Fragment>
                ))}

                {/* Next Page */}
                <button
                  onClick={() => handlePageChange(page + 1)}
                  disabled={page === totalPages}
                  className="p-2 rounded-lg text-gray-400 hover:text-white hover:bg-white/5 disabled:opacity-30 disabled:pointer-events-none transition cursor-pointer"
                  title="Next Page"
                >
                  <ArrowRight size={16} />
                </button>
              </div>

              <div className="text-[10px] text-gray-500 font-bold uppercase tracking-widest">
                Showing results {( (page - 1) * 20 + 1 ).toLocaleString()} - {Math.min(page * 20, totalResults).toLocaleString()} of {totalResults.toLocaleString()}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
