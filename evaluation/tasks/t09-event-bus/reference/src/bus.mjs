export class EventBus {
  #handlers = new Map()

  on(event, handler) {
    const registration = { handler }
    const list = this.#handlers.get(event) ?? []
    list.push(registration)
    this.#handlers.set(event, list)
    return () => {
      const current = this.#handlers.get(event) ?? []
      const index = current.indexOf(registration)
      if (index !== -1) current.splice(index, 1)
    }
  }

  emit(event, payload) {
    const snapshot = [...(this.#handlers.get(event) ?? [])]
    for (const registration of snapshot) registration.handler(payload)
    return snapshot.length
  }
}
