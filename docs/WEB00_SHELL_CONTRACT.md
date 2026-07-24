# WEB00 Shell / Header / Footer Contract

Дата: 2026-07-03  
Статус: Wave 1 foundation contract.  
Назначение: зафиксировать общий договор shell-слоя перед чисткой страниц.

## 1. Цель shell

Shell WEB00 отвечает за:

- глобальную навигацию;
- mobile menu;
- primary CTA `Выбрать сайт`;
- footer legal/meta;
- language trigger;
- общие accessibility hooks.

Shell не отвечает за page-specific layout, карточки каталога, тарифы, анкету, статус или demo viewer.

## 2. CSS layer order

Целевой порядок для premium public/core страниц:

```text
1. assets/css/tokens.css
2. assets/css/styles.css
3. page/shared premium layer
4. assets/css/web00-tabs-standard.css, пока он не разобран
```

Для главной:

```text
1. assets/css/tokens.css
2. assets/css/styles.css
3. assets/css/home-premium.css
4. assets/css/home.css
```

Примечание: `home-premium.css` остаётся временным legacy/shell fallback-слоем. Текущий renderer главной после Wave 1: `assets/css/home.css`.

## 3. Header contract

### Standard public pages

Разметка:

```html
<header class="site-header">
  <a class="logo" href="index.html"><span>WEB</span><b>00</b></a>
  <button class="menu-toggle" data-menu-toggle aria-expanded="false" aria-controls="site-nav">...</button>
  <nav class="nav" id="site-nav" data-nav>...</nav>
  <a class="btn btn--primary" href="brief.html">Выбрать сайт</a>
</header>
```

Обязательные hooks:

- `data-menu-toggle`
- `data-nav`
- `aria-expanded`
- `aria-controls="site-nav"`

JS-owner: `assets/js/main.js`, function `initShell()`.

### Homepage mock shell

Главная использует отдельную визуальную разметку:

```html
<header class="mock-header" data-header>
  <a class="mock-logo" href="index.html">WEB<span>00</span></a>
  <button class="mock-menu-toggle menu-toggle" data-menu-toggle ...>...</button>
  <nav class="mock-nav" id="site-nav" data-nav>...</nav>
  <a class="mock-header-cta" href="brief.html">Выбрать сайт</a>
</header>
```

Правило: `mock-*` допустимы только на `body[data-page="home"]` до отдельной homepage cleanup wave.

## 4. Navigation contract

Единый публичный набор nav:

```text
Каталог -> solutions.html
Тарифы -> pricing.html
Как это работает -> how-it-works.html
Кейсы -> cases.html
FAQ -> faq.html
CTA -> brief.html
```

Поведение:

- active state назначается JS по href/current page;
- mobile menu открывается классом `.is-open` на `[data-nav]`;
- body получает `.is-menu-open`;
- клик по nav link закрывает mobile menu.

Запрещено:

- возвращать `Примеры` как nav label;
- вести `Кейсы` на `index.html#popular-templates`;
- показывать public `Сообщить об ошибке` в footer.

## 5. Footer contract

Обязательные элементы:

- WEB00 logo;
- language trigger;
- legal links:
  - `privacy-policy.html`
  - `consent-personal-data.html`
  - `contacts.html`
- footer credit:

```text
WEB00 Pro — premium website platform · Designed & Engineered by Vitaliy Glebov · © 2026
```

Standard footer classes:

```html
<footer class="footer">
  <div class="container footer__inner">
    <a class="logo logo--footer" href="index.html">...</a>
    <button class="mock-language-trigger" data-language-trigger>...</button>
    <div class="footer__links">...</div>
    <div class="footer-credit">...</div>
  </div>
</footer>
```

Homepage footer classes:

```html
<footer class="mock-footer">
  <div class="mock-wrap mock-footer__inner">...</div>
</footer>
```

Rule: footer credit is secondary metadata, not CTA, card, badge, plaque or banner.

## 6. Language trigger contract

Current production trigger:

```html
<button class="mock-language-trigger" type="button" data-language-trigger aria-haspopup="dialog" aria-expanded="false">
  <span data-language-flag>🇷🇺</span>
  <span data-language-label>Русский</span>
</button>
```

JS-owner: `assets/js/main.js`, homepage language helpers.

Do not duplicate separate language widgets until shared shell is extracted.

## 7. Legacy / quarantine notes

`assets/css/styles.css` still contains dark/neon legacy variables and rules. It remains loaded for compatibility in Wave 1.

Wave 1 decision:

- light premium tokens are now first stylesheet layer;
- dark/neon is not the target system;
- dark legacy must be split/quarantined later, not patched ad hoc in this wave.

## 8. Next cleanup target

Recommended next shell work:

1. Extract neutral reset/base from `styles.css`.
2. Extract standard header/footer into a dedicated `shell.css`.
3. Move shared buttons/forms/cards into `components.css`.
4. Retire `home-premium.css` after moving any still-useful shell/fallback rules.
5. Decide whether `mock-*` homepage classes are final or should be renamed in a dedicated homepage wave.

