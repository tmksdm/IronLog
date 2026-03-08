// src/components/workout/ConfirmModal.tsx

/**
 * Simple confirmation modal for destructive actions (cancel workout, skip).
 */

import { Button } from '../ui';

interface ConfirmModalProps {
  isOpen: boolean;
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  variant?: 'danger' | 'primary';
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmModal({
  isOpen,
  title,
  message,
  confirmText = 'Да',
  cancelText = 'Отмена',
  variant = 'danger',
  onConfirm,
  onCancel,
}: ConfirmModalProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" onClick={onCancel}>
      <div className="absolute inset-0 bg-black/60" />
      <div
        className="relative bg-[#1E1E1E] rounded-2xl p-5 mx-6 max-w-[360px] w-full
                   animate-slide-up"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="text-lg font-bold text-white mb-2">{title}</h3>
        <p className="text-[#B0B0B0] text-sm mb-5">{message}</p>
        <div className="flex gap-3">
          <Button variant="ghost" fullWidth onClick={onCancel}>
            {cancelText}
          </Button>
          <Button variant={variant} fullWidth onClick={onConfirm}>
            {confirmText}
          </Button>
        </div>
      </div>
    </div>
  );
}
