/**
 * Price list discovery for the token status bar.
 *
 * DeepSeek publishes model prices on its documentation site only: the API reference has
 * no pricing endpoint. So the loader first probes the one `api.deepseek.com` route that
 * answers with prices behind an API key (`/pricing`) and, when that does not produce a
 * complete list, reads the documentation page itself — its Markdown twin first, then the
 * HTML table. Every parser is pure so the test harness can feed it fixtures.
 *
 * The returned shape is always the same:
 *
 *   { models: { 'deepseek-flash': { peak: {...}, offPeak: {...} }, ... } }
 */

/** Page that documents the published prices. */
export const PRICING_PAGE_URL = 'https://api-docs.deepseek.com/quick_start/pricing/'

/** The same page served as Markdown, which is far steadier to parse than the HTML shell. */
export const PRICING_MARKDOWN_URL = 'https://api-docs.deepseek.com/quick_start/pricing.md'

/**
 * Candidate JSON price endpoints, probed before the documentation page. No public pricing
 * API is documented; `/pricing` exists behind an API key and is tried with the key when the
 * environment has one. A refusal simply falls through to the page.
 */
export const PRICING_API_URLS = ['https://api.deepseek.com/pricing']

/**
 * Field labels the price tables use; a row is matched by its label, not its position. The
 * patterns are deliberately narrow, so a feature row such as `MAX OUTPUT` is not mistaken
 * for the output price row.
 */
const FIELD_LABELS = [
  { field: 'cacheHit', pattern: /cache\s*hit/i },
  { field: 'cacheMiss', pattern: /cache\s*miss/i },
  { field: 'output', pattern: /output\s*tokens/i },
]

const TARIFF_PATTERN = /^(off[\s-]*peak|peak)$/i

/** Longer than any documented response; a hung socket must not hang the settings panel. */
const DEFAULT_TIMEOUT_MS = 6000

function decodeEntities(text) {
  return text
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
}

/** Strips markup and collapses whitespace, turning `<br>` into a separator. */
function plainText(html) {
  return decodeEntities(
    String(html)
      .replace(/<br\s*\/?>/gi, ' ')
      .replace(/<[^>]*>/g, ' '),
  ).replace(/\s+/g, ' ').trim()
}

/** A published price cell such as `$0.003` or `0.15`, or `undefined`. */
function priceValue(cell) {
  const text = String(cell).replace(/[$¥,\s]/g, '')
  if (!/^\d+(\.\d+)?$/.test(text)) return undefined
  const value = Number(text)
  return Number.isFinite(value) && value >= 0 && value <= 1_000_000 ? value : undefined
}

