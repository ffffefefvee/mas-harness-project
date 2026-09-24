export class FindingLedger {
  #records = new Map()
  #seen = new Set()
  #changes = { new: 0, worsened: 0, fixed: 0 }

  constructor(records = []) {
    for (const record of records) this.#records.set(record.fingerprint, { ...record })
  }

  beginRun() {
    this.#seen.clear()
    this.#changes = { new: 0, worsened: 0, fixed: 0 }
  }

  observe(finding) {
    this.#seen.add(finding.fingerprint)
    const prior = this.#records.get(finding.fingerprint)
    const now = new Date().toISOString()
    const status = prior?.status === 'fixed' ? 'open' : (prior?.status ?? 'open')
    const baselineStatus = prior?.status === 'fixed' ? 'worsened' : prior ? 'existing' : 'new'
    if (baselineStatus === 'new') this.#changes.new += 1
    if (baselineStatus === 'worsened') this.#changes.worsened += 1
    const { resolvedAt: _resolvedAt, ...base } = prior ?? {}
    const record = {
      ...base,
      ...finding,
      status,
      baselineStatus,
      firstSeenAt: prior?.firstSeenAt ?? now,
      lastSeenAt: now,
    }
    this.#records.set(record.fingerprint, record)
    return record
  }

  /**
   * Close the run. A previously open record that was not observed becomes `fixed` only if
   * `isResolvable(record)` says this run actually re-checked its location: a file that could
   * not be read, was skipped, or lies outside a targeted scan keeps its previous state.
   */
  finishRun({ isResolvable = () => true } = {}) {
    const now = new Date().toISOString()
    for (const [fingerprint, record] of this.#records) {
      if (!this.#seen.has(fingerprint) && record.status !== 'fixed' && isResolvable(record)) {
        this.#changes.fixed += 1
        this.#records.set(fingerprint, {
          ...record,
          status: 'fixed',
          baselineStatus: 'improved',
          resolvedAt: now,
        })
      }
    }
    return this.snapshot()
  }

  /** Counts of state changes produced by the current run. */
  changes() {
    return { ...this.#changes }
  }

  snapshot() {
    return [...this.#records.values()].sort((a, b) =>
      a.fingerprint.localeCompare(b.fingerprint),
    )
  }

  open() {
    return this.snapshot().filter(record => record.status !== 'fixed')
  }
}
