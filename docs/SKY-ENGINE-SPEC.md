# Zephyr sky engine — clean-room build spec

Target: a drop-in replacement for the WebGL sky inside the Zephyr plugin for
Hermes Desktop. Version 1.0, 12 October 2026.

## 0. Read this first

You are building **original code**. The engine that ships today is a vendored
third-party shader that cannot be licensed, so it is being replaced.

**Firewall (non-negotiable):**

- Do NOT open `hark.com`, `hark.com/wallpaper_core.html`, or any copy of it.
- Do NOT read the sky engine in the current `plugin.js` (the block marked
  `HARK SKY`), and do NOT read it from the repository's git history or from
  `~/.hermes/drafts/hark-sky/`.
- Do NOT search the web for that engine, its palette, its variables or its
  look-up tables.
- Do NOT copy code, constants, palettes or variable names from any source that
  does not carry a licence named in §12.

Violating the firewall makes the rebuild worthless: the whole point is that the
result is cleanly licensable. Work only from this document, public
meteorological and astronomical facts, and the permissively licensed
references in §12.

## 1. What you are building

A self-contained, physically-motivated sky renderer that:

1. Paints a full-viewport sky behind the Hermes Desktop app, on a WebGL canvas
   at `z-index: -1`, so the app's own surfaces stay in front of it.
2. Follows the real sun at a given latitude and longitude, at the real time.
3. Follows real weather: cloud cover, cloud type, precipitation, visibility.
4. Grades its own output so that translucent panels above it stay readable.
5. Costs almost nothing when the app is in the background.
6. Degrades to the host's existing CSS gradient sky when WebGL is unavailable
   or the shader will not compile.

Visual character: photographic and calm, not stylised. A viewer who knows the
weather should recognise it in the image. No cartoon gradients, no banding, no
visible tiling, no strobing.

## 2. Deliverables

| File | What it is |
| --- | --- |
| `sky-engine.mjs` | The engine. Plain ESM, one file, no imports outside its own code. |
| `sky-probe.html` | Standalone page: same engine, on a plain page, with a status chip and manual dials. Used to judge the look without the app. |
| `sky-tests.mjs` | CPU-side test run (see §11). Prints `ALL CHECKS PASSED` or the failures. |
| `sky-gl-test.mjs` | Mock-GL draw test (see §11). |
| `INTEGRATION.md` | The exact edits to `plugin.js`, in the shape described in §10, with the before/after strings. |

Deliver them as a directory the owner can drop in. Nothing in `sky-engine.mjs`
reads the filesystem, the network or any DOM node it did not create.

## 3. Hard constraints

1. **One file, plain ESM, no build step.** No npm dependencies, no bundler, no
   TypeScript, no JSX. `node --check` on a copy named `.mjs` must exit 0.
2. **No network.** The host fetches weather and hands it to you (§5). You never
   fetch.
3. **No imports.** The file must stand alone. Do not import three.js or any
   other library at runtime. If you derive maths from a permissively licensed
   library, **port the maths into the file and credit it in the header** (§12).
4. **Only DOM you own.** You create one container element, one canvas and one
   style element. You never read app state from the DOM, never query app
   selectors, never touch `document.head` beyond your own style element.
5. **Disposable.** After `dispose()`, no element, listener, timer, animation
   frame or GL object of yours remains (§9).
6. **Host-driven clock.** You never call `new Date()` for the sky's own time
   except once at construction. All time comes from the clock function the host
   installs (§4).
7. **Deterministic.** Same inputs plus same clock = same frame. All noise is
   seeded by you, never by `Math.random()`.
8. **No power-state logic.** Never inspect battery, AC or power profile. Frame
   rate is the host's business (§7).
9. **Tolerate nonsense inputs.** Missing weather, `null` fields, latitude 89,
   polar night, a window of 1 pixel. Never throw, never produce NaN, never
   produce a black frame because a value was missing.
