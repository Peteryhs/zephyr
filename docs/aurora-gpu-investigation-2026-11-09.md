# Aurora GPU investigation — 9 November 2026

## Result

This records the initial investigation before implementation. The completed changes and measurements are in [the performance report](aurora-performance.md). After installing the update, the user reported idle GPU utilization falling from about 50% to about 17%; this is a user observation rather than a controlled benchmark.

The screenshot reports Hermes at 50.7% GPU. Code inspection and fresh isolated hardware benchmarks confirm an expensive Aurora shader, but do not establish which part of the live application accounts for that utilization. A frame cap on the sky does not cap independently animated CSS layers. Do not call the problem fixed on the basis of the previous star-paint benchmark.

Two GPT-6 Luna agents independently reviewed the shader and compositor/measurement paths. No runtime code or installed plugin was changed during this investigation.

## Evidence

- Workspace: `zephyr-latest/plugin.js`; source shader: `sky/shaders.js`. The workspace and both installed copies (`~/.hermes/desktop-plugins/zephyr` and `%LOCALAPPDATA%/hermes/desktop-plugins/zephyr`) have different SHA-256 hashes. The LocalAppData copy also has the two animated star canvases. Which copy the running process loaded remains unverified.
- Fresh workspace High measurements: ordinary night mean 0.606 ms/completed render; Aurora 2.427 ms. Three runs of 90 samples per case, after warm-up, at 1920×1080, DPR 1, clear night and 5 CSS px blur. Renderer: Qualcomm Adreno X1-85, ANGLE/D3D11. The LocalAppData installed copy also reproduces the expensive Aurora render (High Aurora mean approximately 2.254 ms).
- Raw measurements: `artifacts/aurora-perf/audit-20261109.json` and `installed-local-20261109.json`, plus Aurora images at all three quality settings.
- These timings include synchronous completion/readback overhead. They are neither pure GPU timings nor whole-Hermes utilization. The benchmark reports timer-extension availability but never retrieves GPU timer queries. Its synthetic timer replay and blank page exclude real application compositing.

## Confirmed expensive work

1. **Five procedural curtains per fragment.** `sky/shaders.js` has a five-iteration Aurora loop. Each curtain uses three four-octave `field()` evaluations plus additional noise, exponentials and trigonometry. Geometry, height, ray detail and brightness are recalculated across the entire sky render target every update. The base sky already caches its domain-warped cloud field; Aurora does not use an equivalent cache for these fields.
2. **High was not improved by the previous optimization.** `QUALITY.high` remains 16 fps, resolution factor .4, maximum side 1100. The current 1080p chat fixture produces a 736×414 sky. The earlier report explicitly left High shader math unchanged. Low/Balanced improvements do not establish a fix for High.
3. **Star animation bypasses the sky frame cap.** Two viewport-sized canvases crossfade with continuous CSS opacity keyframes and `will-change:opacity`, under `mix-blend-mode:screen`. This can keep compositing active at display refresh even while WebGL updates at 16 fps. No repeated painting does not mean no GPU work. Its actual contribution to 50.7% remains a hypothesis requiring an ablation.
4. **Additional filtering.** The moving sky uses horizontal and vertical WebGL blur passes; frosted interface surfaces also use CSS backdrop filters. Star animation can interact with these moving backdrops. Their contribution depends on the actual visible Hermes interface and needs a live trace.

Occasional reply-legibility `readPixels` can synchronize the GPU, but its refresh key avoids running it every sky frame. It is a secondary investigation target unless traces show frequent invalidation.

## Fix plan, in order

### 1. Establish the live baseline and isolate the cost

Confirm the loaded plugin path/version and renderer. Keep window size, display scaling/refresh, chat, weather, quality and focus identical. Allow startup and blur transitions to settle. Record 30–60 seconds per case, repeat, and compare median/range of the same OS GPU-engine counter plus Chromium GPU/compositor traces. Restore each temporary change before the next case.

- Baseline Aurora High.
- Freeze star opacity animation only, retaining both canvases at opacity .5.
- Hide the star host only. Compare against frozen stars to separate animation scheduling from layer blending.
- Disable only the Aurora shader uniform while keeping Aurora CSS/stars enabled.
- Disable interface backdrop filters only.
- Change sky cadence to 8 fps at unchanged resolution; then restore 16 fps and use Balanced resolution. This distinguishes cadence from pixel cost.

Run instrumented variants from an isolated plugin test copy. Do not overwrite the installed plugin or modify user settings merely to benchmark it.

### 2. Remove work outside the selected frame budget

If freezing stars materially lowers utilization, replace continuous CSS crossfading with bounded updates on the sky cadence (or a slower explicit twinkle cadence), retaining the two seeded patterns and current brightness. A static-star control should remain in the diagnostic fixture. Avoid a separate perpetual animation loop. Honor reduced motion, visibility, focus, background-off and disposal. If hiding even frozen stars makes a large difference, test a single star surface and ordinary alpha blending against the existing screen blend before choosing an implementation.

### 3. Reduce Aurora shader cost while retaining 16 fps

First test Balanced-sized rendering at 16 fps: the benchmark target has about 39% of High's pixels. This is a candidate, not an established visual-quality match. Compare curtains, color, horizon and motion at multiple animation times, window sizes, DPRs and blur levels.

If that loses visible detail, split the slowly varying curtain quantities into cached low-resolution textures, or render the Aurora contribution separately at lower resolution and upscale. Preserve crisp stars separately. Profile each change before adding complexity; splitting render passes has its own bandwidth and memory cost. Reduce noise octaves or curtain detail only after visual comparisons demonstrate acceptable results. Edit the shader source and regenerate the embedded plugin with `npm run build:sky`.

### 4. Verify and deploy

Run relevant lifecycle/quality tests, `npm test` and `npm run check` after implementation. Add regression coverage for any new scheduler logic, including no timers/draws after disposal, hidden/background-off behavior, reduced motion, focus changes and quality changes. Compare screenshots at fixed seeds/times and inspect live motion. Repeat the live baseline cases on the same GPU and display. Ship only with a demonstrated sustained utilization reduction at 16 fps and acceptable appearance; report absolute before/after values, variation and configuration. Keep installation as a separate final step after validating the patch.

## Immediate mitigation

Use Balanced (8 fps, lower resolution) or Low (4 fps). These settings now apply to Aurora, but independent star compositing may remain. This is a workaround, not proof the 50.7% issue is resolved.

## Reference context

Chromium describes compositing as GPU combination of retained layers, including opacity-animated layers: https://www.chromium.org/developers/design-documents/gpu-accelerated-compositing-in-chrome/

MDN documents the synchronous readback pitfalls relevant to interpreting the existing benchmark: https://developer.mozilla.org/en-US/docs/Web/API/WebGL_API/WebGL_best_practices
