/**
 * Screenshots of the growth-order fixtures at 1280×800.
 * Start the dev server first (`npm run dev`), then:
 *   npx --yes playwright install chromium
 *   node scripts/growthOrderShots.mjs
 * The `playwright` package must be installed where Node can import it.
 */
import { chromium } from 'playwright';
import { mkdir } from 'node:fs/promises';

const base = process.env.SHOT_BASE ?? 'http://127.0.0.1:5173/CafeTycoon/fixtures.html';
const out = process.env.SHOT_OUT ?? '/opt/cursor/artifacts';

const shots = [
  { file: 'morning-cart.png', query: 'morningCart', wait: 800 },
  { file: 'morning-stand.png', query: 'morningStand', wait: 800 },
  { file: 'morning-cafe.png', query: 'morningCafe', wait: 800 },
  { file: 'grow-stand-banner.png', query: 'growCardStand', wait: 700 },
  { file: 'grow-stand-card.png', query: 'growCardStand', card: true },
  { file: 'grow-cafe-banner.png', query: 'growCardCafe', wait: 700 },
  { file: 'grow-cafe-card.png', query: 'growCardCafe', card: true },
];

await mkdir(out, { recursive: true });
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 });
const errors = [];
page.on('pageerror', (err) => errors.push(String(err)));

for (const shot of shots) {
  await page.goto(`${base}?f=${shot.query}`, { waitUntil: 'networkidle' });
  if (shot.card) await page.waitForSelector('.gc-card', { timeout: 8000 });
  else await page.waitForTimeout(shot.wait);
  await page.screenshot({ path: `${out}/${shot.file}` });
  console.log(shot.file);
}

await browser.close();
if (errors.length) {
  console.error(errors.join('\n'));
  process.exit(1);
}
