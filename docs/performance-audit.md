# Zephyr performance and impact audit

24 October 2026. Working tree at `32b7cb7`. This is an audit of the current `plugin.js`, not a set of code changes. The repository was not modified.

## Short version

Zephyr's sky is cheap. The GPU cost is below the measurement floor on this machine, the per-frame CPU evaluator costs about 0.04 ms, and the recent-sessions engine costs about 0.37 ms for 500 sessions. The expensive parts are all in the DOM layer:

1. `paintSky` rewrites a 54 to 59 KB stylesheet in full. That costs **2.4 ms on a one-turn page, 30.5 ms on a 120-turn page, and 139 ms on a 500-turn page**, every five minutes. The same full write is also paid during startup and again when the solar request resolves.
2. A body-wide `MutationObserver` calls `syncPage` on the next animation frame after every transcript change. At 500 turns it accounts for **about 72 ms of main-thread work per second while a reply streams**. Disabling only that observer drops the streaming frame work from 332 ms to 45 ms over a four-second run, an 86% reduction.
3. While streaming, `scanWorkProgress` walks every mounted assistant message every 60 ms. That is **0.70 ms per pass at 120 turns and 2.82 ms per pass at 500 turns**, or about 12 and 47 ms per second.
4. The first WebGL shader compile blocks the main thread. A forced cold `createSky` (compile, link, and initial frames) took **633 ms**; a warm one took **23 to 26 ms**. The current `register()` creates the sky immediately, so a first launch after a driver or app update can pay that cost before first paint.

On a 500-turn chat the measured total is roughly **100 to 150 ms of main-thread work per second while streaming** (10 to 15% of one core), plus a 139 ms style-recalculation hitch every five minutes and 0.35 to 0.5 s of plugin startup. On a 120-turn chat the same work is about **50 ms per second** (5%) and a 30 ms hitch. A short chat stays cheap.

The highest-value fixes are: split the stylesheet into a small dynamic sheet and a large static sheet; scope the page observer and stop running it during streaming; make the fold scan incremental; compile shaders in parallel or at idle; lazy-load the non-critical sheets.

## Cost ranking

On the 500-turn page, from most to least expensive:

| Rank | Cost | Measured | When |
| --- | --- | --- | --- |
| 1 | Full sky stylesheet rewrite | 139 ms | Every 5 minutes, startup, solar sync, settings changes |
| 2 | Page observer and `syncPage` | 72 ms per second | Every mutation frame while a reply streams |
| 3 | Full-transcript fold scan | 47 ms per second | Every 60 ms while a reply streams |
| 4 | Cold shader compile | 633 ms | First launch after install, driver update, or cache clear |
| 5 | 1 Hz layout polls | under 1 ms per second | Idle and streaming |
| 6 | Sky GPU work | under 0.13 ms per second | 8 to 16 frames per second |

The ranking flips on a short chat: the 633 ms cold compile is then the largest single cost, and the 2.4 ms stylesheet is irrelevant.

## What was measured, and where

- Machine: Windows, Chromium via the OpenCode desktop browser, Qualcomm Adreno X1-85 GPU through ANGLE/D3D11. Viewport 1022 x 840 CSS px, device pixel ratio 1.75, display refresh around 120 Hz.
- Pure-CPU numbers: Node.js 24.5.0 on the same machine.
- DOM numbers: a synthetic Hermes-like page with a real browser layout engine, a sidebar, a composer with a status stack, and 1, 120, or 500 mounted turns. Each turn contains a user message, an assistant root, a conversation scaffold, an `.aui-md` body, a tool block, and a turn-duration badge. One assistant root carries the streaming marker.
- The page registers the real `plugin.js` against a stub `@hermes/plugin-sdk` and `react/jsx-runtime`. The sky runs on a real WebGL context. The measured build was a copy with non-invasive probe assignments and, for the field-cache A/B only, a one-line line-ending fix. No production code was changed. Spacious margins were on, the snippet library and status dock stayed at their defaults, and advanced mode was used unless stated.
- GPU per-pass times were taken by wrapping `drawArrays` and calling `gl.finish()` after each sampled draw. The timer resolution is 0.1 ms, so values below that are upper bounds, not precise times.
- CSS rewrite times use `textContent` replacement followed by a forced layout. The forced layout does not add to the cost: at 120 turns the same full write with only a style read was 30.49 ms, against 29.47 ms with the forced layout. The cost is style recalculation. The full-sheet numbers match the browser trace's style recalculation events (maximum 180 ms on the 500-turn page).
- `npm test`: 105 passed, 0 failed. `npm run rig` is currently red on this tree; see the last section.

