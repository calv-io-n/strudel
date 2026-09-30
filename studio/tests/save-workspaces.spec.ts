import { test, expect, type Page } from '@playwright/test';
import { inputTab } from './workspace-actions';

async function saved(page: Page) {
  return page.evaluate(async () => {
    const db: IDBDatabase = await new Promise((resolve, reject) => { const r = indexedDB.open('strudel-studio'); r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error); });
    return new Promise<any>((resolve, reject) => { const r = db.transaction('projects').objectStore('projects').get('Neon-Drive'); r.onsuccess = () => { resolve(r.result); db.close(); }; r.onerror = () => reject(r.error); });
  });
}
async function append(page: Page, code: string) {
  await page.locator('#editor .cm-content:visible').click(); await page.keyboard.press('ControlOrMeta+End'); await page.keyboard.insertText(code);
}
async function commit(page: Page) {
  await page.keyboard.press('ControlOrMeta+s');
  await expect(page.locator('#save-now')).not.toHaveAttribute('data-dirty');
  await expect(page.locator('#save-now')).toBeEnabled();
}
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => { localStorage.setItem('studio.quick-start.opt-out', 'true'); localStorage.setItem('studio.count-in', 'off'); });
  await page.goto('/'); await expect(page.locator('#saved-projects')).toHaveValue('Neon-Drive');
  await expect(page.locator('#composition-content')).toBeVisible();
});

test('autosave restores staged code; Save commits it for playback and clears dots', async ({ page }) => {
  const initial = await saved(page);
  await append(page, '\n// staged-edit\n');
  await expect(page.locator('#save-now')).toHaveAttribute('data-dirty');
  await expect(page.locator('#saved-state')).toContainText('autosaved');
  expect((await saved(page)).tabs).toEqual(initial.tabs);
  await page.reload(); await expect(page.locator('#editor .cm-content:visible')).toContainText('staged-edit');
  await expect(page.locator('#save-now')).toHaveAttribute('data-dirty');
  await commit(page);
  expect((await saved(page)).tabs.some((t: any) => t.code.includes('staged-edit'))).toBe(true);
  await page.reload(); await expect(page.locator('#save-now')).not.toHaveAttribute('data-dirty');
});

test('Save updates the running composition from another tab and validates the entire batch', async ({ page }) => {
  await page.locator('#composition-play').click();
  await expect(page.locator('#composition-content')).toHaveAttribute('data-playback', 'playing');
  await append(page, '\n// live-saved-edit\n');
  await page.getByRole('tab', { name: 'Rhythm', exact: true }).click();
  await append(page, '\nthis is invalid !!!\n');
  await page.keyboard.press('ControlOrMeta+s');
  await expect(page.locator('#notice')).toContainText('Rhythm');
  await expect(page.locator('#save-now')).toHaveAttribute('data-dirty');
  expect((await saved(page)).tabs.some((t: any) => t.code.includes('live-saved-edit'))).toBe(false);
  await expect(page.locator('#composition-content')).toHaveAttribute('data-playback', 'playing');
  await page.locator('#editor .cm-content:visible').click(); await page.keyboard.press('ControlOrMeta+z');
  await expect(page.locator('#editor .cm-content:visible')).not.toContainText('invalid');
  await commit(page);
  await expect(page.locator('#composition-content')).toHaveAttribute('data-playback', 'playing');
  expect((await saved(page)).tabs.some((t: any) => t.code.includes('live-saved-edit'))).toBe(true);
  await page.locator('#composition-stop:visible').click();
});

test('MIDI and Input are connection first; one Save commits both effects drafts', async ({ page }) => {
  await inputTab(page, 'midi');
  await expect(page.locator('#editor')).toBeHidden();
  await expect(page.locator('#instrument-toolbar')).toBeHidden();
  await expect(page.locator('#save-now')).not.toHaveAttribute('data-dirty');
  await page.locator('#effects-edit').click();
  await page.locator('#editor .cm-content:visible').fill('MIDI.s("triangle").gain(0.2)');
  await expect(page.locator('#tab-midi-instrument')).toHaveAttribute('data-dirty');
  await expect(page.locator('#instrument-apply')).toBeHidden();
  await inputTab(page, 'audio');
  await expect(page.locator('#tab-audio-input')).not.toHaveAttribute('data-dirty');
  await expect(page.locator('#editor')).toBeHidden();
  await page.locator('#effects-edit').click();
  await page.locator('#editor .cm-content:visible').fill('AUDIO.gain(0.5)');
  await expect(page.locator('#tab-audio-input')).toHaveAttribute('data-dirty');
  await commit(page);
  const result = await saved(page);
  expect(result.midiInstrument.appliedCode).toBe('MIDI.s("triangle").gain(0.2)');
  expect(result.audioInput.appliedCode).toBe('AUDIO.gain(0.5)');
  await expect(page.locator('#tab-midi-instrument')).not.toHaveAttribute('data-dirty');
  await expect(page.locator('#tab-audio-input')).not.toHaveAttribute('data-dirty');
});

