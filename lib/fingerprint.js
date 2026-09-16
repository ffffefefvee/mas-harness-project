import { createHash } from 'node:crypto'

function normalizeEvidence(value) {
  return value
    .toLowerCase()
    .replace(/\b\d+\b/g, '#')
    .replace(/\s+/g, ' ')
    .trim()
}

export function findingFingerprint(finding) {
  const stable = [
    finding.ruleId,
    finding.path.replaceAll('\\', '/'),
    normalizeEvidence(finding.evidence),
    String(finding.occurrence ?? 1),
  ].join('\0')
  return createHash('sha256').update(stable).digest('hex')
}
