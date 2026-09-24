import assert from 'node:assert/strict'
import test from 'node:test'
import { EventBus } from '../src/bus.mjs'
import { once } from '../src/once.mjs'

test('unsubscribe removes exactly one registration', () => {
  const bus = new EventBus()
  const calls = []
  const handler = value => calls.push(value)
  const first = bus.on('x', handler)
  bus.on('x', handler)
  first()
  first()
  assert.equal(bus.emit('x', 1), 1)
  assert.deepEqual(calls, [1])
})

test('handlers that unsubscribe during emit do not skip others', () => {
  const bus = new EventBus()
  const calls = []
  const offA = bus.on('x', () => { calls.push('a'); offA() })
  bus.on('x', () => calls.push('b'))
  bus.on('x', () => calls.push('c'))
  assert.equal(bus.emit('x'), 3)
  assert.deepEqual(calls, ['a', 'b', 'c'])
  assert.equal(bus.emit('x'), 2)
})

test('once runs at most once and unsubscribes itself', () => {
  const bus = new EventBus()
  const calls = []
  once(bus, 'y', value => calls.push(value))
  assert.equal(bus.emit('y', 1), 1)
  assert.equal(bus.emit('y', 2), 0)
  assert.deepEqual(calls, [1])
  const cancel = once(bus, 'y', value => calls.push(value))
  cancel()
  assert.equal(bus.emit('y', 3), 0)
  assert.deepEqual(calls, [1])
})
