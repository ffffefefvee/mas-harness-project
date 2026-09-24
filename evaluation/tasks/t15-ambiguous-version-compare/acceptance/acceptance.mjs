import assert from 'node:assert/strict'
import test from 'node:test'
import { compareVersions } from '../src/semver.mjs'

const sign = value => Math.sign(value)

test('core versions compare numerically', () => {
  assert.equal(sign(compareVersions('1.10.0', '1.9.0')), 1)
  assert.equal(sign(compareVersions('2.0.0', '10.0.0')), -1)
  assert.equal(compareVersions('1.2.3', '1.2.3'), 0)
})

test('SemVer 2.0.0 section 11 precedence chain', () => {
  const chain = ['1.0.0-alpha', '1.0.0-alpha.1', '1.0.0-alpha.beta', '1.0.0-beta', '1.0.0-beta.2', '1.0.0-beta.11', '1.0.0-rc.1', '1.0.0']
  for (let index = 0; index < chain.length - 1; index++) {
    assert.equal(sign(compareVersions(chain[index], chain[index + 1])), -1, `${chain[index]} < ${chain[index + 1]}`)
    assert.equal(sign(compareVersions(chain[index + 1], chain[index])), 1)
  }
  const shuffled = [...chain].reverse()
  assert.deepEqual(shuffled.sort(compareVersions), chain)
})

test('build metadata is ignored and invalid versions throw TypeError', () => {
  assert.equal(compareVersions('1.0.0+build.1', '1.0.0+build.2'), 0)
  assert.equal(sign(compareVersions('1.0.0-rc.1+x', '1.0.0')), -1)
  for (const invalid of ['1.0', '01.0.0', '1.0.0-', 'v1.0.0', '1.0.0-01', '', null]) {
    assert.throws(() => compareVersions(invalid, '1.0.0'), TypeError, String(invalid))
  }
})
