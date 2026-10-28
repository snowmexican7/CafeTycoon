import { describe, expect, it } from 'vitest';
import roadmapRaw from '../../public/roadmap.json?raw';
import { LAYOUT } from '../data/layout';
import { FRONT, PALETTE, PLAYER_COLORS, TILE, WALL, baristaLook, customerLook, isNightLook, nextFacing, patienceColor, sx, sy } from './theme';

describe('render theme', () => {
  it('maps sim tiles to screen with the back wall offset only on y', () => {
    expect(sx(0)).toBe(0);
    expect(sx(LAYOUT.width)).toBe(LAYOUT.width * TILE);
    expect(sy(0)).toBe(WALL);
    expect(sy(LAYOUT.height) + FRONT).toBe(688);
  });

  it('colours patience green → amber → red', () => {
    expect(patienceColor(1)).toBe(PALETTE.good);
    expect(patienceColor(0.4)).toBe(PALETTE.warn);
    expect(patienceColor(0.1)).toBe(PALETTE.bad);
  });

  it('gives each customer a stable look', () => {
    for (let id = 0; id < 50; id++) {
      const a = customerLook(id);
      expect(customerLook(id)).toEqual(a);
      expect(Object.values(a).every((c) => Number.isInteger(c) && c >= 0 && c <= 0xffffff)).toBe(true);
    }
    const shirts = new Set(Array.from({ length: 30 }, (_, i) => customerLook(i).shirt));
    expect(shirts.size).toBeGreaterThan(3);
  });

  it('gives the four baristas distinct cap colours', () => {
    const caps = [0, 1, 2, 3].map((i) => baristaLook(i).cap);
    expect(new Set(caps).size).toBe(4);
    expect(caps).toEqual([...PLAYER_COLORS]);
  });

  it('uses the night look outside the day', () => {
    expect(isNightLook('day')).toBe(false);
    expect(isNightLook('closing')).toBe(false);
    for (const p of ['night', 'weekEnd', 'ended']) expect(isNightLook(p)).toBe(true);
  });

  it('faces the last vertical direction moved', () => {
    expect(nextFacing('down', { x: 0, y: -1 })).toBe('up');
    expect(nextFacing('up', { x: 0, y: 1 })).toBe('down');
    expect(nextFacing('up', { x: 1, y: 0 })).toBe('up');
    expect(nextFacing('down', { x: 0, y: 0 })).toBe('down');
  });
});

describe('public/roadmap.json', () => {
  const roadmap = JSON.parse(roadmapRaw);
  it('lists five phases with valid statuses and goals', () => {
    expect(roadmap.phases.map((p: { id: number }) => p.id)).toEqual([1, 2, 3, 4, 5]);
    for (const p of roadmap.phases) {
      expect(['done', 'now', 'next', 'planned', 'suggested']).toContain(p.status);
      expect(p.goals.length).toBeGreaterThan(0);
      for (const g of p.goals) expect(['done', 'doing', 'todo']).toContain(g.state);
    }
  });
});
