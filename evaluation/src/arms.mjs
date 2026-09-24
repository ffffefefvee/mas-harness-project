// Arms: strategies that turn a task into a patch.
//
// Contract: arm.run(task, budget, context) -> Promise<{ patch, usage, latencyMs, transcriptRef, status, trace? }>
//   task    public view only: { id, title, class, instruction, files } — never labels or tests
//   budget  { maxRounds, maxCostUnits, maxLatencyMs } enforced by the arm driver, not by a model
//   usage   { modelCalls, inputTokens, outputTokens, costUnits } (costUnits: provider-neutral unit)
//   status  'completed' | 'refused' | 'budget-exhausted' | 'error'  (all non-completed outcomes are
//           graded as-is and stay in denominators)
//
// Evidence class of each arm (must be printed in every report):
//   noop, reference, deterministic      -> 'baseline'   (deterministic, real measurements)
//   scripted-*                           -> 'mechanics-only' (replayed responses: tests control
//                                           flow, budgets and accounting — NOT quality evidence)
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { scanContent } from '../../lib/analyzers.js'
import { EMPTY_PATCH } from './patch.mjs'
import { referencePatch } from './tasks.mjs'

export const MECHANICS_ONLY = 'mechanics only, not quality evidence'
export const DEFAULT_BUDGET = Object.freeze({ maxRounds: 3, maxCostUnits: 100, maxLatencyMs: 600_000 })
export const SCRIPTS_PATH = fileURLToPath(new URL('../fixtures/scripted-responses.json', import.meta.url))

const zeroUsage = () => ({ modelCalls: 0, inputTokens: 0, outputTokens: 0, costUnits: 0 })

function addUsage(total, usage = {}) {
  for (const key of Object.keys(total)) total[key] += usage[key] ?? 0
  return total
}

async function timed(fn) {
  const started = performance.now()
  const result = await fn()
  return { ...result, latencyMs: Math.round(performance.now() - started) }
}

/** Does nothing. Lower bound; also proves that fixtures fail as shipped. */
export const noopArm = {
  id: 'noop',
  evidence: 'baseline',
  async run() {
    return timed(async () => ({ patch: EMPTY_PATCH, usage: zeroUsage(), transcriptRef: null, status: 'completed' }))
  },
}

/** Oracle: applies the reference solution. Upper bound; validates the corpus, not an agent. */
export function createReferenceArm(tasksById) {
  return {
    id: 'reference',
    evidence: 'baseline',
    async run(task) {
      return timed(async () => ({ patch: await referencePatch(tasksById.get(task.id)), usage: zeroUsage(), transcriptRef: null, status: 'completed' }))
    },
  }
}

/**
 * Deterministic checks only: runs the Roundtable analyzer over the visible repository and
 * reports findings. It never edits code, so its task pass rate measures how many fixtures pass
 * untouched (expected 0). Its value is diagnostic (`trace.findings`): which tasks a
 * deterministic gate would flag before any model is involved.
 */
export const deterministicArm = {
  id: 'deterministic',
  evidence: 'baseline',
  async run(task) {
    return timed(async () => {
      const findings = Object.entries(task.files).flatMap(([path, source]) => scanContent(path, source))
      return {
        patch: EMPTY_PATCH,
        usage: zeroUsage(),
        transcriptRef: null,
        status: 'completed',
        trace: { findings: findings.map(({ ruleId, path, line }) => ({ ruleId, path, line })) },
      }
    })
  },
}

export async function loadScripts(path = SCRIPTS_PATH) {
  return JSON.parse(await readFile(path, 'utf8'))
}

function responseFor(scripts, taskId, role, round) {
  const entry = scripts.tasks?.[taskId]?.[role]
  if (!entry) return undefined
  return Array.isArray(entry) ? entry[Math.min(round, entry.length - 1)] : entry
}

/**
 * Replays recorded worker/reviewer responses to exercise workflow mechanics.
 * mode 'direct':   one worker call, no review.
 * mode 'reviewed': worker -> independent reviewer; if the reviewer requests changes, exactly one
 *                  correction round (bounded), then stop regardless of the second verdict.
 * mode 'team':     planner -> implementer -> challenger rounds until approval or maxRounds.
 * Budgets are enforced before every call; exhaustion stops the arm and returns the latest patch
 * with status 'budget-exhausted' (graded like any other patch; never converted to success).
 */
export function createScriptedArm(mode, scripts, { correctionRounds = 1 } = {}) {
  if (!['direct', 'reviewed', 'team'].includes(mode)) throw new RangeError(`unknown scripted mode ${mode}`)
  return {
    id: `scripted-${mode}`,
    evidence: 'mechanics-only',
    note: MECHANICS_ONLY,
    async run(task, budget = DEFAULT_BUDGET) {
      return timed(async () => {
        const usage = zeroUsage()
        const trace = { mode, calls: [] }
        let patch = EMPTY_PATCH
        let status = 'completed'
        const call = (role, round) => {
          const response = responseFor(scripts, task.id, role, round)
          if (!response) return { missing: true }
          const projected = usage.costUnits + (response.usage?.costUnits ?? 0)
          if (projected > budget.maxCostUnits) return { exhausted: 'cost' }
          if (usage.modelCalls + 1 > budget.maxRounds * 3) return { exhausted: 'calls' }
          addUsage(usage, { modelCalls: 1, ...response.usage })
          trace.calls.push({ role, round, verdict: response.verdict ?? null, costUnits: response.usage?.costUnits ?? 0 })
          return { response }
        }
        const run = (role, round) => {
          const result = call(role, round)
          if (result.missing) {
            status = 'refused'
            trace.stop = `no scripted ${role} response`
          } else if (result.exhausted) {
            status = 'budget-exhausted'
            trace.stop = `${result.exhausted} budget exhausted before ${role} round ${round}`
          }
          return result.response
        }

        if (mode === 'team') {
          const plan = run('planner', 0)
          if (!plan) return { patch, usage, transcriptRef: `scripted:${task.id}:team`, status, trace }
          for (let round = 0; round < budget.maxRounds; round++) {
            const work = run('worker', round)
            if (!work) break
            patch = work.patch ?? patch
            const challenge = run('challenger', round)
            if (!challenge) break
            if (challenge.verdict === 'approve') break
            if (round === budget.maxRounds - 1) trace.stop = 'round limit reached with unresolved challenge'
          }
          return { patch, usage, transcriptRef: `scripted:${task.id}:team`, status, trace }
        }

        const work = run('worker', 0)
        if (work) patch = work.patch ?? patch
        if (mode === 'reviewed' && work) {
          for (let round = 0; round <= correctionRounds; round++) {
            const review = run('reviewer', round)
            if (!review || review.verdict !== 'request-changes') break
            if (round === correctionRounds) {
              trace.stop = 'correction limit reached; latest patch submitted with unresolved review'
              break
            }
            const correction = run('worker', round + 1)
            if (!correction) break
            patch = correction.patch ?? patch
          }
        }
        return { patch, usage, transcriptRef: `scripted:${task.id}:${mode}`, status, trace }
      })
    },
  }
}
