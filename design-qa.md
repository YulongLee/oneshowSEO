# Content Plan v3 — Design QA

- Source visual truth: `/var/folders/2c/sdg0hxmx3b5_x84y09b7hk1w0000gn/T/codex-clipboard-977274b3-0b9a-4935-b54e-7dbbf2324d61.png`
- Desktop implementation: `/tmp/oneshowseo-content-plan-redesign-audit/20-内容机会.png`
- Calendar workspace: `/tmp/oneshowseo-content-plan-redesign-audit/31-内容日历-viewport.png`
- Task workspace: `/tmp/oneshowseo-content-plan-redesign-audit/32-内容任务-viewport.png`
- Topic cluster workspace: `/tmp/oneshowseo-content-plan-redesign-audit/33-主题集群-viewport.png`
- Performance workspace: `/tmp/oneshowseo-content-plan-redesign-audit/34-performance-viewport.png`
- Mobile evidence: `/tmp/oneshowseo-content-plan-redesign-audit/41-mobile-opportunities-final.png`
- State: authenticated workspace, `example.com` selected, no usable content opportunities, completed Research run with no plannable opportunity, light theme.

## Findings

No actionable P0, P1, or P2 differences remain.

- Commercial hierarchy: restored the reference's clear page header, navigation, readiness callout, KPI row, work surface, and supporting analysis hierarchy. Empty data no longer collapses the product into one oversized placeholder.
- Independent jobs: the five tabs now represent five different jobs rather than repeated empty panels: opportunity prioritization, editorial scheduling, production operations, topic architecture, and outcome measurement.
- Calendar boundary: Content Opportunity exposes only a read-only current-week preview and a handoff into the full calendar; cross-week navigation, backlog management, scheduling controls, and production status remain in Content Calendar.
- Honest data: the page uses persisted Research, Content, Publish, and Analytics sources. Missing keyword metrics, GSC, and GA4 data remain explicitly unavailable instead of being estimated.
- Typography and density: headings, tab labels, KPI values, filters, tables, and action labels retain the existing OneShowSEO type system while matching the selected reference's compact commercial density.
- Responsive behavior: the 390 px implementation has no horizontal document overflow (`bodyWidth = documentWidth = viewport = 390`). Header actions stay on one line, workspaces stack, and the tab rail remains usable.
- Accessibility and interactions: semantic tabs retain selected state; primary actions and filters remain keyboard-addressable; previous/next calendar controls and all five workspace tabs were exercised.
- Browser quality: the authenticated desktop and mobile states rendered without console errors or warnings.

## Comparison History

### Iteration 1

- [P1] The whole page was previously replaced by a prerequisite empty state, making the product feel unfinished.
  - Fix: introduced a compact recommended-next-step launchpad while keeping the commercial KPI and workspace shell visible.
- [P1] Calendar, tasks, clusters, and performance repeated the same prerequisite experience.
  - Fix: replaced them with distinct calendar/backlog, Kanban production board, pillar/support cluster architecture, and outcome/data-coverage workspaces.
- [P2] The production hierarchy had drifted away from the selected reference and left too much unstructured whitespace.
  - Fix: restored the reference-aligned header, KPI strip, filter surface, split opportunity/calendar layout, and supporting analysis panels.
- [P2] The mobile primary action could wrap and the filter area was too compressed.
  - Fix: adjusted the mobile action grid, non-wrapping CTA sizing, stacked cards, and compact filter controls.

## Primary Interactions Tested

- Open Content Plan from the workspace sidebar.
- Switch through Content Opportunity, Content Calendar, Content Tasks, Topic Clusters, and Content Performance.
- Move the calendar backward and forward one week.
- Enter the full Content Calendar from the current-week preview and verify both surfaces retain distinct headings and controls.
- Verify Research and data-management calls to action remain available in honest empty states.
- Verify desktop at 1440 × 1000 and mobile at 390 × 844.
- Run focused Content Plan tests, production build, lint, and the complete automated suite.

## Automated Verification

- Focused Content Plan tests: 5/5 passed.
- Full automated suite: 349/349 passed.
- Production build: passed.
- Lint: 0 errors; 2 pre-existing warnings in `app/workspace/page.tsx` outside this change.

## Follow-up Polish

- [P3] Persist the selected Content Plan tab in the URL so a refresh returns to the same workspace.

final result: passed