/** `deepseek-flash(1)` → `deepseek-flash`. */
function modelIdOf(cell) {
  const id = String(cell).replace(/\([^)]*\)/g, '').replace(/[*`]/g, '').trim()
  return /^[a-z][a-z0-9._-]{1,63}$/i.test(id) && !/^model$/i.test(id) ? id : undefined
}

/** Reads the model columns out of the header row of a price table. */
function modelIdsOf(rows) {
  for (const cells of rows) {
    if (!cells.some(cell => /^model$/i.test(cell))) continue
    const ids = cells.map(modelIdOf).filter(id => id !== undefined)
    if (ids.length > 0) return ids
  }
  return []
}

/**
 * Folds table rows into complete plans. A row is priced when it carries a tariff label and
 * a known field label; the last `modelIds.length` cells are the per-model prices, which
 * keeps the parser working whether a format repeats the rowspan cells or not. HTML repeats
 * a rowspan label once, so the field label is remembered across rows of the same table.
 */
function plansFromRows(rows, modelIds) {
  const models = {}
  for (const id of modelIds) models[id] = { peak: {}, offPeak: {} }

  let field = null
  for (const cells of rows) {
    if (cells.length <= modelIds.length) continue
    const prices = cells.slice(-modelIds.length)
    const labels = cells.slice(0, -modelIds.length)
    const label = labels.join(' ')
    const match = FIELD_LABELS.find(entry => entry.pattern.test(label))
    if (match !== undefined) field = match.field
    const tariffCell = labels.find(cell => TARIFF_PATTERN.test(cell))
    if (tariffCell === undefined || field === null) continue
    const tariff = /^off/i.test(tariffCell) ? 'offPeak' : 'peak'
    for (let index = 0; index < modelIds.length; index += 1) {
      const value = priceValue(prices[index])
      if (value !== undefined) models[modelIds[index]][tariff][field] = value
    }
  }

  const complete = {}
  for (const [id, plan] of Object.entries(models)) {
    const peak = plan.peak
    const offPeak = plan.offPeak
    if (peak.cacheHit === undefined || peak.cacheMiss === undefined || peak.output === undefined) continue
    if (offPeak.cacheHit === undefined || offPeak.cacheMiss === undefined || offPeak.output === undefined) continue
    complete[id] = {
      peak: { cacheHit: peak.cacheHit, cacheMiss: peak.cacheMiss, output: peak.output },
      offPeak: { cacheHit: offPeak.cacheHit, cacheMiss: offPeak.cacheMiss, output: offPeak.output },
    }
  }
  return complete
}

/** Splits one Markdown table row into trimmed cells. */
function markdownCells(line) {
  const trimmed = line.trim().replace(/^\|/, '').replace(/\|$/, '')
  return trimmed.split('|').map(cell => cell.trim())
}

/** Reads a Markdown price table such as the one served at `pricing.md`. */
export function parseMarkdownPricing(text) {
  const lines = String(text).split('\n')
  const start = lines.findIndex(line => line.trim().startsWith('|') && /\|\s*model\s*\|/i.test(`${line}|`))
  if (start < 0) return null

  const rows = []
  for (let index = start; index < lines.length; index += 1) {
    const line = lines[index].trim()
    if (!line.startsWith('|')) break
    const cells = markdownCells(line)
    // The separator row (`|---|---|`) carries no information.
    if (cells.every(cell => /^:?-{2,}:?$/.test(cell))) continue
    rows.push(cells)
  }

  const modelIds = modelIdsOf(rows)
  if (modelIds.length === 0) return null
  const models = plansFromRows(rows, modelIds)
  return Object.keys(models).length > 0 ? { models } : null
}

/** Reads the HTML price table from the documentation page. */
export function parseHtmlPricing(text) {
  const html = String(text)
  const tables = html.match(/<table[\s\S]*?<\/table>/gi)
  if (tables === null) return null

  for (const table of tables) {
    if (!/cache\s*hit/i.test(table)) continue
    const rows = []
    for (const rowMatch of table.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)) {
      const cells = []
      for (const cellMatch of rowMatch[1].matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi)) {
        cells.push(plainText(cellMatch[1]))
      }
      if (cells.length > 0) rows.push(cells)
    }
    const modelIds = modelIdsOf(rows)
    if (modelIds.length === 0) continue
    const models = plansFromRows(rows, modelIds)
    if (Object.keys(models).length > 0) return { models }
  }
  return null
}

/** Reads a complete plan out of an unknown JSON object, if it holds one. */
function planFromJson(raw) {
  if (raw === null || typeof raw !== 'object') return null
  const peak = raw.peak !== null && typeof raw.peak === 'object' ? raw.peak : null
  const offPeak = raw.offPeak !== null && typeof raw.offPeak === 'object' ? raw.offPeak : null
  const read = (source) => {
    if (source === null) return null
    const cacheHit = priceValue(source.cacheHit ?? source.cache_hit ?? source.input_cache_hit)
    const cacheMiss = priceValue(source.cacheMiss ?? source.cache_miss ?? source.input_cache_miss)
    const output = priceValue(source.output ?? source.output_price)
    return cacheHit !== undefined && cacheMiss !== undefined && output !== undefined
      ? { cacheHit, cacheMiss, output }
      : null
  }
  const peakList = read(peak)
  const offPeakList = read(offPeak)
  return peakList !== null && offPeakList !== null ? { peak: peakList, offPeak: offPeakList } : null
}

/** Reads a JSON answer that maps model ids to plans, in either the object or list form. */
export function parseJsonPricing(data) {
  if (data === null || typeof data !== 'object') return null
  const models = {}
  const source = data.models !== null && typeof data.models === 'object' && !Array.isArray(data.models)
    ? data.models
    : data
  for (const [rawId, rawPlan] of Object.entries(source).slice(0, 16)) {
    const id = modelIdOf(rawId)
    if (id === undefined) continue
    const plan = planFromJson(rawPlan)
    if (plan !== null) models[id] = plan
  }
  if (Object.keys(models).length > 0) return { models }

  if (Array.isArray(data.data)) {
    for (const item of data.data.slice(0, 16)) {
      if (item === null || typeof item !== 'object') continue
      const id = modelIdOf(item.id ?? item.model ?? '')
      if (id === undefined) continue
      const plan = planFromJson(item.pricing ?? item.price ?? item)
      if (plan !== null) models[id] = plan
    }
  }
  return Object.keys(models).length > 0 ? { models } : null
}

function parseByContent(text) {
  const trimmed = String(text).trim()
  if (trimmed.startsWith('{')) {
    try {
      return parseJsonPricing(JSON.parse(trimmed))
    } catch {
      return null
    }
  }
  if (/<table/i.test(trimmed)) return parseHtmlPricing(trimmed)
  if (/^\s*\|/m.test(trimmed)) return parseMarkdownPricing(trimmed)
  return null
}

async function fetchText(url, accept, timeoutMs, fetchImpl) {
  const controller = typeof AbortController === 'function' ? new AbortController() : null
  const timer = controller !== null
    ? setTimeout(() => controller.abort(), timeoutMs)
    : null
  const headers = { accept, 'user-agent': 'dsh-token-status pricing loader' }
  const apiKey = typeof process === 'object' && process !== null && typeof process.env === 'object'
    ? (process.env.DEEPSEEK_API_KEY ?? process.env.DEEPSEEK_KEY)
    : undefined
  if (typeof apiKey === 'string' && apiKey !== '' && url.includes('api.deepseek.com') && !url.includes('api-docs.')) {
    headers.authorization = `Bearer ${apiKey}`
  }
  try {
    const response = await fetchImpl(url, {
      headers,
      redirect: 'follow',
      signal: controller !== null ? controller.signal : undefined,
    })
    if (response === null || typeof response !== 'object' || response.ok !== true) {
      throw new Error(`HTTP ${response !== null && typeof response === 'object' ? response.status : '?'}`)
    }
    return await response.text()
  } finally {
    if (timer !== null) clearTimeout(timer)
  }
}

/**
 * Loads the published price list: the JSON endpoint first, then the documentation page in
 * Markdown, then its HTML. The first source that yields complete plans for at least one
 * model wins; refusals are collected so the panel can explain what was tried.
 */
export async function fetchPricing(options) {
  const source = options !== null && typeof options === 'object' ? options : {}
  const fetchImpl = typeof source.fetch === 'function'
    ? source.fetch
    : (typeof globalThis === 'object' ? globalThis.fetch : undefined)
  const timeoutMs = Number.isFinite(source.timeoutMs) ? source.timeoutMs : DEFAULT_TIMEOUT_MS
  const attempts = []

  if (typeof fetchImpl !== 'function') {
    return { ok: false, code: 'fetch', attempts, message: 'This runtime offers no fetch implementation.' }
  }

  const accept = 'application/json, text/markdown;q=0.9, text/html;q=0.8, */*;q=0.5'
  const candidates = [
    ...PRICING_API_URLS.map(url => ({ url, kind: 'api' })),
    { url: PRICING_MARKDOWN_URL, kind: 'markdown' },
    { url: PRICING_PAGE_URL, kind: 'page' },
  ]

  for (const candidate of candidates) {
    try {
      const text = await fetchText(candidate.url, accept, timeoutMs, fetchImpl)
      // The JSON endpoint must answer with JSON; an HTML shell there is not a price list.
      const parsed = candidate.kind === 'api'
        ? parseJsonPricing(JSON.parse(text))
        : candidate.kind === 'markdown'
          ? (parseMarkdownPricing(text) ?? parseHtmlPricing(text))
          : parseByContent(text)
      if (parsed === null || Object.keys(parsed.models).length === 0) {
        attempts.push(`${candidate.url}: no complete price list`)
        continue
      }
      return {
        ok: true,
        source: candidate.kind,
        url: candidate.url,
        fetchedAt: Date.now(),
        models: parsed.models,
      }
    } catch (error) {
      attempts.push(`${candidate.url}: ${error !== null && typeof error === 'object' && typeof error.message === 'string' ? error.message : 'request failed'}`)
    }
  }

  return {
    ok: false,
    code: 'fetch',
    attempts,
    message: 'DeepSeek documents no pricing API, and the documentation page could not be read either.',
  }
}
