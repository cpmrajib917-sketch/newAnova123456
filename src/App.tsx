// @ts-nocheck
import React, { useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { Navigation } from './components/Navigation';
import { TopProgress } from './components/TopProgress';
import { Landing } from './pages/Landing';
import { Home } from './pages/Home';
import { Search } from './pages/Search';
import { Detail } from './pages/Detail';
import { Watch } from './pages/Watch';
import { Profile } from './pages/Profile';
import { Discover } from './pages/Discover';
import { Admin } from './pages/Admin';
import { useAppStore } from './store';
import { syncComments, trackUserLogin, trackUserHeartbeat, trackUserLogout } from './lib/firebaseSync';

function AppSyncWrapper({ children }: { children: React.ReactNode }) {
  const location = useLocation();
  const { setComments, loadUserFirebaseData } = useAppStore();

  useEffect(() => {
    // 1. Live Sync Comments from Firebase RTDB
    const unsubscribe = syncComments((comments) => {
      setComments(comments);
    });

    return () => {
      unsubscribe();
    };
  }, [setComments]);

  useEffect(() => {
    const email = localStorage.getItem('userEmail');
    const isLoggedIn = localStorage.getItem('isLoggedIn') === 'true';

    if (isLoggedIn && email) {
      // Load user profile & sync lists
      trackUserLogin(email).then(() => {
        loadUserFirebaseData(email);
      });

      // Periodic online heartbeat
      trackUserHeartbeat(email, location.pathname);
      const interval = setInterval(() => {
        trackUserHeartbeat(email, location.pathname);
      }, 15000); // 15 seconds

      // Cleanup
      return () => {
        clearInterval(interval);
        trackUserLogout();
      };
    } else {
      // Guest online tracking
      trackUserHeartbeat('', location.pathname);
      const interval = setInterval(() => {
        trackUserHeartbeat('', location.pathname);
      }, 15000);
      return () => {
        clearInterval(interval);
        trackUserLogout();
      };
    }
  }, [location.pathname, loadUserFirebaseData]);

  return <>{children}</>;
}

export default function App() {
  return (
    <BrowserRouter>
      <AppSyncWrapper>
        <div className="min-h-screen bg-bg text-white selection:bg-primary selection:text-black">
          <TopProgress />
          <Navigation />
          <main className="pb-12">
            <Routes>
              <Route path="/" element={<Landing />} />
              <Route path="/home" element={<Home />} />
              <Route path="/search" element={<Search />} />
              <Route path="/discover" element={<Discover />} />
              <Route path="/library" element={<Navigate to="/profile" replace />} />
              <Route path="/anime/:id" element={<Detail />} />
              <Route path="/watch/:id" element={<Watch />} />
              <Route path="/profile" element={<Profile />} />
              <Route path="/admin" element={<Admin />} />
              <Route path="*" element={<Navigate to="/home" replace />} />
            </Routes>
          </main>
        </div>
      </AppSyncWrapper>
    </BrowserRouter>
  );
}
