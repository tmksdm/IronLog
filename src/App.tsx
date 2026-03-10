// src/App.tsx

/**
 * Root component with authentication gate, routing, bottom navigation,
 * and app initialization.
 */

import { useEffect, useState } from 'react';
import { HashRouter, Routes, Route, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { supabase } from './lib/supabase';
import { useAppStore } from './stores/appStore';
import { LoadingScreen } from './components/ui';
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
      // Fresh launch — clear stale navigation state and go home
      sessionStorage.clear();
      if (location.pathname !== '/') {
        navigate('/', { replace: true });
      }
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
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
    <div className="mx-auto max-w-[480px] min-h-screen">
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

  useEffect(() => {
    // Check for existing session on mount
    const checkSession = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        setIsAuthenticated(!!session);
      } catch (err) {
        console.error('Failed to check auth session:', err);
        setIsAuthenticated(false);
      } finally {
        setIsCheckingAuth(false);
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

  // Show loading while checking for saved session
  if (isCheckingAuth) {
    return <LoadingScreen />;
  }

  // Not logged in — show login page
  if (!isAuthenticated) {
    return <LoginPage onLoginSuccess={() => setIsAuthenticated(true)} />;
  }

  // Logged in — show the app
  return (
    <HashRouter>
      <AppContent />
    </HashRouter>
  );
}

export default App;
