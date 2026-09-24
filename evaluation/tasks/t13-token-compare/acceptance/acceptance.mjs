import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { verifySignature } from '../src/signature.mjs'

const secret = 'test-secret'
const body = '{"event":"push","id":42}'
const sign = (key, text) => `sha256=${crypto.createHmac('sha256', key).update(text, 'utf8').digest('hex')}`

test('accepts valid signatures and rejects tampering', () => {
  assert.equal(verifySignature(secret, body, sign(secret, body)), true)
  assert.equal(verifySignature(secret, `${body} `, sign(secret, body)), false)
  assert.equal(verifySignature(secret, body, sign('other', body)), false)
  assert.equal(verifySignature(secret, 'ünïcode', sign(secret, 'ünïcode')), true)
})

test('malformed headers return false without throwing', () => {
  const valid = sign(secret, body)
  for (const header of [undefined, null, 42, '', 'sha256=', valid.slice(0, -2), valid.toUpperCase(), valid.replace('sha256=', ''), valid.replace('sha256=', 'sha1='), `${valid}00`, `sha256=${'z'.repeat(64)}`]) {
    assert.equal(verifySignature(secret, body, header), false, String(header))
  }
})

test('empty secret is refused', () => {
  assert.throws(() => verifySignature('', body, sign('', body)), RangeError)
})

test('digest comparison uses timingSafeEqual', () => {
  const source = readFileSync(new URL('../src/signature.mjs', import.meta.url), 'utf8')
  assert.match(source, /timingSafeEqual/)
})
