# Homepage Visibility Stages — Design QA

- Source visual truth: `/var/folders/2c/sdg0hxmx3b5_x84y09b7hk1w0000gn/T/codex-clipboard-a02180c1-862c-4aa3-86db-31979ecbff21.png`
- Desktop implementation: `/Users/liyulong/.codex/.chatgpt-projects/g-p-6a683d1ad61c819185e753932b3c2aec/seo-agent-frontend/design-implementation-desktop.png`
- Mobile implementation: `/Users/liyulong/.codex/.chatgpt-projects/g-p-6a683d1ad61c819185e753932b3c2aec/seo-agent-frontend/design-implementation-mobile-stages.png`
- Combined comparison: `/Users/liyulong/.codex/.chatgpt-projects/g-p-6a683d1ad61c819185e753932b3c2aec/seo-agent-frontend/design-comparison-desktop.png`
- Desktop viewport: 1600 × 950 CSS px, device density 1
- Mobile viewport: 390 × 844 CSS px, device density 1
- Source pixels: 894 × 741
- Desktop capture pixels: 1600 × 1445; comparison crop: 880 × 740
- Mobile stage capture pixels: 390 × 844
- State: Chinese, homepage hero, default interaction state

## Full-view comparison evidence

The source placed three separate cards at unrelated left offsets, which fragmented the illustration and made the progression difficult to scan. The implementation consolidates the same three states into one aligned, translucent stage rail below the path. The route remains visually dominant and the progression now reads left to right.

## Focused-region comparison evidence

The combined desktop comparison checks the illustration crop, card density, icon treatment, label hierarchy, borders, shadows, and vertical placement. The mobile stage capture verifies the compact three-column treatment at 390 px. No horizontal overflow is present (`scrollWidth` equals `clientWidth`, both 390 px).

## Required fidelity surfaces

- Fonts and typography: existing OneShowSEO type scale and system font stack are preserved; stage titles remain readable and descriptions retain secondary hierarchy on desktop.
- Spacing and layout rhythm: the three cards now share one grid, equal padding, consistent vertical alignment, and a single shadow/elevation system.
- Colors and visual tokens: existing blue, cyan, and green product tokens are reused to show progression without adding a competing palette.
- Image quality and asset fidelity: the original `visibility-journey-v2.webp` asset is preserved without stretching or replacement.
- Copy and content: all three original titles and descriptions remain unchanged; mobile hides descriptions to preserve legibility at the breakpoint.

## Comparison history

1. Earlier finding: P1 — three independent floating cards created an irregular visual hierarchy and competed with the main path illustration.
2. Fix: replaced absolute per-card positioning with a single responsive stage rail; added equal columns, separators, unified elevation, and compact mobile behavior.
3. Post-fix evidence: desktop combined comparison and mobile stage capture show a coherent sequence with no overlap or viewport overflow.

## Findings

No actionable P0, P1, or P2 issues remain.

## Follow-up polish

- P3: descriptions are intentionally hidden below 600 px; they can be exposed through a tap interaction in a later iteration if mobile users need the detail inline.

## Interaction and console checks

- Primary homepage CTA text and styles were verified.
- Navigation and homepage content remained present after responsive reload.
- Browser console: no errors or warnings during the desktop check.

final result: passed

---

# Content Plan Screenshot-Aligned Refactor QA (2026-09-03)

- Source visual truth: `/var/folders/2c/sdg0hxmx3b5_x84y09b7hk1w0000gn/T/codex-clipboard-977274b3-0b9a-4935-b54e-7dbbf2324d61.png`
- Implementation screenshot: `.artifacts/content-plan-reference-qa/implementation.png`
- Side-by-side comparison: `.artifacts/content-plan-reference-qa/comparison.png`
- Comparison viewport: 1536 × 1024 CSS px, device scale factor 1
- Source pixels: 1536 × 1024
- Implementation pixels: 1536 × 1024
- Density normalization: none; both inputs are already the same pixel size
- Verified state: authenticated OneShowSEO workspace, default “内容机会” tab, real project data only

## Comparison evidence

