/** P3 B16: apply the run's head start (picked on the title from this browser's meta save). */
import { isPerkId, PERK_TUNING, type PerkId } from '../data/perks';
import type { GameState } from './types';

/** Once, at createRun, after gearStart. Classic runs and unknown ids are ignored. */
export function applyPerk(state: GameState, perk: PerkId | undefined): void {
  if (!state.gear || !isPerkId(perk)) return;
  state.perk = perk;
  if (perk === 'nestEgg') {
    state.cash += PERK_TUNING.nestEggCash;
    state.startingCash += PERK_TUNING.nestEggCash; // the score stays profit vs. start
  } else if (perk === 'pantry') {
    state.supplies.beans += PERK_TUNING.pantry.beans;
    state.supplies.milk += PERK_TUNING.pantry.milk;
  } else if (perk === 'wordOfMouth') {
    state.reputation = Math.max(state.reputation, PERK_TUNING.wordOfMouthRep);
  }
}
