import type { Ambience, Cue, MusicMode } from './cues';
import { createCueGate, type CueGate } from './gate';
import { CROWD_SEC, renderCrowd, renderScore, SCORES } from './music';
import { cueSeconds, RECIPES, SAMPLES, type Layer, type SampleId } from './recipes';
import { busGains, createAudioSettingsStore, type AudioSettings } from './settings';
import * as synth from './synth';
import type { StorageLike } from '../storage/storageLike';

export interface AudioEngineOptions {
  storage: StorageLike;
  /** Defaults to `new AudioContext()`; tests pass a fake. */
  createContext?: () => AudioContext | null;
  /** Renders the music and crowd loops; defaults to real OfflineAudioContext rendering. */
  renderLoops?: boolean;
  /** Where public/audio lives (import.meta.env.BASE_URL in the app). */
  baseUrl?: string;
  fetch?: (url: string) => Promise<{ ok: boolean; arrayBuffer(): Promise<ArrayBuffer> }>;
  now?: () => number;
  random?: () => number;
}

export type AudioEngine = ReturnType<typeof createAudioEngine>;

const FADE = 0.6; // time constant for music and crowd crossfades (s)

function defaultContext(): AudioContext | null {
  const w = globalThis as unknown as { AudioContext?: typeof AudioContext; webkitAudioContext?: typeof AudioContext };
  const Ctor = w.AudioContext ?? w.webkitAudioContext;
  return Ctor ? new Ctor() : null;
}

/**
 * The game's sound. Nothing is created until `unlock()` runs from a user gesture (browsers refuse
 * to start audio otherwise). Cues pass through a gate that throttles repeats and caps voices, then
 * play their recipe on the SFX bus. Music and the crowd murmur are loops rendered once in the
 * background; until they are ready the game is simply quieter.
 */
