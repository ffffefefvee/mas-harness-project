export class EventBus {
  #handlers = new Map()

  on(event, handler) {
    const list = this.#handlers.get(event) ?? []
    list.push(handler)
    this.#handlers.set(event, list)
    return () => {
      this.#handlers.set(event, list.filter(item => item !== handler))
    }
  }

  emit(event, payload) {
    const list = this.#handlers.get(event) ?? []
    for (const handler of list) handler(payload)
    return list.length
  }
}
