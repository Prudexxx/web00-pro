# WEB00 QAMax Future Plan

Дата: 2026-07-03  
Статус: план будущего QAMax, не запускался в рамках этого аудита.

## 1. Когда запускать QAMax

QAMax не нужно запускать сейчас, пока есть P0/P1 по структуре, git-state, CSS architecture и backend readiness.

Запускать после:

1. clean git state
2. CSS layer cleanup
3. pricing/data model alignment
4. backend adapter contract
5. responsive baseline freeze
6. no untracked production assets

## 2. Обязательные страницы

Root pages:

- `/`
- `/solutions.html`
- `/pricing.html`
- `/brief.html`
- `/status.html`
- `/services.html`
- `/how-it-works.html`
- `/cases.html`
- `/faq.html`
- `/contacts.html`
- `/privacy-policy.html`
- `/consent-personal-data.html`

Если остаются публичными:

- `/landings/*.html`
- `/demos/*/index.html`

## 3. Core scenarios

| Scenario | Expected |
|---|---|
| Home -> Catalog -> Brief -> Success -> Status | Lead created, status found |
| Catalog card -> detail modal -> demo modal | Modal and iframe work |
| Catalog card -> launch | Opens `brief.html?solution=...` |
| Pricing tariff -> brief | Opens `brief.html?tariff=...` |
| Empty brief submit | Validation blocks submit |
| No consent | Submit blocked |
| Status missing id | Lookup state |
| Status unknown id | Not-found state |
| FAQ filter/accordion | Works |
| Contacts status lookup | Works |
| Mobile menu | Opens/closes on all pages |
| Language switcher | Does not break layout |

## 4. Viewports

Required:

- `360x800`
- `390x844`
- `412x915`
- `768x1024`
- `1024x768`
- `1160x871`
- `1440x900`
- `1920x1080`

Additional:

- mobile landscape
- browser desktop mode on Android
- high zoom 125/150%

## 5. Browsers

Automated if available:

- Chromium
- Edge
- Firefox
- WebKit

Real devices:

- iOS Safari real device: NOT TESTED unless device exists
- macOS Safari hardware: NOT TESTED unless device exists
- Android Chrome real device: TEST if owner provides phone check
- Windows touch: TEST if available

## 6. Visual checks

Compare against:

- Home: `Макеты/Screenshot_1.png`
- Catalog: `Макеты/Screenshot_31.png`
- Pricing: `Макеты/Screenshot_2.png`
- Brief: `Макеты/Screenshot_4.png`
- Status: `Макеты/Screenshot_3.png`

Criteria:

- no dark-tech drift
- no neon/violet/blue glow
- no Galaxy-like over-rounded buttons
- footer signature exact and secondary
- nav labels consistent
- no public legacy bug links
- no old copyright
- no horizontal scroll
- no overlapped text/cards/buttons

## 7. Technical checks

Commands:

```powershell
node --check assets/js/main.js
node --check assets/js/data.js
git diff --check
```

Static searches:

```powershell
rg "Сообщить об ошибке|© 2024 WEB00|Примеры|Бриф|бриф" .
rg "href=\"#|scrollIntoView" .
rg "#050812|--violet|--blue|--glow|Manrope" assets/css
```

Network/browser:

- no console errors
- no failed 404 resources
- favicon OK
- sitemap/robots OK
- no mixed content

## 8. Performance

Run Lighthouse/equivalent for:

- `/`
- `/solutions.html`
- `/pricing.html`
- `/brief.html`
- `/status.html`

Report:

- Performance score
- FCP
- LCP
- CLS
- TBT
- failed audits

Targets:

- CLS close to `<= 0.1`
- no obvious layout shift on hero/cards/footer
- images have dimensions/aspect-ratio
- CSS weight reduced after cleanup

## 9. Accessibility

Check:

- keyboard navigation
- visible focus
- modal focus trap
- Escape close
- aria-expanded accordion/menu
- form labels
- tap targets
- contrast in dark/light browser mode

## 10. Evidence Output

Future QAMax should write:

- `CHECKLIST_INDEX.md`
- `FINAL_QA_SUMMARY.md`
- `EXPECTED_ACTUAL_RESULTS.md`
- `CROSS_BROWSER_PLATFORM_MATRIX.md`
- `KNOWN_LIMITATIONS_FINAL.md`
- `reports/final-qa-max-results.json`
- `reports/expected-actual-table.csv`
- screenshots only if needed
- traces only if needed

## 11. Stop Conditions

Stop QAMax and report FAIL if:

- git tree unexpectedly changes during QA
- JS syntax fails
- product page does not load
- core flow broken
- console errors on core pages
- horizontal scroll on main mobile viewports
- status flow cannot find created lead
- pricing/brief CTAs broken

