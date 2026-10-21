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
 * The sky: a theme carries colours and type, not scenery, so the sky is the
 * plugin's own: the WebGL sky engine in §6, fed by live weather, blurred and
 * dimmed in WebGL. Without WebGL the time-of-day CSS gradient (§5) is the sky.
 *
 * CONTENTS (search for the tag, e.g. "══ §6"):
 *   §1  SETUP & CONSTANTS
 *   §2  MATERIAL, SOLAR TIMES & TIME-OF-DAY COLOURS
 *   §3  STATUS STACK FILLETS
 *   §4  SIDEBAR SWITCH HOOKS & HORIZON OPTICS
 *   §5  APP CSS (skyStyleFor: layout, glass material, every surface)
 *   §5b APP MOTION (always-on interface animation: fold, menus, chat slide)
 *   §6  SKY ENGINE (weather presets, shader, createSky)
 *   §7  SKY PAINTING, THEMES, SOLAR & WEATHER SYNC
 *   §8  SNIPPET CARDS & PHASE CHIP
 *   §9  PLUGIN REGISTRATION (register: settings, timers, observers)
 */

import { atom, Button, Codicon, ListRow, requestTheme, SegmentedControl, Select, SelectContent, SelectItem, SelectTrigger, SelectValue, setAccentOverride, Tip, ToggleRow, useValue } from '@hermes/plugin-sdk'
import { jsx, jsxs } from 'react/jsx-runtime'

// ══ §1 SETUP & CONSTANTS ═══════════════════════════════════════════════════

const THEMES_AREA = 'themes'
const DIRECTIVE_AREA = 'transcript.directives'

const STORE_KEYS = { auto: 'auto', pins: 'pins', tint: 'tint', sky: 'sky', hold: 'hold', look: 'look', margins: 'margins', collapseWork: 'collapseWork', motion: 'motion', glSky: 'glSky', weather: 'weather', quality: 'quality', statusDock: 'statusDock', statusDockOpen: 'statusDockOpen', statusPin: 'statusPin', shelf: 'shelf', library: 'library', libraryOpen: 'libraryOpen', skin: 'skin', skinImage: 'skinImage', phasePin: 'phasePin' }

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
    primary: '#e8a07a', primaryForeground: '#0f172a', secondary: 'rgba(60, 50, 78, 0.55)', secondaryForeground: '#ddd7e8',
    accent: '#e8a07a', accentForeground: '#0f172a', border: '#3b3450', input: 'rgba(52, 44, 70, 0.55)', ring: '#e8a07a',
    destructive: '#d9534f', destructiveForeground: '#fff5f5',
    sidebarBackground: 'rgba(26, 22, 38, 0.60)', sidebarBorder: '#332c47', userBubble: 'rgba(46, 39, 62, 0.62)', userBubbleBorder: '#3a3350'
  },
  day: {
    background: 'rgba(19, 28, 42, 0.72)', foreground: '#e6eefa', card: 'rgba(26, 37, 54, 0.68)', cardForeground: '#e6eefa',
    muted: 'rgba(38, 52, 74, 0.55)', mutedForeground: '#a9bccf', popover: 'rgba(23, 33, 48, 0.88)', popoverForeground: '#e6eefa',
    primary: '#9dc4e8', primaryForeground: '#0f172a', secondary: 'rgba(44, 60, 84, 0.55)', secondaryForeground: '#d5e2f0',
    accent: '#9dc4e8', accentForeground: '#0f172a', border: '#2c3f57', input: 'rgba(38, 52, 74, 0.55)', ring: '#9dc4e8',
    destructive: '#d9534f', destructiveForeground: '#fff5f5',
    sidebarBackground: 'rgba(16, 24, 36, 0.60)', sidebarBorder: '#25374d', userBubble: 'rgba(32, 44, 62, 0.62)', userBubbleBorder: '#314661'
  },
  dusk: {
    background: 'rgba(13, 11, 20, 0.82)', foreground: '#f5e7e0', card: 'rgba(21, 17, 27, 0.80)', cardForeground: '#f5e7e0',
    muted: 'rgba(34, 26, 38, 0.62)', mutedForeground: '#bfa4a4', popover: 'rgba(15, 13, 21, 0.94)', popoverForeground: '#f5e7e0',
    primary: '#e6863f', primaryForeground: '#140d08', secondary: 'rgba(42, 32, 46, 0.62)', secondaryForeground: '#e8d2cf',
    accent: '#e6863f', accentForeground: '#140d08', border: '#33242e', input: 'rgba(34, 26, 38, 0.62)', ring: '#e6863f',
    destructive: '#e05a52', destructiveForeground: '#fff5f5',
    sidebarBackground: 'rgba(9, 8, 14, 0.72)', sidebarBorder: '#2b1f28', userBubble: 'rgba(30, 23, 34, 0.74)', userBubbleBorder: '#3a2833'
  },
  night: {
    background: 'rgba(10, 18, 38, 0.72)', foreground: '#ffffff', card: 'rgba(10, 16, 36, 0.76)', cardForeground: '#ffffff',
    muted: 'rgba(18, 28, 52, 0.55)', mutedForeground: '#cbd5e1', popover: 'rgba(10, 16, 36, 0.92)', popoverForeground: '#ffffff',
    primary: '#b9c7e8', primaryForeground: '#0f172a', secondary: 'rgba(22, 34, 62, 0.55)', secondaryForeground: '#f1f5f9',
    accent: '#b9c7e8', accentForeground: '#0f172a', border: '#1c2a44', input: 'rgba(14, 22, 42, 0.65)', ring: '#b9c7e8',
    destructive: '#c9564f', destructiveForeground: '#fff5f5',
    sidebarBackground: 'rgba(8, 14, 30, 0.68)', sidebarBorder: '#18243c', userBubble: 'rgba(12, 20, 44, 0.75)', userBubbleBorder: '#1e3056'
  }
}

const PHASE_ACCENT = { dawn: '#e8a07a', day: '#9dc4e8', dusk: '#e6863f', night: '#b9c7e8' }

// ── Gruvbox · The Backwater ──────────────────────────────────────────────────
// Dressed from gruvbox's own element table, not from "brown and orange". Every
// role below maps onto a named highlight group in morhetz/gruvbox (dark, medium
// contrast), so the app reads the way the colorscheme reads:
//
//   Normal        fg1 on bg0        -> body text on the reading ground
//   Comment       gray, italic      -> folds, timestamps, tertiary labels
//   Visual        bg3               -> selection
//   VertSplit     bg3               -> borders
//   Pmenu         fg1 on bg2        -> user bubble, menus
//   PmenuSel      bg2 on blue, bold -> selected row
//   CursorLine    bg1               -> hover / raised surface
//   CursorLineNr  yellow on bg1     -> focus ring
//   Search        yellow, inversed  -> ring / find
//   IncSearch     orange            -> the thing the eye should land on
//   Title         bold green        -> headings
//   Underlined    blue, underline   -> links
//   Constant      purple            -> numbers, literals, inline code
//   String        green             -> strings
//   Type          yellow            -> types
//   PreProc       aqua              -> quotes / preprocessor
//   Special       orange            -> highlights
//   Statement     red               -> errors, destructive, keywords
//   LineNr        bg4               -> hairlines
//   Folded        gray on bg1, italic
//
// The painting is the ground under all of it: 4096×2428, its own bytes, no
// resize and no re-encode. Panels are gruvbox surfaces at high alpha — tinted
// glass rather than a clear pane — because fg1 on bg0 is a 9.5:1 pair and that
// is the only way prose stays readable over a picture with real highlights.
const GRUVBOX_THEME = 'zephyr-gruvbox'
const GRUVBOX_ACCENT = '#fe8019'
// Resolved at startup from wherever the plugin is installed (assets/ in a
// clone, or next to plugin.js); see resolvePluginFiles.
let BACKWATER_URL = 'data:,'
const BACKWATER_FILE = 'backwater.jpg'

// The palette, verbatim from gruvbox.vim's `s:gb` dictionary.
const GB = {
  bg0h: [29, 32, 33], bg0: [40, 40, 40], bg0s: [50, 48, 47], bg1: [60, 56, 54],
  bg2: [80, 73, 69], bg3: [102, 92, 84], bg4: [124, 111, 100],
  gray: [146, 131, 116], fg0: [251, 241, 199], fg1: [235, 219, 178], fg2: [213, 196, 161],
  fg3: [189, 174, 147], fg4: [168, 153, 132],
  red: '#fb4934', green: '#b8bb26', yellow: '#fabd2f', blue: '#83a598',
  purple: '#d3869b', aqua: '#8ec07c', orange: '#fe8019'
}
const gbA = (rgb, a) => `rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, ${a})`
// Gruvbox's own bg ladder is nearly neutral, which over a painting reads grey.
// These are the same values pushed toward the picture's own browns: equal or
// lower luminance than bg0, but with hue and chroma, so the panes stay dark
// while being warm instead of soot. Deliberately outside the palette.
const WARM = { deep: [13, 23, 19], pane: [19, 32, 26], card: [27, 43, 35], bubble: [38, 58, 46] }
const WARM_EDGE = '#466553'

// ── The skin, as data ───────────────────────────────────────────────────────
// Everything below is what the editor writes: the artwork, how the glass sits on
// it, and the panel colours. Defaults reproduce the shipped look exactly, so a
// fresh install paints what you saw before anyone touched a control.
const SKIN_DEFAULTS = {
  image: BACKWATER_URL,
  fit: 'cover',
  posX: 46,
  posY: 45,
  scrim: 0.31,
  blur: 18,
  saturate: 1.3,
  brightness: 0.90,
  feather: 72,
  chrome: 0.74,
  sidebar: 0.74,
  card: 0.78,
  bubble: 0.78,
  ground: '#16261e',
  deeper: '#0c1612',
  cardTint: '#1d3328',
  bubbleTint: '#2b4636',
  edge: '#4f7360',
  accent: '#fe8019',
  ink: '#fbf1c7',
  ink2: '#ebdbb2'
}
const SKIN_SLIDERS = [
  ['scrim', 'Picture scrim', 0, 0.9, 0.01],
  ['blur', 'Glass blur (px)', 0, 40, 1],
  ['saturate', 'Glass saturation', 0.5, 2, 0.05],
  ['brightness', 'Glass brightness', 0.5, 1.1, 0.01],
  ['chrome', 'Chat pane opacity', 0.4, 1, 0.01],
  ['sidebar', 'Sidebar opacity', 0.4, 1, 0.01],
  ['card', 'Card opacity', 0.4, 1, 0.01],
  ['bubble', 'Your message opacity', 0.4, 1, 0.01]
]
const SKIN_COLORS = [
  ['ground', 'Chat ground'],
  ['deeper', 'Sidebar ground'],
  ['cardTint', 'Card'],
  ['bubbleTint', 'Your messages'],
  ['edge', 'Edges'],
  ['accent', 'Accent'],
  ['ink', 'Text'],
  ['ink2', 'Quiet text']
]
let SKIN = { ...SKIN_DEFAULTS }
const setSkin = next => { SKIN = { ...SKIN_DEFAULTS, ...next } }
const skinNumber = (value, fallback) => (Number.isFinite(Number(value)) ? Number(value) : fallback)
// '#221a16' -> '34, 26, 22' (the app's neutral tokens are bare RGB triples)
const hexTriple = hex => {
  const h = String(hex || '').replace('#', '')
  const full = h.length === 3 ? h.split('').map(c => c + c).join('') : h.padEnd(6, '0').slice(0, 6)
  return [0, 2, 4].map(i => parseInt(full.slice(i, i + 2), 16) || 0).join(', ')
}
const picUrl = () => String(SKIN.image || BACKWATER_URL).replace(/"/g, '%22')
const hexRgb = hex => hexTriple(hex).split(', ').map(Number)

// Every surface Zephyr paints reads these, so a look (or a user skin) is one
// set of numbers instead of a hunt through the stylesheet.
const mixHex = (a, b, t) => hexRgb(a).map((v, i) => Math.round(v + (hexRgb(b)[i] - v) * t))
const materialVars = gruv => {
  const tri = rgb => rgb.join(', ')
  if (!gruv) {
    return [
      'html:root {',
      '  --zf-hi: 255, 255, 255;',
      '  --zf-m-solid: rgb(17, 18, 24);',
      '  --zf-m-tab: rgba(255, 255, 255, 0.10);',
      '  --zf-m-pin-a: rgba(16, 17, 24, 0.46); --zf-m-pin-b: rgba(10, 11, 16, 0.56);',
      '  --zf-m-comp-a: rgba(24, 25, 34, 0.46); --zf-m-comp-b: rgba(14, 15, 22, 0.54);',
      '  --zf-m-bub-a: rgba(255, 255, 255, 0.10); --zf-m-bub-b: rgba(255, 255, 255, 0.07);',
      '  --zf-m-sheet: rgba(14, 15, 22, 0.74);',
      '  --zf-m-on: #11121a;',
      '  --ui-row-active-background: rgba(255, 255, 255, 0.10) !important;',
      '}'
    ]
  }
  const deep = SKIN.deeper, ground = SKIN.ground, card = SKIN.cardTint, bub = SKIN.bubbleTint
  const g = k => skinNumber(SKIN[k], 0.78)
  return [
    'html:root {',
    `  --zf-hi: ${hexTriple(SKIN.ink)};`,
    `  --zf-m-solid: rgb(${tri(mixHex(deep, ground, 0.6))});`,
    `  --zf-m-tab: rgba(${hexTriple(bub)}, 0.86);`,
    `  --zf-m-pin-a: rgba(${hexTriple(ground)}, ${(g('sidebar') * 0.68).toFixed(3)}); --zf-m-pin-b: rgba(${hexTriple(deep)}, ${(g('sidebar') * 0.78).toFixed(3)});`,
    `  --zf-m-comp-a: rgba(${hexTriple(bub)}, ${(g('chrome') * 0.62).toFixed(3)}); --zf-m-comp-b: rgba(${hexTriple(card)}, ${(g('chrome') * 0.70).toFixed(3)});`,
    `  --zf-m-bub-a: rgba(${hexTriple(bub)}, ${(g('bubble') * 0.60).toFixed(3)}); --zf-m-bub-b: rgba(${hexTriple(card)}, ${(g('bubble') * 0.68).toFixed(3)});`,
    `  --zf-m-sheet: rgba(${tri(mixHex(deep, ground, 0.5))}, ${(g('card') * 0.92).toFixed(3)});`,
    `  --zf-m-on: ${deep};`,
    `  --ui-row-active-background: rgba(${tri(mixHex(bub, SKIN.ink, 0.18))}, 0.62) !important;`,
    '}'
  ]
}

const gbHex = rgb => `#${rgb.map(v => v.toString(16).padStart(2, '0')).join('')}`

const GRUVBOX_GROUNDS = {
  // Warm dark ground: the luminance of bg0_hard with the picture's browns in it,
  // so prose keeps its contrast while the app stops reading as grey.
  background: gbA(WARM.pane, 0.88), foreground: gbHex(GB.fg0),
  card: gbA(WARM.card, 0.96), cardForeground: gbHex(GB.fg0),
  muted: gbA(GB.bg1, 0.80), mutedForeground: gbHex(GB.fg3),
  popover: gbA(WARM.deep, 0.98), popoverForeground: gbHex(GB.fg0),
  primary: GB.orange, primaryForeground: gbHex(GB.bg0h),
  secondary: gbA(WARM.card, 0.90), secondaryForeground: gbHex(GB.fg2),
  accent: GB.orange, accentForeground: gbHex(GB.bg0h),
  border: WARM_EDGE, input: gbA(WARM.card, 0.95),
  ring: GB.yellow, destructive: GB.red, destructiveForeground: gbHex(GB.bg0h),
  sidebarBackground: gbA(WARM.deep, 0.92), sidebarBorder: WARM_EDGE,
  userBubble: gbA(WARM.bubble, 0.95), userBubbleBorder: WARM_EDGE
}

// Zephyr derives a glass material from the sky; here it comes from bg1/bg2 so
// every Zephyr surface (sidebar cards, snippet cards, composer) is a gruvbox
// pane. The ink ramp is gruvbox's own fg ladder.
const gruvboxMaterial = () => ({
  tint: hexRgb(SKIN.ground),
  tintHi: hexRgb(SKIN.bubbleTint),
  // ink3 lands on every 10-11px uppercase label in the app — section headers,
  // the status bar, the fold line, shortcuts — and gruvbox's Comment grey is
  // simply too quiet at that size over a tinted ground, so the quiet tier sits
  // at fg1. This is the one place the theme deliberately out-contrasts gruvbox.
  ink: [hexRgb(SKIN.ink), hexRgb(SKIN.ink2), hexRgb(GB.fg2), hexRgb(SKIN.ink2)],
  night: 0.2,
  accent: SKIN.accent
})

// The painting as the ground. The scrim is what makes the glass tinted rather
// than clear: it drops the picture's peak brightness so the panels above it can
// stay translucent without letting a highlight sit under a line of prose.
const gruvboxLayers = () => {
  const scrim = skinNumber(SKIN.scrim, 0.44)
  return [
    'html::before {',
    "  content: ''; position: fixed; inset: 0; z-index: -1; pointer-events: none;",
    '  background-image:',
    // left: the sidebar's column of small text sits over the dress and the
    // sunlit grass; top/bottom: titlebar and composer edges.
    // fine grain: dark gradients over 8-bit colour step visibly; a faint
    // noise breaks the steps up so the falloff reads as a smooth curve
    `    url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='160' height='160'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2' stitchTiles='stitch'/%3E%3CfeColorMatrix values='0 0 0 0 0.5 0 0 0 0 0.5 0 0 0 0 0.5 0 0 0 0.06 0'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E"),`,
    // one soft vignette (eased, many stops) + one even scrim: no ramps that end
    // in a visible line
    `    radial-gradient(125% 115% at 50% 42%, rgba(${hexTriple(SKIN.deeper)}, 0) 0%, rgba(${hexTriple(SKIN.deeper)}, ${(scrim * 0.10).toFixed(3)}) 35%, rgba(${hexTriple(SKIN.deeper)}, ${(scrim * 0.32).toFixed(3)}) 55%, rgba(${hexTriple(SKIN.deeper)}, ${(scrim * 0.62).toFixed(3)}) 72%, rgba(${hexTriple(SKIN.deeper)}, ${(scrim * 0.90).toFixed(3)}) 88%, rgba(${hexTriple(SKIN.deeper)}, ${(scrim * 1.05).toFixed(3)}) 100%),`,
    `    linear-gradient(rgba(${hexTriple(SKIN.deeper)}, ${(scrim * 0.70).toFixed(3)}), rgba(${hexTriple(SKIN.deeper)}, ${(scrim * 0.70).toFixed(3)})),`,
    // the artwork itself: a custom property, so swapping the picture is one tiny
    // style element instead of rebuilding a multi-megabyte CSS string
    `    var(--zf-pic, url("${BACKWATER_URL}"));`,
    `  background-size: 160px 160px, cover, cover, ${SKIN.fit === 'contain' ? 'contain' : 'cover'};`,
    `  background-position: 0 0, center, center, ${skinNumber(SKIN.posX, 46)}% ${skinNumber(SKIN.posY, 45)}%;`,
    '  background-repeat: repeat, no-repeat, no-repeat, no-repeat;',
    `  background-color: ${SKIN.deeper};`,
    '}',
    'body::before { content: none; }'
  ]
}

// The picture lives in its own style element: a 5 MB data URL must not be
// re-stringified on every clock tick.
const ensurePictureStyle = url => {
  if (typeof document === 'undefined' || !document.head) return
  let el = document.getElementById('zephyr-picture')
  if (!el) {
    el = document.createElement('style')
    el.id = 'zephyr-picture'
    document.head.appendChild(el)
  }
  const value = `:root { --zf-pic: url("${String(url).replace(/"/g, '%22')}"); }`
  if (el.textContent !== value) el.textContent = value
}

// The prose layer wears the syntax side of gruvbox: headings are Title (bold
// green), links are Underlined (blue), inline code is Constant (purple) on
// bg0_hard, quotes are PreProc (aqua), hairlines are LineNr (bg4), selection is
// Visual (bg3). This is the half of the colorscheme a chat window actually uses.
// A collapsed pane keeps its tab labels in the flow: at an 8px tab, "SESSIONS"
// and "BOTS" wrap into a column and stack letter on letter. The collapse is a
// style width rather than an attribute we can select, so the sheet keys off a
// measured marker (see watchPaneTabs in register) and hides the word only where
// there is genuinely no room for it.
// The feather that takes the glass back into the sharp painting. 72px, with
// intermediate stops rather than a straight two-stop ramp: a linear alpha ramp
// has a visible seam where it begins and where it ends, which is exactly the
// hard edge this is meant to remove.
const featherStops = px => {
  const f = Math.max(1, skinNumber(SKIN.feather, 72))
  return [[0, 0], [f * 0.25, 0.12], [f * 0.5, 0.36], [f * 0.75, 0.66], [f, 1]]
}
const featherStop = (d, alpha, side) =>
  `${alpha === 1 ? '#000' : `rgba(0, 0, 0, ${alpha})`} ${side === 'end' ? `calc(100% - ${d}px)` : `${d}px`}`
const featherGradient = to =>
  `linear-gradient(to ${to}, ${[
    ...featherStops().map(([d, a]) => featherStop(d, a, 'start')),
    ...featherStops().slice().reverse().map(([d, a]) => featherStop(d, a, 'end'))
  ].join(', ')})`
const FEATHER_Y = () => featherGradient('bottom')
// No horizontal ramp: the band now runs to the actual screen edges, so a fade
// on this axis would only reintroduce an edge in the middle of the window.

// Session tabs (the session rows in the tree — `data-tree-tab`, workspace or
// session-tile) get a hairline between them and a selected state you can see:
// accent bar, accent wash, top of the ink ramp. The pane tabs (Sessions / Bots)
// are NOT these; they keep their own look.
const SESSION_TAB_CSS = [
  // Top tabs: soft pills, sentence case, no rules between them. The active tab
  // is a raised piece of the same dark glass as the cards; the rest stay quiet
  // until hovered.
  "[role='tab'][data-tree-tab]:not([data-zf-arc-col] *) {",
  '  position: relative;',
  '  height: 26px !important; min-height: 26px !important; margin: 4px 1px 0 !important;',
  '  padding-inline: 4px 6px !important;',
  '  border: 0 !important; border-radius: 8px !important;',
  '  background: transparent !important; box-shadow: none !important;',
  '  color: var(--zf-ink-2, #ebdbb2) !important; opacity: 0.78;',
  '  transition: background-color 140ms ease, color 140ms ease, box-shadow 140ms ease, opacity 140ms ease;',
  '}',
  "[role='tab'][data-tree-tab]:not([data-zf-arc-col] *)::before { display: none !important; }",
  "[role='tab'][data-tree-tab]:not([data-zf-arc-col] *) .uppercase {",
  '  text-transform: none !important; letter-spacing: 0 !important;',
  '  font-size: 12px !important; font-weight: 500 !important;',
  '}',
  "[role='tab'][data-tree-tab]:not([data-zf-arc-col] *):is(:hover, [aria-selected='true']) { opacity: 1; }",
  "[role='tab'][data-tree-tab]:not([data-zf-arc-col] *):hover {",
  '  color: var(--zf-ink-1, #ebdbb2) !important;',
  '  background: rgba(var(--zf-hi), 0.06) !important;',
  '}',
  "[role='tab'][data-tree-tab]:not([data-zf-arc-col] *)[aria-selected='true'] {",
  '  color: var(--zf-ink-0, #fbf1c7) !important;',
  '  background: var(--zf-m-tab) !important;',
  '  box-shadow: inset 0 0 0 1px rgba(var(--zf-hi), 0.10), 0 4px 14px rgba(0, 0, 0, 0.28) !important;',
  '}',
  // the + button: a quiet rounded square in line with the pills
  "button[aria-label='New session tab'] {",
  '  width: 26px !important; height: 26px !important; margin: 4px 0 0 4px !important; border-radius: 8px !important;',
  '  color: var(--zf-ink-3, #d5c4a1) !important; background: transparent !important; border: 0 !important;',
  '  transition: background-color 140ms ease, color 140ms ease, transform 140ms ease;',
  '}',
  "button[aria-label='New session tab']:hover { background: rgba(var(--zf-hi), 0.08) !important; color: var(--zf-ink-0, #fbf1c7) !important; }",
  "button[aria-label='New session tab']:active { transform: scale(0.94); }",
  "button[aria-label='New session tab'] :is(svg, i) { width: 14px !important; height: 14px !important; font-size: 14px !important; }",
  // a tab's close button: hidden until the tab is hovered or active
  "[role='tab'][data-tree-tab]:not([data-zf-arc-col] *) button { border-radius: 5px !important; opacity: 0; transition: opacity 120ms ease, background-color 120ms ease; }",
  "[role='tab'][data-tree-tab]:not([data-zf-arc-col] *):is(:hover, [aria-selected='true']) button { opacity: 0.7; }",
  "[role='tab'][data-tree-tab]:not([data-zf-arc-col] *) button:hover { opacity: 1; background: rgba(var(--zf-hi), 0.10) !important; }",
  // Wider tabs: the app caps them at 12rem and sizes them to the title. Give
  // every tab a generous fixed span (Chrome-style), shrinking only when crowded.
  "[role='tab'][data-tree-tab]:not([data-zf-arc-col] *) { flex: 0 1 220px !important; width: 220px !important; min-width: 120px !important; max-width: 260px !important; height: 28px !important; padding-inline: 10px 6px !important; }",
  "[role='tab'][data-tree-tab]:not([data-zf-arc-col] *) .truncate { flex: 1 1 auto !important; min-width: 0 !important; }",
  "[role='tab'][data-tree-tab]:not([data-zf-arc-col] *) button[aria-label='Close'] { width: 18px !important; height: 18px !important; margin-left: 6px !important; flex: none !important; align-self: center !important; }",
  // the app hides the close slot (opacity 0, no pointer) until hover; show it on the active tab too
  "[role='tab'][data-tree-tab]:not([data-zf-arc-col] *):is(:hover, [aria-selected='true']) span:has(> button[aria-label='Close']) { opacity: 1 !important; pointer-events: auto !important; z-index: 2; }",
  "[role='tab'][data-tree-tab]:not([data-zf-arc-col] *) .pane-tab-content { padding-right: 22px !important; }",
  "[role='tab'][data-tree-tab]:not([data-zf-arc-col] *) span:has(> button[aria-label='Close']) { align-items: center !important; padding-right: 6px; }",
  "[role='tab'][data-tree-tab]:not([data-zf-arc-col] *) button[aria-label='Close'] .codicon { opacity: 1 !important; visibility: visible !important; font-size: 12px !important; color: var(--zf-ink-2, #ebdbb2) !important; }",
]

const PANE_RAIL_CSS = [
  // Collapsed, the pane tabs are a few pixels wide. A wrapped "Sessions", one
  // letter per line, is what that used to look like. Now the label goes away
  // entirely and the tab becomes a small bar: dim when it is not the pane you
  // are in, ink-bright when it is. Nothing to wrap, nothing to clip.
  "[data-slot='pane-tab'][data-zf-rail='true'] {",
  '  justify-content: center !important;',
  '  align-items: center !important;',
  '  padding: 0 !important;',
  '  gap: 0 !important;',
  '  overflow: hidden !important;',
  '  white-space: nowrap !important;',
  '  border: 0 !important;',
  '  box-shadow: none !important;',
  '  background: transparent !important;',
  '}',
  "[data-slot='pane-tab'][data-zf-rail='true'] > * {",
  '  display: none !important;',
  '}',
  "[data-slot='pane-tab'][data-zf-rail='true']::before {",
  "  content: ''; width: 3px; height: 16px; border-radius: 999px;",
  '  background: var(--zf-ink-3, rgba(255, 255, 255, 0.32));',
  '  transition: background-color 120ms ease, height 120ms ease;',
  '}',
  "[data-slot='pane-tab'][data-zf-rail='true']:is([aria-selected='true'], [data-active='true'])::before {",
  '  height: 22px;',
  '  background: var(--zf-ink-0, #fbf1c7);',
  '}'
]

// ── Refinement pass ────────────────────────────────────────────────────────
// The audit found ten different corner radii, ten font sizes, three border
// colours that were not ours, and every message group 16px wider than the column
// it sits in. This layer puts the app on one scale: four radii, one border
// colour, one hover, one focus ring, and prose that cannot overflow.
const polishCss = () => [
  // The app's ink tiers were landing on values that read as invisible against
  // this ground: secondary computed to rgb(33 3 25) (1.09:1) and quaternary to
  // 36% ink (1.01:1). Pane-tab labels, timestamps and session subtitles were
  // effectively black on black. `html:root` outranks whatever sets them later.
  'html:root {',
  // !important because the app writes these tokens inline on <html> when it
  // applies a theme, and inline declarations otherwise beat any stylesheet.
  `  --ui-text-primary: ${LOOK_MODE === 'sunset' ? '#ffffff' : SKIN.ink} !important;`,
  `  --ui-text-secondary: ${LOOK_MODE === 'sunset' ? 'rgba(255, 255, 255, 0.86)' : SKIN.ink2} !important;`,
  `  --ui-text-tertiary: ${LOOK_MODE === 'sunset' ? 'rgba(255, 255, 255, 0.72)' : '#bdae93'} !important;`,
  `  --ui-text-quaternary: ${LOOK_MODE === 'sunset' ? 'rgba(255, 255, 255, 0.58)' : '#a89984'} !important;`,
  '}',
  // `--zf-` is the app's namespace too: it ships its own --zf-ink-2, which is
  // rgb(33 3 25) — near-black. Every rule of ours that said
  // var(--zf-ink-2, #d5c4a1) got the app's value instead of the fallback, which
  // is why pane-tab labels and timestamps stayed invisible. Reclaim the ramp.
  'html:root {',
  `  --zf-ink-0: ${LOOK_MODE === 'sunset' ? '#ffffff' : SKIN.ink} !important;`,
  `  --zf-ink-1: ${LOOK_MODE === 'sunset' ? 'rgba(255, 255, 255, 0.92)' : SKIN.ink2} !important;`,
  `  --zf-ink-2: ${LOOK_MODE === 'sunset' ? 'rgba(255, 255, 255, 0.78)' : SKIN.ink2} !important;`,
  `  --zf-ink-3: ${LOOK_MODE === 'sunset' ? 'rgba(255, 255, 255, 0.60)' : '#d5c4a1'} !important;`,
  '}',
  ':root {',
  '  --zf-r-chip: 4px;',
  '  --zf-r-control: 8px;',
  '  --zf-r-card: 12px;',
  // the app's own scale, set once: its radius utilities read these
  '  --radius: 12px;',
  '  --radius-md: 8px;',
  '  --radius-lg: 12px;',
  '  --radius-sm: 6px;',
  '  --zf-radius: 8px;',
  '  --zf-radius-lg: 12px;',
  `  --zf-hair: rgba(${hexTriple(SKIN.edge)}, 0.55);`,
  '  --zf-ease: cubic-bezier(0.2, 0, 0, 1);',
  '}',

  // One radius per role. Buttons, inputs and rows are controls; cards and code
  // are surfaces; chips are inline.
  "button:not([class*='rounded-full']), input, select, textarea, [role='button']:not([class*='rounded-full']), [role='tab'], [role='option'] {",
  '  border-radius: var(--zf-r-control) !important;',
  '}',
  "[data-slot='aui_message'] :is(pre, table),",
  "[data-slot='aui_message'] :is(.rounded-lg, .rounded-xl, .rounded-2xl) {",
  '  border-radius: var(--zf-r-card) !important;',
  '}',
  "[data-slot='aui_message'] :not(pre) > code {",
  '  border-radius: var(--zf-r-chip) !important;',
  '}',

  // One hairline colour everywhere a border is drawn by the app, so dividers
  // stop being three different greys.
  // `[class]` is here to outrank Tailwind's own class-level !important
  // declarations (border-white/5 and friends), which otherwise win on
  // specificity no matter how early this sheet is injected.
  // ...but never on an edge the app meant to be invisible: re-colouring
  // border-transparent drew a box around every nav row in Settings and the sidebar.
  "html body :is(div, span, button, a, li, table, th, td, input, textarea, select, section, header, footer, aside, nav)[class]:not([class*='border-transparent']) {",
  '  border-color: var(--zf-hair) !important;',
  '}',
  // the accent is for state, not decoration: a focused control keeps its ring
  ':focus-visible {',
  '  border-color: color-mix(in srgb, var(--zf-accent, #fe8019) 55%, transparent) !important;',
  '}',

  // Focus is visible, consistent, and only on keyboard focus.
  ':focus-visible {',
  '  outline: 2px solid color-mix(in srgb, var(--zf-accent, #fe8019) 70%, transparent);',
  '  outline-offset: 2px;',
  '}',

  // One hover, one duration. The app animates some rows and snaps others.
  "button, [role='button'], [role='tab'], [role='option'], [role='menuitem'] {",
  '  transition: background-color 120ms var(--zf-ease), color 120ms var(--zf-ease), border-color 120ms var(--zf-ease);',
  '}',
  "@media (prefers-reduced-motion: reduce) {",
  "  button, [role='button'], [role='tab'], [role='option'] { transition: none !important; }",
  '}',

  // Scrollbars: thin, tinted, no full-width gutter.
  '::-webkit-scrollbar { width: 10px; height: 10px; }',
  '::-webkit-scrollbar-track { background: transparent; }',
  '::-webkit-scrollbar-thumb {',
  '  background: color-mix(in srgb, var(--zf-ink-3, #a89984) 26%, transparent);',
  '  border: 3px solid transparent;',
  '  border-radius: 999px;',
  '  background-clip: content-box;',
  '}',
  '::-webkit-scrollbar-thumb:hover {',
  '  background: color-mix(in srgb, var(--zf-ink-3, #a89984) 44%, transparent);',
  '  background-clip: content-box;',
  '}',

  // ── Prose: rhythm, and nothing overflowing the column ────────────────────
  "[data-slot='aui_thread-content'] :is(p, li, td, th, h1, h2, h3, h4, blockquote) {",
  '  overflow-wrap: anywhere;',
  '}',
  "[data-slot='aui_thread-content'] p { margin-block: 0.7em !important; }",
  "[data-slot='aui_thread-content'] :is(h1, h2, h3, h4) {",
  '  letter-spacing: -0.011em;',
  '  margin-block: 1.15em 0.5em;',
  '  line-height: 1.3;',
  '}',
  "[data-slot='aui_thread-content'] :is(ul, ol) { padding-inline-start: 1.35em; margin-block: 0.6em; }",
  "[data-slot='aui_thread-content'] li { margin-block: 0.22em !important; }",
  "[data-slot='aui_thread-content'] li::marker { color: var(--zf-ink-3, #a89984); }",
  "[data-slot='aui_thread-content'] hr {",
  '  border: 0; border-top: 1px solid var(--zf-hair); margin-block: 1.4em;',
  '}',
  "[data-slot='aui_thread-content'] blockquote {",
  '  border-inline-start: 2px solid var(--zf-hair);',
  '  padding-inline-start: 0.9em;',
  '  margin-inline: 0;',
  '  color: var(--zf-ink-2, #d5c4a1);',
  '}',
  "[data-slot='aui_thread-content'] a {",
  '  text-underline-offset: 2px;',
  '  text-decoration-thickness: 1px;',
  '  text-decoration-color: color-mix(in srgb, currentColor 45%, transparent);',
  '}',
  "[data-slot='aui_thread-content'] a:hover { text-decoration-color: currentColor; }",
  "[data-slot='aui_thread-content'] img { max-width: 100%; border-radius: var(--zf-r-control); }",

  // Code: one padding, one radius, one border, tabular figures in blocks.
  "[data-slot='aui_thread-content'] pre {",
  '  padding: 13px 15px !important;',
  '  border-radius: var(--zf-r-card) !important;',
  '  border: 1px solid var(--zf-hair) !important;',
  '  line-height: 1.55 !important;',
  '  font-variant-numeric: tabular-nums;',
  '}',
  "[data-slot='aui_thread-content'] :not(pre) > code {",
  '  padding: 0.12em 0.36em;',
  '  font-size: 0.92em;',
  '}',

  // Tables scroll instead of pushing the column wide.
  "[data-slot='aui_thread-content'] table {",
  '  border-collapse: collapse;',
  '  width: 100%;',
  '  display: block;',
  '  overflow-x: auto;',
  '}',
  "[data-slot='aui_thread-content'] :is(th, td) {",
  '  padding: 6px 10px;',
  '  border-bottom: 1px solid var(--zf-hair);',
  '  text-align: start;',
  '}',
  "[data-slot='aui_thread-content'] th {",
  '  font-weight: 600;',
  '  color: var(--zf-ink-1, #ebdbb2);',
  '}',

  // The 16px overflow: message groups are flex children that refuse to shrink.
  "[data-slot='aui_message-group'], [data-slot='aui_turn-pair'],",
  "[data-slot='aui_message-group'] > *, [data-slot='aui_turn-pair'] > * {",
  '  max-width: 100% !important;',
  '  min-width: 0 !important;',
  '}',

  // ── Arclike ──────────────────────────────────────────────────────────────
  // The sidebar column never unmounts. "Collapsed" takes it out of the flow
  // (position: fixed, so the chat never reflows) and parks it off-screen; a
  // hover slides it back. Only translate and opacity animate: compositor work,
  // no React, no layout.
  "html[data-zf-arc='1'] [data-zf-arc-col] {",
  '  position: fixed !important; left: 10px !important; top: 10px !important; bottom: 10px !important;',
  '  width: 272px !important; height: auto !important; min-width: 0 !important; max-width: none !important;',
  '  flex: none !important; z-index: 60 !important;',
  '  border-radius: 16px !important; overflow: hidden !important;',
  '  background: var(--zf-m-solid) !important; background-image: none !important; backdrop-filter: none !important; -webkit-backdrop-filter: none !important;',
  '  box-shadow: 0 0 0 1px rgba(var(--zf-hi), 0.08), 0 24px 60px rgba(0, 0, 0, 0.5), 0 2px 8px rgba(0, 0, 0, 0.35) !important;',
  '  translate: calc(-100% - 28px) 0; opacity: 0; pointer-events: none;',
  '  transition: translate 150ms cubic-bezier(0.4, 0, 1, 1), opacity 110ms ease;',
  '  will-change: translate, opacity; contain: layout paint;',
  '}',
  "html[data-zf-arc='1'][data-zf-arc-open='1'] [data-zf-arc-col] {",
  '  translate: 0 0; opacity: 1; pointer-events: auto;',
  '  transition: translate 300ms cubic-bezier(0.22, 1, 0.36, 1), opacity 120ms ease;',
  '}',
  // the card's own surfaces are see-through so the card is one piece of glass
  "html[data-zf-arc='1'] [data-zf-arc-col] > div, html[data-zf-arc='1'] [data-zf-arc-col] [data-slot='sidebar'] {",
  '  background: transparent !important; border: 0 !important;',
  '}',
  // room at the bottom of the column for snippets + status
  "[data-zf-arc-col] > div { padding-bottom: var(--zf-arc-foot, 0px) !important; }",
  // the chat keeps the toggle's corner clear once the sidebar is out of the flow
  "html[data-zf-arc='1'] [data-tree-split] > div:not([data-zf-arc-col]) [data-window-top] {",
  // the mode button lives inside the card here, so the tabs can take the corner
  '  --panel-titlebar-left: 12px !important;',
  '}',
  // menus, tooltips and dialogs opened from inside the card must sit above it
  "[data-radix-popper-content-wrapper], [role='menu'], [role='listbox'], [role='tooltip'], [data-slot$='-content'][data-state='open'][style*='--radix'] { z-index: 70 !important; }",
  "[data-slot='dialog-overlay'], [data-slot='dialog-content'], [data-slot='sheet-overlay'], [data-slot='sheet-content'], [data-slot='alert-dialog-overlay'], [data-slot='alert-dialog-content'] { z-index: 72 !important; }",
  // one surface: the session panels inside the column lose their own fill so
  // sessions, snippets and the command center all sit on the same colour
  "html body [data-zf-arc-col] [data-slot='sidebar-content'] > :is([data-slot='sidebar-group'], [data-sessions-mode], div:last-child) { background: transparent !important; box-shadow: none !important; }",
  "html body [data-zf-arc-col] [data-slot='sidebar-content'] > div:has(input) { background: rgba(var(--zf-hi), 0.05) !important; box-shadow: none !important; }",
  // Settings nav: the open group is shown by its children, not by a second
  // filled box above the selected child
  "html body button[data-tour][class*='bg-(--ui-bg-tertiary)'][class*='border-(--ui-stroke-tertiary)'] { background: transparent !important; border-color: transparent !important; color: var(--zf-ink-0, #fbf1c7) !important; }",
  // No orange or yellow text, anywhere: the app's accent-coloured text
  // utilities, spinners and time stamps all fall back to the ink ramp.
  "html body :is([class*='text-(--ui-accent)'], [class*='text-(--accent)'], [class*='text-primary']:not([class*='text-primary-foreground']), [class*='text-amber'], [class*='text-yellow'], [class*='text-orange'], [class*='text-(--theme-primary)'], .glyph-spinner, .glyph-spinner *) { color: var(--zf-ink-2, #cdc4b4) !important; }",
  "html body time { color: var(--zf-ink-3, #a8a092) !important; }",
  // the sidebar toggle hides while the arclike is out; the card is the control then
  "html[data-zf-arc-ready='1'] div.fixed:has(> button[aria-label*='sidebar' i]) { opacity: 0 !important; pointer-events: none !important; }",
  // Pinned: the same card, docked. Inset from the window edge, rounded, one
  // piece of glass; the chat sits beside it instead of butting into a strip.
  "html:not([data-zf-arc='1']) [data-zf-arc-col] {",
  '  margin: 10px 0 10px 10px !important; height: calc(100vh - 20px) !important; align-self: flex-start;',
  '  border-radius: 16px !important; overflow: hidden !important;',
  '  background: var(--zf-m-pin-b) !important;',
  '  box-shadow: 0 0 0 1px rgba(var(--zf-hi), 0.08), 0 18px 48px rgba(0, 0, 0, 0.35) !important;',
  '}',
  "html:not([data-zf-arc='1']) [data-zf-arc-col] > div, html:not([data-zf-arc='1']) [data-zf-arc-col] [data-slot='sidebar'] { background: transparent !important; border: 0 !important; }",
  // unread badge and tab dots: no orange
  "html body div.fixed:has(> button[aria-label*='sidebar' i]) [class*='bg-primary'] { background: var(--zf-ink-1, #e2dacb) !important; color: var(--zf-m-on) !important; }",
  "[role='tab'][data-tree-tab] [class*='rounded-full'][class*='bg-'] { background: var(--zf-ink-2, #cdc4b4) !important; }",
  // Landing for an empty tab: the app only draws its intro for the very first
  // draft, so a fresh tab was a blank smear. Same wordmark, same mood.
  '#zf-landing { position: fixed; z-index: 1; pointer-events: none; display: none; flex-direction: column; align-items: center; justify-content: center; text-align: center; gap: 14px; opacity: 0; transition: opacity 260ms ease; }',
  "html[data-zf-landing='1'] #zf-landing { display: flex; opacity: 1; }",
  '#zf-landing .zf-land-mark { font-family: Collapse, ui-serif, serif; font-size: clamp(44px, 7.4vw, 112px); font-weight: 700; letter-spacing: 0.02em; line-height: 1; color: rgba(var(--zf-hi), 0.92); mix-blend-mode: plus-lighter; text-shadow: 0 2px 30px rgba(0, 0, 0, 0.35); white-space: nowrap; }',
  '#zf-landing .zf-land-line { font-size: 15px; color: var(--zf-ink-2, #ebdbb2); text-shadow: 0 1px 12px rgba(0, 0, 0, 0.6); max-width: 34rem; }',
  "@keyframes zf-land-in { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: none; } }",
  "html[data-zf-landing='1'] #zf-landing > * { animation: zf-land-in 420ms cubic-bezier(0.22, 1, 0.36, 1) both; }",
  "html[data-zf-landing='1'] #zf-landing .zf-land-line { animation-delay: 80ms; }",
  // Settings is a floating sheet: the card's docked rows step back, and the
  // sheet is solid enough that nothing reads through it
  "html:has([class*='grid-cols-[13rem_minmax(0,1fr)]']) :is(#zf-cc-head, #zephyr-snips, footer[data-zf-arc-foot]) { visibility: hidden !important; }",
  "div.rounded-xl:has(> * [class*='grid-cols-[13rem_minmax(0,1fr)]']), div.rounded-xl:has(> [class*='grid-cols-[13rem_minmax(0,1fr)]']) { background: var(--zf-m-sheet) !important; box-shadow: 0 0 0 1px rgba(var(--zf-hi), 0.08), 0 30px 80px rgba(0, 0, 0, 0.55) !important; isolation: isolate; }",
  "[class*='grid-cols-[13rem_minmax(0,1fr)]'] > aside { background: rgba(0, 0, 0, 0.16) !important; }",
  // sidebar mode switch, sitting in the command-center row
  "#zf-mode-btn { position: absolute; left: 8px; top: 4px; z-index: 5; display: none; place-items: center; width: 26px; height: 26px; padding: 0; border: 0; border-radius: 7px; background: transparent; color: var(--zf-ink-2, #ebdbb2); cursor: pointer; -webkit-app-region: no-drag; transition: background-color 120ms ease, color 120ms ease, transform 120ms ease; }",
  "[data-zf-arc-col] > #zf-mode-btn { display: inline-grid; position: absolute !important; left: 10px !important; top: 3px !important; width: 24px !important; height: 24px !important; margin: 0 !important; transform: none; }",
  "html:not([data-zf-arc='1']) [data-zf-arc-col] { position: relative !important; }",
  "html:has([class*='grid-cols-[13rem_minmax(0,1fr)]']) #zf-mode-btn { display: none; }",
  "#zf-mode-btn svg { width: 16px; height: 16px; }",
  // arclike: the button belongs to the card, top-left inside it, and rides
  // the same slide; pinned keeps it in the window corner
  "html[data-zf-arc='1'] #zf-mode-btn { left: 20px; top: 12px; translate: -300px 0; opacity: 0; pointer-events: none; transition: translate 260ms cubic-bezier(0.22, 1, 0.36, 1), opacity 160ms ease, background-color 120ms ease, color 120ms ease; }",
  "html[data-zf-arc='1'][data-zf-arc-open='1'] #zf-mode-btn { translate: 0 0; opacity: 1; pointer-events: auto; transition: translate 300ms cubic-bezier(0.22, 1, 0.36, 1), opacity 120ms ease, background-color 120ms ease, color 120ms ease; }",
  "#zf-mode-btn:hover, #zf-mode-btn:focus-visible { background: rgba(var(--zf-hi), 0.10); color: var(--zf-ink-0, #fbf1c7); outline: none !important; }",
  "#zf-mode-btn:active { transform: scale(0.92); }",
  // focus: a soft cream ring, never the orange accent; the composer gets none
  "html body :focus-visible { outline: 1.5px solid rgba(var(--zf-hi), 0.38) !important; outline-offset: 2px; border-color: rgba(var(--zf-hi), 0.28) !important; }",
  "html body :is([data-slot='composer-rich-input'], [data-slot^='composer'] textarea, [data-slot^='composer'] [contenteditable='true'], [data-slot^='composer'] input):is(:focus, :focus-visible) { outline: none !important; box-shadow: none !important; border-color: transparent !important; }",
  "html body [data-slot='composer-surface']:focus-within { box-shadow: inset 0 0 0 1px rgba(var(--zf-hi), 0.16), var(--zf-lift, 0 8px 24px rgba(0,0,0,.3)) !important; }",
  "html[data-zf-ghost-menu='1'] :is([data-radix-popper-content-wrapper], [role='menu']) { opacity: 0 !important; pointer-events: none !important; }",
  // mode morph timing
  "::view-transition-group(zf-side), ::view-transition-group(zf-main) { animation-duration: 300ms; animation-timing-function: cubic-bezier(0.22, 1, 0.36, 1); }",
  "::view-transition-old(zf-main), ::view-transition-new(zf-main) { width: 100%; height: 100%; object-fit: none; object-position: center top; animation-duration: 300ms; }",
  "::view-transition-old(zf-side), ::view-transition-new(zf-side) { animation-duration: 220ms; }",
  "::view-transition-old(root), ::view-transition-new(root) { animation: none; }",
  // Glass. Pinned surfaces (sidebar, composer, your messages, cards, sheets)
  // let the frosted painting through; the floating card stays solid because
  // it sits over text.
  "html body div[data-slot='composer-surface'][data-slot][class] { background: linear-gradient(var(--zf-m-comp-a), var(--zf-m-comp-b)) !important; backdrop-filter: blur(18px) saturate(1.25) brightness(1.08) !important; box-shadow: inset 0 1px 0 rgba(var(--zf-hi), 0.07), inset 0 0 0 1px rgba(var(--zf-hi), 0.06), 0 10px 30px rgba(0, 0, 0, 0.22) !important; }",
  "html body :is(.composer-human-message, [class*='composer-human-message']):not(.composer-human-message-container) { background: linear-gradient(var(--zf-m-bub-a), var(--zf-m-bub-b)) !important; box-shadow: inset 0 1px 0 rgba(var(--zf-hi), 0.07), inset 0 0 0 1px rgba(var(--zf-hi), 0.06), 0 6px 20px rgba(0, 0, 0, 0.16) !important; border-color: transparent !important; }",
  "html:not([data-zf-arc='1']) body [data-zf-arc-col] { background: linear-gradient(var(--zf-m-pin-a), var(--zf-m-pin-b)) !important; backdrop-filter: blur(20px) saturate(1.2) !important; box-shadow: inset 0 1px 0 rgba(var(--zf-hi), 0.07), inset 0 0 0 1px rgba(var(--zf-hi), 0.06), 0 18px 48px rgba(0, 0, 0, 0.30) !important; }",
  "html[data-zf-arc='1'] body [data-zf-arc-col] { background: var(--zf-m-solid) !important; }",
  "html[data-zf-arc='1'] body [data-zf-arc-col] :is(footer[data-zf-arc-foot], #zephyr-snips) { background: transparent !important; }",
  "div.rounded-xl:has(> * [class*='grid-cols-[13rem_minmax(0,1fr)]']), div.rounded-xl:has(> [class*='grid-cols-[13rem_minmax(0,1fr)]']) { background: var(--zf-m-sheet) !important; backdrop-filter: blur(28px) saturate(1.1) !important; }",
  // left-edge hot zone, invisible
  '#zf-rail-hot { position: fixed; left: 0; top: 40px; bottom: 0; width: 8px; z-index: 59; display: none; background: transparent; }',
  "html[data-zf-arc='1']:not([data-zf-arc-open='1']) #zf-rail-hot { display: block; }",
  "[data-slot='sidebar-wrapper'], [data-slot='sidebar'] { border-left: 0 !important; border-right: 0 !important; }",

  // Sessions / Bots: equal halves, dark selected rectangle
  "[data-zf-arc-col] [role='tablist']:has([data-slot='pane-tab']) { border-radius: 10px !important; padding: 3px !important; gap: 3px !important; background: rgba(0, 0, 0, 0.24) !important; overflow: hidden !important; height: 32px !important; box-sizing: border-box !important; }",
  "[data-zf-arc-col] [data-slot='pane-tab'] { flex: 1 1 0 !important; height: 26px !important; justify-content: center !important; border-radius: 7px !important; border: 0 !important; background: transparent !important; box-shadow: none !important; }",
  "[data-zf-arc-col] [data-slot='pane-tab'] .uppercase { text-transform: none !important; letter-spacing: 0 !important; font-size: 12px !important; }",
  "[data-zf-arc-col] [data-slot='pane-tab']:hover { background: rgba(var(--zf-hi), 0.05) !important; }",
  "[data-zf-arc-col] [data-slot='pane-tab'][aria-selected='true'] { background: rgba(var(--zf-hi), 0.10) !important; color: var(--zf-ink-0, #fbf1c7) !important; }",
  "[data-zf-arc-col] [data-slot='pane-tab'] :is(span, div) { background: transparent !important; }",

  // ── Command center data: the live status bar, docked at the bottom of the
  // column and moving with it. No tab, no popover, no second window.
  '#zephyr-statusdock-tab, #zephyr-statusdock-head, #zephyr-statusdock-ghost, [data-zephyr-dock-pop] { display: none !important; }',
  "html body [data-slot*='command-center'], html body [data-slot*='commandCenter'], html body #command-center { display: none !important; }",
  "html body [data-zephyr-dock-room][data-zephyr-dock-room], html body [data-zephyr-lib-room][data-zephyr-lib-room] { margin-top: 0 !important; }",
  "html body footer[data-slot='statusbar'][data-zf-arc-foot][data-zf-arc-foot][data-zf-arc-foot] {",
  '  position: fixed !important; z-index: 61 !important;',
  '  left: var(--zf-foot-x, 10px) !important; width: var(--zf-foot-w, 272px) !important;',
  '  top: auto !important; bottom: var(--zf-foot-b, 10px) !important; right: auto !important;',
  '  height: auto !important; max-height: 30vh !important; overflow: hidden auto !important; overscroll-behavior: contain;',
  '  display: flex !important; flex-direction: column !important; justify-content: flex-start !important; align-items: stretch !important; gap: 2px !important;',
  '  padding: 6px !important; box-sizing: border-box !important;',
  '  border-radius: 0 0 var(--zf-foot-r, 16px) var(--zf-foot-r, 16px) !important;',
  '  border-top: 1px solid rgba(235, 219, 178, 0.08) !important;',
  '  background: transparent !important; box-shadow: none !important;',
  '  transform: none !important; clip-path: none !important; visibility: visible !important; opacity: 1 !important; pointer-events: auto !important;',
  '  scrollbar-width: thin;',
  '}',
  "html body footer[data-slot='statusbar'][data-zf-arc-foot][data-zf-arc-foot][data-zf-arc-foot] > div { flex-direction: column !important; align-items: stretch !important; gap: 0 !important; overflow: visible !important; }",
  "html body footer[data-slot='statusbar'][data-zf-arc-foot][data-zf-arc-foot][data-zf-arc-foot] > div:empty { display: none !important; }",
  "html body footer[data-slot='statusbar'][data-zf-arc-foot][data-zf-arc-foot][data-zf-arc-foot] > div + div:not(:empty) { border-top: 1px solid rgba(235, 219, 178, 0.07) !important; margin-top: 3px !important; padding-top: 3px !important; }",
  "html body footer[data-slot='statusbar'][data-zf-arc-foot][data-zf-arc-foot][data-zf-arc-foot] > div > * {",
  '  height: 22px !important; min-height: 22px !important; width: 100% !important; justify-content: flex-start !important;',
  '  padding: 0 8px !important; gap: 8px !important; border-radius: 6px !important; font-size: 12px !important;',
  '  color: var(--zf-ink-1, #ebdbb2) !important; background: transparent !important; transform: none !important; opacity: 1 !important;',
  '}',
  "html body footer[data-slot='statusbar'][data-zf-arc-foot][data-zf-arc-foot][data-zf-arc-foot] > div > *:hover { background: rgba(235, 219, 178, 0.07) !important; }",
  "html body footer[data-slot='statusbar'][data-zf-arc-foot][data-zf-arc-foot][data-zf-arc-foot] svg { width: 13px !important; height: 13px !important; flex: none; color: var(--zf-ink-3, #a89984) !important; }",

  // the command center folds to one header row; shut by default
  "html:not([data-zf-cc-open='1']) body footer[data-slot='statusbar'][data-zf-arc-foot][data-zf-arc-foot][data-zf-arc-foot] { display: none !important; }",
  '#zf-cc-head {',
  '  position: fixed; z-index: 61; display: none; box-sizing: border-box;',
  '  left: var(--zf-foot-x, 10px); width: var(--zf-foot-w, 272px);',
  '  bottom: calc(var(--zf-foot-b, 10px) + var(--zf-foot-h, 0px));',
  '  height: 28px; padding: 0 0.7rem 0 0.75rem; gap: 0.5rem; align-items: center; cursor: pointer; outline: none;',
  '  border: 0 !important; border-top: 1px solid rgba(235, 219, 178, 0.08) !important; border-radius: 0 !important; background: transparent !important;',
  '  font-size: 10.5px; font-weight: 600; letter-spacing: 0.16em; text-transform: uppercase;',
  '  color: var(--zf-sd-lab-color, var(--zf-ink-2, #d5c4a1)); transition: color 150ms ease;',
  '}',
  "html[data-zf-arc-ready='1'] #zf-cc-head { display: flex; }",
  '#zf-cc-head:hover, #zf-cc-head:focus-visible { color: var(--zf-ink-0, #fbf1c7); }',
  '#zf-cc-head svg { width: 0.75rem; height: 0.75rem; flex: none; }',
  '#zf-cc-head > span:not(.zf-cc-sum) { flex: none; white-space: nowrap; }',
  '#zf-cc-head .zf-cc-sum { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; margin-left: auto;',
  '  text-transform: none; letter-spacing: 0; font-weight: 500; font-size: 11px; color: var(--zf-ink-3, #a89984); }',
  '#zf-cc-head .zf-cc-chev { transform: rotate(-90deg); transition: transform 220ms cubic-bezier(0.22, 1, 0.36, 1); }',
  "html[data-zf-cc-open='1'] #zf-cc-head .zf-cc-chev { transform: none; }",
  "html[data-zf-cc-open='1'] #zf-cc-head .zf-cc-sum { display: none; }",
  // footer no longer carries the top rule; the head does
  "html body footer[data-slot='statusbar'][data-zf-arc-foot][data-zf-arc-foot][data-zf-arc-foot] { border-top: 0 !important; padding-top: 2px !important; }",
  // ── Snippets: one slim row above the status data; opens upward
  '#zephyr-snips[data-zf-stale] { display: none !important; }',
  'html body #zephyr-snips[data-zf-arc-snips][data-zf-arc-snips] {',
  '  position: fixed !important; z-index: 61 !important;',
  '  left: var(--zf-foot-x, 10px) !important; width: var(--zf-foot-w, 272px) !important;',
  '  top: auto !important; bottom: calc(var(--zf-foot-b, 10px) + var(--zf-foot-h, 0px) + var(--zf-cc-h, 0px)) !important;',
  '  height: auto !important; max-height: 30vh !important; box-sizing: border-box !important;',
  '  border-radius: 0 !important; border: 0 !important; border-top: 1px solid rgba(235, 219, 178, 0.08) !important;',
  '  background: transparent !important; box-shadow: none !important; margin: 0 !important;',
  '}',
  'html body #zephyr-snips[data-zf-arc-snips][data-zf-arc-snips] .zf-lib-head { height: 28px !important; font-size: 10.5px !important; }',
  'html body #zephyr-snips[data-zf-arc-snips][data-zf-arc-snips]:not([data-open]) .zf-lib-rows { display: none !important; }',

  // everything that rides on the card slides with it
  "html[data-zf-arc='1'] body :is(footer[data-slot='statusbar'][data-zf-arc-foot][data-zf-arc-foot][data-zf-arc-foot], #zephyr-snips[data-zf-arc-snips][data-zf-arc-snips], #zf-cc-head) {",
  '  translate: calc(-100% - 28px) 0; opacity: 0 !important; pointer-events: none !important;',
  '  transition: translate 260ms cubic-bezier(0.22, 1, 0.36, 1), opacity 160ms ease;',
  '  will-change: translate, opacity;',
  '}',
  "html[data-zf-arc='1'][data-zf-arc-open='1'] body :is(footer[data-slot='statusbar'][data-zf-arc-foot][data-zf-arc-foot][data-zf-arc-foot], #zephyr-snips[data-zf-arc-snips][data-zf-arc-snips], #zf-cc-head) {",
  '  translate: 0 0; opacity: 1 !important; pointer-events: auto !important;',
  '  transition: translate 300ms cubic-bezier(0.22, 1, 0.36, 1), opacity 120ms ease;',
  '}',
  '@media (prefers-reduced-motion: reduce) {',
  "  [data-zf-arc-col], footer[data-zf-arc-foot], #zephyr-snips[data-zf-arc-snips], #zf-cc-head { transition: none !important; }",
  '}',

  // Two text roles still resolved to a colour the theme never chose — the pane
  // tab label and the sidebar timestamps both computed to rgb(33 3 25), which is
  // 1.1:1 on this ground. Named explicitly rather than guessed at the token.
  "[data-slot='pane-tab'] :is(span, div) {",
  '  color: var(--zf-ink-2, #d5c4a1) !important;',
  '}',
  "[data-slot='pane-tab']:is([aria-selected='true'], [data-active='true']) :is(span, div) {",
  '  color: var(--zf-ink-0, #fbf1c7) !important;',
  '}',
  "[data-slot='sidebar'] time, time[tooltip-trigger] {",
  '  color: var(--zf-ink-3, #a89984) !important;',
  '}',

  "[role='tab'][data-tree-tab]:not([data-slot='pane-tab']) :is(span, div) {",
  '  text-overflow: ellipsis;',
  '}',

  // Floating surfaces: menus, dialogs, popovers and tooltips share one radius
  // and one shadow, instead of each carrying its own.
  ":is([role='menu'], [role='dialog'], [role='listbox'], [role='tooltip'], [data-slot*='popover']) {",
  '  border-radius: var(--zf-r-card) !important;',
  '}',
  ":is([role='tooltip']) {",
  '  border-radius: 6px !important;',
  '  padding: 4px 8px !important;',
  '  font-size: 11px !important;',
  '}',
  ":is([role='menu'], [role='dialog'], [role='listbox']) {",
  '  box-shadow: 0 12px 32px rgba(0, 0, 0, 0.42), 0 2px 6px rgba(0, 0, 0, 0.28) !important;',
  '}',
]

const gruvboxTextCss = () => [
  /* one soft-focus layer for the reading column: the picture stays as colour
     and light, not as detail competing with letterforms */
  // One glass band across the WHOLE window: edge to edge, left side of the
  // screen to the right, so there is no vertical seam anywhere — the panes are
  // translucent, so the blur simply shows through all of them. Only the top and
  // bottom fade, because those are the only edges that are actually visible.
  //
  // It hangs off html::after rather than a thread element precisely because a
  // thread element's width ends at the pane boundary, and that boundary is the
  // hard line we are trying to get rid of.
  "html[data-zf-chat='1']::after {",
  "  content: '';",
  '  position: fixed; left: 0; right: 0; top: 0; bottom: 0; z-index: -1;',
  '  pointer-events: none;',
  `  background: radial-gradient(120% 90% at 50% 40%, rgba(${hexTriple(SKIN.deeper)}, ${(skinNumber(SKIN.scrim, 0.44) * 0.45).toFixed(3)}), rgba(${hexTriple(SKIN.deeper)}, ${(skinNumber(SKIN.scrim, 0.44) * 0.95).toFixed(3)}));`,
  `  backdrop-filter: blur(${skinNumber(SKIN.blur, 16)}px) saturate(${skinNumber(SKIN.saturate, 1.35)}) brightness(${skinNumber(SKIN.brightness, 0.84)});`,
  '}',
  `::selection { background: ${SKIN.edge} !important; color: ${SKIN.ink} !important; }`,

  // Title
  ":is([data-slot='aui_assistant-message-content'], [data-slot='aui_user-message-root'], [data-slot='user-message']) :is(h1, h2, h3, h4, h5, h6) {",
  '  color: var(--zf-ink-0, #fbf1c7) !important;',
  '}',
  // Underlined
  ":is([data-slot='aui_assistant-message-content'], [data-slot='aui_user-message-root'], [data-slot='user-message']) a {",
  '  color: #83a598 !important;',
  '  text-decoration: underline !important;',
  '  text-decoration-color: rgba(131, 165, 152, 0.55) !important;',
  '}',
  // Constant
  ":is([data-slot='aui_assistant-message-content'], [data-slot='aui_user-message-root'], [data-slot='user-message']) :is(code, kbd, samp) {",
  '  color: #d3869b !important;',
  `  background: rgba(${hexTriple(SKIN.deeper)}, 0.78) !important;`,
  `  border: 1px solid ${SKIN.edge} !important;`,
  '}',
  // String / Special in blocks: the fence keeps bg0_hard, the border is bg2
  ":is([data-slot='aui_assistant-message-content'], [data-slot='aui_user-message-root'], [data-slot='user-message']) pre {",
  `  background: rgba(${hexTriple(SKIN.deeper)}, 0.90) !important;`,
  `  border: 1px solid ${SKIN.edge} !important;`,
  '  color: #ebdbb2 !important;',
  '}',
  // PreProc
  ":is([data-slot='aui_assistant-message-content'], [data-slot='aui_user-message-root'], [data-slot='user-message']) blockquote {",
  '  border-left: 2px solid #8ec07c !important;',
  '  color: #d5c4a1 !important;',
  '}',
  // LineNr
  ":is([data-slot='aui_assistant-message-content'], [data-slot='aui_user-message-root'], [data-slot='user-message']) hr {",
  `  border-color: ${SKIN.edge} !important;`,
  '}',
  // prose shadow: cheap insurance on the last translucent surface in the stack
  ":is([data-slot='aui_assistant-message-content'], [data-slot='aui_user-message-root'], [data-slot='user-message'], [data-slot='assistant-message']) :is(p, li, td, th, dd, dt, figcaption) {",
  '  text-shadow: 0 1px 2px rgba(0, 0, 0, 0.55), 0 2px 7px rgba(0, 0, 0, 0.38);',
  '}',
  "[data-slot='aui_intro'] :is(p, h1, h2, h3, [class*='wordmark']), [data-slot='statusbar'] {",
  '  text-shadow: 0 1px 2px rgba(0, 0, 0, 0.50), 0 2px 7px rgba(0, 0, 0, 0.32);',
  '}'
]

// Read by skyStyleFor, which is a pure function of (date, gl) everywhere else.
// The look is a module-level switch so the sheet builder stays a single path.
let LOOK_MODE = 'sunset'
const setLookMode = mode => { LOOK_MODE = mode === 'gruvbox' ? 'gruvbox' : 'sunset' }

const WORK_ICONS = {
  brain: '<svg width="14" height="14" viewBox="0 0 256 256" fill="#ffffff"><path d="M216,72a48,48,0,0,0-88-26.49A48,48,0,0,0,40,72v1.39a56,56,0,0,0,0,101.22V176a48,48,0,0,0,88,26.49A48,48,0,0,0,216,176v-1.39A56.09,56.09,0,0,0,248,124,56.11,56.11,0,0,0,216,72ZM120,208a32,32,0,0,1-32-32,48,48,0,0,1,32-45.26Zm0-93.26A48,48,0,0,1,88,69.26,32,32,0,0,1,120,40Zm16-74.74A32,32,0,0,1,168,69.26a48,48,0,0,1-32,45.48Zm0,93.26A48,48,0,0,1,168,176a32,32,0,0,1-32,32Z"/></svg>',
  terminal: '<svg width="14" height="14" viewBox="0 0 256 256" fill="#ffffff"><path d="M216,40H40A16,16,0,0,0,24,56V200a16,16,0,0,0,16,16H216a16,16,0,0,0,16-16V56A16,16,0,0,0,216,40Zm-91,94.25-40,32a8,8,0,1,1-10-12.5L107.19,128,75,102.25a8,8,0,1,1,10-12.5l40,32a8,8,0,0,1,0,12.5ZM176,168H136a8,8,0,0,1,0-16h40a8,8,0,0,1,0,16Z"/></svg>',
  search: '<svg width="14" height="14" viewBox="0 0 256 256" fill="#ffffff"><path d="M229.66,218.34l-50.06-50.07a88,88,0,1,0-11.32,11.31l50.06,50.07a8,8,0,0,0,11.32-11.31ZM112,184a72,72,0,1,1,72-72A72.08,72.08,0,0,1,112,184Z"/></svg>',
  tool: '<svg width="14" height="14" viewBox="0 0 256 256" fill="#ffffff"><path d="M232,96a72,72,0,0,1-100.94,66L79,222.22c-.12.14-.26.29-.39.42a32,32,0,0,1-45.26-45.26c.14-.13.28-.27.43-.39L94,124.94a72.07,72.07,0,0,1,83.54-98.78,8,8,0,0,1,3.93,13.19L144,80l5.66,26.35L176,112l40.65-37.52a8,8,0,0,1,13.19,3.93A72.6,72.6,0,0,1,232,96Z"/></svg>',
  file: '<svg width="14" height="14" viewBox="0 0 256 256" fill="#ffffff"><path d="M213.66,82.34l-56-56A8,8,0,0,0,152,24H56A16,16,0,0,0,40,40V216a16,16,0,0,0,16,16H200a16,16,0,0,0,16-16V88A8,8,0,0,0,213.66,82.34ZM152,88V44l44,44Z"/></svg>'
}

// ══ §2 MATERIAL, SOLAR TIMES & TIME-OF-DAY COLOURS ═════════════════════════

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

// The glass and ink of the Zephyr material, derived from the sky so every
// surface carries the hour's hue. `sky.top` is the zenith colour; its hue is
// normalised before mixing so a dark night sky still tints rather than greys.
const ZF_INK = [9, 13, 22]
const clamp01 = x => Math.min(1, Math.max(0, x))
const zephyrMaterial = sky => {
  const peak = Math.max(1, ...sky.top)
  const hue = sky.top.map(v => Math.round((v / peak) * 255))
  /* night: 0 by day, 1 in full night (exposure 0.18), easing in through dusk.
     The night sky is the darkest backdrop but the GL clouds still glow, so
     panels need MORE body after dark, not less (Peter, 2026-10-10). */
  const night = clamp01((0.45 - sky.exposure) / 0.27)
  const n = night * night * (3 - 2 * night)
  const tint = blendRgb(blendRgb(ZF_INK, blendRgb(sky.top, hue, 0.35), 0.16 - 0.06 * n), [3, 5, 10], 0.42 * n)
  const tintHi = blendRgb(tint, [255, 255, 255], 0.05 - 0.01 * n)
  const ink = [
    blendRgb([250, 251, 253], hue, 0.04),
    blendRgb([228, 233, 241], hue, 0.08),
    blendRgb([196, 205, 218], hue, 0.13),
    blendRgb([140, 152, 172], hue, 0.18)
  ]
  return { tint, tintHi, ink, night: n, accent: PHASE_ACCENT[phaseAt(new Date())] }
}

// The sky is INTERPOLATED, not switched. Each anchor is the palette at one hour;
// the sky at any moment is a blend of the two anchors around it, with a
// smoothstep so there is no visible kink as it passes an anchor. The clock
// rewrites the style every minute, so a smooth function sampled once a minute
// reads as continuous drift.
//
// `exposure` is the day's light level (0 = night, 1 = noon) and drives two
// things: how heavy the scrim over the sky is, and how dense the panels sit
// above it. Brighter sky, denser panels, so text never has to fight the light.
let liveSolar = null

const TIMEZONE_COORDS = {
  'America/Toronto': [43.65, -79.38],
  'America/Montreal': [45.50, -73.57],
  'America/Vancouver': [49.28, -123.12],
  'America/New_York': [40.71, -74.01],
  'America/Chicago': [41.88, -87.63],
  'America/Denver': [39.74, -104.99],
  'America/Los_Angeles': [34.05, -118.24],
  'America/Phoenix': [33.45, -112.07],
  'America/Anchorage': [61.22, -149.90],
  'America/Halifax': [44.65, -63.58],
  'Europe/London': [51.51, -0.13],
  'Europe/Paris': [48.86, 2.35],
  'Europe/Berlin': [52.52, 13.40],
  'Europe/Rome': [41.90, 12.50],
  'Asia/Tokyo': [35.68, 139.77],
  'Asia/Singapore': [1.35, 103.82],
  'Australia/Sydney': [-33.87, 151.21]
}

const getApproxCoords = () => {
  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || 'America/Toronto'
    if (TIMEZONE_COORDS[tz]) return TIMEZONE_COORDS[tz]
  } catch {}
  return [43.65, -79.38]
}

const calcSolarTimes = (date = new Date(), lat = 43.65, lng = -79.38) => {
  try {
    const rad = Math.PI / 180
    const dayOfYear = Math.floor((date - new Date(date.getFullYear(), 0, 0)) / 86400000)
    const lngHour = lng / 15
    const calcTime = isSunrise => {
      const t = dayOfYear + ((isSunrise ? 6 : 18) - lngHour) / 24
      const M = 0.9856 * t - 3.289
      const L = M + 1.916 * Math.sin(M * rad) + 0.02 * Math.sin(2 * M * rad) + 282.634
      const normL = ((L % 360) + 360) % 360
      let RA = (Math.atan(0.91764 * Math.tan(normL * rad)) / rad) % 360
      if (RA < 0) RA += 360
      const Lquadrant = Math.floor(normL / 90) * 90
      const RAquadrant = Math.floor(RA / 90) * 90
      RA = (RA + (Lquadrant - RAquadrant)) / 15
      const sinDec = 0.39782 * Math.sin(normL * rad)
      const cosDec = Math.cos(Math.asin(sinDec))
      const cosH = (Math.cos(90.833 * rad) - sinDec * Math.sin(lat * rad)) / (cosDec * Math.cos(lat * rad))
      if (cosH > 1 || cosH < -1) return null
      const H = (isSunrise ? 360 - Math.acos(cosH) / rad : Math.acos(cosH) / rad) / 15
      const T = H + RA - 0.06571 * t - 6.622
      return (((T - lngHour) % 24) + 24) % 24
    }
    const tzOffset = -date.getTimezoneOffset() / 60
    const riseUT = calcTime(true)
    const setUT = calcTime(false)
    if (riseUT != null && setUT != null) {
      return {
        rise: (((riseUT + tzOffset) % 24) + 24) % 24,
        set: (((setUT + tzOffset) % 24) + 24) % 24
      }
    }
  } catch {}
  return { rise: 7.38, set: 18.75 }
}

const getSolar = (date = new Date()) => {
  if (liveSolar) return liveSolar
  const [lat, lng] = getApproxCoords()
  return calcSolarTimes(date, lat, lng)
}

const getAnchors = (solar = getSolar()) => {
  // Every anchor hangs off the real sunrise/sunset, so golden hour lands at the
  // actual golden hour in December and in June alike.
  const rise = solar.rise
  const set = solar.set
  const hDawn = Math.min(Math.max(rise - 1.25, 3.5), 6.5)
  const hMorning = Math.max(rise + 0.75, hDawn + 0.5)
  const hGolden = set - 0.75
  const hSunset = set
  const hDusk = hSunset + 0.75
  const hLateDusk = hDusk + 1.0
  const hNight = Math.max(hLateDusk + 1.25, 22.5)
  const hNoon = Math.min(Math.max((rise + set) / 2, hMorning + 0.5), hGolden - 1.0)
  const hAfternoon = Math.min(Math.max(hGolden - 1.5, hNoon + 0.5), hGolden - 0.25)

  const list = [
    { hour: hDawn, top: [36, 30, 58], mid: [68, 58, 92], low: [121, 84, 102], horizon: [168, 115, 95], base: [51, 41, 74], orb: [255, 196, 150], orbAlpha: 0.22, exposure: 0.25 },
    { hour: hMorning, top: [32, 55, 79], mid: [47, 83, 117], low: [79, 126, 164], horizon: [140, 180, 205], base: [49, 85, 111], orb: [255, 250, 230], orbAlpha: 0.16, exposure: 0.72 },
    { hour: hNoon, top: [28, 52, 76], mid: [43, 79, 112], low: [74, 121, 158], horizon: [150, 190, 214], base: [45, 80, 106], orb: [255, 252, 240], orbAlpha: 0.18, exposure: 1 },
    { hour: hAfternoon, top: [22, 40, 64], mid: [36, 62, 94], low: [62, 96, 130], horizon: [152, 118, 98], base: [32, 54, 78], orb: [255, 216, 172], orbAlpha: 0.18, exposure: 0.82 },
    { hour: hGolden, top: [17, 29, 48], mid: [29, 48, 72], low: [52, 80, 106], horizon: [168, 106, 78], base: [27, 41, 58], orb: [255, 176, 108], orbAlpha: 0.2, exposure: 0.64 },
    { hour: hSunset, top: [15, 17, 33], mid: [30, 27, 46], low: [62, 40, 60], horizon: [186, 84, 52], base: [32, 23, 38], orb: [255, 122, 62], orbAlpha: 0.26, exposure: 0.42 },
    { hour: hDusk, top: [11, 13, 28], mid: [22, 21, 40], low: [46, 31, 52], horizon: [108, 50, 50], base: [20, 17, 28], orb: [198, 104, 62], orbAlpha: 0.2, exposure: 0.3 },
    { hour: hLateDusk, top: [8, 11, 26], mid: [14, 19, 42], low: [23, 31, 60], horizon: [38, 44, 86], base: [11, 17, 34], orb: [188, 148, 108], orbAlpha: 0.14, exposure: 0.2 },
    { hour: hNight, top: [10, 20, 48], mid: [15, 30, 68], low: [22, 42, 92], horizon: [30, 56, 115], base: [12, 22, 50], orb: [210, 228, 255], orbAlpha: 0.18, exposure: 0.18 }
  ]

  // Guard against extreme latitudes / odd inputs: anchors must strictly rise
  // and the last must stay inside the 24 h wrap.
  for (let i = 1; i < list.length; i += 1) {
    if (list[i].hour <= list[i - 1].hour) list[i].hour = list[i - 1].hour + 0.1
  }
  const last = list[list.length - 1]
  if (last.hour >= list[0].hour + 24) last.hour = list[0].hour + 23.9

  return list
}

const lerp = (a, b, t) => a + (b - a) * t
const blendRgb = (a, b, t) => a.map((value, index) => Math.round(lerp(value, b[index], t)))
const cssRgb = ([r, g, b]) => `rgb(${r} ${g} ${b})`
const cssRgba = ([r, g, b], alpha) => `rgba(${r}, ${g}, ${b}, ${alpha})`

const skyAt = date => {
  const hour = date.getHours() + date.getMinutes() / 60
  const solar = getSolar(date)
  const anchorsList = getAnchors(solar)
  const firstHour = anchorsList[0].hour
  const wrapped = hour < firstHour ? hour + 24 : hour
  const anchors = [...anchorsList, { ...anchorsList[0], hour: anchorsList[0].hour + 24 }]

  let index = 0

  while (index < anchors.length - 2 && wrapped >= anchors[index + 1].hour) index += 1

  const from = anchors[index]
  const to = anchors[index + 1]
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

// ══ §3 STATUS STACK FILLETS ════════════════════════════════════════════════

// ── Status stack ⟷ composer seam ─────────────────────────────────────────
// The status stack sits on the composer, a little narrower, with square bottom
// corners, while the composer's top corners are round. fitStatusStack gives
// the stack concave bottom corners: each side of the card sweeps out in a
// fillet that lands tangent on the composer's own corner arc, so the two
// outlines run together as one S-curve. The geometry is measured (inset,
// composer radius, border width, fill colour), so it follows any theme or
// font size; it is drawn by two pseudo-elements on the stack's wrapper.
const STACK_FLARE_ATTR = 'data-zf-flare'
const fitStatusStack = () => {
  if (typeof document === 'undefined') return
  const stack = document.querySelector("[data-slot='composer-status-stack']")
  const card = stack?.querySelector(":scope > [class*='rounded-t-']") || stack?.firstElementChild
  const surf = document.querySelector("[data-slot='composer-surface'], [class~='group/composer-surface']")
  const off = () => { if (stack?.hasAttribute(STACK_FLARE_ATTR)) stack.removeAttribute(STACK_FLARE_ATTR) }
  if (!stack || !card || !surf) return off()
  const cr = card.getBoundingClientRect()
  const sr = surf.getBoundingClientRect()
  const wr = stack.getBoundingClientRect()
  const m = cr.left - sr.left                 // how far the card is inset
  const gap = sr.top - cr.bottom
  if (cr.height < 4 || m < 1.5 || Math.abs(gap) > 2.5 || Math.abs((sr.right - cr.right) - m) > 1.5) return off()
  const cs = getComputedStyle(card)
  const R = Math.max(0.5, parseFloat(getComputedStyle(surf).borderTopLeftRadius) || 0)
  const b = parseFloat(cs.borderLeftWidth) || 0
  // the fillet: radius s, tangent to the card's side (outside its border line)
  // and to the composer's corner circle (centre R,R; frame: composer top-left)
  const s = Math.min(12, Math.max(3, m * 0.85))
  const cx2 = m + b - s
  const dx = R - cx2
  const reach = (s + R) * (s + R) - dx * dx
  if (dx <= 0 || reach <= 0) return off()
  const cy2 = R - Math.sqrt(reach)             // composer top is y = 0 in this frame
  const ty = cy2 + (R - cy2) * s / (s + R)       // tangent point with the composer arc
  const boxL = cx2, boxT = cy2, boxW = m + b - cx2, boxH = Math.max(1, ty - cy2)
  const fill = cs.backgroundColor && cs.backgroundColor !== 'rgba(0, 0, 0, 0)' ? cs.backgroundColor : 'var(--composer-fill)'
  const px = v => v.toFixed(2) + 'px'
  const vars = {
    '--fl-x': px(sr.left - wr.left + boxL),
    '--fl-xr': px(wr.right - sr.right + boxL),
    '--fl-top': px(cr.bottom - wr.top + gap + boxT),
    '--fl-w': px(boxW),
    '--fl-h': px(boxH),
    '--fl-c2': px(cx2 - boxL) + ' ' + px(cy2 - boxT),
    '--fl-c1': px(R - boxL) + ' ' + px(R - boxT),
    '--fl-s': px(s),
    '--fl-si': px(Math.max(0, s - b)),
    '--fl-R': px(R),
    '--fl-fill': fill,
    '--fl-line': b > 0 ? cs.borderLeftColor : 'transparent'
  }
  for (const [k, v] of Object.entries(vars)) if (stack.style.getPropertyValue(k) !== v) stack.style.setProperty(k, v)
  if (!stack.hasAttribute(STACK_FLARE_ATTR)) stack.setAttribute(STACK_FLARE_ATTR, '')
}
const STACK_FLARE_CSS = [
  `[data-slot='composer-status-stack'][${STACK_FLARE_ATTR}] { position: relative; overflow: visible !important; }`,
  `[data-slot='composer-status-stack'][${STACK_FLARE_ATTR}]::before,`,
  `[data-slot='composer-status-stack'][${STACK_FLARE_ATTR}]::after {`,
  "  content: ''; position: absolute; z-index: 5; pointer-events: none;",
  '  top: var(--fl-top); width: var(--fl-w); height: var(--fl-h);',
  '  background: radial-gradient(circle at var(--fl-c2), transparent var(--fl-si), var(--fl-line) var(--fl-si), var(--fl-line) var(--fl-s), var(--fl-fill) calc(var(--fl-s) + 0.35px));',
  '  -webkit-mask: radial-gradient(circle at var(--fl-c1), transparent var(--fl-R), #000 calc(var(--fl-R) + 0.6px));',
  '  mask: radial-gradient(circle at var(--fl-c1), transparent var(--fl-R), #000 calc(var(--fl-R) + 0.6px));',
  '}',
  `[data-slot='composer-status-stack'][${STACK_FLARE_ATTR}]::before { left: var(--fl-x); }`,
  `[data-slot='composer-status-stack'][${STACK_FLARE_ATTR}]::after { right: var(--fl-xr); transform: scaleX(-1); }`
].join('\n')

// ══ §4 SIDEBAR SWITCH HOOKS & HORIZON OPTICS ═══════════════════════════════

// The sidebar's own strip: a header on the sidebar surface that owns a tablist.
// The workspace tab bar and the terminal rail do not match it.
const STRIP_HOOK = "[class~='bg-(--ui-sidebar-surface-background)']:has(> [role='tablist'])"

// Only a two-way strip becomes a switch — SESSIONS | BOTS. A three-way strip
// falls back to the app's own tabs rather than getting a pill that cannot land.
const PIN_MASK_URL = `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='black' stroke='black' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M12 17v5'/%3E%3Cpath d='M9 10.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24V16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V7a1 1 0 0 1 1-1 2 2 0 0 0 0-4H8a2 2 0 0 0 0 4 1 1 0 0 1 1 1z'/%3E%3C/svg%3E")`
const MENU_SURFACES = ":is([data-slot='dropdown-menu-content'], [data-slot='dropdown-menu-sub-content'], [data-slot='context-menu-content'], [data-slot='context-menu-sub-content'], [data-slot='popover-content'], [data-slot='select-content'], [data-slot='menubar-content'], [data-slot='dialog-content'] [data-slot='command'])"
const MENU_ROWS = ":is([role='menuitem'], [role='option'], [role='menuitemcheckbox'], [role='menuitemradio'], [cmdk-item], [data-slot='command-item'])"
const SWITCH_HOOK = `${STRIP_HOOK}:has(> [role='tablist'] > [data-slot='pane-tab']:nth-child(2):last-child)`

// Natural & semi-random horizon optics:
// Rather than one static mathematical ramp, real atmospheric light varies across
// the horizon: air mass boundaries, thermal undulations, and terrain shadows create
// natural, organic variations in light intensity and height across the horizon.
const horizonNoiseAt = (date = new Date()) => {
  const d = Math.floor((date - new Date(date.getFullYear(), 0, 0)) / 86400000)
  const h = date.getHours() + date.getMinutes() / 60

  // Deterministic multi-frequency harmonics that evolve naturally across minutes/days:
  const n1 = Math.sin(d * 7.13 + h * 0.52)
  const n2 = Math.cos(d * 13.37 + h * 1.05)
  const n3 = Math.sin(h * 2.1 - d * 1.7)

  return {
    wobbleAngle: n1 * 1.8 + n2 * 1.1,
    driftX: n2 * 6.5,
    undulationY: n3 * 2.5,
    secondaryX: Math.min(Math.max(68 + n1 * 10, 52), 84),
    secondaryY: 96 + n2 * 2.0,
    ambientX: Math.min(Math.max(16 + n3 * 8, 8), 28),
    streakAngle: 168 + n1 * 5.0
  }
}

// Horizon dynamic tilt:
// A flat 180° horizon looks synthetic. Real atmospheric optics and solar azimuth
// slant the light shelf across the horizon: morning dawn light slants up from the east
// (176.2°), afternoon/sunset creates a warm raking diagonal tilt towards the west (184.2°),
// with multi-focal scatter pockets and organic undulations along the horizon line.
const horizonTiltAt = (date = new Date()) => {
  const hour = date.getHours() + date.getMinutes() / 60
  const solar = getSolar(date)
  const noon = (solar.rise + solar.set) / 2
  const noise = horizonNoiseAt(date)

  let baseAngle = 180
  let focalX = 28
  let focalY = 98

  if (hour < solar.rise) {
    const t = Math.max(0, (hour - 4) / Math.max(solar.rise - 4, 1))
    baseAngle = lerp(177.5, 176.2, t)
    focalX = lerp(35, 30, t)
    focalY = 97
  } else if (hour < noon) {
    const t = (hour - solar.rise) / (noon - solar.rise)
    baseAngle = lerp(176.2, 179.4, t)
    focalX = lerp(30, 46, t)
    focalY = 98
  } else if (hour < solar.set + 1) {
    const t = (hour - noon) / (solar.set + 1 - noon)
    baseAngle = lerp(179.4, 184.2, t)
    focalX = lerp(46, 22, t)
    focalY = lerp(98, 96, t)
  } else if (hour < 22) {
    const t = (hour - (solar.set + 1)) / (22 - (solar.set + 1))
    baseAngle = lerp(184.2, 181.8, t)
    focalX = lerp(22, 32, t)
    focalY = 97
  } else {
    baseAngle = 177.8
    focalX = 35
    focalY = 98
  }

  const angle = baseAngle + noise.wobbleAngle

  return {
    angle,
    focalX: focalX + noise.driftX,
    focalY: focalY + noise.undulationY,
    secondaryX: noise.secondaryX,
    secondaryY: noise.secondaryY,
    ambientX: noise.ambientX,
    streakAngle: noise.streakAngle
  }
}

// ══ §5 APP CSS (skyStyleFor: layout, glass material, every surface) ════════

const skyStyleFor = (date, gl = false) => {
  const gruv = LOOK_MODE === 'gruvbox'
  const sky = skyAt(date)
  const isNight = !gruv && phaseAt(date) === 'night'
  const horizonTilt = horizonTiltAt(date)
  const scrim = ((1 - sky.exposure) * 0.08).toFixed(3)
  // Panels get denser as the sky gets brighter; the neutrals are the app's own
  // quality knob, and making them translucent is what lets the sky read through.
  // Gruvbox has no light level: it uses the same body dusk gets.
  const zf = gruv ? gruvboxMaterial() : zephyrMaterial(sky)
  const density = gruv ? String(skinNumber(SKIN.chrome, 0.88)) : Math.min(0.92, 0.55 + 0.35 * sky.exposure + 0.24 * zf.night).toFixed(3)
  // The painting has real light and shade, unlike a sky gradient, so gruvbox
  // tunes the three neutrals separately: the reading pane lets the painting
  // through, the sidebar (smallest text) and the cards hold it back.
  const sideDensity = gruv ? String(skinNumber(SKIN.sidebar, 0.92)) : density
  const cardDensity = gruv ? String(skinNumber(SKIN.card, 0.96)) : density
  const glassPct = a => `${Math.round(a)}%`
  // gruvbox has no white in its palette; fg0 is the brightest ink it uses.
  const solidInk = gruv ? gbHex(GB.fg0) : '#ffffff'

  return [
    gruv
      ? `/* Zephyr · gruvbox. The Backwater, ${BACKWATER_FILE}, full ${4096}×${2428}, cover-fitted. */`
      : `/* Zephyr sky. Blended for ${date.getHours()}:${String(date.getMinutes()).padStart(2, '0')}, exposure ${sky.exposure.toFixed(2)}, horizon ${horizonTilt.angle.toFixed(1)}°. */`,
    'html {',
    `  background-color: ${gruv ? '#1d2021' : cssRgb(sky.base)};`,
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
    // With the GL sky on, the canvas is the sky: the painted CSS layers rest.
    // In gruvbox the painting IS the background, so its own layer block is used.
    ...(gl
      ? ['html::before { content: none; }', 'body::before { content: none; }']
      : gruv
        ? gruvboxLayers()
        : [
    // Negative z-index is the whole trick: these layers paint above the canvas
    // but below every in-flow app surface, so no panel has to be restyled for
    // them, and nothing can cover them.
    'html::before {',
    "  content: ''; position: fixed; inset: 0; z-index: -1; pointer-events: none;",
    '  background-image:',
    '    radial-gradient(150% 80% at 50% 0%, transparent 48%, rgba(6, 14, 32, 0.28) 100%),',
    `    radial-gradient(120% 55% at 28% 98%, ${cssRgba(sky.horizon, 0.28)} 0%, transparent 70%),`,
    `    linear-gradient(${horizonTilt.angle.toFixed(1)}deg, transparent 56%, ${cssRgba(sky.horizon, Math.max(0.12, 0.38 * sky.exposure).toFixed(3))} 80%, ${cssRgba(sky.low, (0.24 * sky.exposure).toFixed(3))} 93%, transparent 100%),`,
    `    linear-gradient(${horizonTilt.streakAngle.toFixed(1)}deg, transparent 48%, ${cssRgba(sky.orb, (0.11 * sky.orbAlpha * sky.exposure).toFixed(3))} 54%, transparent 64%),`,
    `    linear-gradient(${(horizonTilt.angle - 9.2).toFixed(1)}deg, transparent 65%, ${cssRgba(sky.horizon, (0.18 * sky.exposure).toFixed(3))} 83%, transparent 95%),`,
    `    radial-gradient(145% 68% at ${horizonTilt.focalX.toFixed(1)}% ${horizonTilt.focalY.toFixed(1)}%, ${cssRgba(sky.horizon, Math.max(0.10, 0.32 * sky.exposure).toFixed(3))} 0%, transparent 74%),`,
    `    radial-gradient(115% 58% at ${horizonTilt.secondaryX.toFixed(1)}% ${horizonTilt.secondaryY.toFixed(1)}%, ${cssRgba(sky.horizon, (0.16 * sky.exposure).toFixed(3))} 0%, transparent 68%),`,
    `    radial-gradient(95% 48% at ${horizonTilt.ambientX.toFixed(1)}% 99%, ${cssRgba(sky.low, (0.15 * sky.exposure).toFixed(3))} 0%, transparent 64%),`,
    `    linear-gradient(180deg, rgba(0, 0, 0, ${scrim}), rgba(0, 0, 0, ${scrim})),`,
    `    linear-gradient(180deg, ${cssRgb(sky.top)} 0%, ${cssRgb(sky.mid)} 30%, ${cssRgb(sky.low)} 54%, ${cssRgb(sky.horizon)} 80%, ${cssRgb(sky.horizon)} 100%);`,
    '}',
    'body::before {',
    "  content: ''; position: fixed; left: 50%; top: 0; width: 62vmax; height: 62vmax;",
    '  pointer-events: none; z-index: -1;',
    // translateY in vh matches the old top percentage, but rides the
    // compositor during the 240s drift instead of triggering layout.
    '  transform: translate(-50%, calc(var(--zephyr-sun, 40) * 1vh));',
    '  transition: transform 240s linear;',
    `  background: radial-gradient(circle, ${cssRgba(sky.orb, sky.orbAlpha)} 0%, transparent 62%);`,
    '}',
        ]),
    // Panel density, and it is deliberately mode-scoped: Zephyr's phases are
    // dark palettes, and a light-mode app would not want a translucent ground.
    ':root.dark {',
    // Tinted glass: in the sky looks these read as near-neutral black; in
    // gruvbox they ARE the palette (bg0 chrome, bg0_hard sidebar, bg1 cards), so
    // the pane is a gruvbox surface with the painting behind it, not soot.
    `  --theme-neutral-chrome: rgba(${gruv ? hexTriple(SKIN.ground) : '13, 13, 14'}, ${density});`,
    `  --theme-neutral-sidebar: rgba(${gruv ? hexTriple(SKIN.deeper) : '10, 10, 11'}, ${sideDensity});`,
    `  --theme-neutral-card: rgba(${gruv ? hexTriple(SKIN.cardTint) : '22, 22, 24'}, ${cardDensity});`,
    `  --ui-text-primary: ${gruv ? SKIN.ink : '#ffffff'};`,
    '  --ui-text-secondary: var(--zf-ink-2);',
    '  --ui-text-tertiary: var(--zf-ink-3);',
    '  --sidebar-foreground: var(--zf-ink-1);',
    '  --sidebar-accent-foreground: var(--zf-ink-0);',
    '  --sidebar-muted-foreground: var(--zf-ink-2);',
    '  --ui-sidebar-foreground: var(--zf-ink-1);',
    '  --ui-sidebar-accent-foreground: var(--zf-ink-0);',
    '  --ui-sidebar-muted-foreground: var(--zf-ink-2);',
    '  --accent-foreground: var(--zf-ink-1);',
    '  --ui-accent-foreground: var(--zf-ink-1);',
    '}',
    // Active clicked elements: swap text to crisp light slate grey (var(--zf-ink-1)) so it never turns dark
    ":is([data-slot='sidebar-menu-button'], [data-slot='sidebar-menu-action'], [class~='peer/menu-button'], button, [role='button'], [data-slot='pane-tab'], a, input, select):active,",
    ":is([data-slot='sidebar-menu-button'], [data-slot='sidebar-menu-action'], [class~='peer/menu-button'], button, [role='button'], [data-slot='pane-tab']):active * {",
    '  color: var(--zf-ink-1) !important;',
    '}',
    ":is(button, [role='button'], [data-slot*='button'], [data-slot='pane-tab'], a):active svg {",
    '  color: var(--zf-ink-1) !important;',
    '  stroke: currentColor !important;',
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
    // No live backdrop-filter here: it re-blurred the moving sky behind the
    // whole column on every frame. The clouds are blur-baked instead.
    "[data-tour='sessions-sidebar'] {",
    '  background: transparent;',
    '  border-color: transparent;',
    '}',
    "[data-slot='sidebar-content'] {",
    '  gap: 0.5rem;',
    '  padding-top: calc(var(--titlebar-height, 0rem) + 0.625rem);',
    '  padding-bottom: 0.5rem;',
    '}',
    /* The first card drops default padding so the 3 action buttons fill the panel without grey edges on top/bottom */
    "[data-slot='sidebar-content'] > [data-slot='sidebar-group'] { padding: 0 !important; }",
    "[data-slot='sidebar-content'] > [data-slot='sidebar-group'] [data-slot='sidebar-menu'] { gap: 0 !important; }",
    "[data-slot='sidebar-content'] > [data-slot='sidebar-group'] [data-slot='sidebar-menu-button'] {",
    '  border-radius: 0 !important;',
    '  border: none !important;',
    '  height: 1.85rem !important;',
    '}',
    "[data-slot='sidebar-content'] > [data-slot='sidebar-group'],",
    "[data-slot='sidebar-content'] > [data-sessions-mode],",
    "[data-slot='sidebar-content'] > div:has(input),",
    "[data-slot='sidebar-content'] > div:last-child {",
    '  background: var(--zf-side-card);',
    '  border: none;',
    '  border-radius: var(--zf-radius);',
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
    "[data-slot='composer-bounds'],",
    // The app shell paints `[data-slot=sidebar-wrapper]` (with `[data-contrib-shell]`)
    // across the WHOLE window with an ink fill — 74% opaque at this density — which
    // dims the sky to a barely-visible tint and reads as "the sky is not rendering".
    // The app's own glass mode clears exactly this pair; do the same.
    "[data-slot='sidebar-wrapper'],",
    '[data-contrib-shell] {',
    '  background: transparent !important;',
    '}',
    "[data-slot='composer-bounds'],",
    "[data-slot='composer-dock'],",
    "[data-slot='composer-root'],",
    "[class~='group/composer'],",
    "[class~='group/composer-surface'],",
    "[data-slot='composer-surface'],",
    "form[data-slot='composer'] {",
    '  border: none !important;',
    '  outline: none !important;',
    '  box-shadow: none !important;',
    '}',
    // Retain the input box's floating shape with rounded corners matching the other panels (0.45rem)
    ":is([data-slot='composer-surface'], [class~='group/composer-surface'], .composer-fallback-surface) {",
    '  border-radius: var(--zf-radius) !important;',
    '  overflow: hidden !important;',
    '}',
    // The root's own fade layer spans the 5px grab margin and darkens toward
    // the bottom, so around a floating surface it reads as a lopsided shadow.
    "[data-slot='composer-root'] > .pointer-events-none.absolute:not([data-slot]) {",
    '  background: none !important;',
    '}',
    // Status stack card: the composer's fill, corner radius and hairline edge,
    // with the bottom left open into the composer (the fillets close it).
    "[data-slot='composer-status-stack'] > div[class*='rounded-t-'] {",
    '  background: var(--zf-glass) !important;',
    '  border-color: var(--zf-edge) !important;',
    '  border-bottom-color: transparent !important;',
    '  border-top-left-radius: var(--zf-radius) !important;',
    '  border-top-right-radius: var(--zf-radius) !important;',
    '  box-shadow: none !important;',
    // inset by the composer's corner radius (plus the root's 5px grab margin),
    // so the stack sits inside the composer's rounded shoulders and the
    // fillets have room to flare out into them
    "  margin-inline: calc(5px + var(--zf-radius)) !important;",
    '}',
    // Outer dock and root wrappers remain transparent so no box leaks outside
    "[data-slot='composer-dock'],",
    "[data-slot='composer-root'],",
    "[class~='group/composer'] {",
    '  background: transparent !important;',
    '  background-color: transparent !important;',
    '}',
    "[data-slot='sidebar-content'] input {",
    '  border: none !important;',
    '  outline: none !important;',
    '  box-shadow: none !important;',
    '}',
    "[data-slot='user-message'], [data-slot='assistant-message'] {",
    '  border: none !important;',
    '  outline: none !important;',
    '}',
    // User message bubbles: styled to match the frosted panels and composer cards
    ":is([data-slot='aui_user-message-root'], [data-slot='user-message']) :is(.composer-human-message, [class*='composer-human-message']),",
    ":is(.composer-human-message, [class*='composer-human-message'], .composer-human-message-container) {",
    '  background: var(--zf-glass) !important;',
    '  background-color: var(--zf-glass) !important;',
    '  border: none !important;',
    '  outline: none !important;',
    '  box-shadow: none !important;',
    '  border-radius: var(--zf-radius) !important;',
    '  color: var(--zf-ink-0) !important;',
    '}',
    ":is(.composer-human-message, [class*='composer-human-message']):hover {",
    '  background: var(--zf-glass-hover) !important;',
    '  border: none !important;',
    '  outline: none !important;',
    '}',
    ":is(.composer-human-message, [class*='composer-human-message']) :is(p, span, div, button, code) {",
    '  color: var(--zf-ink-0) !important;',
    '}',
    // User message hover cluster: remove the background box around time and actions, position bottom-right
    ":is([data-slot='aui_user-message-root'], [data-slot='user-message'], .composer-human-message, [class*='composer-human-message']) [class*='group-hover/user-message'] {",
    '  background: transparent !important;',
    '  background-color: transparent !important;',
    '  box-shadow: none !important;',
    '  border: none !important;',
    '  outline: none !important;',
    '  padding: 0 !important;',
    '  position: absolute !important;',
    '  right: 0.5rem !important;',
    '  bottom: 0.35rem !important;',
    '  display: flex !important;',
    '  align-items: flex-end !important;',
    '  justify-content: flex-end !important;',
    '  opacity: 0.85 !important;',
    '  transition: opacity 0.15s ease-in-out !important;',
    '}',
    ":is([data-slot='aui_user-message-root'], [data-slot='user-message']):hover [class*='group-hover/user-message'] {",
    '  opacity: 1 !important;',
    '}',
    // Remove stop button on user messages
    ":is([data-slot='aui_user-message-root'], [data-slot='user-message']) [class*='group-hover/user-message'] button,",
    ":is([data-slot='aui_user-message-root'], [data-slot='user-message']) button[aria-label*='Stop' i] {",
    '  display: none !important;',
    '}',
    // User message time: accent colour
    ":is([data-slot='aui_user-message-root'], [data-slot='user-message'], .composer-human-message, [class*='composer-human-message']) [class*='group-hover/user-message'] :is(time, span, div),",
    ":is([data-slot='aui_user-message-root'], [data-slot='user-message'], .composer-human-message, [class*='composer-human-message']) time,",
    ":is([data-slot='aui_user-message-root'], [data-slot='user-message']) :is([data-slot='timeline-timestamp'], [class*='timeline-timestamp']) time {",
    '  color: var(--zf-ink-3) !important;',
    '}',
    // Brighter, whiter text across transcript, chat bubbles, and sidebar
    ":is([data-slot='aui_thread-content'], [data-chat-surface], [data-slot='thread']) {",
    `  color: ${solidInk};`,
    '  background: transparent !important;',
    '}',
    ":is([data-slot='aui_thread-content'], [data-slot='thread']) :is(p, li, span, h1, h2, h3, h4) {",
    '  color: var(--zf-ink-0);',
    '}',
    // Panel items: visible, legible grey hierarchy on dark card backgrounds
    ":is([data-tour='sessions-sidebar'], [data-slot='sidebar-content'], [data-sessions-mode]) {",
    '  color: var(--zf-ink-1);',
    '}',
    // Primary items: session titles, navigation buttons, menu actions
    ":is([data-tour='sessions-sidebar'], [data-slot='sidebar-content'], [data-sessions-mode]) :is([data-slot='sidebar-menu-button'], [data-slot='sidebar-menu-action'], [data-slot='sidebar-menu-sub-button'], button, a, [role='button']) {",
    '  color: var(--zf-ink-1) !important;',
    '}',
    ":is([data-tour='sessions-sidebar'], [data-slot='sidebar-content'], [data-sessions-mode]) :is([data-slot='sidebar-menu-button'], [data-slot='sidebar-menu-action'], [data-slot='sidebar-menu-sub-button'], button, a, [role='button']) :is(span:not([class*='text-xs']):not([class*='tabular-nums']), p, div, label) {",
    '  color: inherit;',
    '}',
    // Override Tailwind muted and sidebar foreground classes in panels
    ":is([data-tour='sessions-sidebar'], [data-slot='sidebar-content'], [data-sessions-mode]) [class*='text-sidebar-foreground'] {",
    '  color: var(--zf-ink-1) !important;',
    '}',
    ":is([data-tour='sessions-sidebar'], [data-slot='sidebar-content'], [data-sessions-mode]) [class*='text-muted'] {",
    '  color: var(--zf-ink-2) !important;',
    '}',
    // Active session item remains crisp bright white
    ":is([data-tour='sessions-sidebar'], [data-slot='sidebar-content'], [data-sessions-mode]) :is([data-slot='sidebar-menu-button'], button, a, [role='button'])[data-active='true'],",
    ":is([data-tour='sessions-sidebar'], [data-slot='sidebar-content'], [data-sessions-mode]) :is([data-slot='sidebar-menu-button'], button, a, [role='button'])[data-active='true'] * {",
    '  color: var(--zf-ink-0) !important;',
    '}',
    // Panel SVGs and icons: visible medium-light grey
    ":is([data-tour='sessions-sidebar'], [data-slot='sidebar-content'], [data-sessions-mode]) :is(svg, [data-slot*='icon']) {",
    '  color: var(--zf-ink-2) !important;',
    '  stroke: currentColor;',
    '}',
    // Disentangle date and 3-dot hamburger/kebab menu so they never collide
    ":is([data-slot='sidebar-menu-item'], [data-sessions-mode] li, [data-row-actions]) {",
    '  position: relative !important;',
    '}',
    "[data-sessions-mode] [data-slot='sidebar-menu-button'] {",
    '  padding-right: 2.25rem !important;',
    '}',
    "[data-sessions-mode] [data-row-actions] {",
    '  display: flex !important;',
    '  align-items: center !important;',
    '  justify-content: flex-end !important;',
    '  gap: 0.375rem !important;',
    '  position: relative !important;',
    '}',
    // In Hermes session-row, the kebab button previously had absolute right-0 which collided with the date.
    // Flow the button cleanly beside the date with dedicated breathing room:
    "[data-sessions-mode] [data-row-actions] button,",
    "[data-sessions-mode] [data-row-actions] [role='button'],",
    "[data-sessions-mode] [data-slot='sidebar-menu-action'] {",
    '  position: relative !important;',
    '  right: auto !important;',
    '  top: auto !important;',
    '  transform: none !important;',
    '  flex-shrink: 0 !important;',
    '  display: inline-flex !important;',
    '  align-items: center !important;',
    '  justify-content: center !important;',
    '  margin-left: 0.25rem !important;',
    '  z-index: 2 !important;',
    '}',
    // Ensure the date / tail does not disappear or fade into the button on hover
    "[data-sessions-mode] [data-row-actions] .session-row-tail,",
    "[data-sessions-mode] [data-row-actions] [class*='session-row-tail'] {",
    '  opacity: 1 !important;',
    '  display: inline-flex !important;',
    '  align-items: center !important;',
    '}',
    // Timestamps, dates, snippets, and secondary metadata in visible grey
    "[data-sessions-mode] :is(time, [class*='text-xs'], [class*='tabular-nums'], [class*='date'], [class*='time'], [class*='snippet'], [class*='preview'], [class*='desc']) {",
    '  color: var(--zf-ink-2) !important;',
    '  flex-shrink: 0 !important;',
    '  margin-left: auto !important;',
    '  white-space: nowrap !important;',
    '}',
    // 3-dot kebab icon: clear, visible medium-grey by default, bright white on hover
    "[data-sessions-mode] [data-row-actions] button svg,",
    "[data-sessions-mode] [data-slot='sidebar-menu-action'] svg {",
    '  color: var(--zf-ink-2) !important;',
    '  stroke: currentColor !important;',
    '}',
    "[data-sessions-mode] [data-row-actions] button:hover svg,",
    "[data-sessions-mode] [data-slot='sidebar-menu-action']:hover svg {",
    `  color: ${solidInk} !important;`,
    '}',
    // ── Session status indicators in chat history panel ──────────────────────
    // Remove the traveling border laser/arc animation around running session rows
    '.arc-border.arc-row,',
    ':root.dark .arc-border.arc-row {',
    '  display: none !important;',
    '  opacity: 0 !important;',
    '  animation: none !important;',
    '}',
    // Base indicator dot geometry: clean 6px circular dot
    ":is([data-sessions-mode], [data-tour='sessions-sidebar'], [data-slot='sidebar-content']) [class*='place-items-center'] span[class*='rounded-full'],",
    ":is([data-sessions-mode], [data-tour='sessions-sidebar'], [data-slot='sidebar-content']) [class*='place-items-center'] span[role='status'] {",
    '  width: 6px !important;',
    '  height: 6px !important;',
    '  border-radius: 9999px !important;',
    '  display: inline-block !important;',
    '  flex-shrink: 0 !important;',
    '}',
    // Grey dot: not working right now (idle, draft, background, settled - clean slate default)
    ":is([data-sessions-mode], [data-tour='sessions-sidebar'], [data-slot='sidebar-content']) [class*='place-items-center'] span[class*='rounded-full'] {",
    '  background: #64748b !important;',
    '  background-color: #64748b !important;',
    '  border-color: #64748b !important;',
    '  border: none !important;',
    '  box-shadow: none !important;',
    '  opacity: 0.65 !important;',
    '  animation: none !important;',
    '}',
    // Green dot: turn is done (unread / finished)
    ":is([data-sessions-mode], [data-tour='sessions-sidebar'], [data-slot='sidebar-content']) [class*='place-items-center'] span[role='status']:is([class*='ui-success'], [aria-label*='finish' i], [title*='finish' i], [aria-label*='unread' i], [title*='unread' i]) {",
    '  background: #22c55e !important;',
    '  background-color: #22c55e !important;',
    '  border-color: #22c55e !important;',
    '  border: none !important;',
    '  box-shadow: 0 0 5px rgba(34, 197, 94, 0.45) !important;',
    '  opacity: 1 !important;',
    '  animation: none !important;',
    '}',
    // Yellow dot: action required (needs input, tool approval, clarify)
    ":is([data-sessions-mode], [data-tour='sessions-sidebar'], [data-slot='sidebar-content']) [class*='place-items-center'] span[role='status']:is([class*='amber'], [aria-label*='input' i], [title*='answer' i], [title*='input' i]) {",
    '  background: #eab308 !important;',
    '  background-color: #eab308 !important;',
    '  border-color: #eab308 !important;',
    '  border: none !important;',
    '  box-shadow: 0 0 6px rgba(234, 179, 8, 0.55) !important;',
    '  opacity: 1 !important;',
    '  animation: none !important;',
    '}',
    // Blue dot: ONLY when actually running (working / stalled turn). Every
    // working/stalled dot already carries `ui-accent` and role=status, so the
    // old `:has(> .arc-row)` fallback was redundant — and it made Blink
    // re-evaluate :has() for every virtualized row mount while scrolling.
    ":is([data-sessions-mode], [data-tour='sessions-sidebar'], [data-slot='sidebar-content']) [class*='place-items-center'] span[role='status']:is([class*='ui-accent'], [aria-label*='session running' i]) {",
    '  background: #3b82f6 !important;',
    '  background-color: #3b82f6 !important;',
    '  border-color: #3b82f6 !important;',
    '  border: none !important;',
    '  box-shadow: 0 0 6px rgba(59, 130, 246, 0.6) !important;',
    '  opacity: 1 !important;',
    '  position: relative !important;',
    '  animation: zephyr-running-dot 2s cubic-bezier(0.4, 0, 0.6, 1) infinite !important;',
    '}',
    // The pulse ring rides a pseudo-element: transform and opacity only, so it
    // animates on the compositor instead of repainting the dot's box-shadow on
    // the main thread while the history list scrolls.
    ":is([data-sessions-mode], [data-tour='sessions-sidebar'], [data-slot='sidebar-content']) [class*='place-items-center'] span[role='status']:is([class*='ui-accent'], [aria-label*='session running' i])::after {",
    "  content: ''; position: absolute; inset: 0; border-radius: 9999px; pointer-events: none;",
    '  box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.6) !important;',
    '  animation: zephyr-running-ring 2s cubic-bezier(0.4, 0, 0.6, 1) infinite !important;',
    '}',
    '@keyframes zephyr-running-dot {',
    '  0%, 100% { transform: scale(1); }',
    '  50% { transform: scale(1.15); }',
    '}',
    '@keyframes zephyr-running-ring {',
    '  0%, 100% { transform: scale(0.8); opacity: 0.7; }',
    '  50% { transform: scale(1.5); opacity: 0; }',
    '}',
    '@media (prefers-reduced-motion: reduce) {',
    // Mirrors the running-dot selectors' specificity (plus html) so the
    // override actually wins; the shorter selector it replaced lost to the
    // dot rules and the pulse kept animating under reduced motion.
    "  html :is([data-sessions-mode], [data-tour='sessions-sidebar'], [data-slot='sidebar-content']) [class*='place-items-center'] span[role='status'],",
    "  html :is([data-sessions-mode], [data-tour='sessions-sidebar'], [data-slot='sidebar-content']) [class*='place-items-center'] span[role='status']::after {",
    '    animation: none !important;',
    '  }',
    '}',
    // Section headers: PINNED, SESSIONS, YESTERDAY, MATRIX
    ":is([data-tour='sessions-sidebar'], [data-slot='sidebar-content'], [data-sessions-mode]) :is([data-slot='sidebar-group-label'], [class*='group-label'], [class*='sidebar-group-label'], h2, h3) {",
    '  color: var(--zf-ink-3) !important;',
    '  font-weight: 500;',
    '}',
    // Search input text and placeholder
    "[data-slot='sidebar-content'] input {",
    '  color: var(--zf-ink-1) !important;',
    '}',
    "[data-slot='sidebar-content'] input::placeholder {",
    '  color: var(--zf-ink-3) !important;',
    '  opacity: 1 !important;',
    '}',
    // Keyboard shortcut badges
    ":is([data-tour='sessions-sidebar'], [data-slot='sidebar-content']) kbd {",
    '  color: var(--zf-ink-3) !important;',
    '  border-color: rgba(148, 163, 184, 0.28) !important;',
    '  background: rgba(255, 255, 255, 0.05) !important;',
    '}',
    // Switch tabs: inactive tab in grey, active in white
    `${SWITCH_HOOK} > [role='tablist'] > [data-slot='pane-tab'] {`,
    '  color: var(--zf-ink-2) !important;',
    '}',
    `${SWITCH_HOOK} > [role='tablist'] > [data-slot='pane-tab']:hover {`,
    `  color: ${solidInk} !important;`,
    '}',
    `${SWITCH_HOOK} > [role='tablist'] > [data-slot='pane-tab'][data-active='true'] {`,
    '  color: var(--zf-ink-0) !important;',
    '}',
    // Hover state on panel items
    ":is([data-tour='sessions-sidebar'], [data-slot='sidebar-content'], [data-sessions-mode]) :is([data-slot='sidebar-menu-button'], button, a, [role='button']):hover {",
    `  color: ${solidInk} !important;`,
    '  background-color: rgba(255, 255, 255, 0.08) !important;',
    '}',
    ":is([data-tour='sessions-sidebar'], [data-slot='sidebar-content'], [data-sessions-mode]) :is([data-slot='sidebar-menu-button'], button, a, [role='button']):hover * {",
    `  color: ${solidInk} !important;`,
    '}',
    ":is([data-tour='sessions-sidebar'], [data-slot='sidebar-content'], [data-sessions-mode]) :is([data-slot='sidebar-menu-button'], button, a, [role='button']):hover :is(svg, [data-slot*='icon']) {",
    `  color: ${solidInk} !important;`,
    '}',
    // Profile rail at the bottom
    "[data-slot='profile-rail'] :is(span, p, div, label) {",
    '  color: var(--zf-ink-2) !important;',
    '}',
    "[data-slot='profile-rail'] :is(svg, [data-slot*='icon']) {",
    '  color: var(--zf-ink-3) !important;',
    '}',
    "[data-slot='user-message'] {",
    '  background: var(--zf-glass) !important;',
    `  color: ${solidInk} !important;`,
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
    '  border: none;',
    '  border-radius: 999px;',
    // Recessed: the same fill and frost as the cards, one step down, so the
    // pill on top reads as the raised piece.
    '  background: var(--zf-side-card);',
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
    '  background: var(--zf-side-card-hi);',
    '  box-shadow: none;',
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
    // Inset history items away from card borders with balanced breathing room
    '[data-sessions-mode] {',
    '  padding: 0.375rem 0.375rem 0.25rem;',
    '  box-sizing: border-box;',
    '}',
    // Lessen awkwardly large dead space at the bottom of the history panel
    "[data-sessions-mode] [class~='pb-1.75'] {",
    '  padding-bottom: 0.25rem;',
    '}',
    // Center bottom bar elements vertically so they are never shifted high
    "[data-slot='sidebar-content'] > div:last-child {",
    '  display: flex;',
    '  align-items: center;',
    '  padding: 0.25rem 0.375rem !important;',
    '}',
    "[data-slot='sidebar-content'] > div:last-child > [data-slot='profile-rail'],",
    "[data-slot='profile-rail'] {",
    '  display: flex;',
    '  align-items: center;',
    '  width: 100%;',
    '  margin: auto 0;',
    '}',
    "[data-slot='profile-rail'] button, [data-slot='profile-rail'] [role='button'] {",
    '  display: inline-flex;',
    '  align-items: center;',
    '  justify-content: center;',
    '  vertical-align: middle;',
    '  margin: auto 0;',
    '}',
    "footer[data-slot='statusbar'], [data-slot='statusbar'] {",
    '  display: flex;',
    '  align-items: center;',
    '}',
    "[data-slot='statusbar'] > div {",
    '  display: flex;',
    '  align-items: center;',
    '  height: 100%;',
    '}',
    "[data-slot='statusbar'] button, [data-slot='statusbar'] a, [data-slot='statusbar'] span {",
    '  display: inline-flex;',
    '  align-items: center;',
    '  vertical-align: middle;',
    '}',
    // The chat slide on session switch lives in the always-on motion sheet
    // (§5b) with the rest of the interface motion, so it survives Sky off.
    // Spacious chat margins setting: apply margins symmetrically from both sides,
    // keeping composer-bounds and thread full-width so the quick-jump timeline is never compressed,
    // and make the input bar short and centered to match the spacious layout.
    // When messages exist, constrain thread content to a comfortable reading column.
    "html[data-zephyr-margins='spacious'] [data-slot='aui_thread-content']:not(:has([data-slot='aui_intro'], .wordmark, [class*='wordmark'])) {",
    '  --composer-width: min(46rem, calc(100% - 7rem));',
    '  max-width: min(46rem, calc(100% - 7rem)) !important;',
    '  margin-left: auto !important;',
    '  margin-right: auto !important;',
    // no inner padding: the column's edges ARE the composer's edges, so the
    // chat and the input box line up (user bubbles already sit flush, and the
    // reply text keeps Hermes's own small indent, like the composer's pad)
    '  padding-left: 0 !important;',
    '  padding-right: 0 !important;',
    '  box-sizing: border-box !important;',
    '}',
    // When thread has messages, also constrain message groups
    "html[data-zephyr-margins='spacious'] [data-slot='aui_thread-content']:has([data-slot*='message'], [data-slot='aui_turn-pair'], [data-slot='aui_message-group']) {",
    '  --composer-width: min(46rem, calc(100% - 7rem));',
    '  max-width: min(46rem, calc(100% - 7rem)) !important;',
    '  margin-left: auto !important;',
    '  margin-right: auto !important;',
    // no inner padding: the column's edges ARE the composer's edges, so the
    // chat and the input box line up (user bubbles already sit flush, and the
    // reply text keeps Hermes's own small indent, like the composer's pad)
    '  padding-left: 0 !important;',
    '  padding-right: 0 !important;',
    '  box-sizing: border-box !important;',
    '}',
    // In spacious margins mode, when chat is empty (intro / wordmark shown),
    // thread content and intro remain full-width (100%), so the HERMES AGENT
    // display lettering spans the full canvas, exactly as in non-spacious mode.
    "html[data-zephyr-margins='spacious'] [data-slot='aui_thread-content']:has([data-slot='aui_intro'], .wordmark, [class*='wordmark']),",
    "[data-slot='aui_thread-content']:has([data-slot='aui_intro'], .wordmark, [class*='wordmark']) {",
    '  --composer-width: 100% !important;',
    '  max-width: 100% !important;',
    '  width: 100% !important;',
    '  padding-left: 1.5rem !important;',
    '  padding-right: 1.5rem !important;',
    '  box-sizing: border-box !important;',
    '}',
    "html[data-zephyr-margins='spacious'] [data-slot='aui_thread-content']:has([data-slot='aui_intro'], .wordmark, [class*='wordmark']) > *,",
    "[data-slot='aui_thread-content']:has([data-slot='aui_intro'], .wordmark, [class*='wordmark']) > * {",
    '  width: 100% !important;',
    '  max-width: 100% !important;',
    '}',
    "[data-slot='aui_intro'] {",
    '  width: 100% !important;',
    '  max-width: 100% !important;',
    '  margin-inline: auto !important;',
    '}',
    "[data-slot='aui_intro'] > div {",
    '  --composer-width: 100% !important;',
    '  width: 100% !important;',
    '  max-width: 100% !important;',
    '  margin-inline: auto !important;',
    '}',
    "[data-slot='aui_intro'] :is(.wordmark, [class*='wordmark']) {",
    '  width: calc(100% - 1rem) !important;',
    '  max-width: 100% !important;',
    '  margin-inline: auto !important;',
    '}',
    "[data-slot='aui_intro'] p:last-child {",
    '  color: rgba(255, 255, 255, 0.92) !important;',
    '  max-width: 34rem !important;',
    '  margin-inline: auto !important;',
    '  font-size: 0.875rem !important;',
    '  line-height: 1.45 !important;',
    '}',
    // measured fit (fitColumn): exact left edge and width of the composer surface
    "html[data-zephyr-margins='spacious'] [data-slot='aui_thread-content'][data-zephyr-col-fit] {",
    '  margin-left: var(--zf-col-left) !important;',
    '  margin-right: 0 !important;',
    '  width: var(--zf-col-w) !important;',
    '  max-width: var(--zf-col-w) !important;',
    '  --composer-width: var(--zf-col-w);',
    '}',
    "html[data-zephyr-margins='spacious'] [data-slot='composer-bounds'],",
    "html[data-zephyr-margins='spacious'] [data-slot='thread'],",
    "html[data-zephyr-margins='spacious'] [data-slot='aui_thread-viewport'] {",
    '  width: 100% !important;',
    '  max-width: 100% !important;',
    '}',
    // Make the input dock also short and centered when spacious margins are on
    "html[data-zephyr-margins='spacious'] [data-slot='composer-dock']:not([data-popped-out]),",
    "html[data-zephyr-margins='spacious'] [data-slot='composer-root']:not([data-popped-out]):not([data-slot='composer-dock'] *) {",
    // the surface is the dock minus its 5px grab margin each side, so it is
    // exactly the chat column's min(46rem, 100% - 7rem)
    '  width: calc(min(46rem, calc(100% - 7rem)) + 10px) !important;',
    '  max-width: calc(100% - 1rem) !important;',
    '  left: 0 !important;',
    '  right: 0 !important;',
    '  margin-left: auto !important;',
    '  margin-right: auto !important;',
    '  transform: none !important;',
    '  translate: none !important;',
    '}',
    // Ensure prompt quick-jump timeline stays parked at the right edge, completely uncompressed
    "html[data-zephyr-margins='spacious'] [data-slot='thread-timeline'] {",
    '  position: absolute !important;',
    '  right: 0.5rem !important;',
    '  z-index: 40 !important;',
    '}',
    // Work progress collapse on finished turns lives in the always-on motion
    // sheet (§5b), not here: folding is an interface behaviour, not a sky
    // visual, so it must survive Sky being off. Search for "THE WORK FOLD".
    // Night mode: opaque black-ish grey surface across panels, toggle, and input bar
    // (2026-10-10, Peter: too light at night) one notch darker, with a breath
    // of the night-sky navy so they sit in the sky instead of on it.
    ...(isNight
      ? [
          ':root {',
          '  --zf-night-well: rgb(13, 14, 17);',
          '  --zf-night-panel: rgb(20, 21, 25);',
          '  --zf-night-raised: rgb(24, 25, 29);',
          '  --zf-night-hover: rgb(31, 32, 37);',
          '}',
          "[data-slot='sidebar-content'] > [data-sessions-mode] {",
          '  background: var(--zf-side-card) !important;',
          '  opacity: 1 !important;',
          '}',
          "[data-slot='sidebar-content'] > [data-slot='sidebar-group'],",
          "[data-slot='sidebar-content'] > div:has(input),",
          "[data-slot='sidebar-content'] > div:last-child {",
          '  background: var(--zf-side-card) !important;',
          '  opacity: 1 !important;',
          '}',
          `${SWITCH_HOOK} [role='tablist'] {`,
          '  background: var(--zf-side-card) !important;',
          '  opacity: 1 !important;',
          '}',
          `${SWITCH_HOOK} [role='tablist']::after {`,
          '  background: var(--zf-side-card-hi) !important;',
          '  opacity: 1 !important;',
          '}',
          // Composer input bar: ensure dock and root stay transparent, while surface retains original rounded pill shape
          "[data-slot='composer-root'] {",
          '  --composer-fill: var(--zf-night-raised) !important;',
          '}',
          "[data-slot='composer-dock'],",
          "[data-slot='composer-root'],",
          "[class~='group/composer'] {",
          '  background: transparent !important;',
          '  background-color: transparent !important;',
          '}',
          ":is([data-slot='composer-surface'], [class~='group/composer-surface'], .composer-fallback-surface) {",
          '  --composer-fill: var(--zf-night-raised) !important;',
          '  background-color: var(--zf-night-raised) !important;',
          '  background: var(--zf-night-raised) !important;',
          '  border-radius: var(--zf-radius) !important;',
          '  overflow: hidden !important;',
          '  opacity: 1 !important;',
          '}',
          ":is([data-slot='composer-surface'], [class~='group/composer-surface']) > div:first-child,",
          ":is([data-slot='composer-surface'], [class~='group/composer-surface']) [class*='composerInputBacking'] {",
          '  background-color: var(--zf-night-raised) !important;',
          '  background: var(--zf-night-raised) !important;',
          '  border-radius: var(--zf-radius) !important;',
          '  opacity: 1 !important;',
          '}',
          "[data-slot='composer-status-stack'] > div[class*='rounded-t-'] {",
          '  background: var(--zf-night-raised) !important;',
          '}',
          "form[data-slot='composer'] :is(textarea, input),",
          "[data-slot='composer-root'] :is(textarea, input, [contenteditable='true']) {",
          '  color: var(--zf-ink-0) !important;',
          '}',
          "form[data-slot='composer'] :is(textarea, input)::placeholder,",
          "[data-slot='composer-root'] :is(textarea, input, [contenteditable='true'])::placeholder,",
          "[data-slot='composer-root'] [data-placeholder]::before {",
          '  color: var(--zf-ink-3) !important;',
          '}',
          "form[data-slot='composer'] svg,",
          "[data-slot='composer-root'] svg {",
          '  color: var(--zf-ink-2) !important;',
          '}',
          ":is([data-slot='aui_user-message-root'], [data-slot='user-message']) :is(.composer-human-message, [class*='composer-human-message']),",
          ":is(.composer-human-message, [class*='composer-human-message'], .composer-human-message-container) {",
          '  background: var(--zf-night-raised) !important;',
          '  background-color: var(--zf-night-raised) !important;',
          '  border-radius: var(--zf-radius) !important;',
          '  border: none !important;',
          '}',
          ":is(.composer-human-message, [class*='composer-human-message']):hover {",
          '  background: var(--zf-night-hover) !important;',
          '}',
          ":is([data-slot='aui_user-message-root'], [data-slot='user-message']) [class*='group-hover/user-message'] {",
          '  background: transparent !important;',
          '}'
        ]
      : []),
    '@media (prefers-reduced-motion: reduce) { body::before { transition: none; } }',
    // ── Tool output on the sky ──────────────────────────────────────────────
    // An open tool block (a command, its output, a payload) sat straight on
    // the backdrop with tertiary ink, and vanished under a bright day sky
    // (2026-10-11, Peter). It now gets the sidebar-card ground, its command
    // and output step up to ink-1, and the transcript line sits in a well.
    // Closed rows keep the open sky; by day they get a soft shadow instead.
    "[data-slot='tool-block'][data-tool-open] { background: var(--zf-side-card); border-color: var(--zf-edge) !important; }",
    "[data-slot='tool-block'][data-tool-open] :is(pre, code) { color: var(--zf-ink-1) !important; }",
    "[data-slot='tool-block'][data-tool-open] div:has(> code) { background: var(--zf-well) !important; border-color: var(--zf-edge) !important; }",
    "[data-slot='tool-block'][data-tool-open] [class*='tracking-[0.08em]'] { color: var(--zf-ink-2) !important; }",
    ...(isNight ? [] : ["[data-slot='tool-block']:not([data-tool-open]), .zephyr-work-summary { text-shadow: 0 1px 0.5rem rgba(0, 0, 0, 0.35); }"]),
    // ── Zephyr material ─────────────────────────────────────────────────────
    // One glass for every surface, tinted by the sky itself: a deep ink pulled
    // toward the current zenith colour, so panels read navy at noon, plum at
    // dusk and near-black at night instead of a flat neutral grey. Text inks
    // carry the same hue at a whisper. Large surfaces get NO backdrop-filter:
    // the clouds behind them are already blur-baked, so the frost is free, and
    // a live backdrop blur over drifting clouds would re-render every frame.
    // Only small, transient surfaces (menus, popovers, tooltips) frost live.
    ':root {',
    `  --zf-tint: ${cssRgb(zf.tint)};`,
    `  --zf-tint-hi: ${cssRgb(zf.tintHi)};`,
    `  --zf-glass: color-mix(in srgb, var(--zf-tint) ${glassPct(80 + 9 * zf.night)}, transparent);`,
    `  --zf-glass-hover: color-mix(in srgb, var(--zf-tint-hi) ${glassPct(86 + 6 * zf.night)}, transparent);`,
    `  --zf-glass-strong: color-mix(in srgb, var(--zf-tint) ${glassPct(94 + 3 * zf.night)}, transparent);`,
    `  --zf-glass-sunk: color-mix(in srgb, var(--zf-tint) ${glassPct(50 + 18 * zf.night)}, transparent);`,
    `  --zf-well: rgba(0, 0, 0, ${(0.16 + 0.08 * zf.night).toFixed(3)});`,
    '  --zf-edge: rgba(255, 255, 255, 0.07);',
    // every card in the sessions column paints this one fill (2026-10-10,
    // Peter: nav, search, switch and status match the sessions card)
    `  --zf-side-card: ${isNight ? 'var(--zf-night-panel)' : 'var(--zf-glass)'};`,
    `  --zf-side-card-hi: ${isNight ? 'var(--zf-night-hover)' : 'var(--zf-glass-hover)'};`,
    '  --zf-edge-strong: rgba(255, 255, 255, 0.11);',
    '  --zf-hover: rgba(255, 255, 255, 0.065);',
    '  --zf-lift: inset 0 0 0 1px var(--zf-edge), inset 0 1px 0 rgba(255, 255, 255, 0.045);',
    '  --zf-lift-high: inset 0 0 0 1px var(--zf-edge-strong), inset 0 1px 0 rgba(255, 255, 255, 0.06);',
    '  --zf-frost: blur(1.25rem) saturate(1.35);',
    '  --zf-radius: 0.6rem;',
    '  --zf-radius-lg: 0.9rem;',
    `  --zf-ink-0: ${cssRgb(zf.ink[0])};`,
    `  --zf-ink-1: ${cssRgb(zf.ink[1])};`,
    `  --zf-ink-2: ${cssRgb(zf.ink[2])};`,
    `  --zf-ink-3: ${cssRgb(zf.ink[3])};`,
    `  --zf-accent: ${gruv ? SKIN.accent : zf.accent};`,
    '}',
    // Outside the :root block, on purpose: these are rules, not custom
    // properties, and a stray `{` inside a declaration block makes the parser
    // swallow everything after it.
    ...materialVars(gruv),
    ...SESSION_TAB_CSS,
    ...PANE_RAIL_CSS,
    ...(gruv ? gruvboxTextCss() : []),
    ...polishCss(),
    // Sidebar cards, the composer and the switch pill share the material.
    "[data-slot='sidebar-content'] > [data-slot='sidebar-group'],",
    "[data-slot='sidebar-content'] > [data-sessions-mode],",
    "[data-slot='sidebar-content'] > div:has(input),",
    "[data-slot='sidebar-content'] > div:last-child {",
    // flat: no 1px edge (2026-10-10, Peter), like the status card
    '  box-shadow: none !important;',
    '}',
    ":is([data-tour='sessions-sidebar'], [data-slot='sidebar-content'], [data-sessions-mode]) :is([data-slot='sidebar-menu-button'], button, a, [role='button']):hover {",
    '  background-color: var(--zf-hover) !important;',
    '}',
    ":is([data-tour='sessions-sidebar'], [data-slot='sidebar-content'], [data-sessions-mode]) :is([data-slot='sidebar-menu-button'], button, a, [role='button'])[data-active='true'] {",
    '  background-color: color-mix(in srgb, var(--zf-accent) 14%, transparent) !important;',
    '}',
    // The top nav rows (New session, Capabilities, Messaging, …) mark their
    // active page with a class, not data-active, so they kept the app's grey
    // fill. They take the same time-of-day accent as the session rows, and
    // their icons pick it up on hover and when active.
    "[data-slot='sidebar-menu-button']:has([data-tour^='sidebar-nav-'])[class*='bg-(--ui-control-active-background)'] {",
    '  background-color: color-mix(in srgb, var(--zf-accent) 14%, transparent) !important;',
    '  border-color: color-mix(in srgb, var(--zf-accent) 22%, transparent) !important;',
    '  color: var(--zf-ink-0) !important;',
    '}',
    "[data-slot='sidebar-menu-button']:has([data-tour^='sidebar-nav-']) > svg,",
    "[data-slot='sidebar-menu-button']:has([data-tour^='sidebar-nav-']) > i {",
    '  transition: color 120ms ease;',
    '}',
    "[data-slot='sidebar-menu-button']:has([data-tour^='sidebar-nav-']):is(:hover, [class*='bg-(--ui-control-active-background)']) > :is(svg, i, [class*='codicon']) {",
    '  color: var(--zf-ink-0) !important;',
    '}',
    ":is([data-slot='composer-surface'], [class~='group/composer-surface'], .composer-fallback-surface) {",
    '  background: var(--zf-glass) !important;',
    '  box-shadow: var(--zf-lift) !important;',
    '  transition: box-shadow 160ms ease;',
    '}',
    ":is([data-slot='composer-surface'], [class~='group/composer-surface'], .composer-fallback-surface):focus-within {",
    '  box-shadow: var(--zf-lift) !important;',
    '}',
    // No focus ring on the input bar (Peter, 2026-10-10): the caret is enough.
    "[data-slot='composer-root'] :is(textarea, input, [contenteditable='true']):is(:focus, :focus-visible) {",
    '  outline: none !important;',
    '  box-shadow: none !important;',
    '}',
    ":is([data-slot='aui_user-message-root'], [data-slot='user-message']) :is(.composer-human-message, [class*='composer-human-message']),",
    ":is(.composer-human-message, [class*='composer-human-message'], .composer-human-message-container) {",
    '  box-shadow: var(--zf-lift) !important;',
    '}',
    `${SWITCH_HOOK} > [role='tablist'],`,
    `${SWITCH_HOOK} > [role='tablist']::after {`,
    '  box-shadow: none;',
    '}',
    // ── The rest of the app ────────────────────────────────────────────────
    // Pages in the workspace (Artifacts, Skills, Messaging…) are full-height
    // sections painted with the chat token, which glass mode clears; with the
    // body cleared for the sky they had no ground at all. They get the glass.
    "section[class*='bg-(--ui-chat-surface-background)']:not([data-chat-surface]) {",
    '  background: var(--zf-glass) !important;',
    '  color: var(--zf-ink-1);',
    '}',
    // …and float like every other card: inset from the window, rounded, edged.
    "section[class*='bg-(--ui-chat-surface-background)']:not([data-chat-surface]):not(section *) {",
    '  margin: var(--zf-page-gap, 0.5rem) !important;',
    '  height: calc(100% - 2 * var(--zf-page-gap, 0.5rem)) !important;',
    '  max-height: calc(100% - 2 * var(--zf-page-gap, 0.5rem));',
    '  border-radius: var(--zf-radius-lg) !important;',
    '  overflow: hidden !important;',
    '  box-shadow: var(--zf-lift) !important;',
    '  box-sizing: border-box !important;',
    '}',
    "section[class*='bg-(--ui-chat-surface-background)']:not([data-chat-surface]) :is(footer, section)[class*='bg-(--ui-chat-surface-background)'] {",
    '  background: transparent !important;',
    '}',
    // Overlays (Settings, Command Center, Agents, Cron, Profiles…): a light
    // scrim so the sky stays present, and one raised glass card on it.
    '[data-overlay-surface] {',
    '  background: rgba(3, 6, 14, 0.2) !important;',
    '  backdrop-filter: none !important;',
    '  -webkit-backdrop-filter: none !important;',
    '}',
    '[data-overlay-surface] [data-glass-raised] {',
    '  --ui-chat-surface-background: transparent;',
    '  --ui-sidebar-surface-background: var(--zf-well);',
    '  background: var(--zf-glass-strong) !important;',
    '  border-color: transparent !important;',
    '  border-radius: var(--zf-radius-lg) !important;',
    '  box-shadow: var(--zf-lift-high) !important;',
    '  color: var(--zf-ink-1);',
    '}',
    '[data-overlay-surface] [data-glass-raised] aside {',
    '  background: var(--zf-well) !important;',
    '  box-shadow: inset -1px 0 0 var(--zf-edge);',
    '}',
    // The right sidebar (files, review, terminal host) matches the left column.
    "aside[class*='bg-(--ui-sidebar-surface-background)'][class*='pt-(--titlebar-height)'] {",
    '  background: var(--zf-glass) !important;',
    '  border-color: var(--zf-edge) !important;',
    '  box-shadow: none !important;',
    '}',
    // Persistent frost off. Hermes ships backdrop-blur on the composer
    // surface and the status-stack cards (composerSurfaceGlass, 0.75rem) plus
    // a few Tailwind utilities. Over a sky that repaints 8 times a second,
    // every one of them re-samples and re-blurs its backdrop on every sky
    // frame (Hermes's own comment at #121910 names this cost). The sky under
    // them is already blurred in the shader, and each carries an 88%+ fill, so
    // the frost was invisible work. Only the short-lived surfaces below keep it.
    ":is([class*='backdrop-'], [data-slot='composer-surface'], [data-slot='composer-status-stack'] *):not(:is([data-slot='dropdown-menu-content'], [data-slot='dropdown-menu-sub-content'], [data-slot='context-menu-content'], [data-slot='context-menu-sub-content'], [data-slot='popover-content'], [data-slot='select-content'], [data-slot='hover-card-content'], [data-slot='menubar-content'], [data-slot='dialog-content'], [data-slot='alert-dialog-content'], [data-slot='sheet-content'], [data-slot='tooltip-content'])) {",
    '  backdrop-filter: none !important;',
    '  -webkit-backdrop-filter: none !important;',
    '}',
    // Menus, popovers, selects, tooltips, dialogs and the command palette:
    // small and short-lived, so these are the ones that frost live.
    ":is([data-slot='dropdown-menu-content'], [data-slot='dropdown-menu-sub-content'], [data-slot='context-menu-content'], [data-slot='context-menu-sub-content'], [data-slot='popover-content'], [data-slot='select-content'], [data-slot='hover-card-content'], [data-slot='menubar-content']) {",
    '  background: var(--zf-glass-strong) !important;',
    '  border-color: transparent !important;',
    '  border-radius: var(--zf-radius) !important;',
    '  box-shadow: var(--zf-lift-high) !important;',
    '  backdrop-filter: var(--zf-frost);',
    '  -webkit-backdrop-filter: var(--zf-frost);',
    '  color: var(--zf-ink-1);',
    '}',
    ":is([data-slot='dropdown-menu-content'], [data-slot='context-menu-content'], [data-slot='select-content'], [data-slot='dropdown-menu-sub-content'], [data-slot='context-menu-sub-content']) :is([role='menuitem'], [role='option'], [role='menuitemcheckbox'], [role='menuitemradio']):is(:hover, [data-highlighted], :focus-visible),",
    // cmdk pickers (model, station, command palette) mark their row with data-selected, not focus
    ":is([data-slot='popover-content'], [data-slot='dialog-content'], [data-slot='command']) :is([cmdk-item], [data-slot='command-item'])[data-selected='true'] {",
    '  background: var(--zf-hover) !important;',
    '  color: var(--zf-ink-0) !important;',
    '}',
    // ── One menu kit (2026-10-10, Peter: menus felt fragmented) ──
    // Hermes already routes every floating list through one class set; these
    // pin its pieces to Zephyr's tokens so Hermes menus, cmdk pickers and the
    // status card read as one family: concentric radii, one ink ramp, one
    // edge colour, one icon size, accent only on the check.
    `${MENU_SURFACES} { padding: 0.25rem !important; }`,
    `${MENU_SURFACES} ${MENU_ROWS} {`,
    '  border-radius: calc(var(--zf-radius) - 0.25rem) !important;',
    '  color: var(--zf-ink-1);',
    '  gap: 0.5rem;',
    '}',
    `${MENU_SURFACES} ${MENU_ROWS} svg:not([class*='text-destructive']):not([class*='text-red']) { color: var(--zf-ink-2); }`,
    `${MENU_SURFACES} ${MENU_ROWS}:is(:hover, [data-highlighted], [data-selected='true'], :focus-visible) svg:not([class*='text-destructive']):not([class*='text-red']) { color: var(--zf-ink-0); }`,
    `${MENU_SURFACES} :is([data-slot$='-label'], [cmdk-group-heading]) { color: var(--zf-ink-3) !important; }`,
    `${MENU_SURFACES} :is([data-slot$='-separator'], [role='separator'], [cmdk-separator]) { background: var(--zf-edge) !important; }`,
    `${MENU_SURFACES} :is([data-slot$='-shortcut'], kbd, [data-slot='kbd']) { color: var(--zf-ink-3) !important; background: transparent !important; border-color: var(--zf-edge) !important; }`,
    `${MENU_SURFACES} :is([data-slot$='-item-indicator'], [data-state='checked'] > span:first-child) svg { color: var(--zf-ink-0) !important; }`,
    `${MENU_SURFACES} [data-slot='command-input-wrapper'] { border-color: var(--zf-edge) !important; }`,
    `${MENU_SURFACES} [data-slot='command-input'] { background: transparent !important; color: var(--zf-ink-0); }`,
    "[data-slot='tooltip-content'] { border-radius: calc(var(--zf-radius) - 0.2rem) !important; }",
    ":is([data-slot='dialog-content'], [data-slot='alert-dialog-content'], [data-slot='sheet-content']) {",
    '  background: var(--zf-glass-strong) !important;',
    '  border-color: transparent !important;',
    '  box-shadow: var(--zf-lift-high) !important;',
    '  backdrop-filter: var(--zf-frost);',
    '  -webkit-backdrop-filter: var(--zf-frost);',
    '  color: var(--zf-ink-1);',
    '}',
    ":is([data-slot='dialog-content'], [data-slot='alert-dialog-content']) { border-radius: var(--zf-radius-lg) !important; }",
    ":is([data-slot='dialog-content'], [data-slot='popover-content']) [data-slot='command'] { background: transparent !important; }",
    "[data-slot='tooltip-content'] {",
    '  background: var(--zf-glass-strong) !important;',
    '  color: var(--zf-ink-0) !important;',
    '  border: none !important;',
    '  box-shadow: var(--zf-lift) !important;',
    '  backdrop-filter: var(--zf-frost);',
    '  -webkit-backdrop-filter: var(--zf-frost);',
    '}',
    "[data-slot='tooltip-content'] svg[class*='fill-'] { fill: var(--zf-glass-strong) !important; }",
    // Inline widgets in the transcript (approvals, clarify prompts, code and
    // diff cards) sit on the sky too, so they wear the same card.
    ":is([data-slot='aui_thread-content'], [data-slot='thread']) :is([data-slot='clarify-inline'], [data-slot='code-card'], [data-slot='file-diff-panel'], [class*='bg-(--ui-widget-surface-background)'], [class*='bg-(--ui-chat-surface-background)']) {",
    '  background: var(--zf-glass) !important;',
    '  border-color: transparent !important;',
    '  border-radius: var(--zf-radius) !important;',
    '  box-shadow: var(--zf-lift) !important;',
    '}',
    // Form controls inside any Zephyr surface: a recessed well, accent focus.
    ":is([data-overlay-surface], section[class*='bg-(--ui-chat-surface-background)'], [data-slot='dialog-content']) :is(input:not([type='checkbox']):not([type='radio']):not([type='range']), textarea, [data-slot='select-trigger'], [data-slot='searchable-select-trigger']) {",
    '  background: var(--zf-well) !important;',
    '  border-color: var(--zf-edge) !important;',
    '}',
    ":is([data-overlay-surface], section[class*='bg-(--ui-chat-surface-background)'], [data-slot='dialog-content']) :is(input, textarea, [data-slot='select-trigger']):focus-visible {",
    '  border-color: color-mix(in srgb, var(--zf-accent) 55%, transparent) !important;',
    '  box-shadow: 0 0 0 3px color-mix(in srgb, var(--zf-accent) 14%, transparent) !important;',
    '  outline: none !important;',
    '}',
    // Scrollbars everywhere: thin and tinted, never the platform grey slab.
    '* { scrollbar-color: rgba(255, 255, 255, 0.14) transparent; scrollbar-width: thin; }',
  ].join('\n')
}

// ══ §5b APP MOTION (fold + interface animation, independent of the sky) ════

// Interface motion is not a sky visual: it must survive Sky being off, so it
// lives in its own always-on <style> (like the snippet sheet), never in
// skyStyleFor — that sheet is rewritten every few minutes as the light drifts
// (which would restart keyframes) and is removed entirely with the sky.
//
// The rules are deliberately cheap: opacity and transform only (compositor),
// plus paint-only colour swaps for hover and press. Nothing here animates a
// layout property, nothing runs continuously, and every duration is a token,
// so "Motion off" and reduced-motion both collapse the whole sheet to 1ms.
const MOTION_CSS = [
  // ── Tokens ──────────────────────────────────────────────────────────────
  // Three beats: t-1 for exits and presses, t-2 for hovers and small
  // entrances, t-3 for the moments worth watching (the fold, dialogs).
  // The pacing is deliberately unhurried: at 90ms an exit read as a hard cut,
  // so the floor is ~140ms everywhere and nothing exceeds 280ms.
  ':root {',
  '  --zf-t-1: 140ms;',
  '  --zf-t-2: 200ms;',
  '  --zf-t-3: 280ms;',
  // A calmer deceleration than a fast-start curve: eases reach their settle
  // without the initial snap that read as jarring on hovers and exits.
  '  --zf-ease: cubic-bezier(0.33, 1, 0.68, 1);',
  '  --zf-ease-out: cubic-bezier(0.16, 1, 0.3, 1);',
  '}',
  // The Motion switch (Settings > Zephyr) and the OS setting both zero the
  // tokens; @starting-style and allow-discrete still apply instantly, so
  // nothing is left half-faded.
  "html[data-zephyr-motion='off'] {",
  '  --zf-t-1: 1ms;',
  '  --zf-t-2: 1ms;',
  '  --zf-t-3: 1ms;',
  '}',
  '@media (prefers-reduced-motion: reduce) {',
  '  :root {',
  '    --zf-t-1: 1ms;',
  '    --zf-t-2: 1ms;',
  '    --zf-t-3: 1ms;',
  '  }',
  '}',
  // ── THE WORK FOLD (opening and closing the reasoning chain) ─────────────
  // A pure dissolve: compositor-only opacity, no drift. Motion that fought
  // the layout snap read as ghosting — the geometry now moves either before
  // the fade (opening) or after it (closing), never during. `display` joins
  // through allow-discrete so the box survives its own fade; the reveal
  // declares its from-state with @starting-style. Engines without
  // allow-discrete simply get the old instant snap.
  //
  // The duration split is what makes one transition read per direction: the
  // collapsed destination carries fast (t-1, the close), the base state slow
  // (t-3, the open). On close the shape only collapses when the fade ends,
  // so the settle that keeps the transcript still is deferred to that moment
  // (see pinWhileFolding in §9).
  "html[data-zephyr-collapse-work='on'] [data-zephyr-work-collapsed='true'] [data-conversation-scaffold],",
  "html[data-zephyr-collapse-work='on'] [data-zephyr-work-collapsed='true'] > :is([data-slot='tool-block'], [data-slot='aui_thinking-disclosure'], [data-slot='aui_turn-activity'], [data-tool-group], [data-tool-summary]),",
  // Prose said between tool calls folds with them; only the reply that
  // follows the last work block is exempt (marked by markInterimProse).
  "html[data-zephyr-collapse-work='on'] [data-zephyr-work-collapsed='true'] .aui-md[data-zephyr-work-interim='true'],",
  "html[data-zephyr-collapse-work='on'] [data-zephyr-work-collapsed='true'] > *:not(.zephyr-work-summary):not(.aui-md):not([data-slot*='actions']):not([data-slot*='feedback']):not([data-slot*='composer']) {",
  '  display: none !important;',
  '  opacity: 0;',
  // the fading work must not take a click meant for what is below it
  '  pointer-events: none;',
  '  transition-duration: var(--zf-t-1);',
  '}',
  "[data-slot='aui_assistant-message-content'] [data-conversation-scaffold],",
  "[data-slot='aui_assistant-message-content'] > :is([data-slot='tool-block'], [data-slot='aui_thinking-disclosure'], [data-slot='aui_turn-activity'], [data-tool-group], [data-tool-summary]),",
  "[data-slot='aui_assistant-message-content'] > *:not(.zephyr-work-summary):not(.aui-md):not([data-slot*='actions']):not([data-slot*='feedback']):not([data-slot*='composer']),",
  ".aui-md[data-zephyr-work-interim='true'] {",
  '  transition: opacity var(--zf-t-3) var(--zf-ease), display var(--zf-t-3) allow-discrete;',
  '}',
  // Transitions never start from display:none on their own, so the reveal
  // needs its from-state declared. It only ever fires when a fold opens.
  '@starting-style {',
  "  [data-slot='aui_assistant-message-content'] [data-conversation-scaffold],",
  "  [data-slot='aui_assistant-message-content'] > :is([data-slot='tool-block'], [data-slot='aui_thinking-disclosure'], [data-slot='aui_turn-activity'], [data-tool-group], [data-tool-summary]),",
  "  [data-slot='aui_assistant-message-content'] > *:not(.zephyr-work-summary):not(.aui-md):not([data-slot*='actions']):not([data-slot*='feedback']):not([data-slot*='composer']),",
  "  .aui-md[data-zephyr-work-interim='true'] {",
  '    opacity: 0;',
  '  }',
  '}',
  "html[data-zephyr-collapse-work='on'] [data-zephyr-work-collapsed='true'] {",
  '  row-gap: 0.25rem !important;',
  '  gap: 0.25rem !important;',
  '}',
  // Tight natural margin between work summary and model response text
  "html[data-zephyr-collapse-work='on'] [data-zephyr-work-collapsed='true'] > .aui-md,",
  "html[data-zephyr-collapse-work='on'] [data-zephyr-work-collapsed='true'] .aui-md {",
  '  margin-top: 0.25rem !important;',
  '  padding-top: 0 !important;',
  '}',
  "html[data-zephyr-collapse-work='on'] [data-zephyr-work-collapsed='true'] > .aui-md > *:first-child,",
  "html[data-zephyr-collapse-work='on'] [data-zephyr-work-collapsed='true'] .aui-md > *:first-child {",
  '  margin-top: 0 !important;',
  '  padding-top: 0 !important;',
  '}',
  ".zephyr-work-summary[data-live] .zephyr-work-summary-label {",
  // no pulse animation: it would re-composite the glass window every frame;
  // the once-a-second count is the sign of life
  '  color: var(--zf-ink-1, currentColor);',
  '}',
  '.zephyr-work-summary {',
  '  display: inline-flex;',
  '  align-items: center;',
  '  gap: 0.25rem;',
  '  padding: 0.125rem 0 !important;',
  '  margin: 0 0 0.15rem 0 !important;',
  '  border: none !important;',
  '  background: transparent !important;',
  '  box-shadow: none !important;',
  '  font-family: inherit;',
  '  font-size: var(--conversation-tool-font-size, 0.75rem);',
  '  line-height: var(--conversation-line-height, 1.4);',
  '  color: var(--conversation-scaffold-text, var(--ui-text-tertiary, var(--zf-ink-3)));',
  '  cursor: pointer;',
  '  user-select: none;',
  '  transition: color var(--zf-t-2) var(--zf-ease);',
  '  vertical-align: middle;',
  // A <button> centres its own text (user-agent default), so a label that
  // wrapped to a second line centred that line under the first and the row
  // read as two ragged halves. The button is the only box here, so one
  // declaration on it puts every line flush left (Peter, 10-12).
  '  text-align: left;',
  '}',
  '.zephyr-work-summary:hover {',
  '  color: var(--ui-text-primary, var(--zf-ink-0));',
  '}',
  '.zephyr-work-icon-stack {',
  '  display: inline-flex;',
  '  align-items: center;',
  '  flex-direction: row;',
  '  gap: 4px;',
  '  margin-right: 0.35rem;',
  '  vertical-align: middle;',
  '}',
  '.zephyr-work-icon-item {',
  '  display: inline-flex;',
  '  align-items: center;',
  '  justify-content: center;',
  '  width: 14px;',
  '  height: 14px;',
  '  margin: 0 !important;',
  '  position: relative;',
  '  color: #ffffff !important;',
  '  fill: #ffffff !important;',
  '  opacity: 1 !important;',
  '  flex-shrink: 0;',
  '  border: none !important;',
  '  border-radius: 0 !important;',
  '  background: transparent !important;',
  '  box-shadow: none !important;',
  '  filter: none !important;',
  '}',
  '.zephyr-work-icon-item svg {',
  '  display: block;',
  '  width: 14px;',
  '  height: 14px;',
  '  fill: #ffffff !important;',
  '  color: #ffffff !important;',
  '}',
  '.zephyr-work-summary-caret {',
  '  display: inline-block;',
  '  margin-left: 0.2rem;',
  '  font-size: 0.75rem;',
  '  opacity: 0.5;',
  '  transition: transform var(--zf-t-2) var(--zf-ease), opacity var(--zf-t-2) var(--zf-ease);',
  '}',
  '.zephyr-work-summary:hover .zephyr-work-summary-caret {',
  '  opacity: 0.9;',
  '}',
  ".zephyr-work-summary[data-expanded='true'] .zephyr-work-summary-caret {",
  '  transform: rotate(90deg);',
  '}',
  ".zephyr-work-summary[data-expanded='true'] {",
  '  margin-bottom: 0.25rem !important;',
  '}',
  'html:not([data-theme*="night"]):not([data-theme*="dark"]) .zephyr-work-summary {',
  '  color: var(--conversation-scaffold-text, var(--ui-text-tertiary, #64748b));',
  '}',
  'html:not([data-theme*="night"]):not([data-theme*="dark"]) .zephyr-work-summary:hover {',
  '  color: var(--ui-text-primary, #0f172a);',
  '}',
  "html:not([data-zephyr-collapse-work='on']) .zephyr-work-summary {",
  '  display: none !important;',
  '}',
  // ── [motion:switch] ─────────────────────────────────────────────────────
  // Session switch: core holds data-session-switching on [data-chat-surface]
  // until rows are placed and scroll is restored. The transcript stays
  // invisible for that window (the plugin folds and formats behind it) and
  // the attribute lifting is the single fade-in. Only the attribute is read;
  // core owns toggling it.
  "[data-chat-surface] :is([data-slot='aui_thread-viewport'], [data-slot='thread']) {",
  '  transition: opacity var(--zf-t-2) var(--zf-ease-out);',
  '}',
  "[data-chat-surface][data-session-switching] :is([data-slot='aui_thread-viewport'], [data-slot='thread']) {",
  '  opacity: 0;',
  '  transition: none;',
  '}',
  // The plugin's own settle curtain, held after core's marker lifts until the
  // transcript stops changing (the backfill commits, highlighting and font
  // swaps all land after core's two quiet frames). Same paint-only hide.
  "[data-chat-surface][data-zephyr-settling] :is([data-slot='aui_thread-viewport'], [data-slot='thread']) {",
  '  opacity: 0;',
  '  transition: none;',
  '}',
  // ── [motion:ghosts] ─────────────────────────────────────────────────────
  // Exit ghosts for floating surfaces the app unmounts before their exit can
  // play. A clone of the closed surface is positioned at its last rect and
  // runs the same exit keyframes; it is inert and never interactive.
  //
  // Measured on the Hermes desktop build: a React commit unmounts a closing
  // floating surface ~45-60ms after data-state flips to closed, cutting the
  // 140ms exit mid-fade; a Presence-managed close keeps the node for the full
  // keyframes (>=140ms before removal). The JS ghosting has already filtered
  // by that timing, so this sheet only has to replay the exit. The clone is
  // normalised to data-state='closed' by the JS, so the sheet's own exit rules
  // match it too; these declarations are byte-identical to those, and the
  // cascade order between the two does not matter. No keyframes are redefined
  // here. The JS may set a negative animation-delay to resume the exit at the
  // phase it had reached when the real node vanished.
  '.zf-ghost { position: fixed !important; margin: 0 !important; pointer-events: none !important; z-index: 2147483000 !important; }',
  ":is(.zf-ghost[data-slot='dropdown-menu-content'], .zf-ghost[data-slot='dropdown-menu-sub-content'], .zf-ghost[data-slot='context-menu-content'], .zf-ghost[data-slot='context-menu-sub-content'], .zf-ghost[data-slot='popover-content'], .zf-ghost[data-slot='select-content'], .zf-ghost[data-slot='menubar-content']) {",
  '  animation: zf-pop-out var(--zf-t-1) var(--zf-ease) both;',
  '}',
  ":is(.zf-ghost[data-slot='dialog-content'], .zf-ghost[data-slot='alert-dialog-content'], .zf-ghost[data-slot='sheet-content']) {",
  '  animation: zf-dlg-out var(--zf-t-1) var(--zf-ease) both;',
  '}',
  ":is(.zf-ghost[data-slot='tooltip-content'], .zf-ghost[data-slot='hover-card-content']) {",
  '  animation: zf-tip-out var(--zf-t-1) var(--zf-ease) both;',
  '}',
  ".zf-ghost[data-slot$='-overlay'] {",
  '  animation: zf-ovl-out var(--zf-t-1) var(--zf-ease) both;',
  '}',
  // ── [motion:menus] ──────────────────────────────────────────────────────
  // Mechanism: Radix Presence holds closing content mounted until its exit
  // animation's `animationend`; exits must therefore stay keyframes (never
  // transitions), and closed rules must keep the `both` fill mode plus
  // `pointer-events: none`. The app's animate-in/out classes emit no CSS.
  //
  // Menus, selects, popovers, dialogs and tooltips. Floating surfaces enter
  // 6px from the trigger at a hair under full size, leave along the same path
  // faster; rows and triggers only tint. Every duration is a token, so the
  // Motion switch and reduced-motion collapse the whole kit to 1ms.
  //
  // The direction comes from data-side: a surface anchored below its trigger
  // starts 6px above and settles down onto it, and so on around the ring.
  ":is([data-slot='dropdown-menu-content'], [data-slot='dropdown-menu-sub-content'], [data-slot='context-menu-content'], [data-slot='context-menu-sub-content'], [data-slot='popover-content'], [data-slot='select-content'], [data-slot='menubar-content']) {",
  '  --zf-pop-dx: 0px;',
  '  --zf-pop-dy: 0px;',
  '  transform-origin: center;',
  '}',
  ":is([data-slot='dropdown-menu-content'], [data-slot='dropdown-menu-sub-content'], [data-slot='context-menu-content'], [data-slot='context-menu-sub-content'], [data-slot='popover-content'], [data-slot='select-content'], [data-slot='menubar-content'])[data-side='bottom'] {",
  '  --zf-pop-dy: -6px;',
  '  transform-origin: top;',
  '}',
  ":is([data-slot='dropdown-menu-content'], [data-slot='dropdown-menu-sub-content'], [data-slot='context-menu-content'], [data-slot='context-menu-sub-content'], [data-slot='popover-content'], [data-slot='select-content'], [data-slot='menubar-content'])[data-side='top'] {",
  '  --zf-pop-dy: 6px;',
  '  transform-origin: bottom;',
  '}',
  ":is([data-slot='dropdown-menu-content'], [data-slot='dropdown-menu-sub-content'], [data-slot='context-menu-content'], [data-slot='context-menu-sub-content'], [data-slot='popover-content'], [data-slot='select-content'], [data-slot='menubar-content'])[data-side='left'] {",
  '  --zf-pop-dx: 6px;',
  '  transform-origin: right;',
  '}',
  ":is([data-slot='dropdown-menu-content'], [data-slot='dropdown-menu-sub-content'], [data-slot='context-menu-content'], [data-slot='context-menu-sub-content'], [data-slot='popover-content'], [data-slot='select-content'], [data-slot='menubar-content'])[data-side='right'] {",
  '  --zf-pop-dx: -6px;',
  '  transform-origin: left;',
  '}',
  ":is([data-slot='dropdown-menu-content'], [data-slot='dropdown-menu-sub-content'], [data-slot='context-menu-content'], [data-slot='context-menu-sub-content'], [data-slot='popover-content'], [data-slot='select-content'], [data-slot='menubar-content'])[data-state='open'] {",
  '  animation: zf-pop-in var(--zf-t-2) var(--zf-ease-out) both;',
  '}',
  ":is([data-slot='dropdown-menu-content'], [data-slot='dropdown-menu-sub-content'], [data-slot='context-menu-content'], [data-slot='context-menu-sub-content'], [data-slot='popover-content'], [data-slot='select-content'], [data-slot='menubar-content'])[data-state='closed'] {",
  '  animation: zf-pop-out var(--zf-t-1) var(--zf-ease) both;',
  '  pointer-events: none;',
  '}',
  // Submenus open on hover, so their entrance stays out of the pointer's way;
  // at t-1 their exit matches their entrance rather than beating it.
  ":is([data-slot='dropdown-menu-sub-content'], [data-slot='context-menu-sub-content'])[data-state='open'] {",
  '  animation-duration: var(--zf-t-1);',
  '}',
  '@keyframes zf-pop-in {',
  '  from {',
  '    opacity: 0;',
  '    transform: translate(var(--zf-pop-dx), var(--zf-pop-dy)) scale(0.97);',
  '  }',
  '}',
  '@keyframes zf-pop-out {',
  '  to {',
  '    opacity: 0;',
  '    transform: translate(var(--zf-pop-dx), var(--zf-pop-dy)) scale(0.97);',
  '  }',
  '}',
  // Rows: hover and highlight are a paint swap, never a move.
  ":is([role='menuitem'], [role='option'], [role='menuitemcheckbox'], [role='menuitemradio'], [cmdk-item], [data-slot='command-item']) {",
  '  transition: background-color var(--zf-t-2) var(--zf-ease), color var(--zf-t-2) var(--zf-ease);',
  '}',
  // Dialogs, alert dialogs and sheets: a beat slower than a menu, a whisker
  // under full size, and the same path out at exit speed.
  ":is([data-slot='dialog-content'], [data-slot='alert-dialog-content'], [data-slot='sheet-content'])[data-state='open'] {",
  '  animation: zf-dlg-in var(--zf-t-3) var(--zf-ease-out) both;',
  '}',
  ":is([data-slot='dialog-content'], [data-slot='alert-dialog-content'], [data-slot='sheet-content'])[data-state='closed'] {",
  '  animation: zf-dlg-out var(--zf-t-1) var(--zf-ease) both;',
  '  pointer-events: none;',
  '}',
  '@keyframes zf-dlg-in {',
  '  from {',
  '    opacity: 0;',
  '    transform: scale(0.985);',
  '  }',
  '}',
  '@keyframes zf-dlg-out {',
  '  to {',
  '    opacity: 0;',
  '    transform: scale(0.985);',
  '  }',
  '}',
  // Scrims fade only; harmless on installs where a slot is never emitted.
  ":is([data-slot='dialog-overlay'], [data-slot='alert-dialog-overlay'], [data-slot='sheet-overlay'])[data-state='open'] {",
  '  animation: zf-ovl-in var(--zf-t-2) var(--zf-ease-out) both;',
  '}',
  ":is([data-slot='dialog-overlay'], [data-slot='alert-dialog-overlay'], [data-slot='sheet-overlay'])[data-state='closed'] {",
  '  animation: zf-ovl-out var(--zf-t-1) var(--zf-ease) both;',
  '  pointer-events: none;',
  '}',
  '@keyframes zf-ovl-in {',
  '  from {',
  '    opacity: 0;',
  '  }',
  '}',
  '@keyframes zf-ovl-out {',
  '  to {',
  '    opacity: 0;',
  '  }',
  '}',
  // Tooltips and hover cards follow the pointer, so they only dissolve.
  ":is([data-slot='tooltip-content'], [data-slot='hover-card-content'])[data-state='open'] {",
  '  animation: zf-tip-in var(--zf-t-1) var(--zf-ease-out) both;',
  '}',
  ":is([data-slot='tooltip-content'], [data-slot='hover-card-content'])[data-state='closed'] {",
  '  animation: zf-tip-out var(--zf-t-1) var(--zf-ease) both;',
  '  pointer-events: none;',
  '}',
  '@keyframes zf-tip-in {',
  '  from {',
  '    opacity: 0;',
  '  }',
  '}',
  '@keyframes zf-tip-out {',
  '  to {',
  '    opacity: 0;',
  '  }',
  '}',
  // Select triggers wear the tint of the menu they opened; !important sits on
  // the two colour properties only, to beat app styles without touching motion.
  ":is([data-slot='select-trigger'], [data-slot='searchable-select-trigger']) {",
  '  transition: background-color var(--zf-t-2) var(--zf-ease), border-color var(--zf-t-2) var(--zf-ease);',
  '}',
  ":is([data-slot='select-trigger'], [data-slot='searchable-select-trigger']):is([data-state='open'], [aria-expanded='true']) {",
  "  background-color: color-mix(in srgb, var(--zf-accent, var(--ui-accent, #9dc4e8)) 14%, transparent) !important;",
  "  border-color: color-mix(in srgb, var(--zf-accent, var(--ui-accent, #9dc4e8)) 30%, transparent) !important;",
  '}',
  // ── [motion:history] ────────────────────────────────────────────────────
  // History panel rows, search and switch (owner: motion-history agent).
  // §5 already owns the hover/active paints; these rules only let the colour
  // swap breathe. No entrance fades on rows: the list is virtualized, so an
  // entry animation would replay on every scroll re-render.
  ":is([data-tour='sessions-sidebar'], [data-slot='sidebar-content'], [data-sessions-mode]) :is([data-slot='sidebar-menu-button'], [data-slot='sidebar-menu-action'], [data-slot='sidebar-menu-sub-button'], button, a, [role='button']) {",
  '  transition: background-color var(--zf-t-2) var(--zf-ease), color var(--zf-t-2) var(--zf-ease);',
  '}',
  // While a scroll is in flight, rows slide under a stationary pointer and
  // every newly hovered row would restart a main-thread colour transition
  // mid-gesture. The attribute is set by the capture-phase scroll listener and
  // clears 150ms after the last event, so hover still animates at rest. The
  // rule's own specificity beats the transition declarations above it.
  "html[data-zf-scrolling] :is([data-tour='sessions-sidebar'], [data-slot='sidebar-content'], [data-sessions-mode]) :is([data-slot='sidebar-menu-button'], [data-slot='sidebar-menu-action'], [data-slot='sidebar-menu-sub-button'], button, a, [role='button'], [data-row-actions] button svg) {",
  '  transition: none;',
  '}',
  // Press: a slightly stronger accent wash while the pointer is down. The
  // html prefix buys one specificity step over §5's hover/active fills, which
  // are equally important and can land after this sheet once the sky sheet is
  // re-created (toggle Sky off and on), so order alone must not decide.
  "html :is([data-tour='sessions-sidebar'], [data-slot='sidebar-content'], [data-sessions-mode]) :is([data-slot='sidebar-menu-button'], [data-slot='sidebar-menu-action'], [data-slot='sidebar-menu-sub-button'], button, a, [role='button']):active {",
  '  background-color: color-mix(in srgb, var(--zf-accent, #9dc4e8) 18%, transparent) !important;',
  '}',
  // Row icons and the kebab/mini-actions.
  ":is([data-tour='sessions-sidebar'], [data-slot='sidebar-content'], [data-sessions-mode]) :is([data-row-actions] button, [data-slot='sidebar-menu-action'], [data-row-actions] button svg, [data-slot='sidebar-menu-action'] svg) {",
  '  transition: color var(--zf-t-2) var(--zf-ease), background-color var(--zf-t-2) var(--zf-ease);',
  '}',
  // Search: the app's focus ring is already stripped, so the accent halo is
  // the focus indicator.
  "[data-slot='sidebar-content'] input {",
  '  transition: background-color var(--zf-t-2) var(--zf-ease), box-shadow var(--zf-t-2) var(--zf-ease);',
  '}',
  "[data-slot='sidebar-content'] input:focus-visible {",
  '  box-shadow: 0 0 0 3px color-mix(in srgb, var(--zf-accent, #9dc4e8) 14%, transparent) !important;',
  '}',
  // SESSIONS | BOTS labels: colour only; the sliding pill is not touched.
  `${SWITCH_HOOK} > [role='tablist'] > [data-slot='pane-tab'] {`,
  '  transition: color var(--zf-t-2) var(--zf-ease);',
  '}',
  // ── [motion:composer] ───────────────────────────────────────────────────
  // Composer, status bar and status dock (owner: motion-composer agent).
  ":is([data-slot='composer-root'], [data-slot='composer-surface'], form[data-slot='composer']) :is(button, [role='button']) {",
  '  transition: background-color var(--zf-t-2) var(--zf-ease), color var(--zf-t-2) var(--zf-ease), transform var(--zf-t-1) var(--zf-ease);',
  '}',
  ":is([data-slot='composer-root'], [data-slot='composer-surface'], form[data-slot='composer']) :is(button, [role='button']):not([aria-haspopup]):not([data-slot='select-trigger']):not([data-slot='searchable-select-trigger']):active {",
  '  transform: scale(0.96);',
  '}',
  ":is([data-slot='composer-root'], [data-slot='composer-status-stack'], [data-slot='statusbar']) :is([data-slot='select-trigger'], [data-slot='searchable-select-trigger'], button[aria-haspopup], [role='button'][aria-haspopup]) {",
  // border-color included: this rule outranks the menus block's trigger rule,
  // so a shorter list here would snap the open-state border instead of fading.
  '  transition: background-color var(--zf-t-2) var(--zf-ease), border-color var(--zf-t-2) var(--zf-ease), color var(--zf-t-2) var(--zf-ease);',
  '}',
  ":is([data-slot='composer-root'], [data-slot='composer-status-stack'], [data-slot='statusbar']) :is([data-slot='select-trigger'], [data-slot='searchable-select-trigger'], button[aria-haspopup], [role='button'][aria-haspopup]):is([data-state='open'], [aria-expanded='true']) {",
  '  background-color: color-mix(in srgb, var(--zf-accent, var(--ui-accent, #9dc4e8)) 14%, transparent) !important;',
  '  color: var(--zf-ink-0, #ffffff) !important;',
  '}',
  ":is([data-slot='statusbar'], [data-slot='composer-status-stack']) :is(button, [role='button'], a) {",
  '  transition: background-color var(--zf-t-2) var(--zf-ease), color var(--zf-t-2) var(--zf-ease);',
  '}',
  // The Simple-mode dock tab is styled by DOCK_CSS, which is written after
  // this sheet: its transitions are tokenized there instead of duplicated
  // here, where they would lose the cascade anyway.
  // ── [motion:tools] ──────────────────────────────────────────────────────
  // Tool blocks, thinking disclosure, message actions (owner: motion-tools agent).
  // Chrome only: an open/close eases paint (bg, border, shadow), never size.
  // Deliberately absent until a live DOM sample lands: any content-expand or
  // caret-rotate (the disclosure's open state may announce via aria-expanded
  // or data-state — unverified), and the exact assistant action-cluster class
  // (the selector below follows the proven user-message convention and is
  // inert when that class is not emitted).
  "[data-slot='tool-block'] {",
  '  transition: background-color var(--zf-t-2) var(--zf-ease), border-color var(--zf-t-2) var(--zf-ease), box-shadow var(--zf-t-2) var(--zf-ease);',
  '}',
  "[data-slot='tool-block'] :is(button, [role='button'], summary) {",
  '  transition: background-color var(--zf-t-2) var(--zf-ease), color var(--zf-t-2) var(--zf-ease);',
  '}',
  "[data-slot='aui_thinking-disclosure'] {",
  '  transition: background-color var(--zf-t-2) var(--zf-ease), border-color var(--zf-t-2) var(--zf-ease), box-shadow var(--zf-t-2) var(--zf-ease);',
  '}',
  "[data-slot='aui_thinking-disclosure'] :is(button, [role='button'], summary) {",
  '  transition: background-color var(--zf-t-2) var(--zf-ease), color var(--zf-t-2) var(--zf-ease);',
  '}',
  ":is([data-slot='aui_assistant-message-root'], [data-slot='assistant-message']) :is(button, [role='button'], a) {",
  '  transition: background-color var(--zf-t-2) var(--zf-ease), color var(--zf-t-2) var(--zf-ease), opacity var(--zf-t-2) var(--zf-ease);',
  '}',
  ":is([data-slot='aui_assistant-message-root'], [data-slot='assistant-message']) :is([class*='group-hover/assistant-message'], [class*='group-hover/message']) {",
  '  transition: opacity var(--zf-t-2) var(--zf-ease);',
  '}',
].join('\n')

const ensureMotionStyle = () => {
  if (typeof document === 'undefined' || document.getElementById('zephyr-motion-style')) return
  const el = document.createElement('style')
  el.id = 'zephyr-motion-style'
  el.textContent = MOTION_CSS
  document.head.appendChild(el)
}

// ════════════════════════════════════════════════════════════════════════
// ── Zephyr sky ────────────────────────────────────────────────────────────
// The sky is the plugin's own shader (createSky, below). The painted vector
// engine and the CSS cloud sheets it replaced are gone; without WebGL the sky
// is the plain time-of-day gradient from skyStyleFor.

// ══ §6 SKY ENGINE (weather presets, shader, createSky) ══════════════════════

const WEATHER_PRESETS = {
  clear:    { cu: 0.00, sc: 0.00, st: 0.00, dark: 0.0, ac: 0.00, as: 0.00, ci: 0.08, cc: 0.00, cs: 0.00, haze: 0.04, rain: 0 },
  fair:     { cu: 0.45, sc: 0.00, st: 0.00, dark: 0.0, ac: 0.00, as: 0.00, ci: 0.25, cc: 0.00, cs: 0.00, haze: 0.06, rain: 0 },
  cirrus:   { cu: 0.00, sc: 0.00, st: 0.00, dark: 0.0, ac: 0.10, as: 0.00, ci: 0.85, cc: 0.30, cs: 0.20, haze: 0.06, rain: 0 },
  partly:   { cu: 0.70, sc: 0.30, st: 0.00, dark: 0.1, ac: 0.30, as: 0.00, ci: 0.40, cc: 0.00, cs: 0.10, haze: 0.08, rain: 0 },
  cloudy:   { cu: 0.30, sc: 0.85, st: 0.10, dark: 0.3, ac: 0.40, as: 0.30, ci: 0.20, cc: 0.00, cs: 0.20, haze: 0.12, rain: 0 },
  overcast: { cu: 0.00, sc: 0.55, st: 0.90, dark: 0.45, ac: 0.10, as: 0.80, ci: 0.00, cc: 0.00, cs: 0.30, haze: 0.22, rain: 0 },
  rain:     { cu: 0.10, sc: 0.40, st: 1.00, dark: 0.75, ac: 0.00, as: 0.90, ci: 0.00, cc: 0.00, cs: 0.00, haze: 0.38, rain: 0.8 },
  storm:    { cu: 1.00, sc: 0.60, st: 0.70, dark: 1.00, ac: 0.00, as: 0.80, ci: 0.00, cc: 0.00, cs: 0.00, haze: 0.30, rain: 1.0 },
  fog:      { cu: 0.00, sc: 0.10, st: 1.00, dark: 0.2, ac: 0.00, as: 0.30, ci: 0.00, cc: 0.00, cs: 0.00, haze: 0.75, rain: 0 }
}
const WEATHER_ORDER = ['live', 'clear', 'fair', 'partly', 'cloudy', 'cirrus', 'overcast', 'rain', 'storm', 'fog']

// Live weather (open-meteo `current`) → weights. Uses the real low/mid/high
// cloud fractions, and the WMO code to decide convective vs stratiform.
const weatherFromLive = live => {
  const L = (live.cloud_cover_low ?? live.cloud_cover ?? 0) / 100
  const M = (live.cloud_cover_mid ?? 0) / 100
  const H = (live.cloud_cover_high ?? 0) / 100
  const code = live.weather_code ?? 0
  const vis = live.visibility ?? 24000
  const w = { cu: 0, sc: 0, st: 0, dark: 0, ac: 0, as: 0, ci: 0, cc: 0, cs: 0, haze: 0.06, rain: 0 }
  const stormy = code >= 95
  const showers = (code >= 80 && code <= 86) || stormy
  const precip = (code >= 51 && code <= 67) || (code >= 71 && code <= 77) || showers
  const fog = code === 45 || code === 48
  if (stormy) Object.assign(w, { cu: Math.max(L, 0.8), sc: 0.5, st: 0.6, dark: 1, rain: 1 })
  else if (showers) Object.assign(w, { cu: Math.max(L, 0.7), sc: 0.5, st: 0.3, dark: 0.7, rain: 0.7 })
  else if (precip) Object.assign(w, { cu: 0.1, sc: L * 0.5, st: Math.max(L, 0.85), dark: 0.7, rain: 0.8 })
  else if (fog) Object.assign(w, { st: 1, sc: 0.1, haze: 0.75 })
  else if (code >= 3 || L > 0.75) Object.assign(w, { sc: L, st: Math.max(0, L - 0.55) * 1.6, cu: L * 0.25, dark: L * 0.4 })
  else Object.assign(w, { cu: L * 1.05, sc: L * 0.35, dark: L * 0.15 })
  w.ac = M * (precip ? 0.15 : 0.45)
  w.as = M * (precip || code >= 3 ? 0.85 : 0.45)
  w.ci = H * 0.9
  w.cc = H * 0.3
  w.cs = H > 0.6 ? (H - 0.6) * 1.5 : 0
  w.haze = Math.max(w.haze, Math.min(0.8, 1 - Math.min(vis, 30000) / 30000) * 0.9)
  return w
}

// fps: frames a second the shader draws. res: canvas px per CSS px (the
// compositor scales it up; the field is soft, so this costs nothing to look at).
const QUALITY = {
  low: { res: 0.18, maxSide: 480, fps: 4 },
  balanced: { res: 0.25, maxSide: 720, fps: 8 },
  high: { res: 0.4, maxSide: 1100, fps: 16 }
}

/* ============================================================================
   ZEPHYR SKY ENGINE — an independent implementation of the dynamic sky.

   No third-party sky code lives here. Every equation, gate and pixel stage
   comes from docs/rebuild-specification.md, written from the observed
   behaviour of a reference module, and the atmospheric table is an
   independent Rayleigh/Mie bake (scripts/bake-atmosphere.mjs).

   GENERATED by scripts/build-sky.mjs from sky/*.js — do not hand-edit.
   Edit the sources in sky/ and re-run the build.
   ============================================================================ */
const SKY_ENGINE = (() => {
/* ── sky/math.js ─────────────────────────────────────────────────────── */
const clamp = (x, lo = 0, hi = 1) => Math.max(lo, Math.min(hi, x));
const smooth = x => { x = clamp(x); return x * x * (3 - 2 * x); };
const ramp = (a, b, x) => smooth((x - a) / (b - a));
const mix = (a, b, t) => a + (b - a) * t;
const mod = (x, n) => ((x % n) + n) % n;
const rad = x => x * Math.PI / 180;
const deg = x => x * 180 / Math.PI;
const luminance = c => c[0] * .299 + c[1] * .587 + c[2] * .114;
const linearY = c => c[0] * .2126729 + c[1] * .7151522 + c[2] * .0721750;
const blend = (a, b, t) => a.map((v, i) => mix(v, b[i], t));
const scale = (c, k) => c.map(v => v * k);
const bounded = c => c.map(v => clamp(v));
const screen = (c, tint, k) => c.map((v, i) => v + tint[i] * k * (1 - v));
const gaussian = (x, center, sigma) => Math.exp(-.5 * ((x - center) / sigma) ** 2);

/* ── sky/clock.js ────────────────────────────────────────────────────── */
const formatters = new Map();
const capturedHostOffset = -new Date().getTimezoneOffset() * 60;
function localParts(epoch, zone = 'America/Toronto') {
  let formatter = formatters.get(zone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat('en-CA', { timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' });
    formatters.set(zone, formatter);
  }
  const p = Object.fromEntries(formatter.formatToParts(epoch).filter(x => x.type !== 'literal').map(x => [x.type, Number(x.value)]));
  return { year: p.year, month: p.month, day: p.day, hour: p.hour % 24, minute: p.minute, second: p.second };
}
function zoneOffset(epoch, zone) {
  try {
    const p = localParts(epoch, zone);
    return (Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second) - Math.floor(epoch / 1000) * 1000) / 1000;
  } catch { return capturedHostOffset; }
}
function resolveClock(scene, epoch, retainedHour = 12) {
  if (!Number.isFinite(epoch)) throw new TypeError('Epoch must be finite.');
  const zone = scene.timeZone;
  let real;
  try { real = localParts(epoch, zone); }
  catch { const d = new Date(epoch + capturedHostOffset * 1000); real = { year: d.getUTCFullYear(), month: d.getUTCMonth()+1, day: d.getUTCDate(), hour: d.getUTCHours(), minute: d.getUTCMinutes(), second: d.getUTCSeconds() }; }
  let baseEpoch = epoch;
  if (scene.date) {
    const [y, m, d] = scene.date.split('-').map(Number);
    const local = Date.UTC(y, m - 1, d, real.hour, real.minute, real.second);
    baseEpoch = local - zoneOffset(epoch, zone) * 1000;
    for (let i = 0; i < 2; i++) baseEpoch = local - zoneOffset(baseEpoch, zone) * 1000;
  }
  let base;
  try { base = localParts(baseEpoch, zone); }
  catch { base = real; }
  const hour = scene.hourly ? real.hour + real.minute / 60 + real.second / 3600 : scene.hour ?? retainedHour;
  const delta = mod(hour - (base.hour + base.minute / 60) + 12, 24) - 12;
  const moonEpoch = scene.hourly ? baseEpoch : baseEpoch + delta * 3600000;
  return { hour, baseEpoch, moonEpoch, date: base, offset: zoneOffset(baseEpoch, zone) };
}
function solarGeom(latitude, longitude, hour, date, offset) {
  const n = Math.round((Date.UTC(date.year, date.month - 1, date.day) - Date.UTC(date.year, 0, 1)) / 86400000) + 1;
  const g = 2 * Math.PI / 365 * (n - 1 + (hour - 12) / 24);
  const q = 229.18 * (.000075 + .001868*Math.cos(g) - .032077*Math.sin(g) - .014615*Math.cos(2*g) - .040849*Math.sin(2*g));
  const dec = .006918 - .399912*Math.cos(g) + .070257*Math.sin(g) - .006758*Math.cos(2*g) + .000907*Math.sin(2*g) - .002697*Math.cos(3*g) + .001480*Math.sin(3*g);
  const correction = q + 4*longitude - offset/60;
  const ha = rad(15*hour + correction/4 - 180), lat = rad(latitude);
  const sinAlt = Math.sin(lat)*Math.sin(dec) + Math.cos(lat)*Math.cos(dec)*Math.cos(ha);
  const altitude = deg(Math.asin(clamp(sinAlt, -1, 1)));
  const h0 = Math.acos(clamp((Math.sin(rad(-.833)) - Math.sin(lat)*Math.sin(dec))/(Math.cos(lat)*Math.cos(dec)), -1, 1));
  const noon = 12 - correction/60, half = 12*h0/Math.PI;
  return { altitude, sinAlt, sunrise: noon-half, sunset: noon+half, dayLength: clamp(2*half, .02, 23.98), noon, dayNumber: n };
}
const bodyY = altitude => altitude >= 0 ? .10 + .80*altitude/90 : .10 + .030*altitude;
function sunScreenPos(hour, geom) {
  const elapsed = mod(hour - mod(geom.sunrise, 24), 24);
  const progress = elapsed <= geom.dayLength ? elapsed/geom.dayLength : (24-elapsed < elapsed-geom.dayLength ? 0 : 1);
  return [.16 + .68*progress, bodyY(geom.altitude)];
}
function moonIllum(epoch) {
  const jd = epoch/86400000 + 2440587.5;
  return .5*(1-Math.cos(2*Math.PI*mod((jd-2451550.1)/29.530588853, 1)));
}
function moonAltitude(epoch, latitude, longitude) {
  const j = epoch/86400000+2440587.5-2451545;
  const eps = rad(23.4393-.0000003563*j), L = 218.316+13.176396*j;
  const M = rad(134.963+13.064993*j), F = rad(93.272+13.229350*j);
  const l = rad(L+6.289*Math.sin(M)), b = rad(5.128*Math.sin(F));
  const ra = Math.atan2(Math.sin(l)*Math.cos(eps)-Math.tan(b)*Math.sin(eps), Math.cos(l));
  const dec = Math.asin(Math.sin(b)*Math.cos(eps)+Math.cos(b)*Math.sin(eps)*Math.sin(l));
  const ha = rad(280.46061837+360.98564736629*j+longitude)-ra, lat = rad(latitude);
  return deg(Math.asin(clamp(Math.sin(lat)*Math.sin(dec)+Math.cos(lat)*Math.cos(dec)*Math.cos(ha), -1, 1)));
}
function skyGlow(hour, geom, moonAlt, illumination) {
  const e = geom.altitude;
  if (e > -5) return { body: 'sun', altitude: e, pos: sunScreenPos(hour, geom), strength: (.26+.66*clamp(geom.sinAlt))*smooth((e+5)/6), size: 1+.5*Math.exp(-((Math.max(0,e)/18)**2)) };
  const elapsed = mod(hour-mod(geom.sunrise,24),24);
  const progress = clamp((elapsed-geom.dayLength)/Math.max(24-geom.dayLength,.02));
  return { body: 'moon', altitude: moonAlt, pos: [.20+.60*progress,bodyY(moonAlt)], strength: (.04+.26*illumination)*smooth((moonAlt+3)/8), size: 1+.35*Math.exp(-((Math.max(0,moonAlt)/18)**2)) };
}
function randomFor(key, latitude, longitude) {
  let state = (Math.imul(key,73856093)^Math.imul(Math.round(latitude*10),19349663)^Math.imul(Math.round(longitude*10),83492791))>>>0;
  return () => {
    state = (state+0x6d2b79f5)>>>0;
    let v = Math.imul(state^(state>>>15),state|1);
    v = (v+Math.imul(v^(v>>>7),v|61))^v;
    return ((v^(v>>>14))>>>0)/4294967296;
  };
}
function daySeed(date, latitude, longitude) {
  const next = randomFor(date.year*372+(date.month-1)*31+date.day,latitude,longitude);
  return Array.from({length:4},next);
}
function monthlyDust(date, latitude, longitude) {
  return smooth((randomFor(date.year*12+date.month-1+7,latitude,longitude)()-.25)/.55);
}

/* ── sky/grade.js ────────────────────────────────────────────────────── */
const GRADE_BASE = Object.freeze({ exposure: .777664168999131, adaptation: .24676937284934922, gradientContrast: 1.2, shoulder: .85, saturation: 1.38, vibrance: .46, scotopic: .6, twilightHue: 0, twilightChroma: 0, purple: .59, duskStretch: .7, moonBoost: .0105, horizonBloom: .35, textureVibrancy: 1, blueHue: -12, sunsetPink: .8 });
const LIFT_BASE = Object.freeze({exposure:1.2,saturation:1.6,vibrance:1.33});
function liftedGrade(lift, grade = GRADE_BASE) {
  const result = {...grade};
  for (const k of ['exposure','saturation','vibrance']) result[k] = GRADE_BASE[k]*(typeof lift?.[k] === 'number' && lift[k]>0 ? lift[k] : 1);
  return result;
}
function projectGamut(rgb) {
  if (rgb.every(v=>v>=0&&v<=1)) return rgb;
  const n = clamp(linearY(rgb),1e-7,1);
  let f = 0;
  for (const v of rgb) if (v<0) f=Math.max(f,v/(v-n)); else if(v>1) f=Math.max(f,(v-1)/(v-n));
  return blend(rgb,[n,n,n],Math.min(1,f+.0001));
}
function toOklab([r,g,b]) {
  const l=Math.cbrt(Math.max(0,.4122214708*r+.5363325363*g+.0514459929*b));
  const m=Math.cbrt(Math.max(0,.2119034982*r+.6806995451*g+.1073969566*b));
  const s=Math.cbrt(Math.max(0,.0883024619*r+.2817188376*g+.6299787005*b));
  return [.2104542553*l+.7936177850*m-.0040720468*s,1.9779984951*l-2.4285922050*m+.4505937099*s,.0259040371*l+.7827717662*m-.8086757660*s];
}
function fromOklab([L,a,b]) {
  L = Math.max(0,L);
  const l=(L+.3963377774*a+.2158037573*b)**3,m=(L-.1055613458*a-.0638541728*b)**3,s=(L-.0894841775*a-1.2914855480*b)**3;
  return [4.0767416621*l-3.3077115913*m+.2309699292*s,-1.2684380046*l+2.6097574011*m-.3413193965*s,-.0041960863*l-.7034186147*m+1.7076147010*s];
}
const floors = [[.001129,.001882,.004337],[.001793,.002852,.006832],[.002495,.003879,.009470],[.003475,.005312,.013156]];
const framing = [65,30,10,3];
const encode = v => v<=.0031308 ? 12.92*v : 1.055*v**(1/2.4)-.055;
const rotate = (a,b,theta) => [a*Math.cos(theta)-b*Math.sin(theta),a*Math.sin(theta)+b*Math.cos(theta)];
function gradePalette(linear, e, grade = GRADE_BASE) {
  const effective = e>=0 ? e : e/(1+1.2*grade.duskStretch);
  const R = Math.max(1e-12,linear.reduce((v,c)=>v+linearY(c),0)/4);
  const cols = linear.map((rgb,i)=>{
    const Y=linearY(rgb);
    const tone=grade.exposure*(R/4000)**grade.adaptation*(Math.max(1e-9,Y)/R)**grade.gradientContrast;
    const target=mix(tone,tone/(1+tone),grade.shoulder);
    let [L,a,b]=toOklab(projectGamut(Y>1e-7 ? rgb.map(v=>v*target/Y) : [0,0,0]));
    const sc=grade.scotopic*clamp((-.301029995663981-Math.log10(Math.max(1e-9,Y)))/2.5);
    a*=1-.35*sc; b=b*(1-.35*sc)-.25*sc*L;
    const tw=gaussian(effective,-3,5);
    [a,b]=rotate(a,b,rad(grade.twilightHue*tw)); a*=1+grade.twilightChroma*tw; b*=1+grade.twilightChroma*tw;
    const p=gaussian(effective,-4,4.5)*gaussian(framing[i],22,16)*grade.purple*Math.min(1,3*L);
    a+=.045*p; b-=.055*p;
    const vibrance=1+grade.vibrance*Math.max(0,1-Math.hypot(a,b)/.13);
    a*=vibrance*grade.saturation; b*=vibrance*grade.saturation;
    [a,b]=rotate(a,b,rad(grade.blueHue*clamp((-b-.015)/.05)));
    [a,b]=rotate(a,b,rad(-38*grade.sunsetPink*gaussian(effective,-.5,1.8)*clamp((b-.008)/.05)));
    const mud=Math.max(1-smooth((L-.16)/.26),smooth((-e-5)/6));
    a*=1-.75*mud; if(b>0)b*=1-.92*mud;
    const mapped=fromOklab([L,a,b]).map((v,j)=>floors[i][j]+clamp(v)*(1-floors[i][j]));
    return projectGamut(mapped).map(encode);
  });
  const old2=[...cols[2]];
  cols[2]=blend(cols[2],cols[3],.45*grade.horizonBloom);
  cols[1]=blend(cols[1],old2,.28*grade.horizonBloom);
  return cols;
}

/* ── sky/atmosphere-data.js ──────────────────────────────────────────── */
// Generated by npm run bake. Independent atmospheric data.
const data = {"version":"independent-single-scattering-1","lanes":[0.03,0.08,0.15,0.3,0.6,1.2],"framing":[65,30,10,3],"sky":[0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0.0050164155,0.0078829387,0.011943846,0.0067928448,0.01067447,0.01617344,0.014239895,0.022376978,0.033904512,0.046404723,0.038776496,0.039352745,0.031993144,0.05027494,0.076174152,0.043322659,0.068078464,0.10314919,0.12298387,0.16030677,0.21861704,0.48827883,0.34549274,0.2633775,0.10785658,0.16909947,0.25619158,0.15904602,0.2348389,0.34731206,0.66381926,0.76929978,0.84068627,2.4416084,1.5594759,0.93343263,0.29239929,0.42820954,0.61524026,0.53128249,0.70782141,0.91185654,2.4815403,2.6356988,2.4146334,7.8803843,4.7186407,2.3219454,0.79211162,1.0763397,1.4135069,1.6615364,2.0506132,2.3467696,7.4146022,7.4091731,5.879195,19.786601,11.361004,4.8371124,2.3800105,2.9868799,3.5674044,5.2754861,6.0911345,6.2864816,20.576545,19.672444,14.019458,46.230733,25.595404,9.9313458,7.0826563,8.3877325,9.2279772,15.472873,17.152407,16.418076,51.898173,48.134472,31.907099,99.130422,53.89674,20.014999,18.98495,21.806491,22.766175,40.024386,43.362898,39.655113,117.57884,107.1774,68.142858,197.19448,106.5789,39.614535,43.906152,50.110583,51.080527,89.35085,96.446541,86.349419,238.76568,217.11569,136.1141,365.73923,200.1202,77.354996,87.244262,101.35512,103.30009,172.85807,189.7446,169.90697,436.36449,403.91059,256.65758,639.67843,361.99497,150.02772,152.42126,184.15886,191.8473,297.10285,337.09155,308.49763,733.20666,701.19139,464.9208,1084.0119,641.91278,290.99518,245.07607,310.79714,337.63011,474.57917,557.9745,532.47417,1174.2574,1163.0573,825.92737,1842.6341,1143.6244,567.97272,303.06877,397.14248,423.84752,608.02099,735.25156,683.84438,1535.1676,1556.1762,1023.6712,2599.0802,1666.5911,638.64465,350.00403,482.22273,521.9181,717.62627,913.91204,859.82139,1831.4902,1967.7885,1276.3433,3243.8875,2292.54,773.25984,387.23408,560.28092,628.00815,804.63469,1079.7612,1054.2766,2062.3601,2355.5107,1579.5137,3749.7603,2923.3341,990.20258,417.13676,629.22998,737.03435,874.02151,1226.7787,1257.3416,2241.0318,2699.0396,1915.325,4138.9876,3501.9445,1280.1438,441.82646,689.46776,844.86898,930.55595,1354.8822,1460.1742,2381.0501,2995.2088,2263.6448,4439.9322,4009.3769,1618.5123,462.86403,742.28573,948.92272,977.8434,1466.3438,1656.7355,2492.842,3248.2871,2608.6793,4675.678,4445.8986,1980.2021,481.3416,789.09445,1047.931,1018.4298,1563.9367,1843.6877,2583.8289,3464.6186,2940.3525,4863.0623,4819.0319,2345.9887,498.01626,831.14294,1141.5168,1054.0836,1650.2129,2019.6242,2659.1897,3650.3934,3253.2295,5013.9995,5137.9343,2703.2103,513.41752,869.4549,1229.8149,1086.0379,1727.3021,2184.3199,2722.549,3810.9297,3544.9963,5136.9088,5411.2047,3044.3917,527.92196,904.84377,1313.2181,1115.1625,1796.9112,2338.1943,2776.4757,3950.5693,3815.2256,5237.8043,5646.2172,3365.6244,541.80282,937.94922,1392.2248,1142.0799,1860.3864,2481.9752,2822.8197,4072.7846,4064.5396,5321.0503,5849.0606,3665.2769,555.26268,969.27414,1467.3557,1167.242,1918.7842,2616.5032,2862.9367,4180.3349,4294.0886,5389.8708,6024.6882,3943.0972,568.45507,999.21594,1539.11,1190.981,1972.9341,2742.6255,2897.8372,4275.4149,4505.2438,5446.6909,6177.1133,4199.6294,581.49899,1028.0912,1607.9468,1213.5441,2023.4902,2861.1418,2928.2878,4359.7783,4699.4245,5493.3675,6309.5944,4435.8472,594.4888,1056.1547,1674.2776,1235.1159,2070.9696,2972.7803,2954.8787,4434.8365,4878.0049,5531.3476,6424.7908,4652.9305,607.50111,1083.6137,1738.4665,1255.8356,2115.7837,3078.1901,2978.0722,4501.7339,5042.2695,5561.7774,6524.8877,4852.1311,620.5996,1110.6387,1800.8337,1275.8074,2158.2603,3177.9423,2998.2353,4561.4071,5193.3941,5585.5797,6611.6954,5034.6962,633.83854,1137.372,1861.6595,1295.1094,2198.6615,3272.5345,3015.664,4614.6288,5332.4425,5603.5089,6686.7262,5201.8251,647.26539,1163.9337,1921.1892,1313.7989,2237.1971,3362.3984,3030.6005,4662.0429,5460.3707,5616.1906,6751.2542,5354.6478,660.92266,1190.4269,1979.6381,1331.9171,2274.0347,3447.9061,3043.2458,4704.1904,5578.0353,5624.1512,6806.3622,5494.2154,674.84944,1216.9412,2037.1957,1349.4922,2309.3079,3529.3779,3053.7693,4741.5302,5686.2029,5627.8394,6852.978,5621.4988,689.0825,1243.5559,2094.0292,1366.5419,2343.1222,3607.0885,3062.3156,4774.4551,5785.5599,5627.6423,6891.9038,5737.3906,703.65722,1270.3425,2150.2876,1383.0755,2375.5605,3681.2727,3069.0103,4803.3046,5876.7223,5623.8985,6923.8381,5842.7101,718.60837,1297.3663,2206.1042,1399.095,2406.6868,3752.1306,3073.9637,4828.3744,5960.2439,5616.9064,6949.3942,5938.2083,733.97064,1324.6884,2261.5993,1414.5969,2436.5492,3819.8323,3077.2743,4849.9248,6036.6244,5606.9326,6969.1145,6024.5744,749.77928,1352.3669,2316.8827,1429.5728,2465.1828,3884.5217,3079.031,4868.1869,6106.3163,5594.217,6983.4822,6102.441,766.07047,1380.4576,2372.0556,1444.0104,2492.6118,3946.3201,3079.3152,4883.3674,6169.7306,5578.9773,6992.9302,6172.3902,782.88178,1409.0158,2427.2122,1457.8941,2518.8516,4005.3293,3078.2023,4895.6531,6227.2425,5561.4125,6997.8493,6234.9582,800.2525,1438.0963,2482.4415,1471.206,2543.9097,4061.6341,3075.7627,4905.2138,6279.1958,5541.7061,6998.5937,6290.6397,818.22404,1467.7546,2537.8286,1483.9261,2567.7878,4115.3048,3072.0627,4912.2054,6325.9064,5520.0276,6995.4867,6339.8928,836.84017,1498.0475,2593.4558,1496.0329,2590.4826,4166.3994,3067.1656,4916.7718,6367.6666,5496.5348,6988.8245,6383.142,856.14736,1529.0335,2649.404,1507.5042,2611.9869,4214.9656,3061.1319,4919.0469,6404.7471,5471.3754,6978.8797,6420.7815,876.19501,1560.7734,2705.7534,1518.3173,2632.2906,4261.0421,3054.0195,4919.1557,6437.3999,5444.6874,6965.9045,6453.1787,897.03571,1593.331,2762.5842,1528.4495,2651.3815,4304.6605,3045.8847,4917.216,6465.8608,5416.6011,6950.1326,6480.6761,918.72547,1626.7729,2819.9781,1537.8785,2669.2463,4345.8468,3036.7819,4913.339,6490.3506,5387.2389,6931.7816,6503.5937,941.32384,1661.1695,2878.0182,1546.5828,2685.8711,4384.6223,3026.764,4907.6301,6511.0772,5356.7166,6911.0546,6522.2315,964.89409,1696.5949,2936.79,1554.5422,2701.242,4421.0051,3015.8824,4900.1899,6528.2368,5325.144,6888.1418,6536.8706,989.50327,1733.127,2996.3815,1561.738,2715.3461,4455.0108,3004.1873,4891.1144,6542.0149,5292.6248,6863.2215,6547.7754,1015.2222,1770.8481,3056.8842,1568.1534,2728.1713,4486.6539,2991.7276,4880.4956,6552.5877,5259.2577,6836.4614,6555.1945,1042.1255,1809.8443,3118.3923,1573.7738,2739.7079,4515.9483,2978.5509,4868.4218,6560.1229,5225.136,6808.0193,6559.3623,1070.291,1850.2054,3181.0037,1578.5871,2749.9478,4542.9084,2964.7039,4854.9781,6564.7801,5190.3486,6778.0442,6560.4999,1099.8001,1892.0252,3244.8191,1582.5836,2758.8859,4567.5494,2950.2318,4840.2462,6566.712,5154.9801,6746.6768,6558.8162,1130.7366,1935.4001,3309.942,1585.7568,2766.5198,4589.8881,2935.1789,4824.3051,6566.0647,5119.1107,6714.0502,6554.509,1163.1863,1980.4289,3376.4777,1588.103,2772.8502,4609.9435,2919.5881,4807.2312,6562.978,5082.8166,6680.2905,6547.7655,1197.2359,2027.2114,3444.5324,1589.6215,2777.8814,4627.7369,2903.5014,4789.0981,6557.5864,5046.1706,6645.517,6538.7629,1232.972,2075.8471,3514.2118,1590.315,2781.6209,4643.2926,2886.9594,4769.977,6550.0189,5009.2416,6609.8432,6527.6698,1270.479,2126.4332,3585.6187,1590.1893,2784.0799,4656.638,2870.0017,4749.937,6540.3998,4972.0953,6573.3767,6514.6459,1309.8375,2179.0623,3658.8513,1589.2531,2785.2733,4667.8036,2852.6666,4729.0448,6528.8488,4934.7941,6536.2198,6499.8431,1351.1214,2233.8193,3733.9991,1587.5185,2785.2193,4676.8234,2834.9913,4707.3648,6515.4813,4897.3974,6498.4696,6483.406,1394.3952,2290.7779,3811.1399,1585.0004,2783.9397,4683.7348,2817.0118,4684.9597,6500.4085,4859.9617,6460.2188,6465.4719,1439.71,2349.9962,3890.3345,1581.7165,2781.4598,4688.5785,2798.763,4661.89,6483.7379,4822.5407,6421.5553,6446.172,1487.0993,2411.5116,3971.6215,1577.6872,2777.8077,4691.3984,2780.2786,4638.2143,6465.5734,4785.1852,6382.5631,6425.6308,1536.5738,2475.3349,4055.0109,1572.9353,2773.0149,4692.2416,2761.5911,4613.9893,6446.0154,4747.9439,6343.3219,6403.9674,1588.1162,2541.4434,4140.4762,1567.4857,2767.1151,4691.1582,2742.732,4589.2701,6425.1609,4710.8629,6303.908,6381.2951,1641.6741,2609.7735,4227.9469,1561.3655,2760.1449,4688.2008,2723.7315,4564.1098,6403.104,4673.9858,6264.3938,6357.7222,1697.1537,2680.2126,4317.2989,1554.6034,2752.1427,4683.4245,2704.6188,4538.5599,6379.9355,4637.3543,6224.8487,6333.3519,1754.4124,2752.5901,4408.3453,1547.2294,2743.1489,4676.8866,2685.4223,4512.6705,6355.7437,4601.0078,6185.3384,6308.2829,1813.2511,2826.6688,4500.8263,1539.2747,2733.2055,4668.6464,2666.1688,4486.4897,6330.6138,4564.984,6145.9261,6282.6093,1873.4072,2902.1362,4594.3999,1530.7717,2722.3556,4658.7643,2646.8846,4460.0645,6304.6285,4529.3182,6106.6717,6256.4209,1934.548,2978.5967,4688.633,1521.7531,2710.6433,4647.3025,2627.5948,4433.44,6277.868,4494.0444,6067.6325,6229.8037,1996.2654,3055.5654,4782.9944,1512.2521,2698.1133,4634.3237,2608.3233,4406.6602,6250.41,4459.1945,6028.863,6202.8396,2058.073,3132.464,4876.85,1502.3021,2684.8107,4619.8916,2589.0936,4379.7675,6222.3299,4424.7989,5990.4154,6175.6071,2119.405,3208.62,4969.462,1491.9364,2670.7806,4604.0699,2569.9277,4352.803,6193.7005,4390.8863,5952.3392,6148.1807,2179.6193,3283.2702,5059.9917,1481.1879,2656.0681,4586.9227,2550.8473,4325.8066,6164.5928,4357.484,5914.6818,6120.6321,2238.005,3355.569,5147.5092,1470.0892,2640.7178,4568.5138,2531.8727,4298.8167,6135.0755,4324.6178,5877.4883,6093.0292,2293.7939,3424.6022,5231.0076,1458.6724,2624.7737,4548.9068,2513.0238,4271.8707,6105.2151,4292.3121,5840.8015,6065.437,2346.1776,3489.4077,5309.4253,1446.9684,2608.2793,4528.1646,2494.3194,4245.0046,6075.0761,4260.5898,5804.6624,6037.9176,2394.3294,3549.0008,5381.6742,1435.0077,2591.277,4506.3494,2475.7779,4218.2534,6044.7211,4229.4727,5769.1096,6010.5298,2437.4307,3602.4056,5446.6736,1422.8195,2573.8081,4483.5226,2457.4165,4191.6507,6014.2108,4198.9812,5734.18,5983.3298,2474.7009,3648.6904,5503.3892,1410.432,2555.913,4459.7444,2439.252,4165.2292,5983.6037,4169.1346,5699.9087,5956.371,2505.4281,3687.0049,5550.8739,1397.8724,2537.6308,4435.0741,2421.3005,4139.0206,5952.9569,4139.9509,5666.3286,5929.704,2529.0007,3716.6171,5588.3087,1385.1665,2518.9992,4409.5697,2403.5773,4113.0552,5922.3251,4111.4471,5633.4712,5903.3771,2544.9358,3736.947,5615.0402,1372.339,2500.0547,4383.2879,2386.0971,4087.3625,5891.7618,4083.6389,5601.366,5877.4356,2552.9023,3747.5951,5630.6123,1359.4134,2480.8326,4356.2842,2368.874,4061.9709,5861.3182,4056.5412,5570.0408,5851.9226,2552.7379,3748.3622,5634.7883,1346.4121,2461.3667,4328.6126,2351.9214,4036.9078,5831.0441,4030.1677,5539.5218,5826.8786,2544.4574,3739.2593,5627.563,1333.356,2441.6894,4300.326,2335.2522,4012.1997,5800.9872,4004.5309,5509.8335,5802.3418,2528.2516,3720.5071,5609.1624,1320.2651,2421.8319,4271.4757,2318.8787,3987.8718,5771.1939,3979.6427,5480.9988,5778.348,2504.4773,3692.524,5580.0314,1307.158,2401.8241,4242.1118,2302.8127,3963.9487,5741.7086,3955.5136,5453.0389,5754.9305,2473.6396,3655.9054,5540.811,1294.0524,2381.6946,4212.283,2287.0652,3940.4538,5712.5739,3932.1534,5425.9737,5732.1207,2436.3669,3611.3939,5492.3073,1280.9648,2361.4706,4182.0368,2271.6469,3917.4097,5683.8308,3909.5708,5399.8212,5709.9474,2393.3819,3559.8457,5435.4531,1267.9106,2341.1785,4151.4192,2256.5679,3894.8379,5655.5188,3887.7737,5374.598,5688.4372,2345.4709,3502.193,5371.2686,1254.9043,2320.8433,4120.4752,2241.8377,3872.759,5627.6753,3866.7691,5350.3192,5667.6145,2293.4521,3439.4076,5300.8199,1241.9596,2300.489,4089.2485,2227.4655,3851.1926,5600.3362,3846.5628,5326.9985,5647.5017,2238.1471,3372.4662,5225.1817,1229.0892,2280.1384,4057.7817,2213.4598,3830.1576,5573.5358,3827.1601,5304.6478,5628.1187,2180.3552,3302.32,5145.4034,1216.3048,2259.8137,4026.1161,2199.8287,3809.6716,5547.3063,3808.5651,5283.2777,5609.4835,2120.8324,3229.8699,5062.4818,1203.6176,2239.5358,3994.292,2186.5796,3789.7515,5521.6786,3790.7812,5262.8973,5591.6118,2060.2758,3155.9475,4977.3395,1191.0379,2219.325,3962.3488,2173.7197,3770.4133,5496.6815,3773.8108,5243.5142,5574.5173,1999.3123,3081.3018,4890.8102,1178.5755,2199.2006,3930.3247,2161.2555,3751.6717,5472.3424,3757.6555,5225.1347,5558.2113,1938.4924,3006.5918,4803.6305,1166.2395,2179.1812,3898.257,2149.1932,3733.5408,5448.6865,3742.316,5207.7632,5542.7033,1878.2881,2932.3835,4716.4358,1154.0383,2159.2848,3866.1818,2137.5383,3716.0337,5425.7375,3727.7923,5191.4032,5528.0006,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0.0050164155,0.0078829387,0.011943846,0.0067928448,0.01067447,0.01617344,0.014239895,0.022376978,0.033904512,0.03197392,0.031227657,0.038600609,0.031993144,0.05027494,0.076174152,0.043322659,0.068078464,0.10314919,0.11526813,0.15620257,0.21794832,0.30364017,0.24263173,0.25057981,0.10764848,0.16908801,0.25619157,0.15756805,0.2342156,0.34726751,0.59364983,0.70285957,0.80890629,1.4319544,0.99190957,0.85965236,0.2894725,0.4265716,0.61461832,0.51015398,0.69252206,0.90183955,2.1150519,2.2898723,2.219448,4.4765383,2.8015681,2.0721148,0.77218316,1.0611379,1.4007765,1.5697115,1.9626839,2.2694571,6.1495211,6.225635,5.1913998,11.018382,6.4518786,4.2040566,2.2781777,2.9113727,3.4960399,4.8724809,5.7352276,5.9581314,16.850709,16.186927,12.003992,25.183599,14.161149,8.4819735,6.7000607,8.1072115,8.9561006,14.209119,15.988886,15.342943,42.206525,39.124808,26.780113,53.883265,29.482829,16.983456,17.855945,20.970836,21.957646,36.480622,40.199379,36.764254,95.183829,86.584341,56.653017,106.56185,58.335922,33.750854,41.114458,48.052771,49.126144,81.095219,89.153609,79.807248,192.33947,175.04754,113.14003,197.16342,110.61341,66.700031,81.333443,96.998006,99.335353,156.13984,175.06935,157.14058,350.04418,325.87378,214.99042,344.88996,203.41944,131.46388,141.76205,175.88358,184.85071,268.12479,310.60252,286.38616,589.60305,567.67529,394.95421,590.67249,368.49777,259.14482,230.23227,296.77247,326.47488,435.67568,515.21762,497.4217,970.042,951.25992,714.63788,1054.8391,674.67968,512.09694,295.23664,378.88629,407.24746,591.97887,681.5323,632.38414,1368.8804,1272.847,856.89688,1705.4297,950.99369,537.38252,358.76414,466.55195,499.28286,752.32395,868.92112,790.69058,1793.8249,1667.7579,1043.6029,2500.0594,1408.0303,595.64122,414.45476,553.5142,600.50556,894.93544,1061.2959,970.93239,2170.4564,2091.8273,1282.547,3237.9778,1980.776,716.29051,461.30213,634.66156,707.16121,1014.6956,1243.8226,1166.7611,2478.9611,2499.7784,1567.1394,3848.6378,2573.905,910.54823,500.77611,708.15568,815.37694,1114.4804,1409.9359,1369.9203,2726.2557,2869.0945,1880.9303,4334.6143,3129.6647,1166.2719,534.71059,774.18278,922.1783,1198.7367,1558.6898,1573.2141,2925.059,3194.0652,2206.5616,4718.5723,3625.5935,1461.5739,564.64932,833.74089,1025.7578,1271.3682,1691.6334,1771.7177,3086.8394,3476.9592,2530.616,5023.5213,4058.3132,1775.7987,591.75779,887.99947,1125.2619,1335.3539,1811.0499,1962.6202,3220.4263,3722.788,2844.3646,5267.939,4432.4299,2093.4609,616.88813,938.04129,1220.4713,1392.8657,1919.1937,2144.6286,3332.2833,3936.9327,3142.8313,5465.6381,4755.0058,2404.2935,640.6622,984.7869,1311.5361,1445.4679,2018.028,2317.403,3427.0828,4124.2551,3423.6029,5626.7346,5033.2072,2702.0673,663.53936,1028.9925,1398.7986,1494.2894,2109.1741,2481.147,3508.2145,4288.8619,3685.8696,5758.6397,5273.4528,2983.3449,685.86547,1071.2721,1482.6839,1540.1508,2193.9396,2636.3437,3578.1634,4434.1237,3929.7634,5866.8361,5481.2064,3246.5066,707.90712,1112.1242,1563.6391,1583.6534,2273.3679,2783.5966,3638.7765,4562.776,4155.9334,5955.437,5661.0193,3491.0695,729.87511,1151.9567,1642.1003,1625.2408,2348.2881,2923.5378,3691.4472,4677.0339,4365.2861,6027.5779,5816.6543,3717.2376,751.94079,1191.1064,1718.4767,1665.2418,2419.3579,3056.7786,3737.2434,4778.6962,4558.8309,6085.6892,5951.2215,3925.6123,774.24749,1229.8558,1793.1453,1703.9001,2487.0989,3183.8841,3776.9961,4869.2316,4737.5919,6131.6858,6067.3013,4117.0099,796.91862,1268.4453,1866.4492,1741.3947,2551.9237,3305.3621,3811.362,4949.8481,4902.5591,6167.1024,6167.0483,4292.3487,820.06358,1307.0831,1938.7005,1777.8557,2614.1579,3421.6607,3840.8685,5021.5474,5054.6647,6193.188,6252.2749,4452.5801,843.78206,1345.9529,2010.1825,1813.3744,2674.0566,3533.1692,3865.9457,5085.1676,5194.7729,6210.9757,6324.5179,4598.6475,868.16733,1385.2199,2081.1541,1848.012,2731.8176,3640.2218,3886.95,5141.417,5323.6772,6221.3321,6385.0921,4731.4634,893.30878,1425.0356,2151.8533,1881.8049,2787.5919,3743.1024,3904.1815,5190.8996,5442.1039,6224.9952,6435.1318,4851.8962,919.29386,1465.5415,2222.5005,1914.7696,2841.4916,3842.0493,3917.8974,5234.136,5550.7157,6222.6012,6475.6238,4960.7654,946.20973,1506.8727,2293.302,1946.9064,2893.5963,3937.2598,3928.3213,5271.5796,5650.1181,6214.7059,6507.4337,5058.8394,974.14458,1549.1598,2364.4531,1978.2016,2943.9588,4028.8949,3935.6508,5303.6289,5740.8649,6201.8002,6531.3269,5146.8368,1003.1888,1592.5316,2436.1407,2008.6308,2992.6095,4117.0834,3940.0633,5330.6385,5823.4643,6184.3223,6547.9852,5225.4283,1033.436,1637.1169,2508.5457,2038.1596,3039.5594,4201.9258,3941.7206,5352.9263,5898.3838,6162.6669,6558.02,5295.2393,1064.9837,1683.046,2581.8456,2066.7464,3084.8038,4283.4977,3940.7716,5370.7806,5966.0553,6137.1925,6561.9833,5356.8539,1097.9346,1730.4523,2656.2164,2094.343,3128.3249,4361.853,3937.3555,5384.4649,6026.8793,6108.227,6560.3763,5410.8171,1132.3968,1779.4734,2731.8341,2120.8964,3170.0936,4437.0272,3931.6035,5394.2223,6081.2287,6076.0725,6553.6566,5457.6382,1168.4851,1830.2528,2808.8771,2146.3496,3210.0726,4509.0396,3923.6406,5400.2789,6129.4522,6041.0084,6542.2437,5497.794,1206.3209,1882.94,2887.5273,2170.6432,3248.2173,4577.8963,3913.5863,5402.846,6171.8768,6003.2944,6526.5242,5531.7309,1246.0337,1937.6927,2967.9721,2193.7162,3284.4782,4643.5925,3901.5559,5402.1229,6208.8106,5963.1729,6506.8554,5559.8675,1287.7612,1994.6767,3050.4049,2215.5071,3318.8023,4706.1145,3887.6608,5398.2981,6240.5448,5920.8705,6483.5686,5582.5968,1331.6498,2054.0674,3135.0272,2235.9547,3351.1349,4765.4422,3872.0095,5391.5509,6267.3552,5876.5998,6456.972,5600.2882,1377.8552,2116.0502,3222.0494,2254.9997,3381.4206,4821.5505,3854.7071,5382.0525,6289.5043,5830.5604,6427.3528,5613.289,1426.543,2180.8211,3311.6913,2272.5847,3409.605,4874.4119,3835.8565,5369.9669,6307.2418,5782.9401,6394.9791,5621.9263,1477.8886,2248.5874,3404.1837,2288.6559,3435.6361,4923.9976,3815.5575,5355.4513,6320.8064,5733.9155,6360.1018,5626.5082,1532.0777,2319.5677,3499.7683,2303.1636,3459.465,4970.2797,3793.9077,5338.6571,6330.4263,5683.6532,6322.9559,5627.325,1589.3058,2393.9922,3598.6983,2316.0628,3481.0476,5013.2323,3771.0023,5319.7298,6336.3202,5632.3098,6283.7616,5624.6508,1649.7786,2472.1024,3701.2384,2327.3142,3500.345,5052.8329,3746.9337,5298.8098,6338.6977,5580.0329,6242.7254,5618.744,1713.7109,2554.1504,3807.6641,2336.8848,3517.325,5089.064,3721.7922,5276.0323,6337.76,5526.9614,6200.0412,5609.8485,1781.3258,2640.3983,3918.2614,2344.7483,3531.9623,5121.9139,3695.665,5251.5277,6333.7004,5473.2261,6155.8911,5598.1946,1852.8537,2731.1161,4033.3249,2350.8855,3544.2396,5151.3778,3668.6372,5225.4218,6326.7048,5418.9498,6110.4459,5583.9998,1928.5297,2826.5801,4153.1557,2355.2849,3554.1478,5177.4584,3640.7909,5197.8357,6316.9517,5364.2481,6063.8662,5567.4694,2008.5918,2927.0695,4278.0583,2357.9429,3561.6866,5200.1668,3612.2056,5168.8862,6304.6129,5309.2292,6016.3026,5548.7972,2093.2769,3032.8627,4408.337,2358.8635,3566.8647,5219.5231,3582.9579,5138.6854,6289.8534,5253.9949,5967.8967,5528.1666,2182.8168,3144.2325,4544.2899,2358.0589,3569.6998,5235.5562,3553.1218,5107.3416,6272.832,5198.6403,5918.781,5505.7502,2277.4329,3261.4392,4686.203,2355.549,3570.2186,5248.3042,3522.7682,5074.9584,6253.7013,5143.2545,5869.0802,5481.7115,2377.3291,3384.7234,4834.341,2351.3616,3568.4569,5257.8149,3491.9654,5041.6356,6232.6079,5087.9206,5818.9109,5456.2045,2482.6843,3514.2961,4988.938,2345.5316,3564.4589,5264.1447,3460.7785,5007.4687,6209.6927,5032.7163,5768.3826,5429.3747,2593.6419,3650.3276,5150.1846,2338.1011,3558.2771,5267.3592,3429.2702,4972.5493,6185.0911,4977.7138,5717.5977,5401.3593,2710.2995,3792.9338,5318.2138,2329.1185,3549.9719,5267.5322,3397.4998,4936.9653,6158.9329,4922.9805,5666.6521,5372.2879,2832.6946,3942.1611,5493.084,2318.6385,3539.6105,5264.7454,3365.5243,4900.8003,6131.3428,4868.5788,5615.6355,5342.2827,2960.7904,4097.9683,5674.7599,2306.7209,3527.2669,5259.0879,3333.3976,4864.1346,6102.4404,4814.5666,5564.6318,5311.4588,3094.4586,4260.2071,5863.091,2293.4304,3513.0207,5250.6552,3301.1709,4827.0446,6072.3403,4760.9977,5513.7192,5279.9249,3233.4617,4428.6007,6057.788,2278.8359,3496.9566,5239.5488,3268.8928,4789.6032,6041.1526,4707.9216,5462.9709,5247.7833,3377.4333,4602.7209,6258.3984,2263.0094,3479.1635,5225.875,3236.6093,4751.88,6008.9826,4655.384,5412.455,5215.1304,3525.859,4781.9652,6464.2805,2246.0259,3459.7337,5209.7446,3204.3638,4713.9411,5975.9311,4603.427,5362.2349,5182.057,3678.0572,4965.5341,6674.5788,2227.9624,3438.762,5191.2715,3172.1971,4675.8494,5942.0947,4552.0893,5312.3699,5148.6486,3833.162,5152.4108,6888.2014,2208.897,3416.3453,5170.5722,3140.1478,4637.6647,5907.566,4501.4062,5262.9148,5114.9857,3990.1095,5341.3446,7103.8014,2188.9087,3392.5815,5147.765,3108.2522,4599.4438,5872.4332,4451.4102,5213.9207,5081.1439,4147.6288,5530.8405,7319.7645,2168.0767,3367.5687,5122.969,3076.5443,4561.2405,5836.7812,4402.1308,5165.4349,5047.1942,4304.241,5719.1571,7534.2062,2146.4794,3341.4048,5096.3037,3045.0559,4523.1061,5800.6907,4353.5948,5117.5013,5013.2036,4458.2662,5904.3152,7744.9804,2124.1945,3314.1868,5067.8878,3013.8168,4485.0888,5764.239,4305.8264,5070.1605,4979.2347,4607.8429,6084.1197,7949.7021,2101.298,3286.0103,5037.8392,2982.855,4447.2345,5727.5001,4258.8476,5023.45,4945.3464,4750.9585,6256.1958,8145.7859,2077.8641,3256.9686,5006.2741,2952.1964,4409.5867,5690.5446,4212.6781,4977.4044,4911.5939,4885.4945,6418.0416,8330.5027,2053.9647,3227.1528,4973.3062,2921.8652,4372.1863,5653.4397,4167.3354,4932.0554,4878.0287,5009.2835,6567.0955,8501.0522,2029.6691,3196.6512,4939.047,2891.884,4335.0722,5616.2499,4122.8352,4887.4323,4844.6993,5120.1787,6700.8175,8654.6511,2005.044,3165.5487,4903.6047,2862.2737,4298.2811,5579.0364,4079.1912,4843.562,4811.6508,5216.1315,6816.7813,8788.6334,1980.1528,3133.9272,4867.0842,2833.0536,4261.8474,5541.8579,4036.4155,4800.4687,4778.9253,5295.2739,6912.7715,8900.5559,1955.0557,3101.8648,4829.587,2804.2418,4225.804,5504.7701,3994.5185,4758.1749,4746.5621,5355.9999,6986.8795,8988.3039,1929.8099,3069.4359,4791.2109,2775.8549,4190.1814,5467.8262,3953.5091,4716.7007,4714.5978,5397.0405,7037.5924,9050.1889,1904.469,3036.7111,4752.0495,2747.908,4155.0087,5431.0768,3913.395,4676.0643,4683.0661,5417.5251,7063.8663,9085.0293,1879.0832,3003.7571,4712.1928,2720.4153,4120.3132,5394.5701,3874.1821,4636.2822,4651.9985,5417.0256,7065.1788,9092.2093,1853.6995,2970.637,4671.7266,2693.3896,4086.1205,5358.3518,3835.8754,4597.3688,4621.424,5395.578,7041.5548,9071.709,1828.3615,2937.4097,4630.7327,2666.8428,4052.4546,5322.4655,3798.4788,4559.3373,4591.3693,5353.6801,6993.5648,9024.104,1803.1095,2904.1307,4589.2891,2640.7856,4019.3382,5286.9525,3761.9947,4522.1988,4561.8586,5292.2658,6922.2949,8950.5347,1777.9806,2870.8516,4547.4697,2615.2279,3986.7923,5251.8519,3726.4248,4485.9633,4532.9145,5212.6572,6829.2913,8852.6468,1753.009,2837.6205,4505.3448,2590.1786,3954.8368,5217.2007,3691.7697,4450.639,4504.5572,5116.5007,6716.4845,8732.5105,1728.2256,2804.482,4462.9807,2565.6455,3923.49,5183.034,3658.0291,4416.2331,4476.8048,5005.6901,6586.0998,8592.5236,1703.659,2771.4777,4420.4404,2541.636,3892.7693,5149.3847,3625.2018,4382.751,4449.6738,4882.2856,6440.5612,8435.3071,1679.3347,2738.6458,4377.7834,2518.1563,3862.6905,5116.2841,3593.2857,4350.1973,4423.1787,4748.4317,6282.3951,8263.6006,1655.2758,2706.0216,4335.0659,2495.2122,3833.2684,5083.7614,3562.2782,4318.5751,4397.3322,4606.2813,6114.1399,8080.1638,1631.5031,2673.6377,4292.341,2472.8086,3804.5167,5051.8438,3532.1755,4287.8863,4372.1453,4457.9289,5938.2679,7887.6904,1608.0352,2641.5239,4249.6588,2450.9497,3776.4478,5020.5569,3502.9735,4258.1319,4347.6271,4305.3553,5757.1192,7688.7359,1584.8885,2609.7077,4207.0667,2429.6393,3749.0733,4989.9246,3474.6672,4229.3115,4323.7854,4150.3861,5572.8526,7485.6633,1562.0775,2578.2142,4164.6093,2408.8803,3722.4036,4959.9689,3447.2511,4201.4239,4300.6261,3994.6626,5387.4111,7280.6045,1539.615,2547.0665,4122.3287,2388.6752,3696.4481,4930.7099,3420.7188,4174.4666,4278.1536,3839.6255,5202.502,7075.4378,1517.5122,2516.2856,4080.2649,2369.0258,3671.2152,4902.1665,3395.0637,4148.4364,4256.3707,3686.5089,5019.5898,6871.7797,1495.7786,2485.8906,4038.4554,2349.9335,3646.7123,4874.3553,3370.2784,4123.3289,4235.2789,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0.0050164155,0.0078829387,0.011943846,0.0067928448,0.01067447,0.01617344,0.014239895,0.022376978,0.033904512,0.022500066,0.027135573,0.038284115,0.031993144,0.05027494,0.076174152,0.043322659,0.068078464,0.10314919,0.10869074,0.1520814,0.21731487,0.18328519,0.18696041,0.2451944,0.10760507,0.16908652,0.25619157,0.15595526,0.23346742,0.34721355,0.51842782,0.63474136,0.77878668,0.77869522,0.68501754,0.82860438,0.28659867,0.42449339,0.61381184,0.49001259,0.67398438,0.88961385,1.7387241,1.9369524,2.0344529,2.2762027,1.7649231,1.9669811,0.74998164,1.0417917,1.3842578,1.4642994,1.85408,2.17509,4.8978828,5.0180416,4.5394989,5.389172,3.7960482,3.9376511,2.1727506,2.8161345,3.4034305,4.4639313,5.2984112,5.5573276,13.163211,12.62769,10.093651,12.0091,7.9837424,7.8720267,6.3270536,7.7525594,8.6032623,12.844225,14.55672,14.030495,32.534698,29.929793,21.920267,25.286774,16.307703,15.70762,16.745575,19.913821,20.908231,32.782815,36.323204,33.234881,72.815182,65.599353,45.76066,50.011402,32.35416,31.282925,38.388969,45.475581,46.589045,72.57829,80.268208,71.818527,146.68411,132.34237,91.356517,93.273846,62.618495,62.215215,75.764812,91.662103,94.187791,139.42546,157.46115,141.54768,267.06521,247.37489,175.47311,166.2604,119.18439,123.65182,132.11018,166.19277,175.77415,239.89518,279.70807,259.38534,453.42615,435.46409,328.60453,293.57061,225.43122,245.76605,215.94487,281.13497,312.07482,393.75692,466.48994,454.71067,759.81946,743.33996,609.23903,541.9403,430.24031,488.77322,279.57309,356.66164,386.04817,544.98903,613.15161,569.9161,1091.948,970.47787,699.11001,873.04302,525.63417,494.67879,352.90826,441.50344,470.18329,733.49512,791.31251,705.49627,1544.5916,1285.7858,818.9101,1490.5162,750.44647,511.23875,427.30711,533.31624,563.88423,931.01355,996.24362,863.8295,2033.4608,1685.0152,982.66184,2259.549,1146.4061,561.11822,495.57649,625.86024,665.31239,1113.5303,1209.9739,1043.7406,2482.3896,2120.6399,1197.3695,3006.8315,1653.8773,669.1175,555.7499,714.36936,771.59588,1273.3177,1417.3866,1239.7299,2864.7446,2548.2408,1456.1936,3654.5982,2192.0241,840.95293,608.58734,796.81878,879.72124,1411.461,1611.0014,1444.4977,3181.7612,2943.8046,1744.1067,4190.4043,2708.3791,1064.5075,655.61135,873.02051,987.34853,1531.7357,1788.8126,1651.6209,3443.6073,3299.0754,2045.7193,4626.7423,3179.1174,1321.4705,698.3024,943.63659,1093.0158,1638.0223,1951.5322,1856.5476,3661.2154,3614.0415,2348.9999,4981.4429,3597.439,1595.0731,737.8794,1009.6013,1195.9923,1733.5465,2100.8925,2056.4901,3843.8048,3892.0822,2645.7994,5270.8276,3964.6426,1872.6558,775.29182,1071.8555,1296.0501,1820.7988,2238.8239,2249.9672,3998.5465,4137.5347,2931.123,5508.0947,4285.2056,2145.605,811.26906,1131.2463,1393.2707,1901.6491,2367.1166,2436.3558,4130.8604,4354.6412,3202.201,5703.4549,4564.4353,2408.4705,846.37452,1188.5032,1487.9095,1977.4891,2487.3099,2615.554,4244.8158,4547.1668,3457.7213,5864.7028,4807.4629,2658.0424,881.05028,1244.244,1580.3093,2049.3535,2600.6812,2787.7541,4343.4792,4718.3138,3697.2818,5997.7933,5018.8765,2892.6161,915.65093,1298.9908,1670.849,2118.0126,2708.2701,2953.298,4429.1821,4870.7549,3921.0254,6107.3119,5202.6389,3111.4668,950.46823,1353.1883,1759.9145,2184.0404,2810.9134,3112.59,4503.7178,5006.7051,4129.4061,6196.8307,5362.1212,3314.4914,985.74903,1407.2192,1847.883,2247.8636,2909.2793,3266.0439,4568.4838,5127.9988,4323.0422,6269.169,5500.1771,3501.9711,1021.7083,1461.4184,1935.1161,2309.7967,3003.8978,3414.0544,4624.584,5236.1608,4502.6271,6326.5842,5619.2236,3674.4163,1058.5386,1516.084,2021.9575,2370.0682,3095.185,3556.9806,4672.9036,5332.466,4668.8754,6370.9098,5721.3161,3832.4671,1096.4175,1571.4864,2108.7329,2428.8389,3183.4636,3695.1393,4714.1628,5417.9882,4822.492,6403.6566,5808.2125,3976.8283,1135.5124,1627.8755,2195.7522,2486.2161,3268.979,3828.8021,4748.9569,5493.6397,4964.1552,6426.0869,5881.4266,4108.2298,1175.9856,1685.487,2283.3119,2542.2638,3351.9128,3958.1954,4777.7855,5560.2031,5094.5087,6439.2704,5942.2717,4227.4007,1217.9968,1744.547,2371.6978,2597.0111,3432.3927,4083.5033,4801.075,5618.356,5214.1582,6444.1245,5991.8959,4335.0546,1261.7064,1805.2764,2461.1882,2650.4578,3510.5014,4204.8694,4819.1948,5668.6918,5323.6716,6441.4466,6031.3106,4431.8805,1307.2773,1867.894,2552.0564,2702.5801,3586.2837,4322.4006,4832.4706,5711.7351,5423.5809,6431.9368,6061.4134,4518.5378,1354.8775,1932.6201,2644.5739,2753.3338,3659.7521,4436.1701,4841.1935,5747.9548,5514.3844,6416.2167,6083.0063,4595.6549,1404.681,1999.6784,2739.0126,2802.6584,3730.8921,4546.221,4845.6278,5777.7743,5596.55,6394.8433,6096.8109,4663.8279,1456.8701,2069.299,2835.6478,2850.4794,3799.6662,4652.5697,4846.0164,5801.5797,5670.5178,6368.3199,6103.4804,4723.6217,1511.6365,2141.7199,2934.7602,2896.7111,3866.0178,4755.2088,4842.5854,5819.726,5736.7033,6337.1044,6103.6092,4775.5706,1569.1825,2217.1896,3036.6385,2941.2592,3929.8749,4854.1107,4835.5477,5832.5429,5795.5001,6301.6166,6097.7409,4820.1799,1629.7226,2295.9685,3141.5812,2984.0222,3991.1525,4949.2301,4825.1049,5840.3386,5847.2817,6262.2427,6086.3752,4857.9275,1693.4842,2378.3304,3249.8991,3024.8941,4049.7564,5040.5076,4811.4499,5843.4034,5892.404,6219.3405,6069.9728,4889.2649,1760.7095,2464.5648,3361.9171,3063.766,4105.5849,5127.8722,4794.7682,5842.0118,5931.2071,6173.2418,6048.9602,4914.6192,1831.6557,2554.9776,3477.9756,3100.528,4158.5323,5211.2443,4775.2388,5836.4254,5964.0165,6124.256,6023.7333,4934.3944,1906.5965,2649.8927,3598.4329,3135.0707,4208.4905,5290.5383,4753.0351,5826.8941,5991.1448,6072.6719,5994.6601,4948.9725,1985.8229,2749.6535,3723.6661,3167.2877,4255.3522,5365.6656,4728.3257,5813.6571,6012.8924,6018.7596,5962.0839,4958.7147,2069.6438,2854.6232,3854.073,3197.0763,4299.0122,5436.5368,4701.2743,5796.9445,6029.5484,5962.7721,5926.3252,4963.9631,2158.3862,2965.1864,3990.0725,3224.3396,4339.3701,5503.0641,4672.0403,5776.9778,6041.3915,5904.9465,5887.6835,4965.0409,2252.3963,3081.7485,4132.1057,3248.9882,4376.3321,5565.1643,4640.7787,5753.9704,6048.6907,5845.5053,5846.4389,4962.2542,2352.0386,3204.7369,4280.6362,3270.941,4409.8129,5622.7601,4607.6405,5728.128,6051.7054,5784.6569,5802.8536,4955.8923,2457.6958,3334.5994,4436.1498,3290.1268,4439.7369,5675.7829,4572.772,5699.6492,6050.686,5722.5968,5757.1733,4946.2286,2569.7676,3471.8041,4599.1535,3306.4855,4466.0406,5724.1743,4536.3156,5668.7254,6045.8742,5659.5085,5709.628,4933.522,2688.6693,3616.837,4770.1738,3319.969,4488.673,5767.8875,4498.409,5635.5414,6037.5032,5595.5634,5660.4328,4918.0167,2814.8291,3770.1992,4949.754,3330.5419,4507.5971,5806.8894,4459.1857,5600.2748,6025.7979,5530.9222,5609.7895,4899.9435,2948.6844,3932.4032,5138.4501,3338.1822,4522.7909,5841.1611,4418.7743,5563.0969,6010.9751,5465.7351,5557.8866,4879.5204,3090.6776,4103.9671,5336.8253,3342.8817,4534.2476,5870.6994,4377.2991,5524.1722,5993.2437,5400.1421,5504.9003,4856.9529,3241.2493,4285.408,5545.4423,3344.6464,4541.9765,5895.5168,4334.8793,5483.6589,5972.8046,5334.2739,5450.9956,4832.4349,3400.831,4477.2322,5764.8544,3343.4963,4546.0029,5915.6426,4291.6296,5441.7085,5949.8513,5268.2523,5396.3263,4806.1491,3569.8347,4679.9244,5995.5925,3339.4655,4546.3679,5931.1228,4247.6597,5398.4663,5924.5693,5202.1901,5341.0359,4778.2675,3748.6409,4893.9329,6238.1511,3332.6015,4543.1285,5942.0196,4203.0745,5354.071,5897.1368,5136.1923,5285.2582,4748.9522,3937.5838,5119.6529,6492.9689,3322.9653,4536.3566,5948.4118,4157.974,5308.6552,5867.7248,5070.356,5229.1176,4718.3553,4136.9334,5357.4053,6760.4076,3310.6299,4526.1388,5950.3935,4112.4534,5262.3453,5836.4969,5004.7708,5172.73,4686.62,4346.8746,5607.4126,7040.7255,3295.6801,4512.5752,5948.0738,4066.6029,5215.2616,5803.6094,4939.5197,5116.2027,4653.8808,4567.483,5869.7707,7334.0471,3278.2115,4495.7782,5941.5756,4020.5081,5167.5184,5769.2121,4874.6786,5059.6354,4620.2636,4798.6977,6144.4165,7640.3288,3258.329,4475.8719,5931.0343,3974.2499,5119.2242,5733.4477,4810.3174,5003.1204,4585.8867,5040.29,6431.0924,7959.3203,3236.146,4452.9903,5916.5972,3927.9044,5070.4816,5696.4523,4746.5,4946.743,4550.861,5291.8309,6729.3069,8290.5223,3211.7835,4427.2759,5898.4212,3881.5434,5021.3879,5658.3556,4683.2847,4890.5819,4515.29,5552.655,7038.2938,8633.1419,3185.368,4398.879,5876.6723,3835.2341,4972.0349,5619.2809,4620.7246,4834.7096,4479.2706,5821.8254,7356.9695,8986.0464,3157.0311,4367.9553,5851.5233,3789.0394,4922.5089,5579.3456,4558.8678,4779.1929,4442.8935,6098.0982,7683.8922,9347.7193,3126.9078,4334.6653,5823.153,3743.0183,4872.8915,5538.6609,4497.7577,4724.0929,4406.2431,6379.8914,8017.2249,9716.2186,3095.1354,4299.1724,5791.7443,3697.2256,4823.2592,5497.3324,4437.4333,4669.4657,4369.3983,6665.2594,8354.7051,10089.144,3061.8526,4261.6417,5757.483,3651.7121,4773.6836,5455.4604,4377.9294,4615.3624,4332.4325,6951.8767,8693.6254,10463.613,3027.1978,4222.2389,5720.556,3606.5252,4724.2322,5413.1395,4319.2773,4561.8297,4295.4139,7237.0353,9030.8298,10836.259,2991.3086,4181.1289,5681.1507,3561.7084,4674.9678,5370.4594,4261.5044,4508.9101,4258.4061,7517.6585,9362.7294,11203.242,2954.3207,4138.4746,5639.4531,3517.3021,4625.9491,5327.5047,4204.6348,4456.6418,4221.4679,7790.3349,9685.3411,11560.293,2916.3671,4094.4362,5595.6473,3473.3434,4577.231,5284.3556,4148.6895,4405.0596,4184.654,8051.376,9994.3545,11902.779,2877.577,4049.1701,5549.9138,3429.8661,4528.8643,5241.0874,4093.6866,4354.1945,4148.015,8296.897,10285.226,12225.81,2838.0758,4002.8281,5502.4294,3386.9014,4480.8965,5197.7712,4039.6414,4304.0745,4111.5974,8522.923,10553.302,12524.362,2797.9838,3955.5568,5453.3657,3344.4775,4433.3714,5154.474,3986.5668,4254.7244,4075.4445,8725.5153,10793.967,12793.441,2757.4164,3907.4973,5402.889,3302.6199,4386.3299,5111.2587,3934.4733,4206.166,4039.5959,8900.9142,11002.809,13028.261,2716.4833,3858.7841,5351.1593,3261.3521,4339.8095,5068.1846,3883.3692,4158.4188,4004.088,9045.6903,11175.798,13224.431,2675.2885,3809.5454,5298.3304,3220.6946,4293.8448,5025.3072,3833.2609,4111.4995,3968.9543,9156.8936,11309.461,13378.15,2633.9296,3759.9026,5244.549,3180.6664,4248.4679,4982.6786,3784.1529,4065.4226,3934.2252,9232.1911,11401.041,13486.378,2592.4986,3709.9699,5189.955,3141.2839,4203.708,4940.3476,3736.0479,4020.2004,3899.9286,9269.98,11448.634,13546.984,2551.081,3659.8549,5134.6809,3102.5619,4159.5919,4898.36,3688.9472,3975.8433,3866.0898,9269.4687,11451.28,13558.849,2509.7561,3609.6579,5078.8521,3064.5133,4116.1442,4856.7584,3642.8504,3932.3596,3832.7317,9230.7164,11409.015,13521.926,2468.5973,3559.4722,5022.5867,3027.1493,4073.3872,4815.5826,3597.756,3889.7561,3799.8747,9154.6296,11322.867,13437.233,2427.6719,3509.3844,4965.9956,2990.4796,4031.3413,4774.8698,3553.6612,3848.0377,3767.5372,9042.9148,11194.801,13306.804,2387.0414,3459.4743,4909.1829,2954.5122,3990.0247,4734.6545,3510.562,3807.2082,3735.7357,8897.9909,11027.615,13133.579,2346.7618,3409.8154,4852.2456,2919.2542,3949.4538,4694.9687,3468.4534,3767.2695,3704.4845,8722.8721,10824.812,12921.261,2306.8837,3360.4749,4795.2741,2884.711,3909.6435,4655.842,3427.3294,3728.2224,3673.7962,8521.0276,10590.426,12674.141,2267.4525,3311.514,4738.3526,2850.887,3870.607,4617.3019,3387.1833,3690.0666,3643.6816,8296.2319,10328.856,12396.912,2228.5086,3262.9884,4681.559,2817.7854,3832.3556,4579.3735,3348.0075,3652.8004,3614.1499,8052.4152,10044.687,12094.481,2190.0881,3214.9481,4624.9655,2785.4086,3794.8997,4542.0801,3309.7935,3616.4212,3585.2087,7793.5235,9742.5267,11771.79,2152.2226,3167.4384,4568.6385,2753.7578,3758.248,4505.4427,3272.5324,3580.9254,3556.8639,7523.3965,9426.8635,11433.665,2114.9396,3120.4998,4512.6395,2722.8334,3722.4079,4469.4807,3236.2145,3546.3082,3529.1203,7245.6657,9101.9458,11084.683,2078.2629,3074.1681,4457.0249,2692.6351,3687.3856,4434.2113,3200.8296,3512.5642,3501.9812,6963.6785,8771.693,10729.078,2042.2128,3028.4753,4401.8465,2663.1617,3653.1863,4399.6501,3166.3671,3479.6872,3475.4484,6680.4443,8439.6326,10370.665,2006.8064,2983.4494,4347.1518,2634.4113,3619.8138,4365.8112,3132.8158,3447.6699,3449.5227,6398.6048,8108.8636,10012.807,1972.0578,2939.1149,4292.9841,2606.3815,3587.2712,4332.7066,3100.164,3416.5046,3424.2034,6120.4227,7782.0439,9658.3946,1937.9784,2895.4931,4239.3833,2579.069,3555.5602,4300.3469,3068.3998,3386.1827,3399.4891,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0.0050164155,0.0078829387,0.011943846,0.0067928448,0.01067447,0.01617344,0.014239895,0.022376978,0.033904512,0.016972545,0.025372536,0.038191608,0.031993144,0.05027494,0.076174152,0.043322659,0.068078464,0.10314919,0.10038519,0.14701572,0.21663577,0.1138151,0.16302671,0.2436202,0.10760049,0.16908644,0.25619157,0.15327875,0.23223469,0.34712441,0.41734176,0.55093046,0.74647019,0.40524712,0.5531964,0.81952857,0.28152497,0.42065737,0.61230839,0.45919733,0.64186898,0.86918247,1.2548845,1.5033406,1.835951,1.0189811,1.3195366,1.9362486,0.71351308,1.0060216,1.3534322,1.2901923,1.6665012,2.0173637,3.2789074,3.5296681,3.8399807,2.1543748,2.6542158,3.8597744,2.0091736,2.6388666,3.2305865,3.8012868,4.5388746,4.887366,8.3340791,8.2401852,8.0436662,4.4817686,5.3266158,7.6937183,5.7218527,7.0883664,7.9446585,10.623547,12.079646,11.836415,19.898405,18.607937,16.704632,9.1010848,10.650376,15.334623,14.924468,17.944487,18.948964,26.80889,29.613326,27.333385,43.753507,39.806303,34.06856,18.074916,21.211604,30.561325,34.028499,40.698833,41.850422,58.964039,64.962019,58.455182,87.745939,80.009347,67.96522,35.057302,42.107087,60.903688,67.030059,81.904499,84.568154,113.16094,127.39897,115.44779,161.14046,151.73432,133.01553,67.037486,83.415258,121.3674,117.35801,148.92129,158.80856,196.12733,227.77021,214.16108,280.34487,275.73652,257.27583,128.46054,165.1752,241.85838,194.29449,254.11142,285.20262,327.85779,385.6679,383.14981,487.62854,493.21691,495.85844,250.87926,327.58434,481.98359,250.87288,318.3025,346.82155,452.80531,497.71191,465.60267,675.40487,599.02172,529.64688,304.89278,336.22158,482.24588,323.31722,392.2254,416.56073,629.58798,639.4687,562.65665,984.53613,757.915,575.10014,479.22701,367.73771,483.18407,411.98937,479.46048,494.89746,859.41792,822.94267,678.44673,1435.1558,1006.4926,641.78813,881.01414,480.52753,489.50461,508.08737,578.51837,582.37145,1115.1368,1045.3709,817.62889,1963.6737,1351.2927,744.43542,1467.3109,723.7346,516.8761,602.74292,683.84708,678.73144,1368.3198,1290.499,981.91198,2492.0977,1758.8539,893.5031,2115.9779,1079.9637,584.70475,691.51746,789.98256,782.32564,1603.9595,1541.2249,1168.0965,2975.9288,2187.0206,1087.7219,2738.084,1497.2147,701.29366,773.43184,893.58484,890.8325,1817.8689,1786.3202,1370.1425,3400.6645,2605.6537,1317.0982,3294.0871,1929.1255,861.83938,849.15403,993.26768,1002.1063,2011.1483,2020.3267,1581.8027,3767.213,2998.6738,1569.0913,3774.6594,2346.6528,1054.9346,919.88754,1088.8519,1114.5604,2186.7129,2241.4866,1797.9825,4082.1782,3359.6344,1832.4673,4183.9541,2735.1402,1268.3219,986.87473,1180.7631,1227.1956,2347.7057,2449.9773,2015.0272,4353.272,3687.4218,2098.5896,4530.6162,3088.893,1491.6127,1051.2221,1269.6742,1339.4866,2496.9164,2646.8283,2230.5251,4587.558,3983.4778,2361.3661,4823.8357,3407.0693,1716.9577,1113.864,1356.3211,1451.245,2636.6383,2833.345,2442.9892,4790.9629,4250.267,2616.7427,5071.8903,3691.1857,1938.8153,1175.5772,1441.4194,1562.5068,2768.6908,3010.8304,2651.5689,4968.2791,4490.5064,2862.1558,5281.7695,3943.7495,2153.4629,1237.0092,1525.6323,1673.4502,2894.4917,3180.4652,2855.8287,5123.3273,4706.8093,3096.0791,5459.2175,4167.5552,2358.5166,1298.707,1609.5632,1784.3408,3015.1344,3343.2672,3055.5917,5259.144,4901.5441,3317.6893,5608.9105,4365.3456,2552.5419,1361.1419,1693.76,1895.496,3131.4544,3500.0865,3250.8342,5378.1511,5076.7948,3526.6287,5734.6537,4539.6645,2734.7638,1424.7294,1778.7229,2007.2628,3244.084,3651.6171,3441.615,5482.2934,5234.3708,3722.8437,5839.5583,4692.8061,2904.8578,1489.8447,1864.9142,2120.0056,3353.4944,3798.4141,3628.0303,5573.1475,5375.8344,3906.4762,5926.1873,4826.8119,3062.8039,1556.8351,1952.7667,2234.0981,3460.028,3940.9113,3810.1846,5652.0056,5502.535,4077.7902,5996.6717,4943.4882,3208.7848,1626.0297,2042.6923,2349.9208,3563.924,4079.4379,3988.1722,5719.9399,5615.6416,4237.1243,6052.8013,5044.4313,3343.1161,1697.7467,2135.089,2467.8592,3665.3373,4214.2331,4162.0671,5777.8514,5716.1726,4384.86,6096.0953,5131.0545,3466.1974,1772.3001,2230.3473,2588.3049,3764.3538,4345.4586,4331.9159,5826.5078,5805.0222,4521.4014,6127.8563,5204.6137,3578.4798,1850.0047,2328.8555,2711.6568,3861.0024,4473.2096,4497.7354,5866.5724,5882.9812,4647.1621,6149.2133,5266.2291,3680.4427,1931.1802,2431.0049,2838.323,3955.2641,4597.5243,4659.5117,5898.6264,5950.7557,4762.557,6161.1543,5316.9056,3772.5785,2016.155,2537.1942,2968.7231,4047.0802,4718.3916,4817.2004,5923.1861,6008.9818,4867.9978,6164.5516,5357.5484,3855.3822,2105.2699,2647.833,3103.2911,4136.3589,4835.7584,4970.7279,5940.7166,6058.2378,4963.8894,6160.1825,5388.9779,3929.344,2198.8805,2763.3461,3242.4782,4222.9806,4949.5356,5119.994,5951.6417,6099.0542,5050.6289,6148.7447,5411.9404,3994.9448,2297.3604,2884.1762,3386.7551,4306.8031,5059.6041,5264.8739,5956.3528,6131.9218,5128.605,6130.8693,5427.1185,4052.653,2401.1035,3010.7877,3536.6153,4387.6658,5165.8197,5405.2217,5955.2144,6157.298,5198.1973,6107.1303,5435.1389,4102.9225,2510.5267,3143.6694,3692.5775,4465.3941,5268.0183,5540.8729,5948.5694,6175.6126,5259.7768,6078.0529,5436.5789,4146.1915,2626.0719,3283.3373,3855.1892,4539.8031,5366.02,5671.6481,5936.7429,6187.2713,5313.706,6044.12,5431.9727,4182.882,2748.2084,3430.3375,4025.0284,4610.7011,5459.6339,5797.3565,5920.0449,6192.6599,5360.3391,6005.7773,5421.8152,4213.3993,2877.4349,3585.2486,4202.7071,4677.8934,5548.6621,5917.7994,5898.7727,6192.1463,5400.0221,5963.4374,5406.5667,4238.1321,3014.2811,3748.6839,4388.8734,4741.1853,5632.9037,6032.7738,5873.2125,6186.0827,5433.0933,5917.4834,5386.656,4257.4525,3159.3099,3921.2939,4584.214,4800.3857,5712.159,6142.0761,5843.6402,6174.8075,5459.8833,5868.2719,5362.4832,4271.7164,3313.1182,4103.7674,4789.4556,4855.31,5786.2328,6245.506,5810.323,6158.6465,5480.715,5816.1353,5334.4218,4281.2636,3476.3382,4296.8334,5005.3673,4905.7833,5854.9385,6342.8695,5773.5195,6137.9134,5495.9037,5761.3837,5302.8215,4286.4184,3649.6378,4501.2615,5232.7609,4951.6427,5918.101,6433.9829,5733.4801,6112.9111,5505.7569,5704.3066,5268.0092,4287.4898,3833.7205,4717.8621,5472.4914,4992.7405,5975.5603,6518.6759,5690.4473,6083.9317,5510.5744,5645.1748,5230.2913,4284.7719,4029.3246,4947.4853,5725.4567,5028.9464,6027.174,6596.7948,5644.6562,6051.2573,5510.6484,5584.241,5189.9544,4278.5444,4237.2213,5191.0192,5992.5949,5060.1493,6072.8202,6668.2051,5596.3338,6015.1599,5506.2628,5521.7414,5147.267,4269.0733,4458.2113,5449.386,6274.8819,5086.2597,6112.3998,6732.7944,5545.6995,5975.9017,5497.6935,5457.8966,5102.4805,4256.6108,4693.1203,5723.5372,6573.3255,5107.2108,6145.8382,6790.4742,5492.9652,5933.7352,5485.208,5392.9124,5055.83,4241.396,4942.7921,6014.4459,6888.9585,5122.96,6173.0871,6841.1822,5438.3346,5888.9033,5469.0656,5326.9808,5007.5356,4223.6556,5208.0799,6323.0967,7222.8282,5133.4895,6194.1253,6884.8834,5382.0037,5841.6395,5449.5169,5260.2804,4957.8028,4203.6039,5489.8346,6650.4723,7575.9827,5138.807,6208.9601,6921.5714,5324.1605,5792.1674,5426.8037,5192.9775,4906.8234,4181.4435,5788.8894,6997.5369,7949.4538,5138.9457,6217.6267,6951.2687,5264.9849,5740.7014,5401.1594,5125.2266,4854.7767,4157.3657,6106.0412,7365.2143,8344.2349,5133.9643,6220.189,6974.0272,5204.649,5687.4465,5372.8084,5057.1709,4801.8294,4131.5508,6442.0274,7754.3614,8761.2533,5123.9462,6216.7385,6989.9276,5143.3165,5632.5981,5341.9661,4988.943,4748.1369,4104.1688,6797.4973,8165.7364,9201.3369,5108.9985,6207.3938,6999.0792,5081.1433,5576.3425,5308.8392,4920.6656,4693.8435,4075.3796,7172.9786,8599.9594,9665.1741,5089.2511,6192.299,7001.6183,5018.2773,5518.8567,5273.6256,4852.4518,4639.0833,4045.3334,7568.8374,9057.4676,10153.266,5064.8552,6171.6225,6997.7073,4954.8584,5460.3088,5236.5143,4784.4055,4583.9804,4014.1714,7985.2318,9538.4618,10665.872,5035.9814,6145.5549,6987.5329,4891.0186,5400.8578,5197.6857,4716.6225,4528.6499,3982.0259,8422.0599,10042.847,11202.946,5002.8178,6114.3073,6971.3038,4826.8825,5340.654,5157.3114,4649.1901,4473.198,3949.0207,8878.9008,10570.164,11764.066,4965.5679,6078.1085,6949.2489,4762.567,5279.8394,5115.5547,4582.1885,4417.7226,3915.2718,9354.9512,11119.518,12348.356,4924.4489,6037.2031,6921.615,4698.1815,5218.5472,5072.5705,4515.6903,4362.314,3880.8874,9848.9582,11689.499,12954.408,4879.6888,5991.8486,6888.6637,4633.8283,5156.903,5028.5057,4449.7617,4307.0549,3845.9687,10359.15,12278.106,13580.193,4831.5244,5942.3133,6850.6695,4569.603,5095.0241,4983.499,4384.4625,4252.0213,3810.6097,10883.171,12882.665,14222.982,4780.199,5888.8734,6807.917,4505.5941,5033.0205,4937.6815,4319.8465,4197.2825,3774.8982,11418.018,13499.765,14879.271,4725.9606,5831.8108,6760.6984,4441.8838,4970.9945,4891.1768,4255.962,4142.902,3738.9156,11959.994,14125.197,15544.718,4669.0589,5771.4104,6709.3107,4378.548,4909.0418,4844.1012,4192.852,4088.9373,3702.7374,12504.678,14753.916,16214.104,4609.7441,5707.9581,6654.0537,4315.6566,4847.2508,4796.564,4130.5548,4035.4405,3666.4337,13046.916,15380.039,16881.317,4548.2646,5641.7384,6595.2274,4253.2737,4785.7038,4748.6677,4069.104,3982.459,3630.0693,13580.848,15996.867,17539.385,4484.8653,5573.0327,6533.1304,4191.4579,4724.4765,4700.5082,4008.5292,3930.035,3593.704,14099.975,16596.963,18180.544,4419.7861,5502.1171,6468.0572,4130.2628,4663.6391,4652.1754,3948.8557,3878.2068,3557.3931,14597.264,17172.27,18796.366,4353.2607,5429.2613,6400.2971,4069.7367,4603.2557,4603.7528,3890.1055,3827.0082,3521.1871,15065.306,17714.293,19377.94,4285.5148,5354.7268,6330.1323,4009.9235,4543.3854,4555.3186,3832.2969,3776.4694,3485.1329,15496.513,18214.322,19916.111,4216.7658,5278.7657,6257.8366,3950.8626,4484.0819,4506.9454,3775.4453,3726.6169,3449.2731,15883.365,18663.715,20401.766,4147.2213,5201.62,6183.6744,3892.5891,4425.3944,4458.7003,3719.5631,3677.4739,3413.6466,16218.677,19054.203,20826.163,4077.0788,5123.5204,6107.8996,3835.1341,4367.3673,4410.6458,3664.66,3629.0607,3378.2893,16495.892,19378.228,21181.275,4006.5253,5044.6859,6030.7547,3778.5254,4310.0408,4362.8397,3610.7431,3581.3944,3343.2333,16709.361,19629.264,21460.139,3935.7363,4965.3235,5952.4706,3722.7868,4253.4512,4315.335,3557.8175,3534.4898,3308.508,16854.612,19802.125,21657.174,3864.8765,4885.6275,5873.266,3667.9392,4197.6308,4268.1809,3505.886,3488.3589,3274.1397,16928.562,19893.212,21768.452,3794.0987,4805.7796,5793.3468,3614.0005,4142.6085,4221.4222,3454.9495,3443.0117,3240.1524,16929.672,19900.695,21791.887,3723.5448,4725.9489,5712.9067,3560.9855,4088.4098,4175.1001,3405.0073,3398.456,3206.5672,16858.03,19824.604,21727.341,3653.3451,4646.292,5632.1265,3508.9067,4035.0571,4129.2522,3356.0567,3354.6975,3173.403,16715.337,19666.822,21576.622,3583.6191,4566.953,5551.1747,3457.7739,3982.5698,4083.9128,3308.0941,3311.7403,3140.6765,16504.823,19430.988,21343.387,3514.4755,4488.0643,5470.2076,3407.5949,3930.9648,4039.1129,3261.114,3269.5868,3108.4023,16231.08,19122.309,21032.951,3446.0127,4409.7462,5389.3694,3358.3752,3880.2563,3994.8805,3215.1102,3228.2377,3076.593,15899.838,18747.303,20652.023,3378.319,4332.1081,5308.793,3310.1185,3830.4562,3951.2408,3170.075,3187.6927,3045.2594,15517.697,18313.495,20208.39,3311.4734,4255.2485,5228.5998,3262.8266,3781.5741,3908.2165,3126,3147.9498,3014.4108,15091.846,17829.093,19710.576,3245.5456,4179.2558,5148.901,3216.4999,3733.6178,3865.8273,3082.8757,3109.0059,2984.0546,14629.771,17302.659,19167.501,3180.5971,4104.2085,5069.7971,3171.1371,3686.593,3824.0912,3040.6919,3070.857,2954.1968,14138.994,16742.802,18588.156,3116.681,4030.1762,4991.3795,3126.7356,3640.5037,3783.0234,2999.4378,3033.498,2924.8421,13626.836,16157.91,17981.323,3053.8431,3957.2197,4913.7302,3083.2916,3595.3524,3742.6373,2959.1017,2996.9228,2895.9937,13100.225,15555.927,17355.337,2992.1223,3885.392,4836.9226,3040.8001,3551.1398,3702.9442,2919.6715,2961.1246,2867.6536,12565.547,14944.187,16717.905,2931.5507,3814.7383,4761.0224,2999.255,3507.8655,3663.9537,2881.1346,2926.0957,2839.8229,12028.547,14329.287,16075.984,2872.1548,3745.2974,4686.0875,2958.6494,3465.5278,3625.6734,2843.4779,2891.8277,2812.5011,11494.268,13717.03,15435.698,2813.9552,3677.1013,4612.1691,2918.9754,3424.1235,3588.1094,2806.688,2858.3118,2785.6871,10967.033,13112.391,14802.317,2756.9678,3610.1763,4539.3119,2880.2244,3383.6486,3551.2662,2770.7511,2825.5383,2759.3786,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0.0050164155,0.0078829387,0.011943846,0.0067928448,0.01067447,0.01617344,0.014239895,0.022376978,0.033904512,0.016058176,0.025204902,0.038187297,0.031993144,0.05027494,0.076174152,0.043322659,0.068078464,0.10314919,0.09358838,0.1436215,0.21628847,0.10252437,0.16075824,0.24354684,0.10760046,0.16908644,0.25619157,0.15000067,0.23074205,0.34701841,0.33681103,0.49496982,0.72991702,0.3452622,0.54070528,0.81910562,0.2742656,0.41484729,0.61004065,0.41709891,0.59913935,0.84443762,0.87503174,1.212418,1.7342636,0.81681715,1.2773024,1.9348163,0.6635854,0.95057308,1.3068628,1.0654462,1.4187912,1.8262805,1.969196,2.5293178,3.4816185,1.6305037,2.5458856,3.856145,1.7730174,2.3605693,2.9694156,2.8974998,3.5303773,4.0756148,4.4294723,5.2960415,6.9933511,3.2536901,5.0743021,7.6854078,4.8246665,6.0500056,6.9492382,7.7109054,8.7961366,9.1773086,9.7561429,11.018654,14.031843,6.4883075,10.113492,15.317236,12.308672,14.871568,15.986275,18.86617,20.731744,20.177859,20.601057,22.536387,28.074516,12.929144,20.156343,30.52768,27.757342,33.266899,34.678761,41.070102,44.746633,42.238399,41.169793,45.049954,55.96478,25.747645,40.170832,60.842515,54.681708,66.861729,69.987759,79.031097,87.9432,83.727349,78.078817,88.120471,111.20644,51.257199,80.057641,121.26082,96.815516,122.72337,133.04048,139.49326,160.20846,159.06746,144.38767,169.9891,220.56576,102.05817,159.54894,241.67616,164.10675,213.75886,244.27547,240.99028,280.86827,295.61189,269.34238,327.25591,437.29408,203.32595,317.97404,481.6673,209.35027,261.59278,287.36939,325.0094,347.43628,338.11744,326.9147,350.44001,442.11018,204.5363,318.04254,481.66783,268.6755,317.1016,335.82254,447.07574,432.85948,388.09044,426.53021,386.14711,448.62384,210.69483,318.39456,481.67013,348.29311,384.9011,390.46525,624.69604,548.81736,448.44873,608.42449,449.35843,458.57994,252.90358,322.99087,481.74472,449.77334,468.7324,452.5683,864.86953,706.91068,523.61626,909.71848,566.57595,476.60976,400.27406,353.06444,483.11272,567.69582,569.42565,523.9325,1153.4684,911.41529,619.40387,1319.6397,759.59123,512.06456,685.68546,443.13081,491.55296,693.60628,683.91519,605.80864,1465.6332,1154.9129,740.32541,1790.3392,1025.9773,575.67066,1076.3324,609.50348,517.5368,820.79641,807.39833,698.16575,1780.5653,1423.8353,887.27279,2274.2778,1344.561,673.44275,1517.1873,841.72504,570.11103,945.58237,935.602,799.88497,2086.0803,1705.2611,1057.7152,2740.5335,1690.4586,804.73472,1964.0813,1116.9559,652.4195,1066.5978,1065.6384,909.38323,2376.8656,1989.8138,1247.3369,3173.7149,2043.6131,964.31284,2390.5767,1412.8444,762.11862,1183.8142,1195.9223,1025.119,2651.667,2271.7046,1451.5161,3568.3768,2390.5678,1145.1501,2783.8884,1712.5225,893.86641,1297.8477,1325.8022,1145.8409,2911.2286,2547.8028,1666.1327,3924.3734,2723.324,1340.2985,3139.5334,2004.8956,1041.4864,1409.5671,1455.215,1270.6506,3157.0973,2816.6842,1887.8448,4243.9883,3037.6515,1543.7544,3457.4588,2283.3553,1199.2005,1519.8975,1584.4378,1398.9754,3391.0109,3077.9239,2114.0804,4530.3876,3331.691,1750.6919,3739.7164,2544.3635,1362.1341,1629.7344,1713.9329,1530.5096,3614.6149,3331.6367,2342.9168,4786.8593,3604.986,1957.395,3989.193,2786.3441,1526.413,1739.9127,1844.2553,1665.1549,3829.351,3578.1962,2572.9372,5016.4774,3857.8656,2161.0799,4208.9613,3008.9183,1689.0751,1851.2019,1976.0017,1802.97,4036.4268,3818.0719,2803.1001,5221.9792,4091.0703,2359.7039,4401.974,3212.4084,1847.9203,1964.3132,2109.7845,1944.1317,4236.8235,4051.7375,3032.6335,5405.7453,4305.5304,2551.795,4570.9354,3397.5271,2001.3575,2079.9102,2246.2193,2088.9067,4431.3168,4279.6224,3260.9533,5569.8242,4502.2409,2736.3138,4718.2645,3565.1869,2148.2691,2198.6212,2385.9209,2237.6317,4620.5035,4502.0877,3487.6025,5715.9732,4682.1928,2912.5458,4846.1007,3716.3864,2287.9005,2321.0499,2529.5041,2390.6996,4804.8256,4719.4167,3712.2069,5845.7025,4846.3372,3080.0208,4956.328,3852.1426,2419.7731,2447.7857,2677.5861,2548.5512,4984.5926,4931.8127,3934.4427,5960.3158,4995.5704,3238.4511,5050.6052,3973.4537,2543.6165,2579.4128,2830.7912,2711.6695,5160.0011,5139.402,4154.0137,6060.9468,5130.7282,3387.6869,5130.3965,4081.2783,2659.3174,2716.518,2989.7552,2880.5769,5331.1513,5342.2381,4370.6353,6148.5896,5252.5875,3527.6821,5196.9995,4176.5255,2766.8802,2859.6977,3155.1303,3055.8345,5498.0607,5540.3078,4584.023,6224.1238,5361.8703,3658.4699,5251.5694,4260.0517,2866.3972,3009.5643,3327.5904,3238.0422,5660.6764,5733.5376,4793.8853,6288.3358,5459.2488,3780.144,5295.1405,4332.6603,2958.0259,3166.752,3507.836,3427.84,5818.8855,5921.7996,4999.9192,6341.9357,5545.3516,3892.8446,5328.6434,4395.1035,3041.9719,3331.9217,3696.5989,3625.9104,5972.5243,6104.9186,5201.8076,6385.5709,5620.7686,3996.7483,5352.9202,4448.0854,3118.4756,3505.7668,3894.6476,3832.9806,6121.3868,6282.6779,5399.2187,6419.8372,5686.0563,4092.0597,5368.7364,4492.2652,3187.802,3689.0169,4102.7911,4049.8258,6265.2321,6454.826,5591.8067,6445.2881,5741.7423,4179.0058,5376.7913,4528.2603,3250.2332,3882.443,4321.8847,4277.2724,6403.7913,6621.0823,5779.2127,6462.4413,5788.3288,4257.8307,5377.7266,4556.6498,3306.0618,4086.8614,4552.8334,4516.2017,6536.7745,6781.1437,5961.068,6471.7852,5826.296,4328.7923,5372.1331,4577.9771,3355.5869,4303.1377,4796.5972,4767.5534,6663.8769,6934.6907,6136.9965,6473.7825,5856.1044,4392.1589,5360.5564,4592.7526,3399.1097,4532.1909,5054.1946,5032.329,6784.785,7081.3928,6306.6183,6468.8745,5878.1974,4448.2069,5343.5025,4601.4566,3436.9311,4774.9963,5326.7067,5311.5956,6899.1824,7220.9154,6469.5541,6457.4834,5893.0026,4497.2187,5321.4411,4604.5408,3469.3495,5032.5894,5615.2808,5606.489,7006.7555,7352.9249,6625.429,6440.0143,5900.9332,4539.4806,5294.8094,4602.4305,3496.6587,5306.0677,5921.1333,5918.2167,7107.199,7477.0949,6773.877,6416.8572,5902.3891,4575.2816,5264.0148,4595.5264,3519.1465,5596.593,6245.5517,6248.0599,7200.2213,7593.1114,6914.5457,6388.388,5897.7575,4604.9118,5229.4378,4584.206,3537.0942,5905.3927,6589.8962,6597.3749,7285.5491,7700.6785,7047.1007,6354.9692,5887.4134,4628.6612,5191.4336,4568.8249,3550.7748,6233.759,6955.5998,6967.5937,7362.9319,7799.5229,7171.2301,6316.9509,5871.7203,4646.8183,5150.3344,4549.7183,3560.4534,6583.0483,7344.1665,7360.2224,7432.1471,7889.3991,7286.6486,6274.6706,5851.03,4659.6695,5106.4505,4527.2019,3566.3859,6954.6771,7757.1684,7776.8384,7493.0026,7970.0934,7393.1014,6228.4542,5825.6828,4667.4981,5060.0723,4501.5729,3568.8192,7350.1167,8196.2392,8219.0845,7545.3412,8041.4273,7490.3683,6178.6158,5796.0079,4670.5831,5011.4711,4473.1109,3567.9906,7770.885,8663.0654,8688.6607,7589.0427,8103.2614,7578.2662,6125.4577,5762.3229,4669.1985,4960.9006,4442.0792,3564.1277,8218.5341,9159.3735,9187.3116,7624.0265,8155.4975,7656.6521,6069.2705,5724.9341,4663.6132,4908.5977,4408.7249,3557.4489,8694.6347,9686.9124,9716.8098,7650.2532,8198.0806,7725.4255,6010.3336,5684.1365,4654.0896,4854.7833,4373.2804,3548.1625,9200.7543,10247.43,10278.933,7667.7256,8231.0005,7784.5292,5948.9144,5640.2135,4640.8833,4799.6638,4335.9636,3536.4674,9738.431,10842.646,10875.437,7676.4892,8254.2925,7833.9512,5885.2689,5593.4371,4624.243,4743.431,4296.9786,3522.553,10309.138,11474.209,11508.015,7676.6317,8268.037,7873.7243,5819.6415,5544.0679,4604.4096,4686.2638,4256.5169,3506.5995,10914.244,12143.658,12178.259,7668.2827,8272.3594,7903.926,5752.2654,5492.3547,4581.616,4628.3283,4214.7571,3488.7778,11554.959,12852.358,12887.596,7651.6121,8267.4284,7924.6779,5683.3619,5438.5352,4556.0872,4569.7785,4171.8666,3469.2498,12232.273,13601.441,13637.228,7626.8282,8253.4546,7936.1438,5613.1415,5382.8356,4528.0393,4510.7573,4128.0012,3448.169,12946.887,14391.718,14428.051,7594.1754,8230.688,7938.5279,5541.8031,5325.4711,4497.6801,4451.3968,4083.3063,3425.6801,13699.127,15223.593,15260.563,7553.9314,8199.4147,7932.0726,5469.5349,5266.6453,4465.2086,4391.8192,4037.917,3401.9198,14488.846,16096.954,16134.756,7506.4041,8159.9548,7917.0549,5396.5141,5206.5514,4430.8152,4332.1369,3991.9589,3377.0169,15315.323,17011.058,17050.004,7451.9282,8112.6576,7893.7842,5322.9075,5145.3715,4394.6813,4272.4535,3945.5486,3351.0924,16177.141,17964.399,18004.932,7390.8615,8057.8988,7862.5976,5248.8713,5083.2774,4356.9796,4212.8638,3898.7941,3324.2602,17072.07,18954.577,18997.276,7323.5813,7996.0761,7823.8574,5174.5519,5020.4305,4317.8744,4153.4551,3851.7951,3296.6269,17996.935,19978.153,20023.748,7250.4808,7927.6052,7777.9463,5100.0858,4956.9824,4277.5211,4094.3067,3804.6438,3268.2924,18947.501,21030.517,21079.893,7171.9646,7852.9161,7725.2642,5025.6,4893.0748,4236.0671,4035.4912,3757.4251,3239.3504,19918.357,22105.764,22159.965,7088.4458,7772.4487,7666.2238,4951.2124,4828.8402,4193.6514,3977.0742,3710.2169,3209.888,20902.825,23196.59,23256.822,7000.3418,7686.6489,7601.2471,4877.0322,4764.402,4150.4048,3919.1154,3663.0908,3179.9868,21892.908,24294.228,24361.851,6908.071,7595.9654,7530.7618,4803.1601,4699.875,4106.4505,3861.6685,3616.1125,3149.7224,22879.272,25388.431,25464.955,6812.0499,7500.8457,7455.1977,4729.6886,4635.3654,4061.9042,3804.7817,3569.3416,3119.1654,23851.292,26467.52,26554.584,6712.6898,7401.7331,7374.9833,4656.7026,4570.9716,4016.8741,3748.4983,3522.8327,3088.3813,24797.17,27518.507,27617.859,6610.3941,7299.0637,7290.543,4584.2797,4506.7843,3971.4614,3692.8565,3476.6352,3057.4305,25704.128,28527.309,28640.778,6505.5561,7193.2638,7202.2943,4512.4904,4442.8869,3925.7605,3637.8905,3430.794,3026.3692,26558.69,29479.054,29608.513,6398.5566,7084.7474,7110.6454,4441.3986,4379.3559,3879.8593,3583.6301,3385.3493,2995.2492,27347.044,30358.482,30505.803,6289.7624,6973.9145,7015.9927,4371.0619,4316.261,3833.8394,3530.1012,3340.3374,2964.118,28055.483,31150.424,31317.438,6179.5246,6861.1489,6918.7197,4301.532,4253.6659,3787.7764,3477.3263,3295.7907,2933.0197,28670.896,31840.352,32028.793,6068.1775,6746.8173,6819.1946,4232.8551,4191.6283,3741.7404,3425.3246,3251.7381,2901.9945,29181.297,32414.952,32626.411,5956.0377,6631.268,6717.7696,4165.0719,4130.2003,3695.7957,3374.1121,3208.2051,2871.0791,29576.342,32862.709,33098.584,5843.403,6514.8301,6614.7798,4098.2185,4069.4288,3650.0017,3323.702,3165.214,2840.3072,29847.812,33174.429,33435.882,5730.5527,6397.8129,6510.5423,4032.3261,4009.3557,3604.4129,3274.1052,3122.7845,2809.7094,29990.006,33343.692,33631.611,5617.7467,6280.5057,6405.356,3967.4218,3950.0184,3559.0792,3225.3296,3080.9332,2779.3134,30000.03,33367.161,33682.133,5505.226,6163.1776,6299.5012,3903.5285,3891.4498,3514.0459,3177.3815,3039.6747,2749.1445,29877.941,33244.753,33587.05,5393.2125,6046.0779,6193.2393,3840.6656,3833.6787,3469.3544,3130.2649,2999.0209,2719.225,29626.738,32979.636,33349.206,5281.9097,5929.4358,6086.8135,3778.8487,3776.7304,3425.042,3083.9817,2958.9818,2689.5754,29252.2,32578.053,32974.53,5171.5027,5813.4616,5980.4484,3718.0906,3720.6262,3381.1426,3038.5325,2919.5653,2660.2136,28762.595,32049.002,32471.723,5062.1591,5698.3463,5874.3508,3658.4007,3665.3846,3337.6862,2993.9162,2880.7775,2631.1556,28168.27,31403.795,31851.825,4954.0296,5584.2633,5768.7102,3599.7859,3611.0207,3294.7,2950.1301,2842.6229,2602.4156,27481.17,30655.522,31127.69,4847.2488,5471.3683,5663.6992,3542.2506,3557.5469,3252.2079,2907.1705,2805.1044,2574.0057,26714.318,29818.484,30313.422,4741.9356,5359.8005,5559.4744,3485.7967,3504.973,3210.2311,2865.0322,2768.2234,2545.9364,25881.298,28907.62,29423.803,4638.1946,5249.6833,5456.1768,3430.4242,3453.3062,3168.7879,2823.7093,2731.9801,2518.2168,24995.768,27937.97,28473.759,4536.1165,5141.1254,5353.933,3376.1308,3402.5516,3127.8944,2783.1947,2696.3734,2490.8544,24071.033,26924.202,27477.885,4435.7791,5034.2214,5252.8557,3322.9128,3352.7122,3087.564,2743.4803,2661.4012,2463.8552,23119.693,25880.224,26450.049,4337.2482,4929.0526,5153.0444,3270.7646,3303.7891,3047.8081,2704.5576,2627.0603,2437.2241,22153.375,24818.878,25403.091,4240.5785,4825.6885,5054.5867,3219.6793,3255.7816,3008.6363,2666.4171,2593.3465,2410.9646,21182.541,23751.739,24348.606,4145.8143,4724.187,4957.5586,3169.6485,3208.6874,2970.0558,2629.0488,2560.255,2385.0792,20216.387,22688.987,23296.822,4052.9904,4624.5958,4862.0254,3120.6628,3162.5027,2932.0723,2592.442,2527.7799,2359.5693,19262.798,21639.365,22256.544,3962.1329,4526.9526,4768.0429,3072.7116,3117.2225,2894.6899,2556.5858,2495.9148,2334.4353,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0.0050164155,0.0078829387,0.011943846,0.0067928448,0.01067447,0.01617344,0.014239895,0.022376978,0.033904512,0.01603867,0.025203611,0.038187289,0.031993144,0.05027494,0.076174152,0.043322659,0.068078464,0.10314919,0.091050315,0.14275394,0.21623355,0.10228971,0.16074082,0.24354669,0.10760046,0.16908644,0.25619157,0.14725495,0.22952698,0.34694036,0.30801322,0.48065602,0.72729248,0.34402454,0.54060916,0.81910477,0.26584647,0.40774429,0.60743436,0.37378908,0.56034842,0.82575961,0.73460687,1.1373337,1.7181391,0.81262348,1.2769769,1.9348135,0.60135024,0.88027454,1.2532325,0.84300997,1.1929835,1.6819708,1.4825604,2.2718158,3.4247878,1.6195826,2.545051,3.8561378,1.4649864,2.0079157,2.6685409,1.9904446,2.6140733,3.4624046,2.9962969,4.5393557,6.8267538,3.2278755,5.0723583,7.6853912,3.6945771,4.7384489,5.801865,4.7712064,5.8032074,7.1676611,6.0500961,9.0681429,13.607738,6.4332485,10.109353,15.317201,8.9833814,10.979783,12.568132,10.943626,12.650171,14.765158,12.155723,18.099163,27.122738,12.821644,20.148225,30.527613,19.843128,23.879953,26.389725,23.217711,26.375084,29.950714,24.234645,36.078127,54.056698,25.553889,40.15598,60.842393,39.1983,47.940787,53.080432,45.155362,52.176034,59.617387,47.969939,71.829657,107.73036,50.929595,80.031999,121.2606,71.140084,89.974844,102.99004,83.032818,99.069267,116.95885,94.725846,142.9102,214.68966,101.50408,159.50603,241.6758,125.75845,163.28584,196.05072,151.99926,185.24839,227.9916,187.47798,284.33773,427.84032,202.30047,317.9,481.66667,155.36052,190.6788,217.2994,190.11029,209.13732,239.35372,192.84566,285.4617,427.93892,202.30106,317.90001,481.66667,194.46185,222.60811,240.98878,245.78352,240.07565,252.67859,202.19791,287.21635,428.07288,202.30491,317.90004,481.66667,247.77891,262.17868,267.83852,328.17701,282.71043,268.96586,220.35775,290.42434,428.28285,202.49776,317.90417,481.66667,319.44233,312.25889,298.66676,448.18217,342.71486,289.60718,260.05289,297.54289,428.69762,206.51696,318.16315,481.66937,412.61383,375.86679,334.74418,616.73235,427.56081,316.82083,345.15315,315.73609,429.85645,231.06337,321.3664,481.76537,527.41572,455.44549,377.67743,837.5855,544.82435,353.85492,496.75757,357.81572,433.59952,301.78659,336.25586,482.69055,660.4994,551.77853,429.14054,1104.0361,698.47329,404.64386,717.43723,435.9195,443.74262,433.01,374.89325,486.74762,806.94152,663.76289,490.46022,1403.4,887.15532,472.72372,993.32009,554.85803,465.14218,620.72752,445.35184,497.65996,962.1947,789.16718,562.33622,1722.7506,1105.6829,560.23211,1304.6489,711.64334,501.85338,850.2073,548.6054,519.15416,1122.9488,925.53834,644.85041,2051.8545,1347.4603,667.64633,1633.3072,898.77704,555.9878,1104.6954,680.24346,553.67238,1287.1754,1070.7605,737.6596,2383.6822,1606.1881,794.11747,1965.5589,1107.5055,627.65292,1369.953,833.43072,601.97673,1453.854,1223.2588,840.21693,2713.8513,1876.6181,937.99073,2292.0634,1329.7245,715.48206,1635.4738,1001.0707,663.42169,1622.6617,1381.9969,951.94109,3039.854,2154.6935,1097.2531,2606.9443,1558.7302,817.26366,1894.1553,1176.8977,736.45302,1793.7262,1546.3928,1072.3193,3360.3968,2437.4102,1269.8324,2906.7719,1789.3191,930.44065,2141.5187,1355.8386,819.06524,1967.4544,1716.2187,1200.9584,3674.9236,2722.5938,1453.7635,3189.7418,2017.6099,1052.4362,2374.9481,1533.9991,909.1293,2144.4223,1891.5136,1337.6032,3983.297,3008.6841,1647.2626,3455.0866,2240.7861,1180.8363,2593.0889,1708.4998,1004.5937,2325.3078,2072.5146,1482.1359,4285.5954,3294.5564,1848.7474,3702.68,2456.8497,1313.4764,2795.4141,1877.278,1103.5911,2510.8515,2259.6075,1634.5688,4581.9877,3579.3847,2056.8269,3932.7789,2664.4162,1448.4677,2981.9254,2038.9029,1204.4836,2701.8354,2453.292,1795.0324,4872.6578,3862.5407,2270.2786,4145.8599,2862.5541,1584.1931,3152.9535,2192.423,1305.8709,2899.0731,2654.1586,1963.7645,5157.7612,4143.5215,2488.0216,4342.517,3050.6644,1719.2861,3309.0263,2337.2449,1406.5799,3103.4054,2862.8739,2141.101,5437.401,4421.8987,2709.0889,4523.3994,3228.3913,1852.6036,3450.7838,2473.0411,1505.643,3315.7018,3080.1715,2327.4679,5711.6158,4697.282,2932.6039,4689.1737,3395.5574,1983.1979,3578.9222,2599.6798,1602.2751,3536.8626,3306.8471,2523.3755,5980.3753,4969.2957,3157.759,4840.5034,3552.1167,2110.2904,3694.1597,2717.1732,1695.8491,3767.8237,3543.7575,2729.4153,6243.5805,5237.5615,3383.7987,4978.0362,3698.1199,2233.2478,3797.214,2825.6383,1785.8731,4009.5618,3791.8205,2946.2568,6501.0665,5501.6885,3610.0056,5102.3991,3833.6899,2351.5609,3888.7893,2925.268,1871.9707,4263.1003,4052.0174,3174.6477,6752.6067,5761.2668,3835.6891,5214.1961,3959.0034,2464.8273,3969.5681,3016.3096,1953.8629,4529.515,4325.3958,3415.4138,6997.919,6015.8645,4060.178,5314.0083,4074.2782,2572.7359,4040.2072,3099.0489,2031.3527,4809.9409,4613.0741,3669.4608,7236.6715,6265.0268,4282.8137,5402.3946,4179.7626,2675.054,4101.3354,3173.7976,2104.3123,5105.5781,4916.2457,3937.7765,7468.4898,6508.2773,4502.9468,5479.8938,4275.7288,2771.6162,4153.5527,3240.8846,2172.6711,5417.6982,5236.1844,4221.4334,7692.9637,6745.1205,4719.935,5547.0258,4362.467,2862.3155,4197.4308,3300.6489,2236.4069,5747.6509,5574.2497,4521.5929,7909.6546,6975.0451,4933.1417,5604.2938,4440.2813,2947.0949,4233.5133,3353.4344,2295.5372,6096.8699,5931.8922,4839.5086,8118.1031,7197.5291,5141.9372,5652.1853,4509.486,3025.9408,4262.3169,3399.5861,2350.1126,6466.8789,6310.659,5176.5305,8317.8364,7412.0441,5345.7,5691.1736,4570.4036,3098.877,4284.3326,3439.4466,2400.2105,6859.2974,6712.1993,5534.1093,8508.3761,7618.0619,5543.819,5721.7188,4623.3617,3165.9598,4300.0261,3473.3542,2445.9304,7275.8454,7138.2689,5913.8,8689.2457,7815.0596,5735.6968,5744.2687,4668.6918,3227.2729,4309.8399,3501.641,2487.3895,7718.3478,7590.7347,6317.2657,8859.9784,8002.5267,5920.7535,5759.2591,4706.7271,3282.9242,4314.1934,3524.6311,2524.719,8188.738,8071.5777,6746.2802,9020.1241,8179.9706,6098.4307,5767.1145,4737.8016,3333.0417,4313.4845,3542.6401,2558.0609,8689.0596,8582.8956,7202.73,9169.2566,8346.9239,6268.1958,5768.248,4762.2483,3377.7707,4308.0904,3555.9741,2587.5653,9221.4664,9126.9024,7688.6148,9306.9806,8502.9495,6429.5466,5763.0616,4780.3984,3417.2708,4298.3682,3564.9292,2613.3884,9788.2206,9705.9267,8206.0453,9432.9378,8647.6474,6582.0157,5751.9465,4792.58,3451.7133,4284.6563,3569.7907,2635.6901,10391.687,10322.407,8757.24,9546.8128,8780.6597,6725.175,5735.2823,4799.117,3481.2792,4267.2746,3570.8334,2654.6327,11034.326,10978.882,9344.5169,9648.338,8901.6755,6858.6394,5713.4375,4800.3284,3506.1569,4246.5257,3568.3208,2670.3791,11718.678,11677.978,9970.2829,9737.2985,9010.4359,6982.0709,5686.7691,4796.5277,3526.5406,4222.6954,3562.5057,2683.092,12447.344,12422.391,10637.016,9813.5353,9106.7367,7095.1818,5655.6222,4788.0213,3542.6284,4196.0533,3553.6297,2692.9327,13222.963,13214.857,11347.245,9876.9487,9190.4326,7197.7373,5620.3304,4775.1089,3554.6206,4166.8539,3541.9234,2700.0599,14048.173,14058.121,12103.515,9927.4995,9261.4381,7289.5575,5581.2151,4758.0821,3562.7189,4135.3367,3527.6064,2704.6297,14925.573,14954.891,12908.352,9965.211,9319.7297,7370.5189,5538.5855,4737.224,3567.1247,4101.727,3510.8878,2706.7945,15857.66,15907.78,13764.209,9990.1683,9365.3459,7440.5555,5492.7387,4712.8093,3568.0385,4066.2367,3491.966,2706.7026,16846.766,16919.241,14673.409,10002.518,9398.3869,7499.6579,5443.9593,4685.1031,3565.6584,4029.0646,3471.0291,2704.4977,17894.972,17991.473,15638.06,10002.467,9419.0132,7547.8736,5392.5198,4654.3613,3560.1796,3990.3972,3448.2554,2700.3191,19004.005,19126.326,16659.972,9990.2803,9427.4438,7585.3049,5338.6799,4620.8298,3551.7935,3950.409,3423.8131,2694.3009,20175.124,20325.175,17740.541,9966.2756,9423.9533,7612.1071,5282.6875,4584.7448,3540.6873,3909.2634,3397.861,2686.5721,21408.977,21588.781,18880.621,9930.823,9408.8685,7628.4858,5224.7778,4546.3321,3527.0433,3867.1128,3370.549,2677.2565,22705.445,22917.126,20080.381,9884.3387,9382.5644,7634.6938,5165.1741,4505.8078,3511.0385,3824.0994,3342.0178,2666.4728,24063.467,24309.234,21339.138,9827.2807,9345.4595,7631.0274,5104.088,4463.3776,3492.8442,3780.3555,3312.3997,2654.3339,25480.845,25762.974,22655.175,9760.1436,9298.0115,7617.8222,5041.7189,4419.2371,3472.6256,3736.0045,3281.819,2640.9479,26954.044,27274.846,24025.551,9683.4537,9240.7116,7595.4489,4978.2552,4373.5722,3450.5418,3691.1604,3250.3918,2626.4174,28477.977,28839.768,25445.897,9597.763,9174.0794,7564.309,4913.8736,4326.5586,3426.7456,3645.9294,3218.2269,2610.8399,30045.807,30450.862,26910.223,9503.6439,9098.6579,7524.8295,4848.7403,4278.3625,3401.3832,3600.4093,3185.4258,2594.3078,31648.753,32099.259,28410.734,9401.684,9015.0073,7477.4591,4783.0107,4229.1405,3374.5942,3554.6907,3152.0832,2576.9087,33275.946,33773.94,29937.678,9292.4803,8923.7007,7422.6626,4716.8299,4179.0401,3346.5119,3508.8571,3118.2873,2558.725,34914.319,35461.624,31479.237,9176.6348,8825.3184,7360.9171,4650.3332,4128.1994,3317.2627,3462.9851,3084.12,2539.8347,36548.586,37146.741,33021.491,9054.7488,8720.4432,7292.7072,4583.6462,4076.7482,3286.9667,3417.1453,3049.6572,2520.3114,38161.31,38811.492,34548.464,8927.4192,8609.6562,7218.5208,4516.8855,4024.8075,3255.7376,3371.4021,3014.9694,2500.2238,39733.083,40436.033,36042.278,8795.2342,8493.5323,7138.8458,4450.1589,3972.4904,3223.6829,3325.8145,2980.1216,2479.6369,41242.849,41998.794,37483.433,8658.7692,8372.6364,7054.1656,4383.5656,3919.9018,3190.9039,3280.4363,2945.174,2458.6113,42668.354,43476.94,38851.215,8518.584,8247.5204,6964.9569,4317.197,3867.1394,3157.4957,3235.3162,2910.1817,2437.2039,43986.745,44846.983,40124.241,8375.2199,8118.7198,6871.6859,4251.1368,3814.2935,3123.5479,3190.4984,2875.1956,2415.4678,45175.293,46085.51,41281.116,8229.197,7986.7514,6774.8062,4185.4615,3761.4475,3089.1443,3146.0227,2840.2624,2393.4524,46212.204,47170.029,42301.195,8081.0125,7852.1113,6674.7566,4120.2408,3708.6784,3054.3633,3101.9252,2805.4247,2371.2039,47077.489,48079.851,43165.39,7931.1391,7715.2727,6571.9593,4055.5376,3656.0566,3019.278,3058.2378,2770.7213,2348.7651,47753.829,48796.987,43856.984,7780.0237,7576.6851,6466.8183,3991.409,3603.6471,2983.9566,3014.9891,2736.1876,2326.1759,48227.37,49306.966,44362.391,7628.0867,7436.7731,6359.718,3927.9063,3551.5087,2948.4623,2972.2044,2701.8558,2303.473,48488.392,49599.535,44671.795,7475.7212,7295.9355,6251.0228,3865.0753,3499.6952,2912.8539,2929.906,2667.7547,2280.6906,48531.788,49669.154,44779.631,7323.2934,7154.5453,6141.0763,3802.9566,3448.2555,2877.1856,2888.1134,2633.9106,2257.86,48357.318,49515.269,44684.841,7171.142,7012.9497,6030.2008,3741.5862,3397.2334,2841.5074,2846.8432,2600.3468,2235.0103,47969.603,49142.323,44390.908,7019.5792,6871.4698,5918.6973,3680.9957,3346.6686,2805.8656,2806.1099,2567.0841,2212.1678,47377.878,48559.506,43905.65,6868.8905,6730.4013,5806.8458,3621.2123,3296.5964,2770.3022,2765.9256,2534.1411,2189.357,46595.509,47780.271,43240.799,6719.336,6590.0152,5694.9053,3562.2594,3247.0483,2734.8562,2726.3003,2501.5341,2166.6001,45639.333,46821.668,42411.405,6571.1511,6450.5583,5583.1142,3504.157,3198.0521,2699.5626,2687.242,2469.2772,2143.9172,44528.867,45703.532,41435.118,6424.5473,6312.254,5471.6911,3446.9214,3149.632,2664.4537,2648.757,2437.3829,2121.3266,43285.455,44447.614,40331.396,6279.7131,6175.3035,5360.8351,3390.5661,3101.8093,2629.5585,2610.8499,2405.8615,2098.845,41931.41,43076.702,39120.716,6136.8158,6039.8865,5250.727,3335.1016,3054.6021,2594.9031,2573.5238,2374.7221,2076.4873,40489.213,41613.795,37823.818,5996.0019,5906.1625,5141.5298,3280.5357,3008.0259,2560.5111,2536.7806,2343.9718,2054.2666,38980.801,40081.373,36461.04,5857.3989,5774.272,5033.3895,3226.8737,2962.0933,2526.4034,2500.6204,2313.6167,2032.1949,37426.984,38500.792,35051.758,5721.1161,5644.3374,4926.4362,3174.1189,2916.8148,2492.5985,2465.0427,2283.6613,2010.2826,35846.992,36891.812,33613.954,5587.2459,5516.4642,4820.785,3122.2723,2872.1985,2459.1129,2430.0456,2254.1088,1988.5388,34258.162,35272.278,32163.913,5455.8652,5390.7423,4716.5365,3071.3329,2828.2506,2425.9608,2395.6261,2224.9615,1966.9715,32675.753,33657.917,30716.029,5327.0365,5267.247,4613.7784,3021.2984,2784.9752,2393.1545,2361.7807,2196.2205,1945.5873,31112.875,32062.265,29282.733,5200.8087,5146.0399,4512.5859,2972.1644,2742.3747,2360.7044,2328.5046,2167.8859,1924.3919],"body":[1,0.25488351,0.0091468375,1,0.25488351,0.0091468375,1,0.42244763,0.05186052,1,0.58032201,0.15431106,1,0.67694778,0.2618762,1,0.73918021,0.35421348,1,0.78185366,0.4295104,1,0.8126743,0.49049793,1,0.83586353,0.54025513,1,0.85388345,0.58131358,1,0.86825295,0.61560235,1,0.87995466,0.64456495,1,0.88965024,0.66928326,1,0.89780053,0.6905756,1,0.90473585,0.70906827,1,0.91069885,0.72524665,1,0.91587166,0.73949159,1,0.92039352,0.75210542,1,0.92437266,0.76333079,1,0.92789439,0.7733644,1,0.93102686,0.78236724,1,0.93382511,0.79047212,1,0.93633409,0.79778957,1,0.93859078,0.80441213,1,0.94062592,0.81041786,1,0.94246522,0.81587296,1,0.94413035,0.82083386,1,0.94563964,0.82534892,1,0.94700872,0.82945976,1,0.94825098,0.83320231,1,0.94937788,0.83660768,1,0.95039934,0.83970293,1,0.95132391,0.84251158,1,0.952159,0.84505412,1,0.95291104,0.84734844,1,0.95358558,0.8494101,1,0.95418746,0.85125268,1,0.95472085,0.85288793,1,0.95518933,0.85432603,1,0.95559598,0.85557571,1,0.9559434,0.85664441,1,0.95623377,0.85753836,1,0.9564689,0.85826271,1,0.95665021,0.85882156,1,0.95677879,0.85921804,1,0.95685541,0.85945435,1,0.95688052,0.85953181,1,0.20666669,0.0056037774,1,0.20666669,0.0056037774,1,0.37013816,0.038080214,1,0.53384386,0.12696584,1,0.63761888,0.22769865,1,0.70569288,0.31784847,1,0.75288767,0.39324727,1,0.78722179,0.45535256,1,0.81318696,0.50662802,1,0.83344064,0.54931451,1,0.8496385,0.58520593,1,0.86285958,0.61568575,1,0.87383451,0.64181254,1,0.88307447,0.66439917,1,0.89094715,0.6840751,1,0.89772352,0.70133269,1,0.90360742,0.7165612,1,0.90875508,0.73007159,1,0.9132881,0.74211474,1,0.91730255,0.75289498,1,0.92087525,0.76258017,1,0.92406832,0.77130933,1,0.92693254,0.77919841,1,0.92950976,0.78634485,1,0.93183478,0.79283098,1,0.93393674,0.79872677,1,0.93584018,0.80409202,1,0.93756594,0.80897803,1,0.93913174,0.81342904,1,0.94055279,0.81748328,1,0.94184213,0.82117393,1,0.94301103,0.82452983,1,0.94406923,0.8275761,1,0.94502515,0.83033468,1,0.9458861,0.83282468,1,0.94665843,0.83506279,1,0.94734764,0.83706354,1,0.94795847,0.83883954,1,0.94849501,0.84040172,1,0.94896076,0.84175944,1,0.94935871,0.8429207,1,0.94969133,0.8438922,1,0.94996068,0.84467945,1,0.95016839,0.84528688,1,0.95031569,0.84571785,1,0.95040346,0.84597474,1,0.95043223,0.84605894,1,0.15408868,0.0028221153,1,0.15408868,0.0028221153,1,0.30760349,0.024711944,1,0.47496055,0.096625704,1,0.58636707,0.18721069,1,0.66134381,0.27312231,1,0.71412919,0.34756382,1,0.75292187,0.41033883,1,0.78246956,0.46303694,1,0.80564029,0.50745311,1,0.8242468,0.54515569,1,0.83948296,0.57741557,1,0.85216373,0.60523735,1,0.86286288,0.62941063,1,0.87199531,0.65055767,1,0.87986804,0.66917202,1,0.8867129,0.68564823,1,0.89270808,0.70030442,1,0.89799267,0.71339924,1,0.9026768,0.72514476,1,0.90684868,0.73571618,1,0.91057983,0.74525932,1,0.91392875,0.75389636,1,0.91694376,0.76173035,1,0.91966506,0.76884865,1,0.92212636,0.77532577,1,0.9243561,0.78122554,1,0.92637842,0.78660287,1,0.92821391,0.79150519,1,0.9298802,0.7959736,1,0.93139246,0.80004383,1,0.9327638,0.80374698,1,0.93400552,0.80711019,1,0.93512746,0.81015719,1,0.93613811,0.81290868,1,0.93704489,0.81538276,1,0.93785418,0.81759519,1,0.93857152,0.81955969,1,0.9392017,0.82128812,1,0.9397488,0.82279069,1,0.94021628,0.82407608,1,0.94060705,0.82515161,1,0.94092351,0.82602329,1,0.94116754,0.82669593,1,0.94134062,0.8271732,1,0.94144376,0.82745771,1,0.94147756,0.82755096,1,0.082140434,0.00064893993,1,0.082140434,0.00064893993,1,0.20690178,0.0097835051,1,0.36973722,0.053822293,1,0.4899904,0.12306198,1,0.57547107,0.19734327,1,0.63766257,0.26675383,1,0.68437107,0.32830267,1,0.72049762,0.38184451,1,0.74915106,0.42818133,1,0.77236221,0.46832344,1,0.79150082,0.50322911,1,0.80751895,0.53372854,1,0.82109649,0.5605155,1,0.83273072,0.58416159,1,0.84279312,0.60513578,1,0.85156643,0.62382319,1,0.85926941,0.64054117,1,0.86607384,0.65555249,1,0.87211638,0.66907589,1,0.87750701,0.68129448,1,0.88233523,0.69236241,1,0.8866745,0.70241013,1,0.8905857,0.71154859,1,0.8941196,0.71987264,1,0.8973189,0.72746369,1,0.90021969,0.73439193,1,0.90285267,0.74071808,1,0.90524407,0.74649486,1,0.90741641,0.75176814,1,0.90938908,0.75657797,1,0.91117884,0.76095934,1,0.91280021,0.76494291,1,0.91426579,0.76855553,1,0.91558652,0.77182071,1,0.9167719,0.77475904,1,0.91783017,0.77738853,1,0.91876847,0.77972483,1,0.91959295,0.78178155,1,0.92030888,0.7835704,1,0.92092073,0.78510134,1,0.92143227,0.78638278,1,0.92184658,0.78742165,1,0.92216611,0.78822349,1,0.92239274,0.78879255,1,0.9225278,0.7891318,1,0.92257207,0.789243,1,0.023341539,0.000034313418,1,0.023341539,0.000034313418,1,0.093607398,0.0015334499,1,0.22406005,0.016699414,1,0.34215554,0.053175354,1,0.43572843,0.10302736,1,0.508416,0.15713136,1,0.56542513,0.21015416,1,0.61088962,0.25967395,1,0.64777748,0.30485361,1,0.67818553,0.34561819,1,0.7036073,0.38222605,1,0.72512366,0.41505899,1,0.74353088,0.4445235,1,0.75942599,0.47100702,1,0.77326413,0.49486068,1,0.78539756,0.51639476,1,0.79610276,0.53587984,1,0.80559948,0.55355035,1,0.81406441,0.56960883,1,0.82164106,0.5842302,1,0.82844715,0.59756564,1,0.83458002,0.60974605,1,0.84012083,0.620885,1,0.8451377,0.63108126,1,0.84968816,0.64042094,1,0.85382112,0.64897927,1,0.85757831,0.65682215,1,0.86099557,0.66400742,1,0.86410373,0.6705859,1,0.86692946,0.67660237,1,0.86949585,0.68209625,1,0.87182298,0.68710232,1,0.87392829,0.69165126,1,0.87582698,0.69577008,1,0.87753226,0.69948259,1,0.87905562,0.70280966,1,0.88040702,0.70576955,1,0.88159507,0.70837818,1,0.88262714,0.71064928,1,0.8835095,0.7125946,1,0.88424741,0.71422406,1,0.88484521,0.71554585,1,0.88530636,0.71656654,1,0.88563349,0.71729116,1,0.88582845,0.71772325,1,0.88589235,0.71786491,1,0.00188484,9.5936296e-8,1,0.00188484,9.5936296e-8,1,0.01916029,0.000037672101,1,0.082282397,0.0016076049,1,0.16683823,0.0099284945,1,0.24980476,0.028081032,1,0.3232033,0.054521436,1,0.38595976,0.086112298,1,0.43916036,0.12009144,1,0.48432706,0.15453206,1,0.52288179,0.18823396,1,0.55601726,0.22051053,1,0.58469689,0.25100861,1,0.60968939,0.27958182,1,0.63160739,0.30620773,1,0.65094101,0.33093536,1,0.66808478,0.35385265,1,0.68335863,0.3750664,1,0.69702394,0.39469029,1,0.70929585,0.41283773,1,0.72035274,0.4296178,1,0.73034352,0.4451331,1,0.7393933,0.45947879,1,0.74760781,0.47274222,1,0.75507691,0.48500312,1,0.76187738,0.49633389,1,0.76807506,0.50680008,1,0.77372673,0.51646094,1,0.77888148,0.52536986,1,0.78358189,0.53357495,1,0.78786501,0.54111947,1,0.79176316,0.54804228,1,0.79530455,0.55437826,1,0.79851385,0.5601586,1,0.80141261,0.5654112,1,0.80401968,0.57016089,1,0.80635151,0.57442973,1,0.80842238,0.5782372,1,0.81024469,0.58160039,1,0.81182908,0.5845342,1,0.81318463,0.58705144,1,0.81431897,0.58916298,1,0.81523839,0.59087784,1,0.81594791,0.59220331,1,0.81645139,0.59314496,1,0.81675152,0.59370672,1,0.8168499,0.59389094]};

/* ── sky/atmosphere-calibration.js ───────────────────────────────────── */
// Spectral calibration of the independent bake at the supplied noon anchor.
// Constant per-view RGB gains; this is calibration, not reference table parity.
const calibration = [1.097791023,0.934727721,0.984225738,1.138828383,0.99173435,1.165907787,1.26642757,1.1094895,1.187084143,1.346488375,1.199014537,1.302779423];

/* ── sky/atmosphere.js ───────────────────────────────────────────────── */
const ATMOSPHERE_VERSION=data.version;
function laneAt(aod) {
  const a=clamp(aod||.12,.02,2),lanes=data.lanes;
  let i=0;
  while(i<lanes.length-2&&a>lanes[i+1])i++;
  return [i,clamp((Math.log(a)-Math.log(lanes[i]))/(Math.log(lanes[i+1])-Math.log(lanes[i])))];
}
function read(table,lane,y,count,stride,stop=0) {
  const i=Math.floor(y),t=y-i;
  const index=((lane*count+i)*stride+stop)*3;
  return [0,1,2].map(c=>table[index+c]+(table[index+stride*3+c]-table[index+c])*t);
}
function sampleSky(e,aod) {
  const [lane,t]=laneAt(aod),y=clamp(e+18,0,107.999);
  return [0,1,2,3].map(stop=>blend(read(data.sky,lane,y,109,4,stop),read(data.sky,lane+1,y,109,4,stop),t).map((v,c)=>v*calibration[stop*3+c]));
}
function bodyColor(e,aod) {
  const [lane,t]=laneAt(aod),y=clamp((e+2)/2,0,45.999);
  return blend(read(data.body,lane,y,47,1),read(data.body,lane+1,y,47,1),t);
}
function palette(e,aod,moonAlt=-90,illumination=0,grade=GRADE_BASE) {
  const effective=e>=0?e:e/(1+1.2*grade.duskStretch);
  let linear=sampleSky(effective,aod);
  if(moonAlt>-18&&illumination>0) {
    const moon=sampleSky(moonAlt,aod),boost=illumination*grade.moonBoost/440000;
    linear=linear.map((c,i)=>c.map((v,j)=>v+moon[i][j]*boost));
  }
  return gradePalette(linear,e,grade);
}

/* ── sky/engine.js ───────────────────────────────────────────────────── */
const DESKTOP_SCENE={latitude:43.6532,longitude:-79.3832,place:'Toronto',timeZone:'America/Toronto',code:2,cloud:45,wind:9,windDirection:250,aqi:35,temperature:12,low:null,mid:null,high:null,aod:null,humidity:null,hourly:true,hour:null,date:null,lift:{...LIFT_BASE}};
const IMPORT_SCENE={...DESKTOP_SCENE,latitude:37.3688,longitude:-122.0363,place:'Sunnyvale',timeZone:'America/Los_Angeles',code:1,cloud:25,temperature:18,lift:null};
const DEFAULT_STATE={manualCode:null,manualCloud:null,manualWind:null,manualAQI:null,manualAOD:null,stagedCloud:false,visibility:null,diffuse:null,transmission:null,snowDepth:null,cityLight:null};
const DEFAULT_TUNING={
  influence:{time:1,weather:1,temperature:.8},density:.9,warp:1.7,grain:.018,
  composition:{referenceAspect:1,crop:.15},shaft:{strength:1.1,coverage:.5,reach:1},
  cirrus:{angle:15,variance:8,fiber:1.1,opacity:.53,bias:-.17,evolution:.008,breakDepth:.44,grain:2.8},
  rays:{strength:.1,scale:8,falloff:6},halo:{strength:.25,radius:.28,dispersion:1.7,softness:1,force:false},
  purity:{polar:.9,aureole:.6,width:10,whiten:.25,purple:.3,center:30,sigma:16,shadow:.4,scale:5,force:false},
  lighting:{thin:.75,back:1,highTint:.5,airlight:.8,reddening:1},afterglow:.25,nightFloor:.2,
  dogs:{strength:.9,tail:4.1,force:false},corona:{strength:.1,radius:6,purity:.6,force:false},cityStrength:.3,lutAmount:0
};
const SIMULATOR={0:{cloud:6,wind:6,aod:.05},1:{cloud:25,wind:8,aod:.08},2:{cloud:45,wind:10,aod:.12},3:{cloud:96,wind:12,aod:.20},45:{cloud:100,wind:3,aod:.60},53:{cloud:88,wind:12,aod:.25},63:{cloud:92,wind:18,aod:.20},73:{cloud:90,wind:14,aod:.15},95:{cloud:95,wind:38,aod:.30}};
function snapshotTuning(patch={}) {
  return Object.fromEntries(Object.entries(DEFAULT_TUNING).map(([key,value])=>[key,typeof value==='object'?{...value,...patch[key]}:patch[key]??value]));
}
const effCode=(scene,state=DEFAULT_STATE)=>state.manualCode??scene.code;
function effCloud(scene,state=DEFAULT_STATE) {
  return Math.max(7,state.manualCloud??(state.manualCode!=null?SIMULATOR[state.manualCode]?.cloud:undefined)??(!scene.hourly&&state.stagedCloud?42:scene.cloud));
}
const aqiAod=q=>Math.min(.55,.05+1.15*(clamp(q-100,0,400)/300)**1.5);
const visibilityAod=v=>v>100?clamp(3912/v,.02,1.5):null;
function effAod(scene,state=DEFAULT_STATE,cover=effCloud(scene,state)) {
  if(state.manualAOD!=null)return state.manualAOD;
  if(state.manualCode!=null||state.manualAQI!=null)return Math.max(state.manualCode!=null?(SIMULATOR[state.manualCode]?.aod??.12):0,state.manualAQI!=null?aqiAod(state.manualAQI):0);
  let a=scene.aod??aqiAod(scene.aqi);
  if(scene.aod==null&&scene.humidity!=null)a=Math.max(a,.06+Math.max(0,scene.humidity-70)/30*.12);
  const visibility=visibilityAod(state.visibility);
  if(visibility!=null)a=Math.max(a,Math.max(0,visibility-.15)*.9*(1-.5*smooth((cover-50)/45)));
  return .05+1.15*Math.max(0,a-.12)**1.3;
}
const displayAod=a=>.03+.17*(1-Math.exp(-Math.max(0,a-.02)/.4));
const turbidity=(a,rh)=>clamp(Math.max(smooth((a-.05)/.35),rh==null?0:.45*smooth((rh-55)/40)));
const isSnow=c=>(c>=71&&c<=77)||c===85||c===86;
function conditionProfile(code) {
  if(code===0)return {milk:0,density:-.14,glow:1.2};
  if(code===1)return {milk:0,density:0,glow:1.05};
  if(code===2)return {milk:0,density:.14,glow:.90};
  if(code===3)return {milk:.05,density:.34,glow:.35};
  if(code===45||code===48)return {milk:.06,density:.30,glow:.15};
  if(code>=51&&code<=57)return {milk:.03,density:.28,glow:.30};
  if(code>=61&&code<=67)return {milk:0,density:.38,glow:.20};
  if(isSnow(code))return {milk:.24,density:.30,glow:.30};
  if(code>=80&&code<=82)return {milk:0,density:.36,glow:.22};
  if(code>=95)return {milk:0,density:.52,glow:.12};
  return {milk:0,density:0,glow:1};
}
function deckCharacter(c) {
  if(c>=95)return {white:.95,brightness:.60,tint:[.92,.95,1.05]};
  if(isSnow(c))return {white:.95,brightness:1.05,tint:[.98,1,1.04]};
  if(c>=80)return {white:.92,brightness:.82,tint:[.94,.97,1.05]};
  if(c>=61)return {white:.92,brightness:.80,tint:[.93,.97,1.06]};
  if(c>=51)return {white:.90,brightness:.90,tint:[.96,.98,1.03]};
  if(c===45||c===48)return {white:.90,brightness:.97,tint:[1,1,1]};
  return {white:.85,brightness:1,tint:[1,1,1]};
}
function environmentalDeck(scene,state) {
  if(state.manualCode!=null)return {thin:0,presence:1,brightness:1};
  let thin=0,presence=1,brightness=1;
  if(scene.low!=null&&scene.mid!=null&&scene.high!=null) {
    const sum=scene.low+scene.mid+scene.high;
    if(sum>20)thin=clamp(scene.high/sum);
  }
  if(state.diffuse!=null){thin=Math.max(thin,.9*clamp((.95-state.diffuse)/.45));presence=.25+.75*clamp((state.diffuse-.35)/.5);}
  if(state.transmission!=null)brightness=clamp(.75+.45*Math.min(1,state.transmission),.8,1.1);
  if(state.snowDepth>.02)brightness*=1+Math.min(.15,.5*state.snowDepth);
  return {thin,presence,brightness};
}
function cloudDeck(cols,amount,character,environment) {
  if(amount<=.001)return cols.map(c=>[...c]);
  const A=Math.min(.75,amount),H=environment.thin,B=character.brightness*environment.brightness;
  const mean=cols.reduce((n,c)=>n+luminance(c),0)/4;
  const dl=Math.min(.90,mean*(1.18+.10*H))*B,s=1+A;
  const vertical=[1+.06*s,1+.02*s,1-.03*s,1-.08*s],cool=[.975,.995,1.03],weights=[1.5,1.2,.95,.8],strengths=[.92,.96,1,1.08];
  const common=A*character.white*(1-.35*H);
  return cols.map((c,i)=>{
    const target=cool.map((v,j)=>clamp(clamp(dl*vertical[i])*(1+(v-1)*weights[i])*character.tint[j]));
    const rgb=bounded(blend(c,target,clamp(common*strengths[i])));
    const warm=clamp(Math.max(0,rgb[0]-rgb[2]-.006)*40),n=luminance(rgb);
    return blend(rgb,[n,n,n],Math.min(1,A/.6)*warm);
  });
}
function precipitation(c) {
  if(c>=51&&c<=55)return [.35,0,.7];
  if(c===56||c===57)return [.30,.25,.7];
  if(c>=61&&c<=65)return [.60,0,1];
  if(c===66||c===67)return [.50,.30,1];
  if(c>=71&&c<=77)return [0,.70,1];
  if(c===85||c===86)return [0,.85,1.3];
  if(c>=80&&c<=82)return [.75,0,1.3];
  if(c>=95)return [.90,c>=96?.25:0,1.6];
  return [0,0,1];
}
function detUnit(width,height,referenceAspect=1,crop=.15) {
  if(!Number.isFinite(width)||!Number.isFinite(height)||width<=0||height<=0)throw new RangeError('Render dimensions must be finite and positive.');
  return Math.max(1,Math.min(height,mix(width/Math.max(.1,referenceAspect),height,clamp(crop))));
}

function evaluate(input,epoch=Date.now(),options={}) {
  const scene={...DESKTOP_SCENE,...input},state={...DEFAULT_STATE,...options.state};
  const look=snapshotTuning(options.tuning),grade=options.grade??liftedGrade(scene.lift);
  if(!Number.isFinite(scene.latitude)||!Number.isFinite(scene.longitude)||(!scene.hourly&&!Number.isFinite(scene.hour??12)))throw new TypeError('Coordinates and hour must be finite.');
  const clock=resolveClock(scene,epoch,options.retainedHour??12),h=clock.hour;
  const geom=solarGeom(scene.latitude,scene.longitude,h,clock.date,clock.offset),e=geom.altitude,d=-e;
  const m=moonAltitude(clock.moonEpoch,scene.latitude,scene.longitude),I=moonIllum(clock.baseEpoch);
  const body=skyGlow(h,geom,m,I),sunpos=sunScreenPos(h,geom),c=effCloud(scene,state),code=effCode(scene,state);
  const w=look.influence.weather,a=smooth(((state.manualAQI??scene.aqi)-150)/250)*w;
  const physical=effAod(scene,state,c),display=displayAod(physical),T=turbidity(physical,scene.humidity);
  const seed=daySeed(clock.date,scene.latitude,scene.longitude),dust=monthlyDust(clock.date,scene.latitude,scene.longitude);
  const profile=conditionProfile(code),env=environmentalDeck(scene,state);
  let cover=smooth((c-15)/85)**2;
  if(code>=51)cover=Math.max(cover,.85);
  cover*=w*env.presence;
  if(code<=2)cover=Math.min(cover,.30);
  const deck=Math.min(cover,.75),tex=grade.textureVibrancy;
  let puff=smooth((c-12)/30)*(code<=2?1:1-smooth((c-68)/27))*w*(1-deck)*tex;
  const displacement=Math.max(.3+.7*smooth((c-8)/55),.8*smooth((-e-12)/6));
  let night=.6*smooth((-e-10)/6)*w*tex;
  const haze=(.12+.30*smooth((c-8)/45)*(1-.55*deck)*(code<=2?.5:1))*smooth((e-2)/8)*w;
  let cols=palette(e,display,m,I,grade);
  const squashK=smooth(d/4.5)*(1-smooth((d-7)/4));
  cols[1]=blend(cols[1],cols[0],.28*squashK);
  cols[2]=blend(cols[2],cols[1],.35*squashK);
  cols=cloudDeck(cols,deck,deckCharacter(code),env);
  cols=cols.map(rgb=>bounded(blend(rgb,[.88,.90,.93],profile.milk*w)));
  const ember=gaussian(e,0,11)*smooth((e+9)/7),emberWeights=[.05,.13,.30,.55];
  cols=cols.map((rgb,i)=>bounded(screen(scale(rgb,1-.10*a),[1,.40,.14],emberWeights[i]*a*ember)));
  const guard=smooth((e-10)/12);
  cols=cols.map(rgb=>{
    const warm=clamp(Math.max(0,rgb[0]-rgb[2]-.004)*40),neutral=Math.min(1,1.04*luminance(rgb)+.02);
    return blend(rgb,[neutral,neutral,neutral],guard*warm);
  });
  const ebb=1-.25*smooth(Math.min(((h+1)%24+24)%24,12)/3.5);
  const city=(state.cityLight??.35)*look.cityStrength*smooth((-e-6)/8)*(1+.9*deck)*ebb;
  cols=cols.map((rgb,i)=>screen(rgb,[1,.80,.58],[0,.10,.38,1][i]*.55*city));
  let glowCol=bodyColor(body.altitude,display);
  if(body.body==='moon')glowCol=blend(glowCol,[.72,.78,.98],.65);
  let redF=[1,1,1];
  if(body.body==='sun') {
    const z=Math.max(body.altitude,.5),air=Math.min(8,1/(Math.sin(rad(z))+.15*(z+3.885)**-1.253));
    const excess=Math.max(0,physical-display)*look.lighting.reddening;
    redF=[.35,.50,.70].map(v=>Math.exp(-excess*air*v));
    glowCol=glowCol.map((v,i)=>v*redF[i]);
  }
  const visibility=mix(1,profile.glow,w)*(1-.65*(c/100)*w);
  const glowStr=body.strength*visibility*look.influence.time*.85*(1-.55*a);
  glowCol=blend(glowCol,[1,.45,.20],.7*a);
  let milk=bounded(scale([.88,.90,.93],.30+.80*luminance(cols[1])));
  function tintAt(weight) {
    const rgb=bodyColor(Math.max(e,-2),display).map((v,i)=>v*redF[i]),l=Math.max(.05,luminance(rgb));
    return rgb.map(v=>1+weight*(v/l-1));
  }
  const tint=tintAt(.35*smooth((8-e)/5)*(1-smooth(-e/1.8))*smooth((c-10)/30)*w);
  const tintHi=tintAt(.35*look.lighting.highTint*smooth((8-e)/5)*(1-smooth((-e-3.2)/1.8))*w);
  const dip=smooth((d+.5)/1.5)*(1-smooth((d-2)/1));
  milk=scale(blend(milk,Array(3).fill(luminance(milk)),.60*dip),1-.22*dip);
  puff*=1-.35*dip;
  const after=smooth((d-2.2)/1.3)*(1-smooth((d-5.5)/1.7))*smooth((c-5)/35)*w;
  const l2=Math.max(.05,luminance(cols[2])),rose=bounded([1,.58,.52].map((v,i)=>.6*v+.36*cols[2][i]/l2));
  milk=bounded(milk.map((v,i)=>v*(1-.45*after)+rose[i]*.50*after));
  night=Math.max(night,.38*after*tex*look.afterglow);
  const precipRaw=precipitation(code),fogRaw=code===45||code===48?.72:0,dry=fogRaw===0&&precipRaw[0]+precipRaw[1]===0?1:0;
  const up=smooth((e+2)/6),isSun=body.body==='sun';
  const haloWeather=(1-smooth((c-75)/20))*(1-smooth((deck-.30)/.30))*(1-smooth((physical-.35)/.45))*dry*w*(1-.55*a);
  const halo=isSun?look.halo.strength*up*(look.halo.force?1:haloWeather):0;
  let dogs=[0,0,look.dogs.tail*look.halo.radius/22];
  if(isSun&&e>-1) {
    const z=rad(Math.max(0,e)),u=Math.sqrt(1.7161-Math.sin(z)**2)/(2*Math.cos(z));
    if(u<1) {
      const sep=(2*Math.asin(u)*180/Math.PI-60)*look.halo.radius/22;
      const ice=scene.high!=null?.5+.5*smooth((scene.high-10)/40):.75;
      dogs=[look.dogs.strength*smooth((e+1)/3)*(1-smooth((e-15)/40))*(look.dogs.force?1:haloWeather*ice),sep,dogs[2]];
    }
  }
  const mid=scene.mid!=null?.4+.6*smooth((scene.mid-10)/40):.7;
  const coronaGate=look.corona.force?1:smooth((c-20)/30)*(1-smooth((c-78)/12))*(1-deck)*mid*dry*w;
  const corona=[look.corona.strength*smooth((body.altitude-2)/5)*(isSun?.35:.3+.7*I)*coronaGate,look.corona.radius*(.75+.5*seed[3])*look.halo.radius/22,look.corona.purity*(isSun?.4:1)];
  const daylight=smooth((e+6)/8),force=look.purity.force;
  const polar=look.purity.polar*daylight*(force?1:(1-.85*T)*(1-deck)*(1-.5*a)*w);
  const aureole=[look.purity.aureole*daylight*(force?1:(.6+.8*T)*(1-deck)*w),look.purity.width+(force?0:22*T+6*(1-smooth(e/30)))];
  const whiten=.29*look.purity.whiten*daylight*(force?1:(.2+.8*T)*(1-deck)*w);
  const twilight=smooth((d-2.5)/2)*(1-smooth((d-6)/2.5));
  const open=(1-deck)*(1-.7*smooth((c-30)/50))*w;
  const casting=.5*smooth((seed[0]-.3)/.5)+.5*smooth((c-15)/45);
  const purple=[look.purity.purple*twilight*(force?1:dust*open),look.purity.center,look.purity.sigma];
  const crep=look.purity.shadow*twilight*(force?1:dust*open*casting);
  const cloudy=.3+.7*smooth((c-10)/40),day=smooth((e+1)/4),low=1-smooth(e/12);
  const lit=[look.lighting.thin*day*cloudy*w,look.lighting.back*day*cloudy*w,look.lighting.airlight*low*smooth((e+6)/8)];
  const floorGate=smooth((-e-6)/6),f=clamp(look.nightFloor);
  const floorZ=scale(blend([.020,.028,.060],[.090,.120,.290],f),floorGate),floorH=scale(blend([.030,.042,.085],[.125,.165,.340],f),floorGate);
  const shape=up*(.55+.45*Math.exp(-((Math.max(0,e-6)/26)**2)));
  const rays=isSun?look.rays.strength*shape*visibility*look.influence.time*(1-.55*a)*(.35+.65*smooth((c-8)/30)):0;
  const heading=rad(scene.windDirection+180),direction=blend([.86,.50],[Math.sin(heading),Math.cos(heading)],w),norm=Math.hypot(...direction)||1;
  const wind=state.manualWind??(state.manualCode==null?scene.wind:SIMULATOR[state.manualCode]?.wind??scene.wind);
  const drift=scale(direction,mix(1,.55+1.25*smooth(wind/45),w)/norm);
  return {
    cols,dens:clamp(look.density*(1+w*(profile.density+.35*c/100))*(1+.35*a)*displacement,.05,1.8),
    glowPos:body.pos,glowCol,glowStr,glowSize:body.size,drift,precip:[precipRaw[0]*w,precipRaw[1]*w,precipRaw[2]],fog:fogRaw*w,milk,
    deck,puff,night,haze,squash:1-.45*squashK,tint,tintHi,rays,halo,sun:[...sunpos,e],polar,aureole,whiten,purple,crep,lit,floorZ,floorH,dogs,corona,dust,turb:T,seed,redF,
    diagnostics:{hour:h,solar:geom,moonAltitude:m,moonIllumination:I,body:body.body,physicalAod:physical,displayAod:display,cloud:c,code,grayDip:dip,afterglow:after,epoch,baseEpoch:clock.baseEpoch,moonEpoch:clock.moonEpoch,atmosphere:ATMOSPHERE_VERSION},
    look,grade:{...grade}
  };
}

function createSimulation() {
  const scene={...DESKTOP_SCENE,lift:{...LIFT_BASE}},active={...IMPORT_SCENE},state={...DEFAULT_STATE},tuning=snapshotTuning();
  const grade={...GRADE_BASE}; let retainedHour=12;
  const cloneScene=()=>({...scene,lift:scene.lift?{...scene.lift}:scene.lift});
  const applyLift=lift=>Object.assign(grade,liftedGrade(lift,grade));
  const applyScene=patch=>{
    Object.assign(scene,patch); if(!scene.lift)scene.lift={...LIFT_BASE};
    for(const key of Object.keys(DESKTOP_SCENE)) if(key!=='lift'&&key!=='hour')active[key]=scene[key];
    active.hourly=!!active.hourly;
    if(scene.hour!=null)retainedHour=scene.hour;
    active.hour=retainedHour; applyLift(scene.lift);
    return cloneScene();
  };
  return {scene,active,state,tuning,grade,cloneScene,applyLift,applyScene,frameAt:()=>evaluate(active,Date.now(),{state,tuning,grade,retainedHour}),evaluateAt:epoch=>evaluate(active,epoch,{state,tuning,grade,retainedHour})};
}
const compatibility=createSimulation();
const SCENE=compatibility.scene,skyState={scene:compatibility.active,environment:compatibility.state,tuning:compatibility.tuning};
const applyScene=compatibility.applyScene,cloneScene=compatibility.cloneScene,applyLift=compatibility.applyLift,frameAt=compatibility.frameAt;
const SKY2={palette,bodyColor,cloudDeck,environmentalDeck,visibilityAod,moonAltitude,grade:compatibility.grade};

/* ── sky/shaders.js ──────────────────────────────────────────────────── */
// Independently written from the rebuild specification. Display RGB pipeline.
const VERT=`
attribute vec2 aPosition;
void main(){gl_Position=vec4(aPosition,0.0,1.0);}
`;
const UNIFORM_NAMES=['uRes','uDet','uTime','uAlpha','uC0','uC1','uC2','uC3','uGlowPos','uGlowCol','uGlow','uGlowSize','uDensity','uWarp','uGrain','uDrift','uPrecip','uShaft','uFog','uMilk','uDeck','uPuff','uNight','uHaze','uSquash','uTint','uRays','uRayLook','uHalo','uHaloLook','uLut','uLutAmt','uTexV','uCirA','uCirB','uSun','uPolar','uAureole','uWhiten','uPurple','uCrep','uLit','uTintHi','uFloorZ','uFloorH','uDogs','uCorona'];
const FRAG=`
precision highp float;
uniform vec2 uRes;
uniform float uDet,uTime,uAlpha;
uniform vec3 uC0,uC1,uC2,uC3;
uniform vec2 uGlowPos;
uniform vec3 uGlowCol;
uniform float uGlow,uGlowSize,uDensity,uWarp,uGrain;
uniform vec2 uDrift;
uniform vec3 uPrecip,uShaft;
uniform float uFog;
uniform vec3 uMilk;
uniform float uDeck,uPuff,uNight,uHaze,uSquash;
uniform vec3 uTint;
uniform float uRays;
uniform vec2 uRayLook;
uniform float uHalo;
uniform vec3 uHaloLook;
uniform sampler2D uLut;
uniform float uLutAmt,uTexV;
uniform vec4 uCirA,uCirB;
uniform vec3 uSun;
uniform float uPolar;
uniform vec2 uAureole;
uniform float uWhiten;
uniform vec3 uPurple;
uniform vec2 uCrep;
uniform vec3 uLit,uTintHi,uFloorZ,uFloorH,uDogs,uCorona;
const float PI=3.141592653589793;
float sat(float v){return clamp(v,0.0,1.0);}
float lum(vec3 c){return dot(c,vec3(.299,.587,.114));}
vec3 screenRGB(vec3 c,vec3 contribution){return c+contribution*(1.0-c);}
float hash(vec2 p){vec3 v=fract(vec3(p.x,p.y,p.x)*.1031);v+=dot(v,v.yzx+33.33);return fract((v.x+v.y)*v.z);}
float noise(vec2 p){
  vec2 i=floor(p),f=fract(p),q=f*f*f*(f*(f*6.0-15.0)+10.0);
  return mix(mix(hash(i),hash(i+vec2(1,0)),q.x),mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),q.x),q.y);
}
mat2 turn(float angle){float c=cos(angle),s=sin(angle);return mat2(c,s,-s,c);}
float field(vec2 p){
  float total=0.0,amplitude=.52;
  for(int i=0;i<4;i++){total+=amplitude*noise(p);p=mat2(.8,.6,-.6,.8)*p*1.9;amplitude*=.5;}
  return total;
}
vec3 spectral(float x){
  x=sat(x);
  if(x<.25)return mix(vec3(1,.35,.22),vec3(1,.62,.25),x*4.0);
  if(x<.5)return mix(vec3(1,.62,.25),vec3(1,.92,.55),(x-.25)*4.0);
  if(x<.75)return mix(vec3(1,.92,.55),vec3(1,1,.98),(x-.5)*4.0);
  return mix(vec3(1,1,.98),vec3(.82,.90,1),(x-.75)*4.0);
}
vec3 dogLobe(vec2 p,float side,float separation,float angularUnit,float tail){
  float x=side*p.x-separation,inner=1.6*angularUnit,outer=max(tail,1.5*angularUnit);
  float sx=x<0.0?inner:outer,sy=2.4*angularUnit;
  float envelope=exp(-.5*x*x/(sx*sx)-.5*p.y*p.y/(sy*sy));
  return envelope*spectral((x+inner)/(inner+1.6*outer));
}
void main(){
  vec2 pixel=gl_FragCoord.xy,uv=pixel/uRes,P=(pixel-.5*uRes)/uDet,K=uRes/uDet;
  float t=uTime;
  vec2 A=P-.018*t*uDrift;
  vec2 q=vec2(field(A+t*vec2(.010,.006)),field(A+vec2(5.2,1.3)-t*vec2(.007,.009)));
  vec2 r=vec2(field(1.4*A+1.1*uWarp*q+vec2(1.7,9.2)+t*vec2(.0035,-.0025)),field(1.4*A+1.1*uWarp*q+vec2(8.3,2.8)-t*vec2(.0025,.0035)));
  float f=mix(field(1.1*A+.8*uWarp*r),.5,.35);
  float g=sat(uv.y+(f-.5)*(.18+.6*uDensity)*(.88+.3*uv.y));
  float gm=pow(g,uSquash);
  vec3 c=mix(uC3,uC2,smoothstep(0.0,.45,gm));
  c=mix(c,uC1,smoothstep(.32,.78,gm));
  c=mix(c,uC0,smoothstep(.62,1.0,gm));

  float sky=1.0-smoothstep(.47,.78,f);
  float a1=radians(uSun.z+(112.5*(uv.y-.10)-uSun.z)*K.y),a2=radians(uSun.z);
  float az=radians((uv.x-uSun.x)*K.x*112.5);
  float cosine=clamp(sin(a1)*sin(a2)+cos(a1)*cos(a2)*cos(az),-1.0,1.0);
  float theta=acos(cosine),angle=degrees(theta);
  float purity=(1.0-cosine*cosine)/(1.0+cosine*cosine),pol=purity*uPolar*sky;
  c=max(vec3(0),mix(c,vec3(lum(c))+(c-lum(c))*1.25,pol))*(1.0-.45*pol);
  float broad=cosine>=0.0?cosine*cosine:0.0;
  float aureole=uAureole.x*(.35*broad+.65*exp(-angle/max(1.0,uAureole.y)))*sky;
  vec3 illum=mix(vec3(1),uGlowCol,.5);
  c=mix(c,illum*lum(c),.7*aureole);
  c=screenRGB(c,.55*aureole*illum);

  vec2 G=(uv-uSun.xy)*K;
  float alt=112.5*(uv.y-.10);
  if(uPurple.x>.001||uCrep.x>.001){
    float sigma=max(uPurple.z,1.0),dx=112.5*G.x,dy=alt-uPurple.y;
    float lobe=exp(-.5*(dx*dx/(2.56*sigma*sigma)+dy*dy/(sigma*sigma)))*smoothstep(-2.0,6.0,alt);
    float dist=max(length(G),.0001);vec2 direction=G/dist;
    float n=.7*noise(direction*uCrep.y+vec2(3.1,8.7)+.004*t)+.3*noise(direction*uCrep.y*2.1+vec2(6.4,1.9)-.003*t);
    float shadow=uCrep.x*smoothstep(.58,.82,n)*exp(-1.6*dist)*sky;
    c=screenRGB(c,vec3(.64,.25,.60)*uPurple.x*lobe*sky*(1.0-shadow));
    c=mix(c,c*vec3(.80,.86,.94),.6*shadow*(1.0-smoothstep(5.0,60.0,alt)));
  }

  c*=1.0+(f-.5)*(.05+.13*min(uDensity,1.7)+.7*uDeck)*(.85+.45*uv.y)*uTexV;
  c*=mix(vec3(1),uTint,smoothstep(.47,.78,f));
  float thick=smoothstep(.58,.80,f);
  float thin=smoothstep(.47,.60,f)*(1.0-smoothstep(.60,.74,f));
  float rim=smoothstep(.56,.66,f)*(1.0-smoothstep(.66,.78,f));
  float back=1.0-smoothstep(15.0,60.0,angle),front=smoothstep(70.0,120.0,angle);
  illum=mix(vec3(1),uGlowCol,.6);
  c=mix(c,c*vec3(.90,.95,1.04)*.88,uLit.x*thin);
  c*=1.0-.28*uLit.y*back*thick;
  c=screenRGB(c,illum*uLit.y*back*(.35*rim+.45*thin));
  c=screenRGB(c,illum*.14*uLit.y*front*thick);

  if(uPuff>.001){
    vec2 Pa=P-.007*t*uDrift;
    float dv=noise(.4*Pa+vec2(19.3,4.7))-.5;
    float alpha=uCirA.x+8.0*dv*dv*dv*uCirA.y;
    vec2 R=turn(-alpha)*P-.007*t*uDrift;
    float ev=t*uCirB.y;
    float wobble=noise(vec2(2.6*R.x,4.0*R.y)+vec2(11.1,6.3))-.5;
    float strand=noise(vec2(.7*R.x,12.0*uCirA.z*R.y+1.5*wobble)+vec2(7.7,2.2+ev));
    float fine=noise(vec2(1.6*R.x,26.0*uCirA.z*R.y+3.2*wobble)+vec2(3.3,9.1-1.7*ev));
    float bank=noise(vec2(.35*R.x,1.5*R.y)+vec2(3.1,8.4)+t*vec2(.008,.005));
    float veil=smoothstep(.35,.95,.65*strand+.35*fine)*smoothstep(.25-uCirB.x,.85-uCirB.x,bank)*smoothstep(.10,.30,uv.y);
    vec2 cellP=6.0*uCirB.w*R;
    float cell=.55*noise(cellP+.9*wobble+vec2(4.2,1.9+.6*ev))+.30*noise(2.1*mat2(.8,.6,-.6,.8)*cellP+vec2(9.4,3.3-ev))+.15*noise(3.7*cellP+vec2(1.3,7.9));
    veil*=(1.0-uCirB.z)+uCirB.z*smoothstep(.32,.75,cell);
    vec3 material=min(uMilk*1.22*uTintHi,vec3(1));
    vec3 overlay=mix(2.0*c*material,1.0-2.0*(1.0-c)*(1.0-material),step(vec3(.5),c));
    c=mix(c,overlay,uPuff*veil*uCirA.w);
    c+=uMilk*veil*uPuff*uNight*.9;
  }
  c+=uMilk*clamp(f-.46,0.0,.40)*uNight*(.8+.4*uv.y);

  float z=.5*(alt+sqrt(alt*alt+4.0))+1.0;
  float airMass=1.0/(sin(radians(z))+.15*pow(z+3.885,-1.253));
  float whiteAmount=1.0-exp(-uWhiten*airMass);
  float lowSun=1.0-smoothstep(5.0,25.0,uSun.z);
  illum=mix(vec3(1),uGlowCol,.6*lowSun);
  illum=mix(illum,illum*vec3(.88,.93,1.14),uLit.z);
  c=mix(c,illum*mix(lum(c),.92,.6),whiteAmount);
  float lowBand=1.0-smoothstep(.02,.52,uv.y);
  float hazeTex=smoothstep(.30,.72,f)-.5;
  c*=1.0+.9*hazeTex*uHaze*lowBand;
  float sheet=smoothstep(.45,.95,r.y)*uDensity;
  c=mix(c,1.05*c+.015,.22*sheet);
  if(uFog>.001){
    float fogField=field(.85*A+vec2(4.1,7.7));
    float bank=smoothstep(.42,.60,.5*f+.5*fogField);
    float tatter=smoothstep(.35,.75,field(2.3*A+vec2(9.3,1.2)));
    c=mix(c,uMilk,uFog*(.10+.90*bank*(.55+.45*tatter)));
  }

  vec2 B=(uv-uGlowPos)*K;
  float d2=dot(B,B)/(uGlowSize*uGlowSize);
  c=screenRGB(c,uGlowCol*uGlow*(.60*exp(-55.0*d2)+.25*exp(-11.0*d2)));
  vec2 O=.06*(vec2(.5)-uGlowPos)*K,H=B+O;
  float hr=length(H),patch=.6+.4*noise(.9*A+vec2(12.7,3.9));
  if(uHalo>.001){
    float dy=H.y/max(hr,.0001);
    float radius=uHaloLook.x*(1.0+(.5-uGlowPos.y)*.15*dy),width=.070*uHaloLook.z;
    float envelope=smoothstep(radius-.018,radius,hr)*(1.0-smoothstep(radius,radius+1.45*width,hr));
    float x=max((hr-radius)/width,0.0);
    float phase=log(1.0+.286*.4*uHaloLook.y*x)/.286+.6*(patch-.8);
    vec3 iridescence=.5+.5*cos(6.2831*phase+vec3(0,-2.094,-4.188));
    c=screenRGB(c,iridescence*envelope*mix(vec3(1),uGlowCol,.4)*uHalo*.13*patch);
  }
  float angularUnit=uHaloLook.x/22.0;
  if(uDogs.x>.001){
    vec3 dogs=dogLobe(H,1.0,uDogs.y,angularUnit,uDogs.z)+dogLobe(H,-1.0,uDogs.y,angularUnit,uDogs.z);
    float filament=.55+.45*noise(vec2(2.2*P.x,7.0*P.y)+vec2(3.3,8.1)+t*vec2(.010,.004));
    c=screenRGB(c,dogs*patch*filament*mix(vec3(1),uGlowCol,.5)*uDogs.x*.7);
  }
  if(uCorona.x>.001){
    float distance=length(B),unit=angularUnit;
    float aureoleCore=exp(-.5*distance*distance/pow(1.4*unit,2.0));
    float width=.9*unit*mix(1.6,.8,uCorona.z);
    float mainRing=exp(-.5*pow((distance-uCorona.y)/width,2.0));
    float innerRing=exp(-.5*pow((distance-.78*uCorona.y)/width,2.0))*uCorona.z;
    vec3 ringColor=mix(vec3(.85,.72,.60),vec3(.95,.55,.35),uCorona.z);
    vec3 corona=.55*aureoleCore*vec3(.80,.86,1)+mainRing*ringColor*(.25+.35*uCorona.z)+innerRing*vec3(.55,.80,.75)*.15;
    c=screenRGB(c,corona*(.5+.5*smoothstep(.45,.70,f))*uCorona.x);
  }
  if(uRays>.001){
    float distance=max(sqrt(d2),.0001);
    vec2 direction=turn(.008*t)*B/distance;
    float n=.75*noise(direction*uRayLook.x+vec2(7.3,2.1)+.012*t)+.25*noise(direction*uRayLook.x*2.3+vec2(1.7,9.4)-.009*t);
    float beam=mix(.45,smoothstep(.30,.95,n),smoothstep(.05*uGlowSize,.22*uGlowSize,distance));
    c=screenRGB(c,uGlowCol*uRays*beam*exp(-distance*uRayLook.y));
  }
  if(uPrecip.x+uPrecip.y>.001){
    float fall=t*uPrecip.z,drop=1.0-uv.y,slant=.22*uDrift.x;
    float x=P.x-drop*slant-.010*fall*uDrift.x;
    float wobble=(noise(vec2(2.2*x,1.4*drop+.02*t))-.5)*.35;
    float envelope=noise(vec2(2.6*(x+wobble),3.7+.006*t));
    float threshold=.55-.28*uShaft.y;
    float shaft=smoothstep(threshold,threshold+.32,envelope);
    float striation=noise(vec2(13.0*x,3.0*(uv.y+.06*fall)));
    shaft*=.65+.35*smoothstep(.25,.85,striation);
    float reach=.75-.75*uShaft.z,fade=smoothstep(reach,reach+.60,uv.y);
    vec3 mid=mix(uC1,uC2,.5);float l=lum(mid),bright=smoothstep(.50,.62,l);
    vec3 mist=mix(mid,vec3(l),.5)*mix(1.10,.76,bright)+.04*(1.0-bright);
    vec3 rainTint=min(mist*vec3(.92,.96,1.03),vec3(1)),snowTint=min(mix(mist,vec3(.94,.95,.97),.55),vec3(1));
    c=mix(c,rainTint,sat(shaft*fade*.55*uPrecip.x*uShaft.x));
    c=mix(c,snowTint,sat(shaft*fade*.60*uPrecip.y*uShaft.x));
  }
  float vignette=length((uv-.5)*vec2(uRes.x/uRes.y,1));
  c*=1.0-.20*smoothstep(.6,1.3,vignette);
  if(uLutAmt>.001){
    vec3 sampleColor=clamp(c,0.0,1.0);float blue=32.0*sampleColor.b,lower=floor(blue),upper=min(lower+1.0,32.0);
    vec2 p0=vec2((33.0*lower+32.0*sampleColor.r+.5)/1089.0,(32.0*sampleColor.g+.5)/33.0);
    vec2 p1=vec2((33.0*upper+32.0*sampleColor.r+.5)/1089.0,p0.y);
    c=mix(c,mix(texture2D(uLut,p0).rgb,texture2D(uLut,p1).rgb,fract(blue)),uLutAmt);
  }
  vec3 floorColor=mix(uFloorH,uFloorZ,sat(uv.y));
  c=floorColor+c*(1.0-floorColor);
  float grain=((hash(pixel)+hash(pixel+17.13)+hash(pixel+41.77))/3.0-.5)*uGrain*1.7;
  float dither=(hash(1.7*pixel+31.0)-.5)*1.6/255.0;
  gl_FragColor=vec4(c+grain+dither,uAlpha);
}
`;

/* ── sky/adapter.js ────────────────────────────────────────────────────────── */
/* The plugin's own vocabulary on top of the independent engine.
   The plugin (and its §7 paint loop) talks in lat/lon/tz/cloudLow…, a lift
   dial, and skyState.speed. Nothing above cares: this tail translates, so
   none of the plugin's own code changes when the engine does. */

const engineApplyScene = applyScene      // the engine's own adapter
const engineApplyLift = applyLift
const engineFrameAt = frameAt
const engineDetUnit = detUnit

const SKY_SPEED = 2.5          // sky-time units per real second (shipped motion)

/* The zone follows the machine: the solar geometry reads it for the
   DST-correct hour angle, so a stale zone puts the sun in the wrong place. */
const detectTz = () => {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'America/Toronto'
  } catch (err) {
    return 'America/Toronto'
  }
}

const zScene = {
  lat: 43.6532, lon: -79.3832, place: 'Toronto', tz: detectTz(),
  cloud: 45, code: 2, wind: 9, windDir: 250, aqi: 35, temp: 12,
  /* cover by layer (0-100): the engine reads these to tell a THIN high veil
     from a low lid (cloudThinness -> the deck's character) */
  cloudLow: null, cloudMid: null, cloudHigh: null,
  aod: null, humidity: null,        // null = derived from AQI / the dials
  lift: Object.assign({}, LIFT_BASE),
  hourly: true,          // follow the wall clock
  hour: null,            // 0..24 override when hourly is false
  date: null,            // 'YYYY-MM-DD' override, null = today
}

const zCloneScene = () => Object.assign({}, zScene, { lift: Object.assign({}, zScene.lift) })

/* the engine's vocabulary, from the plugin's */
const engineSceneFrom = () => ({
  latitude: zScene.lat, longitude: zScene.lon, place: zScene.place, timeZone: zScene.tz,
  code: zScene.code, cloud: zScene.cloud, wind: zScene.wind, windDirection: zScene.windDir,
  aqi: zScene.aqi, temperature: zScene.temp,
  low: zScene.cloudLow, mid: zScene.cloudMid, high: zScene.cloudHigh,
  aod: zScene.aod, humidity: zScene.humidity,
  hourly: zScene.hourly, hour: zScene.hour, date: zScene.date, lift: zScene.lift,
})

const zApplyLift = lift => engineApplyLift(lift || zScene.lift || LIFT_BASE)

/* Apply a partial scene and push it into the engine. The engine's builder
   reads its own active scene, so this is the only coupling point. */
function zApplyScene(patch) {
  Object.assign(zScene, patch || {})
  /* a patch that carries no usable lift falls back to the shipped dial, so no
     caller can accidentally flatten the sky back to the ungraded base */
  if (!zScene.lift) zScene.lift = Object.assign({}, LIFT_BASE)
  engineApplyLift(zScene.lift)
  engineApplyScene(engineSceneFrom())
  return zCloneScene()
}

/* One frame for the current scene. */
const zFrameAt = () => engineFrameAt()

/* ---- uniform upload: the whole GL surface of the sky ---- */
function zDrawParams(gl, U, f, opts) {
  const o = opts || {}
  const look = f.look || skyState.tuning
  gl.uniform2f(U.uRes, o.width, o.height)
  gl.uniform1f(U.uDet, o.det)
  gl.uniform1f(U.uTime, o.time)
  gl.uniform1f(U.uAlpha, o.alpha == null ? 1 : o.alpha)
  gl.uniform3f(U.uC0, f.cols[0][0], f.cols[0][1], f.cols[0][2])
  gl.uniform3f(U.uC1, f.cols[1][0], f.cols[1][1], f.cols[1][2])
  gl.uniform3f(U.uC2, f.cols[2][0], f.cols[2][1], f.cols[2][2])
  gl.uniform3f(U.uC3, f.cols[3][0], f.cols[3][1], f.cols[3][2])
  gl.uniform2f(U.uGlowPos, f.glowPos[0], f.glowPos[1])
  gl.uniform3f(U.uGlowCol, f.glowCol[0], f.glowCol[1], f.glowCol[2])
  gl.uniform1f(U.uGlow, f.glowStr)
  gl.uniform1f(U.uGlowSize, f.glowSize)
  gl.uniform1f(U.uDensity, f.dens)
  gl.uniform1f(U.uWarp, look.warp)
  gl.uniform1f(U.uGrain, look.grain)
  gl.uniform2f(U.uDrift, f.drift[0], f.drift[1])
  /* callers that do not integrate fall back to the old drift × time */
  const off = o.driftOff || [f.drift[0] * o.time, f.drift[1] * o.time]
  if (U.uDriftOff) gl.uniform2f(U.uDriftOff, off[0], off[1])
  gl.uniform3f(U.uPrecip, f.precip[0], f.precip[1], f.precip[2])
  gl.uniform3f(U.uShaft, look.shaft.strength, look.shaft.coverage, look.shaft.reach)
  gl.uniform1f(U.uFog, f.fog)
  gl.uniform3f(U.uMilk, f.milk[0], f.milk[1], f.milk[2])
  gl.uniform1f(U.uDeck, f.deck)
  gl.uniform1f(U.uPuff, f.puff)
  gl.uniform1f(U.uNight, f.night)
  gl.uniform1f(U.uHaze, f.haze)
  gl.uniform1f(U.uSquash, f.squash)
  gl.uniform3f(U.uTint, f.tint[0], f.tint[1], f.tint[2])
  gl.uniform1f(U.uRays, f.rays)
  gl.uniform2f(U.uRayLook, look.rays.scale, look.rays.falloff)
  gl.uniform1f(U.uHalo, f.halo)
  gl.uniform3f(U.uHaloLook, look.halo.radius, look.halo.dispersion, 1.0)
  gl.uniform1f(U.uLutAmt, look.lutAmount)
  gl.uniform1f(U.uTexV, f.grade && f.grade.textureVibrancy != null ? f.grade.textureVibrancy : 1)
  const ci = look.cirrus
  gl.uniform4f(U.uCirA, ci.angle * Math.PI / 180, ci.variance * Math.PI / 180, ci.fiber, ci.opacity)
  gl.uniform4f(U.uCirB, ci.bias, ci.evolution, ci.breakDepth, ci.grain)
  gl.uniform3f(U.uSun, f.sun[0], f.sun[1], f.sun[2])
  gl.uniform1f(U.uPolar, f.polar)
  gl.uniform2f(U.uAureole, f.aureole[0], f.aureole[1])
  gl.uniform1f(U.uWhiten, f.whiten)
  gl.uniform3f(U.uPurple, f.purple[0], f.purple[1], f.purple[2])
  gl.uniform2f(U.uCrep, f.crep, look.purity.scale)
  gl.uniform3f(U.uLit, f.lit[0], f.lit[1], f.lit[2])
  gl.uniform3f(U.uTintHi, f.tintHi[0], f.tintHi[1], f.tintHi[2])
  gl.uniform3f(U.uFloorZ, f.floorZ[0], f.floorZ[1], f.floorZ[2])
  gl.uniform3f(U.uFloorH, f.floorH[0], f.floorH[1], f.floorH[2])
  gl.uniform3f(U.uDogs, f.dogs[0], f.dogs[1], f.dogs[2])
  gl.uniform3f(U.uCorona, f.corona[0], f.corona[1], f.corona[2])
  gl.drawArrays(gl.TRIANGLES, 0, 3)
}

/* The engine's vertex shader names its attribute aPosition; the vendored sky
   this replaced said aPos, and the plugin binds the slot by name. */
const ATTRIB = 'aPosition'

/* The shader declares 47 uniforms. The plugin's field-cache variant adds
   uDriftOff (the integrated drift it feeds instead of t × drift), so the
   location list carries it too. */
const SKY_UNIFORM_NAMES = UNIFORM_NAMES.concat(['uDriftOff'])

/* Detail unit in device px: the tighter of height and width/reference aspect,
   slid toward the height rule by the composition tuning. The engine rejects a
   non-positive size; the plugin's paint loop must survive a minimised window,
   so a bad size collapses to the old tolerant answer (1 device px). */
function zDetUnit(w, h) {
  if (!Number.isFinite(w) || !Number.isFinite(h) || w <= 0 || h <= 0) return 1
  const c = skyState.tuning.composition
  return engineDetUnit(w, h, c.referenceAspect, c.crop)
}

/* the plugin reads only .speed off this, and it is the motion convention the
   plugin's own timer uses */
skyState.speed = SKY_SPEED

return {
  FRAG: FRAG,
  VERT: VERT,
  UNIFORM_NAMES: SKY_UNIFORM_NAMES,
  ATTRIB: ATTRIB,
  SCENE: zScene,
  LIFT_BASE: LIFT_BASE,
  cloneScene: zCloneScene,
  applyScene: zApplyScene,
  frameAt: zFrameAt,
  drawParams: zDrawParams,
  applyLift: zApplyLift,
  GRADE_BASE: GRADE_BASE,
  detUnit: zDetUnit,
  SKY2: SKY2,
  solarGeom: solarGeom,
  moonIllum: moonIllum,
  bodyY: bodyY,
  sunScreenPos: sunScreenPos,
  skyGlow: skyGlow,
  effAod: effAod,
  effCloud: effCloud,
  effCode: effCode,
  turbidity: turbidity,
  daySeed: daySeed,
  skyState: skyState
}
})();

/* ── Sky: a WebGL fragment shader on the sky root ──────────────────────────
   SKY_ENGINE (above) renders the sky: one full-screen fragment program over a
   physically baked colour table. This function owns the lifecycle and cost.

   Why it is cheap: the picture is a soft, slowly evolving field, so
     * it renders into a SMALL canvas (QUALITY.res of the window in CSS px,
       never device px) and the compositor scales it up for free;
     * it renders a few frames a second (QUALITY.fps) off a plain timer, not a
       60-144 Hz requestAnimationFrame loop that wakes up only to skip;
     * the colour table is rebuilt every few seconds, not every frame;
     * a frame that nothing changed is never drawn, and nothing runs while the
       window is hidden.
   Every frame the sky changes, every frosted surface over it re-samples, so
   few frames is the saving that multiplies through the whole app.

   Blur happens inside WebGL, not as a CSS filter: the sky renders into a
   small texture, and a two-pass gaussian (9 linear taps each way) draws it to
   the canvas. Blurring a few hundred thousand texels is nearly free, edges
   clamp instead of pulling dark in, and a blur change eases over
   BLUR_FADE_MS by re-running ONLY the blur passes on the frame it already has. */
const createSky = (opts = {}) => {
  if (typeof document === 'undefined' || !document.body) return null
  const HS = SKY_ENGINE
  const quality = QUALITY[opts.quality] || QUALITY.balanced
  const BUILD_TTL_MS = 4000
  const BLUR_FADE_MS = 1400
  const BLUR_MAX = 24
  /* the whole sky sits a step darker than the engine's base grade, so the app's
     panels and text keep their contrast over it (1 = the engine's brightness) */
  const SKY_DIM = 0.86
  const id = opts.id || 'zephyr-gl-sky'

  const canvas = document.createElement('canvas')
  let gl = null
  try {
    gl = canvas.getContext('webgl', { alpha: false, antialias: false, depth: false, stencil: false, powerPreference: 'low-power' })
      || canvas.getContext('experimental-webgl')
  } catch (err) { gl = null }
  if (!gl) {
    opts.onError?.('[zephyr] WebGL unavailable, no sky')
    return null
  }

  /* FIELD CACHE. The domain-warped cloud field (5 fbm = 20 value-noise
     lookups a pixel, most of the sky's cost) only ever moves two ways: it
     advects with the wind (a pure translation, pw = p - driftOff) and it
     morphs very slowly with uTime. So it is rendered into a world-space
     texture a little larger than the screen, a snapshot every FIELD_T of sky
     time, and the main pass samples it at pw, blending the two snapshots
     either side of now. Drift stays exact (sub-texel translation), the morph
     is a linear blend over ~1.6 s, and the per-frame shader loses the warp.
     The FRAG is not forked: the variant is a text transform here. */
  const FIELD_T = 4            // sky-time units between snapshots (speed 2.5 => 1.6 s)
  /* The engine advects the field by t × drift. The plugin integrates drift
     itself (so a wind change never teleports the clouds), so the two drift
     terms in the FRAG are swapped for the integrated uDriftOff. */
  const DRIFT_SWAPS = [[/-.018\*t\*uDrift/g, '-.018*uDriftOff'], [/-.007\*t\*uDrift/g, '-.007*uDriftOff']]
  const WARP_START = '  vec2 q=vec2(field(A+t*vec2(.010,.006))'
  const WARP_END = '  float f=mix(field(1.1*A+.8*uWarp*r),.5,.35);\n'
  let fieldSrc = null
  {
    let frag = HS.FRAG
    for (const [re, to] of DRIFT_SWAPS) frag = frag.replace(re, to)
    const a = frag.indexOf(WARP_START)
    const b = frag.indexOf(WARP_END, a)
    const u = frag.indexOf('void main(){')
    if (a > 0 && b > a && u > 0) {
      const warp = frag.slice(a, b + WARP_END.length)
      const decl = 'uniform vec2 uFieldOrg; uniform vec2 uFieldSize; uniform vec2 uFieldRes;\n' +
        'uniform sampler2D uFieldA; uniform sampler2D uFieldB;\n' +
        'uniform vec4 uFieldBoxA; uniform vec4 uFieldBoxB; uniform float uFieldMix;\n' +
        'uniform vec2 uDriftOff;\n'
      const body =
        '#ifdef ZF_FIELD\n' +
        '  A = uFieldOrg + (gl_FragCoord.xy / uFieldRes) * uFieldSize;\n' +
        warp +
        '  float fq = clamp(f, 0.0, 0.999);\n' +
        '  float fhi = floor(fq * 255.0) / 255.0;\n' +   // f as 16 bits: hi + lo/255, linear so bilinear stays exact
        '  gl_FragColor = vec4(fhi, (fq - fhi) * 255.0, clamp(r.y, 0.0, 1.0), 1.0);\n' +
        '  return;\n' +
        '#else\n' +
        '  vec3 fsA = texture2D(uFieldA, (A - uFieldBoxA.xy) / uFieldBoxA.zw).rgb;\n' +
        '  vec3 fsB = texture2D(uFieldB, (A - uFieldBoxB.xy) / uFieldBoxB.zw).rgb;\n' +
        '  vec3 fs = mix(fsA, fsB, uFieldMix);\n' +
        '  float f = fs.r + fs.g / 255.0;\n' +
        '  vec2 r = vec2(0.0, fs.b);\n' +
        '#endif\n'
      fieldSrc = frag.slice(0, u) + decl + frag.slice(u, a) + body + frag.slice(b + WARP_END.length)
    }
  }

  let program = null
  let fieldProg = null
  try {
    const shader = (type, src) => {
      const s = gl.createShader(type)
      gl.shaderSource(s, src)
      gl.compileShader(s)
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(String(gl.getShaderInfoLog(s)))
      return s
    }
    const link = frag => {
      const pr = gl.createProgram()
      gl.attachShader(pr, shader(gl.VERTEX_SHADER, HS.VERT))
      gl.attachShader(pr, shader(gl.FRAGMENT_SHADER, frag))
      gl.linkProgram(pr)
      if (!gl.getProgramParameter(pr, gl.LINK_STATUS)) throw new Error(String(gl.getProgramInfoLog(pr)))
      return pr
    }
    if (fieldSrc && opts.fieldCache !== false) {
      try {
        program = link(fieldSrc)
        fieldProg = link('#define ZF_FIELD 1\n' + fieldSrc)
      } catch (err) {
        opts.onError?.('[zephyr] field cache off: ' + err.message)
        program = null
        fieldProg = null
      }
    }
    if (!program) program = link(HS.FRAG)
  } catch (err) {
    opts.onError?.('[zephyr] sky shader failed: ' + err.message)
    return null
  }
  gl.useProgram(program)
  console.info?.('[zephyr] sky engine up: ' + gl.getParameter(gl.VERSION) + ', ' + quality.fps + 'fps, ' + quality.res + 'x css px')

  const U = {}
  for (const name of HS.UNIFORM_NAMES) U[name] = gl.getUniformLocation(program, name)
  const UF = {}
  if (fieldProg) {
    for (const name of HS.UNIFORM_NAMES) UF[name] = gl.getUniformLocation(fieldProg, name)
    for (const name of ['uFieldOrg', 'uFieldSize', 'uFieldRes']) UF[name] = gl.getUniformLocation(fieldProg, name)
    for (const name of ['uFieldA', 'uFieldB', 'uFieldBoxA', 'uFieldBoxB', 'uFieldMix']) U[name] = gl.getUniformLocation(program, name)
    gl.uniform1i(U.uFieldA, 2)
    gl.uniform1i(U.uFieldB, 3)
    gl.useProgram(fieldProg)
    if (UF.uLut) gl.uniform1i(UF.uLut, 1)   // never leave a sampler on unit 0 (feedback-loop guard)
    gl.useProgram(program)
  }

  /* The owner-graded 3D LUT is not ported: one white texel, uLutAmt 0. */
  const texel = gl.createTexture()
  gl.activeTexture(gl.TEXTURE1)
  gl.bindTexture(gl.TEXTURE_2D, texel)
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, 1, 1, 0, gl.RGB, gl.UNSIGNED_BYTE, new Uint8Array([255, 255, 255]))
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
  gl.uniform1i(U.uLut, 1)
  gl.activeTexture(gl.TEXTURE0)

  const buffer = gl.createBuffer()
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer)
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW)
  /* the engine's vertex shader names its attribute aPosition (the vendored one
     said aPos). Without this the slot is -1, nothing rasterizes and the sky is
     a black canvas with the CSS backdrop switched off — so say so and fall back
     to the gradient instead. */
  const aPos = gl.getAttribLocation(program, HS.ATTRIB || 'aPos')
  if (aPos < 0) {
    opts.onError?.('[zephyr] sky vertex attribute "' + (HS.ATTRIB || 'aPos') + '" not found, no sky')
    return null
  }
  gl.enableVertexAttribArray(aPos)
  gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0)

  /* the blur: one program, run once across and once down */
  let blurProg = null
  try {
    const sh = (type, src) => {
      const o = gl.createShader(type)
      gl.shaderSource(o, src)
      gl.compileShader(o)
      if (!gl.getShaderParameter(o, gl.COMPILE_STATUS)) throw new Error(String(gl.getShaderInfoLog(o)))
      return o
    }
    blurProg = gl.createProgram()
    gl.bindAttribLocation(blurProg, aPos, 'aPos')
    gl.attachShader(blurProg, sh(gl.VERTEX_SHADER,
      'attribute vec2 aPos; varying vec2 vUv; void main() { vUv = aPos * 0.5 + 0.5; gl_Position = vec4(aPos, 0.0, 1.0); }'))
    gl.attachShader(blurProg, sh(gl.FRAGMENT_SHADER, [
      'precision mediump float;',
      'uniform sampler2D uTex; uniform vec2 uStep; uniform float uDim; varying vec2 vUv;',
      'void main() {',
      // the same 9-tap gaussian in 5 fetches: each pair of neighbouring taps
      // is one bilinear fetch placed between them by weight (exact while the
      // step is under a texel apart, close enough beyond, all under blur)
      '  vec3 c = texture2D(uTex, vUv).rgb;',
      '  c += (texture2D(uTex, vUv + uStep * 1.4073).rgb + texture2D(uTex, vUv - uStep * 1.4073).rgb) * 1.4890;',
      '  c += (texture2D(uTex, vUv + uStep * 3.2941).rgb + texture2D(uTex, vUv - uStep * 3.2941).rgb) * 0.4600;',
      '  gl_FragColor = vec4(c * (uDim / 4.898), 1.0);',
      '}'].join('\n')))
    gl.linkProgram(blurProg)
    if (!gl.getProgramParameter(blurProg, gl.LINK_STATUS)) throw new Error(String(gl.getProgramInfoLog(blurProg)))
  } catch (err) {
    opts.onError?.('[zephyr] sky blur unavailable: ' + err.message)
    blurProg = null
  }
  const uTex = blurProg && gl.getUniformLocation(blurProg, 'uTex')
  const uStep = blurProg && gl.getUniformLocation(blurProg, 'uStep')
  const uDim = blurProg && gl.getUniformLocation(blurProg, 'uDim')
  const target = () => {
    const tex = gl.createTexture()
    gl.bindTexture(gl.TEXTURE_2D, tex)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
    const fb = gl.createFramebuffer()
    return { tex, fb, w: 0, h: 0 }
  }
  const fit = (t, w, h) => {
    if (t.w === w && t.h === h) return
    gl.bindTexture(gl.TEXTURE_2D, t.tex)
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null)
    gl.bindFramebuffer(gl.FRAMEBUFFER, t.fb)
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, t.tex, 0)
    gl.bindFramebuffer(gl.FRAMEBUFFER, null)
    t.w = w
    t.h = h
  }
  const rtSky = blurProg ? target() : null
  const rtMid = blurProg ? target() : null

  /* field snapshots: A at time A.t, B at A.t + FIELD_T; box = [org, size] in pw units */
  let fieldA = fieldProg ? target() : null
  let fieldB = fieldProg ? target() : null
  if (fieldA) { fieldA.t = -1e9; fieldA.box = [0, 0, 1, 1]; fieldB.t = -1e9; fieldB.box = [0, 0, 1, 1] }
  let fieldStale = true
  const DRIFT_PW = 0.018       // the FRAG's pw = p - uDriftOff * 0.018
  /* the pw window the screen shows at sky time s (extrapolating the drift) */
  const screenBox = s => {
    const det = HS.detUnit(canvas.width, canvas.height)
    const kx = canvas.width / det
    const ky = canvas.height / det
    const d = run.frame ? run.frame.drift : [0, 0]
    const ox = run.driftOff[0] + d[0] * (s - run.slowT)
    const oy = run.driftOff[1] + d[1] * (s - run.slowT)
    return { cx: -ox * DRIFT_PW, cy: -oy * DRIFT_PW, hw: kx / 2, hh: ky / 2, det }
  }
  const renderField = (t, s) => {
    const sb = screenBox(s)
    const d = run.frame ? run.frame.drift : [0, 0]
    // enough margin for a whole period of drift either side, plus a texel or two
    const m = Math.hypot(d[0], d[1]) * DRIFT_PW * FIELD_T * 1.15 + 3 / sb.det
    const w = 2 * (sb.hw + m)
    const h = 2 * (sb.hh + m)
    const cap = 1.5   // never more than 1.5x the canvas a side, even in a gale
    const fw = Math.max(2, Math.min(Math.round(w * sb.det), Math.round(canvas.width * cap)))
    const fh = Math.max(2, Math.min(Math.round(h * sb.det), Math.round(canvas.height * cap)))
    fit(t, fw, fh)
    t.box = [sb.cx - w / 2, sb.cy - h / 2, w, h]
    t.t = s
    gl.bindFramebuffer(gl.FRAMEBUFFER, t.fb)
    gl.viewport(0, 0, fw, fh)
    gl.useProgram(fieldProg)
    gl.uniform2f(UF.uFieldOrg, t.box[0], t.box[1])
    gl.uniform2f(UF.uFieldSize, w, h)
    gl.uniform2f(UF.uFieldRes, fw, fh)
    HS.drawParams(gl, UF, run.frame, {
      width: canvas.width, height: canvas.height, det: sb.det,
      time: s, driftOff: run.driftOff, alpha: 1,
    })
    gl.bindFramebuffer(gl.FRAMEBUFFER, null)
  }
  const covers = (t, s) => {
    const sb = screenBox(s)
    const [x, y, w, h] = t.box
    return sb.cx - sb.hw >= x && sb.cx + sb.hw <= x + w && sb.cy - sb.hh >= y && sb.cy + sb.hh <= y + h
  }
  /* keep A <= now < B; one field pass per FIELD_T, two after a reset */
  const updateField = () => {
    if (!fieldA || !run.frame) return
    const s = run.slowT
    if (fieldStale || s < fieldA.t || s > fieldB.t + FIELD_T) {
      renderField(fieldA, s)
      renderField(fieldB, s + FIELD_T)
      fieldStale = false
      return
    }
    if (s >= fieldB.t) {
      const swap = fieldA
      fieldA = fieldB
      fieldB = swap
      renderField(fieldB, fieldA.t + FIELD_T)
    }
    // a wind shift can carry the screen out of a snapshot: redraw just that one
    if (!covers(fieldA, s)) renderField(fieldA, fieldA.t)
    if (!covers(fieldB, s)) renderField(fieldB, fieldB.t)
  }

  const root = document.createElement('div')
  root.id = id
  root.setAttribute('aria-hidden', 'true')
  const style = document.createElement('style')
  style.id = id + '-style'
  style.textContent =
    '#' + id + ' { position: fixed; inset: 0; z-index: -1; pointer-events: none; overflow: hidden; background: #05070d; contain: strict; }' +
    '#' + id + ' canvas { position: absolute; inset: 0; width: 100%; height: 100%; display: block; }'
  root.appendChild(canvas)
  document.head.appendChild(style)
  document.body.appendChild(root)

  const clamp = (x, a, b) => Math.min(b, Math.max(a, x))
  const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now())

  let liftNow = Object.assign({}, HS.LIFT_BASE, opts.lift || {})
  const scene = { cover: 30, low: 30, mid: 0, high: 0, code: 2, aod: null, wind: 9, windDir: 250 }
  const want = { ...scene }
  const live = { lat: opts.lat ?? 43.65, lng: opts.lng ?? -79.38, fade: 0, clock: null, fast: false, hold: null }
  const run = { on: false, disposed: false, timer: 0, last: 0, lastSky: -1e9, builtAt: -1e9, dirty: true, frame: null, fps: quality.fps, slowT: 1.5, driftOff: [0, 0], blur: 0, blurTo: 0, blurFrom: 0, blurT0: 0, sized: 0, dim: opts.dim ?? SKY_DIM }

  /* Weather weights (the plugin's genera weights) → the engine's builder inputs:
     cover by LAYER and a WMO code. The raw weights stack (a storm sums to ~3),
     so LID_SCALE normalises them onto the 0-1 cover axis. */
  const LID_SCALE = 3.1
  const layersFrom = w => {
    const low = ((w.cu || 0) + (w.sc || 0) + (w.st || 0)) / LID_SCALE
    const mid = ((w.ac || 0) + (w.as || 0)) / LID_SCALE
    const high = ((w.ci || 0) + (w.cc || 0) + (w.cs || 0)) / LID_SCALE
    return { low, mid, high, total: low + mid + high, lid: low + mid }
  }
  const codeFrom = (w, l) =>
    (w.haze || 0) > 0.5 ? 45
      : (w.rain || 0) > 0.6 ? 95
        : (w.rain || 0) > 0.2 ? 63
          : l.lid > 0.72 ? 3 : l.lid > 0.36 ? 2 : l.lid > 0.12 ? 1 : 0

  const dateKey = d =>
    d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0')

  const stepScene = dt => {
    const k = live.fade > 0 ? clamp(dt / live.fade, 0, 1) : 1
    let moved = false
    for (const key of ['cover', 'low', 'mid', 'high', 'wind', 'windDir']) {
      const next = scene[key] + (want[key] - scene[key]) * k
      if (Math.abs(next - scene[key]) > 0.01) moved = true
      scene[key] = next
    }
    scene.aod = want.aod
    const code = Math.abs(scene.cover - want.cover) < 1.5 ? want.code : scene.code
    if (code !== scene.code) moved = true
    scene.code = code
    if (moved) run.dirty = true
  }

  const build = t => {
    const d = live.clock ? live.clock() : live.hold ? new Date(live.hold) : new Date()
    HS.applyScene({
      hourly: false,
      hour: d.getHours() + d.getMinutes() / 60 + d.getSeconds() / 3600,
      date: dateKey(d),
      lat: live.lat, lon: live.lng,
      lift: liftNow,
      cloud: scene.cover, code: scene.code, aod: scene.aod,
      cloudLow: scene.low, cloudMid: scene.mid, cloudHigh: scene.high,
      wind: scene.wind, windDir: scene.windDir,
    })
    run.frame = HS.frameAt()
    run.builtAt = t
    run.dirty = false
  }

  const drawSky = fb => {
    gl.bindFramebuffer(gl.FRAMEBUFFER, fb)
    gl.viewport(0, 0, canvas.width, canvas.height)
    gl.useProgram(program)
    if (fieldA) {
      if (fieldStale || fieldA.w === 0) updateField()
      gl.useProgram(program)
      gl.viewport(0, 0, canvas.width, canvas.height)
      gl.bindFramebuffer(gl.FRAMEBUFFER, fb)
      gl.activeTexture(gl.TEXTURE2)
      gl.bindTexture(gl.TEXTURE_2D, fieldA.tex)
      gl.activeTexture(gl.TEXTURE3)
      gl.bindTexture(gl.TEXTURE_2D, fieldB.tex)
      gl.activeTexture(gl.TEXTURE0)
      gl.uniform4f(U.uFieldBoxA, fieldA.box[0], fieldA.box[1], fieldA.box[2], fieldA.box[3])
      gl.uniform4f(U.uFieldBoxB, fieldB.box[0], fieldB.box[1], fieldB.box[2], fieldB.box[3])
      gl.uniform1f(U.uFieldMix, clamp((run.slowT - fieldA.t) / Math.max(1e-3, fieldB.t - fieldA.t), 0, 1))
    }
    HS.drawParams(gl, U, run.frame, {
      width: canvas.width,
      height: canvas.height,
      det: HS.detUnit(canvas.width, canvas.height),
      time: run.slowT,
      driftOff: run.driftOff,
      alpha: 1,
    })
  }
  /* skyFresh: re-run the sky shader; otherwise only the blur passes re-run */
  const paint = (skyFresh = true) => {
    if (!run.frame) return
    const sigma = run.blur * canvas.width / Math.max(1, window.innerWidth) // css px → texels
    if (!blurProg || sigma < 0.35) {
      // no blur: draw straight to the canvas and dim in the blend unit,
      // instead of two do-nothing blur passes just to carry uDim
      if (run.dim < 1) {
        gl.enable(gl.BLEND)
        gl.blendFunc(gl.CONSTANT_COLOR, gl.ZERO)
        gl.blendColor(run.dim, run.dim, run.dim, 1)
      }
      drawSky(null)
      gl.disable(gl.BLEND)
      run.skyInRt = false
      return
    }
    fit(rtSky, canvas.width, canvas.height)
    fit(rtMid, canvas.width, canvas.height)
    if (skyFresh || !run.skyInRt) drawSky(rtSky.fb)
    run.skyInRt = true
    const step = sigma < 0.35 ? 0 : sigma / 2 // 9 taps at ±4 steps reach ±2σ
    gl.useProgram(blurProg)
    gl.uniform1i(uTex, 0)
    gl.uniform1f(uDim, 1)
    gl.activeTexture(gl.TEXTURE0)
    gl.bindFramebuffer(gl.FRAMEBUFFER, rtMid.fb)
    gl.bindTexture(gl.TEXTURE_2D, rtSky.tex)
    gl.uniform2f(uStep, step / canvas.width, 0)
    gl.drawArrays(gl.TRIANGLES, 0, 3)
    gl.bindFramebuffer(gl.FRAMEBUFFER, null)
    gl.bindTexture(gl.TEXTURE_2D, rtMid.tex)
    gl.uniform1f(uDim, run.dim)
    gl.uniform2f(uStep, 0, step / canvas.height)
    gl.drawArrays(gl.TRIANGLES, 0, 3)
  }

  /* canvas px per CSS px. Under a heavy blur there is no detail left to draw,
     so the canvas shrinks with it (to half at the largest blur). It is sized
     for the blur being faded TO, once per change, not on every fade step. */
  const resize = () => {
    const blurK = 1 - 0.5 * clamp((run.blurTo - 4) / 12, 0, 1)
    const k = quality.res * blurK
    const cw = window.innerWidth
    const ch = window.innerHeight
    const s = Math.min(k, quality.maxSide / Math.max(cw, ch))
    const w = Math.max(2, Math.round(cw * s))
    const h = Math.max(2, Math.round(ch * s))
    if (canvas.width === w && canvas.height === h) return false
    canvas.width = w
    canvas.height = h
    run.skyInRt = false
    fieldStale = true
    return true
  }

  const fading = () => run.blur !== run.blurTo
  /* the day preview runs smooth; a window you are not using drifts at 1 fps */
  const curFps = () => live.fast ? Math.max(run.fps, 15)
    : (typeof document.hasFocus === 'function' && !document.hasFocus()) ? Math.min(run.fps, 1) : run.fps
  const stepBlur = t => {
    if (!fading()) return
    const k = clamp((t - run.blurT0) / BLUR_FADE_MS, 0, 1)
    const e = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2 // ease in-out
    run.blur = k >= 1 ? run.blurTo : run.blurFrom + (run.blurTo - run.blurFrom) * e
  }

  const frame = () => {
    run.timer = 0
    if (run.disposed || !run.on) return
    const t = now()
    if (!document.hidden) {
      const fps = curFps()
      const skyDue = t - run.lastSky >= 1000 / fps - 4
      const wasFading = fading()
      stepBlur(t)
      if (skyDue) {
        const dt = clamp((t - run.last) / 1000, 0, 2)
        run.last = t
        run.lastSky = t
        const adv = dt * (HS.skyState.speed || 1)
        run.slowT += adv
        /* integrate the drift instead of drift × total time: the wind eases
           and the weather drifts, and with drift × t every small change
           shifted the whole field by Δdrift × (hours of t) at the next
           rebuild, which read as clouds jumping back */
        if (run.frame) {
          run.driftOff[0] += run.frame.drift[0] * adv
          run.driftOff[1] += run.frame.drift[1] * adv
        }
        stepScene(dt)
        /* a fast clock (the day preview) moves the sun every frame */
        if (live.fast || run.dirty || !run.frame || t - run.builtAt > BUILD_TTL_MS) build(t)
        updateField()
      }
      if (resize()) paint(true)
      else if (skyDue || wasFading) paint(skyDue)
    } else {
      run.last = t
    }
    schedule()
  }

  const schedule = () => {
    if (run.timer || !run.on || run.disposed) return
    const fps = curFps()
    /* a blur fade runs its passes at 30 fps; the sky keeps its own pace */
    const wait = fading() ? 1000 / 30 : Math.max(0, run.lastSky + 1000 / fps - now())
    run.timer = setTimeout(frame, wait)
  }
  const reschedule = () => { clearTimeout(run.timer); run.timer = 0; schedule() }
  const onVisible = () => {
    if (document.hidden || !run.on) return
    run.last = now()          // no catch-up jump after the window comes back
    reschedule()
  }
  const onResize = () => { if (resize()) paint(true) }
  document.addEventListener('visibilitychange', onVisible)
  window.addEventListener('resize', onResize)
  window.addEventListener('focus', onVisible)

  resize()
  build(now())
  paint(true)

  return {
    canvas: root,
    start() {
      if (run.disposed) return
      run.on = true
      run.last = now()
      schedule()
    },
    stop() {
      run.on = false
      clearTimeout(run.timer)
      run.timer = 0
    },
    dispose() {
      run.disposed = true
      run.on = false
      clearTimeout(run.timer)
      run.timer = 0
      document.removeEventListener('visibilitychange', onVisible)
      window.removeEventListener('resize', onResize)
      window.removeEventListener('focus', onVisible)
      root.remove()
      style.remove()
      run.frame = null
      const lose = gl.getExtension?.('WEBGL_lose_context')
      for (const t of [rtSky, rtMid, fieldA, fieldB]) if (t) { gl.deleteFramebuffer?.(t.fb); gl.deleteTexture?.(t.tex) }
      gl.deleteProgram?.(blurProg)
      if (fieldProg) gl.deleteProgram?.(fieldProg)
      gl.deleteBuffer?.(buffer)
      gl.deleteTexture?.(texel)
      gl.deleteProgram?.(program)
      lose?.loseContext?.()
    },
    setWeather(weights, fadeSeconds = 25, instant = false) {
      const w = weights || {}
      const l = layersFrom(w)
      want.cover = clamp(l.total * 100, 7, 100)
      want.low = l.low * 100
      want.mid = l.mid * 100
      want.high = l.high * 100
      want.code = codeFrom(w, l)
      want.aod = clamp(0.03 + 1.6 * (w.haze || 0), 0.03, 1.2)
      if (typeof w.wind === 'number') want.wind = w.wind
      live.fade = instant ? 0 : clamp(Number(fadeSeconds) || 0, 0, 900)
      if (instant) { Object.assign(scene, want); fieldStale = true }
      run.dirty = true
    },
    setWind(dir, speed) {
      if (typeof dir === 'number') want.windDir = dir
      if (typeof speed === 'number') want.wind = speed
      run.dirty = true
    },
    setLocation(lat, lng) {
      if (typeof lat === 'number' && typeof lng === 'number') {
        live.lat = lat
        live.lng = lng
        run.dirty = true
      }
    },
    /* Freeze the sun at one instant (the held sunset), or null for the wall
       clock. The sky is still redrawn every frame; only the date is pinned. */
    setHold(date) {
      const next = date instanceof Date && !Number.isNaN(date.getTime()) ? date.getTime() : null
      if (next === live.hold) return
      live.hold = next
      run.dirty = true
      reschedule()
    },
    /* a fast clock drives the day preview; anything else is the wall clock
       (the preview hands back `() => new Date()`, which must not keep the
       per-frame rebuild running forever) */
    setClock(fn, fast = false) {
      live.fast = Boolean(fast) && typeof fn === 'function'
      live.clock = live.fast ? fn : null
      run.dirty = true
      reschedule()
    },
    setLift(lift) {
      liftNow = Object.assign({}, HS.LIFT_BASE, lift)
      run.dirty = true
    },
    /* brightness, 0.5-1 (1 = the engine's own grade) */
    setDim(k) {
      run.dim = clamp(Number(k) || 1, 0.5, 1)
      paint(false)
    },
    setFps(n) {
      run.fps = clamp(Number(n) || quality.fps, 0.2, 30)
      reschedule()
    },
    /* Soften the sky by `px` CSS px (a gaussian σ, like CSS blur()). The
       change eases over BLUR_FADE_MS; only the cheap blur passes re-run. */
    setBlur(px, fadeMs = BLUR_FADE_MS) {
      const b = Math.round(clamp(Number(px) || 0, 0, BLUR_MAX) * 10) / 10
      if (b === run.blurTo) return            // the plugin calls this once a second
      const instant = !run.on || !(fadeMs > 0) ||
        (typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches)
      run.blurFrom = run.blur
      run.blurTo = b
      run.blurT0 = now()
      if (instant) run.blur = b
      if (resize() || instant) paint(true)
      reschedule()
    },
  }
}

// ════════════════════════════════════════════════════════════════════════

// ══ §7 SKY PAINTING, THEMES, SOLAR & WEATHER SYNC ══════════════════════════

// The sky drifts slowly, so it is sampled on a 5-minute grid and the <style> is
// only rewritten when its text actually changes. Each rewrite forces a full
// style recalc of the app, so this cuts that cost by ~5x.
const SKY_STEP_MS = 5 * 60 * 1000

const paintSky = (date, gl = false) => {
  if (typeof document === 'undefined') return

  let el = document.getElementById(SKY_STYLE_ID)

  if (!el) {
    el = document.createElement('style')
    el.id = SKY_STYLE_ID
    document.head.appendChild(el)
  }

  const quantized = new Date(Math.floor(date.getTime() / SKY_STEP_MS) * SKY_STEP_MS)
  const next = skyStyleFor(quantized, gl)
  if (el.textContent !== next) el.textContent = next
}

const clearSky = () => {
  if (typeof document === 'undefined') return
  const el = document.getElementById(SKY_STYLE_ID)

  if (el) el.remove()
}

const phaseThemeName = phase => `zephyr-${phase}`

const themeFor = phase => ({
  name: phaseThemeName(phase),
  label: `Zephyr ${phase[0].toUpperCase()}${phase.slice(1)}`,
  description: `Sky-lit: the ${phase} sky shows through every surface. Zephyr follows the clock.`,
  colors: GROUNDS[phase]
})

const PHASE_BLURB = {
  dawn: 'before sunrise',
  day: 'daylight',
  dusk: 'after sunset',
  night: 'after dark'
}

const syncSolar = async ctx => {
  if (typeof fetch === 'undefined') return
  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || 'America/Toronto'
    const cached = ctx.storage.get('solar', null)
    if (cached && cached.date === new Date().toDateString() && cached.tz === tz) {
      liveSolar = cached
      return
    }
    const city = tz.split('/').pop()?.replace(/_/g, ' ') || 'Toronto'
    const geoRes = await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(city)}&count=1`)
    if (!geoRes.ok) return
    const geoData = await geoRes.json()
    const loc = geoData.results?.[0]
    if (!loc) return
    const weatherRes = await fetch(
      `https://api.open-meteo.com/v1/forecast?latitude=${loc.latitude}&longitude=${loc.longitude}&daily=sunrise,sunset&timezone=auto`
    )
    if (!weatherRes.ok) return
    const weatherData = await weatherRes.json()
    const todaySunrise = weatherData.daily?.sunrise?.[0]
    const todaySunset = weatherData.daily?.sunset?.[0]
    if (todaySunrise && todaySunset) {
      const riseD = new Date(todaySunrise)
      const setD = new Date(todaySunset)
      const rise = riseD.getHours() + riseD.getMinutes() / 60
      const set = setD.getHours() + setD.getMinutes() / 60
      liveSolar = { rise, set, tz, lat: loc.latitude, lng: loc.longitude, date: new Date().toDateString() }
      ctx.storage.set('solar', liveSolar)
    }
  } catch {
    // Keep baseline solar times if network unavailable
  }
}

// Live weather for the GL sky: real low/mid/high cloud fractions, WMO code,
// wind and visibility, refreshed every 30 minutes and cached between runs.
const WEATHER_TTL_MS = 30 * 60 * 1000

const syncWeather = async ctx => {
  const cached = ctx.storage.get('liveWeather', null)
  if (cached && Date.now() - cached.at < WEATHER_TTL_MS) return cached.current
  if (typeof fetch === 'undefined') return cached?.current || null
  try {
    const [lat, lng] = liveSolar?.lat != null ? [liveSolar.lat, liveSolar.lng] : getApproxCoords()
    const fields = 'weather_code,cloud_cover,cloud_cover_low,cloud_cover_mid,cloud_cover_high,wind_speed_10m,wind_direction_10m,visibility'
    const res = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}&current=${fields}&timezone=auto`)
    if (!res.ok) return cached?.current || null
    const data = await res.json()
    if (!data.current) return cached?.current || null
    ctx.storage.set('liveWeather', { at: Date.now(), current: data.current })
    return data.current
  } catch {
    return cached?.current || null
  }
}

// Offline / no data: a believable weather that drifts on its own, changing
// every few hours and blending slowly, so the sky is never frozen.
const SYNTH_SEQUENCE = ['fair', 'partly', 'cirrus', 'fair', 'partly', 'cloudy', 'partly', 'clear', 'fair', 'overcast', 'partly', 'cirrus']
const synthWeather = date => {
  const block = Math.floor(date.getTime() / (3 * 3600 * 1000))
  const h = Math.imul(block ^ 0x9e3779b9, 2654435761) >>> 0
  return SYNTH_SEQUENCE[h % SYNTH_SEQUENCE.length]
}

const WEATHER_LABEL = {
  live: 'Live weather', clear: 'Clear', fair: 'Fair-weather cumulus', partly: 'Partly cloudy', cloudy: 'Cloudy',
  cirrus: 'Cirrus', overcast: 'Overcast', rain: 'Rain', storm: 'Storm', fog: 'Fog'
}

const QUALITY_ORDER = ['low', 'balanced', 'high']

function phaseAt(date) {
  const d = date instanceof Date ? date : new Date()
  const hour = d.getHours() + d.getMinutes() / 60
  const solar = getSolar(d)

  const dawnStart = Math.min(5, solar.rise - 1)
  const duskStart = solar.set + 0.25
  const duskEnd = Math.max(21, duskStart + 1.25)

  if (hour >= dawnStart && hour < solar.rise) return 'dawn'
  if (hour >= solar.rise && hour < duskStart) return 'day'
  if (hour >= duskStart && hour < duskEnd) return 'dusk'

  return 'night'
}

// ── Snippet card ───────────────────────────────────────────────────────────
// `::snippet{title="…" value="…" note="…" tone="accent"}`
// A leaf directive on its own line: attrs only, so the card stays a summary and
// the prose around it stays prose. One calm box, no chrome, in Hermes tokens.

// ══ §8 SNIPPET CARDS & PHASE CHIP ══════════════════════════════════════════

const TONES = { accent: 'accent', plain: 'plain' }

// Geometry and colour live in INLINE styles, deliberately. Tailwind compiles
// only the classes the app's own sources use, so a runtime plugin's novel
// utilities (`rounded-[0.875rem]`, `max-w-[34rem]`) never reach the stylesheet
// and silently do nothing — the first cut of this card rendered full-width and
// square because of exactly that. The tokens below are the app's real CSS vars.

// Minimal pass (2026-10-10, Peter: more in line with the theme). One calm
// strip in the sidebar-card material: the title in Hermes's section-label face
// (as PINNED / SESSIONS), the value large, the note and source quieter. The
// actions are two icons that surface on hover/focus; a pinned card keeps its
// pin lit. Accent shows only in the label colour. Classes plus one tiny
// always-on stylesheet (SNIPPET_CSS), because hover cannot be inline.
const SNIPPET_CSS = [
  '.zf-snip { position: relative; display: flex; flex-direction: column; gap: 0.2rem; max-width: 34rem; margin: 0.35rem 0;',
  '  padding: 0.6rem 0.8rem 0.65rem; border-radius: var(--zf-radius, 0.6rem); box-sizing: border-box;',
  '  background: var(--zf-side-card, var(--ui-widget-surface-background)); color: var(--zf-ink-1, var(--ui-text-secondary)); }',
  '.zf-snip-head { display: flex; align-items: center; gap: 0.5rem; min-height: 1rem; }',
  '.zf-snip-title { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;',
  '  font-size: 0.64rem; font-weight: 600; letter-spacing: 0.16em; text-transform: uppercase; color: var(--zf-ink-3, var(--ui-text-tertiary)); }',
  ".zf-snip[data-tone='accent'] .zf-snip-title { color: var(--zf-ink-0); }",
  '.zf-snip-acts { margin-left: auto; display: flex; gap: 0.1rem; opacity: 0; transition: opacity 140ms ease; }',
  '.zf-snip:is(:hover, :focus-within) .zf-snip-acts, .zf-snip-acts:has([data-on]) { opacity: 1; }',
  '.zf-snip-act { display: grid; place-items: center; width: 1.4rem; height: 1.4rem; padding: 0; border: 0; border-radius: calc(var(--zf-radius, 0.6rem) - 0.3rem);',
  '  background: transparent; color: var(--zf-ink-3, var(--ui-text-tertiary)); cursor: pointer; transition: background-color 120ms ease, color 120ms ease; }',
  '.zf-snip-act:hover, .zf-snip-act:focus-visible { background: var(--zf-hover, rgba(255,255,255,.065)); color: var(--zf-ink-0, var(--ui-text-primary)); outline: none; }',
  '.zf-snip-act[data-on] { color: var(--zf-ink-0); }',
  '.zf-snip-act .zf-snip-done { display: none; }',
  '.zf-snip-act[data-done] .zf-snip-idle { display: none; }',
  '.zf-snip-act[data-done] .zf-snip-done { display: inline-flex; color: var(--zf-ink-1); }',
  '.zf-snip-value { font-size: 0.95rem; line-height: 1.45; color: var(--zf-ink-0, var(--ui-text-primary)); font-variant-numeric: tabular-nums; overflow-wrap: anywhere; }',
  '.zf-snip-note { font-size: 0.8125rem; line-height: 1.55; color: var(--zf-ink-2, var(--ui-text-secondary)); }',
  '.zf-snip-source { font-size: 0.6875rem; color: var(--zf-ink-3, var(--ui-text-tertiary)); }',
  // no title: the actions ride the value line instead of an empty head
  '.zf-snip:not(:has(.zf-snip-title)) .zf-snip-head { position: absolute; top: 0.45rem; right: 0.5rem; }',
  '.zf-snip:not(:has(.zf-snip-title)) { padding-right: 3.4rem; }',
  '.zf-snip { cursor: pointer; user-select: none; touch-action: none; transition: background-color 120ms ease; }',
  '.zf-snip:hover { background: var(--zf-side-card-hi, var(--zf-side-card, var(--ui-widget-surface-background))); }',
  // ── Shelf, sidebar Pins, preview, drag (all plugin-owned nodes in <body>) ──
  '.zf-shelf { position: fixed; z-index: 30; left: var(--zf-sh-x); top: var(--zf-sh-y); width: var(--zf-sh-w); height: var(--zf-sh-h);',
  '  display: flex; justify-content: center; align-items: stretch; gap: 0.5rem; box-sizing: border-box; border-radius: var(--zf-radius, 0.6rem);',
  '  transition: background-color 140ms ease, opacity 160ms ease; }',
  '.zf-shelf[hidden] { display: none; }',
  // drop zones while dragging: dashed outlines, no fill
  ":root[data-zf-dragging] .zf-shelf { outline: 1px dashed color-mix(in srgb, var(--zf-ink-3, #7d889a) 55%, transparent); outline-offset: 0.3rem; }",
  ".zf-shelf[data-empty] { align-items: center; }",
  ":root[data-zf-dragging] .zf-shelf[data-drop='over'] { outline-color: color-mix(in srgb, var(--zf-accent, #9cf) 80%, transparent); }",
  ".zf-shelf[data-drop='over'] .zf-shelf-hint, .zf-shelf[data-preview] .zf-shelf-hint { display: none; }",
  '.zf-shelf-hint { font-size: var(--zf-sd-lab-size, 0.64rem); font-weight: 600; letter-spacing: 0.16em; text-transform: uppercase; color: var(--zf-ink-3, #7d889a); pointer-events: none; }',
  '.zf-tile { position: relative; flex: 0 1 11.5rem; min-width: 6.5rem; display: flex; flex-direction: column; justify-content: center; gap: 0.2rem;',
  // fully clear at rest (Peter, 10-11): the face floats on the sky; a light
  // glass fill comes up only on hover, so the tile still reads as grabbable
  '  --zf-tile-bg: transparent;',
  '  --zf-tile-bg-hi: color-mix(in srgb, color-mix(in srgb, var(--zf-side-card, rgb(20,22,28)) 76%, #fff) 64%, transparent);',
  '  padding: 0.45rem 0.85rem; box-sizing: border-box; border-radius: var(--zf-radius, 0.6rem); background: var(--zf-tile-bg);',
  '  cursor: pointer; user-select: none; touch-action: none; text-align: left; outline: none; transition: background-color 120ms ease, opacity 140ms ease; }',
  '.zf-tile:hover, .zf-tile:focus-visible { background: var(--zf-tile-bg-hi); }',
  '.zf-tile:focus-visible { box-shadow: inset 0 0 0 1px var(--zf-accent, rgba(255,255,255,.3)); }',
  '.zf-tile[data-stale] { opacity: 0.6; }',
  '.zf-tile-label { font-size: var(--zf-sd-lab-size, 0.64rem); font-weight: 600; letter-spacing: 0.16em; text-transform: uppercase; color: var(--zf-ink-3, #7d889a);',
  '  white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }',
  ".zf-tile[data-kind='status'] .zf-tile-label { color: var(--zf-sd-lab-color, var(--zf-ink-3, #7d889a)); }",
  '.zf-tile-value { display: flex; align-items: center; gap: 0.4rem; min-width: 0; font-size: 0.9rem; color: var(--zf-ink-0, #fff); font-variant-numeric: tabular-nums; }',
  '.zf-tile-value .truncate { min-width: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }',
  // a status tile centres its content (Peter, 10-12): the shelf pins sit in
  // fixed-width tiles, so a short reading ("Backend ready") used to hang off
  // the left edge with all the slack on the right. The clone is only as wide
  // as its own content and shrinks to the tile, so centring both boxes moves
  // the row to the middle without letting it overflow either edge.
  ".zf-tile[data-kind='status'] .zf-tile-value { justify-content: center; }",
  ".zf-tile[data-kind='status'] .zf-tile-face { justify-content: center; text-align: center; }",
  // a snippet tile wraps its value (up to 3 lines) and the shelf grows to fit
  '.zf-tile-text { min-width: 0; white-space: normal; overflow-wrap: anywhere; line-height: 1.3; display: -webkit-box; -webkit-box-orient: vertical; -webkit-line-clamp: 3; overflow: hidden; }',
  '.zf-tile-value svg { width: 0.85rem; height: 0.85rem; flex: none; color: var(--zf-ink-2, #aab4c4); }',
  // a status tile wears its row's own face: one line, centred, no label
  '.zf-tile-face { display: flex !important; align-items: center; min-width: 0; max-width: 100%; height: auto !important; padding: 0 !important; margin: 0 !important;',
  '  background: none !important; border: 0 !important; box-shadow: none !important; overflow: hidden; white-space: nowrap; font-size: 0.9rem; cursor: pointer; }',
  // the row's own buttons inside a tile light up like they do in the bar
  '.zf-tile-face button:hover, .zf-tile-face [role=button]:hover { color: var(--zf-ink-0, #fff); background: color-mix(in srgb, var(--zf-ink-0, #fff) 10%, transparent); border-radius: 0.3rem; }',
  ".zf-tile-face button { cursor: pointer; }",
  // resize grip: the tile's right edge
  '.zf-tile-grip { position: absolute; top: 18%; bottom: 18%; right: 0; width: 0.55rem; cursor: ew-resize; touch-action: none; }',
  ".zf-tile-grip::after { content: ''; position: absolute; top: 25%; bottom: 25%; right: 0.2rem; width: 2px; border-radius: 1px; background: var(--zf-ink-3, #7d889a); opacity: 0; transition: opacity 120ms ease; }",
  '.zf-tile:hover .zf-tile-grip::after, .zf-tile[data-resizing] .zf-tile-grip::after { opacity: 0.7; }',
  ':root[data-zf-dragging] .zf-tile-grip { display: none; }',
  ':root[data-zf-resizing], :root[data-zf-resizing] * { cursor: ew-resize !important; user-select: none !important; }',
  '.zf-tile-face > * { flex-shrink: 1; min-width: 0; }',
  '.zf-tile-face > svg { flex: none; }',
  // the thing being dragged, previewed where it would land
  ".zf-tile[data-phantom] { opacity: 0.75; pointer-events: none; background: color-mix(in srgb, var(--zf-side-card, rgba(20,22,28,.8)) 70%, transparent);",
  "  outline: 1px dashed color-mix(in srgb, var(--zf-accent, #9cf) 70%, transparent); outline-offset: -1px; }",
  ".zf-tile[data-lifted] { opacity: 0.3; }",
  ":root[data-zf-dragging] .zf-tile, :root[data-zf-dragging] .zf-snip { cursor: grabbing; }",
  // the snippet library: its own sidebar card, same material and faces as STATUS
  '#zephyr-snips { position: fixed; z-index: 40; left: var(--zf-lib-x); top: var(--zf-lib-y); width: var(--zf-lib-w); height: var(--zf-lib-h);',
  '  display: flex; flex-direction: column; box-sizing: border-box; overflow: hidden; border-radius: var(--zf-radius, 0.6rem);',
  '  background: var(--zf-side-card, rgba(14,16,22,.8)); color: var(--zf-ink-1, #dfe5ee); user-select: none;',
  '  transition: height var(--zf-sd-dur, 280ms) var(--zf-sd-ease, cubic-bezier(.32,.72,0,1)), top var(--zf-sd-dur, 280ms) var(--zf-sd-ease, cubic-bezier(.32,.72,0,1)); }',
  '#zephyr-snips[hidden] { display: none; }',
  "#zephyr-snips[data-drop='over'] { outline: 1px dashed color-mix(in srgb, var(--zf-accent, #9cf) 75%, transparent); outline-offset: -1px; }",
  ":root[data-zf-dragging='snip'] #zephyr-snips:not([data-drop]), :root[data-zf-dragging='tile'] #zephyr-snips:not([data-drop]) { outline: 1px dashed color-mix(in srgb, var(--zf-ink-3, #7d889a) 55%, transparent); outline-offset: -1px; }",
  '#zephyr-snips .zf-lib-head { flex: none; display: flex; align-items: center; gap: 0.5rem; height: var(--zf-lib-head, 1.85rem); padding: 0 0.7rem 0 0.75rem; cursor: pointer; outline: none;',
  '  font-size: var(--zf-sd-lab-size, 0.64rem); font-weight: 600; letter-spacing: 0.16em; text-transform: uppercase;',
  '  color: var(--zf-sd-lab-color, var(--theme-primary, var(--zf-ink-2, #aab4c4))); transition: color 150ms ease; }',
  '#zephyr-snips .zf-lib-head:hover, #zephyr-snips .zf-lib-head:focus-visible { color: var(--zf-ink-0, #fff); }',
  '#zephyr-snips .zf-lib-head svg { width: 0.75rem; height: 0.75rem; flex: none; }',
  '#zephyr-snips .zf-lib-count { color: var(--zf-ink-3, #7d889a); letter-spacing: 0.04em; }',
  '#zephyr-snips .zf-lib-chev { margin-left: auto; transition: transform var(--zf-sd-dur, 280ms) var(--zf-sd-ease, ease); transform: rotate(-90deg); }',
  '#zephyr-snips[data-open] .zf-lib-chev { transform: none; }',
  '#zephyr-snips .zf-lib-rows { flex: 1; min-height: 0; display: flex; flex-direction: column; gap: 0.1rem; padding: 0 0.3rem 0.35rem; overflow: hidden auto; scrollbar-width: none;',
  '  opacity: 0; transition: opacity 180ms ease; }',
  '#zephyr-snips[data-open] .zf-lib-rows { opacity: 1; transition: opacity 200ms ease 60ms; }',
  '#zephyr-snips .zf-lib-row { flex: none; display: flex; align-items: center; gap: 0.5rem; min-height: var(--zf-sd-rowh, 1.75rem); padding: 0 0.5rem; box-sizing: border-box;',
  '  border-radius: calc(var(--zf-radius, 0.6rem) - 0.25rem); font-size: var(--zf-sd-font, 0.8125rem); color: var(--zf-ink-1, #dfe5ee);',
  '  cursor: pointer; touch-action: none; outline: none; white-space: nowrap; overflow: hidden; transition: background-color 120ms ease, opacity 120ms ease; }',
  '#zephyr-snips .zf-lib-row:hover, #zephyr-snips .zf-lib-row:focus-visible { background: var(--zf-hover, rgba(255,255,255,.065)); color: var(--zf-ink-0, #fff); }',
  '#zephyr-snips .zf-lib-row[data-phantom] { opacity: 0.7; outline: 1px dashed color-mix(in srgb, var(--zf-accent, #9cf) 65%, transparent); outline-offset: -1px; }',
  '#zephyr-snips .zf-lib-title { flex: none; color: var(--zf-ink-3, #7d889a); }',
  '#zephyr-snips .zf-lib-value { min-width: 0; overflow: hidden; text-overflow: ellipsis; }',
  '#zephyr-snips .zf-lib-hint { flex: none; display: flex; align-items: center; min-height: var(--zf-sd-rowh, 1.75rem); padding: 0 0.5rem; font-size: var(--zf-sd-font, 0.8125rem); color: var(--zf-ink-3, #7d889a); }',
  "[data-zephyr-lib-room] { margin-top: calc(var(--zf-sd-room, 0px) + var(--zf-lib-room, 0px)) !important; transition: margin-top var(--zf-sd-dur, 280ms) var(--zf-sd-ease, cubic-bezier(.32,.72,0,1)); }",
  // the library drawer: slides off the sidebar edge, no scrim, chat stays live
  '#zephyr-snip-drawer { position: fixed; z-index: 45; left: var(--zf-dw-x, 0.75rem); top: var(--zf-dw-y, 3.5rem); width: min(24rem, calc(100vw - var(--zf-dw-x, 0.75rem) - 1rem));',
  '  max-height: var(--zf-dw-maxh, 70vh); display: flex; flex-direction: column; box-sizing: border-box; overflow: hidden; border-radius: var(--zf-radius, 0.6rem);',
  '  background: var(--zf-glass-strong, rgba(20,22,28,.96)); box-shadow: var(--zf-lift, inset 0 0 0 1px rgba(255,255,255,.07)), 0 14px 36px rgba(0,0,0,.28);',
  '  color: var(--zf-ink-1, #dfe5ee); animation: zf-dw-in 240ms cubic-bezier(.32,.72,0,1); outline: none; }',
  '#zephyr-snip-drawer[data-leaving] { animation: zf-dw-out 160ms ease forwards; pointer-events: none; }',
  '@keyframes zf-dw-in { from { opacity: 0; transform: translateX(-0.75rem); } }',
  '@keyframes zf-dw-out { to { opacity: 0; transform: translateX(-0.5rem); } }',
  '#zephyr-snip-drawer .zf-dw-head { flex: none; display: flex; align-items: center; gap: 0.5rem; height: 2rem; padding: 0 0.35rem 0 0.8rem;',
  '  font-size: var(--zf-sd-lab-size, 0.64rem); font-weight: 600; letter-spacing: 0.16em; text-transform: uppercase; color: var(--zf-sd-lab-color, var(--zf-ink-2, #aab4c4)); }',
  '#zephyr-snip-drawer .zf-dw-count { color: var(--zf-ink-3, #7d889a); letter-spacing: 0.04em; }',
  '#zephyr-snip-drawer .zf-dw-keys { margin-left: auto; letter-spacing: 0.04em; text-transform: none; font-weight: 400; color: var(--zf-ink-3, #7d889a); }',
  '#zephyr-snip-drawer .zf-dw-icon { display: grid; place-items: center; width: 1.5rem; height: 1.5rem; padding: 0; border: 0; cursor: pointer; flex: none;',
  '  border-radius: calc(var(--zf-radius, 0.6rem) - 0.2rem); background: transparent; color: var(--zf-ink-3, #7d889a); transition: background-color 120ms ease, color 120ms ease; }',
  '#zephyr-snip-drawer .zf-dw-icon:hover, #zephyr-snip-drawer .zf-dw-icon:focus-visible { background: var(--zf-hover, rgba(255,255,255,.065)); color: var(--zf-ink-0, #fff); outline: none; }',
  '#zephyr-snip-drawer .zf-dw-icon[data-on] { color: var(--zf-ink-0); }',
  '#zephyr-snip-drawer .zf-dw-icon svg { width: 0.85rem; height: 0.85rem; }',
  '#zephyr-snip-drawer .zf-dw-list { flex: 1; min-height: 0; overflow: hidden auto; overscroll-behavior: contain; scrollbar-width: none; padding: 0 0.35rem 0.4rem;',
  '  display: flex; flex-direction: column; gap: 0.1rem; -webkit-mask: linear-gradient(transparent, #000 0.5rem, #000 calc(100% - 0.75rem), transparent); mask: linear-gradient(transparent, #000 0.5rem, #000 calc(100% - 0.75rem), transparent); }',
  '#zephyr-snip-drawer .zf-dw-item { flex: none; border-radius: calc(var(--zf-radius, 0.6rem) - 0.2rem); cursor: pointer; transition: background-color 200ms ease, opacity 200ms ease; opacity: 0.62; }',
  '#zephyr-snip-drawer .zf-dw-item:hover { opacity: 0.9; }',
  '#zephyr-snip-drawer .zf-dw-item[data-focus] { opacity: 1; cursor: default; background: var(--zf-hover, rgba(255,255,255,.065)); }',
  '#zephyr-snip-drawer .zf-dw-line { display: flex; align-items: baseline; gap: 0.5rem; min-height: 1.9rem; padding: 0.45rem 0.55rem 0; box-sizing: border-box; white-space: nowrap; overflow: hidden; }',
  '#zephyr-snip-drawer .zf-dw-item:not([data-focus]) .zf-dw-line { padding-bottom: 0.45rem; align-items: center; }',
  '#zephyr-snip-drawer .zf-dw-title { flex: none; font-size: 0.64rem; font-weight: 600; letter-spacing: 0.14em; text-transform: uppercase; color: var(--zf-ink-3, #7d889a); }',
  '#zephyr-snip-drawer .zf-dw-short { min-width: 0; overflow: hidden; text-overflow: ellipsis; font-size: 0.8125rem; color: var(--zf-ink-1, #dfe5ee); transition: opacity 160ms ease; }',
  '#zephyr-snip-drawer .zf-dw-item[data-focus] .zf-dw-short { opacity: 0; }',
  '#zephyr-snip-drawer .zf-dw-loose { font-size: 0.6rem; letter-spacing: 0.06em; color: var(--zf-ink-3, #7d889a); }',
  '#zephyr-snip-drawer .zf-dw-more { display: grid; grid-template-rows: 0fr; transition: grid-template-rows 260ms cubic-bezier(.32,.72,0,1); }',
  '#zephyr-snip-drawer .zf-dw-item[data-focus] .zf-dw-more { grid-template-rows: 1fr; }',
  '#zephyr-snip-drawer .zf-dw-inner { min-height: 0; overflow: hidden; display: flex; flex-direction: column; gap: 0.3rem; padding: 0 0.55rem; }',
  '#zephyr-snip-drawer .zf-dw-item[data-focus] .zf-dw-inner { padding-bottom: 0.5rem; }',
  '#zephyr-snip-drawer .zf-dw-full { font-size: 1rem; line-height: 1.45; color: var(--zf-ink-0, #fff); white-space: pre-wrap; overflow-wrap: anywhere; user-select: text; cursor: text;',
  '  max-height: 12rem; overflow: auto; scrollbar-width: thin; font-variant-numeric: tabular-nums; }',
  '#zephyr-snip-drawer .zf-dw-note { font-size: 0.8rem; line-height: 1.45; color: var(--zf-ink-2, #aab4c4); white-space: pre-wrap; user-select: text; }',
  '#zephyr-snip-drawer .zf-dw-source { font-size: 0.6875rem; color: var(--zf-ink-3, #7d889a); }',
  '#zephyr-snip-drawer .zf-dw-foot { display: flex; align-items: center; gap: 0.35rem; margin-top: 0.15rem; }',
  '#zephyr-snip-drawer .zf-dw-btn { height: 1.6rem; padding: 0 0.65rem; border: 0; cursor: pointer; font: inherit; font-size: 0.75rem;',
  '  border-radius: calc(var(--zf-radius, 0.6rem) - 0.2rem); background: var(--zf-hover, rgba(255,255,255,.065)); color: var(--zf-ink-1, #dfe5ee); transition: background-color 120ms ease, color 120ms ease; }',
  '#zephyr-snip-drawer .zf-dw-btn:hover, #zephyr-snip-drawer .zf-dw-btn:focus-visible { background: var(--zf-edge-strong, rgba(255,255,255,.11)); color: var(--zf-ink-0, #fff); outline: none; }',
  '#zephyr-snip-drawer .zf-dw-primary { background: color-mix(in srgb, var(--zf-accent, #9cf) 22%, transparent); color: var(--zf-ink-0, #fff); }',
  '#zephyr-snip-drawer .zf-dw-primary:hover, #zephyr-snip-drawer .zf-dw-primary:focus-visible { background: color-mix(in srgb, var(--zf-accent, #9cf) 32%, transparent); }',
  '#zephyr-snip-drawer .zf-dw-btn:disabled { opacity: 0.6; cursor: default; }',
  '#zephyr-snips .zf-lib-row[data-current] { background: var(--zf-hover, rgba(255,255,255,.065)); color: var(--zf-ink-0, #fff); }',
  '@media (prefers-reduced-motion: reduce) { #zephyr-snip-drawer, #zephyr-snip-drawer[data-leaving] { animation: none; } #zephyr-snip-drawer .zf-dw-more { transition: none; } }',
  // the drag ghost, for every source (the dock's own copy covers status rows)
  '#zephyr-statusdock-ghost { position: fixed; z-index: 2147483000; left: 0; top: 0; pointer-events: none; display: inline-flex; align-items: center; gap: 0.45rem;',
  '  padding: 0.3rem 0.65rem; border-radius: calc(var(--zf-radius, 0.6rem) - 0.15rem); font-size: 0.75rem; white-space: nowrap; max-width: 16rem; overflow: hidden;',
  '  background: var(--zf-glass-strong, rgba(20,22,28,.96)); color: var(--zf-ink-0, #fff); box-shadow: 0 6px 18px rgba(0,0,0,.35); }',
  '#zephyr-statusdock-ghost svg { width: 0.75rem; height: 0.75rem; flex: none; }',
  '#zephyr-statusdock-ghost .zf-ghost-title { font-size: 0.6rem; font-weight: 600; letter-spacing: 0.14em; text-transform: uppercase; color: var(--zf-ink-3, #7d889a); }',
  '#zephyr-statusdock-ghost > span:last-child { overflow: hidden; text-overflow: ellipsis; }',
  // over a drop zone the chip melts into the preview that grew out of it
  '#zephyr-statusdock-ghost { transition: opacity 140ms ease, scale 160ms cubic-bezier(.32,.72,0,1); }',
  '#zephyr-statusdock-ghost[data-docked] { opacity: 0; scale: 0.85; }',
  '@media (prefers-reduced-motion: reduce) { #zephyr-statusdock-ghost { transition: none; } }'
].join('\n')
const ensureSnippetStyle = () => {
  if (typeof document === 'undefined' || document.getElementById('zephyr-snippet-style')) return
  const el = document.createElement('style')
  el.id = 'zephyr-snippet-style'
  el.textContent = SNIPPET_CSS
  document.head.appendChild(el)
}

const SNIP_PIN = '<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 17v5"/><path d="M9 10.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24V16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V7a1 1 0 0 1 1-1 2 2 0 0 0 0-4H8a2 2 0 0 0 0 4 1 1 0 0 1 1 1z"/></svg>'
const SNIP_PIN_SOLID = SNIP_PIN.replace('fill="none"', 'fill="currentColor"')

function SnippetCard({ attrs, pins, onPin, onCopy, onGrab }) {
  const title = attrs.title || ''
  const value = attrs.value || ''
  const note = attrs.note || ''
  const source = attrs.source || ''
  const accent = TONES[attrs.tone] === 'accent'
  const id = `${title}|${value}|${note}`.slice(0, 300)
  const pinned = useValue(pins).some(p => p.id === id)

  const body = [title, value, note, source].filter(Boolean).join(' — ')

  const act = (label, svg, run, extra) =>
    jsx('button', Object.assign({
      'aria-label': label,
      className: 'zf-snip-act',
      onClick: run,
      title: label,
      type: 'button',
      dangerouslySetInnerHTML: { __html: svg }
    }, extra))

  const copy = event => {
    onCopy(body)
    // a check for a beat, without React state
    const btn = event.currentTarget
    btn.setAttribute('data-done', '')
    setTimeout(() => btn.removeAttribute('data-done'), 1200)
  }

  return jsxs('div', {
    className: 'zf-snip',
    'data-tone': accent ? 'accent' : 'plain',
    // a click opens the preview, a drag carries it to the Pins or the Shelf
    onPointerDown: event => {
      if (event.target.closest?.('button')) return
      onGrab?.(event, { id, title, value, note, source, body })
    },
    title: 'Click to preview, drag to Snippets or the Shelf',
    'data-zf-snippet': id,
    children: [
      jsxs('div', {
        className: 'zf-snip-head',
        children: [
          title ? jsx('div', { className: 'zf-snip-title', children: title }) : null,
          jsxs('div', {
            className: 'zf-snip-acts',
            children: [
              jsx('button', {
                'aria-label': 'Copy',
                className: 'zf-snip-act',
                onClick: copy,
                title: 'Copy',
                type: 'button',
                children: [
                  jsx('span', { className: 'zf-snip-idle', children: jsx(Codicon, { name: 'copy', size: '0.85rem' }) }),
                  jsx('span', { className: 'zf-snip-done', children: jsx(Codicon, { name: 'check', size: '0.85rem' }) })
                ]
              }),
              act(pinned ? 'Unpin' : 'Pin to Snippets', pinned ? SNIP_PIN_SOLID : SNIP_PIN,
                () => onPin({ id, title, value, note, source, body }), pinned ? { 'data-on': '' } : null)
            ]
          })
        ]
      }),
      value ? jsx('div', { className: 'zf-snip-value', children: value }) : null,
      note ? jsx('div', { className: 'zf-snip-note', children: note }) : null,
      source ? jsx('div', { className: 'zf-snip-source', children: source }) : null
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
  color: 'var(--ui-text-secondary)',
  lineHeight: 1,
  verticalAlign: 'middle'
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

// ══ §9 PLUGIN REGISTRATION (register: settings, timers, observers) ═════════


// ── The Zephyr mark ─────────────────────────────────────────────────────────
// The double-struck ℤ (the integers) in white over a golden-hour sky. Two cuts of one drawing: a
// one-colour glyph for the Settings rail (it rides the codicon slot as a CSS
// mask, so it takes the rail's own colour and hover states like every core
// icon), and the full-colour badge for the top of the settings page.
const ZEPHYR_GLYPH_SVG = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">'
  + '<path fill="#000" d="M5 3.6h15.59v1.8H5zM3.41 18.6H19v1.8H3.41zM18.41 3.6h2.18l-9.4 16.8H9.01zM12.81 3.6h2.18l-9.4 16.8H3.41z"/>'
  + '</svg>'
const ZEPHYR_BADGE_SVG = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="100%" height="100%" style="display:block" aria-hidden="true">'
  + '<defs>'
  // one rounded card clips everything: the sun and haze used to spill past
  // the corners (r 22 at 47,47 reaches 69), which read as a bleed on the rim
  + '<clipPath id="zfb-card"><rect width="64" height="64" rx="15.5"/></clipPath>'
  + '<linearGradient id="zfb-sky" x1="0" y1="0" x2="0" y2="1">'
  + '<stop offset="0" stop-color="#5b7fb4"/><stop offset=".38" stop-color="#b9a585"/>'
  + '<stop offset=".7" stop-color="#f1b468"/><stop offset="1" stop-color="#e8823f"/>'
  + '</linearGradient>'
  + '<radialGradient id="zfb-sun" cx=".5" cy=".5" r=".5">'
  + '<stop offset="0" stop-color="#fff6de"/><stop offset=".35" stop-color="#ffdc96" stop-opacity=".9"/><stop offset="1" stop-color="#ffb35c" stop-opacity="0"/>'
  + '</radialGradient>'
  + '<linearGradient id="zfb-haze" x1="0" y1="0" x2="0" y2="1">'
  + '<stop offset="0" stop-color="#ffcf8a" stop-opacity="0"/><stop offset="1" stop-color="#ffcf8a" stop-opacity=".45"/>'
  + '</linearGradient>'
  + '<linearGradient id="zfb-sheen" x1="0" y1="0" x2="0" y2="1">'
  + '<stop offset="0" stop-color="#fff" stop-opacity=".2"/><stop offset=".5" stop-color="#fff" stop-opacity="0"/>'
  + '</linearGradient>'
  + '<filter id="zfb-shadow" x="-20%" y="-20%" width="140%" height="140%">'
  + '<feDropShadow dx="0" dy="1.2" stdDeviation="1.4" flood-color="#7a3a12" flood-opacity=".45"/>'
  + '</filter>'
  + '</defs>'
  + '<g clip-path="url(#zfb-card)">'
  + '<rect width="64" height="64" fill="url(#zfb-sky)"/>'
  + '<circle cx="47" cy="47" r="22" fill="url(#zfb-sun)"/>'
  + '<rect y="40" width="64" height="24" fill="url(#zfb-haze)"/>'
  + '<clipPath id="zfb-zc"><rect x="15.2" y="14.2" width="33.6" height="35.6"/></clipPath>'
  + '<g filter="url(#zfb-shadow)"><g clip-path="url(#zfb-zc)" fill="none" stroke="#fff" stroke-width="3.6" stroke-linejoin="miter" stroke-miterlimit="10">'
  + '<path d="M17 16h30L26.6 48"/><path d="M37.4 16 17 48h30"/>'
  + '</g></g>'
  + '<rect width="64" height="64" fill="url(#zfb-sheen)"/>'
  + '<rect x=".75" y=".75" width="62.5" height="62.5" rx="14.75" fill="none" stroke="#fff" stroke-opacity=".18" stroke-width="1.5"/>'
  + '</g>'
  + '</svg>'
const ZEPHYR_ICON_CSS = [
  '.codicon.codicon-zephyr::before {',
  "  content: ''; display: inline-block; width: 1em; height: 1em; vertical-align: -0.125em;",
  '  background-color: currentColor;',
  `  -webkit-mask: url("data:image/svg+xml,${encodeURIComponent(ZEPHYR_GLYPH_SVG)}") center / contain no-repeat;`,
  `  mask: url("data:image/svg+xml,${encodeURIComponent(ZEPHYR_GLYPH_SVG)}") center / contain no-repeat;`,
  '}'
].join('\n')

export default {
  id: 'zephyr',
  name: 'Zephyr',
  description: 'Lights Hermes with the real sky: time-of-day themes, a live weather sky, sky-tinted glass, snippet cards and calmer chat.',

  register(ctx) {
    const stored = key => ctx.storage.get(key, undefined)

    // the rail glyph (see "The Zephyr mark")
    let iconStyle = null
    if (typeof document !== 'undefined' && document.head) {
      document.getElementById('zephyr-icon-style')?.remove()
      iconStyle = document.createElement('style')
      iconStyle.id = 'zephyr-icon-style'
      iconStyle.textContent = ZEPHYR_ICON_CSS
      document.head.appendChild(iconStyle)
    }

    // Our own leftovers from an instance that died before registering its
    // disposer: the GL container is a full-screen opaque layer at z-index -1,
    // so a stale one sits on top of the CSS sky.
    for (const staleId of ['zephyr-gl-sky', 'zephyr-gl-sky-style', 'zephyr-sky-style']) {
      let stale = document.getElementById(staleId)
      while (stale) {
        if (stale.parentNode) stale.parentNode.removeChild(stale)
        stale = document.getElementById(staleId)
      }
    }

    // A collapsed pane collapses to a sliver; the app clips rather than hides its
    // tab labels, which leaves a word stacked one letter per line. Measure the
    // tabs and mark them so the sheet can drop the word (PANE_RAIL_CSS).
    // ⌘⌥←/→ walks the session tabs. Skipped inside text fields,
    // where the same chord is macOS "jump by paragraph", and it stops the event
    // in the capture phase so the app's own chord handling can't fight it.
    if (typeof window !== 'undefined') {
      // Session tabs, not the pane tabs: the rows in the tree that each hold one
      // session (workspace + session-tile:<id>), which is what "the session
      // tabs" means. Pane tabs are [data-slot='pane-tab'] and are excluded.
      const tabFrom = (node, dir) => {
        const tabs = Array.from(document.querySelectorAll("[role='tab'][data-tree-tab]"))
          .filter(tab => tab.dataset.slot !== 'pane-tab')
          .filter(tab => tab.getClientRects().length > 0)
        if (tabs.length < 2) return null
        const current = tabs.findIndex(tab => tab.getAttribute('aria-selected') === 'true')
        const from = current < 0 ? 0 : current
        return tabs[(from + dir + tabs.length) % tabs.length]
      }
      // A tab may listen on pointer/mouse rather than click; fire the whole
      // sequence so the switch happens either way.
      const pressTab = tab => {
        if (!tab) return
        const r = tab.getBoundingClientRect()
        const at = {
          bubbles: true, cancelable: true, view: window, button: 0,
          clientX: r.left + r.width / 2, clientY: r.top + r.height / 2
        }
        const pointer = { ...at, pointerId: 1, isPrimary: true, pointerType: 'mouse' }
        tab.dispatchEvent(new PointerEvent('pointerdown', pointer))
        tab.dispatchEvent(new MouseEvent('mousedown', at))
        tab.dispatchEvent(new PointerEvent('pointerup', pointer))
        tab.dispatchEvent(new MouseEvent('mouseup', at))
        tab.click()
      }
      const onTabChord = event => {
        if (!event.metaKey || !event.altKey || event.ctrlKey || event.shiftKey) return
        const dir = event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0
        if (!dir) return
        const target = event.target
        if (target instanceof Element) {
          if (target.isContentEditable || target.closest("input, textarea, [contenteditable='true'], [contenteditable='']")) return
        }
        const next = tabFrom(target, dir)
        if (!next) return
        event.preventDefault()
        event.stopPropagation()
        pressTab(next)
      }
      window.addEventListener('keydown', onTabChord, true)
      ctx.onDispose?.(() => window.removeEventListener('keydown', onTabChord, true))
    }

    if (typeof document !== 'undefined' && typeof ResizeObserver !== 'undefined') {
      const seenTabs = new WeakSet()
      const railObs = new ResizeObserver(entries => {
        for (const entry of entries) {
          const tab = entry.target
          const rail = entry.contentRect.width < 56 ? 'true' : 'false'
          if (tab.dataset.zfRail !== rail) {
            tab.dataset.zfRail = rail
            // collapsed, the label is gone, so the hover title has to carry it
            if (rail === 'true') {
              const label = (tab.textContent || '').trim()
              if (label && !tab.dataset.zfTitle) {
                tab.dataset.zfTitle = label
                tab.setAttribute('title', label)
              }
            } else if (tab.dataset.zfTitle) {
              tab.removeAttribute('title')
              delete tab.dataset.zfTitle
            }
          }
        }
      })
      const scanTabs = () => {
        for (const tab of document.querySelectorAll("[data-slot='pane-tab']")) {
          if (seenTabs.has(tab)) continue
          seenTabs.add(tab)
          railObs.observe(tab)
        }
      }
      scanTabs()
      const tabObserver = new MutationObserver(() => scanTabs())
      tabObserver.observe(document.documentElement, { childList: true, subtree: true })
      ctx.onDispose?.(() => {
        tabObserver.disconnect()
        railObs.disconnect()
      })
    }

    const pins = atom(stored(STORE_KEYS.pins) || [])
    const auto = atom(stored(STORE_KEYS.auto) !== false)
    const tint = atom(stored(STORE_KEYS.tint) === true)
    const sky = atom(stored(STORE_KEYS.sky) !== false)
    // The held sunset: the local build's whole point. On by default, so the app
    // opens on the dark ember band instead of whatever the clock currently says.
    const held = atom(stored(STORE_KEYS.hold) === true)
    // 'sunset' = the painted sky; 'gruvbox' = The Backwater under gruvbox glass.
    // Default is gruvbox: this build's new skin.
    const LOOKS = ['sunset', 'gruvbox', 'custom']
    const lookStore = stored(STORE_KEYS.look)
    const look = atom(LOOKS.includes(lookStore) ? lookStore : 'gruvbox')
    // 'sunset' = the painted sky; 'gruvbox' = the built-in Backwater skin at its
    // shipped defaults; 'custom' = the same skin driven by your own picture and
    // knobs. Built-in and custom differ only in which values the sheet reads.
    setLookMode(look.get() === 'sunset' ? 'sunset' : 'gruvbox')
    const margins = atom(stored(STORE_KEYS.margins) === true)
    const collapseWork = atom(stored(STORE_KEYS.collapseWork) !== false)
    const motion = atom(stored(STORE_KEYS.motion) !== false)
    const phase = atom(phaseAt(new Date()))
    const glOn = atom(stored(STORE_KEYS.glSky) !== false)
    const weatherMode = atom(WEATHER_LABEL[stored(STORE_KEYS.weather)] ? stored(STORE_KEYS.weather) : 'live')
    const quality = atom(QUALITY[stored(STORE_KEYS.quality)] ? stored(STORE_KEYS.quality) : 'balanced')
    const weatherNow = atom('')
    const statusDock = atom(stored(STORE_KEYS.statusDock) !== false)
    const library = atom(stored(STORE_KEYS.library) !== false)

    const persist = () => {
      ctx.storage.set(STORE_KEYS.pins, pins.get())
      ctx.storage.set(STORE_KEYS.auto, auto.get())
      ctx.storage.set(STORE_KEYS.tint, tint.get())
      ctx.storage.set(STORE_KEYS.sky, sky.get())
      ctx.storage.set(STORE_KEYS.hold, held.get())
      ctx.storage.set(STORE_KEYS.look, look.get())
      ctx.storage.set(STORE_KEYS.margins, margins.get())
      ctx.storage.set(STORE_KEYS.collapseWork, collapseWork.get())
      ctx.storage.set(STORE_KEYS.motion, motion.get())
      ctx.storage.set(STORE_KEYS.glSky, glOn.get())
      ctx.storage.set(STORE_KEYS.weather, weatherMode.get())
      ctx.storage.set(STORE_KEYS.quality, quality.get())
      ctx.storage.set(STORE_KEYS.statusDock, statusDock.get())
      ctx.storage.set(STORE_KEYS.library, library.get())
    }

    const applyMargins = on => {
      if (typeof document === 'undefined' || !document.documentElement) return
      if (!document.documentElement.dataset) document.documentElement.dataset = {}
      if (on) {
        document.documentElement.dataset.zephyrMargins = 'spacious'
      } else {
        delete document.documentElement.dataset.zephyrMargins
      }
    }
    // The Motion switch: every duration in the always-on sheet (§5b) reads a
    // token, so one attribute zeroes the whole app's animation.
    const applyMotion = on => {
      if (typeof document === 'undefined' || !document.documentElement) return
      if (!document.documentElement.dataset) document.documentElement.dataset = {}
      if (on) delete document.documentElement.dataset.zephyrMotion
      else document.documentElement.dataset.zephyrMotion = 'off'
    }
    // ── Wordmark keeps its size in spacious mode ─────────────────────────────
    // The HERMES AGENT wordmark sizes itself from its container (container
    // units / percentage widths), so anything that narrows an ancestor in
    // spacious mode shrinks it. Rather than chase every ancestor, measure the
    // wordmark with spacious margins briefly lifted (same frame, never painted),
    // then lock that exact size on it while spacious is on.
    const WORDMARK_SEL = "[data-slot='aui_intro'] :is(.wordmark, [class*='wordmark'])"
    let wordmarkKey = ''

    const unpinWordmark = () => {
      if (typeof document === 'undefined') return
      wordmarkKey = ''
      document.querySelectorAll?.('[data-zephyr-wordmark-pinned]').forEach(el => {
        el.removeAttribute('data-zephyr-wordmark-pinned')
        for (const p of ['width', 'max-width', 'min-width', 'height', 'font-size', 'letter-spacing', 'margin-inline', 'flex-shrink']) el.style.removeProperty(p)
      })
    }

    const pinWordmark = () => {
      if (typeof document === 'undefined' || typeof window === 'undefined' || !document.documentElement) return
      // The margins check comes first: the wordmark query below uses a
      // substring class match, which Blink cannot hash, and this runs on
      // every scan (up to ~16x/s while the transcript streams).
      if (!margins.get()) {
        if (wordmarkKey) unpinWordmark()
        return
      }
      const mark = document.querySelector?.(WORDMARK_SEL)
      if (!mark) {
        if (wordmarkKey) unpinWordmark()
        return
      }
      const root = document.documentElement
      // Re-measure only when the window size changes or a new wordmark mounts.
      const key = `${window.innerWidth}x${window.innerHeight}`
      if (wordmarkKey === key && mark.hasAttribute('data-zephyr-wordmark-pinned')) return

      const targets = [mark, ...mark.querySelectorAll('svg, img')]
      unpinWordmark()
      delete root.dataset.zephyrMargins
      const sizes = targets.map(el => {
        const rect = el.getBoundingClientRect()
        const cs = getComputedStyle(el)
        return { width: rect.width, height: rect.height, fontSize: cs.fontSize, letterSpacing: cs.letterSpacing }
      })
      root.dataset.zephyrMargins = 'spacious'

      targets.forEach((el, i) => {
        const m = sizes[i]
        if (!m.width) return
        el.setAttribute('data-zephyr-wordmark-pinned', 'true')
        el.style.setProperty('width', `${m.width}px`, 'important')
        el.style.setProperty('min-width', `${m.width}px`, 'important')
        el.style.setProperty('max-width', 'none', 'important')
        el.style.setProperty('flex-shrink', '0', 'important')
        if (el.tagName === 'svg' || el.tagName === 'IMG') {
          el.style.setProperty('height', `${m.height}px`, 'important')
        } else {
          el.style.setProperty('font-size', m.fontSize, 'important')
          el.style.setProperty('letter-spacing', m.letterSpacing, 'important')
          // Centre it even when the column is narrower than the mark.
          el.style.setProperty('margin-inline', `calc((100% - ${m.width}px) / 2)`, 'important')
        }
      })
      wordmarkKey = key
    }

    // ── Chat column fits the composer exactly (spacious mode) ───────────────
    // CSS alone gets within a few px: the thread scrolls in a viewport whose
    // scrollbar eats its right edge, so a centred column sits half a scrollbar
    // left of the composer (which is portaled elsewhere and centred on the
    // full pane). Measure the composer's visible surface and pin the column to
    // its exact left edge and width.
    let colObs = null
    let colWatched = []
    let colKey = ''
    const unfitColumn = () => {
      colKey = ''
      document.querySelectorAll?.('[data-zephyr-col-fit]').forEach(el => {
        el.removeAttribute('data-zephyr-col-fit')
        el.style.removeProperty('--zf-col-left')
        el.style.removeProperty('--zf-col-w')
      })
    }
    const fitColumn = () => {
      if (typeof document === 'undefined') return
      if (!margins.get()) {
        if (colKey) unfitColumn()
        return
      }
      const content = document.querySelector?.("[data-slot='aui_thread-content']")
      const viewport = content?.closest?.("[data-slot='aui_thread-viewport']")
      const surface = document.querySelector?.("[data-slot='composer-dock']:not([data-popped-out]) [data-slot='composer-surface']")
      const intro = content?.querySelector?.("[data-slot='aui_intro'], .wordmark, [class*='wordmark']")
      if (!content || !viewport || !surface || intro) {
        if (colKey) unfitColumn()
        return
      }
      const watch = [viewport, surface]
      if (typeof ResizeObserver === 'function' && (colWatched[0] !== viewport || colWatched[1] !== surface)) {
        colObs?.disconnect()
        colObs = new ResizeObserver(() => fitColumn())
        watch.forEach(el => colObs.observe(el))
        colWatched = watch
      }
      const v = viewport.getBoundingClientRect()
      const c = surface.getBoundingClientRect()
      if (!c.width || !v.width) return
      const left = Math.round((c.left - v.left - viewport.clientLeft) * 2) / 2
      const width = Math.round(c.width * 2) / 2
      if (left < 0 || left + width > viewport.clientWidth + 1) { if (colKey) unfitColumn(); return }
      const key = `${left}|${width}`
      if (key === colKey && content.hasAttribute('data-zephyr-col-fit')) return
      if (colKey && !content.hasAttribute('data-zephyr-col-fit')) unfitColumn()
      content.setAttribute('data-zephyr-col-fit', 'true')
      content.style.setProperty('--zf-col-left', `${left}px`)
      content.style.setProperty('--zf-col-w', `${width}px`)
      colKey = key
    }


    // ── Status dock: Advanced's bottom bar, as a left panel in Simple ────────
    // Simple mode unmounts the statusbar (footer[data-slot=statusbar]). The SDK
    // has no door to $statusbarVisible, but Hermes's own `view.toggleStatusbar`
    // keybind (mod+shift+s) writes a SESSION reveal while Simple shadows the
    // bar: it shows now, the user's Simple preference is never written, and
    // the reveal clears on any mode change. So in Simple we press that keybind
    // once, then lift the real bar (live items, menus, polls and all) out of
    // the flow into a collapsible glass panel on the left edge. In Advanced
    // the bar is left exactly where Hermes puts it.
    const DOCK_ATTR = 'data-zephyr-dock'
    const DOCK_OPEN_ATTR = 'data-zephyr-dock-open'
    const DOCK_SIDE_ATTR = 'data-zephyr-dock-side'
    const DOCK_ROOM_ATTR = 'data-zephyr-dock-room'
    const DOCK_POP_ATTR = 'data-zephyr-dock-pop'
    const SIDE_MIN_SESSIONS = 6
    const MODE_KEY = 'hermes.desktop.interfaceMode.v1'
    const IS_MAC = typeof navigator !== 'undefined' &&
      /mac/i.test((navigator.userAgentData && navigator.userAgentData.platform) || navigator.platform || '')
    const dock = { mode: '', revealed: false, pressed: false, tries: 0, lastTry: 0, tab: null, head: null, style: null, open: stored(STORE_KEYS.statusDockOpen) === true,
      side: null, room: null, sideOpen: false, manual: null, lastAuto: null, sideKey: '', ro: null, roWatched: [], popObs: null }
    const interfaceMode = () => {
      try {
        const raw = window.localStorage?.getItem(MODE_KEY) || ''
        return raw.includes('simple') ? 'simple' : 'advanced'
      } catch { return 'advanced' }
    }
    const DOCK_CSS = [
      `footer[data-slot='statusbar'][${DOCK_ATTR}] {`,
      '  position: fixed !important; z-index: 45; left: 0.5rem; top: 50%;',
      '  width: 15rem; height: auto !important; max-height: min(34rem, 72vh);',
      '  flex-direction: column !important; justify-content: flex-start !important; align-items: stretch !important; gap: 0.35rem !important;',
      '  padding: 0.45rem !important; overflow: hidden auto;',
      '  background: var(--zf-glass-strong, rgba(14, 16, 22, 0.94)) !important;',
      '  border-radius: var(--zf-radius-lg, 0.9rem);',
      '  box-shadow: var(--zf-lift-high, inset 0 0 0 1px rgba(255,255,255,.1));',
      '  transform: translate(calc(-100% - 1rem), -50%); opacity: 0; visibility: hidden; pointer-events: none;',
      '  transition: transform var(--zf-t-3, 220ms) var(--zf-ease, ease), opacity var(--zf-t-2, 180ms) var(--zf-ease, ease), visibility 0s linear var(--zf-t-3, 220ms);',
      '}',
      `footer[data-slot='statusbar'][${DOCK_ATTR}][${DOCK_OPEN_ATTR}] {`,
      '  transform: translate(0, -50%); opacity: 1; visibility: visible; pointer-events: auto;',
      '  transition: transform var(--zf-t-3, 220ms) var(--zf-ease, ease), opacity var(--zf-t-2, 180ms) var(--zf-ease, ease), visibility 0s;',
      '}',
      // the bar's two halves become two stacked lists of full-width rows
      `footer[data-slot='statusbar'][${DOCK_ATTR}] > div {`,
      '  flex-direction: column !important; align-items: stretch !important; overflow: visible !important; gap: 0.1rem !important;',
      '}',
      `footer[data-slot='statusbar'][${DOCK_ATTR}] > div:empty { display: none; }`,
      `footer[data-slot='statusbar'][${DOCK_ATTR}] > div + div:not(:empty) {`,
      '  border-top: 1px solid var(--zf-edge, rgba(255,255,255,.07)); padding-top: 0.25rem; margin-top: 0.1rem;',
      '}',
      `footer[data-slot='statusbar'][${DOCK_ATTR}] > div > * {`,
      '  height: auto !important; min-height: var(--zf-sd-rowh, 1.75rem); width: 100%; justify-content: flex-start !important; box-sizing: border-box;',
      '  padding: 0 0.5rem !important; border-radius: calc(var(--zf-radius, 0.6rem) - 0.25rem) !important;',
      '  transition: background-color var(--zf-t-2, 140ms) var(--zf-ease, ease), color var(--zf-t-2, 140ms) var(--zf-ease, ease);',
      // same face as the session rows (read off them at layout time)
      '  font-size: var(--zf-sd-font, 0.8125rem) !important; gap: 0.5rem !important; color: var(--zf-ink-1, #dfe5ee); background: transparent; border: 0;',
      '}',
      `footer[data-slot='statusbar'][${DOCK_ATTR}] > div > * svg { width: 0.875rem !important; height: 0.875rem !important; flex: none; color: var(--zf-ink-2, #aab4c4); }`,
      `footer[data-slot='statusbar'][${DOCK_ATTR}] > div > * .truncate { min-width: 0; }`,
      `footer[data-slot='statusbar'][${DOCK_ATTR}] > div > *:hover { background: var(--zf-hover, rgba(255,255,255,.065)) !important; color: var(--zf-ink-0, #fff); }`,
      `footer[data-slot='statusbar'][${DOCK_ATTR}] > div > * > * { height: auto !important; }`,
      `footer[data-slot='statusbar'][${DOCK_ATTR}] :is(.truncate) { white-space: nowrap; }`,
      // the tab on the left edge: a slim pill that opens and closes the panel
      '#zephyr-statusdock-tab {',
      '  position: fixed; z-index: 46; left: 0; top: 50%; transform: translateY(-50%);',
      '  width: 1.25rem; height: 4.75rem; padding: 0.45rem 0 0.4rem; border: 0; cursor: pointer;',
      '  display: flex; flex-direction: column; align-items: center; justify-content: space-between; color: var(--zf-ink-2, #b6c0d0);',
      '  background: var(--zf-glass, rgba(14, 16, 22, 0.8));',
      '  border-radius: 0 0.6rem 0.6rem 0; box-shadow: var(--zf-lift, inset 0 0 0 1px rgba(255,255,255,.07));',
      '  opacity: 0.9; transition: opacity var(--zf-t-2, 150ms) var(--zf-ease, ease), width var(--zf-t-2, 150ms) var(--zf-ease, ease), left var(--zf-t-3, 220ms) var(--zf-ease, ease), color var(--zf-t-2, 150ms) var(--zf-ease, ease);',
      '}',
      '#zephyr-statusdock-tab:hover, #zephyr-statusdock-tab:focus-visible { opacity: 1; width: 1.5rem; color: var(--zf-ink-0, #fff); outline: none; }',
      '#zephyr-statusdock-tab svg { width: 0.8rem; height: 0.8rem; flex: none; }',
      '#zephyr-statusdock-tab .zf-tab-chev { width: 0.65rem; height: 0.65rem; transition: transform var(--zf-t-3, 220ms) var(--zf-ease, ease); }',
      "#zephyr-statusdock-tab[aria-expanded='true'] { left: 15.75rem; opacity: 0.85; border-radius: 0.6rem; }",
      "#zephyr-statusdock-tab[aria-expanded='true'] .zf-tab-chev { transform: rotate(180deg); }",
      '#zephyr-statusdock-tab[hidden] { display: none; }',
      // ── in the sessions sidebar: a card between the sessions and the rail ──
      // The card itself is our header button (it paints the glass and takes
      // the click); the real footer floats over its lower part when open.
      `footer[data-slot='statusbar'][${DOCK_SIDE_ATTR}] {`,
      '  left: var(--zf-sd-x) !important; top: var(--zf-sd-y) !important; width: var(--zf-sd-w) !important;',
      '  max-height: var(--zf-sd-max) !important; transform: none !important;',
      '  background: transparent !important; box-shadow: none !important; border-radius: 0 0 var(--zf-radius, 0.6rem) var(--zf-radius, 0.6rem);',
      '  box-sizing: border-box !important; padding: 0 0.3rem 0.35rem !important; z-index: 41;',
      '  overflow: hidden auto !important; scrollbar-width: none;',
      '  clip-path: inset(0 0 100% 0);',
      '  transition: clip-path var(--zf-sd-dur) var(--zf-sd-ease), opacity var(--zf-t-2, 200ms) var(--zf-ease, ease) 40ms, visibility 0s linear var(--zf-sd-dur) !important;',
      '}',
      `footer[data-slot='statusbar'][${DOCK_SIDE_ATTR}]::-webkit-scrollbar { display: none; }`,
      // opening unrolls the rows from under the header, top to bottom
      `footer[data-slot='statusbar'][${DOCK_SIDE_ATTR}][${DOCK_OPEN_ATTR}] { transform: none !important; clip-path: inset(0 0 0 0); transition: clip-path var(--zf-sd-dur) var(--zf-sd-ease), opacity var(--zf-t-2, 180ms) var(--zf-ease, ease), visibility 0s !important; }`,
      `footer[data-slot='statusbar'][${DOCK_SIDE_ATTR}] > div > * { transition: transform var(--zf-sd-dur) var(--zf-sd-ease), opacity var(--zf-t-2, 200ms) var(--zf-ease, ease), background-color var(--zf-t-2, 120ms) var(--zf-ease, ease); }`,
      `footer[data-slot='statusbar'][${DOCK_SIDE_ATTR}]:not([${DOCK_OPEN_ATTR}]) > div > * { transform: translateY(-0.4rem); opacity: 0; }`,
      ':root { --zf-sd-dur: 280ms; --zf-sd-ease: cubic-bezier(.32,.72,0,1); }',
      // the Motion switch reaches the dock's own duration token too
      "html[data-zephyr-motion='off'] { --zf-sd-dur: 0ms; }",
      `[${DOCK_ROOM_ATTR}] { margin-top: calc(var(--zf-sd-room, 0px) + var(--zf-lib-room, 0px)) !important; transition: margin-top var(--zf-sd-dur) var(--zf-sd-ease); }`,
      '#zephyr-statusdock-head {',
      '  position: fixed; z-index: 40; left: var(--zf-sd-x); top: var(--zf-sd-y-head); width: var(--zf-sd-w); height: var(--zf-sd-h);',
      '  display: flex; flex-direction: column; justify-content: flex-start; align-items: stretch;',
      '  padding: 0; margin: 0; border: 0; text-align: left; cursor: pointer; color: var(--zf-ink-3, #8c98ac);',
      '  font: inherit; background: var(--zf-side-card, rgba(14, 16, 22, 0.8)); border-radius: var(--zf-radius, 0.6rem); overflow: hidden;',
      '  transition: height var(--zf-sd-dur) var(--zf-sd-ease), color var(--zf-t-2, 150ms) var(--zf-ease, ease), box-shadow var(--zf-t-2, 150ms) var(--zf-ease, ease);',
      '  user-select: none;',
      '}',
      '#zephyr-statusdock-head[hidden] { display: none; }',
      // a status dragged over the title: the drop zone lights up
      "#zephyr-statusdock-head[data-drop='over'] { outline: 1px dashed color-mix(in srgb, var(--zf-accent, #9cf) 75%, transparent); outline-offset: -1px; }",
      '#zephyr-statusdock-head .zf-sd-label { flex: none; }',
      "#zephyr-statusdock-head[data-pinned] .zf-sd-label { display: none; }",
      '#zephyr-statusdock-head .zf-sd-pin {',
      '  display: none; min-width: 0; flex: 0 1 auto; align-items: center; gap: 0.4rem; padding: 0; margin: 0;',
      '  background: none; border: 0; color: var(--zf-ink-1, #dfe5ee); font-weight: 500;',
      '  font-size: var(--zf-sd-font, 0.8125rem); letter-spacing: 0; text-transform: none; cursor: grab; white-space: nowrap; overflow: hidden;',
      '}',
      "#zephyr-statusdock-head[data-pinned] .zf-sd-pin { display: inline-flex; }",
      '#zephyr-statusdock-head .zf-sd-pin > * { min-width: 0; overflow: hidden; text-overflow: ellipsis; }',
      '#zephyr-statusdock-head .zf-sd-pin svg { width: 0.75rem; height: 0.75rem; }',
      // the pinned row in the list carries a small accent dot
      `footer[data-slot='statusbar'][${DOCK_SIDE_ATTR}] [data-zephyr-pinned]::after {`,
      "  content: ''; flex: none; width: 0.75rem; height: 0.75rem; margin-left: auto; background: currentColor; opacity: 0.6;",
      `  -webkit-mask: ${PIN_MASK_URL} center / contain no-repeat; mask: ${PIN_MASK_URL} center / contain no-repeat;`,
      '}',
      `footer[data-slot='statusbar'][${DOCK_SIDE_ATTR}] > div > * { touch-action: none; }`,
      '#zephyr-statusdock-ghost {',
      '  position: fixed; z-index: 2147483000; left: 0; top: 0; pointer-events: none; display: inline-flex; align-items: center; gap: 0.4rem;',
      '  padding: 0.3rem 0.65rem; border-radius: calc(var(--zf-radius, 0.6rem) - 0.15rem); font-size: 0.75rem; white-space: nowrap; max-width: 14rem; overflow: hidden;',
      '  background: var(--zf-glass-strong, rgba(20,22,28,.96)); color: var(--zf-ink-0, #fff); box-shadow: 0 6px 18px rgba(0,0,0,.35);',
      '}',
      '#zephyr-statusdock-ghost svg { width: 0.75rem; height: 0.75rem; flex: none; }',
      '#zephyr-statusdock-head .zf-sd-row {',
      '  display: flex; flex: none; align-items: center; gap: 0.5rem; height: var(--zf-sd-head, 1.85rem); padding: 0 0.7rem 0 0.75rem; min-width: 0;',
      // the same face as the PINNED / SESSIONS labels, copied off them at layout
      '  font-size: var(--zf-sd-lab-size, 0.64rem); font-weight: var(--zf-sd-lab-weight, 600); letter-spacing: var(--zf-sd-lab-track, 0.16em); text-transform: uppercase;',
      '  color: var(--zf-sd-lab-color, var(--theme-primary, var(--zf-ink-2, #aab4c4)));',
      '}',
      '#zephyr-statusdock-head:hover .zf-sd-row, #zephyr-statusdock-head:focus-visible .zf-sd-row { color: var(--zf-ink-0, #fff); }',
      '#zephyr-statusdock-head:focus-visible { outline: none; box-shadow: inset 0 0 0 1px var(--zf-accent, rgba(255,255,255,.3)); }',
      '#zephyr-statusdock-head svg { width: 0.75rem; height: 0.75rem; flex: none; }',
      '#zephyr-statusdock-head .zf-sd-pinico { display: none; }',
      "#zephyr-statusdock-head[data-pinned] .zf-sd-eq { display: none; }",
      "#zephyr-statusdock-head[data-pinned] .zf-sd-pinico { display: block; }",
      '#zephyr-statusdock-head .zf-sd-chev { margin-left: auto; width: 0.7rem; height: 0.7rem; transition: transform var(--zf-sd-dur, 280ms) var(--zf-sd-ease, ease); }',
      "#zephyr-statusdock-head[aria-expanded='true'] .zf-sd-chev { transform: rotate(180deg); }",
      // menus opened from the docked bar open beside it, not above it
      `[${DOCK_POP_ATTR}] {`,
      '  transform: translate(var(--zf-pop-x, 0px), var(--zf-pop-y, 0px)) !important; left: 0 !important; top: 0 !important;',
      '  --radix-popper-available-height: calc(100vh - 1rem) !important;',
      '  --radix-popper-transform-origin: var(--zf-pop-origin, left top) !important;',
      '}',
      '@media (prefers-reduced-motion: reduce) {',
      ':root { --zf-sd-dur: 0ms; }',
      '  #zephyr-statusdock-head, #zephyr-statusdock-head .zf-sd-chev { transition: none !important; }',
      `  footer[data-slot='statusbar'][${DOCK_ATTR}], #zephyr-statusdock-tab, #zephyr-statusdock-tab svg { transition: none !important; }`,
      '}'
    ].join('\n')

    const setDockOpen = open => {
      dock.open = Boolean(open)
      ctx.storage.set(STORE_KEYS.statusDockOpen, dock.open)
      const bar = document.querySelector("footer[data-slot='statusbar']")
      if (bar && bar.hasAttribute(DOCK_ATTR) && !dock.side) bar.toggleAttribute(DOCK_OPEN_ATTR, dock.open)
      if (dock.tab) {
        dock.tab.setAttribute('aria-expanded', String(dock.open))
        dock.tab.title = dock.open ? 'Hide status panel' : 'Show status panel'
      }
    }
    const ensureDockChrome = () => {
      if (!dock.style) {
        dock.style = document.createElement('style')
        dock.style.id = 'zephyr-statusdock-style'
        dock.style.textContent = DOCK_CSS
        document.head.appendChild(dock.style)
      }
      if (!dock.tab) {
        const tab = document.createElement('button')
        tab.id = 'zephyr-statusdock-tab'
        tab.type = 'button'
        tab.setAttribute('aria-label', 'Status panel')
        // a little equaliser (model, context, radio live in there) over a chevron
        tab.innerHTML = '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><path d="M4 6v4M8 3.5v9M12 5.5v5"/></svg>'
          + '<svg class="zf-tab-chev" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 3.5 10.5 8 6 12.5"/></svg>'
        tab.addEventListener('click', () => setDockOpen(!dock.open))
        document.body.appendChild(tab)
        dock.tab = tab
      }
    }
    const unside = () => {
      // The 1s dock timer calls this every second while the panel is not
      // sided; only a real un-side changes the geometry, so only then is the
      // library's layout cache dropped (otherwise layoutLibrary() re-measures
      // the sidebar — forced layout — once a second for nothing).
      const wasSided = Boolean(dock.side || dock.room)
      document.querySelectorAll(`[${DOCK_SIDE_ATTR}]`).forEach(el => {
        el.removeAttribute(DOCK_SIDE_ATTR)
        ;['--zf-sd-x', '--zf-sd-y', '--zf-sd-w', '--zf-sd-max'].forEach(v => el.style.removeProperty(v))
      })
      document.querySelectorAll(`[${DOCK_ROOM_ATTR}]`).forEach(el => { el.removeAttribute(DOCK_ROOM_ATTR); el.style.removeProperty('--zf-sd-room') })
      if (dock.head) dock.head.hidden = true
      document.querySelectorAll('[data-zephyr-pinned]').forEach(el => el.removeAttribute('data-zephyr-pinned'))
      document.querySelectorAll("footer[data-slot='statusbar'] [data-zf-full]").forEach(el => {
        if (el.dataset.zfCrop && el.firstChild?.nodeValue === el.dataset.zfCrop) el.firstChild.nodeValue = el.dataset.zfFull
        delete el.dataset.zfCrop; delete el.dataset.zfFull; el.removeAttribute('title')
      })
      dock.side = null
      dock.room = null
      dock.sideKey = ''
      if (wasSided) lib.key = ''
    }
    const undock = () => {
      unside()
      document.querySelectorAll(`[${DOCK_ATTR}]`).forEach(el => { el.removeAttribute(DOCK_ATTR); el.removeAttribute(DOCK_OPEN_ATTR) })
      if (dock.tab) dock.tab.hidden = true
    }

    // ── In the sessions sidebar ────────────────────────────────────────────
    // When the sessions sidebar is on screen the bar becomes a card at its
    // foot, between the session list and the profile rail. We never move
    // Hermes's DOM: the list's scroller gets a bottom margin (the card's
    // room), our header button paints the card in that gap, and the real
    // footer is pinned over the card's lower part. Open or shut follows the
    // height: open only while the list still shows SIDE_MIN_SESSIONS rows
    // (plus about two rows of section headings); a click overrides that
    // until the fit itself flips.
    const sidebarParts = () => {
      const side = document.querySelector("[data-tour='sessions-sidebar']")
      const room = side?.querySelector?.('[data-sessions-mode]')
      if (!side || !room) return null
      const r = side.getBoundingClientRect()
      if (r.width < 160 || r.height < 240 || !room.getClientRects().length) return null
      return { side, room, r }
    }
    // ── Pin one status to the title ───────────────────────────────────────
    // Drag a row from the open card onto the STATUS title and it stays on the
    // title, live, open or shut, until it is dragged off again. Rows are keyed
    // by their lucide icon (text changes as the value does), else by their
    // letters. Pointer-based rather than HTML5 drag: Radix opens a row's menu
    // on pointerdown, so we hold the pointerdown until we know it is a tap,
    // and replay it then.
    const pinDrag = { el: null, key: '', x: 0, y: 0, id: -1, moving: false, ghost: null, endedAt: 0, replay: false }
    const statusRows = bar => bar ? [...bar.querySelectorAll(':scope > div > *')] : []
    // A row's own icon: not one inside a nested control (a radio's
    // play/pause icon flips as you press it, which would lose the key).
    const ROW_CONTROL = "button, a, [role='button'], [role='switch'], [role='slider']"
    const ownIcon = el => {
      for (const svg of el.querySelectorAll('svg')) {
        const c = svg.closest(ROW_CONTROL)
        if (c && c !== el && el.contains(c) && el.querySelectorAll(ROW_CONTROL).length > 1) continue
        const lc = [...svg.classList].find(k => k.startsWith('lucide-'))
        if (lc) return lc
      }
      return ''
    }
    // the first word of the row's first text, never of the whole row
    const firstWord = el => {
      const w = document.createTreeWalker(el, 4)
      for (let n = w.nextNode(); n; n = w.nextNode()) {
        const t = n.nodeValue.replace(/[^A-Za-z]+/g, ' ').trim()
        if (t) return t.split(' ')[0].toLowerCase()
      }
      return ''
    }
    const statusKey = (el, rows) => {
      const lc = ownIcon(el)
      const base = lc || 'txt:' + firstWord(el)
      // same icon twice: the second becomes base#2
      let n = 0
      if (lc) for (const r of rows) { if (r === el) break; if (ownIcon(r) === lc) n++ }
      return n ? `${base}#${n + 1}` : base
    }
    // ── Smart crop ────────────────────────────────────────────────────────
    // A status too long for its row is cut at the end of the last whole
    // piece that fits (a word, or a segment before · | / , : ; -) with an
    // ellipsis, never mid-word. Only the text node's value changes (React
    // owns the span and rewrites that value on its next update, which we
    // notice and re-crop); the full text stays in data-zf-full and the title.
    let cropCanvas = null
    const textWidth = (text, el) => {
      cropCanvas = cropCanvas || document.createElement('canvas')
      const c = cropCanvas.getContext('2d')
      const cs = getComputedStyle(el)
      c.font = `${cs.fontStyle} ${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`
      const track = parseFloat(cs.letterSpacing) || 0
      return c.measureText(text).width + track * text.length
    }
    const cropText = (text, budget, el) => {
      if (textWidth(text, el) <= budget) return text
      const cuts = []
      for (let i = 1; i < text.length; i++) {
        if (/\s/.test(text[i]) || /[·•|/,:;\-–—)]/.test(text[i - 1])) cuts.push(i)
      }
      for (let k = cuts.length - 1; k >= 0; k--) {
        const head = text.slice(0, cuts[k]).replace(/[\s·•|/,:;\-–—(]+$/, '')
        if (head && textWidth(head + '…', el) <= budget) return head + '…'
      }
      return null // one long word: leave it to the CSS ellipsis
    }
    const cropSpans = (spans, avail) => {
      // spans: [{ el, node, full }] in row order; crop from the last one back
      let rest = avail - spans.reduce((a, s) => a + textWidth(s.full, s.el), 0)
      for (let i = spans.length - 1; i >= 0; i--) {
        const s = spans[i]
        const w = textWidth(s.full, s.el)
        let out = s.full
        if (rest < 0) {
          const budget = Math.max(0, w + rest)
          const c = cropText(s.full, budget, s.el)
          out = c == null ? s.full : c
          rest += w - (c == null ? w : textWidth(c, s.el))
        }
        if (s.node.nodeValue !== out) s.node.nodeValue = out
        if (out !== s.full) { s.el.dataset.zfCrop = out; s.el.title = s.full } else if (s.el.dataset.zfCrop) { delete s.el.dataset.zfCrop; s.el.removeAttribute('title') }
      }
    }
    const croppable = root => [...root.querySelectorAll('.truncate')].filter(el =>
      el.childNodes.length === 1 && el.firstChild.nodeType === 3)
    const spanInfo = el => {
      const node = el.firstChild
      // a value that isn't ours is React's new text
      if (el.dataset.zfFull == null || node.nodeValue !== (el.dataset.zfCrop || el.dataset.zfFull)) el.dataset.zfFull = node.nodeValue
      return { el, node, full: el.dataset.zfFull }
    }
    const innerWidth = el => {
      const cs = getComputedStyle(el)
      return el.clientWidth - (parseFloat(cs.paddingLeft) || 0) - (parseFloat(cs.paddingRight) || 0)
    }
    const fitLine = (box, spans, extra = 0) => {
      if (!spans.length || !box.clientWidth) return
      const cs = getComputedStyle(box)
      const gap = parseFloat(cs.columnGap) || 0
      const kids = [...box.children]
      const others = kids.filter(k => !spans.some(s => s.el === k)).reduce((a, k) => a + k.getBoundingClientRect().width, 0)
      const avail = innerWidth(box) - others - gap * Math.max(0, kids.length - 1) - extra - 1
      cropSpans(spans, avail)
    }
    const cropRows = bar => {
      for (const row of statusRows(bar)) {
        const els = croppable(row)
        if (!els.length) continue
        const box = els[0].parentElement
        // only the simple shape: the label spans sit in the row (or its one child)
        if (box !== row && !(box.parentElement === row && row.children.length === 1)) continue
        const pinW = row.hasAttribute('data-zephyr-pinned') ? 12 + 8 : 0
        const spans = els.filter(e => e.parentElement === box).map(spanInfo)
        if (box === row) fitLine(row, spans, pinW)
        else fitLine(box, spans, pinW + (row.clientWidth - box.getBoundingClientRect().width > 0 ? 0 : 0))
      }
    }
    const cropChip = () => {
      const head = dock.head
      const chip = head?.querySelector('.zf-sd-pin')
      if (!chip || !head.hasAttribute('data-pinned')) return
      const row = head.querySelector('.zf-sd-row')
      const cs = getComputedStyle(row)
      const gap = parseFloat(cs.columnGap) || 0
      const fixed = [...row.children].filter(k => k !== chip && getComputedStyle(k).display !== 'none')
      const room = innerWidth(row) - fixed.reduce((a, k) => a + k.getBoundingClientRect().width, 0) - gap * fixed.length - 6
      chip.style.maxWidth = `${Math.max(0, Math.floor(room))}px`
      const els = croppable(chip).filter(e => e.parentElement === chip)
      els.forEach(e => { if (e.dataset.zfFull != null) { e.firstChild.nodeValue = e.dataset.zfFull; delete e.dataset.zfCrop } })
      const spans = els.map(spanInfo)
      const cg = parseFloat(getComputedStyle(chip).columnGap) || 0
      const others = [...chip.children].filter(k => !els.includes(k)).reduce((a, k) => a + k.getBoundingClientRect().width + cg, 0)
      cropSpans(spans, room - others - cg * Math.max(0, spans.length - 1) - 1)
    }

    const pinnedKey = () => { const k = stored(STORE_KEYS.statusPin); return typeof k === 'string' ? k : '' }
    const setPinned = key => {
      ctx.storage.set(STORE_KEYS.statusPin, key || '')
      dock.pinSig = ''
      refreshPin()
    }
    const refreshPin = () => {
      const head = dock.head
      const bar = document.querySelector(`footer[data-slot='statusbar'][${DOCK_ATTR}]`)
      if (!head) return
      const key = pinnedKey()
      const rows = statusRows(bar)
      let src = null
      for (const r of rows) {
        const hit = key && statusKey(r, rows) === key
        r.toggleAttribute('data-zephyr-pinned', Boolean(hit))
        if (hit) src = r
      }
      head.toggleAttribute('data-pinned', Boolean(src))
      try { cropRows(bar) } catch {}
      const chip = head.querySelector('.zf-sd-pin')
      if (!src) { if (chip.firstChild) chip.textContent = ''; dock.pinSig = ''; return }
      const sig = src.innerHTML
      if (sig !== dock.pinSig) {
        dock.pinSig = sig
        chip.replaceChildren(...[...src.childNodes].map(n => n.cloneNode(true)))
        chip.querySelectorAll('[id], [title]').forEach(n => { n.removeAttribute('id'); n.removeAttribute('title') })
      }
      try { cropChip() } catch {}
    }
    const overHead = (x, y) => {
      const h = dock.head
      if (!h || h.hidden) return false
      const r = h.getBoundingClientRect()
      const rowH = parseFloat(h.style.getPropertyValue('--zf-sd-head')) || 30
      return x >= r.left && x <= r.right && y >= r.top - 6 && y <= r.top + rowH + 6
    }
    const inRect = (el, x, y, pad = 0) => {
      if (!el || el.hidden || !el.isConnected) return false
      const r = el.getBoundingClientRect()
      return r.width > 0 && r.height > 0 && x >= r.left - pad && x <= r.right + pad && y >= r.top - pad && y <= r.bottom + pad
    }
    // ── One drag for everything that moves ──────────────────────────────
    // Sources: a status row, the pinned chip, a sidebar pin, a snippet card in
    // the chat, a Shelf tile. Targets: the STATUS title, the sidebar Pins
    // group, the two Shelf slots. A drop nowhere takes the thing off wherever
    // it was (unpin, off the Shelf). A tap (no movement) does the thing's own
    // click: a status row gets its pointerdown back, a snippet opens its
    // preview, a status tile opens that status's menu beside the tile.
    // Pointer-based rather than HTML5 drag: Radix opens a row's menu on
    // pointerdown, so we hold the pointerdown until we know it is a tap.
    const dropAt = (x, y) => {
      const shelfHit = shelfSlotAt(x, y)
      if (shelfHit) return Object.assign({ kind: 'shelf' }, shelfHit)
      if (overHead(x, y)) return { kind: 'head' }
      if (inRect(dock.head, x, y)) return { kind: 'card' } // the status card's body
      if (inRect(lib.el, x, y, 4)) return { kind: 'lib' }
      return null
    }
    const shelfFull = (src, hit) => shelf[hit.slot].length >= SHELF_MAX && !(src.type === 'tile' && src.slot === hit.slot)
    const accepts = (src, hit) => {
      if (!hit) return false
      const t = src.type
      const tile = t === 'tile' ? src.ref.kind : ''
      if (hit.kind === 'shelf') return !shelfFull(src, hit)
      if (hit.kind === 'head') return t === 'status' || tile === 'status'
      if (hit.kind === 'card') return tile === 'status'
      if (hit.kind === 'lib') return t === 'snip' || tile === 'snip'
      return false
    }
    const dropEl = hit => !hit ? null : (hit.kind === 'head' || hit.kind === 'card') ? dock.head : hit.kind === 'lib' ? lib.el : hit.kind === 'shelf' ? shelfEls[hit.slot] : null
    let litEl = null
    const light = el => {
      if (litEl === el) return
      litEl?.removeAttribute('data-drop')
      litEl = el
      el?.setAttribute('data-drop', 'over')
    }
    const applyDrop = (src, hit) => {
      const k = hit?.kind || ''
      if (hit && !accepts(src, hit) && !(src.type === 'pin' || src.type === 'chip')) return
      switch (src.type) {
        case 'status':
          if (k === 'head') setPinned(src.key)
          else if (k === 'shelf') shelfPut({ kind: 'status', key: src.key, last: src.text }, hit)
          break
        case 'chip':
          if (k === 'shelf' && accepts(src, hit)) shelfPut({ kind: 'status', key: pinnedKey(), last: src.text }, hit)
          else if (!hit || k === 'card' || k === 'lib') setPinned('')
          break
        case 'pin':
          if (k === 'shelf' && accepts(src, hit)) shelfPut({ kind: 'snip', entry: src.entry }, hit)
          else if (!hit) unpinSnip(src.entry.id)
          break
        case 'snip':
          if (k === 'lib') pinSnip(src.entry)
          else if (k === 'shelf') shelfPut({ kind: 'snip', entry: src.entry }, hit)
          break
        case 'tile':
          if (k === 'shelf') shelfMove(src.slot, src.idx, hit)
          // back where it came from: off the Shelf (a snippet stays in the library)
          else if (k === 'head' || k === 'card') shelfRemove(src.slot, src.idx)
          else if (k === 'lib') { pinSnip(src.ref.entry); shelfRemove(src.slot, src.idx) }
          else if (!hit) shelfRemove(src.slot, src.idx)
          break
      }
    }
    const onTap = (src, el, e) => {
      if (src.type === 'status') {
        pinDrag.replay = true
        try {
          el.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true, composed: true, button: 0, buttons: 1, pointerId: e.pointerId, pointerType: e.pointerType || 'mouse', isPrimary: true, clientX: e.clientX, clientY: e.clientY }))
        } finally { pinDrag.replay = false }
      } else if (src.type === 'pin' || src.type === 'snip') openPreview(src.entry)
      else if (src.type === 'tile') {
        if (src.ref.kind === 'snip') openPreview(src.ref.entry)
        else if (!tapStatusTile(src.ref, el, src.at)) openStatusFrom(src.ref.key, el, e)
      }
    }
    const ghostFor = (src, el) => {
      const g = document.createElement('div')
      g.id = 'zephyr-statusdock-ghost'
      const entry = src.entry || src.ref?.entry
      if (entry) {
        const t = document.createElement('span'); t.className = 'zf-ghost-title'; t.textContent = entry.title || ''
        const v = document.createElement('span'); v.textContent = entry.value || entry.note || ''
        g.append(...(entry.title ? [t, v] : [v]))
      } else {
        const from = el.querySelector?.('.zf-tile-value') || el
        g.replaceChildren(...[...from.childNodes].map(n => n.cloneNode(true)))
      }
      return g
    }
    const endPinDrag = () => {
      window.removeEventListener('pointermove', onPinMove, true)
      window.removeEventListener('pointerup', onPinUp, true)
      window.removeEventListener('pointercancel', onPinCancel, true)
      pinDrag.ghost?.remove()
      pinDrag.ghost = null
      light(null)
      showShelfPhantom(null)
      showLibPhantom(null)
      pinDrag.el?.removeAttribute?.('data-lifted')
      const was = pinDrag.moving
      pinDrag.el = null
      pinDrag.src = null
      pinDrag.moving = false
      if (was) {
        document.documentElement.removeAttribute('data-zf-dragging')
        layoutShelf()
      }
    }
    const onPinMove = e => {
      if (e.pointerId !== pinDrag.id || !pinDrag.el) return
      const src = pinDrag.src
      if (!pinDrag.moving) {
        if (Math.hypot(e.clientX - pinDrag.x, e.clientY - pinDrag.y) < 6) return
        pinDrag.moving = true
        document.documentElement.setAttribute('data-zf-dragging', src.type)
        pinDrag.ghost = ghostFor(src, pinDrag.el)
        document.body.appendChild(pinDrag.ghost)
        if (src.type === 'tile') pinDrag.el.setAttribute('data-lifted', '')
        layoutShelf()
      }
      e.preventDefault()
      pinDrag.ghost.style.transform = `translate(${Math.round(e.clientX + 10)}px, ${Math.round(e.clientY + 8)}px)`
      const hit = dropAt(e.clientX, e.clientY)
      const ok = accepts(src, hit)
      light(ok ? dropEl(hit) : null)
      // show the thing where it would land
      pinDrag.ghost.toggleAttribute('data-docked', !!(ok && (hit.kind === 'shelf' || hit.kind === 'lib')))
      showShelfPhantom(ok && hit.kind === 'shelf' ? hit : null, src)
      showLibPhantom(ok && hit.kind === 'lib' ? (src.entry || src.ref?.entry) : null)
    }
    const onPinUp = e => {
      if (e.pointerId !== pinDrag.id || !pinDrag.el) return
      const { el, src, moving } = pinDrag
      const hit = moving ? dropAt(e.clientX, e.clientY) : null
      endPinDrag()
      if (!moving) { onTap(src, el, e); return }
      pinDrag.endedAt = Date.now()
      applyDrop(src, hit)
    }
    const onPinCancel = e => { if (e.pointerId === pinDrag.id) endPinDrag() }
    function startDrag (e, src, el, hold) {
      if (e.button !== 0 || pinDrag.el) return
      pinDrag.el = el
      pinDrag.src = src
      pinDrag.key = src.key || ''
      pinDrag.x = e.clientX
      pinDrag.y = e.clientY
      pinDrag.id = e.pointerId
      pinDrag.moving = false
      if (hold) { e.stopPropagation(); e.preventDefault() } // hold Radix's pointerdown until we know
      window.addEventListener('pointermove', onPinMove, true)
      window.addEventListener('pointerup', onPinUp, true)
      window.addEventListener('pointercancel', onPinCancel, true)
    }
    const rowText = el => (el?.textContent || '').replace(/\s+/g, ' ').trim()
    function startPinDrag (e, row) {
      const bar = document.querySelector(`footer[data-slot='statusbar'][${DOCK_SIDE_ATTR}]`)
      if (row && !bar) return
      if (row) startDrag(e, { type: 'status', key: statusKey(row, statusRows(bar)), text: rowText(row) }, row, true)
      else {
        const chip = dock.head.querySelector('.zf-sd-pin')
        startDrag(e, { type: 'chip', text: rowText(chip) }, chip, false)
      }
    }
    const onRowPointerDown = e => {
      if (pinDrag.replay || !dock.side) return
      const row = e.target?.closest?.(`footer[data-slot='statusbar'][${DOCK_SIDE_ATTR}][${DOCK_OPEN_ATTR}] > div > *`)
      if (row) startPinDrag(e, row)
    }
    if (typeof document !== 'undefined') document.addEventListener('pointerdown', onRowPointerDown, true)

    // ── Snippet pins ──────────────────────────────────────────────────────
    const pinSnip = entry => {
      if (!entry?.id || pins.get().some(p => p.id === entry.id)) return
      pins.set([...pins.get(), entry])
      persist()
      onPinsChanged()
    }
    const unpinSnip = id => {
      pins.set(pins.get().filter(p => p.id !== id))
      persist()
      onPinsChanged()
    }
    const snipText = e => [e.title && e.value ? `${e.title}: ${e.value}` : (e.value || e.title), e.note, e.source ? `(${e.source})` : ''].filter(Boolean).join('\n')
    // Attach: Hermes's own composer door (host.composer, read off the SDK
    // global so an older Hermes without it still loads the plugin). Active
    // composer first, then the fresh new-chat draft; failing both, the text
    // goes to the clipboard and the button says so.
    const attachSnip = async entry => {
      const text = snipText(entry)
      try {
        const c = globalThis.__HERMES_PLUGIN_SDK__?.host?.composer
        if (c?.insertText) {
          if (await c.insertText(null, text, { mode: 'block' })) return true
          if (await c.insertText('new', text, { mode: 'block' })) return true
        }
      } catch {}
      try { await navigator.clipboard?.writeText(text) } catch {}
      return false
    }

    // ── Library drawer ────────────────────────────────────────────────────
    // A click on any snippet (the chat card, a library row, a Shelf tile)
    // slides the library out beside the sidebar: every pinned snippet in one
    // column, the chosen one open with Copy / Attach / unpin, the rest as
    // quiet lines around it. Arrows or the wheel walk the column; Attach keeps
    // the drawer open so you can drop several in a row. No scrim: the chat
    // stays live, a click outside or Esc puts it away. A snippet that is not
    // pinned yet rides at the top, marked, with a pin to keep it.
    const ICON_PIN = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 17v5"/><path d="M9 10.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24V16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V7a1 1 0 0 1 1-1 2 2 0 0 0 0-4H8a2 2 0 0 0 0 4 1 1 0 0 1 1 1z"/></svg>'
    const ICON_PIN_SOLID = ICON_PIN.replace('fill="none"', 'fill="currentColor"')
    const ICON_X = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M18 6 6 18M6 6l12 12"/></svg>'
    const drawer = { el: null, items: [], focus: -1, loose: null, prevFocus: null, wheel: 0, wheelAt: 0 }
    const isPinned = id => pins.get().some(p => p.id === id)
    const placeDrawer = () => {
      const el = drawer.el
      if (!el) return
      const rem = parseFloat(getComputedStyle(document.documentElement).fontSize) || 16
      const parts = sidebarParts()
      let x = 0.75 * rem, y = 3.5 * rem
      if (parts) {
        x = Math.round(parts.r.right + 0.5 * rem)
        const lr = lib.el && !lib.el.hidden ? lib.el.getBoundingClientRect() : null
        y = Math.round(lr ? lr.top : parts.r.top + 3.5 * rem)
      }
      y = Math.max(0.5 * rem, Math.min(y, innerHeight - 12 * rem))
      el.style.setProperty('--zf-dw-x', `${x}px`)
      el.style.setProperty('--zf-dw-y', `${y}px`)
      el.style.setProperty('--zf-dw-maxh', `${Math.round(innerHeight - y - 0.75 * rem)}px`)
    }
    const drawerItem = (entry, loose) => {
      const it = document.createElement('div')
      it.className = 'zf-dw-item'
      it.dataset.id = entry.id
      it.innerHTML = '<div class="zf-dw-line"><span class="zf-dw-title"></span><span class="zf-dw-short"></span></div>'
        + '<div class="zf-dw-more"><div class="zf-dw-inner"><div class="zf-dw-full"></div><div class="zf-dw-note"></div><div class="zf-dw-source"></div>'
        + '<div class="zf-dw-foot"><button type="button" class="zf-dw-icon" data-act="pin"></button><span style="flex:1"></span>'
        + '<button type="button" class="zf-dw-btn" data-act="copy" tabindex="-1">Copy</button>'
        + '<button type="button" class="zf-dw-btn zf-dw-primary" data-act="attach" tabindex="-1">Attach to chat</button></div></div></div>'
      const q = c => it.querySelector(c)
      const fill = (c, t) => { const el = q(c); el.textContent = t || ''; el.hidden = !t }
      fill('.zf-dw-title', entry.title || (entry.value ? '' : 'Snippet'))
      fill('.zf-dw-short', entry.value || entry.note)
      fill('.zf-dw-full', entry.value)
      fill('.zf-dw-note', entry.note)
      fill('.zf-dw-source', entry.source)
      if (loose) {
        const tag = document.createElement('span'); tag.className = 'zf-dw-loose'; tag.textContent = 'not in library'
        q('.zf-dw-line').appendChild(tag)
      }
      const pin = q("[data-act='pin']")
      const on = !loose
      pin.toggleAttribute('data-on', on)
      pin.innerHTML = on ? ICON_PIN_SOLID : ICON_PIN
      pin.title = on ? 'Unpin from Snippets' : 'Pin to Snippets'
      pin.setAttribute('aria-label', pin.title)
      pin.tabIndex = -1
      return it
    }
    const renderDrawer = () => {
      const el = drawer.el
      if (!el) return
      const keep = drawer.items[drawer.focus]?.id
      if (drawer.loose && isPinned(drawer.loose.id)) drawer.loose = null
      drawer.items = [...(drawer.loose ? [drawer.loose] : []), ...pins.get()]
      const list = el.querySelector('.zf-dw-list')
      list.replaceChildren(...drawer.items.map((p, i) => drawerItem(p, i === 0 && !!drawer.loose)))
      el.querySelector('.zf-dw-count').textContent = pins.get().length ? String(pins.get().length) : ''
      if (!drawer.items.length) { closePreview(); return }
      const i = drawer.items.findIndex(p => p.id === keep)
      setDrawerFocus(i >= 0 ? i : Math.min(Math.max(drawer.focus, 0), drawer.items.length - 1), true)
    }
    const setDrawerFocus = (i, instant) => {
      const el = drawer.el
      if (!el || i < 0 || i >= drawer.items.length) return
      drawer.focus = i
      const rows = [...el.querySelectorAll('.zf-dw-item')]
      rows.forEach((r, k) => {
        const on = k === i
        r.toggleAttribute('data-focus', on)
        r.querySelectorAll('button').forEach(b => { b.tabIndex = on ? 0 : -1 })
      })
      const id = drawer.items[i].id
      lib.el?.querySelectorAll('.zf-lib-row').forEach(r => r.toggleAttribute('data-current', r.dataset.id === id))
      // centre the open one, measuring it at its opened height
      const list = el.querySelector('.zf-dw-list')
      const row = rows[i]
      const h = row.querySelector('.zf-dw-line').offsetHeight + row.querySelector('.zf-dw-inner').scrollHeight
      const top = row.offsetTop - list.offsetTop - Math.max(0, (list.clientHeight - h) / 2)
      list.scrollTo({ top: Math.max(0, top), behavior: instant || reducedMotion() ? 'auto' : 'smooth' })
    }
    const say = (btn, text, ms = 1400) => {
      const was = btn.dataset.label || btn.textContent
      btn.dataset.label = was
      btn.textContent = text
      setTimeout(() => { if (btn.isConnected) btn.textContent = was }, ms)
    }
    const onDrawerKey = e => {
      if (!drawer.el) return
      const inDrawer = drawer.el.contains(document.activeElement) || document.activeElement === document.body
      if (e.key === 'Escape') { e.stopPropagation(); e.preventDefault(); closePreview(); return }
      if (!inDrawer) return
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault()
        setDrawerFocus(drawer.focus + (e.key === 'ArrowDown' ? 1 : -1))
      } else if (e.key === 'Enter' && !e.target.closest?.('button')) {
        e.preventDefault()
        drawer.el.querySelector('.zf-dw-item[data-focus] [data-act=attach]')?.click()
      }
    }
    const onDrawerOutside = e => {
      if (!drawer.el || drawer.el.contains(e.target)) return
      // a snippet elsewhere re-aims the drawer instead of closing it
      if (e.target.closest?.('#zephyr-snips .zf-lib-row, .zf-snip, .zf-tile')) return
      closePreview()
    }
    const closePreview = () => {
      const el = drawer.el
      if (!el) return
      drawer.el = null
      drawer.loose = null
      document.removeEventListener('keydown', onDrawerKey, true)
      document.removeEventListener('pointerdown', onDrawerOutside, true)
      window.removeEventListener('resize', placeDrawer)
      lib.el?.querySelectorAll('.zf-lib-row[data-current]').forEach(r => r.removeAttribute('data-current'))
      if (reducedMotion()) el.remove()
      else { el.setAttribute('data-leaving', ''); setTimeout(() => el.remove(), 170) }
      try { if (el.contains(document.activeElement)) drawer.prevFocus?.focus?.() } catch {}
    }
    const openPreview = entry => {
      if (!entry || typeof document === 'undefined') return
      if (!isPinned(entry.id)) drawer.loose = entry
      else if (drawer.loose?.id !== entry.id) drawer.loose = drawer.el ? drawer.loose : null
      if (!drawer.el) {
        drawer.prevFocus = document.activeElement
        const el = document.createElement('div')
        el.id = 'zephyr-snip-drawer'
        el.tabIndex = -1
        el.setAttribute('role', 'dialog')
        el.setAttribute('aria-label', 'Snippets')
        el.innerHTML = '<div class="zf-dw-head"><span>Snippets</span><span class="zf-dw-count"></span><span class="zf-dw-keys">↑ ↓</span>'
          + `<button type="button" class="zf-dw-icon" data-act="close" aria-label="Close" title="Close (Esc)">${ICON_X}</button></div><div class="zf-dw-list"></div>`
        el.addEventListener('click', e => {
          const btn = e.target.closest?.('[data-act]')
          const row = e.target.closest?.('.zf-dw-item')
          if (!btn) { if (row && !row.hasAttribute('data-focus')) setDrawerFocus([...el.querySelectorAll('.zf-dw-item')].indexOf(row)); return }
          const act = btn.dataset.act
          if (act === 'close') { closePreview(); return }
          const it = drawer.items[[...el.querySelectorAll('.zf-dw-item')].indexOf(row)]
          if (!it) return
          if (act === 'pin') { if (isPinned(it.id)) { drawer.loose = it; unpinSnip(it.id) } else pinSnip(it); renderDrawer() }
          else if (act === 'copy') { void navigator.clipboard?.writeText(snipText(it)); say(btn, 'Copied') }
          else if (act === 'attach') {
            btn.disabled = true
            attachSnip(it).then(ok => { btn.disabled = false; say(btn, ok ? 'Attached' : 'Copied, paste it in', ok ? 1400 : 2200) })
          }
        })
        // the wheel walks the column one snippet at a time
        el.querySelector('.zf-dw-list').addEventListener('wheel', e => {
          if (e.target.closest?.('.zf-dw-full') && e.target.closest('.zf-dw-full').scrollHeight > e.target.closest('.zf-dw-full').clientHeight) return
          e.preventDefault()
          const now = Date.now()
          if (now - drawer.wheelAt > 300) drawer.wheel = 0
          drawer.wheelAt = now
          drawer.wheel += e.deltaY
          if (Math.abs(drawer.wheel) >= 60) { setDrawerFocus(drawer.focus + Math.sign(drawer.wheel)); drawer.wheel = 0 }
        }, { passive: false })
        document.body.appendChild(el)
        drawer.el = el
        placeDrawer()
        document.addEventListener('keydown', onDrawerKey, true)
        document.addEventListener('pointerdown', onDrawerOutside, true)
        window.addEventListener('resize', placeDrawer)
      }
      drawer.items = []
      renderDrawer()
      setDrawerFocus(drawer.items.findIndex(p => p.id === entry.id), !drawer.el.dataset.shown)
      drawer.el.dataset.shown = '1'
      if (!drawer.el.contains(document.activeElement)) drawer.el.focus({ preventScroll: true })
    }

    // ── Snippet library (its own sidebar card) ────────────────────────────
    // Pinned snippets live in a SNIPPETS card under the status card (or under
    // search when there is none), toggled in Settings > Snippets. Header click
    // folds it. A row: click = preview, drag onto the Shelf, drag off = unpin.
    // A snippet dragged over the card shows as a ghost row where it will land.
    const LIB_MAX_ROWS = 6
    const ICON_BOOKMARK = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m19 21-7-4-7 4V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v16z"/></svg>'
    const ICON_CHEV = '<svg class="zf-lib-chev" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3.5 6 8 10.5 12.5 6"/></svg>'
    const lib = { el: null, sig: '', phantom: null, open: stored(STORE_KEYS.libraryOpen) !== false, h: 0, key: '', room: null }
    const ensureLib = () => {
      if (lib.el) return lib.el
      const el = document.createElement('div')
      el.id = 'zephyr-snips'
      el.hidden = true
      el.innerHTML = `<div class="zf-lib-head" role="button" tabindex="0">${ICON_BOOKMARK}<span class="zf-lib-label">Snippets</span><span class="zf-lib-count"></span>${ICON_CHEV}</div><div class="zf-lib-rows"></div>`
      const head = el.firstElementChild
      const toggle = () => {
        lib.open = !lib.open
        ctx.storage.set(STORE_KEYS.libraryOpen, lib.open)
        lib.key = ''
        layoutLibrary()
      }
      head.addEventListener('click', () => { if (Date.now() - pinDrag.endedAt > 250) toggle() })
      head.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle() } })
      const rows = el.lastElementChild
      rows.addEventListener('pointerdown', e => {
        const row = e.target.closest?.('.zf-lib-row[data-id]')
        if (!row) return
        const entry = pins.get().find(p => p.id === row.dataset.id)
        if (entry) startDrag(e, { type: 'pin', entry }, row, true)
      })
      rows.addEventListener('keydown', e => {
        const row = e.target.closest?.('.zf-lib-row[data-id]')
        if (row && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); openPreview(pins.get().find(p => p.id === row.dataset.id)) }
      })
      document.body.appendChild(el)
      lib.el = el
      return el
    }
    const libRow = (p, phantom) => {
      const row = document.createElement('div')
      row.className = 'zf-lib-row'
      if (phantom) row.setAttribute('data-phantom', '')
      else { row.dataset.id = p.id; row.tabIndex = 0; row.setAttribute('role', 'button'); row.title = [p.title, p.value].filter(Boolean).join(': ') + '. Click to preview' }
      if (p.title) { const t = document.createElement('span'); t.className = 'truncate zf-lib-title'; t.textContent = p.title; row.appendChild(t) }
      const v = document.createElement('span'); v.className = 'truncate zf-lib-value'; v.textContent = p.value || p.note || ''
      row.appendChild(v)
      return row
    }
    const renderLib = () => {
      const el = ensureLib()
      const list = pins.get()
      const ph = lib.phantom && !list.some(p => p.id === lib.phantom.id) ? lib.phantom : null
      const sig = JSON.stringify(list.map(p => p.id)) + (ph ? '+' + ph.id : '')
      const count = list.length ? String(list.length) : ''
      const countEl = el.querySelector('.zf-lib-count')
      if (countEl && countEl.textContent !== count) countEl.textContent = count
      if (sig === lib.sig) return
      lib.sig = sig
      const rows = el.querySelector('.zf-lib-rows')
      rows.replaceChildren(...list.map(p => libRow(p, false)), ...(ph ? [libRow(ph, true)] : []))
      if (!list.length && !ph) {
        const hint = document.createElement('div')
        hint.className = 'zf-lib-hint'
        hint.textContent = 'Drag a snippet here, or pin one'
        rows.appendChild(hint)
      }
    }
    const cropLib = () => {
      if (!lib.el || lib.el.hidden) return
      for (const row of lib.el.querySelectorAll('.zf-lib-row')) {
        const spans = [...row.querySelectorAll('.truncate')].filter(sp => sp.firstChild?.nodeType === 3).map(spanInfo)
        try { fitLine(row, spans) } catch {}
      }
    }
    const unlib = () => {
      if (lib.el) lib.el.hidden = true
      if (lib.room) { lib.room.removeAttribute('data-zephyr-lib-room'); lib.room.style.removeProperty('--zf-lib-room'); lib.room = null }
      lib.h = 0
      lib.key = ''
    }
    const layoutLibrary = () => {
      if (typeof document === 'undefined' || !document.body) return
      const parts = library.get() ? sidebarParts() : null
      if (!parts) { unlib(); return }
      const { side, room, r } = parts
      const el = ensureLib()
      renderLib()
      if (lib.room && lib.room !== room) unlib()
      const rem = parseFloat(getComputedStyle(document.documentElement).fontSize) || 16
      const gap = 0.5 * rem
      const headH = Math.round(1.85 * rem)
      const srow = room.querySelector("[data-slot='sidebar-menu-item']")
      const rowH = Math.round(Math.max(22, Math.min(64, srow?.getBoundingClientRect().height || 1.85 * rem)))
      const btn = srow?.querySelector?.("[data-slot='sidebar-menu-button']")
      const content = side.querySelector("[data-slot='sidebar-content']")
      const cs = content ? getComputedStyle(content) : null
      const flexGap = cs ? parseFloat(cs.rowGap) || 0 : 0
      const prev = room.previousElementSibling
      const ceiling = prev ? prev.getBoundingClientRect().bottom + flexGap : (content ? content.getBoundingClientRect().top + (parseFloat(cs.paddingTop) || 0) : r.top)
      const statusOn = dock.side && dock.head && !dock.head.hidden
      const statusH = statusOn ? (parseFloat(dock.head.style.getPropertyValue('--zf-sd-h')) || 0) + gap : 0
      const n = pins.get().length + (lib.sig.includes('+') ? 1 : 0)
      // the estimate from the sessions row height, or the rows as they actually
      // render if that's taller (a bigger font, a hint line), so nothing clips
      const estH = Math.round(Math.max(1, Math.min(n, LIB_MAX_ROWS)) * (rowH + 0.1 * rem) + 0.45 * rem)
      const libRows = el.querySelector('.zf-lib-rows')
      const shown = libRows ? [...libRows.children].slice(0, LIB_MAX_ROWS) : []
      const realH = shown.length ? Math.ceil(shown.reduce((a, k) => a + Math.max(rowH, k.getBoundingClientRect().height), 0) + (shown.length - 1) * 0.1 * rem + 0.45 * rem) : 0
      const bodyH = Math.max(estH, realH)
      const h = headH + (lib.open ? bodyH : 0)
      const padX = cs ? parseFloat(cs.paddingLeft) || 10 : 10
      const x = Math.round(r.left + padX)
      const w = Math.round(r.width - 2 * padX)
      const top = Math.round(ceiling + statusH)
      const key = [x, w, top, h, lib.open, lib.sig, rowH].join('|')
      if (key === lib.key && !el.hidden) return
      lib.key = key
      el.hidden = false
      el.toggleAttribute('data-open', lib.open)
      el.firstElementChild.setAttribute('aria-expanded', String(lib.open))
      el.firstElementChild.title = lib.open ? 'Collapse snippets' : 'Expand snippets'
      el.style.setProperty('--zf-lib-x', `${x}px`)
      el.style.setProperty('--zf-lib-y', `${top}px`)
      el.style.setProperty('--zf-lib-w', `${w}px`)
      el.style.setProperty('--zf-lib-h', `${h}px`)
      el.style.setProperty('--zf-lib-head', `${headH}px`)
      el.style.setProperty('--zf-sd-rowh', `${rowH}px`)
      if (btn) el.style.setProperty('--zf-sd-font', getComputedStyle(btn).fontSize)
      const lab = side.querySelector("[class*='tracking-[0.16em]']")
      if (lab) { const c = getComputedStyle(lab); el.style.setProperty('--zf-sd-lab-size', c.fontSize); el.style.setProperty('--zf-sd-lab-color', c.color) }
      room.setAttribute('data-zephyr-lib-room', '')
      room.style.setProperty('--zf-lib-room', `${h + gap}px`)
      lib.room = room
      lib.h = h + gap
      requestAnimationFrame(cropLib)
    }
    const showLibPhantom = entry => {
      const id = entry?.id || ''
      if ((lib.phantom?.id || '') === id) return
      lib.phantom = entry || null
      if (!lib.el || lib.el.hidden) return
      if (entry && !lib.open) { lib.open = true; lib.reopen = true }
      if (!entry && lib.reopen) { lib.open = false; lib.reopen = false }
      lib.key = ''
      layoutLibrary()
      if (entry) morphFrom(lib.el.querySelector('.zf-lib-row[data-phantom]'), ghostRect(), 260)
    }
    const onPinsChanged = () => {
      if (drawer.el) renderDrawer()
      lib.key = ''
      layoutLibrary()
      layoutShelf()
    }

    // ── The Shelf ─────────────────────────────────────────────────────────
    // Two slots on the new-chat screen, above and below the Hermes wordmark.
    // Empty, they show only while something is being dragged; once they hold
    // tiles they stay. Status tiles mirror their row live; snippet tiles
    // show the value large and the title small. Fixed in <body> over the
    // intro (Hermes's DOM is never touched), placed off the wordmark's box.
    const SHELF_SLOTS = ['above', 'below']
    const SHELF_MAX = 4
    const refId = r => r.kind === 'status' ? 's:' + r.key : 'n:' + r.entry.id
    const loadShelf = () => {
      const v = stored(STORE_KEYS.shelf)
      const ok = a => Array.isArray(a)
        ? a.filter(r => r && ((r.kind === 'status' && typeof r.key === 'string' && r.key) || (r.kind === 'snip' && r.entry && typeof r.entry.id === 'string'))).slice(0, SHELF_MAX)
        : []
      return { above: ok(v?.above), below: ok(v?.below) }
    }
    let shelf = loadShelf()
    const shelfEls = {}
    const shelfSig = { above: '', below: '' }
    const saveShelf = () => {
      ctx.storage.set(STORE_KEYS.shelf, shelf)
      shelfSig.above = shelfSig.below = ''
      layoutShelf()
    }
    const shelfPut = (ref, hit) => {
      if (!ref || (ref.kind === 'status' && !ref.key)) return
      const id = refId(ref)
      let at = hit.index
      for (const sl of SHELF_SLOTS) {
        const i = shelf[sl].findIndex(r => refId(r) === id)
        if (i >= 0) { shelf[sl].splice(i, 1); if (sl === hit.slot && i < at) at-- }
      }
      const list = shelf[hit.slot]
      if (list.length >= SHELF_MAX) { saveShelf(); return }
      list.splice(Math.max(0, Math.min(at, list.length)), 0, ref)
      saveShelf()
    }
    const shelfMove = (slot, idx, hit) => {
      const ref = shelf[slot][idx]
      if (!ref) return
      if (hit.slot !== slot && shelf[hit.slot].length >= SHELF_MAX) return
      shelfPut(ref, hit)
    }
    const shelfRemove = (slot, idx) => { shelf[slot].splice(idx, 1); saveShelf() }
    // Resize: drag a tile's right edge. The width is kept on the tile's ref
    // (so it rides along when the tile moves); double-click resets it.
    const startResize = (e, tile, ref) => {
      if (e.button !== 0) return
      e.preventDefault()
      e.stopPropagation()
      const rem = parseFloat(getComputedStyle(document.documentElement).fontSize) || 16
      const shelfW = tile.parentElement.getBoundingClientRect().width
      const x0 = e.clientX
      const w0 = tile.getBoundingClientRect().width
      const min = 4.5 * rem
      let w = w0
      tile.setAttribute('data-resizing', '')
      document.documentElement.setAttribute('data-zf-resizing', '')
      const move = ev => {
        if (ev.pointerId !== e.pointerId) return
        // tiles are centred, so the edge moves half as fast as the width
        w = Math.round(Math.max(min, Math.min(shelfW, w0 + (ev.clientX - x0) * 2)))
        tile.style.flex = `0 1 ${w}px`
        cropTile(tile)
      }
      const up = ev => {
        if (ev.pointerId !== e.pointerId) return
        window.removeEventListener('pointermove', move, true)
        window.removeEventListener('pointerup', up, true)
        window.removeEventListener('pointercancel', up, true)
        tile.removeAttribute('data-resizing')
        document.documentElement.removeAttribute('data-zf-resizing')
        pinDrag.endedAt = Date.now()
        if (Math.abs(w - w0) >= 2) { ref.w = w; saveShelf() }
      }
      window.addEventListener('pointermove', move, true)
      window.addEventListener('pointerup', up, true)
      window.addEventListener('pointercancel', up, true)
    }
    // A tap on a status tile lands on the same part of the real row: the
    // clone mirrors the row node for node, so the tapped node's child-index
    // path finds its twin. A control there (pause, skip) gets a real click;
    // anywhere else opens the row's own menu, placed beside the tile.
    const CONTROL = "button, a, input, select, [role='button'], [role='switch'], [role='checkbox'], [role='slider'], [role='menuitem']"
    const twinOf = (face, row, node) => {
      const path = []
      for (let n = node; n && n !== face; n = n.parentElement) {
        const p = n.parentElement
        if (!p) return null
        path.unshift([...p.children].indexOf(n))
      }
      let t = row
      for (const i of path) { t = t?.children[i]; if (!t) return null }
      return t
    }
    const realClick = (el, near) => {
      const r = el.getBoundingClientRect()
      const x = r.width ? r.left + r.width / 2 : (near?.left ?? 0), y = r.height ? r.top + r.height / 2 : (near?.top ?? 0)
      const base = { bubbles: true, cancelable: true, composed: true, button: 0, clientX: x, clientY: y, view: window }
      const pe = { ...base, pointerId: 1, pointerType: 'mouse', isPrimary: true }
      pinDrag.replay = true
      try {
        el.dispatchEvent(new PointerEvent('pointerdown', { ...pe, buttons: 1 }))
        el.dispatchEvent(new MouseEvent('mousedown', { ...base, buttons: 1 }))
        el.dispatchEvent(new PointerEvent('pointerup', { ...pe, buttons: 0 }))
        el.dispatchEvent(new MouseEvent('mouseup', { ...base, buttons: 0 }))
        el.dispatchEvent(new MouseEvent('click', { ...base, buttons: 0, detail: 1 }))
      } finally { pinDrag.replay = false }
    }
    const tapStatusTile = (ref, tile, at) => {
      const row = statusRowFor(ref.key)
      const face = tile.querySelector('.zf-tile-face')
      if (!row || !face) return false
      const hit = at && face.contains(at) ? at.closest(CONTROL) : null
      const twin = hit && face.contains(hit) ? twinOf(face, row, hit) : null
      // the control tapped, if it is a control of its own (not the whole row)
      if (twin && twin !== row) {
        dock.popAnchor = { el: tile, at: Date.now() } // in case it opens a menu
        realClick(twin, tile.getBoundingClientRect())
        // let React re-render the row, then mirror it
        setTimeout(() => { shelfSig.above = shelfSig.below = ''; layoutShelf() }, 60)
        return true
      }
      // the box: the row's own menu. The row itself when it is the trigger,
      // else the trigger inside it (a plugin's rendered item), else the
      // first control in it.
      const trig = row.matches('[aria-haspopup], button, a') ? row
        : row.querySelector('[aria-haspopup]') || row.querySelector(CONTROL) || row
      dock.popAnchor = { el: tile, at: Date.now() }
      realClick(trig, tile.getBoundingClientRect())
      return true
    }
    const ensureShelf = () => {
      for (const sl of SHELF_SLOTS) {
        if (shelfEls[sl]) continue
        const el = document.createElement('div')
        el.id = `zephyr-shelf-${sl}`
        el.className = 'zf-shelf'
        el.dataset.slot = sl
        el.hidden = true
        el.addEventListener('pointerdown', e => {
          const tile = e.target.closest?.('.zf-tile')
          if (!tile) return
          const idx = [...el.querySelectorAll('.zf-tile')].indexOf(tile)
          const ref = shelf[sl][idx]
          if (!ref) return
          if (e.target.closest('.zf-tile-grip')) { startResize(e, tile, ref); return }
          startDrag(e, { type: 'tile', ref, slot: sl, idx, at: e.target }, tile, true)
        })
        el.addEventListener('dblclick', e => {
          const tile = e.target.closest?.('.zf-tile')
          if (!tile || !e.target.closest('.zf-tile-grip')) return
          const ref = shelf[sl][[...el.querySelectorAll('.zf-tile')].indexOf(tile)]
          if (ref?.w) { delete ref.w; saveShelf() }
        })
        // the clone's own controls are dead DOM: never let one act natively
        el.addEventListener('click', e => { if (e.target.closest?.('.zf-tile-face')) e.preventDefault() })
        el.addEventListener('keydown', e => {
          const tile = e.target.closest?.('.zf-tile')
          if (!tile || !(e.key === 'Enter' || e.key === ' ')) return
          e.preventDefault()
          const ref = shelf[sl][[...el.querySelectorAll('.zf-tile')].indexOf(tile)]
          if (ref?.kind === 'snip') openPreview(ref.entry)
          else if (ref && !tapStatusTile(ref, tile, null)) openStatusFrom(ref.key, tile, null)
        })
        document.body.appendChild(el)
        shelfEls[sl] = el
      }
    }
    const shelfSlotAt = (x, y) => {
      if (!pinDrag.moving) return null
      for (const sl of SHELF_SLOTS) {
        const el = shelfEls[sl]
        if (!el || el.hidden || !inRect(el, x, y, 10)) continue
        const tiles = [...el.querySelectorAll('.zf-tile:not([data-phantom])')]
        const index = tiles.filter(t => { const r = t.getBoundingClientRect(); return r.left + r.width / 2 < x }).length
        return { slot: sl, index }
      }
      return null
    }
    // the dragged thing, drawn as a ghost tile where it would land
    const phantom = { el: null, slot: '', index: -1 }
    // FLIP: grow an element out of a rect (the drag chip, or where it just was)
    const MORPH_EASE = 'cubic-bezier(.32,.72,0,1)'
    const morphFrom = (el, from, ms = 240) => {
      if (!el || !from || !el.animate || reducedMotion()) return
      const to = el.getBoundingClientRect()
      if (!to.width || !to.height) return
      const dx = from.left - to.left, dy = from.top - to.top
      const sx = from.width / to.width, sy = from.height / to.height
      if (Math.abs(dx) < 1 && Math.abs(dy) < 1 && Math.abs(sx - 1) < 0.02 && Math.abs(sy - 1) < 0.02) return
      el.animate([
        { transformOrigin: '0 0', transform: `translate(${dx}px, ${dy}px) scale(${sx}, ${sy})`, opacity: 0.35 },
        { transformOrigin: '0 0', transform: 'none', opacity: getComputedStyle(el).opacity }
      ], { duration: ms, easing: MORPH_EASE })
    }
    const ghostRect = () => pinDrag.ghost?.getBoundingClientRect() || null
    const phantomRef = src => src.type === 'tile' ? src.ref
      : (src.type === 'status' || src.type === 'chip') ? { kind: 'status', key: src.key || pinnedKey(), last: src.text }
      : { kind: 'snip', entry: src.entry }
    const showShelfPhantom = (hit, src) => {
      if (!hit) {
        phantom.el?.remove()
        phantom.el = null
        phantom.slot = ''
        phantom.index = -1
        SHELF_SLOTS.forEach(sl => shelfEls[sl]?.removeAttribute('data-preview'))
        return
      }
      if (phantom.slot === hit.slot && phantom.index === hit.index && phantom.el) return
      const fresh = !phantom.el || phantom.slot !== hit.slot
      const was = phantom.el?.getBoundingClientRect() || null
      if (!phantom.el) {
        phantom.el = tileFor(phantomRef(src))
        phantom.el.setAttribute('data-phantom', '')
        phantom.el.removeAttribute('tabindex')
      }
      const el = shelfEls[hit.slot]
      SHELF_SLOTS.forEach(sl => shelfEls[sl]?.toggleAttribute('data-preview', sl === hit.slot))
      const tiles = [...el.querySelectorAll('.zf-tile:not([data-phantom])')]
      el.insertBefore(phantom.el, tiles[hit.index] || null)
      phantom.slot = hit.slot
      phantom.index = hit.index
      cropTile(phantom.el)
      // the chip under the cursor grows into the tile; a reorder slides it
      morphFrom(phantom.el, fresh ? ghostRect() : was, fresh ? 260 : 180)
    }
    // the live row for a status key (null when the dock is off)
    const statusRowFor = key => {
      const bar = document.querySelector(`footer[data-slot='statusbar'][${DOCK_ATTR}]`)
      const rows = statusRows(bar)
      return rows.find(r => statusKey(r, rows) === key) || null
    }
    const statusLast = {}
    const tileFor = (ref, w) => {
      const tile = document.createElement('div')
      tile.className = 'zf-tile'
      tile.dataset.kind = ref.kind
      tile.tabIndex = 0
      tile.setAttribute('role', 'button')
      const label = document.createElement('span')
      label.className = 'zf-tile-label'
      const value = document.createElement('span')
      value.className = 'zf-tile-value'
      if (ref.kind === 'snip') {
        const e = ref.entry
        label.textContent = e.title || 'Snippet'
        const t = document.createElement('span'); t.className = 'zf-tile-text'; t.textContent = e.value || e.note || ''
        value.appendChild(t)
        tile.title = [e.title, e.value].filter(Boolean).join(': ') + '. Click to preview, drag off to remove'
      } else {
        // a status tile is the row itself, no label: Hermes's own markup
        // cloned whole, so its spacing and muted parts ("Backend ready")
        // survive; inert, since a click on the tile opens the row's menu
        const row = statusRowFor(ref.key)
        if (row) {
          const face = row.cloneNode(true)
          face.querySelectorAll('[id], [title]').forEach(n => { n.removeAttribute('id'); n.removeAttribute('title') })
          face.removeAttribute('id')
          face.removeAttribute('title')
          ;[...face.attributes].filter(a => a.name.startsWith('data-zephyr') || a.name.startsWith('aria-')).forEach(a => face.removeAttribute(a.name))
          // the sidebar's smart crop rides along in the clone: undo it
          face.querySelectorAll('[data-zf-full]').forEach(n => { if (n.firstChild?.nodeType === 3) n.firstChild.nodeValue = n.dataset.zfFull; delete n.dataset.zfFull; delete n.dataset.zfCrop })
          face.classList.add('zf-tile-face')
          // live-looking but dead: a tap on any part is replayed on the same
          // part of the real row (pause, the menu...), see tapStatusTile
          ;[face, ...face.querySelectorAll('*')].forEach(n => [...n.attributes].forEach(at => { if (/^on/i.test(at.name)) n.removeAttribute(at.name) }))
          face.querySelectorAll('button, a, input, [tabindex]').forEach(n => { n.setAttribute('tabindex', '-1'); n.removeAttribute('href') })
          if (face.matches('button, a, [tabindex]')) { face.setAttribute('tabindex', '-1'); face.removeAttribute('href') }
          face.removeAttribute('disabled')
          value.appendChild(face)
          statusLast[ref.key] = rowText(row)
          tile.title = statusLast[ref.key] + '. Click for its menu, drag off to remove'
        } else {
          tile.setAttribute('data-stale', '')
          const t = document.createElement('span'); t.className = 'truncate'; t.textContent = statusLast[ref.key] || ref.last || ref.key.replace(/^lucide-|^txt:/, '')
          value.appendChild(t)
          tile.title = t.textContent + ' (status bar hidden)'
        }
      }
      if (ref.kind === 'snip') tile.append(label, value)
      else tile.append(value)
      // a sized tile keeps its width (it still shrinks if the shelf is full)
      if (ref.w > 0) tile.style.flex = `0 1 ${ref.w}px`
      const grip = document.createElement('span')
      grip.className = 'zf-tile-grip'
      grip.title = 'Drag to resize. Double-click to reset'
      tile.appendChild(grip)
      return tile
    }
    const cropTile = tile => {
      const v = tile?.querySelector('.zf-tile-value')
      if (!v) return
      const face = v.querySelector('.zf-tile-face')
      if (!face && !v.querySelector('.truncate')) return
      try { fitLine(face || v, (face ? croppable(face) : [...v.querySelectorAll('.truncate')]).map(spanInfo)) } catch {}
    }
    const shelf$ = { ro: null, watched: null, raf: 0 }
    const layoutShelf = () => {
      if (typeof document === 'undefined' || !document.body) return
      ensureShelf()
      const intro = document.querySelector("[data-slot='aui_intro']")
      const box = intro?.firstElementChild
      const br = box?.getBoundingClientRect()
      const hideAll = () => SHELF_SLOTS.forEach(sl => { shelfEls[sl].hidden = true })
      if (!intro || !br || br.width < 120 || !intro.getClientRects().length) { hideAll(); return }
      if (typeof ResizeObserver === 'function' && shelf$.watched !== intro) {
        shelf$.ro?.disconnect()
        shelf$.ro = new ResizeObserver(() => { if (!shelf$.raf) shelf$.raf = requestAnimationFrame(() => { shelf$.raf = 0; layoutShelf() }) })
        shelf$.ro.observe(intro)
        shelf$.watched = intro
      }
      const mark = box.querySelector(".wordmark, [class*='wordmark']") || box.firstElementChild
      const para = box.querySelector('p:last-child') || mark
      const mr = mark.getBoundingClientRect()
      const pr = para.getBoundingClientRect()
      const ir = intro.getBoundingClientRect()
      const input = document.querySelector("[data-slot='composer-rich-input']")
      const form = input?.closest('form') || input?.parentElement
      const floor = Math.min(window.innerHeight - 8, form ? form.getBoundingClientRect().top - 12 : Infinity)
      // the intro is only as tall as its copy: measure up to the pane it sits in
      let pane = intro.parentElement
      while (pane && pane !== document.body && pane.getBoundingClientRect().height < ir.height + 120) pane = pane.parentElement
      const ceil = Math.max(8, (pane && pane !== document.body ? pane.getBoundingClientRect().top : 0) + 8)
      const rem = parseFloat(getComputedStyle(document.documentElement).fontSize) || 16
      const H = Math.round(3.1 * rem)
      const gap = Math.round(1.25 * rem)
      const dragging = pinDrag.moving
      const w = Math.min(Math.round(br.width), Math.round(40 * rem))
      const x = Math.round(br.left + (br.width - w) / 2)
      for (const sl of SHELF_SLOTS) {
        const el = shelfEls[sl]
        const items = shelf[sl]
        const top = sl === 'above' ? Math.round(mr.top - gap - H) : Math.round(pr.bottom + gap)
        const fits = sl === 'above' ? top >= ceil : top + H <= floor
        if (!(items.length || dragging) || !fits) {
          el.hidden = true
          if (!items.length && el.firstChild) { el.replaceChildren(); shelfSig[sl] = '' }
          continue
        }
        el.hidden = false
        el.style.setProperty('--zf-sh-x', `${x}px`)
        el.style.setProperty('--zf-sh-y', `${top}px`)
        el.style.setProperty('--zf-sh-w', `${w}px`)
        el.style.setProperty('--zf-sh-h', `${H}px`)
        el.toggleAttribute('data-empty', !items.length)
        // render first, measure after (below), so the slot fits its tallest tile
        const live = items.map(r => r.kind === 'status' ? (statusRowFor(r.key)?.innerHTML || '') : '').join('|')
        const sig = JSON.stringify(items.map(r => refId(r) + '@' + (r.w || 0))) + live + w + (items.length ? '' : dragging ? 'D' : '')
        if (sig !== shelfSig[sl]) {
          shelfSig[sl] = sig
          if (!items.length) {
            const hint = document.createElement('div')
            hint.className = 'zf-shelf-hint'
            hint.textContent = sl === 'above' ? 'Drop here' : 'Or here'
            el.replaceChildren(hint)
          } else {
            el.replaceChildren(...items.map(r => tileFor(r, w)))
            // smart-crop each value line to its tile
            el.querySelectorAll('.zf-tile').forEach(cropTile)
          }
        }
        // grow to the tallest tile (a wrapped snippet), never below the base
        // height; the upper slot grows upward so it keeps its gap to the mark
        if (items.length) {
          el.style.setProperty('--zf-sh-h', 'auto')
          const Hs = Math.max(H, Math.ceil(el.getBoundingClientRect().height))
          const topS = sl === 'above' ? Math.round(mr.top - gap - Hs) : top
          const fitsS = sl === 'above' ? topS >= ceil : topS + Hs <= floor
          el.style.setProperty('--zf-sh-y', `${fitsS ? topS : top}px`)
          el.style.setProperty('--zf-sh-h', `${fitsS ? Hs : H}px`)
        }
      }
    }
    // A status tile's click: open that status's own menu, placed beside the
    // tile (placeDockPop reads dock.popAnchor).
    const openStatusFrom = (key, tile, e) => {
      const row = statusRowFor(key)
      if (!row) return
      dock.popAnchor = { el: tile, at: Date.now() }
      const r = row.getBoundingClientRect()
      pinDrag.replay = true
      try {
        row.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true, composed: true, button: 0, buttons: 1, pointerId: e?.pointerId ?? 1, pointerType: e?.pointerType || 'mouse', isPrimary: true, clientX: r.left + 4, clientY: r.top + 4 }))
        if (!e) row.click?.()
      } finally { pinDrag.replay = false }
    }
    let pinsUnsub = null
    try { pinsUnsub = pins.subscribe?.(() => { if (lib.el) onPinsChanged() }) } catch {}

    const ensureSideHead = () => {
      if (dock.head) return dock.head
      const head = document.createElement('div')
      head.id = 'zephyr-statusdock-head'
      head.setAttribute('role', 'button')
      head.tabIndex = 0
      head.innerHTML = '<span class="zf-sd-row">'
        + '<svg class="zf-sd-eq" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><path d="M4 6v4M8 3.5v9M12 5.5v5"/></svg>'
        + '<svg class="zf-sd-pinico" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 17v5"/><path d="M9 10.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24V16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V7a1 1 0 0 1 1-1 2 2 0 0 0 0-4H8a2 2 0 0 0 0 4 1 1 0 0 1 1 1z"/></svg>'
        + '<span class="zf-sd-label">Status</span><span class="zf-sd-pin" title="Pinned. Drag off the title to unpin"></span>'
        + '<svg class="zf-sd-chev" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3.5 6 8 10.5 12.5 6"/></svg>'
        + '</span>'
      const toggle = () => {
        dock.manual = { open: !dock.sideOpen, auto: dock.lastAuto }
        dock.sideKey = ''
        layoutSideDock()
      }
      head.addEventListener('click', () => {
        if (Date.now() - pinDrag.endedAt < 250) return // the click that ends a drag
        toggle()
      })
      head.addEventListener('keydown', e => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle() }
      })
      head.querySelector('.zf-sd-pin').addEventListener('pointerdown', e => startPinDrag(e, null))
      document.body.appendChild(head)
      dock.head = head
      return head
    }
    const watchSide = els => {
      if (typeof ResizeObserver !== 'function') return
      if (els.length === dock.roWatched.length && els.every((el, i) => el === dock.roWatched[i])) return
      dock.ro?.disconnect()
      dock.ro = new ResizeObserver(() => requestAnimationFrame(() => layoutSideDock()))
      els.forEach(el => dock.ro.observe(el))
      dock.roWatched = els
    }
    const layoutSideDock = () => {
      const bar = document.querySelector(`footer[data-slot='statusbar'][${DOCK_ATTR}]`)
      const parts = bar && sidebarParts()
      if (!parts) { if (dock.side) unside(); return false }
      const { side, room, r } = parts
      const head = ensureSideHead()
      head.hidden = false
      if (dock.room && dock.room !== room) unside()
      dock.side = side
      dock.room = room
      bar.setAttribute(DOCK_SIDE_ATTR, '')
      room.setAttribute(DOCK_ROOM_ATTR, '')
      watchSide([side, bar])

      const rem = parseFloat(getComputedStyle(document.documentElement).fontSize) || 16
      const gap = 0.5 * rem
      const headH = Math.round(1.85 * rem)
      const row = room.querySelector("[data-slot='sidebar-menu-item']")
      const rowH = Math.max(22, Math.min(64, row?.getBoundingClientRect().height || 1.85 * rem))
      const need = (SIDE_MIN_SESSIONS + 2) * rowH
      // borrow the session rows' and section labels' faces so the card matches
      const btn = row?.querySelector?.("[data-slot='sidebar-menu-button']") || room.querySelector("[data-slot='sidebar-menu-button']")
      const lab = side.querySelector("[class*='tracking-[0.16em]']")
      const face = [btn && getComputedStyle(btn).fontSize, Math.round(rowH), lab && (() => { const c = getComputedStyle(lab); return [c.fontSize, c.fontWeight, c.letterSpacing, c.color].join('|') })()].join('/')
      if (face !== dock.face) {
        dock.face = face
        const set = (el, k, v) => { if (v) el.style.setProperty(k, v); else el.style.removeProperty(k) }
        for (const el of [head, bar]) {
          set(el, '--zf-sd-font', btn && getComputedStyle(btn).fontSize)
          set(el, '--zf-sd-rowh', row ? `${Math.round(rowH)}px` : '')
        }
        if (lab) {
          const c = getComputedStyle(lab)
          set(head, '--zf-sd-lab-size', c.fontSize); set(head, '--zf-sd-lab-weight', c.fontWeight)
          set(head, '--zf-sd-lab-track', c.letterSpacing === 'normal' ? '' : c.letterSpacing); set(head, '--zf-sd-lab-color', c.color)
        }
      }
      const maxBody = Math.round(r.height * 0.5)
      const body = Math.min(bar.scrollHeight || 0, maxBody)
      // Measure from the fixed ends (the list's top and the rail's top), so
      // a list mid-resize never feeds back into the verdict.
      const content = side.querySelector("[data-slot='sidebar-content']")
      const cs = content ? getComputedStyle(content) : null
      const flexGap = cs ? parseFloat(cs.rowGap) || 0 : 0
      const rail = room.parentElement?.lastElementChild !== room ? room.parentElement?.lastElementChild : null
      const floor = rail
        ? rail.getBoundingClientRect().top - flexGap
        : (content ? content.getBoundingClientRect().bottom - (parseFloat(cs.paddingBottom) || 0) : r.bottom)
      // The card sits at the TOP of the list, just under the search box, so
      // its header stays put and opening grows it downward (2026-10-10, Peter).
      const prev = room.previousElementSibling
      const ceiling = prev
        ? prev.getBoundingClientRect().bottom + flexGap
        : (content ? content.getBoundingClientRect().top + (parseFloat(cs.paddingTop) || 0) : r.top)
      // the list's height with the card shut, then with it open
      const shutList = floor - ceiling - (headH + gap)
      const auto = shutList - body - lib.h >= need
      refreshPin()
      if (dock.manual && dock.manual.auto !== auto) dock.manual = null
      dock.lastAuto = auto
      const open = dock.manual ? dock.manual.open : auto
      const cardH = headH + (open ? body : 0)
      const key = `${open}|${cardH}|${Math.round(r.left)}|${Math.round(r.width)}|${Math.round(r.height)}`
      if (key === dock.sideKey) return true
      dock.sideKey = key
      dock.sideOpen = open
      room.style.setProperty('--zf-sd-room', `${cardH + gap}px`)
      const padX = cs ? parseFloat(cs.paddingLeft) || 10 : 10
      const x = Math.round(r.left + padX)
      const w = Math.round(r.width - 2 * padX)
      const top = Math.round(ceiling)
      for (const el of [head, bar]) {
        el.style.setProperty('--zf-sd-x', `${x}px`)
        el.style.setProperty('--zf-sd-w', `${w}px`)
      }
      head.style.setProperty('--zf-sd-y-head', `${top}px`)
      head.style.setProperty('--zf-sd-h', `${cardH}px`)
      head.style.setProperty('--zf-sd-head', `${headH}px`)
      bar.style.setProperty('--zf-sd-y', `${top + headH}px`)
      bar.style.setProperty('--zf-sd-max', `${maxBody}px`)
      bar.toggleAttribute(DOCK_OPEN_ATTR, open)
      head.setAttribute('aria-expanded', String(open))
      head.title = open ? 'Collapse status' : 'Expand status'
      lib.key = ''
      layoutLibrary()
      return true
    }

    // Menus from the docked bar: Radix opens them above the trigger (the bar
    // was at the bottom). Docked, they open beside the panel instead, toward
    // the middle of the window. Only the wrapper whose content the trigger
    // controls is moved; submenus anchor to their parent and follow it.
    const placeDockPop = (wrap, trigger) => {
      const bar = trigger.closest('footer')
      if (!bar || !wrap.isConnected) return
      // opened from a Shelf tile: drop it under the tile instead
      const pa = dock.popAnchor
      if (pa && pa.el.isConnected && Date.now() - pa.at < 1500) {
        if (!wrap.dataset.zfAnchored) { wrap.dataset.zfAnchored = '1'; pa.at = 0; wrap.zfAnchor = pa.el }
      }
      if (wrap.zfAnchor?.isConnected) {
        const a = wrap.zfAnchor.getBoundingClientRect()
        const h = wrap.offsetHeight || 0
        const w = wrap.offsetWidth || 0
        const x = Math.max(8, Math.min(a.left + a.width / 2 - w / 2, window.innerWidth - w - 8))
        const below = a.bottom + 6 + h <= window.innerHeight - 8
        const y = below ? a.bottom + 6 : Math.max(8, a.top - 6 - h)
        wrap.style.setProperty('--zf-pop-x', `${Math.round(x)}px`)
        wrap.style.setProperty('--zf-pop-y', `${Math.round(y)}px`)
        wrap.style.setProperty('--zf-pop-origin', below ? 'center top' : 'center bottom')
        return
      }
      const b = bar.getBoundingClientRect()
      const t = trigger.getBoundingClientRect()
      const h = wrap.offsetHeight || 0
      const w = wrap.offsetWidth || 0
      const toRight = b.left + b.width / 2 < window.innerWidth / 2
      const x = toRight ? b.right + 8 : b.left - 8 - w
      const y = Math.max(8, Math.min(t.top, window.innerHeight - h - 8))
      wrap.style.setProperty('--zf-pop-x', `${Math.round(x)}px`)
      wrap.style.setProperty('--zf-pop-y', `${Math.round(y)}px`)
      wrap.style.setProperty('--zf-pop-origin', toRight ? 'left top' : 'right top')
    }
    const adoptDockPop = wrap => {
      const bar = document.querySelector(`footer[data-slot='statusbar'][${DOCK_ATTR}]`)
      if (!bar || wrap.hasAttribute(DOCK_POP_ATTR)) return
      const content = wrap.firstElementChild
      const slot = content?.getAttribute?.('data-slot') || ''
      if (/tooltip|sub-content|hover-card/.test(slot)) return
      const open = [...bar.querySelectorAll("[aria-expanded='true']")]
      const trigger = (content?.id && open.find(el => el.getAttribute('aria-controls') === content.id)) ||
        (open.length === 1 ? open[0] : null)
      if (!trigger) return
      wrap.setAttribute(DOCK_POP_ATTR, '')
      placeDockPop(wrap, trigger)
      requestAnimationFrame(() => placeDockPop(wrap, trigger))
      if (typeof ResizeObserver === 'function') {
        const ro = new ResizeObserver(() => { if (wrap.isConnected) placeDockPop(wrap, trigger); else ro.disconnect() })
        ro.observe(wrap)
      }
    }
    const watchDockPops = () => {
      if (dock.popObs || typeof MutationObserver !== 'function' || !document.body) return
      dock.popObs = new MutationObserver(records => {
        if (!document.querySelector(`[${DOCK_ATTR}]`)) return
        for (const rec of records) {
          for (const node of rec.addedNodes) {
            if (node.nodeType !== 1) continue
            if (node.matches?.('[data-radix-popper-content-wrapper]')) adoptDockPop(node)
            else node.querySelectorAll?.('[data-radix-popper-content-wrapper]').forEach(adoptDockPop)
          }
        }
      })
      dock.popObs.observe(document.body, { childList: true })
    }
    const pressStatusbarKeybind = () => {
      const init = { key: 'S', code: 'KeyS', shiftKey: true, bubbles: true, cancelable: true, composed: true }
      init[IS_MAC ? 'metaKey' : 'ctrlKey'] = true
      window.dispatchEvent(new KeyboardEvent('keydown', init))
      window.dispatchEvent(new KeyboardEvent('keyup', init))
    }
    const syncStatusDock = () => {
      if (typeof document === 'undefined' || !document.body) return
      const mode = interfaceMode()
      if (mode !== dock.mode) {
        // a mode change clears Hermes's session reveals, so start over
        dock.mode = mode
        dock.revealed = false
        dock.pressed = false
        dock.tries = 0
      }
      const bar = document.querySelector("footer[data-slot='statusbar']")
      if (mode !== 'simple' || !statusDock.get()) {
        undock()
        return
      }
      ensureDockChrome()
      if (!bar) {
        dock.tab.hidden = true
        if (dock.side) unside()
        // once it was up, its going away is the user hiding it (⌘⇧S or the
        // bar's own menu): respect that until the mode changes again
        if (dock.revealed) return
        const t = Date.now()
        if (dock.tries < 2 && t - dock.lastTry > 4000) {
          dock.tries += 1
          dock.lastTry = t
          pressStatusbarKeybind()
          dock.pressed = true
          if (dock.tries === 2) console.info?.('[zephyr] status dock: the status-bar keybind did not answer (rebound?), leaving it')
        }
        return
      }
      dock.revealed = true
      watchDockPops()
      if (!bar.hasAttribute(DOCK_ATTR)) bar.setAttribute(DOCK_ATTR, '')
      if (layoutSideDock()) {
        dock.tab.hidden = true
        return
      }
      dock.tab.hidden = false
      bar.toggleAttribute(DOCK_OPEN_ATTR, dock.open)
      dock.tab.setAttribute('aria-expanded', String(dock.open))
      dock.tab.title = dock.open ? 'Hide status panel' : 'Show status panel'
    }
    const onDockKey = event => {
      if (event.key === 'Escape' && dock.open && !dock.side && document.querySelector(`[${DOCK_OPEN_ATTR}]`) &&
          !document.querySelector("[data-slot$='-content'][data-state='open']")) setDockOpen(false)
    }
    if (typeof document !== 'undefined') document.addEventListener('keydown', onDockKey)
    // Maintenance passes that measure layout (the dock, the snippet library,
    // the status stack's fillets, the live work tiles) pause while the user
    // scrolls: a forced layout landing mid-gesture is exactly the hitch they
    // would cause, and the next tick after the gesture recomputes everything
    // anyway. The transcript is excluded: it writes scrollTop every frame while
    // a reply streams, and treating that as a gesture would freeze the timers
    // for the whole turn. The same flag also switches hover transitions off
    // mid-gesture (see [motion:history]).
    let lastScrollAt = 0
    let scrollIdleTimer = 0
    const onAnyScroll = event => {
      const target = event?.target
      if (target?.nodeType === 1 && target.closest?.('[data-chat-surface]')) return
      lastScrollAt = Date.now()
      const root = document.documentElement
      if (root && !root.hasAttribute('data-zf-scrolling')) root.setAttribute('data-zf-scrolling', '')
      if (scrollIdleTimer) clearTimeout(scrollIdleTimer)
      scrollIdleTimer = setTimeout(() => {
        scrollIdleTimer = 0
        document.documentElement?.removeAttribute?.('data-zf-scrolling')
      }, 150)
    }
    if (typeof document !== 'undefined') {
      document.addEventListener?.('scroll', onAnyScroll, { capture: true, passive: true })
    }
    const scrollSettled = () => Date.now() - lastScrollAt >= 150
    const dockTimer = setInterval(() => {
      if (typeof document === 'undefined' || document.hidden || !scrollSettled()) return
      syncStatusDock()
      if (!pinDrag.moving) { layoutLibrary(); layoutShelf() }
    }, 1000)
    setTimeout(syncStatusDock, 600)

    let resizeRaf = 0
    const onResize = () => {
      if (resizeRaf) return
      resizeRaf = requestAnimationFrame(() => {
        resizeRaf = 0
        wordmarkKey = ''
        pinWordmark()
        fitColumn()
        if (dock.side) layoutSideDock()
        lib.key = ''
        layoutLibrary()
        layoutShelf()
      })
    }
    if (typeof window !== 'undefined') window.addEventListener?.('resize', onResize)

    const applyMarginsAndMark = on => {
      applyMargins(on)
      pinWordmark()
      fitColumn()
    }
    applyMarginsAndMark(margins.get())

    // ── Work progress collapsing for finished turns ──────────────────────────
    // Turn times. Hermes stamps a turn's duration (the ⏱ badge) only in memory
    // when it finishes streaming, so it is missing for any history reloaded
    // from the backend (after a restart, or a session reopened later). Each
    // time we see a badge, we remember its seconds keyed by a hash of the
    // reply's own text, which survives a reload where message ids don't.
    const TURN_TIMES_KEY = 'turnTimes'
    const TURN_TIMES_MAX = 3000
    const turnTimes = (() => {
      const v = ctx.storage.get(TURN_TIMES_KEY, null)
      return v && typeof v === 'object' ? v : {}
    })()
    let turnTimesTimer = 0
    const saveTurnTimes = () => {
      if (turnTimesTimer) return
      turnTimesTimer = setTimeout(() => {
        turnTimesTimer = 0
        const keys = Object.keys(turnTimes)
        for (let i = 0; i < keys.length - TURN_TIMES_MAX; i++) delete turnTimes[keys[i]]
        try { ctx.storage.set(TURN_TIMES_KEY, turnTimes) } catch {}
      }, 1500)
    }
    /* The reply's prose (not the work scaffolds, whose text changes between a
       live turn and a reloaded one), whitespace-folded, FNV-1a hashed. */
    const turnKey = contentEl => {
      if (typeof document === 'undefined' || !document.createTreeWalker) return ''
      const walker = document.createTreeWalker(contentEl, 4 /* SHOW_TEXT */)
      let text = ''
      for (let n = walker.nextNode(); n && text.length < 800; n = walker.nextNode()) {
        const host = n.parentElement
        if (host?.closest?.('[data-conversation-scaffold], .zephyr-work-summary')) continue
        text += n.nodeValue
      }
      text = text.replace(/\s+/g, ' ').trim().slice(0, 800)
      if (text.length < 12) return ''
      let h = 0x811c9dc5
      for (let i = 0; i < text.length; i++) { h ^= text.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0 }
      return h.toString(36) + '.' + text.length
    }

    const formatDuration = secs => {
      const s = Math.max(0, Math.round(secs))
      if (s < 60) return `${s} second${s === 1 ? '' : 's'}`
      const m = Math.floor(s / 60)
      const r = s % 60
      return `${m} minute${m === 1 ? '' : 's'}${r ? ` ${r} second${r === 1 ? '' : 's'}` : ''}`
    }

    /* "Thought", "Thought and searched", "Thought, searched and used tools" */
    const joinVerbs = verbs => {
      if (verbs.length === 0) return 'Working'
      const v = verbs.slice()
      v[0] = v[0][0].toUpperCase() + v[0].slice(1)
      return v.length === 1 ? v[0] : `${v.slice(0, -1).join(', ')} and ${v[v.length - 1]}`
    }

    const readBadgeSecs = root => {
      // The last badge in the container is the settled turn's: earlier
      // messages of a multi-message turn can carry their own step badges.
      const durEls = root.querySelectorAll?.("[data-slot='aui_turn-duration']") || []
      const durEl = durEls.length ? durEls[durEls.length - 1] : null
      if (!durEl) return null
      const durRaw = (durEl.getAttribute?.('title') || durEl.textContent || '').trim()
      // Hermes prints anything past a minute as m:ss ("1:20"), not "1m 20s"
      const clock = durRaw.match(/(?:(\d+):)?(\d+):(\d{2})\b/)
      if (clock) return parseInt(clock[1] || '0', 10) * 3600 + parseInt(clock[2], 10) * 60 + parseInt(clock[3], 10)
      const minMatch = durRaw.match(/(\d+)\s*m(?:in(?:utes?)?)?\b(?:\s*(\d+)\s*s)?/i)
      if (minMatch) return parseInt(minMatch[1], 10) * 60 + parseInt(minMatch[2] || '0', 10)
      const secMatch = durRaw.match(/(\d+(?:\.\d+)?)\s*s(?:ec(?:onds?)?)?\b/i)
      return secMatch ? parseFloat(secMatch[1]) : null
    }

    /* What the turn did, in the order it reads best, plus per-kind counts for
       the tooltip. */
    const classifyWork = scaffolds => {
      const n = { think: 0, search: 0, cmd: 0, file: 0, tool: 0 }
      for (const el of scaffolds) {
        const slot = el.getAttribute?.('data-slot') || ''
        const text = (el.textContent || '').toLowerCase()
        if (slot === 'aui_thinking-disclosure' || /^\s*(thought|thinking)\b/.test(text)) n.think++
        else if (/\b(web_)?search(ed|ing)?\b|\bquer(y|ied|ies)\b/.test(text)) n.search++
        else if (/\b(commands?|ran|terminal|scripts?|exec(uted)?|bash|shell)\b/.test(text)) n.cmd++
        else if (/\b(files?|patch(ed)?|read|edit(ed)?|wr(ite|ote))\b/.test(text)) n.file++
        else if (/\b(tools?|skills?|mcp)\b/.test(text) || slot === 'tool-block' || el.matches?.('[data-tool-group], [data-tool-summary]')) n.tool++
      }
      const verbs = []
      const icons = []
      if (n.think) verbs.push('thought')
      if (n.search) { verbs.push('searched'); icons.push('search') }
      if (n.cmd) { verbs.push('ran commands'); icons.push('terminal') }
      if (n.file) { verbs.push('worked on files'); icons.push('file') }
      if (n.tool) { verbs.push('used tools'); icons.push('tool') }
      const plural = (k, one, many) => (k ? `${k} ${k === 1 ? one : many}` : '')
      const detail = [
        plural(n.search, 'search', 'searches'), plural(n.cmd, 'command', 'commands'),
        plural(n.file, 'file step', 'file steps'), plural(n.tool, 'tool call', 'tool calls')
      ].filter(Boolean).join(', ')
      return { verbs, icons, detail }
    }

    /* Live turns: when each started (keyed by the user message it answers,
       whose id holds steady through the turn even across a chat switch), so
       the tile can count up from the first moment the agent works. */
    const liveStarts = new Map()
    const liveKey = root => {
      const pair = root.closest?.("[data-slot='aui_turn-pair']")
      const user = pair?.querySelector?.("[data-slot='aui_user-message-root'][data-message-id]")
      return user ? user.getAttribute('data-message-id') : null
    }
    const startOf = root => {
      if (root.dataset.zfStart) return Number(root.dataset.zfStart)
      const key = liveKey(root)
      let t = key ? liveStarts.get(key) : undefined
      if (t === undefined) {
        // Hermes's own pre-first-token timer counts from the turn's start
        const timer = root.querySelector?.("[data-slot='aui_response-loading']")
        const m = (timer?.textContent || '').match(/(?:(\d+):)?(\d+)(?::(\d{2})|s)/)
        const ago = m ? (m[3] ? (parseInt(m[1] || '0', 10) * 60 + parseInt(m[2], 10)) * 60 + parseInt(m[3], 10) : parseInt(m[2], 10)) : 0
        t = Date.now() - ago * 1000
        if (key) {
          liveStarts.set(key, t)
          if (liveStarts.size > 50) liveStarts.delete(liveStarts.keys().next().value)
        }
      }
      root.dataset.zfStart = String(t)
      return t
    }

    const isStreamingRoot = root => Boolean(
      root.querySelector?.("[data-message-streaming='true']") ||
      root.querySelector?.("[data-slot='aui_message-streaming-marker'][data-message-streaming]") ||
      root.querySelector?.("[data-slot='aui_response-loading']") ||
      root.querySelector?.("[data-slot='aui_turn-activity'][data-state='active']") ||
      root.querySelector?.(".shimmer") ||
      root.querySelector?.("[aria-label='Running'], [data-slot='glyph-spinner']")
    )

    const setToggleExpanded = (toggle, contentEls, expanded) => {
      for (const contentEl of contentEls) {
        if (contentEl) contentEl.setAttribute('data-zephyr-work-collapsed', expanded ? 'false' : 'true')
      }
      toggle.setAttribute('data-expanded', expanded ? 'true' : 'false')
      toggle.setAttribute('aria-expanded', expanded ? 'true' : 'false')
    }

    /* Hermes renders every assistant prose segment — the ones said between
       tool calls included — as .aui-md, so the CSS exemption that keeps the
       final reply visible would keep the middle chatter too. A segment that
       precedes the last work block is interim and folds with the tools; the
       prose that follows all the work is the reply and stays. */
    const WORK_MARKERS = "[data-conversation-scaffold], [data-slot='tool-block'], [data-slot='aui_thinking-disclosure'], [data-slot='aui_turn-activity'], [data-tool-group], [data-tool-summary]"
    // Node is absent from the CSS test rigs, so fall back to the spec's values.
    const DOC_FOLLOWING = typeof Node !== 'undefined' ? Node.DOCUMENT_POSITION_FOLLOWING : 4
    const DOC_CONTAINED = typeof Node !== 'undefined' ? Node.DOCUMENT_POSITION_CONTAINED_BY : 16
    // The chain's last work block anchors the interim marking across every
    // root of that chain: prose before it is chatter, prose after it is the
    // reply. One root's markers are compared against the whole chain, so a
    // later message's tool call also folds an earlier message's chatter.
    const markInterimProse = (parts, lastWork) => {
      for (const { content } of parts) {
        for (const md of content.querySelectorAll?.('.aui-md') || []) {
          // strictly before the last work block: follows it in document order,
          // without containing it (a wrapper holding the work is not before it)
          const interim = Boolean(lastWork) &&
            (md.compareDocumentPosition(lastWork) & (DOC_FOLLOWING | DOC_CONTAINED)) === DOC_FOLLOWING
          if (interim) md.setAttribute('data-zephyr-work-interim', 'true')
          else if (md.hasAttribute?.('data-zephyr-work-interim')) md.removeAttribute('data-zephyr-work-interim')
        }
      }
    }

    /* One response group can carry more than one response chain. A background
       delivery — a finished process, an async result — is folded into the
       same group, and the model's answer to it becomes a new assistant root,
       so the group reads [answer 1][delivery][answer 2]. The interim anchor
       must not reach across a delivery: once a chain has answered, a later
       chain's work would otherwise mark that answer as chatter, and folding
       the turn would hide the actual response in favour of the update. */
    const chainsOf = (container, parts) => {
      const deliveries = Array.from(container.querySelectorAll?.("[data-slot='aui_background-result']") || [])
      if (deliveries.length === 0 || parts.length < 2) return [parts]
      const between = (a, b, el) =>
        Boolean((a.compareDocumentPosition(el) & DOC_FOLLOWING) && (el.compareDocumentPosition(b) & DOC_FOLLOWING))
      const chains = []
      let chain = []
      for (let i = 0; i < parts.length; i += 1) {
        if (i > 0 && deliveries.some(el => between(parts[i - 1].root, parts[i].root, el))) {
          chains.push(chain)
          chain = []
        }
        chain.push(parts[i])
      }
      chains.push(chain)
      return chains
    }

    /* The chain's last real work block anchors the interim marking. A settled
       turn keeps its own status row mounted as the tail of the content (empty,
       sr-only, data-state='idle') so the live region survives a flip — it is
       not work, and letting it anchor would mark the reply above it as
       chatter and fold the reply away the moment the turn settles. */
    const lastWorkBlockOf = chain => {
      const work = chain.flatMap(part => Array.from(part.content.querySelectorAll?.(WORK_MARKERS) || []))
      for (let i = work.length - 1; i >= 0; i -= 1) {
        const el = work[i]
        const idleStatus = el.getAttribute?.('data-slot') === 'aui_turn-activity' && el.getAttribute?.('data-state') === 'idle'
        if (!idleStatus) return el
      }
      return null
    }

    /* The nearest ancestor that actually scrolls; null means the page does. */
    const scrollParentOf = node => {
      if (typeof getComputedStyle !== 'function') return null
      let n = node
      while (n && n !== document.documentElement) {
        const s = getComputedStyle(n)
        if (s && s.overflowY !== 'visible' && s.overflowY !== 'clip') return n
        n = n.parentElement
      }
      return null
    }

    /* Opening a fold used to shove the transcript below it down: the revealed
       work lands between the summary and the reply, so every later turn paid
       for the height. Pin the bottom of the turn across the flip instead —
       the work eats the space above it, and only what sits above moves. At
       the end of the conversation (or with nothing but padding left under the
       turn) there is no chat below to protect, so the fold grows down and the
       chat above stays put. */
    const FOLD_END_SLACK = 96
    const pinWhileFolding = anchorEl => {
      const bottom = () => anchorEl.getBoundingClientRect?.().bottom ?? 0
      const before = bottom()
      const box = scrollParentOf(anchorEl) || (typeof document !== 'undefined' ? document.scrollingElement || document.documentElement : null)
      const scrollTop = box?.scrollTop || 0
      const scrollHeight = box?.scrollHeight || 0
      const atEnd = Boolean(box) && scrollTop + (box?.clientHeight || 0) >= scrollHeight - FOLD_END_SLACK
      const slackUnderTurn = scrollHeight - (before + scrollTop)
      return () => {
        const delta = bottom() - before
        if (!box || !delta || atEnd || slackUnderTurn <= FOLD_END_SLACK) return
        box.scrollTop += delta
      }
    }

    const contentOf = root => root?.querySelector?.("[data-slot='aui_assistant-message-content']") || null
    const groupContainerOf = root =>
      root?.closest?.("[data-slot='aui_response-group']") ||
      root?.closest?.("[data-slot='aui_turn-pair']") ||
      root ||
      null
    const partsOf = container => {
      if (!container?.querySelectorAll) return []
      const roots = container.getAttribute?.('data-slot') === 'aui_assistant-message-root'
        ? [container]
        : Array.from(container.querySelectorAll("[data-slot='aui_assistant-message-root']"))
      return roots.map(root => ({ root, content: contentOf(root) })).filter(part => part.content)
    }

    /* One turn can arrive as several assistant messages (one per model step),
       each with its own content root. The fold is a turn-level idea: one
       summary serves the whole turn, and it is hosted by the FIRST part, so
       it sits at the top of the work tree — above every step — instead of in
       the middle of it. Parts only ever arrive below the first one, so the
       top stays the top for the whole stream; the last part that carries work
       (or is live) is the owner, which supplies the turn's settled prose and
       the scroll pin's anchor, not the tile's home. */
    const processTurn = (container, isEnabled) => {
      const parts = partsOf(container)
      if (!parts.length) return

      if (!isEnabled) {
        for (const { content } of parts) {
          if (content.hasAttribute?.('data-zephyr-work-collapsed')) content.removeAttribute('data-zephyr-work-collapsed')
          content.querySelector?.('.zephyr-work-summary')?.remove()
          content.querySelectorAll?.('[data-zephyr-work-interim]').forEach(el => el.removeAttribute?.('data-zephyr-work-interim'))
        }
        return
      }

      const info = parts.map(part => ({
        ...part,
        live: isStreamingRoot(part.root),
        scaffolds: Array.from(part.content.querySelectorAll?.('[data-conversation-scaffold]') || []),
        toggle: part.content.querySelector?.('.zephyr-work-summary') || null
      }))
      const scaffolds = info.flatMap(part => part.scaffolds)
      // The owner is the last part with something to fold: work, a live
      // stream, or the tile the turn already wears. It supplies the turn's
      // answer (whose prose keys the duration memory) and the scroll anchor.
      let owner = null
      for (const part of info) if (part.live || part.scaffolds.length || part.toggle) owner = part
      // A finished reply with no work to fold needs no tile; a live one gets
      // it from the first moment, so the work never flashes open and shut.
      if (!owner) return
      // A tool-continuation part that only waits on an approval rests at
      // display:none until a result is opened; the tile is hosted by the
      // first part the app actually shows, or it would vanish with the work.
      const hiddenPart = part => Boolean(part.root.hasAttribute?.('data-approval-activity-only') && !part.root.querySelector?.('[data-tool-open]'))
      const host = info.find(part => !hiddenPart(part)) || info[0]

      // Both live and finished turns keep the fold honest across the whole
      // response: prose that precedes the chain's newest tool call is interim
      // the moment that call appears, even when it sat in an earlier message.
      // Each response chain is marked on its own, and the idle status row a
      // settled turn keeps mounted is not work: a late update's tools cannot
      // fold the answer that preceded them.
      for (const chain of chainsOf(container, parts)) {
        markInterimProse(chain, lastWorkBlockOf(chain))
      }

      // One tile per turn, hosted by the first part. A tile a later part
      // still wears (an older render, a part that used to host it) is moved
      // up rather than duplicated.
      let toggle = info.map(part => part.toggle).find(Boolean) || null
      if (!toggle) {
        toggle = document.createElement('button')
        toggle.type = 'button'
        toggle.className = 'zephyr-work-summary'
        toggle.setAttribute('data-zephyr-work-toggle', 'true')
        toggle.addEventListener('click', e => {
          e.preventDefault()
          e.stopPropagation()
          // Both the anchor and the current state are read live: a streaming
          // turn moves its owner, so a part captured at creation would go
          // stale under the tile.
          const clickParts = partsOf(container)
          const settle = pinWhileFolding((clickParts[clickParts.length - 1] || owner).root)
          const expandedNow = toggle.getAttribute('data-expanded') === 'true'
          setToggleExpanded(toggle, clickParts.map(part => part.content), !expandedNow)
          if (!expandedNow) {
            // Opening: the space arrives immediately, so pin now.
            settle()
            return
          }
          // Closing: the shape only collapses when the display fade ends, so
          // the pin has to wait for that moment or the transcript lurches.
          // The fade runs on --zf-t-1; read it so Motion off settles at once,
          // and keep a timeout fallback in case transitionend is swallowed.
          const fadeRoot = toggle.parentElement || owner.content
          const ms = parseFloat(getComputedStyle?.(fadeRoot)?.getPropertyValue('--zf-t-1')) || 90
          let done = false
          const finish = () => {
            if (done) return
            done = true
            fadeRoot.removeEventListener?.('transitionend', onEnd)
            clearTimeout(fallback)
            settle()
          }
          const onEnd = event => { if (event.propertyName === 'display') finish() }
          fadeRoot.addEventListener?.('transitionend', onEnd)
          const fallback = setTimeout(finish, ms + 80)
        })
        host.content.insertBefore(toggle, host.content.firstChild)
        setToggleExpanded(toggle, parts.map(part => part.content), false)
      } else if (toggle.parentElement !== host.content || host.content.firstChild !== toggle) {
        host.content.insertBefore(toggle, host.content.firstChild)
      }

      // Every other tile is retired, and each part mirrors the surviving
      // tile's state, so one click folds or reveals the whole response. The
      // state lives on the tile: a part that joins later (a new step, a
      // swapped-in root) reads it from there instead of arriving open.
      const expanded = toggle.getAttribute('data-expanded') === 'true'
      for (const stray of container.querySelectorAll?.('.zephyr-work-summary') || []) if (stray !== toggle) stray.remove?.()
      for (const part of info) {
        const foldable = part.scaffolds.length || Boolean(part.content.querySelector?.(WORK_MARKERS))
        if (foldable) part.content.setAttribute('data-zephyr-work-collapsed', expanded ? 'false' : 'true')
        else if (part.content.hasAttribute?.('data-zephyr-work-collapsed')) part.content.removeAttribute('data-zephyr-work-collapsed')
      }

      const livePart = info.find(part => part.live) || null
      if (livePart) {
        toggle.setAttribute('data-live', 'true')
        const { verbs, icons, detail } = classifyWork(scaffolds)
        const secs = (Date.now() - startOf(livePart.root)) / 1000
        paintToggle(toggle, icons, `${joinVerbs(verbs)} for ${formatDuration(secs)}`, detail)
        return
      }

      // Just finished: if Hermes stamped no badge, keep the time we counted.
      const started = info.map(part => part.root.dataset.zfStart).find(Boolean)
      const counted = toggle.getAttribute('data-live') === 'true' && started
        ? (Date.now() - Number(started)) / 1000 : null
      toggle.removeAttribute('data-live')

      // Finished turns don't change: once summarised with the same scaffold
      // count, skip the text heuristics entirely.
      const badge = readBadgeSecs(container)
      const scaffoldKey = `${scaffolds.length}|${badge}`
      if (toggle.dataset.scaffolds === scaffoldKey && toggle.dataset.signature && counted === null) return
      toggle.dataset.scaffolds = scaffoldKey

      const { verbs, icons, detail } = classifyWork(scaffolds)
      const key = turnKey(owner.content)
      let secs = badge
      if (secs === null && counted !== null && counted >= 1) secs = Math.round(counted)
      if (secs !== null) {
        if (key && turnTimes[key] !== secs) { turnTimes[key] = secs; saveTurnTimes() }
      } else if (key && typeof turnTimes[key] === 'number') {
        secs = turnTimes[key]                  // remembered from when it ran
      } else {
        // last resort: the reasoning blocks' own "Thought for 12s"
        let total = 0
        for (const el of scaffolds) {
          const m = (el.textContent || '').match(/thought for (\d+(?:\.\d+)?)\s*s/i)
          if (m) total += parseFloat(m[1])
        }
        if (total > 0) secs = total
      }
      const verbText = verbs.length ? joinVerbs(verbs) : 'Worked'
      paintToggle(toggle, icons, secs !== null ? `${verbText} for ${formatDuration(secs)}` : verbText, detail)
    }

    function paintToggle(toggle, icons, labelText, detail) {
      const signature = `${icons.join(',')}|${labelText}`
      if (toggle.dataset.signature === signature) return
      const iconsKey = icons.join(',')
      if (toggle.dataset.icons !== iconsKey || !toggle.querySelector('.zephyr-work-summary-label')) {
        toggle.dataset.icons = iconsKey
        const iconStackHtml = icons.length > 0 ? [
          '<span class="zephyr-work-icon-stack" aria-hidden="true">',
          ...icons.map(k => `<span class="zephyr-work-icon-item">${WORK_ICONS[k] || ''}</span>`),
          '</span>'
        ].join('') : ''
        toggle.innerHTML = [
          iconStackHtml,
          '<span class="zephyr-work-summary-label"></span>',
          '<span class="zephyr-work-summary-caret" aria-hidden="true">\u203A</span>'
        ].join('')
      }
      // only the text node changes while the timer ticks: no icon re-parse
      toggle.querySelector('.zephyr-work-summary-label').textContent = labelText
      toggle.title = detail ? `${detail}. Click to ${toggle.getAttribute('data-expanded') === 'true' ? 'hide' : 'show'} the steps.` : ''
      toggle.dataset.signature = signature
    }

    const scanWorkProgress = () => {
      if (typeof document === 'undefined') return
      const isEnabled = collapseWork.get()
      const seen = new Set()
      const messages = document.querySelectorAll?.("[data-slot='aui_assistant-message-root']") || []
      for (const root of messages) {
        const group = groupContainerOf(root)
        if (!group || seen.has(group)) continue
        seen.add(group)
        processTurn(group, isEnabled)
      }
    }

    // The shared body for both scheduling paths below: fold the transcript,
    // re-measure the pinned wordmark, and re-fit the composer column. The
    // fold pass is skipped entirely while the feature is off (the off-switch
    // already ran one cleanup pass), so a long history is not re-walked on
    // every mutation for nothing.
    const runScanWork = () => {
      if (collapseWork.get()) scanWorkProgress()
      pinWordmark()
      fitColumn()
    }

    const hasRaf = typeof requestAnimationFrame === 'function'
    let workThrottle = null
    let workFrame = null
    const flushWork = () => {
      workFrame = null
      runScanWork()
    }
    const scheduleScanWork = () => {
      // While core holds the session-switch curtain on the chat surface the
      // transcript is invisible, so the 60ms throttle only delays the fold
      // toward the reveal. Coalesce to the next frame instead; normal
      // streaming keeps the throttle below. A throttle already pending from
      // just before the switch is dropped, so the frame is the only run.
      if (typeof document !== 'undefined' && hasRaf && document.querySelector?.('[data-chat-surface][data-session-switching]')) {
        if (workFrame !== null) return
        if (workThrottle) {
          clearTimeout(workThrottle)
          workThrottle = null
        }
        workFrame = requestAnimationFrame(flushWork)
        return
      }
      if (workThrottle) return
      workThrottle = setTimeout(() => {
        workThrottle = null
        runScanWork()
      }, 60)
    }

    const applyCollapseWork = on => {
      if (typeof document === 'undefined' || !document.documentElement) return
      if (!document.documentElement.dataset) document.documentElement.dataset = {}
      if (on) {
        document.documentElement.dataset.zephyrCollapseWork = 'on'
      } else {
        delete document.documentElement.dataset.zephyrCollapseWork
      }
      scanWorkProgress()
    }
    applyCollapseWork(collapseWork.get())
    applyMotion(motion.get())

    // ── Chat switch ─────────────────────────────────────────────────────────
    // The switch is animated by core's own data-session-switching window on
    // [data-chat-surface]: the transcript stays hidden while rows land and
    // the scroll restores, and the plugin does its folding behind that
    // curtain (see the [motion:switch] CSS and the scan scheduling below).
    // The old JS slide was retired: it raced this window and animated a
    // transcript the user was not looking at yet.
    // Only clicks inside the chat surface can change what the scan measures
    // (expanding a fold, a new message); a click in the sidebar must not walk
    // the transcript.
    const onDocClick = event => {
      const target = event?.target
      if (target?.nodeType === 1 && target.closest?.('[data-chat-surface]')) scheduleScanWork()
    }

    const onNavChange = () => scheduleScanWork()

    // Core lifts data-session-switching once the new transcript's rows are
    // placed and the scroll has settled. Attribute MutationObserver callbacks
    // run before the browser paints, so this is the one chance to fold and
    // re-anchor the transcript in the frame the curtain opens.
    //
    // But that early stability is not completion: the render-budget backfill
    // commits more pages, Shiki highlights after mount, the code plugin
    // re-renders markdown, fonts swap and tables apply widths — all after
    // core's two quiet frames. So the plugin holds its own curtain
    // (data-zephyr-settling, paint-only via CSS) until the transcript is
    // actually quiet, bounded by SETTLE_MAX_MS and lifted on any user input.
    const SETTLE_QUIET_MS = 160
    const SETTLE_MAX_MS = 1400
    const SETTLE_INPUT = ['wheel', 'pointerdown', 'keydown', 'touchstart']
    const settleRunners = new Map()

    const finishSettle = surface => {
      const runner = settleRunners.get(surface)
      if (runner) {
        settleRunners.delete(surface)
        try { runner.stop() } catch {}
      }
      surface?.removeAttribute?.('data-zephyr-settling')
    }

    const finishAllSettles = () => {
      if (!settleRunners.size) return
      for (const surface of [...settleRunners.keys()]) finishSettle(surface)
    }

    const startSettleCurtain = (surface, viewport, atBottom) => {
      if (!surface || !viewport) return
      // A re-armed switch restarts clean rather than stacking runners.
      finishSettle(surface)
      surface.setAttribute?.('data-zephyr-settling', '')
      if (typeof requestAnimationFrame !== 'function' || viewport.isConnected === false) {
        finishSettle(surface)
        return
      }
      const now = () => performance.now?.() ?? Date.now()
      const started = now()
      let lastChange = started
      let frames = 0
      let frame = 0
      let stopped = false
      let resizeObserver = null
      let mutationObserver = null
      const content = surface.querySelector?.("[data-slot='aui_thread-content']")
      const onChange = () => { lastChange = now() }
      // A running turn never goes quiet; the curtain would hold until the cap.
      // It only exists to hide the load's parse and backfill, so a streaming
      // transcript gets a much shorter leash.
      const streaming = Boolean(surface.querySelector?.("[data-message-streaming='true'], [data-slot='aui_message-streaming-marker'][data-message-streaming], [data-slot='aui_response-loading'], [data-slot='aui_turn-activity'][data-state='active']"))
      const quietMs = streaming ? 80 : SETTLE_QUIET_MS
      const maxMs = streaming ? 500 : SETTLE_MAX_MS

      const runner = {
        stop() {
          if (stopped) return
          stopped = true
          if (frame && typeof cancelAnimationFrame === 'function') cancelAnimationFrame(frame)
          frame = 0
          resizeObserver?.disconnect?.()
          mutationObserver?.disconnect?.()
          viewport.removeEventListener?.('scroll', onChange)
        }
      }
      settleRunners.set(surface, runner)

      if (typeof ResizeObserver === 'function') {
        resizeObserver = new ResizeObserver(onChange)
        if (content) resizeObserver.observe?.(content)
        if (viewport !== content) resizeObserver.observe?.(viewport)
      }
      if (typeof MutationObserver !== 'undefined' && content) {
        mutationObserver = new MutationObserver(onChange)
        mutationObserver.observe(content, {
          childList: true,
          subtree: true,
          characterData: true,
          attributes: true,
          attributeFilter: ['class', 'style', 'data-status', 'data-streaming', 'data-state', 'data-message-streaming']
        })
      }
      viewport.addEventListener?.('scroll', onChange, { passive: true })

      const tick = () => {
        frame = 0
        if (stopped) return
        frames += 1
        // No scrollHeight compare here: reading it forces a layout flush on a
        // transcript that is still committing, every frame, for the whole
        // settle. The ResizeObserver, the mutation observer and the scroll
        // listener are the witnesses that already reset lastChange — the
        // per-frame read only duplicated them at full layout cost.
        const t = now()
        const fontsReady =
          typeof document === 'undefined' ||
          typeof document.fonts?.status !== 'string' ||
          document.fonts.status === 'loaded' ||
          t - started >= 350
        const quiet = t - lastChange >= quietMs && frames >= 2 && fontsReady
        if (quiet || t - started >= maxMs) {
          finishSettle(surface)
          if (atBottom) viewport.scrollTop = viewport.scrollHeight
          return
        }
        frame = requestAnimationFrame(tick)
      }
      frame = requestAnimationFrame(tick)
    }

    const settleSwitch = surface => {
      if (!surface) return
      const viewport = surface.querySelector?.("[data-slot='aui_thread-viewport']") || surface
      // Measure first: scanWorkProgress changes the transcript height, so only
      // the pre-fold geometry can say whether the session was anchored to the
      // bottom. Re-pin after the fold so the reveal does not jump.
      const atBottom = viewport.scrollHeight - viewport.scrollTop - viewport.clientHeight <= 24
      // A frame-coalesced pass armed just before the switch would duplicate
      // this synchronous one; drop it.
      if (workFrame !== null) {
        cancelAnimationFrame?.(workFrame)
        workFrame = null
      }
      runScanWork()
      if (atBottom) viewport.scrollTop = viewport.scrollHeight
      // The curtain keeps the transcript hidden past the fold until the late
      // work lands; its lift re-pins a bottom-anchored viewport again.
      startSettleCurtain(surface, viewport, atBottom)
    }

    let chatObserver = null
    if (typeof MutationObserver !== 'undefined' && typeof document !== 'undefined') {
      // Streaming fires this on every token; all the real work is batched
      // into one throttled pass. The session-switch attribute is observed too,
      // so its removal is caught pre-paint and settled in that same frame.
      chatObserver = new MutationObserver(mutations => {
        let settled = false
        let relevant = false
        // One batch can carry the removal record once per observed holder;
        // settling a surface twice in the same batch is wasted work.
        const settledSurfaces = new Set()
        for (const mutation of mutations) {
          if (mutation?.type === 'attributes') {
            const name = mutation.attributeName
            if (name === 'data-session-switching') {
              const surface = mutation.target
              if (!surface?.hasAttribute?.('data-chat-surface') || surface.hasAttribute('data-session-switching')) continue
              if (settledSurfaces.has(surface)) continue
              settledSurfaces.add(surface)
              settled = true
              settleSwitch(surface)
            } else if (name === 'data-message-streaming') {
              relevant = true
            }
            continue
          }
          if (mutation?.type !== 'childList' || relevant) continue
          // The history list is virtualized: scrolling mounts and unmounts a
          // row at a time, and a scan per row would walk the whole transcript
          // for a change none of it cares about. Only churn inside the chat
          // surface (or a body-level portal mount, e.g. the composer popout)
          // can change what the scan measures.
          const target = mutation.target
          if (target === document.body) relevant = true
          else if (target?.nodeType === 1 && target.closest?.('[data-chat-surface]')) relevant = true
        }
        // settleSwitch ran the pass synchronously for this frame; everything
        // else inside the transcript still gets the throttled one.
        if (!settled && relevant) scheduleScanWork()
      })
      const observeTarget = document.body || document.documentElement
      if (observeTarget) {
        chatObserver.observe(observeTarget, {
          childList: true,
          subtree: true,
          attributes: true,
          attributeFilter: ['data-message-streaming', 'data-session-switching']
        })
      }
    }

    // ── Exit ghosts ─────────────────────────────────────────────────────────
    // Measured on the Hermes desktop build: React commits the unmount of a
    // closing floating surface ~45-60ms after its data-state flips to closed,
    // so the 140ms exit keyframes are cut mid-fade. A Presence-managed close
    // holds the node >=140ms before removal and has already animated fully,
    // so only the fast removals (or those removed while still open) get a
    // ghost: a deep clone fixed at the last rect, running the same exit
    // keyframes, inert. The clone continues from the phase the real exit had
    // reached via a matching negative animation-delay. Hidden windows may
    // never deliver animationend, so a timeout fallback removes the ghost.
    const GHOST_SLOTS = "[data-slot='dropdown-menu-content'], [data-slot='dropdown-menu-sub-content'], [data-slot='context-menu-content'], [data-slot='context-menu-sub-content'], [data-slot='popover-content'], [data-slot='select-content'], [data-slot='menubar-content'], [data-slot='dialog-content'], [data-slot='alert-dialog-content'], [data-slot='sheet-content'], [data-slot='tooltip-content'], [data-slot='hover-card-content'], [data-slot$='-overlay']"
    const ghostInfo = new WeakMap()
    const liveGhosts = []
    // Open surfaces are tracked every frame: the app can commit the close and
    // the unmount in one batch, so by the time the observer runs the node is
    // already detached and unmeasurable — the last frame's rect is the only
    // truthful geometry a ghost can be pinned to. Surfaces are few and
    // short-lived, so one getBoundingClientRect per frame is cheap.
    const trackedSurfaces = new Set()
    let surfaceTracker = 0
    let ghostObserver = null

    const nowMs = () => (typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now())

    const boxOf = el => {
      try {
        const box = el.getBoundingClientRect?.()
        if (box && box.width > 0.5 && box.height > 0.5) return { left: box.left, top: box.top, width: box.width, height: box.height }
      } catch {}
      return null
    }

    const rememberGhostSource = el => {
      if (!el || el.nodeType !== 1) return
      const prev = ghostInfo.get(el)
      const rect = boxOf(el) || prev?.rect || null
      const closedAt = el.getAttribute?.('data-state') === 'closed' ? (prev?.closedAt ?? nowMs()) : null
      try { ghostInfo.set(el, { rect, closedAt }) } catch {}
    }

    const trackSurfaces = () => {
      if (surfaceTracker || typeof requestAnimationFrame !== 'function') return
      const step = () => {
        surfaceTracker = 0
        if (!trackedSurfaces.size) return
        for (const el of trackedSurfaces) {
          // Disconnected entries are dropped here (the removal branch below
          // consumes them; a removal we never saw still stops the loop).
          if (!el.isConnected) { trackedSurfaces.delete(el); continue }
          const rect = boxOf(el)
          if (rect) {
            const prev = ghostInfo.get(el)
            try { ghostInfo.set(el, { rect, closedAt: prev?.closedAt ?? null }) } catch {}
          }
        }
        if (!trackedSurfaces.size) return
        surfaceTracker = requestAnimationFrame(step)
      }
      surfaceTracker = requestAnimationFrame(step)
    }

    const dropGhost = ghost => {
      if (!ghost) return
      const at = liveGhosts.indexOf(ghost)
      if (at !== -1) liveGhosts.splice(at, 1)
      try { ghost.removeEventListener?.('animationend', ghost.__zfOnEnd) } catch {}
      if (ghost.__zfTimeout != null) clearTimeout(ghost.__zfTimeout)
      try { ghost.remove?.() } catch {}
      try { ghost.parentNode?.removeChild?.(ghost) } catch {}
    }

    const spawnGhost = (el, info, sinceClose) => {
      let ghost = null
      try { ghost = el.cloneNode(true) } catch {}
      if (!ghost || ghost.nodeType !== 1) return
      ghost.classList?.add('zf-ghost')
      try { ghost.removeAttribute('id') } catch {}
      try { ghost.removeAttribute('tabindex') } catch {}
      try { ghost.querySelectorAll?.('[id], [tabindex]').forEach(node => { node.removeAttribute('id'); node.removeAttribute('tabindex') }) } catch {}
      try { ghost.setAttribute('aria-hidden', 'true') } catch {}
      // Normalise to the closed state: a surface removed while it was still
      // open would otherwise replay the ENTRANCE keyframes (the open rules
      // match the clone), and the whole clone is inert for keyboard too.
      try { ghost.setAttribute('data-state', 'closed') } catch {}
      try { ghost.setAttribute('inert', '') } catch {}
      const rect = info?.rect
      if (rect && rect.width > 0.5 && rect.height > 0.5) {
        ghost.style.left = Math.round(rect.left) + 'px'
        ghost.style.top = Math.round(rect.top) + 'px'
        ghost.style.width = Math.round(rect.width) + 'px'
        ghost.style.height = Math.round(rect.height) + 'px'
      } else {
        ghost.style.inset = '0'
      }
      if (sinceClose > 0) ghost.style.animationDelay = '-' + Math.round(sinceClose) + 'ms'
      const body = document.body
      if (!body || typeof body.appendChild !== 'function') return
      body.appendChild(ghost)
      liveGhosts.push(ghost)
      while (liveGhosts.length > 6) dropGhost(liveGhosts[0])
      let ms = 0.14
      try {
        const raw = getComputedStyle(ghost).animationDuration || '0.14s'
        const value = parseFloat(raw) || 0.14
        ms = /ms/.test(raw) ? value / 1000 : value
      } catch {}
      const durMs = Math.max(120, ms * 1000 + 80)
      ghost.__zfOnEnd = event => {
        // A descendant's own animation ending bubbles up; only the ghost's
        // exit (fired on the ghost itself) may drop it.
        if (event && event.target !== ghost) return
        if (ghost.__zfTimeout != null) { clearTimeout(ghost.__zfTimeout); ghost.__zfTimeout = null }
        dropGhost(ghost)
      }
      ghost.__zfDrop = () => {
        if (ghost.__zfTimeout != null) { clearTimeout(ghost.__zfTimeout); ghost.__zfTimeout = null }
        dropGhost(ghost)
      }
      ghost.addEventListener?.('animationend', ghost.__zfOnEnd, { once: true })
      ghost.__zfTimeout = setTimeout(ghost.__zfDrop, durMs)
    }

    if (typeof MutationObserver !== 'undefined' && typeof document !== 'undefined' && document.body) {
      ghostObserver = new MutationObserver(records => {
        let removedAny = false
        for (const record of records) {
          if (record?.type === 'attributes') {
            const target = record.target
            if (!target?.matches?.(GHOST_SLOTS)) continue
            if (target.getAttribute?.('data-state') === 'closed') rememberGhostSource(target)
            else {
              const info = ghostInfo.get(target)
              if (info) info.closedAt = null
            }
            continue
          }
          if (record?.type !== 'childList') continue
          const target = record.target
          // Floating surfaces are portaled to <body> or into a portal wrapper
          // (`data-slot$="-portal"`, e.g. a popover opened inside a dialog), so
          // a subtree added anywhere else — a virtualized history row scrolling
          // into view, say — is never scanned for them. The node itself is
          // still checked: a surface added in place matches directly.
          const portalMount = target === document.body ||
            (target?.nodeType === 1 && Boolean(target.closest?.('[data-slot$="-portal"]')))
          for (const node of record.addedNodes || []) {
            if (node?.nodeType !== 1) continue
            // Our own ghosts are clones of surfaces; never track them.
            if (node.classList?.contains?.('zf-ghost')) continue
            // Every ghost slot is a data-slot; this skips the 13-selector
            // match for the plain wrapper divs a virtual row commit adds.
            if (!node.hasAttribute?.('data-slot')) continue
            const hits = []
            if (node.matches?.(GHOST_SLOTS)) hits.push(node)
            else if (portalMount) {
              // Only a subtree that could contain a floating surface is worth
              // the look, and only its hits are measured (getBoundingClientRect).
              try { node.querySelectorAll?.(GHOST_SLOTS).forEach(el => hits.push(el)) } catch {}
            }
            for (const el of hits) {
              rememberGhostSource(el)
              trackedSurfaces.add(el)
            }
            if (hits.length) trackSurfaces()
          }
          if (record.removedNodes?.length) removedAny = true
        }
        // Removals are matched against the surfaces we tracked rather than
        // against every removed subtree. Added records come before removal
        // records in a batch, so a same-batch mount-and-unmount is already
        // tracked and its last measured rect is on hand.
        if (!removedAny || !trackedSurfaces.size) return
        const now = nowMs()
        for (const el of [...trackedSurfaces]) {
          if (el.isConnected) continue
          trackedSurfaces.delete(el)
          const info = ghostInfo.get(el)
          const sinceClose = info?.closedAt != null ? now - info.closedAt : null
          if (sinceClose === null || sinceClose < 110) spawnGhost(el, info, sinceClose)
          ghostInfo.delete(el)
        }
      })
      ghostObserver?.observe?.(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['data-state'] })
      // A surface that was already open when the plugin loaded (a hot reload,
      // or the plugin enabled while a menu is up) never fires an add record;
      // pick it up so its close still gets a ghost.
      try {
        document.querySelectorAll(GHOST_SLOTS).forEach(el => {
          rememberGhostSource(el)
          trackedSurfaces.add(el)
        })
        if (trackedSurfaces.size) trackSurfaces()
      } catch {}
    }
    ctx.onDispose?.(() => {
      ghostObserver?.disconnect?.()
      if (surfaceTracker) cancelAnimationFrame?.(surfaceTracker)
      surfaceTracker = 0
      trackedSurfaces.clear()
      for (const ghost of liveGhosts.slice()) ghost.__zfDrop?.()
    })

    if (typeof window !== 'undefined') {
      window.addEventListener?.('popstate', onNavChange)
      window.addEventListener?.('hashchange', onNavChange)
    }
    if (typeof document !== 'undefined') {
      document.addEventListener?.('click', onDocClick, true)
    }

    // Any input means the user is engaged with the transcript now: drop every
    // curtain immediately rather than hold it for quiet that may never come.
    const onSettleInput = () => finishAllSettles()
    if (typeof document !== 'undefined') {
      for (const type of SETTLE_INPUT) {
        document.addEventListener?.(type, onSettleInput, { capture: true, passive: true })
      }
    }
    ctx.onDispose?.(() => {
      if (typeof document !== 'undefined') {
        for (const type of SETTLE_INPUT) {
          document.removeEventListener?.(type, onSettleInput, { capture: true, passive: true })
        }
      }
      finishAllSettles()
    })

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
      const style = document.documentElement.style
      const value = String(sunTopAt(date))
      if (typeof style.getPropertyValue === 'function' && style.getPropertyValue('--zephyr-sun') === value) return
      style.setProperty('--zephyr-sun', value)
    }

    // ── Hold the light at sunset ──────────────────────────────────────────
    // The clock is the only thing that decides the look, so holding the light
    // needs one override, not four: `nowAt()` returns the wall clock normally
    // and a fixed "just after sunset" instant when `held` is on. Everything
    // downstream (anchors, phase, theme, accent, sun readout, GL clock) takes
    // its date from here, so the whole app settles on the dusk band and stays.
    const SUNSET_HOLD_OFFSET = 0.3   // hours past the sunset anchor: the ember
    const sunsetMoment = (base = new Date()) => {
      const { set } = getSolar(base)
      const h = Math.min(23.9, Math.max(0, set + SUNSET_HOLD_OFFSET))
      const d = new Date(base)
      d.setHours(Math.floor(h), Math.round((h % 1) * 60), 0, 0)
      return d
    }
    // A picked phase pins the sky to a moment inside it, today: picking Zephyr
    // Day in Appearance at midnight shows the midday sky. null = the real sun.
    const storedPin = stored(STORE_KEYS.phasePin)
    const pin = atom(PHASES.includes(storedPin) ? storedPin : held.get() ? 'dusk' : null)
    const momentFor = (phase, base = new Date()) => {
      const { rise, set } = getSolar(base)
      const h = phase === 'dawn' ? rise - 0.35
        : phase === 'day' ? (rise + set) / 2
          : phase === 'dusk' ? set + SUNSET_HOLD_OFFSET
            : Math.max(set + 3, 22.5)
      const c = Math.min(23.9, Math.max(0, h))
      const d = new Date(base)
      d.setHours(Math.floor(c), Math.round((c % 1) * 60), 0, 0)
      return d
    }
    const heldMoment = () => (pin.get() ? momentFor(pin.get()) : null)
    const nowAt = () => heldMoment() || new Date()

    // ── GL sky lifecycle ──────────────────────────────────────────────────
    let glSky = null
    let glFailed = false
    let liveWeather = null
    let previewTimer = null

    const reducedMotion = () =>
      typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches

    const applyWeather = (instant = false) => {
      if (!glSky) return
      const mode = weatherMode.get()
      let key = mode
      let weights
      if (mode === 'live' && liveWeather) {
        weights = weatherFromLive(liveWeather)
        glSky.setWind(liveWeather.wind_direction_10m ?? 250, liveWeather.wind_speed_10m ?? 15)
        key = 'live'
      } else {
        if (mode === 'live') key = synthWeather(new Date())
        weights = WEATHER_PRESETS[key] || WEATHER_PRESETS.fair
      }
      // Live weather drifts over ten minutes; a manual pick shows its change in ~25 s.
      glSky.setWeather(weights, mode === 'live' ? 600 : 25, instant)
      weatherNow.set(mode === 'live' && liveWeather ? `live, code ${liveWeather.weather_code}, ${liveWeather.cloud_cover ?? '?'}% cloud` : WEATHER_LABEL[key] || key)
    }

    // The sky runs at the quality's rate on battery too (Peter, 2026-10-10:
    // balanced 8 fps is fine unplugged). Only reduced motion slows it.
    const applyFpsCap = () => {
      if (!glSky) return
      const full = (QUALITY[quality.get()] || QUALITY.balanced).fps
      glSky.setFps(reducedMotion() ? 0.25 : full)
    }

    const ensureGl = () => {
      if (glSky || glFailed) return glSky
      const skyOpts = {
        quality: quality.get(),
        lat: liveSolar?.lat ?? getApproxCoords()[0],
        lng: liveSolar?.lng ?? getApproxCoords()[1],
        onError: err => console.warn?.('[zephyr]', err)
      }
      // The shader sky is the sky. Without WebGL the CSS gradient stays.
      glSky = createSky(skyOpts)
      if (!glSky) {
        glFailed = true
        return null
      }
      applyFpsCap()
      applyWeather(true)
      glSky.start()
      startBlurWatch()
      return glSky
    }

    // Cloud blur follows the page: lighter on the new-chat screen, so the sky shows,
    // and heavier once a conversation starts, so text stays easy to read.
    // 100% = SKY_BLUR_MAX screen px. A cheap DOM check once a second; the sky
    // only re-bakes when the state actually flips.
    const SKY_BLUR_MAX = 20
    const BLUR_NEW_CHAT = 0.3
    const BLUR_IN_CHAT = 0.5
    const isNewChat = () =>
      Boolean(document.querySelector("[data-slot='aui_intro'], [data-intro-holding]")) ||
      Boolean(document.querySelector("[data-slot='composer-bounds']") && !document.querySelector("[data-slot='aui_message-group']"))
    let blurTimer = null
    const syncBlur = () => {
      if (!glSky) return
      glSky.setBlur(SKY_BLUR_MAX * (isNewChat() ? BLUR_NEW_CHAT : BLUR_IN_CHAT))
    }
    const startBlurWatch = () => {
      syncBlur()
      if (!blurTimer) blurTimer = setInterval(() => { if (!document.hidden) syncBlur() }, 1000)
    }

    const dropGl = () => {
      if (blurTimer) clearInterval(blurTimer)
      blurTimer = null
      if (previewTimer) clearTimeout(previewTimer)
      previewTimer = null
      if (glSky) glSky.dispose()
      glSky = null
    }

    const renderSky = now => {
      if (!sky.get()) {
        dropGl()
        clearSky()
        return
      }
      // gruvbox is a still painting, so there is no canvas sky and no clock to
      // hold; gl=true would also blank the image layer, so it is forced off.
      const gl = look.get() !== 'sunset' ? (dropGl(), null) : glOn.get() ? ensureGl() : (dropGl(), null)
      if (gl) gl.setHold(heldMoment())
      paintSky(now, Boolean(gl))
    }

    const refreshWeather = () =>
      syncWeather(ctx)
        .then(current => {
          liveWeather = current
          applyWeather()
        })
        .catch(() => {})

    const weatherTimer = setInterval(refreshWeather, WEATHER_TTL_MS)

    const apply = now => {
      const next = phaseAt(now)
      phase.set(next)
      writeSun(now)

      renderSky(now)

      if (look.get() !== 'sunset') {
        requestTheme(GRUVBOX_THEME)
        if (tint.get()) setAccentOverride(GRUVBOX_ACCENT)
        return
      }

      if (!auto.get()) return

      requestTheme(phaseThemeName(next))

      if (tint.get()) setAccentOverride(PHASE_ACCENT[next])
    }

    const tick = () => {
      const now = nowAt()
      writeSun(now)
      if (sky.get()) renderSky(now)
      if (glSky && weatherMode.get() === 'live' && !liveWeather) applyWeather()
      if (phaseAt(now) !== phase.get()) apply(now)
    }

    const timer = setInterval(tick, 60_000)
    // the status stack's concave corners: a cheap layout read once a second
    let flareStyle = null
    if (typeof document !== 'undefined') {
      flareStyle = document.createElement('style')
      flareStyle.id = 'zephyr-stack-flare'
      flareStyle.textContent = STACK_FLARE_CSS
      document.head.appendChild(flareStyle)
    }
    // Live work tiles count up once a second. Only the turns that are still
    // running (and the newest reply, which may have just started) are touched.
    const liveTimer = setInterval(() => {
      if (typeof document === 'undefined' || document.hidden || !collapseWork.get() || !scrollSettled()) return
      const groups = new Set()
      document.querySelectorAll?.(".zephyr-work-summary[data-live]").forEach(el => {
        const g = groupContainerOf(el.closest?.("[data-slot='aui_assistant-message-root']")); if (g) groups.add(g)
      })
      const all = document.querySelectorAll?.("[data-slot='aui_assistant-message-root']")
      if (all && all.length) { const g = groupContainerOf(all[all.length - 1]); if (g) groups.add(g) }
      groups.forEach(g => processTurn(g, true))
    }, 1000)
    const flareTimer = setInterval(() => { if (typeof document !== 'undefined' && !document.hidden && scrollSettled()) fitStatusStack() }, 1000)
    apply(nowAt())
    syncSolar(ctx)
      .then(() => {
        if (glSky && liveSolar?.lat != null) glSky.setLocation(liveSolar.lat, liveSolar.lng)
        apply(nowAt())
        return refreshWeather()
      })
      .catch(() => {})

    // ── themes: the medium for "the app changes with the time of day" ──
    for (const name of PHASES) {
      ctx.register({ id: `theme.${name}`, area: THEMES_AREA, order: 40, data: themeFor(name) })
    }

    // The gruvbox skin: same theme contract as the phases, its own ground.
    ctx.register({
      id: 'theme.gruvbox',
      area: THEMES_AREA,
      order: 39,
      data: {
        name: GRUVBOX_THEME,
        label: 'Zephyr Gruvbox',
        description: 'The Backwater behind gruvbox glass: same shapes, warm greys, orange accent.',
        colors: GRUVBOX_GROUNDS
      }
    })

    // ── snippet cards: the medium for "small boxes I can copy and pin" ──
    ensureSnippetStyle()
    ensureMotionStyle()
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
            onGrab: (event, entry) => startDrag(event.nativeEvent || event, { type: 'snip', entry }, event.currentTarget, true),
            onPin: entry => {
              if (pins.get().some(p => p.id === entry.id)) unpinSnip(entry.id)
              else pinSnip(entry)
            }
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
            if (next) apply(nowAt())
            else setAccentOverride(null)
          }
        })
    })

    // ── settings ─────────────────────────────────────────────────────────────
    // One page, three short sections in the order people reach for them: the
    // sky, the light, the chat. Rows that only matter under another switch
    // (weather, smoothness, preview under the realistic sky) appear only when
    // that switch is on, and the pin roster appears only once there is a pin.
    const PHASE_TITLE = { dawn: 'Dawn', day: 'Day', dusk: 'Dusk', night: 'Night' }
    const QUALITY_FPS = { low: 4, balanced: 8, high: 16 }
    const section = (icon, title, rows) =>
      jsxs('section', {
        className: 'mb-6',
        children: [
          jsxs('div', {
            className: 'mb-1 flex items-center gap-2 pt-2 text-[length:var(--conversation-text-font-size)] font-medium',
            children: [
              jsx(Codicon, { className: 'text-muted-foreground', name: icon, size: '1rem' }),
              jsx('span', { children: title })
            ]
          }),
          ...rows.filter(Boolean)
        ]
      })

    // ── the skin as state: wallpaper + every knob the editor exposes ──────────
    // The image is stored under its own key because a full-resolution picture
    // can be megabytes; the rest is one small object.
    const storedSkin = stored(STORE_KEYS.skin)
    const customSkin = storedSkin && typeof storedSkin === 'object' ? { ...SKIN_DEFAULTS, ...storedSkin } : { ...SKIN_DEFAULTS }
    const storedPicture = stored(STORE_KEYS.skinImage)
    if (typeof storedPicture === 'string' && storedPicture.length > 32) customSkin.image = storedPicture
    // the built-in look always paints the shipped defaults
    setSkin(look.get() === 'custom' ? customSkin : { ...SKIN_DEFAULTS })
    ensurePictureStyle(SKIN.image)
    const skin = atom({ ...(look.get() === 'custom' ? customSkin : SKIN_DEFAULTS) })
    const switchLook = next => {
      if (next === look.get()) return
      look.set(next)
      persist()
      setLookMode(next === 'sunset' ? 'sunset' : 'gruvbox')
      // built-in always paints the shipped defaults; custom paints yours
      setSkin(next === 'custom' ? { ...skin.get() } : { ...SKIN_DEFAULTS })
      ensurePictureStyle(SKIN.image)
      apply(nowAt())
      if (sky.get()) renderSky(nowAt())
    }
    // Appearance › Theme is a second way in: picking Zephyr Gruvbox shows the
    // painting, picking Zephyr Dawn/Day/Dusk/Night shows that sky. Our own
    // requestTheme calls land here too and are no-ops by construction.
    let themeObs = null
    if (typeof MutationObserver === 'function' && typeof document !== 'undefined') {
      const onTheme = () => {
        const name = document.documentElement.dataset.hermesTheme || ''
        if (name === GRUVBOX_THEME) {
          if (look.get() === 'sunset') switchLook('gruvbox')
          return
        }
        const phase = PHASES.find(p => name === phaseThemeName(p))
        if (!phase) return
        const want = phase === phaseAt(new Date()) ? null : phase
        const lookChanged = look.get() !== 'sunset'
        if (want !== pin.get()) {
          pin.set(want)
          held.set(want === 'dusk')
          ctx.storage.set(STORE_KEYS.phasePin, want)
          persist()
        }
        if (lookChanged) switchLook('sunset')
        else { apply(nowAt()); if (sky.get()) renderSky(nowAt()) }
      }
      themeObs = new MutationObserver(onTheme)
      themeObs.observe(document.documentElement, { attributes: true, attributeFilter: ['data-hermes-theme'] })
    }
    const pushSkin = patch => {
      const next = { ...skin.get(), ...patch }
      // Touching a knob means "I want my own version": switch onto Custom so the
      // change is actually on screen, rather than silently stored for later.
      if (look.get() !== 'custom') {
        look.set('custom')
        persist()
        setLookMode('gruvbox')
      }
      for (const key of Object.keys(next)) if (next[key] === undefined) next[key] = SKIN_DEFAULTS[key]
      skin.set(next)
      setSkin(next)
      ctx.storage.set(STORE_KEYS.skin, next)
      if (!fromFile) writeConfig(next)
      if (patch.image !== undefined) {
        ctx.storage.set(STORE_KEYS.skinImage, next.image)
        ensurePictureStyle(next.image)
      }
      apply(nowAt())
    }
    const resetSkin = () => {
      skin.set({ ...SKIN_DEFAULTS })
      setSkin({ ...SKIN_DEFAULTS })
      ctx.storage.set(STORE_KEYS.skin, { ...SKIN_DEFAULTS })
      ctx.storage.set(STORE_KEYS.skinImage, SKIN_DEFAULTS.image)
      ensurePictureStyle(SKIN_DEFAULTS.image)
      writeConfig(SKIN_DEFAULTS)
      apply(nowAt())
    }
    // ── files: the painting, and ~/.hermes/zephyr-theme.json ─────────────
    // The theme file IS the Custom look. Every key is optional; anything left
    // out keeps its default. Edit it in any editor and the app follows within
    // a couple of seconds; moving a knob in Settings writes it back.
    const desk = typeof window !== 'undefined' ? window.hermesDesktop : null
    let configPath = null
    let homeDir = ''
    let lastConfigText = null
    const pathToUrl = v => {
      const t = String(v || '').trim()
      if (!t || /^(file|https?|data|blob):/i.test(t)) return t
      const abs = t.startsWith('~/') ? homeDir + t.slice(1) : t
      return abs.startsWith('/') ? 'file://' + encodeURI(abs) : t
    }
    const urlToPath = v => {
      const t = String(v || '')
      if (t.startsWith('data:')) return 'uploaded'
      if (!t.startsWith('file://')) return t
      const abs = decodeURI(t.slice(7))
      return homeDir && abs.startsWith(homeDir + '/') ? '~' + abs.slice(homeDir.length) : abs
    }
    const CONFIG_HELP = 'Zephyr Custom look. Edit and save; Hermes follows. image: a path (~/Pictures/x.jpg), a URL, or "uploaded" to keep the picture from Settings. Colours are hex; opacities and filters are numbers. Delete a key to get its default.'
    const configText = sk => {
      const out = { _help: CONFIG_HELP }
      for (const key of Object.keys(SKIN_DEFAULTS)) out[key] = key === 'image' ? urlToPath(sk.image) : sk[key]
      return JSON.stringify(out, null, 2) + '\n'
    }
    const writeConfig = sk => {
      if (!configPath || !desk?.writeTextFile) return
      const text = configText(sk)
      if (text === lastConfigText) return
      lastConfigText = text
      desk.writeTextFile(configPath, text).catch?.(() => {})
    }
    const readConfig = async (switchTo = true) => {
      if (!configPath || !desk?.readFileText) return
      let res = null
      try { res = await desk.readFileText(configPath) } catch { return }
      const text = res && res.ok !== false && typeof res.text === 'string' ? res.text : null
      if (text === null || text === lastConfigText) return
      lastConfigText = text
      let data
      try { data = JSON.parse(text) } catch (error) { console.warn('[zephyr] zephyr-theme.json is not valid JSON:', String(error)); return }
      if (!data || typeof data !== 'object') return
      const patch = {}
      for (const key of Object.keys(SKIN_DEFAULTS)) if (data[key] !== undefined && data[key] !== null && data[key] !== '') patch[key] = data[key]
      if (patch.image === 'uploaded') delete patch.image
      else if (patch.image) patch.image = pathToUrl(patch.image)
      const next = { ...SKIN_DEFAULTS, ...(patch.image ? {} : { image: skin.get().image }), ...patch }
      if (!switchTo && look.get() !== 'custom') {
        // startup: seed Custom quietly, without changing what is on screen
        ctx.storage.set(STORE_KEYS.skin, next)
        return
      }
      fromFile = true
      try { pushSkin(next) } finally { fromFile = false }
    }
    let fromFile = false
    const resolvePluginFiles = async () => {
      if (!desk?.desktopPluginsRoot || !desk?.readDir) return
      const root = await desk.desktopPluginsRoot()
      homeDir = root.replace(/\/\.hermes\/desktop-plugins\/?$/, '')
      configPath = root.replace(/\/desktop-plugins\/?$/, '') + '/zephyr-theme.json'
      const names = async dir => {
        try { return ((await desk.readDir(dir)) || {}).entries || [] } catch { return [] }
      }
      const tops = await names(root)
      const dirs = [...tops.filter(e => e.isDirectory && /zephyr/i.test(e.name)), ...tops.filter(e => e.isDirectory && !/zephyr/i.test(e.name))]
      let found = null
      for (const dir of dirs) {
        const here = await names(dir.path)
        if (!here.some(e => e.name === 'plugin.js')) continue
        const direct = here.find(e => e.name === BACKWATER_FILE)
        if (direct) { found = direct.path; break }
        if (here.some(e => e.name === 'assets' && e.isDirectory)) {
          const hit = (await names(dir.path + '/assets')).find(e => e.name === BACKWATER_FILE)
          if (hit) { found = hit.path; break }
        }
      }
      if (found) {
        const url = 'file://' + encodeURI(found)
        const was = BACKWATER_URL
        BACKWATER_URL = url
        SKIN_DEFAULTS.image = url
        if (!SKIN.image || SKIN.image === was || SKIN.image === 'data:,') setSkin({ ...SKIN, image: url })
        if (!skin.get().image || skin.get().image === was || skin.get().image === 'data:,') skin.set({ ...skin.get(), image: url })
        ensurePictureStyle(SKIN.image)
        apply(nowAt())
      } else {
        console.warn('[zephyr] could not find', BACKWATER_FILE, 'under', root)
      }
      await readConfig(false)
    }
    resolvePluginFiles().catch(error => console.warn('[zephyr] plugin files:', String(error)))
    const configTimer = setInterval(() => {
      if (typeof document !== 'undefined' && document.hidden) return
      readConfig(true)
    }, 2000)
    const openConfig = async () => {
      if (!configPath) return
      let exists = false
      try { const r = await desk.readFileText(configPath); exists = Boolean(r && r.ok !== false) } catch {}
      if (!exists) { lastConfigText = null; writeConfig(skin.get()); await new Promise(r => setTimeout(r, 200)) }
      desk.revealPath?.(configPath)
    }
    const readAsDataUrl = file => new Promise(resolve => {
      const reader = new FileReader()
      reader.onload = () => resolve(String(reader.result || ''))
      reader.onerror = () => resolve('')
      reader.readAsDataURL(file)
    })
    // Keep the original bytes whenever the store can take them; only re-encode
    // when a picture is too big for the browser's storage, and then once.
    const shrinkDataUrl = (dataUrl, max = 2560) => new Promise(resolve => {
      const img = new Image()
      img.onload = () => {
        if (!img.naturalWidth || img.naturalWidth <= max) return resolve(dataUrl)
        const scale = max / img.naturalWidth
        const canvas = document.createElement('canvas')
        canvas.width = Math.max(1, Math.round(img.naturalWidth * scale))
        canvas.height = Math.max(1, Math.round(img.naturalHeight * scale))
        canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height)
        resolve(canvas.toDataURL('image/jpeg', 0.92))
      }
      img.onerror = () => resolve(dataUrl)
      img.src = dataUrl
    })
    const useImageFile = async file => {
      if (!file) return
      const raw = await readAsDataUrl(file)
      if (!raw) return
      const fitted = raw.length > 3_200_000 ? await shrinkDataUrl(raw) : raw
      pushSkin({ image: fitted })
    }

    // ── Arclike ─────────────────────────────────────────────────────────────
    // The app unmounts the whole sidebar tree when it collapses, and remounting
    // it on every hover was the lag. So the app's sidebar is kept open, and
    // "collapsed" is ours: the column is lifted out of the flow and parked
    // off-screen, and a touch on the left edge slides it in. The app's own
    // toggle (button or shortcut) flips between this and a pinned sidebar.
    if (typeof document !== 'undefined' && typeof MutationObserver !== 'undefined') try {
      window.__zfRailGen = (window.__zfRailGen || 0) + 1
      const railGen = window.__zfRailGen
      const alive = () => window.__zfRailGen === railGen
      const root = document.documentElement
      const ARC_KEY = 'zephyr.arc.v1'
      let arc = (() => { try { return localStorage.getItem(ARC_KEY) !== '0' } catch { return true } })()
      let open = false
      let autoUntil = 0
      let closeTimer = 0

      document.querySelectorAll('#zf-rail-hot, #zf-status-panel, #zf-card-foot').forEach(el => el.remove())
      for (const k of ['zfRail', 'zfRailOpen', 'zfRailClosing']) delete root.dataset[k]
      delete document.body.dataset.zfCardOpen
      root.style.removeProperty('--zf-rail-shift')
      document.querySelectorAll('[data-zf-card], [data-zf-card-owner], [data-zf-docked], [data-zf-rail-void]').forEach(el => {
        delete el.dataset.zfCard; delete el.dataset.zfCardOwner; delete el.dataset.zfDocked; delete el.dataset.zfRailVoid
      })

      // command center header: folds the status data, shut by default
      const CC_KEY = 'zephyr.arc.cc.v1'
      document.querySelectorAll('#zf-cc-head').forEach(el => el.remove())
      const ccHead = document.createElement('div')
      ccHead.id = 'zf-cc-head'
      ccHead.setAttribute('role', 'button')
      ccHead.tabIndex = 0
      ccHead.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M22 12h-4l-3 9L9 3l-3 9H2"/></svg>'
        + '<span>Command center</span><span class="zf-cc-sum"></span>'
        + '<svg class="zf-cc-chev" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m4 6 4 4 4-4"/></svg>'
      document.body.appendChild(ccHead)
      const ccOpen = () => { try { return localStorage.getItem(CC_KEY) === '1' } catch { return false } }
      const applyCC = () => {
        const on = ccOpen()
        if (on) root.dataset.zfCcOpen = '1'
        else delete root.dataset.zfCcOpen
        ccHead.setAttribute('aria-expanded', String(on))
        ccHead.title = on ? 'Collapse command center' : 'Expand command center'
      }
      const flipCC = () => {
        try { localStorage.setItem(CC_KEY, ccOpen() ? '0' : '1') } catch {}
        applyCC()
        requestAnimationFrame(() => measureFoot())
      }
      document.querySelectorAll('#zf-mode-btn').forEach(el => el.remove())
      const modeBtn = document.createElement('button')
      modeBtn.type = 'button'
      modeBtn.id = 'zf-mode-btn'
      modeBtn.className = 'zf-mode-btn'
      modeBtn.setAttribute('aria-label', 'Toggle sidebar mode')
      document.body.appendChild(modeBtn)
      const ICON_PIN = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="4" width="18" height="16" rx="3"/><path d="M9 4v16"/></svg>'
      const ICON_FLOAT = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="4" width="18" height="16" rx="3"/><rect x="6" y="7" width="5" height="10" rx="1.5"/></svg>'
      const paintMode = () => {
        modeBtn.innerHTML = arc ? ICON_PIN : ICON_FLOAT
        modeBtn.title = arc ? 'Pin sidebar (⌘S)' : 'Float sidebar (⌘S)'
        modeBtn.setAttribute('aria-label', modeBtn.title)
      }
      modeBtn.addEventListener('click', e => {
        e.stopPropagation(); e.preventDefault()
        if (arc) { morph(() => setArc(false)); return }
        morph(() => { setArc(true); setOpen(true, true) })
      })
      modeBtn.addEventListener('keydown', e => e.stopPropagation())
      ccHead.addEventListener('click', flipCC)
      ccHead.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); flipCC() } })
      applyCC()

      const hot = document.createElement('div')
      hot.id = 'zf-rail-hot'
      hot.setAttribute('aria-hidden', 'true')
      document.body.appendChild(hot)

      const toggleBtn = () => Array.from(document.querySelectorAll('button'))
        .find(el => /^(show|hide) sidebar/i.test(el.getAttribute('aria-label') || ''))
      const press = el => {
        autoUntil = Date.now() + 400
        el.click()
      }
      const column = () => {
        const side = document.querySelector("[data-slot='sidebar']")
        let node = side
        while (node && node.parentElement && !node.parentElement.hasAttribute('data-tree-split')) node = node.parentElement
        return node && node.parentElement ? node : null
      }

      // Cmd+S / the mode button morph between pinned and floating: the column
      // and the main pane are captured and glide to their new boxes
      const morph = fn => {
        if (!document.startViewTransition || matchMedia('(prefers-reduced-motion: reduce)').matches) { fn(); return }
        const col = column()
        const split = col && col.parentElement
        const main = split && Array.from(split.children).filter(c => c !== col && c.getClientRects().length).sort((a, b) => b.getBoundingClientRect().width - a.getBoundingClientRect().width)[0]
        if (col) col.style.viewTransitionName = 'zf-side'
        if (main) main.style.viewTransitionName = 'zf-main'
        root.dataset.zfMorph = '1'
        const t = document.startViewTransition(fn)
        t.finished.finally(() => {
          if (col) col.style.viewTransitionName = ''
          if (main) main.style.viewTransitionName = ''
          delete root.dataset.zfMorph
          window.dispatchEvent(new Event('zf-morph-end'))
        })
      }
      const setArc = value => {
        arc = value
        try { localStorage.setItem(ARC_KEY, value ? '1' : '0') } catch {}
        setOpen(false, true)
        sync()
      }
      const setOpen = (value, instant) => {
        clearTimeout(closeTimer)
        if (open === value) return
        open = value
        if (value) root.dataset.zfArcOpen = '1'
        else delete root.dataset.zfArcOpen
        if (instant) {
          const col = column()
          const els = [col, document.querySelector('footer[data-zf-arc-foot]'), document.querySelector('#zephyr-snips[data-zf-arc-snips]')].filter(Boolean)
          els.forEach(el => { el.style.transition = 'none' })
          requestAnimationFrame(() => els.forEach(el => { el.style.transition = '' }))
        }
      }

      // footer + snippets geometry follows the column (card or pinned)
      let footRO = null
      const measureFoot = () => {
        const foot = document.querySelector('footer[data-zf-arc-foot]')
        const snips = document.querySelector('#zephyr-snips[data-zf-arc-snips]')
        const fh = foot && root.dataset.zfCcOpen === '1' ? foot.offsetHeight : 0
        const hh = ccHead.offsetHeight
        const sh = snips && !snips.hidden ? snips.offsetHeight : 0
        root.style.setProperty('--zf-foot-h', fh + 'px')
        root.style.setProperty('--zf-cc-h', hh + 'px')
        root.style.setProperty('--zf-arc-foot', (fh + hh + sh) + 'px')
      }
      let lastFoot = null
      let lastSnips = null
      const sync = () => {
        if (!alive()) return
        const side = document.querySelector("[data-slot='sidebar']")
        if (!side) {
          // the app collapsed it (button, shortcut, or our own first run):
          // that is a toggle of the arclike, then the tree comes back
          if (Date.now() > autoUntil) {
            const btn = toggleBtn()
            if (btn && /^show sidebar/i.test(btn.getAttribute('aria-label') || '')) {
              arc = !arc || !root.dataset.zfArcSeen ? true : !arc
              try { localStorage.setItem(ARC_KEY, arc ? '1' : '0') } catch {}
              setOpen(false, true)
              press(btn)
            }
          }
          return
        }
        root.dataset.zfArcSeen = '1'
        const col = column()
        document.querySelectorAll('[data-zf-arc-col]').forEach(el => { if (el !== col) delete el.dataset.zfArcCol })
        if (col && !col.dataset.zfArcCol) col.dataset.zfArcCol = '1'
        if (col && modeBtn.parentElement !== col) col.appendChild(modeBtn)
        if (arc) { if (root.dataset.zfArc !== '1') root.dataset.zfArc = '1' }
        else if (root.dataset.zfArc) delete root.dataset.zfArc
        if (modeBtn.dataset.arc !== String(arc)) { modeBtn.dataset.arc = String(arc); paintMode() }

        const foot = document.querySelector("footer[data-slot='statusbar']")
        if (foot && !foot.hasAttribute('data-zf-arc-foot')) foot.setAttribute('data-zf-arc-foot', '')
        if (!root.dataset.zfArcReady) root.dataset.zfArcReady = '1'
        // one-line summary on the folded header: the backend state
        const sumEl = ccHead.querySelector('.zf-cc-sum')
        let sum = ''
        if (foot) {
          const row = Array.from(foot.querySelectorAll(':scope > div > *')).find(el => /ready|connect|offline|error|starting|stopped/i.test(el.textContent || ''))
          sum = row ? Array.from(row.querySelectorAll('*')).filter(el => !el.children.length).map(el => el.textContent.trim()).filter(Boolean).join(' ') : ''
        }
        if (sumEl.textContent !== sum) sumEl.textContent = sum
        // chat tabs clear the sidebar toggle wherever the window chrome puts it
        const tb = toggleBtn()
        if (tb) {
          const right = Math.round(tb.getBoundingClientRect().right + 10)
          if (root.style.getPropertyValue('--zf-tb-left') !== right + 'px') root.style.setProperty('--zf-tb-left', right + 'px')
        }
        const all = Array.from(document.querySelectorAll('#zephyr-snips'))
        const snips = all[all.length - 1] || null
        all.forEach(el => { if (el !== snips) el.setAttribute('data-zf-stale', ''); else el.removeAttribute('data-zf-stale') })
        if (snips && !snips.hasAttribute('data-zf-arc-snips')) snips.setAttribute('data-zf-arc-snips', '')

        if (arc) {
          root.style.setProperty('--zf-foot-x', '10px')
          root.style.setProperty('--zf-foot-w', '272px')
          root.style.setProperty('--zf-foot-b', '10px')
          root.style.setProperty('--zf-foot-r', '16px')
        } else if (col) {
          const r = col.getBoundingClientRect()
          root.style.setProperty('--zf-foot-x', Math.round(r.left) + 'px')
          root.style.setProperty('--zf-foot-w', Math.round(r.width) + 'px')
          root.style.setProperty('--zf-foot-b', Math.max(0, Math.round(innerHeight - r.bottom)) + 'px')
          root.style.setProperty('--zf-foot-r', '0px')
        }
        if (foot !== lastFoot || snips !== lastSnips) {
          lastFoot = foot
          lastSnips = snips
          if (footRO) footRO.disconnect()
          if (typeof ResizeObserver === 'function') {
            footRO = new ResizeObserver(measureFoot)
            if (foot) footRO.observe(foot)
            footRO.observe(ccHead)
            if (snips) footRO.observe(snips)
            if (col) footRO.observe(col)
          }
          measureFoot()
        }
      }
      let queued = false
      const schedule = () => {
        if (queued) return
        queued = true
        requestAnimationFrame(() => { queued = false; sync() })
      }
      // landing / chat state of the visible pane
      document.querySelectorAll('#zf-landing').forEach(el => el.remove())
      const landing = document.createElement('div')
      landing.id = 'zf-landing'
      landing.setAttribute('aria-hidden', 'true')
      const LINES = ['Where should we begin?', 'What are we making today?', 'Bring the stuck part. We will work it out.', 'Drop in a task, a file, or a rough idea.', 'What should Hermes tackle?']
      landing.innerHTML = '<div class="zf-land-mark">HERMES AGENT</div><div class="zf-land-line"></div>'
      landing.lastElementChild.textContent = LINES[Math.floor(Math.random() * LINES.length)]
      document.body.appendChild(landing)
      let landKey = ''
      const syncLanding = () => {
        // mid-morph the page is a set of transition snapshots, so hit-testing
        // finds no thread and would frost the landing for a few frames
        if (root.dataset.zfMorph) return
        // several tabs keep their thread mounted in the same spot; the visible
        // one is whichever the pointer would actually hit
        const vps = Array.from(document.querySelectorAll("[data-slot='aui_thread-viewport']")).filter(el => el.getClientRects().length && el.getBoundingClientRect().width > 200)
        // only a viewport the pointer would actually hit counts: a page like
        // Capabilities sits on top of a still-mounted thread
        let vp = null
        for (const v of vps) {
          const r = v.getBoundingClientRect()
          const hits = document.elementsFromPoint(r.left + r.width / 2, r.top + r.height * 0.3).filter(h => h !== landing && !landing.contains(h))
          if (hits.length && v.contains(hits[0])) { vp = v; break }
        }
        const hasMsg = vp ? Boolean(vp.querySelector("[data-slot*='message']")) : false
        const intro = vp ? vp.querySelector("[data-slot='aui_intro']") : null
        const introShown = Boolean(intro && intro.getClientRects().length)
        if (!landing.dataset.cloned && !intro) {
          const any = document.querySelector("[data-slot='aui_intro']")
          if (any) {
            const copy = any.cloneNode(true)
            copy.removeAttribute('data-slot')
            copy.querySelectorAll('[data-slot]').forEach(el => el.removeAttribute('data-slot'))
            landing.replaceChildren(copy)
            landing.dataset.cloned = '1'
          }
        }
        // the painting is sharp only on a landing; every other page is frosted
        const chat = !introShown && !(vp && !hasMsg)
        if (chat) root.dataset.zfChat = '1'
        else delete root.dataset.zfChat
        // borrow the app's own intro (font-fitted wordmark and all) once seen
        if (introShown && !landing.dataset.cloned) {
          const copy = intro.cloneNode(true)
          copy.removeAttribute('data-slot')
          copy.querySelectorAll('[data-slot]').forEach(el => el.removeAttribute('data-slot'))
          landing.replaceChildren(copy)
          landing.dataset.cloned = '1'
        }
        const want = Boolean(vp) && !hasMsg && !introShown
        if (want) {
          const r = vp.getBoundingClientRect()
          const key = [r.left, r.top, r.width, r.height].map(Math.round).join('/')
          if (key !== landKey) {
            landKey = key
            Object.assign(landing.style, { left: Math.round(r.left) + 'px', top: Math.round(r.top) + 'px', width: Math.round(r.width) + 'px', height: Math.round(r.height * 0.82) + 'px' })
          }
          if (root.dataset.zfLanding !== '1') {
            if (!landing.dataset.cloned) landing.lastElementChild.textContent = LINES[Math.floor(Math.random() * LINES.length)]
            root.dataset.zfLanding = '1'
          }
        } else if (root.dataset.zfLanding) {
          delete root.dataset.zfLanding
        }
      }
      const baseSync = sync
      window.addEventListener('zf-morph-end', () => { if (alive()) syncLanding() })
      const fullSync = () => { baseSync(); if (alive()) syncLanding() }
      let queued2 = false
      const schedule2 = () => {
        if (queued2) return
        queued2 = true
        requestAnimationFrame(() => { queued2 = false; fullSync() })
      }
      new MutationObserver(schedule2).observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['aria-selected', 'data-state', 'hidden'] })
      window.addEventListener('resize', schedule2)
      fullSync()

      // Cmd+S: hide / show the sidebar (pinned <-> arclike)
      window.addEventListener('keydown', event => {
        if (!alive()) return
        if (event.metaKey && !event.shiftKey && !event.altKey && !event.ctrlKey && (event.key === 's' || event.key === 'S')) {
          event.preventDefault()
          event.stopImmediatePropagation()
          if (!document.querySelector("[data-slot='sidebar']")) {
            const btn = toggleBtn()
            if (btn) press(btn)
            setArc(false)
            return
          }
          morph(() => setArc(!arc))
        }
      }, true)

      // the app's toggle flips arclike <-> pinned instead of unmounting the tree
      window.addEventListener('click', event => {
        if (!alive() || !event.isTrusted) return
        const btn = event.target instanceof Element ? event.target.closest('button') : null
        if (!btn || !/^(show|hide) sidebar/i.test(btn.getAttribute('aria-label') || '')) return
        if (!document.querySelector("[data-slot='sidebar']")) return
        event.preventDefault()
        event.stopImmediatePropagation()
        setArc(!arc)
      }, true)

      // A session clicked in the sidebar opens in the tab you are in. The app
      // always routes a row click to the first (workspace) tab; when a session
      // tab is active, open the row as a tab through the row's own menu and
      // retire the tab it replaces.
      const topTabs = () => Array.from(document.querySelectorAll("[role='tab'][data-tree-tab]")).filter(t => !t.closest('[data-zf-arc-col]'))
      let swapping = false
      document.addEventListener('click', event => {
        if (!alive() || swapping || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
        // the whole row counts (it is ~62px tall; the title button is 18px),
        // except its own controls: the actions menu and the reorder handle
        const t = event.target
        if (!t.closest || !t.closest("[data-slot='sidebar']")) return
        if (t.closest("button:not([data-slot='row-button']), [aria-label^='Reorder'], input, [role='menu']")) return
        const row = t.closest("[data-slot='context-menu-trigger']")
        const btn = row && row.querySelector("button[data-slot='row-button']")
        if (!btn) return
        const active = topTabs().find(t => t.getAttribute('aria-selected') === 'true')
        const oldId = active && active.dataset.treeTab
        if (!row || !oldId || !oldId.startsWith('session-tile:')) return
        event.preventDefault()
        event.stopImmediatePropagation()
        swapping = true
        root.dataset.zfGhostMenu = '1'
        const r = btn.getBoundingClientRect()
        row.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: r.left + 20, clientY: r.top + r.height / 2, button: 2 }))
        const finish = () => { swapping = false; delete root.dataset.zfGhostMenu }
        let tries = 0
        const pick = () => {
          const items = Array.from(document.querySelectorAll("[role='menuitem']"))
          if (!items.length && tries++ < 20) { requestAnimationFrame(pick); return }
          const item = items.find(i => /new tab/i.test(i.textContent))
          if (!item) {
            // already open somewhere: close the menu, let the app route it
            document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
            setTimeout(() => { finish(); btn.click() }, 60)
            return
          }
          const before = new Set(topTabs().map(t => t.dataset.treeTab))
          item.click()
          let waits = 0
          const retire = () => {
            const fresh = topTabs().find(t => !before.has(t.dataset.treeTab))
            if (!fresh && waits++ < 40) { setTimeout(retire, 25); return }
            finish()
            const old = topTabs().find(t => t.dataset.treeTab === oldId)
            const close = old && old.querySelector("button[aria-label='Close']")
            if (fresh && close) {
              close.click()
              // a running tab asks first; keep it rather than surprise anyone
              setTimeout(() => {
                const dlg = document.querySelector("[role='alertdialog'], [role='dialog'][data-state='open']")
                if (dlg && /running/i.test(dlg.textContent)) document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
              }, 120)
            }
          }
          retire()
        }
        requestAnimationFrame(pick)
      }, true)

      // reveal / tuck away
      hot.addEventListener('mouseenter', () => { if (alive() && arc) setOpen(true) })
      const busy = () => Boolean(document.querySelector('[data-radix-popper-content-wrapper], [role=menu], [role=dialog][data-state=open]'))
      document.addEventListener('mousemove', event => {
        if (!alive() || !arc || !open) return
        const limit = 10 + 272 + 6
        if (event.clientX <= limit) { clearTimeout(closeTimer); closeTimer = 0; return }
        if (closeTimer || busy()) return
        closeTimer = setTimeout(() => { closeTimer = 0; if (!busy()) setOpen(false) }, 40)
      }, { passive: true })
      document.documentElement.addEventListener('mouseleave', () => {
        if (!alive() || !arc || !open || busy()) return
        clearTimeout(closeTimer)
        closeTimer = setTimeout(() => { closeTimer = 0; setOpen(false) }, 60)
      })
      window.addEventListener('keydown', event => {
        if (alive() && arc && open && event.key === 'Escape' && !busy()) setOpen(false)
      })

      ctx.onDispose?.(() => { hot.remove(); ccHead.remove(); modeBtn.remove(); landing.remove(); if (footRO) footRO.disconnect() })
    } catch (err) {
      console.error('[zf-rail] failed: ' + (err && err.stack || err))
    }

    // ── a big, unmissable close on anything that opens on the right ───────────
    // PDF viewers, previews, browser panes and drawers all slide in from the
    // right edge and each one ships its own small, easy-to-miss control. This
    // puts one 36px × in the same place on all of them, and drives whichever
    // close control the panel actually has.
    if (typeof document !== 'undefined' && typeof MutationObserver !== 'undefined'
        && typeof requestAnimationFrame === 'function' && typeof PointerEvent !== 'undefined') {
      const PANEL_SELECTOR = [
        "[data-slot*='panel']", "[data-slot*='preview']", "[data-slot*='viewer']",
        "[data-slot*='drawer']", "[data-slot*='artifact']", "[data-slot*='artefact']",
        "[data-slot*='split']", "[data-slot*='webview']", "[data-slot*='browser']",
        'aside'
      ].join(',')

      const findPanel = () => {
        const width = window.innerWidth
        const height = window.innerHeight
        return Array.from(document.querySelectorAll(PANEL_SELECTOR))
          .filter(el => {
            if (el.closest("[data-slot='sidebar']")) return false
            if (el.closest('#zf-panel-close')) return false
            // the conversation pane also reaches the right edge; a side panel
            // never contains the thread or the composer
            if (el.querySelector("[data-slot='aui_thread'], [data-slot='aui_thread-content'], [data-slot='composer']")) return false
            const rect = el.getBoundingClientRect()
            if (rect.width < 240 || rect.height < 260) return false
            if (rect.right < width - 6) return false          // must hug the right edge
            if (rect.left < width * 0.32) return false        // and be a side panel, not the page
            if (rect.height < height * 0.35) return false
            const style = getComputedStyle(el)
            if (style.visibility === 'hidden' || style.display === 'none' || Number(style.opacity) < 0.2) return false
            return true
          })
          // narrowest wins: a side panel is the smallest thing hugging the edge
          .sort((a, b) => a.getBoundingClientRect().width - b.getBoundingClientRect().width)[0] || null
      }

      const press = el => {
        const rect = el.getBoundingClientRect()
        const opts = { bubbles: true, cancelable: true, clientX: rect.left + rect.width / 2, clientY: rect.top + rect.height / 2, button: 0 }
        el.dispatchEvent(new PointerEvent('pointerdown', { ...opts, pointerId: 1, isPrimary: true }))
        el.dispatchEvent(new MouseEvent('mousedown', opts))
        el.dispatchEvent(new PointerEvent('pointerup', { ...opts, pointerId: 1, isPrimary: true }))
        el.dispatchEvent(new MouseEvent('mouseup', opts))
        el.dispatchEvent(new MouseEvent('click', opts))
      }

      const closePanel = panel => {
        // 1. the panel's own labelled control, if it ships one
        const own = Array.from(panel.querySelectorAll('button, [role="button"], a'))
          .find(el => /close|dismiss|hide|collapse/i.test(el.getAttribute('aria-label') || el.title || el.textContent || ''))
        if (own) press(own)
        // 2. always also send Escape, which is what the app binds to dismiss a
        //    preview pane. Harmless when the pane already closed itself above.
        const target = document.activeElement || panel
        for (const type of ['keydown', 'keyup']) {
          target.dispatchEvent(new KeyboardEvent(type, { key: 'Escape', code: 'Escape', bubbles: true, cancelable: true }))
          document.dispatchEvent(new KeyboardEvent(type, { key: 'Escape', code: 'Escape', bubbles: true, cancelable: true }))
        }
        return Boolean(own)
      }

      const button = document.createElement('button')
      button.id = 'zf-panel-close'
      button.type = 'button'
      button.setAttribute('aria-label', 'Close panel')
      button.title = 'Close'
      button.textContent = '\u00d7'
      Object.assign(button.style, {
        position: 'fixed',
        zIndex: '2147483000',
        display: 'none',
        alignItems: 'center',
        justifyContent: 'center',
        width: '36px',
        height: '36px',
        padding: '0',
        borderRadius: '10px',
        border: '1px solid var(--zf-hair, rgba(255, 255, 255, 0.14))',
        background: 'rgba(20, 16, 14, 0.72)',
        backdropFilter: 'blur(10px) saturate(1.2)',
        WebkitBackdropFilter: 'blur(10px) saturate(1.2)',
        color: 'var(--zf-ink-1, #ebdbb2)',
        fontSize: '22px',
        lineHeight: '1',
        fontWeight: '400',
        cursor: 'pointer',
        boxShadow: '0 4px 14px rgba(0, 0, 0, 0.38)',
        transition: 'background-color 120ms ease, color 120ms ease, border-color 120ms ease'
      })
      button.addEventListener('mouseenter', () => {
        button.style.background = 'var(--zf-accent, #fe8019)'
        button.style.color = '#1d2021'
        button.style.borderColor = 'transparent'
      })
      button.addEventListener('mouseleave', () => {
        button.style.background = 'rgba(20, 16, 14, 0.72)'
        button.style.color = 'var(--zf-ink-1, #ebdbb2)'
        button.style.borderColor = 'var(--zf-hair, rgba(255, 255, 255, 0.14))'
      })
      button.addEventListener('click', event => {
        event.preventDefault()
        event.stopPropagation()
        // act on the panel this button was positioned for; a fresh lookup can
        // race with the panel unmounting and pick something else entirely
        const panel = currentPanel && document.contains(currentPanel) ? currentPanel : findPanel()
        if (panel) closePanel(panel)
      })
      document.body.appendChild(button)

      let raf = 0
      let currentPanel = null
      const place = () => {
        raf = 0
        const panel = findPanel()
        currentPanel = panel
        if (!panel) { button.style.display = 'none'; button.dataset.target = ''; return }
        const rect = panel.getBoundingClientRect()
        button.style.display = 'flex'
        button.style.top = `${Math.round(rect.top + 10)}px`
        button.style.left = `${Math.round(rect.right - 46)}px`
        button.dataset.target = panel.dataset.slot || panel.tagName.toLowerCase()
      }
      const schedule = () => { if (!raf) raf = requestAnimationFrame(place) }

      // panels come and go, resize, and slide; watching the tree plus a slow
      // poll is cheaper than a scroll listener on every ancestor
      const panelObserver = new MutationObserver(schedule)
      panelObserver.observe(document.body, { childList: true, subtree: true })
      window.addEventListener('resize', schedule)
      window.addEventListener('scroll', schedule, true)
      const timer = setInterval(schedule, 700)
      schedule()
      ctx.onDispose?.(() => {
        clearInterval(timer)
        panelObserver.disconnect()
        window.removeEventListener('resize', schedule)
        window.removeEventListener('scroll', schedule, true)
        button.remove()
      })
    }

    // ── the picture + glass editor ───────────────────────────────────────────
    // Plain inputs on purpose: a range, a colour swatch, a file picker and a URL
    // box cover every knob the skin has, and none of them depend on a Tailwind
    // class that may not exist in the app's compiled sheet.
    const SkinRow = (label, control) =>
      jsxs('div', { className: 'flex items-center justify-between gap-3 py-1', children: [
        jsx('span', { className: 'text-[length:var(--conversation-text-font-size)] text-(--ui-text-secondary)', children: label }),
        control
      ]})

    const SkinEditor = () => {
      const cfg = useValue(skin)
      const slider = ([key, label, min, max, step]) =>
        SkinRow(label, jsx('input', {
          type: 'range', min, max, step, value: cfg[key],
          style: { width: '10rem', accentColor: 'var(--zf-accent)' },
          onChange: event => pushSkin({ [key]: Number(event.target.value) })
        }))
      const swatch = ([key, label]) =>
        SkinRow(label, jsx('input', {
          type: 'color', value: cfg[key],
          style: { width: '2.25rem', height: '1.5rem', padding: '0', border: '1px solid var(--zf-edge)', borderRadius: '0.375rem', background: 'transparent' },
          onChange: event => pushSkin({ [key]: event.target.value })
        }))
      const isUpload = typeof cfg.image === 'string' && cfg.image.startsWith('data:')
      return jsxs('div', { className: 'mt-1 flex flex-col gap-0.5', children: [
        jsxs('div', { className: 'flex flex-wrap items-center gap-2 pb-2', children: [
          jsx('label', {
            className: 'cursor-pointer rounded-md px-2 py-1 text-[0.75rem]',
            style: { border: '1px solid var(--zf-edge)' },
            children: [
              'Choose image…',
              jsx('input', {
                type: 'file', accept: 'image/*', style: { display: 'none' },
                onChange: event => {
                  const file = event.target.files && event.target.files[0]
                  void useImageFile(file)
                  event.target.value = ''
                }
              })
            ]
          }),
          jsx('input', {
            type: 'text',
            value: isUpload ? '' : String(cfg.image || ''),
            placeholder: isUpload ? '(uploaded image)' : 'image URL or file path',
            className: 'rounded-md bg-transparent px-2 py-1 text-[0.75rem]',
            style: { flex: '1 1 12rem', minWidth: '10rem', border: '1px solid var(--zf-edge)' },
            onChange: event => {
              const value = event.target.value.trim()
              if (value) pushSkin({ image: value })
            }
          }),
          jsx('button', {
            type: 'button',
            className: 'rounded-md px-2 py-1 text-[0.75rem]',
            style: { border: '1px solid var(--zf-edge)' },
            onClick: () => resetSkin(),
            children: 'Reset'
          }),
          jsx('button', {
            type: 'button',
            className: 'rounded-md px-2 py-1 text-[0.75rem]',
            style: { border: '1px solid var(--zf-edge)' },
            title: '~/.hermes/zephyr-theme.json: every colour, opacity and filter of the Custom look, as one editable file',
            onClick: () => { openConfig() },
            children: 'Theme file'
          })
        ]}),
        ...SKIN_SLIDERS.map(slider),
        ...SKIN_COLORS.map(swatch)
      ]})
    }

    ctx.registerSettingsPage?.({
      id: 'zephyr',
      title: 'Zephyr',
      icon: 'zephyr',
      render: function ZephyrSettings() {
        const isAuto = useValue(auto)
        const isTint = useValue(tint)
        const isSky = useValue(sky)
        const isMargins = useValue(margins)
        const isCollapseWork = useValue(collapseWork)
        const isMotion = useValue(motion)
        const isStatusDock = useValue(statusDock)
        const isLibrary = useValue(library)
        const isGl = useValue(glOn)
        const isHold = useValue(held)
        const lookNow = useValue(look)
        const mode = useValue(weatherMode)
        const q = useValue(quality)
        const nowWeather = useValue(weatherNow)
        const nowPhase = useValue(phase)
        const list = useValue(pins)
        const realistic = isSky && isGl && !glFailed && lookNow === 'sunset'

        const status = lookNow === 'gruvbox'
          ? ['Gruvbox', 'The Backwater, Wyllie', '4096 × 2428 at full size', !isSky ? 'background off' : 'painting behind glass'].join('  ·  ')
          : [
          `${PHASE_TITLE[nowPhase] || nowPhase}, ${PHASE_BLURB[nowPhase]}`,
          realistic ? (mode === 'live' ? (nowWeather ? `live weather: ${nowWeather}` : 'live weather') : WEATHER_LABEL[mode]) : null,
          !isSky ? 'sky off' : realistic ? `sky at ${QUALITY_FPS[q]} fps` : 'painted sky'
        ].filter(Boolean).join('  ·  ')

        const header = jsxs('div', {
          className: 'mb-6 flex items-start gap-4 rounded-[0.9rem] p-4',
          style: { background: 'var(--zf-glass-sunk, var(--ui-bg-tertiary))', boxShadow: 'var(--zf-lift, none)' },
          children: [
            jsx('div', {
              className: 'size-14 shrink-0 rounded-[0.85rem]',
              // tight and dark, so the shadow grounds the badge instead of haloing it
              style: { boxShadow: '0 3px 8px rgba(0, 0, 0, 0.32)', isolation: 'isolate' },
              dangerouslySetInnerHTML: { __html: ZEPHYR_BADGE_SVG }
            }),
            jsxs('div', {
              className: 'min-w-0',
              children: [
                jsx('div', { className: 'text-[1.05rem] font-semibold text-foreground', children: 'Zephyr' }),
                jsx('p', {
                  className: 'mt-1 text-[0.8125rem] leading-5 text-(--ui-text-secondary)',
                  children: 'Hermes, lit by the sky outside. Zephyr follows the sun where you are through dawn, day, '
                    + 'dusk and night, paints a live sky behind the app that follows your weather, and tints every '
                    + 'panel with it. Agents can also show copyable ::snippet cards, which you can pin.'
                }),
                jsx('p', { className: 'mt-2 text-[0.75rem] text-(--ui-text-tertiary)', children: `Now: ${status}` })
              ]
            })
          ]
        })

        const skySection = section('cloud', 'Sky', [
          jsx(ListRow, {
            title: 'Background',
            description: lookNow === 'sunset'
              ? 'The sky where you are, painted from the real sun, with the clock driving dawn, day, dusk and night.'
              : lookNow === 'gruvbox'
                ? 'The built-in look: The Backwater (Charles W. Wyllie, 1903), 4096×2428, behind warm gruvbox glass. Its own theme in Appearance, too.'
                : 'Your own picture, with your own glass. Every knob below is yours; the built-in look stays one click away.',
            action: jsx(SegmentedControl, {
              value: lookNow,
              options: [
                { id: 'sunset', label: 'Sky' },
                { id: 'gruvbox', label: 'Built-in' },
                { id: 'custom', label: 'Custom' }
              ],
              onChange: next => switchLook(next)
            })
          }),
          jsx(ToggleRow, {
            checked: isSky,
            description: 'Show the sky behind the app. Off gives a plain dark background.',
            label: 'Sky',
            onChange: on => {
              sky.set(on)
              persist()
              renderSky(nowAt())
            }
          }),
          isSky
            ? jsx(ToggleRow, {
                checked: isGl && !glFailed,
                disabled: glFailed,
                description: glFailed
                  ? 'This device could not start it (no WebGL), so the painted gradient sky is used.'
                  : 'The sun where you really are, clouds that follow the weather, and twilight colours. Off uses a lighter painted gradient.',
                label: 'Realistic sky',
                onChange: on => {
                  glOn.set(on)
                  persist()
                  renderSky(nowAt())
                }
              })
            : null,
          realistic
            ? jsx(ListRow, {
                title: 'Weather',
                description: mode === 'live'
                  ? `Follows the weather where you are${nowWeather ? ` (now ${nowWeather})` : ''}.`
                  : 'Held on one sky. Clouds take about 25 seconds to change over.',
                action: jsxs(Select, {
                  value: mode,
                  onValueChange: next => {
                    weatherMode.set(next)
                    persist()
                    applyWeather()
                  },
                  children: [
                    jsx(SelectTrigger, { className: 'w-full @2xl:w-56', children: jsx(SelectValue, {}) }),
                    jsx(SelectContent, {
                      children: WEATHER_ORDER.map(k => jsx(SelectItem, { value: k, children: WEATHER_LABEL[k] }, k))
                    })
                  ]
                })
              })
            : null,
          realistic
            ? jsx(ListRow, {
                title: 'Smoothness',
                description: `${QUALITY_FPS[q]} frames a second. Clouds drift slowly, so Balanced looks the same as High and uses half the power.`,
                action: jsx(SegmentedControl, {
                  value: q,
                  options: [
                    { id: 'low', label: 'Low' },
                    { id: 'balanced', label: 'Balanced' },
                    { id: 'high', label: 'High' }
                  ],
                  onChange: next => {
                    if (next === quality.get()) return
                    quality.set(next)
                    persist()
                    dropGl()
                    renderSky(nowAt())
                  }
                })
              })
            : null,
          realistic
            ? jsx(ListRow, {
                title: 'Preview a day',
                description: 'Watch the next 24 hours of sky in one minute, then it returns to now.',
                action: jsx(Button, {
                  size: 'sm',
                  variant: 'outline',
                  onClick: () => {
                    const g = ensureGl()
                    if (!g) return
                    const base = Date.now()
                    const t0 = performance.now()
                    g.setClock(() => new Date(base + (performance.now() - t0) * 1440), true)
                    if (previewTimer) clearTimeout(previewTimer)
                    previewTimer = setTimeout(() => {
                      previewTimer = null
                      if (glSky) glSky.setClock(null, false)
                    }, 60_000)
                  },
                  children: 'Play'
                })
              })
            : null
        ])

        const skinSection = section('paintcan', 'Picture & glass', [
          jsx(ListRow, {
            title: 'Wallpaper',
            description: lookNow === 'custom'
              ? 'Your picture, at its own resolution. Anything the browser can decode: JPG, PNG, WebP, AVIF, HEIC on macOS. Large files are downscaled once, only if the store cannot hold the original.'
              : 'Switch Background to Custom to paint your own picture. Built-in uses The Backwater.',
            action: jsx('span', { className: 'text-[0.75rem] text-(--ui-text-tertiary)', children: lookNow === 'custom' ? 'Custom' : lookNow === 'gruvbox' ? 'Built-in' : 'Sky' })
          }),
          jsx(SkinEditor, {})
        ])

        const lightSection = section('symbol-color', 'Light', [
          jsx(ToggleRow, {
            checked: isHold,
            description: 'On by default in this build. Holds the sky and the colours at the half hour after sunset all day, so Hermes keeps a dark ember look instead of drifting into daylight blues or the flat night. Off follows the real sun again.',
            label: 'Hold the light at sunset',
            onChange: on => {
              held.set(on)
              pin.set(on ? 'dusk' : null)
              ctx.storage.set(STORE_KEYS.phasePin, pin.get())
              persist()
              apply(nowAt())
              if (sky.get()) renderSky(nowAt())
            }
          }),
          jsx(ToggleRow, {
            checked: isAuto,
            description: 'On by default. Switches Hermes\'s colours between the dawn, day, dusk and night themes as the sun moves. Off keeps the theme you pick in Appearance. The sky follows the real sun either way.',
            label: 'Time-of-day themes',
            onChange: on => {
              auto.set(on)
              persist()
              if (on) apply(nowAt())
              else setAccentOverride(null)
            }
          }),
          jsx(ToggleRow, {
            checked: isTint,
            description: 'Shift the accent colour (links, buttons, selection) to match the time of day, even on other themes.',
            label: 'Tint the accent',
            onChange: on => {
              tint.set(on)
              persist()
              setAccentOverride(on ? PHASE_ACCENT[phase.get()] : null)
            }
          })
        ])

        const chatSection = section('comment-discussion', 'Chat', [
          jsx(ToggleRow, {
            checked: isMargins,
            description: 'A narrower reading column with wide margins, lined up with the message box.',
            label: 'Spacious margins',
            onChange: on => {
              margins.set(on)
              persist()
              applyMarginsAndMark(on)
            }
          }),
          jsx(ToggleRow, {
            checked: isCollapseWork,
            description: 'When a reply finishes, fold its thinking and tool steps into one line with the time it took. Click the line to open the steps.',
            label: 'Fold finished work',
            onChange: on => {
              collapseWork.set(on)
              persist()
              applyCollapseWork(on)
            }
          }),
          jsx(ToggleRow, {
            checked: isMotion,
            description: 'Short fades and slides on menus, the history list, the composer, message actions and opening the folded work. Off makes every interaction instant. Also follows your system\'s reduced-motion setting.',
            label: 'App animations',
            onChange: on => {
              motion.set(on)
              persist()
              applyMotion(on)
            }
          }),
          jsx(ToggleRow, {
            checked: isStatusDock,
            description: 'In Simple mode, the status bar (model, context, agents, radio) becomes a card at the foot of the sessions sidebar. It opens when there is room for at least six sessions, and a click on its header opens or closes it. With the sidebar hidden it sits behind a tab on the left edge. Advanced mode keeps the bar at the bottom.',
            label: 'Status panel in Simple mode',
            onChange: on => {
              statusDock.set(on)
              persist()
              // put Simple back as it was: hide the bar we revealed
              if (!on && dock.pressed && interfaceMode() === 'simple' && document.querySelector("footer[data-slot='statusbar']")) {
                pressStatusbarKeybind()
                dock.pressed = false
              }
              syncStatusDock()
            }
          })
        ])

        const pinSection = section('bookmark', list.length ? `Snippets (${list.length})` : 'Snippets', [
          jsx(ToggleRow, {
            checked: isLibrary,
            description: 'Your snippet library: a Snippets card in the sessions sidebar that holds every snippet you pin. Click one to preview it, copy it or attach it to the chat; drag one onto the new-chat Shelf; drag it off the card to unpin it.',
            label: 'Snippet library',
            onChange: on => {
              library.set(on)
              persist()
              lib.key = ''
              layoutLibrary()
            }
          }),
          ...list.map(entry =>
            jsx(ListRow, {
              description: [entry.value, entry.note].filter(Boolean).join(' — '),
              title: entry.title || entry.value || 'snippet',
              action: jsx(Button, {
                size: 'sm',
                variant: 'ghost',
                onClick: () => unpinSnip(entry.id),
                children: 'Unpin'
              })
            })
          ),
          list.length > 1
            ? jsx('div', {
                className: 'flex justify-end pt-1',
                children: jsx(Button, {
                  size: 'sm',
                  variant: 'ghost',
                  onClick: () => { pins.set([]); persist(); onPinsChanged() },
                  children: 'Unpin all'
                })
              })
            : null
        ])

        return jsxs('div', { children: [header, skySection, skinSection, lightSection, chatSection, pinSection].filter(Boolean) })
      }
    })

    // A plugin is a guest: leave the host as we found it when it unloads.
    ctx.onDispose?.(() => {
      themeObs?.disconnect()
      clearInterval(configTimer)
      clearInterval(timer)
      clearInterval(weatherTimer)
      clearInterval(flareTimer)
      clearInterval(dockTimer)
      iconStyle?.remove()
      if (typeof document !== 'undefined') { document.removeEventListener('keydown', onDockKey); document.removeEventListener('pointerdown', onRowPointerDown, true); endPinDrag(); undock(); dock.ro?.disconnect(); dock.popObs?.disconnect(); document.querySelectorAll(`[${DOCK_POP_ATTR}]`).forEach(el => el.removeAttribute(DOCK_POP_ATTR)); dock.tab?.remove(); dock.head?.remove(); dock.style?.remove(); document.getElementById('zephyr-snippet-style')?.remove(); document.getElementById('zephyr-motion-style')?.remove(); closePreview(); unlib(); lib.el?.remove(); SHELF_SLOTS.forEach(sl => shelfEls[sl]?.remove()); shelf$.ro?.disconnect(); try { pinsUnsub?.() } catch {}; document.documentElement.removeAttribute('data-zf-dragging') }
      clearInterval(liveTimer)
      colObs?.disconnect()
      if (typeof document !== 'undefined') unfitColumn()
      flareStyle?.remove()
      document.querySelector?.(`[${STACK_FLARE_ATTR}]`)?.removeAttribute(STACK_FLARE_ATTR)
      dropGl()
      clearSky()
      setAccentOverride(null)
      unpinWordmark()
      if (typeof window !== 'undefined') window.removeEventListener?.('resize', onResize)
      if (workThrottle) clearTimeout(workThrottle)
      if (workFrame) cancelAnimationFrame?.(workFrame)
      if (typeof document !== 'undefined' && document.documentElement) {
        document.documentElement.style.removeProperty('--zephyr-sun')
        if (document.documentElement.dataset) {
          delete document.documentElement.dataset.zephyrMargins
          delete document.documentElement.dataset.zephyrCollapseWork
          delete document.documentElement.dataset.zephyrMotion
        }
        document.querySelectorAll?.('.zephyr-work-summary').forEach(el => el.remove?.())
        document.querySelectorAll?.('[data-zephyr-work-collapsed]').forEach(el => el.removeAttribute?.('data-zephyr-work-collapsed'))
        document.querySelectorAll?.('[data-zephyr-work-interim]').forEach(el => el.removeAttribute?.('data-zephyr-work-interim'))
        document.removeEventListener?.('click', onDocClick, true)
        document.removeEventListener?.('scroll', onAnyScroll, { capture: true })
        if (scrollIdleTimer) clearTimeout(scrollIdleTimer)
        scrollIdleTimer = 0
        document.documentElement?.removeAttribute?.('data-zf-scrolling')
      }
      if (typeof window !== 'undefined') {
        window.removeEventListener?.('popstate', onNavChange)
        window.removeEventListener?.('hashchange', onNavChange)
      }
      if (chatObserver) chatObserver.disconnect()
    })
  }
}
