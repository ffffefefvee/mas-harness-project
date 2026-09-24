import assert from 'node:assert/strict'
import test from 'node:test'
import { fromEnv } from '../src/env.mjs'
import { loadConfig } from '../src/load.mjs'
import { deepMerge } from '../src/merge.mjs'

test('deepMerge merges recursively without mutation', () => {
  const base = { server: { host: 'localhost', port: 80 }, tags: ['a'], debug: false }
  const override = { server: { port: 8080 }, tags: ['b'], debug: undefined }
  const baseSnapshot = JSON.stringify(base)
  const merged = deepMerge(base, override)
  assert.deepEqual(merged, { server: { host: 'localhost', port: 8080 }, tags: ['b'], debug: false })
  assert.equal(JSON.stringify(base), baseSnapshot)
  assert.notEqual(merged.server, base.server)
})

test('fromEnv nests, lowercases and coerces', () => {
  assert.deepEqual(fromEnv({ APP_SERVER__PORT: '8080', APP_DEBUG: 'true', APP_NAME: 'svc', APP_LEVEL: '-2', OTHER: 'x' }, 'APP_'), {
    server: { port: 8080 }, debug: true, name: 'svc', level: -2,
  })
  assert.deepEqual(fromEnv({ APP_VERSION: '1.2' }, 'APP_'), { version: '1.2' })
})

test('loadConfig applies defaults < file < env', () => {
  const defaults = { server: { host: 'localhost', port: 80 }, debug: false }
  const file = { server: { port: 3000 }, name: 'from-file' }
  const config = loadConfig(defaults, file, { APP_SERVER__PORT: '9000', APP_DEBUG: 'true' })
  assert.deepEqual(config, { server: { host: 'localhost', port: 9000 }, debug: true, name: 'from-file' })
  assert.deepEqual(defaults, { server: { host: 'localhost', port: 80 }, debug: false })
})
