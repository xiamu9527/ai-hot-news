import { Router, Request, Response } from 'express'

const router = Router()

// GET /api/keywords - 获取所有关键词
router.get('/', (req: Request, res: Response) => {
  res.json({
    keywords: [
      { id: 1, keyword: 'AI编程', createdAt: new Date().toISOString(), active: true },
      { id: 2, keyword: 'GPT', createdAt: new Date().toISOString(), active: true },
    ],
  })
})

// POST /api/keywords - 添加新关键词
router.post('/', (req: Request, res: Response) => {
  const { keyword } = req.body
  res.status(201).json({ id: 3, keyword, createdAt: new Date().toISOString(), active: true })
})

// DELETE /api/keywords/:id - 删除关键词
router.delete('/:id', (req: Request, res: Response) => {
  const { id } = req.params
  res.json({ success: true, message: `Keyword ${id} deleted` })
})

export default router
