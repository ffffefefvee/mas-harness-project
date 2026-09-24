export async function retry(operation, { attempts, baseDelayMs, sleep }) {
  if (!Number.isInteger(attempts) || attempts < 1) throw new RangeError('attempts must be a positive integer')
  const errors = []
  for (let attempt = 1; attempt <= attempts; attempt++) {
    if (attempt > 1) await sleep(baseDelayMs * 2 ** (attempt - 2))
    try {
      return await operation(attempt)
    } catch (error) {
      errors.push(error)
    }
  }
  throw new AggregateError(errors, `operation failed after ${attempts} attempts`)
}
