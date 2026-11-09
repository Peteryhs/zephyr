import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const src = readFileSync(new URL('../plugin.js', import.meta.url), 'utf8').replace(/\r\n/g, '\n')
const cut = (start, end) => {
  const a = src.indexOf(start), b = src.indexOf(end, a)
  assert.ok(a >= 0 && b > a)
  return src.slice(a, b)
}

test('Aurora and previews preserve the reduced-motion cap', () => {
  const body = cut('const curFps =', '  const stepBlur')
  for (const fast of [false, true]) {
    for (const aurora of [false, true]) {
      const fps = new Function('run', 'live', 'document', `${body}; return curFps()`)(
        { fps: 0.25, aurora }, { fast }, { hasFocus: () => true })
      assert.equal(fps, 0.25)
    }
  }
})

test('Aurora honours Low and Balanced frame rates', () => {
  const body = cut('const curFps =', '  const stepBlur')
  for (const fps of [4, 8, 16]) {
    assert.equal(new Function('run', 'live', 'document', `${body}; return curFps()`)(
      { fps, aurora: true }, { fast: false }, { hasFocus: () => true }), fps)
  }
})

test('star twinkle is bounded, timer-driven and pauses with window and motion state', () => {
  const body = cut('    let syncAuroraStars =', '    // ── Tabs:')
  const canvases = [], disposers = [], timers = new Map()
  let timerId = 0, focused = true, reducedMotion = false, skyEnabled = true, motionChange
  const setTimer = (fn, delay) => { const id = ++timerId; timers.set(id, { fn, delay }); return id }
  const clearTimer = id => timers.delete(id)
  const context = { clearRect() {}, fillRect() {}, beginPath() {}, arc() {}, fill() {}, createRadialGradient: () => ({ addColorStop() {} }) }
  const make = tag => {
    const el = { style: {}, children: [], setAttribute() {}, appendChild(c) { this.children.push(c); c.parentNode = this }, getContext: () => context, remove() {} }
    if (tag === 'canvas') canvases.push(el)
    return el
  }
  const doc = { hidden: false, hasFocus: () => focused, documentElement: { dataset: { hermesTheme: 'zephyr-sky' } }, body: make('body'), createElement: make, getElementById: () => null, addEventListener() {}, removeEventListener() {} }
  const win = { innerWidth: 320, innerHeight: 200, devicePixelRatio: 2, addEventListener() {}, removeEventListener() {} }
  const media = { get matches() { return reducedMotion }, addEventListener: (name, fn) => { motionChange = fn }, removeEventListener() {} }
  const sync = new Function('ctx', 'document', 'window', 'MutationObserver', 'stored', 'STORE_KEYS', 'AURORA_THEME', 'SKY_THEME', 'matchMedia', 'setTimeout', 'clearTimeout', `${body}; return syncAuroraStars`)(
    { onDispose: fn => disposers.push(fn) }, doc, win, class { observe() {} disconnect() {} }, key => key === 'sky' ? skyEnabled : undefined, { sky: 'sky' }, 'zephyr-aurora', 'zephyr-sky', () => media, setTimer, clearTimer)
  assert.equal(canvases.length, 0)
  doc.documentElement.dataset.hermesTheme = 'zephyr-aurora'
  doc.hidden = true
  sync()
  assert.equal(canvases.length, 0)
  reducedMotion = true
  doc.hidden = false
  sync()
  assert.equal(canvases.length, 2)
  assert.equal(canvases[0].width, 480)
  assert.equal(timers.size, 1) // only the meteor timer; reduced motion stops twinkle
  assert.ok(canvases.every(c => c.style.opacity === '0.5'))
  assert.ok(!canvases.some(c => 'animationPlayState' in c.style))
  reducedMotion = false
  motionChange()
  assert.ok([...timers.values()].some(t => t.delay === 250))
  assert.deepEqual(canvases.map(c => c.style.opacity), ['0', '1'])
  const opacity = canvases[0].style.opacity
  const twinkle = [...timers.values()].find(t => t.delay === 250).fn
  timers.delete([...timers.entries()].find(([, t]) => t.delay === 250)[0])
  twinkle()
  assert.notEqual(canvases[0].style.opacity, opacity)
  const next = [...timers.values()].find(t => t.delay === 250).fn
  timers.delete([...timers.entries()].find(([, t]) => t.delay === 250)[0])
  next()
  assert.notEqual(canvases[0].style.opacity, opacity)
  assert.ok(canvases.every(c => Number(c.style.opacity) >= 0 && Number(c.style.opacity) <= 1))
  assert.ok(Math.abs(canvases.reduce((sum, c) => sum + Number(c.style.opacity), 0) - 1) < 1e-9)
  sync()
  assert.equal(canvases.length, 2)
  doc.hidden = true
  sync()
  assert.ok(![...timers.values()].some(t => t.delay === 250))
  doc.hidden = false
  focused = false
  sync()
  assert.ok(![...timers.values()].some(t => t.delay === 250))
  focused = true
  reducedMotion = true
  motionChange()
  assert.ok(![...timers.values()].some(t => t.delay === 250))
  assert.ok(canvases.every(c => c.style.opacity === '0.5'))
  reducedMotion = false
  motionChange()
  assert.ok([...timers.values()].some(t => t.delay === 250))
  skyEnabled = false
  sync()
  assert.ok(![...timers.values()].some(t => t.delay === 250))
  skyEnabled = true
  sync()
  assert.ok([...timers.values()].some(t => t.delay === 250))
  disposers.forEach(fn => fn())
  assert.ok(![...timers.values()].some(t => t.delay === 250))
})

