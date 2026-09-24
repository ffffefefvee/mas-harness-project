import {readFile, writeFile} from 'node:fs/promises'
import {resolve} from 'node:path'
import {fileURLToPath} from 'node:url'
import {assertCase, cascade, rules, summarize} from './core.mjs'
import {evaluateOne, providerConfig} from './providers.mjs'

const args = process.argv.slice(2)
const get = key => {const i = args.indexOf(key); return i < 0 ? null : args[i + 1]}
const provider = get('--provider')
const fixture = resolve(get('--cases') ?? fileURLToPath(new URL('../fixtures/synthetic.json', import.meta.url)))
const cases = JSON.parse(await readFile(fixture, 'utf8'))
if (!Array.isArray(cases) || !cases.length) throw new Error('Expected nonempty case array')
const ids = new Set()
for (const item of cases) {assertCase(item); if (ids.has(item.id)) throw new Error('Duplicate case id'); ids.add(item.id)}
const report = {fixture, n:cases.length, rules:summarize(cases, cases.map(rules)),
  caveat:'Synthetic fixtures verify plumbing, not model quality. Labels require independent human review.'}

if (args.includes('--live')) {
  if (!['jev','laya','cascade'].includes(provider)) throw new Error('Use --provider jev|laya|cascade')
  if ((provider === 'jev' || provider === 'cascade') && !args.includes('--allow-public-api'))
    throw new Error('Jev requires --allow-public-api (sends public-safe cases and incurs charges)')
  const maxCases = Number(get('--max-cases') ?? 10)
  const threshold = Number(get('--threshold') ?? 0.85)
  if (!Number.isSafeInteger(maxCases) || maxCases < 1 || maxCases > 100) throw new Error('Invalid --max-cases')
  if (!Number.isFinite(threshold) || threshold < 0 || threshold > 1) throw new Error('Invalid --threshold')
  const subset = cases.slice(0, maxCases)
  const local = provider !== 'jev' ? providerConfig('laya', process.env) : null
  const remote = provider !== 'laya' ? providerConfig('jev', process.env) : null
  const decisions = [], details = []
  let reservedUsd = 0, observedInputTokens = 0, remoteCalls = 0
  for (const item of subset) {
    let laya = null, jev = null
    const failures = []
    if (local) {
      try {laya = await evaluateOne(item, 'laya', local)} catch (error) {failures.push(`laya: ${error.message}`)}
    }
    const needJev = remote && (provider === 'jev' || !laya || laya.confidence < threshold)
    if (needJev) {
      const reservation = (1000 + Math.ceil(item.text.length / 3)) * 0.042 / 1_000_000
      if (reservedUsd + reservation > 0.02) failures.push('jev: preflight budget exhausted')
      else {
        reservedUsd += reservation
        remoteCalls++
        try {jev = await evaluateOne(item, 'jev', remote); observedInputTokens += jev.inputTokens ?? 0}
        catch (error) {failures.push(`jev: ${error.message}`)}
      }
    }
    const final = provider === 'cascade' ? cascade(item, laya, jev, threshold) :
      provider === 'laya' ? laya : jev
    decisions.push(final)
    details.push({id:item.id, route:final?.mode ?? null, source:final?.source ?? provider,
      laya: laya ? {mode:laya.mode, confidence:laya.confidence, latencyMs:laya.latencyMs, model:laya.model} : null,
      jev: jev ? {mode:jev.mode, confidence:jev.confidence, latencyMs:jev.latencyMs, model:jev.model} : null,
      failures})
  }
  report.live = {provider, threshold, cases:subset.length, remoteCalls,
    metrics:summarize(subset, decisions), details,
    costs:{reservedUsd, observedJevInputTokens:observedInputTokens,
      estimatedJevInputUsd:observedInputTokens * 0.042 / 1_000_000,
      disclaimer:'Preflight reservation is not a provider-side spending cap; actual bills may differ. Local compute and network overhead excluded.'}}
}
const output = JSON.stringify(report,null,2)+'\n'
if (get('--output')) await writeFile(resolve(get('--output')), output, {flag:'wx'})
else process.stdout.write(output)
