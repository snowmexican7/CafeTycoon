/** Fixed simulation rate: every duration in GameState is stored in ticks. */
export const TICK_RATE = 60;

/** Convert seconds to whole ticks. */
export function secondsToTicks(seconds: number): number {
  return Math.round(seconds * TICK_RATE);
}

/**
 * Review I4: ids that would collide with Object.prototype if they ever key a plain object (a player id is a
 * network token). Refused at the door and skipped by any per-player tally.
 */
export const isReservedId = (id: string): boolean => id in Object.prototype || id === 'prototype';
