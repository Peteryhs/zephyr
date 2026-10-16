/* Rigs the wired plugin's sky engine against a mock WebGL context.

   What this proves (presence, not looks): the independent engine lands in the
   plugin and runs, createSky compiles both shaders, resolves every uniform,
   binds the LUT texel and issues a draw; a weather pick reaches the uniforms
   (rain reaches uPrecip); a renderer without WebGL returns null so the painted
   fallback takes over; dispose leaves no DOM behind.

   Run: node tests/sky-rig.mjs   (from the repository root) */
import { readFileSync, writeFileSync, rmSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, '..')

process.on('unhandledRejection', () => {})   // the plugin's weather fetch is live network

let fails = 0
const ok = (cond, msg) => { console.log((cond ? '  ok   ' : '  FAIL ') + msg); if (!cond) fails++ }

/* ── a WebGL stub that records what the engine asks of it ────────────────── */
const calls = { shaders: [], texels: 0, draws: 0, uniforms: [], unknown: [], errorCalls: [] }
/* the driver's answer for a vertex attribute depends on the shader text, so
   the mock answers the same way: a name the vertex shader never declares
   resolves to -1, which is how a renamed attribute blacks the sky out */
const shaderText = new WeakMap()
const programShaders = new Map()
const glConst = {
  VERTEX_SHADER: 1, FRAGMENT_SHADER: 2, COMPILE_STATUS: 3, LINK_STATUS: 4, ARRAY_BUFFER: 5,
  STATIC_DRAW: 6, FLOAT: 7, RGBA: 8, UNSIGNED_BYTE: 9, TEXTURE_2D: 10, TEXTURE0: 11, RGB: 12,
  TEXTURE_MIN_FILTER: 13, TEXTURE_MAG_FILTER: 14, NEAREST: 15, TEXTURE_WRAP_S: 16,
  TEXTURE_WRAP_T: 17, CLAMP_TO_EDGE: 18, TRIANGLES: 19,
}
let uniformNames = new Set()
/* every method the plugin may ask for is answered: the ones above record,
   anything newer falls through to a no-op (and an unknown constant to 1) */
const makeGl = () => new Proxy(Object.assign({}, glConst, {
  checkFramebufferStatus: () => 36053,   // FRAMEBUFFER_COMPLETE
  getParameter: () => 'WebGL 1.0 (rig)',
  createShader: () => ({}),
  shaderSource: (_s, src) => { shaderText.set(_s, src); calls.shaders.push(src.length) },
  compileShader: () => {},
  getShaderParameter: () => true,
  getShaderInfoLog: () => '',
  createProgram: () => { const p = {}; programShaders.set(p, []); return p },
  attachShader: (p, s) => { (programShaders.get(p) || []).push(s) },
  linkProgram: () => {},
  getProgramParameter: () => true,
  getProgramInfoLog: () => '',
  useProgram: () => {},
  getUniformLocation: (_p, name) => {
    if (uniformNames.size && !uniformNames.has(name)) calls.unknown.push(name)
    return { name }
  },
  uniform1f: (l, v) => calls.uniforms.push([l.name, v]),
  uniform1i: (l, v) => calls.uniforms.push([l.name, v]),
  uniform2f: (l, a, b) => calls.uniforms.push([l.name, a, b]),
  uniform3f: (l, a, b, c) => calls.uniforms.push([l.name, a, b, c]),
  uniform4f: (l, a, b, c, d) => calls.uniforms.push([l.name, a, b, c, d]),
  createTexture: () => ({}),
  activeTexture: () => {},
  bindTexture: () => {},
  texImage2D: () => { calls.texels++ },
  texParameteri: () => {},
  createBuffer: () => ({}),
  bindBuffer: () => {},
  bufferData: () => {},
  getAttribLocation: (p, name) => (programShaders.get(p) || []).some(s =>
    new RegExp('attribute\\s+\\w+\\s+' + name + '\\b').test(shaderText.get(s) || '')) ? 0 : -1,
  enableVertexAttribArray: () => {},
  vertexAttribPointer: () => {},
  viewport: () => {},
  drawArrays: () => { calls.draws++ },
  readPixels: (_x, _y, _w, _h, _f, _t, out) => out && out.set([0, 0, 0, 255]),
  getError: () => 0,
  getExtension: () => null,
  deleteBuffer: () => {}, deleteTexture: () => {}, deleteProgram: () => {},
}), {
  get(target, prop) {
    if (prop in target) return target[prop]
    if (typeof prop === 'string' && /^[A-Z][A-Z0-9_]*$/.test(prop)) return 1
    return () => {}
  },
})

