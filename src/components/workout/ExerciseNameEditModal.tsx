import { useEffect, useState, type FormEvent } from 'react';
import { Button, Modal } from '../ui';

interface ExerciseNameEditModalProps {
  isOpen: boolean;
  name: string;
  onClose: () => void;
  onSave: (name: string) => Promise<void>;
}

export function ExerciseNameEditModal({
  isOpen,
  name,
  onClose,
  onSave,
}: ExerciseNameEditModalProps) {
  const [nameInput, setNameInput] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    setNameInput(name);
    setError(null);
    setIsSaving(false);
  }, [isOpen, name]);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    const trimmedName = nameInput.trim();
    if (!trimmedName) {
      setError('Введите название упражнения');
      return;
    }
    if (isSaving) return;

    setIsSaving(true);
    setError(null);
    try {
      await onSave(trimmedName);
      onClose();
    } catch (saveError) {
      console.error('Failed to rename exercise:', saveError);
      setError('Не удалось сохранить название');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Название упражнения"
      persistent={isSaving}
    >
      <form className="space-y-4" onSubmit={handleSubmit}>
        <label className="block">
          <span className="mb-1.5 block text-sm text-[#B0B0B0]">Название</span>
          <input
            type="text"
            value={nameInput}
            onChange={(event) => setNameInput(event.target.value)}
            onFocus={(event) => event.target.select()}
            autoFocus
            className="w-full rounded-xl bg-[#2A2A2A] px-4 py-3 text-lg text-white outline-none focus:ring-2 focus:ring-green-600"
          />
        </label>
        {error && <p className="text-sm text-red-400" role="alert">{error}</p>}
        <Button type="submit" fullWidth size="lg" disabled={isSaving}>
          {isSaving ? 'Сохранение...' : 'Сохранить'}
        </Button>
      </form>
    </Modal>
  );
}
