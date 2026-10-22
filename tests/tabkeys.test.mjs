// Cmd+Option+Left/Right: which tab is next, what is ignored. The handler is cut
// out of plugin.js and run against a small stand-in for the page.
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const src = readFileSync(new URL('../plugin.js', import.meta.url), 'utf8')
const from = src.indexOf('const sessionTabs = () =>')
const to = src.indexOf("window.addEventListener('keydown', onTabChord, true)")
assert.ok(from > 0 && to > from, 'tab key handler not found in plugin.js')
const body = src.slice(from, to)

const stripEls = {}
const stripEl = id => (stripEls[id] ||= { id, getBoundingClientRect: () => rect(id === 'a' ? 0 : 400, 300) })
const rect = (left, width = 100) => ({ left, right: left + width, top: 0, width, height: 28 })
const makeTab = (id, { selected = false, slot = 'context-menu-trigger', hidden = false, arc = false, strip = 'a', left = 0 } = {}) => {
  const events = []
  const tab = {
    dataset: { treeTab: id, slot },
    events,
    sel: selected,
    getAttribute: name => (name === 'aria-selected' ? String(tab.sel) : null),
    getClientRects: () => (hidden ? [] : [{}]),
    getBoundingClientRect: () => rect(left),
    closest: q => {
      if (q === '[data-zf-arc-col]') return arc ? {} : null
      if (q === "[role='tablist']") return stripEl(strip)
      return null
    },
    parentElement: stripEl(strip),
    dispatchEvent: e => { events.push(e.type); if (e.type === 'pointerup') { for (const t of tab.all) t.sel = t === tab } },
    scrollIntoView: () => {}
  }
  return tab
}
const setup = tabs => {
  tabs.forEach(t => { t.all = tabs })
  const listeners = []
  const g = {
    document: { querySelectorAll: () => tabs, activeElement: null, body: {} },
    window: { addEventListener: () => {} },
    PointerEvent: class { constructor(type) { this.type = type } }
  }
  const make = new Function('document', 'window', 'PointerEvent', 'ctx', `${body}; return onTabChord`)
  const registered = []
  const handler = make(g.document, g.window, g.PointerEvent, { register: r => registered.push(r) })
  const press = (key, mods = { metaKey: true, altKey: true }) => {
    const e = { key, metaKey: false, altKey: false, ctrlKey: false, shiftKey: false, isComposing: false, ...mods,
      prevented: false, stopped: false, preventDefault() { this.prevented = true }, stopImmediatePropagation() { this.stopped = true } }
    handler(e)
    return e
  }
  return { press, registered, selected: () => tabs.filter(t => t.sel).map(t => t.dataset.treeTab) }
}

test('right and left step to the neighbour and wrap at the ends', () => {
  const tabs = [makeTab('workspace', { selected: true }), makeTab('s1'), makeTab('s2')]
  const { press, selected } = setup(tabs)
  press('ArrowRight'); assert.deepEqual(selected(), ['s1'])
  press('ArrowRight'); press('ArrowRight'); assert.deepEqual(selected(), ['workspace'])
  press('ArrowLeft'); assert.deepEqual(selected(), ['s2'])
})
test('the chord is consumed only when a tab was switched', () => {
  const { press } = setup([makeTab('workspace', { selected: true }), makeTab('s1')])
  const e = press('ArrowRight')
  assert.equal(e.prevented && e.stopped, true)
  const one = setup([makeTab('workspace', { selected: true })]).press('ArrowRight')
  assert.equal(one.prevented || one.stopped, false)
})
test('a tab is selected by pointer down and up', () => {
  const tabs = [makeTab('workspace', { selected: true }), makeTab('s1')]
  setup(tabs).press('ArrowRight')
  assert.deepEqual(tabs[1].events, ['pointerdown', 'pointerup'])
})
test('pane tabs, sidebar copies and hidden tabs are skipped', () => {
  const tabs = [makeTab('sessions', { slot: 'pane-tab' }), makeTab('in-arc', { arc: true }), makeTab('workspace', { selected: true }),
    makeTab('hidden', { hidden: true }), makeTab('s1')]
  const { press, selected } = setup(tabs)
  press('ArrowRight'); assert.deepEqual(selected(), ['s1'])
  press('ArrowRight'); assert.deepEqual(selected(), ['workspace'])
})
test('other chords are left alone', () => {
  const tabs = [makeTab('workspace', { selected: true }), makeTab('s1')]
  const { press, selected } = setup(tabs)
  for (const mods of [{ altKey: true }, { metaKey: true }, { metaKey: true, altKey: true, shiftKey: true }, { metaKey: true, altKey: true, ctrlKey: true }]) {
    assert.equal(press('ArrowRight', mods).prevented, false)
  }
  assert.equal(press('ArrowUp').prevented, false)
  assert.deepEqual(selected(), ['workspace'])
})
test('with a split it steps the strip under the focused element', () => {
  const tabs = [makeTab('a1', { selected: true, strip: 'a' }), makeTab('a2', { strip: 'a' }),
    makeTab('b1', { selected: true, strip: 'b', left: 400 }), makeTab('b2', { strip: 'b', left: 500 })]
  tabs.forEach(t => { t.all = tabs })
  const doc = { querySelectorAll: () => tabs, body: {}, activeElement: { getBoundingClientRect: () => rect(450, 40) } }
  const make = new Function('document', 'window', 'PointerEvent', 'ctx', `${body}; return onTabChord`)
  const handler = make(doc, {}, class { constructor(type) { this.type = type } }, { register() {} })
  // each pane keeps its own selected tab, so only compare within the strip
  tabs.forEach(t => { t.dispatchEvent = e => { if (e.type === 'pointerup') for (const o of tabs.filter(x => x.closest("[role='tablist']").id === t.closest("[role='tablist']").id)) o.sel = o === t } })
  handler({ key: 'ArrowRight', metaKey: true, altKey: true, ctrlKey: false, shiftKey: false, preventDefault() {}, stopImmediatePropagation() {} })
  assert.deepEqual(tabs.filter(t => t.sel).map(t => t.dataset.treeTab).sort(), ['a1', 'b2'])
})

test('the same step is registered as two rebindable keybinds', () => {
  const tabs = [makeTab('workspace', { selected: true }), makeTab('s1'), makeTab('s2')]
  const { registered, selected } = setup(tabs)
  const byId = Object.fromEntries(registered.map(r => [r.id, r.data]))
  assert.deepEqual(byId['zephyr.tabNext'].defaults, ['mod+alt+right'])
  assert.deepEqual(byId['zephyr.tabPrev'].defaults, ['mod+alt+left'])
  byId['zephyr.tabNext'].run(); assert.deepEqual(selected(), ['s1'])
  byId['zephyr.tabPrev'].run(); byId['zephyr.tabPrev'].run(); assert.deepEqual(selected(), ['s2'])
})
test('the fallback stands down right after the keybind fired', () => {
  const tabs = [makeTab('workspace', { selected: true }), makeTab('s1'), makeTab('s2')]
  const { registered, press, selected } = setup(tabs)
  registered.find(r => r.id === 'zephyr.tabNext').data.run()
  press('ArrowRight')
  assert.deepEqual(selected(), ['s1'])
})
