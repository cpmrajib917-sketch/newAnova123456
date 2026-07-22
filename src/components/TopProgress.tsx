// @ts-nocheck
import React, { useEffect, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';

export function TopProgress({ active }: { active?: boolean }) {
  const [progress, setProgress] = useState(0);
  const [visible, setVisible] = useState(false);
  const location = useLocation();
  const timers = useRef<number[]>([]);

  const clear = () => {
    timers.current.forEach((t) => window.clearTimeout(t));
    timers.current = [];
  };

  const start = () => {
    clear();
    setVisible(true);
    setProgress(15);
    timers.current.push(window.setTimeout(() => setProgress(45), 60));
    timers.current.push(window.setTimeout(() => setProgress(75), 160));
    timers.current.push(window.setTimeout(() => setProgress(90), 260));
  };

  const finish = () => {
    clear();
    setProgress(100);
    timers.current.push(window.setTimeout(() => setVisible(false), 220));
    timers.current.push(window.setTimeout(() => setProgress(0), 500));
  };

  // Trigger on route change
  useEffect(() => {
    start();
    const t = window.setTimeout(finish, 260);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.pathname]);

  // Trigger via `active` prop (data loading)
  useEffect(() => {
    if (active) start();
    else if (visible) finish();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active]);

  return (
    <div
      aria-hidden
      className="fixed top-0 left-0 right-0 z-[100] pointer-events-none h-[2px]"
      style={{ opacity: visible ? 1 : 0, transition: 'opacity 200ms ease-out' }}
    >
      <div
        className="h-full bg-gradient-to-r from-[#00e5ff] via-[#00b0ff] to-[#00e5ff] shadow-[0_0_10px_rgba(0,229,255,0.7)]"
        style={{ width: `${progress}%`, transition: 'width 200ms ease-out' }}
      />
    </div>
  );
}
