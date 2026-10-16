/**
 * Zephyr — light that follows the clock, plus snippet cards you can keep.
 *
 * Loaded as a RUNTIME plugin from <HERMES_HOME>/desktop-plugins/zephyr/plugin.js:
 * plain ESM, imports rewritten to the app's SDK/react shims, registered through
 * the same contribution areas the built-in UI uses. Nothing here forks the app,
 * so an update cannot revert it.
 *
 * Three of Peter's asks, each landed on the cheapest existing mechanism:
 *   1. time-of-day look  -> four contributed themes + a clock that applies one
 *   2. snippet boxes     -> a `::snippet{...}` transcript directive (copy/pin)
 *   3. less chrome       -> icon-free, one-row-per-thing cards; the pin roster
 *                           lives in settings rather than on the surface
 *
 * What it deliberately does NOT do: paint a full-bleed sky behind the
 * transcript. A theme carries colours and type, not scenery, and the backdrop
 * is a core component (`components/Backdrop.tsx`). A theme's `customCSS` is the
 * hook we would test for that, separately.
 */

import { atom, ListRow, requestTheme, setAccentOverride, Tip, ToggleRow, useValue } from '@hermes/plugin-sdk'
import { jsx, jsxs } from 'react/jsx-runtime'

const THEMES_AREA = 'themes'
const DIRECTIVE_AREA = 'transcript.directives'

const STORE_KEYS = { auto: 'auto', pins: 'pins', tint: 'tint', sky: 'sky' }

// ── Theme palettes ─────────────────────────────────────────────────────────
// Hermes keeps its amber; the ground shifts with the hour. Four phases, four
// grounds, one accent family — the same app in different light.

const PHASES = ['dawn', 'day', 'dusk', 'night']

// Surfaces carry ALPHA on purpose: the sky below is the ground now, and an
// opaque fill would hide it. Text, borders, accent and rings stay opaque, so
// legibility never depends on what the sky is doing. The accent follows the sky
// per phase — a cool blue at noon instead of a permanent amber — while the ink
// ground keeps it Hermes.
const GROUNDS = {
  dawn: {
    background: 'rgba(30, 26, 44, 0.72)', foreground: '#ece9f4', card: 'rgba(38, 32, 54, 0.68)', cardForeground: '#ece9f4',
    muted: 'rgba(52, 44, 70, 0.55)', mutedForeground: '#c3bcd4', popover: 'rgba(34, 29, 48, 0.88)', popoverForeground: '#ece9f4',
    primary: '#e8a07a', primaryForeground: '#20161a', secondary: 'rgba(60, 50, 78, 0.55)', secondaryForeground: '#ddd7e8',
    accent: '#e8a07a', accentForeground: '#20161a', border: '#3b3450', input: 'rgba(52, 44, 70, 0.55)', ring: '#e8a07a',
    destructive: '#d9534f', destructiveForeground: '#fff5f5',
    sidebarBackground: 'rgba(26, 22, 38, 0.60)', sidebarBorder: '#332c47', userBubble: 'rgba(46, 39, 62, 0.62)', userBubbleBorder: '#3a3350'
  },
  day: {
    background: 'rgba(19, 28, 42, 0.72)', foreground: '#e6eefa', card: 'rgba(26, 37, 54, 0.68)', cardForeground: '#e6eefa',
    muted: 'rgba(38, 52, 74, 0.55)', mutedForeground: '#a9bccf', popover: 'rgba(23, 33, 48, 0.88)', popoverForeground: '#e6eefa',
    primary: '#9dc4e8', primaryForeground: '#0f1a26', secondary: 'rgba(44, 60, 84, 0.55)', secondaryForeground: '#d5e2f0',
    accent: '#9dc4e8', accentForeground: '#0f1a26', border: '#2c3f57', input: 'rgba(38, 52, 74, 0.55)', ring: '#9dc4e8',
    destructive: '#d9534f', destructiveForeground: '#fff5f5',
    sidebarBackground: 'rgba(16, 24, 36, 0.60)', sidebarBorder: '#25374d', userBubble: 'rgba(32, 44, 62, 0.62)', userBubbleBorder: '#314661'
  },
  dusk: {
    background: 'rgba(36, 22, 30, 0.72)', foreground: '#f4e8e8', card: 'rgba(46, 28, 38, 0.68)', cardForeground: '#f4e8e8',
    muted: 'rgba(60, 36, 46, 0.55)', mutedForeground: '#d0b4b8', popover: 'rgba(42, 25, 34, 0.88)', popoverForeground: '#f4e8e8',
    primary: '#f0934e', primaryForeground: '#25150f', secondary: 'rgba(68, 42, 52, 0.55)', secondaryForeground: '#e8d6d8',
    accent: '#f0934e', accentForeground: '#25150f', border: '#462c38', input: 'rgba(60, 36, 46, 0.55)', ring: '#f0934e',
    destructive: '#e05a52', destructiveForeground: '#fff5f5',
    sidebarBackground: 'rgba(31, 19, 26, 0.60)', sidebarBorder: '#3e2833', userBubble: 'rgba(54, 33, 43, 0.62)', userBubbleBorder: '#482f3b'
  },
  night: {
    background: 'rgba(10, 14, 24, 0.74)', foreground: '#dee5f2', card: 'rgba(17, 23, 36, 0.68)', cardForeground: '#dee5f2',
    muted: 'rgba(28, 36, 54, 0.55)', mutedForeground: '#94a1b8', popover: 'rgba(15, 20, 32, 0.88)', popoverForeground: '#dee5f2',
    primary: '#b9c7e8', primaryForeground: '#10141f', secondary: 'rgba(34, 42, 62, 0.55)', secondaryForeground: '#cdd6e8',
    accent: '#b9c7e8', accentForeground: '#10141f', border: '#28324a', input: 'rgba(28, 36, 54, 0.55)', ring: '#b9c7e8',
    destructive: '#c9564f', destructiveForeground: '#fff5f5',
    sidebarBackground: 'rgba(12, 17, 28, 0.60)', sidebarBorder: '#222b41', userBubble: 'rgba(26, 34, 50, 0.62)', userBubbleBorder: '#2e3952'
  }
}

