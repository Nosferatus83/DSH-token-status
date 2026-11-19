/**
 * Host half of the token status bar.
 *
 * It folds every committed `assistant/message` usage report into two tariff buckets —
 * peak and off-peak — per session, and serves the browser half one JSON snapshot. The
 * browser half owns rendering and the settings form; this half owns counting, the tariff
 * decision, and persisting the plan constants through the profile's config editor.
 */

import {
  addUsage,
  costPair,
  emptyBucket,
  isPeak,
  mergeBuckets,
  nextBoundary,
  promptTokensOf,
  resolveConfig,
  resolveLanguage,
  tokensOf,
} from './core.js'

/** Route prefix the browser half talks to. A composition-level name, so it stays stable. */
const ROUTE_PREFIX = '/token-status'
const SNAPSHOT_PATH = `${ROUTE_PREFIX}/snapshot`
const SETTINGS_PATH = `${ROUTE_PREFIX}/settings`

/** Keeps the step-start index bounded; a runaway session cannot grow it without limit. */
const MAX_PENDING_STEPS = 4000

/** Refuses oversized settings bodies before buffering past this many bytes. */
const MAX_BODY_BYTES = 64 * 1024

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

/**
 * Validates one settings submission and returns the exact config to persist. Refusals carry
 * a stable `code` next to the English `message`, so the browser half can answer in the
 * language the user picked instead of echoing one baked-in language.
 */
function sanitizeSettings(raw) {
  const source = raw !== null && typeof raw === 'object' ? raw : {}
  const pricingSource = source.pricing !== null && typeof source.pricing === 'object' ? source.pricing : {}
  const peak = tariffOf(pricingSource.peak)
  const offPeak = tariffOf(pricingSource.offPeak)
  if (peak === undefined || offPeak === undefined) {
    return { ok: false, code: 'pricing', message: 'Peak and off-peak prices must be non-negative numbers.' }
  }

  const cnyPerUsd = priceOf(source.cnyPerUsd)
  if (cnyPerUsd === undefined || cnyPerUsd <= 0) {
    return { ok: false, code: 'rate', message: 'The USD→CNY rate must be a positive number.' }
  }

  const windows = []
  for (const candidate of Array.isArray(source.peakWindows) ? source.peakWindows.slice(0, 8) : []) {
    const window = windowOf(candidate)
    if (window !== undefined) windows.push(window)
  }
  if (windows.length === 0) {
    return { ok: false, code: 'windows', message: 'At least one peak interval as HH:MM (UTC) is required.' }
  }

  return {
    ok: true,
    config: {
      pricing: { peak, offPeak },
      cnyPerUsd,
      peakWindows: windows,
      scope: source.scope === 'process' ? 'process' : 'session',
      language: resolveLanguage(source.language),
    },
  }
}

export function apply(ctx, rawConfig) {
  // Mutable so a settings save that the profile refuses can still apply for this run.
  let config = resolveConfig(rawConfig)
  const startedAt = Date.now()

  /** @type {Map<string, { peak: import('./core.js').Bucket, offPeak: import('./core.js').Bucket }>} */
  const perSession = new Map()
  /** Step start times, so a usage report is billed by the tariff in force when the request started. */
  const stepStarts = new Map()

  const sessionKey = (sessionId, turn, step) => `${sessionId}\u0000${turn}\u0000${step}`

  function bucketsOf(sessionId) {
    let entry = perSession.get(sessionId)
    if (entry === undefined) {
      entry = { peak: emptyBucket(), offPeak: emptyBucket() }
      perSession.set(sessionId, entry)
    }
    return entry
  }

  function recordUsage(sessionId, usage, timeMs) {
    if (usage === null || typeof usage !== 'object') return
    if (!Number.isFinite(timeMs)) return
    const tariff = isPeak(timeMs, config) ? 'peak' : 'offPeak'
    addUsage(bucketsOf(sessionId)[tariff], usage)
  }

  function foldEvent(session, event) {
    if (event === null || typeof event !== 'object') return
    const data = event.data
    if (data === null || typeof data !== 'object') return
    const sessionId = session !== null && typeof session === 'object' ? session.id : undefined
    if (typeof sessionId !== 'string') return

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
    ))
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

  /** One session-independent view of a pair of tariff buckets. */
  function pack(peak, offPeak) {
    return {
      totals: { peak, offPeak },
      tokens: {
        peak: tokensOf(peak),
        offPeak: tokensOf(offPeak),
        prompt: promptTokensOf(peak) + promptTokensOf(offPeak),
        output: peak.output + offPeak.output,
        total: tokensOf(peak) + tokensOf(offPeak),
      },
      cost: costPair(peak, offPeak, config),
    }
  }

  function snapshot(sessionId) {
    const now = Date.now()
    const peak = emptyBucket()
    const offPeak = emptyBucket()
    for (const entry of perSession.values()) {
      mergeBuckets(peak, entry.peak)
      mergeBuckets(offPeak, entry.offPeak)
    }

    const boundary = nextBoundary(now, config)
    const entry = typeof sessionId === 'string' && sessionId !== '' ? perSession.get(sessionId) : undefined

    return {
      version: 2,
      generatedAt: now,
      startedAt,
      scope: config.scope,
      config: {
        currency: config.currency,
        cnyPerUsd: config.cnyPerUsd,
        pricing: config.pricing,
        pricingCny: config.pricingCny,
        peakWindows: config.peakWindows,
        language: config.language,
      },
      tariff: {
        peak: isPeak(now, config),
        nextChangeAt: boundary.at,
        toPeak: boundary.toPeak,
      },
      process: pack(peak, offPeak),
      session: entry === undefined
        ? (typeof sessionId === 'string' && sessionId !== '' ? pack(emptyBucket(), emptyBucket()) : null)
        : pack(entry.peak, entry.offPeak),
      sessions: perSession.size,
    }
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
          // The form owns the currency and interval model; drop the hand-written shapes.
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
