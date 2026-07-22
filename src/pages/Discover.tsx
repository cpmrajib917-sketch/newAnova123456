// @ts-nocheck
import React, { useState, useEffect } from 'react';
import { Compass, Filter, Calendar, Tv, Film } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../lib/api';

const DEFAULT_GENRES = ['Action', 'Adventure', 'Fantasy', 'Romance', 'Comedy', 'Drama', 'Isekai', 'Sports', 'Mecha', 'Sci-Fi'];

export function Discover() {
  const navigate = useNavigate();
  const [randomLoading, setRandomLoading] = useState(false);
  const [genres, setGenres] = useState(DEFAULT_GENRES);

  useEffect(() => {
    let active = true;
    api.getAllGenres().then(list => {
      if (active && list && list.length > 0) {
        setGenres(list);
      }
    });
    return () => { active = false; };
  }, []);

  const handleRandomAnime = async () => {
    if (randomLoading) return;
    setRandomLoading(true);
    try {
      const homeData = await api.home();
      const list = [
        ...(homeData?.data?.trending || []),
        ...(homeData?.data?.mostPopular || []),
        ...(homeData?.data?.newAdded || []),
        ...(homeData?.data?.topAiring?.all || [])
      ];
      
      if (list.length > 0) {
        const randomItem = list[Math.floor(Math.random() * list.length)];
        navigate(`/anime/${randomItem.id}`);
      } else {
        // Fallback popular series
        navigate(`/anime/21`);
      }
    } catch (error) {
      console.error('Failed to select random anime:', error);
      navigate(`/anime/21`);
    } finally {
      setRandomLoading(false);
    }
  };

  return (
    <div className="min-h-screen pt-24 px-4 max-w-7xl mx-auto pb-20">
      <div className="flex items-center gap-4 mb-12">
        <Compass size={32} className="text-primary drop-shadow-[0_0_10px_rgba(0,229,255,0.4)]" />
        <h1 className="text-3xl font-black text-white tracking-tight">Discover</h1>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
        <div className="col-span-2 space-y-12">
          <section>
            <div className="flex items-center gap-2 mb-6">
              <Filter className="text-primary" size={20} />
              <h2 className="text-xl font-bold">Browse by Genre</h2>
            </div>
            <div className="flex flex-wrap gap-3">
              {genres.map(g => (
                <Link key={g} to={`/search?q=${g}`} className="bg-card hover:bg-white/10 border border-white/5 px-6 py-3 rounded-xl font-medium transition-colors">
                  {g}
                </Link>
              ))}
            </div>
          </section>

          <section>
            <div className="flex items-center gap-2 mb-6">
              <Calendar className="text-primary" size={20} />
              <h2 className="text-xl font-bold">Seasonal</h2>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              {['Winter 2026', 'Spring 2026', 'Summer 2026', 'Fall 2026'].map(s => (
                <Link 
                  key={s} 
                  to={`/search?q=${encodeURIComponent(s)}`}
                  className="bg-card hover:border-primary/50 border border-white/5 aspect-video rounded-xl flex items-center justify-center font-bold text-center transition-all duration-300 hover:scale-[1.03] shadow-lg cursor-pointer"
                >
                  {s}
                </Link>
              ))}
            </div>
          </section>
        </div>

        <div className="space-y-6">
          <div className="bg-card p-6 rounded-2xl border border-white/5">
            <h3 className="text-lg font-bold mb-4 text-white">Format</h3>
            <div className="space-y-2">
              <button 
                onClick={() => navigate('/search?q=TV')}
                className="w-full flex items-center gap-3 bg-black/50 hover:bg-[#00e5ff]/10 hover:text-white hover:border-[#00e5ff]/20 border border-transparent p-3 rounded-xl transition-all font-semibold text-gray-300"
              >
                <Tv size={18} className="text-primary" /> TV Series
              </button>
              <button 
                onClick={() => navigate('/search?q=Movie')}
                className="w-full flex items-center gap-3 bg-black/50 hover:bg-[#00e5ff]/10 hover:text-white hover:border-[#00e5ff]/20 border border-transparent p-3 rounded-xl transition-all font-semibold text-gray-300"
              >
                <Film size={18} className="text-primary" /> Movies
              </button>
            </div>
          </div>
          
          <div className="bg-card p-6 rounded-2xl border border-white/5 relative overflow-hidden group cursor-pointer" onClick={handleRandomAnime}>
            <div className="absolute inset-0 bg-gradient-to-br from-primary/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
            <h3 className="text-lg font-bold mb-2 text-white">Surprise Me</h3>
            <p className="text-sm text-gray-400 mb-4">Can't decide what to watch? Let us pick a random anime for you.</p>
            <button 
              disabled={randomLoading}
              onClick={(e) => { e.stopPropagation(); handleRandomAnime(); }}
              className="bg-primary text-black font-bold w-full py-3 rounded-xl hover:scale-[1.02] transition-transform duration-200 shadow-[0_0_20px_rgba(0,229,255,0.3)] flex items-center justify-center gap-2"
            >
              {randomLoading ? (
                <div className="w-5 h-5 border-2 border-black border-t-transparent rounded-full animate-spin" />
              ) : (
                <>🎲 Random Anime</>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
