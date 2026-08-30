# OneShowSEO homepage design QA

- Source visual truth: `/Users/liyulong/.codex/generated_images/019fd226-0973-7231-b747-2b339e3c838c/exec-45b4d577-8a92-45fc-a33b-99ee4d50b6df.png`
- Source pixels: `864 × 1821`
- Implementation route: `http://localhost:4173/`
- Desktop implementation: `/tmp/oneshowseo-home-qa-20260830/implementation-full-v3.png`
- Desktop pixels / CSS viewport / density: `1440 × 4410`, `1440 × 1024`, browser default density
- Mobile implementation: `/tmp/oneshowseo-home-qa-20260830/implementation-mobile-v1.png`
- Mobile pixels / CSS viewport / density: `390 × 844`, `390 × 844`, browser default density
- Full-view comparison: `/tmp/oneshowseo-home-qa-20260830/comparison-v3.png`
- State: Chinese locale, signed-out marketing homepage, mobile menu closed for the primary capture

## Full-view comparison evidence

The implementation preserves the selected direction's defining hierarchy: compact header, left-aligned promise, visibility-path hero asset, daily action strip, five-step journey, evidence-and-control product section, three outcome columns, three commercial plans, concise FAQ, and final conversion block. The generated reference is a conceptual long-page image rather than a CSS-density specification, so the implementation intentionally uses readable production type and practical section spacing instead of reproducing the reference's very small body copy.

The reference's dashboard contains illustrative numerical data. The implementation intentionally replaces it with honest availability states such as `可运行`, `等待连接`, and `等待授权`, consistent with the product rule that unavailable data must not be fabricated.

## Focused evidence

- Desktop hero: `/tmp/oneshowseo-home-qa-20260830/implementation-desktop-v3.png` confirms headline wrapping, CTA prominence, visual-path scale, trust microcopy, navigation spacing, and first-scroll transition.
- Mobile hero: `/tmp/oneshowseo-home-qa-20260830/implementation-mobile-v1.png` confirms readable type, full-width conversion controls, no horizontal overflow, and intentional art cropping.
- Mobile menu: `/tmp/oneshowseo-home-qa-20260830/implementation-mobile-menu.png` confirms an accessible expanded state with all primary links and auth actions.

## Required fidelity surfaces

- Fonts and typography: Geist with Chinese system fallbacks; strong display hierarchy and readable 12–18px supporting text. Headline wrapping matches the selected two-line direction on desktop and remains readable on mobile.
- Spacing and layout rhythm: consistent 1260–1320px desktop frame, alternating white and pale-blue bands, restrained borders, and no nested card grids. Hero, workflow, evidence, pricing, FAQ, and final CTA remain visually distinct.
- Colors and tokens: white, deep ink, cobalt/indigo, pale cyan, green success, amber waiting, and the coral destination accent map closely to the selected visual.
- Image quality and asset fidelity: the generated route artwork is delivered as `visibility-journey-v2.webp` at `900 × 1013`. It keeps transparency while reducing the transfer size from 871KB to 91KB. Existing OneShowSEO brand imagery and Phosphor icons remain sharp and consistent.
- Copy and content: the slogan is exactly `让每一个好产品都应该被看见`; the page is outcome-led, does not claim fabricated traffic or customer metrics, and states payment/data-connection boundaries honestly.
- Responsiveness and accessibility: desktop and 390px mobile layouts were inspected. There is no horizontal overflow. Focus-visible styles, reduced-motion handling, semantic navigation, native disclosure controls, and practical mobile targets are present.

## Interaction verification

- Mobile navigation opens and closes; `aria-expanded` changes to `true` in the open state.
- Mobile navigation contains product, workflow, why, pricing, and login-first entry actions.
- Primary CTA resolves to `/login`; registration remains the secondary path inside authentication.
- FAQ disclosure opens and reveals its answer.
- Browser console errors checked: none.

## Comparison history

### Production follow-up: route visibility and loading

- User evidence: `/var/folders/2c/sdg0hxmx3b5_x84y09b7hk1w0000gn/T/codex-clipboard-707f1bda-f74b-421e-ac18-817d86d19d27.png` showed a hard vertical artwork edge and state cards covering the route.
- Desktop fix evidence: `/tmp/oneshowseo-road-fix/01-desktop-fixed.png` confirms that the left artwork edge now fades into the page and the two lower labels sit away from the main route.
- Mobile fix evidence: `/tmp/oneshowseo-road-fix/02-mobile-fixed.png` confirms readable first-screen hierarchy and no horizontal overflow at `390 × 844`.
- Browser console errors after the fix: none.

### Iteration 1

- The first screenshot was rejected because it was captured before styles had settled; it was not accepted as design evidence.

### Iteration 2

- P2: the page was visibly more vertically sparse than the selected direction.
- P2: the hero journey asset was too large and competed with the headline.
- Fixes: reduced major section padding, shortened final/footer regions, reduced display-type scale, narrowed the hero asset, and moved it closer to the selected composition.
- Post-fix evidence: `implementation-desktop-v3.png`, `implementation-full-v3.png`, and `comparison-v3.png`.

### Iteration 3

- No actionable P0, P1, or P2 differences remain.
- Accepted deviation: the production product preview uses honest connection/availability states instead of the mock's fabricated numerical dashboard.
- P3 follow-up: a future iteration could add a subtle scroll-linked reveal to the path after performance measurement, but the current motion is intentionally lightweight and respects reduced-motion preferences.

## Final result

final result: passed
