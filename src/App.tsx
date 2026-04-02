// src/App.tsx

/**
 * Root component with authentication gate, routing, bottom navigation,
 * app initialization, and update checking.
 *
 * Auth check reads the cached Supabase token from localStorage first
 * (instant, no network) so the app doesn't hang when the server is unreachable.
 * onAuthStateChange handles token refresh / expiry in the background.
 */

import { useEffect, useState } from 'react';
import { HashRouter, Routes, Route, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { supabase } from './lib/supabase';
import { useAppStore } from './stores/appStore';
import { LoadingScreen, UpdateBanner } from './components/ui';
import { BottomNav } from './components/layout';
import { LoginPage } from './pages/LoginPage';
import { HomePage } from './pages/HomePage';
import { ActiveWorkoutPage } from './pages/ActiveWorkoutPage';
import { WorkoutSummaryPage } from './pages/WorkoutSummaryPage';
import { HistoryPage } from './pages/HistoryPage';
import { WorkoutDetailPage } from './pages/WorkoutDetailPage';
import { AnalyticsPage } from './pages/AnalyticsPage';
import { SettingsPage } from './pages/SettingsPage';
import { ExerciseEditorPage } from './pages/ExerciseEditorPage';
import { startUpdateChecker } from './utils/updateChecker';

/** Pages where the bottom nav should be hidden */
const HIDDEN_NAV_PATHS = ['/workout', '/summary'];

function shouldShowNav(pathname: string): boolean {
  return !HIDDEN_NAV_PATHS.some((p) => pathname.startsWith(p));
}

/**
 * On fresh app launch, redirect to home and clear sessionStorage.
 * Uses a sessionStorage flag to distinguish fresh launch from in-app navigation.
 */
let hasLaunched = false;

function useRedirectOnLaunch() {
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    if (!hasLaunched) {
      hasLaunched = true;
      sessionStorage.clear();
      if (location.pathname !== '/') {
        navigate('/', { replace: true });
      }
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
}

/**
 * Check if a Supabase session token exists in localStorage.
 * Instant (no network). Supabase stores session under: sb-{projectRef}-auth-token
 */
function hasLocalSupabaseSession(): boolean {
  try {
    const projectRef = 'khnepdfkjwpxwtbjvqiv';
    const key = `sb-${projectRef}-auth-token`;
    const stored = localStorage.getItem(key);
    if (!stored) return false;
    const parsed = JSON.parse(stored);
    return !!(parsed?.access_token || parsed?.currentSession?.access_token);
  } catch {
    return false;
  }
}

function AppContent() {
  const { initialize, isInitialized, isLoading } = useAppStore();
  const location = useLocation();

  useRedirectOnLaunch();

  useEffect(() => {
    initialize();
  }, [initialize]);

  if (isLoading || !isInitialized) {
    return <LoadingScreen />;
  }

  const showNav = shouldShowNav(location.pathname);

  return (
    <div className="mx-auto max-w-120 min-h-screen">
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/workout" element={<ActiveWorkoutPage />} />
        <Route path="/summary/:sessionId" element={<WorkoutSummaryPage />} />
        <Route path="/history" element={<HistoryPage />} />
        <Route path="/detail/:sessionId" element={<WorkoutDetailPage />} />
        <Route path="/analytics" element={<AnalyticsPage />} />
        <Route path="/settings" element={<SettingsPage />} />
        <Route path="/exercises" element={<ExerciseEditorPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>

      {showNav && <BottomNav />}
    </div>
  );
}

function App() {
  const [isCheckingAuth, setIsCheckingAuth] = useState(true);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [updateVersion, setUpdateVersion] = useState<string | null>(null);

  // Check for app updates (GitHub Pages / PWA)
  useEffect(() => {
    const cleanup = startUpdateChecker((remoteVersion) => {
      setUpdateVersion(remoteVersion);
    });
    return cleanup;
  }, []);

  useEffect(() => {
    // FAST PATH: check localStorage for cached token (instant, no network).
    // If token exists, show the app immediately.
    const hasCachedSession = hasLocalSupabaseSession();

    if (hasCachedSession) {
      setIsAuthenticated(true);
      setIsCheckingAuth(false);
    }

    // SLOW PATH: verify session via network (handles token refresh).
    // Runs in background. If token is actually expired, onAuthStateChange
    // will fire and set isAuthenticated to false → shows login screen.
    const checkSession = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        setIsAuthenticated(!!session);
      } catch (err) {
        console.error('Failed to check auth session:', err);
        if (!hasCachedSession) {
          setIsAuthenticated(false);
        }
      } finally {
        if (!hasCachedSession) {
          setIsCheckingAuth(false);
        }
      }
    };

    checkSession();

    // Listen for auth state changes (login, logout, token refresh)
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        setIsAuthenticated(!!session);
      }
    );

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  if (isCheckingAuth) {
    return <LoadingScreen />;
  }

  if (!isAuthenticated) {
    return (
      <>
        {updateVersion && <UpdateBanner remoteVersion={updateVersion} />}
        <LoginPage onLoginSuccess={() => setIsAuthenticated(true)} />
      </>
    );
  }

  return (
    <>
      {updateVersion && <UpdateBanner remoteVersion={updateVersion} />}
      <HashRouter>
        <AppContent />
      </HashRouter>
    </>
  );
}

export default App;
