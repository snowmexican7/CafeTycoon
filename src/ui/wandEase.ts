/**
 * ui-3.10.0 (bot cut Phase 3 follow-up): steam wands make the hand-made meters easier, not faster (Kennedy
 * 2026-11-06). Wand seconds no longer matter for people's lattes, so the gear cards show each wand's ease instead:
 * four pips (`WandEase` 0–3 from src/sim/handmade.ts) and a one-line "what it does".
 */
import { GEAR, type GearId } from '../data/gear';
import { WAND_EASE, type WandEase } from '../sim/handmade';

export interface WandEaseVM {
  ease: WandEase;
  /** "●●○○": filled pips = ease + 1 of 4. */
  pips: string;
  /** Short, player-facing: what the wand does to the foam meter. */
  text: string;
}

/** The ease a wand gives: little 0, proper 1, built in 2 (The Annihilator) or 3 (Double Trouble, built tier ≥ 4). */
export function easeOfWand(wand: 'weak' | 'strong' | 'built', gear?: GearId | null): WandEase {
  if (wand === 'weak') return 0;
  if (wand === 'strong') return 1;
  const built = gear ? GEAR[gear]?.wand?.built : undefined;
  return built && built.tier >= 4 ? 3 : 2;
}

const TEXT: Record<WandEase, string> = {
  0: 'Narrow foam band',
  1: 'Wider foam band, ×{x}',
  2: 'Wide foam band, easier perfect steam',
  3: 'Foam nearly always perfect',
};

export function wandEaseVM(ease: WandEase): WandEaseVM {
  const x = WAND_EASE[ease]!.perfect / WAND_EASE[0]!.perfect;
  const mul = Number.isInteger(x) ? String(x) : x.toFixed(1).replace(/\.0$/, '');
  return { ease, pips: '●'.repeat(ease + 1) + '○'.repeat(3 - ease), text: TEXT[ease].replace('{x}', mul) };
}

/** The little chip the Gear tab draws: "Ease ●●○○" with the text as its tooltip. */
export function wandEaseChip(v: WandEaseVM): string {
  const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
  return `<span class="wand-ease" data-ease="${v.ease}" title="${esc(v.text)}"><span class="we-l">Ease</span> <span class="we-p" aria-label="ease ${v.ease + 1} of 4">${v.pips}</span></span>`;
}
