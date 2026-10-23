// The new-tab shelf is the one place suggested sessions are drawn. The sidebar
// is the host's column; a second copy there was a fourth group and a node the
// plugin had to keep re-inserting into React's list. The shelf's material is
// the theme's, not a second palette; these read the generated sheet.
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const src = readFileSync(new URL('../plugin.js', import.meta.url), 'utf8').replace(/\r\n/g, '\n')

const arrayAt = name => {
  const start = src.indexOf(`const ${name} = [`)
  assert.ok(start >= 0, `${name} not found`)
  const end = src.indexOf('\n]', start)
  assert.ok(end > start, `${name} has no end`)
  return new Function(`return ${src.slice(src.indexOf('= [', start) + 2, end + 2)}`)()
}

const home = arrayAt('HOME_CSS').join('\n')
const ruleFor = selector => {
  const at = home.indexOf(selector + ' {')
  assert.ok(at >= 0, `${selector} not found`)
  const close = home.indexOf('}', at)
  return home.slice(at, close + 1)
}

test('the sidebar carries no plugin-owned Recommended group', () => {
  for (const marker of ['zf-rec', 'recRail', 'syncRail', 'Recommended sessions']) {
    assert.equal(src.includes(marker), false, `${marker} should be gone with the sidebar rail`)
  }
})

test('the shelf is the only caller that draws the picks', () => {
  const calls = src.match(/RECENTS\.(pickUp|regulars)\(/g) || []
  assert.deepEqual(calls.sort(), ['RECENTS.pickUp(', 'RECENTS.regulars('])
})

test('the shelf lives in an always-on sheet, not in the sky sheet', () => {
  assert.match(src, /ensureHomeStyle\(\)/)
  assert.match(src, /el\.id = 'zephyr-home-style'/)
  const sky = src.slice(src.indexOf('const skyStyleFor'), src.indexOf('const MOTION_CSS'))
  assert.ok(sky.length > 0)
  assert.equal(sky.includes('#zf-home'), false, 'the shelf must survive another theme or Sky off')
})

test('the shelf fill and ink come from the look, with the host as fallback', () => {
  assert.match(home, /--zf-home-fill-a: var\(--zf-m-pin-a, var\(--ui-widget-surface-background,/)
  assert.match(home, /--zf-home-fill-b: var\(--zf-m-pin-b, var\(--ui-sidebar-surface-background,/)
  assert.match(home, /--zf-home-ink-0: var\(--zf-ink-0, var\(--ui-text-primary,/)
  assert.match(home, /--zf-home-ink-2: var\(--zf-ink-2, var\(--ui-text-secondary,/)
  assert.match(home, /--zf-home-ink-3: var\(--zf-ink-3, var\(--ui-text-tertiary,/)
  const card = ruleFor('#zf-home .zf-card-open')
  assert.match(card, /linear-gradient\(180deg, var\(--zf-home-fill-a\), var\(--zf-home-fill-b\)\)/)
  assert.match(card, /rgba\(var\(--zf-home-hi\), 0\.12\)/)
  assert.equal(/14, 24, 19|#fbf1c7|#ebdbb2/.test(home), false, 'no hard-coded green or gruvbox fallbacks')
  assert.equal(home.includes('backdrop-filter'), false, 'large surfaces use material, not a live blur')
})

test('the shelf uses the plugin card radius, not a one-off 18px', () => {
  assert.match(ruleFor('#zf-home .zf-card-open'), /border-radius: var\(--zf-r-card, 12px\)/)
  assert.equal(home.includes('border-radius: 18px'), false)
})

test('the shelf does not cut card shadows at its clip edge', () => {
  const root = ruleFor('#zf-home')
  assert.match(root, /overflow: clip;/)
  assert.match(root, /overflow-clip-margin: 48px/)
  assert.doesNotMatch(root, /overflow: hidden/)
})

test('the scenery text shadow is dropped in a light host theme', () => {
  assert.match(home, /html:not\(\.dark\) #zf-home h3 \{ text-shadow: none; \}/)
})

test('text shadow stays on text over scenery, not inside the card', () => {
  assert.match(ruleFor('#zf-home h3'), /text-shadow:/)
  assert.doesNotMatch(ruleFor('#zf-home .zf-card-title'), /text-shadow/)
})
