// The sidebar has exactly one card: the floating one. Pinned is the app's own
// column, so these read the generated array rather than a hand-copied selector.
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const src = readFileSync(new URL('../plugin.js', import.meta.url), 'utf8').replace(/\r\n/g, '\n')
const start = src.indexOf('const ARCLIKE_CSS = [')
assert.ok(start >= 0, 'ARCLIKE_CSS not found')
const end = src.indexOf('\n]', start)
assert.ok(end > start, 'ARCLIKE_CSS has no end')
const rules = new Function(`return ${src.slice(src.indexOf('= [', start) + 2, end + 2)}`)()
const css = rules.join('\n')

const ruleFor = selector => {
  const at = css.indexOf(selector + ' {')
  assert.ok(at >= 0, `${selector} not found`)
  const close = css.indexOf('}', at)
  return css.slice(at, close + 1)
}

test('pinned sidebar paints no card of its own', () => {
  const body = ruleFor("html:not([data-zf-arc='1']) [data-zf-arc-col]")
  assert.doesNotMatch(body, /(^|[;\s])background/, 'pinned column must not fill')
  assert.doesNotMatch(body, /box-shadow/, 'pinned column must not cast a ring or shadow')
  assert.doesNotMatch(body, /border-radius/, 'pinned column must not have a radius')
  assert.doesNotMatch(body, /overflow/, 'pinned column must not clip like a card')
  assert.match(body, /margin:/, 'the pinned layout inset is not part of the card')
  assert.match(body, /height:/)
})

test('pinned sidebar does not flatten the surfaces inside it', () => {
  assert.equal(css.includes("html:not([data-zf-arc='1']) [data-zf-arc-col] > div"), false,
    'flattening pinned inner surfaces would leave the list transparent over the chat')
  assert.equal(css.includes("html:not([data-zf-arc='1']) [data-zf-arc-col] [data-slot='sidebar']"), false)
})

test('floating sidebar keeps the solid card and its ring and shadow', () => {
  const body = ruleFor("html[data-zf-arc='1'] [data-zf-arc-col]")
  assert.match(body, /background: var\(--zf-m-solid\)/)
  assert.match(body, /box-shadow: var\(--zf-lift-float\)/)
  assert.match(body, /border-radius: 16px/)
  assert.ok(css.includes("html[data-zf-arc='1'] [data-zf-arc-col] > div"),
    'floating still flattens its children onto the one card')
})

test('the snippet card and the status dock keep their own riding rules', () => {
  assert.ok(css.includes('#zephyr-snips'))
  assert.ok(css.includes('#zephyr-statusdock-head'))
})
