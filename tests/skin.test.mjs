// zephyr-theme.json is hand-edited text that ends up inside the stylesheet,
// so setSkin must keep anything that could break a rule out.
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const src = readFileSync(new URL('../plugin.js', import.meta.url), 'utf8')
const body = src.slice(src.indexOf('const SKIN_DEFAULTS'), src.indexOf('const skinNumber')).replace(/BACKWATER_URL/g, "'x.jpg'")
const { setSkin, get } = new Function(`${body}; return { setSkin, get: () => SKIN }`)()

test('a colour that could end the rule is replaced by the default', () => {
  setSkin({ ink: 'red; } body { display: none', edge: 'url(http://x)' })
  assert.equal(get().ink, '#fbf1c7')
  assert.equal(get().edge, '#4f7360')
})
test('short and long hex colours are kept', () => {
  setSkin({ accent: '#abc', ink2: ' #A1B2C3 ' })
  assert.equal(get().accent, '#abc')
  assert.equal(get().ink2, '#A1B2C3')
})
test('numbers are clamped to the slider range and junk keeps the default', () => {
  setSkin({ scrim: 9, blur: 'bad', saturate: -3, posX: -5, posY: 140 })
  assert.equal(get().scrim, 0.9)
  assert.equal(get().blur, 18)
  assert.equal(get().saturate, 0.5)
  assert.equal(get().posX, 0)
  assert.equal(get().posY, 100)
})
test('fit only accepts cover or contain and unknown keys are dropped', () => {
  setSkin({ fit: 'zoom', evil: 1 })
  assert.equal(get().fit, 'cover')
  assert.equal('evil' in get(), false)
  setSkin({ fit: 'contain' })
  assert.equal(get().fit, 'contain')
})