These are not the real Hermes DOM. Absolute times will differ. The ranking and the scaling with mounted turns are the useful part.

## Startup

| History mounted | Import | Register, GL off | Register, GL warm | Notes |
| --- | --- | --- | --- | --- |
| 1 turn | 70 ms | 7.5 ms | not measured | Short chat |
| 120 turns | 87 to 106 ms | 62 to 78 ms | 234 ms | GL adds about 170 ms with a warm driver cache |
| 500 turns | 73 to 106 ms | 279 to 398 ms | not measured | The first full stylesheet write is 139 ms of this |

The plugin is 617.7 KiB raw, 187.0 KiB gzip, 154.0 KiB brotli. Browser import is 70 to 106 ms. A trace shows 52 to 64 ms of background `v8.parseOnBackground`, so parsing and module evaluation are a real startup cost, but not the largest one.

`register()` does its work synchronously: it creates the icon, pane-rail, stack-flare, snippet, home, motion, and sky style elements; it starts the WebGL sky; it sets up the dock, shelf, library, fold observers, page observers, and Arclike; and it reads layout several times. On the 500-turn page the first `paintSky` write is 139 ms, and the register time is 279 to 398 ms. The same work is 7.5 ms on a one-turn page and 62 to 78 ms on a 120-turn page. The scaling is the stylesheet recalculation, not the plugin's own JavaScript.

There is a second write shortly after startup. The first `apply()` at `plugin.js:8356` paints with the approximate solar times from `calcSolarTimes`. `syncSolar(ctx)` then fetches or reads the real solar times and calls `apply()` again at `plugin.js:8361`. The solar anchors have changed, so `skyStyleFor` produces different text and `paintSky` replaces the whole sheet again. On the 500-turn page that is another roughly 139 ms task. The browser trace on that page shows 621 ms of long-task blocking across three tasks, which is consistent with the first register task, the second solar rewrite, and a page-sync task. The code path is clear even though the tasks were not labelled individually.

The WebGL cost needs a separate note. `createSky` compiled in 23 to 26 ms when the driver cache already had the shader. Forcing a new shader source, which is what a fresh install or a driver update does, took 633 ms. The plugin compiles synchronously in `createSky` (`plugin.js:3799` to `3830`), so that time lands on the main thread inside `ensureGl()` (`plugin.js:8218`), which is called from the first `apply()`. `KHR_parallel_shader_compile` is available in this browser, but the code does not use it.

## Idle

Idle is not the problem. On both the 120-turn and 500-turn pages, the 4-second idle phases showed:

- 4.5 to 8.1 ms of animation-frame callback work, about 1 to 2 ms per second.
- 1.9 to 2.3 ms of timer callback work, about 0.5 ms per second.
- No long tasks.

The 1 Hz timers are individually small: `fitStatusStack` 0.10 ms at 120 turns and 0.39 ms at 500; `fitColumn` 0.07 and 0.28 ms; `layoutShelf` 0.006 and 0.029 ms; `layoutLibrary` 0.008 and 0.012 ms in this rig; `syncStatusDock` 0.02 and 0.06 ms; the idle `liveTimer` pass 0.008 ms. Together they are under 1 ms per second. They are not worth attacking first, but several of them are avoidable layout polls, covered below.

The one idle cost that is not in that list is the five-minute sky rewrite. It is not visible when idle because it lands as a single 30 or 139 ms task.

## Streaming

The streaming phase appended one text token per animation frame for four seconds and touched a sidebar row every 30 frames. This is close to how a real reply grows.

| Work | 120 turns | 500 turns |
| --- | --- | --- |
| Animation-frame callbacks | 121 ms over 4 s (30 ms/s) | 332 to 361 ms over 4 s (83 to 90 ms/s) |
| Observer callback bodies | 26 ms over 4 s (6.6 ms/s) | 56 ms over 4 s (14 ms/s) |
| Fold scan (`scanWorkProgress`) | 0.70 ms per 60 ms pass, about 12 ms/s | 2.82 ms per pass, about 47 ms/s |
| `fitColumn` inside the same pass | 0.07 ms per pass | 0.28 ms per pass |
| Approximate total | about 50 ms/s (5% of one core) | about 100 to 150 ms/s (10 to 15%) |

