import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))
const src = readFileSync(join(here, '..', 'plugin.js'), 'utf8').replace(/\r\n/g, '\n')

// Minimal DOM harness that supports attribute/dataset/selector queries used by
// the work summary, ambient agent-state lighting, and focus mode controllers.
const makeMockDom = () => {
  const head = new Map()
  const body = new Map()
  const all = new Set()

  const matchesSel = (el, sel) => {
    for (const part of sel.split(',').map(s => s.trim()).filter(Boolean)) {
      if (part === '*') return true
      let rest = part
      if (rest.startsWith('html')) rest = rest.slice(4)
      if (/^[a-zA-Z0-9_-]+/.test(rest)) {
        const tag = rest.match(/^[a-zA-Z0-9_-]+/)[0]
        if (el.tagName.toLowerCase() !== tag.toLowerCase()) continue
        rest = rest.slice(tag.length)
      }
      let ok = true
      for (const m of rest.matchAll(/\.([a-zA-Z0-9_-]+)/g)) {
        if (!String(el.className || '').split(/\s+/).includes(m[1])) { ok = false; break }
      }
      if (!ok) continue
      for (const m of rest.matchAll(/#([a-zA-Z0-9_-]+)/g)) {
        if (el.id !== m[1]) { ok = false; break }
      }
      if (!ok) continue
      for (const m of rest.matchAll(/\[([^\]=]+)(?:=['"]([^'"]*)['"])?\]/g)) {
        const attr = m[1], val = m[2]
        const cur = el.getAttribute(attr)
        if (val === undefined) { if (cur === null) { ok = false; break } }
        else if (cur !== val) { ok = false; break }
      }
      if (ok) return true
    }
    return false
  }

  const walk = (root, pred, out = []) => {
    for (const c of root.children || []) {
      if (pred(c)) out.push(c)
      walk(c, pred, out)
    }
    return out
  }

  const makeEl = (tag = 'div', attrs = {}, text = '') => {
    const el = {
      tagName: tag.toUpperCase(),
      id: attrs.id || '',
      className: attrs.class || '',
      textContent: text,
      _html: '',
      get innerHTML() { return this._html },
      set innerHTML(v) {
        this._html = String(v)
        this.children = []
        for (const m of this._html.matchAll(/<span class="([^"]+)"[^>]*>/g)) {
          const child = makeEl('span', { class: m[1] })
          child.parentElement = this
          this.children.push(child)
        }
      },
      title: '',
      type: '',
      children: [],
      parentElement: null,
      isConnected: true,
      attrs: { ...attrs },
      dataset: {},
      listeners: new Map(),
      style: {
        setProperty(k, v) { this[k] = v },
        removeProperty(k) { delete this[k] }
      },
      classList: {
        add() {}, remove() {}, toggle() {},
        contains: c => String(el.className || '').split(/\s+/).includes(c)
      },
      setAttribute(k, v) {
        this.attrs[k] = String(v)
        if (k === 'id') this.id = String(v)
        if (k === 'class') this.className = String(v)
        if (k.startsWith('data-')) {
          const camel = k.slice(5).replace(/-([a-z])/g, (_, ch) => ch.toUpperCase())
          this.dataset[camel] = String(v)
        }
      },
      getAttribute(k) { return k in this.attrs ? this.attrs[k] : null },
      hasAttribute(k) { return k in this.attrs },
      removeAttribute(k) {
        delete this.attrs[k]
        if (k.startsWith('data-')) {
          const camel = k.slice(5).replace(/-([a-z])/g, (_, ch) => ch.toUpperCase())
          delete this.dataset[camel]
        }
      },
      matches(sel) {
        if (sel.includes(' ')) return false
        return matchesSel(this, sel)
      },
      closest(sel) {
        for (let cur = this; cur; cur = cur.parentElement) {
          for (const part of sel.split(',').map(s => s.trim())) {
            if (!part.includes(' ') && matchesSel(cur, part)) return cur
          }
        }
        return null
      },
      querySelector(sel) { return this.querySelectorAll(sel)[0] || null },
      querySelectorAll(sel) {
        const parts = sel.split(',').map(s => s.trim()).filter(Boolean)
        return walk(this, node => parts.some(part => {
          if (part.includes(' ')) {
            const tokens = part.split(/\s+/)
            const last = tokens[tokens.length - 1]
            if (!matchesSel(node, last)) return false
            // verify ancestor chain matches remaining tokens in reverse
            let cur = node.parentElement
            for (let i = tokens.length - 2; i >= 0; i--) {
              while (cur && !matchesSel(cur, tokens[i])) cur = cur.parentElement
              if (!cur) return false
              cur = cur.parentElement
            }
            return true
          }
          return matchesSel(node, part)
        }))
      },
      appendChild(c) {
        c.parentElement = this
        this.children.push(c)
        all.add(c)
        if (this === doc.head && c.id) head.set(c.id, c)
        if (this === doc.body && c.id) body.set(c.id, c)
        return c
      },
      insertBefore(c, ref) {
        c.parentElement = this
        const idx = ref ? this.children.indexOf(ref) : -1
        if (idx >= 0) this.children.splice(idx, 0, c)
        else this.children.unshift(c)
        all.add(c)
        return c
      },
      remove() {
        if (this.parentElement) this.parentElement.children = this.parentElement.children.filter(x => x !== this)
        if (this.id) { head.delete(this.id); body.delete(this.id) }
        this.isConnected = false
      },
      addEventListener(t, fn) {
        const arr = this.listeners.get(t) || []
        arr.push(fn)
        this.listeners.set(t, arr)
      },
      removeEventListener(t, fn) {
        const arr = this.listeners.get(t) || []
        this.listeners.set(t, arr.filter(x => x !== fn))
      },
      click() {
        for (const fn of this.listeners.get('click') || []) fn({ preventDefault() {}, stopPropagation() {} })
      },
      compareDocumentPosition(other) {
        const order = walk(doc.body, () => true)
        const a = order.indexOf(this), b = order.indexOf(other)
        if (a < 0 || b < 0) return 0
        if (this.querySelectorAll('*').includes(other)) return 16 | 4
        return a < b ? 4 : 2
      },
      get firstChild() { return this.children[0] || null },
      get lastElementChild() { return this.children[this.children.length - 1] || null }
    }
    for (const [k, v] of Object.entries(attrs)) {
      if (k.startsWith('data-')) {
        const camel = k.slice(5).replace(/-([a-z])/g, (_, ch) => ch.toUpperCase())
        el.dataset[camel] = String(v)
      }
    }
    return el
  }

  const documentElement = makeEl('html')
  const headEl = makeEl('head')
  const bodyEl = makeEl('body')
  const doc = {
    hidden: false,
    documentElement,
    head: headEl,
    body: bodyEl,
    createElement: tag => makeEl(tag),
    getElementById: id => head.get(id) || body.get(id) || null,
    querySelector: sel => bodyEl.querySelector(sel),
    querySelectorAll: sel => bodyEl.querySelectorAll(sel),
    createTreeWalker(root) {
      const nodes = []
      const collect = el => {
        if (el.textContent && el.children.length === 0) nodes.push({ nodeValue: el.textContent, parentElement: el })
        for (const c of el.children) collect(c)
      }
      collect(root)
      let i = -1
      return { nextNode: () => nodes[++i] || null }
    },
    addEventListener() {},
    removeEventListener() {}
  }
  return { doc, makeEl, head, body, documentElement }
}

