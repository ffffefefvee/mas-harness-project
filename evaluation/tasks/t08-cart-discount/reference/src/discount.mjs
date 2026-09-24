export function applyDiscount(subtotalCents, code) {
  if (code === undefined || code === null) return 0
  if (code === 'SAVE10') return Math.round(subtotalCents * 10 / 100)
  if (code === 'FLAT500') return Math.min(500, subtotalCents)
  throw new RangeError(`unknown discount code: ${code}`)
}
