import assert from 'node:assert/strict'
import { mkdtemp, mkdir, readFile, rename, rm, stat, writeFile, readFile as fsReadFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { createLocator, scanContent } from '../lib/analyzers.js'
import { CodeHealthEngine, normalizeRequestedPath, watchRequest } from '../lib/scanner.js'
import { CodeHealthService, CodeHealthStoppedError, summarizeScan } from '../lib/service.js'

const EMPTY_CATCH = 'try { a() } catch (e) {}\n'
const STUB = "throw new Error('Not implemented')\n"

async function workspace(t, files = { 'src/a.js': EMPTY_CATCH, 'src/b.js': STUB, 'src/clean.js': 'export const ok = 1\n' }) {
  const root = await mkdtemp(join(tmpdir(), 'rt-stage0-'))
  t.after(() => rm(root, { recursive: true, force: true }))
  for (const [path, content] of Object.entries(files)) {
    await mkdir(join(root, path, '..'), { recursive: true })
    await writeFile(join(root, path), content)
  }
  return root
}

const engineFor = (root, extra = {}) => new CodeHealthEngine({ root, ledgerPath: '.roundtable/findings.json', maxFileBytes: 1_000_000, ...extra })
const byPath = (result, path) => result.findings.filter(item => item.path === path)
const failing = (predicate, code) => ({
  stat,
  readFile: async (path, options) => {
    if (predicate(String(path).replaceAll('\\', '/'))) throw Object.assign(new Error(`${code} injected`), { code })
    return fsReadFile(path, options)
  },
})

// ---------------------------------------------------------------- locations

test('locator reports the same line and column as a naive prefix split', () => {
  const source = 'a\n\nbc\r\ndef\nlast'
  const locate = createLocator(source)
  for (let offset = 0; offset < source.length; offset++) {
    const lines = source.slice(0, offset).split('\n')
    assert.deepEqual(locate(offset), { line: lines.length, column: lines.at(-1).length + 1 }, `offset ${offset}`)
  }
})

test('location lookup stays linear for thousands of matches', () => {
  const source = EMPTY_CATCH.repeat(8000) + 'export const x = 1\n'.repeat(16000)
  const started = performance.now()
  const findings = scanContent('big.js', source)
  const elapsed = performance.now() - started
  assert.equal(findings.length, 8000)
  assert.deepEqual([findings.at(-1).line, findings.at(-1).column], [8000, 13])
  assert.ok(elapsed < 300, `8000 matches in 1.4 MB took ${Math.round(elapsed)} ms (quadratic lookup took ~700 ms)`)
})

// ---------------------------------------------------------------- coverage and failures

test('full scan reports complete status and schema-aligned run fields', async t => {
  const result = await engineFor(await workspace(t)).scan()
  assert.equal(result.schemaVersion, '0.2')
  assert.equal(result.status, 'complete')
  assert.equal(result.mode, 'full')
  assert.match(result.scanId, /^[0-9a-f-]{36}$/)
  assert.deepEqual(result.coverage.failedFiles, [])
  assert.equal(result.coverage.requestedFiles, 3)
  assert.equal(result.coverage.scannedFiles, 3)
  assert.deepEqual(result.summary, { open: 2, new: 2, worsened: 0, fixed: 0 })
  assert.deepEqual(result.analyzers.map(item => item.status), ['complete'])
})

test('unreadable file makes the scan partial and keeps its findings open', async t => {
  const root = await workspace(t)
  const first = await engineFor(root).scan()
  const before = byPath(first, 'src/a.js')
  assert.equal(before.length, 1)

  const engine = engineFor(root, { io: failing(path => path.endsWith('src/a.js'), 'EACCES') })
  const second = await engine.scan()
  assert.equal(second.status, 'partial')
  assert.deepEqual(second.coverage.failedFiles, [{ path: 'src/a.js', code: 'EACCES' }])
  assert.equal(second.coverage.scannedFiles, 2)
  const after = byPath(second, 'src/a.js')
  assert.equal(after[0].status, 'open', 'an unchecked file is never reported as fixed')
  assert.equal(after[0].fingerprint, before[0].fingerprint)
  assert.equal(second.summary.fixed, 0)
})

test('each per-file error code is recorded without aborting the scan', async t => {
  for (const code of ['ENOENT', 'EPERM', 'EBUSY']) {
    const root = await workspace(t)
    const result = await engineFor(root, { io: failing(path => path.endsWith('src/b.js'), code) }).scan()
    assert.equal(result.status, 'partial', code)
    assert.deepEqual(result.coverage.failedFiles, [{ path: 'src/b.js', code }])
    assert.equal(byPath(result, 'src/a.js').length, 1, `${code}: other files are still scanned`)
  }
})

test('failures stay visible until the path is re-checked successfully', async t => {
  const root = await workspace(t)
  let fail = true
  const engine = engineFor(root, { io: failing(path => fail && path.endsWith('src/a.js'), 'EBUSY') })
  await engine.scan()
  const unrelated = await engine.scan({ paths: ['src/clean.js'] })
  assert.equal(unrelated.status, 'partial', 'targeted scan elsewhere does not clear the failure')
  assert.deepEqual(unrelated.coverage.carriedFailures, [{ path: 'src/a.js', code: 'EBUSY' }])
  fail = false
  const recheck = await engine.scan({ paths: ['src/a.js'] })
  assert.equal(recheck.status, 'complete')
  assert.deepEqual(recheck.coverage.carriedFailures, [])
})

test('carried failures survive a restart through the ledger file', async t => {
  const root = await workspace(t)
  await engineFor(root, { io: failing(path => path.endsWith('src/a.js'), 'EACCES') }).scan()
  const restarted = await engineFor(root).scan({ paths: ['src/b.js'] })
  assert.equal(restarted.status, 'partial')
  assert.deepEqual(restarted.coverage.carriedFailures, [{ path: 'src/a.js', code: 'EACCES' }])
})

test('oversize files are skipped without resolving their findings', async t => {
  const root = await workspace(t)
  await engineFor(root).scan()
  await writeFile(join(root, 'src/a.js'), EMPTY_CATCH + '// '.padEnd(4096, 'x') + '\n')
  const result = await engineFor(root, { maxFileBytes: 1024 }).scan()
  assert.equal(result.status, 'complete', 'a configured size limit is a skip, not a failure')
  assert.deepEqual(result.coverage.skipped.map(item => item.path), ['src/a.js'])
  assert.equal(byPath(result, 'src/a.js')[0].status, 'open')
})

test('unreadable workspace root aborts the scan and keeps the previous ledger', async t => {
  const root = await workspace(t)
  const engine = engineFor(root)
  const first = await engine.scan()
  await rename(root, `${root}-gone`)
  t.after(() => rm(`${root}-gone`, { recursive: true, force: true }))
  await assert.rejects(engine.scan(), { code: 'ENOENT' })
  const kept = JSON.parse(await readFile(join(`${root}-gone`, '.roundtable', 'findings.json'), 'utf8'))
  assert.equal(kept.scanId, first.scanId)
})

// ---------------------------------------------------------------- incremental

test('targeted scan re-checks only requested paths and keeps others unchanged', async t => {
  const root = await workspace(t)
  const engine = engineFor(root)
  await engine.scan()
  await writeFile(join(root, 'src/b.js'), 'export const fixed = true\n')
  await writeFile(join(root, 'src/clean.js'), EMPTY_CATCH)
  const result = await engine.scan({ paths: ['src/clean.js'] })
  assert.equal(result.mode, 'targeted')
  assert.deepEqual(result.requestedPaths, ['src/clean.js'])
  assert.equal(result.coverage.scannedFiles, 1)
  assert.equal(byPath(result, 'src/clean.js')[0].baselineStatus, 'new')
  assert.equal(byPath(result, 'src/b.js')[0].status, 'open', 'unrequested file is not resolved')
  assert.equal(byPath(result, 'src/a.js')[0].baselineStatus, 'new', 'untouched records keep their previous state verbatim')
  assert.equal(result.summary.new, 1, 'only the re-checked file contributes to run counts')
})

test('targeted lifecycle: fixed, then worsened on reintroduction', async t => {
  const root = await workspace(t)
  const engine = engineFor(root)
  await engine.scan()
  await writeFile(join(root, 'src/a.js'), 'export const ok = 2\n')
  const fixed = await engine.scan({ paths: ['src/a.js'] })
  assert.equal(byPath(fixed, 'src/a.js')[0].status, 'fixed')
  assert.equal(fixed.summary.fixed, 1)
  await writeFile(join(root, 'src/a.js'), EMPTY_CATCH)
  const back = await engine.scan({ paths: ['src/a.js'] })
  const record = byPath(back, 'src/a.js')[0]
  assert.deepEqual([record.status, record.baselineStatus], ['open', 'worsened'])
  assert.equal(record.resolvedAt, undefined, 'reopened record drops resolvedAt')
})

test('deleted file and deleted directory resolve their findings', async t => {
  const root = await workspace(t, { 'src/a.js': EMPTY_CATCH, 'pkg/deep/x.js': STUB, 'pkg/y.js': EMPTY_CATCH })
  const engine = engineFor(root)
  await engine.scan()
  await rm(join(root, 'src/a.js'))
  const file = await engine.scan({ paths: ['src/a.js'] })
  assert.equal(byPath(file, 'src/a.js')[0].status, 'fixed')
  await rm(join(root, 'pkg'), { recursive: true })
  const directory = await engine.scan({ paths: ['pkg'] })
  assert.deepEqual(directory.findings.filter(item => item.path.startsWith('pkg/')).map(item => item.status), ['fixed', 'fixed'])
})

test('targeted scan of a directory walks it recursively', async t => {
  const root = await workspace(t, { 'src/a.js': 'export const a = 1\n' })
  const engine = engineFor(root)
  await engine.scan()
  await mkdir(join(root, 'lib/nested'), { recursive: true })
  await writeFile(join(root, 'lib/nested/n.js'), STUB)
  const result = await engine.scan({ paths: ['lib'] })
  assert.deepEqual(result.findings.map(item => item.path), ['lib/nested/n.js'])
})

test('targeted scans never read the ledger or ignored directories', async t => {
  const root = await workspace(t)
  const engine = engineFor(root, { ledgerPath: 'reports/findings.json' })
  await engine.scan()
  await mkdir(join(root, 'node_modules/p'), { recursive: true })
  await writeFile(join(root, 'node_modules/p/i.js'), EMPTY_CATCH)
  const result = await engine.scan({ paths: ['reports/findings.json', 'node_modules/p/i.js'] })
  assert.equal(result.coverage.requestedFiles, 0)
  assert.ok(!result.findings.some(item => item.path.startsWith('reports/') || item.path.startsWith('node_modules/')))
})

test('incremental results match a fresh full scan', async t => {
  const root = await workspace(t)
  const engine = engineFor(root)
  await engine.scan()
  await writeFile(join(root, 'src/a.js'), STUB)
  await writeFile(join(root, 'src/new.ts'), '// @ts-ignore\n')
  await rm(join(root, 'src/b.js'))
  const incremental = await engine.scan({ paths: ['src/a.js', 'src/new.ts', 'src/b.js'] })
  const full = await engineFor(await workspace(t, { 'src/a.js': STUB, 'src/new.ts': '// @ts-ignore\n', 'src/clean.js': 'export const ok = 1\n' })).scan()
  const open = result => result.findings.filter(item => item.status !== 'fixed').map(item => item.fingerprint).sort()
  assert.deepEqual(open(incremental), open(full))
})

test('requested paths must stay inside the workspace', () => {
  assert.equal(normalizeRequestedPath('src\\a.js'), 'src/a.js')
  assert.equal(normalizeRequestedPath('./src/'), 'src')
  assert.equal(normalizeRequestedPath('.'), '.')
  for (const bad of ['../x.js', '/etc/passwd', 'C:\\x.js', 'src/../../x', '']) {
    assert.throws(() => normalizeRequestedPath(bad), TypeError, bad)
  }
})

test('watch events map to targeted, full, or ignored requests', () => {
  const options = { root: '/repo', ledgerPath: '.roundtable/findings.json' }
  assert.deepEqual(watchRequest('change', 'src\\a.js', options), { kind: 'path', path: 'src/a.js' })
  assert.deepEqual(watchRequest('rename', 'src/a.js', options), { kind: 'path', path: 'src/a.js' })
  assert.deepEqual(watchRequest('rename', 'src', options), { kind: 'full' }, 'directory rename rescans everything')
  assert.deepEqual(watchRequest('change', null, options), { kind: 'full' })
  assert.deepEqual(watchRequest('change', 'src', options), { kind: 'ignore' })
  assert.deepEqual(watchRequest('rename', '.roundtable/findings.json.1.tmp', options), { kind: 'ignore' })
})

// ---------------------------------------------------------------- service

const serviceFor = (root, extra = {}) => new CodeHealthService({
  root, ledgerPath: '.roundtable/findings.json', maxFileBytes: 1_000_000, debounceMs: 50, maxWaitMs: 200, ...extra,
})

test('service runs the initial scan, notifies subscribers, and exposes a snapshot', async t => {
  const root = await workspace(t)
  const results = []
  const service = serviceFor(root, { onResult: result => results.push(result.mode) })
  t.after(() => service.dispose())
  const api = service.api()
  assert.ok(Object.isFrozen(api))
  assert.equal(api.snapshot(), undefined)
  const seen = new Promise(resolve => api.onScan(resolve))
  service.start()
  const summary = await seen
  assert.equal(summary.mode, 'full')
  assert.equal(summary.summary.open, 2)
  assert.equal('findings' in summary, false, 'notifications carry no evidence text')
  const snapshot = api.snapshot()
  assert.equal(snapshot.scanId, summary.scanId)
  snapshot.findings.length = 0
  assert.equal(api.snapshot().findings.length, 2, 'snapshot is a copy')
  assert.equal(api.status().state, 'idle')
  assert.deepEqual(results, ['full'])
})

test('service batches watch events into one targeted scan', async t => {
  const root = await workspace(t)
  const modes = []
  const service = serviceFor(root, { onResult: result => modes.push([result.mode, result.requestedPaths]) })
  t.after(() => service.dispose())
  service.start()
  await service.requestScan()
  modes.length = 0
  await writeFile(join(root, 'src/clean.js'), EMPTY_CATCH)
  const done = new Promise(resolve => service.onScan(resolve))
  for (let index = 0; index < 5; index++) service.handleWatchEvent('change', 'src\\clean.js')
  service.handleWatchEvent('change', 'src')
  service.handleWatchEvent('change', 'node_modules/x.js')
  await done
  assert.deepEqual(modes, [['targeted', ['src/clean.js']]])
})

test('explicit requestScan bypasses the debounce and resolves with its result', async t => {
  const root = await workspace(t)
  const service = serviceFor(root, { debounceMs: 5000, maxWaitMs: 5000 })
  t.after(() => service.dispose())
  const started = Date.now()
  const result = await service.requestScan({ paths: ['src/a.js'] })
  assert.ok(Date.now() - started < 2000)
  assert.equal(result.mode, 'targeted')
  await assert.rejects(service.requestScan({ paths: ['../outside'] }), TypeError, 'invalid paths reject before queuing')
  assert.equal(service.status().pending, false)
})

test('dispose cancels an active scan, rejects waiters, and blocks new requests', async t => {
  const root = await workspace(t)
  for (let index = 0; index < 400; index++) await writeFile(join(root, 'src', `f${index}.js`), 'export const v = 1\n')
  const service = serviceFor(root)
  const pending = service.requestScan()
  await new Promise(resolve => setImmediate(resolve))
  const outcome = await service.dispose()
  assert.equal(outcome.cancelled, true)
  await assert.rejects(pending, CodeHealthStoppedError)
  await assert.rejects(service.requestScan(), CodeHealthStoppedError)
  assert.equal(service.status().state, 'stopped')
  assert.deepEqual(await service.dispose(), { cancelled: false }, 'dispose is idempotent')
})

test('a throwing subscriber does not break scanning or other subscribers', async t => {
  const root = await workspace(t)
  const errors = []
  const service = serviceFor(root, { onListenerError: error => errors.push(error.message) })
  t.after(() => service.dispose())
  service.onScan(() => { throw new Error('bad listener') })
  const good = new Promise(resolve => service.onScan(resolve))
  await service.requestScan()
  await good
  assert.deepEqual(errors, ['bad listener'])
})

test('scan errors are reported in status and reject the waiter', async t => {
  const root = await workspace(t)
  const service = serviceFor(root)
  t.after(() => service.dispose())
  await service.requestScan()
  await rename(root, `${root}-gone`)
  t.after(() => rm(`${root}-gone`, { recursive: true, force: true }))
  await assert.rejects(service.requestScan(), { code: 'ENOENT' })
  assert.equal(service.status().lastError.code, 'ENOENT')
})

test('summarizeScan exposes counts only', () => {
  const summary = summarizeScan({
    scanId: 'x', mode: 'full', status: 'partial', finishedAt: 't', summary: { open: 1, new: 1, worsened: 0, fixed: 0 },
    coverage: { requestedFiles: 2, scannedFiles: 1, skippedFiles: 0, failedFiles: [{ path: 'secret.js', code: 'EACCES' }], carriedFailures: [] },
    findings: [{ evidence: 'secret' }],
  })
  assert.equal(JSON.stringify(summary).includes('secret'), false)
  assert.equal(summary.coverage.failedFiles, 1)
})
