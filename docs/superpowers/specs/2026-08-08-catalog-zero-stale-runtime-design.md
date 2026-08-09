# WEB00 Zero-Stale Catalog Runtime P0 Design

## Goal

Сделать initial catalog loading максимально быстрым и визуально атомарным,
не показывая старые, частичные или "догоняющие" карточки.

Ключевой пользовательский результат:

- опубликованная новая карточка не появляется позже остальных;
- отредактированная карточка не "подменяется" через доли секунды;
- удалённая карточка не мигает из старого cache;
- вся одна Cloud revision появляется одним atomic render;
- Render не участвует в initial public catalog loading;
- GitHub не участвует в catalog CRUD/runtime;
- VPN/медленный маршрут может задержать весь каталог,
  но не отдельную карточку.

## Production Source Of Truth

PostgreSQL/Supabase
→ public_catalog_control
→ Atomic reconciler
→ Cloud.ru immutable snapshot
→ Cloud.ru manifest
→ public frontend

Cloud manifest revision + SHA256 является authoritative freshness boundary.

## Zero-Stale Rule

НЕЛЬЗЯ:

static/data.js
→ render старого каталога
→ Cloud
→ render нового каталога

НЕЛЬЗЯ постепенно добавлять карточки новой revision.

Разрешено только:

bootstrap/skeleton
→ определить authoritative revision
→ получить и полностью проверить snapshot
→ один atomic render всей revision.

## Startup Flow

При загрузке страницы:

1. HTML/CSS shell появляется сразу.
2. В области каталога отображается стабильный skeleton.
3. Соединение с Cloud.ru прогревается через preconnect.
4. Catalog runtime запускает запрос manifest максимально рано,
   до обычного DOMContentLoaded catalog initialization.
5. Manifest проходит строгую существующую validation:
   schemaVersion
   revision
   itemsCount
   sha256
   snapshotPath
   snapshotUrl
   approved origin.
6. Frontend сравнивает manifest с локальным VERIFIED snapshot metadata.

### Warm path — same revision

Если:

cached.revision === manifest.revision
AND
cached.sha256 === manifest.sha256
AND
cached.snapshotUrl === manifest.snapshotUrl

то:

- прочитать cached immutable snapshot bytes;
- повторно SHA-256 verify bytes;
- parse + validate snapshot against current manifest;
- если valid — использовать snapshot;
- НЕ скачивать snapshot повторно из Cloud;
- atomic render всей сетки.

Manifest всё равно должен быть получен первым.
Нельзя считать cached revision актуальной без проверки manifest.

### New revision path

Если manifest revision/SHA отличаются от verified cache:

- НЕ показывать старый catalog как current;
- оставить skeleton;
- скачать exact immutable snapshotUrl;
- SHA-256 verify;
- validate schema/revision/itemsCount;
- only after full validation:
  save as VERIFIED cache
  and atomic render whole revision.

## Verified Cache

Основное runtime-хранилище:
Cache Storage API.

Отдельный cache namespace, например:

web00-catalog-verified-v1

Snapshot хранится под exact immutable snapshotUrl.

Маленький metadata record может храниться отдельно
(localStorage допустим только для metadata, не как основной JSON store):

schemaVersion
revision
sha256
snapshotUrl
savedAt

Cache entry НЕ становится trusted только потому, что существует.

Перед использованием ОБЯЗАТЕЛЬНО:

- exact manifest identity match;
- SHA-256 recomputation;
- snapshot validation.

Corrupted cache:
delete/reject entry and use network path.

## Existing LKG

Текущий localStorage LKG не является primary instant runtime cache.

Он остаётся migration/disaster compatibility layer до безопасного удаления.

Нельзя автоматически доверять старому LKG как current revision.

## data.js Role

assets/js/data.js перестаёт быть первым источником каталога.

Он остаётся только disaster fallback:

Cloud manifest definitively unavailable
AND
нет usable previously VERIFIED Cloud snapshot.

Static fallback должен быть явно degraded.

Нельзя показывать data.js сначала, пока параллельно грузится Cloud.

## Slow VPN / Slow Network

При медленном, но ещё живом Cloud connection:

- shell виден;
- skeleton стабилен;
- старый catalog НЕ показывается как current;
- отдельные карточки не появляются по одной;
- после полной проверки snapshot вся сетка появляется одним render.

