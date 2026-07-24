# WEB00 Shared Shell Plan

Дата: 2026-07-03  
Цель: снизить риск ручных расхождений в header/footer/nav.

## 1. Текущее состояние

Header/footer сейчас дублируются вручную в root HTML:

- `index.html`
- `solutions.html`
- `pricing.html`
- `brief.html`
- `status.html`
- `services.html`
- `how-it-works.html`
- `cases.html`
- `faq.html`
- `contacts.html`
- `privacy-policy.html`
- `consent-personal-data.html`

Также есть отдельные shell-варианты в `landings/*`.

## 2. Единый header contract

Обязательные nav items:

1. `Каталог` -> `solutions.html`
2. `Тарифы` -> `pricing.html`
3. `Как это работает` -> `how-it-works.html`
4. `Кейсы` -> `cases.html`
5. `FAQ` -> `faq.html`

CTA:

- `Выбрать сайт` -> `brief.html`

Технические хуки:

- `data-menu-toggle`
- `data-nav`
- `aria-expanded`
- `aria-controls="site-nav"`
- active/current state per page

## 3. Единый footer contract

Footer должен содержать:

- logo WEB00;
- language trigger;
- links:
  - `privacy-policy.html`
  - `consent-personal-data.html`
  - `contacts.html`
- divider;
- footer credit:

```text
WEB00 Pro — premium website platform · Designed & Engineered by Vitaliy Glebov · © 2026
```

Не должен содержать публичный агрессивный `Сообщить об ошибке`.

## 4. Почему ручное дублирование рискованно

Риски:

- один пункт nav меняется не на всех страницах;
- active state отличается;
- CTA ведёт в разные места;
- footer layout расходится;
- language trigger появляется не везде;
- правка мобильной шапки ломает только часть страниц;
- legal/public/core страницы начинают выглядеть по-разному.

## 5. Вариант A: HTML partial strategy

Подход:

- создать исходные partial-файлы:
  - `partials/header.html`
  - `partials/footer.html`
- использовать простой build/copy script перед deploy.

Плюсы:

- HTML остаётся статическим;
- GitHub Pages остаётся простым;
- меньше runtime JS.

Минусы:

- появляется build step;
- нужно дисциплинировать deploy.

## 6. Вариант B: JS-rendered shell

Подход:

- в HTML оставить `<div data-shell-header></div>`;
- `main.js` рендерит header/footer по конфигу.

Плюсы:

- один источник nav/footer;
- быстро менять.

Минусы:

- shell зависит от JS;
- возможен layout shift;
- SEO/доступность хуже, если JS не загрузился.

## 7. Вариант C: оставить ручное, но ввести чек

Подход:

- пока оставить ручное дублирование;
- добавить script/checklist, который сравнивает nav/footer fragments.

Плюсы:

- минимальный риск сейчас;
- без build step.

Минусы:

- ручная работа остаётся.

## 8. Рекомендуемый путь

На ближайшую волну:

1. Не внедрять шаблонизатор.
2. Зафиксировать canonical header/footer markup.
3. Добавить lightweight audit script позже.
4. После backend/build решения перейти к partial strategy.

## 9. Минимальный shell audit checklist

Перед commit:

- все root pages имеют один nav label set;
- `Кейсы` ведёт на `cases.html`;
- CTA ведёт на `brief.html`;
- mobile menu работает;
- footer credit одинаковый;
- public bug link не виден;
- legal links есть;
- language trigger не ломает layout.

