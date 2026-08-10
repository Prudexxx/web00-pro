# External Demo iframe Fix

## Goal
Make «Открывать демо внутри WEB00» реально управлять внешними HTTPS-демо.

## Contract
- OFF: внешнее демо не встраивается; показываем fallback + «Открыть отдельно».
- ON + безопасный HTTPS URL без credentials: WEB00 пытается открыть demo в iframe.
- Небезопасный/битый/non-HTTPS URL: iframe не создаётся; fallback.
- «Открыть отдельно» остаётся всегда.
- Локальные/internal demo не меняются.

## Security
Разрешён только `https:` без username/password. Запрещены `http:`, `javascript:`, `data:`, `file:`, `ftp:` и malformed URL.
Не проксируем и не снимаем `X-Frame-Options`/CSP. Если внешний сайт запрещает framing, его политика главнее WEB00. Браузер не гарантирует `iframe.onerror`, поэтому автоматическое определение такого запрета не является acceptance-критерием.

## Scope
Меняем только public demo-modal decision logic и focused frontend tests.
Не трогаем Cloud Primary/Zero-Stale, CRUD/publication, backend lifecycle, images, Render env, Supabase и Cloud.ru.

## Tests
1. external HTTPS + ON => iframe;
2. external HTTPS + OFF => fallback, no iframe;
3. unsafe URL => no iframe;
4. «Открыть отдельно» присутствует;
5. internal demo unchanged;
6. catalog/Zero-Stale regression green.

## Acceptance
Для published item с external demo `https://spasilen.com/` и переключателем ON WEB00 должен попытаться создать iframe, а не сразу показывать external-only fallback.
