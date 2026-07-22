// @ts-nocheck
import React from 'react';

export function Loading() {
  return (
    <div
      className="fixed inset-0 flex flex-col items-center justify-center select-none z-50 overflow-hidden bg-gradient-to-b from-[#02040a] via-[#050f21] to-[#010205]"
      id="loading-screen"
    >
      <div className="absolute top-1/4 left-1/4 w-96 h-96 rounded-full bg-cyan-500/10 blur-[120px] animate-pulse pointer-events-none" />
      <div className="absolute bottom-1/4 right-1/4 w-96 h-96 rounded-full bg-blue-600/10 blur-[150px] animate-pulse pointer-events-none [animation-delay:2s]" />
      <div className="absolute inset-0 opacity-40 pointer-events-none bg-[radial-gradient(#ffffff_1px,transparent_1px)] [background-size:24px_24px] [mask-image:radial-gradient(ellipse_at_center,black_60%,transparent_100%)]" />

      <div className="text-center space-y-8 flex flex-col items-center relative z-10">
        <div className="space-y-2">
          <h1 className="text-5xl md:text-6xl font-black tracking-tighter text-white drop-shadow-[0_0_20px_rgba(0,229,255,0.3)]">
            AnOvA<span className="text-primary">.</span>
          </h1>
          <p className="text-[10px] text-cyan-400/70 font-semibold tracking-[0.35em] uppercase">
            Celestial Streaming Engine
          </p>
        </div>

        <div className="relative flex items-center justify-center py-4">
          <div className="w-16 h-16 border-4 border-white/5 border-t-primary rounded-full animate-spin shadow-[0_0_15px_rgba(0,229,255,0.2)]"></div>
          <div className="absolute w-8 h-8 border-4 border-primary/20 border-t-transparent rounded-full animate-spin [animation-direction:reverse]"></div>
          <div className="absolute w-2 h-2 bg-primary rounded-full animate-ping"></div>
        </div>

        <p className="text-xs text-gray-400/80 font-bold tracking-[0.3em] uppercase">
          Syncing Galaxy Database...
        </p>
      </div>
    </div>
  );
}
