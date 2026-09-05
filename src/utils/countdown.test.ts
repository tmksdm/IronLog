import { describe, expect, it } from 'vitest';
import { createCountdownDeadline, getCountdownSecondsLeft } from './countdown';

describe('countdown clock', () => {
  it('derives the remaining time from the deadline instead of callback count', () => {
    const deadline = createCountdownDeadline(60, 1_000);

    expect(getCountdownSecondsLeft(deadline, 31_000)).toBe(30);
    expect(getCountdownSecondsLeft(deadline, 60_999)).toBe(1);
    expect(getCountdownSecondsLeft(deadline, 61_000)).toBe(0);
    expect(getCountdownSecondsLeft(deadline, 90_000)).toBe(0);
  });
});
