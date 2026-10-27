// E2E: "a new version of Orbit is available" — heads-up card, What's New modal,
// download hand-off, skip persistence, and the Settings → About entry point.
//
// The GitHub response is injected through the engine's fetchImpl seam, so these
// tests never touch the network and never depend on what happens to be the
// latest real release. _openExternal is stubbed too: the real implementation
// launches the user's browser, which a test must not do.
//
// Selectors: #update-notice-card, #update-card-open, #update-card-later,
// #update-notice-modal, #update-modal-download, #update-modal-notes,
// #update-modal-skip, #settings-btn-check-update.
const { test, expect } = require('@playwright/test');
const { tmpUserDataDir, launchApp } = require('./helpers');

// Comfortably ahead of the app's own version so the result is deterministic
// regardless of what the package version happens to be.
const NEW_VERSION = '9.9.9-beta';

const CHANGELOG = [
  '# Orbit Changelog',
  '',
  '## v' + NEW_VERSION,
  '',
  '### Features',
  '',
  '- **Update Notifications** — Orbit tells you when a newer version exists.',
  '- **QR Pairing Tabs** — Add-a-Friend switches between IP and QR.',
  '',
  '### Bug Fixes',
  '',
  '- **Chat Header Frames** — Profile frames now render in the chat header.',
  '',
  '## v0.5.0-beta',
  '',
  '- **Old Thing** — Should not be listed.'
].join('\n');

function fakeRelease(tag, body) {
  return {
    tag_name: 'v' + tag,
    name: 'Orbit v' + tag,
    html_url: 'https://github.com/D4niel-dev/Orbit-beta/releases/tag/v' + tag,
    prerelease: true,
    draft: false,
    published_at: '2026-10-01T00:00:00Z',
    // Deliberately the CI-generated shape (no changelog), so the tests exercise
    // the CHANGELOG.md fallback rather than a hand-written release body.
    body: body || '### Downloads\n\n| Artifact | Size |\n|----------|------|\n| Orbit-Setup.exe | 90M |\n',
    assets: [
      { name: 'Orbit-Setup.exe', browser_download_url: 'https://github.com/D4niel-dev/Orbit-beta/releases/download/v' + tag + '/Orbit-Setup.exe', size: 94371840 },
      { name: 'Orbit-' + tag + '-x64.dmg', browser_download_url: 'https://github.com/D4niel-dev/Orbit-beta/releases/download/v' + tag + '/Orbit.dmg', size: 120000000 },
      { name: 'Orbit-' + tag + '-x64.AppImage', browser_download_url: 'https://github.com/D4niel-dev/Orbit-beta/releases/download/v' + tag + '/Orbit.AppImage', size: 110000000 },
      { name: 'Orbit-v' + tag + '.apk', browser_download_url: 'https://github.com/D4niel-dev/Orbit-beta/releases/download/v' + tag + '/Orbit.apk', size: 50000000 }
    ]
  };
}

// Kicks the real detection path (init -> checkThrottled -> check -> parse) with
// the network replaced, and stubs the browser hand-off so no window opens.
async function triggerCheck(page, opts = {}) {
  await page.evaluate(({ release, changelog, force }) => {
    window.__openedUrls = [];
    window.UpdateNotice._openExternal = (url) => { window.__openedUrls.push(url); return true; };
    window.UpdateNotice.hideCard();
    window.UpdateNotice.closeModal();
    window.UpdateNotice.init({
      delayMs: 10,
      force: force !== false,
      fetchImpl: () => Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve(release ? [release] : []),
        text: () => Promise.resolve(changelog || '')
      })
    });
  }, {
    release: opts.release === null ? null : (opts.release || fakeRelease(NEW_VERSION)),
    changelog: opts.changelog === undefined ? CHANGELOG : opts.changelog,
    force: opts.force
  });
}

