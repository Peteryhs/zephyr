import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, writeFileSync, rmSync } from 'node:fs'
import { createHash } from 'node:crypto'

process.env.TZ = 'UTC'
// The override lets the same regression tests run against an untouched base file.
const source = readFileSync(process.env.ZEPHYR_TEST_SOURCE || new URL('../plugin.js', import.meta.url), 'utf8')
const probe = new URL('./.tmp-gruvbox-tint-probe.mjs', import.meta.url)
writeFileSync(probe, source + '\nexport { skyStyleFor, setLookMode, setSkin, setGlass, SKIN_DEFAULTS, glassSkin, glassGrounds, glassLayers, GRUVBOX_GROUNDS };')
let mod
try { mod = await import(probe.href) } finally { rmSync(probe, { force: true }) }
const harness = readFileSync(new URL('./motion.test.mjs', import.meta.url), 'utf8')
const a = harness.indexOf('const makeElement ='), b = harness.indexOf('let importError', a)
const c = harness.indexOf('const runRegister ='), d = harness.indexOf('const runDefault =', c)
const domSource = harness.slice(a, b).replace('innerWidth: 1512,', 'innerWidth: 1512, screenX: 0, screenY: 0, screen: { left: 0, top: 0, width: 1512, height: 945 },').replace('hidden: false,', 'hidden: false, hasFocus: () => true,')
  .replace('createElement: tag => makeElement(tag, head, body),', `createElement: tag => {
    const el = makeElement(tag, head, body)
    if (tag === 'canvas') {
      el.toDataURL = () => 'data:image/jpeg;base64,baked'
      const context = el.getContext('2d')
      context.getImageData = () => ({ data: new Uint8Array([40, 120, 200, 255]) })
      el.getContext = () => context
    }
    return el
  },`)
const register = new Function('plugin', `${domSource}; const importError = null; ${harness.slice(c, d)}; return runRegister`)(mod.default)
globalThis.fetch = async () => ({ ok: false })
globalThis.setInterval = globalThis.setTimeout = () => 1
globalThis.clearInterval = globalThis.clearTimeout = () => {}
const walk = node => {
  if (!node) return []
  if (Array.isArray(node)) return node.flatMap(walk)
  if (typeof node !== 'object') return []
  if (['GruvboxTintEditor', 'GlassEditor'].includes(node.type?.name)) return walk(node.type(node.props))
  return [node, ...walk(node.props?.children), ...walk(node.props?.action)]
}
const setup = storage => {
  const run = register(storage)
  assert.ifError(run.error)
  return { ...run, nodes: () => walk(run.pages[0].render()) }
}
const byLabel = (run, label) => run.nodes().find(n => n.props?.['aria-label'] === label)
const changeTint = (run, value) => {
  const slider = byLabel(run, 'Gruvbox tint')
  assert.ok(slider, 'Gruvbox exposes its one tint control')
  slider.props.onChange({ target: { value: String(value) } })
}
const css = run => run.dom.head.get('zephyr-sky-style')?.textContent || ''
const theme = run => run.registered.filter(c => c.id === 'theme.sky').at(-1).data.colors
const cssSet = () => [false, true].flatMap(gl => [false, true].flatMap(backdrop => [false, true].map(chrome => mod.skyStyleFor(new Date('2026-10-15T16:00:00Z'), gl, { backdrop, chrome }))))
// SHA-256 of all eight CSS outputs, captured from cd14ca8 before editing.
const cssHash = () => createHash('sha256').update(JSON.stringify(cssSet())).digest('hex')
const OPAQUE_HASH = 'abb1aa815f98a31f0ed8c0e82f4ea135785b19a21197de0f2e71573815357698'
// The legacy body layers, host tokens and skin remain identical after migration.
const legacyHash = () => createHash('sha256').update(JSON.stringify([mod.glassLayers(), mod.glassGrounds(), mod.glassSkin()])).digest('hex')
const GLASS_HASH = 'dbec21d46c0162553d381db721f85aafea6b746259a1ee00931349afe8e773f0'
const CUSTOM_GLASS_HASH = '5c484a843d79e2e844bb71e11f2efdc18f1d9adbddde7fe0eccaf0964cd7e5a8'

