// @ts-nocheck
import React, { useState, useEffect } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Menu, X, Search, Home, BookMarked, User, LogIn, LogOut, Bell, ShieldAlert, Sparkles, Check } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from '../lib/utils';

export function Navigation() {
  const [isOpen, setIsOpen] = useState(false);
  const [showLoginModal, setShowLoginModal] = useState(false);
  const [showNotifications, setShowNotifications] = useState(false);
  const [emailInput, setEmailInput] = useState('');
  const [passwordInput, setPasswordInput] = useState('');
  
  const [isLoggedIn, setIsLoggedIn] = useState(() => {
    return localStorage.getItem('isLoggedIn') === 'true';
  });
  
  const [userEmail, setUserEmail] = useState(() => {
    return localStorage.getItem('userEmail') || '';
  });

  const [userRole, setUserRole] = useState(() => {
    return localStorage.getItem('userRole') || 'user';
  });

  const location = useLocation();
  const navigate = useNavigate();

  // Mock notifications to enrich interaction and make site feel live
  const notifications = [
    { id: 1, title: 'New Episode Alert', body: 'Solo Leveling Season 2 Episode 12 is now streaming!', time: '2m ago', read: false },
    { id: 2, title: 'Server Upgrade Completed', body: 'Kryzox and 4Animo players are now 40% faster on HD-1.', time: '1h ago', read: false },
    { id: 3, title: 'Watchlist Update', body: 'Demon Slayer: Hashira Training Arc is fully completed.', time: '1d ago', read: true }
  ];

  const links = [
    { name: 'Home', path: '/home', icon: Home },
    { name: 'Search', path: '/search', icon: Search },
    { name: 'Profile', path: '/profile', icon: User },
  ];

  // If the logged-in user is the specified admin, add the admin panel link to the sidebar
  const isAdmin = isLoggedIn && (userEmail.trim().toLowerCase() === 'mdido406@gmail.com' || userRole === 'admin');

  const handleLoginSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (emailInput.trim()) {
      const emailLower = emailInput.trim().toLowerCase();
      try {
        localStorage.setItem('isLoggedIn', 'true');
        localStorage.setItem('userEmail', emailLower);
      } catch (err) {
        try {
          // Clear cached items to free up space
          for (let i = 0; i < localStorage.length; i++) {
            const k = localStorage.key(i);
            if (k && (k.startsWith('swr_') || k.startsWith('resolved_ids_') || k.includes('home_section_data_') || k.includes('api_home_data'))) {
              localStorage.removeItem(k);
              i--;
            }
          }
          localStorage.setItem('isLoggedIn', 'true');
          localStorage.setItem('userEmail', emailLower);
        } catch (_) {}
      }
      
      let role = 'user';
      if (emailLower === 'mdido406@gmail.com' && (passwordInput === 'mdsaimon121' || passwordInput === 'mdsainon121')) {
        role = 'admin';
      }
      
      try {
        localStorage.setItem('userRole', role);
      } catch (_) {}
      setIsLoggedIn(true);
      setUserEmail(emailInput);
      setUserRole(role);
      setShowLoginModal(false);
      setEmailInput('');
      setPasswordInput('');
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('isLoggedIn');
    localStorage.removeItem('userEmail');
    localStorage.removeItem('userRole');
    setIsLoggedIn(false);
    setUserEmail('');
    setUserRole('user');
    setIsOpen(false);
    navigate('/home');
  };

  // Close dropdowns on scroll or page change
  useEffect(() => {
    setShowNotifications(false);
    setIsOpen(false);
  }, [location.pathname]);

  if (location.pathname === '/' || location.pathname === '/watch-video') {
    return null;
  }

  return (
    <>
      {/* Sticky Premium Header Navbar with Glass Blur */}
      <nav className="fixed top-0 left-0 w-full z-50 bg-[#050505]/80 backdrop-blur-md border-b border-white/5 shadow-lg">
        <div className="max-w-7xl mx-auto px-4 md:px-8 h-16 flex items-center justify-between">
          
          {/* LEFT: AnOvA Logo */}
          <Link to="/home" className="text-xl md:text-2xl font-black tracking-tighter text-white hover:opacity-90 flex items-center gap-1">
            <span className="bg-gradient-to-r from-white to-gray-300 bg-clip-text text-transparent">AnOvA</span>
            <span className="text-primary animate-pulse">.</span>
          </Link>

          {/* RIGHT: Search, Notification, Profile, Hamburger menu */}
          <div className="flex items-center gap-2 sm:gap-4 relative">
            
            {/* 1. Search Link */}
            <Link 
              to="/search" 
              className={cn(
                "p-2 text-gray-400 hover:text-primary transition-all rounded-lg hover:bg-white/5 active:scale-95",
                location.pathname === '/search' && "text-primary bg-cyan-500/10"
              )}
              title="Search Anime"
            >
              <Search size={20} />
            </Link>

            {/* 2. Notification Bell with Dropdown */}
            <div className="relative">
              <button 
                onClick={() => setShowNotifications(!showNotifications)}
                className="p-2 text-gray-400 hover:text-primary transition-all rounded-lg hover:bg-white/5 active:scale-95 relative"
                title="Notifications"
              >
                <Bell size={20} />
                <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-primary animate-ping" />
                <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-primary" />
              </button>

              <AnimatePresence>
                {showNotifications && (
                  <>
                    <div className="fixed inset-0 z-40" onClick={() => setShowNotifications(false)} />
                    <motion.div
                      initial={{ opacity: 0, y: 10, scale: 0.95 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      exit={{ opacity: 0, y: 10, scale: 0.95 }}
                      className="absolute right-0 mt-2 w-72 sm:w-80 bg-[#0a0f1d] border border-cyan-500/15 rounded-2xl shadow-[0_10px_30px_rgba(0,0,0,0.5)] p-4 z-50 backdrop-blur-xl"
                    >
                      <div className="flex items-center justify-between pb-3 border-b border-white/5 mb-3">
                        <span className="font-black text-xs text-white uppercase tracking-wider">Notifications</span>
                        <span className="text-[10px] text-primary bg-primary/10 px-2 py-0.5 rounded-full font-bold">Live</span>
                      </div>
                      <div className="space-y-3 max-h-60 overflow-y-auto pr-1">
                        {notifications.map(item => (
                          <div key={item.id} className="p-2.5 rounded-lg bg-white/[0.02] border border-white/5 hover:border-primary/20 transition-all">
                            <div className="flex items-start justify-between gap-2">
                              <p className="text-xs font-bold text-white leading-snug">{item.title}</p>
                              <span className="text-[9px] text-gray-500 shrink-0 mt-0.5">{item.time}</span>
                            </div>
                            <p className="text-[10px] text-gray-400 mt-1 leading-normal">{item.body}</p>
                          </div>
                        ))}
                      </div>
                    </motion.div>
                  </>
                )}
              </AnimatePresence>
            </div>

            {/* 3. Profile Link */}
            <Link 
              to="/profile" 
              className={cn(
                "p-2 text-gray-400 hover:text-primary transition-all rounded-lg hover:bg-white/5 active:scale-95",
                location.pathname === '/profile' && "text-primary bg-cyan-500/10"
              )}
              title="User Profile"
            >
              <User size={20} />
            </Link>

            {/* 4. Hamburger Menu (3 lines toggle) */}
            <button 
              onClick={() => setIsOpen(!isOpen)}
              className="p-2 text-gray-400 hover:text-primary transition-all rounded-lg hover:bg-white/5 border border-white/5 active:scale-95"
              title="Navigation Menu"
            >
              {isOpen ? <X size={20} /> : <Menu size={20} />}
            </button>

          </div>
        </div>
      </nav>

      {/* Hamburger Sliding Drawer Overlay */}
      <AnimatePresence>
        {isOpen && (
          <>
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsOpen(false)}
              className="fixed inset-0 bg-black/75 backdrop-blur-md z-45"
            />

            {/* Menu Panel */}
            <motion.div
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              transition={{ type: 'spring', damping: 24, stiffness: 220 }}
              className="fixed top-0 right-0 h-full w-full max-w-sm bg-[#050505] border-l border-white/5 shadow-2xl z-46 p-6 flex flex-col justify-between pt-24"
            >
              <div className="space-y-8">
                {/* Branding inside panel */}
                <div className="border-b border-white/5 pb-6">
                  {isLoggedIn ? (
                    <div className="flex items-center gap-4">
                      <div className="w-12 h-12 rounded-full bg-primary/20 flex items-center justify-center border border-primary/40 shadow-[0_0_15px_rgba(0,229,255,0.1)]">
                        <span className="text-lg font-black text-primary">{userEmail.charAt(0).toUpperCase()}</span>
                      </div>
                      <div className="overflow-hidden">
                        <p className="text-sm font-black text-white truncate">{userEmail}</p>
                        <p className="text-[10px] text-primary font-black uppercase tracking-wider mt-0.5 flex items-center gap-1">
                          {isAdmin ? (
                            <>
                              <ShieldAlert size={12} className="text-primary" />
                              System Admin
                            </>
                          ) : (
                            <>
                              <Sparkles size={12} className="text-primary" />
                              Premium Member
                            </>
                          )}
                        </p>
                      </div>
                    </div>
                  ) : (
                    <div>
                      <h3 className="text-lg font-black text-white">AnOvA Premium</h3>
                      <p className="text-xs text-gray-400 mt-1">Unlock fast streaming servers & saved watch history.</p>
                    </div>
                  )}
                </div>

                {/* Navigation Links */}
                <div className="space-y-1.5">
                  {links.map((link) => {
                    const Icon = link.icon;
                    const isActive = location.pathname === link.path;
                    return (
                      <Link
                        key={link.path}
                        to={link.path}
                        onClick={() => setIsOpen(false)}
                        className={cn(
                          "flex items-center gap-4 px-4 py-3 rounded-xl text-sm font-bold transition-all duration-300 border",
                          isActive 
                            ? "text-primary bg-cyan-500/5 border-cyan-500/20 shadow-[0_0_15px_rgba(0,229,255,0.08)]" 
                            : "text-gray-400 hover:text-white hover:bg-white/[0.02] border-transparent"
                        )}
                      >
                        <Icon size={18} className={isActive ? "text-primary" : "text-gray-400"} />
                        <span>{link.name}</span>
                      </Link>
                    );
                  })}

                  {/* ADMIN LINK: Show explicitly if logged in as admin */}
                  {isAdmin && (
                    <Link
                      to="/admin"
                      onClick={() => setIsOpen(false)}
                      className={cn(
                        "flex items-center gap-4 px-4 py-3 rounded-xl text-sm font-bold transition-all duration-300 border",
                        location.pathname === '/admin'
                          ? "text-red-400 bg-red-500/5 border-red-500/20"
                          : "text-red-400 hover:text-red-300 hover:bg-red-500/5 border-transparent"
                      )}
                    >
                      <ShieldAlert size={18} />
                      <span>Admin Control Panel</span>
                    </Link>
                  )}
                </div>
              </div>

              {/* Login/Logout Button at the Bottom */}
              <div className="space-y-4 pt-6 border-t border-white/5">
                {isLoggedIn ? (
                  <button
                    onClick={handleLogout}
                    className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-red-500/10 hover:bg-red-500/20 text-red-400 font-bold border border-red-500/20 transition-all active:scale-95 cursor-pointer text-xs"
                  >
                    <LogOut size={16} />
                    <span>Sign Out</span>
                  </button>
                ) : (
                  <button
                    onClick={() => {
                      setIsOpen(false);
                      setShowLoginModal(true);
                    }}
                    className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-primary text-black font-black hover:shadow-[0_0_15px_rgba(0,229,255,0.3)] transition-all active:scale-95 cursor-pointer text-xs"
                  >
                    <LogIn size={16} />
                    <span>Sign In to AnOvA</span>
                  </button>
                )}
                <p className="text-center text-[10px] text-gray-500">
                  Version 2.0.8 • Premium Streamer
                </p>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Glassmorphic Login Modal */}
      <AnimatePresence>
        {showLoginModal && (
          <div className="fixed inset-0 z-55 flex items-center justify-center px-4">
            {/* Overlay */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowLoginModal(false)}
              className="absolute inset-0 bg-black/80 backdrop-blur-lg"
            />

            {/* Modal Body */}
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="relative w-full max-w-md bg-[#050505] border border-cyan-500/20 p-8 rounded-3xl shadow-[0_0_50px_rgba(0,229,255,0.15)] backdrop-blur-2xl overflow-hidden"
            >
              {/* Corner Glow Effects */}
              <div className="absolute -top-10 -right-10 w-40 h-40 bg-primary/10 rounded-full blur-3xl pointer-events-none" />
              <div className="absolute -bottom-10 -left-10 w-40 h-40 bg-cyan-500/5 rounded-full blur-3xl pointer-events-none" />

              <div className="flex justify-between items-center mb-6">
                <div>
                  <h2 className="text-xl font-black text-white tracking-tight">Welcome Back</h2>
                  <p className="text-xs text-gray-400 mt-1">Sign in to your AnOvA premium account</p>
                </div>
                <button
                  onClick={() => setShowLoginModal(false)}
                  className="p-2 text-gray-400 hover:text-white rounded-xl hover:bg-white/5 transition-colors"
                >
                  <X size={20} />
                </button>
              </div>

              <form onSubmit={handleLoginSubmit} className="space-y-4">
                <div>
                  <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">Email Address</label>
                  <input
                    type="email"
                    required
                    placeholder="you@example.com"
                    value={emailInput}
                    onChange={(e) => setEmailInput(e.target.value)}
                    className="w-full bg-[#0a0d14] border border-white/10 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-primary transition-colors"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">Password</label>
                  <input
                    type="password"
                    required
                    placeholder="••••••••"
                    value={passwordInput}
                    onChange={(e) => setPasswordInput(e.target.value)}
                    className="w-full bg-[#0a0d14] border border-white/10 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-primary transition-colors"
                  />
                  <p className="text-[10px] text-gray-500 mt-1">Tip: Use mdido406@gmail.com / mdsainon121 for Admin access</p>
                </div>

                <div className="pt-2">
                  <button
                    type="submit"
                    className="w-full py-3 rounded-xl bg-primary text-black font-black hover:shadow-[0_0_15px_rgba(0,229,255,0.3)] transition-all active:scale-95 cursor-pointer text-xs uppercase tracking-wider"
                  >
                    Continue
                  </button>
                </div>
              </form>

              <div className="mt-6 text-center">
                <p className="text-xs text-gray-500">
                  Don't have an account? <span className="text-primary cursor-pointer hover:underline font-bold">Register here</span>
                </p>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </>
  );
}
