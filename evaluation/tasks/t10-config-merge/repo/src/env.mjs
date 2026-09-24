export function fromEnv(env, prefix) {
  const result = {}
  for (const [name, value] of Object.entries(env)) {
    if (name.startsWith(prefix)) result[name.slice(prefix.length).toLowerCase()] = value
  }
  return result
}
