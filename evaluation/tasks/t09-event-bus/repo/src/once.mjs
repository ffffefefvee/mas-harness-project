export function once(bus, event, handler) {
  let called = false
  return bus.on(event, payload => {
    if (called) return
    called = true
    handler(payload)
  })
}
