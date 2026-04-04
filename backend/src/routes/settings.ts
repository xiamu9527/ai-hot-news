import { Router, Request, Response } from 'express'
import { getConfig } from '../utils/config.js'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const router = Router()

// GET /api/settings - 获取设置
router.get('/', (_req: Request, res: Response) => {
  try {
    const config = getConfig()
    const configPath = process.env.CONFIG_PATH || path.resolve(__dirname, '../../../config/config.json')
    const persistedConfig = fs.existsSync(configPath)
      ? JSON.parse(fs.readFileSync(configPath, 'utf-8'))
      : {}
    const persistedAi = persistedConfig.ai || {}
    const persistedLmStudio = persistedAi.lmStudio || {}

    res.json({
      dataSources: Object.fromEntries(
        Object.entries(config.datasources).map(([key, val]: [string, any]) => [
          key,
          { enabled: val.enabled ?? true, limit: val.limit, refreshInterval: val.refreshInterval }
        ])
      ),
      ai: {
        provider: persistedAi.provider || config.ai.provider,
        model: persistedAi.model || config.ai.model,
        hasApiKey: !!persistedAi.apiKey,
        apiUrl: persistedAi.apiUrl || config.ai.apiUrl,
        lmStudio: {
          enabled: persistedLmStudio.enabled ?? config.ai.lmStudio.enabled,
          apiUrl: persistedLmStudio.apiUrl || config.ai.lmStudio.apiUrl,
          model: persistedLmStudio.model || config.ai.lmStudio.model,
          hasApiKey: !!persistedLmStudio.apiKey,
        },
        effective: {
          provider: config.ai.provider,
          model: config.ai.model,
          apiUrl: config.ai.apiUrl,
          mode: config.ai.lmStudio.enabled ? 'lmstudio' : 'cloud',
        },
      },
      notifications: config.notifications,
      scheduler: config.scheduler || { enabled: false, intervalHours: 6 },
    })
  } catch (err: any) {
    res.status(500).json({ error: err.message })
  }
})

// PUT /api/settings - 更新设置
router.put('/', (req: Request, res: Response) => {
  try {
    const configPath = process.env.CONFIG_PATH || path.resolve(__dirname, '../../../config/config.json')
    const currentConfig = JSON.parse(fs.readFileSync(configPath, 'utf-8'))

    const { dataSources, ai, notifications } = req.body

    // 更新数据源开关
    if (dataSources) {
      if (!currentConfig.datasources) currentConfig.datasources = {}
      for (const [key, val] of Object.entries(dataSources) as [string, any][]) {
        if (!currentConfig.datasources[key]) currentConfig.datasources[key] = {}
        if (val.enabled !== undefined) currentConfig.datasources[key].enabled = val.enabled
      }
    }

    // 更新AI配置
    if (ai) {
      if (!currentConfig.ai) currentConfig.ai = {}
      if (ai.apiKey) currentConfig.ai.apiKey = ai.apiKey
      if (ai.apiUrl) currentConfig.ai.apiUrl = ai.apiUrl
      if (ai.model) currentConfig.ai.model = ai.model
      if (ai.provider) currentConfig.ai.provider = ai.provider
      if (ai.lmStudio) {
        if (!currentConfig.ai.lmStudio) currentConfig.ai.lmStudio = {}
        if (ai.lmStudio.enabled !== undefined) currentConfig.ai.lmStudio.enabled = ai.lmStudio.enabled
        if (ai.lmStudio.apiUrl) currentConfig.ai.lmStudio.apiUrl = ai.lmStudio.apiUrl
        if (ai.lmStudio.apiKey) currentConfig.ai.lmStudio.apiKey = ai.lmStudio.apiKey
        if (ai.lmStudio.model) currentConfig.ai.lmStudio.model = ai.lmStudio.model
      }
    }

    // 更新通知配置
    if (notifications) {
      currentConfig.notifications = { ...currentConfig.notifications, ...notifications }
    }

    // 更新调度器配置
    const { scheduler } = req.body
    if (scheduler) {
      if (!currentConfig.scheduler) currentConfig.scheduler = {}
      if (scheduler.enabled !== undefined) currentConfig.scheduler.enabled = scheduler.enabled
      if (scheduler.intervalHours !== undefined) currentConfig.scheduler.intervalHours = scheduler.intervalHours
    }

    fs.writeFileSync(configPath, JSON.stringify(currentConfig, null, 2), 'utf-8')
    res.json({ success: true, message: '设置已保存（重启后生效）' })
  } catch (err: any) {
    res.status(500).json({ error: err.message })
  }
})

export default router
