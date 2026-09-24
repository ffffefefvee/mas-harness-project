import assert from 'node:assert/strict'
import test from 'node:test'
import { slugify } from '../src/slug.mjs'

test('collapses separator runs and trims', () => {
  assert.equal(slugify('Hello, World!'), 'hello-world')
  assert.equal(slugify('a--b__c'), 'a-b-c')
  assert.equal(slugify('  spaced   out  '), 'spaced-out')
})

test('reduces diacritics to base letters', () => {
  assert.equal(slugify('  Déjà vu  '), 'deja-vu')
  assert.equal(slugify('Crème Brûlée 2024'), 'creme-brulee-2024')
})

test('returns empty string without alphanumerics', () => {
  assert.equal(slugify(''), '')
  assert.equal(slugify('---'), '')
  assert.equal(slugify('!!!'), '')
})
