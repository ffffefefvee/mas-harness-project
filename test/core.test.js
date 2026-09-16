import assert from 'node:assert/strict'
import test from 'node:test'
import { scanContent } from '../lib/analyzers.js'
import { findingFingerprint } from '../lib/fingerprint.js'
import { FindingLedger } from '../lib/ledger.js'
import { claimCheckDecision, classifyClaim } from '../lib/claim-critic.js'

test('deterministic analyzer detects seeded defects without exposing secrets', () => {
  const source = `function x() { try { work() } catch (error) {} }\nconst apiKey = "abcdefghijklmnop1234"\nthrow new Error("Not implemented")\n`
  const findings = scanContent('src/example.js', source)
  assert.deepEqual(new Set(findings.map(item => item.ruleId)), new Set([
    'empty-catch',
    'probable-hardcoded-secret',
    'not-implemented-stub',
  ]))
  const secret = findings.find(item => item.ruleId === 'probable-hardcoded-secret')
  assert.equal(secret.evidence, '[redacted probable credential]')
})

test('fingerprint is stable when only line numbers move', () => {
  const finding = {
    ruleId: 'empty-catch', path: 'src/a.js', evidence: 'catch (error) {}', occurrence: 1,
  }
  assert.equal(
    findingFingerprint({ ...finding, line: 2 }),
    findingFingerprint({ ...finding, line: 200 }),
  )
})

test('ledger distinguishes new, existing, fixed, and regressed findings', () => {
  const base = { fingerprint: 'a'.repeat(64), ruleId: 'x', path: 'x.js', evidence: 'x' }
  const ledger = new FindingLedger()
  ledger.beginRun()
  assert.equal(ledger.observe(base).baselineStatus, 'new')
  ledger.finishRun()
  ledger.beginRun()
  assert.equal(ledger.observe(base).baselineStatus, 'existing')
  ledger.finishRun()
  ledger.beginRun()
  assert.equal(ledger.finishRun()[0].status, 'fixed')
  ledger.beginRun()
  assert.equal(ledger.observe(base).baselineStatus, 'worsened')
})

test('claim router keeps project claims out of public search', () => {
  assert.equal(classifyClaim('Our repository currently stores findings in SQLite.'), 'project_verifiable')
  assert.equal(claimCheckDecision('Our repository uses SQLite.', { risk: 'high' }).route, 'project_evidence')
  assert.equal(claimCheckDecision('Version 2.0 was released in 2026.', { risk: 'high' }).route, 'targeted_web_search')
  assert.equal(claimCheckDecision('Version 2.0 was released in 2026.', { risk: 'low' }).route, 'skip')
})
