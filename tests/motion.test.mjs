import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, writeFileSync, rmSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))
const pluginPath = join(here, '..', 'plugin.js')
const pluginSource = readFileSync(pluginPath, 'utf8')
const tmpFile = join(here, '.tmp-motion-probe.mjs')
writeFileSync(tmpFile, pluginSource)
// a failing run must not leave the probe behind
process.on('exit', () => rmSync(tmpFile, { force: true }))

globalThis.fetch = async () => ({ ok: false })

let timerSeq = 0
globalThis.setTimeout = () => ++timerSeq
globalThis.clearTimeout = () => {}
globalThis.setInterval = () => ++timerSeq
globalThis.clearInterval = () => {}

const makeElement = (tag, head, body) => ({
  tagName: tag,
  id: '',
  className: '',
  textContent: '',
  children: [],
  attrs: {},
  dataset: {},
  isConnected: true,
  offsetWidth: 0,
  style: {
    cssText: '',
    setProperty(key, value) { this[key] = value },
    removeProperty(key) { delete this[key] }
  },
  classList: { add() {}, remove() {}, toggle() {}, contains: () => false },
  setAttribute(key, value) { this.attrs[key] = value },
  getAttribute(key) { return key in this.attrs ? this.attrs[key] : null },
  hasAttribute(key) { return key in this.attrs },
  removeAttribute(key) { delete this.attrs[key] },
  appendChild(child) { this.children.push(child); return child },
  append(...children) { this.children.push(...children) },
  prepend(...children) { this.children.unshift(...children) },
  removeChild(child) { this.children = this.children.filter(item => item !== child) },
  remove() { head.delete(this.id); body.delete(this.id); this.isConnected = false },
  contains: () => false,
  querySelector: () => null,
  querySelectorAll: () => [],
  closest: () => null,
  addEventListener: () => {},
  removeEventListener: () => {},
  getBoundingClientRect: () => ({ left: 0, top: 0, right: 0, bottom: 0, width: 0, height: 0 }),
  getContext(kind) {
    if (kind === 'webgl' || kind === 'experimental-webgl') return null
    return { drawImage: () => {}, clearRect: () => {}, getImageData: () => ({ data: [] }), putImageData: () => {} }
  }
})

const installDom = () => {
  const head = new Map()
  const body = new Map()
  const documentElement = {
    style: { setProperty: () => {}, removeProperty: () => {} },
    dataset: {},
    attrs: {},
    setAttribute(key, value) { this.attrs[key] = value },
    getAttribute(key) { return key in this.attrs ? this.attrs[key] : null },
    hasAttribute(key) { return key in this.attrs },
    removeAttribute(key) { delete this.attrs[key] }
  }
  globalThis.document = {
    hidden: false,
    documentElement,
    createElement: tag => makeElement(tag, head, body),
    getElementById: id => head.get(id) || body.get(id) || null,
    querySelector: () => null,
    querySelectorAll: () => [],
    addEventListener: () => {},
    removeEventListener: () => {},
    head: { appendChild: el => { if (el.id) head.set(el.id, el); return el }, removeChild: el => head.delete(el.id) },
    body: { appendChild: el => { if (el.id) body.set(el.id, el); return el }, removeChild: el => body.delete(el.id) }
  }
  globalThis.window = {
    innerWidth: 1512,
    innerHeight: 945,
    devicePixelRatio: 2,
    matchMedia: () => ({ matches: false, addEventListener: () => {}, removeEventListener: () => {} }),
    addEventListener: () => {},
    removeEventListener: () => {},
    requestAnimationFrame: () => 0,
    cancelAnimationFrame: () => {},
    getComputedStyle: () => ({ getPropertyValue: () => '', fontSize: '16px' })
  }
  globalThis.getComputedStyle = globalThis.window.getComputedStyle
  globalThis.matchMedia = globalThis.window.matchMedia
  globalThis.requestAnimationFrame = globalThis.window.requestAnimationFrame
  globalThis.cancelAnimationFrame = globalThis.window.cancelAnimationFrame
  globalThis.addEventListener = () => {}
  globalThis.removeEventListener = () => {}
  return { head, body, documentElement }
}

