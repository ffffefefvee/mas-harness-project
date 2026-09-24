import assert from 'node:assert/strict'
import test from 'node:test'
import {
  binomialPmf,
  costPerAccepted,
  latencySummary,
  mcnemarExact,
  mcnemarExactPower,
  mcnemarExactSampleSize,
  mcnemarSampleSize,
  normalQuantile,
  pairedBootstrapDiff,
  quantile,
  signTest,
  wilson,
} from '../src/stats.mjs'

const close = (actual, expected, tolerance, message) => assert.ok(Math.abs(actual - expected) <= tolerance, `${message ?? ''} expected ${expected}, got ${actual}`)

test('normal quantile matches tabulated values', () => {
  close(normalQuantile(0.975), 1.959964, 1e-6)
  close(normalQuantile(0.8), 0.841621, 1e-6)
  close(normalQuantile(0.5), 0, 1e-12)
  close(normalQuantile(0.001), -3.090232, 1e-6)
})

test('wilson interval matches hand computation', () => {
  // k=8, n=10, z=1.959964: center=(0.8+0.192073)/1.384146=0.716736, margin=0.227710 -> [0.4902, 0.9433]
  const ci = wilson(8, 10)
  close(ci.low, 0.4902, 1e-4)
  close(ci.high, 0.9433, 1e-4)
  const zero = wilson(0, 10)
  assert.equal(zero.low, 0)
  close(zero.high, 0.2775, 1e-4)
  assert.equal(wilson(0, 0).estimate, null)
  assert.throws(() => wilson(3, 2), RangeError)
})

test('exact McNemar p-values match binomial sums', () => {
  // b=1, c=9: 2 * (1 + 10) / 1024 = 0.021484375
  close(mcnemarExact(1, 9).pValue, 22 / 1024, 1e-12)
  // b=2, c=8: 2 * (1 + 10 + 45) / 1024 = 0.109375
  close(mcnemarExact(2, 8).pValue, 0.109375, 1e-12)
  assert.equal(mcnemarExact(5, 5).pValue, 1)
  assert.equal(mcnemarExact(0, 0).pValue, 1)
  close(mcnemarExact(0, 6).pValue, 2 / 64, 1e-12)
})

test('sign test drops ties and matches McNemar', () => {
  const result = signTest([1, 1, 1, 1, 1, 1, 0, 0, -1])
  assert.deepEqual({ positive: result.positive, negative: result.negative, ties: result.ties }, { positive: 6, negative: 1, ties: 2 })
  close(result.pValue, 2 * (1 + 7) / 128, 1e-12)
})

test('paired bootstrap is deterministic, centered, and degenerate when all pairs agree', () => {
  const a = [1, 0, 0, 1, 0, 1, 0, 0, 1, 0]
  const b = [1, 1, 0, 1, 1, 1, 0, 1, 1, 0]
  const first = pairedBootstrapDiff(a, b, { seed: 7, iterations: 4000 })
  const second = pairedBootstrapDiff(a, b, { seed: 7, iterations: 4000 })
  assert.deepEqual(first, second)
  close(first.estimate, 0.3, 1e-12)
  assert.ok(first.low <= 0.3 && first.high >= 0.3)
  assert.ok(first.low >= 0 && first.high <= 0.7, `unexpected interval ${first.low}..${first.high}`)
  const same = pairedBootstrapDiff(a, a, { seed: 1, iterations: 500 })
  assert.deepEqual([same.estimate, same.low, same.high], [0, 0, 0])
  assert.throws(() => pairedBootstrapDiff([1], [1, 0]), RangeError)
})

test('quantiles and latency summary use type-7 interpolation and keep missing values visible', () => {
  assert.equal(quantile([1, 2, 3, 4], 0.5), 2.5)
  close(quantile([10, 20, 30, 40, 50], 0.95), 48, 1e-12)
  const summary = latencySummary([100, 200, null, 300, Number.NaN])
  assert.deepEqual(summary, { n: 3, missing: 2, p50: 200, p95: 290, max: 300 })
})

test('cost per accepted task keeps failures in the numerator and is undefined with no acceptance', () => {
  assert.deepEqual(costPerAccepted([5, 5, 10], [true, false, true]), { totalCost: 20, accepted: 2, tasks: 3, missingCost: 0, value: 10 })
  assert.equal(costPerAccepted([5, 5], [false, false]).value, null)
})

test('sample size: normal approximation matches Connor formula by hand', () => {
  // delta=0.1, discordant=0.2: 1.959964*0.447214 = 0.876522; 0.841621*0.435890 = 0.366854;
  // (0.876522 + 0.366854)^2 / 0.01 = 1.243376^2 / 0.01 = 154.598 -> 155
  const result = mcnemarSampleSize({ delta: 0.1, discordant: 0.2 })
  close(result.exact, 154.598, 0.01)
  assert.equal(result.n, 155)
  assert.throws(() => mcnemarSampleSize({ delta: 0.3, discordant: 0.2 }), RangeError)
})

test('exact power is monotone in effect size and reaches target at the exact sample size', () => {
  const small = mcnemarExactPower({ n: 100, p10: 0.125, p01: 0.075 })
  const large = mcnemarExactPower({ n: 100, p10: 0.15, p01: 0.05 })
  assert.ok(large > small)
  assert.ok(Math.abs(mcnemarExactPower({ n: 60, p10: 0.1, p01: 0.1 }) - 0.05) < 0.05, 'null effect gives power near alpha or below')
  const size = mcnemarExactSampleSize({ delta: 0.15, discordant: 0.2 })
  assert.ok(size.powerAtN >= 0.8)
  assert.ok(size.n >= 60 && size.n <= 90, `unexpected exact n ${size.n}`)
  close(binomialPmf(3, 10, 0.5), 120 / 1024, 1e-12)
})
