import axios, { AxiosInstance } from 'axios'
import * as cheerio from 'cheerio'
import { getConfig, Config } from '../utils/config.js'
import { logger } from '../utils/logger.js'

export interface NewsItem {
  title: string
  url: string
  content?: string
  source: string
  publishedAt?: string
}

export class Crawler {
  private client: AxiosInstance
  private config: Config

  constructor() {
    this.config = getConfig()
    this.client = axios.create({
      timeout: this.config.crawler.timeout,
      headers: {
        'User-Agent': this.config.crawler.userAgent,
        'Accept': 'text/html,application/xhtml+xml,application/json',
        'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
      },
    })
  }

  /**
   * 搜索指定关键词 - 聚合多个来源
   */
  async searchKeyword(keyword: string): Promise<NewsItem[]> {
    const results: NewsItem[] = []
    const tasks: Promise<NewsItem[]>[] = []

    if (this.config.datasources.hackerNews?.enabled) {
      tasks.push(this.fetchFromHackerNews(keyword))
    }
    if (this.config.datasources.bing?.enabled) {
      tasks.push(this.fetchFromBing([keyword]))
    }
    if (this.config.datasources.duckduckgo?.enabled) {
      tasks.push(this.fetchFromDuckDuckGo([keyword]))
    }

    const settled = await Promise.allSettled(tasks)
    for (const result of settled) {
      if (result.status === 'fulfilled') {
        results.push(...result.value)
      }
    }

    return results
  }

  /**
   * 采集热点 - 不过滤关键词，获取所有热门内容
   */
  async collectHotspots(): Promise<NewsItem[]> {
    const results: NewsItem[] = []
    const tasks: Promise<NewsItem[]>[] = []

    if (this.config.datasources.hackerNews?.enabled) {
      tasks.push(this.fetchFromHackerNews())
    }
    if (this.config.datasources.bing?.enabled) {
      tasks.push(this.fetchFromBing(['AI', '人工智能', 'tech']))
    }
    if (this.config.datasources.duckduckgo?.enabled) {
      tasks.push(this.fetchFromDuckDuckGo(['AI news', 'artificial intelligence']))
    }

    const settled = await Promise.allSettled(tasks)
    for (const result of settled) {
      if (result.status === 'fulfilled') {
        results.push(...result.value)
      }
    }

    return results
  }

  /**
   * 从HackerNews获取热点
   */
  async fetchFromHackerNews(keyword?: string): Promise<NewsItem[]> {
    logger.info('Fetching from HackerNews' + (keyword ? ` (keyword: ${keyword})` : ''))
    try {
      const config = this.config.datasources.hackerNews
      const topResponse = await this.client.get(`${config.apiUrl}/topstories.json`)
      const storyIds = topResponse.data.slice(0, config.limit || 20)

      const stories = await Promise.all(
        storyIds.map((id: number) =>
          this.client
            .get(`${config.apiUrl}/item/${id}.json`)
            .then((res) => res.data)
            .catch(() => null),
        ),
      )

      let items = stories
        .filter(Boolean)
        .map((story: any) => ({
          title: story.title || '',
          url: story.url || `https://news.ycombinator.com/item?id=${story.id}`,
          content: story.text || story.title || '',
          source: 'HackerNews',
          publishedAt: story.time ? new Date(story.time * 1000).toISOString() : undefined,
        }))

      // 如果有关键词，过滤匹配项
      if (keyword) {
        const kw = keyword.toLowerCase()
        items = items.filter((item: NewsItem) =>
          item.title.toLowerCase().includes(kw) ||
          (item.content && item.content.toLowerCase().includes(kw))
        )
      }

      return items
    } catch (error) {
      logger.error('Error fetching from HackerNews:', error)
      return []
    }
  }

  /**
   * 从Bing搜索获取新闻
   */
  async fetchFromBing(keywords: string[]): Promise<NewsItem[]> {
    const query = keywords.join(' ')
    logger.info(`Fetching from Bing: "${query}"`)
    try {
      const searchUrl = this.config.datasources.bing?.searchUrl || 'https://www.bing.com/news/search'
      const response = await this.client.get(searchUrl, {
        params: { q: query, format: 'rss' },
        headers: {
          'Accept': 'text/html,application/xhtml+xml,application/xml',
        }
      })

      const $ = cheerio.load(response.data, { xmlMode: true })
      const items: NewsItem[] = []

      $('item').each((_, el) => {
        const title = $(el).find('title').text().trim()
        const url = $(el).find('link').text().trim()
        const description = $(el).find('description').text().trim()
        const pubDate = $(el).find('pubDate').text().trim()

        if (title) {
          items.push({
            title,
            url: url || '',
            content: description,
            source: 'Bing',
            publishedAt: pubDate && !isNaN(Date.parse(pubDate)) ? new Date(pubDate).toISOString() : undefined,
          })
        }
      })

      // 如果 RSS 没有结果，尝试解析 HTML
      if (items.length === 0) {
        const htmlResponse = await this.client.get('https://www.bing.com/search', {
          params: { q: `${query} news` }
        })
        const $html = cheerio.load(htmlResponse.data)
        $html('.b_algo').each((_, el) => {
          const title = $html(el).find('h2 a').text().trim()
          const url = $html(el).find('h2 a').attr('href') || ''
          const snippet = $html(el).find('.b_caption p').text().trim()
          if (title && url.startsWith('http')) {
            items.push({
              title,
              url,
              content: snippet,
              source: 'Bing',
            })
          }
        })
      }

      const limit = this.config.datasources.bing?.limit || 20
      return items.slice(0, limit)
    } catch (error) {
      logger.error('Error fetching from Bing:', error)
      return []
    }
  }

  /**
   * 从DuckDuckGo搜索获取新闻
   */
  async fetchFromDuckDuckGo(keywords: string[]): Promise<NewsItem[]> {
    const query = keywords.join(' ')
    logger.info(`Fetching from DuckDuckGo: "${query}"`)
    try {
      const response = await this.client.get('https://html.duckduckgo.com/html/', {
        params: { q: query },
        headers: {
          'Accept': 'text/html',
        }
      })

      const $ = cheerio.load(response.data)
      const items: NewsItem[] = []

      $('.result').each((_, el) => {
        const title = $(el).find('.result__title a').text().trim()
        const urlRaw = $(el).find('.result__title a').attr('href') || ''
        const snippet = $(el).find('.result__snippet').text().trim()

        // DuckDuckGo 使用重定向 URL，提取实际 URL
        let url = urlRaw
        const uddgMatch = urlRaw.match(/uddg=([^&]+)/)
        if (uddgMatch) {
          url = decodeURIComponent(uddgMatch[1])
        }

        if (title && url.startsWith('http')) {
          items.push({
            title,
            url,
            content: snippet,
            source: 'DuckDuckGo',
          })
        }
      })

      const limit = this.config.datasources.duckduckgo?.limit || 20
      return items.slice(0, limit)
    } catch (error) {
      logger.error('Error fetching from DuckDuckGo:', error)
      return []
    }
  }

  /**
   * 通用网页爬虫
   */
  async fetchFromWebPage(url: string): Promise<string> {
    try {
      const response = await this.client.get(url)
      return response.data
    } catch (error) {
      logger.error(`Error fetching from ${url}:`, error)
      throw error
    }
  }
}

export const crawler = new Crawler()
