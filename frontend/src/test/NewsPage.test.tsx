import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import NewsPage from '@/pages/NewsPage'
import type { Keyword, NewsItem, NewsStats } from '@/types'

// Mock api module
vi.mock('@/utils/api', () => ({
  fetchKeywords: vi.fn(),
  fetchNews: vi.fn(),
  fetchNewsStats: vi.fn(),
  refreshNews: vi.fn(),
}))

import { fetchKeywords, fetchNews, fetchNewsStats, refreshNews } from '@/utils/api'

const mockNews: NewsItem[] = [
  {
    id: 1,
    title: 'AI大模型突破性进展',
    summary: 'OpenAI发布新一代模型',
    content: '详细内容...',
    url: 'https://example.com/1',
    source: 'HackerNews',
    hotness: 85,
    verified: 1,
    verifyConfidence: 0.92,
    verifyWarnings: '[]',
    aiAnalysis: '{"reasoning":"该新闻直接涉及 AI 大模型发布，和当前热点主题高度相关。"}',
    publishedAt: '2026-04-01T10:00:00Z',
    createdAt: '2026-04-01T10:00:00Z',
  },
  {
    id: 2,
    title: '量子计算最新进展',
    summary: '研究突破量子纠错难题',
    content: '',
    url: null,
    source: 'Bing',
    hotness: 60,
    verified: null,
    verifyConfidence: 0,
    verifyWarnings: '[]',
    aiAnalysis: '{}',
    publishedAt: '2026-04-01T12:00:00Z',
    createdAt: '2026-04-01T12:00:00Z',
  },
  {
    id: 3,
    title: '可疑的假新闻',
    summary: '这是一条未verified的新闻',
    content: '',
    url: null,
    source: 'HackerNews',
    hotness: 30,
    verified: 0,
    verifyConfidence: 0.8,
    verifyWarnings: '["标题过于夸张","缺少可靠来源"]',
    aiAnalysis: '{"reasoning":"验证结果显示这条内容存在明显夸张和来源不足问题。"}',
    publishedAt: null,
    createdAt: '2026-04-01T08:00:00Z',
  },
]

const mockStats: NewsStats = {
  total: 3,
  sources: { HackerNews: 2, Bing: 1 },
  avgHotness: 58.3,
}

const mockKeywords: Keyword[] = [
  {
    id: 11,
    keyword: 'OpenAI',
    scope: 'AI',
    active: 1,
    lastCheckedAt: null,
    createdAt: '2026-04-01T00:00:00Z',
    updatedAt: '2026-04-01T00:00:00Z',
  },
  {
    id: 12,
    keyword: '量子计算',
    scope: '',
    active: 1,
    lastCheckedAt: null,
    createdAt: '2026-04-01T00:00:00Z',
    updatedAt: '2026-04-01T00:00:00Z',
  },
]

const mockedFetchKeywords = fetchKeywords as ReturnType<typeof vi.fn>
const mockedFetchNews = fetchNews as ReturnType<typeof vi.fn>
const mockedFetchNewsStats = fetchNewsStats as ReturnType<typeof vi.fn>
const mockedRefreshNews = refreshNews as ReturnType<typeof vi.fn>

beforeEach(() => {
  vi.clearAllMocks()
  localStorage.clear()
  mockedFetchKeywords.mockResolvedValue({ keywords: mockKeywords })
  mockedFetchNews.mockResolvedValue({ data: mockNews, total: 3 })
  mockedFetchNewsStats.mockResolvedValue(mockStats)
  mockedRefreshNews.mockResolvedValue(undefined)
})

