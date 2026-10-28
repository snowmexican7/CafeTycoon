import { describe, it, expect } from 'vitest';
import { parseHello, parseInput, parseJoin, parseLobby, parseSnap, PROTOCOL_VERSION } from './protocol';

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
});
