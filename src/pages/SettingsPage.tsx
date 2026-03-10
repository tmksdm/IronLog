// src/pages/SettingsPage.tsx

/**
 * Settings page — exercise editor, export (JSON/CSV), import (JSON v1/v2),
 * app version and changelog.
 */

import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Dumbbell,
  ChevronRight,
  ChevronDown,
  FileJson,
  FileSpreadsheet,
  DatabaseBackup,
  Loader2,
  Info,
  LogOut,  
} from 'lucide-react';
import { Card } from '../components/ui';
import { ImportPreviewModal, GymCostCalculator } from '../components/settings';
import { exportAsJSON, exportAsCSV, pickAndParseBackup, restoreFromBackup } from '../utils';
import type { ImportPreview } from '../utils';
import { useAppStore } from '../stores/appStore';
import { APP_VERSION, CHANGELOG } from '../version';
import { supabase } from '../lib/supabase';

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
// Changelog component
// ==========================================

function ChangelogSection() {
  const [isExpanded, setIsExpanded] = useState(false);

  return (
    <div>
      {/* Version header — always visible */}
      <Card
        onClick={() => setIsExpanded(!isExpanded)}
        className="flex items-center gap-4 !p-4"
      >
        <div className="w-10 h-10 rounded-full flex items-center justify-center shrink-0 bg-[#333]">
          <Info size={20} className="text-[#888]" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-white font-medium">IronLog v{APP_VERSION}</div>
          <div className="text-xs text-[#707070] mt-0.5">
            Нажми, чтобы {isExpanded ? 'скрыть' : 'показать'} историю изменений
          </div>
        </div>
        <ChevronDown
          size={20}
          className={`text-[#555] shrink-0 transition-transform duration-200 ${
            isExpanded ? 'rotate-180' : ''
          }`}
        />
      </Card>

      {/* Changelog entries */}
      {isExpanded && (
        <div className="mt-2 space-y-3">
          {CHANGELOG.map((entry) => (
            <Card key={entry.version} className="!p-4">
              <div className="flex items-baseline gap-2 mb-2">
                <span className="text-green-500 font-bold text-sm">
                  v{entry.version}
                </span>
                <span className="text-[#555] text-xs">{entry.date}</span>
              </div>
              <ul className="space-y-1">
                {entry.changes.map((change, i) => (
                  <li key={i} className="text-[#999] text-sm flex gap-2">
                    <span className="text-[#555] shrink-0">•</span>
                    <span>{change}</span>
                  </li>
                ))}
              </ul>
            </Card>
          ))}
        </div>
      )}
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

  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);

  const handleLogout = async () => {
    await supabase.auth.signOut();
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

        {/* Gym cost calculator */}
        <Section title="Абонемент">
          <GymCostCalculator />
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

        {/* Account */}
        <Section title="Аккаунт">
          <MenuItem
            icon={<LogOut size={20} className="text-red-400" />}
            iconBgClass="bg-red-600/20"
            label="Выйти"
            sublabel="Выйти из аккаунта"
            onClick={() => setShowLogoutConfirm(true)}
          />
        </Section>

        {/* About / Version */}
        <Section title="О приложении">
          <ChangelogSection />
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

      {/* Logout confirmation */}
      {showLogoutConfirm && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-6"
          onClick={() => setShowLogoutConfirm(false)}
        >
          <div
            className="bg-[#1E1E1E] rounded-2xl p-6 w-full max-w-[320px]"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-white font-bold text-lg mb-2">Выйти?</h3>
            <p className="text-[#999] text-sm mb-6">
              Для входа потребуется ввести email и пароль заново.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setShowLogoutConfirm(false)}
                className="flex-1 h-11 rounded-xl bg-[#333] text-white font-medium
                  active:bg-[#444] transition-colors"
              >
                Отмена
              </button>
              <button
                onClick={handleLogout}
                className="flex-1 h-11 rounded-xl bg-red-600 text-white font-medium
                  active:bg-red-700 transition-colors"
              >
                Выйти
              </button>
            </div>
          </div>
        </div>
      )}


    </div>
  );
}
