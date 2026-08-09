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

### Verified cache commit protocol

Metadata/pointer НЕ является security trust source.
Это только lookup/index.

New verified revision commit order:

1. fetch immutable snapshot bytes;
2. verify SHA-256 against CURRENT valid manifest;
3. parse and validate schema/revision/itemsCount;
4. write immutable snapshot bytes to Cache Storage
   under exact snapshotUrl;
5. only after successful cache write,
   commit metadata pointer to that exact:
   schemaVersion
   revision
   sha256
   snapshotUrl
   savedAt;
6. only then may new revision become latest verified fallback.

До шага 5 предыдущий verified pointer остаётся intact.

Если cache write succeeds, но pointer write fails:

- old pointer remains authoritative fallback pointer;
- new cache entry is harmless orphan;
- orphan may be cleaned later;
- never render unverified content.

Если pointer points to missing/corrupt cache:

- reject pointer;
- do not trust metadata alone;
- delete/ignore bad pointer;
- use current network path or older usable verified fallback if available.

При любом read из verified cache:

- obtain bytes;
- recompute SHA-256;
- compare with stored verified identity;
- validate snapshot structure;
- only then render.

При manifest unavailable degraded fallback:

- persisted verified identity must include enough data
  to validate its own immutable bytes;
- re-hash bytes before degraded render;
- it remains degraded-verified, never ready-current.

Cache Storage unavailable / quota failure:

- current network Cloud path must still work;
- caching failure must not invalidate a valid current network snapshot;
- valid network snapshot may render ready-current;
- browser simply loses warm verified-cache optimization;
- fallback behavior remains safe.

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

### Manifest request lifecycle

Early manifest priming дедуплицирует только concurrent in-flight request.

НЕЛЬЗЯ хранить settled/rejected manifest Promise как постоянный
источник manifest на всю жизнь страницы.

Required behavior:

- primeManifest() может создать один in-flight request;
- loadCatalogFromRuntime() reuse этого request разрешён,
  пока он ещё in-flight;
- concurrent callers не создают duplicate manifest fetch;
- после resolve/reject/abort active in-flight reference очищается;
- rejected/aborted request никогда не poison-ит последующие retries;
- background retry после timeout/failure делает свежий manifest request;
- manual retry делает свежий manifest request;
- promotion check на long-lived page имеет право получить свежий manifest;
- нельзя бесконечно reuse successful manifest старой revision.

"No duplicate manifest requests" означает:
NO duplicate CONCURRENT request,
а не запрет последующих freshness requests.

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

Текущий production SW является legacy SW,
который cache-first обслуживает runtime JS
и использует ignoreSearch.

Поэтому первый Zero-Stale deployment НЕ МОЖЕТ полагаться
только на новый query string типа:

main.js?v=new

Потому что OLD SW может проигнорировать query
и вернуть old cached main.js.

Required one-time escape strategy:

- Zero-Stale deployment должен изменить PHYSICAL URL/PATH
  mutable catalog runtime assets так,
  чтобы legacy SW не смог сопоставить их со старыми SHELL_ASSETS.

Например архитектурно допустимо:

assets/js/catalog-v2/catalog-runtime.js
assets/js/catalog-v2/catalog-api.js
assets/js/catalog-v2/main.js

или эквивалентные новые physical filenames/paths.

Точные имена определить implementation plan,
но invariant обязателен:

OLD legacy SW must not be able to satisfy new runtime request
from its old ignoreSearch cache entry.

P0 обязан сделать controlled migration:

- новая HTML не должна работать со старым
  catalog-runtime.js/catalog-api.js/main.js;
- новый deployment должен гарантированно активировать новый runtime;
- старый shell cache namespace должен быть retired;
- runtime code versioning должно быть deterministic;
- query-string version нельзя считать защитой,
  если SW ignoreSearch.

После controlled migration новый SW:

- получает новый cache namespace;
- retires old web00-shell-* namespace;
- runtime-config.js не должен зависать в stale SW cache;
- mutable manifest никогда не shell-cache;
- runtime JS requests больше НЕ используют ignoreSearch;
- exact request URL является cache identity;
- navigation remains network-first;
- runtime code должен быть либо network-first exact URL
  с exact cached fallback, либо другим design-equivalent способом,
  который сохраняет version coherence;
- deployment versioning deterministic.

Очень важно:

new HTML + old legacy SW first-load scenario
является отдельным acceptance case.

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

### 12. Manifest retry recovery

First manifest request fails/timeouts.
Verified/degraded fallback activates.
Network/VPN recovers.
Background retry performs NEW manifest request.
New revision is discovered.
New snapshot validates.
Complete grid promotes atomically.

Expected:

- failed Promise not reused;
- manifest fetch count increments;
- recovery succeeds without page restart;
- no card-by-card promotion.

### 13. Verified cache torn-write recovery

Snapshot cache write succeeds.
Metadata pointer write fails.

Expected:

- old verified pointer remains usable;
- new cache entry is harmless orphan;
- no trusted render is derived from the orphan alone;
- later cleanup may remove the orphan without changing current state.

### 14. Verified metadata points to missing cache

Metadata pointer exists for revision X / SHA A.
Cache Storage has no bytes for pointer snapshotUrl,
or bytes are corrupt.

Expected:

- pointer is rejected;
- metadata alone is never trusted;
- bad pointer is deleted or ignored;
- current network path or older usable verified fallback is used.

### 15. Cache Storage unavailable during current Cloud success

Manifest and network snapshot are valid.
SHA-256 and schema validation pass.
Cache Storage put throws quota/error.

Expected:

- current valid Cloud snapshot may render ready-current;
- caching failure does not corrupt verified state;
- no false verified-cache state is recorded;
- warm-cache optimization is lost until a later successful cache write.

### 16. Legacy SW escape

Initial browser state:

- currently deployed legacy SW active;
- legacy shell cache populated with old:
  main.js
  catalog-api.js
  catalog-runtime.js.

Then simulate Zero-Stale deployment:

- new HTML requests NEW physical runtime paths.

Expected:

- old SW cannot satisfy those requests from old runtime entries;
- new runtime bytes come from correct new URLs;
- new SW installs/activates;
- old shell cache retired;
- reload remains on new runtime;
- no HTML/runtime version mismatch loop.

Query-string-only migration MUST FAIL this regression test
or be explicitly proven unsafe in a RED fixture.

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
