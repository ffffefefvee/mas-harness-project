import { normalizeChoice } from './core.mjs'

const QUESTIONS = Object.freeze({route: {
  type: 'choice',
  instructions: 'Choose the appropriate review mode for this software task, considering impact, uncertainty and complexity. Return one of the three listed labels.',
  criteria: {
    direct: 'Routine, low impact, reversible change with clear acceptance criteria',
    reviewed: 'Moderate uncertainty or multiple components; needs independent review',
    team: 'High-impact, security-sensitive or irreversible task requiring multiple perspectives and explicit approval',
  },
}})

export function requestBody(item, model) {
  // No repository content or paths are sent; callers supply only labeled public-safe cases.
  const state = {task: item.text, signals: item.signals}
  return {...(model ? {model} : {}), state, questions: QUESTIONS}
}

export function providerConfig(provider, env) {
  if (provider === 'laya') {
    const base = new URL(env.LAYA_BASE_URL ?? 'http://127.0.0.1:8000')
    if (base.protocol !== 'http:' || !['localhost', '127.0.0.1', '[::1]'].includes(base.hostname) || base.username || base.password || base.pathname !== '/' || base.search || base.hash)
      throw new Error('Laya must use a local loopback HTTP server root')
    return {url: new URL('/v1/systemone', base).href, token: env.LAYA_API_KEY ?? null, model: null}
  }
  if (provider === 'jev') {
    if (!env.TYPESAFE_API_KEY) throw new Error('TYPESAFE_API_KEY is required for Jev')
    return {url: 'https://api.typesafe.ai/v1/systemone', token: env.TYPESAFE_API_KEY, model: env.JEV_MODEL ?? 'jev-1.13.0'}
  }
  throw new Error('Unknown provider')
}

export async function evaluateOne(item, provider, config, {timeoutMs = 10000, fetchImpl = fetch} = {}) {
  const started = performance.now()
  const response = await fetchImpl(config.url, {
    method: 'POST',
    headers: {'Content-Type': 'application/json', ...(config.token ? {Authorization: `Bearer ${config.token}`} : {})},
    body: JSON.stringify(requestBody(item, config.model)),
    signal: AbortSignal.timeout(timeoutMs),
    redirect: 'error',
  })
  if (!response.ok) throw new Error(`${provider} HTTP ${response.status}`)
  const data = await response.json()
  const decision = normalizeChoice(data?.answers?.route)
  const tokens = data?.usage?.input_tokens
  return {...decision, provider, latencyMs: Math.round(performance.now() - started),
    model: typeof data.model === 'string' ? data.model : null,
    inputTokens: Number.isSafeInteger(tokens) && tokens >= 0 ? tokens : null}
}
