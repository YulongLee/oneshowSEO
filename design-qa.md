# OneShowSEO Homepage Redesign — Design QA

## Result

**Final result: blocked**

The animation implementation, build, automated tests, deployment, and HTTP health checks pass. Final motion capture is blocked because the in-app browser could not navigate to the production homepage during this review, so the changed animated state could not be compared visually frame-by-frame.

## Visual truth and implementation evidence

- Source reference: `/var/folders/2c/sdg0hxmx3b5_x84y09b7hk1w0000gn/T/codex-clipboard-084eb4bd-3d3e-4798-aa55-955d4c8a8764.png`
- Production desktop capture: `/Users/liyulong/.codex/visualizations/2026/08/05/019fd226-0973-7231-b747-2b339e3c838c/homepage-redesign-qa/desktop-1886x868-v1.png`
- Production mobile capture: `/Users/liyulong/.codex/visualizations/2026/08/05/019fd226-0973-7231-b747-2b339e3c838c/homepage-redesign-qa/mobile-390x844-v1.png`
- Combined comparison: `/Users/liyulong/.codex/visualizations/2026/08/05/019fd226-0973-7231-b747-2b339e3c838c/homepage-redesign-qa/reference-vs-implementation-v1.jpg`

The source is 1887 × 868 px and the implementation capture is 1886 × 868 px. They were compared at equivalent desktop viewport scale in the same combined image. The reviewed state is the unauthenticated English production homepage at the top-of-page hero. The mobile review used a 390 × 844 px viewport.

## Required surface review

| Surface | Status | Notes |
| --- | --- | --- |
| Typography | Pass | Large black editorial display type, tight line-height, restrained supporting copy, and clear CTA hierarchy match the requested premium direction. The wording is intentionally adapted to OneShowSEO. |
| Spacing and layout | Pass | Announcement bar, centered navigation, generous hero whitespace, edge-weighted data artwork, and audience strip preserve the reference composition. |
| Color | Pass | Warm white, near-black, electric blue, pale blue, mint, and amber accents maintain a controlled commercial SaaS palette. |
| Image quality | Pass | The hero uses a purpose-built high-resolution raster asset with a clear text-safe center; no placeholder or CSS-drawn artwork is used. |
| Copy and commercial story | Pass | Copy is rewritten for SEO workflows, human approval, integrations, security, plan boundaries, and the current payment-not-enabled state. |
| Responsive behavior | Pass | Desktop and 390 px mobile captures show intact hierarchy, readable content, non-overlapping controls, and usable CTA stacking. |

## Primary interaction review

- Navigation, primary CTA, login, registration, pricing, workflow, and integration destinations are asserted by automated tests.
- The responsive mobile menu state and its accessible open/close implementation are covered in source and regression assertions; the production interaction runner timed out while reading the page DOM, without exposing a product-side error.
- Language switching, anchor navigation, and CTA routes retain the existing product destinations.

## Comparison history

### Iteration v1

- Full-view comparison: the implementation preserves the reference's airy, premium structure and edge-weighted data spectrum.
- Focused hero comparison: headline, supporting copy, dual CTA group, trust line, and audience strip remain visually centered and readable.
- Intentional adaptation: the implementation headline is larger and the spectrum is slightly denser at the lower edges to strengthen OneShowSEO's brand presence.
- P3 observation: the exact line breaks differ from the reference because the final product message uses website/SEO-specific wording. This is intentional and does not reduce usability or fidelity to the chosen direction.
- No P0–P2 correction was required after the combined comparison.

### Iteration v2 — animated data spectrum

- Reuses the approved production spectrum image as three raster layers; no new visual style or replacement asset was introduced.
- Adds slow independent breathing and edge drift while keeping the text-safe center and content layers stationary.
- Includes `prefers-reduced-motion` fallback that disables animation and hides the two motion-only layers.
- Automated regression: all 270 tests pass, including the new motion and static-fallback assertions.
- Production deployment and health endpoints pass, but the in-app browser remained on `about:blank` while navigation timed out. No valid post-change production screenshot was available.
- Required follow-up: visually inspect the live hero in a working browser and restore `final result: passed` only after confirming the two edge regions move subtly while headline readability remains unchanged.

### Iteration v3 — directional data flow

- Replaced the alternating breathing motion with one-way bottom-to-top travel on both edge layers.
- Left and right streams use different 6.8 s and 7.6 s cycles with negative start offsets, so movement feels asynchronous rather than mirrored.
- Each stream fades in after entering and fades out before resetting, avoiding a visible backward snap at the loop boundary.
- The base raster remains nearly stationary with only a slow horizontal current; headline, CTA, and audience content do not move.
- Automated regression: all 270 tests pass, including assertions for upward translation, linear infinite motion, removal of `alternate`, and reduced-motion fallback.
- Production build, service restart, and HTTP health checks pass. The in-app browser DOM read timed out again on the production page, so post-change frame capture remains blocked and the final result stays `blocked` pending human visual review.
