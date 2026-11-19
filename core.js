/**
 * Pure tariff maths for the token status bar.
 *
 * Everything here is deterministic and side-effect free: the Host half folds session
 * events into raw token counters per model and per tariff, and this module decides what
 * one counter is worth under the peak or off-peak tariff of the plan published for that
 * model.
 *
 * A plan is described by the intervals in which the FULL price applies. Whatever is not
 * inside a peak interval is billed at the discounted off-peak price, so a plan with two
 * expensive windows a day is two entries here. A model without any peak interval has one
 * price for the whole day: every token is billed at the peak tariff and the off-peak half
 * of the plan is never used.
 *
 * Peak intervals and the USD→CNY rate belong to a model, not to the whole row: one model
 * can be discounted at night while another keeps a flat price, and a provider can quote its
 * own currency rate. The top level of a config still carries both as the fallback a model
 * inherits when it does not name its own.
 */

/** @typedef {{ cacheHit: number, cacheMiss: number, cacheWrite: number, output: number, calls: number }} Bucket */
/** @typedef {{ cacheHit: number, cacheMiss: number, output: number }} PriceList */
/** @typedef {{ peak: PriceList, offPeak: PriceList }} Plan */
/** @typedef {{ from: number, to: number }} MinuteWindow */
/** @typedef {{ from: string, to: string }} ClockWindow */
/** @typedef {{ peak: PriceList, offPeak: PriceList, peakWindows: ClockWindow[], cnyPerUsd: number }} ModelPlan */

/** Models DeepSeek Harness offers a price list for. */
export const MODELS = ['deepseek-flash', 'deepseek-v4-pro']

/** Price per 1,000,000 tokens, in USD, as published for each model. */
export const DEFAULT_PLANS = {
  'deepseek-flash': {
    peak: { cacheHit: 0.006, cacheMiss: 0.3, output: 1.2 },
    offPeak: { cacheHit: 0.003, cacheMiss: 0.15, output: 0.6 },
  },
  'deepseek-v4-pro': {
    peak: { cacheHit: 0.044, cacheMiss: 1.32, output: 3.96 },
    offPeak: { cacheHit: 0.022, cacheMiss: 0.66, output: 1.98 },
  },
}

/**
 * Intervals of the full tariff in UTC as `HH:MM`. DeepSeek bills peak from 01:00 to 04:00
 * and from 06:00 to 10:00 UTC and discounts the rest of the day.
 */
export const DEFAULT_PEAK_WINDOWS = [{ from: '01:00', to: '04:00' }, { from: '06:00', to: '10:00' }]

/** Fallback exchange rate used to derive the second currency. */
export const DEFAULT_RATE = 7.1

/** Plans, intervals and rates used when a config names none. */
export const DEFAULT_CONFIG = {
  currency: 'USD',
  cnyPerUsd: DEFAULT_RATE,
  /** One plan per model; a session is charged by the plan of the model that ran it. */
  models: DEFAULT_PLANS,
  /** Model assumed when the session log does not say which one ran. */
  defaultModel: 'deepseek-flash',
  peakWindows: DEFAULT_PEAK_WINDOWS,
  /** `'session'` shows the open Conversation first, `'process'` every session in the process. */
  scope: 'session',
  /** Interface language: `'auto'` follows the Harness interface, otherwise `'en'` or `'ru'`. */
  language: 'auto',
}

/** Languages the bar can be pinned to; `'auto'` follows the Harness interface language. */
export const LANGUAGES = ['auto', 'en', 'ru']

/** Longest model id a config may carry; a model name is an identifier, not a sentence. */
const MAX_MODEL_ID = 64

/** Plans one config may carry; the panel offers far fewer. */
const MAX_MODELS = 16

/** Normalizes whatever a config carries into a supported language id. */
export function resolveLanguage(raw) {
  return raw === 'en' || raw === 'ru' ? raw : 'auto'
}

/** Normalizes a model id, or returns `undefined` when it is not usable as one. */
export function normalizeModelId(raw) {
  if (typeof raw !== 'string') return undefined
  const id = raw.trim()
  return id === '' || id.length > MAX_MODEL_ID ? undefined : id
}

const TIME_PATTERN = /^([01]\d|2[0-3]):([0-5]\d)$/

/** A day of minutes; overlapping or duplicated entries are tolerated. */
const MAX_WINDOWS = 8

function numberOr(value, fallback) {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : fallback
}

function positiveOr(value, fallback) {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : fallback
}

