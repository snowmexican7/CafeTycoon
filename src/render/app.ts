import { Application } from 'pixi.js';
import '../ui/theme.css';
import type { PlayerId, Vec2 } from '../sim/types';
import type { RenderView } from './interpolate';
import { SCENE_BACKGROUND, SCENE_HEIGHT, SCENE_WIDTH, Scene } from './scene';

/** Wait (briefly) for the bundled fonts so canvas text doesn't bake in a fallback face. */
async function loadFonts(): Promise<void> {
  if (typeof document === 'undefined' || !document.fonts) return;
  const wanted = Promise.all(['600 12px Fredoka', '700 12px Fredoka', '700 12px Nunito'].map((f) => document.fonts.load(f)));
  await Promise.race([wanted, new Promise((r) => setTimeout(r, 1500))]).catch(() => undefined);
}

/** Mount a PixiJS canvas into `mount` and return a renderer that draws RenderViews. */
export async function createRenderer(
  mount: HTMLElement,
): Promise<{
  update(view: RenderView): void;
  setLocalPlayer(id: PlayerId | null): void;
  /** FB2 C10: ghost outlines for valid set-down tiles (null clears). */
  setGhostSpots(spots: readonly Vec2[] | null): void;
  getJuice(): { vibe: number; combo: number; label: string; tone: 'high' | 'mid' | 'low' };
  destroy(): void;
}> {
  await loadFonts();
  const app = new Application();
  await app.init({
    width: SCENE_WIDTH,
    height: SCENE_HEIGHT,
    background: SCENE_BACKGROUND,
    antialias: true,
    resolution: Math.min(window.devicePixelRatio || 1, 2),
    autoDensity: true,
  });
  app.canvas.style.display = 'block';
  mount.appendChild(app.canvas);

  // Fit the diorama to the space available, keeping its aspect ratio.
  // The mount is the stage box between the HUD gutters (style.css); leave room for the wooden frame.
  const FRAME = 24;
  const fit = () => {
    const maxW = Math.max(240, (mount.clientWidth || SCENE_WIDTH) - FRAME);
    const maxH = Math.max(240, (mount.clientHeight || window.innerHeight - 72) - FRAME);
    const scale = Math.min(maxW / SCENE_WIDTH, maxH / SCENE_HEIGHT);
    app.canvas.style.width = `${Math.round(SCENE_WIDTH * scale)}px`;
    app.canvas.style.height = `${Math.round(SCENE_HEIGHT * scale)}px`;
  };
  fit();
  window.addEventListener('resize', fit);
  const ro = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(fit);
  ro?.observe(mount);

  const scene = new Scene();
  app.stage.addChild(scene.root);
  return {
    update: (view) => scene.update(view),
    setLocalPlayer: (id) => scene.setLocalPlayer(id),
    setGhostSpots: (spots) => scene.setGhostSpots(spots),
    getJuice: () => scene.getJuice(),
    destroy: () => {
      window.removeEventListener('resize', fit);
      ro?.disconnect();
      app.destroy(true, { children: true });
    },
  };
}
