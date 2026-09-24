export class LruCache {
  #limit
  #entries = new Map()

  constructor(limit) {
    if (!Number.isInteger(limit) || limit < 1) throw new RangeError('limit must be a positive integer')
    this.#limit = limit
  }

  get(key) {
    if (!this.#entries.has(key)) return undefined
    const value = this.#entries.get(key)
    this.#entries.delete(key)
    this.#entries.set(key, value)
    return value
  }

  set(key, value) {
    this.#entries.delete(key)
    this.#entries.set(key, value)
    if (this.#entries.size > this.#limit) {
      this.#entries.delete(this.#entries.keys().next().value)
    }
    return this
  }

  has(key) {
    return this.#entries.has(key)
  }

  get size() {
    return this.#entries.size
  }
}
