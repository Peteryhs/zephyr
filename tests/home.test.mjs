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
  assert.match(home, /--zf-home-ink-0: var\(--zf-ink-0, var\(--ui-text-primary,/)
  assert.match(home, /--zf-home-ink-2: var\(--zf-ink-2, var\(--ui-text-secondary,/)
  assert.match(home, /--zf-home-ink-3: var\(--zf-ink-3, var\(--ui-text-tertiary,/)
  // Matte is the plugin's own flat card material: one fill, no edge, no shadow,
  // nothing that picks up the sky behind it, so it cannot read as reflective.
  const matte = ruleFor("#zf-home[data-cards='matte'] .zf-card-open")
  assert.match(matte, /background: var\(--zf-m-solid, rgb\(17, 18, 24\)\)/)
  assert.equal(/box-shadow|backdrop-filter|gradient/.test(matte), false, 'matte carries no edge, sheen or wash')
  // Glass is the sidebar-card glass, edged and lifted.
  const glass = ruleFor("#zf-home[data-cards='glass'] .zf-card-open")
  assert.match(glass, /background: var\(--zf-side-card, var\(--ui-widget-surface-background,/)
  assert.match(glass, /0 0 0 1px var\(--zf-edge, rgba\(255, 255, 255, 0\.07\)\)/)
  assert.match(ruleFor("#zf-home[data-cards='glass'] .zf-card-open:hover"), /var\(--zf-side-card-hi, var\(--zf-side-card,/)
  assert.equal(home.includes('--zf-home-fill'), false, 'the old two-stop wash is gone')
  assert.equal(/14, 24, 19|#fbf1c7|#ebdbb2/.test(home), false, 'no hard-coded green or gruvbox fallbacks')
  assert.equal(home.includes('backdrop-filter'), false, 'large surfaces use material, not a live blur')
})

test('the material is a stored choice, applied on the page and in settings', () => {
  assert.match(src, /homeCard: 'homeCard'/)
  assert.match(src, /const homeCard = atom\(stored\(STORE_KEYS\.homeCard\) === 'glass' \? 'glass' : 'matte'\)/)
  assert.match(src, /el\.dataset\.cards = homeCard\.get\(\)/)
  assert.match(src, /homeCard\.subscribe\?\.\(v => \{ el\.dataset\.cards = v \}\)/)
  assert.match(src, /Suggestion card material/)
})

test('the active session tab wears the same matte material as the cards', () => {
  const tabs = arrayAt('SESSION_TAB_CSS').join('\n')
  const at = tabs.indexOf("*)[aria-selected='true'] {")
  assert.ok(at > 0, 'the active tab rule is missing')
  const active = tabs.slice(at, tabs.indexOf('}', at) + 1)
  assert.match(active, /background: color-mix\(in srgb, var\(--zf-m-solid, rgb\(17, 18, 24\)\) 90%, rgb\(var\(--zf-hi, 255, 255, 255\)\)\)/)
  assert.match(active, /box-shadow: none !important/)
  assert.equal(tabs.includes('--zf-m-tab'), false, 'no translucent tab wash left')
  assert.equal(/backdrop-filter|gradient/.test(active), false, 'nothing glossy on the tab')
})

test('the shelf uses the plugin card radius, not a one-off 18px', () => {
  assert.match(ruleFor('#zf-home .zf-card-open'), /border-radius: var\(--zf-radius-lg, var\(--zf-r-card, 12px\)\)/)
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
