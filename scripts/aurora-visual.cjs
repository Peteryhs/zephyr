// Fixed-clock visual comparisons at full display size, including crisp stars.
const fs = require('fs'), path = require('path');
const { execFileSync } = require('child_process');
const launch = require('./perf-browser.cjs');
const root = path.resolve(__dirname, '..'), out = path.join(root, 'artifacts/aurora-perf');
fs.mkdirSync(out, { recursive: true });
(async () => {
  const browser = await launch();
  try {
    const before = execFileSync('git', ['show', `${process.argv[2] || '761acc8'}:plugin.js`], { cwd: root, encoding: 'utf8' });
    const after = fs.readFileSync(path.join(root, 'plugin.js'), 'utf8');
    for (const [label, text] of [['before', before], ['after', after]]) {
      const original = text.replace(/\r\n/g, '\n');
      const source = original.replace("from '@hermes/plugin-sdk'", "from '/sdk.js'").replace("from 'react/jsx-runtime'", "from '/react.js'") + '\nexport {createSky, WEATHER_PRESETS};';
      const stars = original.slice(original.indexOf('    let syncAuroraStars ='), original.indexOf('    // ── Tabs:', original.indexOf('    let syncAuroraStars =')));
      for (const [name, width, height, blur, elapsed] of [
        ['desktop', 1440, 900, 5, 0], ['desktop-later', 1440, 900, 5, 60],
        ['desktop-sharp', 1440, 900, 0, 0], ['mobile', 390, 844, 5, 0]
      ]) {
        const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 1 });
        await page.emulateMedia({ reducedMotion: 'reduce' });
        await page.route('http://zephyr.test/**', async route => {
          const url = new URL(route.request().url());
          let body, contentType = 'text/javascript';
          if (url.pathname === '/plugin.js') body = source;
          else if (url.pathname === '/sdk.js') body = fs.readFileSync(path.join(root, 'tests/node_modules/@hermes/plugin-sdk/index.js'), 'utf8');
          else if (url.pathname === '/react.js') body = fs.readFileSync(path.join(root, 'tests/node_modules/react/jsx-runtime.js'), 'utf8');
          else { body = '<html><body style="margin:0;background:#000"></body></html>'; contentType = 'text/html'; }
          await route.fulfill({ body, contentType });
        });
        await page.goto('http://zephyr.test/');
        await page.evaluate(async ({ blur, elapsed, stars }) => {
          const { createSky, WEATHER_PRESETS } = await import('/plugin.js');
          let clock = 0, seq = 0; const jobs = new Map();
          Object.defineProperty(performance, 'now', { value: () => clock });
          Object.defineProperty(document, 'hasFocus', { value: () => true });
          window.setTimeout = (fn, delay) => { const id = ++seq; jobs.set(id, { fn, delay }); return id; };
          window.clearTimeout = id => jobs.delete(id);
          const sky = createSky({ quality: 'high', lat: 43.65, lng: -79.38 });
          if (!sky) throw Error('WebGL unavailable');
          sky.setHold(new Date(2026, 10, 2, 23)); sky.setWeather(WEATHER_PRESETS.clear, 0, true);
          sky.setAurora(true); sky.setBlur(blur); sky.start();
          for (let i = 0; i < 35 + Math.round(elapsed * 16); i++) {
            const [id, job] = [...jobs.entries()][0]; jobs.delete(id);
            clock += Math.max(1, job.delay) + 5; job.fn();
          }
          document.documentElement.dataset.hermesTheme = 'zephyr-aurora';
          new Function('ctx', 'stored', 'STORE_KEYS', 'AURORA_THEME', 'SKY_THEME', stars)(
            { onDispose() {} }, () => undefined, { sky: 'sky' }, 'zephyr-aurora', 'zephyr-sky');
        }, { blur, elapsed, stars });
        await page.screenshot({ path: path.join(out, `visual-${label}-${name}.png`) });
        await page.close();
      }
    }
    console.log('Saved eight fixed-clock desktop/mobile Aurora comparisons including crisp stars.');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exit(1); });
