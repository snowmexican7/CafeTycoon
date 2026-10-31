/**
 * ui-3.5.2 (R4 e): the creator's live preview, drawn with the same `drawPerson` as the shop floor, so what you pick
 * is exactly what walks behind the counter. A small Pixi canvas of its own (front and back view side by side).
 *
 * One preview app is made the first time and then reused: destroying a second Pixi 8 Application breaks the batcher
 * the main game renderer shares with it, so "closing" only takes the canvas off the page and stops its ticker.
 */
import { Application, Graphics } from 'pixi.js';
import type { PlayerLook } from '../sim/types';
import { drawPerson } from './layers/actors';
import { lookArt } from './lookModel';

export interface LookPreview { draw(look: PlayerLook): void; destroy(): void }

const W = 300;
const H = 260;
let shared: Promise<{ app: Application; front: Graphics; back: Graphics }> | null = null;

function previewApp() {
  shared ??= (async () => {
    const app = new Application();
    await app.init({ width: W, height: H, backgroundAlpha: 0, antialias: true, resolution: Math.min(2, window.devicePixelRatio || 1), autoDensity: true });
    const front = new Graphics();
    const back = new Graphics();
    front.scale.set(2.3);
    front.position.set(W * 0.36, H - 18);
    back.scale.set(1.4);
    back.position.set(W * 0.82, H - 30);
    back.alpha = 0.9;
    app.stage.addChild(back, front);
    return { app, front, back };
  })();
  return shared;
}

export function createLookPreview(host: HTMLElement): LookPreview {
  let closed = false;
  let pending: PlayerLook | null = null;
  let parts: Awaited<ReturnType<typeof previewApp>> | null = null;
  const paint = (look: PlayerLook) => {
    if (!parts) return;
    const a = lookArt(look);
    const base = { shirt: a.shirt, skin: a.skin, hair: a.hair, apron: true, style: { body: a.body, hairStyle: a.hairStyle, outfit: a.outfit } };
    parts.front.clear();
    parts.back.clear();
    drawPerson(parts.front, { ...base, facing: 'down' });
    drawPerson(parts.back, { ...base, facing: 'up' });
  };
  void previewApp().then((p) => {
    if (closed) return;
    parts = p;
    host.appendChild(p.app.canvas);
    p.app.ticker.start();
    if (pending) paint(pending);
  });
  return {
    draw(look) {
      pending = look;
      paint(look);
    },
    destroy() {
      closed = true;
      if (parts) {
        parts.app.ticker.stop();
        parts.app.canvas.remove();
      }
    },
  };
}
