// src/components/settings/ImportPreviewModal.tsx

/**
 * Modal that shows a preview of a backup file before restoring.
 * Displays: backup date, session count, exercise count, log count, date range.
 * User can confirm (replace all data) or cancel.
 */

import { Modal } from '../ui';
import { Button } from '../ui';
import type { ImportPreview } from '../../utils/importData';
import { Loader2 } from 'lucide-react';

interface ImportPreviewModalProps {
  isOpen: boolean;
  preview: ImportPreview | null;
  onConfirm: () => void;
  onCancel: () => void;
  isRestoring: boolean;
}

export function ImportPreviewModal({
  isOpen,
  preview,
  onConfirm,
  onCancel,
  isRestoring,
}: ImportPreviewModalProps) {
  if (!preview) return null;

  const versionLabel = preview.version === 1 ? 'FitTracker (v1)' : 'IronLog (v2)';

  return (
    <Modal isOpen={isOpen} onClose={onCancel} persistent={isRestoring}>
      <div className="space-y-5">
        {/* Title */}
        <div className="text-center">
          <h2 className="text-xl font-bold text-white mb-2">
            Восстановление из бэкапа
          </h2>
          <p className="text-sm text-orange-400">
            Все текущие данные будут заменены данными из файла.
          </p>
        </div>

        {/* Stats */}
        <div className="bg-[#1A1A1A] rounded-xl p-4 space-y-0">
          <StatRow label="Формат" value={versionLabel} />
          <StatRow label="Дата бэкапа" value={formatExportDate(preview.exportedAt)} />
          <StatRow label="Тренировок" value={preview.sessionCount.toString()} />
          <StatRow label="Упражнений" value={preview.exerciseCount.toString()} />
          <StatRow label="Записей подходов" value={preview.logCount.toString()} />
          <StatRow label="Записей кардио" value={preview.cardioCount.toString()} />
          <StatRow label="Период" value={preview.dateRange} isLast />
        </div>

        {/* Buttons */}
        <div className="flex gap-3">
          <Button
            variant="outline"
            fullWidth
            onClick={onCancel}
            disabled={isRestoring}
          >
            Отмена
          </Button>
          <Button
            variant="primary"
            fullWidth
            onClick={onConfirm}
            disabled={isRestoring}
          >
            {isRestoring ? (
              <Loader2 size={20} className="animate-spin" />
            ) : (
              'Восстановить'
            )}
          </Button>
        </div>
      </div>
    </Modal>
  );
}

// ---- Stat row ----

function StatRow({
  label,
  value,
  isLast = false,
}: {
  label: string;
  value: string;
  isLast?: boolean;
}) {
  return (
    <div
      className={`flex justify-between items-center py-2.5 ${
        isLast ? '' : 'border-b border-[#333]'
      }`}
    >
      <span className="text-sm text-[#B0B0B0]">{label}</span>
      <span className="text-sm font-bold text-white">{value}</span>
    </div>
  );
}

// ---- Helper ----

function formatExportDate(iso: string): string {
  if (iso === 'неизвестно') return iso;
  try {
    const d = new Date(iso);
    const day = String(d.getDate()).padStart(2, '0');
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const year = d.getFullYear();
    const hours = String(d.getHours()).padStart(2, '0');
    const minutes = String(d.getMinutes()).padStart(2, '0');
    return `${day}.${month}.${year} ${hours}:${minutes}`;
  } catch {
    return iso;
  }
}
