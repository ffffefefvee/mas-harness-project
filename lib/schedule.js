/**
 * Trailing debounce with a maximum wait: `run` fires `debounceMs` after the last request,
 * but never later than `maxWaitMs` after the first unserved request, so continuous edits
 * cannot starve scanning (observed at runtime in DSH with a pure trailing debounce).
 */
export function createScanScheduler({ debounceMs, maxWaitMs, run, now = Date.now }) {
  const maxWait = Math.max(maxWaitMs ?? debounceMs, debounceMs)
  let timer
  let firstPendingAt
  let closed = false
  const fire = () => {
    timer = undefined
    firstPendingAt = undefined
    if (!closed) run()
  }
  return {
    request() {
      if (closed) return
      const at = now()
      firstPendingAt ??= at
      clearTimeout(timer)
      timer = setTimeout(fire, Math.max(0, Math.min(debounceMs, firstPendingAt + maxWait - at)))
    },
    /** Run now (explicit service requests bypass the debounce), cancelling any pending timer. */
    flush() {
      if (closed) return
      clearTimeout(timer)
      fire()
    },
    close() {
      closed = true
      clearTimeout(timer)
      timer = undefined
    },
    get pending() {
      return timer !== undefined
    },
  }
}
