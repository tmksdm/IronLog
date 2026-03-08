// src/pages/SettingsPage.tsx

/**
 * Settings page — placeholder, will be implemented later.
 */

import { Settings } from 'lucide-react';

export function SettingsPage() {
  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-[#121212] pb-20 px-5">
      <Settings size={56} className="text-[#333333] mb-4" />
      <h1 className="text-xl font-bold text-white mb-2">Настройки</h1>
      <p className="text-sm text-[#707070] text-center">
        Раздел в разработке. Здесь будут настройки таймера, редактор упражнений, экспорт и импорт данных.
      </p>
    </div>
  );
}
