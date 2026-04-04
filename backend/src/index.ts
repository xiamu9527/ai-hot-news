import 'dotenv/config'
import express from 'express'
import cors from 'cors'
import helmet from 'helmet'
import rateLimit from 'express-rate-limit'
import path from 'path'
import { fileURLToPath } from 'url'

// 导入路由
import keywordRoutes from './routes/keywords.js'
import newsRoutes from './routes/news.js'
import settingsRoutes from './routes/settings.js'
import notificationRoutes from './routes/notifications.js'

// 导入日志
import { logger } from './utils/logger.js'

// 加载配置
import { getConfig } from './utils/config.js'

// 数据库初始化
import { getDb } from './models/database.js'

// 调度器
import { startScheduler } from './services/scheduler.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

const app = express()
const config = getConfig()

// 初始化数据库
getDb()

// 中间件
app.use(helmet())
app.use(cors({
  origin: config.security?.cors?.origin || ['http://localhost:3000', 'http://localhost:3001'],
  credentials: true,
}))
app.use(express.json())

// 速率限制
const limiter = rateLimit({
  windowMs: config.security?.rateLimit?.windowMs || 900000,
  max: config.security?.rateLimit?.maxRequests || 600,
  message: 'Too many requests from this IP, please try again later.',
})
app.use('/api/', limiter)

// 健康检查
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() })
})

// API 路由
app.use('/api/keywords', keywordRoutes)
app.use('/api/news', newsRoutes)
app.use('/api/settings', settingsRoutes)
app.use('/api/notifications', notificationRoutes)

// 错误处理
app.use((err: any, req: express.Request, res: express.Response, _next: express.NextFunction) => {
  logger.error('Unhandled error:', err)
  res.status(500).json({
    error: 'Internal server error',
    message: process.env.NODE_ENV === 'development' ? err.message : undefined,
  })
})

// 404 处理
app.use((_req, res) => {
  res.status(404).json({ error: 'Not found' })
})

// 启动服务
const PORT = config.server?.port || 3001
const HOST = config.server?.host || 'localhost'
app.listen(PORT, HOST, () => {
  logger.info(`✅ Server running at http://${HOST}:${PORT}`)

  // 启动定时任务
  startScheduler()
})
