import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm, writeFile, mkdir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { PatchError, applyHunks, applyPatch, assertSafeRelativePath, countChangedLines, createUnifiedDiff, parseUnifiedDiff } from '../src/patch.mjs'

async function directory(t, files = {}) {
  const root = await mkdtemp(join(tmpdir(), 'rt-patch-'))
  t.after(() => rm(root, { recursive: true, force: true }))
  for (const [path, content] of Object.entries(files)) {
    await mkdir(join(root, path, '..'), { recursive: true })
    await writeFile(join(root, path), content)
  }
  return root
}

test('unified diff round-trips edits, creation, deletion and missing final newline', () => {
  const cases = [
    ['a\nb\nc\n', 'a\nB\nc\n'],
    ['a\nb\nc\nd\ne\nf\ng\nh\ni\nj\n', 'a\nb2\nc\nd\ne\nf\ng\nh\ni2\nj\nk\n'],
    ['', 'new\nfile\n'],
    ['x\ny', 'x\ny\n'],
    ['x\ny\n', 'x\ny'],
    ['only\n', ''],
  ]
  for (const [before, after] of cases) {
    const diff = createUnifiedDiff('f.txt', before, after)
    const [file] = parseUnifiedDiff(diff)
    assert.equal(applyHunks(before, file.hunks), after, JSON.stringify({ before, after, diff }))
  }
  assert.equal(createUnifiedDiff('f.txt', 'same\n', 'same\n'), '')
})

test('an LF diff applies to a CRLF file and keeps CRLF', () => {
  const diff = createUnifiedDiff('f.txt', 'a\nb\n', 'a\nc\n')
  const [file] = parseUnifiedDiff(diff)
  assert.equal(applyHunks('a\r\nb\r\n', file.hunks), 'a\r\nc\r\n')
})

test('hunks apply with an offset but refuse mismatched context', () => {
  const diff = '--- a/f.txt\n+++ b/f.txt\n@@ -1,2 +1,2 @@\n x\n-y\n+Y\n'
  const [file] = parseUnifiedDiff(diff)
  assert.equal(applyHunks('pre\nx\ny\n', file.hunks), 'pre\nx\nY\n')
  assert.throws(() => applyHunks('x\nz\n', file.hunks), PatchError)
  assert.throws(() => parseUnifiedDiff('--- a/f\n+++ b/f\n@@ -1,3 +1,1 @@\n x\n'), PatchError)
})

test('path safety rejects escapes, absolute paths, .git and protected prefixes', () => {
  for (const path of ['../x', 'a/../../x', '/etc/passwd', 'C:/x', 'C:\\x', '.git/config', 'a/.git/hooks/pre-commit', 'acceptance/a.mjs', '']) {
    assert.throws(() => assertSafeRelativePath(path, ['acceptance/']), PatchError, path)
  }
  assert.equal(assertSafeRelativePath('src\\a.mjs'), 'src/a.mjs')
})

test('applyPatch writes files, counts changed lines, and rejects unsafe patches', async t => {
  const root = await directory(t, { 'src/a.mjs': 'one\ntwo\n' })
  const result = await applyPatch(root, { type: 'files', files: { 'src/a.mjs': 'one\n2\n', 'src/b.mjs': 'new\n' } })
  assert.equal(await readFile(join(root, 'src/a.mjs'), 'utf8'), 'one\n2\n')
  assert.equal(result.added, 2)
  assert.equal(result.removed, 1)
  const diff = createUnifiedDiff('src/a.mjs', 'one\n2\n', null)
  await applyPatch(root, { type: 'unified-diff', diff })
  await assert.rejects(readFile(join(root, 'src/a.mjs'), 'utf8'), { code: 'ENOENT' })
  await assert.rejects(applyPatch(root, { type: 'files', files: { '../escape.txt': 'x' } }), PatchError)
  await assert.rejects(applyPatch(root, { type: 'unified-diff', diff: createUnifiedDiff('missing.mjs', 'a\n', 'b\n') }), PatchError)
  await assert.rejects(applyPatch(root, { type: 'mystery' }), PatchError)
  assert.deepEqual(await applyPatch(root, null), { files: [], added: 0, removed: 0 })
  assert.deepEqual(countChangedLines('a\nb\n', 'a\nb\n'), { added: 0, removed: 0 })
})
