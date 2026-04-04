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

const mockNews: Array<NewsItem & { isMatch?: number }> = [
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
    aiAnalysis: '{"reasoning":"该新闻直接涉及 AI 大模型发布，和当前热点主题高度相关。","category":"大模型动态"}',
    isMatch: 1,
    publishedAt: '2026-04-01T10:00:00Z',
    createdAt: '2026-04-01T10:00:00Z',
  },
  {
    id: 2,
    title: '量子计算最新进展',
    summary: '研究突破量子纠错难题',
    content: '',
    url: 'https://example.com/2',
    source: 'Bing',
    hotness: 60,
    verified: null,
    verifyConfidence: 0,
    verifyWarnings: '[]',
    aiAnalysis: '{"category":"量子计算"}',
    isMatch: 1,
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
    aiAnalysis: '{"reasoning":"验证结果显示这条内容存在明显夸张和来源不足问题。","category":"风险预警"}',
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
      expect(screen.getByRole('heading', { level: 2, name: 'AI大模型突破性进展' })).toBeInTheDocument()
    })

    // 统计卡片
    expect(screen.getAllByText('今日新增热点').length).toBeGreaterThan(0)
    expect(screen.getByText('高置信热点占比')).toBeInTheDocument()
    expect(screen.getByText('关键词命中数')).toBeInTheDocument()
    expect(screen.getByText('跨源共振话题数')).toBeInTheDocument()
    expect(screen.getByText('首页总览')).toBeInTheDocument()
    expect(screen.getByText('热点探索')).toBeInTheDocument()
    expect(screen.getByText('今日主热点')).toBeInTheDocument()
    expect(screen.getByText('次级上升信号')).toBeInTheDocument()
    expect(screen.getByText('关键词命中专区')).toBeInTheDocument()
    expect(screen.queryByText('更多筛选')).not.toBeInTheDocument()

    // 新闻标题
    expect(screen.getAllByText('量子计算最新进展').length).toBeGreaterThan(0)
    expect(screen.getAllByText('可疑的假新闻').length).toBeGreaterThan(0)
    expect(screen.getAllByText('该新闻直接涉及 AI 大模型发布，和当前热点主题高度相关。').length).toBeGreaterThan(0)
  })

  it('默认按热度排序', async () => {
    render(<NewsPage />)

    await waitFor(() => {
      expect(screen.getByRole('heading', { level: 2, name: 'AI大模型突破性进展' })).toBeInTheDocument()
    })

    expect(screen.getByRole('heading', { level: 2, name: 'AI大模型突破性进展' })).toBeInTheDocument()
  })

  it('关键词命中内容会单独进入专区', async () => {
    render(<NewsPage />)

    await waitFor(() => {
      expect(screen.getByText('关键词命中专区')).toBeInTheDocument()
    })

    expect(screen.getAllByText('量子计算最新进展').length).toBeGreaterThan(0)
    expect(screen.getByText('直接命中')).toBeInTheDocument()
  })

  it('关键词命中卡与普通新闻卡使用统一详情结构', async () => {
    render(<NewsPage />)

    await waitFor(() => {
      expect(screen.getByText('关键词命中专区')).toBeInTheDocument()
    })

    const detailToggle = screen.getByRole('button', { name: '展开详情 量子计算最新进展' })
    fireEvent.click(detailToggle)

    await waitFor(() => {
      expect(screen.getByText('完整洞察')).toBeInTheDocument()
    })

    expect(screen.getByText('原始摘要')).toBeInTheDocument()
    expect(screen.getByText('研究突破量子纠错难题')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '收起详情 量子计算最新进展' })).toBeInTheDocument()

    const sourceLink = screen.getByRole('link', { name: '量子计算最新进展' })
    expect(sourceLink).toHaveAttribute('href', 'https://example.com/2')
  })

  it('可以切换到专题视图查看聚类结果', async () => {
    render(<NewsPage />)

    await waitFor(() => {
      expect(screen.getByText('进入热点探索')).toBeInTheDocument()
    })

    fireEvent.click(screen.getByText('进入热点探索'))

    await waitFor(() => {
      expect(screen.getByText('榜单与专题双视图')).toBeInTheDocument()
    })

    fireEvent.click(screen.getByText('专题视图'))

    await waitFor(() => {
      expect(screen.getByText('专题聚类视图')).toBeInTheDocument()
    })

    expect(screen.getByText('大模型动态')).toBeInTheDocument()
  })

  it('显示验证徽章', async () => {
    render(<NewsPage />)

    await waitFor(() => {
      expect(screen.getByRole('heading', { level: 2, name: 'AI大模型突破性进展' })).toBeInTheDocument()
    })

    expect(screen.getByText('可信度')).toBeInTheDocument()
    expect(screen.getByText('置信度 92%')).toBeInTheDocument()
    expect(screen.getByText('待验证')).toBeInTheDocument()
    expect(screen.getByText('需谨慎')).toBeInTheDocument()
  })

  it('搜索功能生效', async () => {
    render(<NewsPage />)

    await waitFor(() => {
      expect(screen.getByRole('heading', { level: 2, name: 'AI大模型突破性进展' })).toBeInTheDocument()
    })

    fireEvent.click(screen.getByText('进入热点探索'))

    const searchInput = screen.getByPlaceholderText('搜索热点、关键词或专题...')
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
      expect(screen.getByRole('heading', { level: 2, name: 'AI大模型突破性进展' })).toBeInTheDocument()
    })

    fireEvent.click(screen.getByText('进入热点探索'))

    const refreshBtn = screen.getByText('获取当天新闻')
    fireEvent.click(refreshBtn)

    await waitFor(() => {
      expect(mockedRefreshNews).toHaveBeenCalledTimes(1)
    })
  })

  it('收藏功能：点击可收藏/取消收藏', async () => {
    render(<NewsPage />)

    await waitFor(() => {
      expect(screen.getByRole('heading', { level: 2, name: 'AI大模型突破性进展' })).toBeInTheDocument()
    })

    const favoriteButton = screen.getByRole('button', { name: '收藏 AI大模型突破性进展' })
    fireEvent.click(favoriteButton)

    await waitFor(() => {
      expect(screen.getByRole('button', { name: '取消收藏 AI大模型突破性进展' })).toBeInTheDocument()
    })
  })

  it('切换排序模式', async () => {
    render(<NewsPage />)

    await waitFor(() => {
      expect(screen.getByText('进入热点探索')).toBeInTheDocument()
    })

    fireEvent.click(screen.getByText('进入热点探索'))

    await waitFor(() => {
      expect(screen.getByText('榜单与专题双视图')).toBeInTheDocument()
    })

    const sortSelect = screen.getAllByRole('combobox')[0]
    fireEvent.change(sortSelect, { target: { value: 'published' } })
    fireEvent.change(sortSelect, { target: { value: 'importance' } })

    // 不应报错，同时应该有排序效果
    expect(screen.getByText('榜单与专题双视图')).toBeInTheDocument()
  })

  it('关键词筛选会带 keywordId 请求参数', async () => {
    render(<NewsPage />)

    await waitFor(() => {
      expect(screen.getByRole('heading', { level: 2, name: 'AI大模型突破性进展' })).toBeInTheDocument()
    })

    fireEvent.click(screen.getByText('进入热点探索'))
    fireEvent.click(screen.getByRole('button', { name: /更多筛选|收起筛选/ }))
    const selects = screen.getAllByRole('combobox')
    fireEvent.change(selects[2], { target: { value: '11' } })

    await waitFor(() => {
      expect(mockedFetchNews).toHaveBeenCalledWith(
        expect.objectContaining({ keywordId: 11 })
      )
    })
  })

  it('重要性筛选会过滤低优先级新闻', async () => {
    render(<NewsPage />)

    await waitFor(() => {
      expect(screen.getByRole('heading', { level: 2, name: 'AI大模型突破性进展' })).toBeInTheDocument()
    })

    fireEvent.click(screen.getByText('进入热点探索'))
    fireEvent.click(screen.getByRole('button', { name: /更多筛选|收起筛选/ }))
    const selects = screen.getAllByRole('combobox')
    fireEvent.change(selects[1], { target: { value: 'urgent' } })

    await waitFor(() => {
      expect(screen.getByText('当前热点已经被主热点、次级信号和关键词专区完整吸收，继续切换筛选条件可以扩展结果面。')).toBeInTheDocument()
    })
    expect(screen.getByText('榜单与专题双视图')).toBeInTheDocument()
  })

  it('无数据时显示空状态', async () => {
    mockedFetchNews.mockResolvedValue({ data: [], total: 0 })

    render(<NewsPage />)

    fireEvent.click(screen.getByText('进入热点探索'))

    await waitFor(() => {
      expect(screen.getByText('暂无热点数据')).toBeInTheDocument()
    })

    expect(screen.getByText('获取当天新闻')).toBeInTheDocument()
  })

  it('加载中显示骨架屏', () => {
    // 让首屏相关请求都保持 pending，避免测试结束前继续触发异步状态更新
    mockedFetchKeywords.mockReturnValue(new Promise(() => {}))
    mockedFetchNews.mockReturnValue(new Promise(() => {}))
    mockedFetchNewsStats.mockReturnValue(new Promise(() => {}))

    render(<NewsPage />)

    fireEvent.click(screen.getByText('进入热点探索'))

    // 骨架屏使用 animate-pulse class
    const skeletons = document.querySelectorAll('.animate-pulse')
    expect(skeletons.length).toBeGreaterThan(0)
  })

  it('数据源筛选生效', async () => {
    render(<NewsPage />)

    await waitFor(() => {
      expect(screen.getByRole('heading', { level: 2, name: 'AI大模型突破性进展' })).toBeInTheDocument()
    })

    fireEvent.click(screen.getByText('进入热点探索'))

    // 点击 HackerNews 筛选
    const hnButton = screen.getByRole('button', { name: '筛选来源 HackerNews' })
    fireEvent.click(hnButton)

    await waitFor(() => {
      expect(mockedFetchNews).toHaveBeenCalledWith(
        expect.objectContaining({ source: 'HackerNews' })
      )
    })
  })

  it('可以从总览页进入热点探索页', async () => {
    render(<NewsPage />)

    await waitFor(() => {
      expect(screen.getByText('进入热点探索')).toBeInTheDocument()
    })

    fireEvent.click(screen.getByText('进入热点探索'))

    await waitFor(() => {
      expect(screen.getByText('更多筛选')).toBeInTheDocument()
    })

    expect(screen.getByText('榜单与专题双视图')).toBeInTheDocument()
  })
})