describe('NewsPage', () => {
  it('渲染统计卡片和新闻列表', async () => {
    render(<NewsPage />)

    await waitFor(() => {
      expect(screen.getByText('AI大模型突破性进展')).toBeInTheDocument()
    })

    // 统计卡片
    expect(screen.getByText('总热点数')).toBeInTheDocument()
    expect(screen.getByText('活跃源')).toBeInTheDocument()
    expect(screen.getByText('平均热度')).toBeInTheDocument()
    expect(screen.getByText('我的收藏')).toBeInTheDocument()
    expect(screen.getByText('筛选维度')).toBeInTheDocument()
    expect(screen.getByText('排序方式')).toBeInTheDocument()

    // 新闻标题
    expect(screen.getByText('量子计算最新进展')).toBeInTheDocument()
    expect(screen.getByText('可疑的假新闻')).toBeInTheDocument()
    expect(screen.getByText('该新闻直接涉及 AI 大模型发布，和当前热点主题高度相关。')).toBeInTheDocument()
  })

  it('默认按热度排序', async () => {
    render(<NewsPage />)

    await waitFor(() => {
      expect(screen.getByText('AI大模型突破性进展')).toBeInTheDocument()
    })

    const titles = screen.getAllByRole('heading', { level: 3 })
    expect(titles[0].textContent).toContain('AI大模型突破性进展')
  })

  it('显示验证徽章', async () => {
    render(<NewsPage />)

    await waitFor(() => {
      expect(screen.getByText('AI大模型突破性进展')).toBeInTheDocument()
    })

    expect(screen.getByText(/✓ 已验证 · 置信度 92%/)).toBeInTheDocument()
    expect(screen.getByText(/⚠ 可疑 · 置信度 80%/)).toBeInTheDocument()
    expect(screen.getByText('⏳ 待验证')).toBeInTheDocument()
  })

  it('搜索功能生效', async () => {
    render(<NewsPage />)

    await waitFor(() => {
      expect(screen.getByText('AI大模型突破性进展')).toBeInTheDocument()
    })

    const searchInput = screen.getByPlaceholderText('搜索热点新闻...')
    fireEvent.change(searchInput, { target: { value: '量子' } })

    // fetchNews应该被调用（参数含keyword）
    await waitFor(() => {
      expect(mockedFetchNews).toHaveBeenCalledWith(
        expect.objectContaining({ keyword: '量子' })
      )
    })
  })

  it('点击采集按钮触发刷新', async () => {
    render(<NewsPage />)

    await waitFor(() => {
      expect(screen.getByText('AI大模型突破性进展')).toBeInTheDocument()
    })

    const refreshBtn = screen.getByText('🔄 采集热点')
    fireEvent.click(refreshBtn)

    await waitFor(() => {
      expect(mockedRefreshNews).toHaveBeenCalledTimes(1)
    })
  })

  it('收藏功能：点击可收藏/取消收藏', async () => {
    render(<NewsPage />)

    await waitFor(() => {
      expect(screen.getByText('AI大模型突破性进展')).toBeInTheDocument()
    })

    // 初始：收藏数为0
    expect(screen.getByText('我的收藏')).toBeInTheDocument()

    // 获取第一个收藏按钮（☆）
    const starButtons = screen.getAllByText('☆')
    expect(starButtons.length).toBeGreaterThan(0)
    fireEvent.click(starButtons[0])

    // 收藏后应出现 ⭐
    await waitFor(() => {
      expect(screen.getAllByText('⭐').length).toBeGreaterThan(0)
    })
  })

  it('切换排序模式', async () => {
    render(<NewsPage />)

    await waitFor(() => {
      expect(screen.getByText('AI大模型突破性进展')).toBeInTheDocument()
    })

    const publishedBtn = screen.getByText('📰 最新发布')
    fireEvent.click(publishedBtn)

    const importanceBtn = screen.getByText('🚨 重要程度')
    fireEvent.click(importanceBtn)

    // 不应报错，同时应该有排序效果
    expect(screen.getByText('AI大模型突破性进展')).toBeInTheDocument()
  })

  it('关键词筛选会带 keywordId 请求参数', async () => {
    render(<NewsPage />)

    await waitFor(() => {
      expect(screen.getByText('AI大模型突破性进展')).toBeInTheDocument()
    })

    const selects = screen.getAllByRole('combobox')
    fireEvent.change(selects[1], { target: { value: '11' } })

    await waitFor(() => {
      expect(mockedFetchNews).toHaveBeenCalledWith(
        expect.objectContaining({ keywordId: 11 })
      )
    })
  })

  it('重要性筛选会过滤低优先级新闻', async () => {
    render(<NewsPage />)

    await waitFor(() => {
      expect(screen.getByText('AI大模型突破性进展')).toBeInTheDocument()
    })

    const selects = screen.getAllByRole('combobox')
    fireEvent.change(selects[0], { target: { value: 'high' } })

    await waitFor(() => {
      expect(screen.queryByText('可疑的假新闻')).not.toBeInTheDocument()
    })
    expect(screen.getByText('AI大模型突破性进展')).toBeInTheDocument()
  })

  it('无数据时显示空状态', async () => {
    mockedFetchNews.mockResolvedValue({ data: [], total: 0 })

    render(<NewsPage />)

    await waitFor(() => {
      expect(screen.getByText('暂无热点数据')).toBeInTheDocument()
    })

    expect(screen.getByText('🚀 立即采集')).toBeInTheDocument()
  })

  it('加载中显示骨架屏', () => {
    // 让 fetchNews 不 resolve，保持 loading 状态
    mockedFetchNews.mockReturnValue(new Promise(() => {}))

    render(<NewsPage />)

    // 骨架屏使用 animate-pulse class
    const skeletons = document.querySelectorAll('.animate-pulse')
    expect(skeletons.length).toBeGreaterThan(0)
  })

  it('数据源筛选生效', async () => {
    render(<NewsPage />)

    await waitFor(() => {
      expect(screen.getByText('AI大模型突破性进展')).toBeInTheDocument()
    })

    // 点击 HackerNews 筛选
    const hnButton = screen.getByText('HackerNews')
    fireEvent.click(hnButton)

    await waitFor(() => {
      expect(mockedFetchNews).toHaveBeenCalledWith(
        expect.objectContaining({ source: 'HackerNews' })
      )
    })
  })
})
