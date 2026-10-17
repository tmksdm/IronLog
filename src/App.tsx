// src/App.tsx

/**
 * Root component with routing, bottom navigation, app initialization, and
 * update checking.
 *
 * The application is local-only: there is no account, no session and no cloud
 * sync, so the app goes straight into the workout data stored on the device.
 */

import { lazy, Suspense, useEffect } from 'react';
import { HashRouter, Routes, Route, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { useAppStore } from './stores/appStore';
import { LoadingScreen, StartupErrorScreen } from './components/ui';
import { BottomNav } from './components/layout';
import { RestFinishedToastHost } from './components/workout/RestFinishedToast';
import { HomePage } from './pages/HomePage';
import { startUpdateChecker } from './utils/updateChecker';

const ActiveWorkoutPage = lazy(() =>
  import('./pages/ActiveWorkoutPage').then((module) => ({ default: module.ActiveWorkoutPage }))
);
const WorkoutSummaryPage = lazy(() =>
  import('./pages/WorkoutSummaryPage').then((module) => ({ default: module.WorkoutSummaryPage }))
);
const HistoryPage = lazy(() =>
  import('./pages/HistoryPage').then((module) => ({ default: module.HistoryPage }))
);
const WorkoutDetailPage = lazy(() =>
  import('./pages/WorkoutDetailPage').then((module) => ({ default: module.WorkoutDetailPage }))
);
const AnalyticsPage = lazy(() =>
  import('./pages/AnalyticsPage').then((module) => ({ default: module.AnalyticsPage }))
);
const SettingsPage = lazy(() =>
  import('./pages/SettingsPage').then((module) => ({ default: module.SettingsPage }))
);
const ExerciseEditorPage = lazy(() =>
  import('./pages/ExerciseEditorPage').then((module) => ({ default: module.ExerciseEditorPage }))
);
const RunningPage = lazy(() =>
  import('./pages/RunningPage').then((module) => ({ default: module.RunningPage }))
);
const PullupsPage = lazy(() =>
  import('./pages/PullupsPage').then((module) => ({ default: module.PullupsPage }))
);
const JumpRopePage = lazy(() =>
  import('./pages/JumpRopePage').then((module) => ({ default: module.JumpRopePage }))
);

/** Pages where the bottom nav should be hidden */
const HIDDEN_NAV_PATHS = ['/workout', '/summary', '/running', '/pullups', '/jump-rope'];

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

function AppContent() {
  const { initialize, isInitialized, isLoading, initializationError } = useAppStore();
  const location = useLocation();

  useRedirectOnLaunch();

  useEffect(() => {
    initialize();
  }, [initialize]);

  if (isLoading || !isInitialized) {
    if (initializationError) {
      return <StartupErrorScreen onRetry={() => void initialize()} />;
    }
    return <LoadingScreen />;
  }

  const showNav = shouldShowNav(location.pathname);

  return (
    <div className="mx-auto max-w-120 min-h-screen">
      <Suspense fallback={<LoadingScreen />}>
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/workout" element={<ActiveWorkoutPage />} />
          <Route path="/summary/:sessionId" element={<WorkoutSummaryPage />} />
          <Route path="/history" element={<HistoryPage />} />
          <Route path="/detail/:sessionId" element={<WorkoutDetailPage />} />
          <Route path="/analytics" element={<AnalyticsPage />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="/exercises" element={<ExerciseEditorPage />} />
          <Route path="/running" element={<RunningPage />} />
          <Route path="/pullups" element={<PullupsPage />} />
          <Route path="/jump-rope" element={<JumpRopePage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Suspense>

      {showNav && <BottomNav />}
      <RestFinishedToastHost />
    </div>
  );
}

function App() {
  // Keep the PWA shell current without requiring a working screen to confirm it.
  useEffect(() => {
    return startUpdateChecker();
  }, []);

  return (
    <HashRouter>
      <AppContent />
    </HashRouter>
  );
}

export default App;
