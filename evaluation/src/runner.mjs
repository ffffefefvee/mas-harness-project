// Runs arms over tasks, grades every outcome, and builds paired comparison reports.
import { MECHANICS_ONLY } from './arms.mjs'
import { gradePatch } from './grader.mjs'
import { costPerAccepted, latencySummary, mcnemarExact, pairedBootstrapDiff, wilson } from './stats.mjs'
import { publicView } from './tasks.mjs'

/** Run every arm on every task. Arm errors become failed results, never skipped rows. */
export async function runArms({ tasks, arms, budget }) {
  const rows = []
  for (const task of tasks) {
    const view = await publicView(task)
    for (const arm of arms) {
      let armResult
      try {
        armResult = await arm.run(view, budget)
      } catch (error) {
        armResult = { patch: null, usage: {}, latencyMs: null, transcriptRef: null, status: 'error', error: String(error?.message ?? error) }
      }
      const grade = armResult.status === 'error'
        ? { pass: false, outcome: 'arm-error', changedLines: 0, filesChanged: 0 }
        : await gradePatch(task, armResult.patch)
      rows.push({
        taskId: task.id,
        taskClass: task.class,
        minimumSafeMode: task.labels.minimumSafeMode,
        arm: arm.id,
        evidence: arm.evidence,
        status: armResult.status,
        pass: grade.pass,
        outcome: grade.outcome,
        changedLines: grade.changedLines,
        filesChanged: grade.filesChanged,
        latencyMs: armResult.latencyMs,
        gradeMs: grade.durationMs,
        usage: armResult.usage,
        transcriptRef: armResult.transcriptRef,
        trace: armResult.trace,
        error: armResult.error ?? grade.error,
      })
    }
  }
  return rows
}

function armSummary(rows) {
  const passes = rows.map(row => row.pass)
  const k = passes.filter(Boolean).length
  return {
    tasks: rows.length,
    passed: k,
    passRate: wilson(k, rows.length),
    outcomes: Object.fromEntries([...new Set(rows.map(row => row.outcome))].map(outcome => [outcome, rows.filter(row => row.outcome === outcome).length])),
    latencyMs: latencySummary(rows.map(row => row.latencyMs)),
    costPerAccepted: costPerAccepted(rows.map(row => row.usage?.costUnits ?? 0), passes),
    modelCalls: rows.reduce((sum, row) => sum + (row.usage?.modelCalls ?? 0), 0),
    changedLinesMedian: latencySummary(rows.map(row => row.changedLines)).p50,
  }
}

/** Paired comparison of arm B against arm A on the tasks both were run on. */
export function comparePaired(rows, armA, armB, { seed = 1, iterations = 10_000 } = {}) {
  const byTask = new Map()
  for (const row of rows) {
    if (row.arm !== armA && row.arm !== armB) continue
    const entry = byTask.get(row.taskId) ?? {}
    entry[row.arm] = row
    byTask.set(row.taskId, entry)
  }
  const pairs = [...byTask.values()].filter(entry => entry[armA] && entry[armB])
  const a = pairs.map(entry => entry[armA].pass)
  const b = pairs.map(entry => entry[armB].pass)
  const onlyA = pairs.filter(entry => entry[armA].pass && !entry[armB].pass).length
  const onlyB = pairs.filter(entry => !entry[armA].pass && entry[armB].pass).length
  return {
    armA,
    armB,
    pairedTasks: pairs.length,
    onlyAPassed: onlyA,
    onlyBPassed: onlyB,
    mcnemar: mcnemarExact(onlyA, onlyB),
    diffPassRate: pairedBootstrapDiff(a, b, { seed, iterations }),
  }
}

export function buildReport({ rows, arms, comparisons = [], meta = {} }) {
  const byArm = {}
  for (const arm of arms) byArm[arm.id] = { evidence: arm.evidence, ...(arm.evidence === 'mechanics-only' ? { warning: MECHANICS_ONLY } : {}), ...armSummary(rows.filter(row => row.arm === arm.id)) }
  const byClass = {}
  for (const taskClass of [...new Set(rows.map(row => row.taskClass))].sort()) {
    byClass[taskClass] = Object.fromEntries(arms.map(arm => {
      const subset = rows.filter(row => row.arm === arm.id && row.taskClass === taskClass)
      return [arm.id, { passed: subset.filter(row => row.pass).length, tasks: subset.length }]
    }))
  }
  const containsMechanicsOnly = arms.some(arm => arm.evidence === 'mechanics-only')
  return {
    schemaVersion: '0.1',
    generatedAt: new Date().toISOString(),
    evidenceStatement: containsMechanicsOnly
      ? `This report contains scripted arms: ${MECHANICS_ONLY}. Only noop/reference/deterministic rows are measurements.`
      : 'Deterministic arms only: measurements of the corpus and deterministic checks, not of any model.',
    ...meta,
    arms: byArm,
    byClass,
    comparisons: comparisons.map(([a, b]) => {
      const involvesMechanics = [a, b].some(id => byArm[id]?.evidence === 'mechanics-only')
      return { ...comparePaired(rows, a, b), ...(involvesMechanics ? { warning: MECHANICS_ONLY } : {}) }
    }),
    rows,
  }
}
