# The Zephyr sky engine

An independent implementation of the supplied **Dynamic sky simulation: independent rebuild
specification, v1.0**. The sky fills the window and uses one full-screen WebGL triangle, with a
separate CPU frame evaluator and independently generated atmospheric data.

Inside this repository the engine is generated into `plugin.js` §6 by `scripts/build-sky.mjs` from
the sources in `sky/`. Edit those sources, run the build, and commit both. The engine also runs on
its own in a browser, with its own dock and controls, in the standalone build it was developed in.

Run with Node.js 22 or newer. There are no dependencies and no installation step.

```sh
node scripts/build-sky.mjs     # regenerate plugin.js §6 from sky/
node --test tests/engine.test.mjs
node scripts/check.mjs
node tests/sky-rig.mjs         # the same engine, wired inside plugin.js
```

The engine starts over Toronto and follows the local clock. It supports time scrubbing, day
playback, sunrise and sunset jumps, a paused sky, PNG capture, full screen, all nine simulator
conditions, cloud cover, wind, AQI, exposure, grain and night visibility, plus custom coordinates
and IANA zones.

## Fidelity target

Geometry, seeds, weather transforms, grading equations, phenomenon gates, projection, and the
ordered pixel pipeline follow the specification. The selected numerical anchors in §23.2 pass at an
absolute tolerance of 10⁻⁶. The 47-uniform interface is complete.

**The original atmospheric payload, optional finishing LUT, reference images, and companion fixture
JSON were not supplied.** This rebuild uses an independent spherical Rayleigh/Mie scattering bake
with an empirical diffuse-light closure. Constant per-view spectral gains calibrate the supplied
noon observation. Palette tests use a 0.025 channel envelope, not exact reference parity.
Pixel-identical reference fidelity and external visual approval are not claimed.

The original document is preserved in [rebuild-specification.md](rebuild-specification.md). Deliberate
host choices and compatibility changes are in [compatibility.md](compatibility.md). What was checked,
and what was not, is in [verification.md](verification.md).

## Modules

Every file in `sky/` is in the generated block, in this order.

| File | Responsibility |
| --- | --- |
| `sky/clock.js` | IANA local time, simulated dates, solar/lunar geometry, integer seeds |
| `sky/grade.js` | Shared adaptation, tone mapping, gamut projection, Oklab edits, palette floor |
| `sky/atmosphere.js` | Log-AOD and linear-elevation sampling of the independent bake |
| `sky/atmosphere-data.js` | 6 × 109 × 4 × RGB sky values; 6 × 47 × RGB disk colors |
| `sky/atmosphere-calibration.js` | The 12 constant spectral gains against the noon observation |
| `sky/engine.js` | Scene adapter, weather precedence, complete frame evaluator and look snapshots |
| `sky/shaders.js` | Value noise, nested warp, all 20 ordered pixel composition stages |
| `sky/renderer.js` | Graphics resources, triangle draw, uniform upload, optional LUT |
| `sky/adapter.js` | The plugin's own vocabulary on top of the engine (`createSky` calls this) |

## Reproducible evaluation

```js
import { evaluate } from '../sky/engine.js';

const frame = evaluate(
  { hourly: false, hour: 12, timeZone: 'America/Toronto' },
  Date.parse('2026-10-15T16:00:00Z'),
  { state: { manualCode: null }, tuning: { grain: 0.018 } }
);
```

`createSimulation()` starts with the specified unapplied Sunnyvale state. Call
`simulation.applyScene({})` to apply the desktop scene explicitly. `applyLift` uses immutable base
values and never compounds. The exported `frameAt()` takes no timestamp; the explicit `evaluate` and
`simulation.evaluateAt` APIs do. The adapter in `sky/adapter.js` is the seam the plugin uses, and it
exposes `FRAG`, `VERT`, `UNIFORM_NAMES`, `ATTRIB`, `applyScene`, `applyLift`, `frameAt`,
`drawParams`, `detUnit`, `SCENE`, `LIFT_BASE` and `skyState`.

## Checks and visual verification

```sh
node --test tests/engine.test.mjs   # 29 CPU/interface regressions
node scripts/check.mjs              # modules parse, a frozen frame evaluates, §6 is not stale
node tests/sky-rig.mjs              # compiles both shaders against a mock driver, resolves every
                                    # uniform, feeds a weather pick through, disposes cleanly
```

The 29 tests cover the known anchors, initialization and lift behavior, null precedence, aerosol
paths, deck caps, twilight, moon timing, DST, seeds, optical wet/force gates, wind, night floors,
resolution, and uniform completeness. Broad finite-value checks exercise 162 season/weather/hour
combinations.

The GPU checks (deterministic pixels, motion, straight alpha, LUT sampling, context loss and
recovery, the 18-case visual matrix across three aspect ratios) run in a local-only harness that
ships with the standalone build, and their saved output is in
[gpu-verification.txt](gpu-verification.txt). Visual captures from development live in the ignored
`artifacts/` directory of that build.

## Atmospheric asset generation

```sh
node scripts/bake-atmosphere.mjs
node scripts/calibrate-atmosphere.mjs
```

The deterministic bake uses a 6371 km spherical Earth, an 80 km atmosphere, a 120 m observer,
molecular/aerosol scale heights of 8/1.2 km, RGB molecular coefficients [0.0058, 0.0135, 0.0331] km⁻¹,
Henyey–Greenstein g=0.76, 36 quadratic view segments, and 12 sun-path segments. An empirical diffuse
contribution fills the shadow through twilight and fades to zero at bake altitude −12°. The two later
night floors remain distinct.

Calibration adjusts 12 constant spectral gains against the single provided noon observation. It does
not reconstruct the missing reference dataset. Bake version and host choices travel with exported
snapshots.
