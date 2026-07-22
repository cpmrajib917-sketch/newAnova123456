// @ts-nocheck
import React, { useEffect, useRef, useState } from 'react';
import { AnimeCard } from './AnimeCard';
import { Anime } from '../types';

interface AutoSliderProps {
  title: string;
  animes: Anime[];
  direction?: 'left' | 'right';
  key?: string;
}

export function AutoSlider({ title, animes, direction = 'right' }: AutoSliderProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  
  const requestRef = useRef<number | null>(null);
  const translateXRef = useRef(0);
  const isDraggingRef = useRef(false);
  const isHoveredRef = useRef(false);
  const isCooldownRef = useRef(false);
  
  const cooldownTimerRef = useRef<NodeJS.Timeout | null>(null);
  const startXRef = useRef(0);
  const startTranslateXRef = useRef(0);
  const dragDistanceRef = useRef(0);

  // Triple the items for a seamless, endless infinite loop wrapping
  const tripledAnimes = [...animes, ...animes, ...animes];

  useEffect(() => {
    const track = trackRef.current;
    if (!track || animes.length === 0) return;

    // Set initial centered position so wrapping works in both left and right directions smoothly
    const singleSetWidth = track.scrollWidth / 3;
    translateXRef.current = -singleSetWidth;
    track.style.transform = `translate3d(${translateXRef.current}px, 0, 0)`;

    const tick = () => {
      if (!trackRef.current) {
        requestRef.current = requestAnimationFrame(tick);
        return;
      }

      // Only auto-scroll if not dragging, not hovered, and not in the 2s cooldown period
      if (!isDraggingRef.current && !isHoveredRef.current && !isCooldownRef.current) {
        const speed = 0.5; // continuous smooth speed (pixels per frame)
        
        if (direction === 'right') {
          translateXRef.current -= speed;
        } else {
          translateXRef.current += speed;
        }

        // Infinite wrap-around math
        const setWidth = trackRef.current.scrollWidth / 3;
        if (setWidth > 0) {
          if (direction === 'right') {
            if (translateXRef.current <= -setWidth * 2) {
              translateXRef.current += setWidth;
            }
          } else {
            if (translateXRef.current >= -setWidth) {
              translateXRef.current -= setWidth;
            }
          }
        }

        trackRef.current.style.transform = `translate3d(${translateXRef.current}px, 0, 0)`;
      }

      requestRef.current = requestAnimationFrame(tick);
    };

    requestRef.current = requestAnimationFrame(tick);

    return () => {
      if (requestRef.current) cancelAnimationFrame(requestRef.current);
      if (cooldownTimerRef.current) clearTimeout(cooldownTimerRef.current);
    };
  }, [animes, direction]);

  if (!animes || animes.length === 0) return null;

  // Touch and Mouse Drag / Swipe Handlers
  const handleDragStart = (clientX: number) => {
    isDraggingRef.current = true;
    startXRef.current = clientX;
    startTranslateXRef.current = translateXRef.current;
    dragDistanceRef.current = 0;

    // Pause animation instantly during interaction
    if (cooldownTimerRef.current) clearTimeout(cooldownTimerRef.current);
    isCooldownRef.current = true;
  };

  const handleDragMove = (clientX: number) => {
    if (!isDraggingRef.current || !trackRef.current) return;
    const deltaX = clientX - startXRef.current;
    dragDistanceRef.current = Math.abs(deltaX);

    let newTranslateX = startTranslateXRef.current + deltaX;

    // Wrap seamlessly during active manual dragging
    const setWidth = trackRef.current.scrollWidth / 3;
    if (setWidth > 0) {
      if (newTranslateX <= -setWidth * 2) {
        newTranslateX += setWidth;
        startXRef.current += setWidth;
        startTranslateXRef.current += setWidth;
      } else if (newTranslateX >= 0) {
        newTranslateX -= setWidth;
        startXRef.current -= setWidth;
        startTranslateXRef.current -= setWidth;
      }
    }

    translateXRef.current = newTranslateX;
    trackRef.current.style.transform = `translate3d(${newTranslateX}px, 0, 0)`;
  };

  const handleDragEnd = () => {
    if (!isDraggingRef.current) return;
    isDraggingRef.current = false;

    // Wait exactly 2 seconds before resuming the auto-scroll ticker animation
    if (cooldownTimerRef.current) clearTimeout(cooldownTimerRef.current);
    cooldownTimerRef.current = setTimeout(() => {
      isCooldownRef.current = false;
    }, 2000);
  };

  // Prevent card navigation clicks if the user was actively dragging
  const handleCardClickCapture = (e: React.MouseEvent) => {
    if (dragDistanceRef.current > 8) {
      e.preventDefault();
      e.stopPropagation();
    }
  };

  return (
    <div className="py-6 overflow-hidden relative">
      <div className="px-4 mb-4 flex items-center justify-between">
        <h2 className="text-lg md:text-xl font-black text-white tracking-tight flex items-center gap-2">
          <span className="w-1 h-5 bg-primary rounded-full shadow-[0_0_10px_rgba(0,229,255,0.8)]" />
          {title}
        </h2>
      </div>

      <div
        ref={containerRef}
        className="w-full overflow-hidden cursor-grab active:cursor-grabbing select-none"
        onMouseDown={(e) => handleDragStart(e.clientX)}
        onMouseMove={(e) => handleDragMove(e.clientX)}
        onMouseUp={handleDragEnd}
        onMouseLeave={() => {
          isHoveredRef.current = false;
          handleDragEnd();
        }}
        onMouseEnter={() => {
          isHoveredRef.current = true;
        }}
        onTouchStart={(e) => handleDragStart(e.touches[0].clientX)}
        onTouchMove={(e) => handleDragMove(e.touches[0].clientX)}
        onTouchEnd={handleDragEnd}
      >
        <div
          ref={trackRef}
          onClickCapture={handleCardClickCapture}
          className="flex gap-3 md:gap-4 px-4 will-change-transform"
          style={{ width: 'max-content' }}
        >
          {tripledAnimes.map((anime, index) => (
            <div
               key={`${anime.id}-${index}`}
               className="w-[125px] sm:w-[160px] md:w-[200px] shrink-0 snap-start"
            >
              <AnimeCard anime={anime} />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