10. **Reduced motion is respected by the host, not by you.** The host lowers the
    frame rate to 0.25 fps. You still animate; you must look correct when
    sampled almost never.

## 4. The API you must export

```js
export function createSkyEngine(opts)   // -> engine object, or null
export const MET_PRESETS = { /* see §8 */ }
```

`createSkyEngine(opts)` receives:

| Field | Type | Meaning |
| --- | --- | --- |
| `quality` | `'low' \| 'balanced' \| 'high'` | Resolution and frame-rate class. Default `'balanced'`. |
| `lat`, `lng` | number | Degrees. May be approximate. Default `43.47`, `-80.54`. |
| `onError` | function | Called with one string when something recoverable fails. |

Return `null` (never throw) when: WebGL2 and WebGL1 are both unavailable, the
shader fails to compile, or the context is lost permanently. The host treats
`null` as "use the CSS sky" and never calls you again.

The returned engine must expose exactly these methods:

| Method | Semantics |
| --- | --- |
| `start()` | Begin rendering. Called once, immediately after creation. |
| `setLocation(lat, lng)` | New place. Recompute solar geometry. No visible flicker. |
| `setClock(fn, preview)` | `fn()` returns a `Date`. `preview === true` means a 60-second time-lapse is running, so render smoothly rather than settling. The host always finishes by installing `() => new Date()` with `preview === false`. |
| `setWeather(met, seconds, instant)` | Blend to a new weather state over `seconds` (see §5). `instant === true` skips the blend. |
| `setWind(dirDeg, speedKmh)` | Meteorological wind direction and speed. Drives cloud drift direction and speed. |
| `setFps(n)` | Target frames a second. Fractional values are legal (`0.25` = reduced motion). |
| `setBlur(px)` | Blur the whole sky by `px` screen pixels, `0`…`20`. Cheap to change: no surface reallocation, no re-bake storm. |
| `dispose()` | Everything in §9. |

Any other method is your own business, but the host calls only the above.

## 5. Inputs

### Frame rate classes (§7 gives the budget)

```js
const QUALITY = {
  low:      { res: 0.18, maxSide: 480,  fps: 4  },
  balanced: { res: 0.25, maxSide: 720,  fps: 8  },
  high:     { res: 0.4,  maxSide: 1100, fps: 16 }
}
```

`res` scales the canvas against the viewport, `maxSide` caps the longer side in
device pixels. These numbers are the current tuning; keep them as defaults and
say in `INTEGRATION.md` if you change any.

### Weather

`setWeather` receives either a raw Open-Meteo `current` object or one of your
presets. Fields you may use, all optional:

| Field | Unit | Notes |
| --- | --- | --- |
| `weather_code` | WMO code, integer | The type of weather. The public WMO 4677 table is your reference. |
| `cloud_cover` | 0…100 | Total cover. |
| `cloud_cover_low` | 0…100 | Low deck. |
| `cloud_cover_mid` | 0…100 | Middle deck. |
| `cloud_cover_high` | 0…100 | High deck (cirrus family). |
| `wind_speed_10m` | km/h | |
| `wind_direction_10m` | degrees, meteorological | 0 = from the north. |
| `visibility` | metres | Below ~2000 m reads as haze or fog. |
| `temperature_2m` | °C | Optional. Only for subtle effects. |

Rules:

- Treat a missing field as *unknown*, not as zero. A missing `cloud_cover` must
  not produce a clear sky.
- The host calls `setWeather` with `600` seconds for live weather and `25`
  seconds when the user picks a fixed sky. A `600`-second blend must show no
  step at any moment. A 25-second blend must be visibly complete inside 25
  seconds.
- `instant === true` means: be at the new state within one frame.

## 6. What must be visible

Everything below is testable. Numbers in the acceptance column are used by the
tests in §11.

### 6.1 Solar geometry

Compute the sun's elevation and azimuth from `lat`, `lng` and the clock,
following a published algorithm (NOAA solar position, or the PSA equations).
Cite whichever you ported.

