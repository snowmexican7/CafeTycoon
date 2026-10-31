/**
 * End-of-week awards (B10). Pure and deterministic: derived from `state.crew` (tallied from the log)
 * and the day stats. Ties go to whoever joined the stats table first. Every person on the crew gets
 * at least one award, so the ceremony screenshot has everyone in it.
 */
import type { GameState } from './types';
import { crewRows, type CountKey, type PlayerStats } from './stats';

export interface Award {
  id: string;
  title: string;
  /** A one-glyph badge for the card. */
  icon: string;
  winner: string;
  bot: boolean;
  /** The number behind it, already worded ("14 serves"). */
  stat: string;
  /** A short deadpan line. */
  line: string;
  /** joke = filler awards that only show when someone has nothing else. */
  tone: 'mvp' | 'hero' | 'chaos' | 'joke';
}

interface AwardDef {
  id: string;
  title: string;
  icon: string;
  key: CountKey;
  min: number;
  unit: [string, string];
  line: string;
  tone: Award['tone'];
}

/** Order = ceremony order. Each needs at least `min` to be given at all. */
// Order is priority: the signature awards claim winners first (each person holds at most two).
export const AWARD_DEFS: AwardDef[] = [
  { id: 'speed', title: 'Speed Demon', icon: '⚡', key: 'serves', min: 3, unit: ['serve', 'serves'], line: 'Blink and they were served.', tone: 'hero' },
  { id: 'slip', title: 'Slip King', icon: '🍌', key: 'slips', min: 1, unit: ['slip', 'slips'], line: 'Gravity is undefeated.', tone: 'chaos' },
  { id: 'mop', title: 'Mop Hero', icon: '🧽', key: 'mopped', min: 2, unit: ['mess mopped', 'messes mopped'], line: 'The floor owes them a favour.', tone: 'hero' },
  { id: 'caffeine', title: 'Caffeine Gremlin', icon: '☕', key: 'espressos', min: 2, unit: ['espresso drunk', 'espressos drunk'], line: 'Can now hear colours.', tone: 'chaos' },
  { id: 'handoff', title: 'Hand-off Hero', icon: '🤝', key: 'handoffs', min: 3, unit: ['hand-off', 'hand-offs'], line: 'Teamwork makes the dream work.', tone: 'hero' },
  { id: 'cat', title: 'Cat Whisperer', icon: '🐈', key: 'catPets', min: 1, unit: ['cat pet', 'cat pets'], line: 'The cat tolerates them. High praise.', tone: 'hero' },
  { id: 'mess', title: 'Agent of Chaos', icon: '💥', key: 'messes', min: 2, unit: ['mess made', 'messes made'], line: 'Every café needs a little entropy.', tone: 'chaos' },
  { id: 'rescue', title: 'Customer Whisperer', icon: '🫶', key: 'rescues', min: 1, unit: ['rescue', 'rescues'], line: 'Turned frowns into regulars.', tone: 'hero' },
  { id: 'ambulance', title: 'Frequent Flyer', icon: '🚑', key: 'collapses', min: 1, unit: ['ambulance ride', 'ambulance rides'], line: 'The paramedics know them by name.', tone: 'chaos' },
  { id: 'camper', title: 'Wi-Fi Bouncer', icon: '📶', key: 'campersShooed', min: 1, unit: ['camper shooed', 'campers shooed'], line: '"Sir, this is a café."', tone: 'hero' },
  { id: 'alarm', title: 'Fire Marshal', icon: '🧯', key: 'alarmsStopped', min: 1, unit: ['alarm silenced', 'alarms silenced'], line: 'It was just the beans. Probably.', tone: 'hero' },
  { id: 'perfect', title: 'Latte Laureate', icon: '🏅', key: 'perfect', min: 3, unit: ['perfect serve', 'perfect serves'], line: 'Customers wept. Happily.', tone: 'hero' },
  { id: 'tips', title: 'Tip Magnet', icon: '💰', key: 'earned', min: 40, unit: ['brought in', 'brought in'], line: 'Charm is a currency.', tone: 'hero' },
  { id: 'bin', title: 'Bin Diver', icon: '🗑️', key: 'binned', min: 3, unit: ['thing binned', 'things binned'], line: 'Quality control, technically.', tone: 'chaos' },
  { id: 'shop', title: 'Shopaholic', icon: '🛍️', key: 'cardsBought', min: 3, unit: ['card bought', 'cards bought'], line: 'Treat yourself. With the café\'s money.', tone: 'chaos' },
];

