export class LruCache {
  #limit
  #entries = new Map()

  constructor(limit) {
    this.#limit = limit
  }

  get(key) {
    return this.#entries.get(key)
  }

  set(key, value) {
    this.#entries.set(key, value)
    if (this.#entries.size > this.#limit) {
      const oldest = this.#entries.keys().next().value
      this.#entries.delete(oldest)
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
