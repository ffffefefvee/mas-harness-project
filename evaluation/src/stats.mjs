// Statistics for paired arm comparisons on identical tasks. Pure functions, no dependencies.
//
// Conventions:
// - Binary outcomes are 0/1 (or booleans); refusals, timeouts, budget exhaustion, and harness
//   errors are failures and stay in every denominator (callers must not filter them out).
// - Every stochastic procedure takes an explicit seed so reports are reproducible.

const ACKLAM_A = [-3.969683028665376e+01, 2.209460984245205e+02, -2.759285104469687e+02, 1.383577518672690e+02, -3.066479806614716e+01, 2.506628277459239e+00]
const ACKLAM_B = [-5.447609879822406e+01, 1.615858368580409e+02, -1.556989798598866e+02, 6.680131188771972e+01, -1.328068155288572e+01]
const ACKLAM_C = [-7.784894002430293e-03, -3.223964580411365e-01, -2.400758277161838e+00, -2.549732539343734e+00, 4.374664141464968e+00, 2.938163982698783e+00]
const ACKLAM_D = [7.784695709041462e-03, 3.224671290700398e-01, 2.445134137142996e+00, 3.754408661907416e+00]

/** Inverse standard normal CDF (Acklam's rational approximation, relative error < 1.2e-9). */
export function normalQuantile(p) {
  if (!(p > 0 && p < 1)) throw new RangeError('p must be in (0, 1)')
  const low = 0.02425
  const tail = q => (((((ACKLAM_C[0] * q + ACKLAM_C[1]) * q + ACKLAM_C[2]) * q + ACKLAM_C[3]) * q + ACKLAM_C[4]) * q + ACKLAM_C[5]) /
    ((((ACKLAM_D[0] * q + ACKLAM_D[1]) * q + ACKLAM_D[2]) * q + ACKLAM_D[3]) * q + 1)
  if (p < low) return tail(Math.sqrt(-2 * Math.log(p)))
  if (p > 1 - low) return -tail(Math.sqrt(-2 * Math.log(1 - p)))
  const q = p - 0.5
  const r = q * q
  return (((((ACKLAM_A[0] * r + ACKLAM_A[1]) * r + ACKLAM_A[2]) * r + ACKLAM_A[3]) * r + ACKLAM_A[4]) * r + ACKLAM_A[5]) * q /
    (((((ACKLAM_B[0] * r + ACKLAM_B[1]) * r + ACKLAM_B[2]) * r + ACKLAM_B[3]) * r + ACKLAM_B[4]) * r + 1)
}

/** Wilson score interval for k successes out of n. `estimate` is null when n = 0. */
export function wilson(k, n, confidence = 0.95) {
  if (!Number.isInteger(k) || !Number.isInteger(n) || k < 0 || n < 0 || k > n) throw new RangeError('need integers 0 <= k <= n')
  if (n === 0) return { k, n, estimate: null, low: 0, high: 1 }
  const z = normalQuantile(1 - (1 - confidence) / 2)
  const p = k / n
  const z2 = z * z
  const denominator = 1 + z2 / n
  const center = (p + z2 / (2 * n)) / denominator
  const margin = (z * Math.sqrt(p * (1 - p) / n + z2 / (4 * n * n))) / denominator
  return { k, n, estimate: p, low: Math.max(0, center - margin), high: Math.min(1, center + margin) }
}

const logFactorialCache = [0]
function logFactorial(n) {
  for (let index = logFactorialCache.length; index <= n; index++) {
    logFactorialCache[index] = logFactorialCache[index - 1] + Math.log(index)
  }
  return logFactorialCache[n]
}

function logChoose(n, k) {
  return logFactorial(n) - logFactorial(k) - logFactorial(n - k)
}

/** Binomial probability mass P(X = k), X ~ Binomial(n, p). */
export function binomialPmf(k, n, p) {
  if (k < 0 || k > n) return 0
  if (p === 0) return k === 0 ? 1 : 0
  if (p === 1) return k === n ? 1 : 0
  return Math.exp(logChoose(n, k) + k * Math.log(p) + (n - k) * Math.log(1 - p))
}

