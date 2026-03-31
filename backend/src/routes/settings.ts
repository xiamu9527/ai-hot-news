import { Router, Request, Response } from 'express'

const router = Router()

// GET /api/settings - 获取设置
router.get('/', (req: Request, res: Response) => {
  res.json({
    dataSources: {
      twitter: true,
      hackerNews: true,
      bing: true,
      google: false,
      weibo: true,
    },
    notifications: {
      enabled: true,
      web: true,
    },
  })
})

// PUT /api/settings - 更新设置
router.put('/', (req: Request, res: Response) => {
  const { dataSources, notifications } = req.body
  res.json({ success: true, settings: { dataSources, notifications } })
})

export default router
