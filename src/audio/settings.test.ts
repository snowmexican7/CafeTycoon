import { describe, expect, it } from 'vitest';
import { memoryStorage } from '../storage/storageLike';
import { AUDIO_DEFAULTS, AUDIO_KEY, busGains, cleanAudioSettings, createAudioSettingsStore } from './settings';

describe('audio settings', () => {
  it('defaults, clamps and ignores junk', () => {
    expect(cleanAudioSettings(null)).toEqual(AUDIO_DEFAULTS);
    expect(cleanAudioSettings({ master: 3, music: -1, sfx: NaN, muted: 'yes' as never })).toEqual({ master: 1, music: 0, sfx: AUDIO_DEFAULTS.sfx, muted: false });
  });

  it('saves to storage and reloads', () => {
    const st = memoryStorage();
    const a = createAudioSettingsStore(st);
    a.set({ music: 0.2, muted: true });
    expect(JSON.parse(st.getItem(AUDIO_KEY)!)).toMatchObject({ music: 0.2, muted: true });
    expect(createAudioSettingsStore(st).get()).toEqual({ ...AUDIO_DEFAULTS, music: 0.2, muted: true });
  });

  it('survives broken or blocked storage', () => {
    const st = memoryStorage();
    st.setItem(AUDIO_KEY, '{not json');
    const a = createAudioSettingsStore(st);
    expect(a.get()).toEqual(AUDIO_DEFAULTS);
    const blocked = { getItem: () => null, setItem: () => { throw new Error('quota'); }, removeItem: () => {} };
    expect(createAudioSettingsStore(blocked).set({ sfx: 0.1 }).sfx).toBe(0.1);
  });

  it('turns settings into bus gains', () => {
    expect(busGains({ master: 0.5, music: 0.5, sfx: 1, muted: false })).toEqual({ music: 0.25, sfx: 0.5 });
    expect(busGains({ master: 1, music: 1, sfx: 1, muted: true })).toEqual({ music: 0, sfx: 0 });
  });
});
