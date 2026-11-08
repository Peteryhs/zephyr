// Reply material is a bounded contrast correction, emitted only on the
// assistant-content surface. Keep these checks about behavior and DOM scope.
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const src = readFileSync(new URL('../plugin.js', import.meta.url), 'utf8').replace(/\r\n/g, '\n')
const start = src.indexOf('// ── Reply legibility')
const end = src.indexOf('// The sky is INTERPOLATED', start)
assert.ok(start >= 0 && end > start, 'reply legibility section was not found')
const materialSource = src.slice(start, end)
const { REPLY_TARGET, replyLuminance, replyContrast, replyComposite, replyMaterial, replyGroundCss } =
  new Function('clamp01', 'ZF_INK', `${materialSource}; return { REPLY_TARGET, replyLuminance, replyContrast, replyComposite, replyMaterial, replyGroundCss }`)(
    x => Math.min(1, Math.max(0, x)), [9, 13, 22]
  )
const rgbStart = src.indexOf('const replyCssRgb =')
const rgbEnd = src.indexOf('const replyHostGround =', rgbStart)
assert.ok(rgbStart >= 0 && rgbEnd > rgbStart, 'native CSS color parser was not found')
const replyCssRgb = new Function('SKIN_HEX', 'hexRgb', `${src.slice(rgbStart, rgbEnd)}; return replyCssRgb`)(
  /^#[0-9a-f]{3}(?:[0-9a-f]{3})?$/i,
  hex => {
    const value = hex.slice(1)
    const full = value.length === 3 ? [...value].map(c => c + c).join('') : value
    return [0, 2, 4].map(i => parseInt(full.slice(i, i + 2), 16))
  }
)

test('night legibility is an exact no-op when the existing pair passes', () => {
  const samples = [[9, 13, 22], [15, 19, 29], [24, 28, 38]]
  const result = replyMaterial([250, 251, 253], [20, 21, 25], samples)
  assert.equal(result.alpha, 0)
  assert.equal(result.after, result.before)
  assert.equal(replyGroundCss(result), '')
})

test('native light and dark themes keep their existing passing text unchanged', () => {
  assert.equal(replyMaterial([24, 26, 30], [20, 21, 25], [[250, 250, 250]]).alpha, 0)
  assert.equal(replyMaterial([250, 251, 253], [20, 21, 25], [[18, 20, 24]]).alpha, 0)
  assert.ok(/const native = replyHostGround\(\)/.test(src), 'Hermes appearance samples the host instead of assuming Zephyr ink')
  assert.ok(/const ink = styled \? LOOK_MODE === 'gruvbox' \? hexRgb\(SKIN\.ink\) : \[255, 255, 255\] : native\.ink/.test(src), 'away and light themes use their current ink')
})

test('native CSS color parsing handles byte and unit sRGB syntax', () => {
  assert.deepEqual(replyCssRgb('rgb(24, 25, 26)'), [24, 25, 26])
  const unitSrgb = replyCssRgb('color(srgb 0.08 0.1 0.2)')
  assert.ok(unitSrgb.every((value, i) => Math.abs(value - [20.4, 25.5, 51][i]) < 1e-9))
})

test('bright backdrops get a positive wash that reaches the contrast target', () => {
  const samples = [[220, 226, 235], [245, 249, 255], [178, 194, 215]]
  const ink = [250, 251, 253]
  const result = replyMaterial(ink, [20, 21, 25], samples)
  assert.ok(result.alpha > 0 && result.alpha <= 1)
  assert.equal(REPLY_TARGET, 4.5)
  assert.ok(result.after >= REPLY_TARGET)
  assert.ok(result.after >= result.before)
  assert.equal(result.after, Math.min(...samples.map(rgb => replyContrast(ink, replyComposite(rgb, result.color, result.alpha)))))
})

test('dark ink selects a light wash when its dark backdrop needs help', () => {
  const ink = [12, 16, 20]
  const result = replyMaterial(ink, [20, 21, 25], [[5, 8, 12], [18, 19, 22]])
  assert.ok(result.alpha > 0)
  assert.ok(replyLuminance(result.color) > replyLuminance([20, 21, 25]))
  assert.ok(result.after >= REPLY_TARGET)
})

test('middle-gray ink keeps AA over mixed bright and dark backdrop samples', () => {
  const samples = [[0, 0, 0], [255, 255, 255]]
  for (const channel of [119, 120, 121]) {
    const ink = [channel, channel, channel]
    const result = replyMaterial(ink, [20, 21, 25], samples)
    assert.ok(result.alpha > 0 && result.alpha <= 1)
    assert.ok(result.after >= REPLY_TARGET, `channel ${channel} reaches AA at the limiting sample`)
    assert.ok(result.after >= result.before, `channel ${channel} does not lower the worst-sample contrast`)
    assert.ok(Math.min(...samples.map(rgb => replyContrast(ink, replyComposite(rgb, result.color, result.alpha)))) >= REPLY_TARGET)
  }
})