const PHASE_ACCENT = { dawn: '#e8a07a', day: '#9dc4e8', dusk: '#f0934e', night: '#b9c7e8' }

// ── The sky ────────────────────────────────────────────────────────────────
// A photograph would need a core change, so this is a painted sky: nothing to
// download, nothing left behind.
//
// WHERE it is painted matters. A `body::before` layer sits in normal paint
// order and a positioned app shell can cover it, which is how the first attempt
// produced nothing visible. The document's own background on `html` is the one
// layer no app surface can cover, so the sky goes there, with the app's
// deliberately-translucent grounds sitting on top of it.
//
// The plugin owns this <style> element rather than riding the theme's
// `customCSS`: one owner, one lifecycle (removed on unload and when the toggle
// is off), and no dependence on which theme is active.
const SKY_STYLE_ID = 'zephyr-sky-style'

// The sky is INTERPOLATED, not switched. Each anchor is the palette at one hour;
// the sky at any moment is a blend of the two anchors around it, with a
// smoothstep so there is no visible kink as it passes an anchor. The clock
// rewrites the style every minute, so a smooth function sampled once a minute
// reads as continuous drift.
//
// `exposure` is the day's light level (0 = night, 1 = noon) and drives two
// things: how heavy the scrim over the sky is, and how dense the panels sit
// above it. Brighter sky, denser panels, so text never has to fight the light.
const SKY_ANCHORS = [
  // hour, top, mid, low, horizon, base, orb, orbAlpha, exposure
  { hour: 5, top: [36, 30, 58], mid: [68, 58, 92], low: [121, 84, 102], horizon: [168, 115, 95], base: [51, 41, 74], orb: [255, 196, 150], orbAlpha: 0.22, exposure: 0.25 },
  { hour: 8, top: [32, 55, 79], mid: [47, 83, 117], low: [79, 126, 164], horizon: [140, 180, 205], base: [49, 85, 111], orb: [255, 250, 230], orbAlpha: 0.16, exposure: 0.72 },
  { hour: 13, top: [28, 52, 76], mid: [43, 79, 112], low: [74, 121, 158], horizon: [150, 190, 214], base: [45, 80, 106], orb: [255, 252, 240], orbAlpha: 0.18, exposure: 1 },
  { hour: 17.5, top: [41, 29, 56], mid: [75, 41, 60], low: [135, 64, 63], horizon: [196, 110, 66], base: [74, 42, 53], orb: [255, 158, 88], orbAlpha: 0.26, exposure: 0.62 },
  { hour: 20, top: [24, 18, 36], mid: [40, 26, 44], low: [72, 38, 48], horizon: [110, 60, 52], base: [40, 26, 33], orb: [255, 140, 80], orbAlpha: 0.2, exposure: 0.3 },
  { hour: 22.5, top: [9, 12, 22], mid: [16, 24, 40], low: [24, 34, 58], horizon: [34, 46, 74], base: [19, 27, 44], orb: [210, 224, 255], orbAlpha: 0.16, exposure: 0.12 }
]

const FIRST_ANCHOR_HOUR = SKY_ANCHORS[0].hour
// Repeat the first anchor a day later so a late-night hour has a pair to blend
// against instead of falling off the end.
const ANCHORS = [...SKY_ANCHORS, { ...SKY_ANCHORS[0], hour: SKY_ANCHORS[0].hour + 24 }]

const lerp = (a, b, t) => a + (b - a) * t
const blendRgb = (a, b, t) => a.map((value, index) => Math.round(lerp(value, b[index], t)))
const cssRgb = ([r, g, b]) => `rgb(${r} ${g} ${b})`
const cssRgba = ([r, g, b], alpha) => `rgba(${r}, ${g}, ${b}, ${alpha})`

const skyAt = date => {
  const hour = date.getHours() + date.getMinutes() / 60
  const wrapped = hour < FIRST_ANCHOR_HOUR ? hour + 24 : hour

  let index = 0

  while (index < ANCHORS.length - 2 && wrapped >= ANCHORS[index + 1].hour) index += 1

  const from = ANCHORS[index]
  const to = ANCHORS[index + 1]
  const raw = (wrapped - from.hour) / (to.hour - from.hour)
  const t = Math.min(Math.max(raw, 0), 1)
  const eased = t * t * (3 - 2 * t)

  return {
    top: blendRgb(from.top, to.top, eased),
    mid: blendRgb(from.mid, to.mid, eased),
    low: blendRgb(from.low, to.low, eased),
    horizon: blendRgb(from.horizon, to.horizon, eased),
    base: blendRgb(from.base, to.base, eased),
    orb: blendRgb(from.orb, to.orb, eased),
    orbAlpha: lerp(from.orbAlpha, to.orbAlpha, eased),
    exposure: lerp(from.exposure, to.exposure, eased)
  }
}

