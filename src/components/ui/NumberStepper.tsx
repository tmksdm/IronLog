// src/components/ui/NumberStepper.tsx

import { Minus, Plus } from 'lucide-react';

interface NumberStepperProps {
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  step?: number;
  /** Label above the stepper */
  label?: string;
  /** Units label (e.g. "кг") */
  unit?: string;
  /** Format function for display */
  formatValue?: (value: number) => string;
  size?: 'sm' | 'md' | 'lg';
}

const sizeConfig = {
  sm: { button: 'w-10 h-10', text: 'text-lg', gap: 'gap-2' },
  md: { button: 'w-12 h-12', text: 'text-xl', gap: 'gap-3' },
  lg: { button: 'w-14 h-14', text: 'text-2xl', gap: 'gap-4' },
};

export function NumberStepper({
  value,
  onChange,
  min = 0,
  max = 999,
  step = 1,
  label,
  unit,
  formatValue,
  size = 'md',
}: NumberStepperProps) {
  const config = sizeConfig[size];

  const handleDecrease = () => {
    const next = Math.max(min, value - step);
    onChange(next);
  };

  const handleIncrease = () => {
    const next = Math.min(max, value + step);
    onChange(next);
  };

  const displayValue = formatValue ? formatValue(value) : value.toString();

  return (
    <div className="flex flex-col items-center">
      {label && (
        <span className="text-sm text-[#B0B0B0] mb-2">{label}</span>
      )}
      <div className={`flex items-center ${config.gap}`}>
        <button
          className={`${config.button} rounded-full bg-[#2A2A2A] active:bg-[#333]
                     flex items-center justify-center text-white select-none`}
          onClick={handleDecrease}
          disabled={value <= min}
        >
          <Minus size={20} />
        </button>

        <div className={`${config.text} font-bold text-white min-w-[80px] text-center`}>
          {displayValue}
          {unit && (
            <span className="text-sm text-[#B0B0B0] ml-1">{unit}</span>
          )}
        </div>

        <button
          className={`${config.button} rounded-full bg-[#2A2A2A] active:bg-[#333]
                     flex items-center justify-center text-white select-none`}
          onClick={handleIncrease}
          disabled={value >= max}
        >
          <Plus size={20} />
        </button>
      </div>
    </div>
  );
}
