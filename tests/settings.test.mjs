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

test('the background switch hides scenery for every look', () => {
  const render = slice('const renderSky = now => {', 'const refreshWeather =')
  assert.match(render, /const backdrop = sky\.get\(\)/,
    'the shared background switch applies to every look')
  assert.match(render, /paintSky\(now, Boolean\(gl\), \{ backdrop, chrome \}\)/,
    'the sheet needs both switches')
  assert.doesNotMatch(render, /if \(!sky\.get\(\)\)/, 'Sky off must not clear the whole sheet')
  assert.match(src, /if \(surfaceOn\(\) \|\| replyGround\.get\(\)\) renderSky\(now\)/,
    'the clock must keep the independent reply ground alive when scenery and chrome are off')
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
  assert.match(page, /const lookSection = section\('paintcan', 'Appearance'/)
  assert.match(page, /label: 'Background'/)
  assert.match(page, /label: 'Zephyr styling'/)
  assert.match(page, /const skySection = skyRows.length \? section\('cloud', 'Sky'/)
  assert.match(page, /chromeOn\.set\(on\)/)
})

test('the long sections fold, and the picture knobs stay under Custom', () => {
  const page = slice("ctx.registerSettingsPage?.({", '// ── Arclike')
  assert.match(page, /const chatSection = section\('comment-discussion', 'Chat & motion',/)
  assert.match(page, /const pinSection = section\('bookmark',/)
  assert.equal((page.match(/\{ collapse: true \}/g) || []).length, 3, 'Fine-tune, Chat and Snippets fold by default')
  assert.match(page, /const skinSection = selectedLook === 'custom'/)
  assert.match(page, /'Colour, glass and fit'/)
})