// Clouds: fractal turbulence in inline SVGs, one per sheet. Tiling is gone on
// purpose. `stitchTiles` can make the noise itself seamless, but the blur that
// softens it samples beyond each tile, so the seam came back at every edge.
// Instead each sheet is a single non-repeating frame, masked to a soft circle,
// and moved and scaled by its own animation. Nothing repeats, so there is no
// edge to see.
// The alpha row is steep on purpose: channels sum to roughly 1.5 on average, so
// `0.62 * sum - 1` leaves everything below sum 1.6 fully transparent and only
// the brighter noise opaque. A gentler mapping turns the sheet into a flat white
// veil; this one leaves distinct patches with gaps between them, which is what
// reads as cloud rather than haze.
const cloudSvg = ({ seed, frequency, octaves }) =>
  `url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='700' height='700'><filter id='f'><feTurbulence type='fractalNoise' baseFrequency='${frequency}' numOctaves='${octaves}' seed='${seed}'/><feColorMatrix type='matrix' values='0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  0.62 0.62 0.62 0 -1'/><feGaussianBlur stdDeviation='7'/></filter><rect width='700' height='700' filter='url(%23f)'/></svg>")`

// Five sheets, no two alike: different noise, size, place, speed and growth, so
// they never read as one texture sliding. Negative delays start each already
// mid-drift instead of all breathing in unison.
const CLOUDS = [
  { seed: 3, frequency: '0.004 0.008', octaves: 4, at: [-12, 2], size: [88, 72], opacity: 0.3, duration: 300, delay: -40, drift: [14, 5], grow: 1.18 },
  { seed: 17, frequency: '0.006 0.012', octaves: 4, at: [44, -14], size: [74, 62], opacity: 0.26, duration: 420, delay: -180, drift: [-12, 6], grow: 1.24 },
  { seed: 29, frequency: '0.009 0.016', octaves: 4, at: [6, 40], size: [62, 48], opacity: 0.22, duration: 240, delay: -95, drift: [10, -4], grow: 1.3 },
  { seed: 41, frequency: '0.005 0.009', octaves: 4, at: [58, 34], size: [68, 56], opacity: 0.2, duration: 360, delay: -230, drift: [-9, -6], grow: 1.16 },
  { seed: 7, frequency: '0.007 0.013', octaves: 4, at: [26, -10], size: [54, 44], opacity: 0.18, duration: 480, delay: -300, drift: [8, 7], grow: 1.22 }
]
const CLOUD_LAYER_ID = 'zephyr-clouds'

const cloudCss = () =>
  CLOUDS.flatMap((cloud, index) => [
    `@keyframes zephyr-cloud-${index + 1} {`,
    `  0% { transform: translate3d(0, 0, 0) scale(1); opacity: ${(cloud.opacity * 0.7).toFixed(3)}; }`,
    `  50% { transform: translate3d(${cloud.drift[0]}vw, ${cloud.drift[1]}vh, 0) scale(${cloud.grow}); opacity: ${cloud.opacity.toFixed(3)}; }`,
    `  100% { transform: translate3d(0, 0, 0) scale(1); opacity: ${(cloud.opacity * 0.75).toFixed(3)}; }`,
    '}'
  ])

// The sheets are real elements rather than background layers: each one needs its
// own transform, and a container is the only place to put several of them. They
// are mounted once and left alone, so the per-minute style rewrite carries only
// the sky, never the clouds.
const mountClouds = () => {
  if (typeof document === 'undefined' || !document.body) return
  if (document.getElementById(CLOUD_LAYER_ID)) return

  const layer = document.createElement('div')
  layer.id = CLOUD_LAYER_ID
  layer.setAttribute('aria-hidden', 'true')

  CLOUDS.forEach((cloud, index) => {
    const sheet = document.createElement('span')

    sheet.className = 'zc'
    sheet.style.cssText = [
      `left: ${cloud.at[0]}vw`,
      `top: ${cloud.at[1]}vh`,
      `width: ${cloud.size[0]}vw`,
      `height: ${cloud.size[1]}vh`,
      `background-image: ${cloudSvg(cloud)}`,
      'background-repeat: no-repeat',
      'background-size: 100% 100%',
      // No CSS blur here on purpose: the SVG filter already softens the noise,
      // and a second blur pass over a full-window layer is real raster work.
      // The mask is what makes a sheet read as a cloud instead of a rectangle:
      // the noise fades to nothing well before the box ends.
      '-webkit-mask-image: radial-gradient(closest-side, #000 28%, transparent 100%)',
      'mask-image: radial-gradient(closest-side, #000 28%, transparent 100%)',
      `animation: zephyr-cloud-${index + 1} ${cloud.duration}s ease-in-out ${cloud.delay}s infinite`
    ].join('; ')

    layer.appendChild(sheet)
  })

  document.body.appendChild(layer)
}

