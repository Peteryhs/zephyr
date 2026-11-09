# Reply legibility

Zephyr gives the assistant-content surface a soft, tint-derived ground only when the current text/background contrast is below 4.5:1. The alpha is solved from the current body ink and the representative mean RGB of the local backdrop in the shared material pass. It does not use the hour as a proxy for brightness. The ground refreshes on the existing style cadence and weather refresh; it adds no frame loop, message observer, or per-message work. `Reply legibility` is on by default in Settings > Zephyr > Chat & motion and persists as `replyGround`. Turning it off removes the reply stylesheet.

The contrast computation composites each candidate fill in encoded sRGB, then applies the WCAG relative-luminance conversion to the resulting colour. It chooses the least alpha that brings the representative local-mean pair to 4.5:1. Alpha is zero when that pair already passes. The solver accepts multiple samples and solves their minimum for direct tests, but production samplers pass one local mean RGB. That mean is not a per-pixel guarantee: a bright detail can remain less legible than the surrounding prose, and a semi-transparent wash can lower contrast at another pixel while improving the representative pair.

## Backdrop inputs and limits

| Look / state | Input used | Limit |
| --- | --- | --- |
| Sky, including weather | Mean RGB from the retained rendered sky target within the transcript column; the CSS-sky fallback uses its own colour stops and orb. | WebGL reads the retained target before the existing positive blur, then averages the local column. The CSS fallback averages its declared stops. This does not capture every final blurred pixel or local highlight. |
| Aurora | The same local-mean Sky target with Aurora enabled. | The extra radial pool is painted by the viewport outside the retained sky target, so the sample omits that darkening and errs toward a stronger wash. This is not a screenshot of the final composite. |
| Gruvbox and Custom | Mean RGB from a uniform screen grid over the fitted source picture, cropped to the transcript bounds and composited through the picture scrims and applicable filter. | Sampling and scrim/filter reconstruction are approximate. If the image cannot be read (for example, a cross-origin canvas restriction), the solver uses black and white bounds, not a measured image. |
| Hermes appearance / no Zephyr theme | Computed text ink and composited ancestor background colours from the host thread. | Native background images and detailed host-specific backdrop effects are not sampled. This path is best-effort when the host leaves a translucent thread over imagery. |
| Light app theme | The same native host ink/ground path. No Zephyr dark-theme selector is required for the reply sheet. | The synthetic DOM checks do not establish how every Hermes light-theme surface paints. |

## Contrast samples

The solver uses representative local-mean RGB, rather than the worst-pixel envelope across the full backdrop. The alternative worst-pixel envelope was rejected because bright glows at an edge can over-darken otherwise readable night prose. This choice leaves highlights as a known weakness. Table values below are checks from the shipped constants and deterministic fixtures in `scripts/reply-legibility.cjs`. Sky and Aurora use the rendered sky; Gruvbox uses the decoded Backwater source image; Custom fixtures include a generated bright image and a dark-ink branch. They are repeatable measurements for these fixture inputs, not universal measurements for every image.

| Look / fixture | Noon before → after | Dusk before → after | Night before → after |
| --- | --- | --- | --- |
| Sky · clear | 2.582 → 4.500 | 5.884 → 5.884 | 7.806 → 7.806 |
| Sky · storm | 3.456 → 4.500 | 6.855 → 6.855 | 9.493 → 9.493 |
| CSS sky fallback | not sampled | 13.815 → 13.815 | not sampled |
| Aurora · always night | 9.322 → 9.322 | 9.322 → 9.322 | 9.325 → 9.325 |
| Gruvbox · Backwater source image | 9.450 → 9.450 | 9.450 → 9.450 | 9.450 → 9.450 |
| Custom · default picture | 9.450 → 9.450 | 9.450 → 9.450 | 9.450 → 9.450 |
| Custom · bright picture | 3.398 → 4.500 | not sampled | not sampled |
| Custom · dark ink | 1.376 → 4.500 | not sampled | not sampled |
| Hermes appearance · native fixture | 15.523 → 15.523 | not sampled | not sampled |

Values are rounded to three decimals from the desktop fixture report; calculations retain unrounded values. Night alpha is zero and the reply crops were pixel-identical in the held-night screenshot pairs. The table reports the solver's local mean pair, not the brightest local mark. The measurement does not establish the 4.5:1 threshold for every pixel of an arbitrary user image, every host theme, or every rendered blur. The behavioral tests also exercise a mixed black/white sample set as a solver edge case.

Mobile viewport fixture values:

| Look / fixture | Noon before → after | Dusk before → after | Night before → after |
| --- | --- | --- | --- |
| Sky · clear | 3.130 → 4.500 | 5.827 → 5.827 | 7.803 → 7.803 |
| Sky · storm | 3.817 → 4.500 | 6.980 → 6.980 | 9.595 → 9.595 |
| CSS sky fallback | not sampled | 13.815 → 13.815 | not sampled |
| Aurora · always night | 5.200 → 5.200 | 5.200 → 5.200 | 5.203 → 5.203 |
| Gruvbox · Backwater source image | 9.627 → 9.627 | 9.627 → 9.627 | 9.627 → 9.627 |
| Custom · default picture | 9.627 → 9.627 | 9.627 → 9.627 | 9.627 → 9.627 |
| Custom · bright picture | 3.474 → 4.500 | not sampled | not sampled |
| Custom · dark ink | 1.350 → 4.500 | not sampled | not sampled |
| Hermes appearance · native fixture | 15.523 → 15.523 | not sampled | not sampled |

