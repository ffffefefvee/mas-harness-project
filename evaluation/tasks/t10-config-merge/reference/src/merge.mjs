const isPlainObject = value => value !== null && typeof value === 'object' && Object.getPrototypeOf(value) === Object.prototype

export function deepMerge(base, override) {
  const result = { ...base }
  for (const [key, value] of Object.entries(override ?? {})) {
    if (value === undefined) continue
    result[key] = isPlainObject(value) && isPlainObject(base?.[key]) ? deepMerge(base[key], value) : value
  }
  return result
}