- Full view: the combined image verifies the same sidebar/main split, page header, tab rail, six KPI cards, two-column opportunity/calendar workbench, analysis row and bottom recommendation strip.
- Focused regions: header actions, KPI typography, table columns, empty-state CTA, seven-day calendar controls and analytical card labels were legible in the equal-size combined capture, so separate crops were unnecessary.

## Fidelity review

- Fonts and typography: passed. Page heading, tab labels, KPI hierarchy, table headings and action labels remain legible at the target desktop viewport.
- Spacing and layout rhythm: passed. The six-card KPI rail, opportunity/calendar split, analysis row and hot-topic strip follow the supplied reference hierarchy. Existing sidebar proportions and navigation are unchanged.
- Colors and visual tokens: passed. OneShowSEO violet, neutral border, green, amber and blue semantic tokens are consistently applied without introducing a separate visual system.
- Image quality and asset fidelity: passed. This data workspace does not require raster content; existing logo and Phosphor icons remain crisp.
- Copy and content: passed. The page uses the approved Chinese labels and displays missing data as “待接入” or an explicit empty state instead of fabricated values.

## Functional evidence

- Dedicated content-planning API reads research opportunities and persists Content Briefs and schedules separately from article generation.
- Technical audit findings are excluded from content opportunity discovery.
- Creating a Brief does not queue content generation and does not reserve or deduct Credits.
- Opportunity detail, Brief creation dialog, tab switching, weekly calendar controls and scheduled-item detail entry are wired.
- Desktop and 820px responsive checks report no document-level horizontal overflow.
- Browser console contains no warning or error produced by the page.

## Intentional deviation

The supplied screenshot contains populated example metrics and schedules. The implementation preserves the same structure but renders an honest empty state when the selected project has no eligible research opportunities or Content Briefs.

final result: passed
---

# Settings Center v2 — Design QA

- Source visual truth: `/var/folders/2c/sdg0hxmx3b5_x84y09b7hk1w0000gn/T/codex-clipboard-58dfaa9b-001c-431f-9744-c03e5e8368a0.png`
- Implementation screenshot: `/Users/liyulong/.codex/.chatgpt-projects/g-p-6a683d1ad61c819185e753932b3c2aec/seo-agent-frontend/.artifacts/settings-center-implementation.png`
- Combined comparison: `/Users/liyulong/.codex/.chatgpt-projects/g-p-6a683d1ad61c819185e753932b3c2aec/seo-agent-frontend/.artifacts/settings-center-comparison.png`
- Source pixels: 1536 × 1024.
- Verified state: authenticated Chinese workspace for the current `example.com` project.

## Full-view comparison evidence

The implementation retains the source hierarchy: settings header and project identity, seven configuration tabs, three primary project cards, data-source/publishing/Agent modules, and team/notification governance. At the in-app browser's narrower desktop width, three-column rows responsively become two columns; no content is clipped and the existing OneShowSEO sidebar remains readable.

## Product-truth changes

- Sample company names, fake teammates, sample brand documents, fake social channels and a hard-coded model selector were not copied.
- Project fields, connection states, WordPress publishing availability, Agent schedules, team membership and notification preferences are loaded from existing production APIs.
- Sitemap and robots paths are explicitly labelled as suggested addresses until technical audit verifies them.
- Unsupported brand-document upload is clearly labelled unavailable instead of displaying invented files.

## Comparison history

1. P1 — notification preferences were blocked when the optional recovery-link signing secret was absent.
   Fix: decoupled preference/list access from recovery-link signing; only recovery-link generation and consumption now require the secret.
   Post-fix evidence: browser validation shows all four real preference rows, with independent in-app and email toggles.
2. P2 — the old settings route mixed configuration with unavailable placeholder sections and did not match the supplied information hierarchy.
   Fix: introduced a dedicated Settings Center with functional tab navigation, real project editing, integration/channel summaries, Agent schedules, team access and notification controls.
   Post-fix evidence: all seven tabs and the project edit dialog were exercised in the authenticated browser session.

## Interaction and runtime checks