let importError = null
let plugin = null
try {
  plugin = (await import('./.tmp-motion-probe.mjs')).default
} catch (error) {
  importError = error
}

const runRegister = storage => {
  const dom = installDom()
  const registered = []
  const pages = []
  const disposers = []
  let error = importError
  if (!error && plugin) {
    try {
      plugin.register({
        storage: {
          get: (key, fallback) => (key in storage ? storage[key] : fallback),
          set: (key, value) => { storage[key] = value }
        },
        register: contribution => registered.push(contribution),
        registerSettingsPage: page => pages.push(page),
        onDispose: fn => disposers.push(fn)
      })
    } catch (registerError) {
      error = registerError
    }
  }
  return {
    dom,
    registered,
    pages,
    error,
    dispose: () => disposers.forEach(fn => { try { fn() } catch {} })
  }
}

const runDefault = runRegister({})
const defaultStyleEl = runDefault.dom.head.get('zephyr-motion-style')
const defaultSheet = defaultStyleEl?.textContent || ''
const defaultKeyBefore = 'zephyrMotion' in runDefault.dom.documentElement.dataset
runDefault.dispose()
const defaultStyleRemoved = !runDefault.dom.head.has('zephyr-motion-style')
const defaultKeyAfter = 'zephyrMotion' in runDefault.dom.documentElement.dataset

const runOff = runRegister({ motion: false })
const offKeyBefore = runOff.dom.documentElement.dataset.zephyrMotion
const offStyleBefore = runOff.dom.head.has('zephyr-motion-style')
runOff.dispose()
const offStyleRemoved = !runOff.dom.head.has('zephyr-motion-style')
const offKeyAfter = 'zephyrMotion' in runOff.dom.documentElement.dataset

const runFreshDefault = runRegister({})
const freshDefaultKey = 'zephyrMotion' in runFreshDefault.dom.documentElement.dataset
runFreshDefault.dispose()

rmSync(tmpFile, { force: true })

