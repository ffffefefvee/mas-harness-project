export function applyDiscount(subtotalCents, code) {
  if (code === 'SAVE10') return subtotalCents * 0.1
  if (code === 'FLAT500') return 500
  return 0
}