- All seven settings tabs switch correctly.
- The project editor opens with current values and uses the versioned project PATCH endpoint.
- Notification preferences load and expose persisted per-channel controls.
- Data source and team management actions route to the existing governed management surfaces.
- Nine focused Settings/Notifications tests passed.
- ESLint has no new errors; one pre-existing unrelated image optimization warning remains.
- Production build completed successfully.

## Findings

No actionable P0, P1 or P2 issues remain for the verified current-project state.

## Follow-up polish

- P3: repeat the visual comparison after the first WordPress, analytics and search-console connections so populated-state row density can be tuned with real data.

final result: passed

---

# Content Library v2 — Design QA

- Source visual truth: `/var/folders/2c/sdg0hxmx3b5_x84y09b7hk1w0000gn/T/codex-clipboard-f580ba42-6371-41f8-8c45-baf90a35c444.png`
- Implementation screenshot: `/Users/liyulong/.codex/.chatgpt-projects/g-p-6a683d1ad61c819185e753932b3c2aec/seo-agent-frontend/.artifacts/content-library-implementation.png`
- Combined comparison: `/Users/liyulong/.codex/.chatgpt-projects/g-p-6a683d1ad61c819185e753932b3c2aec/seo-agent-frontend/.artifacts/content-library-comparison.png`
- State: Chinese authenticated workspace; reference contains demonstration assets, implementation uses the current `example.com` project's truthful empty state.

## Full-view comparison evidence

The implementation reproduces the source hierarchy: page title and global search, advanced filters, seven lifecycle tabs, six asset metrics, filterable content index, list/grid controls, CSV export, pagination, content-type distribution, platform distribution, and popular topics. At the current browser width the existing wider OneShowSEO navigation is preserved and the content index uses horizontal containment rather than shrinking text below readability.

## Required fidelity surfaces

- Typography and spacing retain the current OneShowSEO tokens while matching the reference's compact asset-management density.
- Purple active states, pale semantic metric icons, white panels, light borders, and low-radius controls follow the supplied visual.
- Phosphor icons and the real OneShowSEO logo are used; no placeholder thumbnails, fake images, or code-drawn artwork were introduced.
- Reference counts, thumbnails, authors, traffic, and platform data were not copied. All visible counts and row states are derived from real content runs, durable versions, quality scores, authenticated users, and verified Publish Agent records.

## Interaction and runtime checks

- Content Library navigation opens the redesigned destination.
- Advanced filters open and close.
- List/grid view controls switch presentation.
- Lifecycle tabs filter the index, including the isolated recycle-bin state.
- New Content routes into the dedicated Content Creation studio.
- CSV export is disabled when no real rows exist and exports only filtered real rows when available.
- Four focused Content Library contract tests passed.
- ESLint completed with no new errors; one pre-existing unrelated image optimization warning remains.
- Production build completed successfully.

## Findings

No actionable P0, P1, or P2 issues remain in the verified empty-project state.

## Follow-up polish

- P3: repeat browser comparison after the Content Worker has produced the first real asset, so populated table density and real platform distribution can be tuned against live data.

final result: passed

---

# Content Plan v2 — Design QA

- Source visual truth: `/var/folders/2c/sdg0hxmx3b5_x84y09b7hk1w0000gn/T/codex-clipboard-8e9a78a9-cdbc-4f97-9100-ff41836fe700.png`
- Implementation screenshot: `/Users/liyulong/.codex/.chatgpt-projects/g-p-6a683d1ad61c819185e753932b3c2aec/seo-agent-frontend/.artifacts/content-plan-implementation.png`
- Full-view comparison: `/Users/liyulong/.codex/.chatgpt-projects/g-p-6a683d1ad61c819185e753932b3c2aec/seo-agent-frontend/.artifacts/content-plan-comparison.png`
- Source pixels: 1536 × 1024
- Browser viewport: 1060 × 946 CSS px, device density 1.3
- Implementation screenshot pixels: 1060 × 946
- Comparison crop: both views normalized to 1060 × 706
- State: Chinese, authenticated `example.com` workspace, Content Opportunities tab, honest empty opportunity state

