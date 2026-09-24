import assert from 'node:assert/strict'
import test from 'node:test'
import { total } from '../src/cart.mjs'
import { applyDiscount } from '../src/discount.mjs'
import { subtotal } from '../src/pricing.mjs'

const lines = [{ sku: 'a', quantity: 3, unitCents: 199 }, { sku: 'b', quantity: 1, unitCents: 1005 }]

test('subtotal multiplies quantity and validates lines', () => {
  assert.equal(subtotal(lines), 1602)
  assert.equal(subtotal([]), 0)
  assert.throws(() => subtotal([{ sku: 'x', quantity: -1, unitCents: 10 }]), RangeError)
  assert.throws(() => subtotal([{ sku: 'x', quantity: 1, unitCents: 1.5 }]), RangeError)
})

test('discounts use integer cents and never exceed the subtotal', () => {
  assert.equal(applyDiscount(1605, 'SAVE10'), 161)
  assert.equal(applyDiscount(1604, 'SAVE10'), 160)
  assert.equal(applyDiscount(300, 'FLAT500'), 300)
  assert.equal(applyDiscount(300, undefined), 0)
  assert.equal(applyDiscount(300, null), 0)
  assert.throws(() => applyDiscount(300, 'FREE'), RangeError)
})

test('cart total combines both modules', () => {
  assert.deepEqual(total(lines, 'SAVE10'), { subtotalCents: 1602, discountCents: 160, totalCents: 1442 })
  assert.deepEqual(total([{ sku: 'c', quantity: 2, unitCents: 100 }], 'FLAT500'), { subtotalCents: 200, discountCents: 200, totalCents: 0 })
  for (const result of [total(lines, 'SAVE10'), total(lines)]) {
    assert.ok(Object.values(result).every(Number.isInteger))
  }
})