/** Lower-tail CDF of Binomial(n, 0.5): cdf[i] = P(X <= i). */
function halfBinomialCdf(n) {
  const cdf = new Float64Array(n + 1)
  let total = 0
  for (let index = 0; index <= n; index++) {
    total += Math.exp(logChoose(n, index) - n * Math.LN2)
    cdf[index] = total
  }
  return cdf
}

/**
 * Exact (binomial) McNemar test on discordant pairs.
 * b = pairs where arm A passed and arm B failed; c = A failed and B passed. Two-sided.
 */
export function mcnemarExact(b, c) {
  if (!Number.isInteger(b) || !Number.isInteger(c) || b < 0 || c < 0) throw new RangeError('b and c must be non-negative integers')
  const n = b + c
  if (n === 0) return { b, c, discordant: 0, pValue: 1 }
  const cdf = halfBinomialCdf(n)
  return { b, c, discordant: n, pValue: Math.min(1, 2 * cdf[Math.min(b, c)]) }
}

/** Exact two-sided sign test on paired differences; zero differences are dropped (standard). */
export function signTest(differences) {
  let positive = 0
  let negative = 0
  for (const difference of differences) {
    if (difference > 0) positive += 1
    else if (difference < 0) negative += 1
  }
  const { pValue } = mcnemarExact(negative, positive)
  return { positive, negative, ties: differences.length - positive - negative, pValue }
}

/** Deterministic 32-bit PRNG (mulberry32). */
export function createRandom(seed = 1) {
  let state = seed >>> 0
  return () => {
    state = (state + 0x6D2B79F5) >>> 0
    let value = state
    value = Math.imul(value ^ (value >>> 15), value | 1)
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61)
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296
  }
}

const toNumber = value => (value === true ? 1 : value === false ? 0 : Number(value))
const mean = values => values.reduce((sum, value) => sum + value, 0) / values.length

/**
 * Paired bootstrap confidence interval for mean(b) - mean(a) on matched items
 * (percentile method). Resamples item indices, keeping pairs together.
 */
export function pairedBootstrapDiff(a, b, { iterations = 10_000, confidence = 0.95, seed = 1 } = {}) {
  if (a.length !== b.length) throw new RangeError('paired samples must have equal length')
  if (a.length === 0) return { n: 0, estimate: null, low: null, high: null, iterations, seed }
  const x = a.map(toNumber)
  const y = b.map(toNumber)
  const differences = y.map((value, index) => value - x[index])
  const random = createRandom(seed)
  const samples = new Float64Array(iterations)
  for (let iteration = 0; iteration < iterations; iteration++) {
    let total = 0
    for (let draw = 0; draw < differences.length; draw++) total += differences[Math.floor(random() * differences.length)]
    samples[iteration] = total / differences.length
  }
  samples.sort()
  const alpha = 1 - confidence
  return {
    n: differences.length,
    estimate: mean(differences),
    low: quantile(samples, alpha / 2, { sorted: true }),
    high: quantile(samples, 1 - alpha / 2, { sorted: true }),
    iterations,
    seed,
  }
}

/** Sample quantile, linear interpolation between order statistics (Hyndman–Fan type 7). */
export function quantile(values, p, { sorted = false } = {}) {
  if (values.length === 0) return null
  if (!(p >= 0 && p <= 1)) throw new RangeError('p must be in [0, 1]')
  const ordered = sorted ? values : [...values].sort((left, right) => left - right)
  const position = (ordered.length - 1) * p
  const lower = Math.floor(position)
  const upper = Math.ceil(position)
  return ordered[lower] + (position - lower) * (ordered[upper] - ordered[lower])
}

