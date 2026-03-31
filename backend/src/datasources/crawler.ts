import axios, { AxiosInstance } from 'axios'
import { getConfig, Config } from '../utils/config.js'
import { logger } from '../utils/logger.js'

interface CrawlerOptions {
  url: string
  method?: 'GET' | 'POST'
  params?: Record<string, any>
  data?: Record<string, any>
  headers?: Record<string, string>
}

interface NewsItem {
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
      },
    })
  }

  /**
   * 从推特API获取新闻
   */
  async fetchFromTwitter(keywords: string[]): Promise<NewsItem[]> {
    logger.info(`Fetching from Twitter with keywords: ${keywords.join(', ')}`)
    // TODO: 实现Twitter API集成
    return []
  }

  /**
   * 从HackerNews获取热点
   */
  async fetchFromHackerNews(): Promise<NewsItem[]> {
    logger.info('Fetching from HackerNews')
    try {
      const config = this.config.datasources.hackerNews
      // 获取top stories
      const topResponse = await this.client.get(`${config.apiUrl}/topstories.json`)
      const storyIds = topResponse.data.slice(0, config.limit)

      const stories = await Promise.all(
        storyIds.map((id: number) =>
          this.client
            .get(`${config.apiUrl}/item/${id}.json`)
            .then((res) => res.data)
            .catch(() => null),
        ),
      )

      return stories
        .filter(Boolean)
        .map((story: any) => ({
          title: story.title,
          url: story.url,
          source: 'HackerNews',
          publishedAt: new Date(story.time * 1000).toISOString(),
        }))
    } catch (error) {
      logger.error('Error fetching from HackerNews:', error)
      return []
    }
  }

  /**
   * 通用网页爬虫
   */
  async fetchFromWebPage(url: string, options?: CrawlerOptions): Promise<string> {
    try {
      const response = await this.client.get(url, {
        ...options,
        headers: {
          ...this.client.defaults.headers,
          ...(options?.headers || {}),
        },
      })
      return response.data
    } catch (error) {
      logger.error(`Error fetching from ${url}:`, error)
      throw error
    }
  }

  /**
   * 从Bing搜索获取新闻
   */
  async fetchFromBing(keywords: string[]): Promise<NewsItem[]> {
    logger.info(`Fetching from Bing with keywords: ${keywords.join(', ')}`)
    // TODO: 实现Bing爬虫
    return []
  }

  /**
   * 从微博获取热点
   */
  async fetchFromWeibo(keywords: string[]): Promise<NewsItem[]> {
    logger.info(`Fetching from Weibo with keywords: ${keywords.join(', ')}`)
    // TODO: 实现微博爬虫
    return []
  }
}

export const crawler = new Crawler()
