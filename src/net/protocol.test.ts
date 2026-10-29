import { describe, it, expect } from 'vitest';
import { RESERVED_TELE_KINDS } from '../host/telemetry';
import { ACTIONS, parseHello, parseInput, parseJoin, parseLobby, parseSeat, parseResync, parseSnap, parseSnapDelta, parseTele, PROTOCOL_VERSION } from './protocol';

describe('protocol parsers', () => {
  it('is on version 13 (seat reclaim, room cap, lobby bots, forecasts, re-roll, challenges, eggs, crew stats, B11 balance, 2.0.1 deltas, P3 roles, prices, regulars)', () => {
    expect(PROTOCOL_VERSION).toBe(17);
    expect(ACTIONS).toContain('snapd');
    expect(ACTIONS).toContain('resync');
    expect(ACTIONS).toContain('seat');
    for (const a of ACTIONS) expect(new TextEncoder().encode(a).length).toBeLessThanOrEqual(12); // trystero action names
  });

  it('parses the seat-reclaim fields', () => {
    expect(parseHello({ t: 'hello', protocol: 4, hostToken: 'h', reject: 'full' })!.reject).toBe('full');
    expect(parseJoin({ t: 'join', protocol: 4, token: 'a', name: 'Sam', prev: 'b' })).toEqual({ t: 'join', protocol: 4, token: 'a', name: 'Sam', prev: 'b' });
    expect(parseJoin({ t: 'join', protocol: 4, token: 'a', name: 'Sam', prev: 'a' })!.prev).toBeUndefined();
    expect(parseJoin({ t: 'join', protocol: 4, token: 'a', name: 'Sam', prev: 7 })!.prev).toBeUndefined();
    expect(parseJoin({ t: 'join', protocol: 4, token: 'a', name: 'Sam', prev: 'x'.repeat(65) })!.prev).toBeUndefined();
    expect(parseSeat({ t: 'seat', token: 'b' })).toEqual({ t: 'seat', token: 'b' });
    expect(parseSeat({ t: 'seat', token: '' })).toBeNull();
    expect(parseSeat({ t: 'seat' })).toBeNull();
  });

  it('parses the lobby bots setting leniently', () => {
    const base = { t: 'lobby', members: [], started: false };
    expect(parseLobby({ ...base, bots: 2, botsPicked: true })).toEqual({ ...base, bots: 2, botsPicked: true });
    expect(parseLobby({ ...base, bots: 'auto' })).toEqual({ ...base, bots: 'auto', botsPicked: false });
    expect(parseLobby({ ...base, bots: 9 })).toEqual(base);
    expect(parseLobby({ ...base, bots: 1.5 })).toEqual(base);
    expect(parseLobby(base)).toEqual(base);
  });

  it('parses well-formed messages and rejects junk', () => {
    expect(parseHello({ t: 'hello', protocol: PROTOCOL_VERSION, hostToken: 'h' })).toEqual({ t: 'hello', protocol: PROTOCOL_VERSION, hostToken: 'h' });
    expect(parseHello({ t: 'hello', protocol: 1, hostToken: 'h', reject: 'version' })!.reject).toBe('version');
    expect(parseHello({ t: 'hello', protocol: 1, hostToken: 'h', reject: 'banned' })).toBeNull();
    expect(parseHello({ t: 'hello', protocol: 'x', hostToken: 'h' })).toBeNull();
    expect(parseHello(null)).toBeNull();
    expect(parseJoin({ t: 'join', protocol: 1, token: 'abc', name: '  Sam  ' })).toEqual({ t: 'join', protocol: 1, token: 'abc', name: 'Sam' });
    expect(parseJoin({ t: 'join', protocol: 1, token: 'abc', name: 'x'.repeat(40) })!.name).toHaveLength(16);
    expect(parseJoin({ t: 'join', protocol: 1, token: 'abc', name: '' })!.name).toBe('Barista');
    expect(parseJoin({ t: 'join', protocol: 1, token: '', name: 'Sam' })).toBeNull();
    expect(parseInput({ t: 'input', input: { kind: 'ready', playerId: 'abc' } })).toEqual({ t: 'input', input: { kind: 'ready', playerId: 'abc' } });
    expect(parseInput({ t: 'input', input: 'ready' })).toBeNull();
    expect(parseSnap({ t: 'snap', state: { phase: 'night' }, sentAt: 5, seq: 1 })).toEqual({ t: 'snap', state: { phase: 'night' }, sentAt: 5, seq: 1 });
    expect(parseSnap({ t: 'snap', state: { phase: 'night' }, sentAt: 5 })).toBeNull(); // protocol 11 had no seq
    expect(parseSnapDelta({ t: 'snapd', seq: 2, patch: ['o', { tick: ['r', 3] }], sentAt: 6 })).toEqual({ t: 'snapd', seq: 2, patch: ['o', { tick: ['r', 3] }], sentAt: 6 });
    expect(parseSnapDelta({ t: 'snapd', seq: 2, patch: null, sentAt: 6 })).toMatchObject({ patch: null });
    expect(parseSnapDelta({ t: 'snapd', seq: 2, patch: 'x', sentAt: 6 })).toBeNull();
    expect(parseResync({ t: 'resync' })).toEqual({ t: 'resync' });
    expect(parseResync({ t: 'nope' })).toBeNull();
    expect(parseSnap({ t: 'snap', state: 'nope', sentAt: 5 })).toBeNull();
    expect(parseLobby({ t: 'lobby', members: [{ token: 'a', name: 'A' }], started: false })!.members).toHaveLength(1);
    expect(parseLobby({ t: 'lobby', members: [{ token: 1 }], started: false })).toBeNull();
  });

  it('parses tele batches and rejects bad ones', () => {
    expect(parseTele({ t: 'tele', token: 'T', events: [{ kind: 'frame.long', data: { ms: 300 }, at: 5 }] })).toEqual({ t: 'tele', token: 'T', events: [{ kind: 'frame.long', data: { ms: 300 }, at: 5 }] });
    expect(parseTele({ t: 'tele', token: 'T', events: Array(201).fill({ kind: 'x', data: 1, at: 1 }) })).toBeNull();
    expect(parseTele({ t: 'tele', token: 'T', events: [{ kind: '', data: 1, at: 1 }] })).toBeNull();
    expect(parseTele({ t: 'tele', token: 'T', events: [{ kind: 'x', data: 'y'.repeat(2000), at: 1 }] })!.events[0].data).toBeNull();
  });

  it('rejects tele messages with a bad token, shape, kind length or timestamp', () => {
    const ev = { kind: 'x', data: 1, at: 1 };
    expect(parseTele({ t: 'tele', token: '', events: [] })).toBeNull();
    expect(parseTele({ t: 'tele', token: 'T'.repeat(65), events: [] })).toBeNull();
    expect(parseTele({ t: 'tele', token: 5, events: [] })).toBeNull();
    expect(parseTele({ t: 'tele', token: 'T', events: 'nope' })).toBeNull();
    expect(parseTele({ t: 'other', token: 'T', events: [] })).toBeNull();
    expect(parseTele(null)).toBeNull();
    expect(parseTele({ t: 'tele', token: 'T', events: Array(200).fill(ev) })!.events).toHaveLength(200);
    expect(parseTele({ t: 'tele', token: 'T', events: [{ ...ev, kind: 'k'.repeat(41) }] })).toBeNull();
    expect(parseTele({ t: 'tele', token: 'T', events: [{ ...ev, kind: 'k'.repeat(40) }] })).not.toBeNull();
    expect(parseTele({ t: 'tele', token: 'T', events: [{ ...ev, at: Infinity }] })).toBeNull();
    expect(parseTele({ t: 'tele', token: 'T', events: [{ ...ev, at: 'now' }] })).toBeNull();
    expect(parseTele({ t: 'tele', token: 'T', events: [ev, 7] })).toBeNull();
  });

  it('rejects the whole batch when any event uses a reserved kind', () => {
    const sim = ['pass.put', 'pass.take', 'pass.serve', 'pass.stale', 'trash', 'bot.mistake', 'event.start', 'event.end', 'inspection', 'influencer'];
    const host = ['meta', 'snapshot', 'summary', 'input', 'input.mash', 'peer.join', 'peer.leave'];
    for (const kind of [...sim, ...host]) {
      expect(RESERVED_TELE_KINDS).toContain(kind);
      expect(parseTele({ t: 'tele', token: 'T', events: [{ kind: 'ok', data: 1, at: 1 }, { kind, data: 1, at: 1 }] })).toBeNull();
    }
  });
});
