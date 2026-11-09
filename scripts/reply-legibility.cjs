// Visual harness for the reply-ground material. It renders Zephyr's current
// CSS/material functions against a small, explicitly synthetic Hermes-shaped
// transcript. It does not load or claim to reproduce Hermes' real DOM.
//
// Usage: ZEPHYR_PLAYWRIGHT_ROOT=~/.hermes/hermes-agent node scripts/reply-legibility.cjs
// Optional: ZEPHYR_CHROMIUM=/path/to/chrome
const fs = require('node:fs')
const path = require('node:path')
const os = require('node:os')

const root = path.resolve(__dirname, '..')
const out = path.join(root, 'artifacts', 'reply-legibility')
const backwater = fs.readFileSync(path.join(root, 'assets/backwater.jpg')).toString('base64')
const playRoots = [
  root,
  process.env.ZEPHYR_PLAYWRIGHT_ROOT,
  path.join(os.homedir(), '.hermes/hermes-agent'),
  path.join(os.homedir(), '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules')
].filter(Boolean)
let playwrightPath
for (const base of playRoots) {
  try { playwrightPath = require.resolve('playwright', { paths: [base] }); break } catch {}
}
if (!playwrightPath) throw new Error('Playwright not found; set ZEPHYR_PLAYWRIGHT_ROOT to its package directory')
const { chromium } = require(playwrightPath)
const { PNG } = require(require.resolve('pngjs', { paths: playRoots }))

const sourcePath = path.join(root, 'plugin.js')
const source = fs.readFileSync(sourcePath, 'utf8')
const apiNames = ['skyStyleFor', 'setLookMode', 'setSkin', 'SKIN_DEFAULTS', 'replyMaterial', 'replyGroundCss', 'createSky', 'WEATHER_PRESETS', 'gruvboxMaterial', 'zephyrMaterial', 'skyAt', 'pictureBackdrop', 'phaseAt', 'replyHostGround', 'replyCssSky', 'SNIPPET_CSS']
const importsRemoved = source
  .replace(/^import\s+.*?\s+from\s+['"][^'"]+['"]\s*;?\s*$/gm, '')
  .replace('export default {', 'const __zephyrPlugin = {')
  .replace("let BACKWATER_URL = 'data:,'", `let BACKWATER_URL = 'data:image/jpeg;base64,${backwater}'`)
const helperExports = `
const setAurora = value => { AURORA_LOOK = Boolean(value) };
const loadPictureBackdrop = url => new Promise(resolve => {
  if (pictureSourceUrl === url) return resolve();
  setSkin({ ...SKIN, image: url });
  const previous = pictureReady;
  pictureReady = () => { pictureReady = previous; resolve() };
  ensurePictureStyle(url);
  preparePictureBackdrop(url);
});
`
const bundle = `${importsRemoved}\n${helperExports}\nexport { ${apiNames.join(', ')}, setAurora, loadPictureBackdrop };\n`

const replyHtml = `
<main class="app">
  <div class="thread" data-slot="aui_thread-content">
    <article class="assistant" data-slot="aui_assistant-message-root">
      <div class="reply" data-slot="aui_assistant-message-content">
        <div class="aui-md">
          <p>Here is the short answer, with a <a href="#">source link</a> and a second sentence to test line length over the backdrop.</p>
          <h3>What changed</h3>
          <ul><li>Streaming prose stays in the same reply ground.</li><li>Lists, emphasis, <code>inline code</code> and timestamps remain distinct.</li></ul>
          <blockquote><p>A quoted passage should remain legible without a second frame.</p></blockquote>
          <pre><code>const result = await run();\nconsole.log(result)</code></pre>
          <div class="seams">
            <div class="zephyr-work-summary">Worked for 12 seconds · 3 tools</div>
            <div class="zephyr-work-summary" data-live>Working… Searching the project</div>
            <div data-slot="tool-block" data-tool-open><b>Open tool block</b><pre>Read file: src/example.ts</pre></div>
            <details data-slot="aui_thinking-disclosure" open><summary>Thinking</summary><p>Reasoning detail sits in the reply flow.</p></details>
            <div data-slot="aui_turn-activity">Searching the project</div>
            <div data-slot="code-card"><pre><code>nested code card</code></pre></div>
            <div class="zf-snip"><div class="zf-snip-head"><span class="zf-snip-title">Build size</span><span class="zf-snip-acts">Copy · Pin</span></div><div class="zf-snip-value">412 KB</div><div class="zf-snip-note">gzip, down 9%</div></div>
            <div data-slot="file-diff-panel"><b>Modified file</b><pre>+ an added line</pre></div>
            <table><tr><th>Check</th><th>Result</th></tr><tr><td>Contrast</td><td>Measured</td></tr></table>
            <div data-slot="clarify-inline">Clarify prompt card</div>
            <figure><div class="diagram">Diagram</div><figcaption>Reply image or diagram</figcaption></figure>
          </div>
        </div>
        <div data-slot="aui_message-actions">Copy · Feedback · 2 min</div>
      </div>
    </article>
    <article class="user" data-slot="aui_user-message-root"><div class="user-bubble">Keep my original wording.<div data-slot="user-message-edit">Edit in place</div></div></article>
  </div>
  <div class="composer">Message Hermes…</div>
</main>`

