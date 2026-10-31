/**
 * ui-3.5.2 (R4 e): the creator's live preview, drawn with the same `drawPerson` as the shop floor, so what you pick
 * is exactly what walks behind the counter. A small Pixi canvas of its own (front and back view side by side).
 */
import { Application, Graphics } from 'pixi.js';
import type { PlayerLook } from '../sim/types';
import { drawPerson } from './layers/actors';
import { lookArt } from './lookModel';

export interface LookPreview { draw(look: PlayerLook): void; destroy(): void }

export function createLookPreview(host: HTMLElement): LookPreview {
  const app = new Application();
  const front = new Graphics();
  const back = new Graphics();
  let ready = false;
  let dead = false;
  let pending: PlayerLook | null = null;
  const W = 300;
  const H = 260;
  const paint = (look: PlayerLook) => {
    const a = lookArt(look);
    const base = { shirt: a.shirt, skin: a.skin, hair: a.hair, apron: true, style: { body: a.body, hairStyle: a.hairStyle, outfit: a.outfit } };
    front.clear();
    back.clear();
    drawPerson(front, { ...base, facing: 'down' });
    drawPerson(back, { ...base, facing: 'up' });
  };
  void app
    .init({ width: W, height: H, backgroundAlpha: 0, antialias: true, resolution: Math.min(2, window.devicePixelRatio || 1), autoDensity: true })
    .then(() => {
      if (dead) return app.destroy(true);
      host.appendChild(app.canvas);
      front.scale.set(2.3);
      front.position.set(W * 0.36, H - 18);
      back.scale.set(1.4);
      back.position.set(W * 0.82, H - 30);
      back.alpha = 0.9;
      app.stage.addChild(back, front);
      ready = true;
      if (pending) paint(pending);
    });
  return {
    draw(look) {
      pending = look;
      if (ready) paint(look);
    },
    destroy() {
      dead = true;
      if (ready) app.destroy(true, { children: true });
    },
  };
}