test('pattern sounds use named parts and stage replacements without opening trimming', async ({ page }) => {
  await page.locator('#pattern-sounds-toggle').click();
  await expect(page.locator('#chop-sounds')).toContainText('Lead');
  await page.locator('#chop-sounds [data-chop]').first().click();
  await expect(page.locator('#library-title')).toHaveText('Replace sound · Lead');
  await expect(page.locator('#chop-region')).toBeHidden();
  await expect(page.locator('.library-options')).toBeHidden();
  await page.locator('#sound-search').fill('triangle');
  await page.locator('[data-select-sound="triangle"]').click();
  await page.locator('#chop-use').click();
  await expect(page.locator('#sounds-panel')).toBeHidden();
  await expect(page.locator('#save-now')).toHaveAttribute('data-dirty');
  await expect(page.locator('#editor .cm-content:visible')).toContainText('.s("triangle")');
  await commit(page);
});

test('Play uses saved code even when the staged draft is invalid', async ({ page }) => {
  await append(page, '\nthis is not valid !!!');
  await page.locator('[data-play-target=tab]').click();
  await page.locator('#play').click();
  await expect(page.locator('#editor')).toHaveAttribute('data-playback', 'playing');
  await expect(page.locator('#save-now')).toHaveAttribute('data-dirty');
  await page.locator('#stop:visible').click();
});

test('staged drafts survive switching sessions without changing the saved song', async ({ page }) => {
  const original = await saved(page);
  await append(page, '\n// session-specific-draft');
  await page.locator('#add-session').click(); await page.locator('#edit-name').fill('Second session'); await page.locator('#edit-dialog button[value=confirm]').click();
  await expect(page.locator('#project-name')).toHaveValue('Second session');
  await expect(page.locator('#editor .cm-content:visible')).not.toContainText('session-specific-draft');
  await page.locator('#saved-projects').selectOption('Neon-Drive');
  await expect(page.locator('#editor .cm-content:visible')).toContainText('session-specific-draft');
  expect((await saved(page)).tabs).toEqual(original.tabs);
});

test('MIDI keys stay in the workspace and sound changes are staged', async ({ page }) => {
  await inputTab(page, 'midi');
  await page.locator('#midi-editor-connection [data-midi-screen]').click();
  await expect(page.locator('#midi-workspace-keys')).toBeVisible();
  await expect(page.locator('#sheet')).toBeHidden();
  await page.locator('#midi-change-sound').click();
  await page.locator('#sound-search').fill('sine'); await page.locator('[data-select-sound="sine"]').click();
  await page.locator('#chop-use').click();
  await expect(page.locator('#tab-midi-instrument')).toHaveAttribute('data-dirty');
  await expect(page.locator('#editor .cm-content:visible')).toContainText('s("sine")');
  await commit(page);
  const key = page.locator('[data-workspace-note="60"]'); await key.focus(); await page.keyboard.down('Space'); await page.keyboard.up('Space');
  await expect(page.locator('#notice')).not.toContainText('Error');
});

for (const width of [1440, 600]) test(`simplified sounds and effects fit ${width}px`, async ({ page }) => {
  await page.setViewportSize({ width, height: 900 });
  for (const dark of [false, true]) {
    await page.locator('#dark-mode').setChecked(dark);
    await inputTab(page, 'midi');
    await page.screenshot({ path: test.info().outputPath(`midi-entry-${dark}.png`) });
    if (await page.locator('#effects-edit').isVisible()) await page.locator('#effects-edit').click();
    await page.screenshot({ path: test.info().outputPath(`midi-editor-${dark}.png`) });
    await page.locator('#tabs [data-tab]').last().click();
    await page.locator('#pattern-sounds-toggle').click();
    await page.screenshot({ path: test.info().outputPath(`sounds-${dark}.png`) });
    await page.keyboard.press('Escape');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  }
});

