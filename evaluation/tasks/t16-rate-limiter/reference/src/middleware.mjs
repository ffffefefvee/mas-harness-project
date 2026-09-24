import { createBucket } from './bucket.mjs'

export function createLimiter(options) {
  const buckets = new Map()
  createBucket(options) // validate parameters eagerly
  return clientId => {
    if (typeof clientId !== 'string' || clientId === '') throw new TypeError('clientId must be a non-empty string')
    let bucket = buckets.get(clientId)
    if (!bucket) {
      bucket = createBucket(options)
      buckets.set(clientId, bucket)
    }
    return { allowed: bucket.take(), clientId }
  }
}
