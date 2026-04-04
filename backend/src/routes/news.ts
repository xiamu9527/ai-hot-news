import { Router, Request, Response } from 'express'
import { getNewsList, getNewsById, getNewsStats } from '../services/newsService.js'
import { triggerCollection } from '../services/scheduler.js'

const router = Router()

// GET /api/news - 获取热点新闻列表
router.get('/', (req: Request, res: Response) => {
  try {
    const { source, keyword, keywordId, limit, offset, minHotness } = req.query
    const result = getNewsList({
      source: source as string,
      keyword: keyword as string,
      keywordId: keywordId ? parseInt(keywordId as string) : undefined,
      limit: limit ? parseInt(limit as string) : undefined,
      offset: offset ? parseInt(offset as string) : undefined,
      minHotness: minHotness ? parseInt(minHotness as string) : undefined,
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