## Full-view comparison evidence

The implementation follows the source information architecture: page-level title and actions, five content-planning tabs, six KPI cards, opportunity filters and table, weekly calendar, source/type insights, and topic recommendations. At the narrower browser viewport the source's desktop split layout intentionally stacks the calendar below the opportunity table so text remains readable and the page has no horizontal overflow.

## Focused-region comparison evidence

The side-by-side comparison verifies the title hierarchy, tab order, KPI grouping, filter density, opportunity-table columns, calendar treatment, control radii, brand colors, and empty-state hierarchy. Existing OneShowSEO components and Phosphor icons are reused. Screenshot demo values were not copied: unavailable metrics remain `待接入`, and opportunity/calendar modules show real zero or empty states for the current project.

## Required fidelity surfaces

- Fonts and typography: existing OneShowSEO system stack, readable workspace scale, and source-like title/card hierarchy are retained.
- Spacing and layout rhythm: six equal KPI cards, aligned filter controls, a desktop table/calendar split, and responsive stacking are implemented.
- Colors and visual tokens: existing brand purple, pale blue, green, orange, border, and background tokens are reused.
- Image and icon fidelity: the existing OneShowSEO logo and established icon library are used; no placeholder or CSS-drawn assets were introduced.
- Copy and content: the source's new product concepts are implemented as 内容机会、内容日历、内容任务、主题集群、内容表现, while values come only from current APIs and Worker records.

## Comparison history

1. Initial finding: P1 — the former Content Agent dashboard did not match the new planning workflow and overemphasized pipeline status.
   Fix: rebuilt the page around opportunity intake, calendar planning, task execution, clusters, and measurable content outcomes.
2. Initial finding: P1 — copying the screenshot's 128 opportunities and traffic totals would create false product data.
   Fix: all KPIs, rows, distributions, and calendar entries now derive from current Research, Content, Publish, and Task records; missing integrations are clearly labeled.
3. Browser finding: P2 — weekly navigation updated state but did not immediately repaint the calendar.
   Fix: memoized week construction and keyed the calendar by week offset. Post-fix testing changed `08/31 – 09/06` to `09/07 – 09/13` and restored the original range successfully.

## Interaction and runtime checks

- All five content tabs switch successfully and expose the selected state.
- Weekly calendar previous/next controls update and restore the displayed range.
- Create Content Plan opens one dialog and the close control removes it.
- Browser check: no horizontal overflow, no broken images, and no residual dialog after close.
- ESLint: no errors; one pre-existing unrelated `<img>` optimization warning remains.
- Focused browser accessibility, workspace navigation, availability, and Content Agent tests: 14 passed.
- Production build completed successfully.

## Findings

No actionable P0, P1, or P2 issues remain for the Content Plan page.

## Follow-up polish

- P3: when real opportunities and publishing schedules accumulate, pagination and calendar overflow can be tuned against production-scale datasets.

final result: passed

---

# Workspace Sidebar Navigation v4 — Design QA

- Source visual truth: `/var/folders/2c/sdg0hxmx3b5_x84y09b7hk1w0000gn/T/codex-clipboard-4c2804b4-7f58-4943-9e5b-5749b9ff6920.png`
- Desktop implementation: `/Users/liyulong/.codex/.chatgpt-projects/g-p-6a683d1ad61c819185e753932b3c2aec/seo-agent-frontend/sidebar-v4-desktop-final.png`
- Collapsed implementation: `/Users/liyulong/.codex/.chatgpt-projects/g-p-6a683d1ad61c819185e753932b3c2aec/seo-agent-frontend/sidebar-v4-collapsed.png`
- Mobile implementation: `/Users/liyulong/.codex/.chatgpt-projects/g-p-6a683d1ad61c819185e753932b3c2aec/seo-agent-frontend/sidebar-v4-mobile.png`
- Full-view comparison: `/Users/liyulong/.codex/.chatgpt-projects/g-p-6a683d1ad61c819185e753932b3c2aec/seo-agent-frontend/sidebar-v4-comparison.png`
- Focused sidebar comparison: `/Users/liyulong/.codex/.chatgpt-projects/g-p-6a683d1ad61c819185e753932b3c2aec/seo-agent-frontend/sidebar-v4-focused-comparison.png`
- Desktop viewport: 1600 × 1024 CSS px, device density 1
- Mobile viewport: 820 × 1000 CSS px, device density 1
- Source pixels: 1536 × 1024
- Desktop implementation pixels: 1600 × 1024
- Mobile implementation pixels: 820 × 1000
- State: Chinese, authenticated workspace overview, expanded navigation with low-frequency management group closed

