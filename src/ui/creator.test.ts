import { describe, expect, it } from 'vitest';
import { BODIES, DEFAULT_LOOK, HAIR_COLOURS, HAIR_STYLES, LOOK_PARTS, OUTFITS, SHIRT_COLOURS, SKIN_TONES, joinOutfit, lookArt, partId, randomLook, splitOutfit, stepLook } from '../render/lookModel';
import { createRun } from '../sim/run';
import { cleanLook } from '../sim/look';
import { creatorHtml } from './creator';
import { LOOK_KEY, loadLook, saveLook } from './lookStore';
import { nightHtml, type NightUiState } from './night';
import { nightViewModel } from './viewModels';

const memStore = () => {
  const m = new Map<string, string>();
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), m };
};

describe('ui-3.5.2: look catalogue', () => {
  it('has enough choices for each part (5–6+ hairstyles and skin tones, dresses included)', () => {
    expect(BODIES.length).toBe(2);
    expect(HAIR_STYLES.length).toBeGreaterThanOrEqual(5);
    expect(SKIN_TONES.length).toBeGreaterThanOrEqual(5);
    expect(HAIR_COLOURS.length).toBeGreaterThanOrEqual(5);
    expect(SHIRT_COLOURS.length).toBeGreaterThanOrEqual(5);
    expect(OUTFITS.map((o) => o.id)).toContain('dress');
  });
  it('every combination passes the sim check', () => {
    for (const b of BODIES) for (const o of OUTFITS) for (const h of HAIR_STYLES) {
      const look = { hair: h.id, hairColor: HAIR_COLOURS[0].id, skin: SKIN_TONES[5].id, outfit: joinOutfit(b.id, o.id), shirtColor: SHIRT_COLOURS[7].id };
      expect(cleanLook(look)).toEqual(look);
    }
  });
  it('the arrows step and wrap around', () => {
    const last = stepLook(DEFAULT_LOOK, 'hair', -1);
    expect(last.hair).toBe(HAIR_STYLES[HAIR_STYLES.length - 1].id);
    expect(stepLook(last, 'hair', 1).hair).toBe(DEFAULT_LOOK.hair);
    const broad = stepLook(DEFAULT_LOOK, 'body', 1);
    expect(splitOutfit(broad.outfit)).toEqual({ body: 'broad', outfit: 'apron' });
    expect(partId(stepLook(broad, 'outfit', 1), 'outfit')).toBe('dress');
    expect(partId(stepLook(broad, 'outfit', 1), 'body')).toBe('broad');
  });
  it('unknown ids (another version or a hand-edited save) draw the first option', () => {
    const art = lookArt({ hair: 'mohawk', skin: 'zz', outfit: 'cape', shirtColor: 'gold' });
    expect(art.hairStyle).toBe(HAIR_STYLES[0].value);
    expect(art.skin).toBe(SKIN_TONES[0].value);
    expect(art.outfit).toBe(OUTFITS[0].value);
    expect(art.body).toBe('slim');
  });
  it('Surprise me picks a valid look', () => {
    let x = 0.13;
    const r = randomLook(() => (x = (x * 7.31) % 1));
    expect(cleanLook(r)).toEqual(r);
  });
});

describe('ui-3.5.2: saved look', () => {
  it('saves to cafetycoon.look and reads it back', () => {
    const st = memStore();
    expect(loadLook(st)).toBeNull();
    saveLook(st, DEFAULT_LOOK);
    expect(st.m.has(LOOK_KEY)).toBe(true);
    expect(loadLook(st)).toEqual(DEFAULT_LOOK);
  });
  it('ignores a broken save and never throws', () => {
    const st = memStore();
    st.setItem(LOOK_KEY, '{nope');
    expect(loadLook(st)).toBeNull();
    st.setItem(LOOK_KEY, JSON.stringify({ hair: 'x' }));
    expect(loadLook(st)).toBeNull();
    expect(loadLook(undefined)).toBeNull();
    const bad = { getItem: () => { throw new Error('blocked'); }, setItem: () => { throw new Error('full'); } };
    expect(loadLook(bad)).toBeNull();
    expect(saveLook(bad, DEFAULT_LOOK)).toEqual(DEFAULT_LOOK);
  });
});

describe('ui-3.5.2: creator screen', () => {
  it('has a row with two arrows for every part, plus Surprise, Skip and Start', () => {
    const h = creatorHtml(DEFAULT_LOOK, 'start');
    expect(h).toContain('Make your barista');
    for (const p of LOOK_PARTS) {
      expect(h).toContain(p.label);
      expect(h.match(new RegExp(`data-part="${p.part}"`, 'g'))?.length).toBeGreaterThanOrEqual(2);
    }
    expect(h).toContain('data-action="look-random"');
    expect(h).toContain('Skip');
    expect(h).toContain('Looks good, start!');
    expect(h).not.toMatch(/\btap\b/i);
  });
  it('edit mode says Save and Cancel', () => {
    const h = creatorHtml(DEFAULT_LOOK, 'edit');
    expect(h).toContain('Edit my barista');
    expect(h).toContain('Save my look');
    expect(h).toContain('Cancel');
  });
});

describe('ui-3.5.2: night "Edit my barista"', () => {
  it('sits in the More row', () => {
    const s = createRun({ seed: 7, hostId: 'p1', players: [{ id: 'p1', name: 'K', look: DEFAULT_LOOK }], settings: { bots: 0 } });
    expect(s.players[0].look).toEqual(DEFAULT_LOOK);
    s.phase = 'night';
    const ui: NightUiState = { tab: 'tonight', spend: 'cards', drawer: null, sig: null, pitch: { kind: 'promo', text: '' } };
    expect(nightHtml(nightViewModel(s, 'p1'), undefined, null, ui)).toContain('data-action="edit-look"');
  });
});