const slice = (from, to) => {
  const start = src.indexOf(from)
  assert.ok(start >= 0, `${from} not found`)
  const end = src.indexOf(to, start)
  assert.ok(end > start, `${to} not found after ${from}`)
  return src.slice(start, end)
}

test('work-summary timer keeps counting across gaps, approvals, multi-part steps, and new-chat hash changes', () => {
  const { doc, makeEl } = makeMockDom()
  let nowMs = 1_000_000
  const OrigDate = Date
  const FakeDate = class extends OrigDate {
    static now() { return nowMs }
  }
  const storage = {}
  const ctx = { storage: { get: (k, f) => (k in storage ? storage[k] : f), set: (k, v) => { storage[k] = v } } }
  const put = (el, name, value) => { if (el && el.getAttribute(name) !== value) el.setAttribute(name, value) }
  const putData = (el, key, value) => { if (el && el.dataset[key] !== value) el.dataset[key] = value }
  const putText = (el, value) => { if (el && el.textContent !== value) el.textContent = value }
  const WORK_ICONS = { search: '', terminal: '', file: '', tool: '' }
  const locationObj = { hash: '' }

  const workSlice = slice('// ── Work progress collapsing for finished turns', 'const scanWorkProgress = () => {')
  const rootsSlice = slice('const newestMessageRoots = () =>', 'const liveTimer = setInterval(')
  const runner = new Function(
    'document', 'window', 'location', 'Date', 'Node', 'ctx', 'put', 'putData', 'putText', 'WORK_ICONS', 'getComputedStyle', 'requestAnimationFrame',
    `const setToggleExpanded_noop = 0; ${workSlice}; ${rootsSlice}; return { processTurn, newestMessageRoots, turnTimes, savedStarts, flushAllWork }`
  )
  const { processTurn, newestMessageRoots, turnTimes, flushAllWork } = runner(
    doc, { addEventListener() {}, removeEventListener() {} }, locationObj, FakeDate, { DOCUMENT_POSITION_FOLLOWING: 4, DOCUMENT_POSITION_CONTAINED_BY: 16 },
    ctx, put, putData, putText, WORK_ICONS, () => ({ getPropertyValue: () => '140' }), fn => fn()
  )

  const thread = makeEl('div', { 'data-slot': 'aui_thread-content' })
  const pair = makeEl('div', { 'data-slot': 'aui_turn-pair' })
  const user = makeEl('div', { 'data-slot': 'aui_user-message-root' }, 'Refactor the sky grading pipeline')
  const group = makeEl('div', { 'data-slot': 'aui_response-group' })

  // Step 1: streaming with a tool scaffold
  const part1 = makeEl('div', { 'data-slot': 'aui_assistant-message-root' })
  const content1 = makeEl('div', { 'data-slot': 'aui_assistant-message-content' })
  const stream1 = makeEl('span', { 'data-message-streaming': 'true' })
  const tool1 = makeEl('div', { 'data-conversation-scaffold': 'true', 'data-slot': 'tool-block' }, 'ran command git status')
  content1.appendChild(stream1); content1.appendChild(tool1)
  part1.appendChild(content1)
  group.appendChild(part1)
  pair.appendChild(user); pair.appendChild(group)
  thread.appendChild(pair)
  doc.body.appendChild(thread)

  // Trailing spacer must not hide the last assistant root from newestMessageRoots
  thread.appendChild(makeEl('div', { 'data-slot': 'thread-spacer' }))
  assert.deepEqual(newestMessageRoots(), [part1])

  processTurn(group, true)
  const toggle = group.querySelector('.zephyr-work-summary')
  assert.ok(toggle)
  assert.equal(toggle.getAttribute('data-live'), 'true')
  assert.equal(group.dataset.zfStart, '1000000')

  // Brief gap between tool steps + new-chat session hash promotion
  nowMs += 1500
  locationObj.hash = '#/session/s-42'
  stream1.remove()
  processTurn(group, true)
  assert.equal(toggle.getAttribute('data-live'), 'true', 'brief gap should keep data-live active')

  // Step 2: tool approval card (waiting 120s > old 90s grace)
  nowMs += 120_000
  const part2 = makeEl('div', { 'data-slot': 'aui_assistant-message-root' })
  const content2 = makeEl('div', { 'data-slot': 'aui_assistant-message-content' })
  const approval = makeEl('div', { 'data-slot': 'tool-approval-card' }, 'Approve command?')
  content2.appendChild(approval)
  part2.appendChild(content2)
  group.appendChild(part2)
  processTurn(group, true)
  assert.equal(toggle.getAttribute('data-live'), 'true', 'approval card should hold timer live')
  assert.match(toggle.querySelector('.zephyr-work-summary-label').textContent, /Waiting for input for 2 minutes 2 seconds/)

  // Step 3: model finishes with prose in a SEPARATE later part (part3) than owner (part1)
  nowMs += 5000
  approval.remove()
  const part3 = makeEl('div', { 'data-slot': 'aui_assistant-message-root' })
  const content3 = makeEl('div', { 'data-slot': 'aui_assistant-message-content' })
  const reply = makeEl('div', { class: 'aui-md' }, 'Updated the sky grading constants and rebuilt plugin.js.')
  content3.appendChild(reply)
  part3.appendChild(content3)
  group.appendChild(part3)
  // Force past gap window so turn settles
  nowMs += 3000
  processTurn(group, true)
  assert.equal(toggle.getAttribute('data-live'), null)
  assert.match(toggle.querySelector('.zephyr-work-summary-label').textContent, /for 2 minutes 10 seconds/)

  flushAllWork()
  assert.ok(Object.keys(storage.turnTimes || {}).length >= 2, 'should persist both reply-hash and prompt-hash keys')

  // Reloaded session (fresh DOM, no in-memory zfStart, no duration badge) recovers the persisted duration
  const pairReload = makeEl('div', { 'data-slot': 'aui_turn-pair' })
  const userReload = makeEl('div', { 'data-slot': 'aui_user-message-root' }, 'Refactor the sky grading pipeline')
  const groupReload = makeEl('div', { 'data-slot': 'aui_response-group' })
  const partReload1 = makeEl('div', { 'data-slot': 'aui_assistant-message-root' })
  const cReload1 = makeEl('div', { 'data-slot': 'aui_assistant-message-content' })
  cReload1.appendChild(makeEl('div', { 'data-conversation-scaffold': 'true', 'data-slot': 'tool-block' }, 'ran command git status'))
  partReload1.appendChild(cReload1)
  const partReload2 = makeEl('div', { 'data-slot': 'aui_assistant-message-root' })
  const cReload2 = makeEl('div', { 'data-slot': 'aui_assistant-message-content' })
  cReload2.appendChild(makeEl('div', { class: 'aui-md' }, 'Done.')) // short (< 12 chars) reply still recovers via prompt key!
  partReload2.appendChild(cReload2)
  groupReload.appendChild(partReload1); groupReload.appendChild(partReload2)
  pairReload.appendChild(userReload); pairReload.appendChild(groupReload)
  processTurn(groupReload, true)
  assert.match(groupReload.querySelector('.zephyr-work-summary-label').textContent, /2 minutes 10 seconds/)
  assert.ok(turnTimes)
})

