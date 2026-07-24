# WEB00 Matryoshka Asset Reconciliation Report

## 1. Executive summary

- Current asset: `assets/img/matryoshka.png`
- Current role: owner-provided candidate/final visual asset, currently untracked.
- Previous local variants `assets/img/матрешка_0.png` and `assets/img/matreshka-web00-showcase.png` are not present in the current working folder.
- Production code does not currently reference `matryoshka.png`.
- Recommended verdict: `ASSET_LANGUAGE_BLOCKED`

The asset is visually closer to the desired premium device showcase, but it contains visible forbidden/public-copy terms inside the embedded screens. It should not be connected to the hero until the screens are regenerated with current WEB00 language.

## 2. Git/file state

| File | Status | Notes |
|---|---|---|
| `assets/img/matryoshka.png` | Untracked | Exists; owner-provided current candidate asset |
| `assets/img/матрешка_0.png` | Missing | Old/source variant is not present in current workspace |
| `assets/img/matreshka-web00-showcase.png` | Missing | Previous derived variant is not present in current workspace |
| `docs/WEB00_MATRYOSHKA_ASSET_RECONCILIATION_REPORT.md` | New in this task | Audit report only |

Current branch state at audit start:

```text
## main...origin/main
?? WEB00_VISUAL_ACCEPTANCE_PROMPT_PACK/
?? assets/img/matryoshka.png
?? docs/WEB00_FRONTEND_PUBLIC_RC1_CERTIFICATE.md
?? docs/WEB00_LIVE_RC1_CLOSEOUT_REPORT.md
?? docs/WEB00_MATRESHKA_IMPLEMENTATION_PROMPT_DRAFT.md
?? docs/WEB00_MATRESHKA_IMPLEMENTATION_V1_REPORT.md
?? docs/WEB00_MATRESHKA_MOCKUP_AUDIT.md
?? docs/WEB00_NEXT_PHASE_BACKEND_ADMIN_ROADMAP.md
?? docs/WEB00_OWNER_ACCEPTANCE_PACK.md
?? docs/WEB00_RC1_RELEASE_NOTES.md
```

Last five commits:

```text
3c50c8c fix: close Wave 10.1 mobile responsive guards
840adbf fix: clean WEB00 public language gate
126932f chore: establish WEB00 Pro 2.0 frontend RC1
57808ab fix: polish WEB00 mobile frontend
5d2c085 chore: finalize WEB00 frontend product polish
```

## 3. Image inspection

| File | Exists | Dimensions | Size | Alpha | Role |
|---|---|---:|---:|---|---|
| `assets/img/matryoshka.png` | YES | 1448x1086 | 1,666,261 bytes | NO | Current owner-provided candidate/final asset |
| `assets/img/матрешка_0.png` | NO | n/a | n/a | n/a | Missing old/source asset |
| `assets/img/matreshka-web00-showcase.png` | NO | n/a | n/a | n/a | Missing previous derived asset |

Format details for `matryoshka.png`:

- format: PNG
- mode: RGB
- alpha channel: NO
- background/checker pattern appears baked into the image, not transparency.

## 4. Current references

| File | Reference | Notes |
|---|---|---|
| `index.html:59` | `.mock-device` | Current hero uses DOM/CSS device wrapper, not `matryoshka.png` |
| `index.html:60` | `.mock-laptop` | Current laptop frame is still CSS/DOM |
| `index.html:73` | `.mock-phone` | Current phone frame is still CSS/DOM |
| `assets/css/home.css:218` | `.mock-device` | Base hero device wrapper |
| `assets/css/home.css:224` | `.mock-laptop` | CSS laptop frame |
| `assets/css/home.css:333` | `.mock-phone` | CSS phone frame |
| `assets/css/home.css:2212` | `../img/previews/web00-home-desktop-device.png` | Existing desktop preview image layer |
| `assets/css/home.css:2222` | `../img/previews/web00-home-mobile-device.png` | Existing mobile preview image layer |
| `assets/css/home.css:2402` | `../img/previews/web00-home-desktop-clean.svg` | Current clean desktop screen image layer |
| `assets/css/home.css:2439` | `../img/previews/web00-home-mobile-clean.svg` | Current clean mobile screen image layer |
| `docs/WEB00_MATRESHKA_IMPLEMENTATION_PROMPT_DRAFT.md` | `матрешка_0.png`, `matreshka-web00-showcase.png` | Historical planning references only |
| `docs/WEB00_MATRESHKA_IMPLEMENTATION_V1_REPORT.md` | `матрешка_0.png`, `matreshka-web00-showcase.png` | Historical implementation report only |
| `docs/WEB00_MATRESHKA_MOCKUP_AUDIT.md` | `матрешка_0.png`, `matreshka-web00-showcase.png` | Historical audit/planning references only |

No production HTML/CSS/JS reference to `assets/img/matryoshka.png` was found.

## 5. Visual language gate

Manual visual inspection of `assets/img/matryoshka.png` found forbidden terms inside the embedded site screens.

| Term | Found | Where | Severity |
|---|---|---|---|
| `шаблон` / `Шаблон` | YES | Visible CTA text such as `Выбрать шаблон` inside laptop and phone screens | BLOCKER |
| `шаблоны` / `Шаблоны` | NOT CONFIRMED | Not clearly readable in the inspected preview | n/a |
| `Бриф` / `бриф` | NO | Not visible in inspected preview | n/a |
| `API` as UI text | NO | Not visible in inspected preview | n/a |
| `Performance` | NO | Asset uses Russian replacement `Скорость 90+` | n/a |
| `SEO-ready` | NO | Exact English term not visible | n/a |
| `SEO` | YES | Visible as `Готов к SEO` | BLOCKER |
| `Accessibility` | NO | Not visible in inspected preview | n/a |
| `Bug report` | NO | Not visible in inspected preview | n/a |

Language gate verdict: `ASSET_LANGUAGE_BLOCKED`.

## 6. Performance/readiness

Current asset:

- file: `assets/img/matryoshka.png`
- dimensions: 1448x1086
- size: 1,666,261 bytes
- format: PNG
- alpha: no

Performance risk: YES.

The image is likely too heavy as a single PNG hero asset for mobile. Before production integration, create optimized responsive derivatives:

- `assets/img/matryoshka-hero-720.webp`
- `assets/img/matryoshka-hero-1200.webp`
- `assets/img/matryoshka-hero-1600.webp`

Recommended format:

- WebP for production hero responsive sources.
- Keep PNG as source/master if owner accepts the visual.

Hero suitability:

- Visual composition: promising.
- Product language: blocked.
- Performance readiness: needs responsive derivatives.
- Integration readiness: not ready.

## 7. Verdict

`ASSET_LANGUAGE_BLOCKED`

## 8. Recommended next step

`MATRYOSHKA REGEN V2`

Regenerate or revise the embedded laptop/phone screens using current WEB00 public language:

- replace `Выбрать шаблон` with `Подобрать сайт` or `Выбрать готовый сайт`;
- replace `Готов к SEO` with `Готов к продвижению`;
- avoid `шаблон`, `SEO`, `API`, `Бриф/бриф`, `Performance`, `SEO-ready`, `Accessibility`, `Bug report`;
- then create responsive WebP derivatives before hero integration.
