// src/App.tsx

/**
 * Root component with routing, bottom navigation, and app initialization.
 */

import { useEffect } from 'react';
import { HashRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { useAppStore } from './stores/appStore';
import { LoadingScreen } from './components/ui';
import { BottomNav } from './components/layout';
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

function AppContent() {
  const { initialize, isInitialized, isLoading } = useAppStore();
  const location = useLocation();

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
  return (
    <HashRouter>
      <AppContent />
    </HashRouter>
  );
}

export default App;
