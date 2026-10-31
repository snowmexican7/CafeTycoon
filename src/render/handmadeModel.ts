/**
 * FB2 B8: the pure half of hand-made lattes — jug/steam meters, recipe icons over the cup, syrup-rack
 * gates, and toast lines. Reads `src/sim/handmade.ts` helpers; never mutates the sim.
 */
import { ECONOMY } from '../data/economy';
import { SYRUP_ID } from '../data/layout';
import { inPreOpen } from '../sim/rearrange';
import {
  FLAVOURS,
  HANDMADE,
  JUG_LINES,
  heldRecipe as simHeldRecipe,
  isSyrupRack,
  jugFill,
  steamPos,
  type HeldRecipe as SimHeldRecipe,
  type RecipeStep,
} from '../sim/handmade';
import type { FillGrade, Flavour, GameState, Player, SimEvent, SteamGrade } from '../sim/types';

export { FLAVOURS, HANDMADE, JUG_LINES };

const dist = (a: { x: number; y: number }, b: { x: number; y: number }) => Math.hypot(a.x - b.x, a.y - b.y);

/** Cups that can take a syrup at the rack (mirrors handmade.ts SYRUP_CUPS). */
const SYRUP_CUPS = ['espresso', 'latte', 'cappuccino'] as const;

export interface JugMeter {
  /** 0..1 fill right now. */
  fill: number;
  /** The ticket's mark (cappuccino or latte). */
  line: number;
  /** True once the jug has been stopped. */
  done: boolean;
  /** The three painted marks on the jug. */
  marks: readonly number[];
}

/** The local (or any) person's jug meter, or null when they have none. */
export function jugMeter(state: GameState, p: Player): JugMeter | null {
  if (!p.jug) return null;
  return {
    fill: jugFill(state, p),
    line: p.jug.line,
    done: p.jug.done === true,
    marks: [JUG_LINES.cappuccino, JUG_LINES.latte, JUG_LINES.large],
  };
}

export interface SteamMeter {
  /** 0..1 triangle-wave position. */
  pos: number;
  /** The wand the meter is tied to. */
  station: string;
  /** Middle of the meter (perfect stop). */
  middle: number;
  /** Half-width of the perfect and ok bands. */
  perfect: number;
  ok: number;
}

/** Where the steam meter is, or null when this person has none running. */
export function steamMeter(state: GameState, p: Player): SteamMeter | null {
  const pos = steamPos(state, p);
  if (pos === null || !p.steam) return null;
  return {
    pos,
    station: p.steam.station,
    middle: 0.5,
    perfect: HANDMADE.perfect,
    ok: HANDMADE.ok,
  };
}

export type StepState = 'done' | 'next' | 'todo';
export interface HandmadeStep {
  step: RecipeStep;
  icon: string;
  label: string;
  state: StepState;
}
export interface HandmadeRecipe {
  drink: SimHeldRecipe['drink'];
  shots: 1 | 2;
  syrup?: Flavour;
  steps: HandmadeStep[];
}

const STEP_ICON: Record<RecipeStep, string> = {
  shot: '☕',
  double: '☕☕',
  vanilla: '🌿',
  caramel: '🍯',
  milk: '🥛',
  steam: '♨️',
  foam: '☁️',
};
const STEP_LABEL: Record<RecipeStep, string> = {
  shot: 'Shot',
  double: 'Double',
  vanilla: 'Vanilla',
  caramel: 'Caramel',
  milk: 'Milk',
  steam: 'Steam',
  foam: 'Foam',
};

/**
 * Recipe icons over the cup in hand from `handmade.heldRecipe` (not countsModel.heldRecipe).
 * Null when the cup is not heading for a latte or cappuccino ask.
 */
export function handmadeHeldRecipe(state: GameState, p: Player): HandmadeRecipe | null {
  const r = simHeldRecipe(state, p);
  if (!r) return null;
  const next = r.steps.findIndex((s) => !s.done);
  return {
    drink: r.drink,
    shots: r.shots,
    ...(r.syrup ? { syrup: r.syrup } : {}),
    steps: r.steps.map((s, i) => ({
      step: s.step,
      icon: STEP_ICON[s.step],
      label: STEP_LABEL[s.step],
      state: (s.done ? 'done' : i === next ? 'next' : 'todo') as StepState,
    })),
  };
}

