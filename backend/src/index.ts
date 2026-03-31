import 'dotenv/config'
import express from 'express'
import cors from 'cors'
import helmet from 'helmet'
import rateLimit from 'express-rate-limit'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

// 导入路由
import keywordRoutes from './routes/keywords.js'
import newsRoutes from './routes/news.js'
import settingsRoutes from './routes/settings.js'

// 导入日志
import { logger } from './utils/logger.js'

// 加载配置
import { getConfig } from './utils/config.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

const app = express()
const config = getConfig()

// 中间件
app.use(helmet())
app.use(cors(config.security.cors))
app.use(express.json())

// 速率限制
const limiter = rateLimit({
  windowMs: config.security.rateLimit.windowMs,
  max: config.security.rateLimit.maxRequests,
  message: 'Too many requests from this IP, please try again later.',
})
app.use('/api/', limiter)

// 健康检查
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() })
})

// API 路由
app.use('/api/keywords', keywordRoutes)
app.use('/api/news', newsRoutes)
app.use('/api/settings', settingsRoutes)

// 错误处理
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  logger.error('Unhandled error:', err)
  res.status(500).json({
    error: 'Internal server error',
    message: process.env.NODE_ENV === 'development' ? err.message : undefined,
  })
})

// 404 处理
app.use((req, res) => {
  res.status(404).json({ error: 'Not found' })
})

// 启动服务
const PORT = config.server.port
app.listen(PORT, config.server.host, () => {
  logger.info(`✅ Server running at http://${config.server.host}:${PORT}`)
  logger.info(`📦 Environment: ${config.server.environment}`)
  logger.info(`🔧 Config loaded from: ${process.env.CONFIG_PATH || 'default config'}`)
})
