import type { ClientToHost, HostToClient, Transport } from './transport';

/** Runs the simulation in a Web Worker on this machine. Solo play, and the host's side of co-op. */
export function createLocalTransport(): Transport {
  const worker = new Worker(new URL('../host/simWorker.ts', import.meta.url), { type: 'module' });
  const handlers = new Set<(snap: HostToClient) => void>();
  worker.onmessage = (ev: MessageEvent<HostToClient>) => {
    for (const h of handlers) h(ev.data);
  };
  const send = (msg: ClientToHost) => worker.postMessage(msg);
  return {
    start: (opts) => send({ t: 'start', opts }),
    resume: (state) => send({ t: 'resume', state }),
    sendInput: (input) => send({ t: 'input', input }),
    onSnapshot(handler) {
      handlers.add(handler);
      return () => {
        handlers.delete(handler);
      };
    },
    close() {
      handlers.clear();
      worker.terminate();
    },
  };
}
