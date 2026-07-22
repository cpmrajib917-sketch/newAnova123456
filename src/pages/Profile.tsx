// @ts-nocheck
import React, { useState } from 'react';
import { useAppStore } from '../store';
import { Link } from 'react-router-dom';
import { Play, Heart, Bookmark, Trash2, ShieldCheck, Sparkles, User, Settings, Video, FileText, BarChart3, ToggleLeft, ToggleRight } from 'lucide-react';

export function Profile() {
  const { watchHistory, favorites, bookmarks, comments, removeFavorite, removeBookmark } = useAppStore();
  
  const [autoPlay, setAutoPlay] = useState(true);
  const [autoNext, setAutoNext] = useState(true);
  const [autoSkip, setAutoSkip] = useState(false);

  const isLoggedIn = localStorage.getItem('isLoggedIn') === 'true';
  const currentUserEmail = localStorage.getItem('userEmail') || 'guest@anova.xyz';
  const userRole = localStorage.getItem('userRole') || 'user';
  const currentUsername = isLoggedIn ? currentUserEmail.split('@')[0] : 'Guest Streamer';
  const isAdmin = isLoggedIn && (currentUserEmail.trim().toLowerCase() === 'mdido406@gmail.com' || userRole === 'admin');

  const historyList = Object.values(watchHistory || {}).sort((a: any, b: any) => b.updatedAt - a.updatedAt);
  
  // Filter user comments
  const userComments = comments.filter(c => c.email === currentUserEmail);

  return (
    <div className="min-h-screen pt-24 px-4 max-w-7xl mx-auto pb-24 bg-[#050505]">
      {/* 1. Header Profile Banner */}
      <div className="bg-[#0a0d14]/60 border border-white/5 p-6 md:p-8 rounded-3xl mb-8 flex flex-col md:flex-row items-center md:items-start justify-between gap-6 relative overflow-hidden backdrop-blur-md">
        <div className="absolute inset-0 bg-gradient-to-r from-primary/5 to-cyan-500/5 pointer-events-none" />
        
        <div className="flex flex-col md:flex-row items-center gap-6 text-center md:text-left z-10">
          <div className="w-20 h-20 md:w-24 md:h-24 rounded-full bg-primary/20 flex items-center justify-center border-2 border-primary shadow-[0_0_20px_rgba(0,229,255,0.25)] relative group">
            <span className="text-3xl font-black text-primary">{currentUsername.charAt(0).toUpperCase()}</span>
            {isAdmin && (
              <div className="absolute -top-1 -right-1 bg-red-500 text-white p-1 rounded-full border border-[#050505]" title="Administrator">
                <ShieldCheck size={14} />
              </div>
            )}
          </div>
          <div>
            <div className="flex items-center justify-center md:justify-start gap-2 flex-wrap">
              <h1 className="text-2xl md:text-3xl font-black text-white leading-none capitalize">{currentUsername}</h1>
              {isAdmin ? (
                <span className="bg-red-500/10 border border-red-500/20 text-[9px] font-black text-red-400 px-2 py-0.5 rounded-full uppercase tracking-wider flex items-center gap-1">
                  <ShieldCheck size={10} />
                  System Administrator
                </span>
              ) : (
                <span className="bg-primary/10 border border-primary/20 text-[9px] font-black text-primary px-2 py-0.5 rounded-full uppercase tracking-wider flex items-center gap-1">
                  <Sparkles size={10} />
                  Premium Subscriber
                </span>
              )}
            </div>
            <p className="text-gray-400 text-xs mt-2 font-medium">{currentUserEmail}</p>
            <p className="text-[10px] text-gray-500 mt-1">AnOvA Streamer since 2026</p>
          </div>
        </div>

        {/* Admin Navigation Button */}
        {isAdmin && (
          <Link
            to="/admin"
            className="px-5 py-2.5 bg-red-500 hover:bg-red-600 text-white font-black text-xs rounded-lg transition-all shadow-[0_0_20px_rgba(239,68,68,0.2)] hover:scale-105 active:scale-95 flex items-center gap-1.5 z-10 uppercase tracking-wider"
          >
            <ShieldCheck size={14} />
            Enter Admin Panel
          </Link>
        )}
      </div>

      {/* 2. User Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-10">
        <div className="bg-[#0a0d14]/40 border border-white/5 p-4 rounded-2xl">
          <span className="text-gray-500 text-[10px] font-bold uppercase tracking-wider block mb-1">Episodes Watched</span>
          <p className="text-2xl font-black text-white">{historyList.length}</p>
        </div>
        <div className="bg-[#0a0d14]/40 border border-white/5 p-4 rounded-2xl">
          <span className="text-gray-500 text-[10px] font-bold uppercase tracking-wider block mb-1">My Favorites</span>
          <p className="text-2xl font-black text-primary">{favorites.length}</p>
        </div>
        <div className="bg-[#0a0d14]/40 border border-white/5 p-4 rounded-2xl">
          <span className="text-gray-500 text-[10px] font-bold uppercase tracking-wider block mb-1">Bookmarks</span>
          <p className="text-2xl font-black text-white">{bookmarks.length}</p>
        </div>
        <div className="bg-[#0a0d14]/40 border border-white/5 p-4 rounded-2xl">
          <span className="text-gray-500 text-[10px] font-bold uppercase tracking-wider block mb-1">My Comments</span>
          <p className="text-2xl font-black text-white">{userComments.length}</p>
        </div>
      </div>

      {/* 3. Main Dashboard Rows */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        
        {/* Left 2 Columns: Lists */}
        <div className="lg:col-span-2 space-y-10">
          
          {/* CONTINUE WATCHING */}
          <section className="space-y-4">
            <h2 className="text-lg font-black text-white tracking-tight flex items-center gap-2">
              <span className="w-1 h-4 bg-primary rounded-full" />
              Continue Watching
            </h2>
            {historyList.length === 0 ? (
              <div className="p-8 text-center text-gray-500 bg-white/[0.01] rounded-2xl border border-white/5 border-dashed text-xs">
                No watch history found. Start streaming to track progress.
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {historyList.slice(0, 4).map(item => (
                  <Link 
                    key={item.animeId} 
                    to={`/watch/${item.animeId}?ep=${item.episode}`}
                    className="flex gap-4 bg-[#0a0d14]/40 p-3 rounded-2xl border border-white/5 hover:border-primary/50 transition-all duration-300 group"
                  >
                    <img src={item.animePoster || null} alt={item.animeTitle} className="w-16 h-24 object-cover rounded-xl" />
                    <div className="flex-1 flex flex-col justify-between py-1">
                      <div>
                        <h3 className="font-extrabold text-sm text-white line-clamp-1 group-hover:text-primary transition-colors">{item.animeTitle}</h3>
                        <p className="text-xs text-gray-400 mt-1">Episode {item.episode}</p>
                      </div>
                      <div className="w-full bg-[#10141f] rounded-full h-1">
                        <div 
                          className="bg-primary h-1 rounded-full shadow-[0_0_8px_rgba(0,229,255,0.8)]" 
                          style={{ width: item.duration > 0 ? `${(item.time / item.duration) * 100}%` : '40%' }}
                        />
                      </div>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </section>

          {/* FAVORITES */}
          <section className="space-y-4">
            <h2 className="text-lg font-black text-white tracking-tight flex items-center gap-2">
              <span className="w-1 h-4 bg-primary rounded-full" />
              My Favorites
            </h2>
            {favorites.length === 0 ? (
              <div className="p-8 text-center text-gray-500 bg-white/[0.01] rounded-2xl border border-white/5 border-dashed text-xs">
                No favorites added yet.
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
                {favorites.map(anime => (
                  <div key={anime.id} className="relative group">
                    <Link to={`/anime/${anime.id}`} className="block">
                      <div className="aspect-[2/3] overflow-hidden rounded-xl mb-2 relative">
                        <img src={anime.poster || null} alt={anime.title} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
                        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                      </div>
                      <h3 className="text-xs font-bold line-clamp-1 text-gray-300 group-hover:text-primary transition-colors">{anime.title}</h3>
                    </Link>
                    <button 
                      onClick={() => removeFavorite(anime.id)}
                      className="absolute top-2 right-2 p-1.5 rounded-lg bg-black/80 hover:bg-red-500 text-gray-400 hover:text-white backdrop-blur-md opacity-0 group-hover:opacity-100 transition-all duration-200"
                      title="Remove"
                    >
                      <Trash2 size={12} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* BOOKMARKS */}
          <section className="space-y-4">
            <h2 className="text-lg font-black text-white tracking-tight flex items-center gap-2">
              <span className="w-1 h-4 bg-primary rounded-full" />
              Saved Bookmarks
            </h2>
            {bookmarks.length === 0 ? (
              <div className="p-8 text-center text-gray-500 bg-white/[0.01] rounded-2xl border border-white/5 border-dashed text-xs">
                No bookmarks saved yet.
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
                {bookmarks.map(anime => (
                  <div key={anime.id} className="relative group">
                    <Link to={`/anime/${anime.id}`} className="block">
                      <div className="aspect-[2/3] overflow-hidden rounded-xl mb-2 relative">
                        <img src={anime.poster || null} alt={anime.title} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
                        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                      </div>
                      <h3 className="text-xs font-bold line-clamp-1 text-gray-300 group-hover:text-primary transition-colors">{anime.title}</h3>
                    </Link>
                    <button 
                      onClick={() => removeBookmark(anime.id)}
                      className="absolute top-2 right-2 p-1.5 rounded-lg bg-black/80 hover:bg-red-500 text-gray-400 hover:text-white backdrop-blur-md opacity-0 group-hover:opacity-100 transition-all duration-200"
                      title="Remove"
                    >
                      <Trash2 size={12} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </section>

        </div>

        {/* Right 1 Column: Settings & Activities */}
        <div className="space-y-10">
          
          {/* PLAYER PREFERENCES */}
          <section className="bg-[#0a0d14]/40 border border-white/5 p-6 rounded-2xl space-y-4">
            <h2 className="text-sm font-black text-white uppercase tracking-wider flex items-center gap-2 border-b border-white/5 pb-2">
              <Settings size={16} className="text-primary" />
              Streamer Settings
            </h2>
            
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs font-bold text-gray-200">Auto Play Episodes</p>
                  <p className="text-[10px] text-gray-500">Automatically launch episode player</p>
                </div>
                <button onClick={() => setAutoPlay(!autoPlay)} className="text-primary hover:opacity-80 transition-all">
                  {autoPlay ? <ToggleRight size={28} /> : <ToggleLeft size={28} className="text-gray-600" />}
                </button>
              </div>

              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs font-bold text-gray-200">Auto Next Episode</p>
                  <p className="text-[10px] text-gray-500">Loads next episode automatically</p>
                </div>
                <button onClick={() => setAutoNext(!autoNext)} className="text-primary hover:opacity-80 transition-all">
                  {autoNext ? <ToggleRight size={28} /> : <ToggleLeft size={28} className="text-gray-600" />}
                </button>
              </div>

              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs font-bold text-gray-200">Auto Skip Intros</p>
                  <p className="text-[10px] text-gray-500">Fast skips recap and openings</p>
                </div>
                <button onClick={() => setAutoSkip(!autoSkip)} className="text-primary hover:opacity-80 transition-all">
                  {autoSkip ? <ToggleRight size={28} /> : <ToggleLeft size={28} className="text-gray-600" />}
                </button>
              </div>
            </div>
          </section>

          {/* RECENT DISCUSSION FEED */}
          <section className="bg-[#0a0d14]/40 border border-white/5 p-6 rounded-2xl space-y-4">
            <h2 className="text-sm font-black text-white uppercase tracking-wider flex items-center gap-2 border-b border-white/5 pb-2">
              <FileText size={16} className="text-primary" />
              My Comments ({userComments.length})
            </h2>

            {userComments.length === 0 ? (
              <p className="text-[11px] text-gray-500 text-center py-4">You haven't participated in any discussions yet.</p>
            ) : (
              <div className="space-y-3 max-h-64 overflow-y-auto pr-1">
                {userComments.map(c => (
                  <div key={c.id} className="p-2.5 rounded-lg bg-[#05080f]/50 border border-white/5">
                    <p className="text-[10px] text-primary font-bold">Anime Comment</p>
                    <p className="text-[11px] text-gray-300 mt-1 line-clamp-2 italic">"{c.body}"</p>
                    <span className="text-[8px] text-gray-500 block mt-1.5">{new Date(c.timestamp).toLocaleDateString()}</span>
                  </div>
                ))}
              </div>
            )}
          </section>

        </div>

      </div>
    </div>
  );
}