The 500-turn trace, over its 20-second run including startup, shows the same thing from the browser side: `FireAnimationFrame` total 603 ms with a 96 ms maximum, `UpdateLayoutTree` total 674 ms with a 180 ms maximum, `HitTest` 95 ms over the run, and 621 ms of long-task blocking. The 120-turn trace has a 32.6 ms maximum style recalculation and 155 ms of style work over 19 seconds; its streaming phase recorded no long tasks.

### The page observer is the largest streaming cost

The observer at `plugin.js:9036` watches `document.body` with `childList: true, subtree: true` and the attributes `aria-selected`, `data-state`, and `hidden`. Every token is a child-list mutation. `schedulePage` (`plugin.js:9030`) queues one animation frame, and that frame runs `markStrips()`, `markHas()`, and `syncPage()`.

`syncPage` (`plugin.js:8918`) does more than its name suggests. For every thread viewport it reads `getClientRects`, `getBoundingClientRect`, and calls `document.elementsFromPoint` at 30% of the viewport height (`plugin.js:8929`). It then queries the intro and message slots, borrows the intro, and calls `home.sync`, which reads more rectangles. The hit test and the rectangle reads force the layout that the streaming append just dirtied.

The A/B is direct. With the same 500-turn page and the same streaming script, disabling only `pageObs.observe` changed the four-second animation-frame work from 332.5 ms to 45.1 ms, and the maximum frame callback from 2.3 ms to 0.9 ms. That is a 287 ms saving in four seconds, about 72 ms per second, or 86% of the frame-callback work. The observer callback itself is cheap; the work it schedules is not.

There is a cheap second win inside the same path. `markHas` at `plugin.js:9016` uses the substring selector `[data-slot*='message']`. Exact slot selectors would use exact-value matching instead of scanning every `data-slot` value in the page.

### The fold scan walks the whole transcript

`scanWorkProgress` (`plugin.js:7646`) queries every assistant root, groups them, and calls `processTurn` for every group. The call is throttled to one pass per 60 ms by `scheduleScanWork` (`plugin.js:7677`), so a streaming reply pays a full-transcript pass about 16 times per second.

`processTurn` (`plugin.js:7473`) does the expensive work before its "nothing changed" check at `plugin.js:7598`: it collects parts, calls `isStreamingRoot` (five separate `querySelector` calls per part), collects scaffolds, walks response chains, marks interim prose, finds the last work block, and reads the duration badge. Only then does it compare `toggle.dataset.scaffolds` and return. On 500 turns that is 2.82 ms per pass even when only one turn changed. The live timer at `plugin.js:8345` also processes the newest group once per second forever, although its early return keeps that pass to about 0.008 ms when nothing is live.

The fix is an incremental scan. Keep a `WeakMap` from a response group to its last signature and a `Set` of groups touched since the last flush. Attribute and child-list mutations already carry the target, so `groupContainerOf(mutation.target)` gives the one group to process. While streaming, process the live group and the last group; on a session switch, do the full pass. Move the cheap signature check above the chain and prose scans. Replace the five `isStreamingRoot` queries with one comma-separated selector. That should take the 500-turn scan from 2.82 ms to well under 0.5 ms per pass.

### The 1 Hz polls are smaller, but they force layout

`layoutLibrary` (`plugin.js:6388`) measures the sidebar and the library rows before it checks its own cache key at `plugin.js:6423`. `layoutShelf` (`plugin.js:6760`) creates its hidden DOM before it checks whether an intro exists. `fitStatusStack` (`plugin.js:963`) reads three rectangles and two computed styles every second. `home.place` (`plugin.js:8881`) reads the tagline and pinned-shelf rectangles on every page pass while the new-tab screen is visible.

None of these is a top cost in this rig, because the library and shelf early-out quickly. On the real app, while the transcript is streaming, a forced layout at 1 Hz can be much more expensive than the 0.1 to 0.4 ms the clean measurement shows. Moving them to `ResizeObserver` callbacks, or checking a cheap geometry key before measuring, removes the risk.

## The sky GPU

The GPU is not the problem on this machine.

| Quality | Canvas size | Measured draw cost | Assessment |
| --- | --- | --- | --- |
| Low, 4 fps | 0.18x, max 480 | not sampled | Smaller than balanced |
| Balanced, 8 fps | about 274 x 230 | 0.125 ms per second total for main and blur | Effectively free |
| High, 16 fps | about 392 x 322 | under 0.05 ms per second total | Below timer resolution |

