// Grader: copy fixture to a temporary directory, apply a patch, add hidden acceptance tests,
// run them in a subprocess with a timeout, and report pass/fail, changed lines, and time.
//
// Isolation (defense in depth, not a security sandbox): patches cannot write outside the work
// directory or into acceptance/ or .git; the test subprocess runs with a minimal environment
// (no inherited API keys) and, when supported, under Node's permission model restricted to the
// work directory with no child processes, workers, or addons. Network is not blocked by Node's
// permission model; only trusted corpus code and patches should be graded until the Direct-mode
// sandbox (docs/product 03 §7) exists.
import { spawn } from 'node:child_process'
import { cp, mkdtemp, readdir, realpath, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { PatchError, applyPatch } from './patch.mjs'

export const ACCEPTANCE_DIR = 'acceptance'
const OUTPUT_LIMIT = 64 * 1024
const permissionSupported = process.allowedNodeEnvironmentFlags.has('--permission')

// `process.allowedNodeEnvironmentFlags` lists only NODE_OPTIONS-eligible flags, and the test
// isolation flag is not one on Node 22.19 although the CLI accepts it (renamed from
// --experimental-test-isolation in Node 23.6). Pick it by version instead of by that set.
function testIsolationFlag() {
  const [major, minor] = process.versions.node.split('.').map(Number)
  if (major > 23 || (major === 23 && minor >= 6)) return '--test-isolation=none'
  if (major > 22 || (major === 22 && minor >= 8)) return '--experimental-test-isolation=none'
  return undefined
}

function minimalEnvironment() {
  const keep = ['PATH', 'Path', 'SystemRoot', 'SYSTEMROOT', 'TEMP', 'TMP', 'TMPDIR', 'HOME', 'USERPROFILE', 'LANG']
  const env = { NODE_ENV: 'test', NO_COLOR: '1' }
  for (const key of keep) if (process.env[key] !== undefined) env[key] = process.env[key]
  return env
}

function runTests(workDir, files, timeoutMs) {
  return new Promise(resolveRun => {
    // `node --test` runs each file in a child process; `--test-isolation=none` keeps the tests in
    // this one permission-restricted process instead of needing --allow-child-process.
    const args = []
    const isolation = testIsolationFlag()
    // Without in-process isolation the runner must spawn children, which --permission forbids.
    if (permissionSupported && isolation) args.push('--permission', `--allow-fs-read=${workDir}`, `--allow-fs-write=${workDir}`)
    if (isolation) args.push(isolation)
    args.push('--test', '--test-reporter=tap', ...files)
    const started = performance.now()
    const child = spawn(process.execPath, args, { cwd: workDir, env: minimalEnvironment(), stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true })
    let stdout = ''
    let stderr = ''
    const append = (current, chunk) => (current.length < OUTPUT_LIMIT ? current + chunk : current)
    child.stdout.setEncoding('utf8').on('data', chunk => { stdout = append(stdout, chunk) })
    child.stderr.setEncoding('utf8').on('data', chunk => { stderr = append(stderr, chunk) })
    let timedOut = false
    const timer = setTimeout(() => {
      timedOut = true
      child.kill('SIGKILL')
    }, timeoutMs)
    child.on('error', error => {
      clearTimeout(timer)
      resolveRun({ exitCode: null, timedOut, stdout, stderr: `${stderr}${error}`, durationMs: performance.now() - started })
    })
    child.on('close', exitCode => {
      clearTimeout(timer)
      resolveRun({ exitCode, timedOut, stdout, stderr, durationMs: performance.now() - started })
    })
  })
}

function tapCounts(stdout) {
  const count = name => {
    const match = new RegExp(`^# ${name} (\\d+)`, 'm').exec(stdout)
    return match ? Number(match[1]) : null
  }
  return { tests: count('tests'), pass: count('pass'), fail: count('fail'), cancelled: count('cancelled') }
}

/**
 * Grade one patch against one task. Never throws for patch or test failures: every outcome is
 * a result with `pass: false` and an `outcome` reason, so failures stay in denominators.
 */
export async function gradePatch(task, patch, { keepWorkDir = false } = {}) {
  const started = performance.now()
  // Canonical path: on macOS tmpdir() is under the /var -> /private/var symlink, and the
  // permission model checks resolved paths, so an --allow-fs-read on the symlinked path denies
  // everything (observed in CI: "Could not find 'acceptance/acceptance.mjs'").
  const workDir = await realpath(await mkdtemp(join(tmpdir(), `rt-eval-${task.id}-`)))
  try {
    await cp(task.repoDir, workDir, { recursive: true })
    let changes
    try {
      changes = await applyPatch(workDir, patch, { protectedPrefixes: [`${ACCEPTANCE_DIR}/`] })
    } catch (error) {
      if (!(error instanceof PatchError)) throw error
      return { taskId: task.id, pass: false, outcome: 'patch-rejected', error: error.message, changedLines: 0, filesChanged: 0, durationMs: performance.now() - started }
    }
    await cp(task.acceptanceDir, join(workDir, ACCEPTANCE_DIR), { recursive: true })
    const testFiles = (await readdir(join(workDir, ACCEPTANCE_DIR))).filter(name => name.endsWith('.mjs')).sort().map(name => join(ACCEPTANCE_DIR, name))
    const run = await runTests(workDir, testFiles, task.timeoutMs)
    const counts = tapCounts(run.stdout)
    const pass = !run.timedOut && run.exitCode === 0 && counts.fail === 0 && (counts.tests ?? 0) > 0
    return {
      taskId: task.id,
      pass,
      outcome: run.timedOut ? 'timeout' : pass ? 'pass' : 'tests-failed',
      exitCode: run.exitCode,
      tests: counts,
      changedLines: changes.added + changes.removed,
      linesAdded: changes.added,
      linesRemoved: changes.removed,
      filesChanged: changes.files.filter(file => file.added + file.removed > 0 || file.created || file.deleted).length,
      testDurationMs: Math.round(run.durationMs),
      durationMs: Math.round(performance.now() - started),
      permissionModel: permissionSupported,
      output: pass ? undefined : `${run.stdout.slice(-4000)}${run.stderr ? `\n--- stderr ---\n${run.stderr.slice(-2000)}` : ''}`,
      workDir: keepWorkDir ? workDir : undefined,
    }
  } finally {
    if (!keepWorkDir) await rm(workDir, { recursive: true, force: true })
  }
}
