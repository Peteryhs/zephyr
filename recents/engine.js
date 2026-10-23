/* Which sessions to put in front of you on a new tab.

   Pure functions over plain data: no DOM, no Hermes, no clock of their own (every
   function takes `now`). That keeps the rules testable and keeps the adapter in
   plugin.js a thin layer that only records visits and draws the result.

   The constants come from replaying real history: the score is ranked at the start
   of each day using only earlier data, and the question is how often the session
   actually opened that day was in the top six.
     - a 3 day half-life put it there on 81% of days (plain recency: 65%); a 30 day
       half-life with a lifetime-count multiplier, the Firefox shape, fell to 53%.
       Heavy sessions come back within days, not months.
     - no session with one or two user turns was ever reopened on a later day. */

export const DAY = 86400000
export const HALF_LIFE_DAYS = 3
export const VISIT_GAP_MS = 45 * 60 * 1000     // a pause longer than this starts a new visit
export const QUICK_MAX_MESSAGES = 6            // at most this many messages in total...
export const QUICK_MAX_TURNS = 3               // ...and you spoke at most this many times
export const QUICK_GRACE_MS = DAY              // a fresh quick chat stays where it is for a day
export const REGULAR_MIN_DAYS = 3              // distinct days opened before a session counts as a regular
export const REGULAR_WINDOW_DAYS = 45          // a regular unseen this long drops off
export const MAX_RECORDS = 500
export const MAX_VISITS = 40
export const MAX_DAYS = 120

const dayOf = t => Math.floor(t / DAY)
const finite = n => typeof n === 'number' && Number.isFinite(n)

export const emptyRecord = id => ({ id, visits: [], days: [], dismissed: 0, keep: false, never: false })

/* ── recording ──────────────────────────────────────────────────────────── */

/* A visit is {t: start, last: latest sign of life, turns: times you sent something,
   seeded: true when it was inferred from the session list, not watched}. */
const currentVisit = (rec, now) => {
  const v = rec.visits[rec.visits.length - 1]
  return v && now - v.last <= VISIT_GAP_MS && now >= v.t ? v : null
}

export function recordFocus(rec, now) {
  let v = currentVisit(rec, now)
  if (!v) {
    v = { t: now, last: now, turns: 0 }
    rec.visits.push(v)
    if (rec.visits.length > MAX_VISITS) rec.visits.splice(0, rec.visits.length - MAX_VISITS)
  } else v.last = now
  const d = dayOf(now)
  if (!rec.days.includes(d)) {
    rec.days.push(d)
    rec.days.sort((a, b) => a - b)
    if (rec.days.length > MAX_DAYS) rec.days.splice(0, rec.days.length - MAX_DAYS)
  }
  return rec
}

export function recordTurn(rec, now) {
  recordFocus(rec, now)
  currentVisit(rec, now).turns++
  return rec
}

/* A session never watched still has a last-active time: give it one inferred
   visit so the first day is not empty. It does not count as a day opened (that
   would pass for a return), and it is weighted down. */
export function seedFromSession(rec, session) {
  if (rec.visits.length || !finite(session.last_active)) return rec
  const t = session.last_active * 1000
  rec.visits.push({ t, last: t, turns: (session.message_count || 0) >= 10 ? 4 : 1, seeded: true })
  return rec
}

/* ── reading ────────────────────────────────────────────────────────────── */

export const lastTouch = (rec, session) => {
  const v = rec && rec.visits[rec.visits.length - 1]
  const fromSession = session && finite(session.last_active) ? session.last_active * 1000 : 0
  return Math.max(v ? v.last : 0, fromSession)
}

const turnsOf = rec => (rec ? rec.visits.reduce((n, v) => n + (v.seeded ? 0 : v.turns), 0) : 0)
const daysOf = rec => (rec ? rec.days.length : 0)

/* Quick chat: a small errand. Only the shape of the conversation decides, never
   how much the agent did: "clean up this directory" can run 40 tool calls and
   still be an errand, and a C++ deep dive can be pure talk. */
export function isQuick(session, rec, now) {
  if (session.pinned || (rec && (rec.keep || rec.never))) return false
  if ((session.message_count || 0) > QUICK_MAX_MESSAGES) return false
  if (turnsOf(rec) > QUICK_MAX_TURNS || daysOf(rec) >= 2) return false
  return now - lastTouch(rec, session) > QUICK_GRACE_MS
}

const visitWeight = v => {
  if (v.seeded) return v.turns >= 4 ? 0.6 : 0.25
  return v.turns < 2 ? 0.2 : v.turns < 4 ? 0.6 : 1
}

export function scoreRecent(rec, now) {
  const lambda = Math.LN2 / (HALF_LIFE_DAYS * DAY)
  let s = 0
  for (const v of rec.visits) if (v.last <= now) s += visitWeight(v) * Math.exp(-lambda * (now - v.last))
  return s
}

const median = xs => {
  const a = [...xs].sort((x, y) => x - y)
  const m = a.length >> 1
  return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2
}

