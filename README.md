# DSH token status

A status bar for the **DeepSeek Harness Web GUI** that answers two questions at a glance: how much
this conversation has cost so far, and whether the expensive tariff is in force right now. Each
model has its own price plan, its own peak hours and its own USD→CNY rate, so the bar charges a
session by the plan of the model it is running and names that model. The settings panel offers the
models this Harness actually routes to, grouped by provider.

![The token status bar at the bottom of the Harness window, with a zoomed view of its counters](docs/preview.png)

[English](#english) · [Русский](#русский)

---

## English

### What it shows

The bar spans the whole width at the bottom of the window:

| Part | Meaning |
|---|---|
| Dot and tariff label | The tariff in force now — red `Peak`, green `Off-peak` — plus the local clock time when it flips. A model without peak hours shows a neutral `single tariff` and no countdown |
| `session` / `all` | Scope: the open conversation, or every session in the process when no conversation is open |
| `model` | The model the counters and the cost belong to — for example `deepseek-flash`, `deepseek-v4-pro`, or `all models` for the process total. Switching the model picker switches the bar at once; the tooltip lists the spend of every model in scope |
| `Peak` / `Off-peak` | Tokens billed under each tariff, with prompt-cache hits and misses in brackets. `Off-peak` is hidden for a model without peak hours: such a model has one price |
| `output` | Output tokens across both tariffs |
| `cost` | Estimated charge in USD and CNY, priced by the plan and the rate of the model shown. A model whose prices are all zero is counted in tokens only, and the section disappears |
| `total … since launch` | Every billed token in this Harness process |
| Gear | Opens the settings panel |

### Requirements

* DeepSeek Harness with the Web GUI (the `dsh-web-app` bundle; the shipped `desktop` and `web`
  profiles have it).
* Nothing else: no dependencies and no build step. The plugin reads the usage the Harness already
  records in the session log and never sends it anywhere; its only network request is the price
  page it loads when you press **Autofill** in the settings panel.

### Install

1. Get the files: `git clone https://github.com/Nosferatus83/DSH-token-status.git`, or use
   **Code → Download ZIP** and unpack it.
2. In DSH open the sidebar **Plugins** panel and choose **Add plugin** (Russian UI:
   **Плагины → Добавить плагин**).
3. Select the folder that contains `package.json` — the root of this repository.
4. Wait for the bundle row to appear as enabled. The bar shows up at the bottom of the window; if
   it does not, reload the page.

The bundle links to the folder you selected, so `git pull` there plus a DSH restart picks up a
newer version, and removing the bundle in **Plugins** uninstalls it. If your DSH exposes the
`plugin_manager` agent tool, installing works the same way: `install_bundle` with this folder as
the target.

### Language

The gear at the right end of the bar opens the settings panel, whose first field is **Language**:

| Choice | Effect |
|---|---|
| `Match the interface` (default) | Follows the Harness interface language |
| `English` | Pins the bar to English |
| `Русский` | Pins the bar to Russian |

The choice is saved as this plugin row's config, so it survives restarts, and it also applies
immediately instead of waiting for the row to restart.

### Settings

The same panel edits the constants the estimate is computed from. The model list is the one this
Harness serves — the providers and models of its own **Models** settings page — and the price rows
belong to whichever model is selected:

| Field | Meaning |
|---|---|
| `Model` | One entry per model this Harness can route to, grouped by provider, plus the models already saved in this profile. Switching it swaps every row below; nothing is saved yet |
| `Save prices` | Writes the edited plans to the profile right away and leaves the panel open |
| `Autofill` | DeepSeek models only: loads the published DeepSeek prices for every model and puts them in the rows as a draft. Press **Save prices** to keep them |
| `DeepSeek pricing` | A link to [the published price list](https://api-docs.deepseek.com/quick_start/pricing), shown beside Autofill for the same DeepSeek models |
| `Peak` / `Off-peak` rows | Price per 1,000,000 tokens for a cache hit, a cache miss, and output |
| `USD→CNY` | Rate used for the second currency — this model's own rate |
| `Peak hours (UTC)` | This model's intervals billed at the full price; everything outside them is off-peak. **Add interval** adds a row, `×` removes one. Removing the last one makes the model single-price: the `Off-peak` column disappears and its prices are cleared |
| `Scope` | Whether the bar counts the open conversation or the whole process |

**Save** writes the values through the profile's config editor, so they persist and stay visible
in the profile patch. **Defaults** refills the form with the shipped DeepSeek prices without
saving. Editing a config field restarts the row: the counters are rebuilt from the sessions that
are still live and repriced under the new constants.

**Autofill** asks the Host half to load the price list, and the Host tries three sources in order:
the JSON endpoint `https://api.deepseek.com/pricing` (which answers only with an API key, so the
key from `DEEPSEEK_API_KEY` is sent when the environment has one), then the documentation page as
Markdown, then the same page as HTML. The result is a draft for every model it returns — it is
never written without you pressing a save button. DeepSeek does not document a public pricing API,
so in practice the documentation page is what answers.

```yaml
- id: token-status
  name: 'dsh-token-status'
  config:
    language: auto            # 'auto' (follow the Harness), 'en' or 'ru'
    scope: session            # 'session' (default) or 'process'
    cnyPerUsd: 7.1            # row-level fallback rate a model inherits
    defaultModel: deepseek-flash   # model assumed when the log names none
    models:                   # one plan per model: prices, own hours, own rate
      deepseek-flash:
        peak:    { cacheHit: 0.006, cacheMiss: 0.3,  output: 1.2 }
        offPeak: { cacheHit: 0.003, cacheMiss: 0.15, output: 0.6 }
        cnyPerUsd: 7.1
        peakWindows:          # UTC, intervals of the full price; everything else is off-peak
          - { from: '01:00', to: '04:00' }
          - { from: '06:00', to: '10:00' }
      deepseek-v4-pro:
        peak:    { cacheHit: 0.044, cacheMiss: 1.32, output: 3.96 }
        offPeak: { cacheHit: 0.022, cacheMiss: 0.66, output: 1.98 }
        cnyPerUsd: 7.1
        peakWindows:
          - { from: '01:00', to: '04:00' }
          - { from: '06:00', to: '10:00' }
```

A model that does not name `peakWindows` or `cnyPerUsd` inherits the row-level `peakWindows` and
`cnyPerUsd`; the top level of the config therefore still works as the shared default. A model that
names an **empty** `peakWindows` list keeps it: no interval means one price for the whole day, all
tokens in the `Peak` bucket and no off-peak section. A config written before plans were per model
carries one `pricing` list; it is read as the plan of `defaultModel`, and the other models keep
their shipped prices.

### Tariff model

Each usage report is billed by the tariff in force when its step **started**, so a request that
runs across the boundary lands in the bucket it was charged in — and the tariff is decided by the
peak hours of the model that produced the tokens. A cache write is priced as a missed prompt
token. The cost of a model is computed from that model's own plan and rate: a session that
switches model mid-conversation keeps a separate pair of buckets per model, and the bar follows
the model picker the moment you switch — the model's `model/selection` event is recorded before
any tokens are spent. The counters then show that model's spend (zero until it runs), while the
earlier model's tokens stay in the per-model breakdown of the badge tooltip and in the process
total. A step that was already running when you switched still reports its tokens to the model
that produced them, and that report never drags the bar back to the previous model.

The plan is described by its **peak** intervals, so a plan with two expensive windows a day is
two `peakWindows` entries. A config written the other way round (with `offPeakWindows`) is still
read once and complemented into peak intervals, and saving from the form rewrites it in the new
shape.

### How it works

* The Host half folds `assistant/message` usage from the durable session log into two tariff
  buckets per session and per model, backfills sessions that were already live, then follows
  `session/event`. The model comes from the request header of the step, so a switch is picked up
  as soon as the next request starts.
* It serves one JSON snapshot on the prefix route `/token-status`. Every request passes
  `ctx.connection.requestRejection`, so the Host/Origin fence and the browser credential decide
  who may call it. `GET /token-status/snapshot` reads; `GET /token-status/models` lists the
  provider-grouped models this Harness routes to, with a DeepSeek flag for every model;
  `POST /token-status/settings` validates the form and persists it through `ctx.configEditor.edit`;
  `POST /token-status/pricing/refresh` loads the published price list and returns it as a draft.
* The browser half registers into the root-scoped `shell.bottom` slot, polls the snapshot every 3
  seconds, and ticks its own clock every second so the tariff dot flips exactly on the boundary.
  Styling uses `--dsw-alias-*` theme tokens only, so it follows the light and dark themes.

### Limitations

* Counters start at zero when the Harness process starts; nothing is persisted across restarts.
* The scope is the open conversation or the whole process — not a chosen subset of sessions.
* The peak windows apply every day. DeepSeek excludes weekends and Chinese public holidays from
  its peak hours and the bar cannot express that, so weekend spend may be priced at the peak rate.
* The shipped prices are the ones DeepSeek publishes for `deepseek-flash` and `deepseek-v4-pro`;
  a model another provider offers starts unpriced, i.e. counted in tokens only, until you enter
  its prices.
* Autofill and the price-list link exist only for DeepSeek models: DeepSeek is the one provider
  whose published list the plugin can read.
* The bar is a Web GUI surface; other DSH surfaces have no bottom slot to render into.

---

## Русский

### Что показывает

Полоса во всю ширину внизу окна:

| Часть | Значение |
|---|---|
| Кружок и название тарифа | Действующий тариф — красный `Пиковый час`, зелёный `Непиковый час` — и местное время, когда он сменится. У модели без пиковых часов — нейтральный `единый тариф` без обратного отсчёта |
| `сессия` / `всё` | Что считается: открытый диалог или все сессии процесса, когда диалог не открыт |
| `модель` | Модель, к которой относятся счётчики и стоимость: например, `deepseek-flash`, `deepseek-v4-pro` или `все модели` для всего процесса. Переключение модели в селекторе сразу переключает полосу; в подсказке — расход каждой модели в области счёта |
| `Пик` / `Не пик` | Токены по каждому тарифу, в скобках — попадания в кэш и промахи. `Не пик` скрыт у модели без пиковых часов: у такой модели одна цена |
| `выход` | Выходные токены по обоим тарифам |
| `стоимость` | Оценка в USD и CNY по тарифу и курсу показанной модели. Если в настройках у модели все цены нулевые, считаются только токены, а раздел исчезает |
| `всего … с запуска` | Все списанные токены в этом процессе Harness |
| Шестерёнка | Открывает панель настроек |

### Требования

* DeepSeek Harness с веб-интерфейсом (bundle `dsh-web-app`; он есть в штатных профилях `desktop`
  и `web`).
* Больше ничего: ни зависимостей, ни сборки. Плагин читает расход, который Harness и так
  записывает в журнал сессий, и никуда его не отправляет; единственный сетевой запрос — страница
  прайса, которую он загружает по кнопке **Автозаполнить** в настройках.

### Установка

1. Получите файлы: `git clone https://github.com/Nosferatus83/DSH-token-status.git` или
   **Code → Download ZIP** с распаковкой.
2. В DSH откройте боковую панель **Плагины** и выберите **Добавить плагин**
   (в английском интерфейсе — **Plugins → Add plugin**).
3. Укажите папку с файлом `package.json` — корень этого репозитория.
4. Дождитесь, пока строка bundle станет включённой. Полоса появится внизу окна; если её нет —
   обновите страницу.

Bundle ссылается на выбранную папку, поэтому `git pull` в ней и перезапуск DSH подхватывают
новую версию, а удаление bundle в **Плагинах** удаляет плагин. Если в вашем DSH доступен
агентский инструмент `plugin_manager`, установка та же: `install_bundle` с этой папкой в
качестве цели.

### Язык

Шестерёнка в правом конце полосы открывает панель настроек, первое поле в ней — **Язык**:

| Вариант | Действие |
|---|---|
| `Как в интерфейсе` (по умолчанию) | Следует языку интерфейса Harness |
| `English` | Фиксирует английский |
| `Русский` | Фиксирует русский |

Выбор сохраняется в конфигурации строки плагина и переживает перезапуск, а применяется сразу,
не дожидаясь перезапуска строки.

### Настройки

Та же панель задаёт константы, по которым считается оценка. Список моделей — тот, который
обслуживает этот Harness (провайдеры и модели его собственной страницы **Модели**), а строки
цен относятся к выбранной модели:

| Поле | Значение |
|---|---|
| `Модель` | По одной записи на каждую модель, которую обслуживает Harness, с группировкой по провайдеру, плюс модели, уже сохранённые в профиле. Переключение меняет все строки ниже и ничего не сохраняет |
| `Записать цены` | Сразу записывает отредактированные планы в профиль и оставляет панель открытой |
| `Автозаполнить` | Только для моделей DeepSeek: загружает опубликованный прайс DeepSeek для всех моделей в виде черновика. Чтобы его сохранить, нажмите **Записать цены** |
| `Прайс DeepSeek` | Ссылка на [опубликованный прайс](https://api-docs.deepseek.com/quick_start/pricing) рядом с «Автозаполнить»; видна для тех же моделей DeepSeek |
| Строки `Пик` / `Не пик` | Цена за 1 000 000 токенов: попадание в кэш, промах, выход |
| `USD→CNY` | Курс для второй валюты — свой у каждой модели |
| `Пиковые часы (UTC)` | Интервалы этой модели по полному тарифу; всё остальное время — непиковое. **Добавить интервал** добавляет строку, `×` убирает её. Если убрать последний интервал, модель становится однотарифной: колонка `Не пик` исчезает, а её цены обнуляются |
| `Счёт` | Считать открытый диалог или весь процесс |

**Сохранить** записывает значения через редактор конфигурации профиля, поэтому они сохраняются и
остаются видны в патче профиля. **По умолчанию** заполняет форму штатными ценами DeepSeek без
сохранения. Изменение поля конфигурации перезапускает строку: счётчики собираются заново из
живых сессий и пересчитываются по новым константам.

**Автозаполнить** просит Host-часть загрузить прайс, и та пробует три источника по порядку: JSON
`https://api.deepseek.com/pricing` (он отвечает только с ключом API, поэтому ключ из
`DEEPSEEK_API_KEY` подставляется, если он есть в окружении), затем страницу документации в виде
Markdown, затем ту же страницу как HTML. Результат — черновик для всех моделей из ответа; без
нажатия кнопки сохранения он никуда не записывается. Публичного API цен DeepSeek не
документирует, поэтому на практике отвечает страница документации.

```yaml
- id: token-status
  name: 'dsh-token-status'
  config:
    language: auto            # 'auto' (как в Harness), 'en' или 'ru'
    scope: session            # 'session' (по умолчанию) или 'process'
    cnyPerUsd: 7.1            # курс уровня строки, который наследует модель
    defaultModel: deepseek-flash   # модель, если в журнале она не названа
    models:                   # свой план на каждую модель: цены, свои часы, свой курс
      deepseek-flash:
        peak:    { cacheHit: 0.006, cacheMiss: 0.3,  output: 1.2 }
        offPeak: { cacheHit: 0.003, cacheMiss: 0.15, output: 0.6 }
        cnyPerUsd: 7.1
        peakWindows:          # UTC, интервалы по полному тарифу; остальное — непиковое
          - { from: '01:00', to: '04:00' }
          - { from: '06:00', to: '10:00' }
      deepseek-v4-pro:
        peak:    { cacheHit: 0.044, cacheMiss: 1.32, output: 3.96 }
        offPeak: { cacheHit: 0.022, cacheMiss: 0.66, output: 1.98 }
        cnyPerUsd: 7.1
        peakWindows:
          - { from: '01:00', to: '04:00' }
          - { from: '06:00', to: '10:00' }
```

Модель, которая не называет `peakWindows` или `cnyPerUsd`, наследует одноимённые значения уровня
строки, поэтому верхний уровень конфигурации остаётся общим значением по умолчанию. Модель с
**пустым** списком `peakWindows` сохраняет его: интервалов нет — значит одна цена на весь день,
все токены попадают в `Пик`, а раздела `Не пик` нет. Конфигурация, записанная до появления планов
по моделям, несёт один список `pricing`: он читается как план `defaultModel`, а остальные модели
остаются со штатными ценами.

### Модель тарифа

Каждый отчёт о расходе относится к тарифу, действовавшему в момент **начала** шага, поэтому запрос
через границу попадает в тот тариф, по которому списан, — и тариф решают пиковые часы той модели,
которая потратила токены. Запись в кэш оценивается как промах. Стоимость модели считается по её
собственному плану и курсу: сессия, сменившая модель посреди диалога, хранит отдельную пару
счётчиков на каждую модель, а полоса переключается на выбранную модель сразу — DSH пишет событие
`model/selection` ещё до траты токенов. Счётчики показывают расход этой модели (ноль, пока она не
работала), а токены прежней модели остаются в разбивке по моделям в подсказке метки и в общем итоге
процесса. Шаг, начатый до переключения, всё равно относит свои токены к той модели, которая их
потратила, и этот отчёт не возвращает полосу к прежней модели.

План описывается **пиковыми** интервалами: план с двумя дорогими окнами в сутки — это две записи
`peakWindows`. Конфигурация, записанная наоборот (через `offPeakWindows`), один раз читается и
дополняется до пиковых интервалов, а сохранение из формы переписывает её в новом виде.

### Как это устроено

* Host-часть складывает расход `assistant/message` из журнала сессий в два тарифных счётчика на
  сессию и на модель, досчитывает уже живые сессии и далее следит за `session/event`. Модель
  берётся из заголовка запроса шага, поэтому смена модели видна, как только начнётся следующий
  запрос.
* Она отдаёт один JSON-снимок по префиксному маршруту `/token-status`. Каждый запрос проходит
  через `ctx.connection.requestRejection`, поэтому доступ решают Host/Origin-защита и браузерные
  учётные данные. `GET /token-status/snapshot` читает; `GET /token-status/models` перечисляет
  сгруппированные по провайдерам модели этого Harness с признаком DeepSeek у каждой;
  `POST /token-status/settings` проверяет форму и сохраняет её через `ctx.configEditor.edit`;
  `POST /token-status/pricing/refresh` загружает опубликованный прайс и возвращает его черновиком.
* Browser-часть регистрируется в корневом слоте `shell.bottom`, опрашивает снимок раз в 3 секунды
  и раз в секунду пересчитывает свои часы, чтобы кружок переключался ровно на границе. Оформление
  использует только токены темы `--dsw-alias-*`, поэтому работает в светлой и тёмной теме.

### Ограничения

* Счётчики начинаются с нуля при старте процесса Harness; между перезапусками ничего не
  сохраняется.
* Область — открытый диалог или весь процесс, но не выбранный набор сессий.
* Пиковые интервалы действуют каждый день. DeepSeek исключает из пиковых часов выходные и
  китайские праздники, а полоса это выразить не может, поэтому расход в выходные может считаться
  по пиковому тарифу.
* Штатные цены — опубликованные DeepSeek для `deepseek-flash` и `deepseek-v4-pro`; модель другого
  провайдера стартует без цен, то есть считается только в токенах, пока вы не введёте её цены.
* «Автозаполнить» и ссылка на прайс есть только у моделей DeepSeek: это единственный провайдер,
  чей опубликованный прайс плагин умеет читать.
* Полоса — поверхность веб-интерфейса; в других интерфейсах DSH нет нижнего слота для неё.

## License

MIT — see [LICENSE](LICENSE).