The renderer string is `ANGLE (Qualcomm, Qualcomm(R) Adreno(TM) X1-85 GPU ... D3D11)`. The fragment shader is not a bottleneck at these canvas sizes. The design choices that produce this are sound:

- A small canvas at 0.18 to 0.4 CSS px, capped at 480 to 1100 px on the long side.
- An 8 fps timer by default, not a 60 to 144 Hz animation-frame loop.
- A 1 fps cap when the window is not focused, and no drawing while hidden.
- Blur inside WebGL with two 9-tap passes, not a CSS `backdrop-filter` over the moving sky.
- `contain: strict` on the fixed sky root.
- No persistent `backdrop-filter` on the composer, sidebar, or large surfaces.
- A 0.25 fps cap under reduced motion.

The full-window composite is the part this rig did not measure. At 8 fps the canvas invalidates a full-screen layer 8 times per second. That is small at 1022 x 840, but it scales with the window area, and it is one reason `Smoothness: Low` helps on a 4K or low-end machine. The shader itself is unlikely to be the heat source there either.

### The field cache is line-ending dependent

`createSky` builds a cached field texture by textual surgery on the shader: it finds `WARP_START` and `WARP_END` in `HS.FRAG`, replaces the warp block with two texture samples, and compiles the result (`plugin.js:3763` to `3795`). `WARP_END` is written with a trailing `\n`:

```js
const WARP_END = '  float f=mix(field(1.1*A+.8*uWarp*r),.5,.35);\n'
```

The working tree's `plugin.js` has mixed line endings: 9852 CRLF lines and 5 LF lines. The shader source in that file ends the line with `\r\n`, so `frag.indexOf(WARP_END)` returns `-1`. The `if (a > 0 && b > a && u > 0)` guard skips the transform without an error, `fieldSrc` stays null, and `if (!program) program = link(HS.FRAG)` at `plugin.js:3825` compiles the uncached shader. The WebGL probe confirms it: the working-tree build issues no `field` draws, while an LF copy issues the expected field snapshots. The installed copy under `~/.hermes/desktop-plugins/zephyr` is LF, so the cache is active there. The silent failure appears on a Windows checkout or a copy that an editor has normalized to CRLF.

On this GPU the difference is invisible because the canvas is small, but the code does not do what its comment says on a Windows checkout. A clean LF index transforms correctly. The fix is small: match without the newline and add it back when slicing, or normalise the generated block to `\n` in `scripts/build-sky.mjs`. Normalising the whole tree with `.gitattributes` would also prevent the two builds from behaving differently.

The field cache is still worth keeping for low-end GPUs and larger canvases, but it is not worth a large startup cost. Enabling it in the cold-compile test took 587 ms, against 633 ms without it, which is within run-to-run noise. Warm `createSky` is about 23 to 26 ms, and the field variant added about 20 ms in the warm register run (240 ms against 218 ms). The current logic is the right idea with a fragile implementation.

## Function-by-function costs

All times are measured per call. "Clean" means the page layout was already settled. The streaming numbers are higher because the layout is dirty.

| Function | 1 turn | 120 turns | 500 turns | When it runs |
| --- | --- | --- | --- | --- |
| `evaluate()` (sky frame) | 0.033 to 0.043 ms | same | same | Every 4 s, or when weather or settings change |
| `drawParams()` | 0.007 ms | same | same | Every sky frame |
| `skyAt()` | 0.05 ms | 0.05 ms | 0.05 ms | Every CSS build, every minute |
| `phaseAt()` | 0.04 ms | 0.04 ms | 0.04 ms | Every CSS build and minute tick |
| `zephyrMaterial()` | 0.042 ms | 0.042 ms | 0.042 ms | Every CSS build |
| `skyStyleFor()` build | 0.16 to 0.22 ms | 0.16 to 0.22 ms | 0.16 to 0.22 ms | Every minute |
| `paintSky()` write | 2.4 ms | 30.5 ms | 139 ms | Every 5 minutes, startup, solar sync, settings |
| `syncPage()` | 0.017 ms | 0.097 ms | 0.296 ms | Every page pass, every mutation frame |
| `markHas()` | 0.004 ms | 0.093 ms | 0.353 ms | Every page pass |
| `markStrips()` | 0.002 ms | 0.018 ms | 0.060 ms | Every page pass |
| `scanWorkProgress()` | 0.016 ms | 0.698 ms | 2.82 ms | Every 60 ms while streaming |
| `runScanWork()` | 0.012 ms | 0.788 ms | 2.99 ms | Every 60 ms while streaming |
| `processTurn()` early return | 0.009 ms | 0.010 ms | 0.008 ms | Every live-timer tick and every scan group |
| `fitStatusStack()` | 0.006 ms | 0.101 ms | 0.393 ms | Every second |
| `fitColumn()` | 0.004 ms | 0.068 ms | 0.279 ms | Every scan and resize |
| `pinWordmark()` | 0.0005 ms | 0.009 ms | 0.044 ms | Every scan when spacious margins are on |
| `layoutShelf()` | 0.001 ms | 0.006 ms | 0.029 ms | Every second |
| `layoutLibrary()` | 0.008 ms | 0.008 ms | 0.012 ms | Every second |
| `syncStatusDock()` | 0.002 ms | 0.020 ms | 0.057 ms | Every second |
| `layoutSideDock()` | 0.002 ms | 0.002 ms | 0.008 ms | Every second in Simple mode |
| `pickUp()` + `regulars()` | 0.371 ms for 500 sessions | same | same | When the new-tab shelf is shown |
| `sanitize()` | 0.632 ms for 500 records | same | same | Once at startup |

