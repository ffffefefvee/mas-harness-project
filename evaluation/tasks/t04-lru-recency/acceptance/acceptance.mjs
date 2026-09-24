import assert from 'node:assert/strict'
import test from 'node:test'
import { LruCache } from '../src/lru.mjs'

test('get refreshes recency', () => {
  const cache = new LruCache(2).set('a', 1).set('b', 2)
  assert.equal(cache.get('a'), 1)
  cache.set('c', 3)
  assert.equal(cache.has('a'), true)
  assert.equal(cache.has('b'), false)
})

test('set of an existing key refreshes recency', () => {
  const cache = new LruCache(2).set('a', 1).set('b', 2).set('a', 10)
  cache.set('c', 3)
  assert.equal(cache.get('a'), 10)
  assert.equal(cache.has('b'), false)
  assert.equal(cache.size, 2)
})

test('has does not refresh recency', () => {
  const cache = new LruCache(2).set('a', 1).set('b', 2)
  assert.equal(cache.has('a'), true)
  cache.set('c', 3)
  assert.equal(cache.has('a'), false)
})

test('missing keys and undefined values', () => {
  const cache = new LruCache(3).set('x', undefined)
  assert.equal(cache.has('x'), true)
  assert.equal(cache.get('missing'), undefined)
  assert.equal(cache.size, 1)
})

test('limit must be a positive integer', () => {
  assert.throws(() => new LruCache(0), RangeError)
  assert.throws(() => new LruCache(1.5), RangeError)
  assert.throws(() => new LruCache(), RangeError)
})
