// src/components/finish/RunningCore.tsx

/**
 * Standalone-friendly treadmill 3km input core.
 *
 * Knows NOTHING about the workout store. Receives initial values via props
 * and reports the result back through onSave(totalSeconds, succeeded).
 * Reused by both the post-workout CardioStep and the standalone RunningPage.
 *
 * NOTE: Running program progression is NOT applied here — the parent decides
 * when to apply it (deferred until a real save).
 */

import { useState } from 'react';
import {
  loadRunningProgram,
  initRunningProgram,
  formatRunPlan,
  saveRunningProgram,
  type RunningProgramState,
} from '../../utils/runningProgram';
import { Timer, Check, X, Settings2 } from 'lucide-react';

interface RunningCoreProps {
  /** Initial time in seconds (0 = empty) */
  initialSeconds?: number;
  /** Initial result (null = not chosen yet) */
  initialSucceeded?: boolean | null;
  /** Called when the user presses "Сохранить" with a valid time */
  onSave: (totalSeconds: number, succeeded: boolean | null) => void;
  /** Optional skip / cancel button. If omitted, no skip button is shown. */
  onSkip?: () => void;
  /** Label for the skip button (default "Пропустить") */
  skipLabel?: string;
  /** Label for the save button (default "Сохранить") */
  saveLabel?: string;
}