The recents engine and the sky evaluator are not concerns. The stylesheet, the page observer, and the fold scan are.

## Where Zephyr is already doing the right thing

The audit is not all bad news. Several decisions are measurably effective and should be kept:

- **The sky is deliberately cheap on the GPU.** The small canvas, the 8/16 fps timer, the 1 fps unfocused cap, the WebGL blur, `contain: strict`, and the absence of persistent `backdrop-filter` on large surfaces add up to under 0.13 ms of measured GPU time per second at balanced quality, and under 0.05 ms at high quality on this machine. The shader is not the bottleneck at the shipped resolutions.
- **The CPU side of the sky is cheap.** `evaluate()` is 0.033 to 0.043 ms, `drawParams()` is 0.007 ms, `skyAt()` and `phaseAt()` are about 0.04 to 0.05 ms, and the frame is rebuilt every four seconds rather than every frame.
- **The recent-sessions engine is cheap.** `pickUp()` plus `regulars()` is 0.371 ms for 500 sessions, and `sanitize()` is 0.632 ms for 500 records. The caps (500 records, 40 visits, 120 days) keep the stored JSON bounded; the sample used here (30 days, 20 visits per record) serialized to about 626 KB.
- **The DOM write helpers are good hygiene.** `put`, `putData`, and `putText` avoid identical attribute and text writes, which would otherwise wake every observer for nothing. The code marks elements with attributes instead of making the browser re-evaluate `:has()` over a large subtree, and the comments record that this was worth 40 ms per row insert.
- **The timers are mostly disciplined.** Weather refreshes every 30 minutes, the clock chip every 10 seconds, the sky phase every 60 seconds, and the sky style is quantized to 5 minutes and compared before writing. Hidden and unfocused windows do less work. Reduced motion drops the sky to 0.25 fps.
- **The lifecycle is careful.** Disposal removes styles, listeners, observers, WebGL resources, and plugin-owned DOM. Bounded stores, `WeakMap`/`WeakSet` node bookkeeping, and a six-ghost cap keep memory from growing without bound. No growth was observed in the short rig runs.
- **Motion is compositor-friendly.** The motion sheet animates opacity and transform, keeps durations in tokens, and collapses to 1 ms when Motion is off or reduced motion is set. It does not animate layout properties.
- **The field cache is the right idea.** Rendering the expensive noise field into a texture every 1.6 seconds and sampling it in the main pass is exactly how to make this shader scale. It is only the line-ending matching that is fragile.

## What to change, in order

### 1. Split the stylesheet into a dynamic backdrop sheet and a static chrome sheet

This is the largest single win and the least risky structural change.

`skyStyleFor` (`plugin.js:1244`) already returns two conceptual blocks: the backdrop rules that paint `html` and `body::before` (`plugin.js:1268` to `1315`), and the chrome rules for panels, menus, forms, and app surfaces (`plugin.js:1316` to `2340`). The backdrop block is only a few KB, and it is the part that changes as the sun moves. The chrome block is the remaining ~54 KB, and its values change much more slowly.

Write them to two style elements:

- `zephyr-sky-backdrop` is rebuilt every five minutes, when the quantized sky changes. It contains only the small background block.
- `zephyr-sky-chrome` is rebuilt when the look, the `gl` flag, the `chrome`/`backdrop` switches, or the phase changes. Cache it by that key. The panel density and ink can step at phase boundaries, where the theme already changes. If that step is too visible, update it on a 30-minute timer instead of every five minutes.

The measured basis: replacing a one-rule sheet and forcing layout cost 0.22 ms on the 120-turn page, against 29.5 ms for the 59 KB sheet. A realistic dynamic backdrop sheet will have more than one rule, so estimate 1 to 5 ms at 500 turns instead of 139 ms. Avoid putting the hot values in inherited custom properties on `:root`: changing 30 of them cost 21 ms on the 120-turn page, because every descendant is invalidated. Direct rules that target `html` and the pseudo-elements are much cheaper. A non-inherited `@property` was 5.5 ms, better than inherited variables but still worse than direct rules.

One small detail makes the five-minute schedule unconditional: the first line of the sheet is a comment containing the time and exposure (`plugin.js:1266` to `1267`). Even if every colour rounded to the same value, the comment would differ, so `paintSky`'s `textContent` comparison would still replace the whole sheet. Move the diagnostic detail to a `data-` attribute or a static comment, and the comparison can skip a tick when nothing visible changed.

The split also lets the GL flag be an `html` attribute rather than a cause for a full rewrite. Today, switching from the CSS sky to WebGL changes the sheet (`html::before` and `body::before` become `content: none`), so a deferred GL start would trigger another 139 ms write. A rule such as `html[data-zf-gl]::before, html[data-zf-gl] body::before { content: none; }` makes that switch a paint-only attribute change.

### 2. Scope the page observer and stop it during streaming

The A/B above is the evidence. The current observer watches the whole body. It should watch the things whose changes matter:

- the chat surface (`[data-chat-surface]`) for message mounts and the intro-to-chat transition;
- the sidebar and tab strip for session and pane changes;
- the body only for portal mounts, with the added-node filter it already has.

Then add a cheap state check before the expensive part:

- If any `[data-message-streaming]` is present, do not run `syncPage` on every token. The empty/chat state cannot change in the middle of a reply except on the first and last token, so run the full pass when streaming starts and ends.
- Cache a small signature: visible viewport count, whether an intro exists, whether any message exists, and whether the chat surface is hidden or switching. If it did not change, skip `syncPage`.
- When there is exactly one visible viewport and no open overlay, skip `elementsFromPoint` entirely. The single viewport is the one the user sees. Use `document.elementFromPoint` (singular) only when there are multiple panes or an overlay is open.
- Run `markStrips` and `markHas` only when their inputs change, not on every frame.

This should remove most of the 72 ms per second at 500 turns. It should also remove the 96 ms frame spike; the 180 ms style-recalculation spike is addressed by the stylesheet split.

### 3. Make the fold scan incremental

Add a `WeakMap` from group to last signature, and a `Set` of groups touched since the last flush. In the shared mutation callback, map `mutation.target` to its nearest `[data-slot='aui_response-group']` or `[data-slot='aui_turn-pair']`. On the 60 ms flush, process the dirty groups, plus the live group if one exists. Keep the full pass for a session switch, a collapse-work toggle, or a history mount.

Inside `processTurn`, compute the cheap signature first: number of scaffolds, badge seconds, whether the root is streaming, and whether a toggle already exists. If it matches the cached signature and the turn is not live, return before `markInterimProse`, `chainsOf`, and `lastWorkBlockOf`. Replace the five `isStreamingRoot` queries with one selector:

```js
root.querySelector(
  "[data-message-streaming='true'], [data-slot='aui_message-streaming-marker'][data-message-streaming], " +
  "[data-slot='aui_response-loading'], [data-slot='aui_turn-activity'][data-state='active'], " +
  ".shimmer, [aria-label='Running'], [data-slot='glyph-spinner']"
)
```

The `liveTimer` should only call `processTurn` when a live turn exists, rather than reprocessing the newest settled group every second.

### 4. Compile the shader in parallel, and keep the CSS sky until the first frame

`KHR_parallel_shader_compile` is present in this browser. Use it:

1. Create the program and call `compileShader` and `linkProgram` without immediately reading `COMPILE_STATUS` or `LINK_STATUS`.
2. Poll `gl.getShaderParameter(shader, ext.COMPLETION_STATUS_KHR)` (and the program equivalent) from a `requestIdleCallback` or a short timer.
3. Keep the CSS gradient visible until the first WebGL frame has actually been drawn. Only then set the `data-zf-gl` attribute that hides the CSS layers.