test('the Aurora star layer hides and returns when Sky changes', () => {
  const body = cut('const sync = () => {\n        const on = (document.documentElement.dataset.hermesTheme === AURORA_THEME', '\n      document.body.appendChild(host)')
  let sky = true, draws = 0
  const host = { style: {}, parentNode: {} }
  const doc = { documentElement: { dataset: { hermesTheme: 'zephyr-aurora' } }, body: host.parentNode, getElementById: () => null }
  const sync = new Function('document', 'host', 'AURORA_THEME', 'stored', 'STORE_KEYS', 'draw', 'SKY_THEME', 'layers', 'syncTwinkle', `${body}; return sync`)(
    doc, host, 'zephyr-aurora', key => key === 'sky' ? sky : false, { sky: 'sky' }, () => draws++, 'zephyr-sky', [], () => {})
  sync()
  assert.equal(host.style.display, 'block')
  sky = false
  sync()
  assert.equal(host.style.display, 'none')
  assert.equal(draws, 1)
  sky = true
  sync()
  assert.equal(host.style.display, 'block')
  doc.documentElement.dataset.hermesTheme = 'zephyr-night'
  sync()
  assert.equal(host.style.display, 'none')
})

test('sidebar docking repositions recommendations before capturing the new frame', async () => {
  const body = cut('const morph = fn => {', '\n      const setArc =')
  for (const animate of [false, true]) {
    const col = { style: {}, getClientRects: () => [1] }
    const main = { style: {}, getClientRects: () => [1], getBoundingClientRect: () => ({ width: 800 }) }
    col.parentElement = { children: [col, main] }
    const home = { style: {} }, root = { dataset: {} }, order = []
    let finish
    const finished = new Promise(resolve => { finish = resolve })
    const doc = {
      hidden: false, getElementById: () => home,
      startViewTransition: animate ? fn => {
        assert.equal(home.style.viewTransitionName, 'zf-home')
        fn()
        assert.deepEqual(order, ['toggle', 'shelf', 'recommendations'])
        return { finished }
      } : null,
    }
    const morph = new Function('document', 'matchMedia', 'column', 'root', 'window', 'setTimeout', 'layoutShelf', 'homeApi', `${body}; return morph`)(
      doc, () => ({ matches: false }), () => col, root, { dispatchEvent() {} }, () => {},
      () => order.push('shelf'), { layout: () => order.push('recommendations') })
    morph(() => order.push('toggle'))
    assert.deepEqual(order, ['toggle', 'shelf', 'recommendations'])
    finish()
    await finished
    await Promise.resolve()
    if (animate) assert.equal(home.style.viewTransitionName, '')
  }
})

test('recommendations follow the pane bounds when docking changes its size and position', () => {
  const place = cut('const place = (r, tagline) => {', '\n\n        return {\n          // called on every page pass')
  const layout = cut('layout() {\n            if (!dead && shown && anchorPane', '\n          poke()')
  let bounds = { left: 280, top: 40, width: 1120, height: 800 }
  const el = { style: {} }
  const reflow = new Function('el', 'document', 'dead', 'shown', 'anchorPane', 'anchorTagline', `${place}; return ({${layout}}).layout`)(
    el, { getElementById: () => null }, false, true,
    { isConnected: true, getBoundingClientRect: () => bounds }, null)
  reflow()
  assert.equal(el.style.left, '380px')
  assert.equal(el.style.width, '920px')
  bounds = { ...bounds, left: 0, width: 1400 }
  reflow()
  assert.equal(el.style.left, '240px')
  bounds = { ...bounds, width: 600 }
  reflow()
  assert.equal(el.style.left, '24px')
  assert.equal(el.style.width, '552px')
})
