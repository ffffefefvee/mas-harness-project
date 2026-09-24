import assert from 'node:assert/strict'
import test from 'node:test'
import { paginate } from '../src/paginate.mjs'

const items = Array.from({ length: 10 }, (_, index) => index)

test('returns 1-based pages and rounds the page count up', () => {
  assert.deepEqual(paginate(items, 1, 3), { items: [0, 1, 2], page: 1, pages: 4 })
  assert.deepEqual(paginate(items, 4, 3), { items: [9], page: 4, pages: 4 })
  assert.deepEqual(paginate(items, 2, 5), { items: [5, 6, 7, 8, 9], page: 2, pages: 2 })
})

test('rejects out-of-range pages and invalid page sizes', () => {
  assert.throws(() => paginate(items, 5, 3), RangeError)
  assert.throws(() => paginate(items, 0, 3), RangeError)
  assert.throws(() => paginate(items, 1.5, 3), RangeError)
  assert.throws(() => paginate(items, 1, 0), RangeError)
  assert.throws(() => paginate(items, 1, 2.5), RangeError)
})

test('empty list has zero pages and only page 1 is valid', () => {
  assert.deepEqual(paginate([], 1, 3), { items: [], page: 1, pages: 0 })
  assert.throws(() => paginate([], 2, 3), RangeError)
})
