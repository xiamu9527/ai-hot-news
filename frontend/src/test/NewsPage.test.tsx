import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import NewsPage from '@/pages/NewsPage'
import type { NewsItem, NewsStats } from '@/types'

// Mock api module
vi.mock('@/utils/api', () => ({
  fetchNews: vi.fn(),
  fetchNewsStats: vi.fn(),
  refreshNews: vi.fn(),
}))

import { fetchNews, fetchNewsStats, refreshNews } from '@/utils/api'

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
    aiAnalysis: '{}',
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
    aiAnalysis: '{}',
    publishedAt: null,
    createdAt: '2026-04-01T08:00:00Z',
  },
]

const mockStats: NewsStats = {
  total: 3,
  sources: { HackerNews: 2, Bing: 1 },
  avgHotness: 58.3,
}

const mockedFetchNews = fetchNews as ReturnType<typeof vi.fn>
const mockedFetchNewsStats = fetchNewsStats as ReturnType<typeof vi.fn>
const mockedRefreshNews = refreshNews as ReturnType<typeof vi.fn>

beforeEach(() => {
  vi.clearAllMocks()
  localStorage.clear()
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

    // 新闻标题
    expect(screen.getByText('量子计算最新进展')).toBeInTheDocument()
    expect(screen.getByText('可疑的假新闻')).toBeInTheDocument()
  })

  it('默认按热度排序', async () => {
    render(<NewsPage />)

    await waitFor(() => {
      expect(screen.getByText('AI大模型突破性进展')).toBeInTheDocument()
    })

    // 第一条应该是热度最高的（85）
    const titles = screen.getAllByText(/AI大模型|量子计算|可疑的假新闻/)
    expect(titles[0].textContent).toContain('AI大模型突破性进展')
  })

  it('显示验证徽章', async () => {
    render(<NewsPage />)

    await waitFor(() => {
      expect(screen.getByText('AI大模型突破性进展')).toBeInTheDocument()
    })

    // 已验证徽章（含百分比）
    expect(screen.getByText(/✓ 已验证 92%/)).toBeInTheDocument()
    // 可疑徽章
    expect(screen.getByText(/⚠ 可疑 80%/)).toBeInTheDocument()
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

    // 切换到最新排序
    const latestBtn = screen.getByText('🕐 最新')
    fireEvent.click(latestBtn)

    // 切换到已验证排序
    const verifiedBtn = screen.getByText('✓ 已验证')
    fireEvent.click(verifiedBtn)

    // 不应报错，同时应该有排序效果
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
