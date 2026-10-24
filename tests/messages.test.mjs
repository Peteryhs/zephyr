// The user message is a bubble inside an optional edit container. Both used to
// get the same inset ring, which drew a second border inside the block.
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const src = readFileSync(new URL('../plugin.js', import.meta.url), 'utf8').replace(/\r\n/g, '\n')
const marker = ":is(.composer-human-message, [class*='composer-human-message']):not(.composer-human-message-container) {"
let at = -1
let block = ''
for (let i = src.indexOf(marker); i >= 0; i = src.indexOf(marker, i + 1)) {
  const candidate = src.slice(i, src.indexOf('}', i) + 1)
  if (candidate.includes('box-shadow: var(--zf-lift)')) { at = i; block = candidate; break }
}
assert.ok(at >= 0, 'the user-message lift rule was not found')
const selector = src.slice(at, src.indexOf('{', at) + 1)

test('the user message ring is applied to the bubble, never its container', () => {
  assert.match(selector, /:not\(\.composer-human-message-container\)/)
  assert.equal((selector.match(/composer-human-message-container/g) || []).length, 1,
    'the container may only appear in the :not(), not as a selected element')
  assert.equal((block.match(/box-shadow: var\(--zf-lift\)/g) || []).length, 1)
})

test('the message bubble scrolls without painting a second edge', () => {
  const at = src.indexOf('reads as a second border')
  const end = src.indexOf('// User message bubbles', at)
  assert.ok(at >= 0 && end > at, 'the scrollbar rule block was not found')
  const block = src.slice(at, end)
  assert.match(block, /scrollbar-width: none;/)
  assert.match(block, /::-webkit-scrollbar/)
  assert.match(block, /display: none;/)
})