const clearClouds = () => {
  if (typeof document === 'undefined') return
  const layer = document.getElementById(CLOUD_LAYER_ID)

  // The layer is ours, not the app's, so it leaves with us.
  if (layer) layer.remove()
}

// The sidebar's own strip: a header on the sidebar surface that owns a tablist.
// The workspace tab bar and the terminal rail do not match it.
const STRIP_HOOK = "[class~='bg-(--ui-sidebar-surface-background)']:has(> [role='tablist'])"

// Only a two-way strip becomes a switch — SESSIONS | BOTS. A three-way strip
// falls back to the app's own tabs rather than getting a pill that cannot land.
const SWITCH_HOOK = `${STRIP_HOOK}:has(> [role='tablist'] > [data-slot='pane-tab']:nth-child(2):last-child)`

const skyStyleFor = date => {
  const sky = skyAt(date)
  const scrim = ((1 - sky.exposure) * 0.2).toFixed(3)
  // Panels get denser as the sky gets brighter; the neutrals are the app's own
  // quality knob, and making them translucent is what lets the sky read through.
  const density = (0.55 + 0.35 * sky.exposure).toFixed(3)

  return [
    `/* Zephyr sky. Blended for ${date.getHours()}:${String(date.getMinutes()).padStart(2, '0')}, exposure ${sky.exposure.toFixed(2)}. */`,
    'html {',
    `  background-color: ${cssRgb(sky.base)};`,
    '}',
    // The app's own ground is `body { background: var(--ui-chat-surface-background) }`,
    // and that chrome colour is a color-mix whose second input is an OPAQUE
    // neutral, which caps how transparent it can ever be. Clearing body's
    // background is the lever that lets the sky be the ground.
    'body { background: transparent; }',
    // The app's own "Chat Backdrop" (Settings > Appearance) is the faint statue
    // image behind the conversation. Against a sky it reads as dirt on the
    // glass, so it rests while the sky is on.
    "img[src*='filler-bg0'] { display: none; }",
    // Negative z-index is the whole trick: these layers paint above the canvas
    // but below every in-flow app surface, so no panel has to be restyled for
    // them, and nothing can cover them.
    'html::before {',
    "  content: ''; position: fixed; inset: 0; z-index: -1; pointer-events: none;",
    '  background-image: radial-gradient(150% 80% at 50% 0%, transparent 42%, rgba(0, 0, 0, 0.34) 100%),',
    `    radial-gradient(120% 55% at 28% 98%, ${cssRgba(sky.horizon, 0.28)} 0%, transparent 70%),`,
    `    linear-gradient(180deg, rgba(0, 0, 0, ${scrim}), rgba(0, 0, 0, ${scrim})),`,
    `    linear-gradient(180deg, ${cssRgb(sky.top)} 0%, ${cssRgb(sky.mid)} 32%, ${cssRgb(sky.low)} 62%, ${cssRgb(sky.horizon)} 88%, ${cssRgb(sky.horizon)} 100%);`,
    '}',
    // The cloud sheets live in their own container: behind every app surface,
    // above the sky, and clear of clicks.
    `#${CLOUD_LAYER_ID} {`,
    '  position: fixed; inset: 0; z-index: -1; overflow: hidden; pointer-events: none;',
    '}',
    '.zc { position: absolute; will-change: transform, opacity; }',
    ...cloudCss(),
    'body::before {',
    "  content: ''; position: fixed; left: 50%; width: 62vmax; height: 62vmax;",
    '  transform: translateX(-50%); pointer-events: none; z-index: -1;',
    '  top: calc(var(--zephyr-sun, 40) * 1%);',
    '  transition: top 240s linear;',
    `  background: radial-gradient(circle, ${cssRgba(sky.orb, sky.orbAlpha)} 0%, transparent 62%);`,
    '}',
    // Panel density, and it is deliberately mode-scoped: Zephyr's phases are
    // dark palettes, and a light-mode app would not want a translucent ground.
    ':root.dark {',
    `  --theme-neutral-chrome: rgba(13, 13, 14, ${density});`,
    `  --theme-neutral-sidebar: rgba(10, 10, 11, ${density});`,
    `  --theme-neutral-card: rgba(22, 22, 24, ${density});`,
    '}',
    // The sidebar, as a stack of floating panels. The column itself goes
    // transparent and drops its edge, and each region inside it becomes a card
    // in the composer's clothes: `--dt-card` at 88% plus the 0.75rem frost,
    // both lifted from the input bar. The gaps between cards show the frosted
    // sky, which is what makes the column read as floating pieces rather than
    // one strip. `:has(input)` is how the search row is named: it is the only
    // region in the column holding an input.
    ':root.dark {',
    '  --sidebar-edge-border: color-mix(in srgb, var(--ui-base) 18%, transparent);',
    '}',
    "[data-tour='sessions-sidebar'] {",
    '  background: transparent;',
    '  border-color: transparent;',
    '  backdrop-filter: blur(0.75rem) saturate(1.08);',
    '  -webkit-backdrop-filter: blur(0.75rem) saturate(1.08);',
    '}',
    "[data-slot='sidebar-content'] {",
    '  gap: 0.5rem;',
    '  padding-top: var(--titlebar-height, 2.25rem);',
    '  padding-bottom: 0.5rem;',
    '}',
    /* The first card carries the titlebar padding by default, which would run it
       up behind the window controls. The column holds that space instead. */
    "[data-slot='sidebar-content'] > [data-slot='sidebar-group'] { padding-top: 0.375rem; }",
    "[data-slot='sidebar-content'] > [data-slot='sidebar-group'],",
    "[data-slot='sidebar-content'] > [data-sessions-mode],",
    "[data-slot='sidebar-content'] > div:has(input),",
    "[data-slot='sidebar-content'] > div:last-child {",
    '  background: color-mix(in srgb, var(--dt-card) 88%, transparent);',
    '  border: 1px solid var(--sidebar-edge-border);',
    '  border-radius: 0.75rem;',
    '  overflow: hidden;',
    '}',
    // Every pane paints a surface, and they nest: the zone container
    // (`data-tree-group`, the editor surface), then the chat pane root
    // (`data-chat-surface`), then the transcript wrapper. Clearing only the
    // header left the pane's own surface behind it, which is the box that
    // survived every previous attempt. All three go transparent, so the sky is
    // the ground everywhere and only the sidebar cards and the active tab are
    // painted.
    '[data-tree-group],',
    '[data-chat-surface],',
    "[data-slot='composer-bounds'] {",
    '  background: transparent;',
    '}',
    // The zone headers (the tab bar and the SESSIONS | BOTS strip) stay BARE:
    // no fill, no edge, no radius. A card on the header AND a box on the tab
    // inside it read as a box in a box, which is what the nesting complaint was.
    // Only the tab carries the material, so the header is just sky.
    //
    // These tokens are set on the header rather than the tab, because the tab's
    // fill is token-driven: active tabs paint --pane-tab-active-bg, inactive ones
    // --pane-tab-strip-bg, and the active underline is --pane-tab-active-accent.
    // Setting the tokens beats fighting each state's own rule.
    '[data-panel-header],',
    "[class~='group/pane-header'],",
    "[class~='bg-(--ui-sidebar-surface-background)']:has(> [role='tablist']) {",
    '  background: transparent;',
    '  border: none;',
    // The active tab paints nothing of its own: the pill on the track IS the
    // state now, and a tab fill under it would read as a box inside a box.
    '  --pane-tab-active-bg: transparent;',
    '  --pane-tab-strip-bg: transparent;',
    '  --pane-tab-active-accent: transparent;',
    '}',
    // ── SESSIONS | BOTS: one long sliding switch ──────────────────────────
    // Two boxes that trade places read as two buttons. A switch reads as ONE
    // control with two positions, so the strip's tablist becomes a recessed
    // track in the cards' material — long, centred — and the active state is a
    // pill that SLIDES between the halts. The labels never move; only the pill
    // does, which is the whole difference.
    // Only the switch lives on this strip. The app parks a minimize chevron in
    // the strip's trailing slot, and beside a two-position switch it reads as a
    // third control, so the strip is reduced to its tablist. The zone's own menu
    // still minimizes it.
    `${STRIP_HOOK} > *:not([role='tablist']) {`,
    '  display: none;',
    '}',
    // The strip is pinned to the BOTTOM of the header band, which the shell sizes
    // inline at 34px (titlebar) + 28px (tab row) = 62px. Two consequences, and
    // both are why this rule has no vertical padding at all:
    //   - zero bottom padding is what puts the switch in the exact 28px row the
    //     shell reserved for tabs, so it never reaches up into the titlebar band
    //     (a drag region) and nothing clips;
    //   - 10px inline is the column's own `px-2.5`, so the switch is exactly as
    //     wide as the cards underneath instead of wider than them.
    `${STRIP_HOOK} {`,
    '  height: auto;',
    '  padding: 0 0.625rem;',
    '}',
    // The history panel gives up a little floor, so a short window yields list
    // height to the switch instead of clipping it.
    "[data-sessions-mode] [class~='min-h-32'] {",
    '  min-height: 7rem;',
    '}',
    `${SWITCH_HOOK} > [role='tablist'] {`,
    '  position: relative;',
    '  width: 100%;',
    '  min-height: 1.75rem;',
    '  margin-inline: auto;',
    // No inset at all: the pill covers a whole half of the track, edge to edge,
    // so the switch has no uncovered sliver at either end.
    '  padding: 0;',
    '  border: 1px solid var(--sidebar-edge-border);',
    '  border-radius: 999px;',
    // Recessed: the same fill and frost as the cards, one step down, so the
    // pill on top reads as the raised piece.
    '  background: color-mix(in srgb, var(--dt-card) 55%, transparent);',
    '  backdrop-filter: blur(0.75rem) saturate(1.08);',
    '  -webkit-backdrop-filter: blur(0.75rem) saturate(1.08);',
    '  overflow: hidden;',
    '}',
    `${SWITCH_HOOK} > [role='tablist']::after {`,
    "  content: '';",
    '  position: absolute;',
    '  top: 0;',
    '  bottom: 0;',
    '  left: 0;',
    // Half the track, edge to edge, so a halt is the whole side and nothing is
    // left uncovered at either end.
    '  width: 50%;',
    '  border-radius: 999px;',
    '  background: color-mix(in srgb, var(--dt-card) 88%, transparent);',
    '  box-shadow: inset 0 0 0 1px var(--sidebar-edge-border);',
    '  transition: transform 220ms cubic-bezier(0.32, 0.72, 0, 1);',
    '  pointer-events: none;',
    '}',
    // The far halt: the SECOND label is the active one, so the pill rides over.
    `${SWITCH_HOOK} > [role='tablist']:has(> [data-slot='pane-tab']:last-child[data-active='true'])::after {`,
    '  transform: translateX(100%);',
    '}',
    // The labels: equal halves over the track, bare — no box, no underline, no
    // hover wash — and above the pill in paint order.
    `${SWITCH_HOOK} > [role='tablist'] > [data-slot='pane-tab'] {`,
    '  flex: 1 1 0;',
    '  min-width: 0;',
    '  position: relative;',
    '  z-index: 1;',
    '  margin: 0;',
    '  border: none;',
    '  border-radius: 999px;',
    '  background: transparent;',
    '  box-shadow: none;',
    '}',
    `${SWITCH_HOOK} > [role='tablist'] > [data-slot='pane-tab']:hover,`,
    `${SWITCH_HOOK} > [role='tablist'] > [data-slot='pane-tab'][data-active='true'] {`,
    '  background: transparent;',
    '  box-shadow: none;',
    '}',
    `${SWITCH_HOOK} > [role='tablist'] > [data-slot='pane-tab'] [class~='pane-tab-content'] {`,
    '  justify-content: center;',
    '}',
    '@media (prefers-reduced-motion: reduce) {',
    `  ${SWITCH_HOOK} > [role='tablist']::after { transition: none; }`,
    '}',
    // The history scrolls without a scrollbar. `scrollbar-gutter: stable`
    // reserved a lane for a bar that is now hidden, and that reserved lane is
    // what made the column look uneven. Same idiom the app uses on its own
    // strip scrollers, so it stays consistent with the rest of the chrome.
    '[data-sessions-mode],',
    '[data-sessions-mode] [class~="scrollbar-fade"] {',
    '  scrollbar-gutter: auto;',
    '  scrollbar-width: none;',
    '  -ms-overflow-style: none;',
    '}',
    '[data-sessions-mode]::-webkit-scrollbar,',
    '[data-sessions-mode] [class~="scrollbar-fade"]::-webkit-scrollbar {',
    '  display: none;',
    '  width: 0;',
    '  height: 0;',
    '}',
    '@media (prefers-reduced-motion: reduce) { body::before { transition: none; } .zc { animation: none !important; } }'
  ].join('\n')
}

