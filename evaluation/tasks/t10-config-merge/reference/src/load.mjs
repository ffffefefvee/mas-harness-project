import { fromEnv } from './env.mjs'
import { deepMerge } from './merge.mjs'

export function loadConfig(defaults, fileConfig, env) {
  return deepMerge(deepMerge(defaults, fileConfig), fromEnv(env, 'APP_'))
}
