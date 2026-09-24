import { join, resolve } from 'node:path'

export function resolveStaticPath(root, requestPath) {
  const candidate = resolve(join(root, requestPath))
  return candidate.startsWith(root) ? candidate : null
}
