import assert from 'node:assert/strict'
import test from 'node:test'
import { parseCsvLine } from '../src/csv.mjs'

test('plain fields are unchanged', () => {
  assert.deepEqual(parseCsvLine('a,b,c'), ['a', 'b', 'c'])
  assert.deepEqual(parseCsvLine(' a , b'), [' a ', ' b'])
})

test('quoted fields keep commas and unescape doubled quotes', () => {
  assert.deepEqual(parseCsvLine('"a,b",c'), ['a,b', 'c'])
  assert.deepEqual(parseCsvLine('"say ""hi""",x'), ['say "hi"', 'x'])
  assert.deepEqual(parseCsvLine('"",x'), ['', 'x'])
})

test('empty fields are preserved', () => {
  assert.deepEqual(parseCsvLine('a,,b'), ['a', '', 'b'])
  assert.deepEqual(parseCsvLine('a,'), ['a', ''])
  assert.deepEqual(parseCsvLine(''), [''])
})

test('unterminated quotes are rejected', () => {
  assert.throws(() => parseCsvLine('"abc'), SyntaxError)
  assert.throws(() => parseCsvLine('x,"a""'), SyntaxError)
})
