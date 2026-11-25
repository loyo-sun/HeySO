# Phone column filter placement

After horizontally scrolling the backlog table to a filter column on a 390px viewport, the edge-aligned `bottomLeft` popup could flip beyond the left screen boundary. Its checkbox was then outside the viewport and could not receive pointer input.

Use Ant Design's centered `bottom` placement, which supports automatic horizontal shifting as well as vertical flipping. Overlay containers and theme inheritance are unchanged; no DOM patch or generated class selector is involved.

Verified with 315 business tests, production build, `tests/backlog-filter-mobile-browser.mjs` (actual pointer interaction and popup bounds), and `tests/backlog-export-browser.mjs` (desktop/phone real downloads, full filtered results and column order). Contract 1.0.0, no data changes.
