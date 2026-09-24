export function createBucket({ capacity, refillPerSecond, now }) {
  let tokens = capacity
  let last = now()
  return {
    take(cost = 1) {
      const current = now()
      tokens += ((current - last) / 1000) * refillPerSecond
      last = current
      tokens -= cost
      return tokens >= 0
    },
  }
}