const shellCss = `
*{box-sizing:border-box}html,body{margin:0;min-height:100%;font:15px/1.55 Inter,system-ui,sans-serif;color:#fff}
body{background:linear-gradient(155deg,#6596ba,#d5c9a7 64%,#8797a0)}
.app{min-height:100vh;padding:32px 18px 24px}.thread{width:min(46rem,100%);margin:auto}
.assistant{margin:0 0 24px}.reply{position:relative;padding-left:.75rem}.aui-md{overflow-wrap:anywhere}
p{margin:.55em 0 1em}h3{margin:1.2em 0 .4em;font-size:1.15rem}a{color:#e4c6a5}code,pre{font:13px/1.5 ui-monospace,monospace}pre{white-space:pre-wrap;padding:12px;background:rgba(10,14,23,.32);border-radius:8px}
blockquote{margin:12px 0;padding:2px 14px;border-left:2px solid #d5c9b7;color:#f1eee9}
.seams{display:grid;gap:12px;margin-top:20px}.seams>[data-slot]{padding:12px;border-radius:9px;background:rgba(12,15,22,.40);border:1px solid rgba(255,255,255,.13)}
.seams pre{margin:8px 0 0;background:rgba(0,0,0,.24)}details summary{cursor:pointer}.seams table{border-collapse:collapse;width:100%}td,th{padding:5px;text-align:left;border:1px solid rgba(255,255,255,.25)}
.diagram{height:84px;display:grid;place-items:center;background:linear-gradient(130deg,#5282a0,#b9a77c);border-radius:6px}.user{display:flex;justify-content:flex-end}.user-bubble{max-width:85%;padding:12px 16px;border-radius:14px;background:rgba(12,18,29,.65)}
.composer{position:relative;width:min(46rem,calc(100% - 36px));margin:20px auto 0;padding:12px 16px;border-radius:14px;background:rgba(12,18,29,.88);color:#d5d9e0}
@media(max-width:600px){.app{padding:18px 12px}.thread{width:100%}.assistant{margin-bottom:20px}.composer{width:100%}}
`

