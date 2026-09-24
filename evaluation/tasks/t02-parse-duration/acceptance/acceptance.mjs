import assert from 'node:assert/strict'
import test from 'node:test'
import { parseDuration } from '../src/duration.mjs'

test('parses valid combinations', () => {
  assert.equal(parseDuration('1h30m'), 5_400_000)
  assert.equal(parseDuration('45s'), 45_000)
  assert.equal(parseDuration('2m500ms'), 120_500)
  assert.equal(parseDuration('5ms'), 5)
  assert.equal(parseDuration('1h5m10s'), 3_910_000)
  assert.equal(parseDuration('0s'), 0)
})

test('rejects malformed input with RangeError', () => {
  for (const input of ['', '10', '1s1h', '1h 30m', 'abc', '1x', '1h1h', 'ms', '-5s']) {
    assert.throws(() => parseDuration(input), RangeError, input)
  }
  assert.throws(() => parseDuration(5), RangeError)
  assert.throws(() => parseDuration(undefined), RangeError)
})
