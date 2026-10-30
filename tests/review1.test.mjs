// Regressions for the code-review fixes. Functional where the code can be cut out cleanly,
// structural where it lives inside the big register() closure.
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const src = readFileSync(new URL('../plugin.js', import.meta.url), 'utf8').replace(/\r\n/g, '\n')
const cut = (from, to) => { const a = src.indexOf(from), b = src.indexOf(to, a); assert.ok(a >= 0 && b > a, `${from} not found`); return src.slice(a, b) }

test('hexRgb is never handed an [r, g, b] triple (it parsed "213,19" into 33, 3, 25)', () => {
  assert.equal(/hexRgb\(GB\./.test(src), false)
  const body = cut('const hexTriple = hex =>', 'const picUrl')
  const { hexTriple } = new Function(`${body}; return { hexTriple }`)()
  assert.equal(hexTriple('#d5c4a1'), '213, 196, 161')
})
test('getSolar only trusts finite, ordered live sun times', () => {
  const body = cut('const getSolar = ', '\n}\n') + '\n}'
  const make = live => new Function('liveSolar', 'getApproxCoords', 'calcSolarTimes', `${body}; return getSolar`)(live, () => [0, 0], () => 'calc')
  assert.equal(make({ rise: NaN, set: 18 })(), 'calc')
  assert.equal(make({ rise: 19, set: 6 })(), 'calc')
  const ok = { rise: 6, set: 19 }
  assert.equal(make(ok)(), ok)
})
test('a fetched sunrise that does not parse is dropped before it is stored', () => {
  assert.match(src, /Number\.isFinite\(rise\) && Number\.isFinite\(set\) && rise < set\)\) return\r?\n\s+liveSolar = \{/)
})
test('a hidden window does not spin the frame timer', () => {
  assert.match(src, /run\.last = t\r?\n\s+run\.lastSky = t/)
})
test('stored weather and quality names must be own keys, not "constructor"', () => {
  assert.match(src, /Object\.hasOwn\(WEATHER_LABEL, stored\(STORE_KEYS\.weather\)\)/)
  assert.match(src, /Object\.hasOwn\(QUALITY, stored\(STORE_KEYS\.quality\)\)/)
})
test('a queued page pass stands down after dispose', () => {
  assert.match(src, /pageQueued = false; if \(pageDead\) return; markStrips\(\)/)
})
test('a pin drag with the button already up ends instead of wedging', () => {
  assert.match(src, /e\.buttons === 0 && e\.pointerType === 'mouse'\) \{ endPinDrag\(\); return \}/)
})
test('the session-click replay is not swallowed by its own handler, and the swap has a watchdog', () => {
  assert.match(src, /if \(replaying \|\| swapping \|\|/)
  assert.match(src, /replaying = true; try \{ btn\.click\(\) \} finally \{ replaying = false \}/)
  assert.match(src, /setTimeout\(\(\) => \{ if \(swapping\) finish\(\) \}, 3000\)/)
})
test('the solar fetch result is ignored after dispose', () => {
  assert.match(src, /zfDisposed = true/)
  assert.match(src, /\.then\(\(\) => \{\r?\n\s+if \(zfDisposed\) return/)
})
test('npm test runs every test file', () => {
  const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'))
  assert.match(pkg.scripts.test, /tests\/?(\*\.test\.mjs)?$|skin\.test\.mjs/)
})
test('the model picker search rounds the Input wrapper, not just the inner field', () => {
  // The app's Input primitive paints the border and radius on a <span> around
  // <input role="searchbox">; the generic `input` rule never reaches it.
  const from = src.indexOf(":is(span, div):has(> input[role='searchbox'])")
  assert.ok(from >= 0, 'the search-wrapper radius rule is missing')
  const rule = src.slice(from, src.indexOf('}', from))
  assert.match(rule, /border-radius: var\(--zf-r-control\) !important/)
})
