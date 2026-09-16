export class FindingLedger {
  #records = new Map()
  #seen = new Set()

  constructor(records = []) {
    for (const record of records) this.#records.set(record.fingerprint, { ...record })
  }

  beginRun() {
    this.#seen.clear()
  }

  observe(finding) {
    this.#seen.add(finding.fingerprint)
    const prior = this.#records.get(finding.fingerprint)
    const now = new Date().toISOString()
    const status = prior?.status === 'fixed' ? 'open' : (prior?.status ?? 'open')
    const baselineStatus = prior?.status === 'fixed' ? 'worsened' : prior ? 'existing' : 'new'
    const record = {
      ...prior,
      ...finding,
      status,
      baselineStatus,
      firstSeenAt: prior?.firstSeenAt ?? now,
      lastSeenAt: now,
    }
    this.#records.set(record.fingerprint, record)
    return record
  }

  finishRun() {
    const now = new Date().toISOString()
    for (const [fingerprint, record] of this.#records) {
      if (!this.#seen.has(fingerprint) && record.status !== 'fixed') {
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

  snapshot() {
    return [...this.#records.values()].sort((a, b) =>
      a.fingerprint.localeCompare(b.fingerprint),
    )
  }

  open() {
    return this.snapshot().filter(record => record.status !== 'fixed')
  }
}