function minuteOfDay(text, fallback) {
  const match = typeof text === 'string' ? TIME_PATTERN.exec(text.trim()) : null
  return match === null ? fallback : Number(match[1]) * 60 + Number(match[2])
}

function clockOf(minutes) {
  return `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`
}

function priceList(raw) {
  const source = raw !== null && typeof raw === 'object' ? raw : {}
  return {
    cacheHit: numberOr(source.cacheHit, -1),
    cacheMiss: numberOr(source.cacheMiss, -1),
    output: numberOr(source.output, -1),
  }
}

function completePriceList(raw) {
  const list = priceList(raw)
  return list.cacheHit < 0 || list.cacheMiss < 0 || list.output < 0 ? null : list
}

/** Fills the gaps of a partial plan from `base`, so a half-written plan still prices. */
function planWithBase(base, raw) {
  const source = raw !== null && typeof raw === 'object' ? raw : {}
  return {
    peak: {
      cacheHit: numberOr(priceList(source.peak).cacheHit, base.peak.cacheHit),
      cacheMiss: numberOr(priceList(source.peak).cacheMiss, base.peak.cacheMiss),
      output: numberOr(priceList(source.peak).output, base.peak.output),
    },
    offPeak: {
      cacheHit: numberOr(priceList(source.offPeak).cacheHit, base.offPeak.cacheHit),
      cacheMiss: numberOr(priceList(source.offPeak).cacheMiss, base.offPeak.cacheMiss),
      output: numberOr(priceList(source.offPeak).output, base.offPeak.output),
    },
  }
}

/** A plan for a model, with the loaded fallbacks used when the plan is missing entirely. */
function basePlanOf(model) {
  return DEFAULT_PLANS[model] !== undefined ? DEFAULT_PLANS[model] : DEFAULT_PLANS[MODELS[0]]
}

export function clonePlan(plan) {
  return {
    peak: { cacheHit: plan.peak.cacheHit, cacheMiss: plan.peak.cacheMiss, output: plan.peak.output },
    offPeak: { cacheHit: plan.offPeak.cacheHit, cacheMiss: plan.offPeak.cacheMiss, output: plan.offPeak.output },
  }
}

/** The plan that prices `model`; an unknown model falls back to the default one. */
export function planFor(config, model) {
  const models = config !== null && typeof config === 'object' && config.models !== null &&
    typeof config.models === 'object'
    ? config.models
    : null
  if (models !== null) {
    if (typeof model === 'string' && models[model] !== undefined) return models[model]
    if (models[config.defaultModel] !== undefined) return models[config.defaultModel]
    const first = Object.keys(models)[0]
    if (first !== undefined) return models[first]
  }
  return DEFAULT_PLANS[MODELS[0]]
}

/** True when a plan bills something: with every price at zero the bar counts tokens only. */
export function planHasPrices(plan) {
  if (plan === null || typeof plan !== 'object') return false
  for (const tariff of ['peak', 'offPeak']) {
    const list = plan[tariff]
    if (list === null || typeof list !== 'object') continue
    for (const key of ['cacheHit', 'cacheMiss', 'output']) {
      const value = list[key]
      if (typeof value === 'number' && Number.isFinite(value) && value > 0) return true
    }
  }
  return false
}

function insideWindow(minute, window) {
  return window.from < window.to
    ? minute >= window.from && minute < window.to
    : minute >= window.from || minute < window.to
}

/**
 * The complement of the discounted intervals: everything a plan charges in full.
 * Used only to read a config written before plans were described by peak windows.
 */
function complementWindows(windows) {
  if (windows.length === 0) return []
  const points = [...new Set(windows.flatMap(window => [window.from, window.to]))].sort((a, b) => a - b)
  const result = []
  for (let index = 0; index < points.length; index += 1) {
    const from = points[index]
    const next = index + 1 < points.length ? points[index + 1] : points[0] + 1440
    const span = next - from
    const middle = (from + span / 2) % 1440
    if (!windows.some(window => insideWindow(middle, window))) {
      result.push({ from, to: next % 1440 })
    }
  }
  return result
}

function parseWindows(raw) {
  const windows = []
  for (const candidate of Array.isArray(raw) ? raw.slice(0, MAX_WINDOWS) : []) {
    if (candidate === null || typeof candidate !== 'object') continue
    const from = minuteOfDay(candidate.from, -1)
    const to = minuteOfDay(candidate.to, -1)
    if (from < 0 || to < 0 || from === to) continue
    windows.push({ from, to })
  }
  return windows
}

function clockWindows(windows) {
  return windows.map(window => ({ from: clockOf(window.from), to: clockOf(window.to) }))
}

