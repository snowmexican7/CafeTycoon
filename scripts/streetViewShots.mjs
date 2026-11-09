/**
 * Screenshots of the café street: cars and a comment bubble, at the two sizes the HUD is checked at.
 * Run with the dev server up: node scripts/streetViewShots.mjs
 * PLAYWRIGHT is resolved from node_modules or PLAYWRIGHT_PATH.
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const pwPath = process.env.PLAYWRIGHT_PATH || 'playwright';
const { chromium } = require(pwPath);

const base = process.env.STREET_URL ?? 'http://127.0.0.1:5173/CafeTycoon/fixtures.html?f=streetCafe';
const outDir = process.env.STREET_OUT ?? '/opt/cursor/artifacts';
const sizes = [
  { w: 1280, h: 800, name: 'street-cafe-1280x800' },
  { w: 1512, h: 982, name: 'street-cafe-1512x982' },
];

await mkdir(outDir, { recursive: true });
const browser = await chromium.launch({ headless: true });
const notes = [];

for (const size of sizes) {
  const page = await browser.newPage({ viewport: { width: size.w, height: size.h }, deviceScaleFactor: 1 });
  const errors = [];
  page.on('pageerror', (err) => errors.push(String(err)));
  await page.goto(base, { waitUntil: 'networkidle' });
  await page.waitForSelector('#game canvas');
  await page.waitForSelector('#hud .hud-top');
  await page.waitForTimeout(700);
  const layout = await page.evaluate(() => {
    const box = (sel) => {
      const el = document.querySelector(sel);
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return { x: r.x, y: r.y, w: r.width, h: r.height };
    };
    return {
      top: box('#hud .hud-top'),
      bottom: box('#hud .hud-bottom'),
      canvas: box('#game canvas'),
      view: { w: window.innerWidth, h: window.innerHeight },
    };
  });
  const file = `${outDir}/${size.name}.png`;
  await page.screenshot({ path: file, fullPage: false });
  const problems = [];
  if (errors.length) problems.push(`page errors: ${errors.join(' | ')}`);
  const { top, bottom, canvas, view } = layout;
  if (!top || !bottom || !canvas) problems.push(`missing box ${JSON.stringify(layout)}`);
  else {
    if (top.y < -1 || top.y + top.h > view.h + 1) problems.push(`top HUD off screen ${JSON.stringify(top)}`);
    if (bottom.y < -1 || bottom.y + bottom.h > view.h + 1) problems.push(`bottom HUD off screen ${JSON.stringify(bottom)}`);
    if (canvas.y < -1 || canvas.y + canvas.h > view.h + 1) problems.push(`canvas off screen ${JSON.stringify(canvas)}`);
    if (canvas.y + canvas.h > bottom.y + 2) problems.push(`canvas overlaps the bottom HUD`);
    if (top.y + top.h > canvas.y + 2) problems.push(`top HUD overlaps the canvas`);
  }
  notes.push({ size: `${size.w}x${size.h}`, file, layout, problems });
  await page.close();
  if (problems.length) {
    await writeFile(`${outDir}/street-view-layout.json`, JSON.stringify(notes, null, 2));
    throw new Error(`${size.name}: ${problems.join('; ')}`);
  }
}

await browser.close();
await writeFile(`${outDir}/street-view-layout.json`, JSON.stringify(notes, null, 2));
console.log(JSON.stringify(notes, null, 2));