/* ── enough DOM for the sky engines ─────────────────────────────────────── */
let webglAvailable = true
const head = new Map()
const body = new Map()
const makeElement = tag => {
  const el = {
    tagName: tag, id: '', className: '', textContent: '', children: [],
    style: {}, attrs: {},
    canvas: tag === 'canvas',
    width: 0, height: 0,
    setAttribute(k, v) { this.attrs[k] = v },
    getAttribute(k) { return this.attrs[k] },
    appendChild(c) { this.children.push(c); return c },
    append(...cs) { for (const c of cs) this.children.push(c) },
    remove() { if (this.id) { head.delete(this.id); body.delete(this.id) } },
    querySelector: () => null,
    addEventListener: () => {},
    getContext(kind) {
      if (kind !== 'webgl' && kind !== 'experimental-webgl') return { drawImage: () => {}, clearRect: () => {}, getImageData: () => ({ data: [] }), putImageData: () => {} }
      return webglAvailable ? makeGl() : null
    },
  }
  return el
}
globalThis.document = {
  hidden: false,
  documentElement: { style: { setProperty: () => {}, removeProperty: () => {} } },
  createElement: tag => makeElement(tag),
  getElementById: id => head.get(id) || body.get(id) || null,
  querySelector: () => null,
  addEventListener: () => {},
  removeEventListener: () => {},
  head: { appendChild: el => { head.set(el.id, el) } },
  body: { appendChild: el => { if (el.id) body.set(el.id, el) } },
}
/* the sky loop is a plain timer (not rAF) and reads performance.now(), so the
   rig captures the pending callback and moves the clock itself */
let fakeNow = 1000
let timerSeq = 0
const timers = new Map()
globalThis.performance = { now: () => fakeNow }
globalThis.setTimeout = fn => { const id = ++timerSeq; timers.set(id, fn); return id }
globalThis.clearTimeout = id => { timers.delete(id) }
globalThis.setInterval = () => 0
globalThis.clearInterval = () => {}
const rafQueue = []
globalThis.window = {
  innerWidth: 1512, innerHeight: 945, devicePixelRatio: 2,
  matchMedia: () => ({ matches: false, addEventListener: () => {} }),
  addEventListener: () => {}, removeEventListener: () => {},
  requestAnimationFrame: fn => { rafQueue.push(fn); return rafQueue.length },
  cancelAnimationFrame: () => {},
  getComputedStyle: () => ({ getPropertyValue: () => '' }),
}
globalThis.matchMedia = globalThis.window.matchMedia
globalThis.requestAnimationFrame = globalThis.window.requestAnimationFrame
globalThis.cancelAnimationFrame = globalThis.window.cancelAnimationFrame
globalThis.addEventListener = () => {}
globalThis.removeEventListener = () => {}

/* ── import the wired plugin, with a probe appended so the sky engines are
      reachable (the plugin's public surface is the register() contract) ─── */
const source = readFileSync(join(root, 'plugin.js'), 'utf8')
if (!source.includes('SKY ENGINE')) { console.error('plugin.js is not wired'); process.exit(1) }
const tmp = join(here, '.tmp-sky-probe.mjs')
writeFileSync(tmp, source + `\nglobalThis.__skyProbe = { createSky, SKY_ENGINE, QUALITY, WEATHER_PRESETS, weatherFromLive }\n`)

let loadError = null
try {
  await import('./.tmp-sky-probe.mjs')
} catch (error) {
  loadError = error
}
ok(!loadError, 'the wired plugin module loads' + (loadError ? ': ' + loadError.message : ''))
if (loadError) { console.log(loadError.stack); /* ── 6. the settings page renders, and the blue dial is on it ────────────
   (rows are gated on a available sky, so WebGL goes back on first) */
webglAvailable = true
const registered = []
const pages = []
const storage = {}
const ctx = {
  storage: { get: (k, f) => (k in storage ? storage[k] : f), set: (k, v) => { storage[k] = v } },
  register: c => registered.push(c),
  registerSettingsPage: p => pages.push(p),
  onDispose: () => {},
}
const mod = await import('./.tmp-sky-probe.mjs')
ok(mod.default && mod.default.id === 'zephyr', 'the plugin still exports its default')
mod.default.register(ctx)
ok(registered.length >= 3, 'the plugin registers its contributions (' + registered.length + ')')
ok(pages.length === 1, 'the settings page registers')

const walk = (node, out = []) => {
  if (!node || typeof node !== 'object') return out
  if (Array.isArray(node)) { for (const child of node) walk(child, out); return out }
  out.push(node)
  if (node.props) { walk(node.props.children, out); walk(node.props.action, out) }
  return out
}
const settingsPage = pages[0]

let rendered = null
let renderError = null
try { rendered = settingsPage.render() } catch (err) { renderError = err }
ok(!renderError, 'the settings page renders without throwing' + (renderError ? ': ' + renderError.message : ''))

const inputs = rendered ? walk(rendered).filter(n => n.type === 'input' && n.props?.type === 'range') : []
const dialInput = inputs.find(n => n.props['aria-label'] === 'Sky blue')
ok(!dialInput, 'the blue dial is gone from the settings page (the value is baked)')
ok(!('skyLift' in storage), 'and nothing writes a lift setting any more')
const rows = walk(rendered).filter(n => typeof n.props?.title === 'string')
/* the weather/smoothness/preview rows only render under a live sky, and
   section 4 latched glFailed, so three is the honest count here */
ok(rows.length >= 3, 'the rest of the rows are still there (' + rows.length + ')')

rmSync(tmp, { force: true }); process.exit(1) }

