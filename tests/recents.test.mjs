// Which sessions the new-tab shelf shows. The rules are pinned to what a real
// history showed (see recents/engine.js), so a change to a constant fails here
// and has to be argued for.
import test from 'node:test'
import assert from 'node:assert/strict'
import * as R from '../recents/engine.js'

const NOW = Date.UTC(2026, 9, 22, 18, 0, 0)
const H = 3600e3
const D = R.DAY
const sess = (id, o = {}) => ({ id, message_count: 40, last_active: (NOW - 2 * H) / 1000, ...o })
const rec = (id, visits, days) => ({ ...R.emptyRecord(id), visits, days: days ?? [...new Set(visits.map(v => Math.floor(v.t / D)))] })
const visit = (ago, turns = 5) => ({ t: NOW - ago, last: NOW - ago, turns })

test('a visit extends inside the gap and a new one starts after it', () => {
  const r = R.emptyRecord('a')
  R.recordFocus(r, NOW)
  R.recordFocus(r, NOW + 10 * 60e3)
  assert.equal(r.visits.length, 1)
  R.recordFocus(r, NOW + 10 * 60e3 + R.VISIT_GAP_MS + 1)
  assert.equal(r.visits.length, 2)
})

test('turns count against the current visit and days are distinct', () => {
  const r = R.emptyRecord('a')
  R.recordTurn(r, NOW); R.recordTurn(r, NOW + 1000); R.recordFocus(r, NOW + 2000)
  assert.equal(r.visits[0].turns, 2)
  assert.equal(r.days.length, 1)
  R.recordFocus(r, NOW + 2 * D)
  assert.equal(r.days.length, 2)
})

test('records stay bounded', () => {
  const r = R.emptyRecord('a')
  for (let i = 0; i < 300; i++) R.recordFocus(r, NOW + i * D)
  assert.ok(r.visits.length <= R.MAX_VISITS)
  assert.ok(r.days.length <= R.MAX_DAYS)
})

test('a recent heavy session outranks an older one, and the half-life is 3 days', () => {
  const a = rec('a', [visit(1 * H)]), b = rec('b', [visit(3 * D)])
  assert.ok(R.scoreRecent(a, NOW) > R.scoreRecent(b, NOW))
  const one = rec('c', [visit(0)]), later = rec('c', [visit(R.HALF_LIFE_DAYS * D)])
  assert.ok(Math.abs(R.scoreRecent(later, NOW) / R.scoreRecent(one, NOW) - 0.5) < 1e-9)
})

test('a glance counts far less than a working visit', () => {
  assert.ok(R.scoreRecent(rec('a', [visit(H, 5)]), NOW) > 3 * R.scoreRecent(rec('b', [visit(H, 0)]), NOW))
})

test('a quick chat: few messages, few turns, one day, past the grace period', () => {
  const s = sess('q', { message_count: 4, last_active: (NOW - 2 * D) / 1000 })
  assert.equal(R.isQuick(s, rec('q', [visit(2 * D, 1)]), NOW), true)
  assert.equal(R.isQuick(s, null, NOW), true)
})

test('what the agent did never makes a chat important or throwaway', () => {
  // few messages but a pile of tool calls is still an errand
  const s = sess('q', { message_count: 4, tool_call_count: 90, last_active: (NOW - 2 * D) / 1000 })
  assert.equal(R.isQuick(s, rec('q', [visit(2 * D, 1)]), NOW), true)
})

test('a pure-talk deep dive is not quick even with no tool calls', () => {
  const s = sess('m', { message_count: 24, tool_call_count: 0, last_active: (NOW - 2 * D) / 1000 })
  assert.equal(R.isQuick(s, rec('m', [visit(2 * D, 9)]), NOW), false)
})

test('a quick chat stays visible for a day, and graduates on a second day, pin or keep', () => {
  const fresh = sess('q', { message_count: 4, last_active: (NOW - 2 * H) / 1000 })
  assert.equal(R.isQuick(fresh, rec('q', [visit(2 * H, 1)]), NOW), false)
  const old = sess('q', { message_count: 4, last_active: (NOW - 3 * D) / 1000 })
  const two = rec('q', [visit(3 * D, 1), visit(2 * D, 1)])
  assert.equal(R.isQuick(old, two, NOW), false)
  assert.equal(R.isQuick({ ...old, pinned: true }, rec('q', [visit(3 * D, 1)]), NOW), false)
  assert.equal(R.isQuick(old, { ...rec('q', [visit(3 * D, 1)]), keep: true }, NOW), false)
})

test('seeding infers one visit but does not invent a day', () => {
  const r = R.seedFromSession(R.emptyRecord('s'), sess('s', { message_count: 30 }))
  assert.equal(r.visits.length, 1)
  assert.equal(r.visits[0].seeded, true)
  assert.equal(r.days.length, 0)
  assert.ok(R.scoreRecent(r, NOW) > 0)
  assert.equal(R.seedFromSession(r, sess('s')).visits.length, 1)
})

test('pickUp: ordered by score, skips pinned, quick, dismissed and excluded', () => {
  const sessions = [sess('hot'), sess('cool'), sess('pin', { pinned: true }), sess('quick', { message_count: 3, last_active: (NOW - 3 * D) / 1000 }), sess('gone'), sess('open')]
  const records = {
    hot: rec('hot', [visit(1 * H)]), cool: rec('cool', [visit(2 * D)]), pin: rec('pin', [visit(H)]),
    quick: rec('quick', [visit(3 * D, 1)]), gone: { ...rec('gone', [visit(2 * H)]), dismissed: NOW - H }, open: rec('open', [visit(H)]),
  }
  const ids = R.pickUp(sessions, records, NOW, { exclude: new Set(['open']) }).map(x => x.id)
  assert.deepEqual(ids, ['hot', 'cool'])
})

