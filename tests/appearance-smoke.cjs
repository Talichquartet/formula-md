// Real Electron UI smoke check; all session and document writes use a temporary profile.
const { app, nativeTheme } = require('electron');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'formula-md-glass-'));
const output = path.resolve(__dirname, '../dist/glass-qa');
fs.mkdirSync(output, { recursive: true });
app.setPath('userData', profile);
const checks = [];
const errors = [];
let testWindow;
let finished = false;
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const timeout = setTimeout(() => finish(new Error('Appearance smoke check timed out')), 90000);

function finish(error) {
  if (finished) return;
  finished = true;
  clearTimeout(timeout);
  if (error) errors.push(error.stack || String(error));
  fs.writeFileSync(path.join(output, 'checks.json'), JSON.stringify({ checks, errors }, null, 2));
  console.log(JSON.stringify({ checks, errors, output }, null, 2));
  // Destroy only this isolated test window, bypassing unsaved-document prompts.
  testWindow?.destroy();
  fs.rmSync(profile, { recursive: true, force: true });
  app.exit(errors.length ? 1 : 0);
}

app.on('browser-window-created', (_event, window) => {
  testWindow = window;
  const contents = window.webContents;
  contents.on('console-message', (event) => {
    if (event.level === 'error') errors.push(event.message);
  });
  contents.once('did-finish-load', async () => {
    const run = (source) => contents.executeJavaScript(source, true);
    contents.debugger.attach('1.3');
    const mouse = (event) => contents.debugger.sendCommand('Input.dispatchMouseEvent', {
      type: { mouseMove: 'mouseMoved', mouseDown: 'mousePressed', mouseUp: 'mouseReleased' }[event.type],
      x: event.x, y: event.y, button: event.button || 'none', clickCount: event.clickCount || 0
    });
    const check = async (name, expression) => {
      const result = await run(expression);
      if (result !== true) console.log('Failure state', await run(`({ hidden: document.hidden, root: document.documentElement.outerHTML.slice(0, 220), active: document.activeElement?.id, tracked: document.querySelector('.glass-tracking')?.id, inline: elements.newButton.querySelector('.glass-surface')?.style.transform, computed: getComputedStyle(elements.newButton.querySelector('.glass-surface')).transform })`));
      assert.equal(result, true, name);
      checks.push(name);
    };
    const capture = async (name) => {
      await pause(350);
      fs.writeFileSync(path.join(output, `${name}.png`), (await contents.capturePage(undefined, { stayHidden: true, stayAwake: true })).toPNG());
    };
    const buttonRect = (id) => run(`(() => {
      const r = document.getElementById(${JSON.stringify(id)}).getBoundingClientRect();
      return { x: r.x, y: r.y, width: r.width, height: r.height };
    })()`);
    const captureButton = async (id, name) => {
      const r = await buttonRect(id);
      const clip = { x: Math.floor(r.x - 10), y: Math.floor(r.y - 14), width: Math.ceil(r.width + 20), height: Math.ceil(r.height + 28) };
      fs.writeFileSync(path.join(output, `${name}.png`), (await contents.capturePage(clip, { stayHidden: true, stayAwake: true })).toPNG());
    };
    const recordMotion = async () => {
      const dir = path.join(output, 'motion-frames');
      fs.mkdirSync(dir, { recursive: true });
      const r = await buttonRect('newButton');
      const clip = { x: Math.floor(r.x - 10), y: Math.floor(r.y - 14), width: Math.ceil(r.width + 20), height: Math.ceil(r.height + 28) };
      // Recording only the material response must not open a native save dialog.
      await run("elements.newButton.addEventListener('click', (event) => event.stopImmediatePropagation(), { capture: true, once: true })");
      const stamps = [];
      let down = false;
      let up = false;
      let left = false;
      const start = performance.now();
      while (performance.now() - start < 4400) {
        const t = performance.now() - start;
        const point = { x: Math.round(r.x + r.width * 0.75), y: Math.round(r.y + r.height * 0.5) };
        if (t > 450 && t < 1750) await mouse({ type: 'mouseMove', x: Math.round(r.x + r.width * (0.2 + (t - 450) / 1300 * 0.55)), y: point.y });
        if (t >= 1750 && !down) { await mouse({ type: 'mouseDown', button: 'left', clickCount: 1, ...point }); down = true; }
        if (t >= 2100 && !up) { await mouse({ type: 'mouseUp', button: 'left', clickCount: 1, ...point }); up = true; }
        if (t >= 3100 && !left) { await mouse({ type: 'mouseMove', x: 450, y: 400 }); left = true; }
        await pause(35);
        const frame = await contents.capturePage(clip, { stayHidden: true, stayAwake: true });
        const name = `${String(stamps.length).padStart(3, '0')}.png`;
        fs.writeFileSync(path.join(dir, name), frame.toPNG());
        stamps.push({ name, timeMs: performance.now() - start });
      }
      fs.writeFileSync(path.join(dir, 'timing.json'), JSON.stringify(stamps));
    };
    try {
      await run('window.MathJax.startup.promise.then(() => true)');
      // Keep live desktop input from interrupting deterministic material gestures.
      // This is the real Electron renderer, with its original preload and IPC.
      await pause(300);
      contents.setBackgroundThrottling(false);
      window.hide();
      await pause(100);
      // Exercise the active material in the hidden test window; retain all other
      // native appearance fields, including accessibility preferences and theme.
      await run("window.formulaMD.onAppearanceChanged((appearance) => applyAppearance({ ...appearance, active: true })); true");
      await run("window.formulaMD.setTheme('light').then((appearance) => applyAppearance({ ...appearance, active: true }))");
      await pause(300);
      await mouse({ type: 'mouseMove', x: 450, y: 400 });
      await pause(650);
      await check('Native appearance bridge', "document.documentElement.dataset.platform === 'darwin' && document.documentElement.dataset.theme === 'light'");
      assert.equal(nativeTheme.themeSource, 'light');
      await capture('welcome-light');
      await captureButton('newButton', 'sidebar-button-rest');
      await captureButton('welcomeNewButton', 'welcome-button-rest');
      await check('Both reported buttons use a single aligned rim', `['newButton', 'welcomeNewButton'].every((id) => {
        const button = document.getElementById(id);
        const surface = button.querySelector('.glass-surface');
        return getComputedStyle(button).borderTopWidth === '0px' && surface.offsetLeft === 0
          && surface.offsetTop === 0 && surface.offsetWidth === button.clientWidth
          && surface.offsetHeight === button.clientHeight && getComputedStyle(surface, '::after').maskComposite.split(',')[0].trim() === 'exclude';
      })`);
      const rest = await buttonRect('newButton');
      const point = { x: Math.round(rest.x + rest.width * 0.75), y: Math.round(rest.y + rest.height * 0.5) };
      await run("elements.newButton.addEventListener('click', (event) => event.stopImmediatePropagation(), { capture: true, once: true })");
      await mouse({ type: 'mouseMove', ...point });
      await pause(240);
      const iconX = await run('elements.newButton.querySelector("svg").getBoundingClientRect().x');
      await mouse({ type: 'mouseDown', button: 'left', clickCount: 1, ...point });
      await pause(140);
      await check('Press deforms the material while the label and hit target stay fixed', `(() => {
        const button = elements.newButton;
        return button.querySelector('.glass-surface').getBoundingClientRect().height < ${rest.height * 0.94}
          && button.getBoundingClientRect().width === ${rest.width}
          && button.querySelector('svg').getBoundingClientRect().x === ${iconX};
      })()`);
      await captureButton('newButton', 'sidebar-button-pressed');
      await mouse({ type: 'mouseUp', button: 'left', clickCount: 1, ...point });
      await pause(140);
      await check('Release starts the elastic return', "elements.newButton.classList.contains('glass-releasing') && elements.newButton.querySelector('.glass-surface').getAnimations().length > 0");
      await mouse({ type: 'mouseMove', x: 450, y: 400 });
      await pause(750);
      await check('All material animations and light layers stop after settling', "!document.querySelector('.glass-reflection, .glass-caustic') && Array.from(document.querySelectorAll('.glass-surface')).every((surface) => surface.getAnimations().length === 0 && !surface.style.transform)");
      if (process.env.FORMULA_MD_CAPTURE_MOTION === '1') await recordMotion();
      await run("window.formulaMD.setTheme('dark').then((appearance) => applyAppearance({ ...appearance, active: true }))");
      await capture('welcome-dark');
      await run("window.formulaMD.setTheme('light').then((appearance) => applyAppearance({ ...appearance, active: true }))");

      const sample = path.join(profile, '公式与排版.md');
      fs.copyFileSync(path.resolve(__dirname, '../examples/latex-showcase.md'), sample);
      await run(`window.formulaMD.openRecent(${JSON.stringify(sample)}).then(openDocument)`);
      await check('MathJax renders the showcase', "document.querySelectorAll('#article mjx-container').length > 10 && !elements.article.hidden");
      await check('Reading surface stays opaque', "getComputedStyle(elements.documentArea).backgroundColor === 'rgb(251, 252, 253)'");
      await capture('reader-light');
      await run("elements.searchInput.value = '公式'; elements.searchInput.dispatchEvent(new Event('input', { bubbles: true }))");
      await pause(300);
      await check('Search remains functional', 'state.searchMarks.length > 0');
      await run("elements.searchInput.value = ''; elements.searchInput.dispatchEvent(new Event('input', { bubbles: true })); elements.editModeButton.click()");
      await check('Editor and preview remain visible', "!elements.editorPanel.hidden && elements.documentArea.classList.contains('editing')");
      await check('The mode lens stretches during a switch', "elements.modeControl.dataset.liquidMode === 'editor' && getComputedStyle(elements.modeControl, '::after').animationName === 'lens-to-editor'");
      await capture('editor-light');
      await run("elements.sourceEditor.value += '\\n\\n玻璃界面保存检查'; elements.sourceEditor.dispatchEvent(new Event('input', { bubbles: true }))");
      await run('saveDocument()');
      assert.match(fs.readFileSync(sample, 'utf8'), /玻璃界面保存检查/);
      checks.push('Editing and saving use the original pipeline');

      // macOS needs a visible compositor surface while resizing capture targets.
      window.showInactive();
      window.setSize(900, 600);
      await pause(300);
      await check('Minimum window keeps both panes inside the content area', `(() => {
        const area = elements.documentArea.getBoundingClientRect();
        const preview = elements.contentScroller.getBoundingClientRect();
        const title = elements.documentTitle.getBoundingClientRect();
        const actions = document.querySelector('.toolbar-actions').getBoundingClientRect();
        return area.right <= innerWidth && preview.right <= area.right && preview.width > 250
          && title.width > 60 && title.right <= actions.left && actions.right <= innerWidth;
      })()`);
      await capture('editor-900-light');

      await run("elements.themeButton.click()");
      await pause(200);
      assert.equal(nativeTheme.themeSource, 'dark');
      await check('Native and renderer dark themes agree', "document.documentElement.dataset.theme === 'dark' && !document.querySelector('#hljsDarkTheme').disabled");
      await run("window.formulaMD.setTheme('dark').then((appearance) => applyAppearance({ ...appearance, active: true }))");
      await capture('editor-900-dark');
      window.setSize(1320, 860);
      await run('elements.readModeButton.click()');
      await capture('reader-dark');
      window.hide();
      await pause(100);
      await run("applyAppearance({ platform: 'darwin', theme: 'dark', reducedTransparency: false, highContrast: false, active: true })");

      const hover = await run('(() => { const r = elements.pdfButton.getBoundingClientRect(); return { x: Math.round(r.x + r.width * 0.7), y: Math.round(r.y + r.height * 0.5) }; })()');
      await mouse({ type: 'mouseMove', ...hover });
      await pause(100);
      await check('Pointer highlights only the current control', "document.querySelectorAll('.glass-tracking').length === 1 && Boolean(elements.pdfButton.querySelector('.glass-reflection')?.style.transform)");
      await capture('control-highlight');
      await mouse({ type: 'mouseMove', x: 450, y: 400 });
      await pause(100);
      await check('Leaving controls clears the light response', "!document.querySelector('.glass-tracking')");

      await contents.debugger.sendCommand('Emulation.setEmulatedMedia', {
        features: [{ name: 'prefers-reduced-motion', value: 'reduce' }, { name: 'prefers-reduced-transparency', value: 'reduce' }]
      });
      await pause(100);
      await check('Reduced transparency removes web backdrop filters', "getComputedStyle(document.querySelector('.toolbar')).backdropFilter === 'none'");
      await check('Reduced motion removes capsule animation', "getComputedStyle(elements.modeControl, '::after').transitionDuration === '0s'");
      await check('Reduced motion removes material deformation', "getComputedStyle(elements.newButton.querySelector('.glass-surface')).transitionDuration === '0s' && getComputedStyle(elements.newButton.querySelector('.glass-surface')).transform === 'none'");
      await mouse({ type: 'mouseMove', ...hover });
      await pause(100);
      await check('Reduced effects disable pointer tracking', "!document.querySelector('.glass-tracking')");
      await capture('reduced-effects-dark');
      await contents.debugger.sendCommand('Emulation.setEmulatedMedia', { features: [] });
      await run("applyAppearance({ platform: 'darwin', theme: 'dark', reducedTransparency: true, highContrast: true, active: true })");
      await check('Native accessibility event has an opaque fallback', "getComputedStyle(document.querySelector('.toolbar')).backdropFilter === 'none' && getComputedStyle(document.querySelector('.app-shell')).backgroundColor === 'rgb(27, 32, 36)'");
      await capture('high-contrast-dark');
      await run("window.formulaMD.setTheme('light').then((appearance) => applyAppearance({ ...appearance, active: true }))");

      await contents.debugger.sendCommand('Emulation.setEmulatedMedia', { media: 'print' });
      await check('Print hides app chrome and keeps a white page', "getComputedStyle(document.querySelector('.toolbar')).display === 'none' && getComputedStyle(document.body).backgroundColor === 'rgb(255, 255, 255)'");
      await contents.debugger.sendCommand('Emulation.setEmulatedMedia', { media: '' });
      fs.writeFileSync(path.join(output, 'showcase.pdf'), await contents.printToPDF({ pageSize: 'A4', printBackground: true }));
      checks.push('A4 PDF generated');
      contents.debugger.detach();
      finish();
    } catch (error) {
      finish(error);
    }
  });
});

require('../src/main.js');
