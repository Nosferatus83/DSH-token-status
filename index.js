/**
 * Host half of the token status bar.
 *
 * It folds every committed `assistant/message` usage report into two tariff buckets per
 * session *and per model*, and serves the browser half one JSON snapshot. The browser half
 * owns rendering and the settings form; this half owns counting, the tariff decision, the
 * model a session is running, and persisting the plan constants through the profile's
 * config editor. It also lists the models this Harness can actually route to and fetches
 * the published price list for the "Autofill" button.
 */

import {
  addUsage,
  costPair,
  emptyBucket,
  hasOffPeak,
  isPeak,
  mergeBuckets,
  modelRate,
  nextBoundary,
  planFor,
  planHasPrices,
  promptTokensOf,
  resolveConfig,
  resolveLanguage,
  tokensOf,
  normalizeModelId,
} from './core.js'
import { fetchPricing } from './pricing.js'

/** Route prefix the browser half talks to. A composition-level name, so it stays stable. */
const ROUTE_PREFIX = '/token-status'
const SNAPSHOT_PATH = `${ROUTE_PREFIX}/snapshot`
const SETTINGS_PATH = `${ROUTE_PREFIX}/settings`
const MODELS_PATH = `${ROUTE_PREFIX}/models`
const PRICING_PATH = `${ROUTE_PREFIX}/pricing/refresh`

/** Keeps the step-start index bounded; a runaway session cannot grow it without limit. */
const MAX_PENDING_STEPS = 4000

/** Refuses oversized settings bodies before buffering past this many bytes. */
const MAX_BODY_BYTES = 64 * 1024

/** Plans one settings save may carry; the panel offers far fewer. */
const MAX_MODELS = 16

/** How long a model catalog answer stays usable, so opening the panel is not a network call. */
const MODEL_CATALOG_TTL_MS = 30_000

/** A provider that does not answer its model listing must not hold the settings panel. */
const MODEL_LIST_TIMEOUT_MS = 5000

/** The provider family whose published prices the Autofill button can load. */
const DEEPSEEK_PROVIDER = /deepseek/i

/**
 * Usage is billed by the tariff in force when the request started. A durable event time is
 * epoch milliseconds; anything that cannot be one falls back to the moment it is observed,
 * so a foreign clock never silently moves spend into the wrong tariff.
 */
function plausibleTime(value, fallback) {
  return Number.isFinite(value) && value > 1_000_000_000_000 && value < Date.now() + 86_400_000
    ? value
    : fallback
}

const TIME_PATTERN = /^([01]\d|2[0-3]):([0-5]\d)$/

function priceOf(value) {
  const number = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(number) && number >= 0 && number <= 1_000_000 ? number : undefined
}

function tariffOf(raw) {
  if (raw === null || typeof raw !== 'object') return undefined
  const cacheHit = priceOf(raw.cacheHit)
  const cacheMiss = priceOf(raw.cacheMiss)
  const output = priceOf(raw.output)
  if (cacheHit === undefined || cacheMiss === undefined || output === undefined) return undefined
  return { cacheHit, cacheMiss, output }
}

function windowOf(raw) {
  if (raw === null || typeof raw !== 'object') return undefined
  const from = typeof raw.from === 'string' && TIME_PATTERN.test(raw.from) ? raw.from : undefined
  const to = typeof raw.to === 'string' && TIME_PATTERN.test(raw.to) ? raw.to : undefined
  if (from === undefined || to === undefined || from === to) return undefined
  return { from, to }
}

/** Every valid interval of a submitted list; an empty answer is a real choice, not an error. */
function windowsOf(raw) {
  const windows = []
  for (const candidate of Array.isArray(raw) ? raw.slice(0, 8) : []) {
    const window = windowOf(candidate)
    if (window !== undefined) windows.push(window)
  }
  return windows
}

/**
 * The plan a settings submission carries for every model, or a refusal code. Peak intervals
 * and the rate are per model: an entry that names them keeps them, an entry that does not
 * inherits the row-level values the panel mirrors into the payload.
 */