test('a dismissed session returns after you open it again', () => {
  const r = { ...rec('g', [visit(2 * H)]), dismissed: NOW - H }
  assert.equal(R.pickUp([sess('g')], { g: r }, NOW).length, 0)
  R.recordFocus(r, NOW)
  assert.equal(R.pickUp([sess('g')], { g: r }, NOW).length, 1)
})

test('a session with no history is simply absent, not an error', () => {
  assert.deepEqual(R.pickUp([sess('x')], {}, NOW), [])
  assert.deepEqual(R.regulars([sess('x')], {}, NOW), [])
})

test('regulars: opened on 3+ days, kept through a fortnight gap', () => {
  const days = [0, 14, 28].map(n => Math.floor(NOW / D) - n).reverse()
  const r = rec('fort', [visit(14 * D, 6), visit(0, 6)], days)
  assert.equal(R.cadence(r), 14)
  const out = R.regulars([sess('fort', { last_active: (NOW - 0) / 1000 })], { fort: r }, NOW)
  assert.deepEqual(out.map(x => x.id), ['fort'])
  // the same session ranks nowhere on the fast score once it has been quiet a while
  const quiet = rec('fort', [visit(14 * D, 6)], days)
  assert.ok(R.scoreRecent(quiet, NOW) < 0.05)
})

test('regulars: due ones first, and a long-unseen regular drops off', () => {
  const dn = Math.floor(NOW / D)
  const due = rec('due', [visit(13 * D)], [dn - 41, dn - 27, dn - 13])
  const fresh = rec('fresh', [visit(H)], [dn - 3, dn - 2, dn])
  const stale = rec('stale', [visit(60 * D)], [dn - 80, dn - 70, dn - 60])
  const at = ago => (NOW - ago) / 1000
  const out = R.regulars([sess('due', { last_active: at(13 * D) }), sess('fresh', { last_active: at(H) }), sess('stale', { last_active: at(60 * D) })], { due, fresh, stale }, NOW)
  assert.deepEqual(out.map(x => x.id), ['due', 'fresh'])
  assert.equal(out[0].due, true)
  assert.match(out[0].reason, /every ~14 days/)
})

test('"always keep" pins a session into the regulars; "never" removes it', () => {
  const k = { ...rec('k', [visit(30 * D)]), keep: true }
  assert.deepEqual(R.regulars([sess('k')], { k }, NOW).map(x => x.id), ['k'])
  const dn = Math.floor(NOW / D)
  const n = { ...rec('n', [visit(H)], [dn - 3, dn - 2, dn]), never: true }
  assert.deepEqual(R.regulars([sess('n')], { n }, NOW), [])
  assert.deepEqual(R.pickUp([sess('n')], { n }, NOW), [])
})

test('internal, hidden and archived rows never surface', () => {
  const rows = [sess('a', { hidden: true }), sess('b', { archived: true }), sess('c', { is_internal_child: true })]
  const records = Object.fromEntries(rows.map(s => [s.id, rec(s.id, [visit(H)])]))
  assert.deepEqual(R.pickUp(rows, records, NOW), [])
})

test('sanitize drops damage and bounds what it keeps', () => {
  assert.deepEqual(R.sanitize(null), {})
  assert.deepEqual(R.sanitize([1, 2]), {})
  const out = R.sanitize({
    ok: { visits: [{ t: 1, last: 2, turns: 3 }, { t: 5, last: 2, turns: 1 }, { t: 'x' }], days: [3, 1, 'z', -4], keep: true },
    ['__proto__']: { visits: [] }, bad: 7,
  })
  assert.deepEqual(Object.keys(out), ['ok'])
  assert.equal(out.ok.visits.length, 1)
  assert.deepEqual(out.ok.days, [1, 3])
  assert.equal(out.ok.keep, true)
})

test('prune keeps the most recently touched records', () => {
  const rs = {}
  for (let i = 0; i < R.MAX_RECORDS + 20; i++) rs['s' + i] = { ...R.emptyRecord('s' + i), visits: [{ t: i, last: i, turns: 1 }] }
  const out = R.prune(rs)
  assert.equal(Object.keys(out).length, R.MAX_RECORDS)
  assert.ok(out['s' + (R.MAX_RECORDS + 19)] && !out.s0)
})

test('ago reads naturally', () => {
  assert.equal(R.ago(30e3), 'just now')
  assert.equal(R.ago(5 * 60e3), '5m ago')
  assert.equal(R.ago(3 * H), '3h ago')
  assert.equal(R.ago(2 * D), '2d ago')
  assert.equal(R.ago(21 * D), '3w ago')
})

test('pickUp offers three when there are more to offer, and no more', () => {
  const sessions = [], records = {}
  for (let i = 0; i < 9; i++) { sessions.push(sess('s' + i)); records['s' + i] = rec('s' + i, [visit((i + 1) * H)]) }
  assert.equal(R.PICK_UP_COUNT, 3)
  assert.equal(R.pickUp(sessions, records, NOW).length, 3)
})
