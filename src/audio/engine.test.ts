import { describe, expect, it } from 'vitest';
import { memoryStorage } from '../storage/storageLike';
import type { CueId } from './cues';
import { fakeAudioContext } from './fakeAudio';
import { createAudioEngine } from './engine';
import { RECIPES, SAMPLES } from './recipes';
import { AUDIO_KEY } from './settings';
import * as synth from './synth';

const ALL_CUES = Object.keys(RECIPES) as CueId[];

function setup() {
  const fake = fakeAudioContext();
  let clock = 0;
  const fetched: string[] = [];
  const storage = memoryStorage();
  const engine = createAudioEngine({
    storage,
    createContext: () => fake.ctx as unknown as AudioContext,
    renderLoops: false,
    baseUrl: '/CafeTycoon/',
    now: () => clock,
    random: () => 0.5,
    fetch: async (url) => {
      fetched.push(url);
      return { ok: true, arrayBuffer: async () => new ArrayBuffer(8) };
    },
  });
  const sources = () => fake.nodes.filter((n) => n.kind === 'source' || n.kind === 'osc').length;
  return { fake, engine, storage, fetched, sources, tick: (ms: number) => (clock += ms) };
}

describe('audio engine', () => {
  it('makes no sound and no context before a user gesture', () => {
    const { engine, fake } = setup();
    expect(engine.play({ id: 'serve' })).toBe(false);
    expect(engine.unlocked).toBe(false);
    expect(fake.nodes.length).toBe(1); // just the fake's destination
  });

  it('loads every sample from the base path once unlocked', async () => {
    const { engine, fetched } = setup();
    engine.unlock();
    engine.unlock();
    await new Promise((r) => setTimeout(r, 0));
    expect(fetched).toHaveLength(SAMPLES.length);
    expect(fetched[0]).toMatch(/^\/CafeTycoon\/audio\/sfx\/\w+\.mp3$/);
  });

  it('plays every cue, throttling a burst', async () => {
    const { engine, sources, tick } = setup();
    engine.unlock();
    await new Promise((r) => setTimeout(r, 0));
    for (const id of ALL_CUES) {
      const before = sources();
      expect(engine.play({ id, dur: 2 }), id).toBe(true);
      expect(sources(), id).toBeGreaterThan(before);
      tick(3000);
    }
    expect(engine.play({ id: 'doorBell' })).toBe(true);
    expect(engine.play({ id: 'doorBell' })).toBe(false);
    tick(2000);
    expect(engine.play({ id: 'doorBell' })).toBe(true);
  });

  it('mutes, saves the setting and drives the bus gains', () => {
    const { engine, storage, fake } = setup();
    engine.unlock();
    const seen: boolean[] = [];
    engine.onChange((s) => seen.push(s.muted));
    engine.toggleMute();
    expect(engine.play({ id: 'click' })).toBe(false);
    expect(JSON.parse(storage.getItem(AUDIO_KEY)!).muted).toBe(true);
    engine.toggleMute();
    expect(seen).toEqual([true, false]);
    engine.update({ master: 0.5, sfx: 0.4, music: 0.2 });
    const targets = fake.nodes
      .filter((n) => n.kind === 'gain')
      .flatMap((n) => (n.gain as { events: [string, ...number[]][] }).events.filter((e) => e[0] === 'setTargetAtTime').map((e) => e[1]));
    expect(targets).toContain(0.5 * 0.4);
  });

  it('takes ambience before or after unlocking without throwing', () => {
    const { engine } = setup();
    engine.setAmbience({ music: 'day', crowd: 0.5, powerOut: false });
    engine.unlock();
    engine.setAmbience({ music: 'night', crowd: 0, powerOut: true });
  });

  it('does nothing when the browser has no Web Audio', () => {
    const engine = createAudioEngine({ storage: memoryStorage(), createContext: () => null, renderLoops: false });
    engine.unlock();
    expect(engine.play({ id: 'click' })).toBe(false);
  });
});

describe('sound recipes', () => {
  it('give every cue at least one layer, using only shipped samples and real synths', () => {
    for (const id of ALL_CUES) {
      expect(RECIPES[id].length, id).toBeGreaterThan(0);
      for (const l of RECIPES[id]) {
        if ('synth' in l) expect(typeof synth[l.synth]).toBe('function');
        else for (const s of [l.sample].flat()) expect(SAMPLES).toContain(s);
      }
    }
  });

  it('schedule finite, positive-length synth sounds', () => {
    for (const [name, fn] of Object.entries(synth)) {
      const { ctx } = fakeAudioContext();
      const len = fn(ctx as unknown as BaseAudioContext, ctx.destination as unknown as AudioNode, 0, 2, () => 0.3);
      expect(Number.isFinite(len) && len > 0, name).toBe(true);
    }
  });
});
