import { Router, Request, Response } from 'express'
import {
  getAllKeywords,
  createKeyword,
  deleteKeyword,
  toggleKeyword,
  getActiveKeywords
} from '../services/keywordService.js'
import { getKeywordMatches } from '../services/newsService.js'

const router = Router()

// GET /api/keywords - 获取所有关键词
router.get('/', (_req: Request, res: Response) => {
  try {
    const keywords = getAllKeywords()
    res.json({ keywords })
  } catch (err: any) {
    res.status(500).json({ error: err.message })
  }
})

// POST /api/keywords - 添加新关键词
router.post('/', (req: Request, res: Response) => {
  try {
    const { keyword, scope } = req.body
    if (!keyword || typeof keyword !== 'string' || keyword.trim().length === 0) {
      res.status(400).json({ error: '关键词不能为空' })
      return
    }
    const created = createKeyword(keyword.trim(), scope || '')
    res.status(201).json(created)
  } catch (err: any) {
    res.status(400).json({ error: err.message })
  }
})

// DELETE /api/keywords/:id - 删除关键词
router.delete('/:id', (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id)
    const success = deleteKeyword(id)
    if (success) {
      res.json({ success: true })
    } else {
      res.status(404).json({ error: '关键词不存在' })
    }
  } catch (err: any) {
    res.status(500).json({ error: err.message })
  }
})

// PUT /api/keywords/:id/toggle - 切换关键词状态
router.put('/:id/toggle', (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id)
    const { active } = req.body
    const keyword = toggleKeyword(id, active)
    if (keyword) {
      res.json(keyword)
    } else {
      res.status(404).json({ error: '关键词不存在' })
    }
  } catch (err: any) {
    res.status(500).json({ error: err.message })
  }
})

// GET /api/keywords/:id/matches - 获取关键词匹配的新闻
router.get('/:id/matches', (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id)
    const limit = parseInt(req.query.limit as string) || 20
    const matches = getKeywordMatches(id, limit)
    res.json({ matches })
  } catch (err: any) {
    res.status(500).json({ error: err.message })
  }
})

export default router