const paintSky = date => {
  if (typeof document === 'undefined') return

  mountClouds()

  let el = document.getElementById(SKY_STYLE_ID)

  if (!el) {
    el = document.createElement('style')
    el.id = SKY_STYLE_ID
    document.head.appendChild(el)
  }

  el.textContent = skyStyleFor(date)
}

const clearSky = () => {
  if (typeof document === 'undefined') return
  const el = document.getElementById(SKY_STYLE_ID)

  if (el) el.remove()
  clearClouds()
}

const phaseThemeName = phase => `zephyr-${phase}`

const themeFor = phase => ({
  name: phaseThemeName(phase),
  label: `Zephyr ${phase[0].toUpperCase()}${phase.slice(1)}`,
  description: `Sky-lit: the ${phase} sky shows through every surface. Zephyr follows the clock.`,
  colors: GROUNDS[phase]
})

const PHASE_BLURB = {
  dawn: 'before eight',
  day: 'working hours',
  dusk: 'evening glow',
  night: 'after nine'
}

function phaseAt(date) {
  const hour = date.getHours()

  if (hour >= 5 && hour < 8) return 'dawn'
  if (hour >= 8 && hour < 17) return 'day'
  if (hour >= 17 && hour < 21) return 'dusk'

  return 'night'
}