test.describe('update notice', () => {
  let app;
  let page;
  let userDataDir;

  test.beforeEach(async () => {
    userDataDir = tmpUserDataDir('update-notice');
    ({ app, page } = await launchApp(userDataDir));
  });

  test.afterEach(async () => {
    if (app) await app.close().catch(() => {});
  });

  test('a newer release raises a heads-up card with both versions', async () => {
    await triggerCheck(page);
    const card = page.locator('#update-notice-card');
    await expect(card).toBeVisible();
    await expect(card).toContainText('Orbit v' + NEW_VERSION + ' is available');

    const current = await page.evaluate(() => window.Orbit.UpdateCheck.currentVersion());
    await expect(card).toContainText('You\u2019re running v' + current);
  });

  test('no newer release means no card at all', async () => {
    await triggerCheck(page, { release: fakeRelease('0.0.1-beta') });
    // Give the delayed check time to land, then assert silence.
    await page.waitForTimeout(600);
    await expect(page.locator('#update-notice-card')).toHaveCount(0);
  });

  test('What\'s new opens the modal with highlights from the changelog', async () => {
    await triggerCheck(page);
    await page.click('#update-card-open');

    const modal = page.locator('#update-notice-modal');
    await expect(modal).toBeVisible();
    await expect(modal).toContainText('Orbit v' + NEW_VERSION + ' is available');
    await expect(modal).toContainText('Update Notifications');
    await expect(modal).toContainText('QR Pairing Tabs');
    await expect(modal).toContainText('Chat Header Frames');
    // The section for the older version must not leak in.
    await expect(modal).not.toContainText('Old Thing');
    // Opening the modal clears the card.
    await expect(page.locator('#update-notice-card')).toHaveCount(0);
  });

  test('Download takes the in-app path, and a failure offers the browser fallback', async () => {
    await triggerCheck(page);
    await page.click('#update-card-open');
    await expect(page.locator('#update-notice-modal')).toBeVisible();

    // The platform it will fetch is named — in the SUBTITLE now, not on the button.
    // ⚠ The label is short on purpose: "Download for Windows · 80.8 MB" wrapped onto
    // two lines at 480px beside Skip and Release notes. The information moved; it did
    // not go away, which is what this asserts.
    await expect(page.locator('#update-modal-download')).toContainText('Download');
    await expect(page.locator('#update-notice-modal')).toContainText('Windows installer');
    await page.click('#update-modal-download');

    // The in-app downloader takes over: a progress area appears and nothing is
    // handed to a browser yet.
    await expect(page.locator('#update-download-status')).toBeVisible();
    expect((await page.evaluate(() => window.__openedUrls)).length).toBe(0);

    // The fixture's asset URL is not a real release file, so the download fails
    // fast and the button becomes the browser fallback — which must then work.
    await expect(page.locator('#update-modal-download')).toContainText('Open in browser');
    await page.click('#update-modal-download');

    const opened = await page.evaluate(() => window.__openedUrls);
    expect(opened.length).toBe(1);
    expect(opened[0]).toMatch(/Orbit-Setup\.exe$/);
  });

  test('with no asset for this platform, Download opens the release page', async () => {
    // No .exe in the asset list, so win32 has nothing to fetch in-app: the
    // button must fall back to the release page. (Deleting orbitAPI.downloadUpdate
    // is not an option — contextBridge objects are frozen.)
    const noExe = fakeRelease(NEW_VERSION);
    noExe.assets = noExe.assets.filter(a => !/\.exe$/i.test(a.name));
    await triggerCheck(page, { release: noExe });
    await page.click('#update-card-open');

    await expect(page.locator('#update-modal-download')).toContainText('Open release page');
    await page.click('#update-modal-download');

    const opened = await page.evaluate(() => window.__openedUrls);
    expect(opened.length).toBe(1);
    expect(opened[0]).toContain('/releases/tag/v' + NEW_VERSION);
    await expect(page.locator('#update-notice-modal')).toHaveCount(0);
    await expect(page.locator('#update-notice-card')).toHaveCount(0);
  });

  test('Release notes opens the release page, not the asset', async () => {
    await triggerCheck(page);
    await page.click('#update-card-open');
    await page.click('#update-modal-notes');

    const opened = await page.evaluate(() => window.__openedUrls);
    expect(opened.length).toBe(1);
    expect(opened[0]).toContain('/releases/tag/v' + NEW_VERSION);
  });

  test('a release with no changelog still shows a usable modal', async () => {
    await triggerCheck(page, { changelog: '' });
    await page.click('#update-card-open');
    const modal = page.locator('#update-notice-modal');
    await expect(modal).toBeVisible();
    await expect(modal).toContainText('Release notes weren\u2019t published');
    await expect(page.locator('#update-modal-download')).toBeEnabled();
  });

  test('Skip this version suppresses it on the next check', async () => {
    await triggerCheck(page);
    await page.click('#update-card-open');
    await page.click('#update-modal-skip');

    await expect(page.locator('#update-notice-modal')).toHaveCount(0);
    const skipped = await page.evaluate(() => window.Orbit.UpdateCheck.skippedVersion());
    expect(skipped).toBe(NEW_VERSION);

    // Clear the 6h throttle so the *skip* is what suppresses the next check.
    await page.evaluate(() => window.Storage.remove('orbit_update_lastCheck'));
    await triggerCheck(page, { force: false });
    await page.waitForTimeout(600);
    await expect(page.locator('#update-notice-card')).toHaveCount(0);
  });

  test('a manual check surfaces the update even after skipping', async () => {
    await triggerCheck(page);
    await page.click('#update-card-open');
    await page.click('#update-modal-skip');
    await page.evaluate(() => window.Storage.remove('orbit_update_lastCheck'));

    // Settings → About is an explicit request, so it must not stay silent.
    await page.evaluate(({ release, changelog }) => {
      window.__openedUrls = [];
      window.UpdateNotice._openExternal = (url) => { window.__openedUrls.push(url); return true; };
      window.UpdateNotice.checkManual({
        fetchImpl: () => Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve([release]),
          text: () => Promise.resolve(changelog)
        })
      });
    }, { release: fakeRelease(NEW_VERSION), changelog: CHANGELOG });
    await expect(page.locator('#update-notice-modal')).toBeVisible();
  });

  test('Settings > About shows the real app version and a check-for-updates button', async () => {
    // The old code read orbitAPI.version, which falls back to a hardcoded
    // '0.1.2-beta' in packaged builds. Assert we no longer do that.
    const real = await page.evaluate(() => window.orbitAPI.getAppVersion());
    expect(real).toMatch(/^\d+\.\d+\.\d+/);
    expect(real).not.toBe('0.1.2-beta');

    await page.evaluate(() => window.SettingsModal.open('about'));
    await expect(page.locator('#settings-btn-check-update')).toBeVisible();

    const aboutText = await page.locator('.settings-modal, #settings-modal, body').first().innerText();
    expect(aboutText).toContain(real);
    expect(aboutText).not.toContain('0.1.2-beta');
  });

  /* -- 3. the opt-out setting -- */

  test('turning automatic checks off stops the boot check touching the network', async () => {
    await page.evaluate(() => {
      const st = window.store.getState();
      window.store.setState({ settings: { ...st.settings, updateCheckEnabled: false } });
    });

    const transportCalls = await page.evaluate(({ release }) => {
      window.__transportCalls = 0;
      window.UpdateNotice.hideCard();
      window.UpdateNotice.init({
        delayMs: 10,
        force: true,
        fetchImpl: () => {
          window.__transportCalls++;
          return Promise.resolve({
            ok: true, status: 200,
            json: () => Promise.resolve([release]),
            text: () => Promise.resolve('')
          });
        }
      });
      return new Promise((resolve) => setTimeout(() => resolve(window.__transportCalls), 500));
    }, { release: fakeRelease(NEW_VERSION) });

    expect(transportCalls).toBe(0);
    await expect(page.locator('#update-notice-card')).toHaveCount(0);
  });

  test('the manual check still works while automatic checks are off', async () => {
    await page.evaluate(() => {
      const st = window.store.getState();
      window.store.setState({ settings: { ...st.settings, updateCheckEnabled: false } });
      window.UpdateNotice._openExternal = () => true;
    });
    await page.evaluate(({ release, changelog }) => {
      window.UpdateNotice.checkManual({
        fetchImpl: () => Promise.resolve({
          ok: true, status: 200,
          json: () => Promise.resolve([release]),
          text: () => Promise.resolve(changelog)
        })
      });
    }, { release: fakeRelease(NEW_VERSION), changelog: CHANGELOG });

    await expect(page.locator('#update-notice-modal')).toBeVisible();
  });

  // Regression guard for the two-store trap: settings live in BOTH SQLite and
  // electron-store, and database.js re-runs migrateFromElectronStore(true) on
  // every launch — which copies electron-store's settings over SQLite. A toggle
  // that writes SQLite only is silently reverted on the next launch whenever
  // electron-store still holds an older snapshot. This seeds exactly that
  // situation before flipping the switch.
  test('the opt-out toggle survives a relaunch when electron-store holds a stale snapshot', async () => {
    await page.evaluate(() => {
      window.Storage.set('settings', { ...window.store.getState().settings, updateCheckEnabled: true });
      window.SettingsModal.open('about');
    });
    await expect(page.locator('#update-check-toggle')).toBeChecked();

    await page.locator('label:has(#update-check-toggle)').click();
    await expect(page.locator('#update-check-toggle')).not.toBeChecked();

    await app.close();
    app = null;

    ({ app, page } = await launchApp(userDataDir));
    const stored = await page.evaluate(() => window.store.getState().settings.updateCheckEnabled);
    expect(stored).toBe(false);

    // …and the tab reflects the stored value.
    await page.evaluate(() => window.SettingsModal.open('about'));
    await expect(page.locator('#update-check-toggle')).not.toBeChecked();
  });
});
