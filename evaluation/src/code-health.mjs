// Measures the deterministic analyzer against the labelled code-health corpus.
// This is a real measurement of the current regex rules on a small synthetic corpus.
import { createHash } from 'node:crypto'
import { readFile, readdir } from 'node:fs/promises'
import { extname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import * as analyzers from '../../lib/analyzers.js'
import * as scanner from '../../lib/scanner.js'
import { wilson } from './stats.mjs'

export const CORPUS_DIR = fileURLToPath(new URL('../corpus/code-health/cases/', import.meta.url))
const FALLBACK_EXTENSIONS = new Set(['.js', '.mjs', '.cjs', '.ts', '.tsx', '.jsx', '.json', '.py', '.yml', '.yaml'])

export async function loadCases(directory = CORPUS_DIR) {
  const files = (await readdir(directory)).filter(name => name.endsWith('.json')).sort()
  const cases = []
  for (const file of files) {
    for (const item of JSON.parse(await readFile(join(directory, file), 'utf8'))) cases.push({ ...item, file })
  }
  const ids = new Set()
  for (const item of cases) {
    if (ids.has(item.id)) throw new Error(`duplicate case id ${item.id}`)
    ids.add(item.id)
    if (!Number.isInteger(item.expected) || item.expected < 0) throw new Error(`case ${item.id}: expected must be a non-negative integer`)
    if (!['positive', 'negative-twin'].includes(item.kind)) throw new Error(`case ${item.id}: unknown kind ${item.kind}`)
    if ((item.kind === 'positive') !== (item.expected > 0)) throw new Error(`case ${item.id}: kind ${item.kind} contradicts expected=${item.expected}`)
  }
  return cases
}

/**
 * Run the analyzer on each case the way the workspace scanner would: files whose extension the
 * scanner does not read produce no findings.
 */
export function evaluateCases(cases, { scan = analyzers.scanContent, extensions = scanner.SOURCE_EXTENSIONS ?? FALLBACK_EXTENSIONS } = {}) {
  const outcomes = cases.map(item => {
    const source = item.eol === 'crlf' ? item.source.replace(/\r?\n/g, '\r\n') : item.source
    const scanned = extensions.has(extname(item.path))
    const found = scanned ? scan(item.path, source).filter(finding => finding.ruleId === item.rule).length : 0
    return {
      id: item.id,
      rule: item.rule,
      kind: item.kind,
      path: item.path,
      eol: item.eol ?? 'lf',
      expected: item.expected,
      found,
      scanned,
      tp: Math.min(item.expected, found),
      fp: Math.max(0, found - item.expected),
      fn: Math.max(0, item.expected - found),
      note: item.note,
    }
  })
  const rules = [...new Set(outcomes.map(outcome => outcome.rule))].sort()
  const summarize = subset => {
    const tp = subset.reduce((sum, item) => sum + item.tp, 0)
    const fp = subset.reduce((sum, item) => sum + item.fp, 0)
    const fn = subset.reduce((sum, item) => sum + item.fn, 0)
    const precision = wilson(tp, tp + fp)
    const recall = wilson(tp, tp + fn)
    const f1 = precision.estimate !== null && recall.estimate !== null && precision.estimate + recall.estimate > 0
      ? (2 * precision.estimate * recall.estimate) / (precision.estimate + recall.estimate)
      : null
    return {
      cases: subset.length,
      positives: subset.filter(item => item.kind === 'positive').length,
      negativeTwins: subset.filter(item => item.kind === 'negative-twin').length,
      tp, fp, fn, precision, recall, f1,
      falsePositiveCases: subset.filter(item => item.fp > 0).map(item => item.id),
      falseNegativeCases: subset.filter(item => item.fn > 0).map(item => item.id),
    }
  }
  return {
    perRule: Object.fromEntries(rules.map(rule => [rule, summarize(outcomes.filter(outcome => outcome.rule === rule))])),
    overall: summarize(outcomes),
    outcomes,
  }
}

export async function measureCodeHealth() {
  const cases = await loadCases()
  const evaluation = evaluateCases(cases)
  // The analyzer changes over time; pin the exact source that produced these numbers.
  const analyzerSource = await readFile(new URL('../../lib/analyzers.js', import.meta.url))
  return {
    schemaVersion: '0.1',
    generatedAt: new Date().toISOString(),
    evidence: 'measurement',
    statement: 'Real measurement of the current deterministic analyzer on a small, synthetic, single-author corpus. Not an estimate of behaviour on real repositories.',
    analyzer: { ...(analyzers.analyzerMetadata ?? {}), sourceSha256: createHash('sha256').update(analyzerSource.toString('utf8').replaceAll('\r\n', '\n')).digest('hex') },
    corpus: { cases: cases.length, labeler: 'single-author-unadjudicated', labellingRule: 'rule intent, not analyzer output (evaluation/corpus/code-health/README.md)' },
    confidence: 0.95,
    interval: 'Wilson score',
    ...evaluation,
  }
}

const percent = value => (value === null ? 'n/a' : `${(value * 100).toFixed(0)}%`)
const interval = ci => (ci.estimate === null ? 'n/a' : `${percent(ci.estimate)} [${percent(ci.low)}–${percent(ci.high)}]`)

export function formatCodeHealth(report) {
  const lines = ['| Rule | Cases (+/−) | TP | FP | FN | Precision [95% CI] | Recall [95% CI] |', '|---|---|---|---|---|---|---|']
  for (const [rule, summary] of Object.entries(report.perRule)) {
    lines.push(`| \`${rule}\` | ${summary.cases} (${summary.positives}/${summary.negativeTwins}) | ${summary.tp} | ${summary.fp} | ${summary.fn} | ${interval(summary.precision)} | ${interval(summary.recall)} |`)
  }
  const overall = report.overall
  lines.push(`| **all** | ${overall.cases} (${overall.positives}/${overall.negativeTwins}) | ${overall.tp} | ${overall.fp} | ${overall.fn} | ${interval(overall.precision)} | ${interval(overall.recall)} |`)
  return lines.join('\n')
}
