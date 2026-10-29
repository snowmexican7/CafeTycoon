import { describe, it, expect } from 'vitest';
import { RESERVED_TELE_KINDS } from '../host/telemetry';
import { parseHello, parseInput, parseJoin, parseLobby, parseSnap, parseTele, PROTOCOL_VERSION } from './protocol';

describe('protocol parsers', () => {
  it('is on version 2', () => {
    expect(PROTOCOL_VERSION).toBe(2);
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
    expect(parseSnap({ t: 'snap', state: { phase: 'night' }, sentAt: 5 })).toEqual({ t: 'snap', state: { phase: 'night' }, sentAt: 5 });
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