// ── Snippet card ───────────────────────────────────────────────────────────
// `::snippet{title="…" value="…" note="…" tone="accent"}`
// A leaf directive on its own line: attrs only, so the card stays a summary and
// the prose around it stays prose. Hark's shape — one calm box, no chrome —
// in Hermes tokens.

const TONES = { accent: 'accent', plain: 'plain' }

// Geometry and colour live in INLINE styles, deliberately. Tailwind compiles
// only the classes the app's own sources use, so a runtime plugin's novel
// utilities (`rounded-[0.875rem]`, `max-w-[34rem]`) never reach the stylesheet
// and silently do nothing — the first cut of this card rendered full-width and
// square because of exactly that. The tokens below are the app's real CSS vars.

const CARD_STYLE = {
  display: 'flex',
  flexDirection: 'column',
  gap: '5px',
  maxWidth: '34rem',
  margin: '4px 0',
  padding: '13px 15px',
  borderRadius: '14px'
}

// One shadow for BOTH variants: a soft ground separation plus a whisper of top
// light. The accent variant earns its distinction from the FILL and the title
// colour instead of a glow — the halo lost to the matte card, and a glow that
// only sometimes appears teaches the eye nothing. The matte treatment is the
// approved look, so nothing here touches it.
const CARD_SHADOW = ['0 8px 24px -16px rgba(0, 0, 0, 0.45)', 'inset 0 1px 0 rgba(255, 255, 255, 0.035)'].join(', ')

const cardStyle = accent =>
  Object.assign({}, CARD_STYLE, {
    background: accent
      ? 'color-mix(in srgb, var(--ui-accent) 5%, var(--ui-widget-surface-background))'
      : 'var(--ui-widget-surface-background)',
    boxShadow: CARD_SHADOW
  })