const probe = globalThis.__skyProbe
ok(!!probe && typeof probe.createSky === 'function', 'the sky engines are reachable')
const { createSky, SKY_ENGINE, QUALITY, WEATHER_PRESETS } = probe
uniformNames = new Set(SKY_ENGINE.UNIFORM_NAMES.concat([
  'uFieldOrg', 'uFieldSize', 'uFieldRes', 'uFieldA', 'uFieldB',
  'uFieldBoxA', 'uFieldBoxB', 'uFieldMix', 'uTex', 'uStep', 'uDim',
]))

/* ── 1. the engine is intact and the scene defaults are sane ─── */
ok(typeof SKY_ENGINE.FRAG === 'string' && SKY_ENGINE.FRAG.length > 5000, 'the fragment shader is present (' + SKY_ENGINE.FRAG.length + ' chars)')
ok(SKY_ENGINE.UNIFORM_NAMES.length === 48, 'the uniform list is complete (' + SKY_ENGINE.UNIFORM_NAMES.length + ')')
SKY_ENGINE.applyScene({ hourly: false, hour: 12 })
const noon = SKY_ENGINE.frameAt()
ok(noon.cols[0][2] > noon.cols[0][0], 'noon zenith is blue inside the plugin (b > r)')

/* ── 2. the WebGL engine: build, draw, weather, blur, dispose ───────────── */
let sky = createSky({ quality: 'balanced', lat: 43.65, lng: -79.38, onError: e => console.log('  [engine]', e) })
ok(!!sky, 'createSky returns an engine when WebGL is present')
ok(['start', 'dispose', 'setWeather', 'setWind', 'setLocation', 'setClock', 'setFps', 'setBlur'].every(k => typeof sky[k] === 'function'), 'it answers the painted engine\'s whole API')
ok(calls.shaders.filter(n => n > 5000).length === 2, 'both sky fragment variants were sourced (' + calls.shaders.join(',') + ' chars)')
ok(calls.texels >= 1, 'the LUT placeholder texel was uploaded')
ok(calls.draws >= 1, 'the boot frame drew (' + calls.draws + ' draws: field snapshots + sky)')
ok(calls.unknown.length === 0, 'no unknown uniform was requested' + (calls.unknown.length ? ': ' + calls.unknown.join(', ') : ''))
ok(globalThis.document.getElementById('zephyr-gl-sky') !== null, 'the sky root is mounted')

/* a frame through the loop, after a storm pick: rain reaches the shader */
calls.draws = 0
calls.uniforms.length = 0
sky.start()
sky.setWeather(WEATHER_PRESETS.storm, 0, true)
const step = t => { fakeNow = t; const due = [...timers.values()]; timers.clear(); for (const fn of due) fn() }
ok(timers.size > 0, 'the loop scheduled a frame (' + timers.size + ' pending)')
step(1000 + 40)
ok(calls.draws >= 2, 'a loop frame drew (' + calls.draws + ' draws)')
const uni = Object.fromEntries(calls.uniforms.map(u => [u[0], u.slice(1)]))
ok(uni.uPrecip && uni.uPrecip[0] > 0.05, 'the storm pick reaches the shader as rain (uPrecip.x = ' + (uni.uPrecip ? uni.uPrecip[0] : '?') + ')')
ok(uni.uDeck && uni.uDeck[0] > 0.05, 'and as a cloud lid (uDeck = ' + (uni.uDeck ? uni.uDeck[0].toFixed(2) : '?') + ')')
const bad = calls.uniforms.filter(u => u.slice(1).some(v => typeof v === 'number' && !Number.isFinite(v)))
ok(bad.length === 0, 'no NaN reaches a uniform' + (bad.length ? ' — ' + JSON.stringify(bad.slice(0, 3)) : ''))
ok(uni.uRes && uni.uDet && uni.uTime, 'the frame uploads resolution, detail unit and time')
const drawsBeforeBlur = calls.draws
sky.setBlur(8)
step(1200)          // the blur eases over BLUR_FADE_MS in the loop
const canvasEl = globalThis.document.getElementById('zephyr-gl-sky').children[0]
ok(calls.draws > drawsBeforeBlur, 'the blur runs as WebGL passes (' + (calls.draws - drawsBeforeBlur) + ' draws)')
ok(!canvasEl.style.filter, 'and no CSS filter is put on the canvas any more')