| Requirement | Acceptance |
| --- | --- |
| Sun elevation error | Within 0.5° of the NOAA reference for 6 dates × 6 latitudes spanning −60…+60. |
| Sunrise and sunset agree with the weather feed | Within 2 minutes of sunrise/sunset for the same coordinates and date. |
| Polar day and night | Latitude 70 in June and December: no NaN, no black frame, no divide-by-zero, sane colours. |
| Anchor crossings | Sampling 1 minute apart across dawn, midday, dusk and midnight changes the mean frame colour by less than 2/255 per step. No jump, no step function. |

### 6.2 The day

Four named phases, in this order: `dawn`, `day`, `dusk`, `night`. Their
boundaries come from the real solar times, not from fixed hours: dawn starts
before sunrise, dusk starts at sunset and lingers past it.

| Phase | What the viewer sees |
| --- | --- |
| Dawn | Warm low band on the sunrise side, cool grey-blue above it, dim and soft. |
| Day | Clear blue overhead, brighter toward the sun, white to grey cloud decks. |
| Dusk | Deep blue overhead, saturated orange-to-magenta band at the horizon, long shadows of cloud structure. |
| Night | Very dark blue, not black. A faint gradient, cloud edges barely readable. |

Acceptance:

- Mean luminance of a mid-day frame is at least 3× the mean of a night frame.
- At a sun elevation between −6° and +6°, the mean hue of the lower third of the
  frame is warmer than the upper third by at least 10 degrees of hue.
- Night frames: mean luminance of the brightest 10% of pixels stays below 0.15
  in linear terms, and no pixel clips to pure white.
- No visible banding: sampling a vertical line of the frame must not show more
  than 3 steps larger than 4/255 in a row.

### 6.3 Clouds

Cloud comes from the three deck fractions and the WMO code. Derive the decks
with public meteorological reasoning: low cover makes flat-bottomed cumulus and
stratocumulus, mid cover makes sheets, high cover makes thin cirrus, codes for
showers and thunderstorms make convective towers, codes for drizzle and rain
make layered dark decks, fog codes plus low visibility make a washed-out haze.

| Requirement | Acceptance |
| --- | --- |
| All three decks clear | No cloud structure anywhere: the frame's local contrast is that of the bare sky. |
| Each deck alone | Low-only, mid-only and high-only each produce a visibly different, correctly placed structure. |
| Overcast | Cloud covers more than 90% of the frame. |
| Rain versus dry at equal cover | Mean luminance drops by at least 15%. |
| Fog | The horizon-to-zenith contrast collapses: less than half the contrast of a clear day. |
| No tiling | No repeating pattern with a period shorter than the viewport: same check as the seam test, run on a wide window. |
| No seams | Any mask or sheet edge is soft: no straight line of more than 3% contrast across it. |
| Structure holds | At least 4 distinct cloud sizes are visible at once (large banks, medium puffs, small detail, edge wisps). A single scale reads as wallpaper. |

Motion:

- Clouds drift with the wind: direction from `wind_direction_10m`, speed scaled
  from `wind_speed_10m` with a floor and a cap, so 5 km/h and 60 km/h look
  different but neither is a strobe.
- The cloud field changes shape slowly over minutes, not seconds.
- Switching weather by hand settles in about 25 seconds (§5).

### 6.4 Grade, panels and legibility

The sky sits behind translucent panels. Your grade decides whether text stays
readable.

| Requirement | Acceptance |
| --- | --- |
| Bright sky | A user-facing control exists in the probe page for exposure. Default must keep a 2.5 mm white text line readable over the sky's brightest area. |
| Bright sky and dark sky differ | The mean luminance of the sky's own output at midday is at least 2.5× that of a storm frame, after grade. |
| No clipped highlight | The sun disc may clip, nothing else does: less than 0.5% of pixels at pure white on any frame. |
| Vignette, if any | Symmetric, and lighter at the horizon than the corners by no more than 20%. Decoration is allowed only when it serves readability. |

### 6.5 Day preview

