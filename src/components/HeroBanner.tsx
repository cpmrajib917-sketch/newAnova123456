// @ts-nocheck
import React, { useEffect, useState } from 'react';
import { Anime } from '../types';
import { Play, Info, Plus, Star, Calendar, Monitor } from 'lucide-react';
import { Link } from 'react-router-dom';

export function HeroBanner({ trending }: { trending: Anime[] }) {
  const [current, setCurrent] = useState(0);

  useEffect(() => {
    if (!trending || trending.length === 0) return;
    const interval = setInterval(() => {
      setCurrent((c) => (c + 1) % Math.min(trending.length, 5));
    }, 5000);
    return () => clearInterval(interval);
  }, [trending]);

  if (!trending || trending.length === 0) {
    return (
      <div className="h-[45vh] md:h-[65vh] w-full bg-[#050505] animate-pulse flex items-center justify-center border-b border-white/5">
        <div className="w-12 h-12 rounded-full border-4 border-primary/20 border-t-primary animate-spin" />
      </div>
    );
  }

  const animes = trending.slice(0, 5);
  const anime = animes[current];

  if (!anime) return null;

  return (
    <div className="relative w-full h-[50vh] md:h-[70vh] overflow-hidden bg-[#020408] border-b border-white/5">
      {/* Background Banner Slides */}
      {animes.map((item, idx) => (
        <div 
          key={item.id}
          className="absolute inset-0 transition-opacity duration-1000"
          style={{ opacity: idx === current ? 1 : 0 }}
        >
          <img 
            src={item.banner || item.poster || null} 
            alt={item.title}
            referrerPolicy="no-referrer"
            className="w-full h-full object-cover object-[center_15%] opacity-70 md:opacity-45 transition-transform duration-[5000ms] ease-out"
            style={{ transform: idx === current ? 'scale(1.01)' : 'scale(1.0)' }}
            onError={(e) => {
              e.currentTarget.src = 'https://images.unsplash.com/photo-1542751371-adc38448a05e?w=1600&auto=format&fit=crop&q=80';
            }}
          />
          {/* Subtle cinematic gradient overlays */}
          <div className="absolute inset-0 bg-gradient-to-t from-[#050505] via-[#050505]/50 to-transparent" />
          <div className="absolute inset-0 bg-gradient-to-r from-[#050505] via-[#050505]/40 to-transparent" />
        </div>
      ))}

      {/* Floating glassmorphic corner accents */}
      <div className="absolute top-0 left-0 w-full h-24 bg-gradient-to-b from-[#050505] to-transparent pointer-events-none" />

      {/* Slide Content */}
      <div className="absolute inset-0 max-w-7xl mx-auto px-4 md:px-8 flex flex-col justify-end pb-12 z-10">
        <div className="max-w-3xl space-y-3">
          {/* Status badge */}
          <div className="flex flex-wrap items-center gap-2 mb-1">
            <span className="bg-primary/10 border border-primary/20 text-primary text-[10px] md:text-xs font-black px-2.5 py-1 rounded-md uppercase tracking-widest flex items-center gap-1 shadow-[0_0_15px_rgba(0,229,255,0.1)]">
              <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
              Spotlight #{current + 1}
            </span>
            {anime.studio && (
              <span className="bg-white/5 border border-white/10 text-gray-300 text-[10px] md:text-xs font-bold px-2 py-0.5 rounded-md">
                {anime.studio}
              </span>
            )}
          </div>

          <h1 className="text-2xl sm:text-4xl md:text-5xl font-black text-white leading-tight tracking-tight drop-shadow-[0_2px_10px_rgba(0,0,0,0.8)] line-clamp-2">
            {anime.title}
          </h1>
          
          {/* Metadata Row */}
          <div className="flex flex-wrap items-center gap-3.5 text-xs md:text-sm text-gray-300 font-semibold">
            {anime.rating && (
              <span className="flex items-center gap-1 text-yellow-400 bg-yellow-400/10 border border-yellow-400/20 px-2 py-0.5 rounded">
                <Star size={12} fill="currentColor" />
                {anime.rating}
              </span>
            )}
            {anime.type && (
              <span className="bg-white/10 px-2 py-0.5 rounded text-[11px] md:text-xs font-black text-white">
                {anime.type}
              </span>
            )}
            {anime.episodes && (
              <span className="flex items-center gap-1 text-gray-400">
                <Monitor size={12} />
                {anime.episodes} Episodes
              </span>
            )}
            <span className="text-gray-400">•</span>
            <span className="text-primary font-bold">SUB / DUB</span>
          </div>

          <p className="text-gray-400 max-w-2xl text-xs md:text-sm leading-relaxed line-clamp-2 md:line-clamp-3">
            {anime.description || "Embark on an incredible streaming experience. Watch premium anime releases with seamless video servers and beautiful user interfaces on AnOvA."}
          </p>

          {/* Action Buttons with sleek, moderately-sized designs */}
          <div className="flex flex-wrap items-center gap-3 pt-3">
            <Link
              to={`/watch/${anime.id}`}
              className="flex items-center gap-2 bg-primary hover:bg-[#00cce0] text-black font-black text-xs md:text-sm px-6 py-2.5 rounded-full transition-all duration-300 hover:shadow-[0_0_25px_rgba(0,229,255,0.5)] active:scale-95"
            >
              <Play fill="black" size={14} />
              WATCH NOW
            </Link>

            <Link
              to={`/anime/${anime.id}`}
              className="flex items-center gap-2 bg-white/5 hover:bg-white/10 text-white font-bold text-xs md:text-sm px-6 py-2.5 rounded-full border border-white/10 backdrop-blur-md transition-all active:scale-95"
            >
              <Info size={14} className="text-[#00e5ff]" />
              DETAILS
            </Link>
          </div>
        </div>
      </div>

      {/* Progress Indicators / Navigation dots */}
      <div className="absolute bottom-6 right-4 md:right-8 flex gap-2.5 z-10">
        {animes.map((_, idx) => (
          <button
            key={idx}
            onClick={() => setCurrent(idx)}
            className={`h-1.5 rounded-full transition-all duration-500 ${
              idx === current ? 'w-7 bg-primary' : 'w-1.5 bg-white/20 hover:bg-white/40'
            }`}
            aria-label={`Go to slide ${idx + 1}`}
          />
        ))}
      </div>
    </div>
  );
}
