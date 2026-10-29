import { readJson, type StorageLike } from '../storage/storageLike';

export interface AudioSettings {
  master: number;
  music: number;
  sfx: number;
  muted: boolean;
}

export const AUDIO_KEY = 'cafetycoon.audio';
export const AUDIO_DEFAULTS: AudioSettings = { master: 0.8, music: 0.55, sfx: 0.8, muted: false };

const level = (v: unknown, d: number) => (typeof v === 'number' && Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : d);

export function cleanAudioSettings(raw: Partial<AudioSettings> | null | undefined): AudioSettings {
  const r = raw ?? {};
  return {
    master: level(r.master, AUDIO_DEFAULTS.master),
    music: level(r.music, AUDIO_DEFAULTS.music),
    sfx: level(r.sfx, AUDIO_DEFAULTS.sfx),
    muted: typeof r.muted === 'boolean' ? r.muted : AUDIO_DEFAULTS.muted,
  };
}

/** Per-browser volume settings (localStorage). Never part of the run, never sent to the host. */
export function createAudioSettingsStore(storage: StorageLike) {
  let current = cleanAudioSettings(readJson<Partial<AudioSettings>>(storage, AUDIO_KEY));
  return {
    get: (): AudioSettings => ({ ...current }),
    set(patch: Partial<AudioSettings>): AudioSettings {
      current = cleanAudioSettings({ ...current, ...patch });
      try {
        storage.setItem(AUDIO_KEY, JSON.stringify(current));
      } catch {
        /* storage blocked: keep the in-memory value */
      }
      return { ...current };
    },
  };
}

/** Effective gains for the three buses (0 when muted). */
export function busGains(s: AudioSettings): { music: number; sfx: number } {
  const m = s.muted ? 0 : s.master;
  return { music: m * s.music, sfx: m * s.sfx };
}