/* a high cirrus veil is not a lid: the live Toronto payload of 2026-10-10 was
   100% HIGH cloud and 0% low, which must keep a blue sky and a veil, not a lid */
calls.uniforms.length = 0
sky.setWeather({ ci: 0.9, cc: 0.3, cs: 0.6, haze: 0.17 }, 0, true)
step(2000)
const uniVeil = Object.fromEntries(calls.uniforms.map(u => [u[0], u.slice(1)]))
ok(uniVeil.uDeck && uniVeil.uDeck[0] < 0.4, 'a high-only veil does not close the lid (uDeck = ' + (uniVeil.uDeck ? uniVeil.uDeck[0].toFixed(2) : '?') + ')')
ok(uniVeil.uPuff && uniVeil.uPuff[0] > 0.3, 'and it does show as a veil (uPuff = ' + (uniVeil.uPuff ? uniVeil.uPuff[0].toFixed(2) : '?') + ')')
const veil = SKY_ENGINE.frameAt()
ok(veil.cols[0][2] - veil.cols[0][0] > 0.25, 'the veil zenith stays blue (chroma ' + (veil.cols[0][2] - veil.cols[0][0]).toFixed(3) + ')')
calls.uniforms.length = 0
sky.setWeather({ sc: 0.55, st: 0.9, as: 0.8 }, 0, true)
step(3000)
const uniLid = Object.fromEntries(calls.uniforms.map(u => [u[0], u.slice(1)]))
ok(uniLid.uDeck && uniLid.uDeck[0] > 0.5, 'a low overcast still closes the lid (uDeck = ' + (uniLid.uDeck ? uniLid.uDeck[0].toFixed(2) : '?') + ')')

/* the grade dial: 1 is Hark's own grade, above it is more chroma */
sky.setWeather({ ci: 0.9, cc: 0.3, cs: 0.6, haze: 0.17 }, 0, true)
sky.setLift({ saturation: 1 })            // a PARTIAL pick must not wipe the base
ok(SKY_ENGINE.LIFT_BASE.saturation === 1.6 && SKY_ENGINE.LIFT_BASE.exposure === 1.2, 'a partial setLift leaves the shipped base alone')
step(4000)
const flat = SKY_ENGINE.frameAt()
sky.setLift(SKY_ENGINE.LIFT_BASE)          // the shipped default pick
step(5000)
const lifted = SKY_ENGINE.frameAt()
const chroma = c => c[2] - c[0]
ok(chroma(lifted.cols[0]) > chroma(flat.cols[0]) + 0.05,
  'the blue dial lifts the zenith chroma (' + chroma(flat.cols[0]).toFixed(3) + ' -> ' + chroma(lifted.cols[0]).toFixed(3) + ')')
ok(Math.abs(SKY_ENGINE.GRADE_BASE.saturation - 1.38) < 0.001, 'the grade lift multiplies the base, not its own last value')
ok(SKY_ENGINE.LIFT_BASE.saturation === 1.6, 'the shipped blue is his pick (1.6)')
ok(SKY_ENGINE.SCENE.lift.saturation === 1.6, 'and the scene starts from it')
ok(chroma(lifted.cols[0]) > 0.5, 'the shipped blue keeps a strongly blue zenith (chroma ' + chroma(lifted.cols[0]).toFixed(3) + ')')

