# Руководство для контрибьюторов

## Обзор проекта

Roundtable — исследовательский прототип локальной «control plane» для DeepSeek Harness (DSH): детерминированная диагностика репозитория, режимы работы Direct/Reviewed/Team, ClaimCritic. Статус — **research / feasibility**, не production. Нормативная спецификация — `docs/product/`; при конфликте с другими документами побеждает она.

## Структура проекта

- `index.js`, `cordis.patch.yml` — DSH-плагин `roundtable-code-health` (Cordis `apply` + `ctx.effect()`), пакет `dsh-roundtable-beta`.
- `lib/` — ядро сканера: `analyzers.js` (regex-правила), `fingerprint.js`, `ledger.js`, `scanner.js`, `claim-critic.js`.
- `test/core.test.js` — тесты ядра сканера.
- `decision-routing/` — изолированный эксперимент маршрутизации (rules/Laya/Jev/cascade): `src/*.mjs`, `test/`, `fixtures/synthetic.json`. Свой `package.json`, без зависимостей.
- `docs/product/01…08_*.md` — каноническая спецификация; `docs/FEASIBILITY_RESULT.md` — результаты совместимости с DSH.
- `corrected/` — схемы (`schemas/*.schema.json`) и ранний архитектурный аддендум.
- Корневые `*.py`, `01_…05_*.md`, `mas_*.md` — **исторические** прототипы; не нормативны, не расширяйте их без необходимости.

## Сборка, тесты, запуск

Требуется Node.js `^22.19.0 || >=24.0.0`. Сборки нет, код — ES-модули.

```powershell
node --test                      # все тесты (корень + decision-routing), без npm install
npm.cmd install                  # нужен только для плагина (@deepseek-ai/schemastery)
cd decision-routing; npm.cmd run eval   # офлайн-оценка на синтетике
python tie_break.py              # исторические Python-скрипты запускаются напрямую
```

В PowerShell `npm` может блокироваться Execution Policy — используйте `npm.cmd`. Установка в DSH: `dsh plugin --profile roundtable-beta add <abs-path>`; сканируемый репозиторий задаётся `ROUND_TABLE_WORKSPACE`. Live-прогоны (`--live --provider jev|laya|cascade`) — только по явному запросу.

## Стиль кода и именование

- 2 пробела, без точек с запятой, одинарные кавычки, `import`/`export` (ESM); корень — `.js`, `decision-routing` — `.mjs`.
- Функции и переменные — `camelCase`, классы — `PascalCase` (`FindingLedger`), приватные поля — `#field`.
- Только встроенные модули `node:*`; новые зависимости — по согласованию.
- Идентификаторы правил — kebab-case (`empty-catch`, `probable-hardcoded-secret`).

## Тестирование

Встроенный `node:test` + `node:assert/strict`. Файлы — `*.test.js` / `*.test.mjs` в `test/`, названия тестов — фразы о поведении (`'fingerprint is stable when only line numbers move'`). Тесты не должны ходить в сеть; внешние провайдеры мокаются.

## Коммиты и пулл реквесты

- Conventional-стиль: `feat:`, `docs:`, `research:` + описание в повелительном наклонении (`docs: add safety research evaluation and roadmap baseline`).
- Работа в ветках `<тип>/<тема>` (`beta/feasibility-spike`, `research/decision-routing-eval`, `docs/canonical-product-spec`) и merge через PR.
- Нормативное изменение обновляет в одном PR все затронутые требования, контракты, гейты оценки, roadmap и `08_DECISION_REGISTER.md`. Внешние утверждения — со ссылкой на первоисточник.

## Правила для агентов и безопасность

- Политика (права, бюджеты, approvals, safety floors) — детерминированная; модель не может понизить floor.
- Не превращайте пропущенную или упавшую проверку в успех; отделяйте «Implemented» от «Planned».
- Никогда не коммитьте ключи (`TYPESAFE_API_KEY`, `LAYA_API_KEY`) и `.roundtable/`; приватный код не отправляйте внешним провайдерам.
