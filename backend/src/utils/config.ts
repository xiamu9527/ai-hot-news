import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { logger } from './logger.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

interface Config {
  server: {
    port: number
    host: string
    environment: string
  }
  database: {
    type: string
    path: string
  }
  api: {
    baseUrl: string
    timeout: number
  }
  datasources: Record<string, any>
  ai: {
    provider: string
    apiKey: string
    apiUrl: string
    model: string
    temperature: number
    maxTokens: number
    timeout: number
    lmStudio: {
      enabled: boolean
      apiUrl: string
      apiKey: string
      model: string
    }
  }
  aiAlternatives: Array<any>
  notifications: {
    enabled: boolean
    types: string[]
    web: {
      enabled: boolean
      useWebSocket: boolean
    }
  }
  crawler: {
    userAgent: string
    timeout: number
    retries: number
    proxy: string | null
    rateLimiting: {
      enabled: boolean
      requestsPerMinute: number
    }
  }
  logging: {
    level: string
    format: string
    file: string
  }
  security: {
    cors: {
      enabled: boolean
      origin: string[]
    }
    rateLimit: {
      enabled: boolean
      windowMs: number
      maxRequests: number
    }
  }
  scheduler: {
    enabled: boolean
    intervalHours: number
  }
}

let config: Config | null = null

function normalizeLmStudioConfig(ai: Partial<Config['ai']> | undefined): Config['ai']['lmStudio'] {
  const lmStudio = (ai?.lmStudio || {}) as Partial<Config['ai']['lmStudio']>

  return {
    enabled: Boolean(lmStudio.enabled),
    apiUrl: String(lmStudio.apiUrl || 'http://localhost:1234/v1'),
    apiKey: String(lmStudio.apiKey || 'lm-studio'),
    model: String(lmStudio.model || ai?.model || ''),
  }
}

function resolveAiConfig(currentConfig: Config) {
  const provider = String(currentConfig.ai.provider || '').toLowerCase()
  const lmStudio = normalizeLmStudioConfig(currentConfig.ai)
  const useLmStudio = lmStudio.enabled || provider === 'lmstudio'

  currentConfig.ai.lmStudio = {
    ...lmStudio,
    enabled: useLmStudio,
  }

  if (!useLmStudio) return

  currentConfig.ai.provider = 'lmstudio'
  currentConfig.ai.apiUrl = currentConfig.ai.lmStudio.apiUrl
  currentConfig.ai.apiKey = currentConfig.ai.lmStudio.apiKey || 'lm-studio'

  if (currentConfig.ai.lmStudio.model) {
    currentConfig.ai.model = currentConfig.ai.lmStudio.model
  }
}

// 深度合并对象
function deepMerge(target: any, source: any): any {
  const output = Object.assign({}, target)
  if (isObject(target) && isObject(source)) {
    Object.keys(source).forEach((key) => {
      if (isObject(source[key])) {
        if (!(key in target)) {
          Object.assign(output, { [key]: source[key] })
        } else {
          output[key] = deepMerge(target[key], source[key])
        }
      } else {
        Object.assign(output, { [key]: source[key] })
      }
    })
  }
  return output
}

function isObject(item: any): boolean {
  return item && typeof item === 'object' && !Array.isArray(item)
}

export function loadConfig(): Config {
  if (config) return config

  const configPath = process.env.CONFIG_PATH ||
    path.resolve(__dirname, '../../../config/config.json')
  const examplePath = path.resolve(__dirname, '../../../config/config.example.json')

  // 先加载 example config 作为默认值
  let defaultConfig: any = {}
  if (fs.existsSync(examplePath)) {
    defaultConfig = JSON.parse(fs.readFileSync(examplePath, 'utf-8'))
  }

  // 如果用户配置存在，合并用户配置
  if (fs.existsSync(configPath)) {
    const userConfig = JSON.parse(fs.readFileSync(configPath, 'utf-8'))
    config = deepMerge(defaultConfig, userConfig) as Config
  } else {
    config = defaultConfig as Config
  }

  config.ai.lmStudio = normalizeLmStudioConfig(config.ai)

  // 从环境变量覆盖配置
  if (process.env.OPENAI_API_KEY) {
    config.ai.apiKey = process.env.OPENAI_API_KEY
  }
  if (process.env.LM_STUDIO_ENABLED) {
    config.ai.lmStudio.enabled = /^(1|true|yes)$/i.test(process.env.LM_STUDIO_ENABLED)
  }
  if (process.env.LM_STUDIO_API_URL) {
    config.ai.lmStudio.apiUrl = process.env.LM_STUDIO_API_URL
  }
  if (process.env.LM_STUDIO_API_KEY) {
    config.ai.lmStudio.apiKey = process.env.LM_STUDIO_API_KEY
  }
  if (process.env.LM_STUDIO_MODEL) {
    config.ai.lmStudio.model = process.env.LM_STUDIO_MODEL
  }
  if (process.env.TWITTER_API_KEY) {
    config.datasources.twitter.apiKey = process.env.TWITTER_API_KEY
  }
  if (process.env.APP_PORT) {
    config.server.port = parseInt(process.env.APP_PORT)
  }

  resolveAiConfig(config)

  logger.info('✅ Configuration loaded successfully')
  return config
}

export function getConfig(): Config {
  if (!config) {
    loadConfig()
  }
  return config!
}

export { Config }
