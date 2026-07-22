// @ts-nocheck
import React from 'react';
import { Link } from 'react-router-dom';
import { Anime } from '../types';
import { Star } from 'lucide-react';

export function Top10Ranked({ animes }: { animes: Anime[] }) {
  if (!animes || animes.length === 0) return null;
  
  // Show top 10 ranked items
  const top10 = animes.slice(0, 10);

  return (
    <div className="py-6 overflow-hidden">
      <div className="px-4 mb-6 flex items-center justify-between">
        <h2 className="text-lg md:text-xl font-black text-white tracking-tight flex items-center gap-2">
          <span className="w-1 h-5 bg-primary rounded-full shadow-[0_0_10px_rgba(0,229,255,0.8)]" />
          Top 10 Today
        </h2>
      </div>

      <div className="w-full overflow-x-auto scrollbar-none flex gap-6 px-4 pb-6 pt-2">
        {top10.map((anime, index) => {
          const rank = index + 1;
          return (
            <div 
              key={anime.id} 
              className="flex items-end shrink-0 relative w-[160px] sm:w-[195px] md:w-[230px] group select-none"
            >
              {/* Massive Rank Stroke Number */}
              <div 
                className="absolute -left-4 sm:-left-6 bottom-2 z-10 font-black select-none pointer-events-none tracking-tighter leading-none"
                style={{
                  fontSize: '110px',
                  fontFamily: 'Outfit, sans-serif',
                  WebkitTextStroke: '2px rgba(0, 229, 255, 0.45)',
                  color: 'rgba(5, 5, 5, 0.95)',
                  textShadow: '0 0 15px rgba(0, 229, 255, 0.1)',
                }}
              >
                {rank}
              </div>

              {/* Poster Card overlapping number */}
              <Link 
                to={`/anime/${anime.id}`}
                className="flex-1 aspect-[2/3] relative rounded-xl overflow-hidden bg-[#0a0d14] border border-white/5 shadow-2xl transition-all duration-300 hover:scale-[1.03] hover:border-primary/40 hover:shadow-[0_0_20px_rgba(0,229,255,0.15)] ml-12 sm:ml-14"
              >
                <div className="w-full h-full relative">
                  <img 
                    src={anime.poster || null} 
                    alt={anime.title} 
                    referrerPolicy="no-referrer"
                    className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                    loading="lazy"
                    onError={(e) => {
                      e.currentTarget.src = 'https://images.unsplash.com/photo-1578632767115-351597cf2477?w=300&auto=format&fit=crop&q=80';
                    }}
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/20 to-transparent" />
                  
                  {/* Rating Badge */}
                  {anime.rating && (
                    <div className="absolute top-2 right-2 bg-black/70 backdrop-blur-md px-1.5 py-0.5 rounded text-[9px] font-bold text-yellow-400 flex items-center gap-0.5 shadow-md">
                      <Star size={9} fill="currentColor" />
                      {anime.rating}
                    </div>
                  )}

                  {/* Rating or Studio at bottom */}
                  <div className="absolute bottom-2 left-2 right-2">
                    <p className="text-[10px] md:text-xs font-black text-white truncate drop-shadow-md">
                      {anime.title}
                    </p>
                    <p className="text-[8px] md:text-[9px] text-primary font-bold tracking-wider mt-0.5 uppercase">
                      {anime.studio || 'ANIME'}
                    </p>
                  </div>
                </div>
              </Link>
            </div>
          );
        })}
      </div>
    </div>
  );
}