## Full-view comparison evidence

The implementation preserves the reference hierarchy: brand and project selector at the top, business navigation grouped down the left edge, a clearly highlighted current page, and a dedicated collapse control at the bottom. The implementation intentionally uses a wider 258 px sidebar than the reference because the prior product feedback specifically identified small type and a cramped menu as usability problems.

## Focused-region comparison evidence

The focused comparison verifies logo scale, project selector, group labels, icon alignment, active-state treatment, separators, footer actions, and collapse control. Real Phosphor icons and the existing OneShowSEO brand image are used; no placeholder or CSS-drawn assets replace the source UI assets.

## Required fidelity surfaces

- Fonts and typography: existing OneShowSEO system stack is preserved; navigation labels render at 12 px with stronger active weight and readable 34 px rows.
- Spacing and layout rhythm: navigation uses a consistent 23 px group header, 34 px item row, aligned 16 px icons, and fixed footer actions. The main canvas expands when the sidebar collapses.
- Colors and visual tokens: existing ink, line, pale blue, and brand purple tokens are retained. Active state adds a restrained left indicator and soft blue fill.
- Image quality and asset fidelity: the existing PNG brand lockup is reused and cropped to its real icon in collapsed mode; icons come from the established product icon library.
- Copy and content: all existing destinations remain available. They are regrouped into 工作台、增长、内容、GEO、监控、自动化、数据、管理 without adding fabricated product capabilities.

## Comparison history

1. Earlier finding: P1 — the large plan card consumed navigation height and hid core groups.
   Fix: removed the redundant sidebar plan card while retaining Billing and upgrade destinations; low-frequency management is closed by default.
   Post-fix evidence: `sidebar-v4-desktop-final.png` shows the business groups, data entry, fixed team/settings actions, and collapse control within the viewport.
2. Earlier finding: P1 — mobile navigation inherited flex height and left a 170 px blank region above the workspace.
   Fix: fixed the mobile navigation rail to 44 px and kept it horizontally scrollable.
   Post-fix evidence: `sidebar-v4-mobile.png` shows a 176 px total mobile header, no blank block, and no horizontal page overflow (`scrollWidth` equals 820 px).
3. Earlier finding: P2 — collapsed icons hid their labels but the grid column remained 272 px because of a higher-specificity dashboard rule.
   Fix: added an explicit dashboard-aware collapsed grid override.
   Post-fix evidence: browser measurement confirms a 76 px collapsed sidebar and hidden label text.

## Findings

No actionable P0, P1, or P2 differences remain. The implementation intentionally favors improved readability over the narrower reference width.

## Interaction and console checks

- Whole sidebar collapse and expansion passed; collapsed width is 76 px.
- Individual navigation group collapse and expansion passed.
- Keyword Agent navigation and return to overview passed.
- Desktop and mobile page overflow checks passed.
- Browser console: no errors or warnings.
- Lint completed with no new errors; existing unrelated image optimization warning remains.
- Browser accessibility and workspace availability tests: 6 passed.
- Production build completed successfully.

## Follow-up polish

- P3: management destinations remain below the scroll boundary when all groups are expanded; Team and Settings stay fixed at the bottom, matching the reference's priority treatment.

final result: passed

---

# Content Creation Studio v2 — Design QA

