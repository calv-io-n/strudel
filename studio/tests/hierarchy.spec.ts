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
  await expect(clip).toBeVisible();
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

test('playback scope previews the mode and follows the running tab when browsing', async ({ page }) => {
  await expect(page.locator('#composition-content')).toHaveAttribute('data-playback', 'ready');
  await expect(page.locator('.clip[data-playback=included]')).not.toHaveCount(0);
  await page.locator('[data-play-target=tab]').click();
  const source = page.locator('#tabs [aria-selected=true]');
  const sourceId = await source.getAttribute('data-tab');
  await expect(source).toHaveAttribute('data-playback', 'ready');
  await expect(page.locator('#editor')).toHaveAttribute('data-playback', 'ready');
  await expect(page.locator('.clip[data-playback=included]')).toHaveCount(0);
  await page.locator('#play').click();
  await expect(page.locator(`#tabs [data-tab="${sourceId}"]`)).toHaveAttribute('data-playback', 'playing');
  await page.locator('#tabs [data-tab]').first().click();
  await expect(page.locator(`#tabs [data-tab="${sourceId}"]`)).toHaveAttribute('data-playback', 'playing');
  await expect(page.locator('#editor')).toHaveAttribute('data-playback', '');
  await page.locator('#stop:visible').click();
  await expect(page.locator('#tabs [aria-selected=true]')).toHaveAttribute('data-playback', 'ready');
  await expect(page.locator('[data-playback=playing]')).toHaveCount(0);
});

test('composition scope follows seeks, effective mute timing, and collapsed navigation', async ({ page }) => {
  const first = page.locator('.clip').first();
  await first.click(); await expect(first).toHaveAttribute('aria-pressed', 'true');
  await page.locator('[data-track-mute="track-1"]').click();
  await page.keyboard.press('ControlOrMeta+s');
  await expect(page.locator('#save-now')).not.toHaveAttribute('data-dirty');
  await expect(first).toHaveAttribute('data-playback', 'excluded');
  await page.locator('#seek-handle').focus(); await page.keyboard.press('End');
  await expect(page.locator('.clip[data-playback=included]')).not.toHaveCount(0); // Play restarts at the end.
  await page.locator('#composition-play').click();
  await expect(page.locator('.clip[data-playback=playing]')).not.toHaveCount(0);
  await expect(first).not.toHaveAttribute('data-playback', 'playing');
  await page.locator('[data-track-mute="track-2"]').click();
  await expect(page.locator('#save-now')).toHaveAttribute('data-dirty');
  await page.keyboard.press('ControlOrMeta+s');
  await expect(page.locator('#save-now')).not.toHaveAttribute('data-dirty');
  await expect(page.locator('.clip[data-playback=playing]')).not.toHaveCount(0);
  await expect(page.locator('.clip[data-playback=playing]')).toHaveCount(0, { timeout: 5000 });
  await page.locator('.composition-toggle').click();
  await expect(page.locator('.composition-toggle')).toHaveAttribute('data-playback', 'playing');
  await page.locator('#composition-stop:visible').click();
  await expect(page.locator('#transport-state')).toContainText('no clips in playback scope');
});

test('invalid staged code does not change saved playback; unavailable targets have no highlight', async ({ page }) => {
  await page.locator('[data-play-target=tab]').click();
  await page.locator('#editor .cm-content:visible').click();
  await page.keyboard.press('ControlOrMeta+End');
  await page.keyboard.insertText('\nthis is invalid code !!!');
  await expect(page.locator('#editor .cm-content:visible')).toContainText('invalid code');
  await page.locator('#play').click();
  await expect(page.locator('#editor')).toHaveAttribute('data-playback', 'playing');
  await page.keyboard.press('ControlOrMeta+s');
  await expect(page.locator('#save-now')).toHaveAttribute('data-dirty');
  await expect(page.locator('#editor')).toHaveAttribute('data-playback', 'playing');
  await page.locator('#stop').click();
  await expect(page.locator('[data-playback=playing]')).toHaveCount(0);
  await inputTab(page, 'audio');
  await expect(page.locator('#editor')).toHaveAttribute('data-playback', '');
  await expect(page.locator('#transport-state')).toHaveText('Select a pattern to play');
});

test('count-in cancellation restores ready scope without playing markers', async ({ page }) => {
  await page.locator('#count-in').click();
  await page.locator('#composition-play').click();
  await expect(page.locator('#transport-state')).toContainText('Count-in');
  await expect(page.locator('.clip[data-playback=playing]')).toHaveCount(0);
  await page.locator('#composition-stop:visible').click();
  await expect(page.locator('#transport-state')).toHaveText('Ready · Composition');
  await expect(page.locator('#composition-play')).toBeEnabled();
  await expect(page.locator('[data-playback=playing]')).toHaveCount(0);
});

test('loop scope excludes later clips and keeps the active clip across wraps', async ({ page }) => {
  await page.locator('[data-range-edge=end]').focus(); await page.keyboard.press('Home');
  await page.locator('#composition-loop').click();
  await expect(page.locator('.clip[data-playback=included]')).toHaveCount(1);
  await page.locator('#composition-play').click();
  const active = page.locator('.clip[data-playback=playing]');
  await expect(active).toHaveCount(1);
  const id = await active.getAttribute('data-clip');
  await page.waitForTimeout(1200); // More than three one-beat loop passes at the demo tempo.
  await expect(active).toHaveCount(1); await expect(active).toHaveAttribute('data-clip', id!);
  await page.locator('#composition-stop:visible').click();
  await expect(page.locator('.clip[data-playback=included]')).toHaveCount(1);
});

for (const width of [1440, 600]) test(`playback indicators stay readable at ${width}px in both appearances`, async ({ page }) => {
  await page.setViewportSize({ width, height: 900 });
  await page.locator('#composition-play').click();
  await expect(page.locator('.clip[data-playback=playing]')).not.toHaveCount(0);
  for (const dark of [false, true]) {
    await page.locator('#dark-mode').setChecked(dark);
    await expect(page.locator('#composition-content')).toHaveAttribute('data-playback', 'playing');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: test.info().outputPath(`playback-${dark ? 'dark' : 'light'}.png`) });
  }
  await page.locator('#composition-stop:visible').click();
});
