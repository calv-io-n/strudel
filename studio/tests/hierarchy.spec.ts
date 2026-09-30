import { test, expect } from '@playwright/test';
import { clipProperties, inputTab, soundManagement, liveSound } from './workspace-actions';

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('studio.quick-start.opt-out', 'true'));
  await page.goto('/'); await expect(page.locator('#saved-projects')).toHaveValue('Neon-Drive');
});

test('navigation starts with music, and input workspaces stay available once requested', async ({ page }) => {
  await expect(page.locator('#input-tabs')).toBeHidden();
  await expect(page.locator('.transport #transport-state')).toBeVisible();
  await expect(page.locator('.topbar #save-now')).toBeVisible();
  await page.locator('#record-toggle').click();
  await expect(page.locator('#tab-audio-input')).toBeVisible();
  await expect(page.locator('#tab-midi-instrument')).toBeHidden();
  await page.locator('#record-close').click();
  await inputTab(page, 'midi');
  await page.locator('#tabs [data-tab]').first().click();
  await expect(page.locator('#tab-midi-instrument')).toBeVisible();
});

test('Sounds prioritizes listening and Use; management and MIDI are secondary', async ({ page }) => {
  await page.locator('#palette-open').click(); await page.locator('#command-palette input').fill('Open Sample Catalogue'); await page.keyboard.press('Enter');
  await expect(page.locator('#catalogue-packs')).toBeHidden();
  await expect(page.locator('.library-test')).toBeHidden();
  const row = page.locator('.asset').filter({ has: page.locator('[data-use-sound="triangle"]') });
  await expect(row.getByRole('button', { name: 'Use', exact: true })).toBeVisible();
  await expect(row.locator('[data-assign-midi]')).toBeHidden();
  await soundManagement(page, 'Manage packs'); await expect(page.locator('#catalogue-packs')).toBeVisible();
  await page.locator('#library-back').click(); await liveSound(page, 'triangle');
  await expect(page.locator('#library-keys')).toBeVisible();
  await row.locator('[data-preview-sound]').click();
  await row.getByRole('button', { name: 'Use', exact: true }).click();
  await expect(page.locator('#editor .cm-content:visible')).toContainText('s("triangle")');
});

test('clips select without interruption and properties validate without blocking the timeline', async ({ page }) => {
  const clips = page.locator('[data-clip]'), clip = clips.first();
  await clip.click(); await expect(clip).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('#clip-properties')).toBeHidden();
  await clipProperties(page, clip);
  const original = await page.locator('#clip-start').inputValue();
  await page.locator('#clip-start').fill('16385');
  await page.locator('#clip-form button[type=submit]').click();
  await expect(page.locator('#clip-error')).not.toBeEmpty();
  await page.locator('#clip-reset').click();
  await expect(page.locator('#clip-start')).toHaveValue(original);
  await page.locator('#clip-length').fill('0'); await page.locator('#clip-form button[type=submit]').click();
  await expect(page.locator('#clip-properties')).toBeVisible();
  await clips.nth(1).click(); await expect(page.locator('#clip-properties')).toBeHidden();
  await clip.dblclick(); await expect(page.locator('#editor .cm-content:visible')).toBeFocused();
  await expect(page.locator('#composition-content')).toBeVisible();
  await clip.focus(); await page.keyboard.press('Space'); await expect(clip).toHaveAttribute('aria-pressed', 'true');
  await page.keyboard.press('Enter'); await expect(page.locator('#editor .cm-content:visible')).toBeFocused();
  expect(original).toBeTruthy();
});

for (const width of [1440, 600]) test(`workspace fits ${width}px with a nonmodal inspector`, async ({ page }) => {
  await page.setViewportSize({ width, height: 900 });
  await clipProperties(page);
  for (const dark of [false, true]) {
    await page.locator('#dark-mode').setChecked(dark);
    await expect(page.locator('#clip-properties')).toBeVisible();
    await expect(page.locator('#sequencer-scroll')).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  }
});

test('dragging changes placement without opening an editor; playback still allows selection', async ({ page }) => {
  const clip = page.locator('[data-clip]').first();
  const before = await clip.getAttribute('style');
  const activePattern = await page.locator('#tabs [aria-selected=true]').getAttribute('data-tab');
  const bounds = (await clip.boundingBox())!;
  await page.mouse.move(bounds.x + 24, bounds.y + 22); await page.mouse.down();
  await page.mouse.move(bounds.x + 88, bounds.y + 22, { steps: 8 }); await page.mouse.up();
  await expect(clip).not.toHaveAttribute('style', before!);
  await expect(page.locator('#clip-properties')).toBeHidden();
  await expect(page.locator('#tabs [aria-selected=true]')).toHaveAttribute('data-tab', activePattern!);
  await page.locator('#composition-play').click();
  await clip.click(); await expect(clip).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('#transport-state')).not.toContainText('Stopped');
  await clipProperties(page, clip);
  await page.locator('#clip-form button[type=submit]').click();
  await expect(page.locator('#clip-error')).toContainText('Stop playback');
  await page.locator('#composition-stop').click();
});
