import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, writeFileSync, rmSync } from 'node:fs'

// Use the same small SDK/DOM harness as the motion tests, with real settings
// handlers and storage. No WebGL or network is needed to switch appearances.
const source = readFileSync(new URL('../plugin.js', import.meta.url), 'utf8')
const harness = readFileSync(new URL('./motion.test.mjs', import.meta.url), 'utf8')
const probe = new URL('./.tmp-appearance-probe.mjs', import.meta.url)
writeFileSync(probe, source)
const plugin = (await import(probe.href)).default
rmSync(probe)
globalThis.fetch = async () => ({ ok: false })
globalThis.setInterval = globalThis.setTimeout = () => 1
globalThis.clearInterval = globalThis.clearTimeout = () => {}
const a = harness.indexOf('const makeElement ='), b = harness.indexOf('let importError', a)
const c = harness.indexOf('const runRegister ='), d = harness.indexOf('const runDefault =', c)
const register = new Function('plugin', `${harness.slice(a,b)}; const importError = null; ${harness.slice(c,d)}; return runRegister`)(plugin)
const walk = node => {
  if (!node) return []
  if (Array.isArray(node)) return node.flatMap(walk)
  return typeof node === 'object' ? [node, ...walk(node.props?.children), ...walk(node.props?.action)] : []
}
const setup = storage => {
  const run = register(storage)
  assert.ifError(run.error)
  return { ...run, nodes: () => walk(run.pages[0].render()) }
}
const byLabel = (run, label) => run.nodes().find(n => n.props?.['aria-label'] === label)
const row = (run, title) => run.nodes().find(n => n.props?.title === title)

test('all looks share one host theme and Sky keeps its held time through Aurora', () => {
  const storage = { phasePin: 'dusk', weather: 'rain', look: 'sunset' }
  const run = setup(storage)
  // Match the theme contribution by id so this survives SDK area naming.
  const themeEntries = run.registered.filter(c => c.id.startsWith('theme.'))
  assert.ok(themeEntries.length)
  assert.deepEqual([...new Set(themeEntries.map(c => c.data.name))], ['zephyr-sky'])
  assert.equal(row(run, 'Hold at').props.action.props.value, 'dusk')
  byLabel(run, 'Aurora').props.onClick()
  assert.equal(storage.aurora, true)
  assert.equal(storage.weather, 'clear')
  assert.ok(row(run, 'Always night'))
  assert.equal(row(run, 'Hold at'), undefined)
  byLabel(run, 'Sky').props.onClick()
  assert.equal(row(run, 'Hold at').props.action.props.value, 'dusk')
  assert.equal(storage.weather, 'rain')
  assert.equal(storage.aurora, false)
  run.dispose()
})

test('Hermes button pauses scenery, preserves other features and a look resumes it', () => {
  const storage = { hermesTheme: 'solarized' }
  const run = setup(storage)
  const button = run.nodes().find(n => n.props?.children === 'Use Hermes appearance')
  assert.equal(button.props.variant, 'outline')
  button.props.onClick()
  assert.equal(storage.away, true)
  assert.equal(globalThis.__themeCalls.at(-1), 'solarized')
  assert.ok(run.nodes().some(n => n.props?.label === 'Suggest sessions on new tabs'))
  assert.equal(run.nodes().find(n => n.props?.label === 'Background'), undefined)
  byLabel(run, 'Gruvbox').props.onClick()
  assert.equal(storage.away, false)
  assert.equal(storage.look, 'gruvbox')
  assert.equal(globalThis.__themeCalls.at(-1), 'zephyr-sky')
  run.dispose()
})

test('Custom restores the saved picture even after starting in Sky', () => {
  const image = 'data:image/png;base64,' + 'A'.repeat(64)
  const storage = { look: 'sunset', skinImage: image }
  const run = setup(storage)
  byLabel(run, 'Custom').props.onClick()
  assert.equal(storage.look, 'custom')
  assert.equal(storage.skinImage, image)
  assert.ok(run.nodes().some(n => n.props?.children === 'Picture & glass'))
  run.dispose()
})

test('time selector persists live and held choices across registration', () => {
  const storage = {}
  let run = setup(storage)
  row(run, 'Time of day').props.action.props.onValueChange('held')
  row(run, 'Hold at').props.action.props.onValueChange('sunrise')
  assert.equal(storage.skyPhase, 'sunrise')
  run.dispose()
  run = setup(storage)
  assert.equal(row(run, 'Hold at').props.action.props.value, 'sunrise')
  row(run, 'Time of day').props.action.props.onValueChange('live')
  assert.equal(storage.skyPhase, null)
  assert.equal(row(run, 'Hold at'), undefined)
  run.dispose()
})

test('legacy Aurora migration and explicit live mode do not turn into held Night', () => {
  for (const storage of [
    { aurora: true, phasePin: 'night' },
    { skyPhase: null, phasePin: 'night' }
  ]) {
    const run = setup(storage)
    byLabel(run, 'Sky').props.onClick()
    assert.equal(row(run, 'Hold at'), undefined)
    run.dispose()
  }
})
