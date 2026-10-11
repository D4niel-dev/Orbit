// The composer's attach sheet — what the "+" opens.
//
// Dan: "add the mobile 'pick an image/video/gif gallery' to the '+', like how
// discord did it... so we can finally remove the upload images and upload a
// video buttons or just move them to the 'pick an image/video/gif gallery' into
// a pill like the image."
//
// ⚠ THE ASSERTION THIS FILE EXISTS FOR IS THE LAST ONE.
//
// The block that wires the file input in app.js was guarded by
// `if (fileInput && dropupMenu)`. Removing the dropup markup makes `dropupMenu`
// null, so that whole block — including the change listener — would have been
// skipped. The "+" would still have opened the sheet, the picker would still have
// run, and every file would have silently failed to stage. Nothing would have
// thrown. So the staging round-trip is asserted end to end, not just the UI.
const H = require('./harness.js');

const SEED = {
  orbit_user: { id: 'u_dan', name: 'Dan', tag: '2847', status: 'online' },
  orbit_friends: [{ id: 'p_echo', name: 'Orbit Echo', tag: '0001', status: 'online' }],
  orbit_chats: [{ id: 'p_echo', name: 'Orbit Echo', lastMessage: '', lastTime: H.t(2) }],
  orbit_msg_p_echo: []
};

const SHEET = `(() => {
  const c = document.getElementById('bottom-sheet-content');
  const sheet = c && c.querySelector('.attach-sheet');
  const ov = document.getElementById('bottom-sheet-overlay');
  const shown = !!(ov && ov.classList.contains('active') && sheet);
  return {
    shown: shown,
    pills: sheet ? Array.from(sheet.querySelectorAll('.attach-pill')).map((p) => ({
      label: (p.querySelector('span') || {}).textContent,
      key: p.getAttribute('data-attach-tab'),
      on: p.classList.contains('on')
    })) : [],
    tiles: sheet ? Array.from(sheet.querySelectorAll('.attach-tile .attach-tile-label')).map((t) => t.textContent) : [],
    rows: sheet ? Array.from(sheet.querySelectorAll('.attach-row .attach-row-name')).map((t) => t.textContent) : [],
    // The dropup is gone and must stay gone.
    hasDropup: !!document.getElementById('dropup-menu'),
    bodyText: sheet ? (sheet.querySelector('.attach-body') || {}).textContent : null
  };
})()`;

/** Record what the picker was asked for instead of opening one. */
const STUB_CLICK = `(() => {
  window.__picks = [];
  window.__realClick = HTMLInputElement.prototype.click;
  HTMLInputElement.prototype.click = function () {
    window.__picks.push({
      accept: this.getAttribute('accept'),
      capture: this.getAttribute('capture'),
      multiple: this.hasAttribute('multiple'),
      folder: this.hasAttribute('webkitdirectory')
    });
  };
  return true;
})()`;

