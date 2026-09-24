const isPositive = value => Number.isFinite(value) && value > 0

export function createBucket({ capacity, refillPerSecond, now }) {
  if (!isPositive(capacity) || !isPositive(refillPerSecond)) throw new RangeError('capacity and refillPerSecond must be positive')
  let tokens = capacity
  let last = now()
  return {
    take(cost = 1) {
      if (!isPositive(cost) || cost > capacity) throw new RangeError('invalid cost')
      const current = now()
      if (current > last) {
        tokens = Math.min(capacity, tokens + ((current - last) / 1000) * refillPerSecond)
        last = current
      }
      if (tokens < cost) return false
      tokens -= cost
      return true
    },
  }
}