That moves the 633 ms cold compile off the startup critical path. It does not make the compile free, but the window can paint and accept input while the driver works. The same change makes a deferred `ensureGl()` safe.

If the driver supports parallel compile, the first launch should feel like a normal launch. If it does not, fall back to the current synchronous path, but schedule it at idle after first paint.

### 5. Lazy-load the non-critical sheets

At startup the plugin injects about 100 KB of CSS across eight sheets (the dock sheet is extra, and only in Simple mode):

| Sheet | Size | Rules | Needed at first paint? |
| --- | --- | --- | --- |
| sky | 59.7 KB | 282 | Yes, the backdrop is the look |
| snippet | 18.5 KB | 113 | No, only when a snippet, the library, or the shelf appears |
| motion | 16.0 KB | 73 | Not strictly; first paint does not need transitions |
| home | 3.3 KB | 20 | Only on an empty pane |
| stack flare | 0.9 KB | 4 | Yes, small |
| pane rail | 0.8 KB | 4 | Yes, small |
| icon | 0.8 KB | 1 | Yes, small |
| picture | 34 B | 1 | Yes, only when a custom picture is set |
| dock (not startup) | about 50 rules | 50 | No, only in Simple mode, already on demand |

Moving the snippet and home sheets to their first use, and injecting the motion sheet at idle, would remove about 22 KB and 133 rules from the initial style calculation (estimate). On the 500-turn page that would be a meaningful part of the 279 to 398 ms register time. The existing tests assert that some of these sheets exist after `register()`; those tests would need to trigger the feature or wait for the idle injection.

### 6. Replace the 1 Hz layout polls with observers

`fitStatusStack` can be driven by a `ResizeObserver` on the status stack and composer surface. `layoutLibrary` and `layoutShelf` can be driven by the sidebar and intro observers they already have. `home.place` can cache the pane and tagline rectangles and only re-read when the pane geometry or the pinned shelf changes. `fitColumn` already has a `ResizeObserver`; its call from every 60 ms scan is redundant.

This is a small CPU saving in this rig, but it removes forced layouts at the exact moment a reply is streaming, when the layout is dirty. It also reduces the number of timer wakeups.

### 7. Gate the theme-file poll

`configTimer` (`plugin.js:8678`) reads `zephyr-theme.json` through the desktop bridge every two seconds, even when the active look is Zephyr Sky or Gruvbox. The file only matters for the Custom look. Gate the poll on `look.get() === 'custom'`, or use a file watcher if the SDK exposes one. This is not visible in the synthetic rig because there is no desktop bridge there, but in the real app it is an IPC and disk read every two seconds for a file the user is not using.

### 8. Optional: a smaller release build

The raw file is 617.7 KiB. Comments and blank lines are 18.5% of it. Stripping them, or running a minifier in a release step, would cut the parse and evaluation portion of the 70 to 106 ms import. This is a startup-only win and it costs source readability, so it is a release-build choice, not a source change. A 300 to 400 KiB minified file would likely save 20 to 40 ms of parse and compile.

### If you only do three things

1. Split the sky stylesheet at the backdrop/chrome boundary. This removes the five-minute 139 ms hitch at 500 turns and most of the startup style cost.
2. Scope `pageObs` to the chat surface and sidebar, and stop running `syncPage` during streaming. The A/B says this removes about 72 ms per second at 500 turns.
3. Make the fold scan incremental. This removes about 47 ms per second at 500 turns.

Together those three target the 139 ms periodic hitch and the 100 to 150 ms per second of streaming work. The shader compile and lazy sheets are the next startup wins.

## Impact by user scenario

**New chat, short history.** The plugin adds about 70 to 106 ms of import and 7.5 ms of register without GL, plus a warm 23 ms shader compile. The sky rewrite is 2.4 ms. This is fine. A cold first launch can still stall on the 633 ms shader compile.

**120-turn conversation.** Startup is about 150 to 180 ms of plugin work with a warm cache. Streaming costs about 5% of one core. A 30 ms style recalculation lands every five minutes. It is usable, but a 30 ms hitch is visible if it lands mid-keystroke.

**500-turn conversation.** Startup is 0.35 to 0.5 s including import, and a second roughly 139 ms style write after the solar response. Streaming costs 10 to 15% of one core. A 139 ms style recalculation lands every five minutes, and the page observer can produce a 96 ms frame. This is the case to fix first.

