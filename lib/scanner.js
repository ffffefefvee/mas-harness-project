import { mkdir, readFile, readdir, rename, stat, writeFile } from 'node:fs/promises'
import { dirname, extname, join, relative, resolve } from 'node:path'
import { scanContent, analyzerMetadata } from './analyzers.js'
import { findingFingerprint } from './fingerprint.js'
import { FindingLedger } from './ledger.js'

const DEFAULT_EXTENSIONS = new Set(['.js', '.mjs', '.cjs', '.ts', '.tsx', '.jsx', '.json', '.py', '.yml', '.yaml'])
const IGNORED_DIRECTORIES = new Set(['.git', '.roundtable', 'node_modules', 'dist', 'build', 'coverage'])

async function* walk(root, current = root) {
  const entries = await readdir(current, { withFileTypes: true })
  for (const entry of entries) {
    if (entry.isSymbolicLink()) continue
    const path = join(current, entry.name)
    if (entry.isDirectory()) {
      if (!IGNORED_DIRECTORIES.has(entry.name)) yield* walk(root, path)
    } else if (entry.isFile() && DEFAULT_EXTENSIONS.has(extname(entry.name))) {
      yield path
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

export async function scanWorkspace(options) {
  const root = resolve(options.root)
  const ledgerPath = resolve(root, options.ledgerPath)
  const previous = await readExistingLedger(ledgerPath)
  const ledger = new FindingLedger(previous)
  ledger.beginRun()
  let scannedFiles = 0
  let skippedFiles = 0

  for await (const absolutePath of walk(root)) {
    const metadata = await stat(absolutePath)
    if (metadata.size > options.maxFileBytes) {
      skippedFiles += 1
      continue
    }
    const source = await readFile(absolutePath, 'utf8')
    const path = relative(root, absolutePath).replaceAll('\\', '/')
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
  await atomicWrite(ledgerPath, result)
  return result
}
