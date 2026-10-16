# Compatibility ledger

Target: the formulas and ordering of Dynamic Sky rebuild specification 1.0. Independent atmospheric colors are calibrated observations, while geometry and gate outputs are compatibility checks.

## Preserved behavior

- Explicit desktop-scene application; the factory starts in Sunnyvale with the base grade.
- Noncompounding lift; partial lift resets omitted exposure/saturation/vibrance factors to one.
- Cloud floor 7%, no upper clamp in the evaluator, simulator overrides distinct from direct weather-code changes, and sunny/ordinary deck caps of 0.30/0.75.
- Separate live/manual/simulator aerosol paths, compressed display AOD, physical excess reddening, and independent humidity turbidity.
- Fractional-day solar geometry, asymmetric below-horizon projection, designed horizontal solar sweep, approximate lunar ephemeris, base-date phase/seeds, nearest ±12-hour manual moon shift, and strict −5° body handoff.
- Date-override DST inconsistency between displayed hour and simulated-date solar offset.
- JavaScript rounding, wrapping 32-bit products and Mulberry32 seeds; no seed interpolation.
- Shared palette exposure adaptation; display-encoded downstream compositing; sequential versus simultaneous palette mixes exactly where specified.
- Gray dip, rose afterglow reusing the night carrier, monthly-dust purple/fan gates, wet suppression, and force flags that retain altitude timing.
- City-light ebb jump at 23:00; weather and time influence remain partial off switches.
- Fibrous cirrus, two nested domain warps, stationary physical-pixel grain, curtains instead of particles, enlarged halo, shifted halo center, logarithmic iridescence, seam-free ray noise, and distinct distance conventions.
- All 47 uniforms; alpha null defaults to one, alpha zero remains zero; RGB is not premultiplied.
- Final dark-blue floor remains active at dial zero, after vignette/LUT and before grain/dither.

## Independent data and integration choices

| Area | Choice and consequence |
| --- | --- |
| Atmospheric dataset | Independent spherical single scattering plus empirical multiple-scattering closure; floating-point storage, per-view spectral calibration. No exact palette/body-color parity. |
| Night bake | Empirical diffuse light fades smoothly from bake elevation −8° to zero at −12°. This is an independent asset decision, not a reference equation. |
| Optional LUT | Identity 33³ strip is bound by default; amount zero. Caller can supply the missing custom image through `setLUT`. |
| Desktop time zone | Explicit America/Toronto instead of silently selecting the host machine zone. A caller can choose any IANA zone. |
| Evaluation instant | One immutable epoch per evaluation; eliminates mixed reads at midnight/DST. The documented date-offset mismatch is otherwise preserved. |
| Offset caching | Intl formatter instances are cached; the reference's 30-second offset cache/32-key eviction is omitted. |
| Animation rate | t starts at zero and advances 0.5 units per real second, providing slow visible drift and shape evolution. Manual hour and day playback do not accelerate cloud motion. |
| CPU scheduling | One evaluation per second, and immediately after input. CPU day playback runs each frame. No gate interpolation or weather/body crossfade. |
| Suspension | Hidden-tab and context-loss time do not accumulate; deltas are bounded to 100 ms. Reduced-motion preference pauses clouds initially unless the user explicitly selects motion. Pause/resume updates the URL so refresh preserves that choice. |
| Resolution | CSS window size × device pixel ratio, capped at DPR 2. No automatic render-scale adaptation. Grain uses the resulting physical pixel dimensions. |
| Color target | WebGL normalized RGBA drawing buffer in sRGB display space; shader emits already encoded display RGB. No extra gamma encode. Blending/depth disabled; `premultipliedAlpha:false`. |
| Scene UI | Added host controls, PNG and JSON exports, fullscreen, custom places, and two-minute day playback. No automatic weather feed, saved settings, terrain, particles, stars, or invented astronomical features. |
| API shape | Clean explicit scene/environment/tuning snapshots plus adapter vocabulary. `skyState` groups these values; it is not a drop-in copy of the original flat mutable object. Base grade constants are frozen. |
| Invalid input | Evaluator rejects nonfinite epochs/coordinates/manual hours; renderer rejects nonpositive/nonfinite dimensions; UI constrains percentages, coordinates, valid dates/zones and wraps hours. Unsupported simulator cover/wind fall back to scene values instead of propagating undefined. Other low-level values retain the specification's permissive arithmetic. |

## Visual contract

- Surface: interactive simulation, canvas first.
- User job: inspect the sky across time, weather, season and place.
- Reference family: quiet creative tool; all visual interest comes from the working simulation.
- Design source: supplied sky specification, empty repository, inferred restrained canvas-tool interface.
- Density: low over the sky, compact dock and optional scrollable inspector.
- Layout: full viewport canvas; small identity/location header; time/timeline/weather dock; optional atmosphere/location/information panels. Mobile dock reflows into three rows.
- CRUD create mode: not applicable.
- Required states: live/manual time, running/paused clouds/day, selected weather, open/closed panels, invalid location input, reduced motion, graphics loss/restoration and render failure.
- Forbidden tells: marketing hero, decorative dashboard cards, fake weather readings, stars/terrain/particles outside the reference, generic sunrise gradient replacing the atmosphere.
- Tokens: ink #20303d, secondary #596874, action #315d83, panel #f9fbfc, rule rgba(40,61,78,.13); Segoe UI Variable/Segoe UI; 16 px dock/panel radius, 8 px controls; translucent controls keep contrast independent of sky brightness.
- Verification: CPU anchor tests, real GPU pixel tests, desktop/mobile screenshots, all 18 fixed scenes in three aspect ratios.
