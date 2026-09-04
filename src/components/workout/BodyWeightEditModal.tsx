import { useEffect, useState } from 'react';
import { Button, Modal } from '../ui';
import { parseBodyWeightInput } from '../../utils/bodyWeight';

interface BodyWeightEditModalProps {
  isOpen: boolean;
  weightBefore: number | null;
  weightAfter?: number | null;
  showWeightAfter?: boolean;
  onClose: () => void;
  onSave: (weightBefore: number | null, weightAfter: number | null) => Promise<void>;
}

export function BodyWeightEditModal({
  isOpen,
  weightBefore,
  weightAfter = null,
  showWeightAfter = true,
  onClose,
  onSave,
}: BodyWeightEditModalProps) {
  const [beforeInput, setBeforeInput] = useState('');
  const [afterInput, setAfterInput] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    setBeforeInput(weightBefore?.toString() ?? '');
    setAfterInput(weightAfter?.toString() ?? '');
    setError(null);
    setIsSaving(false);
  }, [isOpen, weightBefore, weightAfter]);

  const handleSave = async () => {
    if (isSaving) return;

    const before = parseBodyWeightInput(beforeInput);
    const after = showWeightAfter
      ? parseBodyWeightInput(afterInput)
      : { value: weightAfter, error: null };
    const validationError = before.error ?? after.error;
    if (validationError) {
      setError(validationError);
      return;
    }

    setIsSaving(true);
    setError(null);
    try {
      await onSave(before.value, after.value);
      onClose();
    } catch (saveError) {
      console.error('Failed to update body weight:', saveError);
      setError('Не удалось сохранить вес');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Вес тела">
      <div className="space-y-4">
        <WeightInput
          label="До тренировки"
          value={beforeInput}
          onChange={setBeforeInput}
          autoFocus
        />
        {showWeightAfter && (
          <WeightInput
            label="После тренировки"
            value={afterInput}
            onChange={setAfterInput}
          />
        )}
        <p className="text-xs text-[#707070]">Пустое поле означает, что вес не измерялся.</p>
        {error && <p className="text-sm text-red-400" role="alert">{error}</p>}
        <Button fullWidth size="lg" onClick={handleSave} disabled={isSaving}>
          {isSaving ? 'Сохранение...' : 'Сохранить'}
        </Button>
      </div>
    </Modal>
  );
}

function WeightInput({
  label,
  value,
  onChange,
  autoFocus = false,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  autoFocus?: boolean;
}) {
  return (
    <label className="block">
      <span className="text-sm text-[#B0B0B0] block mb-1.5">{label}</span>
      <div className="relative">
        <input
          type="text"
          inputMode="decimal"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          onFocus={(event) => event.target.select()}
          autoFocus={autoFocus}
          className="w-full px-4 py-3 pr-12 rounded-xl bg-[#2A2A2A] text-white outline-none focus:ring-2 focus:ring-green-600 text-lg"
        />
        <span className="absolute right-4 top-1/2 -translate-y-1/2 text-sm text-[#707070]">кг</span>
      </div>
    </label>
  );
}
