// Patch representation, safe application, and a minimal unified-diff implementation.
//
// Patch forms accepted by the grader:
//   null | { type: 'none' }                              no change
//   { type: 'files', files: { 'src/a.mjs': '...' | null } }   full-content replacement / deletion
//   { type: 'unified-diff', diff: '--- a/src/a.mjs\n+++ b/src/a.mjs\n@@ ...' }
//
// Line endings: content is compared with CR stripped; a modified file keeps its original EOL
// style, so an LF diff applies to a CRLF checkout (Windows autocrlf) and vice versa.
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { dirname, join, posix } from 'node:path'

export class PatchError extends Error {
  constructor(message) {
    super(message)
    this.name = 'PatchError'
  }
}

export const EMPTY_PATCH = Object.freeze({ type: 'none' })

const normalizeEol = text => text.replaceAll('\r\n', '\n')

/** Split text into lines (without terminators) and remember whether it ended with a newline. */
export function toLines(text) {
  if (text === null || text === undefined || text === '') return { lines: [], finalNewline: true }
  const normalized = normalizeEol(text)
  const finalNewline = normalized.endsWith('\n')
  const body = finalNewline ? normalized.slice(0, -1) : normalized
  return { lines: body.split('\n'), finalNewline }
}

function fromLines(lines, finalNewline, eol) {
  if (lines.length === 0) return ''
  return lines.join(eol) + (finalNewline ? eol : '')
}

/** Longest-common-subsequence line diff. Returns ops of 'equal' | 'delete' | 'insert'. */
export function diffLines(oldLines, newLines) {
  const rows = oldLines.length
  const columns = newLines.length
  const width = columns + 1
  const table = new Uint32Array((rows + 1) * width)
  for (let row = rows - 1; row >= 0; row--) {
    for (let column = columns - 1; column >= 0; column--) {
      table[row * width + column] = oldLines[row] === newLines[column]
        ? table[(row + 1) * width + column + 1] + 1
        : Math.max(table[(row + 1) * width + column], table[row * width + column + 1])
    }
  }
  const ops = []
  let row = 0
  let column = 0
  while (row < rows && column < columns) {
    if (oldLines[row] === newLines[column]) {
      ops.push({ type: 'equal', line: oldLines[row] })
      row += 1
      column += 1
    } else if (table[(row + 1) * width + column] >= table[row * width + column + 1]) {
      ops.push({ type: 'delete', line: oldLines[row++] })
    } else {
      ops.push({ type: 'insert', line: newLines[column++] })
    }
  }
  while (row < rows) ops.push({ type: 'delete', line: oldLines[row++] })
  while (column < columns) ops.push({ type: 'insert', line: newLines[column++] })
  return ops
}

export function countChangedLines(oldText, newText) {
  const ops = diffLines(toLines(oldText).lines, toLines(newText).lines)
  return {
    added: ops.filter(op => op.type === 'insert').length,
    removed: ops.filter(op => op.type === 'delete').length,
  }
}

const NO_NEWLINE = '\\ No newline at end of file'

/** Create a unified diff for one file. `oldText`/`newText` null mean absent (create/delete). */
export function createUnifiedDiff(path, oldText, newText, context = 3) {
  const before = toLines(oldText ?? '')
  const after = toLines(newText ?? '')
  const ops = diffLines(before.lines, after.lines)
  if (!ops.some(op => op.type !== 'equal') && before.finalNewline === after.finalNewline && (oldText === null) === (newText === null)) return ''
  const header = [`--- ${oldText === null ? '/dev/null' : `a/${path}`}`, `+++ ${newText === null ? '/dev/null' : `b/${path}`}`]
  // Annotate ops with old/new line numbers (1-based).
  let oldLine = 1
  let newLine = 1
  const annotated = ops.map(op => {
    const entry = { ...op, oldLine, newLine }
    if (op.type !== 'insert') oldLine += 1
    if (op.type !== 'delete') newLine += 1
    return entry
  })
  const lastOld = before.lines.length
  const lastNew = after.lines.length
  // Mark a finalNewline change as a change on the last line so it lands inside a hunk.
  const changed = annotated.map(op => op.type !== 'equal' ||
    (op.type === 'equal' && before.finalNewline !== after.finalNewline && op.oldLine === lastOld && op.newLine === lastNew))
  const hunks = []
  let index = 0
  while (index < annotated.length) {
    if (!changed[index]) {
      index += 1
      continue
    }
    let start = Math.max(0, index - context)
    let end = index
    while (end < annotated.length) {
      let next = end + 1
      while (next < annotated.length && !changed[next]) next += 1
      if (next < annotated.length && next - end - 1 <= context * 2) end = next
      else break
    }
    const stop = Math.min(annotated.length, end + context + 1)
    hunks.push(annotated.slice(start, stop))
    index = stop
  }
  const body = []
  for (const hunk of hunks) {
    const oldLines = hunk.filter(op => op.type !== 'insert')
    const newLines = hunk.filter(op => op.type !== 'delete')
    const oldStart = oldLines.length ? oldLines[0].oldLine : Math.max(0, hunk[0].oldLine - 1)
    const newStart = newLines.length ? newLines[0].newLine : Math.max(0, hunk[0].newLine - 1)
    body.push(`@@ -${oldStart},${oldLines.length} +${newStart},${newLines.length} @@`)
    for (const op of hunk) {
      if (op.type === 'equal' && before.finalNewline !== after.finalNewline && op.oldLine === lastOld && op.newLine === lastNew) {
        // Same text, different trailing newline: express as delete + insert.
        body.push(`-${op.line}`)
        if (!before.finalNewline) body.push(NO_NEWLINE)
        body.push(`+${op.line}`)
        if (!after.finalNewline) body.push(NO_NEWLINE)
        continue
      }
      const prefix = op.type === 'equal' ? ' ' : op.type === 'delete' ? '-' : '+'
      body.push(`${prefix}${op.line}`)
      const isLastOld = op.type !== 'insert' && op.oldLine === lastOld && !before.finalNewline
      const isLastNew = op.type !== 'delete' && op.newLine === lastNew && !after.finalNewline
      if (isLastOld || isLastNew) body.push(NO_NEWLINE)
    }
  }
  return `${[...header, ...body].join('\n')}\n`
}

