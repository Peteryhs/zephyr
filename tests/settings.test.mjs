// The Look switches are three separate things: the sky as a backdrop, a
// painting/picture as a backdrop, and Zephyr's own chrome. These guard the
// split at the generated-sheet and settings levels.
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const src = readFileSync(new URL('../plugin.js', import.meta.url), 'utf8').replace(/\r\n/g, '\n')

const slice = (from, to) => {
  const start = src.indexOf(from)
  assert.ok(start >= 0, `${from} not found`)
  const end = src.indexOf(to, start)
  assert.ok(end > start, `${to} not found after ${from}`)
  return src.slice(start, end)
}

test('Zephyr styling is its own stored switch', () => {
  assert.match(src, /chrome: 'chrome'/)
  assert.match(src, /const chromeOn = atom\(stored\(STORE_KEYS\.chrome\) !== false\)/)
  assert.match(src, /ctx\.storage\.set\(STORE_KEYS\.chrome, chromeOn\.get\(\)\)/)
})

test('the sky switch only chooses the sunset backdrop', () => {
  const render = slice('const renderSky = now => {', 'const refreshWeather =')
  assert.match(render, /const backdrop = lookNow !== 'sunset' \|\| sky\.get\(\)/,
    'the painting and custom picture must survive the Sky switch')
  assert.match(render, /paintSky\(now, Boolean\(gl\), \{ backdrop, chrome \}\)/,
    'the sheet needs both switches')
  assert.doesNotMatch(render, /if \(!sky\.get\(\)\)/, 'Sky off must not clear the whole sheet')
  assert.match(src, /if \(surfaceOn\(\)\) renderSky\(now\)/,
    'the clock must keep the chrome sheet alive when the sky is off')
})

test('the generated sheet can skip the backdrop or the chrome', () => {
  const sheet = slice('const skyStyleFor =', '// ══ §5b APP MOTION')
  assert.match(sheet, /backdrop = true, chrome = true/)
  assert.match(sheet, /\.\.\.\(backdrop \? \[/, 'the ground is a separate block')
  assert.match(sheet, /\.\.\.\(chrome \? \[/, 'the chrome is a separate block')
  const paint = slice('const paintSky =', 'const clearSky =')
  assert.match(paint, /if \(!backdrop && !chrome\) \{ clearSky\(\); return \}/)
})

test('the settings page shows Look, Sky and Zephyr styling apart', () => {
  const page = slice("ctx.registerSettingsPage?.({", '// ── Arclike')
  assert.match(page, /const lookSection = section\('cloud', 'Look'/)
  assert.match(page, /label: 'Sky'/)
  assert.match(page, /label: 'Zephyr styling'/)
  assert.match(page, /const skySection = skyLook && isSky \? section\('cloud', 'Sky'/)
  assert.match(page, /chromeOn\.set\(on\)/)
})

test('the long sections fold, and the picture knobs stay under Custom', () => {
  const page = slice("ctx.registerSettingsPage?.({", '// ── Arclike')
  assert.match(page, /const chatSection = section\('comment-discussion', 'Chat & motion',/)
  assert.match(page, /const pinSection = section\('bookmark',/)
  assert.equal((page.match(/\{ collapse: true \}/g) || []).length, 2, 'Chat and Snippets fold by default')
  assert.match(page, /const skinSection = lookNow === 'custom'/)
  assert.match(page, /'Colour, glass and fit'/)
})
