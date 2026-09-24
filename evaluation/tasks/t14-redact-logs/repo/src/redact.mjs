const SENSITIVE = ['password', 'token', 'secret']

export function redact(value) {
  for (const key of Object.keys(value)) {
    if (SENSITIVE.includes(key)) value[key] = '[REDACTED]'
  }
  return value
}