test('the correction stays bounded and changes continuously with backdrop light', () => {
  const alphas = []
  for (let v = 126; v <= 170; v += 2) {
    const result = replyMaterial([250, 251, 253], [20, 21, 25], [[v, v, v]])
    assert.ok(result.alpha >= 0 && result.alpha <= 1)
    alphas.push(result.alpha)
  }
  for (let i = 1; i < alphas.length; i += 1) {
    assert.ok(alphas[i] >= alphas[i - 1], 'a brighter backdrop must not reduce the wash')
    assert.ok(alphas[i] - alphas[i - 1] < 0.1, 'small luminance changes must not cause a visible alpha step')
  }
})

test('the generated wash is scoped to assistant content and leaves nested cards unframed', () => {
  const css = replyGroundCss({ alpha: 0.2, color: [12, 14, 20] })
  assert.match(css, /\[data-slot='aui_assistant-message-content'\]/)
  assert.match(css, /background: var\(--zf-reply-ground\)/)
  assert.match(css, /pre, pre code, table, thead, tbody, tr, th, td, blockquote/)
  assert.match(css, /\[data-slot='code-card'\].*\[data-slot='file-diff-panel'\].*\[data-slot='tool-block'\].*\[data-slot='clarify-inline'\].*\.zf-snip/s)
  assert.ok(css.includes("[class*='bg-(--ui-widget-surface-background)']"), 'generic widget cards keep a fill but lose their nested lift')
  assert.match(css, /background: transparent !important; border-color: transparent !important;/, 'inner tool/code wells do not stack a second ground')
  assert.match(css, /box-shadow: none !important/)
  assert.doesNotMatch(css, /margin\s*:|width\s*:|max-width\s*:|overflow\s*:/)
  assert.doesNotMatch(css, /backdrop-filter|animation|transition/)
  assert.doesNotMatch(css, /aui_user-message|composer-surface|data-slot='sidebar'|aui_thread-viewport/)
})

test('the wash keeps prose off its own edges, inside the corner radius', () => {
  const css = replyGroundCss({ alpha: 0.2, color: [12, 14, 20] })
  // Without these the first line sat on the top edge and wrapped lines ran into
  // the 12px radius, which clips glyphs (see the 2026-11-08 captures).
  assert.match(css, /padding-block: 0\.4rem !important;/)
  assert.match(css, /padding-inline-end: 0\.6rem !important;/)
  assert.doesNotMatch(css, /padding-inline-start|padding-left/, 'the host left gutter is untouched')
  assert.doesNotMatch(css, /margin\s*:/, 'padding is not cancelled by a negative margin the host clips')
})

test('backdrop samples come from the picture and live sky paths', () => {
  assert.ok(/const pictureBackdrop = \(/.test(src), 'painted-picture samples are available')
  assert.ok(/backdrop\(bounds/.test(src), 'the live sky exposes backdrop samples')
  assert.ok(/const replyMaterial =/.test(src), 'the shared material rule is present')
  assert.ok(/const replyGroundCss =/.test(src), 'the shared CSS rule is present')
  assert.ok(/replyMaterial\(ink, styled \? material\.tint : native\.tint, samples\)/.test(src), 'the shared solver receives current ink and backdrop samples')
  assert.ok(/if \(!replyGround\.get\(\)\) \{ sheet\?\.remove\(\); replyRefreshKey = ''; return \}/.test(src), 'turning the setting off removes its sheet')
})

test('sky readback bounds use the normalized-coordinate clamp', () => {
  const from = src.indexOf('backdrop(bounds =')
  const to = src.indexOf('\n    start() {', from)
  assert.ok(from >= 0 && to > from, 'the retained-sky readback method exists')
  const method = src.slice(from, to)
  assert.match(method, /clamp01\(bounds\.left\)/)
  assert.match(method, /clamp01\(bounds\.bottom\)/)
  assert.doesNotMatch(method, /(?<![\w])clamp\(bounds\.(?:left|bottom)\)/,
    'the engine clamp requires three arguments and must not receive a single normalized coordinate')
})

test('returning to a cached picture invalidates an older pending decode', () => {
  const from = src.indexOf('const preparePictureBackdrop = url =>')
  const to = src.indexOf('const pictureBackdrop =', from)
  assert.ok(from >= 0 && to > from, 'the picture decode lifecycle exists')
  const decode = src.slice(from, to)
  assert.match(decode, /if \(url === pictureSourceUrl\) \{ pictureRequestUrl = url; return \}/)
  assert.equal((decode.match(/if \(pictureRequestUrl !== url\) return/g) || []).length, 2,
    'both load and error callbacks ignore stale image requests')
})
