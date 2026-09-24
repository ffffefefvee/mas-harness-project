import { randomUUID } from 'node:crypto'
import { lstat, mkdir, readFile, readdir, rename, stat, writeFile } from 'node:fs/promises'
import { dirname, extname, isAbsolute, join, posix, relative, resolve } from 'node:path'
import { scanContent, analyzerMetadata } from './analyzers.js'
import { findingFingerprint } from './fingerprint.js'
import { FindingLedger } from './ledger.js'

export const LEDGER_SCHEMA_VERSION = '0.2'
export const SOURCE_EXTENSIONS = new Set(['.js', '.mjs', '.cjs', '.ts', '.tsx', '.jsx', '.json', '.py', '.yml', '.yaml'])
export const IGNORED_DIRECTORIES = new Set(['.git', '.roundtable', 'node_modules', 'dist', 'build', 'coverage'])

const toPosix = path => String(path).replaceAll('\\', '/')

/** Ledger location relative to the scanned root, in POSIX form ('' segments never match). */
export function ledgerRelativePath(root, ledgerPath) {
  return toPosix(relative(resolve(root), resolve(root, ledgerPath)))
}

function isLedgerArtifact(path, ledgerRelative) {
  // The ledger itself and its atomic-write temporaries (`<ledger>.<pid>.tmp`).
  return path === ledgerRelative || path.startsWith(`${ledgerRelative}.`)
}

function isIgnoredPath(path) {
  return path.split('/').some(segment => IGNORED_DIRECTORIES.has(segment))
}

/** Whether `prefix` (a root-relative POSIX path, '.' = root) covers `path`. */
function covers(prefix, path) {
  return prefix === '.' || path === prefix || path.startsWith(`${prefix}/`)
}

/**
 * Normalize a root-relative path requested by a watcher event or a service consumer.
 * Returns '.' for the root; throws TypeError for absolute paths or paths escaping the root.
 */
export function normalizeRequestedPath(path) {
  if (typeof path !== 'string' || path.length === 0) throw new TypeError('scan path must be a non-empty string')
  const posixPath = toPosix(path)
  if (isAbsolute(path) || /^[a-zA-Z]:/.test(posixPath) || posixPath.startsWith('/')) {
    throw new TypeError(`scan path must be relative to the workspace root: ${path}`)
  }
  const normalized = posix.normalize(posixPath).replace(/\/+$/, '') || '.'
  if (normalized === '..' || normalized.startsWith('../')) throw new TypeError(`scan path escapes the workspace root: ${path}`)
  return normalized
}

/**
 * Decide whether a filesystem watch event may change scan results.
 *
 * - Paths under ignored directories and the ledger's own artifacts never do; otherwise
 *   writing the ledger would retrigger scans (a feedback loop when `ledgerPath` is outside
 *   `.roundtable`, observed at runtime in DSH).
 * - `change` events matter only for scanned source extensions. Windows reports `change` on a
 *   directory when a scan merely reads it, which caused a self-triggered rescan.
 * - `rename` events (create, delete, move) always matter, because deleting or moving a
 *   directory can fix findings; the ledger's own directory is the exception.
 * - A missing filename (platform could not attribute the event) conservatively matters.
 */
export function isRelevantChange(eventType, filename, { root, ledgerPath }) {
  if (!filename) return true
  const path = posix.normalize(toPosix(filename))
  if (isIgnoredPath(path)) return false
  const ledgerRelative = ledgerRelativePath(root, ledgerPath)
  if (isLedgerArtifact(path, ledgerRelative)) return false
  const ledgerDirectory = posix.dirname(ledgerRelative)
  if (ledgerDirectory !== '.' && path === ledgerDirectory) return false
  if (eventType === 'change') return SOURCE_EXTENSIONS.has(posix.extname(path))
  return true
}

/**
 * Map a watch event to a scan request: `{ kind: 'ignore' }`, `{ kind: 'full' }`, or
 * `{ kind: 'path', path }`. Full scans are reserved for unattributed events and for renames
 * of extension-less paths (probable directory renames, whose children produce no events on
 * some platforms); every other relevant event rescans only its path.
 */
export function watchRequest(eventType, filename, options) {
  if (!filename) return { kind: 'full' }
  if (!isRelevantChange(eventType, filename, options)) return { kind: 'ignore' }
  let path
  try {
    path = normalizeRequestedPath(String(filename))
  } catch {
    return { kind: 'full' }
  }
  if (path === '.') return { kind: 'full' }
  if (eventType === 'rename' && posix.extname(path) === '') return { kind: 'full' }
  return { kind: 'path', path }
}