/**
 * One model's resolved plan: prices, own peak intervals and own rate. A model that does
 * not name its intervals inherits the row-level ones; an EMPTY list is a real choice and
 * means the model has no off-peak tariff at all, so the list is kept as written.
 */
function modelEntry(base, raw, fallbackWindows, fallbackRate) {
  const source = raw !== null && typeof raw === 'object' ? raw : {}
  const plan = planWithBase(base, source)
  const windows = Array.isArray(source.peakWindows) ? parseWindows(source.peakWindows) : fallbackWindows
  return {
    peak: plan.peak,
    offPeak: plan.offPeak,
    peakWindows: clockWindows(windows),
    cnyPerUsd: positiveOr(source.cnyPerUsd, fallbackRate),
  }
}

/**
 * Reads every plan a config carries. Defaults are seeded first, so the bar always offers a
 * complete plan for both shipped models even when the profile mentions only one of them.
 */
function parseModels(source, defaultModel, legacyPlan, fallbackWindows, fallbackRate) {
  const models = {}
  for (const model of MODELS) models[model] = modelEntry(DEFAULT_PLANS[model], {}, fallbackWindows, fallbackRate)

  const explicit = new Set()
  const rawModels = source.models !== null && typeof source.models === 'object' ? source.models : null
  if (rawModels !== null) {
    for (const [rawId, rawPlan] of Object.entries(rawModels).slice(0, MAX_MODELS)) {
      const id = normalizeModelId(rawId)
      if (id === undefined) continue
      models[id] = modelEntry(basePlanOf(id), rawPlan, fallbackWindows, fallbackRate)
      explicit.add(id)
    }
  }

  // A config written before plans were per model carries one price list; it belongs to the
  // model this profile runs by default, which is the one those prices were tuned for.
  if (legacyPlan !== null && !explicit.has(defaultModel)) {
    models[defaultModel] = {
      peak: legacyPlan.peak,
      offPeak: legacyPlan.offPeak,
      peakWindows: clockWindows(fallbackWindows),
      cnyPerUsd: fallbackRate,
    }
  }
  return models
}

/** Accepts whatever the Loader row carries and returns a complete, valid config. */
export function resolveConfig(raw) {
  const source = raw !== null && typeof raw === 'object' ? raw : {}
  const legacySource = source.pricing !== null && typeof source.pricing === 'object' ? source.pricing : {}

  // Read peak intervals; a config written as off-peak intervals is complemented once.
  let windows = parseWindows(source.peakWindows)
  if (windows.length === 0) {
    const legacy = parseWindows(source.offPeakWindows)
    if (legacy.length > 0) windows = complementWindows(legacy)
  }
  if (windows.length === 0) windows = parseWindows(DEFAULT_CONFIG.peakWindows)

  const cnyPerUsd = positiveOr(source.cnyPerUsd, DEFAULT_CONFIG.cnyPerUsd)

  let defaultModel = normalizeModelId(source.defaultModel)
  if (defaultModel === undefined) defaultModel = DEFAULT_CONFIG.defaultModel

  const legacyPlan = completePriceList(legacySource.peak) !== null && completePriceList(legacySource.offPeak) !== null
    ? {
      peak: completePriceList(legacySource.peak),
      offPeak: completePriceList(legacySource.offPeak),
    }
    : null

  const models = parseModels(source, defaultModel, legacyPlan, windows, cnyPerUsd)
  if (models[defaultModel] === undefined) {
    models[defaultModel] = modelEntry(basePlanOf(defaultModel), {}, windows, cnyPerUsd)
  }

  return {
    currency: typeof source.currency === 'string' && source.currency.trim() !== ''
      ? source.currency.trim().slice(0, 8)
      : DEFAULT_CONFIG.currency,
    cnyPerUsd,
    models,
    defaultModel,
    peakWindows: clockWindows(windows),
    scope: source.scope === 'process' ? 'process' : 'session',
    language: resolveLanguage(source.language),
  }
}

function utcMinuteOfDay(timeMs) {
  const date = new Date(timeMs)
  return date.getUTCHours() * 60 + date.getUTCMinutes()
}

function windowBounds(config) {
  const raw = config !== null && typeof config === 'object' && Array.isArray(config.peakWindows)
    ? config.peakWindows
    : []
  return raw.map(window => ({
    from: minuteOfDay(window.from, 0),
    to: minuteOfDay(window.to, 0),
  }))
}