const TEXT_STYLE = {
  title: { fontSize: '11px', letterSpacing: '0.02em', color: 'var(--ui-text-tertiary)' },
  value: { fontSize: '15px', lineHeight: '1.45', color: 'var(--ui-text-primary)' },
  note: { fontSize: '13px', lineHeight: '1.6', color: 'var(--ui-text-secondary)' },
  source: { fontSize: '11px', color: 'var(--ui-text-tertiary)' }
}

/** Accent carries meaning in the smallest possible place: the label. */
const titleStyle = accent => (accent ? Object.assign({}, TEXT_STYLE.title, { color: 'var(--ui-accent)' }) : TEXT_STYLE.title)

const ACTIONS_STYLE = { display: 'flex', alignItems: 'center', gap: '2px', marginTop: '1px' }

const actionStyle = pinned =>
  Object.assign(
    {
      border: 0,
      background: 'transparent',
      cursor: 'pointer',
      fontFamily: 'inherit',
      fontSize: '11px',
      padding: '2px 5px',
      borderRadius: '6px',
      color: 'var(--ui-text-tertiary)'
    },
    pinned ? { color: 'var(--ui-accent)' } : null
  )

function SnippetCard({ attrs, pins, onPin, onCopy }) {
  const title = attrs.title || ''
  const value = attrs.value || ''
  const note = attrs.note || ''
  const source = attrs.source || ''
  const accent = TONES[attrs.tone] === 'accent'
  const id = `${title}|${value}|${note}`.slice(0, 300)
  const pinned = useValue(pins).some(p => p.id === id)

  const body = [title, value, note, source].filter(Boolean).join(' — ')

  const action = (label, tone, run) =>
    jsx('button', {
      onClick: run,
      style: actionStyle(tone === 'pin' && pinned),
      type: 'button',
      children: label
    })

  return jsxs('div', {
    style: cardStyle(accent),
    children: [
      title ? jsx('div', { style: titleStyle(accent), children: title }) : null,
      value ? jsx('div', { style: TEXT_STYLE.value, children: value }) : null,
      note ? jsx('div', { style: TEXT_STYLE.note, children: note }) : null,
      source ? jsx('div', { style: TEXT_STYLE.source, children: source }) : null,
      jsxs('div', {
        style: ACTIONS_STYLE,
        children: [
          action(pinned ? 'pinned' : 'pin', 'pin', () => onPin({ id, title, value, note, source, body })),
          !pinned ? action('copy', 'copy', () => onCopy(body)) : null
        ]
      })
    ]
  })
}

// ── Clock chip ─────────────────────────────────────────────────────────────
// Inline styles again (same reason as the card), plus one accent dot: a chip
// this quiet was invisible at the far end of the bar, and a lamp reads faster
// than a word.

const CHIP_STYLE = {
  display: 'inline-flex',
  alignItems: 'center',
  height: '100%',
  padding: '0 6px',
  border: 0,
  background: 'transparent',
  cursor: 'pointer',
  fontFamily: 'inherit',
  fontSize: '11px',
  color: 'var(--ui-text-secondary)'
}

const CHIP_ROW_STYLE = { display: 'inline-flex', alignItems: 'center', gap: '6px' }

const DOT_STYLE = { display: 'block', width: '6px', height: '6px', borderRadius: '999px' }

function PhaseChip({ phase, auto, pins, onToggleAuto }) {
  const pinCount = useValue(pins).length
  const isAuto = useValue(auto)
  const current = useValue(phase)
  const label = `${current}${pinCount ? ` · ${pinCount} pinned` : ''}`

  return jsx(Tip, {
    label: isAuto
      ? `Zephyr: theme follows the clock (${PHASE_BLURB[current]}). Click to hold one theme.`
      : 'Zephyr: holding one theme. Click to follow the clock again.',
    children: jsx('button', {
      onClick: onToggleAuto,
      style: CHIP_STYLE,
      type: 'button',
      children: jsxs('span', {
        style: CHIP_ROW_STYLE,
        children: [
          // The dot IS the phase, not a lamp: its colour changes with the hour,
          // so it marks a real state (antislop-ui: a decorative dot is a tell).
          jsx('span', { 'aria-hidden': true, style: Object.assign({}, DOT_STYLE, { background: PHASE_ACCENT[current] }) }),
          jsx('span', { children: label })
        ]
      })
    })
  })
}