/* an engine that was never told a lift must still use the shipped dial: the
   first build pass used to send lift: null and flatten the sky to 1.0 */
{
  const fresh = createSky({ id: 'zephyr-gl-sky-probe', quality: 'balanced', lat: 43.65, lng: -79.38 })
  fresh.setWeather({ ci: 0.9, cc: 0.3, cs: 0.6, haze: 0.17 }, 0, true)
  const anyway = SKY_ENGINE.frameAt()
  ok(chroma(anyway.cols[0]) > 0.55, 'a fresh engine keeps the shipped blue without being told (chroma ' + chroma(anyway.cols[0]).toFixed(3) + ')')
  fresh.dispose()
}

/* ── 3. the clock and the location reach the scene ─────────────────────── */
calls.uniforms.length = 0
ok(typeof SKY_ENGINE.SCENE.tz === 'string' && SKY_ENGINE.SCENE.tz.includes('/'), 'the scene reads the zone from the machine (' + SKY_ENGINE.SCENE.tz + ')')
sky.setWeather(WEATHER_PRESETS.clear, 0, true)   // a clear sky, so the clock is what is measured
calls.uniforms.length = 0
sky.setClock(() => new Date(2026, 5, 21, 4, 30, 0))
step(6000)
const uni2 = Object.fromEntries(calls.uniforms.map(u => [u[0], u.slice(1)]))
const lum = c => 0.299 * c[0] + 0.587 * c[1] + 0.114 * c[2]
ok(uni2.uC0 && lum(uni2.uC0) < 0.25, 'a 04:30 clock gives a dark zenith (lum ' + (uni2.uC0 ? lum(uni2.uC0).toFixed(3) : '?') + ')')
sky.setClock(() => new Date(2026, 5, 21, 13, 0, 0))
step(7000)
const uni3 = Object.fromEntries(calls.uniforms.map(u => [u[0], u.slice(1)]))
ok(uni3.uC0 && uni3.uC0[2] > uni3.uC0[0], 'a 13:00 clock gives a blue zenith')
sky.setClock(null)

/* ── 4. no WebGL: null, so the CSS time-of-day gradient takes over ─────── */
webglAvailable = false
const dead = createSky({ quality: 'low' })
ok(dead === null, 'a renderer with no WebGL gets null from the shader engine')
ok(globalThis.document.getElementById('zephyr-gl-sky') !== null, 'the first engine is still mounted (no half-built root)')

/* ── 5. dispose leaves nothing behind ──────────────────────────────────── */
sky.dispose()
ok(globalThis.document.getElementById('zephyr-gl-sky') === null, 'dispose removes the sky root')
ok(globalThis.document.getElementById('zephyr-gl-sky-style') === null, 'dispose removes its style element')

/* ── 6. the settings page renders, and the blue dial is on it ────────────
   (rows are gated on a available sky, so WebGL goes back on first) */
webglAvailable = true
const registered = []
const pages = []
const storage = {}
const ctx = {
  storage: { get: (k, f) => (k in storage ? storage[k] : f), set: (k, v) => { storage[k] = v } },
  register: c => registered.push(c),
  registerSettingsPage: p => pages.push(p),
  onDispose: () => {},
}
const mod = await import('./.tmp-sky-probe.mjs')
ok(mod.default && mod.default.id === 'zephyr', 'the plugin still exports its default')
mod.default.register(ctx)
ok(registered.length >= 3, 'the plugin registers its contributions (' + registered.length + ')')
ok(pages.length === 1, 'the settings page registers')

const walk = (node, out = []) => {
  if (!node || typeof node !== 'object') return out
  if (Array.isArray(node)) { for (const child of node) walk(child, out); return out }
  out.push(node)
  if (node.props) { walk(node.props.children, out); walk(node.props.action, out) }
  return out
}
const settingsPage = pages[0]

let rendered = null
let renderError = null
try { rendered = settingsPage.render() } catch (err) { renderError = err }
ok(!renderError, 'the settings page renders without throwing' + (renderError ? ': ' + renderError.message : ''))

const inputs = rendered ? walk(rendered).filter(n => n.type === 'input' && n.props?.type === 'range') : []
const dialInput = inputs.find(n => n.props['aria-label'] === 'Sky blue')
ok(!dialInput, 'the blue dial is gone from the settings page (the value is baked)')
ok(!('skyLift' in storage), 'and nothing writes a lift setting any more')
const rows = walk(rendered).filter(n => typeof n.props?.title === 'string')
/* the weather/smoothness/preview rows only render under a live sky, and
   section 4 latched glFailed, so three is the honest count here */
ok(rows.length >= 3, 'the rest of the rows are still there (' + rows.length + ')')

rmSync(tmp, { force: true })
console.log(fails === 0 ? '\nALL PASS' : `\n${fails} FAILURES`)
process.exit(fails === 0 ? 0 : 1)