/* The usual gap, in days, between the days a session was opened. null with too
   little history to say. */
export function cadence(rec) {
  if (rec.days.length < REGULAR_MIN_DAYS) return null
  const gaps = []
  for (let i = 1; i < rec.days.length; i++) gaps.push(rec.days[i] - rec.days[i - 1])
  return Math.max(1, Math.round(median(gaps)))
}

export function ago(ms) {
  const m = Math.max(0, Math.round(ms / 60000))
  if (m < 2) return 'just now'
  if (m < 60) return m + 'm ago'
  const h = Math.round(m / 60)
  if (h < 24) return h + 'h ago'
  const d = Math.round(h / 24)
  return d < 14 ? d + 'd ago' : Math.round(d / 7) + 'w ago'
}

const candidates = (sessions, records, now, exclude) =>
  sessions.filter(s => s && s.id && !s.hidden && !s.archived && !exclude.has(s.id) && !s.is_internal_child)
    .map(s => ({ s, rec: records[s.id] || null }))

/* "Pick up where you left off": fast recency. Pinned sessions are already one
   click away, quick chats are noise, and a dismissed one stays gone until you
   open it again. */
export function pickUp(sessions, records, now, { exclude = new Set(), limit = 5 } = {}) {
  const out = []
  for (const { s, rec } of candidates(sessions, records, now, exclude)) {
    if (!rec || s.pinned || rec.never || isQuick(s, rec, now)) continue
    if (rec.dismissed && rec.dismissed >= lastTouch(rec, null)) continue
    const score = scoreRecent(rec, now)
    if (score < 0.05) continue
    const touched = lastTouch(rec, s)
    const lately = rec.days.filter(d => d > dayOf(now) - 30).length
    out.push({ id: s.id, session: s, score, touched,
      reason: lately >= 3 ? `Opened on ${lately} of the last 30 days` : 'Left off ' + ago(now - touched) })
  }
  out.sort((a, b) => b.score - a.score || b.touched - a.touched)
  return out.slice(0, limit)
}

/* "Your regulars": the few you keep coming back to, however rarely. Ordered by
   whether you are due, then by how many days you have opened them. They never
   compete with recency, so this row does not churn. */
export function regulars(sessions, records, now, { exclude = new Set(), limit = 4 } = {}) {
  const out = []
  for (const { s, rec } of candidates(sessions, records, now, exclude)) {
    if (!rec || rec.never) continue
    const days = daysOf(rec)
    if (!rec.keep && (days < REGULAR_MIN_DAYS || now - lastTouch(rec, s) > REGULAR_WINDOW_DAYS * DAY)) continue
    const gap = cadence(rec)
    const since = Math.floor((now - lastTouch(rec, s)) / DAY)
    const due = gap !== null && gap >= 2 && since >= Math.round(gap * 0.7)
    const reason = due ? `Usually every ~${gap} days, last ${since === 0 ? 'today' : since + ' days ago'}`
      : rec.keep ? 'Kept by you' : `Opened on ${days} days`
    out.push({ id: s.id, session: s, due, days, touched: lastTouch(rec, s), reason })
  }
  out.sort((a, b) => Number(b.due) - Number(a.due) || b.days - a.days || b.touched - a.touched)
  return out.slice(0, limit)
}

/* ── storage ────────────────────────────────────────────────────────────── */

/* Stored data is read back through this: a damaged or hand-edited value yields
   fewer records, never an exception or a poisoned score. */
export function sanitize(raw) {
  const out = {}
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return out
  for (const id of Object.keys(raw)) {
    const r = raw[id]
    if (!r || typeof r !== 'object' || typeof id !== 'string' || id.length > 200 || id === '__proto__') continue
    const rec = emptyRecord(id)
    for (const v of Array.isArray(r.visits) ? r.visits.slice(-MAX_VISITS) : []) {
      if (v && finite(v.t) && finite(v.last) && v.last >= v.t && finite(v.turns) && v.turns >= 0)
        rec.visits.push({ t: v.t, last: v.last, turns: Math.min(v.turns, 1e4), ...(v.seeded ? { seeded: true } : {}) })
    }
    rec.days = (Array.isArray(r.days) ? r.days : []).filter(d => finite(d) && d > 0).slice(-MAX_DAYS).sort((a, b) => a - b)
    rec.dismissed = finite(r.dismissed) ? r.dismissed : 0
    rec.keep = r.keep === true
    rec.never = r.never === true
    out[id] = rec
  }
  return out
}

/* Keep the most recently touched MAX_RECORDS. */
export function prune(records) {
  const ids = Object.keys(records)
  if (ids.length <= MAX_RECORDS) return records
  const last = id => (records[id].visits.at(-1) || { last: 0 }).last
  ids.sort((a, b) => last(b) - last(a))
  const out = {}
  for (const id of ids.slice(0, MAX_RECORDS)) out[id] = records[id]
  return out
}
