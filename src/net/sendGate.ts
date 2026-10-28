/** Rate limit for outgoing inputs: at most one send per interval. */
export function createSendGate(minIntervalMs: number, now: () => number): { allow(): boolean } {
  let last = -Infinity;
  return {
    allow() {
      const t = now();
      if (t - last >= minIntervalMs) {
        last = t;
        return true;
      }
      return false;
    },
  };
}
