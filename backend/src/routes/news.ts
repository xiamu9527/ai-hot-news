import { Router, Request, Response } from 'express'

const router = Router()

// GET /api/news - 获取热点新闻
router.get('/', (req: Request, res: Response) => {
  const { source, limit = 20, offset = 0 } = req.query

  res.json({
    data: [
      {
        id: 1,
        title: 'GPT-5即将发布，性能提升10倍',
        summary: '最新消息显示，OpenAI正在开发GPT-5...',
        source: 'Twitter',
        url: 'https://twitter.com/...',
        hotness: 150,
        verified: true,
        createdAt: new Date().toISOString(),
      },
      {
        id: 2,
        title: 'Claude 3正式发布',
        summary: 'Anthropic发布Claude 3系列模型...',
        source: 'HackerNews',
        url: 'https://news.ycombinator.com/...',
        hotness: 120,
        verified: true,
        createdAt: new Date().toISOString(),
      },
    ],
    total: 2,
    limit,
    offset,
  })
})

export default router
