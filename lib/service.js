import { createScanScheduler } from './schedule.js'
import { CodeHealthEngine, normalizeRequestedPath, watchRequest } from './scanner.js'

export const SERVICE_NAME = 'roundtableCodeHealth'
export const SCAN_EVENT = 'roundtable/code-health/scan'
export const SERVICE_API_VERSION = 1
// Above this many distinct pending paths a full scan is cheaper and simpler than targeting.
export const MAX_TARGETED_PATHS = 256

export class CodeHealthStoppedError extends Error {
  constructor() {
    super('roundtable code-health service stopped')
    this.name = 'CodeHealthStoppedError'
    this.code = 'ROUNDTABLE_STOPPED'
  }
}

/** Compact, model-safe summary of a scan result (no evidence text, no findings list). */
export function summarizeScan(result) {
  return {
    scanId: result.scanId,
    mode: result.mode,
    status: result.status,
    finishedAt: result.finishedAt,
    summary: { ...result.summary },
    coverage: {
      requestedFiles: result.coverage.requestedFiles,
      scannedFiles: result.coverage.scannedFiles,
      skippedFiles: result.coverage.skippedFiles,
      failedFiles: result.coverage.failedFiles.length,
      carriedFailures: result.coverage.carriedFailures.length,
    },
  }
}

/**
 * Lifecycle owner for continuous scanning of one workspace: batches watch events and explicit
 * requests into full or targeted scans, serializes them, and cancels in-flight work on dispose.
 * Framework-independent; `index.js` binds it to the Cordis lifecycle and exposes `api()`.
 */
export class CodeHealthService {
  #engine
  #options
  #scheduler
  #active = Promise.resolve()
  #controller
  #pendingFull = false
  #pendingPaths = new Set()
  #waiters = []
  #listeners = new Set()
  #latest
  #lastError
  #scans = 0
  #closed = false

