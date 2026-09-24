import { mkdir, readFile, readdir, rename, stat, writeFile } from 'node:fs/promises'
import { dirname, extname, join, posix, relative, resolve } from 'node:path'
import { scanContent, analyzerMetadata } from './analyzers.js'
import { findingFingerprint } from './fingerprint.js'
import { FindingLedger } from './ledger.js'

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
  if (path.split('/').some(segment => IGNORED_DIRECTORIES.has(segment))) return false
  const ledgerRelative = ledgerRelativePath(root, ledgerPath)
  if (isLedgerArtifact(path, ledgerRelative)) return false
  const ledgerDirectory = posix.dirname(ledgerRelative)
  if (ledgerDirectory !== '.' && path === ledgerDirectory) return false
  if (eventType === 'change') return SOURCE_EXTENSIONS.has(posix.extname(path))
  return true
}

async function* walk(root, current, excluded, signal) {
  signal?.throwIfAborted()
  const entries = await readdir(current, { withFileTypes: true })
  for (const entry of entries) {
    if (entry.isSymbolicLink()) continue
    const path = join(current, entry.name)
    if (entry.isDirectory()) {
      if (!IGNORED_DIRECTORIES.has(entry.name)) yield* walk(root, path, excluded, signal)
    } else if (entry.isFile() && SOURCE_EXTENSIONS.has(extname(entry.name))) {
      if (!excluded(toPosix(relative(root, path)))) yield path
    }
  }
}

async function readExistingLedger(path) {
  try {
    const parsed = JSON.parse(await readFile(path, 'utf8'))
    return Array.isArray(parsed.findings) ? parsed.findings : []
  } catch (error) {
    if (error?.code === 'ENOENT') return []
    throw error
  }
}

async function atomicWrite(path, value) {
  await mkdir(dirname(path), { recursive: true })
  const temporary = `${path}.${process.pid}.tmp`
  await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, 'utf8')
  await rename(temporary, path)
}

/**
 * Scan the workspace and atomically replace the ledger.
 *
 * `options.signal` (AbortSignal) cancels the scan between file operations; a cancelled scan
 * rejects with the abort reason and never writes the ledger, so the previous ledger survives.
 */
export async function scanWorkspace(options) {
  const { signal } = options
  signal?.throwIfAborted()
  const root = resolve(options.root)
  const ledgerPath = resolve(root, options.ledgerPath)
  const ledgerRelative = ledgerRelativePath(root, options.ledgerPath)
  const previous = await readExistingLedger(ledgerPath)
  const ledger = new FindingLedger(previous)
  ledger.beginRun()
  let scannedFiles = 0
  let skippedFiles = 0

  for await (const absolutePath of walk(root, root, path => isLedgerArtifact(path, ledgerRelative), signal)) {
    signal?.throwIfAborted()
    const metadata = await stat(absolutePath)
    if (metadata.size > options.maxFileBytes) {
      skippedFiles += 1
      continue
    }
    const source = await readFile(absolutePath, { encoding: 'utf8', signal })
    const path = toPosix(relative(root, absolutePath))
    scannedFiles += 1
    for (const raw of scanContent(path, source)) {
      const fingerprint = findingFingerprint(raw)
      ledger.observe({ ...raw, fingerprint, analyzer: analyzerMetadata })
    }
  }

  const findings = ledger.finishRun()
  const result = {
    schemaVersion: '0.1',
    generatedAt: new Date().toISOString(),
    root,
    coverage: { scannedFiles, skippedFiles },
    analyzer: analyzerMetadata,
    findings,
  }
  signal?.throwIfAborted()
  await atomicWrite(ledgerPath, result)
  return result
}
