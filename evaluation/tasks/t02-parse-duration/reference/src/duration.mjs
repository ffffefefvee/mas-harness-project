const FACTORS = [3_600_000, 60_000, 1_000, 1]
const PATTERN = /^(?:(\d+)h)?(?:(\d+)m(?!s))?(?:(\d+)s)?(?:(\d+)ms)?$/

/**
 * Parse a compact duration such as "1h30m", "45s" or "2m500ms" into milliseconds.
 */
export function parseDuration(text) {
  if (typeof text !== 'string' || text === '') throw new RangeError('duration must be a non-empty string')
  const match = PATTERN.exec(text)
  if (!match || match.slice(1).every(part => part === undefined)) throw new RangeError(`invalid duration: ${text}`)
  return FACTORS.reduce((total, factor, index) => total + Number(match[index + 1] ?? 0) * factor, 0)
}
