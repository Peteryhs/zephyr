# Aurora performance measurement and optimization

## 9 November update: cap compositing and High pixel cost

High Aurora now uses at most Balanced's background resolution while retaining the selected 16 fps cadence. Low/Balanced and ordinary Sky resolution are unchanged. The shader's five curtains, palettes and motion equations are unchanged; crisp stars retain their separate canvases. At the 1080p/5px blur fixture, High Aurora drops from 736×414 to 460×259 (61% fewer shaded pixels).

The two star patterns now crossfade through explicit opacity updates at 4 Hz over a 24-second cycle. There are no continuous star CSS animations or transitions. Star timers stop when hidden, unfocused, disabled or under reduced motion; motion-preference changes are observed and cleaned up on disposal. Reduced motion retains both patterns at half opacity. The occasional meteor is unchanged.

New measurements on the same Adreno X1-85/ANGLE/D3D11 hardware:

| Isolated measurement | Before | After |
| --- | ---: | ---: |
| Workspace High Aurora mean completed-render latency | 2.427 ms | 1.206 ms |
| Installed-copy High Aurora mean completed-render latency | 2.254 ms | 1.053 ms |
| Star-only DrawFrame events over 2.5 seconds | 300 | 10 |
| Star-only Paint / RasterTask events | 0 / 0 | 0 / 0 |

The star trace includes `disabled-by-default-devtools.timeline.frame` to capture compositor frames. It demonstrates that the previous paint-free opacity animation still kept the compositor drawing at 120 Hz in this environment. The revised star-only case draws at 4 Hz, with 10 small style updates (about 1.9 ms total) and no painting/raster tasks during the sample. This is a short isolated trace, not a whole-Hermes utilization measurement; meteors were outside the trace interval.

Retained raw results are in `docs/benchmarks/aurora/2026-11-09/`: `workspace-before.json`, `workspace-after.json`, `installed-before.json`, `installed-after.json`, and `before-stars.json` / `after-stars.json`. Local screenshots and installation snapshots remain in `artifacts/aurora-perf/`. Render timings use the synchronous completion/readback method described below. They cannot be converted into a Task Manager GPU percentage.

Visual comparison used the existing Aurora appearance as the contract: preserve composition, colours, crisp stars, horizon and motion. Eight fixed-clock full-display screenshots cover 1440×900 with 5px blur, a later animation phase, no blur, and 390×844 with 5px blur, before/after. Images retain the same appearance with some softer fine detail at lower background resolution; this tradeoff is most visible without blur. Reproduce with `node scripts/aurora-visual.cjs`; it reads the baseline from Git revision `761acc8`, or an alternative revision supplied as the first argument.

Validation: all 143 unit tests pass and `npm run check` passes. `npm run rig` has one unrelated existing failure, its 04:30 dark-zenith expectation (0.399 measured versus <0.25 expected); the untouched saved baseline reproduces the same failure. The resolution regression covers desktop, 4K and narrow viewports, restoration after disabling Aurora, Low/Balanced preservation and unchanged cadence. Star lifecycle tests cover lazy allocation, bounded brightness, motion-preference changes, focus/visibility, background-off and disposal.

The targeted resize/star changes were merged into `%LOCALAPPDATA%/hermes/desktop-plugins/zephyr/plugin.js` with all other installed code preserved. A sibling `plugin.js.before-aurora-20261109.bak` holds the original, and the installed output hash was verified against the tested candidate. After loading the update, the user reported idle GPU utilization falling from about 50% to about 17% (roughly a two-thirds reduction). This is a user observation rather than a controlled whole-application measurement.

## 2 November baseline report

Measured 2 November 2026 on this Windows machine, Qualcomm Adreno X1-85 through ANGLE/D3D11. These are controlled browser measurements on real hardware, not whole-Hermes CPU or battery measurements.

## Findings

Aurora forced High rendering resolution and at least 15 fps regardless of the selected quality. At 1920 × 1080 with the conversation blur settled at 5 CSS px, Low and Balanced both rendered a 736 × 414 sky. Regular night used 331 × 186 on Low and 460 × 259 on Balanced.

The separate starfield animated two full-window CSS noise masks continuously. Its paints were independent of the sky's 4/8/16 fps settings. It also generated the masks during plugin registration even when Aurora was not selected.

## Changes

