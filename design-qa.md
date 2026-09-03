# Content Plan Option 2 — Design QA

- Source visual truth: `/Users/liyulong/.codex/generated_images/019fd226-0973-7231-b747-2b339e3c838c/exec-b281c85c-920a-4bb6-b3a2-8b2515ecd207.png`
- Browser-rendered implementation: `/tmp/oneshowseo-content-plan-audit/09-option-2-final.png`
- Mobile evidence: `/tmp/oneshowseo-content-plan-audit/08-option-2-mobile-final.png`
- Combined comparison: `/tmp/oneshowseo-content-plan-audit/10-final-reference-vs-implementation.png`
- Source pixels: 1487 × 1058 at 1×
- Implementation pixels: 1280 × 1088 full-page at 1×; browser CSS viewport 1280 × 720
- Mobile pixels / CSS viewport: 390 × 844 at 1×
- Density normalization: both source and implementation were treated as 1×; the implementation was proportionally normalized to 1058 px high only for the combined side-by-side comparison.
- State: authenticated workspace, `example.com` selected, no usable content opportunities, completed Research run containing no plannable content opportunity, light theme.

## Findings

No actionable P0, P1, or P2 differences remain.

- Fonts and typography: the implementation keeps the product's existing Chinese UI font stack and uses a readable 11–22 px hierarchy. Labels, prerequisite descriptions, CTA copy, and workflow step text do not clip. The 390 px tab labels now remain on one line and scroll horizontally.
- Spacing and layout rhythm: the selected two-column composition, dominant next-action surface, workflow sequence, and narrower readiness rail are preserved. The implementation intentionally retains the product's wider production sidebar rather than copying the concept image's simplified navigation.
- Colors and visual tokens: the existing OneShowSEO violet, neutral borders, green ready state, red blocked state, and amber current-step token are used consistently with the selected direction.
- Image quality and asset fidelity: the visual target contains no required raster product imagery. All visible UI symbols use the project's existing Phosphor icon library; no placeholder or custom SVG artwork was introduced.
- Copy and content: every message is connected to real project and Research API state. The screen does not present fabricated KPIs, calendar items, or sample opportunities.
- Responsiveness: no horizontal page overflow at 820 px or 390 px. The two-column layout stacks, the callout CTA expands to full width, and tabs remain usable through horizontal scrolling.
- Accessibility and interactions: tab roles and selected state remain intact; primary buttons have visible focus treatment; content opportunity, calendar, Research CTA, and return navigation were exercised in the browser.

## Focused Region Evidence

- Next-action callout and readiness rail were compared at desktop size because they define the selected direction's main hierarchy.
- Mobile header, CTA, and tab strip were checked separately at 390 × 844 because those controls were too small to judge in the full-page comparison.

## Comparison History

### Iteration 1

- [P1] Research readiness was initially shown as complete when the latest run had completed but produced no usable content opportunities.
  - Fix: readiness now remains blocked and explains that the run completed without a plannable opportunity; the CTA changes to “重新研究机会”.
- [P1] Empty calendar/task/cluster/performance tabs still exposed creation controls that bypassed the Research prerequisite.
  - Fix: every empty tab now presents a contextual prerequisite state and routes back to Research Agent.
- [P2] Mobile tab labels wrapped and weakened scanability.
  - Fix: tab buttons now use non-wrapping, horizontally scrollable labels.
- Post-fix evidence: `/tmp/oneshowseo-content-plan-audit/09-option-2-final.png` and `/tmp/oneshowseo-content-plan-audit/08-option-2-mobile-final.png`.

## Primary Interactions Tested

- Open Content Plan from the workspace sidebar.
- Switch between Content Opportunity and Content Calendar.
- Verify empty secondary views enforce the Research prerequisite.
- Open Research Agent from the primary CTA and return to Content Plan.
- Verify desktop, tablet, and mobile widths.
- Check captured browser console errors: none.

## Secondary Workspace Verification

- Content Calendar now separates the weekly schedule from an unscheduled queue and persists date, priority, and production status changes.
- Content Tasks now provides status filters, search, plan management, and a direct handoff to Content Creation.
- Topic Clusters now derives pillar and supporting topics from persisted research opportunities and shows real Brief conversion coverage.
- Content Performance now reads Content Agent runs, verified Publish Agent receipts, and Analytics data coverage. Missing GSC/GA4 snapshots remain explicitly marked as unavailable.
- Browser verification covered all four tabs in the authenticated workspace. The Content Performance empty/partial-data state rendered without clipping, overflow, or console errors.
- Full build and automated suite: 349/349 tests passed.

## Follow-up Polish

- [P3] A future iteration could persist the selected Content Plan tab in the URL so a browser refresh returns to the same view.

final result: passed
