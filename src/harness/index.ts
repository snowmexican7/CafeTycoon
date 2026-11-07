/**
 * The test-only player (bot cut, 2026-11-06). Kennedy cut bots from the game; the old bot brain stays here so tests
 * and the headless scripts (p4Smoke, gearBalance, balanceCore) can still play whole days with stand-ins.
 * Nothing under src/ui, src/host or src/sim may import this folder for the game itself.
 */
import { setBotDriver } from '../sim/step';
import { afterBotInteract, stepBots } from './brain';

/** Plug the bot brain into `step`: every bot player (stand-ins included) thinks, moves and presses each day tick. */
export function installHarness(): void {
  setBotDriver({ step: stepBots, afterInteract: afterBotInteract });
}

export { addBots, addStandIns, humanCount, BOT_IDS, BOT_PERSONALITIES } from './crew';