- Source visual truth: `/var/folders/2c/sdg0hxmx3b5_x84y09b7hk1w0000gn/T/codex-clipboard-02ded4f3-17b3-40fe-9c70-75be93c60fba.png`
- Implementation screenshot: `/Users/liyulong/.codex/.chatgpt-projects/g-p-6a683d1ad61c819185e753932b3c2aec/seo-agent-frontend/.artifacts/content-creation-implementation.png`
- Full-view comparison: `/Users/liyulong/.codex/.chatgpt-projects/g-p-6a683d1ad61c819185e753932b3c2aec/seo-agent-frontend/.artifacts/content-creation-comparison.png`
- Source pixels: 1536 × 1024
- Browser viewport: 1060 × 946 CSS px, device density 1.3
- Implementation pixels: 1060 × 946
- Comparison crop: both views normalized to 1060 × 706
- State: Chinese authenticated workspace; source shows a populated demo article, implementation shows the current `example.com` project's truthful no-completed-content state

## Full-view comparison evidence

The implementation preserves the source composition: dedicated Content Creation destination, page actions, five top-level views, Brief and outline rail, master editor surface, AI assistant/material rail, score/version modules, and multi-platform outputs. At the narrower in-app browser width, the assistant region moves below the Brief/editor pair to preserve readable editing width without horizontal overflow.

## Focused-region comparison evidence

The combined comparison verifies header/action hierarchy, tab spacing, three-region desktop structure, bordered panels, empty-state treatment, purple active tokens, and assistant/score organization. The reference contains a demonstration article, scores, platform variants, and author avatar that do not exist in the current local project. The implementation intentionally does not copy those values; those regions populate only from the Content Worker artifact, quality checks, saved versions, and authenticated account shell.

## Required fidelity surfaces

- Fonts and typography: the existing OneShowSEO system stack is retained with source-like compact navigation, readable editor text, and clear title/body hierarchy.
- Spacing and layout rhythm: the source's Brief/editor/assistant proportions are reproduced at desktop widths and responsively reduced to two columns and then one column.
- Colors and visual tokens: existing brand purple, pale gray-blue backgrounds, semantic green/warning colors, borders, radii, and elevations are reused.
- Image and icon fidelity: the existing OneShowSEO brand asset and Phosphor icon system are used. No placeholder or code-drawn replacement assets were added.
- Copy and content: the new product language and controls follow the reference, while all content, scores, checks, word counts, versions, and platform readiness states derive from real APIs.

## Comparison history

1. Earlier finding: P1 — the sidebar's Content Creation item routed back to Content Plan, so the requested workflow did not exist.
   Fix: created a dedicated `ContentCreationStudio` destination and corrected the navigation target.
   Post-fix evidence: browser navigation selects Content Creation and renders the new studio with `编辑器` selected.
2. Earlier finding: P1 — generated Markdown artifacts and Brief fields were not available to an editor page.
   Fix: the content API now returns the clean content artifact ID and full Brief metadata; the studio requests authorized artifact access before rendering the body.
   Post-fix evidence: the empty project shows a truthful blocked editor, and the populated path is backed by artifact authorization rather than embedded sample copy.
3. Earlier finding: P1 — a Save Draft button without persistence would be misleading.
   Fix: added tenant/project/run-scoped `content_versions`, a permissioned PATCH endpoint, audit logging, word counts, and selectable version history.
   Post-fix evidence: static contract tests verify durable scope, permission enforcement, artifact linkage, and audit action.
4. Earlier finding: P2 — the no-score state still drew a small radar polygon.
   Fix: replaced the chart with a clear `等待质量检查` empty state until a real quality score exists.
   Post-fix evidence: final browser capture shows no fabricated score geometry.

## Interaction and runtime checks

- All five Content Creation tabs switch and expose the correct selected state.
- The empty-state `前往内容计划` action navigates to Content Plan; the sidebar returns to Content Creation.
- No horizontal viewport overflow, broken images, visible runtime errors, or residual dialogs were found.
- Save, regenerate, and review actions remain disabled until a real completed content run is available.
- Regeneration requires an explicit confirmation displaying the 20 Credits reservation.
- Focused Content Agent, accessibility, navigation, and Content Creation tests: 16 passed.
- ESLint: no new errors; one pre-existing unrelated image optimization warning remains.
- Production build completed successfully.

