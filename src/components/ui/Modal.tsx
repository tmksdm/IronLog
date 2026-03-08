// src/components/ui/Modal.tsx

import React, { useEffect } from 'react';
import { X } from 'lucide-react';

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
  /** If true, clicking the backdrop won't close */
  persistent?: boolean;
}

export function Modal({
  isOpen,
  onClose,
  title,
  children,
  persistent = false,
}: ModalProps) {
  // Prevent body scroll when modal is open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center"
      onClick={persistent ? undefined : onClose}
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/60" />

      {/* Modal content — slides up from bottom */}
      <div
        className="relative w-full max-w-[480px] bg-[#1E1E1E] rounded-t-2xl p-5 pb-8
                   max-h-[90vh] overflow-y-auto animate-slide-up"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        {(title || !persistent) && (
          <div className="flex items-center justify-between mb-4">
            {title && (
              <h2 className="text-xl font-bold text-white">{title}</h2>
            )}
            {!persistent && (
              <button
                onClick={onClose}
                className="p-2 -mr-2 rounded-full active:bg-white/10"
              >
                <X size={24} className="text-[#B0B0B0]" />
              </button>
            )}
          </div>
        )}

        {children}
      </div>
    </div>
  );
}
