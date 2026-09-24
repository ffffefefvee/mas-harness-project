import assert from 'node:assert/strict'
import test from 'node:test'
import { evaluateCases, loadCases } from '../src/code-health.mjs'

test('corpus is well formed and has negative twins for every rule', async () => {
  const cases = await loadCases()
  const rules = new Set(cases.map(item => item.rule))
  assert.deepEqual([...rules].sort(), ['empty-catch', 'merge-conflict-marker', 'not-implemented-stub', 'probable-hardcoded-secret', 'unexplained-ts-ignore'])
  for (const rule of rules) {
    const subset = cases.filter(item => item.rule === rule)
    assert.ok(subset.filter(item => item.kind === 'positive').length >= 5, `${rule} positives`)
    assert.ok(subset.filter(item => item.kind === 'negative-twin').length >= 5, `${rule} negative twins`)
  }
  assert.ok(cases.some(item => item.eol === 'crlf'), 'CRLF cases present')
})

test('scoring counts TP, FP and FN per case independently of the analyzer', () => {
  const cases = [
    { id: 'p', rule: 'r', kind: 'positive', path: 'a.js', source: 'x', expected: 2 },
    { id: 'n', rule: 'r', kind: 'negative-twin', path: 'a.js', source: 'y', expected: 0 },
    { id: 'skip', rule: 'r', kind: 'positive', path: 'a.md', source: 'x', expected: 1 },
  ]
  const fake = (_path, source) => (source === 'x' ? [{ ruleId: 'r' }] : [{ ruleId: 'r' }, { ruleId: 'other' }])
  const result = evaluateCases(cases, { scan: fake, extensions: new Set(['.js']) })
  assert.deepEqual({ tp: result.overall.tp, fp: result.overall.fp, fn: result.overall.fn }, { tp: 1, fp: 1, fn: 2 })
  assert.deepEqual(result.perRule.r.falseNegativeCases, ['p', 'skip'])
  assert.equal(result.outcomes.find(item => item.id === 'skip').scanned, false)
})

test('real analyzer run produces a complete, bounded report', async () => {
  const result = evaluateCases(await loadCases())
  for (const summary of Object.values(result.perRule)) {
    assert.ok(summary.tp + summary.fn > 0)
    for (const ci of [summary.precision, summary.recall]) {
      if (ci.estimate !== null) assert.ok(ci.low <= ci.estimate && ci.estimate <= ci.high)
    }
  }
})