function modelsOf(raw) {
  if (raw === null || typeof raw !== 'object') return { error: 'pricing' }
  const models = {}
  let count = 0
  for (const [rawId, rawPlan] of Object.entries(raw)) {
    if (count >= MAX_MODELS) break
    const id = normalizeModelId(rawId)
    if (id === undefined) continue
    const source = rawPlan !== null && typeof rawPlan === 'object' ? rawPlan : {}
    const peak = tariffOf(source.peak)
    const offPeak = tariffOf(source.offPeak)
    if (peak === undefined || offPeak === undefined) return { error: 'pricing' }

    const entry = { peak, offPeak }
    if (Array.isArray(source.peakWindows)) entry.peakWindows = windowsOf(source.peakWindows)
    const namesRate = source.cnyPerUsd !== undefined && source.cnyPerUsd !== null && source.cnyPerUsd !== ''
    if (namesRate) {
      const rate = priceOf(source.cnyPerUsd)
      if (rate === undefined || rate <= 0) return { error: 'rate' }
      entry.cnyPerUsd = rate
    }
    models[id] = entry
    count += 1
  }
  return count > 0 ? { models } : { error: 'pricing' }
}

/**
 * Validates one settings submission and returns the exact config to persist. Refusals carry
 * a stable `code` next to the English `message`, so the browser half can answer in the
 * language the user picked instead of echoing one baked-in language.
 */
function sanitizeSettings(raw) {
  const source = raw !== null && typeof raw === 'object' ? raw : {}

  const parsed = modelsOf(source.models)
  if (parsed.error === 'rate') {
    return { ok: false, code: 'rate', message: 'The USD→CNY rate must be a positive number.' }
  }
  if (parsed.error !== undefined) {
    return { ok: false, code: 'pricing', message: 'Every model needs peak and off-peak prices as non-negative numbers.' }
  }
  const models = parsed.models

  const topRate = priceOf(source.cnyPerUsd)
  const fallbackRate = topRate !== undefined && topRate > 0 ? topRate : undefined
  for (const entry of Object.values(models)) {
    if (entry.cnyPerUsd !== undefined) continue
    if (fallbackRate === undefined) {
      return { ok: false, code: 'rate', message: 'The USD→CNY rate must be a positive number.' }
    }
    entry.cnyPerUsd = fallbackRate
  }

  const requestedDefault = normalizeModelId(source.defaultModel)
  const defaultModel = requestedDefault !== undefined && models[requestedDefault] !== undefined
    ? requestedDefault
    : Object.keys(models)[0]

  // The row-level pair is the mirror a model without its own intervals or rate inherits.
  const mirroredWindows = Array.isArray(source.peakWindows) ? windowsOf(source.peakWindows) : []
  const defaultWindows = Array.isArray(models[defaultModel].peakWindows)
    ? models[defaultModel].peakWindows
    : mirroredWindows

  return {
    ok: true,
    config: {
      models,
      defaultModel,
      cnyPerUsd: models[defaultModel].cnyPerUsd,
      peakWindows: defaultWindows,
      scope: source.scope === 'process' ? 'process' : 'session',
      language: resolveLanguage(source.language),
    },
  }
}

/**
 * Which model an event belongs to, and whether the event *announces* the model in force or
 * merely reports usage of a model that already ran.
 *
 * `model/selection` is the model picker itself: it fires the moment a session switches model,
 * before any tokens are spent, so the bar follows the picker instead of waiting for the next
 * request. A request header repeats the selection when the step starts.
 *
 * `assistant/message` is the opposite: it reports tokens of a step that may have started before
 * the last switch, so it must never move the model in force — a late report from the previous
 * model would drag the bar back to it and leave the newly selected model showing zeros.
 */
function modelOfEvent(event, data) {
  if (event.type === 'model/selection') return { model: normalizeModelId(data.model), announced: true }
  if (event.type === 'request/header') {
    const header = data.header
    const config = header !== null && typeof header === 'object' ? header.config : undefined
    return { model: normalizeModelId(config !== null && typeof config === 'object' ? config.model : undefined), announced: true }
  }
  if (event.type === 'request/context') return { model: normalizeModelId(data.model), announced: true }
  if (event.type === 'assistant/message') {
    const message = data.message
    const source = message !== null && typeof message === 'object' ? message.source : undefined
    return { model: normalizeModelId(source !== null && typeof source === 'object' ? source.model : undefined), announced: false }
  }
  return undefined
}

/** True when the provider id or its display name marks the DeepSeek family. */
function isDeepSeekProvider(id, name) {
  return DEEPSEEK_PROVIDER.test(`${typeof id === 'string' ? id : ''} ${typeof name === 'string' ? name : ''}`)
}

