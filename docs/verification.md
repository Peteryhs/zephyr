# Verification record

15 October 2026. Windows, Node.js 24.5.0, Codex in-app browser/WebGL. These checks validate the independent rebuild. They do not assert reference pixel parity or replace user visual approval.

## CPU and interface

`npm test`: **29 passed, 0 failed**. The selected Toronto geometry/field/gate anchors match the specification within 10⁻⁶. Tests also exercise initialization, partial/idempotent lifts, null/zero precedence, the 7% cloud floor, deck caps, measured/manual/simulated aerosol paths, humidity and visibility gates, twilight gray dip and afterglow, −5° handoff, lunar timing, IANA/DST behavior, seed stability, force semantics, precipitation, night floors, wind, all five aspect examples, Oklab/gamut behavior, and all 47 uniform uploads.

162 season/weather/hour combinations produce finite snapshots. The independent noon palette stays within 0.025 per channel of the supplied observation; this is explicitly a calibration envelope.

`npm run check`: all browser modules parse, all local HTML assets exist, and a frozen frame evaluates.

## Real GPU checks

**10 passed, 0 failed**:

1. Repeated fixed-time draws are pixel-identical.
2. t=40→41 changes the cloud image (30,190 of 36,864 sampled pixels).
3. Alpha=0.4 produces byte alpha 102 while preserving the same RGB.
4. Identity 33³ finishing LUT changes channels by at most 1/255.
5. Isolated grain is identical at t=0 and t=100.
6. All 47 uniforms are active and linked.
7. A constant-red custom finishing LUT is sampled correctly.
8. Disposed/recreated resources produce identical pixels.
9. No WebGL errors occur through the finish paths.
10. A deliberately lost/restored WebGL context produces identical pixels.

The saved output is [gpu-verification.txt](gpu-verification.txt).

## Visual matrix

18 cases each rendered at **1920×1080, 1000×1000, and 1080×1920**: **54 nonblank/error-free render checks passed**. Full-resolution PNGs are saved under `artifacts/landscape`, `artifacts/square`, and `artifacts/portrait`, in the order defined by `tests/visual-cases.js`. All three gallery sheets were inspected.

Cases: clear noon; partly cloudy noon; 100% cover with sunny code; overcast; storm; fog; rain; snow; 4° low sun; −1.5° gray dip; −3.5° rose afterglow; forced −5.5° purple/fan; moonlit night; moonless morning; humid air; severe smoke at low sun; low-sun sundogs; lunar corona. The moonlit cases use 26 October so the moon is high enough to test the branch. Other cases use 15 October. Fixed epoch 2026-10-15T16:00:00Z and shader time t=40.

Review confirmed a full-height gradient, soft moving material, distinct clear/covered/wet regimes, rose twilight, dim moonless texture, absence of an ordinary brown daytime horizon, and consistent body/detail scaling across aspect ratios. An excessive night-blue residual in the initial independent bake was found and corrected; the matrix was rerendered afterward.

## Host UI

Inspected desktop 1440×900, mobile 390×844, and narrow mobile 375×667. No horizontal overflow; dock stays within the viewport. Mobile icon actions have at least 44×44 CSS-pixel targets. Optional inspectors scroll without pushing the sky or dock.

Exercised weather selection, native range keyboard stepping, sunset jump, keyboard hide/restore, panel opening/closing, invalid time-zone recovery, and Tokyo location/zone application. The PNG export downloaded successfully as `zephyr-toronto-1837.png`. Browser console showed no application errors during these checks.

## Remaining limits

- The original atmospheric payload, optional color-grade image, companion fixture JSON and reference renderings were not supplied. Exact palette/body-color parity and reference visual comparison remain unavailable.
- Visual acceptance here is an implementation review; no external/user approval images exist.
- Tests ran in one Chromium-based browser environment. Cross-GPU noise/hash identity, Safari/Firefox behavior, mobile hardware performance and a frame-rate/battery target are unverified.
- Custom LUT sampling and context recovery were tested in the local graphics harness; the absence of the original LUT prevents validation of its particular grade.

## Delivery state

The local implementation and source archive are complete. A private Site identity was registered, but no source was pushed and no version was deployed. Automatic approval review rejected the source synchronization/publication step because explicit authorization for external source-code transfer was missing. Publication remains pending user approval.

## Motion follow-up

The initial handoff used the reproducible `motion=0` verification URL, leaving the preview paused. Resuming previously failed to update that URL, so refreshing could stop the animation again. The host now synchronizes the motion flag and cloud animation time on pause/resume, displays an explicit moving/paused control, and runs at 0.5 shader-time units per real second for slow visible drift and evolution. An explicit resume also overrides the initial reduced-motion pause.

Verified pause feedback, resume, and refresh retaining the running state. With the user's fog scene and 18:38 displayed hour held fixed, animation time advanced from 110.297 to 121.301 and an unobstructed sky capture changed. The footer fits at 390×844 without overflow or overlap. All 29 CPU regressions and the module/asset check pass after the host changes. The current browser handoff is running (`motion=1`).
