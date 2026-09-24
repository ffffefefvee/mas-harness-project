export function once(bus, event, handler) {
  let called = false
  const unsubscribe = bus.on(event, payload => {
    if (called) return
    called = true
    unsubscribe()
    handler(payload)
  })
  return unsubscribe
}
