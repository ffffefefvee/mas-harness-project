// Regenerates evaluation/fixtures/scripted-responses.json.
// The responses are hand-written stand-ins for model output. They exist to exercise workflow
// mechanics (review loop, correction limit, round limit, cost budget, refusal) and the unified
// diff path of the grader. They are NOT model output and NOT quality evidence.
//
//   node evaluation/fixtures/build-scripted-responses.mjs
import { writeFile } from 'node:fs/promises'
import { createUnifiedDiffForFiles } from '../src/patch.mjs'
import { loadTask, readTree } from '../src/tasks.mjs'
import { SCRIPTS_PATH } from '../src/arms.mjs'

async function diffTo(taskId, replacements) {
  const task = await loadTask(taskId)
  const before = await readTree(task.repoDir)
  const after = { ...before, ...replacements }
  return { type: 'unified-diff', diff: createUnifiedDiffForFiles(before, after) }
}

async function referenceDiff(taskId) {
  const task = await loadTask(taskId)
  return diffTo(taskId, await readTree(task.referenceDir))
}

const usage = (costUnits, inputTokens = 800, outputTokens = 300) => ({ inputTokens, outputTokens, costUnits })

const paginatePartial = `export function paginate(items, page, pageSize) {
  const start = (page - 1) * pageSize
  const pages = Math.ceil(items.length / pageSize)
  return { items: items.slice(start, start + pageSize), page, pages }
}
`

const slugifyWrong = `export function slugify(title) {
  return title.toLowerCase().replace(/[^a-z0-9]+/g, '-')
}
`

const intervalsWrong = `export function mergeIntervals(intervals) {
  const merged = []
  for (const [start, end] of intervals) {
    const last = merged.at(-1)
    if (last && start < last[1]) last[1] = Math.max(last[1], end)
    else merged.push([start, end])
  }
  return merged
}
`

const scripts = {
  schemaVersion: '0.1',
  evidence: 'mechanics-only',
  note: 'Hand-written responses replayed by scripted arms; mechanics only, not quality evidence.',
  tasks: {
    // Review catches a real gap and one correction round fixes it: Direct fails, Reviewed passes.
    't03-paginate': {
      worker: [
        { patch: await diffTo('t03-paginate', { 'src/paginate.mjs': paginatePartial }), usage: usage(4) },
        { patch: await referenceDiff('t03-paginate'), usage: usage(4) },
      ],
      reviewer: [
        { verdict: 'request-changes', findings: ['pageSize and page are not validated (RangeError required)'], usage: usage(2) },
        { verdict: 'approve', usage: usage(2) },
      ],
    },
    // Worker is right first time and the reviewer approves: review only adds cost.
    't12-html-escape': {
      worker: [{ patch: await referenceDiff('t12-html-escape'), usage: usage(5) }],
      reviewer: [{ verdict: 'approve', usage: usage(2) }],
    },
    // Worker is wrong and the reviewer misses it: correlated miss, both modes fail.
    't01-slugify': {
      worker: [{ patch: await diffTo('t01-slugify', { 'src/slug.mjs': slugifyWrong }), usage: usage(3) }],
      reviewer: [{ verdict: 'approve', usage: usage(2) }],
    },
    // Reviewer keeps requesting changes: the single correction limit stops the loop.
    't05-csv-parse': {
      worker: [
        { patch: await diffTo('t05-csv-parse', {}), usage: usage(3) },
        { patch: await diffTo('t05-csv-parse', {}), usage: usage(3) },
        { patch: await referenceDiff('t05-csv-parse'), usage: usage(3) },
      ],
      reviewer: [
        { verdict: 'request-changes', usage: usage(2) },
        { verdict: 'request-changes', usage: usage(2) },
      ],
    },
    // Team: challenger rejects the first attempt, the second is approved.
    't07-interval-merge': {
      planner: { verdict: 'plan', usage: usage(3) },
      worker: [
        { patch: await diffTo('t07-interval-merge', { 'src/intervals.mjs': intervalsWrong }), usage: usage(4) },
        { patch: await referenceDiff('t07-interval-merge'), usage: usage(4) },
      ],
      challenger: [
        { verdict: 'request-changes', findings: ['unsorted input and touching intervals not handled'], usage: usage(3) },
        { verdict: 'approve', usage: usage(3) },
      ],
      reviewer: [{ verdict: 'approve', usage: usage(2) }],
    },
    // Expensive worker: exceeds the cost budget used in tests.
    't06-retry-backoff': {
      worker: [{ patch: await referenceDiff('t06-retry-backoff'), usage: usage(250) }],
      reviewer: [{ verdict: 'approve', usage: usage(2) }],
    },
  },
}

await writeFile(SCRIPTS_PATH, `${JSON.stringify(scripts, null, 2)}\n`)
console.log(`wrote ${SCRIPTS_PATH}`)
