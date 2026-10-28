/// <reference lib="webworker" />
import type { ClientToHost, HostToClient } from '../net/transport';
import { TICK_RATE } from '../sim/constants';
import { createRun } from '../sim/run';
import type { GameState } from '../sim/types';
import { createLoop, type Loop } from './loop';

const ctx = self as unknown as DedicatedWorkerGlobalScope;
let loop: Loop | null = null;
let timer: ReturnType<typeof setInterval> | null = null;

function run(state: GameState): void {
  if (timer !== null) clearInterval(timer);
  loop = createLoop(state, (msg: HostToClient) => ctx.postMessage(msg), performance.now());
  timer = setInterval(() => loop?.advance(performance.now()), 1000 / TICK_RATE);
}

ctx.onmessage = (ev: MessageEvent<ClientToHost>) => {
  const msg = ev.data;
  switch (msg.t) {
    case 'start':
      run(createRun(msg.opts));
      break;
    case 'resume':
      run(msg.state);
      break;
    case 'input':
      loop?.pushInput(msg.input);
      break;
  }
};
