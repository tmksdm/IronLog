// src/components/ui/NumberStepper.tsx

import { useState, useRef, useEffect } from 'react';
import { Minus, Plus } from 'lucide-react';

interface NumberStepperProps {
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  step?: number;
  /** Step for manual input snapping (defaults to step). Use smaller value to allow finer manual entry. */
  inputStep?: number;  
  /** Label above the stepper (or to the left in 'inline' layout) */
  label?: string;
  /** Units label (e.g. "кг") */
  unit?: string;
  /** Format function for display */
  formatValue?: (value: number) => string;
  size?: 'sm' | 'md' | 'lg';
  /** 'stacked' = label on top (default), 'inline' = label on left, controls on right */
  layout?: 'stacked' | 'inline';
}

const sizeConfig = {
  sm: { button: 'w-10 h-10', text: 'text-lg', gap: 'gap-2', valueMinW: 'min-w-[48px]' },
  md: { button: 'w-12 h-12', text: 'text-xl', gap: 'gap-3', valueMinW: 'min-w-[80px]' },
  lg: { button: 'w-14 h-14', text: 'text-2xl', gap: 'gap-4', valueMinW: 'min-w-[80px]' },
};

export function NumberStepper({
  value,
  onChange,
  min = 0,
  max = 999,
  step = 1,
  inputStep,  
  label,
  unit,
  formatValue,
  size = 'md',
  layout = 'stacked',
}: NumberStepperProps) {
  const config = sizeConfig[size];
  const [isEditing, setIsEditing] = useState(false);
  const [editText, setEditText] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  // Focus the input when entering edit mode
  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isEditing]);

  const handleDecrease = () => {
    const next = Math.max(min, value - step);
    onChange(next);
  };

  const handleIncrease = () => {
    const next = Math.min(max, value + step);
    onChange(next);
  };

  const handleTapValue = () => {
    setEditText(value.toString());
    setIsEditing(true);
  };

  const commitEdit = () => {
    setIsEditing(false);
    const raw = editText.replace(',', '.').trim();
    const parsed = parseFloat(raw);
    if (isNaN(parsed)) return; // invalid input — keep old value

    const snapTo = inputStep ?? step;
    const snapped = Math.round(parsed / snapTo) * snapTo;
    // Round to avoid floating point drift (e.g. 2.5000000001)
    const rounded = Math.round(snapped * 1000) / 1000;
    const clamped = Math.min(max, Math.max(min, rounded));
    onChange(clamped);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      commitEdit();
    }
  };

  const displayValue = formatValue ? formatValue(value) : value.toString();

  const valueElement = isEditing ? (
    <input
      ref={inputRef}
      type="text"
      inputMode="decimal"
      value={editText}
      onChange={(e) => setEditText(e.target.value)}
      onBlur={commitEdit}
      onKeyDown={handleKeyDown}
      className={`${config.text} font-bold text-white ${config.valueMinW} text-center
                 bg-[#2A2A2A] rounded-lg outline-none ring-2 ring-green-600
                 px-1 py-0.5 appearance-none`}
      style={{ width: `${Math.max(3, editText.length + 1)}ch` }}
    />
  ) : (
    <button
      onClick={handleTapValue}
      className={`${config.text} font-bold text-white ${config.valueMinW} text-center
                 rounded-lg px-1 py-0.5 active:bg-[#2A2A2A] transition-colors`}
    >
      {displayValue}
      {unit && (
        <span className="text-sm text-[#B0B0B0] ml-1">{unit}</span>
      )}
    </button>
  );

  const controls = (
    <div className={`flex items-center ${config.gap}`}>
      <button
        className={`${config.button} rounded-full bg-[#2A2A2A] active:bg-[#333]
                   flex items-center justify-center text-white select-none
                   disabled:opacity-30`}
        onClick={handleDecrease}
        disabled={value <= min}
      >
        <Minus size={20} />
      </button>

      {valueElement}

      <button
        className={`${config.button} rounded-full bg-[#2A2A2A] active:bg-[#333]
                   flex items-center justify-center text-white select-none
                   disabled:opacity-30`}
        onClick={handleIncrease}
        disabled={value >= max}
      >
        <Plus size={20} />
      </button>
    </div>
  );

  // Inline layout: label on the left, controls on the right
  if (layout === 'inline') {
    return (
      <div className="flex items-center justify-between">
        {label && (
          <span className="text-sm text-[#B0B0B0]">{label}</span>
        )}
        {controls}
      </div>
    );
  }

  // Default stacked layout: label above, controls below
  return (
    <div className="flex flex-col items-center">
      {label && (
        <span className="text-sm text-[#B0B0B0] mb-2">{label}</span>
      )}
      {controls}
    </div>
  );
}