export default function RunningCore({
  initialSeconds = 0,
  initialSucceeded = null,
  onSave,
  onSkip,
  skipLabel = 'Пропустить',
  saveLabel = 'Сохранить',
}: RunningCoreProps) {
  const [minutes, setMinutes] = useState<number>(
    initialSeconds ? Math.floor(initialSeconds / 60) : 0
  );
  const [seconds, setSeconds] = useState<number>(
    initialSeconds ? initialSeconds % 60 : 0
  );
  const [succeeded, setSucceeded] = useState<boolean | null>(initialSucceeded);
  const [programState, setProgramState] = useState<RunningProgramState | null>(
    loadRunningProgram
  );
  const [isEditing, setIsEditing] = useState(false);
  const [editSpeed, setEditSpeed] = useState('');

  const totalSeconds = minutes * 60 + seconds;

  const handleInitProgram = () => {
    const speed = parseFloat(editSpeed.replace(',', '.'));
    if (isNaN(speed) || speed <= 0) return;
    const state = initRunningProgram(speed);
    setProgramState(state);
    setIsEditing(false);
    setEditSpeed('');
  };

  const handleStartEdit = () => {
    if (programState) setEditSpeed(programState.mainSpeed.toString());
    setIsEditing(true);
  };

  const handleSaveEdit = () => {
    const speed = parseFloat(editSpeed.replace(',', '.'));
    if (isNaN(speed) || speed <= 0) return;
    const newState: RunningProgramState = {
      mainSpeed: speed,
      endSpeed: null,
      endSegments: 0,
    };
    saveRunningProgram(newState);
    setProgramState(newState);
    setIsEditing(false);
    setEditSpeed('');
  };

  const handleCancelEdit = () => {
    setIsEditing(false);
    setEditSpeed('');
  };

  return (
    <div className="flex flex-col items-center gap-5 px-4 pt-4">
      <h3 className="text-lg font-semibold text-white">Бег 3 км</h3>

      {/* Run program plan */}
      {programState && !isEditing && (
        <div className="w-full bg-[#252525] rounded-xl p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium text-[#B0B0B0]">План пробежки</span>
            <button
              onClick={handleStartEdit}
              className="w-8 h-8 rounded-lg bg-[#333333] flex items-center justify-center active:bg-[#444444] transition-colors"
            >
              <Settings2 size={16} className="text-[#B0B0B0]" />
            </button>
          </div>
          <p className="text-base text-white font-semibold">
            {formatRunPlan(programState)}
          </p>
        </div>
      )}

      {/* Setup / Edit program */}
      {(!programState || isEditing) && (
        <div className="w-full bg-[#252525] rounded-xl p-4">
          <p className="text-sm text-[#B0B0B0] mb-3 text-center">
            {programState ? 'Сбросить программу бега' : 'Настройка программы бега'}
          </p>
          <p className="text-xs text-[#707070] mb-3 text-center">
            {programState
              ? 'Введите новую базовую скорость (вся дистанция будет на ней)'
              : 'Введите начальную скорость (км/ч)'}
          </p>
          <div className="flex items-center justify-center gap-3">
            <div className="relative">
              <input
                type="text"
                inputMode="decimal"
                value={editSpeed}
                onChange={(e) => setEditSpeed(e.target.value)}
                onFocus={(e) => e.target.select()}
                placeholder="12"
                className="w-24 h-12 text-center text-xl font-bold text-white bg-[#1E1E1E] border border-[#333333] rounded-xl outline-none focus:border-[#2196F3] placeholder:text-[#555555]"
              />
              <span className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-[#707070]">
                км/ч
              </span>
            </div>
            <button
              onClick={programState ? handleSaveEdit : handleInitProgram}
              disabled={!editSpeed.trim()}
              className="h-12 px-4 rounded-xl bg-[#2196F3] text-white font-semibold text-sm active:bg-[#1976D2] transition-colors disabled:opacity-40"
            >
              OK
            </button>
            {isEditing && (
              <button
                onClick={handleCancelEdit}
                className="h-12 px-3 rounded-xl bg-[#333333] text-[#B0B0B0] font-semibold text-sm active:bg-[#444444] transition-colors"
              >
                Отмена
              </button>
            )}
          </div>
        </div>
      )}

      {/* Timer icon */}
      <div className="w-16 h-16 rounded-full bg-[#2A2A2A] flex items-center justify-center">
        <Timer size={32} className="text-[#2196F3]" />
      </div>

      {/* Time input: MM : SS */}
      <div className="flex items-center gap-3">
        <div className="flex flex-col items-center gap-1">
          <input
            type="number"
            inputMode="numeric"
            onFocus={(e) => e.target.select()}
            value={minutes.toString().padStart(2, '0')}
            onChange={(e) => {
              const val = parseInt(e.target.value, 10);
              setMinutes(isNaN(val) ? 0 : Math.max(0, Math.min(59, val)));
            }}
            className="w-20 h-16 text-center text-3xl font-bold text-white bg-[#1E1E1E] border border-[#333333] rounded-xl outline-none focus:border-[#2196F3]"
          />
          <span className="text-xs text-[#707070]">мин</span>
        </div>

        <span className="text-3xl font-bold text-[#707070] mb-5">:</span>

        <div className="flex flex-col items-center gap-1">
          <input
            type="number"
            inputMode="numeric"
            onFocus={(e) => e.target.select()}
            value={seconds.toString().padStart(2, '0')}
            onChange={(e) => {
              const val = parseInt(e.target.value, 10);
              setSeconds(isNaN(val) ? 0 : Math.max(0, Math.min(59, val)));
            }}
            className="w-20 h-16 text-center text-3xl font-bold text-white bg-[#1E1E1E] border border-[#333333] rounded-xl outline-none focus:border-[#2196F3]"
          />
          <span className="text-xs text-[#707070]">сек</span>
        </div>
      </div>

      {/* Result buttons */}
      {programState && (
        <div className="w-full">
          <p className="text-sm text-[#B0B0B0] text-center mb-3">
            Удалось выполнить план?
          </p>
          <div className="flex gap-3">
            <button
              onClick={() => setSucceeded(true)}
              className={`flex-1 py-3.5 rounded-xl font-semibold text-base flex items-center justify-center gap-2 transition-colors active:scale-[0.98] ${
                succeeded === true
                  ? 'bg-[#4CAF50] text-white'
                  : 'bg-[#2A2A2A] text-[#B0B0B0] active:bg-[#333333]'
              }`}
            >
              <Check size={20} />
              Да
            </button>
            <button
              onClick={() => setSucceeded(false)}
              className={`flex-1 py-3.5 rounded-xl font-semibold text-base flex items-center justify-center gap-2 transition-colors active:scale-[0.98] ${
                succeeded === false
                  ? 'bg-[#F44336] text-white'
                  : 'bg-[#2A2A2A] text-[#B0B0B0] active:bg-[#333333]'
              }`}
            >
              <X size={20} />
              Нет
            </button>
          </div>
        </div>
      )}

      {/* Action buttons */}
      <div className="flex gap-3 w-full mt-4">
        {onSkip && (
          <button
            onClick={onSkip}
            className="flex-1 py-3.5 rounded-xl bg-[#2A2A2A] text-[#B0B0B0] font-semibold text-base active:bg-[#333333] transition-colors"
          >
            {skipLabel}
          </button>
        )}
        <button
          onClick={() => onSave(totalSeconds, succeeded)}
          disabled={totalSeconds <= 0}
          className="flex-1 py-3.5 rounded-xl bg-[#4CAF50] text-white font-semibold text-base active:bg-[#388E3C] transition-colors disabled:opacity-40 disabled:active:bg-[#4CAF50]"
        >
          {saveLabel}
        </button>
      </div>
    </div>
  );
}