**Battery and heat.** The GPU sky is not the heat source on this GPU. The continuous 8 fps full-window composite was not measured here, but in this rig it should be smaller than the DOM work during streaming. The 1 Hz timers are a minor wakeup cost. `Smoothness: Low` should still help, because it halves the full-window composites, but it will not fix the stylesheet or observer costs.

## Verification plan

If these changes are made, measure them the same way:

1. Add a small browser rig under `tests/perf` that mounts 1, 120, and 500 turns, registers the plugin against stubs, and records `paintSky`, `syncPage`, `runScanWork`, `createSky`, and total frame callback time. It does not need to run in CI; it needs to be repeatable before and after a change.
2. Add a debug-only timing flag to the plugin: `performance.mark` around `paintSky`, `runScanWork`, `syncPage`, and `createSky`, and log any pass over 16 ms. Keep it off by default.
3. Re-run in the real Hermes app with a 200+ turn session and a streaming reply, using the Performance panel to confirm that `UpdateLayoutTree` and `FireAnimationFrame` no longer produce 50 ms+ tasks.
4. Test a 4K window and a low-end GPU for the composite cost. The shader measured cheap here; the unmeasured part is the full-window composite.

Suggested acceptance targets:

- Plugin startup, warm, on a 200-turn page: under 200 ms, with no shader compile on the critical path.
- Sky update, 200 turns: under 5 ms of style recalculation, no task over 16 ms.
- Streaming, 200 turns: under 30 ms of main-thread work per second.
- Streaming, 500 turns: under 60 ms per second.
- Idle: under 1 ms per second.
- No observer callback should call `elementsFromPoint` while a reply is streaming and only one pane is visible.

## Other findings

These are outside the performance audit but worth a separate look.

- `npm run rig` is red on this tree. It reports three chroma failures (0.212 against a 0.25 threshold, 0.212 against 0.5, and 0.230 against 0.55), then crashes because the mock `document.documentElement` has no `dataset` at `plugin.js:5324`. `npm test` passes all 105 tests. The rig failure may be a stale mock or a real grade regression. It is not caused by the audit.
- `liveSolar` is set once by `syncSolar` and then trusted forever by `getSolar`. If the app stays open past midnight, the sunrise and sunset anchors are yesterday's. The visual drift is small, but the cache has no date check after it is live.
- `saveTurnTimes` and `saveStarts` debounce timers are not cleared in the dispose path. They are harmless after unload, but they are lifecycle loose ends.
- The working tree has mixed line endings (`git ls-files --eol plugin.js` reports `i/lf w/mixed`). That is what makes the field-cache behaviour platform-dependent. A `.gitattributes` entry for `plugin.js`, `sky/*.js`, and `recents/*.js` would make the checkout deterministic.

## Caveats

- The rig is not Hermes. It approximates the DOM shape and the slot names, but the real app's CSS and React tree are larger. Absolute times will move; the ordering and the scaling should hold.
- The 500-turn page mounted all turns. If Hermes virtualizes the transcript and unmounts offscreen turns, the real per-scan cost is lower. The observer and stylesheet costs still scale with whatever is mounted.
- The streaming script appends text nodes, so it exercises `childList` mutations. If Hermes updates one existing text node (a `characterData` mutation) instead, the plugin's observers do not see each token, and the streaming cost in the real app would be lower. Child-list churn still happens for new messages, tool blocks, and markdown elements, which is the case this audit treats as the worst case.
- The import time includes the stub SDK and React modules in the rig. In Hermes those are already loaded, so the plugin's marginal import is mostly the parse and evaluation of `plugin.js`.
- `gl.finish()` per draw measures an upper bound, and the 0.1 ms timer resolution means the GPU values are "not measurable" rather than exact. The conclusion is that the sky is cheap on this GPU, not that it is free on every GPU.
- The cold shader compile was forced with a unique shader source. A normal launch may use the driver's shader cache and pay the 23 to 26 ms warm cost instead. The cold number is the first launch after an install, a driver update, or a cache clear.
- The CSS rewrite benchmark forces a layout after the write. A control run without the forced layout was the same at 120 turns (30.49 ms with a style read, 29.47 ms with the layout), so the measured cost is style recalculation, not an artifact of the read.
- The long tasks from the benchmark setup were excluded from the clean runs. The clean 500-turn trace still shows a 96 ms frame callback and a 180 ms style recalculation, so the finding is not a setup artifact.
