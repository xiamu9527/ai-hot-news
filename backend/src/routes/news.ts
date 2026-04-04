import { Router, Request, Response } from 'express'
import { getNewsList, getNewsById, getNewsByIds, getNewsStats } from '../services/newsService.js'
import { triggerCollection } from '../services/scheduler.js'
import { aiEngine } from '../ai/engine.js'
import { getConfig } from '../utils/config.js'
import { logger } from '../utils/logger.js'

const router = Router()

function getReportTimeoutMs() {
  return 5 * 60 * 1000
}

function buildFallbackReport(mode: 'matched' | 'hotspots') {
  return {
    headline: mode === 'matched' ? '命中分析综合报告' : '热点探索综合报告',
    summary: 'AI 综合报告生成超时，请检查模型服务状态后重试。',
    keyFindings: [],
    riskAlerts: [],
    recommendedActions: [],
    stockMarketImpact: [],
  }
}

// GET /api/news - 获取热点新闻列表
router.get('/', (req: Request, res: Response) => {
  try {
    const { source, keyword, keywordId, matchMode, limit, offset, minHotness, maxAgeDays } = req.query
    const result = getNewsList({
      source: source as string,
      keyword: keyword as string,
      keywordId: keywordId ? parseInt(keywordId as string) : undefined,
      matchMode: (matchMode as 'all' | 'matched' | 'unmatched') || 'all',
      limit: limit ? parseInt(limit as string) : undefined,
      offset: offset ? parseInt(offset as string) : undefined,
      minHotness: minHotness ? parseInt(minHotness as string) : undefined,
      maxAgeDays: maxAgeDays !== undefined ? parseInt(maxAgeDays as string) : undefined,
    })
    res.json(result)
  } catch (err: any) {
    res.status(500).json({ error: err.message })
  }
})

// GET /api/news/stats - 获取新闻统计
router.get('/stats', (_req: Request, res: Response) => {
  try {
    const stats = getNewsStats()
    res.json(stats)
  } catch (err: any) {
    res.status(500).json({ error: err.message })
  }
})

// POST /api/news/report - 生成当前新闻集合的综合报告
router.post('/report', async (req: Request, res: Response) => {
  try {
    const { mode, ids } = req.body as {
      mode?: 'matched' | 'hotspots'
      ids?: number[]
    }

    if (mode !== 'matched' && mode !== 'hotspots') {
      return res.status(400).json({ error: 'mode 必须是 matched 或 hotspots' })
    }

    if (!Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ error: 'ids 不能为空' })
    }

    const normalizedIds = ids
      .map((item) => Number(item))
      .filter((item) => Number.isInteger(item) && item > 0)
      .slice(0, 10)

    const newsItems = getNewsByIds(normalizedIds)
    const fallbackReport = buildFallbackReport(mode)
    const reportTimeoutMs = getReportTimeoutMs()
    const report = await Promise.race([
      aiEngine.generateNewsReport(
        mode,
        newsItems.map((item) => ({
          id: item.id,
          title: item.title,
          source: item.source,
          summary: item.summary,
          hotness: item.hotness,
          aiAnalysis: item.aiAnalysis,
        }))
      ),
      new Promise<typeof fallbackReport>((resolve) => {
        setTimeout(() => {
          logger.warn(`News report timed out after ${reportTimeoutMs}ms, using fallback report`)
          resolve(fallbackReport)
        }, reportTimeoutMs)
      }),
    ])

    res.json(report)
  } catch (err: any) {
    res.status(500).json({ error: err.message })
  }
})

// POST /api/news/refresh - 手动触发采集
router.post('/refresh', async (_req: Request, res: Response) => {
  try {
    triggerCollection()
    res.json({ success: true, message: '采集任务已触发' })
  } catch (err: any) {
    res.status(500).json({ error: err.message })
  }
})

// GET /api/news/:id - 获取新闻详情
router.get('/:id', (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id)
    const news = getNewsById(id)
    if (news) {
      res.json(news)
    } else {
      res.status(404).json({ error: '新闻不存在' })
    }
  } catch (err: any) {
    res.status(500).json({ error: err.message })
  }
})

export default router
