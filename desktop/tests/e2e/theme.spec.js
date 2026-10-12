// E2E: theme switching — data-theme attribute + CSS variable changes.
const { test, expect } = require('@playwright/test');
const { tmpUserDataDir, launchApp } = require('./helpers');

// Computed CSS variable value on <html> (normalized: trimmed, lowercased).
function accentColor(page) {
  return page.evaluate(() =>
    getComputedStyle(document.documentElement)
      .getPropertyValue('--accent-primary')
      .trim()
      .toLowerCase()
  );
}

test.describe('theme', () => {
  let app;
  let page;

  test.beforeEach(async () => {
    ({ app, page } = await launchApp(tmpUserDataDir('theme')));
  });

  test.afterEach(async () => {
    if (app) await app.close().catch(() => {});
  });

  test('boots with the default dark theme', async () => {
    const theme = await page.evaluate(() => document.documentElement.getAttribute('data-theme'));
    expect(theme).toBe('dark');
    // ⚠ The value moved in v0.9.0, deliberately: the desktop redesign restates
    // the accent in styles/redesign.css so that it matches the phone's, and so
    // that deleting that one stylesheet restores the old accent with the old
    // design. This assertion is about the EFFECTIVE accent — "switching theme
    // changes the colour" is the behaviour; the literal hex is just what it
    // currently is. It was #0A84FF from dark.css before the redesign.
    expect(await accentColor(page)).toBe('#4d7cfe');
  });

  test('switching the theme in Settings updates data-theme and --accent-primary', async () => {
    // Open Settings from the left sidebar rail.
    await page.click('#btn-nav-settings');
    const appearanceTab = page.locator('.settings-tab[data-tab="appearance"]');
    await expect(appearanceTab).toBeVisible();
    await appearanceTab.click();

    // Flip the theme radio to "light". NOTE: use click(), not check() — the
    // app's change handler deliberately reverts the light radio (settings-modal
    // easter egg) until the confirmation dialog is accepted, which makes
    // check()'s post-click state verification fail by design.
    const lightRadio = page.locator('input[name="theme"][value="light"]');
    await expect(lightRadio).toBeVisible();
    await lightRadio.click();

    // Light theme is gated behind the in-app "CAUTION: Light Mode" easter-egg
    // dialog (the radio is visually reverted until confirmed).
    const confirmBtn = page.locator('#light-mode-confirm');
    await expect(confirmBtn).toBeVisible();
    await confirmBtn.click();

    // data-theme attribute reflects the new theme.
    await expect
      .poll(() => page.evaluate(() => document.documentElement.getAttribute('data-theme')))
      .toBe('light');

    // Was #5B7FFF from light.css before the v0.9.0 redesign — see the note above.
    await expect.poll(() => accentColor(page)).toBe('#3f6ef0');
  });
});