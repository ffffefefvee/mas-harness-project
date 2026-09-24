import assert from 'node:assert/strict'
import { join, resolve } from 'node:path'
import test from 'node:test'
import { resolveStaticPath } from '../src/static.mjs'

const root = resolve('/srv/app')

test('normal paths resolve inside root', () => {
  assert.equal(resolveStaticPath(root, '/index.html'), join(root, 'index.html'))
  assert.equal(resolveStaticPath(root, 'css/site.css'), join(root, 'css', 'site.css'))
  assert.equal(resolveStaticPath(root, '/a/../b.txt'), join(root, 'b.txt'))
  assert.equal(resolveStaticPath(root, '/'), root)
  assert.equal(resolveStaticPath(root, '/my%20file.txt'), join(root, 'my file.txt'))
})

test('traversal is rejected in all encodings', () => {
  for (const attack of ['/../etc/passwd', '../../etc/passwd', '/%2e%2e/etc/passwd', '/..%2fetc%2fpasswd', '\\..\\..\\windows\\win.ini', '/a/../../x']) {
    assert.equal(resolveStaticPath(root, attack), null, attack)
  }
})

test('sibling prefix, absolute, drive and NUL paths are rejected', () => {
  assert.equal(resolveStaticPath(root, '/../app-secrets/key.pem'), null)
  assert.equal(resolveStaticPath(root, '//etc/passwd'), null)
  assert.equal(resolveStaticPath(root, '/C:/Windows/win.ini'), null)
  assert.equal(resolveStaticPath(root, 'C:\\Windows\\win.ini'), null)
  assert.equal(resolveStaticPath(root, '/file.txt%00.png'), null)
})

test('malformed encoding throws RangeError', () => {
  assert.throws(() => resolveStaticPath(root, '/%E0%A4%A'), RangeError)
})
