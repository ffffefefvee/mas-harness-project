const PROJECT_HINTS = /\b(?:this repository|our repository|our repo|internal|workspace|local config|current branch|our implementation)\b/i
const OPINION_HINTS = /\b(?:should|prefer|better|worse|I think|recommend)\b/i
const PUBLIC_FACT_HINTS = /\b(?:version|released|price|costs?|supports?|requires?|law|standard|research|published|founded|located|according to)\b/i

export function classifyClaim(claim) {
  const text = claim.trim()
  if (!text) return 'not_applicable'
  if (PROJECT_HINTS.test(text)) return 'project_verifiable'
  if (OPINION_HINTS.test(text) && !PUBLIC_FACT_HINTS.test(text)) return 'logical_or_opinion'
  if (PUBLIC_FACT_HINTS.test(text) || /\b\d+(?:\.\d+)?%?\b/.test(text)) return 'web_verifiable'
  return 'ephemeral_or_private'
}

export function claimCheckDecision(claim, { risk = 'low', cached = false } = {}) {
  const classification = classifyClaim(claim)
  const eligible = classification === 'web_verifiable' && !cached && risk !== 'low'
  return {
    claim,
    classification,
    risk,
    route: eligible ? 'targeted_web_search' : classification === 'project_verifiable' ? 'project_evidence' : 'skip',
    reason: eligible ? 'material public claim' : cached ? 'fresh cached result' : 'policy did not select web retrieval',
  }
}
