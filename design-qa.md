# Content Plan v4 — Design QA

- Source visual truth: `/var/folders/2c/sdg0hxmx3b5_x84y09b7hk1w0000gn/T/codex-clipboard-977274b3-0b9a-4935-b54e-7dbbf2324d61.png`
- Reported populated production state: `/var/folders/2c/sdg0hxmx3b5_x84y09b7hk1w0000gn/T/codex-clipboard-d44f9825-7301-4af1-8c86-3d3302e0d337.png`
- Browser QA: authenticated OneShowSEO workspace at 1640 × 1250 and 390 × 844.
- Populated-state fixture: isolated copy of the local database containing nine content-shaped Research opportunities. The fixture lived only under `/tmp/oneshowseo-content-plan-populated-audit/qa.sqlite` and is not part of the product or commit.
- Comparison method: the reference and the rendered populated implementation were emitted together in one visual comparison input.

## Findings

No actionable P0, P1, or P2 differences remain.

- Stable commercial composition: the opportunity list and weekly schedule now keep a fixed shared height, so real result volume cannot stretch the calendar or push the analysis section below the intended hierarchy.
- Deliberate information density: the opportunity pane receives slightly more width than the calendar, preserving readable topics, source labels, keyword metrics, scores, and Brief actions.
- Bounded results: opportunity pages display at most six rows. Nine real opportunities produce a six-row first page and a three-row second page with working previous/next controls.
- Product language: internal source keys such as `public_crawl` and `competitor_analysis` are presented as Chinese customer-facing labels while retaining the original values for filtering and provenance.
- Honest data: production UI still reads persisted Research, Content, Publish, and Analytics sources. No visual fixture or fabricated metric was added to frontend code.
- Responsive behavior: at 390 px the page header, primary actions, tabs, and KPI cards remain readable and stack without clipping the main task.
- Accessibility and interactions: pagination has accessible labels and disabled boundary states; filters reset to the first page; keyboard-selectable opportunity rows and semantic tabs remain intact.

## Comparison History

### Iteration 1

- [P1] All nine opportunities expanded in one column and forced the adjacent calendar into a long empty panel.
  - Fix: introduced a six-row page boundary and independent, fixed-height opportunity/calendar surfaces.
- [P2] The original 47/53 split left long opportunity titles and source names cramped.
  - Fix: rebalanced the populated desktop layout to approximately 53/47 in favor of the decision table.
- [P2] Raw research source keys looked like implementation details in a commercial product.
  - Fix: added customer-facing source names in the opportunity table and distribution legend.

## Primary Interactions Tested

- Open Content Plan from the authenticated workspace sidebar.
- Render nine real-shaped opportunities without frontend mock data.
- Verify page 1 shows six Brief actions and page 2 shows the remaining three.
- Verify previous/next boundary states and the `共 9 条 · 每页最多 6 条` indicator.
- Compare the approved reference and populated implementation in the same 1640 px visual review.
- Verify the 390 × 844 responsive state.

## Automated Verification

- Production build: passed.
- Full automated suite: 349/349 passed.
- Lint: 0 errors; 2 pre-existing warnings in `app/workspace/page.tsx` outside this change.
- Diff integrity check: passed.

final result: passed
