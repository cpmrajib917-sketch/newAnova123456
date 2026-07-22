// @ts-nocheck
import React from 'react';
import { Link } from 'react-router-dom';
import { Play, Star, Captions, Mic } from 'lucide-react';
import { Anime } from '../types';
import { cn } from '../lib/utils';
import { prefetchAnime } from '../lib/api';

interface AnimeCardProps {
  anime: Anime;
  className?: string;
  key?: any;
}

export function AnimeCard({ anime, className }: AnimeCardProps) {
  // Deterministically decide language badge availability
  const hasSub = anime.subAvailable !== undefined ? anime.subAvailable : true;
  const hasDub = anime.dubAvailable !== undefined ? anime.dubAvailable : (Number(anime.id) % 2 === 0 || anime.title.length % 2 === 0);
  const hasHindi = anime.hindiAvailable !== undefined ? anime.hindiAvailable : false;
  const hasMulti = anime.multiAvailable !== undefined ? anime.multiAvailable : false;

  const languages: string[] = [];
  if (hasSub) languages.push('SUB');
  if (hasDub) languages.push('ENG DUB');
  if (hasHindi) languages.push('HINDI DUB');
  if (hasMulti) languages.push('MULTI AUDIO');

  return (
    <Link
      to={`/anime/${anime.id}`}
      onMouseEnter={() => prefetchAnime(anime.id)}
      className={cn(
        "group block relative rounded-xl overflow-hidden bg-[#0a0d14]/80 hover:bg-[#0e1320] border border-white/5 shadow-lg transition-transform duration-150 ease-out hover:scale-[1.02] hover:border-primary/30",
        className
      )}
    >
      {/* Poster Aspect Ratio Container (Custom 180x280 aspect matches 9:14 perfectly) */}
      <div className="aspect-[9/14] relative overflow-hidden bg-[#03060c] select-none">
        <img
          src={anime.poster || null}
          alt={anime.title}
          loading="lazy"
          decoding="async"
          referrerPolicy="no-referrer"
          className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-103"
          onError={(e) => {
            e.currentTarget.src = 'https://images.unsplash.com/photo-1578632767115-351597cf2477?w=300&auto=format&fit=crop&q=80';
          }}
        />

        {/* Cinematic Backdrop Gradient Overlay */}
        <div className="absolute inset-0 bg-gradient-to-t from-[#050914] via-[#050914]/20 to-transparent opacity-90 group-hover:opacity-100 transition-opacity duration-300" />

        {/* Hover Action Play Overlay */}
        <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all duration-300 scale-90 group-hover:scale-100">
          <div className="w-10 h-10 md:w-12 md:h-12 rounded-full bg-primary flex items-center justify-center pl-1 text-black shadow-[0_0_20px_rgba(0,229,255,0.6)] border border-primary/20">
            <Play size={18} className="fill-black text-black" />
          </div>
        </div>

        {/* Top Floating Badge Bar */}
        <div className="absolute top-2 left-2 right-2 flex flex-wrap justify-between items-start gap-1 pointer-events-none">
          <div className="flex flex-col gap-1 items-start">
            {anime.type && (
              <span className="bg-primary/95 text-black text-[8px] md:text-[9px] font-black px-1.5 py-0.5 rounded shadow-[0_2px_4px_rgba(0,0,0,0.5)] tracking-wider uppercase shrink-0">
                {anime.type}
              </span>
            )}
          </div>

          {anime.rating && (
            <span className="bg-black/85 text-yellow-400 text-[8px] md:text-[9px] font-black px-1.5 py-0.5 rounded shadow-[0_2px_4px_rgba(0,0,0,0.5)] flex items-center gap-0.5 shrink-0">
              <Star size={8} fill="currentColor" className="text-yellow-400" />
              {anime.rating}
            </span>
          )}
        </div>

        {/* Bottom Floating Badge Bar */}
        <div className="absolute bottom-2 left-2 right-2 flex justify-between items-center gap-1 pointer-events-none z-10">
          {anime.episodes && (
            <span className="bg-cyan-500/15 border border-cyan-500/25 text-primary text-[8px] md:text-[9px] font-black px-1.5 py-0.5 rounded shrink-0">
              EP {anime.episodes}
            </span>
          )}

          <div className="flex flex-wrap gap-0.5 justify-end max-w-[70%]">
            {languages.map((lang) => (
              <span 
                key={lang} 
                className={cn(
                  "text-[6.5px] font-black px-1 py-0.5 rounded border leading-none shrink-0 tracking-wider uppercase",
                  lang === 'SUB' && "bg-black/90 border-white/5 text-gray-300",
                  lang === 'ENG DUB' && "bg-cyan-950/90 border-cyan-500/20 text-primary",
                  lang === 'HINDI DUB' && "bg-rose-950/90 border-rose-500/20 text-rose-400",
                  lang === 'MULTI AUDIO' && "bg-amber-950/90 border-amber-500/20 text-amber-400"
                )}
              >
                {lang}
              </span>
            ))}
          </div>
        </div>
      </div>

      {/* Info Body */}
      <div className="p-2 md:p-3 relative z-10 flex flex-col justify-between flex-1">
        <h3 className="font-bold text-[10px] sm:text-xs md:text-sm line-clamp-2 min-h-[30px] md:min-h-[40px] leading-snug group-hover:text-primary transition-colors text-gray-200">
          {anime.title}
        </h3>
        
        <div className="flex items-center gap-1 mt-1.5 text-[9px] md:text-[10px] text-gray-400 font-medium overflow-hidden">
          {anime.status && (
            <div className="flex items-center gap-1 shrink-0">
              <span className={cn(
                "w-1 md:w-1.5 h-1 md:h-1.5 rounded-full", 
                anime.status === 'Ongoing' || anime.status === 'RELEASING' ? 'bg-primary' : 'bg-gray-500'
              )} />
              <span>{anime.status}</span>
            </div>
          )}
          {anime.studio && (
            <span className="text-gray-500 font-normal truncate">
              • {anime.studio}
            </span>
          )}
        </div>
      </div>
    </Link>
  );
}
