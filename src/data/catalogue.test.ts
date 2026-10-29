import { describe, it, expect } from 'vitest';
import { CATALOGUE, catalogueById } from './catalogue';
import { SCENARIOS, scenarioById } from './scenarios';

describe('catalogue and scenarios data', () => {
  it('has unique ids and valid references', () => {
    expect(CATALOGUE.length).toBeGreaterThanOrEqual(19);
    expect(new Set(CATALOGUE.map((i) => i.id)).size).toBe(CATALOGUE.length);
    for (const i of CATALOGUE) {
      for (const r of [...(i.requires ?? []), ...(i.excludes ?? [])]) expect(catalogueById[r]).toBeDefined();
    }
  });

  it('matches spec prices and durations', () => {
    expect(catalogueById.chirperThread.cost).toBe(0);
    expect(catalogueById.chirperThread.duration).toBe('tomorrow');
    expect(catalogueById.laMazzoccaPro.requires).toEqual(['dualBoiler']);
    expect(catalogueById.singleOrigin.excludes).toEqual(['cheapBeans']);
    expect(catalogueById.digitalKiosk).toBeUndefined(); // P3 B12: now the checkout path
    expect(catalogueById.streetSign).toMatchObject({ name: 'Street sign', cost: 15, effects: [{ kind: 'traffic', mul: 1.05 }] });
    expect(CATALOGUE.filter((i) => i.cost < 30).length).toBeGreaterThanOrEqual(5);
  });

  it('has four scenarios with names and notes', () => {
    expect(SCENARIOS.map((s) => s.id)).toEqual(['normal', 'campusTown', 'rainyWeek', 'touristSeason']);
    expect(scenarioById.rainyWeek.name).toBe('Rainy week');
    expect(SCENARIOS.every((s) => s.note.length > 0)).toBe(true);
  });
});
