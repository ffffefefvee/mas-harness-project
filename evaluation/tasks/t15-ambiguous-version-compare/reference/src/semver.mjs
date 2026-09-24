const SEMVER = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-((?:0|[1-9]\d*|\d*[A-Za-z-][0-9A-Za-z-]*)(?:\.(?:0|[1-9]\d*|\d*[A-Za-z-][0-9A-Za-z-]*))*))?(?:\+([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?$/

function parse(version) {
  const match = typeof version === 'string' ? SEMVER.exec(version) : null
  if (!match) throw new TypeError(`invalid version: ${version}`)
  return { core: match.slice(1, 4).map(Number), pre: match[4] === undefined ? [] : match[4].split('.') }
}

const isNumeric = identifier => /^\d+$/.test(identifier)

function compareIdentifiers(left, right) {
  const leftNumeric = isNumeric(left)
  const rightNumeric = isNumeric(right)
  if (leftNumeric && rightNumeric) return Number(left) - Number(right)
  if (leftNumeric) return -1
  if (rightNumeric) return 1
  return left < right ? -1 : left > right ? 1 : 0
}

export function compareVersions(a, b) {
  const left = parse(a)
  const right = parse(b)
  for (let index = 0; index < 3; index++) {
    if (left.core[index] !== right.core[index]) return left.core[index] - right.core[index]
  }
  if (left.pre.length === 0 || right.pre.length === 0) return right.pre.length - left.pre.length
  for (let index = 0; index < Math.max(left.pre.length, right.pre.length); index++) {
    if (left.pre[index] === undefined) return -1
    if (right.pre[index] === undefined) return 1
    const order = compareIdentifiers(left.pre[index], right.pre[index])
    if (order !== 0) return order
  }
  return 0
}
