#!/usr/bin/env node
// Scanner micro-benchmark (no DSH): full scan of 2000 x 64 KB files versus an incremental
// scan of one changed file in the same workspace, plus the matches-heavy location case.
// Usage: node scripts/bench-scanner.js [--work <dir>] [--repeat 3]
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { parseArgs } from 'node:util'
import * as scanner from '../lib/scanner.js'
import { scanContent } from '../lib/analyzers.js'

const { values } = parseArgs({ options: { work: { type: 'string' }, repeat: { type: 'string', default: '3' } } })
const root = values.work ?? join(tmpdir(), 'rt-bench-scanner')
const repeat = Number(values.repeat)
const median = samples => [...samples].sort((a, b) => a - b)[Math.floor(samples.length / 2)]
const time = async fn => {
  const started = performance.now()
  await fn()
  return Math.round(performance.now() - started)
}

rmSync(root, { recursive: true, force: true })
const line = 'export function f(a, b) { return a + b } // benign line of code for scanning\n'
const body = line.repeat(Math.ceil(64_000 / line.length))
for (let index = 0; index < 2000; index++) {
  const directory = join(root, `d${index % 40}`)
  mkdirSync(directory, { recursive: true })
  writeFileSync(join(directory, `f${index}.js`), body)
}
const options = { root, ledgerPath: '.roundtable/findings.json', maxFileBytes: 1_000_000 }

const full = []
for (let run = 0; run < repeat; run++) full.push(await time(() => scanner.scanWorkspace(options)))

const incremental = []
if (scanner.CodeHealthEngine) {
  const engine = new scanner.CodeHealthEngine(options)
  await engine.scan()
  for (let run = 0; run < repeat; run++) {
    writeFileSync(join(root, 'd0', 'f0.js'), `${body}try { x() } catch (e) {}\n// run ${run}\n`)
    incremental.push(await time(() => engine.scan({ paths: ['d0/f0.js'] })))
  }
}

const locate = []
for (const count of [2000, 8000]) {
  const source = 'try { x() } catch (e) {}\n'.repeat(count) + line.repeat(count * 2)
  const samples = []
  for (let run = 0; run < repeat; run++) samples.push(await time(() => scanContent('a.js', source)))
  locate.push({ matches: count, bytes: source.length, medianMs: median(samples) })
}

rmSync(root, { recursive: true, force: true })
console.log(JSON.stringify({
  node: process.version,
  platform: `${process.platform}-${process.arch}`,
  repeat,
  fullScan2000x64KB: { medianMs: median(full), samplesMs: full },
  incrementalOneFile: incremental.length ? { medianMs: median(incremental), samplesMs: incremental } : 'not available (no CodeHealthEngine)',
  scanContentLocation: locate,
}, null, 2))
