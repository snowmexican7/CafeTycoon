/**
 * P3 B16: head starts carried between runs. Earned in Gear runs (src/storage/metaStore.ts keeps the
 * progress in this browser), picked on the title screen, applied once by the sim at createRun
 * (src/sim/perks.ts). One per run, Gear runs only.
 */
export type PerkId = 'nestEgg' | 'pantry' | 'wordOfMouth';

export interface PerkDef {
  name: string;
  icon: string;
  /** What it does, short enough for a select option. */
  effect: string;
  /** How you earn it, shown while it is locked. */
  unlock: string;
}

export const PERK_IDS: PerkId[] = ['nestEgg', 'pantry', 'wordOfMouth'];

export const PERKS: Record<PerkId, PerkDef> = {
  nestEgg: { name: 'Nest egg', icon: '🪙', effect: '+$20 to start', unlock: 'Finish a week' },
  pantry: { name: 'Stocked pantry', icon: '🥫', effect: '+10 beans & milk', unlock: 'Serve 100 drinks (all runs)' },
  wordOfMouth: { name: 'Word of mouth', icon: '⭐', effect: 'Open at 3★', unlock: 'Grow a stand into a cart' },
};

export const PERK_TUNING = { nestEggCash: 20, pantry: { beans: 10, milk: 10 }, wordOfMouthRep: 3, pantryServed: 100 } as const;

export const isPerkId = (v: unknown): v is PerkId => typeof v === 'string' && (PERK_IDS as string[]).includes(v);
