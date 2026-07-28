# GUI Cross-Browser & Accessibility Testing (M7.4.9)

**Status:** Completed on 2026-03-29 by @agent  
**Scope:** Provide an executable QA protocol for browser compatibility, responsiveness, and WCAG 2.1 AA checks.

## Browser matrix

| Platform | Browsers | Minimum version |
|---|---|---|
| Desktop | Chrome, Firefox, Edge, Safari | Latest stable + previous major |
| Mobile | Chrome Android, Safari iOS | Latest stable |

## Core test scenarios
1. Dashboard load and navigation.
2. Node-type skin switch (Founder/Operator/Education/Security).
3. Wallet/achievement UI rendering.
4. QR session bootstrap and completion UX.
5. Error-state rendering (network unavailable, auth invalid).

## Accessibility baseline (WCAG 2.1 AA)
- Color contrast: text ≥ 4.5:1.
- Keyboard navigation for all interactive elements.
- Visible focus indicators.
- Landmark/heading semantics and label associations.
- ARIA for dynamic status notifications.
- Screen-reader pass (NVDA + VoiceOver smoke check).

## Automation guidance

### Playwright cross-browser pass
```bash
npx playwright test --project=chromium
npx playwright test --project=firefox
npx playwright test --project=webkit
```

### Lighthouse CI accessibility + best practices
```bash
npx lhci autorun
```

### Axe-core spot checks
```bash
npx axe http://localhost:8080 --exit
```

## Reporting template
Store each run under:

```
evidence/release/gui-qa/
  chromium/
  firefox/
  webkit/
  mobile/
  accessibility/
  summary.md
```

`summary.md` should include:
- Date/time and commit SHA.
- Browser/device coverage.
- Open defects with severity.
- Go/No-Go recommendation.

## Exit Criteria
M7.4.9 is complete when all supported browsers pass core scenarios, mobile responsive checks pass, and no unresolved WCAG 2.1 AA blockers remain.
