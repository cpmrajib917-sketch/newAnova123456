// @ts-nocheck
import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, Sparkles, Tv, Shield, Zap, Compass, ArrowRight, Star } from 'lucide-react';
import { motion } from 'motion/react';

export function Landing() {
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // Trending tags from screenshot and user requests
  const trendingTags = [
    'Solo Leveling Season 2',
    'One Piece',
    'Sakamoto Days',
    'Solo Leveling',
    'Naruto: Shippuden',
    'Blue Lock Season 2',
    'Shangri-La Frontier Season 2',
    'Dandadan'
  ];

  // Canvas Starfield + Shooting Stars Effect
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animationFrameId: number;
    let width = (canvas.width = window.innerWidth);
    let height = (canvas.height = window.innerHeight);

    // Stars
    const numStars = Math.floor((width * height) / 4000);
    const stars: Array<{
      x: number;
      y: number;
      size: number;
      twinkle: number;
      twinkleSpeed: number;
      baseAlpha: number;
    }> = [];

    for (let i = 0; i < numStars; i++) {
      stars.push({
        x: Math.random() * width,
        y: Math.random() * height,
        size: Math.random() * 1.5 + 0.5,
        twinkle: Math.random(),
        twinkleSpeed: 0.005 + Math.random() * 0.015,
        baseAlpha: 0.3 + Math.random() * 0.7
      });
    }

    // Shooting Stars
    const shootingStars: Array<{
      x: number;
      y: number;
      length: number;
      speed: number;
      dx: number;
      dy: number;
      alpha: number;
      active: boolean;
    }> = [];

    const spawnShootingStar = () => {
      const startX = Math.random() * width;
      const startY = Math.random() * (height * 0.5);
      const angle = Math.PI / 4 + (Math.random() * 0.2 - 0.1); // Around 45 degrees downward
      const speed = 4 + Math.random() * 8;
      
      shootingStars.push({
        x: startX,
        y: startY,
        length: 40 + Math.random() * 80,
        speed: speed,
        dx: Math.cos(angle) * speed,
        dy: Math.sin(angle) * speed,
        alpha: 1.0,
        active: true
      });
    };

    // Spawn periodically
    const spawnInterval = setInterval(() => {
      if (shootingStars.filter(s => s.active).length < 3) {
        spawnShootingStar();
      }
    }, 2000);

    // Handle resizing
    const handleResize = () => {
      if (!canvas) return;
      width = canvas.width = window.innerWidth;
      height = canvas.height = window.innerHeight;
    };
    window.addEventListener('resize', handleResize);

    // Animation Loop
    const render = () => {
      ctx.fillStyle = '#030712'; // Extra dark cosmic navy background
      ctx.fillRect(0, 0, width, height);

      // Create a glowing cosmic nebula background
      const gradient = ctx.createRadialGradient(
        width * 0.5,
        height * 0.4,
        10,
        width * 0.5,
        height * 0.5,
        width * 0.8
      );
      gradient.addColorStop(0, '#091833'); // Celestial deep blue
      gradient.addColorStop(0.5, '#050a14'); // Cosmic slate
      gradient.addColorStop(1, '#02040a'); // Abyssal black
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, width, height);

      // Draw Twinkling Stars
      stars.forEach(star => {
        star.twinkle += star.twinkleSpeed;
        if (star.twinkle > Math.PI * 2) star.twinkle = 0;
        const currentAlpha = star.baseAlpha * (0.3 + 0.7 * Math.abs(Math.sin(star.twinkle)));
        
        ctx.fillStyle = `rgba(255, 255, 255, ${currentAlpha})`;
        ctx.beginPath();
        ctx.arc(star.x, star.y, star.size, 0, Math.PI * 2);
        ctx.fill();

        // Give some random bright stars a cyan/blue glow
        if (star.size > 1.6) {
          ctx.shadowBlur = 8;
          ctx.shadowColor = '#00e5ff';
          ctx.fillStyle = `rgba(165, 243, 252, ${currentAlpha})`;
          ctx.beginPath();
          ctx.arc(star.x, star.y, star.size + 0.5, 0, Math.PI * 2);
          ctx.fill();
          ctx.shadowBlur = 0; // reset
        }
      });

      // Update and Draw Shooting Stars
      shootingStars.forEach(s => {
        if (!s.active) return;

        s.x += s.dx;
        s.y += s.dy;
        s.alpha -= 0.015; // gradual fadeout

        if (s.alpha <= 0 || s.x < 0 || s.x > width || s.y > height) {
          s.active = false;
          return;
        }

        // Draw the tail gradient
        const tailGrad = ctx.createLinearGradient(s.x, s.y, s.x - s.dx * 8, s.y - s.dy * 8);
        tailGrad.addColorStop(0, `rgba(34, 211, 238, ${s.alpha})`); // Cyan head
        tailGrad.addColorStop(0.3, `rgba(99, 102, 241, ${s.alpha * 0.6})`); // Indigo middle
        tailGrad.addColorStop(1, `rgba(15, 23, 42, 0)`); // Slated transparent tail

        ctx.strokeStyle = tailGrad;
        ctx.lineWidth = 2.5;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(s.x, s.y);
        ctx.lineTo(s.x - s.dx * 8, s.y - s.dy * 8);
        ctx.stroke();

        // Glowing spark at head
        ctx.shadowBlur = 12;
        ctx.shadowColor = '#22d3ee';
        ctx.fillStyle = `rgba(255, 255, 255, ${s.alpha})`;
        ctx.beginPath();
        ctx.arc(s.x, s.y, 1.8, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0; // reset
      });

      animationFrameId = requestAnimationFrame(render);
    };

    render();

    return () => {
      cancelAnimationFrame(animationFrameId);
      clearInterval(spawnInterval);
      window.removeEventListener('resize', handleResize);
    };
  }, []);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (query.trim()) {
      navigate(`/search?q=${encodeURIComponent(query.trim())}`);
    }
  };

  const handleTagClick = (tag: string) => {
    navigate(`/search?q=${encodeURIComponent(tag)}`);
  };

  return (
    <div className="relative min-h-screen text-white overflow-x-hidden flex flex-col justify-between" id="landing-container">
      {/* Immersive Galaxy Canvas Background */}
      <canvas ref={canvasRef} className="absolute inset-0 w-full h-full object-cover pointer-events-none z-0" />

      {/* Nebula ambient overlay filters */}
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_20%,rgba(99,102,241,0.15)_0%,transparent_50%)] pointer-events-none z-0" />
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_80%_85%,rgba(6,182,212,0.12)_0%,transparent_45%)] pointer-events-none z-0" />

      {/* Header/Logo */}
      <header className="relative w-full max-w-7xl mx-auto px-6 h-20 flex items-center justify-between z-10">
        <div className="flex items-center gap-2">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-indigo-600 via-blue-500 to-cyan-400 p-[1px] shadow-[0_0_20px_rgba(99,102,241,0.4)]">
            <div className="w-full h-full bg-[#030712] rounded-[11px] flex items-center justify-center">
              <span className="font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-cyan-300 text-lg">A</span>
            </div>
          </div>
          <span className="text-2xl font-black tracking-tighter bg-clip-text text-transparent bg-gradient-to-r from-white via-slate-100 to-blue-200">
            AnOvA<span className="text-cyan-400">.</span>
          </span>
        </div>

        <button 
          onClick={() => navigate('/home')}
          className="text-sm font-semibold tracking-wide text-cyan-400/80 hover:text-cyan-300 flex items-center gap-1.5 transition-all group"
        >
          Skip to Library
          <ArrowRight size={14} className="group-hover:translate-x-1 transition-transform" />
        </button>
      </header>

      {/* Main Content Hero */}
      <main className="relative flex-1 flex flex-col items-center justify-center px-4 py-12 z-10 max-w-4xl mx-auto text-center">
        {/* Visual Badge */}
        <motion.div 
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-indigo-500/10 border border-indigo-500/25 shadow-[0_0_15px_rgba(99,102,241,0.15)] text-indigo-300 text-xs font-semibold mb-6 tracking-wide uppercase backdrop-blur-md"
        >
          <Sparkles size={13} className="text-cyan-400 animate-pulse" />
          The Ultimate Galactic Anime Streaming Portal
        </motion.div>

        {/* Display Heading */}
        <motion.h1 
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.7, delay: 0.1 }}
          className="text-4xl sm:text-6xl md:text-7xl font-black tracking-tight leading-tight mb-6"
        >
          Watch Free <span className="text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 via-blue-400 to-indigo-400 drop-shadow-[0_0_30px_rgba(34,211,238,0.25)]">Anime</span> Online
        </motion.h1>

        {/* Dynamic Subheading */}
        <motion.p 
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.8, delay: 0.2 }}
          className="text-sm sm:text-base md:text-lg text-slate-300 max-w-2xl mx-auto mb-10 leading-relaxed font-medium"
        >
          Stream thousands of HD anime episodes in English Sub & Dub — zero advertisements, zero clutter, purely premium anime experiences tailored for you.
        </motion.p>

        {/* Trending Searches Tags in 3 elegant lines */}
        <motion.div 
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.8, delay: 0.3 }}
          className="flex flex-col items-center gap-4 w-full mb-12"
        >
          <span className="text-xs font-semibold uppercase tracking-widest text-slate-400 flex items-center gap-1.5 bg-[#00e5ff]/5 px-3 py-1 rounded-full border border-[#00e5ff]/10">
            <Star size={11} className="text-amber-400 animate-spin [animation-duration:10s]" />
            Trending Galactic Queries
          </span>
          <div className="flex flex-col items-center gap-3.5 max-w-2xl w-full">
            <div className="flex flex-wrap justify-center gap-2">
              {['Solo Leveling Season 2', 'One Piece', 'Sakamoto Days'].map((tag, idx) => (
                <button
                  key={idx}
                  onClick={() => handleTagClick(tag)}
                  className="px-4 py-2 rounded-full bg-[#0b1528]/60 border border-cyan-500/10 hover:border-[#00e5ff]/40 hover:bg-cyan-950/40 text-xs text-slate-300 hover:text-[#00e5ff] transition-all font-semibold shadow-sm backdrop-blur-md hover:scale-[1.03] active:scale-95 duration-200"
                >
                  {tag}
                </button>
              ))}
            </div>
            <div className="flex flex-wrap justify-center gap-2">
              {['Solo Leveling', 'Naruto: Shippuden', 'Blue Lock Season 2'].map((tag, idx) => (
                <button
                  key={idx}
                  onClick={() => handleTagClick(tag)}
                  className="px-4 py-2 rounded-full bg-[#0b1528]/60 border border-cyan-500/10 hover:border-[#00e5ff]/40 hover:bg-cyan-950/40 text-xs text-slate-300 hover:text-[#00e5ff] transition-all font-semibold shadow-sm backdrop-blur-md hover:scale-[1.03] active:scale-95 duration-200"
                >
                  {tag}
                </button>
              ))}
            </div>
            <div className="flex flex-wrap justify-center gap-2">
              {['Shangri-La Frontier Season 2', 'Dandadan'].map((tag, idx) => (
                <button
                  key={idx}
                  onClick={() => handleTagClick(tag)}
                  className="px-4 py-2 rounded-full bg-[#0b1528]/60 border border-cyan-500/10 hover:border-[#00e5ff]/40 hover:bg-cyan-950/40 text-xs text-slate-300 hover:text-[#00e5ff] transition-all font-semibold shadow-sm backdrop-blur-md hover:scale-[1.03] active:scale-95 duration-200"
                >
                  {tag}
                </button>
              ))}
            </div>
          </div>
        </motion.div>

        {/* Enter Library Button Call To Action */}
        <motion.div 
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.5 }}
        >
          <button
            onClick={() => navigate('/home')}
            className="group relative inline-flex items-center gap-2 px-8 py-4 rounded-2xl bg-gradient-to-r from-indigo-600 to-blue-600 hover:from-indigo-500 hover:to-blue-500 text-white font-extrabold text-sm sm:text-base tracking-wider uppercase shadow-[0_0_30px_rgba(99,102,241,0.4)] hover:shadow-[0_0_40px_rgba(99,102,241,0.6)] hover:scale-[1.02] transition-all cursor-pointer overflow-hidden"
          >
            {/* Glossy overlay sheen */}
            <span className="absolute inset-0 bg-white/10 translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-1000 ease-out" />
            
            Browse Anime Library
            <ArrowRight size={18} className="group-hover:translate-x-1.5 transition-transform" />
          </button>
        </motion.div>
      </main>

      {/* Premium Bento Feature Section (Why AnOvA is Best) */}
      <section className="relative w-full max-w-7xl mx-auto px-6 pb-20 z-10">
        <div className="text-center mb-12">
          <h2 className="text-2xl sm:text-3xl font-black tracking-tight mb-2">
            Why <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-cyan-300">AnOvA</span> is the Premium Anime Haven
          </h2>
          <p className="text-xs sm:text-sm text-slate-400 max-w-lg mx-auto">
            Experience celestial streaming with optimized infrastructure crafted for high performance.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {/* Feature 1 */}
          <div className="p-6 rounded-2xl bg-[#090d1a]/60 border border-blue-900/30 backdrop-blur-md shadow-[0_4px_30px_rgba(0,0,0,0.4)] hover:border-cyan-500/30 transition-all group hover:-translate-y-1 duration-300">
            <div className="w-12 h-12 rounded-xl bg-cyan-500/10 flex items-center justify-center text-cyan-400 mb-4 group-hover:bg-cyan-500/20 group-hover:scale-110 transition-all">
              <Tv size={24} />
            </div>
            <h3 className="text-lg font-bold mb-2 text-slate-100 group-hover:text-cyan-300 transition-colors">Galactic Ultra-HD</h3>
            <p className="text-xs text-slate-400 leading-relaxed">
              Crystal clear high-definition streams supporting multiple adaptive qualities, instantly catering to your bandwidth.
            </p>
          </div>

          {/* Feature 2 */}
          <div className="p-6 rounded-2xl bg-[#090d1a]/60 border border-blue-900/30 backdrop-blur-md shadow-[0_4px_30px_rgba(0,0,0,0.4)] hover:border-indigo-500/30 transition-all group hover:-translate-y-1 duration-300">
            <div className="w-12 h-12 rounded-xl bg-indigo-500/10 flex items-center justify-center text-indigo-400 mb-4 group-hover:bg-indigo-500/20 group-hover:scale-110 transition-all">
              <Shield size={24} />
            </div>
            <h3 className="text-lg font-bold mb-2 text-slate-100 group-hover:text-indigo-300 transition-colors">Zero Intrusive Ads</h3>
            <p className="text-xs text-slate-400 leading-relaxed">
              No continuous popup interruptions, clickbait redirection, or clutter. Just continuous, pristine anime streaming.
            </p>
          </div>

          {/* Feature 3 */}
          <div className="p-6 rounded-2xl bg-[#090d1a]/60 border border-blue-900/30 backdrop-blur-md shadow-[0_4px_30px_rgba(0,0,0,0.4)] hover:border-cyan-500/30 transition-all group hover:-translate-y-1 duration-300">
            <div className="w-12 h-12 rounded-xl bg-cyan-500/10 flex items-center justify-center text-cyan-400 mb-4 group-hover:bg-cyan-500/20 group-hover:scale-110 transition-all">
              <Zap size={24} />
            </div>
            <h3 className="text-lg font-bold mb-2 text-slate-100 group-hover:text-cyan-300 transition-colors">Instant Update Sync</h3>
            <p className="text-xs text-slate-400 leading-relaxed">
              Fresh subbed and dubbed anime episodes delivered minutes after their official broadcast release.
            </p>
          </div>

          {/* Feature 4 */}
          <div className="p-6 rounded-2xl bg-[#090d1a]/60 border border-blue-900/30 backdrop-blur-md shadow-[0_4px_30px_rgba(0,0,0,0.4)] hover:border-indigo-500/30 transition-all group hover:-translate-y-1 duration-300">
            <div className="w-12 h-12 rounded-xl bg-indigo-500/10 flex items-center justify-center text-indigo-400 mb-4 group-hover:bg-indigo-500/20 group-hover:scale-110 transition-all">
              <Compass size={24} />
            </div>
            <h3 className="text-lg font-bold mb-2 text-slate-100 group-hover:text-indigo-300 transition-colors">Smart Recommendations</h3>
            <p className="text-xs text-slate-400 leading-relaxed">
              Discover customized content with advanced filters and real-time trending charts tailored for cosmic anime lovers.
            </p>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="relative w-full py-6 border-t border-slate-900 z-10 text-center text-xs text-slate-500">
        <p>&copy; {new Date().getFullYear()} AnOvA Anime Network. Dedicated with love for a premier anime ecosystem.</p>
      </footer>
    </div>
  );
}