/**
 * Mirrors `addSyrup` gates (handmade.ts) without mutating: Gear day/closing, empty tool, a syrup-able
 * cup with no syrup yet, flavour in stock, and in reach of the rack.
 */
export function canAddSyrup(state: GameState, p: Player): boolean {
  if (state.gear !== true || (state.phase !== 'day' && state.phase !== 'closing')) return false;
  if (inPreOpen(state)) return false; // FB2 C10: the sim ignores syrup during the pre-open
  if (p.tool !== null || p.holding === null || !(SYRUP_CUPS as readonly string[]).includes(p.holding)) return false;
  if (p.made?.syrup || (state.supplies.flavour ?? 0) < 1) return false;
  const rack = state.stations.find(isSyrupRack);
  if (!rack || dist(p.pos, rack.pos) > ECONOMY.interactRangeTiles) return false;
  return true;
}

/** Why the syrup rack is idle (for the grey hint), or null when add would succeed. */
export function syrupRackBlock(state: GameState, p: Player): string | null {
  if (canAddSyrup(state, p)) return null;
  if (state.gear !== true) return 'Not in this shop';
  if (p.tool !== null) return 'Hands are full';
  if (p.holding === null) return 'Bring a shot or a latte';
  if (!(SYRUP_CUPS as readonly string[]).includes(p.holding)) return 'This drink takes no syrup';
  if (p.made?.syrup) return `Already has ${p.made.syrup}`;
  if ((state.supplies.flavour ?? 0) < 1) return 'Out of flavour syrup';
  return 'Walk up to the syrup rack';
}

export const HANDMADE_EVENTS = ['milk.fill', 'steam.result', 'syrup.add', 'syrup.miss'] as const;
export type HandmadeEventKind = (typeof HANDMADE_EVENTS)[number];
export const isHandmadeEvent = (k: string): k is HandmadeEventKind => (HANDMADE_EVENTS as readonly string[]).includes(k);

export interface HandmadeToast {
  text: string;
  tone: 'good' | 'warn' | 'bad';
  /** Station id to rise over (wand, syrup rack, or the barista). */
  at?: string;
}

const FILL_LINE: Record<FillGrade, { text: string; tone: HandmadeToast['tone'] }> = {
  right: { text: 'Milk: right on the line', tone: 'good' },
  under: { text: 'Milk: a bit low', tone: 'warn' },
  over: { text: 'Milk: overfilled · wasted a pour', tone: 'warn' },
};
const STEAM_LINE: Record<SteamGrade, { text: string; tone: HandmadeToast['tone'] }> = {
  perfect: { text: 'Foam: perfect!', tone: 'good' },
  ok: { text: 'Foam: good enough', tone: 'good' },
  miss: { text: 'Foam: missed', tone: 'bad' },
};
const FLAVOUR_NAME: Record<Flavour, string> = { vanilla: 'vanilla', caramel: 'caramel' };

/** A one-line toast for a B8 event, or null when it needs none. */
export function handmadeToast(e: Pick<SimEvent, 'kind' | 'data'>, names: (id: string) => string): HandmadeToast | null {
  const d = e.data as Record<string, unknown>;
  const who = typeof d.by === 'string' ? names(d.by) : '';
  switch (e.kind) {
    case 'milk.fill': {
      const grade = (d.grade as FillGrade) ?? 'right';
      const line = FILL_LINE[grade] ?? FILL_LINE.right;
      return { text: who ? `${who}: ${line.text}` : line.text, tone: line.tone };
    }
    case 'steam.result': {
      const grade = (d.grade as SteamGrade) ?? 'ok';
      const line = STEAM_LINE[grade] ?? STEAM_LINE.ok;
      return { text: who ? `${who}: ${line.text}` : line.text, tone: line.tone };
    }
    case 'syrup.add': {
      const flavour = (d.flavour as Flavour) ?? 'vanilla';
      return {
        text: who ? `${who} added ${FLAVOUR_NAME[flavour]} syrup` : `Added ${FLAVOUR_NAME[flavour]} syrup`,
        tone: 'good',
        at: SYRUP_ID,
      };
    }
    case 'syrup.miss':
      return { text: 'Wrong syrup (or none) — they tip less', tone: 'bad', at: SYRUP_ID };
    default:
      return null;
  }
}
