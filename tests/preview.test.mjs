// The inline `::preview{file=...}` widget measures itself with the ROOT
// element's scrollHeight, which is floored at the frame height: a short card
// reports the 280px default and the transcript keeps that empty band forever.
// Zephyr rewrites Hermes's measurement line inside `srcdoc` before the frame
// parses it. These checks keep the shim honest and removable.
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const src = readFileSync(new URL('../plugin.js', import.meta.url), 'utf8').replace(/\r\n/g, '\n')

const OLD = 'var h=Math.max(d?d.scrollHeight:0,b?b.scrollHeight:0);'
const NEW = 'var h=b?Math.max(b.scrollHeight,Math.ceil(b.getBoundingClientRect().height)):(d?d.scrollHeight:0);'

test('the preview shim targets the exact host measurement it knows how to fix', () => {
  assert.match(src, /const PREVIEW_MEASURE_OLD = 'var h=Math\.max\(d\?d\.scrollHeight:0,b\?b\.scrollHeight:0\);'/)
  assert.match(src, /const PREVIEW_MEASURE_NEW = 'var h=b\?Math\.max\(b\.scrollHeight,Math\.ceil\(b\.getBoundingClientRect\(\)\.height\)\):\(d\?d\.scrollHeight:0\);'/)
  // The old expression must not survive as a live measurement anywhere else.
  const live = src.split(OLD).length - 1
  assert.equal(live, 1, 'the old scrollHeight measurement appears only as the shim pattern')
})

test('the shim only touches Hermes preview iframes, and re-checks after React rewrites srcdoc', () => {
  const at = src.indexOf('const ensurePreviewMeasureShim')
  const end = src.indexOf('// ════════════════════════════════════════════════════════════════════════', at)
  assert.ok(at > 0 && end > at, 'ensurePreviewMeasureShim block was not found')
  const block = src.slice(at, end)

  assert.match(src, /iframe\[sandbox~="allow-scripts"\]\[srcdoc\*="hermes-inline-preview-size"\]/)
  assert.match(block, /attributeFilter: \['srcdoc'\]/, 'a theme-driven srcdoc rewrite is re-patched')
  assert.match(block, /doc\.includes\(PREVIEW_MEASURE_OLD\)/, 'unknown host versions fail safe')
  assert.match(block, /observer\.disconnect\(\)/, 'the observer is disposable')
  assert.doesNotMatch(block, /contentWindow|contentDocument|\.document\./, 'no cross-origin access')
})

test('the shim is installed at load and removed with the plugin', () => {
  assert.match(src, /const stopPreviewMeasure = ensurePreviewMeasureShim\(\)/)
  assert.match(src, /stopPreviewMeasure\?\.\(\)/)
})
