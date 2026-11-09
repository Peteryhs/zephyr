import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const src = readFileSync(new URL('../plugin.js', import.meta.url), 'utf8')
const start = src.indexOf('  const resize = () => {', src.indexOf('function createSky'))
const end = src.indexOf('\n  const fading =', start)
assert.ok(start > 0 && end > start)
const resizeBody = src.slice(start, end)
const QUALITY = { low: { res: .18, maxSide: 480 }, balanced: { res: .25, maxSide: 720 }, high: { res: .4, maxSide: 1100 } }

test('Aurora reduces High pixels, retains Low/Balanced and restores ordinary sky resolution', () => {
  for (const [width, height] of [[1920, 1080], [3840, 2160], [390, 844]]) {
    for (const [name, quality] of Object.entries(QUALITY)) {
      const canvas = { width: 0, height: 0 }
      const run = { blurTo: 5, aurora: 0, skyInRt: true, fps: 16 }
      const resize = new Function('run', 'quality', 'QUALITY', 'window', 'canvas', 'clamp', `let fieldStale = false; ${resizeBody}; return resize`)(
        run, quality, QUALITY, { innerWidth: width, innerHeight: height }, canvas, (v, lo, hi) => Math.min(hi, Math.max(lo, v)))
      assert.equal(resize(), true)
      const normal = { ...canvas }
      assert.equal(resize(), false)
      run.aurora = 1
      resize()
      assert.equal(run.fps, 16)
      if (name === 'high') {
        assert.ok(canvas.width * canvas.height < normal.width * normal.height * .44)
        assert.ok(Math.max(canvas.width, canvas.height) <= 720)
      } else assert.deepEqual(canvas, normal)
      run.aurora = 0
      resize()
      assert.deepEqual(canvas, normal)
    }
  }
})