/** Fallbacks so nobody leaves empty-handed. Picked by a stable hash of the name, never random. */
const CONSOLATION: { title: string; icon: string; line: string }[] = [
  { title: 'Perfect Attendance', icon: '📋', line: 'Showed up. Technically.' },
  { title: 'Vibes Manager', icon: '✨', line: 'Contributed energy. Unmeasurable energy.' },
  { title: 'Professional Statue', icon: '🗿', line: 'Stood very still with great conviction.' },
  { title: 'Most Likely to Be Mistaken for a Plant', icon: '🪴', line: 'Watered twice by accident.' },
  { title: 'Moral Support', icon: '📣', line: 'Cheered from a safe distance.' },
];

/** MVP + nine: two columns of five on a 1280x800 screen. */
const MAX_AWARDS = 10;

const fmtStat = (def: AwardDef, n: number) => (def.key === 'earned' ? `$${Math.round(n)} brought in` : `${n} ${n === 1 ? def.unit[0] : def.unit[1]}`);

function hash(s: string): number {
  let h = 7;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h;
}

/** MVP score: what the crew would vote for. Serving counts most; looking after the floor and the customers counts too. */
export function mvpScore(r: PlayerStats): number {
  return r.serves * 3 + r.perfect * 2 + r.handoffs * 2 + r.mopped * 2 + r.rescues * 3 + r.alarmsStopped * 2 + r.campersShooed - r.messes;
}

function best(rows: PlayerStats[], key: (r: PlayerStats) => number): PlayerStats | null {
  let top: PlayerStats | null = null;
  for (const r of rows) if (top === null || key(r) > key(top)) top = r;
  return top;
}

export function awardsFor(state: GameState): Award[] {
  const rows = crewRows(state);
  const people = rows.filter((r) => !r.bot);
  const out: Award[] = [];
  const pool = people.length > 0 ? people : rows;
  const mvp = best(pool, mvpScore);
  if (mvp && mvpScore(mvp) > 0) {
    out.push({ id: 'mvp', title: 'Crew MVP', icon: '🏆', winner: mvp.name, bot: mvp.bot, stat: `${mvp.serves} served · ${mvp.perfect} perfect`, line: 'Carried the café. Possibly on their back.', tone: 'mvp' });
  }
  const bots = rows.filter((r) => r.bot);
  const topBot = best(bots, mvpScore);
  if (people.length > 0 && topBot && mvpScore(topBot) > 0) {
    out.push({ id: 'bot', title: 'Best Supporting Bot', icon: '🤖', winner: topBot.name, bot: true, stat: `${topBot.serves} served`, line: 'Asked for nothing. Received nothing.', tone: 'hero' });
  }
  // At most two trophies each (MVP included), so the ceremony fits one screen and spreads the glory.
  const held = (name: string) => out.filter((a) => a.winner === name).length;
  for (const def of AWARD_DEFS) {
    if (out.length >= MAX_AWARDS) break;
    const top = best(rows.filter((r) => held(r.name) < 2), (r) => r[def.key]);
    if (!top || top[def.key] < def.min) continue;
    out.push({ id: def.id, title: def.title, icon: def.icon, winner: top.name, bot: top.bot, stat: fmtStat(def, top[def.key]), line: def.line, tone: def.tone });
  }
  // Everyone on the crew (people) gets something.
  const named = new Set(out.map((a) => a.winner));
  let i = 0;
  for (const r of people) {
    if (named.has(r.name)) continue;
    const c = CONSOLATION[(hash(r.name) + i++) % CONSOLATION.length];
    out.push({ id: `joke-${r.id}`, title: c.title, icon: c.icon, winner: r.name, bot: false, stat: r.serves > 0 ? `${r.serves} served` : 'no serves (yet)', line: c.line, tone: 'joke' });
  }
  return out;
}

/** Plain text for "Copy awards" (pastes nicely into a group chat). */
export function awardsText(state: GameState, awards: Award[]): string {
  const served = state.days.reduce((n, d) => n + d.served, 0);
  const lines = [`☕ CafeTycoon week awards (seed ${state.seed}) · ${state.days.length} days · ${served} served`];
  for (const a of awards) lines.push(`${a.icon} ${a.title}: ${a.winner}${a.bot ? ' (bot)' : ''} (${a.stat})`);
  return lines.join('\n');
}