test('piano keys toggle closed, include sharps, and release when leaving MIDI', async ({ page }) => {
  await inputTab(page, 'midi');
  const toggle = page.locator('#midi-editor-connection [data-midi-screen]');
  await toggle.click();
  await expect(page.locator('.piano-key.white')).toHaveCount(8);
  await expect(page.locator('.piano-key.black')).toHaveCount(5);
  await expect(toggle).toHaveAttribute('aria-expanded', 'true');
  const sharp = page.getByRole('button', { name: 'Play C sharp 4', exact: true });
  await sharp.focus(); await page.keyboard.down('Space');
  await expect(sharp).toHaveAttribute('data-pressed');
  await page.keyboard.up('Space'); await expect(sharp).not.toHaveAttribute('data-pressed');
  await page.screenshot({ path: test.info().outputPath('piano-keyboard.png') });
  await toggle.click(); await expect(page.locator('#midi-workspace-keys')).toBeHidden();
  await toggle.click(); await page.getByRole('button', { name: 'Close on-screen keyboard' }).click();
  await expect(page.locator('#midi-workspace-keys')).toBeHidden();
  await toggle.click(); await page.locator('#tabs [data-tab]').first().click();
  await expect(page.locator('#midi-workspace-keys')).toBeHidden();
  await inputTab(page, 'midi'); await expect(page.locator('#midi-workspace-keys')).toBeHidden();
});

test('Change device switches the sole active controller and remembers it', async ({ page }) => {
  await page.addInitScript(() => {
    const inputs = new Map(['Keys', 'Pads'].map((name, index) => [String(index), { id: String(index), name, state: 'connected', onmidimessage: null }]));
    Object.defineProperty(navigator, 'requestMIDIAccess', { configurable: true, value: async () => ({ inputs, onstatechange: null }) });
    (window as any).testMidiInputs = inputs;
  });
  await page.reload();
  await inputTab(page, 'midi');
  const root = page.locator('#midi-editor-connection');
  await root.getByRole('button', { name: 'Connect controller', exact: true }).click();
  const controller = root.getByRole('combobox', { name: 'MIDI controller' });
  await controller.selectOption({ label: 'Keys' });
  await expect(root.locator('[data-midi-status]')).toHaveText('MIDI · Keys');
  await expect(controller).toBeHidden();
  await root.getByRole('button', { name: 'Change device' }).click();
  await controller.selectOption({ label: 'Pads' });
  await expect(root.locator('[data-midi-status]')).toHaveText('MIDI · Pads');
  await expect.poll(() => page.evaluate(() => [...(window as any).testMidiInputs.values()].map((p: any) => !!p.onmidimessage))).toEqual([false, true]);
  await root.getByRole('button', { name: 'Change device' }).click();
  await expect(controller).toHaveValue('Pads [1]');
  await controller.selectOption('');
  await expect.poll(() => page.evaluate(() => [...(window as any).testMidiInputs.values()].map((p: any) => !!p.onmidimessage))).toEqual([false, false]);
});

test('durable autosave recovers staged edits if the local cache is lost', async ({ page }) => {
  const original = await saved(page);
  await append(page, '\n// durable-staged-recovery\n');
  await expect(page.locator('#saved-state')).toHaveText('Staged changes autosaved');
  await page.evaluate(() => {
    for (const key of Object.keys(localStorage)) if (key.startsWith('studio.pending-session')) localStorage.removeItem(key);
    const setItem = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key, value) { if (!key.startsWith('studio.pending-session')) setItem.call(this, key, value); };
  });
  await page.reload();
  await expect(page.locator('#editor .cm-content:visible')).toContainText('durable-staged-recovery');
  expect((await saved(page)).tabs).toEqual(original.tabs);
  await expect(page.locator('#save-now')).toHaveAttribute('data-dirty');
});

test('pattern overflow uses arrows while MIDI and Input remain fixed', async ({ page }) => {
  await inputTab(page, 'audio');
  await inputTab(page, 'midi');
  for (let index = 0; index < 10; index++) {
    await page.locator('#new-tab').click();
    await page.locator('#new-pattern-name').fill('Extra pattern ' + index);
    await page.locator('#new-pattern button[type=submit]').click();
  }
  for (const width of [1440, 600]) {
    await page.setViewportSize({ width, height: 900 });
    await expect(page.locator('#tabs-previous')).toBeVisible();
    expect(await page.locator('#tabs').evaluate(el => getComputedStyle(el).scrollbarWidth)).toBe('none');
    for (const selector of ['#tab-midi-instrument', '#tab-audio-input', '.composition-toggle']) {
      await expect(page.locator(selector)).toBeInViewport({ ratio: 1 });
    }
    await page.locator('#tabs-previous').click();
    await expect(page.locator('#tabs-next')).toBeEnabled();
    await page.locator('#tab-midi-instrument').click();
    await expect(page.locator('#tab-midi-instrument')).toHaveAttribute('aria-selected', 'true');
    await page.locator('#tab-audio-input').click();
    await expect(page.locator('#tab-audio-input')).toHaveAttribute('aria-selected', 'true');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: test.info().outputPath('tab-overflow-' + width + '.png') });
  }
});
