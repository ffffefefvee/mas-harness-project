#!/usr/bin/env node
// Offline evaluation CLI. No network, no model providers, no API keys.
//
//   node evaluation/src/cli.mjs validate                   reference passes, empty patch fails, for every task
//   node evaluation/src/cli.mjs code-health [--write]      analyzer precision/recall on the labelled corpus
//   node evaluation/src/cli.mjs run [--arms a,b] [--tasks t01,t02] [--write]
//   node evaluation/src/cli.mjs power [--delta 0.1] [--discordant 0.2,0.3,0.4] [--power 0.8] [--alpha 0.05]
//   node evaluation/src/cli.mjs list
import { mkdir, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { parseArgs } from 'node:util'
import { createReferenceArm, createScriptedArm, deterministicArm, DEFAULT_BUDGET, loadScripts, MECHANICS_ONLY, noopArm } from './arms.mjs'
import { formatCodeHealth, measureCodeHealth } from './code-health.mjs'
import { gradePatch } from './grader.mjs'
import { buildReport, runArms } from './runner.mjs'
import { mcnemarExactSampleSize, mcnemarSampleSize } from './stats.mjs'
import { loadAllTasks, referencePatch } from './tasks.mjs'

const RESULTS_DIR = fileURLToPath(new URL('../results/', import.meta.url))
const [command = 'help', ...rest] = process.argv.slice(2)
const { values } = parseArgs({
  args: rest,
  options: {
    arms: { type: 'string' },
    tasks: { type: 'string' },
    write: { type: 'boolean', default: false },
    delta: { type: 'string', default: '0.1' },
    discordant: { type: 'string', default: '0.15,0.2,0.3,0.4' },
    power: { type: 'string', default: '0.8' },
    alpha: { type: 'string', default: '0.05' },
    'max-cost': { type: 'string' },
  },
})

async function save(name, data) {
  await mkdir(RESULTS_DIR, { recursive: true })
  const path = `${RESULTS_DIR}${name}`
  await writeFile(path, typeof data === 'string' ? data : `${JSON.stringify(data, null, 2)}\n`)
  console.log(`wrote ${path}`)
}

async function selectTasks() {
  const tasks = await loadAllTasks()
  if (!values.tasks) return tasks
  const wanted = values.tasks.split(',')
  return tasks.filter(task => wanted.some(prefix => task.id.startsWith(prefix)))
}

async function validate() {
  const tasks = await selectTasks()
  let failures = 0
  for (const task of tasks) {
    const reference = await gradePatch(task, await referencePatch(task))
    const empty = await gradePatch(task, null)
    const ok = reference.pass && !empty.pass
    if (!ok) failures += 1
    console.log(`${ok ? 'ok  ' : 'FAIL'} ${task.id.padEnd(32)} ${task.class.padEnd(19)} reference=${reference.outcome} (${reference.tests?.pass}/${reference.tests?.tests}) empty=${empty.outcome} (${empty.tests?.fail}/${empty.tests?.tests} failing)`)
  }
  console.log(`${tasks.length - failures}/${tasks.length} tasks valid`)
  process.exitCode = failures ? 1 : 0
}

async function codeHealth() {
  const report = await measureCodeHealth()
  console.log(formatCodeHealth(report))
  console.log(`\n${report.statement}`)
  for (const outcome of report.outcomes.filter(item => item.fp || item.fn)) {
    console.log(`  ${outcome.fp ? 'FP' : 'FN'} ${outcome.id.padEnd(8)} ${outcome.rule.padEnd(26)} expected=${outcome.expected} found=${outcome.found}  ${outcome.note}`)
  }
  if (values.write) {
    await save('code-health.json', report)
    await save('code-health.md', `${formatCodeHealth(report)}\n`)
  }
}

async function run() {
  const tasks = await selectTasks()
  const tasksById = new Map(tasks.map(task => [task.id, task]))
  const scripts = await loadScripts()
  const available = {
    noop: noopArm,
    reference: createReferenceArm(tasksById),
    deterministic: deterministicArm,
    'scripted-direct': createScriptedArm('direct', scripts),
    'scripted-reviewed': createScriptedArm('reviewed', scripts),
    'scripted-team': createScriptedArm('team', scripts),
  }
  const armIds = values.arms ? values.arms.split(',') : ['noop', 'deterministic', 'reference']
  const arms = armIds.map(id => {
    if (!available[id]) throw new Error(`unknown arm ${id}; available: ${Object.keys(available).join(', ')}`)
    return available[id]
  })
  const budget = { ...DEFAULT_BUDGET, ...(values['max-cost'] ? { maxCostUnits: Number(values['max-cost']) } : {}) }
  const rows = await runArms({ tasks, arms, budget })
  const comparisons = []
  for (let index = 1; index < armIds.length; index++) comparisons.push([armIds[index - 1], armIds[index]])
  const report = buildReport({ rows, arms, comparisons, meta: { budget, node: process.version, platform: `${process.platform}-${process.arch}` } })
  console.log(report.evidenceStatement)
  for (const [id, summary] of Object.entries(report.arms)) {
    const rate = summary.passRate
    console.log(`${id.padEnd(18)} ${summary.evidence.padEnd(15)} pass ${summary.passed}/${summary.tasks} [${(rate.low * 100).toFixed(0)}–${(rate.high * 100).toFixed(0)}%] outcomes=${JSON.stringify(summary.outcomes)} cost/accepted=${summary.costPerAccepted.value ?? 'n/a'}${summary.warning ? `  (${summary.warning})` : ''}`)
  }
  for (const comparison of report.comparisons) {
    const diff = comparison.diffPassRate
    console.log(`${comparison.armB} vs ${comparison.armA}: n=${comparison.pairedTasks} onlyA=${comparison.onlyAPassed} onlyB=${comparison.onlyBPassed} McNemar p=${comparison.mcnemar.pValue.toFixed(4)} diff=${diff.estimate?.toFixed(3)} [${diff.low?.toFixed(3)}, ${diff.high?.toFixed(3)}]${comparison.warning ? `  (${comparison.warning})` : ''}`)
  }
  if (values.write) {
    const name = arms.some(arm => arm.evidence === 'mechanics-only') ? 'agent-arms-mechanics-only.json' : 'baseline-arms.json'
    await save(name, report)
  }
}

function power() {
  const alpha = Number(values.alpha)
  const target = Number(values.power)
  const delta = Number(values.delta)
  console.log(`Paired design, two-sided alpha=${alpha}, power=${target}, true pass-rate difference delta=${delta}`)
  console.log('discordant = share of tasks where the two arms disagree (p10 + p01)')
  for (const discordant of values.discordant.split(',').map(Number)) {
    const approx = mcnemarSampleSize({ delta, discordant, alpha, power: target })
    const exact = mcnemarExactSampleSize({ delta, discordant, alpha, power: target })
    console.log(`  discordant=${discordant.toFixed(2)}  normal-approx n=${approx.n}  exact-McNemar n=${exact.n ?? '>max'}`)
  }
}

async function list() {
  for (const task of await loadAllTasks()) console.log(`${task.id.padEnd(32)} ${task.class.padEnd(19)} minMode=${task.labels.minimumSafeMode.padEnd(9)} ${task.title}`)
}

const commands = { validate, 'code-health': codeHealth, run, power, list }
if (!commands[command]) {
  console.log('usage: node evaluation/src/cli.mjs <validate|code-health|run|power|list> [options]')
  console.log(`scripted arms are ${MECHANICS_ONLY}`)
  process.exitCode = command === 'help' ? 0 : 2
} else {
  await commands[command]()
}