The host can run the next 24 hours in 60 seconds. Sampled at 4 fps for that
minute, the sequence must read as a day passing, with no flicker, no jump in
exposure, and no single frame that looks like an error.

## 7. Performance

Frame rate is the host's to set. Your job is to be cheap at every rate.

| Requirement | Acceptance |
| --- | --- |
| Cost at `balanced` | Mean GPU time per frame under 6 ms at 1600×900 on an RX 9070 XT. Measure, do not estimate, and put the number in `INTEGRATION.md`. |
| Cost when idle | At `setFps(0.25)`, the process must show under 1% GPU: no work outside the sampled frames. |
| Background window | When `document.hidden`, no frame is drawn and no timer fires more than twice a second. |
| Adaptive resolution | If a frame exceeds 12 ms, drop the render scale by 25%, up to three times, and never below `maxSide` 320. Report the drop through `onError`. Never fight the host's `setFps`. |
| Blur changes | `setBlur` must not allocate a new GL surface or resample a texture per call. |
| Memory | Steady state under 120 MB of GPU memory at `high`. |
| No layout work | The engine never reads `offsetWidth`/`getBoundingClientRect()` per frame. Resize is observed, not polled. |

Never cap the frame rate yourself, and never throttle because of battery state
(§3.8). If you think the numbers above force a cheaper look, ship the cheaper
look and say so.

## 8. The nine fixed skies

The settings UI lists these names. Keep them exactly, and export
`MET_PRESETS` so the host can ask for any of them by key.

| Key | Label in the UI | Look |
| --- | --- | --- |
| `clear` | Clear | No cloud. Deep blue, hard sun. |
| `fair` | Fair-weather cumulus | Scattered low puffs, flat bases, sun between them. |
| `partly` | Partly cloudy | About half the sky in low and mid cloud, blue showing through. |
| `cloudy` | Cloudy | Most of the sky in layered grey cloud, no blue except small gaps. |
| `cirrus` | Cirrus | Thin, bright, streaky high cloud across a blue sky. |
| `overcast` | Overcast | One flat grey sheet, no blue, no sun disc. |
| `rain` | Rain | Dark layered decks, visible rain, wet surface light. |
| `storm` | Storm | Convective towers, very dark bases, high contrast, rain. |
| `fog` | Fog | Luminance flat, horizon lost, faint sun glow. |

`MET_PRESETS[key]` must be an Open-Meteo-shaped object as in §5, so the same
code path handles a preset and live data. Pick honest values: `overcast` must
produce overcast under §6.3's tests.

The plugin also keeps a synth fallback for offline use that picks one of these
keys; the host does that mapping, not you.

## 9. Mounting, painting and disposal

- Container: `<div id="zephyr-sky-root">` appended to `document.body`, holding
  the canvas. Style it inline or from your own style element:

  ```
  position: fixed; inset: 0; z-index: -1; pointer-events: none;
  overflow: hidden; aria-hidden="true";
  ```

  A negative `z-index` descendant paints above the page background and below
  every in-flow app surface, which is why no panel needs restyling.
- Style element: `<style id="zephyr-sky-style">`, created once, rewritten in
  place. Never `document.head` for anything else.
- On `register`, sweep your own ids first, in a loop, because a duplicate id
  makes `getElementById` return the same stale node:

  ```js
  for (const id of IDS) { let el = document.getElementById(id); while (el) { el.remove(); el = document.getElementById(id) } }
  ```

- On `dispose()`: cancel the animation frame and every timer, remove all
  listeners, delete the GL program and textures, lose the context deliberately,
  remove the canvas, container and style element, and clear any CSS variable
  you wrote. The test in §11 checks this by counting your nodes after disposal.
- Context loss: listen for `webglcontextlost`. On loss, stop drawing and call
  `onError('context lost')`. On restore, rebuild and continue. If the rebuild
  fails, `dispose()` yourself and report through `onError`.

## 10. Integration into `plugin.js`

