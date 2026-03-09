// src/pages/SettingsPage.tsx

/**
 * Settings page — exercise editor, export (JSON/CSV), import (JSON v1/v2).
 */

import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Dumbbell,
  ChevronRight,
  FileJson,
  FileSpreadsheet,
  DatabaseBackup,
  Loader2,
} from 'lucide-react';
import { Card } from '../components/ui';
import { ImportPreviewModal } from '../components/settings';
import { exportAsJSON, exportAsCSV, pickAndParseBackup, restoreFromBackup } from '../utils';
import type { ImportPreview } from '../utils';
import { useAppStore } from '../stores/appStore';

// ==========================================
// Menu item component
// ==========================================

interface MenuItemProps {
  icon: React.ReactNode;
  iconBgClass: string;
  label: string;
  sublabel?: string;
  onClick: () => void;
  loading?: boolean;
  disabled?: boolean;
}

function MenuItem({
  icon,
  iconBgClass,
  label,
  sublabel,
  onClick,
  loading = false,
  disabled = false,
}: MenuItemProps) {
  return (
    <Card
      onClick={disabled || loading ? undefined : onClick}
      className={`flex items-center gap-4 !p-4 ${
        disabled || loading ? 'opacity-40 pointer-events-none' : ''
      }`}
    >
      <div
        className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 ${iconBgClass}`}
      >
        {loading ? (
          <Loader2 size={20} className="text-white animate-spin" />
        ) : (
          icon
        )}
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-white font-medium">{label}</div>
        {sublabel && (
          <div className="text-xs text-[#707070] mt-0.5">{sublabel}</div>
        )}
      </div>
      <ChevronRight size={20} className="text-[#555] shrink-0" />
    </Card>
  );
}

// ==========================================
// Section component
// ==========================================

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="text-xs font-bold text-[#707070] uppercase tracking-wider mb-2 px-1">
        {title}
      </div>
      <div className="space-y-2">{children}</div>
    </div>
  );
}

// ==========================================
// Main component
// ==========================================

export function SettingsPage() {
  const navigate = useNavigate();
  const refreshNextDayInfo = useAppStore((s) => s.refreshNextDayInfo);

  // Export states
  const [isExportingJSON, setIsExportingJSON] = useState(false);
  const [isExportingCSV, setIsExportingCSV] = useState(false);

  // Import states
  const [importPreview, setImportPreview] = useState<ImportPreview | null>(null);
  const [showImportModal, setShowImportModal] = useState(false);
  const [isRestoring, setIsRestoring] = useState(false);
  const [isPickingFile, setIsPickingFile] = useState(false);

  // Status message (success/error feedback)
  const [statusMessage, setStatusMessage] = useState<{
    text: string;
    type: 'success' | 'error';
  } | null>(null);

  const showStatus = (text: string, type: 'success' | 'error') => {
    setStatusMessage({ text, type });
    setTimeout(() => setStatusMessage(null), 4000);
  };

  // ---- Handlers ----

  const handleExportJSON = async () => {
    setIsExportingJSON(true);
    try {
      await exportAsJSON();
      showStatus('JSON-бэкап создан', 'success');
    } catch (error) {
      console.error('Export JSON error:', error);
      showStatus('Не удалось экспортировать JSON', 'error');
    } finally {
      setIsExportingJSON(false);
    }
  };

  const handleExportCSV = async () => {
    setIsExportingCSV(true);
    try {
      await exportAsCSV();
      showStatus('CSV-файлы созданы', 'success');
    } catch (error) {
      console.error('Export CSV error:', error);
      showStatus('Не удалось экспортировать CSV', 'error');
    } finally {
      setIsExportingCSV(false);
    }
  };

  const handleImportJSON = async () => {
    setIsPickingFile(true);
    try {
      const preview = await pickAndParseBackup();
      if (preview) {
        setImportPreview(preview);
        setShowImportModal(true);
      }
      // null = user cancelled
    } catch (error: any) {
      console.error('Import parse error:', error);
      showStatus(
        error?.message ?? 'Не удалось прочитать файл',
        'error'
      );
    } finally {
      setIsPickingFile(false);
    }
  };

  const handleConfirmRestore = async () => {
    if (!importPreview) return;

    setIsRestoring(true);
    try {
      await restoreFromBackup(importPreview.raw);
      await refreshNextDayInfo();
      setShowImportModal(false);
      setImportPreview(null);
      showStatus(
        `Восстановлено ${importPreview.sessionCount} тренировок`,
        'success'
      );
    } catch (error: any) {
      console.error('Restore error:', error);
      showStatus(
        error?.message ?? 'Ошибка восстановления',
        'error'
      );
    } finally {
      setIsRestoring(false);
    }
  };

  const handleCancelImport = () => {
    if (isRestoring) return;
    setShowImportModal(false);
    setImportPreview(null);
  };

  // ---- Render ----

  return (
    <div className="min-h-screen bg-[#121212] pb-24 px-5 pt-6">
      <h1 className="text-2xl font-bold text-white mb-6">Настройки</h1>

      <div className="space-y-6">
        {/* Exercise editor */}
        <Section title="Упражнения">
          <MenuItem
            icon={<Dumbbell size={20} className="text-green-500" />}
            iconBgClass="bg-green-600/20"
            label="Упражнения"
            sublabel="Добавить, изменить, порядок, вес"
            onClick={() => navigate('/exercises')}
          />
        </Section>

        {/* Export */}
        <Section title="Экспорт данных">
          <MenuItem
            icon={<FileJson size={20} className="text-green-500" />}
            iconBgClass="bg-green-600/20"
            label="Экспорт JSON"
            sublabel="Полный бэкап всех данных"
            onClick={handleExportJSON}
            loading={isExportingJSON}
          />
          <MenuItem
            icon={<FileSpreadsheet size={20} className="text-green-500" />}
            iconBgClass="bg-green-600/20"
            label="Экспорт CSV"
            sublabel="3 файла по типам дней (для Excel)"
            onClick={handleExportCSV}
            loading={isExportingCSV}
          />
        </Section>

        {/* Import */}
        <Section title="Импорт данных">
          <MenuItem
            icon={<DatabaseBackup size={20} className="text-blue-500" />}
            iconBgClass="bg-blue-600/20"
            label="Импорт JSON"
            sublabel="Восстановить из бэкапа (v1 / v2)"
            onClick={handleImportJSON}
            loading={isPickingFile}
          />
        </Section>
      </div>

      {/* Status message toast */}
      {statusMessage && (
        <div
          className={`fixed bottom-24 left-1/2 -translate-x-1/2 z-50
            px-5 py-3 rounded-xl text-sm font-medium shadow-lg
            animate-fade-in max-w-[90vw] text-center
            ${
              statusMessage.type === 'success'
                ? 'bg-green-600 text-white'
                : 'bg-red-600 text-white'
            }`}
        >
          {statusMessage.text}
        </div>
      )}

      {/* Import preview modal */}
      <ImportPreviewModal
        isOpen={showImportModal}
        preview={importPreview}
        onConfirm={handleConfirmRestore}
        onCancel={handleCancelImport}
        isRestoring={isRestoring}
      />
    </div>
  );
}
