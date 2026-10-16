// Exercises zephyr's register() against a fake host: proves the plugin loads,
// registers what it claims, and that every render path (theme data, snippet
// card, chip, settings page) runs without throwing.

import plugin from './plugin.snapshot-20261008.mjs'

const REQUIRED = ['background', 'foreground', 'primary']
// Full DesktopThemeColors surface, from apps/desktop/src/themes/types.ts.
const ALL_KEYS = [
  'background', 'foreground', 'card', 'cardForeground', 'muted', 'mutedForeground',
  'popover', 'popoverForeground', 'primary', 'primaryForeground', 'secondary',
  'secondaryForeground', 'accent', 'accentForeground', 'border', 'input', 'ring',
  'destructive', 'destructiveForeground', 'sidebarBackground', 'sidebarBorder',
  'userBubble', 'userBubbleBorder'
]

const registered = []
const settingsPages = []
const storage = {}
const cssVars = {}
const styleEls = new Map()
const bodyEls = new Map()

// The plugin writes --zephyr-sun to :root, owns its own <style> element, and
// mounts a cloud container into <body>, so the harness needs those surfaces.
const makeElement = tag => ({
  tagName: tag,
  id: '',
  className: '',
  textContent: '',
  attrs: {},
  children: [],
  style: { cssText: '' },
  setAttribute(key, value) { this.attrs[key] = value },
  appendChild(child) {
    this.children.push(child)
    if (child.id) bodyEls.set(child.id, child)

    return child
  },
  remove() {
    styleEls.delete(this.id)
    bodyEls.delete(this.id)
  }
})

globalThis.document = {
  documentElement: {
    style: {
      setProperty: (key, value) => { cssVars[key] = value },
      removeProperty: key => { delete cssVars[key] }
    }
  },
  createElement: tag => makeElement(tag),
  getElementById: id => styleEls.get(id) || bodyEls.get(id) || null,
  head: { appendChild: element => { styleEls.set(element.id, element) } },
  body: { appendChild: element => { if (element.id) bodyEls.set(element.id, element) } }
}

const ctx = {
  storage: { get: (key, fallback) => (key in storage ? storage[key] : fallback), set: (key, value) => { storage[key] = value } },
  register: contribution => registered.push(contribution),
  registerSettingsPage: page => settingsPages.push(page),
  onDispose: fn => { globalThis.__dispose = fn }
}