export default {
  id: 'zephyr',
  name: 'Zephyr',

  register(ctx) {
    const stored = key => ctx.storage.get(key, undefined)

    const pins = atom(stored(STORE_KEYS.pins) || [])
    const auto = atom(stored(STORE_KEYS.auto) !== false)
    const tint = atom(stored(STORE_KEYS.tint) === true)
    const sky = atom(stored(STORE_KEYS.sky) !== false)
    const phase = atom(phaseAt(new Date()))

    const persist = () => {
      ctx.storage.set(STORE_KEYS.pins, pins.get())
      ctx.storage.set(STORE_KEYS.auto, auto.get())
      ctx.storage.set(STORE_KEYS.tint, tint.get())
      ctx.storage.set(STORE_KEYS.sky, sky.get())
    }

    // The sky needs a position, not just a phase: a straight descent from 05:00
    // (above the fold) to 21:00 (below it), written as the CSS var the orb
    // reads. The orb's own transition supplies the easing, so a tick is cheap.
    const sunTopAt = date => {
      const hour = date.getHours() + date.getMinutes() / 60
      const t = Math.min(Math.max((hour - 5) / 16, 0), 1)

      return Math.round(t * 100 - 10)
    }

    const writeSun = date => {
      if (typeof document === 'undefined') return
      document.documentElement.style.setProperty('--zephyr-sun', String(sunTopAt(date)))
    }

    const apply = now => {
      const next = phaseAt(now)
      phase.set(next)
      writeSun(now)

      if (sky.get()) paintSky(now)
      else clearSky()

      if (!auto.get()) return

      requestTheme(phaseThemeName(next))

      if (tint.get()) setAccentOverride(PHASE_ACCENT[next])
    }

    const tick = () => {
      writeSun(new Date())
      if (phaseAt(new Date()) !== phase.get()) apply(new Date())
    }

    const timer = setInterval(tick, 60_000)
    apply(new Date())

    // ── themes: the medium for "the app changes with the time of day" ──
    for (const name of PHASES) {
      ctx.register({ id: `theme.${name}`, area: THEMES_AREA, order: 40, data: themeFor(name) })
    }

    // ── snippet cards: the medium for "small boxes I can copy and pin" ──
    ctx.register({
      id: 'snippet',
      area: DIRECTIVE_AREA,
      data: {
        name: 'snippet',
        render: ({ attrs }) =>
          jsx(SnippetCard, {
            attrs,
            pins,
            onCopy: text => void navigator.clipboard?.writeText(text),
            onPin: entry =>
              pins.set(pins.get().some(p => p.id === entry.id) ? pins.get().filter(p => p.id !== entry.id) : [...pins.get(), entry])
          })
      }
    })

    // ── one quiet status-bar readout, so the mode is never a mystery ──
    ctx.register({
      id: 'phase-chip',
      area: 'statusBar.right',
      order: 96,
      render: () =>
        jsx(PhaseChip, {
          auto,
          phase,
          pins,
          onToggleAuto: () => {
            const next = !auto.get()
            auto.set(next)
            persist()
            if (next) apply(new Date())
            else setAccentOverride(null)
          }
        })
    })

    // ── settings: the pin roster, and the two switches ──
    ctx.registerSettingsPage?.({
      id: 'zephyr',
      title: 'Zephyr',
      render: function ZephyrSettings() {
        const isAuto = useValue(auto)
        const isTint = useValue(tint)
        const isSky = useValue(sky)
        const nowPhase = useValue(phase)
        const list = useValue(pins)

        return jsxs('div', {
          children: [
            jsx(ToggleRow, {
              checked: isAuto,
              description: `Right now: ${nowPhase} (${PHASE_BLURB[nowPhase]}). Zephyr swaps its four themes as the day moves.`,
              label: 'Follow the clock',
              onChange: on => {
                auto.set(on)
                persist()
                if (on) apply(new Date())
              }
            }),
            jsx(ToggleRow, {
              checked: isSky,
              description: 'A painted sky behind the app, in the phase light. With it off you get a solid ground instead.',
              label: 'Sky',
              onChange: on => {
                sky.set(on)
                persist()
                if (on) paintSky(new Date())
                else clearSky()
              }
            }),
            jsx(ToggleRow, {
              checked: isTint,
              description: 'Warm the accent family on top of whatever theme you are using, by phase.',
              label: 'Tint the accent too',
              onChange: on => {
                tint.set(on)
                persist()
                setAccentOverride(on ? PHASE_ACCENT[phase.get()] : null)
              }
            }),
            jsx(ListRow, {
              description: `Phase right now: ${nowPhase} — ${PHASE_BLURB[nowPhase]}. Zephyr swaps its own four themes; hold any theme from the appearance picker.`,
              title: 'Which light are we in'
            }),
            jsx(ListRow, {
              description: list.length ? 'Pinned with the pin button on any snippet card.' : 'Nothing pinned yet. Pin a card and it lands here.',
              title: `Pinned snippets (${list.length})`,
              action: list.length
                ? jsx('button', {
                    className: 'text-[0.75rem] text-(--ui-text-tertiary) hover:text-(--ui-text-primary)',
                    onClick: () => {
                      pins.set([])
                      persist()
                    },
                    type: 'button',
                    children: 'clear all'
                  })
                : null
            }),
            ...list.map(entry =>
              jsx(ListRow, {
                description: [entry.value, entry.note].filter(Boolean).join(' — '),
                title: entry.title || entry.value || 'snippet',
                action: jsx('button', {
                  className: 'text-[0.75rem] text-(--ui-text-tertiary) hover:text-(--ui-text-primary)',
                  onClick: () => {
                    pins.set(pins.get().filter(p => p.id !== entry.id))
                    persist()
                  },
                  type: 'button',
                  children: 'unpin'
                })
              })
            )
          ]
        })
      }
    })

    // A plugin is a guest: leave the host as we found it when it unloads.
    ctx.onDispose?.(() => {
      clearInterval(timer)
      clearSky()
      if (typeof document !== 'undefined') document.documentElement.style.removeProperty('--zephyr-sun')
    })
  }
}
