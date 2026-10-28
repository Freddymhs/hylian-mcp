import { HOURS_DECIMALS, MINUTES_PER_HOUR } from './constants.js';

export function minutesToHours(minutes: number): number {
  const factor = 10 ** HOURS_DECIMALS;
  return Math.round((minutes / MINUTES_PER_HOUR) * factor) / factor;
}
