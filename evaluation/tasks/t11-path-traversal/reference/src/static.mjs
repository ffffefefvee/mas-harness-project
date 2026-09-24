import { isAbsolute, relative, resolve, sep } from 'node:path'

export function resolveStaticPath(root, requestPath) {
  let decoded
  try {
    decoded = decodeURIComponent(requestPath)
  } catch {
    throw new RangeError('malformed percent-encoding')
  }
  if (decoded.includes('\0')) return null
  const unified = decoded.replaceAll('\\', '/')
  const withoutLeading = unified.replace(/^\/+/, '')
  if (/^[A-Za-z]:/.test(withoutLeading) || unified.startsWith('//')) return null
  const base = resolve(root)
  const candidate = resolve(base, ...withoutLeading.split('/').filter(Boolean))
  const offset = relative(base, candidate)
  if (offset === '') return candidate
  if (offset === '..' || offset.startsWith(`..${sep}`) || isAbsolute(offset)) return null
  return candidate
}
