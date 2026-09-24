#!/usr/bin/env node
// Runtime verification of the Roundtable feasibility plugin inside an installed
// DeepSeek Harness. Every scenario boots a real `dsh --profile <name>` process;
// nothing here is inferred from source inspection.
//
// Usage (see docs/RUNTIME_VERIFICATION.md):
//   node scripts/dsh-runtime/check.js --dsh-dir <dir with node_modules/@deepseek-ai/dsh>
//        [--work <dir>] [--only a,b] [--skip-install] [--label <text>]
//
// Observation channels (implementation-independent, so the same harness judges
// the unfixed and the fixed plugin):
//   - plugin stdout report lines `[roundtable-code-health] N open findings ...` = one scan;
//   - `.roundtable/findings.json` content;
//   - a test-only probe plugin sampling process.getActiveResourcesInfo();
//   - a preload recording `beforeExit` (natural event-loop drain) versus `process.exit`.
import { spawn, spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { parseArgs } from 'node:util'
import { setTimeout as sleep } from 'node:timers/promises'

const here = dirname(fileURLToPath(import.meta.url))
const repoRoot = resolve(here, '../..')
const { values: args } = parseArgs({
  options: {
    'dsh-dir': { type: 'string' },
    work: { type: 'string' },
    only: { type: 'string' },
    'skip-install': { type: 'boolean', default: false },
    label: { type: 'string', default: '' },
  },
})
if (!args['dsh-dir']) {
  console.error('usage: node scripts/dsh-runtime/check.js --dsh-dir <dir> [--work <dir>] [--only ids] [--skip-install]')
  process.exit(2)
}

const dshDir = resolve(args['dsh-dir'])
const dshBin = join(dshDir, 'node_modules', '@deepseek-ai', 'dsh', 'lib', 'bin.js')
const workDir = resolve(args.work ?? join(dshDir, 'runtime-check'))
const dshHome = join(workDir, 'home')
const profile = 'rt-runtime-check'
const profileDir = join(dshHome, 'profiles', profile)
const userPatchPath = join(profileDir, 'cordis.patch.yml')
const probeUrl = pathToFileURL(join(here, 'probe-plugin.js')).href
const preloadUrl = pathToFileURL(join(here, 'preload.js')).href
const REPORT = /^\[roundtable-code-health\] (\d+) open findings \((\d+) new\/regressed\); (\d+) files scanned/
const only = args.only ? new Set(args.only.split(',')) : undefined
const yamlPath = path => path.replaceAll('\\', '/')

if (!existsSync(dshBin)) {
  console.error(`DSH launcher not found at ${dshBin}`)
  process.exit(2)
}
mkdirSync(workDir, { recursive: true })

const pathWithBin = `${join(dshDir, 'node_modules', '.bin')}${process.platform === 'win32' ? ';' : ':'}${process.env.PATH}`

function run(command, argv, options = {}) {
  const result = spawnSync(command, argv, {
    encoding: 'utf8',
    shell: process.platform === 'win32' && !command.endsWith('.exe') && command !== process.execPath,
    ...options,
  })
  return { code: result.status, stdout: result.stdout ?? '', stderr: result.stderr ?? '', error: result.error }
}

function packageVersion(name) {
  try {
    return JSON.parse(readFileSync(join(dshDir, 'node_modules', ...name.split('/'), 'package.json'), 'utf8')).version
  } catch {
    return undefined
  }
}

// ---------------------------------------------------------------- workspace

function seedWorkspace(name, extra = {}) {
  const root = join(workDir, 'ws', name)
  rmSync(root, { recursive: true, force: true })
  mkdirSync(join(root, 'src'), { recursive: true })
  writeFileSync(join(root, 'src', 'seed.js'), "function a() { try { work() } catch (error) {} }\nthrow new Error('Not implemented')\n")
  writeFileSync(join(root, 'src', 'clean.js'), 'export const ok = 1\n')
  for (const [path, content] of Object.entries(extra)) {
    mkdirSync(dirname(join(root, path)), { recursive: true })
    writeFileSync(join(root, path), content)
  }
  return root
}

function largeWorkspace(name, files) {
  const root = seedWorkspace(name)
  const line = 'export function f(a, b) { return a + b } // benign line of code for scanning\n'
  const body = line.repeat(Math.ceil(64_000 / line.length))
  for (let index = 0; index < files; index++) {
    const directory = join(root, 'bulk', `d${index % 40}`)
    mkdirSync(directory, { recursive: true })
    writeFileSync(join(directory, `f${index}.js`), body)
  }
  return root
}

function readLedger(root, ledgerPath = '.roundtable/findings.json') {
  try {
    return JSON.parse(readFileSync(join(root, ledgerPath), 'utf8'))
  } catch (error) {
    return { error: error.code ?? String(error) }
  }
}

function temporaryFiles(root, directory = '.roundtable') {
  try {
    return readdirSync(join(root, directory)).filter(name => name.endsWith('.tmp'))
  } catch {
    return []
  }
}

function pluginConfigPatch(root, overrides = {}) {
  const config = { root: yamlPath(root), ledgerPath: '.roundtable/findings.json', debounceMs: 250, maxFileBytes: 1_000_000, watch: true, ...overrides }
  const lines = Object.entries(config).map(([key, value]) => `    ${key}: ${typeof value === 'string' ? `'${value}'` : value}`)
  return `- id: roundtable-code-health\n  name: dsh-roundtable-beta\n  config:\n${lines.join('\n')}\n`
}

function writeUserPatch(content) {
  writeFileSync(userPatchPath, content)
}

// ---------------------------------------------------------------- DSH process

class DshProcess {
  constructor(name, { root }) {
    this.name = name
    this.root = root
    this.dir = join(workDir, 'runs', name)
    rmSync(this.dir, { recursive: true, force: true })
    mkdirSync(join(this.dir, 'ctl'), { recursive: true })
    this.probeLog = join(this.dir, 'probe.log')
    this.lines = []
    this.exit = undefined
    const overlay = [
      '- insert:',
      '    - id: rt-probe',
      `      name: '${probeUrl}'`,
      '      config:',
      `        logPath: '${yamlPath(this.probeLog)}'`,
      `        controlDir: '${yamlPath(join(this.dir, 'ctl'))}'`,
      '        intervalMs: 100',
      '',
    ].join('\n')
    this.overlayPath = join(this.dir, 'overlay.yml')
    writeFileSync(this.overlayPath, overlay)
  }

  start() {
    this.startedAt = Date.now()
    this.child = spawn(process.execPath, [dshBin, '--profile', profile, '--patch', this.overlayPath], {
      cwd: this.dir,
      env: {
        ...process.env,
        DSH_HOME: dshHome,
        ROUND_TABLE_WORKSPACE: this.root,
        DSH_TELEMETRY_DISABLED: '1',
        RT_PROBE_LOG: this.probeLog,
        NODE_OPTIONS: `--import=${preloadUrl}`,
        PATH: pathWithBin,
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    for (const stream of ['stdout', 'stderr']) {
      let buffer = ''
      this.child[stream].setEncoding('utf8')
      this.child[stream].on('data', chunk => {
        buffer += chunk
        let index
        while ((index = buffer.indexOf('\n')) >= 0) {
          this.lines.push({ t: Date.now(), stream, text: buffer.slice(0, index).replace(/\r$/, '') })
          buffer = buffer.slice(index + 1)
        }
      })
    }
    this.exited = new Promise(resolveExit => {
      this.child.on('exit', (code, signal) => {
        this.exit = { code, signal, t: Date.now() }
        resolveExit(this.exit)
      })
    })
    return this
  }

  scans(since = 0) {
    return this.lines.filter(line => line.stream === 'stdout' && line.t >= since && REPORT.test(line.text))
  }

  stderr() {
    return this.lines.filter(line => line.stream === 'stderr').map(line => line.text)
  }

  probe() {
    try {
      return readFileSync(this.probeLog, 'utf8').trim().split('\n').filter(Boolean).map(line => JSON.parse(line))
    } catch {
      return []
    }
  }

  watcherHandles() {
    const samples = this.probe().filter(event => event.event === 'resources')
    const last = samples.at(-1)
    return last ? last.resources.filter(name => name === 'FSEventWrap').length : undefined
  }

  async waitFor(predicate, timeoutMs, stepMs = 50) {
    const deadline = Date.now() + timeoutMs
    while (Date.now() < deadline) {
      const value = predicate()
      if (value) return value
      if (this.exit) return predicate()
      await sleep(stepMs)
    }
    return predicate()
  }

  async nextScan(since, timeoutMs = 10_000) {
    return this.waitFor(() => this.scans(since)[0], timeoutMs)
  }

  async stableWatcherHandles(settleMs = 1_500) {
    await sleep(settleMs)
    return this.watcherHandles()
  }

  control(flag) {
    writeFileSync(join(this.dir, 'ctl', flag), '')
  }

  async requestExit(timeoutMs = 15_000) {
    const requestedAt = Date.now()
    this.control('app-exit')
    const exit = await Promise.race([this.exited, sleep(timeoutMs).then(() => undefined)])
    if (!exit) {
      this.child.kill()
      await this.exited
    }
    return this.shutdownFacts(requestedAt, Boolean(exit))
  }

  shutdownFacts(requestedAt, exitedInTime) {
    const events = this.probe()
    const beforeExit = events.find(event => event.event === 'beforeExit')
    const forced = events.find(event => event.event === 'process.exit')
    return {
      exitedInTime,
      exitCode: this.exit?.code,
      shutdownMs: this.exit ? this.exit.t - requestedAt : undefined,
      naturalDrain: Boolean(beforeExit),
      forcedProcessExit: Boolean(forced),
      handlesAtBeforeExit: beforeExit?.resources,
      handlesAtForcedExit: forced?.resources,
      pluginDisposedProbe: events.some(event => event.event === 'probe-stop'),
    }
  }

  async kill() {
    if (!this.exit) {
      this.child.kill()
      await this.exited
    }
  }
}

// ---------------------------------------------------------------- scenarios

const results = []
function record(id, title, checks, metrics = {}, notes = []) {
  const failed = checks.filter(check => !check.ok)
  const status = failed.length ? 'fail' : 'pass'
  results.push({ id, title, status, checks, metrics, notes })
  console.log(`\n[${status.toUpperCase()}] ${id}: ${title}`)
  for (const check of checks) console.log(`  ${check.ok ? 'ok  ' : 'FAIL'} ${check.name}${check.detail === undefined ? '' : ` — ${JSON.stringify(check.detail)}`}`)
  if (Object.keys(metrics).length) console.log(`  metrics ${JSON.stringify(metrics)}`)
  for (const note of notes) console.log(`  note: ${note}`)
}
const check = (name, ok, detail) => ({ name, ok: Boolean(ok), detail })
const wanted = id => !only || only.has(id)

async function scenarioInstall() {
  const checks = []
  rmSync(profileDir, { recursive: true, force: true })
  const packDir = join(workDir, 'pack')
  rmSync(packDir, { recursive: true, force: true })
  mkdirSync(packDir, { recursive: true })
  const pack = run('npm', ['pack', '--pack-destination', packDir, '--json'], { cwd: repoRoot })
  const tarball = readdirSync(packDir).find(name => name.endsWith('.tgz'))
  checks.push(check('npm pack produces a tarball', pack.code === 0 && tarball, pack.code === 0 ? tarball : pack.stderr.slice(-400)))
  if (!tarball) return record('install', 'bundle install into a pinned DSH profile', checks)

  const add = run(process.execPath, [dshBin, 'plugin', '--profile', profile, 'add', join(packDir, tarball)], {
    env: { ...process.env, DSH_HOME: dshHome, PATH: pathWithBin },
  })
  checks.push(check('dsh plugin add exits 0', add.code === 0, add.code === 0 ? undefined : (add.stderr + add.stdout).slice(-600)))
  let manifest = {}
  try {
    manifest = JSON.parse(readFileSync(join(profileDir, 'package.json'), 'utf8'))
  } catch {}
  checks.push(check('profile manifest lists dsh-roundtable-beta as a bundle layer', manifest.dsh?.profile?.bundles?.includes('dsh-roundtable-beta'), manifest.dsh?.profile?.bundles))

  const dump = run(process.execPath, [dshBin, '--profile', profile, '--dump-config'], {
    env: { ...process.env, DSH_HOME: dshHome, PATH: pathWithBin },
  })
  checks.push(check('--dump-config contains the roundtable-code-health row', dump.code === 0 && dump.stdout.includes('id: roundtable-code-health'), dump.code))
  record('install', 'bundle install into a pinned DSH profile', checks, { tarball })
}

async function scenarioConfigValidation() {
  const checks = []
  const root = seedWorkspace('config-validation')
  writeUserPatch(pluginConfigPatch(root, { debounceMs: 10 }))
  const dsh = new DshProcess('config-validation', { root }).start()
  const diagnostic = await dsh.waitFor(() => dsh.stderr().find(line => line.includes('roundtable-code-health (dsh-roundtable-beta)')), 20_000)
  await sleep(1_500)
  checks.push(check('invalid config (debounceMs: 10 < min 50) is reported as an inactive entry', diagnostic, diagnostic))
  checks.push(check('no scan runs with invalid config', dsh.scans().length === 0, dsh.scans().length))
  checks.push(check('no ledger is created with invalid config', !existsSync(join(root, '.roundtable', 'findings.json'))))
  const shutdown = await dsh.requestExit()
  checks.push(check('host keeps running and exits cleanly after the rejected entry', shutdown.exitCode === 0 && shutdown.naturalDrain, shutdown))
  const schemaText = dsh.stderr().filter(line => /debounceMs|expected|min/i.test(line)).slice(0, 3)
  record('config-validation', 'Schemastery config validation inside DSH', checks, {}, [
    `stderr lines mentioning the schema error: ${JSON.stringify(schemaText)}`,
  ])
}

async function scenarioLifecycle() {
  const checks = []
  const metrics = {}
  const root = seedWorkspace('lifecycle')
  writeUserPatch(pluginConfigPatch(root))
  const dsh = new DshProcess('lifecycle', { root }).start()
  try {
    const first = await dsh.nextScan(0, 30_000)
    metrics.bootToFirstScanMs = first ? first.t - dsh.startedAt : undefined
    const ledger = readLedger(root)
    checks.push(check('initial scan reported', first, first?.text))
    checks.push(check('ledger .roundtable/findings.json created with schemaVersion and 2 seeded findings', ledger.schemaVersion === '0.1' && ledger.findings?.length === 2, ledger.error ?? ledger.findings?.map(item => item.ruleId)))

    let since = Date.now()
    await sleep(2_500)
    checks.push(check('idle: ledger write does not retrigger a scan', dsh.scans(since).length === 0, dsh.scans(since).length))

    since = Date.now()
    writeFileSync(join(root, 'src', 'added.js'), '// @ts-ignore\nconst x = 1\n')
    const changed = await dsh.nextScan(since)
    metrics.changeToScanMs = changed ? changed.t - since : undefined
    await sleep(1_000)
    const afterChange = readLedger(root)
    checks.push(check('single file change triggers exactly one rescan', dsh.scans(since).length === 1, dsh.scans(since).length))
    checks.push(check('new finding recorded as baselineStatus=new', afterChange.findings?.some(item => item.ruleId === 'unexplained-ts-ignore' && item.baselineStatus === 'new')))

    since = Date.now()
    for (let index = 0; index < 30; index++) {
      writeFileSync(join(root, 'src', `burst-${index % 5}.js`), `export const v = ${index}\n`)
      await sleep(5)
    }
    metrics.burstWriteSpanMs = Date.now() - since
    await sleep(2_500)
    metrics.burstScans = dsh.scans(since).length
    checks.push(check('burst of 30 writes within debounce window coalesces into one scan', metrics.burstScans === 1, metrics.burstScans))

    since = Date.now()
    const sustainedUntil = since + 3_000
    while (Date.now() < sustainedUntil) {
      writeFileSync(join(root, 'src', 'sustained.js'), `export const t = ${Date.now()}\n`)
      await sleep(150)
    }
    metrics.scansDuringSustained3s = dsh.scans(since).length
    await sleep(1_500)
    metrics.scansAfterSustained = dsh.scans(since).length - metrics.scansDuringSustained3s
    checks.push(check('sustained edits (every 150 ms for 3 s) still produce a scan while editing (no starvation)', metrics.scansDuringSustained3s >= 1, metrics.scansDuringSustained3s))

    since = Date.now()
    mkdirSync(join(root, 'node_modules', 'pkg'), { recursive: true })
    writeFileSync(join(root, 'node_modules', 'pkg', 'index.js'), 'try { a() } catch (e) {}\n')
    mkdirSync(join(root, '.git'), { recursive: true })
    writeFileSync(join(root, '.git', 'index'), String(Date.now()))
    await sleep(1_500)
    checks.push(check('writes under ignored directories (node_modules, .git) do not trigger scans', dsh.scans(since).length === 0, dsh.scans(since).length))

    const handlesEnabled = await dsh.stableWatcherHandles()
    metrics.watcherHandlesEnabled = handlesEnabled

    since = Date.now()
    writeUserPatch(pluginConfigPatch(root, { debounceMs: 400 }))
    const reapplied = await dsh.nextScan(since, 15_000)
    metrics.hmrConfigReloadToScanMs = reapplied ? reapplied.t - since : undefined
    const handlesAfterConfig = await dsh.stableWatcherHandles()
    checks.push(check('HMR config change re-applies the plugin (fresh initial scan)', reapplied))
    checks.push(check('HMR config change does not leak a watcher', handlesAfterConfig === handlesEnabled, { handlesEnabled, handlesAfterConfig }))

    const cycles = []
    for (let cycle = 0; cycle < 5; cycle++) {
      writeUserPatch(`${pluginConfigPatch(root, { debounceMs: 400 })}  disabled: true\n`)
      const disabledHandles = await dsh.stableWatcherHandles(2_000)
      const probeSince = Date.now()
      writeFileSync(join(root, 'src', 'while-disabled.js'), `export const c = ${cycle}\n`)
      await sleep(1_200)
      const scansWhileDisabled = dsh.scans(probeSince).length
      const enableSince = Date.now()
      writeUserPatch(pluginConfigPatch(root, { debounceMs: 400 }))
      const reenabled = await dsh.nextScan(enableSince, 15_000)
      const enabledHandles = await dsh.stableWatcherHandles()
      cycles.push({ disabledHandles, scansWhileDisabled, reenabled: Boolean(reenabled), enabledHandles })
    }
    metrics.unloadCycles = cycles
    checks.push(check('HMR unload removes the plugin watcher (handle count drops)', cycles.every(item => item.disabledHandles < handlesEnabled), cycles.map(item => item.disabledHandles)))
    checks.push(check('no scans while the plugin is unloaded', cycles.every(item => item.scansWhileDisabled === 0), cycles.map(item => item.scansWhileDisabled)))
    checks.push(check('re-enable restarts scanning each cycle', cycles.every(item => item.reenabled)))
    checks.push(check('5 unload/reload cycles leak no watcher handles', cycles.every(item => item.enabledHandles === handlesEnabled), { handlesEnabled, after: cycles.map(item => item.enabledHandles) }))

    const shutdown = await dsh.requestExit()
    metrics.shutdown = shutdown
    checks.push(check('bounded app exit drains the event loop naturally (no hanging handle, no forced exit)', shutdown.exitCode === 0 && shutdown.naturalDrain && !shutdown.forcedProcessExit, shutdown))
    checks.push(check('no temporary ledger files left behind', temporaryFiles(root).length === 0, temporaryFiles(root)))
    const unexpectedErrors = dsh.stderr().filter(line => /roundtable/i.test(line) && !/did not activate/.test(line))
    checks.push(check('no plugin errors on stderr', unexpectedErrors.length === 0, unexpectedErrors.slice(0, 5)))
  } finally {
    await dsh.kill()
  }
  record('lifecycle', 'initial scan, file events, debounce, HMR unload/reload, clean shutdown', checks, metrics)
}

async function scenarioCustomLedgerPath() {
  const checks = []
  const root = seedWorkspace('custom-ledger')
  writeUserPatch(pluginConfigPatch(root, { ledgerPath: 'reports/findings.json' }))
  const dsh = new DshProcess('custom-ledger', { root }).start()
  try {
    const first = await dsh.nextScan(0, 30_000)
    checks.push(check('initial scan reported', first))
    const since = Date.now()
    await sleep(3_000)
    const idleScans = dsh.scans(since).length
    const ledger = readLedger(root, 'reports/findings.json')
    checks.push(check('custom ledgerPath: idle for 3 s causes no self-triggered rescans', idleScans === 0, idleScans))
    checks.push(check('custom ledgerPath: the ledger file is not scanned as source', !ledger.findings?.some(item => item.path === 'reports/findings.json'), ledger.findings?.map(item => item.path)))
    await dsh.requestExit()
  } finally {
    await dsh.kill()
  }
  record('custom-ledger-path', 'ledger outside .roundtable does not feed back into the watcher', checks)
}

async function scenarioCancellation() {
  const checks = []
  const metrics = {}
  const root = largeWorkspace('cancellation', 4_000)
  writeUserPatch(pluginConfigPatch(root, { watch: false }))
  // Establish a previous ledger so we can check it survives an aborted scan.
  const previous = { schemaVersion: '0.1', generatedAt: 'previous-run', root, coverage: {}, analyzer: {}, findings: [] }
  mkdirSync(join(root, '.roundtable'), { recursive: true })
  writeFileSync(join(root, '.roundtable', 'findings.json'), JSON.stringify(previous))
  const dsh = new DshProcess('cancellation', { root }).start()
  try {
    await dsh.waitFor(() => dsh.probe().some(event => event.event === 'probe-start'), 30_000)
    // The initial scan starts after debounceMs (250 ms); request exit shortly after so fast
    // CI disks cannot finish a 4000-file scan first. If they do, the check below fails honestly.
    await sleep(500)
    const scanStartedBeforeExit = dsh.scans().length === 0
    checks.push(check('exit is requested while the initial scan is still running', scanStartedBeforeExit))
    const shutdown = await dsh.requestExit(20_000)
    metrics.shutdown = shutdown
    const ledger = readLedger(root)
    metrics.ledgerGeneratedAt = ledger.generatedAt
    checks.push(check('active scan is cancelled: exit completes within the 5 s host grace without a forced process.exit', shutdown.naturalDrain && !shutdown.forcedProcessExit && shutdown.shutdownMs < 5_000, shutdown))
    checks.push(check('cancelled scan does not overwrite the previous ledger', ledger.generatedAt === 'previous-run', ledger.generatedAt ?? ledger.error))
    checks.push(check('no temporary ledger files left behind', temporaryFiles(root).length === 0, temporaryFiles(root)))
  } finally {
    await dsh.kill()
  }
  record('cancellation', 'unload during an active full scan (4000 x 64 KB files)', checks, metrics)
}

async function scenarioRootRemoved() {
  const checks = []
  const root = seedWorkspace('root-removed')
  writeUserPatch(pluginConfigPatch(root))
  const dsh = new DshProcess('root-removed', { root }).start()
  try {
    await dsh.nextScan(0, 30_000)
    await sleep(500)
    let moved = false
    try {
      renameSync(root, `${root}-moved`)
      moved = true
    } catch (error) {
      checks.push(check('watched root can be renamed while watched', false, error.code))
    }
    if (moved) {
      await sleep(3_000)
      checks.push(check('host process survives removal of the watched root', !dsh.exit, dsh.exit))
      const shutdown = dsh.exit ? undefined : await dsh.requestExit()
      if (shutdown) checks.push(check('host still exits cleanly afterwards', shutdown.exitCode === 0 && shutdown.naturalDrain, shutdown))
      const crash = dsh.stderr().filter(line => /Error|EPERM|ENOENT|uncaught/i.test(line)).slice(0, 6)
      record('root-removed', 'watched workspace root renamed away while DSH runs', checks, {}, [`stderr: ${JSON.stringify(crash)}`])
      rmSync(`${root}-moved`, { recursive: true, force: true })
      return
    }
  } finally {
    await dsh.kill()
  }
  record('root-removed', 'watched workspace root renamed away while DSH runs', checks)
}

async function scenarioInterrupt() {
  const checks = []
  const root = seedWorkspace('interrupt')
  writeUserPatch(pluginConfigPatch(root))
  const dsh = new DshProcess('interrupt', { root }).start()
  try {
    await dsh.nextScan(0, 30_000)
    await sleep(500)
    const requestedAt = Date.now()
    dsh.control('sigint')
    const exit = await Promise.race([dsh.exited, sleep(15_000).then(() => undefined)])
    const facts = dsh.shutdownFacts(requestedAt, Boolean(exit))
    checks.push(check('SIGINT handler disposes the tree (probe disposer ran) and exits 130', facts.pluginDisposedProbe && facts.exitCode === 130, facts))
    checks.push(check('interrupt exit is prompt (< 5 s host grace, i.e. disposal did not hang)', facts.shutdownMs !== undefined && facts.shutdownMs < 5_000, facts.shutdownMs))
    const stopped = dsh.lines.some(line => line.stream === 'stdout' && line.text.startsWith('[roundtable-code-health] stopped'))
    checks.push(check('plugin disposer completed before exit (plugin logged "stopped")', stopped))
    record('interrupt', 'SIGINT path (emulated in-process via process.emit, see notes)', checks, {
      fsEventHandlesAtForcedExit: facts.handlesAtForcedExit?.filter(name => name === 'FSEventWrap').length,
    }, [
      'SIGINT is emitted inside the DSH process by the probe; DSH itself calls process.exit(130) after disposal (interrupt path), so natural drain is not expected here.',
      'FSEventWrap handles still listed at process.exit are not proof of a leak: libuv closes FS event handles asynchronously, and DSH-owned watchers are counted too.',
    ])
    return
  } finally {
    await dsh.kill()
  }
}

// ---------------------------------------------------------------- main

const environment = {
  label: args.label,
  startedAt: new Date().toISOString(),
  platform: process.platform,
  release: (await import('node:os')).release(),
  arch: process.arch,
  node: process.version,
  dsh: packageVersion('@deepseek-ai/dsh'),
  dshAppBoot: packageVersion('@deepseek-ai/dsh-app-boot'),
  dshBase: packageVersion('@deepseek-ai/dsh-base'),
  cordis: packageVersion('@deepseek-ai/cordis'),
  cordisLoader: packageVersion('@deepseek-ai/cordis-plugin-loader'),
  cordisHmr: packageVersion('@deepseek-ai/cordis-plugin-hmr'),
  pnpm: run('pnpm', ['--version'], { env: { ...process.env, PATH: pathWithBin } }).stdout.trim(),
  pluginCommit: run('git', ['rev-parse', 'HEAD'], { cwd: repoRoot }).stdout.trim(),
  pluginDirty: run('git', ['status', '--porcelain', '--', 'index.js', 'lib', 'package.json', 'cordis.patch.yml'], { cwd: repoRoot }).stdout.trim() !== '',
}
console.log(`environment ${JSON.stringify(environment)}`)

const scenarios = [
  ['install', scenarioInstall],
  ['config-validation', scenarioConfigValidation],
  ['lifecycle', scenarioLifecycle],
  ['custom-ledger-path', scenarioCustomLedgerPath],
  ['cancellation', scenarioCancellation],
  ['root-removed', scenarioRootRemoved],
  ['interrupt', scenarioInterrupt],
]
if (args['skip-install'] && !existsSync(join(profileDir, 'package.json'))) {
  console.error('--skip-install requires an installed profile')
  process.exit(2)
}
for (const [id, scenario] of scenarios) {
  if (id === 'install' && args['skip-install']) continue
  if (!wanted(id)) continue
  try {
    await scenario()
  } catch (error) {
    record(id, 'harness error', [check('scenario completed without harness error', false, String(error?.stack ?? error))])
  }
}
writeUserPatch('[]\n')

const summary = { environment, results, finishedAt: new Date().toISOString() }
const resultPath = join(workDir, `results-${args.label || 'run'}.json`)
writeFileSync(resultPath, `${JSON.stringify(summary, null, 2)}\n`)
const failed = results.filter(result => result.status !== 'pass')

// In GitHub Actions, publish one annotation per scenario: annotations of public repositories
// are readable through the REST API without authentication, unlike logs and artifacts.
if (process.env.GITHUB_ACTIONS === 'true') {
  const escape = text => String(text).replaceAll('%', '%25').replaceAll('\r', '%0D').replaceAll('\n', '%0A')
  const platform = `${environment.platform}-${environment.arch} node ${environment.node}`
  for (const result of results) {
    const lines = result.checks.map(item => `${item.ok ? 'ok' : 'FAIL'} ${item.name}${item.detail === undefined ? '' : ` — ${JSON.stringify(item.detail).slice(0, 300)}`}`)
    if (Object.keys(result.metrics).length) lines.push(`metrics ${JSON.stringify(result.metrics).slice(0, 1500)}`)
    const level = result.status === 'pass' ? 'notice' : 'error'
    console.log(`::${level} title=${escape(`dsh-runtime ${platform} ${result.id} ${result.status}`)}::${escape(lines.join('\n'))}`)
  }
  console.log(`::notice title=${escape(`dsh-runtime ${platform} summary`)}::${escape(`${results.length - failed.length}/${results.length} passed; env ${JSON.stringify(environment)}`)}`)
}
console.log(`\n${results.length - failed.length}/${results.length} scenarios passed; results: ${resultPath}`)
process.exitCode = failed.length ? 1 : 0
