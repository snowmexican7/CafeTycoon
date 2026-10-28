/** Fixed simulation rate: every duration in GameState is stored in ticks. */
export const TICK_RATE = 60;

/** Convert seconds to whole ticks. */
export function secondsToTicks(seconds: number): number {
  return Math.round(seconds * TICK_RATE);
}
