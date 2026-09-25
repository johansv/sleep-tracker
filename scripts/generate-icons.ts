import { readFileSync } from 'node:fs';
import { chromium } from '@playwright/test';

/**
 * Regenerates the PNG app icons from public/icons/icon.svg (`pnpm exec tsx scripts/generate-icons.ts`).
 * The outputs are committed; this is only needed when the icon design changes.
 */
const svg = readFileSync('public/icons/icon.svg', 'utf8');
const targets = [
  { file: 'public/icons/icon-192.png', size: 192, padding: 0, radius: true },
  { file: 'public/icons/icon-512.png', size: 512, padding: 0, radius: true },
  // Maskable: full-bleed; the glyph already sits inside the 80% safe zone.
  { file: 'public/icons/icon-maskable-512.png', size: 512, padding: 0, radius: false },
  // iOS applies its own mask; use a square canvas.
  { file: 'public/icons/apple-touch-icon.png', size: 180, padding: 0, radius: false },
];

const browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE || undefined });
const page = await browser.newPage();
for (const t of targets) {
  const inner = Math.round(t.size * (1 - t.padding * 2));
  const markup = t.radius ? svg : svg.replace('rx="112"', 'rx="0"');
  await page.setViewportSize({ width: t.size, height: t.size });
  await page.setContent(
    `<html><body style="margin:0;background:#0b0d17;display:grid;place-items:center;width:${t.size}px;height:${t.size}px">
       <div style="width:${inner}px;height:${inner}px">${markup.replace('<svg ', `<svg width="${inner}" height="${inner}" `)}</div>
     </body></html>`,
  );
  await page.screenshot({ path: t.file, omitBackground: t.radius });
}
await browser.close();
