// Order mix before and after a shop identity. No browser.
//   npx tsx scripts/specialtyProbe.ts
//
// Same café, same seed, same menu. "Before" is a neighbourhood shop with a wand (milkPush on).
// "After" is the earned identity: milkPush steps aside and the identity weight applies.
// Area is tourist season (no family pull) and the forecast is an ordinary day, so the
// difference is the identity. Gear pull is in both columns.
import { DRINK_FAMILY, type DrinkFamily } from '../src/data/areas';
import { GEAR, type GearId } from '../src/data/gear';
import { drawDrink } from '../src/sim/customers';
import { computeModifiers } from '../src/sim/effects';
import { milkPush } from '../src/sim/lattes';
import { createRun, startDay } from '../src/sim/run';
import { stationsFromSlots } from '../src/sim/slots';
import { SPECIALTY } from '../src/sim/specialty';
import type { DrinkId, GameState, SupplyId } from '../src/sim/types';

const DRAWS = 20000;
const EARLY: DrinkId[] = ['espresso', 'latte', 'coldBrew', 'drip'];
const WIDE: DrinkId[] = ['espresso', 'latte', 'cappuccino', 'drip', 'cafeAuLait', 'coldBrew'];

type Kit = GearId | 'steamer';

function cafe(): GameState {
  const s = createRun({ seed: 11, hostId: 'p1', players: [{ id: 'p1', name: 'K' }], tier: 'cafe', gear: true });
  const gear: Kit[] = ['g1', 'e2', 'steamer', 'c1', 'd1'];
  const slots = [...s.slots!];
  const slotGear = [...s.slotGear!];
  gear.forEach((id, i) => {
    slots[i] = id === 'steamer' ? 'steamer' : GEAR[id].station;
    slotGear[i] = id === 'steamer' ? null : id;
  });
  s.slots = slots;
  s.slotGear = slotGear;
  s.stations = stationsFromSlots(s.tier, slots, slotGear);
  s.day = 5;
  s.scenario = 'touristSeason';
  s.forecast = 'ordinary';
  const out = startDay(s);
  out.scenario = 'touristSeason';
  out.forecast = 'ordinary';
  for (const k of ['beans', 'milk', 'concentrate'] as SupplyId[]) out.supplies[k] = 99;
  return out;
}

function mix(s: GameState, menu: DrinkId[]): Record<DrinkFamily | 'cups', number> {
  const start = s.rng;
  const m = computeModifiers(s);
  const n: Record<string, number> = { espresso: 0, milky: 0, iced: 0, filter: 0, cups: DRAWS };
  for (let i = 0; i < DRAWS; i++) {
    const fam = DRINK_FAMILY[drawDrink(s, menu, m)];
    if (fam) n[fam] = (n[fam] ?? 0) + 1;
  }
  s.rng = start;
  return n as Record<DrinkFamily | 'cups', number>;
}

function pct(n: number): string {
  return `${((n / DRAWS) * 100).toFixed(1)}%`;
}

function line(label: string, row: Record<DrinkFamily | 'cups', number>, push: number): string {
  const spec = row.espresso + row.milky;
  return [
    label.padEnd(22),
    `espresso ${pct(row.espresso)}`,
    `milky ${pct(row.milky)}`,
    `espresso+milky ${pct(spec)}`,
    `filter ${pct(row.filter)}`,
    `iced ${pct(row.iced)}`,
    `milkPush ${push.toFixed(2)}`,
  ].join('  ');
}

const s = cafe();
const m = computeModifiers(s);
const menus: [string, DrinkId[]][] = [['early (espresso, latte, cold brew, drip)', EARLY], ['wide (plus cappuccino and café au lait)', WIDE]];

console.log(`draws ${DRAWS}  specialtyPull ${SPECIALTY.specialtyPull}  fastPull ${SPECIALTY.fastPull}  oneOff ${(SPECIALTY.oneOff * 100).toFixed(0)}%`);
console.log('tourist season, ordinary day, wand on the bar. Before = no identity. After = identity set.\n');

for (const [name, menu] of menus) {
  console.log(name);
  const before = mix(s, menu);
  const pushBefore = milkPush(s, menu, m);
  s.shopIdentity = 'specialty';
  const spec = mix(s, menu);
  const pushSpec = milkPush(s, menu, m);
  s.shopIdentity = 'fastCasual';
  const fast = mix(s, menu);
  const pushFast = milkPush(s, menu, m);
  delete s.shopIdentity;
  console.log(line('before', before, pushBefore));
  console.log(line('after specialty', spec, pushSpec));
  console.log(line('after quick cup', fast, pushFast));
  const specDelta = ((spec.espresso + spec.milky) - (before.espresso + before.milky)) / DRAWS * 100;
  const fastDelta = (fast.filter - before.filter) / DRAWS * 100;
  console.log(`  specialty espresso+milky ${specDelta >= 0 ? '+' : ''}${specDelta.toFixed(1)} points    quick cup filter ${fastDelta >= 0 ? '+' : ''}${fastDelta.toFixed(1)} points\n`);
}