Existing request timeout boundary можно сохранить,
если tests подтверждают корректную semantics.

До definite network failure/timeout degraded fallback не должен
заменять ожидаемую current revision.

## Cloud Unavailable

Если manifest definitively failed/timeout/offline:

1. попробовать последний previously VERIFIED Cloud snapshot;
2. показать его только как degraded fallback;
3. сохранить визуально стабильную сетку;
4. тихо retry Cloud в фоне;
5. при получении новой valid revision заменить каталог
   целиком одним atomic render.

Если verified snapshot отсутствует:
использовать data.js disaster fallback.

Нельзя выдавать degraded snapshot за подтверждённую current revision.

## Atomic Render Contract

Одна revision = один DOM catalog commit.

Никакого:

- append new card after initial grid;
- card-by-card async insertion;
- static-grid then Cloud-grid flash;
- deleted card flash;
- filter reset при promotion.

При promotion revision:
подготовить complete normalized item array,
затем одним render operation заменить grid.

## Images

Карточка должна появляться одновременно с остальными,
даже если image bytes ещё грузятся.

Обязательно:

- фиксированная preview geometry/aspect-ratio;
- отсутствие layout shift;
- text/title/price/actions видны сразу;
- image loading может оставаться lazy/async;
- поздняя картинка не двигает сетку.

## Early Manifest Start

Добавить:

preconnect:
https://web00-public-runtime.s3-website.cloud.ru

Catalog manifest fetch должен стартовать раньше текущего
DOMContentLoaded catalog refresh.

Предпочтительный механизм:
runtime-config.js уже загружен перед catalog-runtime.js;
catalog-runtime.js может prime manifest request при собственной evaluation
и затем reuse promise при loadCatalogFromRuntime().

Не добавлять parser-blocking heavy inline JS.

Не делать duplicate manifest requests.

## Security Invariants

Сохранить существующие:

- exact approved Cloud origin;
- manifest path validation;
- snapshot path derived from revision + SHA;
- no credentials;
- no redirects;
- schema validation;
- itemsCount validation;
- SHA-256 validation;
- strict JSON/content-type rules.

Verified cache НЕ ослабляет security boundary.

Любой local cache всегда повторно проверяется.

## Service Worker Migration

Текущий SW cache-first для runtime JS + ignoreSearch является риском.

P0 обязан сделать controlled migration:

- новая HTML не должна работать со старым
  catalog-runtime.js/catalog-api.js/main.js;
- новый deployment должен гарантированно активировать новый runtime;
- старый shell cache namespace должен быть retired;
- runtime code versioning должно быть deterministic;
- query-string version нельзя считать защитой,
  если SW ignoreSearch.

Не кэшировать mutable manifest как shell asset.

Cloud immutable snapshot cache отделён от SW shell cache.

## Failure Semantics

### Manifest invalid
Do not use new network snapshot.
Use previously VERIFIED degraded fallback if available.

### Snapshot HTTP/network failure
Use previously VERIFIED degraded fallback if available.

### SHA mismatch
Reject snapshot.
Never render it.
Do not overwrite verified cache.

### Invalid schema/count/revision
Reject snapshot.
Never render it.

### Corrupt local verified cache
Reject/delete corrupt entry.
Try network snapshot.

### No Cloud + no verified cache
Use data.js disaster fallback.

## State Model

Suggested lifecycle states:

bootstrap
loading-current
ready-current
degraded-verified
degraded-static
fatal

`ready-current` only after current manifest identity
and snapshot validation have succeeded.

`degraded-verified` must remain distinguishable internally
from authoritative ready-current.

## UI Contract

Do not show old cards while checking current revision.

Loading state:
premium stable skeleton grid,
not plain "Загружаем каталог..." as primary visual.

Skeleton:

- same approximate card geometry;
- no CLS when replaced;
- desktop and mobile;
- accessible loading state;
- not interactive.

Degraded mode may show a small non-blocking notice,
but catalog remains usable.

## Performance Goals

Warm same-revision:

- only small manifest network request required;
- snapshot served from local verified Cache Storage;
- no Render;
- no GitHub;
- no second snapshot download;
- no static→Cloud rerender.

New revision:

- manifest
- one immutable snapshot download
- SHA verify
- one render.

