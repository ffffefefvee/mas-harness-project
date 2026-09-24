import { createBucket } from './bucket.mjs'

export function createLimiter(options) {
  const bucket = createBucket(options)
  return clientId => ({ allowed: bucket.take(), clientId })
}
