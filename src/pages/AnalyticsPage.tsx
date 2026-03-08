// src/pages/AnalyticsPage.tsx

/**
 * Analytics page — placeholder, will be implemented later.
 */

import { BarChart3 } from 'lucide-react';

export function AnalyticsPage() {
  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-[#121212] pb-20 px-5">
      <BarChart3 size={56} className="text-[#333333] mb-4" />
      <h1 className="text-xl font-bold text-white mb-2">Аналитика</h1>
      <p className="text-sm text-[#707070] text-center">
        Раздел в разработке. Здесь будут графики тоннажа, веса тела, времени тренировок и прогресса по упражнениям.
      </p>
    </div>
  );
}