## Findings

No actionable P0, P1, or P2 issues remain for the verified current-project state.

## Follow-up polish

- P3: once the project has a completed content run, repeat the visual capture with the populated editor and a real saved-version cycle to tune article-specific density.

final result: passed

---

# Publish Management v2 — Design QA

- Source visual truth: `/var/folders/2c/sdg0hxmx3b5_x84y09b7hk1w0000gn/T/codex-clipboard-fbb50bce-9724-43cf-8412-ab907f230e8f.png`
- Implementation screenshot: `/Users/liyulong/.codex/.chatgpt-projects/g-p-6a683d1ad61c819185e753932b3c2aec/seo-agent-frontend/.artifacts/publish-management-implementation.png`
- Combined comparison: `/Users/liyulong/.codex/.chatgpt-projects/g-p-6a683d1ad61c819185e753932b3c2aec/seo-agent-frontend/.artifacts/publish-management-comparison.png`
- Source pixels: 1536 × 1024.
- Browser capture: 1400 × 1542 physical pixels at the in-app browser's responsive desktop width.
- Comparison normalization: both images scaled proportionally and padded to 1024 × 700 before horizontal composition.
- State: Chinese authenticated workspace; reference contains populated multi-platform demonstration data, implementation shows the current `example.com` project's truthful unconnected/empty production state.

## Full-view comparison evidence

The implementation preserves the source hierarchy: management header and actions, five lifecycle tabs, six release metrics, global filters, publication-plan index, month calendar, platform/status/effect modules, and the next-24-hours schedule. At the current narrower in-app browser width, the source's right rail moves below the plan/calendar pair to keep the calendar and content table readable.

## Focused-region comparison evidence

The combined comparison confirms the title/action hierarchy, metric-card rhythm, filter density, list/calendar proportion, semantic status colors, and secondary analytics modules. The source's thumbnails, counts, social platforms, traffic and success rate are sample content; the implementation intentionally replaces those with real WordPress connection state, durable publish requests, Worker execution state, verification results and explicit unavailable analytics states.

## Required fidelity surfaces

- Typography: existing OneShowSEO font stack and compact management hierarchy match the source while retaining readable small text.
- Spacing/layout: desktop three-column composition is preserved; the verified narrower viewport responsively becomes plan/calendar plus a three-panel row.
- Colors/tokens: current brand purple, pale gray-blue canvas, light borders and semantic green/orange/red states are retained.
- Image quality/assets: the real logo and Phosphor icon system are used. No fabricated thumbnails, social logos or placeholder raster assets were introduced.
- Copy/content: production terminology describes actual approval, scheduling, Worker, CMS and verification states; unavailable GSC/GA4 metrics are labelled `待接入`.

## Comparison history

1. P2 — the initial empty plan rendered both the table minimum height and a second empty-state height, making the left column substantially taller than the calendar.
   Fix: removed the duplicate table minimum height and retained one 442 px empty-state region.
   Post-fix evidence: the final capture aligns the plan and calendar panels and keeps secondary distribution panels immediately below.

## Interaction and runtime checks

- Publication lifecycle tabs switch and expose the active state.
- Calendar-only view hides the plan list and can return to the combined layout.
- Previous/next month and Today controls update the real calendar.
- Filters and search are wired to real candidate/request rows.
- With no WordPress connection, bulk actions are disabled and the primary action routes to integration setup.
- Four focused Publish Management contract tests passed.
- ESLint completed with no new errors; one pre-existing unrelated image optimization warning remains.
- Production build completed successfully.

## Findings

No actionable P0, P1 or P2 issues remain for the verified unconnected-project state.

## Follow-up polish

- P3: repeat the populated-state comparison after the first verified WordPress publication and GSC/GA4 connection so row density and real performance cards can be tuned.

final result: passed

---

# Content Plan Commercial Redesign QA