const sheetCss = defaultSheet.replace(/\/\*[\s\S]*?\*\//g, '')

const parseCss = css => {
  const roots = []
  const stack = []
  let textStart = 0
  for (let index = 0; index < css.length; index++) {
    const char = css[index]
    if (char === '{') {
      const node = { selector: css.slice(textStart, index).trim(), body: '', bodyStart: index + 1, children: [] }
      if (stack.length) stack[stack.length - 1].children.push(node)
      else roots.push(node)
      stack.push(node)
      textStart = index + 1
    } else if (char === '}') {
      const node = stack.pop()
      if (node) node.body = css.slice(node.bodyStart, index)
      textStart = index + 1
    }
  }
  return roots
}
const flattenRules = rules => rules.flatMap(rule => [rule, ...flattenRules(rule.children)])
const flat = flattenRules(parseCss(sheetCss))

const splitTopLevel = value => {
  const parts = []
  let depth = 0
  let current = ''
  for (const char of value) {
    if (char === '(') depth++
    else if (char === ')') depth = Math.max(0, depth - 1)
    if (char === ',' && depth === 0) { parts.push(current.trim()); current = ''; continue }
    current += char
  }
  parts.push(current.trim())
  return parts.filter(Boolean)
}

const TOKENS = [['--zf-t-1', 140], ['--zf-t-2', 200], ['--zf-t-3', 280]]
const ALLOWED = new Set(['opacity', 'transform', 'display', 'color', 'background-color', 'border-color', 'box-shadow', 'outline-color', 'scale', 'translate'])
const escapeRegExp = value => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
const tokenMsFrom = (text, token) => {
  const match = text.match(new RegExp(escapeRegExp(token) + ':\\s*([\\d.]+)ms'))
  return match ? Number(match[1]) : null
}
const registerMessage = run => run.error ? `\nregister() threw:\n${run.error.stack || run.error.message}` : ''

test('the always-on sheet defines the three duration tokens and both off-switches', () => {
  assert.ok(!importError, `plugin.js should import through the tests/node_modules shims:${importError ? '\n' + (importError.stack || importError.message) : ''}`)
  assert.ok(plugin, 'plugin.js should export a default plugin')
  assert.ok(!runDefault.error, `register() should run against the rig${registerMessage(runDefault)}`)
  assert.ok(defaultStyleEl, "register() should append <style id='zephyr-motion-style'> to document.head")
  assert.ok(defaultSheet.trim().length > 0, 'the motion sheet should not be empty')
  const root = flat.find(rule => rule.selector === ':root')
  assert.ok(root, 'the motion sheet should define :root tokens')
  for (const [token, ms] of TOKENS) {
    const value = tokenMsFrom(root.body, token)
    assert.equal(value, ms, `:root should define ${token}: ${ms}ms; got ${value}ms from:\n${root.body}`)
  }
  const offGate = flat.find(rule => /html\[data-zephyr-motion=['"]off['"]\]/.test(rule.selector))
  assert.ok(offGate, "the sheet should carry the html[data-zephyr-motion='off'] gate")
  for (const [token] of TOKENS) {
    const value = tokenMsFrom(offGate.body, token)
    assert.ok(value !== null && value <= 1, `the Motion-off gate should collapse ${token} to at most 1ms; got ${value}`)
  }
  const reducedBlocks = flat.filter(rule => rule.selector.startsWith('@media') && /prefers-reduced-motion/.test(rule.selector))
  assert.ok(reducedBlocks.length > 0, 'the sheet should carry an @media (prefers-reduced-motion: reduce) block')
  const zeroes = reducedBlocks.find(rule =>
    TOKENS.every(([token]) => {
      const value = tokenMsFrom(rule.body, token)
      return value !== null && value <= 1
    }))
  assert.ok(zeroes, 'the reduced-motion block should collapse all three tokens to at most 1ms; got:\n' + reducedBlocks.map(rule => rule.body).join('\n---\n'))
})

test('the work fold is a pure opacity dissolve with token durations', () => {
  const foldRules = flat.filter(rule => rule.selector.includes('data-zephyr-work-collapsed'))
  assert.ok(foldRules.length > 0, 'the fold family (selectors containing data-zephyr-work-collapsed) should be in the sheet')
  const collapsed = foldRules.find(rule =>
    /pointer-events:\s*none/.test(rule.body) && /transition-duration:\s*var\(--zf-t-1\)/.test(rule.body))
  assert.ok(collapsed, 'the collapsed fold rule should carry pointer-events: none and transition-duration: var(--zf-t-1); got:\n' + foldRules.map(rule => rule.selector).join('\n'))
  const drifted = foldRules.filter(rule => /translateY/.test(rule.selector + rule.body))
  assert.deepEqual(drifted.map(rule => rule.selector), [], 'no work-fold rule may use translateY (the fold is a pure dissolve)')
  const base = flat.find(rule => /aui_assistant-message-content/.test(rule.selector) && /transition:\s*opacity var\(--zf-t-3\)/.test(rule.body))
  assert.ok(base, 'the base fold transition should fade opacity over var(--zf-t-3); got:\n' + flat.filter(rule => /aui_assistant-message-content/.test(rule.selector)).map(rule => rule.selector).join('\n'))
  assert.match(base.body, /display\s+var\(--zf-t-3\)\s+allow-discrete/, 'the base fold should pass display through allow-discrete at var(--zf-t-3)')
  const starting = flat.find(rule => rule.selector.trim() === '@starting-style')
  assert.ok(starting, '@starting-style should declare the fold reveal from-state')
  assert.match(starting.body, /opacity:\s*0/, '@starting-style should pin the reveal from-state (opacity: 0)')
})

test('the work summary is hosted by the first part, above the whole turn', () => {
  // A turn is several aui_assistant-message-root parts (one per model step).
  // A single summary tile must be hosted by the FIRST part, inserted at the
  // top of its content: hosting it in the owner (the last work part) renders
  // it mid-turn, with every earlier part's steps above it.
  assert.match(pluginSource, /const host = info\.find\(/, 'the fold should pick a host part for the tile')
  assert.match(pluginSource, /host\.content\.insertBefore\(toggle, host\.content\.firstChild\)/, 'the tile should be inserted at the top of the host content')
  assert.ok(!/owner\.content\.insertBefore/.test(pluginSource), 'the tile must not be hosted by the owner (the last work part): that puts it mid-turn')
})

test('a background delivery starts a new response chain, so a late update cannot fold the earlier reply', () => {
  // A finished process (aui_background-result, a scaffold row) is folded into
  // the same response group and the model's answer to it becomes a later
  // assistant root. Interim marking must anchor within each chain: a
  // group-wide anchor marks the earlier reply as chatter, and the collapsed
  // fold hides the actual response behind the update.
  assert.match(pluginSource, /const chainsOf = \(container, parts\)/, 'the fold should split the group into response chains')
  assert.match(pluginSource, /\[data-slot='aui_background-result'\]/, 'chains should split at background deliveries')
  assert.match(pluginSource, /for \(const chain of chainsOf\(container, parts\)\)/, 'interim marking should run per response chain')
  assert.ok(!/container\.querySelectorAll\?\.\(WORK_MARKERS\)/.test(pluginSource), 'the interim anchor must not span the whole group: a late delivery would fold the reply above it')
})

test('an idle status row is not work and cannot fold the reply above it', () => {
  // A settled turn keeps its status row mounted as the tail of its content
  // (empty, sr-only, data-state='idle') so its live region survives a flip.
  // Anchoring on it would mark the reply above as chatter, and the collapsed
  // fold would hide the reply until the row unmounts on the next turn.
  assert.match(pluginSource, /const lastWorkBlockOf = chain =>/, 'the interim anchor should come from lastWorkBlockOf')
  assert.match(pluginSource, /'aui_turn-activity' && el\.getAttribute\?\.\('data-state'\) === 'idle'/, 'an idle status row should be skipped when picking the anchor')
})

test('the old chat slide is gone from the sheet and the source', () => {
  assert.ok(!flat.some(rule => rule.selector === '.zephyr-chat-slide'), '.zephyr-chat-slide should no longer exist (the session-switch fade replaces it)')
  assert.ok(!/zephyr-chat-slide|zephyr-chat-enter/.test(pluginSource), 'no chat-slide leftovers anywhere in plugin.js')
})

test('the session switch fades the transcript while core flags the surface', () => {
  const viewportRule = flat.find(rule =>
    /\[data-chat-surface\]/.test(rule.selector) &&
    !/\[data-session-switching\]/.test(rule.selector) &&
    (/\[data-slot=['"]aui_thread-viewport['"]\]/.test(rule.selector) || /\[data-slot=['"]thread['"]\]/.test(rule.selector)))
  assert.ok(viewportRule, 'the sheet should target the thread viewport on [data-chat-surface]')
  assert.match(viewportRule.body, /transition:\s*opacity\s+var\(--zf-t-2\)/, `the transcript should fade over var(--zf-t-2); got:\n${viewportRule.body}`)
  const switchingRule = flat.find(rule => /\[data-chat-surface\]\[data-session-switching\]/.test(rule.selector))
  assert.ok(switchingRule, 'the sheet should carry a [data-chat-surface][data-session-switching] rule')
  assert.match(switchingRule.body, /opacity:\s*0(?:[;}\s]|$)/, `switching should hide the transcript; got:\n${switchingRule.body}`)
  assert.match(switchingRule.body, /transition:\s*none/, `switching should not animate the held fade; got:\n${switchingRule.body}`)
})

test('the settle curtain hides the transcript without animating', () => {
  const settlingRule = flat.find(rule => /\[data-chat-surface\]\[data-zephyr-settling\]/.test(rule.selector))
  assert.ok(settlingRule, 'the sheet should carry a [data-chat-surface][data-zephyr-settling] rule')
  assert.match(settlingRule.selector, /\[data-slot=['"]aui_thread-viewport['"]\]/, `the settle curtain should target the thread viewport; got:\n${settlingRule.selector}`)
  assert.match(settlingRule.selector, /\[data-slot=['"]thread['"]\]/, `the settle curtain should target the thread; got:\n${settlingRule.selector}`)
  assert.match(settlingRule.body, /opacity:\s*0(?:[;}\s]|$)/, `settling should hide the transcript; got:\n${settlingRule.body}`)
  assert.match(settlingRule.body, /transition:\s*none/, `settling should not animate the held hide; got:\n${settlingRule.body}`)
})

test('menus, selects and dialogs animate through direction-aware keyframes', () => {
  assert.ok(flat.some(rule => /\[data-state=['"]open['"]\]/.test(rule.selector)), "[data-state='open'] rules should exist")
  assert.ok(flat.some(rule => /\[data-state=['"]closed['"]\]/.test(rule.selector)), "[data-state='closed'] rules should exist")
  for (const name of ['zf-pop-in', 'zf-pop-out']) {
    assert.ok(flat.some(rule => rule.selector === `@keyframes ${name}`), `@keyframes ${name} should exist`)
  }
  // Each side must displace the surface TOWARD its trigger and settle away:
  // content below the trigger starts above resting position, and so on.
  const sideShift = { top: ['--zf-pop-dy', '6px'], bottom: ['--zf-pop-dy', '-6px'], left: ['--zf-pop-dx', '6px'], right: ['--zf-pop-dx', '-6px'] }
  for (const [side, [variable, value]] of Object.entries(sideShift)) {
    const sideRule = flat.find(rule => new RegExp(`\\[data-side=['"]${side}['"]\\]`).test(rule.selector))
    assert.ok(sideRule, `the [data-side='${side}'] rule should exist`)
    assert.match(sideRule.body, new RegExp(`${variable}:\\s*${value.replace('-', '\\-')}`), `[data-side='${side}'] should set ${variable}: ${value}; got:\n${sideRule.body}`)
  }
  for (const name of ['zf-pop-in', 'zf-pop-out']) {
    const keyframes = flat.find(rule => rule.selector === `@keyframes ${name}`)
    assert.match(keyframes.body, /scale\(0\.97\)/, `@keyframes ${name} should settle at scale(0.97); got:\n${keyframes.body}`)
  }
})

test('every animated floating surface has a real exit', () => {
  const closedRules = flat.filter(rule => /\[data-state=['"]closed['"]\]/.test(rule.selector))
  const fragments = [
    'dropdown-menu-content',
    'dropdown-menu-sub-content',
    'context-menu-content',
    'context-menu-sub-content',
    'popover-content',
    'select-content',
    'menubar-content',
    'dialog-content',
    'alert-dialog-content',
    'sheet-content',
    'dialog-overlay',
    'alert-dialog-overlay',
    'sheet-overlay',
    'tooltip-content',
    'hover-card-content'
  ]
  for (const fragment of fragments) {
    const rule = closedRules.find(candidate => candidate.selector.includes(fragment))
    assert.ok(rule, `closed ${fragment} should have an exit rule; got:\n${closedRules.map(candidate => candidate.selector).join('\n')}`)
    assert.match(rule.body, /animation:\s*[^;]*var\(--zf-t-1\)/, `closed ${fragment} should exit with an animation over var(--zf-t-1); got:\n${rule.body}`)
    // Radix Presence only holds the node for animationend, and a fading
    // surface must not take clicks meant for what is beneath it.
    assert.match(rule.body, /pointer-events:\s*none/, `closed ${fragment} should carry pointer-events: none; got:\n${rule.body}`)
  }
})

test('exit ghosts replay the exits from a fixed, inert clone', () => {
  const base = flat.find(rule => rule.selector.trim() === '.zf-ghost')
  assert.ok(base, 'the sheet should define a .zf-ghost base rule')
  assert.match(base.body, /position:\s*fixed/, `.zf-ghost should be position: fixed; got:\n${base.body}`)
  assert.match(base.body, /pointer-events:\s*none/, `.zf-ghost should be pointer-events: none; got:\n${base.body}`)
  const groups = [
    ['zf-pop-out', ['dropdown-menu-content', 'dropdown-menu-sub-content', 'context-menu-content', 'context-menu-sub-content', 'popover-content', 'select-content', 'menubar-content']],
    ['zf-dlg-out', ['dialog-content', 'alert-dialog-content', 'sheet-content']],
    ['zf-tip-out', ['tooltip-content', 'hover-card-content']]
  ]
  for (const [keyframes, slots] of groups) {
    const rule = flat.find(candidate => slots.every(slot => candidate.selector.includes(`.zf-ghost[data-slot='${slot}']`)))
    assert.ok(rule, `the ghost group for ${slots.join(', ')} should exist; got:\n${flat.filter(candidate => candidate.selector.includes('.zf-ghost')).map(candidate => candidate.selector).join('\n')}`)
    assert.match(rule.body, new RegExp(`animation:\\s*${escapeRegExp(keyframes)}\\s+var\\(--zf-t-1\\)\\s+var\\(--zf-ease\\)\\s+both`), `the ghost group for ${slots.join(', ')} should replay @keyframes ${keyframes} over var(--zf-t-1); got:\n${rule.body}`)
  }
  const overlay = flat.find(rule => /\.zf-ghost\[data-slot\$\s*=\s*['"]-overlay['"]\]/.test(rule.selector))
  assert.ok(overlay, "the ghost rule for .zf-ghost[data-slot$='-overlay'] should exist")
  assert.match(overlay.body, /animation:\s*zf-ovl-out\s+var\(--zf-t-1\)\s+var\(--zf-ease\)\s+both/, `the overlay ghost should replay @keyframes zf-ovl-out over var(--zf-t-1); got:\n${overlay.body}`)
})

test('history/composer/tools markers are comments over real transitions', () => {
  for (const marker of ['motion:history', 'motion:composer', 'motion:tools']) {
    const line = new RegExp('//[^\\n]*\\[' + escapeRegExp(marker) + '\\]')
    const block = new RegExp('/\\*[^*]*\\[' + escapeRegExp(marker) + '\\][^*]*\\*/')
    assert.ok(line.test(pluginSource) || block.test(pluginSource), `plugin.js should carry [${marker}] as a comment`)
  }
  const start = pluginSource.indexOf('const MOTION_CSS')
  const end = pluginSource.indexOf('].join', start)
  assert.ok(start >= 0 && end > start, 'plugin.js should define the MOTION_CSS array')
  const motionSource = pluginSource.slice(start, end)
  const markers = ['motion:menus', 'motion:switch', 'motion:ghosts', 'motion:history', 'motion:composer', 'motion:tools']
  const placed = markers.map(marker => ({ marker, at: motionSource.indexOf(`[${marker}]`) }))
  for (const entry of placed) assert.ok(entry.at >= 0, `MOTION_CSS should carry the [${entry.marker}] marker`)
  placed.sort((a, b) => a.at - b.at)
  placed.forEach((entry, index) => {
    const area = motionSource.slice(entry.at, index + 1 < placed.length ? placed[index + 1].at : motionSource.length)
    // comments must not be able to satisfy the check: an emptied area whose
    // prose happens to mention "transition:" still has to fail
    const code = area.replace(/\/\/[^\n]*/g, '')
    assert.match(code, /(?:transition|animation)\s*:/, `area [${entry.marker}] should contribute at least one transition or animation`)
  })
})

test('every motion declaration stays on the allow-list with token durations', () => {
  const offenders = []
  // curly-brace-free spelling check: var() bodies may contain anything, so
  // replace them before looking for raw timing functions
  const rawEasing = value => /(cubic-bezier\(|\b(?:linear|ease|ease-in|ease-out|ease-in-out|steps)\b)/.test(value.replace(/var\([^)]*\)/g, 'var'))
  for (const match of sheetCss.matchAll(/(?<![-\w])transition:\s*([^;]+);/gi)) {
    for (const segment of splitTopLevel(match[1])) {
      if (segment.toLowerCase() === 'none') continue
      const property = segment.split(/\s+/)[0].toLowerCase()
      if (!ALLOWED.has(property)) offenders.push(`transition property "${property}": ${segment}`)
      if (!/var\(--zf-t-[123]\)/.test(segment)) offenders.push(`transition without a --zf-t duration: ${segment}`)
      if (rawEasing(segment)) offenders.push(`transition with a raw easing: ${segment}`)
    }
  }
  for (const match of sheetCss.matchAll(/(?<![-\w])animation:\s*([^;]+);/gi)) {
    if (!/var\(--zf-t-[123]\)/.test(match[1])) offenders.push(`animation without a --zf-t duration: ${match[1]}`)
    if (rawEasing(match[1])) offenders.push(`animation with a raw easing: ${match[1]}`)
  }
  for (const match of sheetCss.matchAll(/(?<![-\w])animation-duration:\s*([^;]+);/g)) {
    if (!/var\(--zf-t-[123]\)/.test(match[1])) offenders.push(`animation-duration without a --zf-t duration: ${match[1]}`)
  }
  // longhands and delays must not be a side door around the shorthand audit
  for (const match of sheetCss.matchAll(/(?<![-\w])transition-(?:duration|delay):\s*([^;]+);/g)) {
    if (!/var\(--zf-t-[123]\)/.test(match[1])) offenders.push(`transition longhand without a --zf-t duration: ${match[1]}`)
  }
  for (const match of sheetCss.matchAll(/(?<![-\w])transition-property:\s*([^;]+);/g)) {
    for (const property of splitTopLevel(match[1])) {
      if (!ALLOWED.has(property)) offenders.push(`transition-property "${property}" is not allow-listed`)
    }
  }
  for (const keyframes of flat.filter(rule => rule.selector.startsWith('@keyframes'))) {
    for (const step of keyframes.children) {
      for (const match of step.body.matchAll(/([a-z-]+)\s*:/g)) {
        if (!ALLOWED.has(match[1])) offenders.push(`${keyframes.selector} animates "${match[1]}"`)
      }
    }
  }
  assert.deepEqual(offenders, [], 'motion may only touch the allow-listed properties with token durations')
  const rawTimes = []
  for (const line of sheetCss.split('\n')) {
    if (!/(?<![\w-])\d+(?:\.\d+)?(?:ms|s)(?![\w-])/i.test(line)) continue
    if (/^\s*--zf-t-[123]:\s*[\d.]+ms;?\s*$/.test(line)) continue
    rawTimes.push(line.trim())
  }
  assert.deepEqual(rawTimes, [], 'time literals may only appear on the :root token lines and the off-gates')
})

test('the Motion setting toggles the root attribute and dispose cleans up', () => {
  assert.ok(!runDefault.error, `register() should run against the rig${registerMessage(runDefault)}`)
  assert.equal(defaultKeyBefore, false, 'with default storage the zephyrMotion key should be absent')
  assert.ok(defaultStyleEl, 'the default run should mount the motion style element')
  assert.equal(defaultStyleRemoved, true, 'dispose should remove the motion style element')
  assert.equal(defaultKeyAfter, false, 'dispose should leave no zephyrMotion key behind')

  assert.ok(!runOff.error, `register() with motion: false should run${registerMessage(runOff)}`)
  assert.equal(offStyleBefore, true, 'the motion-off run should still mount the motion style element')
  assert.equal(offKeyBefore, 'off', "with motion: false the root should carry data-zephyr-motion='off'")
  runOff.dispose()
  assert.equal(offStyleRemoved, true, 'dispose should remove the motion style element')
  assert.equal(offKeyAfter, false, 'dispose should clear the data-zephyr-motion attribute')

  assert.ok(!runFreshDefault.error, `the fresh default register() should run${registerMessage(runFreshDefault)}`)
  assert.equal(freshDefaultKey, false, 'a fresh register with default storage should leave the key absent')
})
