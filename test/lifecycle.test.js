import assert from 'node:assert/strict'
import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { createScanScheduler } from '../lib/schedule.js'
import { isRelevantChange, scanWorkspace } from '../lib/scanner.js'

const defaults = { root: '/repo', ledgerPath: '.roundtable/findings.json' }

async function workspace(t) {
  const root = await mkdtemp(join(tmpdir(), 'rt-lifecycle-'))
  t.after(() => rm(root, { recursive: true, force: true }))
  await mkdir(join(root, 'src'))
  await writeFile(join(root, 'src', 'seed.js'), 'try { a() } catch (e) {}\n')
  return root
}

test('watch filter ignores ledger artifacts, ignored directories, and directory change noise', () => {
  assert.equal(isRelevantChange('rename', '.roundtable\\findings.json.123.tmp', defaults), false)
  assert.equal(isRelevantChange('change', 'node_modules/pkg/index.js', defaults), false)
  assert.equal(isRelevantChange('change', 'packages\\a\\.git\\index', defaults), false)
  assert.equal(isRelevantChange('change', 'src', defaults), false, 'Windows reports directory reads as change')
  assert.equal(isRelevantChange('change', 'src/a.js', defaults), true)
  assert.equal(isRelevantChange('rename', 'src', defaults), true, 'moving a directory can fix findings')
  assert.equal(isRelevantChange('change', undefined, defaults), true, 'unattributed events are conservative')
})

test('watch filter follows a custom ledger path outside .roundtable', () => {
  const options = { root: '/repo', ledgerPath: 'reports/findings.json' }
  assert.equal(isRelevantChange('change', 'reports\\findings.json', options), false)
  assert.equal(isRelevantChange('rename', 'reports/findings.json.77.tmp', options), false)
  assert.equal(isRelevantChange('change', 'reports', options), false)
  assert.equal(isRelevantChange('rename', 'reports', options), false, 'ledger directory churn is not a source change')
  assert.equal(isRelevantChange('rename', 'src', options), true)
  assert.equal(isRelevantChange('change', 'reports/other.json', options), true)
})

test('scan never treats its own ledger as source', async t => {
  const root = await workspace(t)
  const options = { root, ledgerPath: 'reports/findings.json', maxFileBytes: 1_000_000 }
  await scanWorkspace(options)
  const second = await scanWorkspace(options)
  assert.deepEqual(second.findings.map(item => item.path), ['src/seed.js'])
  assert.equal(second.coverage.scannedFiles, 1)
})

test('scan aborted mid-walk rejects and keeps the previous ledger', async t => {
  const root = await workspace(t)
  for (let index = 0; index < 300; index++) {
    await writeFile(join(root, 'src', `f${index}.js`), 'export const v = 1\n')
  }
  const options = { root, ledgerPath: '.roundtable/findings.json', maxFileBytes: 1_000_000 }
  const first = await scanWorkspace(options)
  const controller = new AbortController()
  const running = scanWorkspace({ ...options, signal: controller.signal })
  setImmediate(() => controller.abort(new Error('unload mid-scan')))
  await assert.rejects(running, /unload mid-scan/)
  const kept = JSON.parse(await readFile(join(root, '.roundtable', 'findings.json'), 'utf8'))
  assert.equal(kept.generatedAt, first.generatedAt)
  assert.deepEqual((await readdir(join(root, '.roundtable'))).filter(name => name.endsWith('.tmp')), [])
})

test('aborted scan rejects and keeps the previous ledger', async t => {
  const root = await workspace(t)
  const options = { root, ledgerPath: '.roundtable/findings.json', maxFileBytes: 1_000_000 }
  const first = await scanWorkspace(options)
  const controller = new AbortController()
  controller.abort(new Error('unload'))
  await assert.rejects(scanWorkspace({ ...options, signal: controller.signal }), /unload/)
  const kept = JSON.parse(await readFile(join(root, '.roundtable', 'findings.json'), 'utf8'))
  assert.equal(kept.generatedAt, first.generatedAt)
  assert.deepEqual((await readdir(join(root, '.roundtable'))).filter(name => name.endsWith('.tmp')), [])
})

test('scheduler debounces bursts but bounds the wait under continuous requests', t => {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'] })
  let runs = 0
  const scheduler = createScanScheduler({ debounceMs: 250, maxWaitMs: 1000, run: () => { runs += 1 }, now: Date.now })
  for (let index = 0; index < 10; index++) {
    scheduler.request()
    t.mock.timers.tick(20)
  }
  t.mock.timers.tick(250)
  assert.equal(runs, 1, 'a burst coalesces into one run')
  for (let elapsed = 0; elapsed < 3000; elapsed += 150) {
    scheduler.request()
    t.mock.timers.tick(150)
  }
  // Burst run at t=430; continuous phase starts at t=450, so max-wait fires at 1450 and 2500.
  assert.equal(runs, 3, 'continuous requests every 150 ms run once per maxWaitMs, not per request')
  const beforeClose = runs
  scheduler.request()
  assert.equal(scheduler.pending, true)
  scheduler.close()
  assert.equal(scheduler.pending, false)
  t.mock.timers.tick(5000)
  scheduler.request()
  t.mock.timers.tick(5000)
  assert.equal(runs, beforeClose, 'close cancels a pending run and ignores later requests')
})

test('scheduler fires immediately when a request arrives after the max-wait deadline', t => {
  t.mock.timers.enable({ apis: ['setTimeout'] })
  let clock = 0
  let runs = 0
  const scheduler = createScanScheduler({ debounceMs: 250, maxWaitMs: 1000, run: () => { runs += 1 }, now: () => clock })
  scheduler.request()
  clock = 5000 // event loop was blocked past the deadline; the pending timer has not fired yet
  scheduler.request()
  t.mock.timers.tick(0)
  assert.equal(runs, 1)
  assert.equal(scheduler.pending, false)
})