test('ambient agent-state lighting uses one-shot animations and mirrors active/background states cleanly', () => {
  const motionStart = src.indexOf('const MOTION_CSS')
  const motionEnd = src.indexOf('].join', motionStart)
  const motionCss = src.slice(motionStart, motionEnd)

  assert.match(motionCss, /\[data-zf-agent='working'\]/)
  assert.match(motionCss, /\[data-zf-agent='attention'\]/)
  assert.match(motionCss, /\[data-zf-agent-settled='true'\]/)
  assert.match(motionCss, /@keyframes zf-agent-settle/)
  assert.match(motionCss, /animation:\s*zf-agent-settle\s+var\(--zf-t-3\)\s+var\(--zf-ease-out\)\s+1\s+both/)
  assert.doesNotMatch(motionCss, /infinite/i, 'ambient lighting must never spin an infinite animation over translucent glass')
  for (const state of ['working', 'attention', 'done']) {
    assert.match(motionCss, new RegExp(`\\[data-zf-tab-state='${state}'\\]`))
  }
  assert.match(src, /skyFrameHooks\.add\(stepBreath\)/)
  assert.match(src, /skyFrameHooks\.delete\(stepBreath\)/)
})

test('focus mode registers Cmd/Ctrl+. keybind, hides chrome in MOTION_CSS, and cleans up on dispose', () => {
  assert.match(src, /id:\s*'zephyr\.focusMode'[\s\S]*?defaults:\s*\['mod\+\.'\]/)
  assert.match(src, /html\[data-zf-focus='on'\][^\{]*\[data-slot='sidebar'\]/)
  assert.match(src, /html\[data-zf-focus='on'\][^\{]*\[role='tablist'\]:has\(\[role='tab'\]\[data-tree-tab\]\)/)
  assert.match(src, /html\[data-zf-focus='on'\][^\{]*footer\[data-slot='statusbar'\]/)
  assert.match(src, /#zf-focus-pill/)
  assert.match(src, /label:\s*'Ambient agent lighting'/)
  assert.match(src, /label:\s*'Focus mode'/)

  // Behavioral check: syncAgentState drives surface + tab states, and applyFocusMode mounts/removes the pill
  const { doc, makeEl } = makeMockDom()
  const surface = makeEl('div', { 'data-chat-surface': 'true' })
  const group = makeEl('div', { 'data-slot': 'aui_response-group' })
  const root = makeEl('div', { 'data-slot': 'aui_assistant-message-root' })
  const content = makeEl('div', { 'data-slot': 'aui_assistant-message-content' })
  const toggle = makeEl('button', { class: 'zephyr-work-summary', 'data-live': 'true' })
  content.appendChild(toggle); root.appendChild(content); group.appendChild(root); surface.appendChild(group)
  doc.body.appendChild(surface)

  const tabA = makeEl('div', { role: 'tab', 'data-tree-tab': 's1', 'aria-selected': 'true' })
  tabA.appendChild(makeEl('span', { class: 'truncate' }, 'Active chat'))
  const tabB = makeEl('div', { role: 'tab', 'data-tree-tab': 's2', 'aria-selected': 'false' })
  tabB.appendChild(makeEl('span', { class: 'truncate' }, 'Worker chat'))
  doc.body.appendChild(tabA); doc.body.appendChild(tabB)

  const sidebar = makeEl('div', { 'data-slot': 'sidebar-content' })
  const sideRow = makeEl('div', { 'data-slot': 'sidebar-menu-item' })
  const dot = makeEl('span', { role: 'status', class: 'bg-ui-accent' })
  sideRow.appendChild(dot); sideRow.appendChild(makeEl('span', { class: 'truncate' }, 'Worker chat'))
  sidebar.appendChild(sideRow); doc.body.appendChild(sidebar)

  const put = (el, name, value) => { if (el && el.getAttribute(name) !== value) el.setAttribute(name, value) }
  const atom = v => ({ get: () => v, set: x => { v = x } })
  const skyFrameHooks = new Set()
  const agentSlice = slice('const prevSurfaceState = new WeakMap()', '// Live work tiles count up once a second')
  const focusSlice = slice('let syncFocusLayout = () => {}', '    if (typeof window !== \'undefined\') {\n      let lastFocusKeybind')
  const runControllers = new Function(
    'document', 'performance', 'put', 'atom', 'skyFrameHooks', 'agentLight', 'motion', 'reducedMotion',
    'ASSISTANT_ROOT', 'groupContainerOf', 'partsOf', 'isWaitingTurn', 'isStreamingRoot', 'setTimeout', 'clearTimeout',
    `const syncFocusLayout_stub = 0; ${focusSlice}; ${agentSlice}; return { applyFocusMode, toggleFocusMode, focusMode, syncAgentState, clearAgentAttrs, stepBreath }`
  )
  const ctl = runControllers(
    doc, { now: () => 500 }, put, atom, skyFrameHooks, atom(true), atom(true), () => false,
    "[data-slot='aui_assistant-message-root']", el => el.closest("[data-slot='aui_response-group']"),
    g => g.querySelectorAll("[data-slot='aui_assistant-message-root']").map(r => ({ root: r, content: r.querySelector("[data-slot='aui_assistant-message-content']") })),
    g => Boolean(g.querySelector("[data-slot='tool-approval-card']")),
    () => false, () => 1, () => {}
  )

  ctl.syncAgentState()
  assert.equal(surface.getAttribute('data-zf-agent'), 'working')
  assert.equal(tabA.getAttribute('data-zf-tab-state'), 'working')
  assert.equal(tabB.getAttribute('data-zf-tab-state'), 'working')

  // Background tab finishes -> transitions to done; active tab shows settled sweep
  toggle.removeAttribute('data-live')
  dot.remove()
  ctl.syncAgentState()
  assert.equal(surface.getAttribute('data-zf-agent'), null)
  assert.equal(surface.getAttribute('data-zf-agent-settled'), 'true')
  assert.equal(tabB.getAttribute('data-zf-tab-state'), 'done')

  // Selecting tabB clears its done badge
  tabA.setAttribute('aria-selected', 'false')
  tabB.setAttribute('aria-selected', 'true')
  ctl.syncAgentState()
  assert.equal(tabB.getAttribute('data-zf-tab-state'), null)

  // Focus mode toggles root attribute + exit pill
  ctl.toggleFocusMode()
  assert.equal(doc.documentElement.dataset.zfFocus, 'on')
  const pill = doc.getElementById('zf-focus-pill')
  assert.ok(pill)
  pill.click()
  assert.equal('zfFocus' in doc.documentElement.dataset, false)
  assert.equal(doc.getElementById('zf-focus-pill'), null)
})