const cases = [
  { name: 'sky-clear-noon', look: 'sunset', weather: 'clear', date: [2026,6,15,12], ink: [255,255,255] },
  { name: 'sky-storm-noon', look: 'sunset', weather: 'storm', date: [2026,6,15,12], ink: [255,255,255] },
  { name: 'sky-clear-dusk', look: 'sunset', weather: 'clear', date: [2026,6,15,21,30], ink: [255,255,255] },
  { name: 'sky-storm-dusk', look: 'sunset', weather: 'storm', date: [2026,6,15,21,30], ink: [255,255,255] },
  { name: 'sky-css-fallback-dusk', look: 'sunset', date: [2026,6,15,21,30], ink: [255,255,255], fallback: true },
  { name: 'sky-clear-night', look: 'sunset', weather: 'clear', date: [2026,6,15,23], ink: [255,255,255] },
  { name: 'sky-storm-night', look: 'sunset', weather: 'storm', date: [2026,6,15,23], ink: [255,255,255] },
  { name: 'aurora-held-noon', look: 'sunset', weather: 'clear', date: [2026,6,15,23], requestedPhase: 'noon', ink: [255,255,255], aurora: true },
  { name: 'aurora-held-dusk', look: 'sunset', weather: 'clear', date: [2026,6,15,23], requestedPhase: 'dusk', ink: [255,255,255], aurora: true },
  { name: 'aurora-held-night', look: 'sunset', weather: 'clear', date: [2026,6,15,23], requestedPhase: 'night', ink: [255,255,255], aurora: true },
  { name: 'gruvbox-noon', look: 'gruvbox', date: [2026,6,15,12], ink: [251,241,199], picture: 'backwater' },
  { name: 'gruvbox-dusk', look: 'gruvbox', date: [2026,6,15,21,30], ink: [251,241,199], picture: 'backwater' },
  { name: 'gruvbox-night', look: 'gruvbox', date: [2026,6,15,23], ink: [251,241,199], picture: 'backwater' },
  { name: 'custom-default', look: 'gruvbox', custom: true, date: [2026,6,15,12], ink: [251,241,199], picture: 'backwater' },
  { name: 'custom-default-dusk', look: 'gruvbox', custom: true, date: [2026,6,15,21,30], ink: [251,241,199], picture: 'backwater' },
  { name: 'custom-default-night', look: 'gruvbox', custom: true, date: [2026,6,15,23], ink: [251,241,199], picture: 'backwater' },
  { name: 'custom-bright', look: 'gruvbox', custom: true, date: [2026,6,15,12], ink: [251,241,199], picture: 'bright' },
  { name: 'custom-dark-ink', look: 'gruvbox', custom: true, darkInk: true, date: [2026,6,15,12], ink: [38,40,45], picture: 'backwater' },
  { name: 'hermes-native', look: 'sunset', date: [2026,6,15,12], native: true }
]
const pixelDiff = (left, right, rectA, rectB) => {
  const a = PNG.sync.read(left), b = PNG.sync.read(right)
  if (a.width !== b.width || a.height !== b.height) return { identical: false, changedChannels: null, width: a.width, height: a.height }
  const rectEqual = rectA && rectB && ['left', 'top', 'width', 'height'].every(key => Math.abs(rectA[key] - rectB[key]) < 0.001)
  if (rectA && rectB && !rectEqual) return { identical: false, changedChannels: null, geometrySame: false, rectA, rectB, width: a.width, height: a.height }
  const x0 = rectA ? Math.max(0, Math.floor(rectA.left)) : 0
  const y0 = rectA ? Math.max(0, Math.floor(rectA.top)) : 0
  const x1 = rectA ? Math.min(a.width, Math.ceil(rectA.left + rectA.width)) : a.width
  const y1 = rectA ? Math.min(a.height, Math.ceil(rectA.top + rectA.height)) : a.height
  let changedChannels = 0
  for (let y = y0; y < y1; y += 1) for (let x = x0; x < x1; x += 1) {
    const i = (y * a.width + x) * 4
    for (let c = 0; c < 4; c += 1) if (a.data[i + c] !== b.data[i + c]) changedChannels += 1
  }
  return { identical: changedChannels === 0, changedChannels, geometrySame: rectEqual, rect: rectA, width: x1 - x0, height: y1 - y0 }
}