test('Gruvbox tint=0 restores byte-for-byte cd14ca8 Gruvbox CSS', () => {
  const storage = { look: 'gruvbox', glass: { ground: '#123456', tint: 0.7 } }
  const run = setup(storage)
  try {
    assert.equal(byLabel(run, 'Gruvbox tint')?.props.value, 0)
    mod.setLookMode('gruvbox'); mod.setSkin(mod.SKIN_DEFAULTS)
    assert.equal(cssHash(), OPAQUE_HASH)
    changeTint(run, 0.25)
    assert.match(css(run), /html:root body \{ background: rgba\(40, 40, 40, 0.75\)/)
    changeTint(run, 0)
    assert.equal(storage.gruvboxTint.tint, 0)
    assert.equal(cssHash(), OPAQUE_HASH)
    assert.deepEqual(theme(run), mod.GRUVBOX_GROUNDS)
    assert.doesNotMatch(css(run), /--zf-glass-a:/)
  } finally { run.dispose() }
})

test('stored Glass migrates once to Gruvbox preserving palette, opacity and wallpaper', () => {
  for (const palette of [undefined, { ground: '#102030', ink: '#eeddbb', ink2: '#ccbbaa', accent: '#eebbaa', tint: 0.83, thumb: 'data:image/png;base64,old' }]) {
    const storage = { look: 'glass', glass: palette, glassBackdrop: 'data:image/jpeg;base64,wallpaper' }
    let run = setup(storage)
    try {
      assert.equal(storage.look, 'gruvbox')
      assert.equal(storage.gruvboxTint.tint, palette ? 0.17 : 0.08)
      assert.equal(storage.gruvboxTint.ground, palette?.ground || '#1f0b06')
      assert.equal(storage.gruvboxTint.ink, palette?.ink || '#edd1b3')
      assert.equal(storage.gruvboxTint.thumb, palette?.thumb || '')
      assert.equal(storage.glassBackdrop, 'data:image/jpeg;base64,wallpaper')
      assert.ok(run.dom.head.has('zephyr-glass-backdrop'))
      assert.equal(run.dom.documentElement.hasAttribute('data-zf-backdrop'), true)
      assert.equal(legacyHash(), palette ? CUSTOM_GLASS_HASH : GLASS_HASH)
      assert.deepEqual(theme(run), mod.glassGrounds())
      const saved = structuredClone(storage.gruvboxTint)
      run.dispose()
      run = setup(storage)
      assert.deepEqual(storage.gruvboxTint, saved, 'restart must not invert transparency again')
      changeTint(run, 0)
      assert.equal(run.dom.head.has('zephyr-glass-backdrop'), false)
      assert.equal(run.dom.documentElement.hasAttribute('data-zf-backdrop'), false)
      assert.equal(cssHash(), OPAQUE_HASH)
      changeTint(run, saved.tint)
      assert.ok(run.dom.head.has('zephyr-glass-backdrop'))
      assert.equal(legacyHash(), palette ? CUSTOM_GLASS_HASH : GLASS_HASH)
    } finally { run.dispose() }
  }
})

test('positive Gruvbox tint uses flat Glass chrome and a solid native-glass fallback', () => {
  const run = setup({ look: 'gruvbox' })
  try {
    changeTint(run, 0.92)
    const sheet = css(run)
    assert.match(sheet, /html, html:root \{ background: transparent/)
    assert.match(sheet, /html:root body \{ background: rgba\(40, 40, 40, 0.08\)/)
    assert.match(sheet, /html:root:not\(\[data-hermes-glass-on\]\) body \{ background: #282828/)
    assert.match(sheet, /html::before, body::before \{ content: none/)
    assert.match(sheet, /--zf-side-card: rgba\(235, 219, 178, 0.035\)/)
    assert.match(sheet, /--zf-side-card-hi: rgba\(235, 219, 178, 0.07\)/)
    assert.match(sheet, /--zf-lift: none/)
    assert.match(sheet, /--zf-lift-high: none !important; --zf-lift-float: none !important; --zf-frost: none !important;/)
    assert.doesNotMatch(sheet, /backdrop-filter: blur\(/)
    assert.doesNotMatch(sheet, /background: linear-gradient\(var\(--zf-m-(comp|bub)/)
    assert.ok(sheet.lastIndexOf('scrollbar-color: rgba(235, 219, 178, 0.16)') > sheet.lastIndexOf('scrollbar-color: rgba(255, 255, 255, 0.14)'))
    assert.match(sheet, /backdrop-filter: none !important; -webkit-backdrop-filter: none !important/)
    assert.match(sheet, /text-shadow: none !important/)
    assert.match(sheet, /::selection \{ background: rgba\(254, 128, 25, 0.38\)/)
    assert.match(sheet, /scrollbar-color: rgba\(235, 219, 178, 0.16\)/)
    assert.match(sheet, /session running/)
  } finally { run.dispose() }
})

test('one Gruvbox tint control persists independently of other looks and clamps invalid input', () => {
  const storage = { look: 'gruvbox' }
  let run = setup(storage)
  try {
    assert.equal(run.nodes().filter(n => n.props?.['aria-label'] === 'Gruvbox tint').length, 1)
    assert.equal(byLabel(run, 'Glass'), undefined)
    const slider = byLabel(run, 'Gruvbox tint').props
    assert.deepEqual([slider.min, slider.max, slider.step], [0, 0.92, 0.01])
    assert.ok(run.nodes().some(n => n.props?.title === 'Your wallpaper'))
    changeTint(run, 0.31)
    byLabel(run, 'Sky').props.onClick()
    assert.equal(byLabel(run, 'Gruvbox tint'), undefined)
    assert.doesNotMatch(css(run), /--zf-glass-a:/)
    byLabel(run, 'Custom').props.onClick()
    assert.doesNotMatch(css(run), /--zf-glass-a:/)
    byLabel(run, 'Gruvbox').props.onClick()
    assert.equal(byLabel(run, 'Gruvbox tint').props.value, 0.31)
    run.dispose()
    run = setup(storage)
    assert.equal(byLabel(run, 'Gruvbox tint').props.value, 0.31)
    changeTint(run, 4)
    assert.equal(storage.gruvboxTint.tint, 0.92)
    changeTint(run, -1)
    assert.equal(storage.gruvboxTint.tint, 0)
    changeTint(run, 'invalid')
    assert.equal(storage.gruvboxTint.tint, 0)
  } finally { run.dispose() }
})

test('Gruvbox keeps narrow Arc early-outs, opaque overlays and reduced-motion rules', () => {
  const sync = source.slice(source.lastIndexOf('const sync ='), source.indexOf('const onToggleClick =', source.lastIndexOf('const sync =')))
  assert.match(sync, /if \(window.innerWidth < 640\)/)
  assert.match(source, /if \(!alive\(\) \|\| !event.isTrusted \|\| window.innerWidth < 640\) return/)
  const run = setup({ look: 'gruvbox' })
  try {
    changeTint(run, 0.25)
    assert.match(css(run), /@media \(prefers-reduced-motion: reduce\)/)
    assert.match(css(run), /\[data-narrow-overlay\]/)
    assert.ok(css(run).includes('html:root body [data-narrow-overlay] { background: var(--zf-m-solid, var(--ui-bg-chrome)) !important;'))
    assert.ok(css(run).includes("html[data-zf-arc-ready='1'] body div.fixed[data-zf-sbbtn] button { pointer-events: auto !important; }"))
  } finally { run.dispose() }
})


test('legacy Glass migration keeps old defaults and clamps old opacity before inversion', () => {
  for (const [palette, tint] of [
    [{ tint: 4 }, 0.03], [{ tint: -1 }, 0.6], [{ tint: 'invalid' }, 0.08],
    [{ ground: 'invalid', ink: '#fff', accent: ';bad', tint: 0.9 }, 0.1]
  ]) {
    const storage = { look: 'glass', glass: palette }
    const run = setup(storage)
    try {
      assert.equal(storage.gruvboxTint.tint, tint)
      assert.equal(storage.gruvboxTint.ground, '#1f0b06')
      assert.equal(storage.gruvboxTint.accent, '#e2704a')
      assert.equal(storage.gruvboxTint.ink, palette.ink || '#edd1b3')
    } finally { run.dispose() }
  }
})


test('wallpaper matching shares the Gruvbox panel and preserves an active tint', () => {
  const storage = { look: 'gruvbox' }
  const run = setup(storage)
  const previousImage = globalThis.Image
  globalThis.Image = class {
    naturalWidth = 1920
    naturalHeight = 1080
    set src(value) { this.onload() }
  }
  try {
    const choose = () => {
      const picker = run.nodes().find(n => n.type === 'input' && n.props?.type === 'file')
      assert.ok(picker)
      picker.props.onChange({ target: { files: [new Blob(['wallpaper'], { type: 'image/png' })], value: 'wallpaper.png' } })
    }
    choose()
    assert.equal(storage.look, 'gruvbox')
    assert.equal(storage.gruvboxTint.tint, 0.08)
    assert.notEqual(storage.gruvboxTint.ground, '#282828')
    assert.equal(storage.glassBackdrop, 'data:image/jpeg;base64,baked')
    changeTint(run, 0.31)
    choose()
    assert.equal(storage.gruvboxTint.tint, 0.31)
    run.nodes().find(n => n.props?.children === 'Reset').props.onClick()
    assert.equal(storage.gruvboxTint.tint, 0)
    assert.equal(storage.glassBackdrop, '')
    assert.equal(cssHash(), OPAQUE_HASH)
  } finally { globalThis.Image = previousImage; run.dispose() }
})
