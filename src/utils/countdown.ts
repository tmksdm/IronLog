export function createCountdownDeadline(seconds: number, now = Date.now()): number {
  return now + Math.max(0, seconds) * 1000;
}

export function getCountdownSecondsLeft(deadline: number, now = Date.now()): number {
  return Math.max(0, Math.ceil((deadline - now) / 1000));
}
