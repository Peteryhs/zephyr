// The new-tab shelf is the one place suggested sessions are drawn. The sidebar
// is the host's column; a second copy there was a fourth group and a node the
// plugin had to keep re-inserting into React's list.
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const src = readFileSync(new URL('../plugin.js', import.meta.url), 'utf8').replace(/\r\n/g, '\n')

test('the sidebar carries no plugin-owned Recommended group', () => {
  for (const marker of ['zf-rec', 'recRail', 'syncRail', 'Recommended sessions']) {
    assert.equal(src.includes(marker), false, `${marker} should be gone with the sidebar rail`)
  }
})

test('the shelf is the only caller that draws the picks', () => {
  const calls = src.match(/RECENTS\.(pickUp|regulars)\(/g) || []
  assert.deepEqual(calls.sort(), ['RECENTS.pickUp(', 'RECENTS.regulars('])
})