  constructor(options) {
    this.#options = options
    this.#engine = new CodeHealthEngine(options)
    this.#scheduler = createScanScheduler({
      debounceMs: options.debounceMs,
      maxWaitMs: options.maxWaitMs,
      run: () => this.#drain(),
    })
  }

  get root() {
    return this.#engine.root
  }

  /** Queue the initial full scan. */
  start() {
    this.#enqueue(undefined)
    this.#scheduler.request()
  }

  /** Feed one `fs.watch` event; irrelevant events are dropped. */
  handleWatchEvent(eventType, filename) {
    if (this.#closed) return { kind: 'ignore' }
    const request = watchRequest(eventType, filename, { root: this.#engine.root, ledgerPath: this.#options.ledgerPath })
    if (request.kind === 'ignore') return request
    this.#enqueue(request.kind === 'full' ? undefined : [request.path])
    this.#scheduler.request()
    return request
  }

  /**
   * Explicitly request a scan of everything (`paths` omitted) or of root-relative paths.
   * Resolves with the result of the first scan that covers the request; rejects with
   * `CodeHealthStoppedError` if the service stops first, or with the scan error.
   *
   * Never throws synchronously: invalid arguments (non-object options, non-array `paths`,
   * absolute or escaping paths) reject with `TypeError` and queue nothing.
   *
   * `paths: []` asks for nothing new, so it is a no-op that resolves with a copy of the latest
   * result; before any scan has completed there is no result to return, so it runs a full scan
   * instead of waiting for one that may never be scheduled (e.g. with `watch: false`).
   */
  requestScan(options = {}) {
    if (this.#closed) return Promise.reject(new CodeHealthStoppedError())
    let normalized
    try {
      if (options === null || typeof options !== 'object') throw new TypeError('requestScan options must be an object')
      const { paths } = options
      if (paths !== undefined && !Array.isArray(paths)) throw new TypeError('requestScan paths must be an array of root-relative paths')
      normalized = paths === undefined ? undefined : paths.map(normalizeRequestedPath)
    } catch (error) {
      return Promise.reject(error)
    }
    if (normalized?.length === 0) {
      if (this.#latest !== undefined) return Promise.resolve(structuredClone(this.#latest))
      normalized = undefined
    }
    const promise = new Promise((resolve, reject) => this.#waiters.push({ resolve, reject }))
    this.#enqueue(normalized)
    this.#scheduler.flush()
    return promise
  }

  /** Latest completed scan result (full ledger document), or undefined before the first. */
  snapshot() {
    return this.#latest === undefined ? undefined : structuredClone(this.#latest)
  }

  status() {
    return {
      state: this.#closed ? 'stopped' : this.#controller ? 'scanning' : 'idle',
      pending: this.#pendingFull || this.#pendingPaths.size > 0,
      completedScans: this.#scans,
      lastScan: this.#latest === undefined ? undefined : summarizeScan(this.#latest),
      lastError: this.#lastError,
    }
  }

  /** Subscribe to completed scans; returns an unsubscribe function. Cleared on dispose. */
  onScan(listener) {
    if (this.#closed) return () => {}
    this.#listeners.add(listener)
    return () => this.#listeners.delete(listener)
  }

  /** Frozen public surface exposed as a Cordis service. */
  api() {
    return Object.freeze({
      version: SERVICE_API_VERSION,
      root: this.#engine.root,
      snapshot: () => this.snapshot(),
      status: () => this.status(),
      requestScan: options => this.requestScan(options),
      onScan: listener => this.onScan(listener),
    })
  }

  /** Stop: cancel the pending timer and the active scan, reject waiters, await quiescence. */
  async dispose() {
    if (this.#closed) return { cancelled: false }
    this.#closed = true
    this.#scheduler.close()
    const cancelled = this.#controller !== undefined
    this.#controller?.abort(new CodeHealthStoppedError())
    this.#rejectWaiters(this.#waiters.splice(0), new CodeHealthStoppedError())
    this.#listeners.clear()
    await this.#active
    return { cancelled }
  }

  #enqueue(paths) {
    if (paths === undefined) this.#pendingFull = true
    else for (const path of paths) this.#pendingPaths.add(path)
  }

  #drain() {
    // The chain must survive anything a batch throws, or every later scan would silently stop.
    this.#active = this.#active.then(() => this.#runBatch()).catch(error => this.#reportCallbackError(error))
  }

  /** Route an error thrown by a consumer callback to `onListenerError`, never further. */
  #reportCallbackError(error) {
    try {
      this.#options.onListenerError?.(error)
    } catch {
      // A throwing error sink has nowhere left to report to.
    }
  }

  #callback(name, value) {
    try {
      this.#options[name]?.(value)
    } catch (error) {
      this.#reportCallbackError(error)
    }
  }

  async #runBatch() {
    if (this.#closed) return
    if (!this.#pendingFull && this.#pendingPaths.size === 0) return
    const full = this.#pendingFull || this.#pendingPaths.size > MAX_TARGETED_PATHS || this.#pendingPaths.has('.')
    const paths = full ? undefined : [...this.#pendingPaths]
    const waiters = this.#waiters.splice(0)
    this.#pendingFull = false
    this.#pendingPaths.clear()
    const controller = new AbortController()
    this.#controller = controller
    let result
    try {
      result = await this.#engine.scan({ paths, signal: controller.signal })
    } catch (error) {
      if (this.#closed && controller.signal.aborted) {
        this.#rejectWaiters(waiters, new CodeHealthStoppedError())
      } else {
        this.#lastError = { message: String(error?.message ?? error), code: error?.code, at: new Date().toISOString() }
        this.#rejectWaiters(waiters, error)
        this.#callback('onError', error)
      }
      return
    } finally {
      this.#controller = undefined
    }
    // Dispose began while the ledger write was already in flight: that write may have completed
    // (the ledger on disk is valid and newer), but nothing is announced after the disposer
    // started, and callers learn that the service stopped.
    if (this.#closed || controller.signal.aborted) {
      this.#rejectWaiters(waiters, new CodeHealthStoppedError())
      return
    }
    this.#latest = result
    this.#lastError = undefined
    this.#scans += 1
    for (const waiter of waiters) waiter.resolve(result)
    // A failing result sink (e.g. `ctx.emit`) is a consumer problem, not a scan failure.
    this.#callback('onResult', result)
    for (const listener of [...this.#listeners]) {
      try {
        listener(summarizeScan(result))
      } catch (error) {
        this.#reportCallbackError(error)
      }
    }
  }

  #rejectWaiters(waiters, error) {
    for (const waiter of waiters) waiter.reject(error)
  }
}
