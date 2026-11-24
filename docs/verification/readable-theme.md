# Readable default control theme

The original white-on-#f5642e primary control measured 3.11:1. This change keeps white labels, same-color borders, existing geometry and focus/disabled behavior, while adopting one readable default palette. Shared control code owns the change; hosts consume the exported palette instead of overriding core buttons.

| State | Background | White label contrast |
| --- | --- | --- |
| Normal | #c4471b | 4.92 |
| Hover | #ad3c16 | 6.11 |
| Active | #92320f | 7.82 |

Selection text #b43c15 on #fff0e9 is also checked at >=4.5. Focus boundaries use the primary color and exceed 3:1 against white. Disabled controls retain their disabled presentation and are not claimed to meet enabled-text criteria. Explicit host colors are preserved; their accessibility remains a host responsibility.

Validation on a clean public main base `1e3a65ba625baec381b35266de9f6e98c7598e40`:

- `npm test`: 311 passed.
- `npm run build`: passed (existing bundle-size notice retained).
- Strict TypeScript check of `tests/app-shell-types.fixture.tsx`: passed.
- `tests/app-shell-browser.mjs`: standalone and host examples, explicit host theme, navigation, read-only/mobile/overlay flows passed.
- `tests/theme-browser.mjs`: real default normal/hover/active/focus/disabled button states, selected navigation and the full-screen workflow editor passed.
- `git diff --check`: passed.

Run browser scripts against the built app and an isolated local server (`PORT=4192 HEYSO_DATA_DIR=/tmp/isolated-heyso node server/index.mjs`); supply `HEYSO_PLAYWRIGHT_MODULE`. The scripts mock workspace state using the public seed. No external customer data or private repository content is used.

[Computed styles](./readable-theme/computed-style.json) · [1440×900 control screenshot](./readable-theme/project-primary.png)

The change does not migrate data or permissions, and does not claim a whole-product accessibility audit. App-shell contract stays 1.0.0; palette export and pure-module location are documented in its machine manifest.
