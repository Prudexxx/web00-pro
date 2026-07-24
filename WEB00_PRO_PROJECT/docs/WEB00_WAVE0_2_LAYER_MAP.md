# WEB00 CSS Layer Map

Дата: 2026-07-03  
Назначение: карта текущих CSS-слоёв и целевой порядок Wave 1.

## Current Layers

| CSS file | Current role | Problem | Future role |
|---|---|---|---|
| `assets/css/styles.css` | global base + legacy shell + old dark styles | содержит dark/neon tokens, подключён почти везде | split into `base.css`, `shell.css`, `legacy-dark.css` quarantine |
| `assets/css/home-premium.css` | old premium home layer, partially live | не рисует текущие `mock-*`, но может влиять на shared hooks | merge useful shell/footer parts or remove after verification |
| `assets/css/home-1to1-test.css` | фактический renderer текущей главной | production-linked файл с test-названием, большой накопленный слой | migrate to `pages/home.css` or `home.css` |
| `assets/css/catalog-premium.css` | catalog page layer | page-specific, зависит от old base | migrate to `pages/catalog.css` using tokens |
| `assets/css/pricing-premium.css` | pricing page layer | page-specific + patch history | migrate to `pages/pricing.css` using tokens |
| `assets/css/brief-premium.css` | questionnaire page layer | different font contract, page-specific | migrate to `pages/brief.css` using tokens |
| `assets/css/status-premium.css` | status/cabinet page layer | page-specific, future cabinet pressure | migrate to `pages/status.css` using tokens/components |
| `assets/css/public-premium.css` | services/how-it-works/cases/faq/contacts/legal | large shared public page layer | migrate to `pages/public.css` or split public/legal |
| `assets/css/web00-tabs-standard.css` | shared responsive/table/button patch | name does not match responsibility | split into `components/responsive.css` or `shell/mobile.css` |
| `assets/css/tokens.css` | new light premium shared tokens | currently not connected | first layer in Wave 1 |

## Target Layers For Wave 1

Целевой порядок:

```text
1. assets/css/tokens.css
2. assets/css/base.css
3. assets/css/shell.css
4. assets/css/components.css
5. assets/css/pages/home.css
6. assets/css/pages/catalog.css
7. assets/css/pages/pricing.css
8. assets/css/pages/brief.css
9. assets/css/pages/status.css
10. assets/css/pages/public.css
```

## Target Responsibility

### `tokens.css`

Only variables:

- colors;
- typography;
- spacing;
- radii;
- shadows;
- z-index;
- button constants;
- breakpoint comments.

No page layout.

### `base.css`

Base browser reset:

- box sizing;
- body baseline;
- links;
- images;
- forms;
- utility accessibility helpers.

No dark theme.

### `shell.css`

Shared layout shell:

- header;
- nav;
- mobile menu;
- footer;
- language trigger;
- containers.

### `components.css`

Shared components:

- buttons;
- cards;
- badges;
- modals;
- forms;
- tables;
- quality passport;
- status badges.

### Page CSS

Only page-specific layout:

- home;
- catalog;
- pricing;
- brief;
- status;
- public/legal.

## Rename / Migrate Plan

### `home-1to1-test.css`

Current:

```text
assets/css/home-1to1-test.css
```

Future:

```text
assets/css/pages/home.css
```

Plan:

1. First verify current home visual is accepted.
2. Move/rename in one controlled Wave.
3. Update `index.html` once.
4. Remove `test` naming from production.
5. Keep `mock-*` only if accepted as final naming or migrate to `home-*`.

### `web00-tabs-standard.css`

Current:

```text
assets/css/web00-tabs-standard.css
```

Future options:

```text
assets/css/components/responsive.css
assets/css/shell-mobile.css
assets/css/components/tables.css
```

Plan:

1. Inventory actual rules.
2. Move pricing table rules into pricing/components.
3. Move mobile shell rules into shell.
4. Remove misleading tabs name.

### `styles.css`

Current:

```text
assets/css/styles.css
```

Future:

```text
assets/css/base.css
assets/css/shell.css
assets/css/legacy-dark.css
```

Plan:

1. Extract neutral reset/base.
2. Extract shared shell.
3. Quarantine dark/neon into legacy file.
4. Stop loading dark legacy on premium pages.

### `home-premium.css`

Current:

```text
assets/css/home-premium.css
```

Future:

```text
remove or merge verified useful rules
```

Plan:

1. Compare selectors against current `index.html`.
2. Move shared footer/menu rules into shell.
3. Move useful page rules into `pages/home.css`.
4. Remove old disconnected layer.

## Wave 1 Migration Order

Recommended:

1. Create `base.css`, `shell.css`, `components.css` skeletons.
2. Connect `tokens.css` to one low-risk public page first.
3. Verify no dark fallback leaks.
4. Move footer/header constants into shell.
5. Migrate pricing or public pages before home.
6. Migrate home last because it is the most visually sensitive.

## Guardrails

- Do not change visual language during layer migration.
- Do not touch backend.
- Do not rename routes during CSS cleanup.
- Do not delete `styles.css` until all imports are migrated.
- Do not remove `home-premium.css` until direct selector overlap is verified.
- Do not stage unused preview assets.

