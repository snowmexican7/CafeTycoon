import type { CueId } from './cues';

export interface CueRule {
  /** Minimum gap between two starts of this cue. */
  cooldownMs: number;
  /** Most copies of this cue sounding at once. */
  maxVoices: number;
  /** Higher wins a slot when every voice is busy. */
  priority: number;
}

export const DEFAULT_RULE: CueRule = { cooldownMs: 80, maxVoices: 2, priority: 1 };

/** Throttling per cue. Station sounds can overlap (two grinders), chatter-prone cues can't. */
export const CUE_RULES: Partial<Record<CueId, CueRule>> = {
  grinder: { cooldownMs: 250, maxVoices: 2, priority: 2 },
  espresso: { cooldownMs: 250, maxVoices: 2, priority: 2 },
  steam: { cooldownMs: 250, maxVoices: 2, priority: 2 },
  pour: { cooldownMs: 250, maxVoices: 2, priority: 2 },
  stationReady: { cooldownMs: 300, maxVoices: 1, priority: 1 },
  cupDown: { cooldownMs: 90, maxVoices: 2, priority: 1 },
  pickUp: { cooldownMs: 90, maxVoices: 2, priority: 0 },
  serve: { cooldownMs: 150, maxVoices: 2, priority: 3 },
  doorBell: { cooldownMs: 1200, maxVoices: 1, priority: 1 },
  stormOut: { cooldownMs: 900, maxVoices: 1, priority: 3 },
  turnedAway: { cooldownMs: 1500, maxVoices: 1, priority: 1 },
  trash: { cooldownMs: 150, maxVoices: 1, priority: 1 },
  botOops: { cooldownMs: 600, maxVoices: 1, priority: 1 },
  buy: { cooldownMs: 120, maxVoices: 2, priority: 2 },
  restock: { cooldownMs: 120, maxVoices: 2, priority: 2 },
  click: { cooldownMs: 40, maxVoices: 2, priority: 0 },
  gulp: { cooldownMs: 150, maxVoices: 2, priority: 2 },
  heartbeat: { cooldownMs: 200, maxVoices: 1, priority: 3 },
  collapse: { cooldownMs: 2000, maxVoices: 1, priority: 5 },
  dayStart: { cooldownMs: 2000, maxVoices: 1, priority: 5 },
  dayEnd: { cooldownMs: 2000, maxVoices: 1, priority: 5 },
  weekEnd: { cooldownMs: 2000, maxVoices: 1, priority: 5 },
  gameOver: { cooldownMs: 2000, maxVoices: 1, priority: 5 },
  rushHour: { cooldownMs: 2000, maxVoices: 1, priority: 4 },
  powerFlicker: { cooldownMs: 2000, maxVoices: 1, priority: 4 },
  inspector: { cooldownMs: 2000, maxVoices: 1, priority: 4 },
  influencer: { cooldownMs: 2000, maxVoices: 1, priority: 4 },
  inspectPass: { cooldownMs: 2000, maxVoices: 1, priority: 4 },
  inspectFail: { cooldownMs: 2000, maxVoices: 1, priority: 4 },
  influencerServed: { cooldownMs: 2000, maxVoices: 1, priority: 4 },
  slip: { cooldownMs: 300, maxVoices: 2, priority: 3 },
  splash: { cooldownMs: 200, maxVoices: 2, priority: 2 },
  scatter: { cooldownMs: 200, maxVoices: 1, priority: 1 },
  mopGrab: { cooldownMs: 300, maxVoices: 1, priority: 1 },
  mopDown: { cooldownMs: 300, maxVoices: 1, priority: 1 },
  squeak: { cooldownMs: 250, maxVoices: 2, priority: 2 },
  rogueSneak: { cooldownMs: 2000, maxVoices: 1, priority: 3 },
  rogueUpset: { cooldownMs: 1000, maxVoices: 1, priority: 3 },
  rogueSaved: { cooldownMs: 1000, maxVoices: 1, priority: 3 },
  rogueMade: { cooldownMs: 1000, maxVoices: 1, priority: 3 },
  rogueStorm: { cooldownMs: 1000, maxVoices: 1, priority: 3 },
  doorSlam: { cooldownMs: 600, maxVoices: 1, priority: 3 },
};

/** Simultaneous one-shot voices across every cue. */
export const MAX_VOICES = 10;

interface Voice {
  id: CueId;
  end: number;
  priority: number;
}

/**
 * Decides whether a cue may start now. Drops a cue that is cooling down, has too many copies
 * playing, or would push past the voice cap while only equal-or-higher-priority sounds are playing.
 * When a higher-priority cue needs a slot, the oldest lowest-priority voice's slot is reclaimed
 * (that sound simply finishes underneath; it is short).
 */
export function createCueGate(rules: Partial<Record<CueId, CueRule>> = CUE_RULES, maxVoices = MAX_VOICES) {
  const lastStart = new Map<CueId, number>();
  let voices: Voice[] = [];
  return {
    allow(id: CueId, now: number, durMs: number): boolean {
      const rule = rules[id] ?? DEFAULT_RULE;
      voices = voices.filter((v) => v.end > now);
      const last = lastStart.get(id);
      if (last !== undefined && now - last < rule.cooldownMs) return false;
      if (voices.filter((v) => v.id === id).length >= rule.maxVoices) return false;
      if (voices.length >= maxVoices) {
        let low = -1;
        for (let i = 0; i < voices.length; i++) if (low < 0 || voices[i].priority < voices[low].priority) low = i;
        if (voices[low].priority >= rule.priority) return false;
        voices.splice(low, 1);
      }
      lastStart.set(id, now);
      voices.push({ id, end: now + Math.max(1, durMs), priority: rule.priority });
      return true;
    },
    active(now: number): number {
      voices = voices.filter((v) => v.end > now);
      return voices.length;
    },
  };
}
export type CueGate = ReturnType<typeof createCueGate>;
