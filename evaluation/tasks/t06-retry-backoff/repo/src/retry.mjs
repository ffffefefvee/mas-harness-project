export async function retry(operation, { attempts, baseDelayMs, sleep }) {
  let lastError
  for (let attempt = 0; attempt <= attempts; attempt++) {
    try {
      return await operation(attempt)
    } catch (error) {
      lastError = error
      await sleep(baseDelayMs)
    }
  }
  throw lastError
}
