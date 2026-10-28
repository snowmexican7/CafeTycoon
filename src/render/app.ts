import { Application } from 'pixi.js';
import { LAYOUT } from '../data/layout';
import type { RenderView } from './interpolate';
import { SCENE_BACKGROUND, Scene, TILE } from './scene';

/** Mount a PixiJS canvas into `mount` and return a renderer that draws RenderViews. */
export async function createRenderer(mount: HTMLElement): Promise<{ update(view: RenderView): void; destroy(): void }> {
  const app = new Application();
  await app.init({ width: LAYOUT.width * TILE, height: LAYOUT.height * TILE, background: SCENE_BACKGROUND, antialias: true });
  app.canvas.style.width = '100%';
  app.canvas.style.height = 'auto';
  app.canvas.style.display = 'block';
  mount.appendChild(app.canvas);
  const scene = new Scene();
  app.stage.addChild(scene.root);
  return {
    update: (view) => scene.update(view),
    destroy: () => app.destroy(true, { children: true }),
  };
}