/** Build a unified diff that turns the `before` file set into the `after` file set. */
export function createUnifiedDiffForFiles(before, after) {
  const paths = [...new Set([...Object.keys(before), ...Object.keys(after)])].sort()
  return paths.map(path => createUnifiedDiff(path, before[path] ?? null, after[path] ?? null)).join('')
}

const stripPrefix = path => {
  const trimmed = path.split('\t')[0].trim()
  if (trimmed === '/dev/null') return null
  return trimmed.replace(/^[ab]\//, '')
}

/** Parse a (git-style or plain) unified diff into file patches. */
export function parseUnifiedDiff(text) {
  const lines = normalizeEol(text).split('\n')
  const files = []
  let current
  let hunk
  for (let index = 0; index < lines.length; index++) {
    const line = lines[index]
    if (line.startsWith('--- ') && lines[index + 1]?.startsWith('+++ ')) {
      current = { oldPath: stripPrefix(line.slice(4)), newPath: stripPrefix(lines[index + 1].slice(4)), hunks: [] }
      files.push(current)
      hunk = undefined
      index += 1
      continue
    }
    const header = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/.exec(line)
    if (header) {
      if (!current) throw new PatchError(`hunk without file header at diff line ${index + 1}`)
      hunk = {
        oldStart: Number(header[1]),
        oldCount: header[2] === undefined ? 1 : Number(header[2]),
        newStart: Number(header[3]),
        newCount: header[4] === undefined ? 1 : Number(header[4]),
        lines: [],
      }
      current.hunks.push(hunk)
      continue
    }
    if (!hunk) continue // git metadata such as `diff --git`, `index`, `new file mode`
    if (line === NO_NEWLINE || line.startsWith('\\ ')) {
      const previous = hunk.lines.at(-1)
      if (previous) previous.noNewline = true
      continue
    }
    const op = line[0]
    if (op === ' ' || op === '-' || op === '+') {
      hunk.lines.push({ op, text: line.slice(1) })
    } else if (line === '') {
      // Some tools drop the leading space of empty context lines; only accept inside a hunk body.
      const consumedOld = hunk.lines.filter(item => item.op !== '+').length
      const consumedNew = hunk.lines.filter(item => item.op !== '-').length
      if (consumedOld < hunk.oldCount || consumedNew < hunk.newCount) hunk.lines.push({ op: ' ', text: '' })
      else hunk = undefined
    } else {
      hunk = undefined
    }
  }
  for (const file of files) {
    for (const [position, item] of file.hunks.entries()) {
      const oldCount = item.lines.filter(entry => entry.op !== '+').length
      const newCount = item.lines.filter(entry => entry.op !== '-').length
      if (oldCount !== item.oldCount || newCount !== item.newCount) {
        throw new PatchError(`hunk ${position + 1} of ${file.newPath ?? file.oldPath} has wrong line counts (header -${item.oldCount} +${item.newCount}, body -${oldCount} +${newCount})`)
      }
    }
  }
  return files
}

const sameLine = (left, right) => left.replace(/\r$/, '') === right.replace(/\r$/, '')

/** Apply parsed hunks to text. Hunks may be offset (searched outward from the stated line). */
export function applyHunks(originalText, hunks, label = 'file') {
  const eol = originalText?.includes('\r\n') ? '\r\n' : '\n'
  const source = toLines(originalText ?? '')
  const lines = [...source.lines]
  let finalNewline = source.finalNewline
  let delta = 0
  for (const [position, hunk] of hunks.entries()) {
    const expected = hunk.lines.filter(item => item.op !== '+').map(item => item.text)
    const replacement = hunk.lines.filter(item => item.op !== '-').map(item => item.text)
    const target = Math.max(0, (hunk.oldCount === 0 ? hunk.oldStart : hunk.oldStart - 1) + delta)
    const matchesAt = start => start >= 0 && start + expected.length <= lines.length &&
      expected.every((line, offset) => sameLine(lines[start + offset], line))
    let found = -1
    for (let distance = 0; distance <= lines.length; distance++) {
      if (matchesAt(target - distance)) { found = target - distance; break }
      if (matchesAt(target + distance)) { found = target + distance; break }
    }
    if (found === -1) throw new PatchError(`hunk ${position + 1} does not apply to ${label}`)
    lines.splice(found, expected.length, ...replacement)
    delta += replacement.length - expected.length
    const touchesEnd = found + replacement.length === lines.length
    if (touchesEnd) {
      const lastNew = [...hunk.lines].reverse().find(item => item.op !== '-')
      if (lastNew) finalNewline = !lastNew.noNewline
    }
  }
  return fromLines(lines, finalNewline, eol)
}

/** Reject paths that could escape the work directory or touch protected areas. */
export function assertSafeRelativePath(path, protectedPrefixes = []) {
  if (typeof path !== 'string' || path === '') throw new PatchError('empty path')
  const unified = path.replaceAll('\\', '/')
  if (unified.startsWith('/') || /^[A-Za-z]:/.test(unified) || unified.includes('\0')) throw new PatchError(`absolute path not allowed: ${path}`)
  const normalized = posix.normalize(unified)
  if (normalized === '..' || normalized.startsWith('../') || normalized.split('/').includes('..')) throw new PatchError(`path escapes the work directory: ${path}`)
  if (normalized.split('/').includes('.git')) throw new PatchError(`.git is protected: ${path}`)
  for (const prefix of protectedPrefixes) {
    if (normalized === prefix.replace(/\/$/, '') || normalized.startsWith(prefix)) throw new PatchError(`protected path: ${path}`)
  }
  return normalized
}

async function readOptional(path) {
  try {
    return await readFile(path, 'utf8')
  } catch (error) {
    if (error.code === 'ENOENT') return null
    throw error
  }
}

/** Convert any accepted patch form into { path: newContent | null } against the directory. */
export async function resolvePatch(directory, patch, { protectedPrefixes = [] } = {}) {
  if (patch === null || patch === undefined || patch.type === 'none') return {}
  if (patch.type === 'files') {
    if (!patch.files || typeof patch.files !== 'object') throw new PatchError('files patch needs a files object')
    const result = {}
    for (const [path, content] of Object.entries(patch.files)) {
      if (content !== null && typeof content !== 'string') throw new PatchError(`content for ${path} must be a string or null`)
      result[assertSafeRelativePath(path, protectedPrefixes)] = content
    }
    return result
  }
  if (patch.type === 'unified-diff') {
    if (typeof patch.diff !== 'string') throw new PatchError('unified-diff patch needs a diff string')
    const result = {}
    for (const file of parseUnifiedDiff(patch.diff)) {
      const oldPath = file.oldPath === null ? null : assertSafeRelativePath(file.oldPath, protectedPrefixes)
      const newPath = file.newPath === null ? null : assertSafeRelativePath(file.newPath, protectedPrefixes)
      const sourcePath = oldPath ?? newPath
      const current = sourcePath in result ? result[sourcePath] : await readOptional(join(directory, sourcePath))
      if (oldPath !== null && current === null) throw new PatchError(`patched file does not exist: ${oldPath}`)
      if (oldPath === null && current !== null) throw new PatchError(`file to create already exists: ${newPath}`)
      if (newPath === null) {
        result[oldPath] = null
        continue
      }
      const updated = applyHunks(current ?? '', file.hunks, newPath)
      if (oldPath !== null && oldPath !== newPath) result[oldPath] = null
      result[newPath] = updated
    }
    return result
  }
  throw new PatchError(`unknown patch type: ${patch.type}`)
}

/**
 * Apply a patch inside `directory`. Returns per-file change counts. Existing files keep their
 * EOL style when replaced by full content.
 */
export async function applyPatch(directory, patch, options = {}) {
  const changes = await resolvePatch(directory, patch, options)
  const files = []
  let added = 0
  let removed = 0
  for (const [path, content] of Object.entries(changes)) {
    const absolute = join(directory, ...path.split('/'))
    const before = await readOptional(absolute)
    if (content === null) {
      if (before !== null) await rm(absolute)
    } else {
      const eol = before?.includes('\r\n') ? '\r\n' : '\n'
      const { lines, finalNewline } = toLines(content)
      await mkdir(dirname(absolute), { recursive: true })
      await writeFile(absolute, fromLines(lines, finalNewline, eol))
    }
    const counts = countChangedLines(before, content)
    added += counts.added
    removed += counts.removed
    files.push({ path, ...counts, created: before === null && content !== null, deleted: content === null && before !== null })
  }
  return { files, added, removed }
}
