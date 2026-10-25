// The material pass (2026-10-25): one radius scale, one night family, and the
// command well/approval card on the same surface ladder as every other card.
// These assertions are deliberately about the generated CSS's contract, not
// about exact declarations, so the design can move without deleting the rules
// that keep it coherent.
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const src = readFileSync(new URL('../plugin.js', import.meta.url), 'utf8').replace(/\r\n/g, '\n')
const css = () => {
  const start = src.indexOf('const skyStyleFor =')
  const end = src.indexOf('// ══ §5b', start)
  return src.slice(start, end)
}

test('every app radius utility shares Zephyr’s scale', () => {
  assert.match(src, /--radius-scalar: \.75;/, 'Tailwind radii stay at the app’s 2.4-6.4px without this')
  assert.match(src, /--zf-r-3: 12px;/, 'cards are 12px')
  assert.match(src, /--zf-r-4: 16px;/, 'sheets are 16px')
  assert.match(src, /--zf-radius: var\(--zf-r-3\);/, 'the card alias is the 12px step')
  assert.match(src, /--zf-radius-lg: var\(--zf-r-4\);/, 'the sheet alias is the 16px step')
  // No card may fall back to the pre-pass 0.6rem/0.9rem pair.
  assert.doesNotMatch(css(), /--zf-radius(-lg)?: (?:0\.6|0\.9)rem/)
})

test('night surfaces draw from one neutral ramp, never the blue sky tint', () => {
  // The tint itself crosses to the neutral night grey, so the transition is
  // smooth and every surface inherits the same colour (no second palette).
  assert.match(src, /const ZF_NIGHT = \[20, 21, 25\]/)
  assert.match(src, /const grey = smooth01\(clamp01\(\(0\.32 - sky\.exposure\) \/ 0\.12\)\)/)
  assert.match(src, /blendRgb\([^\n]*ZF_NIGHT, grey\)/)
  const block = css()
  assert.match(block, /--zf-glass: color-mix\(in srgb, var\(--zf-tint\)/, 'the card glass follows the tint')
  assert.match(block, /--zf-glass-strong: color-mix\(in srgb, var\(--zf-tint\)/, 'sheets too')
  assert.match(block, /--zf-side-card: var\(--zf-glass\)/, 'night is a tone of the same card, not an opaque twin')
  assert.match(block, /--zf-m-solid: \$\{cssRgb\(zf\.tint\)\}/, 'the matte step follows the same tint/grey')
})

test('the command well and the approval card are on the surface ladder', () => {
  assert.match(src, /\[data-slot='dialog-content'\] \[role='region'\]\[data-selectable-text='true'\] \{/)
  assert.match(src, /background: var\(--zf-well\) !important;/)
  assert.match(src, /border-radius: var\(--zf-r-2, 8px\) !important;/)
  assert.match(src, /html body :is\(\[data-slot='card-stack-surface'\], \[data-slot='card-stack-edge'\]\)\[class\] \{/)
  assert.match(src, /\[data-slot='tool-approval-card'\] > pre \{/)
})

test('Zephyr’s own cards opt out of the generic control radius', () => {
  assert.match(src, /button:not\(\[class\*='rounded-full'\]\):not\(\[class\*='zf-'\]\)/)
  assert.match(src, /\[role='button'\]:not\(\[class\*='rounded-full'\]\):not\(\[class\*='zf-'\]\)/)
})
