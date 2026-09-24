const SENSITIVE = new Set(['password', 'secret', 'token', 'apikey', 'authorization', 'cookie', 'setcookie'])
const BEARER = /\bbearer\s+[A-Za-z0-9._~+/=-]+/gi

const isPlainObject = value => value !== null && typeof value === 'object' && Object.getPrototypeOf(value) === Object.prototype
const normalizeKey = key => key.toLowerCase().replace(/[-_]/g, '')

function walk(value, seen) {
  if (typeof value === 'string') return value.replace(BEARER, 'Bearer [REDACTED]')
  if (!Array.isArray(value) && !isPlainObject(value)) return value
  if (seen.has(value)) return '[Circular]'
  seen.add(value)
  const result = Array.isArray(value)
    ? value.map(item => walk(item, seen))
    : Object.fromEntries(Object.entries(value).map(([key, item]) => [key, SENSITIVE.has(normalizeKey(key)) ? '[REDACTED]' : walk(item, seen)]))
  seen.delete(value)
  return result
}

export function redact(value) {
  return walk(value, new Set())
}
