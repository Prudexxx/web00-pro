# WEB00 Matryoshka Source Final Apply Report

## 1. Executive summary

- Source accepted: YES
- Source file: `assets/img/matryoshka-source-final.webp`
- Source size: 289114 bytes / 282.3 KB
- Source dimensions: 1448x1086
- Source format: WebP
- Source alpha: NO
- Production filenames preserved: YES
- `index.html` changed: NO
- Commit/push/deploy/backend executed: NO

Note: the source WebP has no alpha channel and contains a checkerboard-like background. Production derivatives were generated with a cleaned alpha background so the hero does not render that checkerboard on the site.

## 2. Generated assets

| Asset | Dimensions | Size | Limit | Result |
|---|---:|---:|---:|---|
| `assets/img/matryoshka-hero-720.webp` | 720x540 | 57354 bytes / 56.0 KB | 160 KB | PASS |
| `assets/img/matryoshka-hero-1200.webp` | 1200x900 | 109678 bytes / 107.1 KB | 280 KB | PASS |
| `assets/img/matryoshka-hero-1600.webp` | 1448x1086 | 122590 bytes / 119.7 KB | 450 KB | PASS |
| `assets/img/matryoshka-clean-final.png` | 1448x1086 | 1058073 bytes / 1033.3 KB | 1.2 MB | PASS |

The 1600 WebP was not upscaled because the source width is 1448px.

## 3. Visual language gate

Manual visual review of the source and rendered hero did not show the forbidden legacy wording.

| Term | Found in visible image | Result |
|---|---|---|
| `шаблон` / `Шаблон` | NO | PASS |
| `бриф` / `Бриф` | NO | PASS |
| `SEO` / `SEO-ready` | NO | PASS |
| `Performance` | NO | PASS |
| `Accessibility` | NO | PASS |
| `Bug report` | NO | PASS |

Visible current copy in the image includes the current H1:

```text
Готовый сайт
для бизнеса
запуск без хаоса
```

## 4. Local smoke

Base URL:

```text
http://127.0.0.1:4173/
```

HTTP:

| URL | Status |
|---|---:|
| `/` | 200 |
| `/index.html` | 200 |

Browser viewports:

| Viewport | Hero image loaded | Horizontal scroll | Console errors | Page errors | Result |
|---|---|---|---:|---:|---|
| 390x844 | YES | NO | 0 | 0 | PASS |
| 1440x900 | YES | NO | 0 | 0 | PASS |

One desktop request for the 720w WebP candidate was aborted by the browser after selecting the 1200w `srcset` candidate. This is normal responsive image behavior and not a broken asset.

## 5. Evidence

Evidence folder:

```text
_qa/WEB00_MATRYOSHKA_SOURCE_FINAL_APPLY/
```

Created evidence:

- `_qa/WEB00_MATRYOSHKA_SOURCE_FINAL_APPLY/source-preview.png`
- `_qa/WEB00_MATRYOSHKA_SOURCE_FINAL_APPLY/source-info.txt`
- `_qa/WEB00_MATRYOSHKA_SOURCE_FINAL_APPLY/generated-sizes.txt`
- `_qa/WEB00_MATRYOSHKA_SOURCE_FINAL_APPLY/home-1440-after.png`
- `_qa/WEB00_MATRYOSHKA_SOURCE_FINAL_APPLY/home-390-after.png`
- `_qa/WEB00_MATRYOSHKA_SOURCE_FINAL_APPLY/hero-element-1440.png`
- `_qa/WEB00_MATRYOSHKA_SOURCE_FINAL_APPLY/browser-results.json`

## 6. Checks

```text
node --check assets/js/main.js
node --check assets/js/data.js
node --check sw.js
```

Result: PASS.

## 7. Verdict

WEB00 Matryoshka Source Final Apply: PASS

Ready for owner visual recheck: YES

Commit/push/deploy/backend executed: NO
