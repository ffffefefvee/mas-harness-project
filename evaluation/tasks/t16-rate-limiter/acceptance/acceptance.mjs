import assert from 'node:assert/strict'
import test from 'node:test'
import { createBucket } from '../src/bucket.mjs'
import { createLimiter } from '../src/middleware.mjs'

function clock(start = 0) {
  let time = start
  return { now: () => time, advance: ms => { time += ms }, set: ms => { time = ms } }
}

test('bucket starts full, refills continuously, and is capped', () => {
  const time = clock()
  const bucket = createBucket({ capacity: 2, refillPerSecond: 1, now: time.now })
  assert.equal(bucket.take(), true)
  assert.equal(bucket.take(), true)
  assert.equal(bucket.take(), false)
  time.advance(500)
  assert.equal(bucket.take(), false, 'half a token is not enough')
  time.advance(500)
  assert.equal(bucket.take(), true)
  time.advance(60_000)
  assert.equal(bucket.take(2), true)
  assert.equal(bucket.take(), false, 'refill is capped at capacity')
})

test('failed take does not consume and backwards clock adds nothing', () => {
  const time = clock(10_000)
  const bucket = createBucket({ capacity: 3, refillPerSecond: 1, now: time.now })
  assert.equal(bucket.take(3), true)
  time.advance(2000)
  assert.equal(bucket.take(3), false)
  assert.equal(bucket.take(2), true, 'the failed take kept its tokens')
  time.set(0)
  assert.equal(bucket.take(), false)
  time.set(1000)
  assert.equal(bucket.take(), false, 'returning to an earlier time must not create tokens')
})

test('parameters are validated', () => {
  const time = clock()
  assert.throws(() => createBucket({ capacity: 0, refillPerSecond: 1, now: time.now }), RangeError)
  assert.throws(() => createBucket({ capacity: 1, refillPerSecond: Infinity, now: time.now }), RangeError)
  const bucket = createBucket({ capacity: 2, refillPerSecond: 1, now: time.now })
  assert.throws(() => bucket.take(3), RangeError)
  assert.throws(() => bucket.take(0), RangeError)
})

test('limiter keeps one bucket per client and rejects missing ids', () => {
  const time = clock()
  const check = createLimiter({ capacity: 1, refillPerSecond: 1, now: time.now })
  assert.deepEqual(check('a'), { allowed: true, clientId: 'a' })
  assert.deepEqual(check('a'), { allowed: false, clientId: 'a' })
  assert.deepEqual(check('b'), { allowed: true, clientId: 'b' })
  assert.throws(() => check(''), TypeError)
  assert.throws(() => check(undefined), TypeError)
})