/**
 * The peak intervals that apply to `model`, in minutes. A model that names its own list
 * uses it even when it is empty; anything else falls back to the row-level intervals.
 */
export function modelWindows(config, model) {
  const models = config !== null && typeof config === 'object' && config.models !== null &&
    typeof config.models === 'object'
    ? config.models
    : null
  const entry = models !== null && typeof model === 'string' ? models[model] : undefined
  if (entry !== undefined && Array.isArray(entry.peakWindows)) {
    return entry.peakWindows.map(window => ({
      from: minuteOfDay(window.from, 0),
      to: minuteOfDay(window.to, 0),
    }))
  }
  return windowBounds(config)
}

/** The USD→CNY rate that belongs to `model`, falling back to the row-level one. */
export function modelRate(config, model) {
  const models = config !== null && typeof config === 'object' && config.models !== null &&
    typeof config.models === 'object'
    ? config.models
    : null
  const entry = models !== null && typeof model === 'string' ? models[model] : undefined
  if (entry !== undefined && typeof entry.cnyPerUsd === 'number' && Number.isFinite(entry.cnyPerUsd) &&
    entry.cnyPerUsd > 0) {
    return entry.cnyPerUsd
  }
  return positiveOr(config !== null && typeof config === 'object' ? config.cnyPerUsd : undefined, DEFAULT_RATE)
}

/** True when `model` has an off-peak tariff at all, i.e. at least one peak interval. */
export function hasOffPeak(config, model) {
  return modelWindows(config, model).length > 0
}

/** True while the full tariff applies. A model with no peak intervals always bills in full. */
export function isPeak(timeMs, config, model) {
  const windows = modelWindows(config, model)
  if (windows.length === 0) return true
  const minute = utcMinuteOfDay(timeMs)
  return windows.some(window => insideWindow(minute, window))
}

/** The instant at which the tariff next flips, and which tariff it flips to. */
export function nextBoundary(timeMs, config, model) {
  const windows = modelWindows(config, model)
  const dayStart = timeMs - (((timeMs % 86400000) + 86400000) % 86400000)
  let best = null
  for (const window of windows) {
    for (const minute of [window.from, window.to]) {
      const at = dayStart + minute * 60000
      const candidate = at > timeMs ? at : at + 86400000
      if (best === null || candidate < best) best = candidate
    }
  }
  if (best === null) return { at: null, toPeak: false }
  // `toPeak` answers for the instant *after* the flip, so it is the tariff in force then.
  return { at: best, toPeak: isPeak(best + 1000, config, model) }
}

/** An empty counter bucket. */
export function emptyBucket() {
  return { cacheHit: 0, cacheMiss: 0, cacheWrite: 0, output: 0, calls: 0 }
}

/** Adds one provider usage report to `bucket`, keeping cache writes visible apart. */
export function addUsage(bucket, usage) {
  const cacheHit = numberOr(usage.cacheReadTokens, 0)
  const cacheWrite = numberOr(usage.cacheWriteTokens, 0)
  const input = numberOr(usage.inputTokens, 0)
  bucket.cacheHit += cacheHit
  bucket.cacheMiss += input
  bucket.cacheWrite += cacheWrite
  bucket.output += numberOr(usage.outputTokens, 0)
  bucket.calls += 1
  return bucket
}

/** Tokens billed in total. A cache write is billed as a missed prompt token. */
export function tokensOf(bucket) {
  return bucket.cacheHit + bucket.cacheMiss + bucket.cacheWrite + bucket.output
}

/** Prompt tokens, both cached and not. */
export function promptTokensOf(bucket) {
  return bucket.cacheHit + bucket.cacheMiss + bucket.cacheWrite
}

/** What `bucket` costs under one tariff and one plan. */
export function costOf(bucket, tariff, plan) {
  const price = plan[tariff]
  return (
    bucket.cacheHit * price.cacheHit +
    (bucket.cacheMiss + bucket.cacheWrite) * price.cacheMiss +
    bucket.output * price.output
  ) / 1e6
}

/** Sums two buckets without mutating either. */
export function mergeBuckets(into, from) {
  into.cacheHit += from.cacheHit
  into.cacheMiss += from.cacheMiss
  into.cacheWrite += from.cacheWrite
  into.output += from.output
  into.calls += from.calls
  return into
}

/** Both currencies for one pair of buckets priced by one plan. */
export function costPair(peak, offPeak, plan, cnyPerUsd) {
  const usd = costOf(peak, 'peak', plan) + costOf(offPeak, 'offPeak', plan)
  return { usd, cny: usd * cnyPerUsd }
}
