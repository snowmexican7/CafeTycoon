/**
 * Mode select, Campaign day 1 morning, and Blitz day 1.
 * Start the dev server first (`npm run dev`), then:
 *   node scripts/campaignShots.mjs
 */
import { chromium } from 'playwright';
import { mkdir } from 'node:fs/promises';

const origin = process.env.SHOT_ORIGIN ?? 'http://127.0.0.1:5173';
const out = process.env.SHOT_OUT ?? '/opt/cursor/artifacts';
const viewports = [
  { w: 1280, h: 800, tag: '1280' },
  { w: 1512, h: 982, tag: '1512' },
];

await mkdir(out, { recursive: true });
const browser = await chromium.launch();
const errors = [];

for (const vp of viewports) {
  const page = await browser.newPage({ viewport: { width: vp.w, height: vp.h }, deviceScaleFactor: 1 });
  page.on('pageerror', (err) => errors.push(`${vp.tag} ${err}`));

  await page.goto(`${origin}/CafeTycoon/`, { waitUntil: 'networkidle' });
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: 'networkidle' });
  await page.getByRole('radio', { name: /Blitz/ }).waitFor();
  const blitz = page.getByRole('radio', { name: /Blitz/ });
  const campaign = page.getByRole('radio', { name: /Campaign/ });
  if (!(await blitz.isChecked())) errors.push(`${vp.tag} Blitz was not the default`);
  await page.screenshot({ path: `${out}/mode-select-${vp.tag}.png` });
  await campaign.check();
  if (!(await campaign.isChecked())) errors.push(`${vp.tag} Campaign did not check`);
  await page.screenshot({ path: `${out}/mode-select-campaign-${vp.tag}.png` });

  for (const shot of [
    { file: `campaign-day1-${vp.tag}.png`, fixture: 'campaignDay1', text: /Thrift Store pot/ },
    { file: `blitz-day1-${vp.tag}.png`, fixture: 'blitzDay1', text: /\$120\.00/ },
  ]) {
    await page.goto(`${origin}/CafeTycoon/fixtures.html?f=${shot.fixture}`, { waitUntil: 'networkidle' });
    await page.getByText(shot.text).first().waitFor({ timeout: 8000 });
    await page.waitForTimeout(600);
    await page.screenshot({ path: `${out}/${shot.file}` });
  }
  await page.close();
}

await browser.close();
if (errors.length) {
  console.error(errors.join('\n'));
  process.exit(1);
}
console.log('ok');
