/**
 * A tiny stand-in for the Web Audio API, enough for the engine and the synth recipes to run in
 * tests: every node accepts connect() and param automation, and sources record when they start.
 */
export interface FakeParam {
  value: number;
  events: [string, ...number[]][];
}
export interface FakeNode {
  type: string;
  kind: string;
  connections: FakeNode[];
  started?: number;
  buffer?: unknown;
  [param: string]: unknown;
}

function param(value = 0): FakeParam & Record<string, unknown> {
  const p: FakeParam & Record<string, unknown> = { value, events: [] };
  for (const m of ['setValueAtTime', 'linearRampToValueAtTime', 'exponentialRampToValueAtTime', 'setTargetAtTime', 'cancelScheduledValues']) {
    p[m] = (...args: number[]) => {
      for (const a of args) if (!Number.isFinite(a)) throw new Error(`${m} got ${a}`);
      if (m === 'exponentialRampToValueAtTime' && args[0] <= 0) throw new Error('exponential ramp to <= 0');
      p.events.push([m, ...args]);
      return p;
    };
  }
  return p;
}

export function fakeAudioContext(sampleRate = 8000) {
  const nodes: FakeNode[] = [];
  const make = (kind: string, params: string[]): FakeNode => {
    const n: FakeNode = {
      kind,
      type: '',
      connections: [],
      connect(to: FakeNode) {
        n.connections.push(to);
        return to;
      },
      disconnect() {},
      start(at = 0) {
        n.started = at;
      },
      stop() {},
    };
    for (const p of params) n[p] = param(1);
    nodes.push(n);
    return n;
  };
  const buffers: { channels: Float32Array[] }[] = [];
  const ctx = {
    sampleRate,
    currentTime: 0,
    state: 'running',
    destination: make('destination', []),
    createGain: () => make('gain', ['gain']),
    createOscillator: () => make('osc', ['frequency', 'detune']),
    createBiquadFilter: () => make('biquad', ['frequency', 'Q', 'gain']),
    createBufferSource: () => make('source', ['playbackRate']),
    createStereoPanner: () => make('panner', ['pan']),
    createConvolver: () => make('convolver', []),
    createDynamicsCompressor: () => make('compressor', ['threshold', 'ratio', 'attack', 'release', 'knee']),
    createBuffer(channels: number, length: number, rate: number) {
      const chans = Array.from({ length: channels }, () => new Float32Array(length));
      const b = { numberOfChannels: channels, length, sampleRate: rate, duration: length / rate, getChannelData: (i: number) => chans[i], channels: chans };
      buffers.push(b);
      return b;
    },
    decodeAudioData: async () => ctx.createBuffer(1, 100, sampleRate),
    resume: async () => {},
  };
  return { ctx, nodes, buffers };
}
