import { expect, type Page, type Locator } from '@playwright/test';

export async function inputTab(page: Page, kind: 'audio' | 'midi') {
  const tab = page.getByRole('tab', { name: kind === 'audio' ? 'Audio input' : 'MIDI instrument', exact: true });
  if (!await tab.isVisible()) {
    await page.locator('#palette-open').click();
    await page.locator('#command-palette input').fill(kind === 'audio' ? 'Audio input' : 'MIDI & on-screen controller');
    await page.keyboard.press('Enter');
    await expect(page.locator('#sheet')).toBeVisible();
    await page.keyboard.press('Escape');
  }
  await tab.click();
}
export async function clipProperties(page: Page, clip: Locator = page.locator('[data-clip]').first()) {
  await clip.click({ button: 'right' });
  await page.getByRole('menuitem', { name: 'Properties', exact: true }).click();
  await expect(page.locator('#clip-properties')).toBeVisible();
}
export async function soundManagement(page: Page, action: 'Add sounds' | 'Manage packs') {
  await page.getByLabel('Sounds options', { exact: true }).click();
  await page.getByRole('button', { name: action, exact: true }).click();
}
export async function liveSound(page: Page, name: string) {
  const action = page.locator(`[data-live-sound="${name}"]`);
  await action.locator('..').locator('..').locator('summary').click();
  await action.click();
}