`plugin.js` is one file, split into numbered sections. Your engine replaces the
section marked `§6 HARK SKY ENGINE`, and nothing else.

1. **Delete** the whole of §6, from its header comment to the line before
   `§7 SKY PAINTING, THEMES, SOLAR & WEATHER SYNC`. That includes the vendored
   block, the weather-to-weights mapping, the weather preset table and the
   quality table.
2. **Splice** `sky-engine.mjs` in its place as one self-contained block:
   `const SKY = (() => { ... })()` in the same style the plugin already uses,
   exporting `createSkyEngine` and `MET_PRESETS` into the plugin's scope.
   Wrap it in an IIFE so its `const` names cannot collide with the plugin's.
3. **Re-declare** `QUALITY` inside the new block (the host reads it in
   `applyFpsCap`).
4. **Factory:** `ensureGl()` currently calls `createHarkSky(skyOpts)`. Change
   that one call to `createSkyEngine(skyOpts)`. Keep the `null` fallback path
   untouched: on `null`, `glFailed` is set and the host's CSS sky stays.
5. **Weather:** rewrite `applyWeather` to pass Open-Meteo data straight through
   and to read the fixed skies from `MET_PRESETS`:

   ```js
   const applyWeather = (instant = false) => {
     if (!glSky) return
     const mode = weatherMode.get()
     const live = mode === 'live' && liveWeather
     const met = live ? liveWeather : (MET_PRESETS[mode] || MET_PRESETS.fair)
     glSky.setWind(met.wind_direction_10m ?? 250, met.wind_speed_10m ?? 15)
     glSky.setWeather(met, live ? 600 : 25, instant)
     weatherNow.set(/* the same human-readable string as today */)
   }
   ```

   Delete the old weights helper and the old preset table with §6. Keep the
   synth-offline path: it picks a key from the existing list and uses
   `MET_PRESETS`.
6. **Settings copy:** two rows describe the old engine and must be rewritten to
   the new behaviour, same UI, same writers:
   - the `Realistic sky` row's `description` (currently mentions the sun, clouds
     that follow the weather and twilight colours);
   - the status line's `painted sky` / `sky at N fps` strings (keep the same
     shape, so the settings page still reports the live state).
7. **Keep untouched:** §5 app CSS, §7 sky painting and solar sync, `paintSky`,
   `clearSky`, `skyStyleFor`, `syncSolar`, `syncWeather`, the theme code and the
   phase chip. The CSS sky is the fallback and stays.
8. **Add a credit line** in the file header: the sky engine is original, and
   list the sources you ported maths from with their licences (§12).

## 11. Tests you must write

Two commands, both runnable with plain `node`, no dependencies.

### `node sky-tests.mjs` — CPU side

1. Solar geometry versus the NOAA reference, 6 dates × 6 latitudes, ≤0.5° error.
2. Sunrise and sunset within 2 minutes of a fixture you record from the
   Open-Meteo API for the same coordinates and dates, and commit next to the
   tests.
3. Colour invariants from §6.2 (day/night luminance ratio, horizon warmth,
   night floor, banding).
4. Weather mapping invariants from §6.3 (all-clear contrast, deck isolation,
   overcast fraction, rain darkening, fog contrast collapse).
5. Blend behaviour: a 600-second transition sampled every 10 seconds never
   steps by more than 2% of the total change; a 25-second transition is within
   1% of its target at 25 seconds; `instant` is exact at frame one.
6. Frozen clock: subclass `Date` to pin an instant, render the colour model for
   that instant, and assert the exact expected values. Also assert that a
   midpoint lands strictly between its two neighbours, never equal to either.
7. Anchors: 1-minute steps across each phase boundary, mean colour delta under
   2/255 per step.
8. Robustness: `null`, `{}`, `{cloud_cover: null}`, latitude 89, longitude 181,
   a 1×1 pixel surface. No throw, no NaN, no black frame.
9. Seeded noise: the same seed produces the same field twice.
10. `createSkyEngine` returns `null` when the GL stubs report no context.

