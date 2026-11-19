/**
 * Pure tariff maths for the token status bar.
 *
 * Everything here is deterministic and side-effect free: the Host half folds session
 * events into raw token counters, and this module decides what one counter is worth
 * under the peak or off-peak tariff of the configured plan.
 *
 * The plan is described by the intervals in which the FULL price applies. Whatever is
 * not inside a peak interval is billed at the discounted off-peak price, so a plan with
 * two expensive windows a day is two entries here.
 */

/** @typedef {{ cacheHit: number, cacheMiss: number, cacheWrite: number, output: number, calls: number }} Bucket */
/** @typedef {{ from: number, to: number }} MinuteWindow */

/** Price per 1,000,000 tokens, in `currency`. */
export const DEFAULT_CONFIG = {
  currency: 'USD',
  /** Fallback exchange rate used when a plan lists no separate CNY prices. */
  cnyPerUsd: 7.1,
  /** Plan prices. `cacheMiss` also prices prompt tokens written into the cache. */
  pricing: {
    peak: { cacheHit: 0.07, cacheMiss: 0.27, output: 1.1 },
    offPeak: { cacheHit: 0.035, cacheMiss: 0.135, output: 0.55 },
  },
  /** Optional second price list in CNY per 1,000,000 tokens, charged as published. */
  pricingCny: null,
  /**
   * Intervals of the full tariff in UTC as `HH:MM`. DeepSeek bills peak from 00:30 to
   * 16:30 UTC and discounts the rest of the day.
   */
  peakWindows: [{ from: '00:30', to: '16:30' }],
  /** `'session'` shows the open Conversation first, `'process'` every session in the process. */
  scope: 'session',
  /** Interface language: `'auto'` follows the Harness interface, otherwise `'en'` or `'ru'`. */
  language: 'auto',
}

/** Languages the bar can be pinned to; `'auto'` follows the Harness interface language. */
export const LANGUAGES = ['auto', 'en', 'ru']

/** Normalizes whatever a config carries into a supported language id. */
export function resolveLanguage(raw) {
  return raw === 'en' || raw === 'ru' ? raw : 'auto'
}

const TIME_PATTERN = /^([01]\d|2[0-3]):([0-5]\d)$/

/** A day of minutes; overlapping or duplicated entries are tolerated. */
const MAX_WINDOWS = 8

function numberOr(value, fallback) {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : fallback
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

/** Accepts whatever the Loader row carries and returns a complete, valid config. */
export function resolveConfig(raw) {
  const source = raw !== null && typeof raw === 'object' ? raw : {}
  const sourcePricing = source.pricing !== null && typeof source.pricing === 'object' ? source.pricing : {}
  const pricingCnySource = source.pricingCny !== null && typeof source.pricingCny === 'object' ? source.pricingCny : null
  const pricingCny = pricingCnySource === null ? null : {
    peak: completePriceList(pricingCnySource.peak),
    offPeak: completePriceList(pricingCnySource.offPeak),
  }

  // Read peak intervals; a config written as off-peak intervals is complemented once.
  let windows = parseWindows(source.peakWindows)
  if (windows.length === 0) {
    const legacy = parseWindows(source.offPeakWindows)
    if (legacy.length > 0) windows = complementWindows(legacy)
  }
  if (windows.length === 0) windows = parseWindows(DEFAULT_CONFIG.peakWindows)

  const usableCny = pricingCny !== null && pricingCny.peak !== null && pricingCny.offPeak !== null

  return {
    currency: typeof source.currency === 'string' && source.currency.trim() !== ''
      ? source.currency.trim().slice(0, 8)
      : DEFAULT_CONFIG.currency,
    cnyPerUsd: numberOr(source.cnyPerUsd, DEFAULT_CONFIG.cnyPerUsd),
    pricing: {
      peak: {
        cacheHit: numberOr(priceList(sourcePricing.peak).cacheHit, DEFAULT_CONFIG.pricing.peak.cacheHit),
        cacheMiss: numberOr(priceList(sourcePricing.peak).cacheMiss, DEFAULT_CONFIG.pricing.peak.cacheMiss),
        output: numberOr(priceList(sourcePricing.peak).output, DEFAULT_CONFIG.pricing.peak.output),
      },
      offPeak: {
        cacheHit: numberOr(priceList(sourcePricing.offPeak).cacheHit, DEFAULT_CONFIG.pricing.offPeak.cacheHit),
        cacheMiss: numberOr(priceList(sourcePricing.offPeak).cacheMiss, DEFAULT_CONFIG.pricing.offPeak.cacheMiss),
        output: numberOr(priceList(sourcePricing.offPeak).output, DEFAULT_CONFIG.pricing.offPeak.output),
      },
    },
    pricingCny: usableCny ? pricingCny : null,
    peakWindows: windows.map(window => ({ from: clockOf(window.from), to: clockOf(window.to) })),
    scope: source.scope === 'process' ? 'process' : 'session',
    language: resolveLanguage(source.language),
  }
}

function utcMinuteOfDay(timeMs) {
  const date = new Date(timeMs)
  return date.getUTCHours() * 60 + date.getUTCMinutes()
}

function windowBounds(config) {
  return config.peakWindows.map(window => ({
    from: minuteOfDay(window.from, 0),
    to: minuteOfDay(window.to, 0),
  }))
}

/** True while the full tariff applies. */
export function isPeak(timeMs, config) {
  const minute = utcMinuteOfDay(timeMs)
  return windowBounds(config).some(window => insideWindow(minute, window))
}

/** The instant at which the tariff next flips, and which tariff it flips to. */
export function nextBoundary(timeMs, config) {
  const dayStart = timeMs - (((timeMs % 86400000) + 86400000) % 86400000)
  let best = null
  for (const window of windowBounds(config)) {
    for (const minute of [window.from, window.to]) {
      const at = dayStart + minute * 60000
      const candidate = at > timeMs ? at : at + 86400000
      if (best === null || candidate < best) best = candidate
    }
  }
  if (best === null) return { at: null, toPeak: false }
  // `toPeak` answers for the instant *after* the flip, so it is the tariff in force then.
  return { at: best, toPeak: isPeak(best + 1000, config) }
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

/** What `bucket` costs under one tariff and one price list. */
export function costOf(bucket, tariff, pricing) {
  const price = pricing[tariff]
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

/** Both currencies for one pair of buckets. */
export function costPair(peak, offPeak, config) {
  const usd = costOf(peak, 'peak', config.pricing) + costOf(offPeak, 'offPeak', config.pricing)
  const cny = config.pricingCny !== null
    ? costOf(peak, 'peak', config.pricingCny) + costOf(offPeak, 'offPeak', config.pricingCny)
    : usd * config.cnyPerUsd
  return { usd, cny }
}
