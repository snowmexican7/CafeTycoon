import { LAYOUT } from '../data/layout';
import type { GameState, MessKind, RogueStage, Vec2 } from '../sim/types';

/**
 * Pure helpers for the chaos-pack visuals (messes, slips, the mop, the rogue customer).
 * No Pixi here, so the rules are unit-tested; src/render/layers/chaos.ts draws from them.
 */

/** A stable 32-bit hash of a small integer, for per-mess speckles and blob shapes. */
export function hash32(n: number): number {
  let h = Math.imul((n + 0x9e37) | 0, 2654435761) >>> 0;
  h ^= h >>> 15;
  h = Math.imul(h, 0x85ebca6b) >>> 0;
  return (h ^ (h >>> 13)) >>> 0;
}

/** On-screen radius (px) of a mess: grows with the square root of its amount, capped so it stays in its tile. */
export function messRadius(kind: MessKind, amount: number): number {
  const a = Math.max(0, Math.min(2.5, amount));
  return kind === 'spill' ? Math.min(30, 11 + 13 * Math.sqrt(a)) : Math.min(24, 8 + 11 * Math.sqrt(a));
}

/** Eased approach of a displayed value toward its target (frame-rate independent). */
export function approach(shown: number, target: number, dt: number, rate = 6): number {
  const k = 1 - Math.exp(-rate * dt);
  const v = shown + (target - shown) * k;
  return Math.abs(target - v) < 0.002 ? target : v;
}

/** What the rogue says over their head, by stage. */
export function rogueLine(stage: RogueStage, secondsLeft: number): string {
  switch (stage) {
    case 'walking':
      return 'Fine. I\u2019ll make it myself.';
    case 'waiting':
      return `Move it! ${Math.max(0, secondsLeft)}s`;
    case 'making':
      return `DIY\u2026 ${Math.max(0, secondsLeft)}s`;
    case 'leaving':
      return 'Two stars.';
    case 'stormingOut':
      return 'Unbelievable!';
  }
}

/** How a rogue carries themself: sneaking crouch, foot-tapping, steam level. */
export function roguePose(stage: RogueStage): { crouch: number; steam: number; tap: boolean; fast: boolean; carrying: boolean } {
  switch (stage) {
    case 'walking':
      return { crouch: 0.9, steam: 0.6, tap: false, fast: false, carrying: false };
    case 'waiting':
      return { crouch: 1, steam: 1, tap: true, fast: false, carrying: false };
    case 'making':
      return { crouch: 1, steam: 0.4, tap: false, fast: false, carrying: false };
    case 'leaving':
      return { crouch: 1, steam: 0, tap: false, fast: false, carrying: true };
    case 'stormingOut':
      return { crouch: 1, steam: 1.4, tap: false, fast: true, carrying: false };
  }
}

/** A one-shot comic effect at a tile. */
export type Burst =
  | { kind: 'thud'; at: Vec2; playerId: string }
  | { kind: 'splash'; at: Vec2; item: string }
  | { kind: 'scatter'; at: Vec2 }
  | { kind: 'sparkle'; at: Vec2 }
  | { kind: 'slam'; at: Vec2 }
  | { kind: 'hmph'; at: Vec2; text: string };

/**
 * One-shot comic effects that happened between two snapshots, read from the sim log (by seq) and from
 * state diffs. Purely visual: same seq cursor idea as the audio cues, so a log entry fires once.
 */
export function chaosBursts(prev: GameState | null, next: GameState, lastSeq: number): { bursts: Burst[]; lastSeq: number } {
  const cursor = next.nextLogSeq - 1;
  if (!prev || prev.seed !== next.seed || cursor < lastSeq) return { bursts: [], lastSeq: cursor };
  const bursts: Burst[] = [];
  for (const e of next.log) {
    if (e.seq <= lastSeq) continue;
    const d = e.data;
    const at = typeof d.x === 'number' && typeof d.y === 'number' ? { x: d.x, y: d.y } : null;
    if (e.kind === 'slip' && at) bursts.push({ kind: 'thud', at, playerId: String(d.player) });
    else if (e.kind === 'drop' && at && d.item !== 'mop') bursts.push(d.item === 'grounds' ? { kind: 'scatter', at } : { kind: 'splash', at, item: String(d.item) });
    else if (e.kind === 'clean' && at) bursts.push({ kind: 'sparkle', at });
    else if (e.kind === 'rogue.upset') bursts.push({ kind: 'hmph', at: queueFront(), text: 'That\u2019s not right\u2026' });
    else if (e.kind === 'rogue.stormed' && next.rogue) bursts.push({ kind: 'hmph', at: next.rogue.pos, text: 'HMPH!' });
  }
  // The rogue walked out the door (made it, or gave up): the door slams behind them.
  if (prev.rogue && !next.rogue && (prev.rogue.stage === 'leaving' || prev.rogue.stage === 'stormingOut')) bursts.push({ kind: 'slam', at: { ...LAYOUT.door } });
  return { bursts, lastSeq: Math.max(lastSeq, cursor) };
}

function queueFront(): Vec2 {
  const s = LAYOUT.queueSlots[0];
  return { x: s.x, y: s.y };
}
