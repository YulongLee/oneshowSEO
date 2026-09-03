# Content Plan command center — Design QA

- Source visual truth: `/var/folders/2c/sdg0hxmx3b5_x84y09b7hk1w0000gn/T/codex-clipboard-977274b3-0b9a-4935-b54e-7dbbf2324d61.png`
- User-reported failed state: `/var/folders/2c/sdg0hxmx3b5_x84y09b7hk1w0000gn/T/codex-clipboard-4a3e4cf1-a811-4a7e-ba83-7fff128081bd.png`
- Rendered implementation: `.artifacts/content-plan-qa/content-plan-populated-redesign.png`
- Responsive captures: `.artifacts/content-plan-qa/content-plan-tablet.png`, `.artifacts/content-plan-qa/content-plan-narrow.png`
- Source pixels: 1536 × 1024. Implementation pixels: 1403 × 1363 at a 1403 × 1277 CSS viewport and device density 1. Responsive viewports: 1024 × 900 and 760 × 900.
- State: authenticated OneShowSEO workspace with an isolated nine-opportunity, one-Brief, one-unscheduled-plan fixture. The fixture is not part of product code or the commit.
- Comparison evidence: the source image and populated implementation capture were opened together in one comparison input; the full content-plan surface and the opportunity/planning region were readable without a separate crop.

## Findings

No actionable P0, P1, or P2 findings remain.

- Typography: page title, tabs, metrics, table labels and action copy retain the existing OneShowSEO type scale; long opportunity titles wrap without colliding with metrics or actions.
- Layout and spacing: the opportunity queue is the dominant work surface; the former empty 7-column calendar is replaced by a compact weekly strip, pipeline status and one explicit next action. Analytics now spans the full board instead of floating under only the right half.
- Colors and tokens: brand purple, neutral borders, green completed states and the dark recommendation surface remain consistent with the existing workspace tokens and preserve readable contrast.
- Imagery and icons: this is a data application screen with no raster imagery in the target. All interface symbols use the existing Phosphor icon family; no placeholder or custom-drawn assets were introduced.
- Copy and content: source names are customer-facing Chinese labels; missing metrics remain “待接入”; the next-action card is derived from real Brief, plan and publish state.
- Responsiveness: no page-level horizontal overflow at 1024 px or 760 px. The planning summary stacks below the opportunity table and the sidebar becomes the existing horizontal mobile navigation.
- Accessibility and behavior: semantic tabs, labelled pagination, keyboard-selectable opportunities, modal close control, disabled boundaries and visible selected states are intact.

## Comparison History

### Iteration 1 — blocked

- [P1] The calendar occupied 552 px even when no content was scheduled, creating a large empty surface and weakening the opportunity decision task.
- [P1] Opportunity analytics were offset to the right, leaving a large blank block under the table.
- [P2] The page showed status but did not explain the next required step from opportunity to Brief, schedule and publish.

Fixes: replaced the large calendar with a compact weekly schedule; added a four-stage content pipeline and state-derived next action; restored analytics to a balanced full-width section; retained six-row pagination.

### Iteration 2 — blocked

- [P1] Opening the populated Topic Cluster tab produced a React console error because the detail renderer returned a function rather than an element.
- [P2] Cluster portfolio rows could not switch the active topic group.

Fixes: invoked the detail renderer, keyed the active fragment to avoid stale content, and added selectable active cluster state.

### Iteration 3 — passed

- Re-captured the populated opportunity screen and compared it with the source.
- Verified pagination, all five content-plan tabs, Brief modal open/close, cluster switching, empty state, 1024 px and 760 px layouts.
- Fresh browser run reports no console errors.

## Primary Interactions Tested

- Open Content Plan from the authenticated workspace.
- Move between both opportunity pages.
- Open and close the Create Brief dialog without submitting data.
- Open Content Calendar, Content Tasks, Topic Clusters and Content Performance.
- Switch from the Commercial Research cluster to the Informational cluster and verify the pillar/support content updates.
- Check desktop, tablet and narrow layouts for overflow.

final result: passed