const launch = async () => {
  const executablePath = process.env.ZEPHYR_CHROMIUM
  const browser = await chromium.launch({ headless: true, ...(executablePath ? { executablePath } : {}) })
  try {
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 1, timezoneId: 'America/Toronto' })
    const page = await context.newPage()
    await page.route('http://zephyr.test/**', async route => {
      const url = new URL(route.request().url())
      if (url.pathname === '/plugin.js') return route.fulfill({ body: bundle, contentType: 'text/javascript' })
      if (url.pathname === '/sdk.js') return route.fulfill({ body: fs.readFileSync(path.join(root, 'tests/node_modules/@hermes/plugin-sdk/index.js'), 'utf8'), contentType: 'text/javascript' })
      if (url.pathname === '/react.js') return route.fulfill({ body: fs.readFileSync(path.join(root, 'tests/node_modules/react/jsx-runtime.js'), 'utf8'), contentType: 'text/javascript' })
      return route.fulfill({ body: '<!doctype html><html><body></body></html>', contentType: 'text/html' })
    })
    await page.goto('http://zephyr.test/')
    await page.setContent(`<!doctype html><html class="dark"><head><meta charset="utf-8"><style>${shellCss}</style></head><body>${replyHtml}</body></html>`)
    await page.evaluate(() => {
      if (Intl.DateTimeFormat().resolvedOptions().timeZone !== 'America/Toronto') throw new Error('Browser timezone is not America/Toronto')
      Object.defineProperty(document, 'hasFocus', { value: () => true, configurable: true })
    })
    await page.evaluate(url => { window.__backwaterUrl = url }, `data:image/jpeg;base64,${backwater}`)
    // The first look includes module parse, style insertion, font settle and
    // WebGL startup. Warm that exact Sky/clear/noon path once, outside the
    // screenshots and timing sample, so the measured case sees settled layout.
    await page.evaluate(async () => {
      const api = await import('/plugin.js')
      const date = new Date(2026, 6, 15, 12)
      Date.now = () => date.getTime()
      api.setLookMode('sunset'); api.setAurora(false); api.setSkin({ ...api.SKIN_DEFAULTS })
      const css = document.createElement('style'); css.id = 'zephyr-actual-css'; css.textContent = api.skyStyleFor(date, true); document.head.appendChild(css)
      const sky = api.createSky({ quality: 'balanced', lat: 43.6532, lng: -79.3832 })
      sky.setHold(date); sky.setWeather(api.WEATHER_PRESETS.clear, 0, true); sky.setFps(30); sky.setBlur(5, 0); sky.start()
      await new Promise(resolve => setTimeout(resolve, 250)); sky.stop()
      const host = api.replyHostGround(), samples = sky.backdrop(host.bounds)
      const material = api.replyMaterial([255,255,255], api.zephyrMaterial(api.skyAt(date)).tint, samples)
      const ground = document.createElement('style'); ground.id = 'reply-ground-style'; ground.textContent = api.replyGroundCss(material); document.head.appendChild(ground)
      await new Promise(resolve => setTimeout(resolve, 400))
      ground.remove(); sky.dispose(); css.remove()
      await new Promise(resolve => setTimeout(resolve, 400))
    })
    const rows = []
    fs.mkdirSync(out, { recursive: true })
    for (const viewport of [{ width: 1440, height: 1000, label: 'desktop' }, { width: 390, height: 844, label: 'mobile' }]) {
      await page.setViewportSize({ width: viewport.width, height: viewport.height })
      for (const c of cases) {
        await page.evaluate(async ({ c }) => {
          const api = await import('/plugin.js')
          api.setLookMode(c.look)
          api.setAurora(Boolean(c.aurora))
          const date = new Date(...c.date)
          Date.now = () => date.getTime()
          api.setSkin({ ...api.SKIN_DEFAULTS })
          if (!c.native) {
            document.body.style.removeProperty('background')
            document.body.style.removeProperty('color')
          }
          if (c.look === 'gruvbox') document.documentElement.dataset.zfChat = '1'
          else delete document.documentElement.dataset.zfChat
          document.documentElement.classList.add('dark')
          if (c.native) {
            document.documentElement.classList.remove('dark')
            document.body.style.background = '#fff'
            document.body.style.color = '#242424'
          }
          if (c.picture) {
            let imageUrl = window.__backwaterUrl
            if (c.picture === 'bright') {
              const canvas = document.createElement('canvas'); canvas.width = 128; canvas.height = 128
              const ctx = canvas.getContext('2d'); const g = ctx.createLinearGradient(0,0,128,128)
              g.addColorStop(0,'#fff8e6'); g.addColorStop(.52,'#dfd6c2'); g.addColorStop(1,'#f8f2e4')
              ctx.fillStyle = g; ctx.fillRect(0,0,128,128); imageUrl = canvas.toDataURL('image/png')
            }
            api.setSkin({ ...api.SKIN_DEFAULTS, ink: c.darkInk ? '#26282d' : '#fbf1c7', image: imageUrl, ground: '#16261e', chrome: .74 })
            await api.loadPictureBackdrop(imageUrl)
          }
          if (c.native) api.setLookMode('sunset')
          const styles = document.getElementById('zephyr-actual-css') || document.createElement('style')
          styles.id = 'zephyr-actual-css'
          // This is the plugin's generated sky / appearance CSS. The transcript
          // below uses faithful available slots, not Hermes' private DOM.
          styles.textContent = c.native ? '' : api.skyStyleFor(date, Boolean(c.weather), { backdrop: true, chrome: true })
          document.head.appendChild(styles)
          let snippets = document.getElementById('zephyr-snippet-css')
          if (!snippets) { snippets = document.createElement('style'); snippets.id = 'zephyr-snippet-css'; document.head.appendChild(snippets) }
          snippets.textContent = api.SNIPPET_CSS
          let samples, sky = null
          if (c.native) {
            const host = api.replyHostGround()
            samples = host.samples
          } else if (c.weather) {
            sky = api.createSky({ quality: 'balanced', lat: 43.6532, lng: -79.3832 })
            if (!sky) throw new Error('WebGL unavailable')
            sky.setHold(date)
            sky.setWeather(api.WEATHER_PRESETS[c.weather], 0, true)
            sky.setAurora(Boolean(c.aurora))
            sky.setFps(30)
            sky.setBlur(5, 0)
            sky.start()
            await new Promise(resolve => setTimeout(resolve, 250))
            sky.stop()
            const gl = sky.canvas.querySelector('canvas').getContext('webgl')
            const debug = gl.getExtension('WEBGL_debug_renderer_info')
            window.__renderer = debug ? gl.getParameter(debug.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER)
            const host = api.replyHostGround()
            const sampleStart = performance.now()
            samples = sky.backdrop(host.bounds)
            window.__sampleMs = performance.now() - sampleStart
            window.__sky = sky
          } else {
            const sampleStart = performance.now()
            samples = c.fallback ? api.replyCssSky(api.skyAt(date)) : api.pictureBackdrop()
            window.__sampleMs = performance.now() - sampleStart
          }
          if (!Array.isArray(samples) || samples.length < 1 || samples.some(rgb => rgb.length !== 3 || rgb.some(v => !Number.isFinite(v) || v < 0 || v > 255))) {
            throw new Error(`Invalid backdrop samples for ${c.name}: ${JSON.stringify(samples)}`)
          }
          const tint = c.look === 'gruvbox' ? api.gruvboxMaterial().tint : api.zephyrMaterial(api.skyAt(date)).tint
          const ink = c.native ? api.replyHostGround().ink : c.look === 'gruvbox' ? c.ink : [255,255,255]
          const materialStart = performance.now()
          const material = api.replyMaterial(ink, tint, samples)
          window.__materialMs = performance.now() - materialStart
          const mean = samples.reduce((acc, rgb) => acc.map((v, i) => v + rgb[i] / samples.length), [0,0,0])
          const meanContrast = api.replyMaterial(ink, tint, [mean]).before
          document.getElementById('reply-ground-style')?.remove()
          const s = document.createElement('style'); s.id = 'reply-ground-style'; s.textContent = api.replyGroundCss(material)
          document.head.appendChild(s)
          window.__material = { ...material, samples, ink, tint, phase: api.phaseAt(date), mean, meanContrast, sampleMs: window.__sampleMs, materialMs: window.__materialMs, renderer: window.__renderer || 'CSS-only' }
        }, { c })
        const material = await page.evaluate(() => window.__material)
        const base = `${viewport.label}-${c.name}`
        const onPath = path.join(out, `${base}-on.png`)
        await page.waitForTimeout(400)
        await page.evaluate(() => document.fonts.ready)
        await page.evaluate(() => window.scrollTo(0, 0))
        const rectOn = await page.evaluate(() => {
          const r = document.querySelector("[data-slot='aui_assistant-message-content']").getBoundingClientRect()
          return { left: r.left, top: r.top, width: r.width, height: r.height }
        })
        const replyOn = await page.screenshot({ path: onPath, fullPage: true, animations: 'disabled' })
        await page.evaluate(() => {
          document.getElementById('reply-ground-style')?.remove()
          window.__sky?.stop()
        })
        await page.waitForTimeout(400)
        const offPath = path.join(out, `${base}-off.png`)
        await page.evaluate(() => window.scrollTo(0, 0))
        const rectOff = await page.evaluate(() => {
          const r = document.querySelector("[data-slot='aui_assistant-message-content']").getBoundingClientRect()
          return { left: r.left, top: r.top, width: r.width, height: r.height }
        })
        const replyOff = await page.screenshot({ path: offPath, fullPage: true, animations: 'disabled' })
        const diff = pixelDiff(replyOn, replyOff, rectOn, rectOff)
        await page.evaluate(() => { window.__sky?.dispose(); window.__sky = null })
        const mean = material.mean
        const meanContrast = material.meanContrast
        const nightTarget = c.look === 'sunset' && material.phase === 'night'
        rows.push({ viewport: viewport.label, case: c.name, material, mean, meanContrast, pixelDiff: diff, nightNoOp: nightTarget ? diff.identical : undefined, on: path.relative(root, onPath), off: path.relative(root, offPath) })
        fs.writeFileSync(path.join(out, 'report.json'), JSON.stringify({ note: 'Synthetic Hermes-shaped DOM. It exercises plugin CSS and selectors, not Hermes actual DOM or app chrome.', cases: rows }, null, 2))
        console.log(`${viewport.label} ${c.name}: phase=${material.phase} alpha=${material.alpha} contrast=${material.before.toFixed(2)}→${material.after.toFixed(2)} mean=${mean.map(v => v.toFixed(1)).join(',')}/${meanContrast.toFixed(2)} sample=${material.sampleMs?.toFixed(2)}ms material=${material.materialMs.toFixed(3)}ms pixelΔ=${diff.changedChannels}`)
      }
    }
    const timings = rows.map(row => row.material.sampleMs).filter(Number.isFinite).sort((a, b) => a - b)
    const timing = { medianMs: timings[Math.floor(timings.length / 2)], p95Ms: timings[Math.floor((timings.length - 1) * 0.95)], maxMs: timings.at(-1) }
    const summary = {
      generatedAt: new Date().toISOString(),
      browser: await browser.version(),
      renderer: [...new Set(rows.map(row => row.material.renderer))],
      note: 'Synthetic Hermes-shaped DOM: real Zephyr CSS/material and sky/picture sampling, but not Hermes actual DOM or app chrome.',
      warmup: 'One unrecorded Sky clear/noon setup precedes measured cases; its screenshot and timings are excluded.',
      costMeasurement: 'sampleMs times one retained-frame backdrop readback at the existing refresh, not a per-frame loop. No same-FPS throughput comparison was made.',
      timing,
      cases: rows.map(row => ({ viewport: row.viewport, case: row.case, phase: row.material.phase, alpha: row.material.alpha, before: row.material.before, after: row.material.after, meanRGB: row.mean.map(v => Math.round(v * 10) / 10), meanContrast: row.meanContrast, pixelDiff: row.pixelDiff, nightNoOp: row.nightNoOp, sampleMs: row.material.sampleMs, materialMs: row.material.materialMs, renderer: row.material.renderer }))
    }
    fs.writeFileSync(path.join(out, 'report.json'), JSON.stringify({ ...summary, cases: rows }, null, 2))
    fs.writeFileSync(path.join(root, 'docs/benchmarks/reply-legibility.json'), JSON.stringify(summary, null, 2) + '\n')
    console.log(JSON.stringify(rows.map(({ viewport, case: name, material, nightNoOp }) => ({ viewport, case: name, alpha: material?.alpha, before: material?.before, after: material?.after, nightNoOp })), null, 2))
    console.log(`GPU backdrop readback: median ${timing.medianMs.toFixed(2)} ms, p95 ${timing.p95Ms.toFixed(2)} ms, max ${timing.maxMs.toFixed(2)} ms`)
  } finally { await browser.close() }
}

launch().catch(error => { console.error(error); process.exitCode = 1 })