export function createAudioEngine(opts: AudioEngineOptions) {
  const store = createAudioSettingsStore(opts.storage);
  const now = opts.now ?? (() => performance.now());
  const rnd = opts.random ?? Math.random;
  const gate: CueGate = createCueGate();
  const samples = new Map<SampleId, AudioBuffer>();
  const listeners = new Set<(s: AudioSettings) => void>();

  let ctx: AudioContext | null = null;
  let master: GainNode;
  let musicBus: GainNode;
  let sfxBus: GainNode;
  let ambBus: GainNode;
  let duck: BiquadFilterNode;
  const music: Partial<Record<MusicMode, { src: AudioBufferSourceNode; gain: GainNode }>> = {};
  const crowd: { light?: GainNode; busy?: GainNode; srcs: AudioBufferSourceNode[] } = { srcs: [] };
  let amb: Ambience = { music: 'night', crowd: 0, powerOut: false };

  function applyGains(): void {
    if (!ctx) return;
    const g = busGains(store.get());
    const t = ctx.currentTime;
    musicBus.gain.setTargetAtTime(g.music * 0.55, t, 0.05);
    sfxBus.gain.setTargetAtTime(g.sfx, t, 0.03);
    ambBus.gain.setTargetAtTime(g.sfx * 0.6, t, 0.05);
  }

  function applyAmbience(): void {
    if (!ctx) return;
    const t = ctx.currentTime;
    for (const mode of ['day', 'night'] as const) music[mode]?.gain.gain.setTargetAtTime(amb.music === mode ? 1 : 0, t, FADE);
    // two layers: a few murmuring tables fade in first, the packed-room layer joins as the queue fills
    crowd.light?.gain.setTargetAtTime(Math.min(1, amb.crowd * 2.5), t, FADE);
    crowd.busy?.gain.setTargetAtTime(Math.max(0, (amb.crowd - 0.3) / 0.7), t, FADE);
    // power out: the music winds down like a tape stopping and goes muffled
    const rate = amb.powerOut ? 0.55 : 1;
    for (const m of Object.values(music)) m?.src.playbackRate.setTargetAtTime(rate, t, amb.powerOut ? 0.25 : 0.4);
    duck.frequency.setTargetAtTime(amb.powerOut ? 500 : 20000, t, 0.25);
  }

  function startLoop(buf: AudioBuffer, out: AudioNode, offset = 0): AudioBufferSourceNode {
    const src = ctx!.createBufferSource();
    src.buffer = buf;
    src.loop = true;
    src.connect(out);
    src.start(0, offset % buf.duration);
    return src;
  }

  async function loadSample(id: SampleId): Promise<void> {
    const f = opts.fetch ?? ((u: string) => fetch(u));
    try {
      const res = await f(`${opts.baseUrl ?? '/'}audio/sfx/${id}.mp3`);
      if (!res.ok || !ctx) return;
      samples.set(id, await ctx.decodeAudioData(await res.arrayBuffer()));
    } catch {
      /* a missing sample just stays silent */
    }
  }

  async function buildLoops(): Promise<void> {
    if (!ctx) return;
    try {
      // night first: it plays on the title and at night; the day loop follows
      for (const mode of ['night', 'day'] as const) {
        const buf = await renderScore(SCORES[mode]());
        if (!ctx) return;
        const g = ctx.createGain();
        g.gain.value = 0;
        g.connect(duck);
        music[mode] = { src: startLoop(buf, g), gain: g };
        applyAmbience();
      }
      const [light, busy] = await Promise.all([renderCrowd(4, 31, 0.03), renderCrowd(12, 47, 0.05)]);
      if (!ctx) return;
      crowd.light = ctx.createGain();
      crowd.busy = ctx.createGain();
      crowd.light.gain.value = 0;
      crowd.busy.gain.value = 0;
      crowd.light.connect(ambBus);
      crowd.busy.connect(ambBus);
      crowd.srcs = [startLoop(light, crowd.light), startLoop(busy, crowd.busy, CROWD_SEC / 2)];
      applyAmbience();
    } catch {
      /* no OfflineAudioContext: play without music */
    }
  }

  function playLayer(layer: Layer, at: number, dur: number, boost: number): void {
    const c = ctx!;
    const t = at + (layer.delay ?? 0);
    const out = c.createGain();
    out.gain.value = layer.gain * boost;
    out.connect(sfxBus);
    if ('synth' in layer) {
      synth[layer.synth](c, out, t, dur, rnd);
      return;
    }
    const ids = Array.isArray(layer.sample) ? layer.sample : [layer.sample];
    const buf = samples.get(ids[Math.floor(rnd() * ids.length)]);
    if (!buf) return;
    const src = c.createBufferSource();
    src.buffer = buf;
    if (layer.rate) src.playbackRate.value = layer.rate[0] + rnd() * (layer.rate[1] - layer.rate[0]);
    src.connect(out);
    src.start(t);
  }

  const engine = {
    /** Call from a user gesture. Safe to call repeatedly. */
    unlock(): void {
      if (!ctx) {
        ctx = (opts.createContext ?? defaultContext)();
        if (!ctx) return;
        master = ctx.createGain();
        const comp = ctx.createDynamicsCompressor();
        comp.threshold.value = -10;
        comp.ratio.value = 4;
        master.connect(comp).connect(ctx.destination);
        duck = ctx.createBiquadFilter();
        duck.type = 'lowpass';
        duck.frequency.value = 20000;
        musicBus = ctx.createGain();
        sfxBus = ctx.createGain();
        ambBus = ctx.createGain();
        musicBus.gain.value = sfxBus.gain.value = ambBus.gain.value = 0;
        duck.connect(musicBus);
        for (const b of [musicBus, sfxBus, ambBus]) b.connect(master);
        applyGains();
        for (const id of SAMPLES) void loadSample(id);
        if (opts.renderLoops !== false) void buildLoops();
      }
      if (ctx.state === 'suspended') void ctx.resume().catch(() => {});
    },
    get unlocked(): boolean {
      return ctx !== null;
    },
    /** Play a cue now, unless it is throttled. Returns whether it sounded. */
    play(cue: Cue): boolean {
      if (!ctx || store.get().muted) return false;
      const recipe = RECIPES[cue.id];
      const secs = cueSeconds(cue.id, cue.dur);
      if (!recipe || !gate.allow(cue.id, now(), secs * 1000)) return false;
      const t = ctx.currentTime + 0.01;
      for (const layer of recipe) playLayer(layer, t, cue.dur ?? 0, cue.mine ? 1.15 : 0.9);
      return true;
    },
    setAmbience(a: Ambience): void {
      if (a.music === amb.music && Math.abs(a.crowd - amb.crowd) < 0.02 && a.powerOut === amb.powerOut) return;
      amb = { ...a };
      applyAmbience();
    },
    settings: (): AudioSettings => store.get(),
    update(patch: Partial<AudioSettings>): AudioSettings {
      const s = store.set(patch);
      applyGains();
      for (const l of listeners) l(s);
      return s;
    },
    toggleMute(): AudioSettings {
      return engine.update({ muted: !store.get().muted });
    },
    onChange(fn: (s: AudioSettings) => void): () => void {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
  };
  return engine;
}
