import { createHmac, timingSafeEqual } from 'node:crypto'

const HEADER = /^sha256=([0-9a-f]{64})$/

export function verifySignature(secret, body, signatureHeader) {
  if (typeof secret !== 'string' || secret === '') throw new RangeError('secret must be a non-empty string')
  if (typeof signatureHeader !== 'string') return false
  const match = HEADER.exec(signatureHeader)
  if (!match) return false
  const expected = createHmac('sha256', secret).update(body, 'utf8').digest()
  return timingSafeEqual(Buffer.from(match[1], 'hex'), expected)
}
