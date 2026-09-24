import assert from 'node:assert/strict'
import test from 'node:test'
import { mergeIntervals } from '../src/intervals.mjs'

test('merges overlapping and touching intervals in sorted order', () => {
  assert.deepEqual(mergeIntervals([[5, 7], [1, 3], [2, 4], [7, 8]]), [[1, 4], [5, 8]])
  assert.deepEqual(mergeIntervals([[1, 10], [2, 3]]), [[1, 10]])
  assert.deepEqual(mergeIntervals([[3, 3]]), [[3, 3]])
  assert.deepEqual(mergeIntervals([]), [])
})

test('does not mutate the input', () => {
  const input = [[4, 6], [1, 5]]
  const snapshot = JSON.stringify(input)
  const output = mergeIntervals(input)
  assert.equal(JSON.stringify(input), snapshot)
  output[0][1] = 99
  assert.equal(JSON.stringify(input), snapshot)
})

test('rejects invalid intervals', () => {
  assert.throws(() => mergeIntervals([[3, 1]]), RangeError)
  assert.throws(() => mergeIntervals([[0, Infinity]]), RangeError)
  assert.throws(() => mergeIntervals([[Number.NaN, 1]]), RangeError)
})
