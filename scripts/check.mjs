/* Parse every sky module, evaluate one frozen frame, and prove the engine block
   committed in plugin.js is exactly what sky/ generates. */
import { readdir, readFile } from 'node:fs/promises'
import { spawnSync } from 'node:child_process'

for (const file of await readdir('sky')) {
  if (!file.endsWith('.js')) continue
  /* adapter.js is a fragment: its `return` only parses once inlined into the
     engine block, which the staleness check below covers */
  if (file === 'adapter.js') continue
  const result = spawnSync(process.execPath, ['--check', `sky/${file}`], { encoding: 'utf8' })
  if (result.status) { console.error(result.stderr); process.exit(result.status) }
}

const { evaluate } = await import('../sky/engine.js')
const frame = evaluate({ hourly: false, hour: 12 }, Date.parse('2026-10-15T16:00:00Z'))
if (!frame.cols.flat().every(Number.isFinite)) throw new Error('Non-finite palette')

/* the build must be a no-op on a clean tree: if this drifts, plugin.js §6 was
   hand-edited or sky/ changed without a rebuild */
const before = await readFile('plugin.js', 'utf8')
spawnSync(process.execPath, ['scripts/build-sky.mjs'], { stdio: 'ignore' })
const after = await readFile('plugin.js', 'utf8')
if (before !== after) throw new Error('plugin.js §6 is stale: run npm run build:sky and commit the result')

console.log('All sky modules parse, a frozen frame evaluates, and plugin.js §6 matches sky/.')