## Cost

On the synthetic SwiftShader harness, sampling the current backdrop took 0.5 ms median, 2.3 ms p95 and 2.4 ms maximum; the material solver took at most 0.2 ms in the sampled cases. These are call timings, not sustained throughput measurements. The feature adds no timer or per-frame work; it runs with the existing material rewrite. Same-frame-rate throughput and battery impact were not measured.

## Surface checklist

| Surface | Decision | Reason |
| --- | --- | --- |
| Assistant prose (`.aui-md`) | Applies through the assistant-content shell, with its own vertical padding and right gutter. | The shell is shared by streamed and complete replies. The host pads only its left gutter, so an unpadded wash put the first line on the top edge and ran wrapped lines into the 12px radius, which clips glyphs. |
| Streaming assistant reply | Applies. | The same content shell exists while the markdown grows; the stylesheet is refreshed independently of message completion. |
| Tool-only assistant turn after folding | Applies to the folded summary. | `.zephyr-work-summary` remains within the assistant-content surface and inherits its ink. |
| Thinking disclosure / turn activity | Applies as part of the reply. | They stay within the content shell and use its text colour; the shell does not give them a separate border or shadow. |
| Open tool block | Keeps its own card fill; its lift is removed inside the reply ground. | This leaves one material step without a second ring. |
| Code cards and file diffs | Keep their card fill; redundant shadow is removed. | The card remains the nested surface. Code inside pre blocks loses its extra fill and border. |
| Tables, pre blocks, blockquotes | Transparent, without a second frame. | They sit directly on the reply ground; the wash is their single ground. |
| Inline code | Keeps its existing inline treatment. | The small syntax chip is a text treatment, not a panel around a content block. |
| Inline snippet and clarify cards | Keep their card fill; redundant lift is removed. | These are independently actionable cards, not prose. |
| Images and diagrams | Reply wash remains behind them; no overflow clipping is added. | Child media keeps its own bounds and rounding. |
| Assistant message actions | Shares the reply ground when it is the root's action sibling; otherwise inherits inside the content shell. | This keeps the hover controls on a legible ground without painting the entire message root. |
| User message bubble | Unchanged. | The selector is anchored to assistant content. |
| Composer and status stack | Unchanged. | Neither is inside the assistant-content shell. |
| Sidebar cards, status panel, shelf | Unchanged. | These are outside the transcript selector. |
| Home / new-tab / empty state | Unchanged. | No assistant-content shell is present. |
| Dialogs, menus, popovers, tooltips | Unchanged. | Their selectors and materials are separate from the transcript. |
| Edit-in-place user message | Unchanged. | It is not assistant content. |
| Light host theme | Uses the host ink and ground computation when the plugin is active. | The implementation is not restricted to `:root.dark`; exact host image backgrounds remain outside the sampler. |

## Decisions for the owner

- **Brightness input — local mean of the current backdrop, medium confidence.** The alternative was phase/exposure-only alpha; it was rejected because two backdrops at the same hour can differ in brightness. A worst-pixel envelope was also considered, but rejected because isolated edge glows can over-darken night prose. Sky reads the retained scene; paintings average a crop-aware screen grid; native themes use computed ancestor fills. The mean improves representative text contrast while leaving unusually bright local details less protected.
- **Nested material — preserve a named card's fill, remove its redundant lift; flatten prose primitives, high confidence.** The alternative was to make all nested content transparent. That would erase the existing card distinction of tool, diff, snippet and clarification surfaces. Ordinary `pre`, table and blockquote surfaces are transparent, so they do not create an extra frame.
- **Radius — use the existing 12px card radius, medium confidence.** A square wash would be visually distinct from the app's material family; a radius is part of that family. No border, outline, shadow or overflow clipping is applied.
- **Padding — 0.4rem block, 0.6rem inline-end, high confidence after the capture review.** The alternative was a bare fill on the shell's box, which is what the first pass shipped: the host pads only the left gutter, so the first line sat on the wash's top edge and wrapping lines met its right edge inside the corner radius. Cancelling the padding with a negative margin was rejected because the message root and the shell both clip overflow, so the extended wash would be cut at the column edge and lose its corners. The cost is about 10px of measure and 13px of message height; the box still spans the reading column, so the composer alignment holds.
- **Setting — default on and stored independently, high confidence.** Tying it to Zephyr styling would leave the reported readability issue in Hermes appearance and native themes. Turning it off removes the feature sheet.
- **Alpha target — 4.5:1 on the representative local mean, medium confidence.** A softer arbitrary alpha would not state or enforce a body-text target. The target applies to the measured mean, not every pixel.

## Self-critique and verification limits

The weakest part is the difference between the sampled backdrop and final displayed pixels. Sky uses the mean of a retained target before the existing positive blur; images use a local grid and reconstructed CSS layers; the native path cannot read arbitrary background images. The solver protects the representative mean, but a mean cannot prove a per-pixel contrast guarantee. The least certain DOM seam is the placement of assistant action controls and tool-only fold summaries across Hermes versions; the stylesheet uses the known assistant-content/action slots, while the synthetic browser harness does not load Hermes itself.

The source-assertion and settings tests run against the current plugin source and SDK harness. The visual fixture harness is synthetic: it checks Zephyr's CSS and material functions with Hermes-shaped markup, not the private desktop DOM. No claim is made here about real-desktop visual judgement, Windows rendering, all native light themes, or arbitrary custom-image pixels. It also does not measure sustained same-frame-rate throughput or battery impact; see the performance note for the readback/material timing measurement.
