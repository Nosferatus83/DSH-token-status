window.__ModuleLoader__.load({
  id: 'dsh-token-status',
  factory(require) {
    const React = require('react')
    const h = React.createElement

    const NS = 'tokenStatus'
    /** The last language this browser picked, so the bar renders right before the first read. */
    const LANGUAGE_KEY = 'token-status:language'
    /** A model switch is picked up by the next poll; keep that short enough to feel instant. */
    const POLL_MS = 3000
    const TICK_MS = 1000
    const REQUEST_TIMEOUT_MS = 8000
    /** Loading the price page goes through two remote documents, so it gets its own budget. */
    const PRICING_TIMEOUT_MS = 30000
    const ROUTE = '/token-status/snapshot'
    const SETTINGS_ROUTE = '/token-status/settings'
    const PRICING_ROUTE = '/token-status/pricing/refresh'

    /**
     * Mirrors the Host catalog so the dot, the cost and the form work before the first
     * snapshot. Prices are USD per 1,000,000 tokens, as published for each model.
     */
    const MODELS = ['deepseek-flash', 'deepseek-v4-pro']
    const DEFAULT_MODEL = 'deepseek-flash'
    const DEFAULT_PEAK_WINDOWS = [{ from: '01:00', to: '04:00' }, { from: '06:00', to: '10:00' }]
    const DEFAULT_RATE = 7.1
    const DEFAULT_PLANS = {
      'deepseek-flash': {
        peak: { cacheHit: 0.006, cacheMiss: 0.3, output: 1.2 },
        offPeak: { cacheHit: 0.003, cacheMiss: 0.15, output: 0.6 },
      },
      'deepseek-v4-pro': {
        peak: { cacheHit: 0.044, cacheMiss: 1.32, output: 3.96 },
        offPeak: { cacheHit: 0.022, cacheMiss: 0.66, output: 1.98 },
      },
    }

    const DICTS = {
      en: {
        peak: 'Peak',
        offPeak: 'Off-peak',
        peakTitle: 'Peak hours — tokens are billed at the full plan price',
        offPeakTitle: 'Off-peak — the discounted plan price applies',
        switchToOffPeak: 'off-peak in',
        switchToPeak: 'peak in',
        groupPeak: 'Peak',
        groupOffPeak: 'Off-peak',
        groupPeakTitle: 'Tokens billed at the peak tariff',
        groupOffPeakTitle: 'Tokens billed at the off-peak tariff',
        cache: 'cache',
        miss: 'miss',
        output: 'output',
        cost: 'cost',
        costTitle: 'Estimated charge under the configured model prices, in USD and CNY',
        total: 'total',
        totalTitle: 'Every billed token in this Harness process, all sessions',
        since: 'since launch',
        loading: 'reading usage…',
        unavailable: 'usage unavailable',
        scopeSession: 'session',
        scopeAll: 'all',
        scopeSessionTitle: 'Billed to the open Conversation',
        scopeAllTitle: 'No Conversation is open, so every session in this process is counted',
        model: 'model',
        allModels: 'all models',
        modelTitle: 'The model this session is running; the counters and the cost belong to it',
        allModelsTitle: 'Every session in this process, each model priced by its own plan',
        settingsButton: 'Tariff settings',
        settingsTitle: 'Tariff settings',
        settingsHint: 'Prices per 1,000,000 tokens in USD, one plan per model. Peak hours are UTC; everything outside them is off-peak.',
        modelLabel: 'Model',
        savePrices: 'Save prices',
        pricesSaved: 'Prices saved.',
        autoFill: 'Autofill',
        autoFillBusy: 'Fetching…',
        autoFilled: 'Prices loaded from the DeepSeek docs — save them with “Save prices”.',
        rate: 'USD→CNY',
        windows: 'Peak hours (UTC)',
        addWindow: 'Add interval',
        removeWindow: 'Remove interval',
        noWindows: 'Set at least one peak interval.',
        scopeLabel: 'Scope',
        save: 'Save',
        cancel: 'Cancel',
        reset: 'Defaults',
        saving: 'Saving…',
        invalidNumbers: 'Every price must be a non-negative number and the rate must be above zero.',
        saveFailed: 'Could not save the settings.',
        notPersisted: 'Applied for this run only — the profile refused to store the settings.',
        language: 'Language',
        langAuto: 'Match the interface',
        errPricing: 'Every price must be a non-negative number.',
        errRate: 'The USD→CNY rate must be above zero.',
        errFetch: 'Could not load the DeepSeek price list. Check the network and try again.',
        badRequest: 'The settings request was rejected. Reload the page and try again.',
      },
      ru: {
        peak: 'Пиковый час',
        offPeak: 'Непиковый час',
        peakTitle: 'Пиковый час — токены считаются по полному тарифу плана',
        offPeakTitle: 'Непиковый час — действует скидка тарифа плана',
        switchToOffPeak: 'непиковый через',
        switchToPeak: 'пиковый через',
        groupPeak: 'Пик',
        groupOffPeak: 'Не пик',
        groupPeakTitle: 'Токены по пиковому тарифу',
        groupOffPeakTitle: 'Токены по непиковому тарифу',
        cache: 'кэш',
        miss: 'мимо',
        output: 'выход',
        cost: 'стоимость',
        costTitle: 'Оценка по настроенным тарифам моделей, в USD и CNY',
        total: 'всего',
        totalTitle: 'Все списанные токены в этом процессе Harness, по всем сессиям',
        since: 'с запуска',
        loading: 'читаю расход…',
        unavailable: 'расход недоступен',
        scopeSession: 'сессия',
        scopeAll: 'всё',
        scopeSessionTitle: 'Расход открытого диалога',
        scopeAllTitle: 'Диалог не открыт, поэтому считаются все сессии процесса',
        model: 'модель',
        allModels: 'все модели',
        modelTitle: 'Модель, на которой идёт эта сессия; счётчики и стоимость относятся к ней',
        allModelsTitle: 'Все сессии процесса, каждая модель — по своему тарифу',
        settingsButton: 'Настройки тарифа',
        settingsTitle: 'Настройки тарифа',
        settingsHint: 'Цены за 1 000 000 токенов в USD, свой план на каждую модель. Пиковые часы — UTC; всё остальное время непиковое.',
        modelLabel: 'Модель',
        savePrices: 'Записать цены',
        pricesSaved: 'Цены записаны.',
        autoFill: 'Автозаполнить',
        autoFillBusy: 'Загружаю…',
        autoFilled: 'Цены получены из документации DeepSeek — сохраните их кнопкой «Записать цены».',
        rate: 'USD→CNY',
        windows: 'Пиковые часы (UTC)',
        addWindow: 'Добавить интервал',
        removeWindow: 'Убрать интервал',
        noWindows: 'Задайте хотя бы один пиковый интервал.',
        scopeLabel: 'Счёт',
        save: 'Сохранить',
        cancel: 'Отмена',
        reset: 'По умолчанию',
        saving: 'Сохраняю…',
        invalidNumbers: 'Все цены должны быть неотрицательными числами, а курс — больше нуля.',
        saveFailed: 'Не удалось сохранить настройки.',
        notPersisted: 'Применено только на этот запуск: профиль не позволил сохранить настройки.',
        language: 'Язык',
        langAuto: 'Как в интерфейсе',
        errPricing: 'Все цены должны быть неотрицательными числами.',
        errRate: 'Курс USD→CNY должен быть больше нуля.',
        errFetch: 'Не удалось получить прайс DeepSeek. Проверьте сеть и повторите.',
        badRequest: 'Запрос настроек отклонён. Обновите страницу и попробуйте снова.',
      },
    }

    /** The language this browser stored, or `null` when nothing usable is saved. */
    function readStoredLanguage() {
      try {
        const value = window.localStorage.getItem(LANGUAGE_KEY)
        return value === 'auto' || value === 'en' || value === 'ru' ? value : null
      } catch {
        return null
      }
    }

    /** Best effort: a browser with storage disabled keeps the choice for this page only. */
    function storeLanguage(value) {
      try {
        window.localStorage.setItem(LANGUAGE_KEY, value)
      } catch {
        /* the profile copy stays the source of truth */
      }
    }

    /** Host refusals carry a stable code, so the panel answers in the language the user picked. */
    function refusalText(result, t) {
      if (result.code === 'pricing') return t('errPricing')
      if (result.code === 'rate') return t('errRate')
      if (result.code === 'windows') return t('noWindows')
      if (result.code === 'fetch') return t('errFetch')
      if (result.code === 'json') return t('badRequest')
      return typeof result.message === 'string' && result.message !== '' ? result.message : t('saveFailed')
    }

    const STYLE = `
.dts-bar{display:flex;align-items:center;gap:10px;height:26px;min-height:26px;padding:0 12px;box-sizing:border-box;
  border-top:1px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-layer-1);
  color:var(--dsw-alias-label-secondary);font-size:11px;line-height:1.2;font-variant-numeric:tabular-nums;
  white-space:nowrap;overflow:hidden}
.dts-dot{flex:0 0 auto;width:8px;height:8px;border-radius:50%}
.dts-label{display:inline-flex;align-items:baseline;gap:5px;flex:0 0 auto}
.dts-strong{color:var(--dsw-alias-label-primary);font-weight:600}
.dts-group{display:inline-flex;align-items:baseline;gap:4px}
.dts-sep{flex:0 0 auto;width:1px;height:12px;background:var(--dsw-alias-border-l1)}
.dts-spacer{flex:1 1 auto;min-width:8px}
.dts-right{display:inline-flex;align-items:baseline;gap:4px;flex:0 0 auto}
.dts-settings{position:relative;display:flex;align-items:center;gap:4px;flex:0 0 auto}
.dts-warn{color:var(--dsw-alias-state-warn-primary);cursor:help;font-size:11px;line-height:1}
.dts-icon-btn{display:inline-flex;align-items:center;justify-content:center;width:20px;height:20px;padding:0;
  border:0;border-radius:4px;background:transparent;color:var(--dsw-alias-label-secondary);cursor:pointer;
  font:inherit;line-height:1}
.dts-icon-btn:hover{background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-primary)}
.dts-icon-btn:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:1px}
.dts-model{color:var(--dsw-alias-label-secondary)}
.dts-panel{position:fixed;right:12px;bottom:34px;z-index:70;width:352px;box-sizing:border-box;padding:12px;
  border:1px solid var(--dsw-alias-border-l1);border-radius:10px;background:var(--dsw-alias-bg-overlay);
  box-shadow:0 12px 32px rgba(0,0,0,.28);color:var(--dsw-alias-label-primary);font-size:11px;line-height:1.35;
  white-space:normal;text-align:left;font-variant-numeric:normal}
.dts-panel-title{font-size:12px;font-weight:600;margin-bottom:2px}
.dts-panel-hint{color:var(--dsw-alias-label-secondary);margin-bottom:10px}
.dts-grid{display:grid;grid-template-columns:44px 1fr 1fr;gap:6px 8px;align-items:center}
.dts-col{color:var(--dsw-alias-label-secondary);text-align:center}
.dts-cell{color:var(--dsw-alias-label-secondary)}
.dts-input{width:100%;height:24px;box-sizing:border-box;padding:0 6px;border-radius:4px;
  border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-2);
  color:var(--dsw-alias-label-primary);font:inherit;font-size:11px}
.dts-input:focus{outline:1px solid var(--dsw-alias-brand-primary);outline-offset:0}
.dts-field{display:flex;align-items:center;gap:8px;margin-top:8px}
.dts-field-label{flex:0 0 76px;color:var(--dsw-alias-label-secondary)}
.dts-field-body{display:flex;align-items:center;gap:6px;flex:1 1 auto;min-width:0}
.dts-inline-btn{flex:0 0 auto;height:24px;padding:0 8px;font-size:10px}
.dts-block{margin-top:10px}
.dts-block-label{color:var(--dsw-alias-label-secondary);margin-bottom:4px}
.dts-window-list{display:flex;flex-direction:column;gap:4px;align-items:stretch}
.dts-window-row{display:flex;align-items:center;gap:6px}
.dts-time{flex:1 1 0;width:auto;min-width:0}
.dts-mini-btn{flex:0 0 auto;width:20px;height:24px;padding:0;border-radius:4px;
  border:1px solid var(--dsw-alias-border-l1);background:transparent;
  color:var(--dsw-alias-label-secondary);font:inherit;font-size:12px;line-height:1;cursor:pointer}
.dts-mini-btn:hover:not(:disabled){background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-primary)}
.dts-mini-btn:disabled{opacity:.5;cursor:default}
.dts-add{align-self:flex-start;height:22px;font-size:10px;padding:0 8px;color:var(--dsw-alias-label-secondary)}
.dts-autofill{display:flex;align-items:center;gap:8px;margin-top:8px;flex-wrap:wrap}
.dts-autofill .dts-note-inline{flex:1 1 150px;min-width:0}
.dts-note{margin-top:8px;color:var(--dsw-alias-label-secondary)}
.dts-note-inline{color:var(--dsw-alias-label-secondary)}
.dts-error{margin-top:8px;color:var(--dsw-alias-state-error-primary)}
.dts-actions{display:flex;justify-content:flex-end;gap:6px;margin-top:12px}
.dts-btn{height:24px;padding:0 10px;border-radius:4px;border:1px solid var(--dsw-alias-border-l1);
  background:transparent;color:var(--dsw-alias-label-primary);font:inherit;font-size:11px;cursor:pointer}
.dts-btn:hover{background:var(--dsw-alias-bg-layer-2)}
.dts-btn:disabled{opacity:.55;cursor:default}
.dts-btn-primary{border-color:transparent;background:var(--dsw-alias-brand-primary);color:#fff}
.dts-btn-primary:hover{background:var(--dsw-alias-brand-primary)}
@media (max-width:1240px){.dts-optional{display:none}}
`

    function minuteOfDay(text, fallback) {
      const match = typeof text === 'string' ? /^([01]\d|2[0-3]):([0-5]\d)$/.exec(text.trim()) : null
      return match === null ? fallback : Number(match[1]) * 60 + Number(match[2])
    }

    function normaliseWindows(raw) {
      const windows = []
      for (const candidate of Array.isArray(raw) ? raw : DEFAULT_PEAK_WINDOWS) {
        if (candidate === null || typeof candidate !== 'object') continue
        const from = minuteOfDay(candidate.from, -1)
        const to = minuteOfDay(candidate.to, -1)
        if (from < 0 || to < 0 || from === to) continue
        windows.push({ from, to })
      }
      if (windows.length > 0) return windows
      return DEFAULT_PEAK_WINDOWS.map(window => ({
        from: minuteOfDay(window.from, 0),
        to: minuteOfDay(window.to, 0),
      }))
    }

    /** True while the full tariff applies, i.e. now is inside one peak interval. */
    function isPeakNow(timeMs, windows) {
      const date = new Date(timeMs)
      const minute = date.getUTCHours() * 60 + date.getUTCMinutes()
      return windows.some(window => (window.from < window.to
        ? minute >= window.from && minute < window.to
        : minute >= window.from || minute < window.to))
    }

    function nextBoundary(timeMs, windows) {
      const dayStart = timeMs - (((timeMs % 86400000) + 86400000) % 86400000)
      let best = null
      for (const window of windows) {
        for (const minute of [window.from, window.to]) {
          const at = dayStart + minute * 60000
          const candidate = at > timeMs ? at : at + 86400000
          if (best === null || candidate < best) best = candidate
        }
      }
      return best
    }

    function formatTokens(value) {
      const tokens = Math.max(0, Math.round(Number.isFinite(value) ? value : 0))
      if (tokens < 1000) return String(tokens)
      if (tokens < 10000) return `${(tokens / 1000).toFixed(1)}k`
      if (tokens < 1000000) return `${Math.round(tokens / 1000)}k`
      if (tokens < 10000000) return `${(tokens / 1000000).toFixed(2)}M`
      return `${Math.round(tokens / 1000000)}M`
    }

    function formatMoney(value, symbol) {
      const amount = Math.max(0, Number.isFinite(value) ? value : 0)
      const digits = amount >= 1 ? 2 : amount >= 0.01 ? 3 : 4
      return `${symbol}${amount.toFixed(digits)}`
    }

    function formatRemaining(ms) {
      const total = Math.max(0, Math.round(ms / 60000))
      const hours = Math.floor(total / 60)
      const minutes = total % 60
      return hours > 0 ? `${hours}h ${String(minutes).padStart(2, '0')}m` : `${minutes}m`
    }

    function localClock(timeMs) {
      const date = new Date(timeMs)
      return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`
    }

    function tokensOf(bucket) {
      return bucket.cacheHit + bucket.cacheMiss + bucket.cacheWrite + bucket.output
    }

    const ZERO_BUCKET = { cacheHit: 0, cacheMiss: 0, cacheWrite: 0, output: 0 }

    function bucketOf(view, tariff) {
      const bucket = view !== null && view !== undefined && view.totals !== null && view.totals !== undefined
        ? view.totals[tariff]
        : undefined
      return bucket !== null && bucket !== undefined ? bucket : ZERO_BUCKET
    }

    function costOfBuckets(bucket, plan, tariff) {
      const price = plan[tariff]
      return (bucket.cacheHit * price.cacheHit +
        (bucket.cacheMiss + bucket.cacheWrite) * price.cacheMiss +
        bucket.output * price.output) / 1e6
    }

    function clonePlan(plan) {
      return {
        peak: { cacheHit: plan.peak.cacheHit, cacheMiss: plan.peak.cacheMiss, output: plan.peak.output },
        offPeak: { cacheHit: plan.offPeak.cacheHit, cacheMiss: plan.offPeak.cacheMiss, output: plan.offPeak.output },
      }
    }

    /** A complete plan: whatever the payload lacks comes from `base`. */
    function completePlan(base, raw) {
      const source = raw !== null && typeof raw === 'object' ? raw : {}
      const peak = source.peak !== null && typeof source.peak === 'object' ? source.peak : {}
      const offPeak = source.offPeak !== null && typeof source.offPeak === 'object' ? source.offPeak : {}
      const pick = (list, key, fallback) => (Number.isFinite(list[key]) && list[key] >= 0 ? list[key] : fallback)
      return {
        peak: {
          cacheHit: pick(peak, 'cacheHit', base.peak.cacheHit),
          cacheMiss: pick(peak, 'cacheMiss', base.peak.cacheMiss),
          output: pick(peak, 'output', base.peak.output),
        },
        offPeak: {
          cacheHit: pick(offPeak, 'cacheHit', base.offPeak.cacheHit),
          cacheMiss: pick(offPeak, 'cacheMiss', base.offPeak.cacheMiss),
          output: pick(offPeak, 'output', base.offPeak.output),
        },
      }
    }

    /**
     * Every plan the snapshot carries, always complete and always covering the known models.
     * A snapshot from an earlier Host generation carries one price list instead; it belongs
     * to the default model, which is what those prices were configured for.
     */
    function plansOf(config) {
      const source = config !== null && typeof config === 'object' ? config : {}
      const plans = {}
      for (const id of MODELS) plans[id] = clonePlan(DEFAULT_PLANS[id])

      const models = source.models !== null && typeof source.models === 'object' ? source.models : null
      if (models !== null) {
        for (const [id, raw] of Object.entries(models)) {
          const base = plans[id] !== undefined ? plans[id] : DEFAULT_PLANS[DEFAULT_MODEL]
          plans[id] = completePlan(base, raw)
        }
      } else if (source.pricing !== null && typeof source.pricing === 'object') {
        const model = typeof source.defaultModel === 'string' ? source.defaultModel : DEFAULT_MODEL
        const base = plans[model] !== undefined ? plans[model] : DEFAULT_PLANS[DEFAULT_MODEL]
        plans[model] = completePlan(base, source.pricing)
      }
      return plans
    }

    /** The plan that prices `model`, falling back the same way the Host does. */
    function planOf(plans, config, model) {
      if (typeof model === 'string' && plans[model] !== undefined) return plans[model]
      const fallback = config !== null && typeof config === 'object' && typeof config.defaultModel === 'string'
        ? config.defaultModel
        : DEFAULT_MODEL
      return plans[fallback] !== undefined ? plans[fallback] : plans[MODELS[0]]
    }

    /**
     * Both currencies for one view. The Host already priced every model by its own plan, so
     * its `cost` is authoritative; the local calculation only covers a snapshot without one.
     */
    function moneyOf(view, plans, config, rate) {
      if (view !== null && view !== undefined && view.cost !== null && typeof view.cost === 'object' &&
        Number.isFinite(view.cost.usd)) {
        const usd = view.cost.usd
        return { usd, cny: Number.isFinite(view.cost.cny) ? view.cost.cny : usd * rate }
      }
      const plan = planOf(plans, config, view !== null && view !== undefined ? view.model : undefined)
      const peak = bucketOf(view, 'peak')
      const offPeak = bucketOf(view, 'offPeak')
      const usd = costOfBuckets(peak, plan, 'peak') + costOfBuckets(offPeak, plan, 'offPeak')
      return { usd, cny: usd * rate }
    }

    function textOfPrice(value, fallback) {
      return Number.isFinite(value) ? String(value) : String(fallback)
    }

    /** The form's string-valued price row for one plan. */
    function priceRowOf(plan) {
      return {
        peakCacheHit: textOfPrice(plan.peak.cacheHit, DEFAULT_PLANS[DEFAULT_MODEL].peak.cacheHit),
        peakCacheMiss: textOfPrice(plan.peak.cacheMiss, DEFAULT_PLANS[DEFAULT_MODEL].peak.cacheMiss),
        peakOutput: textOfPrice(plan.peak.output, DEFAULT_PLANS[DEFAULT_MODEL].peak.output),
        offPeakCacheHit: textOfPrice(plan.offPeak.cacheHit, DEFAULT_PLANS[DEFAULT_MODEL].offPeak.cacheHit),
        offPeakCacheMiss: textOfPrice(plan.offPeak.cacheMiss, DEFAULT_PLANS[DEFAULT_MODEL].offPeak.cacheMiss),
        offPeakOutput: textOfPrice(plan.offPeak.output, DEFAULT_PLANS[DEFAULT_MODEL].offPeak.output),
      }
    }

    /**
     * Turns the snapshot config into the form's string-valued draft. The plan is described
     * by its peak intervals, so the form always offers two rows: the second stays empty
     * until a plan really has a second expensive window.
     */
    function draftFrom(config) {
      const source = config !== null && typeof config === 'object' ? config : {}
      const plans = plansOf(source)
      const modelIds = Object.keys(plans)
      const selected = typeof source.defaultModel === 'string' && plans[source.defaultModel] !== undefined
        ? source.defaultModel
        : modelIds[0]

      const rows = {}
      for (const [id, plan] of Object.entries(plans)) rows[id] = priceRowOf(plan)

      const windows = []
      for (const candidate of Array.isArray(source.peakWindows) ? source.peakWindows : []) {
        if (candidate === null || typeof candidate !== 'object') continue
        windows.push({
          from: typeof candidate.from === 'string' ? candidate.from : '',
          to: typeof candidate.to === 'string' ? candidate.to : '',
        })
      }
      if (windows.length === 0) {
        windows.push({ from: DEFAULT_PEAK_WINDOWS[0].from, to: DEFAULT_PEAK_WINDOWS[0].to })
      }
      while (windows.length < 2) windows.push({ from: '', to: '' })

      return {
        model: selected,
        models: rows,
        cnyPerUsd: textOfPrice(source.cnyPerUsd, DEFAULT_RATE),
        peakWindows: windows,
        scope: source.scope === 'process' ? 'process' : 'session',
        language: source.language === 'en' || source.language === 'ru' ? source.language : 'auto',
      }
    }

    /**
     * Reads and writes this package's Host half over its authenticated same-origin routes.
     * Every failure degrades to `undefined` / a thrown error the caller renders.
     */
    function createTransport() {
      return {
        async snapshot(signal, sessionId) {
          const query = typeof sessionId === 'string' && sessionId !== ''
            ? `?session=${encodeURIComponent(sessionId)}`
            : ''
          const response = await fetch(`${ROUTE}${query}`, {
            signal,
            credentials: 'same-origin',
            cache: 'no-store',
            headers: { accept: 'application/json' },
          })
          if (!response.ok) throw new Error(`token-status: HTTP ${response.status}`)
          return await response.json()
        },
        async saveSettings(settings) {
          const response = await fetch(SETTINGS_ROUTE, {
            method: 'POST',
            credentials: 'same-origin',
            cache: 'no-store',
            headers: { 'content-type': 'application/json', accept: 'application/json' },
            body: JSON.stringify(settings),
          })
          const body = await response.json().catch(() => null)
          if (body !== null && typeof body === 'object' && body.ok === true) {
            return { ok: true, persisted: body.persisted !== false }
          }
          const message = body !== null && typeof body === 'object' && typeof body.message === 'string'
            ? body.message
            : `HTTP ${response.status}`
          const code = body !== null && typeof body === 'object' && typeof body.code === 'string'
            ? body.code
            : undefined
          return { ok: false, message, code }
        },
        /** Asks the Host to load the published price list; the Host owns the network. */
        async fetchPricing(controller) {
          try {
            const response = await fetch(PRICING_ROUTE, {
              method: 'POST',
              credentials: 'same-origin',
              cache: 'no-store',
              headers: { accept: 'application/json' },
              signal: controller !== null && controller !== undefined ? controller.signal : undefined,
            })
            const body = await response.json().catch(() => null)
            if (body !== null && typeof body === 'object' && body.ok === true &&
              body.models !== null && typeof body.models === 'object') {
              return { ok: true, models: body.models, source: body.source, fetchedAt: body.fetchedAt }
            }
            const code = body !== null && typeof body === 'object' && typeof body.code === 'string'
              ? body.code
              : undefined
            const message = body !== null && typeof body === 'object' && typeof body.message === 'string'
              ? body.message
              : `HTTP ${response.status}`
            return { ok: false, code, message }
          } catch {
            return { ok: false, code: 'fetch', message: '' }
          }
        },
      }
    }

    return {
      inject: ['slots', 'locale'],
      apply(ctx) {
        ctx.effect(() => ctx.locale.register(NS, { en: DICTS.en, ru: DICTS.ru }), 'token-status: dictionaries')

        const transport = createTransport()

        /** The Harness interface language this browser is showing. */
        function appDialect() {
          try {
            const locale = ctx.locale.getLocale()
            const id = locale !== null && typeof locale === 'object' && typeof locale.id === 'string' ? locale.id : ''
            return id.toLowerCase().startsWith('ru') ? 'ru' : 'en'
          } catch {
            return 'en'
          }
        }

        /** A pinned language wins; `'auto'` follows the Harness interface language. */
        function dialectOf(language) {
          return language === 'en' || language === 'ru' ? language : appDialect()
        }

        function translator(language) {
          const pinned = language === 'en' || language === 'ru'
          const dict = DICTS[dialectOf(language)]
          let bound = null
          if (!pinned) {
            try {
              bound = ctx.locale.bind(NS)
            } catch {
              bound = null
            }
          }
          return function t(key) {
            if (bound !== null) {
              try {
                const value = bound(key)
                if (typeof value === 'string' && value !== '' && value !== key) return value
              } catch { /* fall back to the bundled dictionary */ }
            }
            return dict[key] !== undefined ? dict[key] : key
          }
        }

        function useLocaleRevision() {
          const [, setRevision] = React.useState(0)
          React.useEffect(() => {
            const unsubscribe = ctx.locale.subscribe(() => setRevision(revision => revision + 1))
            return typeof unsubscribe === 'function' ? unsubscribe : undefined
          }, [])
        }

        /**
         * The open Conversation is the retained Session whose `mainView` source count is set;
         * a root-scoped seat gets no Session binding, so this selector is its only identity.
         */
        function useMainSessionId(props) {
          const hook = props !== null && typeof props === 'object' ? props.useSessions : undefined
          if (typeof hook !== 'function') return undefined
          const selected = hook((state) => {
            if (state === null || typeof state !== 'object') return undefined
            const rows = state.byId
            if (rows === null || typeof rows !== 'object') return undefined
            for (const row of Object.values(rows)) {
              if (row === null || typeof row !== 'object') continue
              const retained = row.retainedBy
              if (retained !== null && typeof retained === 'object' && (retained.mainView || 0) > 0) {
                return typeof row.id === 'string' ? row.id : undefined
              }
            }
            return undefined
          })
          return typeof selected === 'string' && selected !== '' ? selected : undefined
        }

        function useSnapshot(sessionId, revision) {
          const [snapshot, setSnapshot] = React.useState(null)
          const [failed, setFailed] = React.useState(false)

          React.useEffect(() => {
            let alive = true
            let handle = null
            let controller = null

            const pull = async () => {
              controller = typeof AbortController === 'function' ? new AbortController() : null
              const timer = setTimeout(() => {
                if (controller !== null) controller.abort()
              }, REQUEST_TIMEOUT_MS)
              try {
                const next = controller !== null
                  ? await transport.snapshot(controller.signal, sessionId)
                  : await transport.snapshot(undefined, sessionId)
                if (!alive) return
                if (next !== null && typeof next === 'object') {
                  setSnapshot(next)
                  setFailed(false)
                } else {
                  setFailed(true)
                }
              } catch {
                if (alive) setFailed(true)
              } finally {
                clearTimeout(timer)
              }
              if (alive) handle = setTimeout(pull, POLL_MS)
            }

            pull()
            return () => {
              alive = false
              if (handle !== null) clearTimeout(handle)
              if (controller !== null) controller.abort()
            }
          }, [sessionId, revision])

          return [snapshot, failed]
        }

        function useClock() {
          const [now, setNow] = React.useState(() => Date.now())
          React.useEffect(() => {
            const timer = setInterval(() => setNow(Date.now()), TICK_MS)
            return () => clearInterval(timer)
          }, [])
          return now
        }

        function SettingsIcon() {
          return h('svg', { viewBox: '0 0 16 16', width: 14, height: 14, 'aria-hidden': true, focusable: 'false' },
            h('path', {
              d: 'M2.5 4.5h11M2.5 11.5h11',
              stroke: 'currentColor',
              strokeWidth: 1.4,
              strokeLinecap: 'round',
              fill: 'none',
            }),
            h('circle', {
              cx: 6,
              cy: 4.5,
              r: 1.9,
              fill: 'var(--dsw-alias-bg-layer-1)',
              stroke: 'currentColor',
              strokeWidth: 1.4,
            }),
            h('circle', {
              cx: 10.5,
              cy: 11.5,
              r: 1.9,
              fill: 'var(--dsw-alias-bg-layer-1)',
              stroke: 'currentColor',
              strokeWidth: 1.4,
            }))
        }

        function StatusBar(props) {
          useLocaleRevision()
          const sessionId = useMainSessionId(props)
          const [revision, setRevision] = React.useState(0)
          const [snapshot, failed] = useSnapshot(sessionId, revision)
          const now = useClock()
          // The saved language arrives with the snapshot; the last browser choice is kept so a
          // reload never flashes the wrong language before the first read completes. A fresh save
          // is held in `pendingLanguage` until the snapshot confirms it, because persisting the
          // config restarts the row and the next read may still carry the old value.
          const [localLanguage, setLocalLanguage] = React.useState(() => readStoredLanguage())
          const [pendingLanguage, setPendingLanguage] = React.useState(null)

          const [panelOpen, setPanelOpen] = React.useState(false)
          const [draft, setDraft] = React.useState(null)
          const [busy, setBusy] = React.useState(false)
          const [autofilling, setAutofilling] = React.useState(false)
          const [saveError, setSaveError] = React.useState(null)
          const [panelNote, setPanelNote] = React.useState(null)
          const [notice, setNotice] = React.useState(null)
          const rootRef = React.useRef(null)

          const config = snapshot !== null && snapshot.config !== null && typeof snapshot.config === 'object'
            ? snapshot.config
            : {}
          // The profile is the source of truth; the browser copy only bridges the first read.
          const configLanguage = config.language === 'auto' || config.language === 'en' || config.language === 'ru'
            ? config.language
            : null
          const language = pendingLanguage !== null
            ? pendingLanguage
            : (configLanguage !== null
              ? configLanguage
              : (localLanguage !== null ? localLanguage : 'auto'))
          const t = translator(language)

          React.useEffect(() => {
            if (configLanguage === null) return
            if (pendingLanguage !== null) {
              if (configLanguage === pendingLanguage) setPendingLanguage(null)
              return
            }
            if (configLanguage !== localLanguage) {
              storeLanguage(configLanguage)
              setLocalLanguage(configLanguage)
            }
          }, [pendingLanguage, configLanguage, localLanguage])

          const windows = normaliseWindows(config.peakWindows)
          const plans = plansOf(config)
          const rate = Number.isFinite(config.cnyPerUsd) ? config.cnyPerUsd : DEFAULT_RATE

          const peakNow = isPeakNow(now, windows)
          const boundary = nextBoundary(now, windows)
          const remaining = boundary !== null ? formatRemaining(boundary - now) : ''

          // The open Conversation is the interesting scope; the process total stays on the right.
          // A Host half from an earlier generation answered without `process`/`session`; read
          // its shape too, so a reloaded page never blanks while the row is still old code.
          const processView = snapshot === null
            ? null
            : (snapshot.process !== undefined && snapshot.process !== null
              ? snapshot.process
              : (snapshot.totals !== undefined && snapshot.totals !== null ? snapshot : null))
          const sessionView = snapshot !== null && snapshot.session !== undefined && snapshot.session !== null
            ? snapshot.session
            : null
          const scopedToSession = sessionView !== null
          const view = scopedToSession ? sessionView : processView

          // The model the counters belong to: the one the open session runs, or every model in
          // the process. A session that has not started a request yet falls back to the default.
          const displayModel = scopedToSession
            ? (typeof sessionView.model === 'string' && sessionView.model !== '' ? sessionView.model : null)
            : null
          const modelLabel = scopedToSession
            ? (displayModel !== null ? displayModel : t('allModels'))
            : t('allModels')
          const modelTitle = scopedToSession && displayModel !== null
            ? `${t('modelTitle')}: ${displayModel}`
            : t('allModelsTitle')

          const peak = bucketOf(view, 'peak')
          const offPeak = bucketOf(view, 'offPeak')
          const peakTokens = tokensOf(peak)
          const offPeakTokens = tokensOf(offPeak)
          const outputTokens = peak.output + offPeak.output
          const money = view !== null
            ? moneyOf(view, plans, config, rate)
            : { usd: 0, cny: 0 }
          const processTokens = processView !== null && processView.tokens !== null &&
            typeof processView.tokens === 'object' && Number.isFinite(processView.tokens.total)
            ? processView.tokens.total
            : 0

          // When several models share the view, the tooltip spells their charges out.
          const perModelEntries = view !== null && view.perModel !== null && typeof view.perModel === 'object'
            ? Object.entries(view.perModel)
            : []
          const costTitle = perModelEntries.length > 1
            ? [t('costTitle')].concat(perModelEntries.map(([id, modelView]) => {
              const modelMoney = modelView.cost !== null && typeof modelView.cost === 'object'
                ? modelView.cost
                : { usd: 0, cny: 0 }
              return `${id}: ${formatMoney(modelMoney.usd, '$')} / ${formatMoney(modelMoney.cny, '¥')}`
            })).join('\n')
            : t('costTitle')

          // Dismiss the settings panel on an outside press or Escape.
          React.useEffect(() => {
            if (!panelOpen) return undefined
            const onKey = (event) => {
              if (event.key === 'Escape') setPanelOpen(false)
            }
            const onPointer = (event) => {
              const root = rootRef.current
              if (root !== null && !root.contains(event.target)) setPanelOpen(false)
            }
            document.addEventListener('keydown', onKey)
            document.addEventListener('pointerdown', onPointer, true)
            return () => {
              document.removeEventListener('keydown', onKey)
              document.removeEventListener('pointerdown', onPointer, true)
            }
          }, [panelOpen])

          const openPanel = () => {
            if (panelOpen) {
              setPanelOpen(false)
              return
            }
            setDraft(draftFrom(config))
            setSaveError(null)
            setPanelNote(null)
            setPanelOpen(true)
          }

          const numeric = (text) => {
            const parsed = Number(String(text).trim().replace(',', '.'))
            return Number.isFinite(parsed) ? parsed : Number.NaN
          }

          /** Every model plan plus the shared constants, in the payload the Host validates. */
          const settingsOf = (current) => {
            const models = {}
            for (const [id, row] of Object.entries(current.models)) {
              models[id] = {
                peak: {
                  cacheHit: numeric(row.peakCacheHit),
                  cacheMiss: numeric(row.peakCacheMiss),
                  output: numeric(row.peakOutput),
                },
                offPeak: {
                  cacheHit: numeric(row.offPeakCacheHit),
                  cacheMiss: numeric(row.offPeakCacheMiss),
                  output: numeric(row.offPeakOutput),
                },
              }
            }
            return {
              models,
              defaultModel: current.model,
              cnyPerUsd: numeric(current.cnyPerUsd),
              peakWindows: current.peakWindows
                .filter(row => row !== null && typeof row === 'object' &&
                  typeof row.from === 'string' && row.from !== '' &&
                  typeof row.to === 'string' && row.to !== '')
                .map(row => ({ from: row.from, to: row.to })),
              scope: current.scope,
              language: current.language,
            }
          }

          /** Writes the draft through the Host; `keepOpen` is the "Save prices" behaviour. */
          const persist = async (keepOpen) => {
            if (draft === null || busy) return
            const settings = settingsOf(draft)
            const prices = Object.values(settings.models).flatMap(plan => [plan.peak, plan.offPeak])
            const invalid = prices.length === 0 || prices.some(price =>
              !Number.isFinite(price.cacheHit) || price.cacheHit < 0 ||
              !Number.isFinite(price.cacheMiss) || price.cacheMiss < 0 ||
              !Number.isFinite(price.output) || price.output < 0) ||
              !Number.isFinite(settings.cnyPerUsd) || settings.cnyPerUsd <= 0
            if (invalid) {
              setSaveError(t('invalidNumbers'))
              return
            }
            if (settings.peakWindows.length === 0) {
              setSaveError(t('noWindows'))
              return
            }

            setBusy(true)
            setSaveError(null)
            setPanelNote(null)
            try {
              const result = await transport.saveSettings(settings)
              if (!result.ok) {
                setSaveError(refusalText(result, t))
                return
              }
              // Show the chosen language at once instead of waiting for the row to restart.
              storeLanguage(draft.language)
              setLocalLanguage(draft.language)
              setPendingLanguage(draft.language)
              // Force an immediate read so the bar reprices without waiting for the next poll.
              setRevision(current => current + 1)
              if (keepOpen) {
                setPanelNote(result.persisted === false ? t('notPersisted') : t('pricesSaved'))
                return
              }
              setPanelOpen(false)
              setNotice(result.persisted === false ? t('notPersisted') : null)
            } catch {
              setSaveError(t('saveFailed'))
            } finally {
              setBusy(false)
            }
          }

          /** Loads the published price list and fills every model row of the draft. */
          const autoFill = async () => {
            if (draft === null || busy || autofilling) return
            setAutofilling(true)
            setSaveError(null)
            setPanelNote(null)
            const controller = typeof AbortController === 'function' ? new AbortController() : null
            const timer = setTimeout(() => {
              if (controller !== null) controller.abort()
            }, PRICING_TIMEOUT_MS)
            try {
              const result = await transport.fetchPricing(controller)
              if (!result.ok) {
                setSaveError(refusalText({ code: result.code, message: result.message }, t))
                return
              }
              const rows = { ...draft.models }
              for (const [id, plan] of Object.entries(result.models)) {
                const base = DEFAULT_PLANS[id] !== undefined ? DEFAULT_PLANS[id] : DEFAULT_PLANS[DEFAULT_MODEL]
                rows[id] = priceRowOf(completePlan(base, plan))
              }
              setDraft({ ...draft, models: rows })
              const at = Number.isFinite(result.fetchedAt) ? new Date(result.fetchedAt) : new Date()
              setPanelNote(`${t('autoFilled')} ${at.toLocaleString()}`)
            } catch {
              setSaveError(t('errFetch'))
            } finally {
              clearTimeout(timer)
              setAutofilling(false)
            }
          }

          const updateWindow = (index, key, value) => setDraft((current) => {
            if (current === null) return current
            return {
              ...current,
              peakWindows: current.peakWindows.map((row, at) => (at === index ? { ...row, [key]: value } : row)),
            }
          })

          const addWindow = () => setDraft((current) => {
            if (current === null || current.peakWindows.length >= 8) return current
            return { ...current, peakWindows: [...current.peakWindows, { from: '', to: '' }] }
          })

          const removeWindow = (index) => setDraft((current) => {
            if (current === null || current.peakWindows.length <= 1) return current
            return { ...current, peakWindows: current.peakWindows.filter((row, at) => at !== index) }
          })

          // The price fields always edit the plan of the model selected above them.
          const selectedModel = draft !== null ? draft.model : null
          const selectedPrices = draft !== null && selectedModel !== null && draft.models[selectedModel] !== undefined
            ? draft.models[selectedModel]
            : null

          const priceField = (key) => h('input', {
            className: 'dts-input',
            type: 'number',
            step: 'any',
            min: '0',
            value: selectedPrices !== null ? selectedPrices[key] : '',
            disabled: busy || selectedPrices === null,
            onChange: (event) => setDraft((current) => {
              if (current === null) return current
              const row = current.models[current.model]
              if (row === undefined) return current
              return {
                ...current,
                models: { ...current.models, [current.model]: { ...row, [key]: event.target.value } },
              }
            }),
          })

          const panel = panelOpen && draft !== null
            ? h('div', { className: 'dts-panel', role: 'dialog', 'aria-label': t('settingsTitle') },
              h('div', { className: 'dts-panel-title' }, t('settingsTitle')),
              h('div', { className: 'dts-panel-hint' }, t('settingsHint')),
              h('label', { className: 'dts-field' },
                h('span', { className: 'dts-field-label' }, t('language')),
                h('span', { className: 'dts-field-body' },
                  h('select', {
                    className: 'dts-input',
                    value: draft.language,
                    disabled: busy,
                    'aria-label': t('language'),
                    onChange: (event) => setDraft({ ...draft, language: event.target.value }),
                  },
                  h('option', { value: 'auto' }, t('langAuto')),
                  h('option', { value: 'en' }, 'English'),
                  h('option', { value: 'ru' }, 'Русский')))),
              // One set of price fields, switched between the models; the button beside the
              // switch writes the edited prices without closing the panel.
              h('div', { className: 'dts-field' },
                h('span', { className: 'dts-field-label' }, t('modelLabel')),
                h('span', { className: 'dts-field-body' },
                  h('select', {
                    className: 'dts-input',
                    value: draft.model,
                    disabled: busy,
                    'aria-label': t('modelLabel'),
                    onChange: (event) => {
                      setDraft({ ...draft, model: event.target.value })
                      setPanelNote(null)
                    },
                  },
                  Object.keys(draft.models).map(id => h('option', { key: id, value: id }, id))),
                  h('button', {
                    type: 'button',
                    className: 'dts-btn dts-inline-btn',
                    title: t('savePrices'),
                    disabled: busy,
                    onClick: () => persist(true),
                  }, t('savePrices')))),
              h('div', { className: 'dts-grid' },
                h('span', { className: 'dts-cell' }, ''),
                h('span', { className: 'dts-col' }, t('groupPeak')),
                h('span', { className: 'dts-col' }, t('groupOffPeak')),
                h('span', { className: 'dts-cell' }, t('cache')),
                priceField('peakCacheHit'),
                priceField('offPeakCacheHit'),
                h('span', { className: 'dts-cell' }, t('miss')),
                priceField('peakCacheMiss'),
                priceField('offPeakCacheMiss'),
                h('span', { className: 'dts-cell' }, t('output')),
                priceField('peakOutput'),
                priceField('offPeakOutput')),
              h('div', { className: 'dts-autofill' },
                h('button', {
                  type: 'button',
                  className: 'dts-btn',
                  title: t('autoFill'),
                  disabled: busy || autofilling,
                  onClick: autoFill,
                }, autofilling ? t('autoFillBusy') : t('autoFill'))),
              h('label', { className: 'dts-field' },
                h('span', { className: 'dts-field-label' }, t('rate')),
                h('span', { className: 'dts-field-body' }, h('input', {
                  className: 'dts-input',
                  type: 'number',
                  step: 'any',
                  min: '0',
                  value: draft.cnyPerUsd,
                  disabled: busy,
                  onChange: (event) => setDraft({ ...draft, cnyPerUsd: event.target.value }),
                }))),
              h('div', { className: 'dts-block' },
                h('div', { className: 'dts-block-label' }, t('windows')),
                h('div', { className: 'dts-window-list' },
                  draft.peakWindows.map((row, index) => h('div', { className: 'dts-window-row', key: `window-${index}` },
                    h('input', {
                      className: 'dts-input dts-time',
                      type: 'time',
                      value: row.from,
                      disabled: busy,
                      'aria-label': `${t('windows')} ${index + 1}`,
                      onChange: (event) => updateWindow(index, 'from', event.target.value),
                    }),
                    h('span', { className: 'dts-cell' }, '–'),
                    h('input', {
                      className: 'dts-input dts-time',
                      type: 'time',
                      value: row.to,
                      disabled: busy,
                      'aria-label': `${t('windows')} ${index + 1}`,
                      onChange: (event) => updateWindow(index, 'to', event.target.value),
                    }),
                    h('button', {
                      type: 'button',
                      className: 'dts-mini-btn',
                      title: t('removeWindow'),
                      'aria-label': t('removeWindow'),
                      disabled: busy || draft.peakWindows.length <= 1,
                      onClick: () => removeWindow(index),
                    }, '×'))),
                  h('button', {
                    type: 'button',
                    className: 'dts-btn dts-add',
                    disabled: busy || draft.peakWindows.length >= 8,
                    onClick: addWindow,
                  }, `+ ${t('addWindow')}`))),
              h('label', { className: 'dts-field' },
                h('span', { className: 'dts-field-label' }, t('scopeLabel')),
                h('span', { className: 'dts-field-body' },
                  h('select', {
                    className: 'dts-input',
                    value: draft.scope,
                    disabled: busy,
                    onChange: (event) => setDraft({ ...draft, scope: event.target.value }),
                  },
                  h('option', { value: 'session' }, t('scopeSession')),
                  h('option', { value: 'process' }, t('scopeAll'))))),
              panelNote !== null ? h('div', { className: 'dts-note' }, panelNote) : null,
              saveError !== null ? h('div', { className: 'dts-error', role: 'alert' }, saveError) : null,
              h('div', { className: 'dts-actions' },
                h('button', {
                  type: 'button',
                  className: 'dts-btn',
                  disabled: busy,
                  onClick: () => {
                    setDraft(draftFrom({}))
                    setPanelNote(null)
                  },
                }, t('reset')),
                h('button', {
                  type: 'button',
                  className: 'dts-btn',
                  disabled: busy,
                  onClick: () => setPanelOpen(false),
                }, t('cancel')),
                h('button', {
                  type: 'button',
                  className: 'dts-btn dts-btn-primary',
                  disabled: busy,
                  onClick: () => persist(false),
                }, busy ? t('saving') : t('save'))))
            : null

          const tariffName = peakNow ? t('peak') : t('offPeak')
          const tariffHint = peakNow ? t('peakTitle') : t('offPeakTitle')
          const flipLabel = peakNow ? t('switchToOffPeak') : t('switchToPeak')
          const dotTitle = `${tariffName} · ${flipLabel} ${remaining}`
          const accent = peakNow
            ? 'var(--dsw-alias-state-error-primary)'
            : 'var(--dsw-alias-state-success-primary)'

          const parts = [
            h('style', { key: 'style' }, STYLE),
            h('span', {
              key: 'dot',
              className: 'dts-dot',
              title: tariffHint,
              'aria-hidden': true,
              style: { background: accent },
            }),
            h('span', { key: 'tariff', className: 'dts-label', title: tariffHint },
              h('span', { style: { color: accent, fontWeight: 600 } }, tariffName),
              boundary !== null ? h('span', null, `${flipLabel} ${remaining} (${localClock(boundary)})`) : null),
            h('span', { key: 'sep-0', className: 'dts-sep', 'aria-hidden': true }),
          ]

          if (snapshot === null) {
            parts.push(h('span', { key: 'state' }, failed ? t('unavailable') : t('loading')))
          } else {
            parts.push(
              h('span', {
                key: 'scope',
                className: 'dts-group',
                title: scopedToSession ? t('scopeSessionTitle') : t('scopeAllTitle'),
              },
                h('span', { className: 'dts-strong' }, scopedToSession ? t('scopeSession') : t('scopeAll'))),
              h('span', { key: 'sep-scope', className: 'dts-sep', 'aria-hidden': true }),
              h('span', { key: 'model', className: 'dts-group dts-model', title: modelTitle },
                h('span', null, t('model')),
                h('span', { className: 'dts-strong' }, modelLabel)),
              h('span', { key: 'sep-model', className: 'dts-sep', 'aria-hidden': true }),
              h('span', { key: 'peak', className: 'dts-group', title: t('groupPeakTitle') },
                h('span', null, t('groupPeak')),
                h('span', { className: 'dts-strong' }, formatTokens(peakTokens)),
                h('span', null,
                  `(${t('cache')} ${formatTokens(peak.cacheHit)} / ${t('miss')} ${formatTokens(peak.cacheMiss + peak.cacheWrite)})`)),
              h('span', { key: 'sep-1', className: 'dts-sep', 'aria-hidden': true }),
              h('span', { key: 'offPeak', className: 'dts-group', title: t('groupOffPeakTitle') },
                h('span', null, t('groupOffPeak')),
                h('span', { className: 'dts-strong' }, formatTokens(offPeakTokens)),
                h('span', null,
                  `(${t('cache')} ${formatTokens(offPeak.cacheHit)} / ${t('miss')} ${formatTokens(offPeak.cacheMiss + offPeak.cacheWrite)})`)),
              h('span', { key: 'sep-2', className: 'dts-sep dts-optional', 'aria-hidden': true }),
              h('span', { key: 'output', className: 'dts-group dts-optional' },
                h('span', null, t('output')),
                h('span', { className: 'dts-strong' }, formatTokens(outputTokens))),
              h('span', { key: 'sep-3', className: 'dts-sep', 'aria-hidden': true }),
              h('span', { key: 'cost', className: 'dts-group', title: costTitle },
                h('span', null, t('cost')),
                h('span', { className: 'dts-strong' }, `${formatMoney(money.usd, '$')} / ${formatMoney(money.cny, '¥')}`)),
              h('span', { key: 'spacer', className: 'dts-spacer', 'aria-hidden': true }),
              h('span', { key: 'total', className: 'dts-right', title: t('totalTitle') },
                h('span', null, t('total')),
                h('span', { className: 'dts-strong' }, formatTokens(processTokens)),
                h('span', null, t('since'))),
            )
          }

          parts.push(h('div', { key: 'settings', className: 'dts-settings', ref: rootRef },
            notice !== null
              ? h('span', { className: 'dts-warn', title: notice, 'aria-label': notice }, '⚠')
              : null,
            h('button', {
              type: 'button',
              className: 'dts-icon-btn',
              title: t('settingsButton'),
              'aria-label': t('settingsButton'),
              'aria-haspopup': 'dialog',
              'aria-expanded': panelOpen ? 'true' : 'false',
              onClick: openPanel,
            }, h(SettingsIcon, null)),
            panel))

          return h('div', {
            className: 'dts-bar',
            role: 'status',
            'aria-label': dotTitle,
          }, ...parts)
        }

        ctx.effect(
          () => ctx.slots.inject('shell.bottom', () => ctx.slots.register({ name: 'shell.bottom' }, StatusBar)),
          'token-status: bottom status bar',
        )
      },
    }
  },
})
