import { describe, it, expect, beforeEach, afterAll } from 'vitest'
import { createTestDb, closeTestDb, mockDatabase, mockLogger } from './setup.js'

mockLogger()
mockDatabase()

const { upsertNews, getNewsList, getNewsById, getNewsStats, recordKeywordMatch, getKeywordMatches } =
  await import('../services/newsService.js')
const { createKeyword } = await import('../services/keywordService.js')

describe('newsService', () => {
  beforeEach(() => {
    const db = createTestDb()
    db.exec('DELETE FROM keyword_matches; DELETE FROM news; DELETE FROM keywords;')
  })

  afterAll(() => closeTestDb())

  it('upsertNews - 应成功插入新闻', () => {
    const news = upsertNews({
      title: 'Test News',
      summary: 'Summary here',
      content: 'Full content...',
      url: 'https://example.com/1',
      source: 'HackerNews',
      hotness: 75,
    })
    expect(news).toBeDefined()
    expect(news.id).toBeGreaterThan(0)
    expect(news.title).toBe('Test News')
    expect(news.hotness).toBe(75)
  })

  it('upsertNews - 相同 title+source 应更新而非重复插入', () => {
    upsertNews({ title: 'Same Title', source: 'Bing', hotness: 50 })
    upsertNews({ title: 'Same Title', source: 'Bing', hotness: 80 })

    const list = getNewsList()
    expect(list.total).toBe(1)
    // hotness 应取更高值
    expect(list.data[0].hotness).toBe(80)
  })

  it('upsertNews - 不同 source 同标题应分别插入', () => {
    upsertNews({ title: 'Same Title', source: 'Bing' })
    upsertNews({ title: 'Same Title', source: 'Google' })

    const list = getNewsList()
    expect(list.total).toBe(2)
  })

  it('getNewsList - 支持 source 过滤', () => {
    upsertNews({ title: 'News 1', source: 'Bing' })
    upsertNews({ title: 'News 2', source: 'Google' })
    upsertNews({ title: 'News 3', source: 'Bing' })

    const bing = getNewsList({ source: 'Bing' })
    expect(bing.total).toBe(2)
    expect(bing.data.every(n => n.source === 'Bing')).toBe(true)
  })

  it('getNewsList - 支持 keyword 搜索', () => {
    upsertNews({ title: 'React 19 released', source: 'HackerNews', summary: 'React new version' })
    upsertNews({ title: 'Vue 4 released', source: 'HackerNews', summary: 'Vue new version' })

    const result = getNewsList({ keyword: 'React' })
    expect(result.total).toBe(1)
    expect(result.data[0].title).toContain('React')
  })

  it('getNewsList - 支持 minHotness 过滤', () => {
    upsertNews({ title: 'Low hot', source: 'Bing', hotness: 10 })
    upsertNews({ title: 'High hot', source: 'Bing', hotness: 90 })

    const result = getNewsList({ minHotness: 50 })
    expect(result.total).toBe(1)
    expect(result.data[0].title).toBe('High hot')
  })

  it('getNewsList - 支持分页', () => {
    for (let i = 0; i < 5; i++) {
      upsertNews({ title: `News ${i}`, source: 'Bing', hotness: i * 10 })
    }
    const page = getNewsList({ limit: 2, offset: 0 })
    expect(page.data).toHaveLength(2)
    expect(page.total).toBe(5)
  })

  it('getNewsById - 应返回指定新闻', () => {
    const news = upsertNews({ title: 'Find me', source: 'Bing' })
    const found = getNewsById(news.id)
    expect(found).toBeDefined()
    expect(found?.title).toBe('Find me')
  })

  it('getNewsById - 不存在应返回 undefined', () => {
    expect(getNewsById(9999)).toBeUndefined()
  })

  it('recordKeywordMatch + getKeywordMatches - 应记录并查询匹配', () => {
    const kw = createKeyword('test-kw')
    const news = upsertNews({ title: 'Match news', source: 'Bing' })

    const matched = recordKeywordMatch(kw.id, news.id)
    expect(matched).toBe(true)

    const matches = getKeywordMatches(kw.id)
    expect(matches).toHaveLength(1)
    expect(matches[0].title).toBe('Match news')
  })

  it('getNewsList - 支持 keywordId 过滤', () => {
    const kw = createKeyword('OpenAI')
    const matchedNews = upsertNews({ title: 'OpenAI 发布新模型', source: 'Bing' })
    upsertNews({ title: '其他新闻', source: 'Bing' })
    recordKeywordMatch(kw.id, matchedNews.id)

    const result = getNewsList({ keywordId: kw.id })
    expect(result.total).toBe(1)
    expect(result.data[0].title).toBe('OpenAI 发布新模型')
  })

  it('recordKeywordMatch - 重复匹配应忽略', () => {
    const kw = createKeyword('test-kw')
    const news = upsertNews({ title: 'Match news', source: 'Bing' })

    recordKeywordMatch(kw.id, news.id)
    recordKeywordMatch(kw.id, news.id) // 重复

    const matches = getKeywordMatches(kw.id)
    expect(matches).toHaveLength(1)
  })

  it('getNewsStats - 应返回正确统计', () => {
    upsertNews({ title: 'N1', source: 'Bing', hotness: 60 })
    upsertNews({ title: 'N2', source: 'Bing', hotness: 80 })
    upsertNews({ title: 'N3', source: 'Google', hotness: 40 })

    const stats = getNewsStats()
    expect(stats.total).toBe(3)
    expect(stats.sources['Bing']).toBe(2)
    expect(stats.sources['Google']).toBe(1)
    expect(stats.avgHotness).toBeCloseTo(60, 0)
  })
})