async function readExistingLedger(path) {
  try {
    const parsed = JSON.parse(await readFile(path, 'utf8'))
    return {
      findings: Array.isArray(parsed.findings) ? parsed.findings : [],
      carriedFailures: [
        ...(Array.isArray(parsed.coverage?.failedFiles) ? parsed.coverage.failedFiles : []),
        ...(Array.isArray(parsed.coverage?.carriedFailures) ? parsed.coverage.carriedFailures : []),
      ],
    }
  } catch (error) {
    if (error?.code === 'ENOENT') return { findings: [], carriedFailures: [] }
    throw error
  }
}

async function atomicWrite(path, value) {
  await mkdir(dirname(path), { recursive: true })
  const temporary = `${path}.${process.pid}.tmp`
  await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, 'utf8')
  await rename(temporary, path)
}

function uniqueByPath(failures) {
  const byPath = new Map()
  for (const failure of failures) byPath.set(failure.path, failure)
  return [...byPath.values()].sort((a, b) => a.path.localeCompare(b.path))
}

/**
 * Stateful scanner for one workspace root and ledger.
 *
 * Coverage and failure semantics (ledger schemaVersion 0.2):
 * - A per-file error (stat/read ENOENT race, EACCES, EPERM, EBUSY, ...) does not abort the
 *   scan; it is recorded in `coverage.failedFiles` as `{ path, code }` and the scan status
 *   becomes `partial`. An unreadable root aborts the scan and leaves the ledger untouched.
 * - Findings located in failed, oversize-skipped, or (for targeted scans) unrequested paths
 *   keep their previous state: an unchecked file is never reported as fixed.
 * - Failures stay visible as `coverage.carriedFailures` (status `partial`) until a later scan
 *   re-checks the path successfully; a full scan re-checks everything.
 * - Cancellation (`signal`) rejects with the abort reason and never writes the ledger.
 */
export class CodeHealthEngine {
  #root
  #ledgerPath
  #ledgerRelative
  #maxFileBytes
  #io
  #state
  #queue = Promise.resolve()

  /** `options.io` overrides `{ stat, readFile }` for fault-injection tests only. */
  constructor(options) {
    this.#root = resolve(options.root)
    this.#ledgerPath = resolve(this.#root, options.ledgerPath)
    this.#ledgerRelative = ledgerRelativePath(this.#root, options.ledgerPath)
    this.#maxFileBytes = options.maxFileBytes
    this.#io = { stat, readFile, ...options.io }
  }

  get root() {
    return this.#root
  }

  /** Scan everything (`paths` omitted) or only the given root-relative paths. Serialized. */
  scan({ paths, signal } = {}) {
    const run = this.#queue.then(() => this.#scan(paths, signal))
    this.#queue = run.catch(() => {})
    return run
  }