### `node sky-gl-test.mjs` — mock GL

Stub a GL context that records calls. Assert: shaders compiled, program linked,
uniforms uploaded and every one finite, exactly one draw per frame, no draw
when `document.hidden`, `setFps(0.25)` produces at most one draw per 4 seconds
of simulated time, and `setBlur` triggers no surface reallocation.

### `sky-probe.html`

A plain page with the engine mounted, a status chip, and dials for time of day,
latitude, each of the nine skies, exposure, blur and quality. The chip must be
green when a frame completes, orange on a shader error, red when WebGL is
missing, purple on a JavaScript error, so a failure is one glance and not a
mystery. Include a `?t=2026-06-21T05:12&lat=43.47&lng=-80.54` style query so a
specific moment can be judged directly.

## 12. Licences and attribution

- The repository is MIT. Everything in `sky-engine.mjs` must be original or
  ported from code that permits it.
- Allowed sources, cite the exact one you use in the file header:
  - three.js `Sky` addon (MIT) — Preetham-style atmospheric scattering.
  - `wwwtyro/glsl-atmosphere` (The Unlicense, public domain) — Rayleigh and Mie
    scattering.
  - The Preetham (1999) and Hosek-Wilkie (2012) sky papers — models, no code.
  - Ken Perlin's noise and Simplex noise — public domain.
  - The public WMO 4677 weather-code table, and public meteorological
    definitions of the cloud genera.
- Forbidden: any code, table, palette or naming from the vendored engine being
  replaced, or from its source site. If it is not in the list above, do not
  copy it. Port the maths, do not paste the file.
- Header format:

  ```js
  /**
   * Zephyr sky engine — original implementation.
   * Atmospheric scattering maths ported from three.js Sky (MIT, © three.js authors).
   * Noise: Perlin, public domain. Weather codes: WMO 4677.
   * No third-party renderer is vendored in this file.
   */
  ```

## 13. Definition of done

1. `node --check sky-engine.mjs` exits 0.
2. `node sky-tests.mjs` prints `ALL CHECKS PASSED` and the full check count.
3. `node sky-gl-test.mjs` passes.
4. `sky-probe.html` renders in Chromium (`--headless=new --disable-gpu
   --screenshot=out.png --window-size=1600,900`) with a green chip, and the
   screenshot is not a flat colour and does not clip to white.
5. `INTEGRATION.md` lists the exact edits, with the search strings to find them.
6. The engine is pasted into `plugin.js`, the plugin loads clean (`node --check`
   on a `.mjs` copy, and the app). Note that `tests/run.mjs` covers the 8
   October snapshot only, so it is not evidence for this change: write the
   plugin-level check you actually ran into `INTEGRATION.md`.
7. Measured numbers, not estimates: frame time at `balanced`, GPU at `0.25` fps,
   GPU memory at `high`. State plainly what you did not measure.
8. A screenshot or screen recording of the app with the new sky, for the owner
   to accept the look.

## 14. Decisions for the owner

These need a human answer. Ask, do not guess.

1. Stars at night: none today. Add a sparse, faint star field above a set
   elevation threshold, or keep the sky clean?
2. Moon: skip it, or a soft disc with the real phase?
3. Sun disc: visible disc with a bloom, or only atmospheric glow around it?
4. Grade: neutral and photographic, or a touch more contrast and saturation
   than reality, which reads better behind glass panels and through a blur?
5. Cost of the look: if matching §6.3's cloud structure costs 8 ms a frame
   instead of 4 ms, accept the cost at `high` only, or simplify everywhere?

## 15. Do not

- Do not read the code being replaced, its site, or any mirror of it (§0).
- Do not add a dependency, a build step, or a second file the app loads.
- Do not restyle the app or touch anything outside §6 and the three host edits
  in §10.
- Do not invent numbers. Measure, then write the number down, or write
  "not measured".
- Do not keep two engines: when the new one lands, the old block is deleted,
  not parked behind a flag.