- Source visual truth: `.artifacts/content-plan-audit/00-reference.png`
- Current-state audit evidence: `.artifacts/content-plan-audit/01-current.png`
- Implementation screenshot: `.artifacts/content-plan-audit/03-redesign-desktop.png`
- Combined comparison: `.artifacts/content-plan-audit/04-comparison.png`
- Viewport: 1536 × 1024 CSS px, desktop, device scale factor 1
- Source pixels: 1536 × 1024
- Implementation pixels: 1536 × 1024
- Density normalization: none required; both artifacts use the same pixel dimensions
- State: Content Plan default tab, authenticated workspace shell, zero research opportunities, one verified content task

## Full-view comparison evidence

The combined comparison confirms that the new screen keeps the reference's commercial density, tab hierarchy, outcome cards, opportunity planning area, and sidebar proportions while replacing demo-heavy charts with decision-oriented verified states. The redesigned first viewport now presents a clear sequence: outcome metrics, recommended next step, production rhythm, priority queue, and data readiness.

## Focused region comparison evidence

Focused inspection was performed on the header/actions, four outcome cards, the recommended-next-step card, the production pipeline, the opportunity table header and empty state, and the data-readiness panel. These regions contain the primary typography, controls, table density, semantic colors, and core conversion path. No raster imagery is required by this product screen; the OneShowSEO logo and the existing Phosphor icon system are retained.

## Required fidelity surfaces

- Fonts and typography: passed. The page uses the existing product font stack with a 31px decision headline, 16px section headings, 11–13px actionable copy, and readable line height. No core label is rendered at the previous 7–8px dashboard scale.
- Spacing and layout rhythm: passed. The 4-column outcome rail, 1.6fr/0.72fr decision split, 14–16px section gaps, and 14–15px card radii create a consistent commercial hierarchy. Responsive breakpoints collapse the decision and workbench grids without hiding controls.
- Colors and visual tokens: passed. Existing OneShowSEO violet, blue, green, amber, border, and surface tokens are reused with adequate foreground contrast and restrained elevation.
- Image quality and asset fidelity: passed. The supplied OneShowSEO brand image remains unchanged. No custom SVG, CSS illustration, placeholder image, or generated raster asset was introduced.
- Copy and content: passed. Labels describe real workflow outcomes and explicitly identify missing data. The page does not present demo metrics as product facts.

## Comparison history

### Iteration 0 — blocked

- P1: The prior page devoted most of the screen to empty calendar and chart containers, obscuring the next action.
- P1: KPI cards described disconnected dashboard metrics instead of the commercial path from opportunity to publishing.
- P2: Important labels and controls were too small at the target desktop viewport.
- P2: The core conversion action, creating a Brief from a verified opportunity, was visually weak and disconnected from data readiness.

Fixes applied:

- Replaced the empty dashboard composition with a decision workspace.
- Added an AI-recommended next-step panel and a visible opportunity-to-publishing pipeline.
- Reduced the KPI set to four outcome metrics backed by real records.
- Rebuilt the opportunity queue with evidence, metrics, priority, and one primary Brief action.
- Replaced empty charts with a compact data-readiness panel and actionable honest states.
- Raised core typography and control sizes and added responsive commercial breakpoints.

### Iteration 1 — passed

- Post-fix evidence: `.artifacts/content-plan-audit/03-redesign-desktop.png`
- Combined comparison: `.artifacts/content-plan-audit/04-comparison.png`
- No actionable P0, P1, or P2 findings remain.
- Intentional deviation: the implementation does not reproduce the reference's populated demo metrics or calendar items because the product must only display verified project data.

## Primary interactions tested

- Switch from Content Opportunities to Content Tasks and back.
- Open and close Create Content Brief.
- Enter and clear the opportunity search field.
- Confirm the selected tab's ARIA state.

## Console check

No error was produced by the redesigned Content Plan route during the verified 4174 preview. One previously retained browser-log entry referenced an unrelated older 4173 Publish Agent hot-reload attempt and was not emitted by this page or this build.

## Follow-up polish

- P3: Once real scheduled publishing records exist, the calendar tab can add channel chips without changing the default decision-workspace hierarchy.

final result: passed
