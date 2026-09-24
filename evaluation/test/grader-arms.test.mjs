import assert from 'node:assert/strict'
import test from 'node:test'
import { createReferenceArm, createScriptedArm, deterministicArm, loadScripts, MECHANICS_ONLY, noopArm } from '../src/arms.mjs'
import { gradePatch } from '../src/grader.mjs'
import { buildReport, runArms } from '../src/runner.mjs'
import { loadTask } from '../src/tasks.mjs'

const paginate = await loadTask('t03-paginate')

test('grader rejects patches that touch hidden tests or escape the work directory', async () => {
  const touchTests = await gradePatch(paginate, { type: 'files', files: { 'acceptance/acceptance.mjs': "import test from 'node:test'\ntest('x', () => {})\n" } })
  assert.equal(touchTests.outcome, 'patch-rejected')
  assert.equal(touchTests.pass, false)
  const escape = await gradePatch(paginate, { type: 'files', files: { '../outside.mjs': 'x' } })
  assert.equal(escape.outcome, 'patch-rejected')
  const garbage = await gradePatch(paginate, { type: 'unified-diff', diff: '--- a/src/paginate.mjs\n+++ b/src/paginate.mjs\n@@ -1,1 +1,1 @@\n-no such line\n+x\n' })
  assert.equal(garbage.outcome, 'patch-rejected')
})

test('grader times out a hanging solution and counts it as a failure', async () => {
  const task = { ...paginate, timeoutMs: 1500 }
  const hang = await gradePatch(task, { type: 'files', files: { 'src/paginate.mjs': 'while (true) {}\nexport function paginate() {}\n' } })
  assert.equal(hang.outcome, 'timeout')
  assert.equal(hang.pass, false)
})

test('grader does not pass the parent environment to tested code', async () => {
  process.env.RT_EVAL_FAKE_SECRET = 'should-not-leak'
  try {
    const probe = await gradePatch(paginate, {
      type: 'files',
      files: { 'src/paginate.mjs': "if (process.env.RT_EVAL_FAKE_SECRET) throw new Error('env leaked')\nexport function paginate() { return {} }\n" },
    })
    assert.equal(probe.outcome, 'tests-failed')
    assert.doesNotMatch(probe.output, /env leaked/)
  } finally {
    delete process.env.RT_EVAL_FAKE_SECRET
  }
})

test('baseline arms: noop and deterministic change nothing, reference passes, deterministic reports findings', async () => {
  const tasks = [paginate, await loadTask('t02-parse-duration')]
  const rows = await runArms({ tasks, arms: [noopArm, deterministicArm, createReferenceArm(new Map(tasks.map(task => [task.id, task])))] })
  const byArm = arm => rows.filter(row => row.arm === arm)
  assert.ok(byArm('noop').every(row => !row.pass && row.changedLines === 0))
  assert.ok(byArm('deterministic').every(row => !row.pass && row.changedLines === 0))
  assert.ok(byArm('reference').every(row => row.pass))
  const stubFindings = byArm('deterministic').find(row => row.taskId === 't02-parse-duration').trace.findings
  assert.ok(stubFindings.some(finding => finding.ruleId === 'not-implemented-stub'))
})

test('scripted arms exercise review, correction limit, round limit and budget; reports say mechanics only', async () => {
  const scripts = await loadScripts()
  const ids = ['t01-slugify', 't03-paginate', 't05-csv-parse', 't06-retry-backoff', 't07-interval-merge', 't12-html-escape', 't02-parse-duration']
  const tasks = await Promise.all(ids.map(id => loadTask(id)))
  const arms = ['direct', 'reviewed', 'team'].map(mode => createScriptedArm(mode, scripts))
  const budget = { maxRounds: 2, maxCostUnits: 50, maxLatencyMs: 60_000 }
  const rows = await runArms({ tasks, arms, budget })
  const row = (arm, task) => rows.find(item => item.arm === `scripted-${arm}` && item.taskId === task)

  // Review catches a gap, one correction fixes it.
  assert.equal(row('direct', 't03-paginate').pass, false)
  assert.equal(row('reviewed', 't03-paginate').pass, true)
  assert.equal(row('reviewed', 't03-paginate').usage.modelCalls, 4)
  // Correct first attempt: review only adds cost.
  assert.equal(row('direct', 't12-html-escape').pass, true)
  assert.equal(row('reviewed', 't12-html-escape').pass, true)
  assert.ok(row('reviewed', 't12-html-escape').usage.costUnits > row('direct', 't12-html-escape').usage.costUnits)
  // Correlated miss: reviewer approves a wrong patch.
  assert.equal(row('reviewed', 't01-slugify').pass, false)
  // Correction limit: exactly one correction even though the reviewer keeps rejecting.
  const csv = row('reviewed', 't05-csv-parse')
  assert.equal(csv.pass, false)
  assert.equal(csv.trace.calls.filter(call => call.role === 'worker').length, 2)
  assert.match(csv.trace.stop, /correction limit/)
  // Budget: an over-budget worker call is not made and never becomes success.
  const expensive = row('direct', 't06-retry-backoff')
  assert.equal(expensive.status, 'budget-exhausted')
  assert.equal(expensive.pass, false)
  assert.equal(expensive.usage.costUnits, 0)
  // Team: challenger rejects then approves within the round limit; Direct keeps the first wrong patch.
  assert.equal(row('team', 't07-interval-merge').pass, true)
  assert.equal(row('team', 't07-interval-merge').trace.calls.filter(call => call.role === 'challenger').length, 2)
  assert.equal(row('direct', 't07-interval-merge').pass, false)
  // Team without a planner script refuses rather than improvising.
  assert.equal(row('team', 't03-paginate').status, 'refused')
  // No script: refusal is graded as a failure and stays in the denominator.
  assert.equal(row('reviewed', 't02-parse-duration').status, 'refused')
  assert.equal(row('reviewed', 't02-parse-duration').pass, false)

  const report = buildReport({ rows, arms, comparisons: [['scripted-direct', 'scripted-reviewed']] })
  assert.match(report.evidenceStatement, new RegExp(MECHANICS_ONLY))
  assert.equal(report.arms['scripted-reviewed'].warning, MECHANICS_ONLY)
  assert.equal(report.comparisons[0].warning, MECHANICS_ONLY)
  assert.equal(report.arms['scripted-direct'].tasks, ids.length, 'refusals and budget stops stay in the denominator')
})
