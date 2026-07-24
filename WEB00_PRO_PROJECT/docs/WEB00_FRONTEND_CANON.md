# WEB00 Frontend Canon

Дата: 2026-07-03  
Статус: целевой frontend-канон для следующих волн стабилизации.  
Важно: этот документ фиксирует направление, но сам по себе не меняет визуал сайта.

## 1. Visual Canon

Целевой стиль WEB00 Pro: **light premium WEB00**.

Основные признаки:

- фон: white / paper / cream;
- главный акцент: бордовый `#8E0F13`;
- вторичный акцент: warm beige / light gray;
- логотип: `WEB00`, где `00` бордовые;
- заголовки: serif, Playfair Display-compatible;
- основной текст/UI: Inter/system sans;
- карточки: светлые, тонкие, с аккуратным контуром;
- кнопки: спокойные, прямее, без Galaxy/One UI pill-эффекта;
- hero: крупный, с laptop + phone visual;
- интерфейс: premium product platform, не marketplace и не dark-tech.

Что не является целевым стилем:

- dark-tech как основа;
- neon/violet/blue glow как основа;
- кислотные акценты;
- публичная агрессивная кнопка `Ошибка`;
- public bug report как заметный продающий CTA.

Тёмная ветка считается **legacy**. Она может временно существовать в коде, но не должна определять production-стиль WEB00 Pro.

## 2. Navigation Canon

Header navigation:

1. `Каталог` -> `solutions.html`
2. `Тарифы` -> `pricing.html`
3. `Как это работает` -> `how-it-works.html`
4. `Кейсы` -> `cases.html`
5. `FAQ` -> `faq.html`

Header CTA:

- `Выбрать сайт` -> `brief.html`

Важно:

- `Кейсы` должны быть нормальной страницей, не anchor-scroll на главную.
- `Примеры` не использовать как основной nav label.
- Header rhythm должен быть одинаковым на public/core страницах.

## 3. Core Pages Canon

| Page | Canon role |
|---|---|
| `index.html` | Главная |
| `solutions.html` | Каталог готовых сайтов |
| `pricing.html` | Тарифы |
| `how-it-works.html` | Как это работает |
| `cases.html` | Кейсы |
| `faq.html` | FAQ |
| `contacts.html` | Контакты |
| `brief.html` | Анкета проекта / запуск сайта |
| `status.html` | Кабинет проекта / статус заявки |
| `privacy-policy.html` | Политика конфиденциальности |
| `consent-personal-data.html` | Согласие на обработку данных |

`landings/*` и `demos/*` пока считаются отдельным контуром. Их нельзя автоматически принимать как часть финального premium shell без отдельной проверки.

## 4. Pricing Canon

Главные premium-тарифы WEB00 Pro:

| Tariff | Price |
|---|---:|
| Start | от 39 000 ₽ |
| Business | от 69 000 ₽ |
| Pro | от 99 000 ₽ |

Эти тарифы сейчас считаются основным premium canon.

Старые low-tier цены:

- `от 7 000 ₽`
- `от 12 000 ₽`
- `от 15 000 ₽`
- `от 3 000 ₽`
- `от 500/мес`

не использовать как главную тарифную сетку WEB00 Pro. Если они остаются, их нужно позже развести как:

1. минимальные услуги;
2. доработки;
3. add-ons;
4. legacy low-tier;
5. отдельные шаблоны каталога, если это цена решения, а не тарифа.

## 5. CTA Canon

Order/start actions:

- `Выбрать сайт`
- `Выбрать шаблон`
- `Запустить`
- `Выбрать тариф`
- `Начать`

должны вести в primary order flow, то есть `brief.html` с контекстом, где нужно.

Question/contact actions:

- `Задать вопрос`
- `Связаться`
- `Написать`

могут открывать quick-contact modal.

## 6. Footer Canon

Footer должен быть спокойным service-meta блоком:

- слева/сверху: логотип WEB00;
- language trigger: secondary control;
- legal links: privacy, consent, contacts;
- тонкий divider;
- credit: маленький, muted, вторичный.

Accepted public signature:

```text
WEB00 Pro — premium website platform · Designed & Engineered by Vitaliy Glebov · © 2026
```

Public `Сообщить об ошибке` не выводить в footer как обычную ссылку.

## 7. Backend Boundary Canon

До backend-интеграции:

- не обещать реальный личный кабинет с авторизацией;
- не обещать реальные платежи;
- не обещать реальные Telegram/MAX/VK уведомления;
- status/lead flow считать frontend-preview/localStorage.

После backend:

- localStorage заменить через adapter/service layer;
- UI не должен знать напрямую о транспортном слое.