(async () => {
  const server = await H.serve();
  const { browser, page, errors } = await H.boot(server, SEED);
  await page.evaluate(() => window.openChat('p_echo'));
  await page.waitForTimeout(1200);
  await page.evaluate(STUB_CLICK);

  console.log('\n== the + opens a sheet ==');
  await page.evaluate(() => document.getElementById('btn-plus').click());
  await page.waitForTimeout(700);
  const sheet = await page.evaluate(SHEET);
  console.log('  pills: ' + JSON.stringify(sheet.pills.map((p) => p.label)));
  console.log('  tiles: ' + JSON.stringify(sheet.tiles));

  H.check('the + opens the attach sheet', sheet.shown === true, sheet);
  H.check('the old dropup is gone', sheet.hasDropup === false, sheet);
  H.check('there are four pills', sheet.pills.length === 4, sheet.pills);
  H.check('Photos / Poll / Commands / Files, in that order',
    JSON.stringify(sheet.pills.map((p) => p.key)) === JSON.stringify(['photos', 'poll', 'commands', 'files']),
    sheet.pills.map((p) => p.key));
  H.check('Photos is the one selected on open',
    sheet.pills.filter((p) => p.on).length === 1 &&
    (sheet.pills.find((p) => p.on) || {}).key === 'photos', sheet.pills);
  H.check('the media panel offers Camera and Gallery',
    JSON.stringify(sheet.tiles) === JSON.stringify(['Camera', 'Gallery']), sheet.tiles);
  await page.screenshot({ path: H.SHOTS + '/attach-photos.png' });

  console.log('\n== Gallery asks for images AND videos in one go ==');
  await page.evaluate(() => document.getElementById('attach-gallery').click());
  await page.waitForTimeout(500);
  const galPick = await page.evaluate(() => window.__picks[window.__picks.length - 1]);
  console.log('  ' + JSON.stringify(galPick));
  H.check('it opens the picker', !!galPick, galPick);
  H.check('accepting BOTH images and videos — the split that is gone',
    galPick && /image\/\*/.test(galPick.accept) && /video\/\*/.test(galPick.accept), galPick);
  H.check('and it is a multi-select', galPick && galPick.multiple === true, galPick);
  H.check('no camera capture on the gallery path', galPick && galPick.capture === null, galPick);

  console.log('\n== the sheet closes behind the picker ==');
  await page.waitForTimeout(400);
  const afterPick = await page.evaluate(SHEET);
  H.check('the sheet is out of the way', afterPick.shown === false, afterPick);

  console.log('\n== Camera goes straight to the camera ==');
  await page.evaluate(() => document.getElementById('btn-plus').click());
  await page.waitForTimeout(600);
  await page.evaluate(() => document.getElementById('attach-camera').click());
  await page.waitForTimeout(500);
  const camPick = await page.evaluate(() => window.__picks[window.__picks.length - 1]);
  console.log('  ' + JSON.stringify(camPick));
  H.check('it asks for a camera capture', camPick && camPick.capture === 'environment', camPick);
  H.check('images only, and one at a time',
    camPick && camPick.accept === 'image/*' && camPick.multiple === false, camPick);

  console.log('\n== the pills switch panels ==');
  await page.evaluate(() => document.getElementById('btn-plus').click());
  await page.waitForTimeout(600);
  await page.evaluate(() => document.querySelector('[data-attach-tab="poll"]').click());
  await page.waitForTimeout(500);
  const pollPanel = await page.evaluate(SHEET);
  console.log('  poll rows: ' + JSON.stringify(pollPanel.rows));
  H.check('the Poll panel offers a poll', JSON.stringify(pollPanel.rows) === JSON.stringify(['Create a poll']), pollPanel.rows);
  H.check('and the pill moved with it', (pollPanel.pills.find((p) => p.on) || {}).key === 'poll', pollPanel.pills);

  await page.evaluate(() => document.querySelector('[data-attach-tab="commands"]').click());
  await page.waitForTimeout(400);
  const cmdPanel = await page.evaluate(SHEET);
  H.check('the Commands panel offers the reference',
    JSON.stringify(cmdPanel.rows) === JSON.stringify(['Command reference']), cmdPanel.rows);

  await page.evaluate(() => document.querySelector('[data-attach-tab="files"]').click());
  await page.waitForTimeout(400);
  const filePanel = await page.evaluate(SHEET);
  console.log('  file rows: ' + JSON.stringify(filePanel.rows));
  H.check('the Files panel offers files AND folders — the two that survived',
    JSON.stringify(filePanel.rows) === JSON.stringify(['Choose files', 'Choose a folder']), filePanel.rows);
  await page.screenshot({ path: H.SHOTS + '/attach-files.png' });

  await page.evaluate(() => document.getElementById('attach-folder').click());
  await page.waitForTimeout(500);
  const folderPick = await page.evaluate(() => window.__picks[window.__picks.length - 1]);
  H.check('the folder picker still asks for a directory', folderPick && folderPick.folder === true, folderPick);

  console.log('\n== Poll actually opens the builder, in a DM ==');
  // ⚠ A DM on purpose: slash commands are group-only, and the builder is reached
  // through an explicit flag. If that flag were dropped, this is where it shows.
  await page.evaluate(() => document.getElementById('btn-plus').click());
  await page.waitForTimeout(600);
  await page.evaluate(() => document.querySelector('[data-attach-tab="poll"]').click());
  await page.waitForTimeout(400);
  await page.evaluate(() => document.getElementById('attach-poll').click());
  await page.waitForTimeout(1200);
  const builder = await page.evaluate(() => {
    const c = document.getElementById('bottom-sheet-content');
    return {
      heading: c ? (c.querySelector('h3') || {}).textContent : null,
      hasQuestion: !!(c && c.querySelector('#poll-question')),
      hasCreate: !!(c && c.querySelector('#poll-create'))
    };
  });
  console.log('  ' + JSON.stringify(builder));
  H.check('the poll builder opened from the sheet, in a DM',
    builder.hasQuestion === true && builder.hasCreate === true, builder);
  H.check('and it is the same builder the /poll command uses',
    builder.heading === 'Create Poll', builder.heading);

  console.log('\n== ⚠ AND FILES STILL STAGE — the regression this file exists for ==');
  await page.evaluate(() => { if (window.OrbitSheet) OrbitSheet.hide(); });
  await page.waitForTimeout(500);

  // ⚠ The input's attributes are sticky, and the folder pick leaves
  // `webkitdirectory` set. Picking a gallery file must clear it, or the next
  // attach would open a FOLDER chooser — so that is asserted rather than assumed.
  await page.evaluate(() => document.getElementById('btn-plus').click());
  await page.waitForTimeout(600);
  await page.evaluate(() => document.getElementById('attach-gallery').click());
  await page.waitForTimeout(500);
  const cleared = await page.evaluate(() => ({
    folder: document.getElementById('file-input').hasAttribute('webkitdirectory'),
    multiple: document.getElementById('file-input').hasAttribute('multiple')
  }));
  console.log('  after a gallery pick: ' + JSON.stringify(cleared));
  H.check('the folder flag does NOT stick to the next pick', cleared.folder === false, cleared);
  H.check('and multi-select comes back', cleared.multiple === true, cleared);

  // Restore the real click and drive the input the way the picker would.
  await page.evaluate(() => { HTMLInputElement.prototype.click = window.__realClick; });
  const sharp = require('C:/Users/KHAC DUY/Desktop/Orbit Beta/desktop/node_modules/sharp');
  const png = await sharp({ create: { width: 40, height: 40, channels: 3, background: { r: 200, g: 90, b: 60 } } }).png().toBuffer();
  const p = 'C:/Users/KHAC DUY/AppData/Local/Temp/attach-sheet-test.png';
  require('fs').writeFileSync(p, png);

  await page.setInputFiles('#file-input', [p]);
  await page.waitForTimeout(1200);
  const staged = await page.evaluate(() => {
    const area = document.getElementById('file-preview-area');
    return {
      items: area ? area.querySelectorAll('.file-preview-item').length : 0,
      visible: !!(area && getComputedStyle(area).display !== 'none')
    };
  });
  console.log('  ' + JSON.stringify(staged));
  H.check('a picked file still STAGES into the preview strip',
    staged.items === 1 && staged.visible === true, staged);

  H.check('no page errors', errors.length === 0, errors);
  await browser.close(); server.close(); H.report();
})().catch((e) => { console.error('FAIL', e.message); process.exit(1); });
