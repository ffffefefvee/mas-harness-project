import { createHmac } from 'node:crypto'

export function verifySignature(secret, body, signatureHeader) {
  const expected = createHmac('sha256', secret).update(body).digest('hex')
  return signatureHeader.replace('sha256=', '').toLowerCase() === expected
}