- Aurora uses the selected resolution and frame rate. High remains 16 fps at the original resolution. Preview, reduced-motion and unfocused-window limits remain in place.
- Star canvases are allocated only when Aurora is visible, and reused until window size changes.
- Two static, independently varied star brightness patterns crossfade with compositor opacity. This replaces continuous mask painting; it changes the twinkle pattern without changing the northern lights shader.
- Star twinkle pauses when the window is hidden, unfocused, or Aurora/background is disabled. Reduced motion disables its animation.
- Star canvas density is capped at 1.5 device pixels per CSS pixel. Two retained layers trade some backing-store memory for eliminating repeated raster work; at DPR 2 their combined raw pixel storage is about 35.6 MiB, versus 31.6 MiB for the old single canvas, excluding browser intermediates.

## Results

Three warmed runs of 90 sampled frames per quality/look, with fixed clear weather, location and night time. Each sample waits for a synchronous pixel readback so GPU completion is included. Times include CPU submission, GPU work and driver/readback overhead; they are not pure GPU timings.

| Aurora quality | Before canvas | After canvas | Mean completed render before → after | Replay render budget before → after |
| --- | --- | --- | --- | --- |
| Low | 736 × 414 | 331 × 186 | 2.42 → 1.21 ms/frame | 33.8 → 4.8 ms/s (~86% lower) |
| Balanced | 736 × 414 | 460 × 259 | 2.51 → 1.21 ms/frame | 35.0 → 9.3 ms/s (~73% lower) |
| High | 736 × 414 | 736 × 414 | 2.32 → 2.50 ms/frame | 34.3 → 37.0 ms/s |

The replay advances the scheduled timer by its requested delay plus 5 ms, giving approximately 3.92, 7.69 and 14.81 fps for 4/8/16 fps caps, and 13.95 fps for the old 15 fps floor. Budgets are mean completed-render latency multiplied by replay cadence. They estimate rendering demand, not utilization of a CPU core. The unchanged High shader does not have a measured rendering improvement. Its benefit comes from the separate star-layer optimization. Regular night render times remained around 0.56 ms/frame on Balanced; Aurora still has a more expensive shader.

In a separate, focused-window 2.5-second star-only trace at 1920 × 1080 and DPR 2, after initial painting:

| Star-layer activity | Before | After |
| --- | ---: | ---: |
| Paint events | 600 | 0 |
| Paint duration | 95.3 ms | 0 ms |
| Style-update duration | 62.4 ms | 0.18 ms |
| Raster tasks | 1200 | 0 |
| Raster-task duration | 51.6 ms | 0 ms |

Durations from different trace categories can overlap and should not be summed. This is one short steady-state trace, not a general guarantee that Hermes never repaints.

Median star-layer setup over nine warm samples, after discarding the first sample: non-Aurora 27.1 → below the 0.1 ms clock resolution; active Aurora 32.4 → 5.7 ms. Whole-plugin startup and shader compilation are outside these setup numbers. First-use compilation can still be expensive.

The deterministic High sky PNGs before and after have the same SHA-256 hash. Balanced intentionally trades resolution and cadence for lower cost; the lights remain visible under the existing 5 px blur. No northern-lights shader math was changed.

The later reply-legibility feature does not change these frame settings or the star layers. It adds an occasional retained-buffer readback during material refresh, so these historical measurements do not include that refresh cost. See the [reply-legibility report](reply-legibility.md) for current measurements and limitations; no new whole-Hermes CPU or battery claim is made.

## Reproduction

The optional benchmarks use Playwright. Set `ZEPHYR_PLAYWRIGHT_ROOT` to a directory containing its installation and optionally `ZEPHYR_CHROMIUM` to a Chromium executable. On this Windows machine they discover the existing Hermes tools and installed Playwright browser.

Run from the repository root:

```text
node scripts/aurora-perf.cjs plugin.js current
node scripts/aurora-stars-perf.cjs plugin.js current
```

Pass a saved baseline plugin file as the first argument and a different label as the second to compare versions. Run measurements sequentially. JSON and PNG outputs go to `artifacts/aurora-perf/`; the baseline for this audit is `artifacts/aurora-perf/before.js`. The scripts load only the test plugin and SDK stubs, never personal sessions or app data. The star trace uses actual wall time; the sky replay uses a controlled clock and deterministic weather. Screenshot comparison covers the sky shader, not the changed CSS star animation.
