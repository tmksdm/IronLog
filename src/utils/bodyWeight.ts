export const MIN_BODY_WEIGHT = 30;
export const MAX_BODY_WEIGHT = 250;

export type BodyWeightParseResult =
  | { value: number | null; error: null }
  | { value: null; error: string };

export function parseBodyWeightInput(input: string): BodyWeightParseResult {
  const normalized = input.trim().replace(',', '.');
  if (normalized === '') return { value: null, error: null };

  const value = Number(normalized);
  if (!Number.isFinite(value)) {
    return { value: null, error: 'Введите вес числом' };
  }
  if (value < MIN_BODY_WEIGHT || value > MAX_BODY_WEIGHT) {
    return {
      value: null,
      error: `Вес должен быть от ${MIN_BODY_WEIGHT} до ${MAX_BODY_WEIGHT} кг`,
    };
  }

  return { value, error: null };
}
