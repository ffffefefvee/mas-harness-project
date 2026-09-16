const RULES = [
  {
    id: 'merge-conflict-marker',
    severity: 'critical',
    confidence: 'high',
    pattern: /^\s*(?:<{7}|={7}|>{7})(?:\s|$)/gm,
    message: 'Unresolved merge-conflict marker.',
  },
  {
    id: 'empty-catch',
    severity: 'medium',
    confidence: 'high',
    pattern: /catch\s*(?:\([^)]*\))?\s*\{\s*\}/g,
    message: 'Empty catch block discards an error without evidence or recovery.',
  },
  {
    id: 'not-implemented-stub',
    severity: 'high',
    confidence: 'high',
    pattern: /throw\s+new\s+Error\s*\(\s*['"`](?:not implemented|todo|stub)\b[^'"`]*['"`]\s*\)/gi,
    message: 'Executable path contains an explicit not-implemented stub.',
  },
  {
    id: 'unexplained-ts-ignore',
    severity: 'low',
    confidence: 'high',
    pattern: /@ts-ignore(?![^\n]*--\s*\S)/g,
    message: 'TypeScript suppression has no inline justification (`@ts-ignore -- reason`).',
  },
  {
    id: 'probable-hardcoded-secret',
    severity: 'critical',
    confidence: 'medium',
    pattern: /\b(?:api[_-]?key|secret|token|password)\b\s*[:=]\s*['"][A-Za-z0-9_\-\/+=]{16,}['"]/gi,
    message: 'Probable hardcoded credential. Verify with a dedicated secret scanner.',
    redact: true,
  },
]

function lineAndColumn(source, offset) {
  const prefix = source.slice(0, offset)
  const lines = prefix.split('\n')
  return { line: lines.length, column: lines.at(-1).length + 1 }
}

function evidenceFor(match, redact) {
  if (redact) return '[redacted probable credential]'
  return match[0].replace(/\s+/g, ' ').slice(0, 240)
}

export function scanContent(path, source) {
  const findings = []
  for (const rule of RULES) {
    rule.pattern.lastIndex = 0
    let occurrence = 0
    for (const match of source.matchAll(rule.pattern)) {
      occurrence += 1
      const location = lineAndColumn(source, match.index)
      findings.push({
        ruleId: rule.id,
        severity: rule.severity,
        confidence: rule.confidence,
        path,
        line: location.line,
        column: location.column,
        occurrence,
        evidence: evidenceFor(match, rule.redact),
        message: rule.message,
      })
    }
  }
  return findings
}

export const analyzerMetadata = Object.freeze({
  id: 'roundtable-deterministic-beta',
  version: '0.0.1',
  limitations: [
    'Heuristic findings are not proof of runtime failure or AI authorship.',
    'This spike scans text files only and does not parse language ASTs.',
  ],
})
