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
import type { SoldDay } from '../src/sim/types';
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

const latteWindow: SoldDay[] = [{ day: 1, drinks: { latte: 70, espresso: 10, drip: 10, coldBrew: 10 } }];
const espressoWindow: SoldDay[] = [{ day: 1, drinks: { espresso: 60, latte: 8, drip: 16, coldBrew: 16 } }];
const fastWindow: SoldDay[] = [{ day: 1, drinks: { drip: 70, latte: 15, espresso: 10, coldBrew: 5 } }];

console.log(`draws ${DRAWS}  latteLift ${SPECIALTY.latteLift}  espressoLift ${SPECIALTY.espressoLift}  fastLift ${SPECIALTY.fastLift}  oneOff ${(SPECIALTY.oneOff * 100).toFixed(0)}%`);
console.log('tourist season, ordinary day, wand on the bar. Before = no identity (wand push on). After = that name.\n');

function points(after: number, before: number): string {
  const d = ((after - before) / DRAWS) * 100;
  return `${d >= 0 ? '+' : ''}${d.toFixed(1)}`;
}

for (const [name, menu] of menus) {
  console.log(name);
  delete s.shopIdentity;
  delete s.soldWindow;
  const before = mix(s, menu);
  const pushBefore = milkPush(s, menu, m);
  s.shopIdentity = 'specialty';
  s.soldWindow = latteWindow;
  const latte = mix(s, menu);
  const pushLatte = milkPush(s, menu, m);
  s.soldWindow = espressoWindow;
  const espresso = mix(s, menu);
  const pushEspresso = milkPush(s, menu, m);
  s.shopIdentity = 'fastCasual';
  s.soldWindow = fastWindow;
  const fast = mix(s, menu);
  const pushFast = milkPush(s, menu, m);
  delete s.shopIdentity;
  delete s.soldWindow;
  console.log(line('before', before, pushBefore));
  console.log(line('after latte bar', latte, pushLatte));
  console.log(line('after espresso bar', espresso, pushEspresso));
  console.log(line('after quick cup', fast, pushFast));
  console.log(`  latte bar milky ${points(latte.milky, before.milky)}    espresso bar espresso ${points(espresso.espresso, before.espresso)}    quick cup filter ${points(fast.filter, before.filter)}\n`);
}