/** A provider that never answers its model listing loses the race instead of the panel. */
function withTimeout(promise, ms, message) {
  return new Promise((resolve, reject) => {
    let settled = false
    const timer = setTimeout(() => {
      if (settled) return
      settled = true
      reject(new Error(message))
    }, ms)
    if (typeof timer.unref === 'function') timer.unref()
    Promise.resolve(promise).then((value) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      resolve(value)
    }, (error) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      reject(error)
    })
  })
}

export function apply(ctx, rawConfig) {
  // Mutable so a settings save that the profile refuses can still apply for this run.
  let config = resolveConfig(rawConfig)
  const startedAt = Date.now()

  /**
   * Per session: the model it is running now and one pair of tariff buckets for every model
   * that actually ran there. A model switch starts a new pair, so the bar can show the cost
   * of the model in force instead of repricing another model's tokens.
   *
   * @type {Map<string, { model: string | undefined, models: Map<string, { peak: import('./core.js').Bucket, offPeak: import('./core.js').Bucket }> }>}
   */
  const perSession = new Map()
  /** Step start times, so a usage report is billed by the tariff in force when the request started. */
  const stepStarts = new Map()
  /** Last model-catalog answer, so opening the settings panel does not repeat the network call. */
  let catalogCache = null

  const sessionKey = (sessionId, turn, step) => `${sessionId}\u0000${turn}\u0000${step}`

  function entryOf(sessionId) {
    let entry = perSession.get(sessionId)
    if (entry === undefined) {
      entry = { model: undefined, announced: false, models: new Map() }
      perSession.set(sessionId, entry)
    }
    return entry
  }

  function bucketsOf(sessionId, model) {
    const entry = entryOf(sessionId)
    let buckets = entry.models.get(model)
    if (buckets === undefined) {
      buckets = { peak: emptyBucket(), offPeak: emptyBucket() }
      entry.models.set(model, buckets)
    }
    return buckets
  }

  /** Moves the model in force; only an announcement (picker or request header) may do that. */
  function setSessionModel(sessionId, model) {
    if (model === undefined) return
    const entry = entryOf(sessionId)
    entry.model = model
    entry.announced = true
  }

  function recordUsage(sessionId, usage, timeMs, model) {
    if (usage === null || typeof usage !== 'object') return
    if (!Number.isFinite(timeMs)) return
    const entry = entryOf(sessionId)
    const modelId = model !== undefined ? model : (entry.model !== undefined ? entry.model : config.defaultModel)
    // A log written before selections and headers were recorded only has messages to go on.
    if (!entry.announced) entry.model = modelId
    // A model without peak intervals has one price for the whole day: everything is "peak".
    const tariff = isPeak(timeMs, config, modelId) ? 'peak' : 'offPeak'
    addUsage(bucketsOf(sessionId, modelId)[tariff], usage)
  }

  function foldEvent(session, event) {
    if (event === null || typeof event !== 'object') return
    const data = event.data
    if (data === null || typeof data !== 'object') return
    const sessionId = session !== null && typeof session === 'object' ? session.id : undefined
    if (typeof sessionId !== 'string') return

    const found = modelOfEvent(event, data)
    if (found !== undefined && found.announced === true) setSessionModel(sessionId, found.model)

    if (event.type === 'step/start') {
      stepStarts.set(sessionKey(sessionId, data.turn, data.step), plausibleTime(event.time, Date.now()))
      if (stepStarts.size > MAX_PENDING_STEPS) stepStarts.clear()
      return
    }
    if (event.type === 'step/end') {
      stepStarts.delete(sessionKey(sessionId, data.turn, data.step))
      return
    }
    if (event.type !== 'assistant/message') return
    const startedAtStep = stepStarts.get(sessionKey(sessionId, data.turn, data.step))
    recordUsage(sessionId, data.usage, plausibleTime(
      startedAtStep !== undefined ? startedAtStep : event.time,
      Date.now(),
    ), found !== undefined ? found.model : undefined)
  }

  // Sessions that were already live when this plugin loaded keep their recorded spend.
  const sessions = ctx.get('sessions')
  if (sessions !== undefined) {
    for (const session of sessions.list()) {
      let events = []
      try {
        events = session.ownEvents()
      } catch {
        events = []
      }
      if (!Array.isArray(events)) events = []
      for (const event of events) foldEvent(session, event)
    }
  }

  ctx.effect(
    () => ctx.on('session/event', (session, event) => foldEvent(session, event)),
    'token-status: usage fold',
  )

  ctx.effect(
    () => ctx.on('session/disposed', (session) => {
      const prefix = `${session.id}\u0000`
      for (const key of stepStarts.keys()) {
        if (key.startsWith(prefix)) stepStarts.delete(key)
      }
    }),
    'token-status: drop stale step starts',
  )

  /**
   * One model's tariff buckets, priced by that model's own plan and rate. `enabled` is false
   * when every price is zero, which is how the bar knows to show tokens without a cost.
   */
  function packBuckets(model, peak, offPeak) {
    const plan = planFor(config, model)
    return {
      model,
      totals: { peak, offPeak },
      tokens: {
        peak: tokensOf(peak),
        offPeak: tokensOf(offPeak),
        prompt: promptTokensOf(peak) + promptTokensOf(offPeak),
        output: peak.output + offPeak.output,
        total: tokensOf(peak) + tokensOf(offPeak),
      },
      cost: {
        ...costPair(peak, offPeak, plan, modelRate(config, model)),
        enabled: planHasPrices(plan),
      },
      /** False for a model without peak intervals: it has no off-peak half to show. */
      hasOffPeak: hasOffPeak(config, model),
    }
  }

  const emptyView = (model) => packBuckets(model, emptyBucket(), emptyBucket())

  /**
   * One session as the bar shows it: the counters of the model it runs now. Every model that
   * ran in the session is broken out under `perModel`, so a switch neither loses nor
   * misprices the other model's spend, and `models` lists what the breakdown holds.
   */
  function packSession(sessionId) {
    const entry = perSession.get(sessionId)
    const model = entry !== undefined && entry.model !== undefined ? entry.model : config.defaultModel
    const buckets = entry !== undefined ? entry.models.get(model) : undefined
    const base = buckets === undefined
      ? emptyView(model)
      : packBuckets(model, buckets.peak, buckets.offPeak)

    const perModel = {}
    if (entry !== undefined) {
      for (const [id, pair] of entry.models) perModel[id] = packBuckets(id, pair.peak, pair.offPeak)
    }
    return {
      ...base,
      modelKnown: buckets !== undefined,
      models: Object.keys(perModel),
      perModel,
    }
  }

  /** Every session in the process, each model priced by its own plan and then summed. */
  function packProcess() {
    const usable = new Map()
    for (const entry of perSession.values()) {
      for (const [id, pair] of entry.models) {
        let target = usable.get(id)
        if (target === undefined) {
          target = { peak: emptyBucket(), offPeak: emptyBucket() }
          usable.set(id, target)
        }
        mergeBuckets(target.peak, pair.peak)
        mergeBuckets(target.offPeak, pair.offPeak)
      }
    }

    const peak = emptyBucket()
    const offPeak = emptyBucket()
    const perModel = {}
    let usd = 0
    let cny = 0
    let priced = false
    let discounted = false
    for (const [id, pair] of usable) {
      mergeBuckets(peak, pair.peak)
      mergeBuckets(offPeak, pair.offPeak)
      const view = packBuckets(id, pair.peak, pair.offPeak)
      perModel[id] = view
      usd += view.cost.usd
      cny += view.cost.cny
      priced = priced || view.cost.enabled === true
      discounted = discounted || view.hasOffPeak === true
    }

    return {
      model: null,
      modelKnown: false,
      totals: { peak, offPeak },
      tokens: {
        peak: tokensOf(peak),
        offPeak: tokensOf(offPeak),
        prompt: promptTokensOf(peak) + promptTokensOf(offPeak),
        output: peak.output + offPeak.output,
        total: tokensOf(peak) + tokensOf(offPeak),
      },
      cost: { usd, cny, enabled: priced },
      hasOffPeak: discounted,
      models: Object.keys(perModel),
      perModel,
    }
  }

  /** The model the snapshot's tariff indicator speaks for: the session's when known. */
  function modelInForce(sessionId) {
    const entry = typeof sessionId === 'string' && sessionId !== '' ? perSession.get(sessionId) : undefined
    return entry !== undefined && entry.model !== undefined ? entry.model : config.defaultModel
  }

  function snapshot(sessionId) {
    const now = Date.now()
    const model = modelInForce(sessionId)
    const boundary = nextBoundary(now, config, model)

    return {
      version: 4,
      generatedAt: now,
      startedAt,
      scope: config.scope,
      config: {
        currency: config.currency,
        cnyPerUsd: config.cnyPerUsd,
        models: config.models,
        defaultModel: config.defaultModel,
        // A browser still running the previous client reads this pair; it prices the default model.
        pricing: planFor(config, config.defaultModel),
        peakWindows: config.peakWindows,
        language: config.language,
      },
      tariff: {
        peak: isPeak(now, config, model),
        model,
        nextChangeAt: boundary.at,
        toPeak: boundary.toPeak,
      },
      process: packProcess(),
      session: typeof sessionId === 'string' && sessionId !== '' ? packSession(sessionId) : null,
      sessions: perSession.size,
    }
  }

  /**
   * Every model this Harness can route to, grouped by provider. The settings panel needs the
   * provider too: only a DeepSeek route has a published price list to autofill. A provider
   * that fails or times out is reported beside the groups instead of hiding them.
   */
  async function modelCatalog() {
    const now = Date.now()
    if (catalogCache !== null && now - catalogCache.at < MODEL_CATALOG_TTL_MS) return catalogCache.value

    const groups = []
    const failures = []
    const llm = ctx.get('llm')
    if (llm !== undefined && typeof llm.listProviders === 'function' && typeof llm.listModels === 'function') {
      let providers = []
      try {
        providers = llm.listProviders()
      } catch {
        providers = []
      }
      const settled = await Promise.all((Array.isArray(providers) ? providers : []).map(async (provider) => {
        const id = provider !== null && typeof provider === 'object' && typeof provider.id === 'string'
          ? provider.id
          : undefined
        if (id === undefined) return undefined
        const name = typeof provider.name === 'string' && provider.name !== '' ? provider.name : id
        const deepseek = isDeepSeekProvider(id, name)
        try {
          const listed = await withTimeout(llm.listModels(id), MODEL_LIST_TIMEOUT_MS,
            `provider "${id}" did not answer its model listing in ${MODEL_LIST_TIMEOUT_MS} ms`)
          const models = (Array.isArray(listed) ? listed : [])
            .filter(model => model !== null && typeof model === 'object' &&
              typeof model.id === 'string' && model.id !== '')
            .map(model => ({
              id: model.id,
              name: typeof model.name === 'string' && model.name !== '' ? model.name : model.id,
              deepseek,
            }))
          return { id, name, deepseek, models }
        } catch (error) {
          failures.push({
            id,
            name,
            message: error !== null && typeof error === 'object' && typeof error.message === 'string'
              ? error.message.slice(0, 200)
              : 'model listing failed',
          })
          return undefined
        }
      }))
      for (const group of settled) {
        if (group !== undefined && group.models.length > 0) groups.push(group)
      }
    }

    // A model this row already prices stays selectable even when no provider advertises it.
    const known = new Set(groups.flatMap(group => group.models.map(entry => entry.id)))
    const configured = Object.keys(config.models)
      .filter(id => !known.has(id))
      .map(id => ({ id, name: id, deepseek: isDeepSeekProvider(id) }))
    if (configured.length > 0) {
      groups.push({ id: 'configured', name: null, deepseek: configured.every(entry => entry.deepseek), models: configured })
    }

    const value = {
      ok: true,
      fetchedAt: now,
      source: groups.some(group => group.id !== 'configured') ? 'catalog' : 'config',
      groups,
      failures,
    }
    catalogCache = { at: now, value }
    return value
  }

  /**
   * Persists one validated settings object as this row's config. Editing an ordinary field
   * restarts the row, which rebuilds the counters from the sessions that are still live and
   * reprices them; the browser half simply polls the new snapshot.
   */
  async function applySettings(next) {
    const editor = ctx.get('configEditor')
    const entry = ctx.fiber !== null && typeof ctx.fiber === 'object' ? ctx.fiber.entry : undefined
    if (editor !== undefined && typeof editor.edit === 'function' && entry !== undefined) {
      try {
        await editor.edit(entry, (current) => {
          const base = current !== null && typeof current === 'object' ? { ...current } : {}
          // The form owns the per-model price plans and the interval model; drop older shapes.
          delete base.pricing
          delete base.pricingCny
          delete base.offPeakWindows
          return { ...base, ...next }
        })
        return { ok: true, persisted: true }
      } catch {
        // The profile refused the write; keep the values live for this process instead.
      }
    }
    config = resolveConfig(next)
    return { ok: true, persisted: false }
  }

  /** Buffers one request body, refusing anything past `MAX_BODY_BYTES`. */
  function readBody(req) {
    return new Promise((resolve, reject) => {
      const chunks = []
      let size = 0
      req.on('data', (chunk) => {
        size += chunk.length
        if (size > MAX_BODY_BYTES) {
          reject(new Error('token-status: request body too large'))
          return
        }
        chunks.push(chunk)
      })
      req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')))
      req.on('error', (error) => reject(error))
    })
  }

  /**
   * One handler for the whole prefix. The Web carrier applies no request policy of its own,
   * so `connection.requestRejection` runs the Host/Origin fence and the browser credential
   * check for every call; without a Connection the route stays a local-only fallback.
   */
  async function handleRequest(req, res) {
    const connection = ctx.get('connection')
    const rejection = connection !== undefined && typeof connection.requestRejection === 'function'
      ? connection.requestRejection({ headers: req.headers })
      : undefined

    const send = (status, value) => {
      const body = JSON.stringify(value)
      res.writeHead(status, {
        'content-type': 'application/json; charset=utf-8',
        'cache-control': 'no-store',
        'content-length': Buffer.byteLength(body),
      })
      res.end(body)
    }

    if (rejection !== undefined) {
      send(rejection, { error: 'token-status: request refused' })
      return
    }

    let url
    try {
      url = new URL(typeof req.url === 'string' ? req.url : '/', 'http://token-status.invalid')
    } catch {
      send(400, { error: 'token-status: bad request' })
      return
    }

    if (url.pathname === SNAPSHOT_PATH) {
      if (req.method !== 'GET' && req.method !== 'HEAD') {
        send(405, { error: 'token-status: GET or HEAD only' })
        return
      }
      const body = JSON.stringify(snapshot(url.searchParams.get('session')))
      res.writeHead(200, {
        'content-type': 'application/json; charset=utf-8',
        'cache-control': 'no-store',
        'content-length': Buffer.byteLength(body),
      })
      res.end(req.method === 'HEAD' ? undefined : body)
      return
    }

    if (url.pathname === MODELS_PATH) {
      if (req.method !== 'GET' && req.method !== 'HEAD') {
        send(405, { error: 'token-status: GET or HEAD only' })
        return
      }
      if (url.searchParams.get('refresh') === '1') catalogCache = null
      const body = JSON.stringify(await modelCatalog())
      res.writeHead(200, {
        'content-type': 'application/json; charset=utf-8',
        'cache-control': 'no-store',
        'content-length': Buffer.byteLength(body),
      })
      res.end(req.method === 'HEAD' ? undefined : body)
      return
    }

    if (url.pathname === SETTINGS_PATH) {
      if (req.method !== 'POST') {
        send(405, { error: 'token-status: POST only' })
        return
      }
      let parsed
      try {
        parsed = JSON.parse(await readBody(req) || '{}')
      } catch {
        send(400, { ok: false, code: 'json', message: 'The request body must be valid JSON.' })
        return
      }
      const checked = sanitizeSettings(parsed)
      if (!checked.ok) {
        send(400, checked)
        return
      }
      const saved = await applySettings(checked.config)
      send(saved.ok ? 200 : 500, saved)
      return
    }

    if (url.pathname === PRICING_PATH) {
      if (req.method !== 'POST') {
        send(405, { error: 'token-status: POST only' })
        return
      }
      const loaded = await fetchPricing()
      if (loaded.ok === true) {
        send(200, {
          ok: true,
          source: loaded.source,
          url: loaded.url,
          fetchedAt: loaded.fetchedAt,
          models: loaded.models,
        })
      } else {
        send(502, { ok: false, code: 'fetch', message: loaded.message })
      }
      return
    }

    send(404, { error: 'token-status: not found' })
  }

  const webServer = ctx.get('webServer')
  let mounted = false

  function mountRoute(server) {
    if (mounted) return
    mounted = true
    ctx.effect(
      () => server.register({ kind: 'prefix', path: ROUTE_PREFIX, handler: handleRequest }),
      'token-status: status route',
    )
  }

  if (webServer !== undefined && typeof webServer.register === 'function') {
    mountRoute(webServer)
  } else {
    // The Web carrier may activate after this row; attach to it as soon as it exists.
    let tries = 0
    let timer = null
    const retry = () => {
      const server = ctx.get('webServer')
      if (server !== undefined && typeof server.register === 'function') {
        mountRoute(server)
        return
      }
      if (++tries >= 40) return
      timer = setTimeout(retry, 250)
    }
    timer = setTimeout(retry, 250)
    ctx.effect(() => () => {
      if (timer !== null) clearTimeout(timer)
    }, 'token-status: route retry')
  }
}