  async #scan(requested, signal) {
    signal?.throwIfAborted()
    const startedAt = new Date().toISOString()
    const targets = requested === undefined ? ['.'] : [...new Set(requested.map(normalizeRequestedPath))]
    const mode = targets.includes('.') ? 'full' : 'targeted'
    this.#state ??= await readExistingLedger(this.#ledgerPath)
    const ledger = new FindingLedger(this.#state.findings)
    ledger.beginRun()

    const run = {
      signal,
      ledger,
      scannedFiles: 0,
      requestedFiles: 0,
      failed: [],
      skipped: [],
      checked: [],
    }

    if (mode === 'full') {
      await this.#walk(this.#root, run, true)
      run.checked.push('.')
    } else {
      for (const target of targets) await this.#scanTarget(target, run)
    }

    const failedPaths = run.failed.map(item => item.path)
    const skippedPaths = new Set(run.skipped.map(item => item.path))
    const isResolvable = record => {
      const path = record.path
      if (typeof path !== 'string') return mode === 'full'
      if (failedPaths.some(prefix => covers(prefix, path))) return false
      if (skippedPaths.has(path)) return false
      return run.checked.some(prefix => covers(prefix, path))
    }
    const findings = ledger.finishRun({ isResolvable })
    const changes = ledger.changes()

    const recheckedOk = path => run.checked.some(prefix => covers(prefix, path)) && !failedPaths.some(prefix => covers(prefix, path))
    const carriedFailures = mode === 'full'
      ? []
      : uniqueByPath(this.#state.carriedFailures.filter(item => !recheckedOk(item.path) && !failedPaths.includes(item.path)))
    const failedFiles = uniqueByPath(run.failed)
    const status = failedFiles.length || carriedFailures.length ? 'partial' : 'complete'
    const finishedAt = new Date().toISOString()
    const result = {
      schemaVersion: LEDGER_SCHEMA_VERSION,
      scanId: randomUUID(),
      mode,
      status,
      startedAt,
      finishedAt,
      generatedAt: finishedAt,
      root: this.#root,
      ...(mode === 'targeted' ? { requestedPaths: targets } : {}),
      coverage: {
        requestedFiles: run.requestedFiles,
        scannedFiles: run.scannedFiles,
        skippedFiles: run.skipped.length,
        failedFiles,
        carriedFailures,
        skipped: run.skipped,
      },
      analyzer: analyzerMetadata,
      analyzers: [{ id: analyzerMetadata.id, version: analyzerMetadata.version, status: 'complete' }],
      summary: {
        open: findings.filter(item => item.status !== 'fixed').length,
        new: changes.new,
        worsened: changes.worsened,
        fixed: changes.fixed,
      },
      findings,
    }
    signal?.throwIfAborted()
    await atomicWrite(this.#ledgerPath, result)
    this.#state = { findings, carriedFailures: [...failedFiles, ...carriedFailures] }
    return result
  }

  #relative(absolutePath) {
    return toPosix(relative(this.#root, absolutePath)) || '.'
  }

  #fail(run, path, error) {
    if (run.signal?.aborted) throw run.signal.reason
    if (typeof error?.code !== 'string' || error.code === 'ABORT_ERR') throw error
    run.failed.push({ path, code: error.code })
  }

  async #walk(directory, run, isRoot = false) {
    run.signal?.throwIfAborted()
    let entries
    try {
      entries = await readdir(directory, { withFileTypes: true })
    } catch (error) {
      if (isRoot) throw error
      this.#fail(run, this.#relative(directory), error)
      return
    }
    for (const entry of entries) {
      if (entry.isSymbolicLink()) continue
      const absolutePath = join(directory, entry.name)
      if (entry.isDirectory()) {
        if (!IGNORED_DIRECTORIES.has(entry.name)) await this.#walk(absolutePath, run)
      } else if (entry.isFile() && SOURCE_EXTENSIONS.has(extname(entry.name))) {
        const path = this.#relative(absolutePath)
        if (!isLedgerArtifact(path, this.#ledgerRelative)) await this.#scanFile(absolutePath, path, run)
      }
    }
  }

  async #scanTarget(path, run) {
    run.signal?.throwIfAborted()
    if (isIgnoredPath(path) || isLedgerArtifact(path, this.#ledgerRelative)) return
    const absolutePath = join(this.#root, path)
    let metadata
    try {
      metadata = await lstat(absolutePath)
    } catch (error) {
      if (error?.code === 'ENOENT' || error?.code === 'ENOTDIR') {
        run.checked.push(path) // deleted: findings under this path are resolved
        return
      }
      this.#fail(run, path, error)
      return
    }
    run.checked.push(path)
    if (metadata.isDirectory()) await this.#walk(absolutePath, run)
    else if (metadata.isFile() && SOURCE_EXTENSIONS.has(extname(path))) await this.#scanFile(absolutePath, path, run)
    // symlinks and non-source files are not scanned, exactly as in a full walk
  }

  async #scanFile(absolutePath, path, run) {
    run.signal?.throwIfAborted()
    run.requestedFiles += 1
    let source
    try {
      const metadata = await this.#io.stat(absolutePath)
      if (metadata.size > this.#maxFileBytes) {
        run.skipped.push({ path, reason: 'max-file-bytes', size: metadata.size })
        return
      }
      source = await this.#io.readFile(absolutePath, { encoding: 'utf8', signal: run.signal })
    } catch (error) {
      this.#fail(run, path, error)
      return
    }
    run.scannedFiles += 1
    for (const raw of scanContent(path, source)) {
      const fingerprint = findingFingerprint(raw)
      run.ledger.observe({ ...raw, fingerprint, analyzer: analyzerMetadata })
    }
  }
}

/** One-shot full scan (compatibility API). See `CodeHealthEngine` for semantics. */
export async function scanWorkspace(options) {
  return new CodeHealthEngine(options).scan({ signal: options.signal })
}
