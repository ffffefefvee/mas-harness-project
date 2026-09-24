import assert from 'node:assert/strict'
import test from 'node:test'
import { redact } from '../src/redact.mjs'

test('redacts sensitive keys at any depth, in arrays, ignoring case and separators', () => {
  const input = {
    user: 'ann',
    Password: 'p1',
    nested: { api_key: 'k1', 'API-KEY': 'k2', 'X-Api-Key': 'not in the key list', list: [{ token: 't1' }, { safe: 'ok' }] },
    headers: { Authorization: 'Basic abc', 'Set-Cookie': 'sid=1' },
  }
  assert.deepEqual(redact(input), {
    user: 'ann',
    Password: '[REDACTED]',
    nested: { api_key: '[REDACTED]', 'API-KEY': '[REDACTED]', 'X-Api-Key': 'not in the key list', list: [{ token: '[REDACTED]' }, { safe: 'ok' }] },
    headers: { Authorization: '[REDACTED]', 'Set-Cookie': '[REDACTED]' },
  })
})

test('redacts bearer tokens inside strings', () => {
  assert.deepEqual(redact({ msg: 'call with bearer abc.DEF-123 failed', arr: ['Bearer x/y+z='] }), {
    msg: 'call with Bearer [REDACTED] failed', arr: ['Bearer [REDACTED]'],
  })
  assert.equal(redact('Authorization: Bearer abc'), 'Authorization: Bearer [REDACTED]')
})

test('does not mutate input and handles cycles and non-plain values', () => {
  const input = { password: 'p', child: { value: 1 } }
  input.child.parent = input
  const output = redact(input)
  assert.equal(input.password, 'p')
  assert.equal(output.child.parent, '[Circular]')
  const date = new Date(0)
  assert.equal(redact({ when: date }).when, date)
  assert.equal(redact(null), null)
  assert.equal(redact(5), 5)
})

test('shared non-circular references are both redacted', () => {
  const shared = { token: 't' }
  assert.deepEqual(redact({ a: shared, b: shared }), { a: { token: '[REDACTED]' }, b: { token: '[REDACTED]' } })
})