export function latencySummary(values) {
  const finite = values.filter(Number.isFinite)
  return {
    n: finite.length,
    missing: values.length - finite.length,
    p50: quantile(finite, 0.5),
    p95: quantile(finite, 0.95),
    max: finite.length ? Math.max(...finite) : null,
  }
}

/**
 * Total cost divided by accepted (passing) tasks. Failed and refused tasks still add their cost.
 * `value` is null when nothing was accepted (cost per accepted task is undefined, not zero).
 */
export function costPerAccepted(costs, passes) {
  if (costs.length !== passes.length) throw new RangeError('costs and passes must have equal length')
  const totalCost = costs.reduce((sum, cost) => sum + (Number.isFinite(cost) ? cost : 0), 0)
  const missingCost = costs.filter(cost => !Number.isFinite(cost)).length
  const accepted = passes.filter(Boolean).length
  return { totalCost, accepted, tasks: costs.length, missingCost, value: accepted ? totalCost / accepted : null }
}

/**
 * Approximate number of matched tasks for a two-sided McNemar test (Connor 1987).
 * delta = p10 - p01 (difference of pass rates); discordant = p10 + p01 (share of tasks where
 * the arms disagree). Requires discordant >= |delta|.
 */
export function mcnemarSampleSize({ delta, discordant, alpha = 0.05, power = 0.8 }) {
  const effect = Math.abs(delta)
  if (!(effect > 0) || !(discordant >= effect) || discordant > 1) throw new RangeError('need 0 < |delta| <= discordant <= 1')
  const zAlpha = normalQuantile(1 - alpha / 2)
  const zBeta = normalQuantile(power)
  const n = (zAlpha * Math.sqrt(discordant) + zBeta * Math.sqrt(discordant - effect * effect)) ** 2 / (effect * effect)
  return { n: Math.ceil(n), exact: n, delta, discordant, alpha, power }
}

/**
 * Exact power of the two-sided exact McNemar test at n matched tasks, where
 * p10 = P(B passes, A fails) and p01 = P(A passes, B fails). Enumerates the number of
 * discordant pairs and the split between them.
 */
export function mcnemarExactPower({ n, p10, p01, alpha = 0.05 }) {
  const discordantRate = p10 + p01
  if (!Number.isInteger(n) || n < 1 || p10 < 0 || p01 < 0 || discordantRate > 1) throw new RangeError('invalid power inputs')
  if (discordantRate === 0) return 0
  const share = p10 / discordantRate
  let power = 0
  for (let discordant = 1; discordant <= n; discordant++) {
    const weight = binomialPmf(discordant, n, discordantRate)
    if (weight < 1e-15) continue
    const cdf = halfBinomialCdf(discordant)
    let reject = 0
    for (let c = 0; c <= discordant; c++) {
      const pValue = Math.min(1, 2 * cdf[Math.min(c, discordant - c)])
      if (pValue <= alpha) reject += binomialPmf(c, discordant, share)
    }
    power += weight * reject
  }
  return power
}

/**
 * Smallest n whose exact power reaches the target and stays there for the next `stableSpan`
 * sample sizes (exact tests have saw-tooth power curves).
 */
export function mcnemarExactSampleSize({ delta, discordant, alpha = 0.05, power = 0.8, maxN = 2000, stableSpan = 10 }) {
  const p10 = (discordant + delta) / 2
  const p01 = (discordant - delta) / 2
  if (p01 < 0) throw new RangeError('need discordant >= delta')
  const start = Math.max(1, mcnemarSampleSize({ delta, discordant, alpha, power }).n - 40)
  for (let n = start; n <= maxN; n++) {
    let stable = true
    for (let offset = 0; offset <= stableSpan; offset++) {
      if (mcnemarExactPower({ n: n + offset, p10, p01, alpha }) < power) {
        stable = false
        break
      }
    }
    if (stable) return { n, powerAtN: mcnemarExactPower({ n, p10, p01, alpha }), delta, discordant, alpha, power }
  }
  return { n: null, delta, discordant, alpha, power }
}
