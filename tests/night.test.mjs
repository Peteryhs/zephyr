// Night material + weather bootstrap. The user's "grey ↔ deep blue at random
// times" had two causes: opaque night panels next to sky-tinted glass, and a
// synthetic 3-hour weather preset painted at launch before the real weather
// arrived (then a 10-minute crossfade). These checks pin both fixes.
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const src = readFileSync(new URL('../plugin.js', import.meta.url), 'utf8').replace(/\r\n/g, '\n')

test('the night tint is one smooth neutral ramp, not a phase switch', () => {
  assert.match(src, /const ZF_NIGHT = \[20, 21, 25\]/)
  assert.match(src, /const grey = smooth01\(clamp01\(\(0\.32 - sky\.exposure\) \/ 0\.12\)\)/)
  assert.match(src, /blendRgb\([^\n]*ZF_NIGHT, grey\)/)
  // The phase gate must no longer choose a second night palette.
  assert.equal(src.includes('--zf-night-panel'), false)
  assert.equal(src.includes('--zf-night-raised'), false)
  assert.equal(src.includes('--zf-night-hover'), false)
})

test('every later glass tier still resolves through the tint', () => {
  assert.match(src, /--zf-glass: color-mix\(in srgb, var\(--zf-tint\)/)
  assert.match(src, /--zf-glass-hover: color-mix\(in srgb, var\(--zf-tint-hi\)/)
  assert.match(src, /--zf-glass-strong: color-mix\(in srgb, var\(--zf-tint\)/)
  assert.match(src, /--zf-side-card: var\(--zf-glass\)/)
  assert.match(src, /--zf-side-card-hi: var\(--zf-glass-hover\)/)
  // The night alpha is high enough that the blue behind cannot tint the card.
  assert.match(src, /glassPct\(84 \+ 12 \* zf\.night\)/)
  assert.match(src, /glassPct\(94 \+ 4 \* zf\.night\)/)
})

test('the sky starts on cached live weather, not the synthetic preset', () => {
  assert.match(src, /let liveWeather = \(\(\) => \{[\s\S]*?ctx\.storage\.get\('liveWeather', null\)[\s\S]*?cached\.current[\s\S]*?\}\)\(\)/)
  assert.match(src, /if \(current\) liveWeather = current/, 'a failed refresh keeps the last known weather')
})

test('an unchanged weather target does not restart the crossfade', () => {
  assert.match(src, /const sig = `\$\{mode\}:\$\{key\}:\$\{JSON\.stringify\(weights\)\}:\$\{wind\}`/)
  assert.match(src, /if \(!instant && sig === lastWeatherSig\) return/)
  assert.match(src, /setWeather\(weights, mode === 'live' \? 120 : 25, instant\)/)
})

test('the sunset hairline is neutral; the green edge belongs to gruvbox', () => {
  assert.match(src, /--zf-hair: \$\{gruv \? `rgba\(\$\{hexTriple\(SKIN\.edge\)\}, 0\.55\)` : 'var\(--zf-edge\)'\};/)
})
