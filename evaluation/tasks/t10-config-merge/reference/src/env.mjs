function coerce(value) {
  if (value === 'true') return true
  if (value === 'false') return false
  if (/^-?\d+$/.test(value)) return Number(value)
  return value
}

export function fromEnv(env, prefix) {
  const result = {}
  for (const [name, value] of Object.entries(env)) {
    if (!name.startsWith(prefix) || value === undefined) continue
    const path = name.slice(prefix.length).toLowerCase().split('__')
    let node = result
    for (const segment of path.slice(0, -1)) {
      node[segment] ??= {}
      node = node[segment]
    }
    node[path.at(-1)] = coerce(value)
  }
  return result
}