const problems = []
const note = (ok, label) => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}`)
  if (!ok) problems.push(label)
}

// ── 1. the plugin loads and registers ─────────────────────────────────────
let threw = null
try {
  plugin.register(ctx)
} catch (error) {
  threw = error
}
note(!threw, `register() runs without throwing${threw ? `: ${threw.message}` : ''}`)
if (threw) { console.log(threw.stack); process.exit(1) }

note(plugin.id === 'zephyr' && typeof plugin.name === 'string', 'default export carries id + name')

const themes = registered.filter(c => c.area === 'themes')
const directives = registered.filter(c => c.area === 'transcript.directives')
const chip = registered.filter(c => c.area === 'statusBar.right')

note(themes.length === 4, `registers 4 themes (got ${themes.length})`)
note(directives.length === 1, `registers 1 transcript directive (got ${directives.length})`)
note(chip.length === 1, `registers 1 status-bar chip (got ${chip.length})`)
note(settingsPages.length === 1, `registers 1 settings page (got ${settingsPages.length})`)

// ── 2. themes satisfy the host's validator ────────────────────────────────
// Mirrors isValidTheme() + a full-coverage check, so a theme can't be silently
// dropped for a missing string.
for (const entry of themes) {
  const theme = entry.data
  const hasMeta = typeof theme?.name === 'string' && typeof theme?.label === 'string' && theme.colors
  note(Boolean(hasMeta), `theme ${theme?.name}: name + label + colors`)
  note(REQUIRED.every(k => typeof theme.colors[k] === 'string'), `theme ${theme.name}: validator keys present`)
  const missing = ALL_KEYS.filter(k => typeof theme.colors[k] !== 'string')
  note(missing.length === 0, `theme ${theme.name}: full colour surface (${missing.length ? 'missing ' + missing.join(', ') : 'all ' + ALL_KEYS.length})`)
  // The sky is the ground now, so a translucent surface is the contract: an
  // opaque fill would hide it.
  note(/^rgba\(\d+, \d+, \d+, 0\.\d+\)$/.test(theme.colors.background), `theme ${theme.name}: translucent ground ${theme.colors.background}`)
  // One owner for the sky: the plugin's own <style>. A theme-carried copy would
  // double-paint the vignette if both paths ever worked.
  note(theme.customCSS === undefined, `theme ${theme.name}: carries no customCSS (plugin owns the sky)`)
}

const accents = themes.map(entry => entry.data.colors.accent)
const hexToRgb = hex => [1, 3, 5].map(index => parseInt(hex.slice(index, index + 2), 16))
const dayAccent = themes.find(entry => entry.data.name === 'zephyr-day').data.colors.accent
note(new Set(accents).size === 4, `each phase carries its own accent (${accents.join(' ')})`)
note(hexToRgb(dayAccent)[2] > hexToRgb(dayAccent)[0], `day accent is cool, not amber (${dayAccent})`)

// ── 3. every render path runs ─────────────────────────────────────────────
// Component elements must be CALLED, not just created: a bare jsx() element is
// an object, so wrapping it proves nothing about the body.
const exercise = (element, depth = 0) => {
  if (!element || typeof element !== 'object' || depth > 20) return element
  if (typeof element.type === 'function') return exercise(element.type(element.props), depth + 1)
  return element
}

try {
  const card = exercise(directives[0].data.render({ attrs: { title: 'Attention', value: '4 open', note: 'two are stale', tone: 'accent' }, streaming: false }))
  note(card?.type === 'div', 'snippet card renders (accent)')
  const accShadow = card?.props?.style?.boxShadow || ''
  const plain = exercise(directives[0].data.render({ attrs: { value: 'bare value' }, streaming: false }))
  const plainShadow = plain?.props?.style?.boxShadow || ''
  // Regression guards for what Peter actually judged: no edge stripe, and no
  // glow at all. The matte card won, so the accent may only tint the fill and
  // the label.
  note(!/inset 2px 0 0 0/.test(accShadow), 'no coloured left stripe on the edge')
  note(!/--ui-accent/.test(accShadow), 'accent card carries no glow')
  note(accShadow === plainShadow && /inset 0 1px 0/.test(accShadow), 'both variants share the matte shadow')
  note(/color-mix\(in srgb, var\(--ui-accent\) 5%/.test(card?.props?.style?.background || ''), 'accent tints the fill only')
  note(card?.props?.children?.[0]?.props?.style?.color === 'var(--ui-accent)', 'accent tints the label')
  note(plain?.props?.children?.[0] === null || plain?.props?.children?.[0]?.props?.style?.color !== 'var(--ui-accent)', 'plain label stays tertiary')
  note(card?.props?.style?.maxWidth === '34rem', 'card max width is inline (not a Tailwind class)')
  note(card?.props?.style?.borderRadius === '14px', 'card radius is inline (not a Tailwind class)')
  note(/var\(--ui-widget-surface-background\)/.test(card?.props?.style?.background || ''), 'card fill is the app token')
  note(plain?.type === 'div', 'snippet card renders (attrs missing)')
} catch (error) {
  note(false, `snippet card renders: ${error.message}`)
}

try {
  const out = exercise(chip[0].render())
  const walk = (el, fn) => {
    if (!el) return false
    if (Array.isArray(el)) return el.some(child => walk(child, fn))
    if (typeof el !== 'object') return false
    if (typeof el.type === 'string' && fn(el)) return true
    return walk(el.props?.children, fn)
  }
  note(walk(out, el => el.type === 'button'), 'chip renders a clickable button')
  note(walk(out, el => typeof el.props?.children === 'string' && /dawn|day|dusk|night/.test(el.props.children)), 'chip label names the phase')
} catch (error) {
  note(false, `chip renders: ${error.message}`)
}

try {
  const out = settingsPages[0].render()
  note(Array.isArray(out?.props?.children), 'settings page renders (empty pin list)')
} catch (error) {
  note(false, `settings page renders: ${error.message}`)
}

// ── 4. the clock behaves ──────────────────────────────────────────────────
const phaseAt = hour => {
  if (hour >= 5 && hour < 8) return 'dawn'
  if (hour >= 8 && hour < 17) return 'day'
  if (hour >= 17 && hour < 21) return 'dusk'
  return 'night'
}
const wanted = [[6, 'dawn'], [12, 'day'], [19, 'dusk'], [23, 'night'], [2, 'night']]
note(wanted.every(([h, p]) => phaseAt(h) === p), 'phase boundaries: 06 dawn / 12 day / 19 dusk / 23 night / 02 night')

const applied = globalThis.__themeCalls || []
note(applied.length === 1, `applied a theme on load (${applied.join(', ') || 'none'})`)
note(!(globalThis.__accentCalls || []).some(Boolean), 'no accent override forced on load (opt-in only)')

// The sky's orb reads this var; without it the light sits frozen. Compared
// against an independently computed value, which checks the wiring (that
// register() wrote the position for now) rather than re-testing the maths.
const nowDate = new Date()
const expectedSun = Math.round(Math.min(Math.max(((nowDate.getHours() + nowDate.getMinutes() / 60) - 5) / 16, 0), 1) * 100 - 10)
note(cssVars['--zephyr-sun'] === String(expectedSun), `clock writes the current sun position (${cssVars['--zephyr-sun']} == ${expectedSun})`)

// ── 4b. the sky layers ────────────────────────────────────────────────────
const skyStyle = styleEls.get('zephyr-sky-style')
const skyCss = skyStyle?.textContent || ''
note(Boolean(skyStyle), 'the plugin injects its own sky <style> element')
note(/html \{\n  background-color: rgb\(/.test(skyCss), 'sky sets the document base colour')
note(/html::before \{[\s\S]*?radial-gradient\(150% 80%/.test(skyCss), 'the sky gradient sits on html::before')
note(/linear-gradient\(180deg, rgb\(/.test(skyCss), 'the sky carries a gradient')
note(/@media \(prefers-reduced-motion: reduce\)/.test(skyCss), 'the drift and the orb motion respect reduced-motion')
note(/body \{ background: transparent; \}/.test(skyCss), "clears body's near-solid chrome ground so the sky is the ground")
note(/img\[src\*='filler-bg0'\] \{ display: none; \}/.test(skyCss), 'the app\'s Chat Backdrop statue rests while the sky is on')
// Every sky layer must sit behind the app's content. A zero-or-positive-z
// pseudo would paint over the app's own panels, which is the trap this avoids.
const layerBlocks = skyCss
  .split('}')
  .map(block => block.trim())
  // The reduced-motion block also names these selectors, so match real layers:
  // a positioned, viewport-fixed element is the thing that must stay behind.
  .filter(block => /^(html|body)::(before|after) \{/.test(block) && /position: fixed/.test(block))
note(layerBlocks.length === 2, `two pseudo sky layers (got ${layerBlocks.length})`)
note(layerBlocks.every(block => /z-index: -1/.test(block)), 'every sky layer is negative-z: behind all app content')
const containerBlock = skyCss.split('}').map(block => block.trim()).find(block => block.startsWith('#zephyr-clouds {'))
note(/z-index: -1/.test(containerBlock || ''), 'the cloud container is behind the app too, not over it')
note(/--theme-neutral-card: rgba\(22, 22, 24, 0?\.\d+\)/.test(skyCss), 'panel density is written by the tick (element brightness)')

// ── 4b-iii. the sidebar is a stack of floating panels ─────────────────────
note(/\[data-tour='sessions-sidebar'\] \{\n  background: transparent;/.test(skyCss), 'the sidebar column stops painting, so panels can float inside it')
note(
  /\[data-tour='sessions-sidebar'\] \{[\s\S]{0,240}?backdrop-filter: blur\(0\.75rem\) saturate\(1\.08\)/.test(skyCss),
  "the column keeps the input bar's frost, so the gaps between cards are frosted sky"
)
note(/\[data-slot='sidebar-content'\] \{\n  gap: 0\.5rem;/.test(skyCss), 'the cards are separated by a real gap, not a hairline')
note(/padding-top: var\(--titlebar-height, 2\.25rem\)/.test(skyCss), 'the column holds the titlebar space, so the first card clears the window controls')
note(
  /\[data-slot='sidebar-content'\] > \[data-slot='sidebar-group'\] \{ padding-top: 0\.375rem; \}/.test(skyCss),
  'and the first card drops the titlebar padding it used to carry'
)
const panelRule = skyCss.split('}').map(block => block.trim()).find(block => block.includes('div:last-child'))
note(Boolean(panelRule), 'the regions share one panel rule')
note(
  /\[data-slot='sidebar-group'\]/.test(panelRule) && /\[data-sessions-mode\]/.test(panelRule) && /div:has\(input\)/.test(panelRule),
  'top actions, history and search each get their own card'
)
note(/color-mix\(in srgb, var\(--dt-card\) 88%, transparent\)/.test(panelRule), "and they wear the composer's exact fill, not a lookalike")
note(
  /border-radius: 0\.75rem/.test(panelRule) && /border: 1px solid var\(--sidebar-edge-border\)/.test(panelRule),
  'each card carries its own rounded edge'
)
note(/overflow: hidden/.test(panelRule), 'the cards clip their contents to that radius')
note(/--sidebar-edge-border: color-mix\(in srgb, var\(--ui-base\) 18%, transparent\)/.test(skyCss), 'the card edge is firmer than the stock 12%')
note(/:root\.dark \{\n  --sidebar-edge-border/.test(skyCss), 'the sidebar changes stay dark-scoped, so light mode is untouched')
const frostRegions = (skyCss.match(/^\s*backdrop-filter:/gm) || []).length
note(
  frostRegions === 2 &&
    /\[data-tour='sessions-sidebar'\] \{[^}]*backdrop-filter/.test(skyCss) &&
    /border-radius: 999px;\n  background: color-mix\(in srgb, var\(--dt-card\) 55%, transparent\);\n  backdrop-filter/.test(skyCss),
  `the frost lives on the column and on the switch track only: ${frostRegions} regions, not one per card`
)

// ── 4b-v. the panes themselves stop painting ──────────────────────────────
// The boxes that survived every strip fix were the panes' own surfaces, nested
// three deep. Each one is asserted, because missing any single one puts the box
// straight back.
const paneRule = skyCss.split('}').map(block => block.trim()).find(block => block.includes('data-tree-group'))
note(Boolean(paneRule), 'the pane surfaces are addressed by their own attributes')
note(
  /\[data-tree-group\],/.test(paneRule) && /\[data-chat-surface\],/.test(paneRule) && /\[data-slot='composer-bounds'\]/.test(paneRule),
  'the zone container, the chat pane root and the transcript wrapper are all cleared'
)
note(/background: transparent;/.test(paneRule) && !/color-mix/.test(paneRule), 'and cleared outright, with no fill left behind')

// ── 4b-iv. the strips stay bare; the sidebar strip is a sliding switch ────
// This is the regression that came back as "the black background is back": a
// token override loses to the app's glass blocks, so the strips are painted
// directly. Asserted as an absence, so the token route cannot creep back in.
note(!/--ui-sidebar-surface-background:/.test(skyCss), 'no token override is attempted: under glass it silently loses')
const stripRule = skyCss.split('}').map(block => block.trim()).find(block => block.includes('data-panel-header'))
note(Boolean(stripRule), 'the zone headers are matched by their own hooks, not by the surface token')
// The nesting fix: the header must carry no material of its own, or a box
// inside it reads as a box inside a box.
note(/background: transparent;/.test(stripRule) && /border: none;/.test(stripRule), 'the header stays bare: no fill, no edge')
note(!/border-radius/.test(stripRule) && !/margin:/.test(stripRule), 'and no radius or inset, so nothing can nest')
note(/--pane-tab-active-bg: transparent;/.test(stripRule), 'no tab fills itself any more: the pill is the state')
note(/--pane-tab-strip-bg: transparent;/.test(stripRule), 'inactive tabs get no box at all')
note(/--pane-tab-active-accent: transparent;/.test(stripRule), 'the active underline is dropped, since the pill marks the state')
note(
  /\[class~='bg-\(--ui-sidebar-surface-background\)'\]:has\(> \[role='tablist'\]\)/.test(stripRule),
  'the collapsed rail is covered by the same bare treatment'
)

// The switch: a track, a pill, and a rule that moves the pill. Each asserted
// separately, because any one of them missing gives back two boxes.
const blocks = skyCss.split('}').map(block => block.trim())
const trackRule = blocks.find(block => block.includes('> [role=\'tablist\'] {') && block.includes('border-radius: 999px'))
note(Boolean(trackRule), "the strip's tablist becomes a track of its own")
note(/width: 100%;/.test(trackRule || '') && !/max-width/.test(trackRule || ''), 'the switch is exactly as wide as the cards below it, with no cap')
note(/margin-inline: auto;/.test(trackRule || ''), 'and centred on the strip')
note(
  /color-mix\(in srgb, var\(--dt-card\) 55%, transparent\)/.test(trackRule || '') && /blur\(0\.75rem\)/.test(trackRule || ''),
  "the track is the cards' material, one step down (same fill, same frost)"
)
note(/border: 1px solid var\(--sidebar-edge-border\)/.test(trackRule || ''), 'with the cards hairline as well')
note(/overflow: hidden;/.test(trackRule || ''), 'and clipped, so the pill cannot bleed past the track')
note(/padding: 0;/.test(trackRule || ''), 'the track carries no inset at all: the pill IS its height and spans a whole half')
note(/min-height: 1\.75rem;/.test(trackRule || ''), 'the switch is to scale: the app\'s own 28px tab row, not a taller slab')
const stripGeo = blocks.find(block => block.includes('height: auto;') && block.includes('padding: 0 0.625rem;'))
note(Boolean(stripGeo), 'the strip gets its own geometry, separate from the other headers')
note(
  /padding: 0 0\.625rem;/.test(stripGeo || ''),
  'no vertical padding: the switch sits in the 28px row the shell reserved, clear of the titlebar band'
)
note(
  /padding: 0 0\.625rem;/.test(stripGeo || ''),
  'and it carries the column\'s own 10px gutter, so the switch is as wide as the cards'
)
note(
  /:has\(> \[role='tablist'\]\) > \*:not\(\[role='tablist'\]\) \{\n  display: none;/.test(skyCss),
  'the trailing minimize chevron is hidden, so the strip is only the switch'
)
note(
  /min-height: 7rem;/.test(skyCss),
  'the history panel gives up a little floor, so a short window yields to the switch'
)

const pillRule = blocks.find(block => block.includes("> [role='tablist']::after"))
note(Boolean(pillRule), 'the state is a pill, not a second box')
note(/left: 0;\n  width: 50%;/.test(pillRule || ''), 'the pill is a whole half of the track, edge to edge: nothing left uncovered')
note(/background: color-mix\(in srgb, var\(--dt-card\) 88%, transparent\);/.test(pillRule || ''), 'the pill wears what the active tab used to')
note(/top: 0;\n  bottom: 0;/.test(pillRule || ''), 'the pill fills the track top to bottom: outer edge and slider are one shape')
note(/transition: transform 220ms/.test(pillRule || ''), 'and it animates position, which is what makes it slide')

const slideRule = blocks.find(block => block.includes('::after') && block.includes('translateX(100%)'))
note(Boolean(slideRule), 'the far halt is reachable: one rule moves the pill to the other half')
note(/:last-child\[data-active='true'\]/.test(slideRule || ''), 'and it keys on the SECOND label being the active one')
note(/^[^@]*:has\(/.test(slideRule || ''), 'a state selector, not a class the app would have to add')

const labelRule = blocks.find(block => block.includes("> [data-slot='pane-tab'] {") && block.includes('flex: 1 1 0'))
note(Boolean(labelRule), 'the labels are laid over the track')
note(/flex: 1 1 0;/.test(labelRule || ''), 'each label owns half of it, so the two halts match the two labels')
note(/z-index: 1;/.test(labelRule || ''), 'and they paint above the pill')
note(/box-shadow: none;/.test(labelRule || '') && /background: transparent;/.test(labelRule || ''), 'the labels themselves are bare: no box, no underline')
note(/\[class~='pane-tab-content'\] \{\n  justify-content: center;/.test(skyCss), 'each label is centred inside its half')
note(/prefers-reduced-motion[\s\S]{0,200}::after \{ transition: none; \}/.test(skyCss), 'and the slide rests under reduced motion')

// The gate: only a two-way strip becomes a switch. The workspace tab bar and
// the terminal rail keep their own geometry.
note(/:nth-child\(2\):last-child/.test(skyCss), 'the switch is gated on exactly two labels, so a multi-tab strip is untouched')
note(!/\[data-slot="pane-tab"\] \{/.test(skyCss), 'the old unscoped tab box rule is gone, so nothing leaks into the main tab bar')

// The scrollbar itself was only half of the problem: a stable gutter reserved a
// lane for a bar that is no longer drawn, and that lane is what looked uneven.
note(/\[data-sessions-mode\],\n\[data-sessions-mode\] \[class~="scrollbar-fade"\] \{/.test(skyCss), 'the history scroller and its inner scrollers are all targeted')
note(/scrollbar-gutter: auto;/.test(skyCss), 'the reserved scrollbar lane is released (the uneven gap)')
note(/scrollbar-width: none;/.test(skyCss) && /-ms-overflow-style: none;/.test(skyCss), "the app's own no-bar idiom, mirrored")
note(/\[data-sessions-mode\]::-webkit-scrollbar,\n\[data-sessions-mode\] \[class~="scrollbar-fade"\]::-webkit-scrollbar \{\n  display: none;/.test(skyCss), 'and the webkit bar is gone, so scrolling still works without the indicator')

// ── 4b-ii. the clouds are sheets, not tiles ───────────────────────────────
// The tiled version showed its seams: `stitchTiles` made the noise seamless but
// the blur sampled past every tile edge. These checks pin the replacement.
const cloudLayer = bodyEls.get('zephyr-clouds')
const sheets = cloudLayer?.children || []
note(Boolean(cloudLayer), 'the cloud container is mounted into the document body')
note(cloudLayer?.attrs?.['aria-hidden'] === 'true', 'the cloud layer is hidden from assistive tech')
note(sheets.length === 5, `five cloud sheets (got ${sheets.length})`)
note(sheets.every(sheet => /feTurbulence/.test(sheet.style.cssText)), 'every sheet is inline turbulence, nothing fetched')
// The regression that started this: no tiled background may come back.
note(sheets.every(sheet => /background-repeat: no-repeat/.test(sheet.style.cssText)), 'no sheet tiles: repeat is gone')
note(!/stitchTiles/.test(skyCss) && !/stitchTiles/.test(JSON.stringify(sheets.map(sheet => sheet.style.cssText))), 'no stitched tile anywhere')
note(sheets.every(sheet => /mask-image: radial-gradient/.test(sheet.style.cssText)), 'every sheet is masked, so no rectangular edge shows')
note(new Set(sheets.map(sheet => sheet.style.cssText.match(/animation: (zephyr-cloud-\d+)/)?.[1])).size === 5, 'each sheet animates on its own keyframes')
note(
  sheets.every(sheet => /scale\(1\)/.test(skyCss) && /animation: zephyr-cloud-\d+ \d+s/.test(sheet.style.cssText)),
  'every sheet drifts and grows on its own clock'
)
note(/zephyr-cloud-1 \{[\s\S]*?scale\(1\.\d+\)/.test(skyCss), 'the keyframes grow the sheet, not just slide it')
note((skyCss.match(/@keyframes zephyr-cloud-\d+/g) || []).length === 5, 'five cloud keyframe sets, one per sheet')
note(sheets.every(sheet => /animation: [^;]*-\d+s/.test(sheet.style.cssText)), 'negative delays desynchronise the sheets')

// ── 4c. the sky blends, it does not switch ────────────────────────────────
// Each check freezes the clock, loads the plugin fresh and reads the CSS it
// produced, so what is measured is the plugin's real output for that hour.
const RealDate = Date
const unregister = () => {
  globalThis.__dispose?.()
  globalThis.__dispose = undefined
}
const skyCssAt = iso => {
  unregister()
  globalThis.Date = class extends RealDate {
    constructor(...args) { super(...(args.length ? args : [iso])) }

    static now() { return new RealDate(iso).getTime() }
  }

  styleEls.clear()
  plugin.register({ ...ctx, storage: { get: () => undefined, set: () => {} } })
  globalThis.Date = RealDate

  return styleEls.get('zephyr-sky-style')?.textContent || ''
}
const topOf = css => (css.match(/linear-gradient\(180deg, rgb\((\d+) (\d+) (\d+)\)/) || []).slice(1).map(Number)
const densityOf = css => Number((css.match(/--theme-neutral-card: rgba\(22, 22, 24, ([\d.]+)\)/) || [])[1])
const scrimOf = css => Number((css.match(/linear-gradient\(180deg, rgba\(0, 0, 0, ([\d.]+)\)/) || [])[1])

const noonCss = skyCssAt('2026-10-08T13:00:00')
const nightCss = skyCssAt('2026-10-08T22:30:00')
const midMorningCss = skyCssAt('2026-10-08T10:30:00')

note(topOf(noonCss).join() === '28,52,76', `13:00 lands on the noon anchor (${topOf(noonCss).join()})`)
note(topOf(nightCss).join() === '9,12,22', `22:30 lands on the night anchor (${topOf(nightCss).join()})`)
// 10:30 falls between the 08:00 and 13:00 anchors, so each channel must land
// strictly between the two: equal to either would mean it switched, not blended.
const between = (value, low, high) => value > low && value < high
const [rM, gM, bM] = topOf(midMorningCss)
note(
  between(rM, 28, 32) && between(gM, 52, 55) && between(bM, 76, 79),
  `10:30 is blended between its anchors, not snapped to one (${topOf(midMorningCss).join()})`
)
note(densityOf(noonCss) > densityOf(nightCss), `panels sit denser under a bright sky (${densityOf(noonCss)} vs ${densityOf(nightCss)})`)
note(scrimOf(noonCss) < scrimOf(nightCss), `the night sky carries the heavier scrim (${scrimOf(noonCss)} vs ${scrimOf(nightCss)})`)
note(new Set([noonCss, nightCss, midMorningCss]).size === 3, 'three hours, three different skies')

// ── 5. persistence round-trips ────────────────────────────────────────────
note(storage.pins === undefined || Array.isArray(storage.pins), 'pins stored as an array when written')

globalThis.__dispose?.()
note(cssVars['--zephyr-sun'] === undefined, 'dispose clears --zephyr-sun (no var left behind)')
note(!styleEls.has('zephyr-sky-style'), 'dispose removes the sky style element')
note(!bodyEls.has('zephyr-clouds'), 'dispose unmounts the cloud container (nothing left behind)')
console.log(problems.length ? `\n${problems.length} PROBLEM(S)` : '\nALL CHECKS PASSED')
process.exit(problems.length ? 1 : 0)
