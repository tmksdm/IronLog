import { describe, expect, it } from 'vitest';
import { parseBodyWeightInput } from './bodyWeight';

describe('parseBodyWeightInput', () => {
  it('accepts decimal weights with a dot or comma', () => {
    expect(parseBodyWeightInput('82.25')).toEqual({ value: 82.25, error: null });
    expect(parseBodyWeightInput('82,25')).toEqual({ value: 82.25, error: null });
  });

  it('allows an omitted measurement', () => {
    expect(parseBodyWeightInput('  ')).toEqual({ value: null, error: null });
  });

  it('rejects malformed and out-of-range values', () => {
    expect(parseBodyWeightInput('82abc').error).toBe('Введите вес числом');
    expect(parseBodyWeightInput('29.9').error).toContain('от 30 до 250');
    expect(parseBodyWeightInput('251').error).toContain('от 30 до 250');
  });
});
