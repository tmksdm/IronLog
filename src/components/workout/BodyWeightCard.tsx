import { ArrowRight, Pencil, Scale } from 'lucide-react';
import { formatDecimal } from '../../utils/format';

interface BodyWeightCardProps {
  weightBefore: number | null;
  weightAfter: number | null;
  onEdit: () => void;
}

export function BodyWeightCard({ weightBefore, weightAfter, onEdit }: BodyWeightCardProps) {
  const average = weightBefore !== null && weightAfter !== null
    ? (weightBefore + weightAfter) / 2
    : null;

  return (
    <div className="bg-[#252525] rounded-xl p-4 mt-3">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <Scale size={18} className="text-[#B0B0B0]" />
          <span className="text-sm font-semibold text-white">Вес тела</span>
        </div>
        <button
          type="button"
          onClick={onEdit}
          aria-label="Изменить вес тела"
          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-sm text-[#81C784] active:bg-white/10"
        >
          <Pencil size={14} />
          Изменить
        </button>
      </div>
      <div className="flex items-center justify-center gap-4">
        <WeightValue label="До" value={weightBefore} />
        <ArrowRight size={16} className="text-[#555555]" />
        <WeightValue label="После" value={weightAfter} />
        {average !== null && (
          <>
            <div className="w-px h-8 bg-[#333333]" />
            <WeightValue label="Среднее" value={average} accent />
          </>
        )}
      </div>
    </div>
  );
}

function WeightValue({ label, value, accent = false }: { label: string; value: number | null; accent?: boolean }) {
  return (
    <div className="flex flex-col items-center">
      <span className="text-xs text-[#707070]">{label}</span>
      <span className={`text-base font-bold ${accent ? 'text-[#4CAF50]' : 'text-white'}`}>
        {value === null ? '—' : formatDecimal(value)}
      </span>
    </div>
  );
}
