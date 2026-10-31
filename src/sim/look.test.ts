import { describe, it, expect } from 'vitest';
import { cleanLook } from './look';
import { createRun, startDay } from './run';
import { step } from './step';
import { validateInput } from './validate';
import type { GameState, PlayerInput, PlayerLook } from './types';

const LOOK: PlayerLook = { hair: 'bob', hairColor: '#aa5500', skin: 'tan2', outfit: 'dress_a', shirtColor: '#3366cc' };
const opts = { seed: 3, hostId: 'p1', players: [{ id: 'p1', name: 'K', look: LOOK }, { id: 'p2', name: 'S' }], settings: { bots: 0 } };
const look = (p: string, l: unknown) => ({ kind: 'look', playerId: p, look: l }) as unknown as PlayerInput;

describe('cleanLook', () => {
  it('keeps a good look, drops unknown keys and a bad optional hairColor', () => {
    expect(cleanLook(LOOK)).toEqual(LOOK);
    expect(cleanLook({ hair: 'a', skin: 'b', outfit: 'c', shirtColor: 'd', extra: 'x', hairColor: 'no spaces' })).toEqual({ hair: 'a', skin: 'b', outfit: 'c', shirtColor: 'd' });
  });
  it('refuses the whole look when a required field is missing, too long, empty or has odd characters', () => {
    expect(cleanLook(undefined)).toBeUndefined();
    expect(cleanLook('bob')).toBeUndefined();
    expect(cleanLook({ ...LOOK, hair: undefined })).toBeUndefined();
    expect(cleanLook({ ...LOOK, hair: '' })).toBeUndefined();
    expect(cleanLook({ ...LOOK, skin: 'x'.repeat(33) })).toBeUndefined();
    expect(cleanLook({ ...LOOK, outfit: '<script>' })).toBeUndefined();
    expect(cleanLook({ ...LOOK, shirtColor: 7 })).toBeUndefined();
    expect(cleanLook({ ...LOOK, hair: 'x'.repeat(32) })).toBeDefined();
  });
});

describe('look in the sim', () => {
  it('createRun and a join carry the look onto the player (bots have none)', () => {
    const s = createRun(opts);
    expect(s.players.find((p) => p.id === 'p1')!.look).toEqual(LOOK);
    expect(s.players.find((p) => p.id === 'p2')!.look).toBeUndefined();
    const t = step(s, [{ kind: 'join', playerId: 'p3', name: 'Jo', look: { ...LOOK, hair: 'bun' } }]);
    expect(t.players.find((p) => p.id === 'p3')!.look!.hair).toBe('bun');
    const u = step(t, [{ kind: 'join', playerId: 'p4', name: 'Al', look: { hair: 'bad hair', skin: 's', outfit: 'o', shirtColor: 'c' } }]);
    expect(u.players.find((p) => p.id === 'p4')!.look).toBeUndefined();
  });

  it('a bad look in createRun players is cleaned away', () => {
    const s = createRun({ ...opts, players: [{ id: 'p1', name: 'K', look: { hair: '' } as unknown as PlayerLook }, { id: 'p2', name: 'S' }] });
    expect(s.players[0]!.look).toBeUndefined();
  });

  it('a night edit updates the player; so does a week-end edit', () => {
    let s = createRun(opts);
    expect(s.phase).toBe('night');
    s = step(s, [look('p2', { hair: 'fade', skin: 'deep', outfit: 'apron', shirtColor: '#ffffff', hairColor: '#000000' })]);
    expect(s.players.find((p) => p.id === 'p2')!.look).toEqual({ hair: 'fade', skin: 'deep', outfit: 'apron', shirtColor: '#ffffff', hairColor: '#000000' });
    s.phase = 'weekEnd';
    s = step(s, [look('p1', { ...LOOK, outfit: 'suit' })]);
    expect(s.players.find((p) => p.id === 'p1')!.look!.outfit).toBe('suit');
  });

  it('an edit replaces the whole look (a dropped hairColor goes away)', () => {
    let s = createRun(opts);
    s = step(s, [look('p1', { hair: 'a', skin: 'b', outfit: 'c', shirtColor: 'd' })]);
    expect(s.players[0]!.look).toEqual({ hair: 'a', skin: 'b', outfit: 'c', shirtColor: 'd' });
  });

  it('a bad look edit is refused and the old look stays', () => {
    let s = createRun(opts);
    expect(validateInput(look('p1', { ...LOOK, hair: 'x'.repeat(40) }))).toBeNull();
    expect(validateInput(look('p1', null))).toBeNull();
    s = step(s, [look('p1', { ...LOOK, hair: 'x'.repeat(40) })]);
    expect(s.players[0]!.look).toEqual(LOOK);
  });

  it('refuses a day-phase (or closing) edit', () => {
    let s: GameState = startDay(createRun(opts));
    expect(s.phase).toBe('day');
    s = step(s, [look('p1', { ...LOOK, hair: 'bun' })]);
    expect(s.players[0]!.look!.hair).toBe('bob');
    s.phase = 'closing';
    s = step(s, [look('p1', { ...LOOK, hair: 'bun' })]);
    expect(s.players[0]!.look!.hair).toBe('bob');
  });

  it('only a person that is seated can edit; a bot or a stranger changes nothing', () => {
    let s = createRun(opts);
    s = step(s, [{ kind: 'settings', playerId: 'p1', settings: { bots: 1 } }]); // a night change shows up at once
    const bot = s.players.find((p) => p.bot);
    expect(bot).toBeDefined();
    s = step(s, [look(bot!.id, LOOK), look('ghost', LOOK)]);
    expect(s.players.find((p) => p.id === bot!.id)!.look).toBeUndefined();
    expect(s.players.find((p) => p.id === 'ghost')).toBeUndefined();
  });

  it('a returning join with a look updates it; without one leaves it', () => {
    let s = createRun(opts);
    s = step(s, [{ kind: 'leave', playerId: 'p1' }]);
    s = step(s, [{ kind: 'join', playerId: 'p1', name: 'K' }]);
    expect(s.players[0]!.look).toEqual(LOOK);
    s = step(s, [{ kind: 'join', playerId: 'p1', name: 'K', look: { ...LOOK, hair: 'bun' } }]);
    expect(s.players[0]!.look!.hair).toBe('bun');
  });
});
