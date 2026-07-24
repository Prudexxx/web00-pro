# WEB00 Wave 1.1 Integrity Report

Дата: 2026-07-03  
Рабочая папка: `D:\Backend\Сайт`  
Режим: Tokens/Shell Integrity Gate, без commit/push/deploy/reset/clean/QAMax.

## 1. Executive summary

- Все основные страницы подключают `assets/css/tokens.css`.
- На всех основных страницах `tokens.css` подключён первым stylesheet.
- `index.html` использует production home layer `assets/css/home.css`.
- Production HTML больше не подключает `assets/css/home-1to1-test.css`.
- `assets/css/home-1to1-test.css` физически существует и не удалялся.
- JS syntax checks прошли.

Готовность к Wave 2: YES.

## 2. Tokens connection matrix

| Page | tokens.css connected first? | Action |
|---|---|---|
| `index.html` | YES | none |
| `services.html` | YES | none |
| `solutions.html` | YES | none |
| `how-it-works.html` | YES | added `tokens.css` as first stylesheet |
| `pricing.html` | YES | none |
| `faq.html` | YES | none |
| `contacts.html` | YES | none |
| `brief.html` | YES | none |
| `status.html` | YES | none |
| `cases.html` | YES | none |
| `privacy-policy.html` | YES | none |
| `consent-personal-data.html` | YES | none |

Verification command used:

```text
rg -n "assets/css/tokens\.css" -g "*.html" .
```

Result:

```text
.\contacts.html:11:    <link rel="stylesheet" href="assets/css/tokens.css">
.\consent-personal-data.html:10:    <link rel="stylesheet" href="assets/css/tokens.css">
.\index.html:17:    <link rel="stylesheet" href="assets/css/tokens.css">
.\cases.html:11:    <link rel="stylesheet" href="assets/css/tokens.css">
.\brief.html:13:    <link rel="stylesheet" href="assets/css/tokens.css">
.\how-it-works.html:11:    <link rel="stylesheet" href="assets/css/tokens.css">
.\faq.html:11:    <link rel="stylesheet" href="assets/css/tokens.css">
.\status.html:11:    <link rel="stylesheet" href="assets/css/tokens.css">
.\solutions.html:11:    <link rel="stylesheet" href="assets/css/tokens.css">
.\services.html:11:    <link rel="stylesheet" href="assets/css/tokens.css">
.\privacy-policy.html:10:    <link rel="stylesheet" href="assets/css/tokens.css">
.\pricing.html:11:    <link rel="stylesheet" href="assets/css/tokens.css">
```

## 3. Home layer check

| Check | Result |
|---|---|
| `index.html` uses `home.css` | PASS |
| production HTML uses `home-1to1-test.css` | PASS - no production HTML references |
| `home-1to1-test.css` exists but not production-linked | PASS |

Verification commands:

```text
rg -n "home-1to1-test\.css" -g "*.html" .
rg -n "assets/css/home\.css" .
```

`home-1to1-test.css` HTML result:

```text
no matches
```

`home.css` result:

```text
.\index.html:20:    <link rel="stylesheet" href="assets/css/home.css?v=light-shell-1">
.\docs\WEB00_SHELL_CONTRACT.md:37:4. assets/css/home.css
.\docs\WEB00_SHELL_CONTRACT.md:40:Примечание: `home-premium.css` остаётся временным legacy/shell fallback-слоем. Текущий renderer главной после Wave 1: `assets/css/home.css`.
```

## 4. JS check

| File | Result |
|---|---|
| `assets/js/main.js` | PASS |
| `assets/js/data.js` | PASS |

Commands:

```text
node --check assets/js/main.js
node --check assets/js/data.js
```

## 5. Git state

### `git status --short`

```text
 M .gitignore
 M assets/css/home-1to1-test.css
 M assets/js/main.js
 M brief.html
 M cases.html
 M consent-personal-data.html
 M contacts.html
 M faq.html
 M how-it-works.html
 M index.html
 M pricing.html
 M privacy-policy.html
 M services.html
 M solutions.html
 M status.html
?? "WEB00 PRO 2.0 \342\200\224 STRATEGIC ROADMAP (MASTER FILE).md"
?? assets/css/home.css
?? assets/css/tokens.css
?? assets/img/previews/web00-home-desktop-clean.svg
?? assets/img/previews/web00-home-desktop-device.png
?? assets/img/previews/web00-home-mobile-clean.svg
?? assets/img/previews/web00-home-mobile-device.png
?? docs/
```

### `git diff --stat`

```text
 .gitignore                    |   6 +
 assets/css/home-1to1-test.css | 380 +++++++++++++++++++++++++++++++++++++++++-
 assets/js/main.js             | 126 +++++++-------
 brief.html                    |   1 +
 cases.html                    |   1 +
 consent-personal-data.html    |   1 +
 contacts.html                 |   1 +
 faq.html                      |   1 +
 how-it-works.html             |   1 +
 index.html                    |  17 +-
 pricing.html                  |   1 +
 privacy-policy.html           |   1 +
 services.html                 |   1 +
 solutions.html                |   1 +
 status.html                   |   1 +
 15 files changed, 467 insertions(+), 73 deletions(-)
```

Note: `git diff --stat` does not include untracked files such as `assets/css/home.css`, `assets/css/tokens.css`, preview assets, or docs.

## 6. Remaining risks

- `assets/css/home-1to1-test.css` still exists and remains modified in the working tree, but it is no longer linked from production HTML.
- `assets/css/styles.css` still contains legacy dark/neon variables and rules.
- `assets/css/home-premium.css` remains a mixed/dead/fallback layer for homepage shell bits.
- Header/footer markup is still duplicated across HTML files.
- `assets/css/web00-tabs-standard.css` remains a shared patch layer with a misleading name.
- No visual/browser QA was run in this gate by design.

## 7. Verdict

Ready for Wave 2: YES.

Wave 2 can start as CSS Legacy Quarantine / Shell Unification. Recommended first targets:

1. classify `styles.css` dark/neon legacy;
2. decide what still needs to be kept from `home-premium.css`;
3. plan shell extraction without changing page content;
4. keep `home-1to1-test.css` untouched until a staging/cleanup decision is made.