Performance must scale cleanly beyond current ~17 cards.

## Pages In Scope

Catalog runtime primitive must support all current catalog consumers:

- solutions.html full catalog;
- index/home popular cards;
- brief page catalog resolution where applicable.

Primary visual acceptance is solutions.html.

Avoid three separate caching implementations.

## Compatibility

Keep:

- Cloud Primary manifest/snapshot schema v1;
- Atomic publication architecture;
- demo settings propagation;
- trusted demo iframe rules;
- responsive images;
- filters;
- existing public URLs;
- static disaster fallback;
- frontend safety normalization.

Do not modify backend Atomic publication protocol for this P0.

## Acceptance Tests

### 1. Warm same revision

Manifest rev X / SHA A.
Verified cache has rev X / SHA A.

Expected:

- cached bytes SHA verified;
- no Cloud snapshot fetch;
- whole grid appears atomically;
- source current/verified;
- no static flash.

### 2. New revision

Local rev X.
Manifest rev X+1.

Expected:

- rev X not rendered as current;
- skeleton remains;
- rev X+1 downloaded and verified;
- whole X+1 grid renders once.

### 3. Deleted-card ghost test

Verified old cache contains card Z.
New manifest snapshot does not.

Expected:

- Z never appears before new revision;
- no one-frame ghost.

### 4. Edited-card test

Old cache contains old title/content.
New revision contains edited content.

Expected:

- old content does not flash first;
- edited card appears with entire new revision.

### 5. Slow Cloud/VPN

Delay manifest/snapshot 3–7 seconds.

Expected:

- stable skeleton;
- no old/partial catalog;
- one atomic render when ready;
- layout remains stable.

### 6. Cloud unavailable with verified cache

Definitive network failure/timeout.

Expected:

- verified snapshot becomes degraded fallback;
- usable catalog;
- degraded state known;
- retry does not append cards individually.

### 7. Cloud unavailable first visit

No verified snapshot.

Expected:

- data.js disaster fallback only after Cloud failure;
- explicit degraded state.

### 8. Corrupt local cache

Cache bytes do not match metadata SHA.

Expected:

- reject/delete cached entry;
- fetch current network snapshot;
- corrupted catalog never renders.

### 9. Network snapshot SHA mismatch

Expected:

- reject;
- do not replace good verified cache;
- never render invalid network content.

### 10. SW upgrade

Browser begins with previous production SW/cache.

Deploy new runtime.

Expected:

- controlled activation;
- new HTML cannot remain paired indefinitely with old runtime JS;
- no stale runtime after normal reload/update path.

### 11. VPN ON / OFF owner acceptance

Test same production URL:

VPN OFF
VPN ON

For both:

- no Render dependency;
- no GitHub dependency;
- no card-by-card delayed appearance;
- no ghost deleted card;
- same authoritative revision eventually shown.

## Instrumentation / Evidence

Tests should be able to observe:

- manifest fetch count;
- snapshot network fetch count;
- cache hit/miss;
- selected revision;
- selected SHA;
- render count;
- source state;
- degraded reason.

No sensitive logging.

Production console should not spam.

## Non-Goals

Not part of this P0:

- changing backend CRUD;
- changing Supabase schema;
- changing Cloud snapshot schema;
- replacing Cloud.ru;
- CDN redesign;
- image CDN migration;
- removing legacy publication module files;
- unrelated UI redesign.

## Final Production Acceptance

After merge/deploy:

1. establish current Cloud revision;
2. cold clean browser load;
3. warm reload same revision;
4. publish/edit a controlled canary card;
5. verify next page load shows entire new revision atomically;
6. verify no old-title/new-title flash;
7. delete canary;
8. verify no ghost card flash;
9. test VPN OFF;
10. test VPN ON;
11. verify GitHub/Render remain outside visitor catalog load.

Final PASS requires:

ZERO_STALE_GHOST = PASS
ATOMIC_GRID_RENDER = PASS
WARM_VERIFIED_CACHE = PASS
NEW_REVISION_PROMOTION = PASS
CORRUPTION_REJECTION = PASS
SW_MIGRATION = PASS
VPN_OFF = PASS
VPN_ON = PASS
RENDER_INDEPENDENCE = PASS
GITHUB_INDEPENDENCE = PASS
