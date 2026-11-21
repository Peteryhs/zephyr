// Measure the real plugin on synthetic Hermes markup in Chromium.
// Usage: node scripts/render-perf.cjs <baseline plugin.js> [candidate plugin.js]
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const launch = require('./perf-browser.cjs');

const root = path.resolve(__dirname, '..');
const origin = 'http://zephyr.test';
const fixtures = {
  '/sdk.js': fs.readFileSync(path.join(root, 'tests/node_modules/@hermes/plugin-sdk/index.js'), 'utf8'),
  '/react.js': fs.readFileSync(path.join(root, 'tests/node_modules/react/jsx-runtime.js'), 'utf8')
};

function instrument(file) {
  const source = fs.readFileSync(path.resolve(root, file), 'utf8').replace(/\r\n/g, '\n');
  assert.match(source, /const processTurn = \(container, isEnabled\) => \{/);
  assert.match(source, /const hasRaf = typeof requestAnimationFrame/);
  return source
    .replace("from '@hermes/plugin-sdk'", "from '/sdk.js'")
    .replace("from 'react/jsx-runtime'", "from '/react.js'")
    .replace('const processTurn = (container, isEnabled) => {', '$&\n      if (globalThis.scan) globalThis.scan.turns++')
    .replace('const runScanWork =', 'const scanWork =')
    .replace('const hasRaf =', `const runScanWork = (...args) => {
      const sample = globalThis.scan = { turns: 0 }
      const start = performance.now()
      try { scanWork(...args) } finally {
        globalThis.scans.push({ ...sample, ms: performance.now() - start })
        globalThis.scan = null
      }
    }
    const hasRaf =`)
    + '\nconst setAuroraLook = value => { AURORA_LOOK = value };\nexport { paintSky, clearSky, setLookMode, setAuroraLook };';
}

async function measure(browser, source, turns, verify) {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, timezoneId: 'America/Toronto' });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  try {
    await page.route('**/*', async route => {
      const url = new URL(route.request().url());
      if (url.origin !== origin) return route.abort();
      if (url.pathname === '/') return route.fulfill({ contentType: 'text/html', body: '<!doctype html><html class="dark"><body></body></html>' });
      const body = url.pathname === '/plugin.js' ? source : fixtures[url.pathname];
      return body ? route.fulfill({ contentType: 'text/javascript', body }) : route.abort();
    });
    await page.goto(origin);
    const result = await page.evaluate(async ({ turns, verify }) => {
      const { default: plugin, paintSky, clearSky, setLookMode, setAuroraLook } = await import('/plugin.js');
      const assert = (result, message) => { if (!result) throw Error(message); };
      const part = id => `<div data-slot="aui_assistant-message-root" data-role="assistant"><div data-slot="aui_assistant-message-content"><div data-conversation-scaffold><div data-slot="tool-block">Read file</div></div><div class="aui-md">Reply ${id}</div></div></div>`;
      const turn = id => `<div data-slot="aui_turn-pair"><div data-slot="aui_user-message-root" data-role="user"><div class="composer-human-message">Prompt ${id}</div></div><div data-slot="aui_response-group">${part(id)}</div></div>`;
      document.body.innerHTML = `<div data-slot="sidebar-wrapper"><header data-panel-header><div role="tablist"></div></header><aside data-slot="sidebar"><div data-slot="sidebar-content"></div></aside><main data-chat-surface><div data-slot="aui_thread-viewport" style="height:650px;overflow-y:auto"><div data-slot="aui_thread-content">${Array.from({ length: turns }, (_, id) => turn(id)).join('')}</div></div><div data-slot="composer-dock"><div data-slot="composer-surface"><textarea></textarea></div></div></main></div>`;
      const surface = document.querySelector('[data-chat-surface]');
      const viewport = surface.querySelector('[data-slot="aui_thread-viewport"]');
      const thread = viewport.firstElementChild;
      const composer = surface.querySelector('[data-slot="composer-surface"]');
      const styleWrites = new MutationObserver(() => {});
      styleWrites.observe(document.head, { subtree: true, childList: true });
      const day = (hour, minute = 0) => new Date(2026, 5, 21, hour, minute);
      const flushStyle = () => {
        getComputedStyle(composer).backgroundColor;
        return thread.offsetHeight;
      };
      paintSky(day(12));
      flushStyle();
      styleWrites.takeRecords();
      const refresh = [];
      for (let i = 1; i <= 30; i++) {
        const start = performance.now();
        paintSky(day(12, i * 5));
        flushStyle();
        const ms = performance.now() - start;
        const writtenChars = styleWrites.takeRecords().reduce((sum, r) => sum + r.target.textContent.length, 0);
        refresh.push({ ms, writtenChars });
      }
      styleWrites.disconnect();

      // Compare the parser's rule order and output, including backdrop and chrome switches.
      const css = [];
      for (const [mode, hour, gl, backdrop, chrome, aurora = false] of [
        ['sunset', 12, false, true, true], ['sunset', 0, true, true, true],
        ['sunset', 0, true, true, true, true],
        ['sunset', 19, false, true, false], ['sunset', 20, false, false, true],
        ['gruvbox', 12, false, true, true], ['gruvbox', 15, false, false, false]
      ]) {
        setLookMode(mode);
        setAuroraLook(aurora);
        paintSky(day(hour), gl, { backdrop, chrome });
        css.push(Array.from(document.styleSheets).flatMap(sheet => Array.from(sheet.cssRules, r => r.cssText)).join('\n'));
      }
      clearSky();
      assert(document.styleSheets.length === 0, 'Clearing appearance left a stylesheet behind');
      setLookMode('sunset');

      globalThis.scans = [];
      const values = new Map(Object.entries({ glSky: false, replyGround: false, collapseWork: true, margins: true, motion: false }));
      const disposers = [];
      plugin.register({
        storage: { get: (key, fallback) => values.has(key) ? values.get(key) : fallback, set: (key, value) => values.set(key, value) },
        register() {}, registerSettingsPage() {}, onDispose: fn => disposers.push(fn)
      });
      const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
      const active = thread.lastElementChild.lastElementChild;
      const marker = active.firstElementChild.querySelector('.aui-md');
      marker.dataset.messageStreaming = 'true';
      await wait(180);
      assert(active.querySelector('.zephyr-work-summary[data-live]'), 'Streaming marker did not activate the summary');
      scans.length = 0;
      for (let i = 0; i < 48; i++) {
        marker.append(' token');
        await wait(16);
      }
      await wait(125);
      const stream = scans.slice();
      assert(stream.length >= 5, 'No throttled streaming passes were measured');
      if (verify) assert(stream.every(row => row.turns === 1), 'Streaming visited another turn or measured an empty batch');

      active.insertAdjacentHTML('beforeend', part('continuation'));
      const continuation = active.lastElementChild;
      marker.removeAttribute('data-message-streaming');
      const oldTurn = thread.firstElementChild.lastElementChild;
      oldTurn.insertAdjacentHTML('beforeend', part('background work'));
      await wait(130);
      const summaries = active.querySelectorAll('.zephyr-work-summary');
      assert(summaries.length === 1 && !summaries[0].hasAttribute('data-live'), 'Continued turn did not settle to one summary');
      assert(continuation.querySelector('[data-zephyr-work-collapsed="true"]'), 'New assistant part did not inherit the fold');
      assert(oldTurn.lastElementChild.querySelector('[data-zephyr-work-collapsed="true"]'), 'Background turn did not inherit the fold');
      summaries[0].click();
      assert(continuation.querySelector('[data-zephyr-work-collapsed="false"]'), 'Expanding the summary did not expand its continuation');

      const pair = active.parentElement;
      pair.insertAdjacentHTML('beforeend', `<div data-slot="aui_response-group">${part('other response')}</div>`);
      await wait(130);
      pair.firstElementChild.append(' edited');
      await wait(130);
      assert(pair.querySelectorAll('.zephyr-work-summary').length === 2, 'A shared turn pair merged independent response summaries');

      surface.dataset.sessionSwitching = '';
      await wait(0);
      thread.innerHTML = turn('switched');
      surface.removeAttribute('data-session-switching');
      // The mutation callback must fold the fresh turn before the next frame.
      await new Promise(resolve => requestAnimationFrame(resolve));
      assert(thread.querySelector('[data-zephyr-work-collapsed="true"]'), 'Session switch revealed an unfolded turn');
      const tabs = document.querySelector('[role="tablist"]');
      tabs.innerHTML = '<button data-slot="pane-tab" style="width:40px">Rail</button>';
      await wait(100);
      assert(tabs.firstElementChild.dataset.zfRail === 'true', 'New pane tab was not observed');
      disposers.forEach(fn => fn());
      return { css, refresh, stream };
    }, { turns, verify });
    assert.deepEqual(errors, []);
    return result;
  } finally {
    await page.close();
  }
}

function summarize({ refresh, stream }) {
  const mean = xs => xs.reduce((sum, x) => sum + x, 0) / xs.length;
  return {
    refreshMeanMs: mean(refresh.map(x => x.ms)),
    refreshMeanWrittenChars: mean(refresh.map(x => x.writtenChars)),
    streamMeanPassMs: mean(stream.map(x => x.ms)),
    streamMeanTurnsPerPass: mean(stream.map(x => x.turns))
  };
}

(async () => {
  const [before, after = 'plugin.js'] = process.argv.slice(2);
  assert.ok(before, 'Supply a baseline plugin file');
  const a = instrument(before), b = instrument(after);
  const browser = await launch();
  try {
    for (const turns of [120, 500]) {
      const baseline = await measure(browser, a, turns, false);
      const candidate = await measure(browser, b, turns, true);
      assert.deepEqual(candidate.css, baseline.css, 'CSS rules or cascade order changed');
      console.log(JSON.stringify({ turns, baseline: summarize(baseline), candidate: summarize(candidate) }));
    }
  } finally {
    await browser.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
