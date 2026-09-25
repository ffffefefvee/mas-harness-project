// Regression tests for the Stage 0 code review findings (2026-09-25).
import assert from 'node:assert/strict'
import { existsSync, symlinkSync } from 'node:fs'
import { mkdtemp, mkdir, readdir, rename, rm, stat, writeFile, readFile as fsReadFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { CodeHealthEngine } from '../lib/scanner.js'
import { CodeHealthService, CodeHealthStoppedError } from '../lib/service.js'

const EMPTY_CATCH = 'try { a() } catch (e) {}\n'
const CLEAN = 'export const ok = 1\n'

async function temporaryDirectory(t, prefix) {
  const path = await mkdtemp(join(tmpdir(), prefix))
  t.after(() => rm(path, { recursive: true, force: true }))
  return path
}

async function workspace(t, files) {
  const root = await temporaryDirectory(t, 'rt-review-')
  for (const [path, content] of Object.entries(files)) {
    await mkdir(join(root, path, '..'), { recursive: true })
    await writeFile(join(root, path), content)
  }
  return root
}

const engineFor = (root, extra = {}) => new CodeHealthEngine({ root, ledgerPath: '.roundtable/findings.json', maxFileBytes: 1_000_000, ...extra })
const serviceFor = (root, extra = {}) => new CodeHealthService({
  root, ledgerPath: '.roundtable/findings.json', maxFileBytes: 1_000_000, debounceMs: 50, maxWaitMs: 200, ...extra,
})
const within = (promise, ms, label) => Promise.race([
  promise,
  new Promise((_resolve, reject) => setTimeout(() => reject(new Error(`${label} did not settle within ${ms} ms`)), ms).unref()),
])
const gate = () => {
  let open
  const opened = new Promise(resolve => { open = resolve })
  return { open, opened }
}

// ---------------------------------------------------------------- 1. overlapping targets

test('overlapping targets scan a file once and keep a new finding new', async t => {
  const root = await workspace(t, { 'my.pkg/a.js': CLEAN })
  const engine = engineFor(root)
  await engine.scan()
  await writeFile(join(root, 'my.pkg/a.js'), EMPTY_CATCH)
  const result = await engine.scan({ paths: ['my.pkg', 'my.pkg/a.js'] })
  const [finding] = result.findings.filter(item => item.path === 'my.pkg/a.js')
  assert.equal(result.coverage.scannedFiles, 1, 'the file is read once')
  assert.equal(finding.baselineStatus, 'new')
  assert.equal(result.summary.new, 1)
})

test('overlapping targets keep a reopened finding worsened', async t => {
  const root = await workspace(t, { 'my.pkg/a.js': EMPTY_CATCH })
  const engine = engineFor(root)
  await engine.scan()
  await writeFile(join(root, 'my.pkg/a.js'), CLEAN)
  await engine.scan()
  await writeFile(join(root, 'my.pkg/a.js'), EMPTY_CATCH)
  const result = await engine.scan({ paths: ['my.pkg/a.js', 'my.pkg'] })
  const [finding] = result.findings.filter(item => item.path === 'my.pkg/a.js')
  assert.equal(finding.baselineStatus, 'worsened')
  assert.equal(result.summary.worsened, 1)
})

// ---------------------------------------------------------------- 2. symlinks in targeted scans

async function linkedWorkspace(t) {
  const outside = await temporaryDirectory(t, 'rt-review-outside-')
  await writeFile(join(outside, 'secret.js'), EMPTY_CATCH)
  const root = await workspace(t, { 'src/clean.js': CLEAN })
  try {
    symlinkSync(outside, join(root, 'link'), process.platform === 'win32' ? 'junction' : 'dir')
  } catch (error) {
    return { skip: `cannot create a directory link here: ${error.code}` }
  }
  return { root }
}

test('targeted scan never follows a link in an intermediate path segment', async t => {
  const { root, skip } = await linkedWorkspace(t)
  if (skip) return t.skip(skip)
  const engine = engineFor(root)
  const full = await engine.scan()
  assert.equal(full.findings.length, 0, 'full walk skips links')
  const targeted = await engine.scan({ paths: ['link/secret.js'] })
  assert.equal(targeted.coverage.scannedFiles, 0, 'no file outside the workspace is read')
  assert.equal(targeted.findings.some(item => item.path.startsWith('link/')), false)
  const directory = await engine.scan({ paths: ['link'] })
  assert.equal(directory.coverage.scannedFiles, 0, 'a link target itself is not walked')
})

test('a link path is not treated as re-checked, so its findings are not reported fixed', async t => {
  const { root, skip } = await linkedWorkspace(t)
  if (skip) return t.skip(skip)
  const ledgerPath = join(root, '.roundtable', 'findings.json')
  await mkdir(join(root, '.roundtable'), { recursive: true })
  const stale = { fingerprint: 'f'.repeat(64), ruleId: 'empty-catch', path: 'link/secret.js', evidence: 'x', status: 'open', baselineStatus: 'existing' }
  await writeFile(ledgerPath, JSON.stringify({ schemaVersion: '0.2', findings: [stale] }))
  const result = await engineFor(root).scan({ paths: ['link/secret.js'] })
  assert.equal(result.findings.find(item => item.fingerprint === stale.fingerprint).status, 'open')
})

// ---------------------------------------------------------------- 3. requestScan argument handling

test('requestScan with an empty path list settles with the latest result', async t => {
  const root = await workspace(t, { 'src/a.js': EMPTY_CATCH })
  const service = serviceFor(root, { debounceMs: 5000, maxWaitMs: 5000 })
  t.after(() => service.dispose())
  const first = await within(service.requestScan({ paths: [] }), 3000, 'first empty request')
  assert.equal(first.mode, 'full', 'without a previous result an empty request runs a full scan')
  const again = await within(service.requestScan({ paths: [] }), 1000, 'second empty request')
  assert.equal(again.scanId, first.scanId, 'with a previous result nothing is rescanned')
})

test('requestScan reports invalid arguments as rejected promises, never synchronously', async t => {
  const root = await workspace(t, { 'src/a.js': CLEAN })
  const service = serviceFor(root)
  t.after(() => service.dispose())
  for (const bad of [{ paths: ['../outside.js'] }, { paths: 'src/a.js' }, { paths: [42] }, null]) {
    let promise
    assert.doesNotThrow(() => { promise = service.requestScan(bad) }, `synchronous throw for ${JSON.stringify(bad)}`)
    await assert.rejects(promise, TypeError)
  }
  assert.equal(service.status().pending, false, 'nothing was queued')
})

// ---------------------------------------------------------------- 4. throwing onResult

test('a throwing onResult does not turn a successful scan into a failure', async t => {
  const root = await workspace(t, { 'src/a.js': EMPTY_CATCH })
  const listenerErrors = []
  const scanErrors = []
  const service = serviceFor(root, {
    onResult: () => { throw new Error('emit boom') },
    onError: error => scanErrors.push(error.message),
    onListenerError: error => listenerErrors.push(error.message),
  })
  t.after(() => service.dispose())
  const heard = new Promise(resolve => service.onScan(resolve))
  await service.requestScan()
  await within(heard, 1000, 'onScan listener')
  assert.deepEqual(scanErrors, [])
  assert.deepEqual(listenerErrors, ['emit boom'])
  assert.equal(service.status().lastError, undefined)
})

// ---------------------------------------------------------------- 5. dispose during the ledger write

test('dispose during the ledger write rejects waiters and suppresses notifications', async t => {
  const root = await workspace(t, { 'src/a.js': EMPTY_CATCH })
  const writing = gate()
  const release = gate()
  const results = []
  const heard = []
  const service = serviceFor(root, {
    onResult: result => results.push(result.scanId),
    io: {
      rename: async (from, to) => {
        writing.open()
        await release.opened
        return rename(from, to)
      },
    },
  })
  service.onScan(summary => heard.push(summary.scanId))
  const pending = service.requestScan()
  await within(writing.opened, 3000, 'ledger write')
  const disposed = service.dispose()
  release.open()
  await disposed
  await assert.rejects(pending, CodeHealthStoppedError)
  assert.deepEqual(results, [], 'onResult is not called after dispose started')
  assert.deepEqual(heard, [], 'listeners are not called after dispose started')
})

// ---------------------------------------------------------------- 6. path letter case

test('a mis-cased path on a case-insensitive filesystem maps to the on-disk spelling', async t => {
  const root = await workspace(t, { 'src/a.js': EMPTY_CATCH })
  if (!existsSync(join(root, 'SRC', 'A.js'))) return t.skip('case-sensitive filesystem')
  const engine = engineFor(root)
  await engine.scan()
  const result = await engine.scan({ paths: ['SRC/A.js'] })
  assert.deepEqual(result.findings.map(item => [item.path, item.status]), [['src/a.js', 'open']])
  assert.equal(result.summary.new, 0)
  assert.equal(result.coverage.scannedFiles, 1)
})

// ---------------------------------------------------------------- 7. write robustness and chain survival

test('ledger temporaries are unique per write and removed when the rename fails', async t => {
  const root = await workspace(t, { 'src/a.js': EMPTY_CATCH })
  const temporaries = []
  let fail = true
  const engine = engineFor(root, {
    io: {
      rename: async (from, to) => {
        temporaries.push(from)
        if (fail) throw Object.assign(new Error('EPERM injected'), { code: 'EPERM' })
        return rename(from, to)
      },
    },
  })
  await assert.rejects(engine.scan(), { code: 'EPERM' })
  assert.deepEqual((await readdir(join(root, '.roundtable'))).filter(name => name.endsWith('.tmp')), [], 'no temporary left behind')
  fail = false
  await engine.scan()
  await engine.scan()
  assert.equal(new Set(temporaries).size, temporaries.length, 'every write uses a fresh temporary name')
  assert.ok(temporaries.every(path => /findings\.json\.\d+\.[0-9a-f-]{36}\.tmp$/.test(path.replaceAll('\\', '/'))), temporaries.join(', '))
})

test('scanning continues after onError itself throws', async t => {
  const parent = await temporaryDirectory(t, 'rt-review-late-')
  const root = join(parent, 'workspace')
  const reported = []
  const service = serviceFor(root, {
    onError: () => { throw new Error('onError boom') },
    onListenerError: error => reported.push(error.message),
  })
  t.after(() => service.dispose())
  await assert.rejects(within(service.requestScan(), 3000, 'first request'), { code: 'ENOENT' })
  await mkdir(join(root, 'src'), { recursive: true })
  await writeFile(join(root, 'src', 'a.js'), EMPTY_CATCH)
  const result = await within(service.requestScan(), 3000, 'request after a throwing onError')
  assert.equal(result.summary.open, 1)
  assert.deepEqual(reported, ['onError boom'])
})

test('engine io override keeps stat and readFile defaults', async t => {
  const root = await workspace(t, { 'src/a.js': EMPTY_CATCH })
  const result = await engineFor(root, { io: { stat, readFile: fsReadFile } }).scan()
  assert.equal(result.summary.open, 1)
})
