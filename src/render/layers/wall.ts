import { Container, Graphics } from 'pixi.js';
import { ECONOMY } from '../../data/economy';
import { FONT_BODY, MAT, PALETTE, WALL } from '../theme';
import { label, vertical } from './draw';

/** The back wall band (render-only, above sim row 0): wallpaper, shelf, chalkboard menu, window, wainscot. */
export function buildWall(width: number): { root: Container; menuBoard: Container; setNight(night: boolean): void; setMenu(rows: readonly [string, string][]): void } {
  const root = new Container();
  const g = new Graphics();
  root.addChild(g);

  // striped wallpaper + crown trim
  g.rect(0, 0, width, WALL + 4).fill(MAT.wall);
  for (let x = 0; x < width; x += 28) g.rect(x, 0, 12, WALL).fill(MAT.wallStripe);
  g.rect(0, 0, width, 9).fill(MAT.trim);
  g.rect(0, 9, width, 4).fill({ color: 0x000000, alpha: 0.09 });

  // floating shelf with jars and mugs (left, behind the machines)
  g.roundRect(0, 44, 372, 6, 2).fill(MAT.wainscotDk);
  g.rect(0, 50, 372, 3).fill({ color: 0x000000, alpha: 0.12 });
  const jars: [number, number][] = [[18, 0x7b4a2c], [40, 0xc99b5f], [104, 0x7b4a2c], [126, 0xe0b36f], [232, 0x7b4a2c], [254, 0x5c3a26], [292, 0xc99b5f], [348, 0x7b4a2c]];
  for (const [x, c] of jars) {
    g.roundRect(x - 8, 24, 16, 20, 4).fill({ color: 0xffffff, alpha: 0.55 }).stroke({ width: 1, color: 0xffffff, alpha: 0.7 });
    g.roundRect(x - 7, 31, 14, 12, 3).fill(c);
    g.roundRect(x - 9, 21, 18, 5, 2).fill(MAT.trim);
  }
  const mugs: [number, number][] = [[70, PALETTE.mint], [82, PALETTE.honey], [160, PALETTE.cherry], [172, 0xffffff], [320, PALETTE.sky]];
  for (const [x, c] of mugs) {
    g.roundRect(x - 6, 32, 12, 12, 3).fill(c);
    g.moveTo(x + 6, 35).quadraticCurveTo(x + 12, 38, x + 6, 42).stroke({ width: 2.4, color: c });
  }
  // potted plant on the shelf
  g.poly([196, 44, 200, 32, 214, 32, 218, 44]).fill(0xd9774f);
  g.ellipse(207, 28, 13, 9).fill(0x6fb36b);
  g.ellipse(200, 24, 6, 8).fill(0x82c47c);

  // chalkboard menu (the scene keeps it in step with the live menu)
  // ui-3.4.0: its own container, so the scene can keep it above an outdoor backdrop.
  const menuBoard = new Container();
  root.addChild(menuBoard);
  const mg = new Graphics();
  menuBoard.addChild(mg);
  mg.roundRect(378, 18, 98, 70, 8).fill(MAT.frame);
  mg.roundRect(384, 24, 86, 58, 4).fill(MAT.chalk);
  const menu = label('MENU', 11, 0xf6efe2, '600');
  menu.position.set(427, 36);
  menuBoard.addChild(menu);
  const chalkRows = new Container();
  menuBoard.addChild(chalkRows);
  let chalkKey = '';
  const setMenu = (rows: readonly [string, string][]) => {
    const key = JSON.stringify(rows);
    if (key === chalkKey) return;
    chalkKey = key;
    for (const c of chalkRows.removeChildren()) c.destroy();
    const list: readonly [string, string][] = rows.length ? rows : [['Coming soon', '']];
    const gap = list.length > 3 ? 8.5 : 11;
    list.forEach(([name, price], i) => {
      const n = label(name, list.length > 3 ? 7.5 : 8.5, 0xe9e3d6, '700', FONT_BODY);
      n.anchor.set(0, 0.5);
      n.position.set(392, 50 + i * gap);
      chalkRows.addChild(n);
      if (!price) return;
      const p = label(price, list.length > 3 ? 7.5 : 8.5, PALETTE.honey, '800', FONT_BODY);
      p.anchor.set(1, 0.5);
      p.position.set(462, 50 + i * gap);
      chalkRows.addChild(p);
    });
  };
  // Until the scene hands over the live menu: the three classics at list price.
  setMenu([['Espresso', ECONOMY.prices.espresso.toFixed(2)], ['Latte', ECONOMY.prices.latte.toFixed(2)], ['Cold brew', ECONOMY.prices.coldBrew.toFixed(2)]]);

  // hanging plant
  g.moveTo(560, 0).lineTo(560, 18).stroke({ width: 2, color: MAT.trim });
  g.poly([548, 18, 572, 18, 568, 30, 552, 30]).fill(0xe6a160);
  g.moveTo(552, 30).quadraticCurveTo(548, 48, 542, 60).stroke({ width: 3, color: 0x5d9d58 });
  g.moveTo(560, 30).quadraticCurveTo(562, 52, 558, 70).stroke({ width: 3, color: 0x5d9d58 });
  g.moveTo(566, 30).quadraticCurveTo(574, 46, 572, 60).stroke({ width: 3, color: 0x5d9d58 });
  for (const [x, y] of [[543, 52], [546, 62], [558, 56], [557, 70], [571, 48], [572, 60]]) g.ellipse(x, y, 5, 3.2).fill(0x78ba6f);

  // window frame (glass is swapped for night)
  g.roundRect(676, 20, 84, 66, 8).fill(MAT.trim);
  const dayGlass = new Graphics();
  dayGlass.roundRect(682, 26, 72, 54, 4).fill(vertical(0xbfe6fb, 0xfbe3c0));
  dayGlass.ellipse(700, 70, 26, 10).fill(0x9ccf86);
  dayGlass.ellipse(740, 74, 22, 8).fill(0x86bf72);
  dayGlass.circle(738, 38, 9).fill({ color: 0xfff3c4, alpha: 0.9 });
  const nightGlass = new Graphics();
  nightGlass.roundRect(682, 26, 72, 54, 4).fill(vertical(0x1b1640, 0x3c2f6b));
  nightGlass.circle(736, 40, 8).fill(0xfff6d8);
  nightGlass.circle(740, 37, 7).fill(0x2a2252);
  for (const [x, y] of [[700, 36], [716, 56], [744, 64], [694, 66]]) nightGlass.circle(x, y, 1.4).fill(0xffffff);
  nightGlass.visible = false;
  const mullions = new Graphics();
  mullions.rect(717, 26, 3, 54).fill(MAT.trim);
  mullions.rect(682, 52, 72, 3).fill(MAT.trim);
  mullions.roundRect(672, 84, 92, 6, 3).fill(MAT.wainscotDk);
  root.addChild(dayGlass, nightGlass, mullions);

  // wainscot panels along the bottom of the wall
  const w = new Graphics();
  w.rect(0, WALL - 30, width, 30).fill(MAT.wainscot);
  w.roundRect(0, WALL - 34, width, 6, 2).fill(MAT.wainscotDk);
  for (let x = 8; x < width; x += 48) w.roundRect(x, WALL - 24, 38, 18, 3).stroke({ width: 2, color: MAT.wainscotDk, alpha: 0.55 });
  w.rect(0, WALL - 4, width, 4).fill(MAT.trim);
  root.addChild(w);

  return {
    root,
    menuBoard,
    setMenu,
    setNight(night) {
      if (dayGlass.visible === !night) return;
      dayGlass.visible = !night;
      nightGlass.visible = night;
    },
  };
}
