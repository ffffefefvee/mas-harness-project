import test from 'node:test'
import assert from 'node:assert/strict'
import {readFile} from 'node:fs/promises'
import {assertCase, cascade, normalizeChoice, policyFloor, rules, summarize} from '../src/core.mjs'
import {evaluateOne, providerConfig, requestBody} from '../src/providers.mjs'

const cases = JSON.parse(await readFile(new URL('../fixtures/synthetic.json', import.meta.url)))
const answer = (choice, p) => ({type:'choice', choice, probabilities: p})

test('fixture validation and baseline', () => {
  assert.equal(cases.length, 6)
  assert.equal(summarize(cases, cases.map(rules)).accuracyOnAnswered, 1)
  assert.throws(() => assertCase({...cases[0], publicSafe:false}))
})

test('normalization rejects malformed or inconsistent answers', () => {
  assert.equal(normalizeChoice(answer('direct', {direct:.9, reviewed:.1, team:0})).confidence, .9)
  assert.throws(() => normalizeChoice(answer('direct', {direct: .1, reviewed:.9, team:0})))
  assert.throws(() => normalizeChoice(answer('direct', {direct:1, reviewed:0, team:NaN})))
  assert.throws(() => normalizeChoice({type:'choice', choice:'write_secrets', probabilities:{}}))
})

test('safety floor cannot be lowered by either model', () => {
  assert.equal(policyFloor(cases[2], 'direct'), 'team')
  assert.deepEqual(cascade(cases[2], {mode:'direct', confidence:.99}, null), {mode:'team', source:'safety_floor', escalated:false})
  assert.equal(cascade(cases[1], {mode:'direct', confidence:.2}, {mode:'reviewed', confidence:.9}).source, 'jev')
  assert.equal(cascade(cases[1], null, null).source, 'rules_fallback')
})

test('metrics distinguish abstention, under-escalation and over-escalation', () => {
  const m = summarize(cases.slice(0,3), [{mode:'team', confidence:.8}, {mode:null}, {mode:'direct', confidence:.6}])
  assert.equal(m.coverage, 2/3)
  assert.equal(m.severeUnderEscalation, 1)
  assert.equal(m.overEscalation, 1)
})

test('provider configuration refuses remote Laya or missing Jev key', () => {
  assert.throws(() => providerConfig('laya', {LAYA_BASE_URL:'https://evil.example'}))
  assert.throws(() => providerConfig('jev', {}))
  assert.equal(providerConfig('laya', {}).url, 'http://127.0.0.1:8000/v1/systemone')
  assert.equal(providerConfig('jev', {TYPESAFE_API_KEY:'fake'}).model, 'jev-1.13.0')
})

test('request contains a bounded choice question and no case label', () => {
  const request = requestBody(cases[0], 'jev-1.13.0')
  assert.deepEqual(Object.keys(request.questions.route.criteria), ['direct','reviewed','team'])
  assert.equal(Object.hasOwn(request.state, 'publicSafe'), false)
  assert.equal(Object.hasOwn(request.state, 'label'), false)
})

test('mock provider validates response and records usage', async () => {
  const config = providerConfig('laya', {})
  const result = await evaluateOne(cases[0], 'laya', config, {fetchImpl: async (url, options) => {
    assert.equal(url, 'http://127.0.0.1:8000/v1/systemone')
    assert.equal(JSON.parse(options.body).state.task, cases[0].text)
    return {ok:true, json:async () => ({model:'local-test', answers:{route:answer('direct', {direct:.9, reviewed:.08, team:.02})}, usage:{input_tokens:300}})}
  }})
  assert.equal(result.inputTokens, 300)
  assert.equal(result.mode, 'direct')
})
