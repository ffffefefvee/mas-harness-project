import assert from 'node:assert/strict'
import test from 'node:test'
import { retry } from '../src/retry.mjs'

function recorder() {
  const delays = []
  return { delays, sleep: async ms => { delays.push(ms) } }
}

test('succeeds after failures with exponential delays between attempts', async () => {
  const { delays, sleep } = recorder()
  const seen = []
  const result = await retry(async attempt => {
    seen.push(attempt)
    if (attempt < 3) throw new Error(`fail ${attempt}`)
    return 'ok'
  }, { attempts: 5, baseDelayMs: 100, sleep })
  assert.equal(result, 'ok')
  assert.deepEqual(seen, [1, 2, 3])
  assert.deepEqual(delays, [100, 200])
})

test('final failure makes exactly `attempts` calls and aggregates all errors', async () => {
  const { delays, sleep } = recorder()
  let calls = 0
  await assert.rejects(retry(async () => {
    calls += 1
    throw new Error(`e${calls}`)
  }, { attempts: 3, baseDelayMs: 10, sleep }), error => {
    assert.ok(error instanceof AggregateError)
    assert.deepEqual(error.errors.map(item => item.message), ['e1', 'e2', 'e3'])
    return true
  })
  assert.equal(calls, 3)
  assert.deepEqual(delays, [10, 20])
})

test('single attempt never sleeps; invalid attempts rejected', async () => {
  const { delays, sleep } = recorder()
  await assert.rejects(retry(async () => { throw new Error('x') }, { attempts: 1, baseDelayMs: 10, sleep }), AggregateError)
  assert.deepEqual(delays, [])
  await assert.rejects(retry(async () => 1, { attempts: 0, baseDelayMs: 10, sleep }), RangeError)
})
