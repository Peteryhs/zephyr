import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'

const src = fs.readFileSync(new URL('../plugin.js', import.meta.url), 'utf8')
const cut = (a, b) => { const i = src.indexOf(a); return src.slice(i, src.indexOf(b, i)) }
// evaluates our own plugin.js source (trusted, local) to unit-test the pure palette fn
const paletteFrom = new Function(`${cut('const hslHex =', '// The glass colours, as the host')}; return glassPaletteFrom`)()
const lum = hex => { const n = parseInt(hex.slice(1), 16); return (0.2126 * (n >> 16) + 0.7152 * ((n >> 8) & 255) + 0.0722 * (n & 255)) / 255 }
const fill = (rgb, n = 64 * 36) => { const a = new Uint8Array(n * 4); for (let i = 0; i < n; i++) a.set([...rgb, 255], i * 4); return a }

test('a red picture gives a dark red glass, light ink and a warm accent', () => {
  const p = paletteFrom(fill([180, 20, 10]))
  const g = parseInt(p.ground.slice(1), 16)
  assert.ok((g >> 16) > (g & 255), 'ground leans red')
  assert.ok(lum(p.ground) < 0.06, 'ground is dark')
  assert.ok(lum(p.ink) > 0.6, 'ink is light')
  assert.ok(lum(p.ink) / lum(p.ground) > 8, 'ink reads on the ground')
})

test('a grey picture gives near-neutral glass, not an invented colour', () => {
  const p = paletteFrom(fill([128, 128, 128]))
  const [r, g, b] = [0, 2, 4].map(i => parseInt(p.ground.slice(1 + i, 3 + i), 16))
  assert.ok(Math.max(r, g, b) - Math.min(r, g, b) <= 6)
})

test('every colour is a valid hex', () => {
  const p = paletteFrom(fill([40, 120, 200]))
  for (const v of Object.values(p)) assert.match(v, /^#[0-9a-f]{6}$/)
})
