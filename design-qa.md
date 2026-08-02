# OneShowSEO prototype design QA

## Source targets

- Marketing page reference: 1536 × 1024 supplied screenshot.
- Workspace reference: 1536 × 1024 supplied screenshot.
- Admin console: derived from the same OneShowSEO visual system.

## Comparison pass 1

1. **Brand asset / high** — The framework image optimizer did not render the supplied OneShowSEO crop in local preview. Switched the exact cropped source asset to unoptimized static delivery and verified it in the navigation, product preview, workspace, and admin console.
2. **Data visualization / medium** — Recharts animates from an empty state, so immediate screenshots showed blank chart panels. Verified eight chart surfaces and captured the settled UI after the transition; the live page renders the mini trends, health chart, traffic chart, ranking trend, and admin usage chart.
3. **Desktop fidelity / low** — The first workspace pass had more open space in the chart panels than the reference. The settled data visualizations restore the intended information density and visual balance.

## Comparison pass 2

- Typography: Chinese display and body hierarchy match the supplied references; no clipped labels or cramped controls.
- Layout: marketing hero, dashboard preview, 210 px workspace rail, six-card KPI row, three-column content grid, and admin hierarchy remain stable at 1536 × 1024.
- Color and surfaces: white cards, pale blue app canvas, restrained borders, brand blue, green success, amber warning, and red critical states match the target system.
- Assets and icons: exact supplied OneShowSEO logo crop plus one consistent Phosphor icon family; no placeholder icons or handcrafted SVG assets.
- States and interactions: marketing CTA navigation, workspace module selection/toast, admin tenant search, export feedback, and action feedback verified.
- Responsive behavior: homepage and workspace tested at 390 × 844 with `scrollWidth === clientWidth`; no horizontal overflow.
- Accessibility: semantic links/buttons, alt text on brand marks, visible text labels, and practical mobile tap targets are present.
- Runtime: production build completes and browser console contains no errors or warnings.

final result: passed
