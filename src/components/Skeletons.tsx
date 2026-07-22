// @ts-nocheck
import React from 'react';

export function HeroBannerSkeleton() {
  return (
    <div className="relative w-full h-[50vh] md:h-[70vh] overflow-hidden bg-[#020408] border-b border-white/5 animate-pulse">
      <div className="absolute inset-0 bg-gradient-to-t from-[#050505] via-[#050505]/50 to-transparent" />
      <div className="absolute inset-0 max-w-7xl mx-auto px-4 md:px-8 flex flex-col justify-end pb-12 z-10 space-y-4">
        <div className="w-32 h-6 bg-white/5 border border-white/10 rounded-md" />
        <div className="w-2/3 md:w-1/2 h-10 md:h-12 bg-white/10 rounded-lg" />
        <div className="flex gap-4">
          <div className="w-16 h-4 bg-white/5 rounded" />
          <div className="w-12 h-4 bg-white/5 rounded" />
          <div className="w-20 h-4 bg-white/5 rounded" />
        </div>
        <div className="w-full max-w-2xl h-16 bg-white/5 rounded-lg" />
        <div className="flex gap-3">
          <div className="w-32 h-10 bg-white/10 rounded-full" />
          <div className="w-32 h-10 bg-white/5 rounded-full" />
        </div>
      </div>
    </div>
  );
}

export function AutoSliderSkeleton() {
  return (
    <div className="py-6 overflow-hidden relative">
      <div className="px-4 mb-4 flex items-center">
        <div className="w-1 h-5 bg-primary/40 rounded-full mr-2" />
        <div className="w-40 h-6 bg-white/10 rounded animate-pulse" />
      </div>
      <div className="w-full overflow-hidden">
        <div className="flex gap-3 md:gap-4 px-4">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div key={i} className="w-[125px] sm:w-[160px] md:w-[200px] shrink-0">
              <div className="aspect-[9/14] bg-white/5 rounded-xl border border-white/5 animate-pulse relative" />
              <div className="mt-3 space-y-2">
                <div className="w-3/4 h-3 bg-white/5 rounded animate-pulse" />
                <div className="w-1/2 h-3 bg-white/5 rounded animate-pulse" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export function Top10RankedSkeleton() {
  return (
    <div className="py-6 overflow-hidden">
      <div className="px-4 mb-6 flex items-center">
        <div className="w-1 h-5 bg-primary/40 rounded-full mr-2" />
        <div className="w-32 h-6 bg-white/10 rounded animate-pulse" />
      </div>
      <div className="w-full flex gap-6 px-4 pb-4 overflow-hidden">
        {[1, 2, 3, 4, 5].map((i) => (
          <div key={i} className="flex items-end shrink-0 relative w-[160px] sm:w-[190px] md:w-[220px]">
            <div className="w-12 h-20 bg-white/5 rounded animate-pulse" />
            <div className="w-full aspect-[2/3] bg-white/5 rounded-xl border border-white/5 animate-pulse ml-10 sm:ml-12 relative" />
          </div>
        ))}
      </div>
    </div>
  );
}
