import { randomUUID } from 'node:crypto'
import { lstat, mkdir, readFile, readdir, rename, rm, stat, writeFile } from 'node:fs/promises'
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
  // The ledger itself and its atomic-write temporaries (`<ledger>.<pid>.<uuid>.tmp`).
  return path === ledgerRelative || path.startsWith(`${ledgerRelative}.`)
}

function isIgnoredPath(path) {
  return path.split('/').some(segment => IGNORED_DIRECTORIES.has(segment))
}

/** Whether `prefix` (a root-relative POSIX path, '.' = root) covers `path`. */
function covers(prefix, path) {
  return prefix === '.' || path === prefix || path.startsWith(`${prefix}/`)
}

/** Drop targets covered by another target, so no file is scanned (and observed) twice. */
function withoutCoveredTargets(targets) {
  const kept = []
  for (const target of [...new Set(targets)].sort((a, b) => a.length - b.length || a.localeCompare(b))) {
    if (!kept.some(prefix => covers(prefix, target))) kept.push(target)
  }
  return kept
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

// A unique temporary per write: several engines in one process (HMR overlap, a parallel
// `scanWorkspace`) must never share one. A failed write or rename removes its temporary.
async function atomicWrite(path, value, io) {
  await mkdir(dirname(path), { recursive: true })
  const temporary = `${path}.${process.pid}.${randomUUID()}.tmp`
  try {
    await io.writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, 'utf8')
    await io.rename(temporary, path)
  } catch (error) {
    await rm(temporary, { force: true }).catch(() => {})
    throw error
  }
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
 * - Cancellation (`signal`) rejects with the abort reason and never starts the ledger write;
 *   an abort that arrives while the write is in progress lets that write finish.
 * - Targeted paths never traverse symbolic links or junctions (any segment), exactly like the
 *   full walk: such paths are recorded in `coverage.skipped` (`reason: 'symlink'`), not read,
 *   and their findings keep their previous state.
 * - On case-insensitive filesystems a requested path is mapped to its on-disk spelling, so
 *   `SRC/A.js` and `src/a.js` address the same findings. A deleted path cannot be mapped and is
 *   matched case-sensitively.
 */
export class CodeHealthEngine {
  #root
  #ledgerPath
  #ledgerRelative
  #maxFileBytes
  #io
  #state
  #queue = Promise.resolve()

  /** `options.io` overrides `{ stat, readFile, writeFile, rename }` for fault-injection tests only. */
  constructor(options) {
    this.#root = resolve(options.root)
    this.#ledgerPath = resolve(this.#root, options.ledgerPath)
    this.#ledgerRelative = ledgerRelativePath(this.#root, options.ledgerPath)
    this.#maxFileBytes = options.maxFileBytes
    this.#io = { stat, readFile, writeFile, rename, ...options.io }
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
      const located = []
      for (const target of targets) {
        const entry = await this.#locateTarget(target, run)
        if (entry) located.push(entry)
      }
      const unique = new Set(withoutCoveredTargets(located.map(entry => entry.path)))
      const seen = new Set()
      for (const entry of located) {
        if (!unique.has(entry.path) || seen.has(entry.path)) continue
        seen.add(entry.path)
        await this.#scanLocated(entry, run)
      }
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
    await atomicWrite(this.#ledgerPath, result, this.#io)
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

  #excluded(path) {
    return isIgnoredPath(path) || isLedgerArtifact(path, this.#ledgerRelative)
  }

  /**
   * Resolve one requested path segment by segment from the root. Returns `{ path, metadata }`
   * with the on-disk spelling for an existing entry that can be scanned, or undefined when the
   * path is excluded, deleted (then marked checked, so its findings resolve), unreadable
   * (recorded as failed), or reached through a symbolic link or junction (recorded as skipped).
   */
  async #locateTarget(path, run) {
    run.signal?.throwIfAborted()
    if (this.#excluded(path)) return undefined
    const segments = path.split('/')
    const actual = []
    let metadata
    for (let index = 0; index < segments.length; index++) {
      const parent = join(this.#root, ...actual)
      const candidate = join(parent, segments[index])
      try {
        metadata = await lstat(candidate)
      } catch (error) {
        if (error?.code === 'ENOENT' || error?.code === 'ENOTDIR') {
          run.checked.push(path) // deleted: findings under this path are resolved
          return undefined
        }
        this.#fail(run, path, error)
        return undefined
      }
      let name = segments[index]
      try {
        name = await this.#onDiskName(parent, name)
      } catch (error) {
        this.#fail(run, path, error)
        return undefined
      }
      actual.push(name)
      if (metadata.isSymbolicLink()) {
        run.skipped.push({ path: actual.join('/'), reason: 'symlink' })
        return undefined
      }
    }
    const located = actual.join('/')
    if (this.#excluded(located)) return undefined
    return { path: located, metadata }
  }

  /** Exact directory-entry name for `name` (differs only on case-insensitive filesystems). */
  async #onDiskName(parent, name) {
    const names = await readdir(parent)
    if (names.includes(name)) return name
    const lower = name.toLowerCase()
    const matches = names.filter(entry => entry.toLowerCase() === lower)
    return matches.length === 1 ? matches[0] : name
  }

  async #scanLocated({ path, metadata }, run) {
    run.signal?.throwIfAborted()
    run.checked.push(path)
    const absolutePath = join(this.#root, path)
    if (metadata.isDirectory()) await this.#walk(absolutePath, run)
    else if (metadata.isFile() && SOURCE_EXTENSIONS.has(extname(path))) await this.#scanFile(absolutePath, path, run)
    // non-source files are not scanned, exactly as in a full walk
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
