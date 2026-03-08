// src/App.tsx

/**
 * Root component with routing and app initialization.
 */

import { useEffect } from 'react';
import { HashRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useAppStore } from './stores/appStore';
import { LoadingScreen } from './components/ui';
import { HomePage } from './pages/HomePage';
import { ActiveWorkoutPage } from './pages/ActiveWorkoutPage';
import { WorkoutSummaryPage } from './pages/WorkoutSummaryPage';

function AppContent() {
  const { initialize, isInitialized, isLoading } = useAppStore();

  useEffect(() => {
    initialize();
  }, [initialize]);

  if (isLoading || !isInitialized) {
    return <LoadingScreen />;
  }

  return (
    <div className="mx-auto max-w-[480px] min-h-screen">
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/workout" element={<ActiveWorkoutPage />} />
        <Route path="/summary/:sessionId" element={<WorkoutSummaryPage />} />
        {/* Future routes */}
        {/* <Route path="/history" element={<HistoryPage />} /> */}
        {/* <Route path="/analytics" element={<AnalyticsPage />} /> */}
        {/* <Route path="/settings" element={<SettingsPage />} /> */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
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
