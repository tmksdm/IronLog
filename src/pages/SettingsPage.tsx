// src/pages/SettingsPage.tsx

/**
 * Settings page — links to exercise editor, future: export/import, timer settings.
 */

import { useNavigate } from 'react-router-dom';
import { Settings, Dumbbell, ChevronRight } from 'lucide-react';
import { Card } from '../components/ui';

export function SettingsPage() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-[#121212] pb-24 px-5 pt-6">
      <h1 className="text-2xl font-bold text-white mb-6">Настройки</h1>

      {/* Menu items */}
      <div className="space-y-2">
        <Card
          onClick={() => navigate('/exercises')}
          className="flex items-center gap-4 !p-4"
        >
          <div className="w-10 h-10 rounded-full bg-green-600/20 flex items-center justify-center shrink-0">
            <Dumbbell size={20} className="text-green-500" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-white font-medium">Упражнения</div>
            <div className="text-xs text-[#707070] mt-0.5">
              Добавить, изменить, порядок, вес
            </div>
          </div>
          <ChevronRight size={20} className="text-[#555] shrink-0" />
        </Card>

        {/* Placeholder for future settings */}
        <Card className="flex items-center gap-4 !p-4 opacity-40">
          <div className="w-10 h-10 rounded-full bg-[#333] flex items-center justify-center shrink-0">
            <Settings size={20} className="text-[#707070]" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-[#707070] font-medium">Экспорт / Импорт</div>
            <div className="text-xs text-[#555] mt-0.5">Скоро</div>
          </div>
        </Card>
      </div>
    </div>
  );
}
