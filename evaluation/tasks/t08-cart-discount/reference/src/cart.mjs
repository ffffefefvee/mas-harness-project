import { applyDiscount } from './discount.mjs'
import { subtotal } from './pricing.mjs'

export function total(lines, code) {
  const subtotalCents = subtotal(lines)
  const discountCents = applyDiscount(subtotalCents, code)
  return { subtotalCents, discountCents, totalCents: subtotalCents - discountCents }
}
