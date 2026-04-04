import axios, { AxiosInstance } from 'axios'
import * as cheerio from 'cheerio'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { getConfig, Config } from '../utils/config.js'
import { logger } from '../utils/logger.js'

const execFileAsync = promisify(execFile)

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
  private readonly maxConcurrentSources = 4
  private readonly maxConcurrentStoryFetches = 5

  constructor() {
    this.config = getConfig()
    this.client = axios.create({
      timeout: this.config.crawler.timeout,
      maxContentLength: 2 * 1024 * 1024,
      maxBodyLength: 2 * 1024 * 1024,
      headers: {
        'User-Agent': this.config.crawler.userAgent,
        'Accept': 'text/html,application/xhtml+xml,application/json',
        'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
      },
    })
  }

  private async runNewsTasks(taskFactories: Array<() => Promise<NewsItem[]>>, concurrency = this.maxConcurrentSources): Promise<NewsItem[]> {
    const results: NewsItem[] = []

    for (let index = 0; index < taskFactories.length; index += concurrency) {
      const batch = taskFactories.slice(index, index + concurrency)
      const settled = await Promise.allSettled(batch.map((task) => task()))

      for (const result of settled) {
        if (result.status === 'fulfilled') {
          results.push(...result.value)
        }
      }
    }

    return results
  }

  private async runGenericTasks<T>(taskFactories: Array<() => Promise<T>>, concurrency: number): Promise<T[]> {
    const results: T[] = []

    for (let index = 0; index < taskFactories.length; index += concurrency) {
      const batch = taskFactories.slice(index, index + concurrency)
      const settled = await Promise.allSettled(batch.map((task) => task()))

      for (const result of settled) {
        if (result.status === 'fulfilled') {
          results.push(result.value)
        }
      }
    }

    return results
  }

  /**
   * 检测关键词是否为博主/账号类型
   * 支持: @xxx、公众号xxx、UP主xxx、博主xxx 等格式
   */
  private detectAccountKeyword(keyword: string): { isAccount: boolean; cleanName: string; types: string[] } {
    const types: string[] = []
    let cleanName = keyword.trim()

    // @开头 -> 社交账号
    if (cleanName.startsWith('@')) {
      cleanName = cleanName.slice(1)
      types.push('weibo', 'bilibili', 'wechat')
    }

    const accountPatterns: Array<[RegExp, string[]]> = [
      [/公众号[：:\s]*(.+)$/i, ['wechat']],
      [/微信[：:\s]*(.+)$/i, ['wechat']],
      [/UP主[：:\s]*(.+)$/i, ['bilibili']],
      [/up主[：:\s]*(.+)$/i, ['bilibili']],
      [/B站[：:\s]*(.+)$/i, ['bilibili']],
      [/微博[：:\s]*(.+)$/i, ['weibo']],
      [/博主[：:\s]*(.+)$/i, ['weibo', 'bilibili']],
      [/账号[：:\s]*(.+)$/i, ['weibo', 'bilibili', 'wechat']],
      [/小红书[：:\s]*(.+)$/i, ['xiaohongshu']],
    ]

    for (const [pattern, srcTypes] of accountPatterns) {
      const m = keyword.match(pattern)
      if (m) {
        cleanName = m[1].trim()
        for (const t of srcTypes) {
          if (!types.includes(t)) types.push(t)
        }
      }
    }

    return { isAccount: types.length > 0, cleanName, types }
  }

  /**
   * 搜索指定关键词 - 聚合多个来源
   * 若关键词为博主/账号名称，优先获取该账号信息
   */
  async searchKeyword(keyword: string): Promise<NewsItem[]> {
    const taskFactories: Array<() => Promise<NewsItem[]>> = []

    // 账号模式检测：优先从对应平台获取账号信息
    const { isAccount, cleanName, types } = this.detectAccountKeyword(keyword)
    if (isAccount) {
      logger.info(`关键词 "${keyword}" 识别为账号，目标平台: ${types.join(', ')}，查询: "${cleanName}"`)
      if (types.includes('bilibili') && this.config.datasources.bili?.enabled) {
        taskFactories.push(() => this.fetchBilibiliUser(cleanName))
      }
      if (types.includes('weibo') && this.config.datasources.weibo?.enabled) {
        taskFactories.push(() => this.fetchWeiboUser(cleanName))
      }
      if (types.includes('wechat') && this.config.datasources.sogou?.enabled) {
        taskFactories.push(() => this.fetchWechatAccount(cleanName))
      }
    }

    if (this.config.datasources.hackerNews?.enabled) {
      taskFactories.push(() => this.fetchFromHackerNews(keyword))
    }
    if (this.config.datasources.bing?.enabled) {
      taskFactories.push(() => this.fetchFromBing([keyword]))
    }
    if (this.config.datasources.duckduckgo?.enabled) {
      taskFactories.push(() => this.fetchFromDuckDuckGoAPI([keyword]))
    }
    if (this.config.datasources.twitter?.enabled !== false) {
      taskFactories.push(() => this.fetchFromTwitter(keyword))
    }
    if (this.config.datasources.google?.enabled) {
      taskFactories.push(() => this.fetchFromGoogle([keyword]))
    }
    if (this.config.datasources.weibo?.enabled) {
      taskFactories.push(() => this.fetchFromWeiboMobile(keyword))
    }
    if (this.config.datasources.sogou?.enabled) {
      taskFactories.push(() => this.fetchFromSogou(keyword))
    }
    if (this.config.datasources.baidu?.enabled) {
      taskFactories.push(() => this.fetchFromBaidu(keyword))
    }
    if (this.config.datasources.zhihu?.enabled) {
      taskFactories.push(() => this.fetchFromZhihu(keyword))
    }
    if (this.config.datasources.toutiao?.enabled) {
      taskFactories.push(() => this.fetchFromToutiao(keyword))
    }
    if (this.config.datasources.news36kr?.enabled) {
      taskFactories.push(() => this.fetchFromRSS(
        this.config.datasources.news36kr?.rssUrl || 'https://36kr.com/feed',
        '36氪',
        keyword
      ))
    }
    if (this.config.datasources.ithome?.enabled) {
      taskFactories.push(() => this.fetchFromRSS(
        this.config.datasources.ithome?.rssUrl || 'https://www.ithome.com/rss/',
        'IT之家',
        keyword
      ))
    }
    if (this.config.datasources.huxiu?.enabled) {
      taskFactories.push(() => this.fetchFromRSS(
        this.config.datasources.huxiu?.rssUrl || 'https://www.huxiu.com/rss/0.xml',
        '虎嗅',
        keyword
      ))
    }

    return this.runNewsTasks(taskFactories)
  }

  /**
   * 采集热点 - 不过滤关键词，获取所有热门内容
   */
  async collectHotspots(): Promise<NewsItem[]> {
    const taskFactories: Array<() => Promise<NewsItem[]>> = []

    if (this.config.datasources.hackerNews?.enabled) {
      taskFactories.push(() => this.fetchFromHackerNews())
    }
    if (this.config.datasources.bing?.enabled) {
      taskFactories.push(() => this.fetchFromBing(['AI', '人工智能', 'tech']))
    }
    if (this.config.datasources.duckduckgo?.enabled) {
      taskFactories.push(() => this.fetchFromDuckDuckGoAPI(['AI 人工智能']))
    }
    if (this.config.datasources.twitter?.enabled !== false) {
      taskFactories.push(() => this.fetchFromTwitterTrends())
    }
    if (this.config.datasources.google?.enabled) {
      taskFactories.push(() => this.fetchFromGoogle(['AI 热点', 'tech news']))
    }
    if (this.config.datasources.weibo?.enabled) {
      taskFactories.push(() => this.fetchFromWeiboHot())
    }
    if (this.config.datasources.sogou?.enabled) {
      taskFactories.push(() => this.fetchFromSogou('AI 人工智能'))
    }
    if (this.config.datasources.baidu?.enabled) {
      taskFactories.push(() => this.fetchBaiduHot())
    }
    if (this.config.datasources.zhihu?.enabled) {
      taskFactories.push(() => this.fetchFromZhihu())
    }
    if (this.config.datasources.toutiao?.enabled) {
      taskFactories.push(() => this.fetchToutiaoHot())
    }
    if (this.config.datasources.news36kr?.enabled) {
      taskFactories.push(() => this.fetchFromRSS(
        this.config.datasources.news36kr?.rssUrl || 'https://36kr.com/feed',
        '36氪'
      ))
    }
    if (this.config.datasources.ithome?.enabled) {
      taskFactories.push(() => this.fetchFromRSS(
        this.config.datasources.ithome?.rssUrl || 'https://www.ithome.com/rss/',
        'IT之家'
      ))
    }
    if (this.config.datasources.huxiu?.enabled) {
      taskFactories.push(() => this.fetchFromRSS(
        this.config.datasources.huxiu?.rssUrl || 'https://www.huxiu.com/rss/0.xml',
        '虎嗅'
      ))
    }

    // ---- 从 newsnow 移植的新数据源 ----
    if (this.config.datasources.douyin?.enabled) {
      taskFactories.push(() => this.fetchDouyinHot())
    }
    if (this.config.datasources.thepaper?.enabled) {
      taskFactories.push(() => this.fetchThepaperHot())
    }
    if (this.config.datasources.juejin?.enabled) {
      taskFactories.push(() => this.fetchJuejinHot())
    }
    if (this.config.datasources.sspai?.enabled) {
      taskFactories.push(() => this.fetchSspaiHot())
    }
    if (this.config.datasources.v2ex?.enabled) {
      taskFactories.push(() => this.fetchV2exHot())
    }
    if (this.config.datasources.douban?.enabled) {
      taskFactories.push(() => this.fetchDoubanHot())
    }
    if (this.config.datasources.tieba?.enabled) {
      taskFactories.push(() => this.fetchTiebaHot())
    }
    if (this.config.datasources.hupu?.enabled) {
      taskFactories.push(() => this.fetchHupuHot())
    }
    if (this.config.datasources.ifeng?.enabled) {
      taskFactories.push(() => this.fetchIfengHot())
    }
    if (this.config.datasources.github?.enabled) {
      taskFactories.push(() => this.fetchGithubTrending())
    }
    if (this.config.datasources.solidot?.enabled) {
      taskFactories.push(() => this.fetchSolidotHot())
    }
    if (this.config.datasources.wallstreetcn?.enabled) {
      taskFactories.push(() => this.fetchWallstreetcnHot())
    }
    if (this.config.datasources.linuxdo?.enabled) {
      taskFactories.push(() => this.fetchLinuxdoHot())
    }
    if (this.config.datasources.freebuf?.enabled) {
      taskFactories.push(() => this.fetchFreebufHot())
    }
    if (this.config.datasources.nowcoder?.enabled) {
      taskFactories.push(() => this.fetchNowcoderHot())
    }

    return this.runNewsTasks(taskFactories)
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

      const stories = await this.runGenericTasks(
        storyIds.map((id: number) => () =>
          this.client
            .get(`${config.apiUrl}/item/${id}.json`)
            .then((res) => res.data)
            .catch(() => null),
        ),
        this.maxConcurrentStoryFetches,
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
   * 从DuckDuckGo Instant Answer API获取搜索结果（无需 API Key，不会被重置连接）
   */
  async fetchFromDuckDuckGoAPI(keywords: string[]): Promise<NewsItem[]> {
    const query = keywords.join(' ')
    logger.info(`Fetching from DuckDuckGo API: "${query}"`)
    try {
      // 先尝试 Instant Answer API（JSON格式，无反爬）
      const response = await this.client.get('https://api.duckduckgo.com/', {
        params: { q: query, format: 'json', no_html: 1, no_redirect: 1 },
        headers: { 'Accept': 'application/json' },
        timeout: 25000,
      })

      const data = response.data
      const items: NewsItem[] = []

      // AbstractText — 摘要信息
      if (data.AbstractText && data.AbstractURL) {
        items.push({
          title: data.Heading || query,
          url: data.AbstractURL,
          content: data.AbstractText,
          source: 'DuckDuckGo',
        })
      }

      // RelatedTopics
      const topics: any[] = data.RelatedTopics || []
      for (const t of topics) {
        if (t.FirstURL && t.Text) {
          items.push({
            title: t.Text.slice(0, 120),
            url: t.FirstURL,
            content: t.Text,
            source: 'DuckDuckGo',
          })
        }
        // 嵌套分组
        if (t.Topics) {
          for (const sub of t.Topics) {
            if (sub.FirstURL && sub.Text) {
              items.push({
                title: sub.Text.slice(0, 120),
                url: sub.FirstURL,
                content: sub.Text,
                source: 'DuckDuckGo',
              })
            }
          }
        }
      }

      // Results（直接搜索结果）
      const results: any[] = data.Results || []
      for (const r of results) {
        if (r.FirstURL && r.Text) {
          items.push({
            title: r.Text.slice(0, 120),
            url: r.FirstURL,
            content: r.Text,
            source: 'DuckDuckGo',
          })
        }
      }

      // 若 Instant Answer API 结果为空，回退到 HTML 爬取
      if (items.length === 0) {
        const htmlRes = await this.client.get('https://html.duckduckgo.com/html/', {
          params: { q: query },
          headers: {
            'Accept': 'text/html',
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          },
          timeout: 15000,
        })
        const $ = cheerio.load(htmlRes.data)
        $('.result').each((_, el) => {
          const title = $(el).find('.result__title a').text().trim()
          const urlRaw = $(el).find('.result__title a').attr('href') || ''
          const snippet = $(el).find('.result__snippet').text().trim()
          let url = urlRaw
          const uddgMatch = urlRaw.match(/uddg=([^&]+)/)
          if (uddgMatch) url = decodeURIComponent(uddgMatch[1])
          if (title && url.startsWith('http')) {
            items.push({ title, url, content: snippet, source: 'DuckDuckGo' })
          }
        })
      }

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

  private decodeSearchEngineUrl(urlRaw: string): string {
    if (!urlRaw) return ''

    const decodedUrl = urlRaw.replace(/&amp;/g, '&')
    const redirectPatterns = [
      /[?&]uddg=([^&]+)/i,
      /[?&]rut=([^&]+)/i,
      /[?&]u=([^&]+)/i,
    ]

    for (const pattern of redirectPatterns) {
      const match = decodedUrl.match(pattern)
      if (match?.[1]) {
        try {
          return decodeURIComponent(match[1])
        } catch {
          return match[1]
        }
      }
    }

    return decodedUrl
  }

  private normalizeTwitterUrl(urlRaw: string): string | null {
    const decodedUrl = this.decodeSearchEngineUrl(urlRaw).trim()
    if (!decodedUrl) return null

    try {
      const normalized = decodedUrl.startsWith('//') ? `https:${decodedUrl}` : decodedUrl
      const url = new URL(normalized)
      const hostname = url.hostname.toLowerCase()
      if (!hostname.endsWith('x.com') && !hostname.endsWith('twitter.com')) {
        return null
      }

      url.hash = ''
      return url.toString()
    } catch {
      return null
    }
  }

  private isSearchChallengePage(html: string): boolean {
    const normalizedHtml = html.toLowerCase()
    return normalizedHtml.includes('anomaly-modal')
      || normalizedHtml.includes('select all squares containing')
      || normalizedHtml.includes('challenge-form')
      || normalizedHtml.includes('captcha')
  }

  private async fetchSearchHtml(url: string, params: Record<string, string>, headers: Record<string, string> = {}): Promise<string> {
    try {
      const response = await this.client.get(url, {
        params,
        headers,
        timeout: 15000,
      })

      return typeof response.data === 'string' ? response.data : ''
    } catch (error) {
      if (process.platform !== 'win32') {
        throw error
      }

      logger.warn(`Axios search request failed, falling back to PowerShell: ${url}`, error)

      const fullUrl = new URL(url)
      Object.entries(params).forEach(([key, value]) => {
        fullUrl.searchParams.set(key, value)
      })

      const headerLiteral = Object.entries(headers)
        .map(([key, value]) => `'${key.replace(/'/g, "''")}'='${value.replace(/'/g, "''")}'`)
        .join('; ')

      const script = [
        "$ProgressPreference='SilentlyContinue'",
        "[Console]::OutputEncoding=[System.Text.Encoding]::UTF8",
        headerLiteral
          ? `$headers=@{${headerLiteral}}; $response=Invoke-WebRequest -UseBasicParsing -Uri '${fullUrl.toString().replace(/'/g, "''")}' -Headers $headers -TimeoutSec 20`
          : `$response=Invoke-WebRequest -UseBasicParsing -Uri '${fullUrl.toString().replace(/'/g, "''")}' -TimeoutSec 20`,
        '$response.Content',
      ].join('; ')

      const { stdout } = await execFileAsync('powershell.exe', ['-NoProfile', '-Command', script], {
        timeout: 25000,
        maxBuffer: 4 * 1024 * 1024,
      })

      return stdout
    }
  }

  private extractTwitterSearchResults(html: string, sourceLabel: string): NewsItem[] {
    const $ = cheerio.load(html)
    const items: NewsItem[] = []
    const seen = new Set<string>()

    $('.result, .b_algo').each((_, el) => {
      const titleLink = $(el).find('.result__title a, .result__a, h2 a').first()
      const snippet = $(el).find('.result__snippet, .b_caption p').first().text().trim()
      const title = titleLink.text().trim() || snippet.slice(0, 120)
      const normalizedUrl = this.normalizeTwitterUrl(titleLink.attr('href') || '')

      if (!title || !normalizedUrl || seen.has(normalizedUrl)) {
        return
      }

      seen.add(normalizedUrl)
      items.push({
        title: title.replace(/\s+/g, ' ').trim(),
        url: normalizedUrl,
        content: snippet,
        source: sourceLabel,
      })
    })

    return items
  }

  private extractTwitterResultsFromBrave(html: string): NewsItem[] {
    const $ = cheerio.load(html)
    const items: NewsItem[] = []
    const seen = new Set<string>()

    $('.snippet[data-type="web"]').each((_, el) => {
      const link = $(el).find('a[href]').first()
      const normalizedUrl = this.normalizeTwitterUrl(link.attr('href') || '')
      const titleEl = $(el).find('.title.search-snippet-title').first()
      const snippetEl = $(el).find('.generic-snippet .content').first()
      const title = titleEl.attr('title')?.trim() || titleEl.text().trim() || snippetEl.text().trim().slice(0, 120)
      const snippet = snippetEl.text().replace(/\s+/g, ' ').trim()

      if (!title || !normalizedUrl || seen.has(normalizedUrl)) {
        return
      }

      seen.add(normalizedUrl)
      items.push({
        title: title.replace(/\s+/g, ' ').trim(),
        url: normalizedUrl,
        content: snippet,
        source: 'Twitter',
      })
    })

    return items
  }

  private extractTwitterResultsFromMojeek(html: string): NewsItem[] {
    const $ = cheerio.load(html)
    const items: NewsItem[] = []
    const seen = new Set<string>()

    $('ul.results-standard li').each((_, el) => {
      const titleLink = $(el).find('h2 a.title').first()
      const normalizedUrl = this.normalizeTwitterUrl(titleLink.attr('href') || '')
      const title = titleLink.text().trim() || titleLink.attr('title')?.trim() || ''
      const snippet = $(el).find('p.s, p.i').text().replace(/\s+/g, ' ').trim()

      if (!title || !normalizedUrl || seen.has(normalizedUrl)) {
        return
      }

      seen.add(normalizedUrl)
      items.push({
        title: title.replace(/\s+/g, ' ').trim(),
        url: normalizedUrl,
        content: snippet,
        source: 'Twitter',
      })
    })

    return items
  }

  private async fetchTwitterViaSearchEngine(keyword: string): Promise<NewsItem[]> {
    const searchQueries = [
      `site:x.com \"${keyword}\"`,
      `site:x.com ${keyword}`,
    ]

    const searchSources: Array<{
      name: string
      url: string
      buildParams: (query: string) => Record<string, string>
      extract: (html: string) => NewsItem[]
      headers?: Record<string, string>
    }> = [
      {
        name: 'Brave Search',
        url: 'https://search.brave.com/search',
        buildParams: (query) => ({ q: query, source: 'web' }),
        extract: (html) => this.extractTwitterResultsFromBrave(html),
        headers: {
          'Accept': 'text/html,application/xhtml+xml',
          'Referer': 'https://search.brave.com/',
          'User-Agent': this.config.crawler.userAgent,
        },
      },
      {
        name: 'Mojeek',
        url: 'https://www.mojeek.com/search',
        buildParams: (query) => ({ q: query }),
        extract: (html) => this.extractTwitterResultsFromMojeek(html),
        headers: {
          'Accept': 'text/html,application/xhtml+xml',
          'Referer': 'https://www.mojeek.com/',
          'User-Agent': this.config.crawler.userAgent,
        },
      },
      {
        name: 'DuckDuckGo HTML',
        url: 'https://html.duckduckgo.com/html/',
        buildParams: (query) => ({ q: query, kl: 'wt-wt' }),
        extract: (html) => this.extractTwitterSearchResults(html, 'Twitter'),
        headers: {
          'Accept': 'text/html',
          'Content-Type': 'application/x-www-form-urlencoded',
          'Origin': 'https://duckduckgo.com',
          'Referer': 'https://duckduckgo.com/',
          'User-Agent': this.config.crawler.userAgent,
        },
      },
    ]

    for (const query of searchQueries) {
      for (const source of searchSources) {
        try {
          const html = await this.fetchSearchHtml(source.url, source.buildParams(query), source.headers)

          if (!html || this.isSearchChallengePage(html)) {
            logger.warn(`${source.name} search challenge triggered for Twitter query: ${query}`)
            continue
          }

          const items = source.extract(html)
          if (items.length > 0) {
            return items
          }
        } catch (error) {
          logger.warn(`${source.name} Twitter crawler failed for query: ${query}`, error)
        }
      }
    }

    return []
  }

  // ============================================================
  //  Twitter/X (crawler only)
  // ============================================================

  /**
   * 从 Twitter/X 搜索关键词（通过搜索引擎抓取公开 x.com 结果）
   */
  async fetchFromTwitter(keyword: string): Promise<NewsItem[]> {
    logger.info(`Fetching from Twitter: "${keyword}"`)
    try {
      const limit = this.config.datasources.twitter?.limit || 15
      const items = await this.fetchTwitterViaSearchEngine(keyword)

      return items.slice(0, limit)
    } catch (error) {
      logger.error('Error fetching from Twitter:', error)
      return []
    }
  }

  /**
   * 从 Twitter 获取趋势热点 (使用网页爬虫作为 fallback 或主力, 直接从 trends24.in 获取当日全球热榜)
   */
  async fetchFromTwitterTrends(): Promise<NewsItem[]> {
    logger.info('Fetching Twitter trends data')
    try {
      if (this.config.datasources.twitter?.enabled === false) return []

      const response = await this.client.get('https://trends24.in/', {
        timeout: 15000,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        }
      })

      const $ = cheerio.load(response.data)
      const trends: Array<{ name: string }> = []
      $('ol.trend-card__list').first().find('li').each((_, el) => {
        const name = $(el).find('a').text().trim()
        if (name) trends.push({ name })
      })

      const limit = this.config.datasources.twitter?.limit || 15

      return trends.slice(0, limit).map((trend, index) => ({
        title: trend.name,
        url: `https://x.com/search?q=${encodeURIComponent(trend.name)}`,
        content: `Twitter 实时全球热榜 #${index + 1}: ${trend.name}`,
        source: 'Twitter',
      }))
    } catch (error) {
      logger.error('Error fetching Twitter trends:', error)
      return []
    }
  }

  // ============================================================
  //  Google Search (Web 爬虫)
  // ============================================================

  /**
   * 从 Google 搜索获取新闻
   */
  async fetchFromGoogle(keywords: string[]): Promise<NewsItem[]> {
    const query = keywords.join(' ')
    logger.info(`Fetching from Google: "${query}"`)
    try {
      const response = await this.client.get('https://www.google.com/search', {
        params: { q: `${query} news`, tbm: 'nws', hl: 'zh-CN', num: 20 },
        headers: {
          'Accept': 'text/html',
          'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
        },
        timeout: 15000,
      })

      const $ = cheerio.load(response.data)
      const items: NewsItem[] = []

      // Google News 结果结构
      $('div[data-hveid]').each((_, el) => {
        const titleEl = $(el).find('div[role="heading"]')
        const linkEl = $(el).find('a[href^="http"]').first()
        const snippetEl = $(el).find('div[style*="-webkit-line-clamp"]')
        const timeEl = $(el).find('time, span[aria-label]')

        const title = titleEl.text().trim()
        const url = linkEl.attr('href') || ''

        if (title && url.startsWith('http') && !url.includes('google.com')) {
          items.push({
            title,
            url,
            content: snippetEl.text().trim() || '',
            source: 'Google',
            publishedAt: timeEl.attr('datetime') || undefined,
          })
        }
      })

      // 备用解析：通用搜索结果
      if (items.length === 0) {
        $('div.g, div[data-sokoban-container]').each((_, el) => {
          const title = $(el).find('h3').first().text().trim()
          const url = $(el).find('a').first().attr('href') || ''
          const snippet = $(el).find('.VwiC3b, .st, span[style]').first().text().trim()

          if (title && url.startsWith('http') && !url.includes('google.com')) {
            items.push({
              title,
              url,
              content: snippet,
              source: 'Google',
            })
          }
        })
      }

      const limit = this.config.datasources.google?.limit || 20
      return items.slice(0, limit)
    } catch (error) {
      logger.error('Error fetching from Google:', error)
      return []
    }
  }

  // ============================================================
  //  微博热搜
  // ============================================================

  /**
   * 从微博移动端 API 搜索关键词（无需登录）
   */
  async fetchFromWeiboMobile(keyword: string): Promise<NewsItem[]> {
    logger.info(`Fetching from Weibo (mobile): "${keyword}"`)
    try {
      // 微博移动端综合搜索，无需 cookie
      const response = await this.client.get('https://m.weibo.cn/api/container/getIndex', {
        params: {
          containerid: `100103type=1&q=${keyword}&t=0`,
          page_type: 'searchall',
        },
        headers: {
          'Accept': 'application/json',
          'MWeibo-Pwa': '1',
          'Referer': 'https://m.weibo.cn/',
          'X-Requested-With': 'XMLHttpRequest',
        },
        timeout: 15000,
      })

      const cards = response.data?.data?.cards || []
      const items: NewsItem[] = []
      const limit = this.config.datasources.weibo?.limit || 20

      for (const card of cards) {
        // card_type=9 是微博正文卡片
        if (card.card_type === 9 && card.mblog) {
          const mblog = card.mblog
          const rawText = mblog.text
            ? mblog.text.replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').trim()
            : ''
          if (!rawText) continue
          const mid = mblog.mid || mblog.id || ''
          items.push({
            title: rawText.slice(0, 120),
            url: mid ? `https://weibo.com/detail/${mid}` : 'https://weibo.com',
            content: rawText,
            source: '微博',
            publishedAt: mblog.created_at || undefined,
          })
        }
        // card_type=11 是分组，递归处理
        if (card.card_type === 11 && card.card_group) {
          for (const sub of card.card_group) {
            if (sub.card_type === 9 && sub.mblog) {
              const mblog = sub.mblog
              const rawText = mblog.text
                ? mblog.text.replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').trim()
                : ''
              if (!rawText) continue
              const mid = mblog.mid || mblog.id || ''
              items.push({
                title: rawText.slice(0, 120),
                url: mid ? `https://weibo.com/detail/${mid}` : 'https://weibo.com',
                content: rawText,
                source: '微博',
                publishedAt: mblog.created_at || undefined,
              })
            }
          }
        }
        if (items.length >= limit) break
      }

      return items.slice(0, limit)
    } catch (error) {
      logger.error('Error fetching from Weibo:', error)
      return []
    }
  }

  /**
   * 获取微博用户主页最新发帖（账号关键词时调用）
   */
  async fetchWeiboUser(username: string): Promise<NewsItem[]> {
    logger.info(`Fetching Weibo user: "${username}"`)
    try {
      // 先通过搜索找用户 UID
      const searchRes = await this.client.get('https://m.weibo.cn/api/container/getIndex', {
        params: {
          containerid: `100103type=3&q=${username}`,
          page_type: 'searchall',
        },
        headers: { Referer: 'https://m.weibo.cn/', 'X-Requested-With': 'XMLHttpRequest' },
        timeout: 15000,
      })

      const cards = searchRes.data?.data?.cards || []
      let uid = ''
      for (const card of cards) {
        if (card.card_type === 10 && card.user?.id) {
          uid = String(card.user.id)
          break
        }
        if (card.card_group) {
          for (const sub of card.card_group) {
            if (sub.user?.id) { uid = String(sub.user.id); break }
          }
        }
        if (uid) break
      }

      if (!uid) {
        logger.warn(`Weibo user "${username}" not found`)
        return []
      }

      // 获取用户主页微博列表
      const profileRes = await this.client.get('https://m.weibo.cn/api/container/getIndex', {
        params: { type: 'uid', value: uid },
        headers: { Referer: 'https://m.weibo.cn/', 'X-Requested-With': 'XMLHttpRequest' },
        timeout: 15000,
      })

      const containerid = profileRes.data?.data?.tabsInfo?.tabs?.[0]?.containerid || `107603${uid}`
      const feedRes = await this.client.get('https://m.weibo.cn/api/container/getIndex', {
        params: { type: 'uid', value: uid, containerid },
        headers: { Referer: 'https://m.weibo.cn/', 'X-Requested-With': 'XMLHttpRequest' },
        timeout: 15000,
      })

      const feedCards = feedRes.data?.data?.cards || []
      const items: NewsItem[] = []
      const limit = this.config.datasources.weibo?.limit || 10

      for (const card of feedCards) {
        if (card.card_type === 9 && card.mblog) {
          const mblog = card.mblog
          const rawText = mblog.text
            ? mblog.text.replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').trim()
            : ''
          if (!rawText) continue
          const mid = mblog.mid || mblog.id || ''
          items.push({
            title: `[@${username}] ${rawText.slice(0, 100)}`,
            url: mid ? `https://weibo.com/detail/${mid}` : `https://weibo.com/u/${uid}`,
            content: rawText,
            source: '微博',
            publishedAt: mblog.created_at || undefined,
          })
          if (items.length >= limit) break
        }
      }

      return items
    } catch (error) {
      logger.error('Error fetching Weibo user:', error)
      return []
    }
  }

  /**
   * 从微博获取热搜榜
   */
  async fetchFromWeiboHot(): Promise<NewsItem[]> {
    logger.info('Fetching Weibo hot search')
    try {
      const response = await this.client.get('https://weibo.com/ajax/side/hotSearch', {
        headers: {
          'Accept': 'application/json',
          'Referer': 'https://weibo.com/',
        },
        timeout: 15000,
      })

      const realtime = response.data?.data?.realtime || []
      const items: NewsItem[] = []
      const limit = this.config.datasources.weibo?.limit || 20

      for (const item of realtime.slice(0, limit)) {
        const word = item.word || item.note || ''
        if (!word) continue

        items.push({
          title: `${item.icon_desc ? `【${item.icon_desc}】` : ''}${word}`,
          url: `https://s.weibo.com/weibo?q=${encodeURIComponent(word)}`,
          content: item.label_name ? `${item.label_name}: ${word} (热度: ${item.num || 0})` : word,
          source: '微博',
        })
      }

      return items
    } catch (error) {
      logger.error('Error fetching Weibo hot search:', error)
      return []
    }
  }

  // ============================================================
  //  B站热门
  // ============================================================

  /**
   * 从B站搜索关键词
   */
  async fetchFromBilibili(keyword: string): Promise<NewsItem[]> {
    logger.info(`Fetching from Bilibili: "${keyword}"`)
    try {
      const response = await this.client.get('https://api.bilibili.com/x/web-interface/search/all/v2', {
        params: { keyword, page: 1, page_size: 20 },
        headers: {
          'Accept': 'application/json',
          'Referer': 'https://search.bilibili.com/',
        },
        timeout: 15000,
      })

      const items: NewsItem[] = []
      const resultList = response.data?.data?.result || []

      for (const group of resultList) {
        if (group.result_type !== 'video') continue
        const videos = group.data || []
        for (const v of videos) {
          const title = (v.title || '').replace(/<[^>]+>/g, '') // 去除高亮标签
          if (!title) continue
          items.push({
            title,
            url: `https://www.bilibili.com/video/${v.bvid || `av${v.aid}`}`,
            content: v.description || title,
            source: 'B站',
            publishedAt: v.pubdate ? new Date(v.pubdate * 1000).toISOString() : undefined,
          })
        }
      }

      const limit = this.config.datasources.bili?.limit || 15
      return items.slice(0, limit)
    } catch (error) {
      logger.error('Error fetching from Bilibili:', error)
      return []
    }
  }

  /**
   * 从B站获取热门推荐
   */
  async fetchFromBilibiliHot(): Promise<NewsItem[]> {
    logger.info('Fetching Bilibili hot')
    try {
      const response = await this.client.get('https://api.bilibili.com/x/web-interface/popular', {
        params: { ps: 20, pn: 1 },
        headers: {
          'Accept': 'application/json',
          'Referer': 'https://www.bilibili.com/v/popular/all',
        },
        timeout: 15000,
      })

      const items: NewsItem[] = []
      const list = response.data?.data?.list || []
      const limit = this.config.datasources.bili?.limit || 15

      for (const v of list.slice(0, limit)) {
        items.push({
          title: v.title || '',
          url: `https://www.bilibili.com/video/${v.bvid}`,
          content: v.desc || v.dynamic || v.title || '',
          source: 'B站',
          publishedAt: v.pubdate ? new Date(v.pubdate * 1000).toISOString() : undefined,
        })
      }

      return items
    } catch (error) {
      logger.error('Error fetching Bilibili hot:', error)
      return []
    }
  }

  // ============================================================
  //  搜狗搜索 (微信公众号)
  // ============================================================

  /**
   * 从搜狗搜索获取结果（含微信公众号内容）
   */
  async fetchFromSogou(keyword: string): Promise<NewsItem[]> {
    logger.info(`Fetching from Sogou: "${keyword}"`)
    try {
      // 搜狗微信搜索
      const response = await this.client.get('https://weixin.sogou.com/weixin', {
        params: { type: 2, query: keyword, ie: 'utf8' },
        headers: {
          'Accept': 'text/html',
          'Referer': 'https://weixin.sogou.com/',
        },
        timeout: 15000,
      })

      const $ = cheerio.load(response.data)
      const items: NewsItem[] = []

      $('div.txt-box, ul.news-list li').each((_, el) => {
        const titleEl = $(el).find('h3 a, .tit a').first()
        const title = titleEl.text().trim()
        const url = titleEl.attr('href') || ''
        const snippet = $(el).find('p.txt-info, .txt-info').first().text().trim()
        const account = $(el).find('a.account, .s-p').first().text().trim()

        if (title) {
          items.push({
            title,
            url: url.startsWith('http') ? url : `https://weixin.sogou.com${url}`,
            content: account ? `[${account}] ${snippet}` : snippet,
            source: '搜狗',
          })
        }
      })

      // 备用：普通搜狗搜索
      if (items.length === 0) {
        const webResponse = await this.client.get('https://www.sogou.com/web', {
          params: { query: keyword },
          headers: { 'Accept': 'text/html' },
          timeout: 15000,
        })
        const $web = cheerio.load(webResponse.data)
        $web('div.vrwrap, div.rb').each((_, el) => {
          const title = $web(el).find('h3 a').first().text().trim()
          const url = $web(el).find('h3 a').first().attr('href') || ''
          const snippet = $web(el).find('.str_info, .ft, p').first().text().trim()
          if (title && url) {
            items.push({
              title,
              url: url.startsWith('http') ? url : `https://www.sogou.com${url}`,
              content: snippet,
              source: '搜狗',
            })
          }
        })
      }

      const limit = this.config.datasources.sogou?.limit || 20
      return items.slice(0, limit)
    } catch (error) {
      logger.error('Error fetching from Sogou:', error)
      return []
    }
  }

  /**
   * 搜索微信公众号账号信息（type=1 是账号搜索）
   */
  async fetchWechatAccount(accountName: string): Promise<NewsItem[]> {
    logger.info(`Fetching WeChat account: "${accountName}"`)
    try {
      const response = await this.client.get('https://weixin.sogou.com/weixin', {
        params: { type: 1, query: accountName, ie: 'utf8' },
        headers: { 'Accept': 'text/html', 'Referer': 'https://weixin.sogou.com/' },
        timeout: 15000,
      })

      const $ = cheerio.load(response.data)
      const items: NewsItem[] = []

      // 公众号账号卡片
      $('ul.news-list2 li, .account-box').each((_, el) => {
        const nameEl = $(el).find('.tit a, h3 a').first()
        const name = nameEl.text().trim()
        const url = nameEl.attr('href') || ''
        const desc = $(el).find('.account-txt, .txt-box').first().text().trim()
        if (name) {
          items.push({
            title: `[公众号] ${name}`,
            url: url.startsWith('http') ? url : `https://weixin.sogou.com${url}`,
            content: desc || name,
            source: '微信',
          })
        }
      })

      // 回退：公众号文章搜索
      if (items.length === 0) {
        return this.fetchFromSogou(accountName)
      }

      return items.slice(0, this.config.datasources.sogou?.limit || 10)
    } catch (error) {
      logger.error('Error fetching WeChat account:', error)
      return []
    }
  }

  // ============================================================
  //  B站用户主页
  // ============================================================

  /**
   * 搜索B站 UP 主并获取其最新投稿（账号关键词时调用）
   */
  async fetchBilibiliUser(username: string): Promise<NewsItem[]> {
    logger.info(`Fetching Bilibili user: "${username}"`)
    try {
      // 使用 search/all/v2 并筛选 bili_user 类型（避免 412 防护）
      const searchRes = await this.client.get('https://api.bilibili.com/x/web-interface/search/all/v2', {
        params: { keyword: username, page: 1, page_size: 10 },
        headers: { 'Accept': 'application/json', 'Referer': 'https://search.bilibili.com/' },
        timeout: 15000,
      })

      const groups: any[] = searchRes.data?.data?.result || []
      const userGroup = groups.find(g => g.result_type === 'bili_user')
      const users: any[] = userGroup?.data || []

      if (users.length === 0) return []

      const user = users[0]
      const mid = user.mid
      if (!mid) return []

      // 获取用户最新视频
      const videoRes = await this.client.get('https://api.bilibili.com/x/space/arc/search', {
        params: { mid, ps: 10, pn: 1, order: 'pubdate' },
        headers: { 'Accept': 'application/json', 'Referer': `https://space.bilibili.com/${mid}/video` },
        timeout: 15000,
      })

      const vList: any[] = videoRes.data?.data?.list?.vlist || []
      const items: NewsItem[] = vList.map(v => ({
        title: `[UP主: ${user.uname}] ${v.title}`,
        url: `https://www.bilibili.com/video/${v.bvid || `av${v.aid}`}`,
        content: v.description || v.title,
        source: 'B站',
        publishedAt: v.created ? new Date(v.created * 1000).toISOString() : undefined,
      }))

      return items.slice(0, this.config.datasources.bili?.limit || 10)
    } catch (error) {
      logger.error('Error fetching Bilibili user:', error)
      return []
    }
  }

  // ============================================================
  //  百度搜索（修复版）
  // ============================================================

  /**
   * 从百度新闻搜索获取结果
   */
  async fetchFromBaidu(keyword: string): Promise<NewsItem[]> {
    logger.info(`Fetching from Baidu: "${keyword}"`)
    try {
      const response = await this.client.get('https://www.baidu.com/s', {
        params: { wd: keyword, rn: 20, tn: 'news', ie: 'utf-8' },
        headers: {
          'Accept': 'text/html',
          'Referer': 'https://www.baidu.com/',
        },
        timeout: 15000,
      })

      const $ = cheerio.load(response.data)
      const items: NewsItem[] = []

      // 百度新闻结果
      $('div.result, div[tpl="se_com_default"], div[tpl="news_content"]').each((_, el) => {
        const titleEl = $(el).find('h3 a, .news-title a').first()
        const title = titleEl.text().trim()
        const url = titleEl.attr('href') || ''
        const snippet = $(el).find('.c-abstract, .c-summary, p').first().text().trim()
        if (title && url.startsWith('http') && !url.includes('baidu.com')) {
          items.push({ title, url, content: snippet, source: '百度' })
        }
      })

      // 回退：通用搜索结果
      if (items.length === 0) {
        $('h3.t a, h3 a').each((_, el) => {
          const title = $(el).text().trim()
          const url = $(el).attr('href') || ''
          if (title && url.startsWith('http') && !url.includes('baidu.com')) {
            items.push({ title, url, content: '', source: '百度' })
          }
        })
      }

      const limit = this.config.datasources.baidu?.limit || 20
      return items.slice(0, limit)
    } catch (error) {
      logger.error('Error fetching from Baidu:', error)
      return []
    }
  }

  /**
   * 百度热搜榜（从页面内嵌 JSON 提取，移植自 newsnow）
   */
  async fetchBaiduHot(): Promise<NewsItem[]> {
    logger.info('Fetching Baidu hot search')
    try {
      const response = await this.client.get('https://top.baidu.com/board', {
        params: { tab: 'realtime' },
        headers: { 'Accept': 'text/html', 'Referer': 'https://www.baidu.com/' },
        timeout: 15000,
      })

      const html = typeof response.data === 'string' ? response.data : ''
      const items: NewsItem[] = []

      // 优先从内嵌 JSON 提取（newsnow 方式，更稳定）
      const jsonMatch = html.match(/<!--s-data:(.*?)-->/s)
      if (jsonMatch?.[1]) {
        try {
          const data = JSON.parse(jsonMatch[1])
          const cards = data?.data?.cards || []
          for (const card of cards) {
            const content = card.content || []
            for (const item of content) {
              if (item.isTop) continue
              if (item.word) {
                items.push({
                  title: item.word,
                  url: item.rawUrl || `https://www.baidu.com/s?wd=${encodeURIComponent(item.word)}`,
                  content: item.desc || item.word,
                  source: '百度热搜',
                })
              }
            }
          }
        } catch (_) {
          // JSON 解析失败，走 HTML 解析
        }
      }

      // 回退：HTML 解析
      if (items.length === 0) {
        const $ = cheerio.load(html)
        $('[class*="content_"] a[href]').each((_, el) => {
          const titleEl = $(el).find('[class*="title_"]').first()
          const title = titleEl.text().trim() || $(el).text().trim()
          const url = $(el).attr('href') || ''
          if (title && title.length > 2 && url) {
            items.push({
              title,
              url: url.startsWith('http') ? url : `https://www.baidu.com/s?wd=${encodeURIComponent(title)}`,
              content: title,
              source: '百度热搜',
            })
          }
        })
      }

      // 去重
      const seen = new Set<string>()
      const deduped = items.filter(i => {
        if (seen.has(i.title)) return false
        seen.add(i.title)
        return true
      })

      const limit = this.config.datasources.baidu?.limit || 20
      return deduped.slice(0, limit)
    } catch (error) {
      logger.error('Error fetching Baidu hot:', error)
      return []
    }
  }

  // ============================================================
  //  知乎（修复版）
  // ============================================================

  /**
   * 从知乎获取热门内容（API 接口，移植自 newsnow）
   * 关键词搜索时过滤标题匹配项
   */
  async fetchFromZhihu(keyword?: string): Promise<NewsItem[]> {
    logger.info(`Fetching from Zhihu${keyword ? ` (kw: ${keyword})` : ' hot'}`)
    try {
      // 使用知乎热榜 API（无需登录）
      const response = await this.client.get('https://www.zhihu.com/api/v3/feed/topstory/hot-list-web', {
        params: { limit: 20, desktop: true },
        headers: {
          'Accept': 'application/json',
          'Referer': 'https://www.zhihu.com/',
        },
        timeout: 15000,
      })

      const data = response.data?.data || []
      let items: NewsItem[] = data.map((k: any) => ({
        title: k.target?.title_area?.text || '',
        url: k.target?.link?.url || '',
        content: k.target?.excerpt_area?.text || '',
        source: '知乎',
      })).filter((i: NewsItem) => i.title)

      if (keyword) {
        const kw = keyword.toLowerCase()
        items = items.filter((i: NewsItem) =>
          i.title.toLowerCase().includes(kw) ||
          (i.content && i.content.toLowerCase().includes(kw))
        )
      }

      const limit = this.config.datasources.zhihu?.limit || 15
      return items.slice(0, limit)
    } catch (error) {
      logger.error('Error fetching from Zhihu:', error)
      return []
    }
  }

  // ============================================================
  //  今日头条
  // ============================================================

  /**
   * 今日头条热榜
   */
  async fetchToutiaoHot(): Promise<NewsItem[]> {
    logger.info('Fetching Toutiao hot')
    try {
      const response = await this.client.get('https://www.toutiao.com/hot-event/hot-board/', {
        params: { origin: 'toutiao_pc' },
        headers: { 'Accept': 'application/json', 'Referer': 'https://www.toutiao.com/' },
        timeout: 15000,
      })

      const list: any[] = response.data?.data || []
      const limit = this.config.datasources.toutiao?.limit || 20

      return list.slice(0, limit).map(item => ({
        title: item.Title || item.title || '',
        url: item.Url || item.url || `https://www.toutiao.com/trending/${item.Id || item.id || ''}`,
        content: item.HotValue ? `热度: ${item.HotValue}` : (item.Title || item.title || ''),
        source: '今日头条',
      })).filter(i => i.title)
    } catch (error) {
      logger.error('Error fetching Toutiao hot:', error)
      return []
    }
  }

  /**
   * 今日头条关键词搜索
   */
  async fetchFromToutiao(keyword: string): Promise<NewsItem[]> {
    logger.info(`Fetching from Toutiao: "${keyword}"`)
    try {
      const response = await this.client.get('https://www.toutiao.com/search/', {
        params: { keyword, pd: 'synthesis' },
        headers: { 'Accept': 'text/html', 'Referer': 'https://www.toutiao.com/' },
        timeout: 15000,
      })

      const $ = cheerio.load(response.data)
      const items: NewsItem[] = []

      $('div[class*="title"], .title-wrap a, article h3').each((_, el) => {
        const title = $(el).text().trim()
        const url = $(el).is('a') ? $(el).attr('href') : $(el).closest('a').attr('href') || ''
        if (title && title.length > 5) {
          items.push({
            title,
            url: url?.startsWith('http') ? url : `https://www.toutiao.com/search/?keyword=${encodeURIComponent(keyword)}`,
            content: title,
            source: '今日头条',
          })
        }
      })

      // 若 HTML 解析失败，直接返回热榜过滤结果
      if (items.length === 0) {
        const hotItems = await this.fetchToutiaoHot()
        const kw = keyword.toLowerCase()
        return hotItems.filter(i => i.title.toLowerCase().includes(kw)).slice(0, 5)
      }

      const limit = this.config.datasources.toutiao?.limit || 20
      return items.slice(0, limit)
    } catch (error) {
      logger.error('Error fetching from Toutiao:', error)
      return []
    }
  }

  // ============================================================
  //  通用 RSS 订阅解析（36氪、IT之家、虎嗅等）
  // ============================================================

  /**
   * 通用 RSS 解析，支持关键词过滤
   */
  async fetchFromRSS(rssUrl: string, sourceName: string, keyword?: string): Promise<NewsItem[]> {
    logger.info(`Fetching RSS from ${sourceName}: ${rssUrl}${keyword ? ` (kw: ${keyword})` : ''}`)
    try {
      const response = await this.client.get(rssUrl, {
        headers: { 'Accept': 'application/rss+xml, application/xml, text/xml' },
        timeout: 20000,  // RSS 源可能较慢，使用更长超时
      })

      const $ = cheerio.load(response.data, { xmlMode: true })
      const items: NewsItem[] = []
      const kw = keyword?.toLowerCase()

      $('item').each((_, el) => {
        const title = $(el).find('title').text().trim()
        const link = $(el).find('link').text().trim() || $(el).find('link').attr('href') || ''
        const description = $(el).find('description').text().trim().replace(/<[^>]+>/g, '')
        const pubDate = $(el).find('pubDate, dc\\:date, published').text().trim()

        if (!title) return

        // 关键词过滤
        if (kw && !title.toLowerCase().includes(kw) && !description.toLowerCase().includes(kw)) return

        items.push({
          title,
          url: link,
          content: description.slice(0, 300),
          source: sourceName,
          publishedAt: pubDate && !isNaN(Date.parse(pubDate)) ? new Date(pubDate).toISOString() : undefined,
        })
      })

      return items.slice(0, 20)
    } catch (error) {
      logger.error(`Error fetching RSS from ${sourceName}:`, error)
      return []
    }
  }

  // ============================================================
  //  以下为从 newsnow 移植的新数据源
  // ============================================================

  /**
   * 抖音热搜（移植自 newsnow）
   */
  async fetchDouyinHot(): Promise<NewsItem[]> {
    logger.info('Fetching Douyin hot search')
    try {
      const url = 'https://www.douyin.com/aweme/v1/web/hot/search/list/?device_platform=webapp&aid=6383&channel=channel_pc_web&detail_list=1'
      const response = await this.client.get(url, {
        timeout: 15000,
      })

      const wordList = response.data?.data?.word_list || []
      const limit = this.config.datasources.douyin?.limit || 20

      return wordList.slice(0, limit).map((k: any) => ({
        title: k.word || '',
        url: `https://www.douyin.com/hot/${k.sentence_id || ''}`,
        content: k.word || '',
        source: '抖音',
      })).filter((i: NewsItem) => i.title)
    } catch (error) {
      logger.error('Error fetching Douyin hot:', error)
      return []
    }
  }

  /**
   * 澎湃新闻热榜（移植自 newsnow）
   */
  async fetchThepaperHot(): Promise<NewsItem[]> {
    logger.info('Fetching The Paper hot news')
    try {
      const response = await this.client.get('https://cache.thepaper.cn/contentapi/wwwIndex/rightSidebar', {
        headers: { 'Accept': 'application/json' },
        timeout: 15000,
      })

      const hotNews = response.data?.data?.hotNews || []
      const limit = this.config.datasources.thepaper?.limit || 20

      return hotNews.slice(0, limit).map((k: any) => ({
        title: k.name || '',
        url: `https://www.thepaper.cn/newsDetail_forward_${k.contId}`,
        content: k.name || '',
        source: '澎湃新闻',
      })).filter((i: NewsItem) => i.title)
    } catch (error) {
      logger.error('Error fetching The Paper hot:', error)
      return []
    }
  }

  /**
   * 掘金热榜（移植自 newsnow）
   */
  async fetchJuejinHot(): Promise<NewsItem[]> {
    logger.info('Fetching Juejin hot articles')
    try {
      const response = await this.client.get('https://api.juejin.cn/content_api/v1/content/article_rank', {
        params: { category_id: 1, type: 'hot', spider: 0 },
        headers: { 'Accept': 'application/json' },
        timeout: 15000,
      })

      const data = response.data?.data || []
      const limit = this.config.datasources.juejin?.limit || 20

      return data.slice(0, limit).map((k: any) => ({
        title: k.content?.title || '',
        url: `https://juejin.cn/post/${k.content?.content_id || ''}`,
        content: k.content?.title || '',
        source: '掘金',
      })).filter((i: NewsItem) => i.title)
    } catch (error) {
      logger.error('Error fetching Juejin hot:', error)
      return []
    }
  }

  /**
   * 少数派热门文章（移植自 newsnow）
   */
  async fetchSspaiHot(): Promise<NewsItem[]> {
    logger.info('Fetching Sspai hot articles')
    try {
      const timestamp = Date.now()
      const response = await this.client.get('https://sspai.com/api/v1/article/tag/page/get', {
        params: {
          limit: 30,
          offset: 0,
          created_at: timestamp,
          tag: '热门文章',
          released: false,
        },
        headers: { 'Accept': 'application/json' },
        timeout: 15000,
      })

      const data = response.data?.data || []
      const limit = this.config.datasources.sspai?.limit || 20

      return data.slice(0, limit).map((k: any) => ({
        title: k.title || '',
        url: `https://sspai.com/post/${k.id}`,
        content: k.title || '',
        source: '少数派',
      })).filter((i: NewsItem) => i.title)
    } catch (error) {
      logger.error('Error fetching Sspai hot:', error)
      return []
    }
  }

  /**
   * V2EX 最新分享（移植自 newsnow）
   */
  async fetchV2exHot(): Promise<NewsItem[]> {
    logger.info('Fetching V2EX latest')
    try {
      const feeds = ['create', 'ideas', 'programmer', 'share']
      const results: NewsItem[] = []

      const settled = await Promise.allSettled(
        feeds.map(k =>
          this.client.get(`https://www.v2ex.com/feed/${k}.json`, {
            headers: { 'Accept': 'application/json' },
            timeout: 15000,
          })
        )
      )

      for (const r of settled) {
        if (r.status === 'fulfilled') {
          const items = r.value.data?.items || []
          for (const item of items) {
            if (item.title && item.url) {
              results.push({
                title: item.title,
                url: item.url,
                content: item.title,
                source: 'V2EX',
                publishedAt: item.date_modified || item.date_published || undefined,
              })
            }
          }
        }
      }

      const limit = this.config.datasources.v2ex?.limit || 20
      return results.slice(0, limit)
    } catch (error) {
      logger.error('Error fetching V2EX:', error)
      return []
    }
  }

  /**
   * 豆瓣热门电影（移植自 newsnow）
   */
  async fetchDoubanHot(): Promise<NewsItem[]> {
    logger.info('Fetching Douban hot movies')
    try {
      const response = await this.client.get('https://m.douban.com/rexxar/api/v2/subject/recent_hot/movie', {
        headers: {
          'Referer': 'https://movie.douban.com/',
          'Accept': 'application/json, text/plain, */*',
        },
        timeout: 15000,
      })

      const items = response.data?.items || []
      const limit = this.config.datasources.douban?.limit || 20

      return items.slice(0, limit).map((movie: any) => ({
        title: movie.title || '',
        url: `https://movie.douban.com/subject/${movie.id}`,
        content: movie.card_subtitle || movie.title || '',
        source: '豆瓣',
      })).filter((i: NewsItem) => i.title)
    } catch (error) {
      logger.error('Error fetching Douban hot:', error)
      return []
    }
  }

  /**
   * 百度贴吧热议（移植自 newsnow）
   */
  async fetchTiebaHot(): Promise<NewsItem[]> {
    logger.info('Fetching Tieba hot topics')
    try {
      const response = await this.client.get('https://tieba.baidu.com/hottopic/browse/topicList', {
        headers: { 'Accept': 'application/json' },
        timeout: 15000,
      })

      const topicList = response.data?.data?.bang_topic?.topic_list || []
      const limit = this.config.datasources.tieba?.limit || 20

      return topicList.slice(0, limit).map((k: any) => ({
        title: k.topic_name || '',
        url: k.topic_url || '',
        content: k.topic_name || '',
        source: '贴吧',
      })).filter((i: NewsItem) => i.title)
    } catch (error) {
      logger.error('Error fetching Tieba hot:', error)
      return []
    }
  }

  /**
   * 虎扑热帖（移植自 newsnow）
   */
  async fetchHupuHot(): Promise<NewsItem[]> {
    logger.info('Fetching Hupu hot posts')
    try {
      const html = await this.client.get('https://bbs.hupu.com/topic-daily-hot', {
        headers: { 'Accept': 'text/html' },
        timeout: 15000,
      }).then(r => typeof r.data === 'string' ? r.data : '')

      const items: NewsItem[] = []
      const regex = /<li class="bbs-sl-web-post-body">[\s\S]*?<a href="(\/[^"]+?\.html)"[^>]*?class="p-title"[^>]*>([^<]+)<\/a>/g
      let match: RegExpExecArray | null
      while ((match = regex.exec(html)) !== null) {
        const [, path, title] = match
        items.push({
          title: title.trim(),
          url: `https://bbs.hupu.com${path}`,
          content: title.trim(),
          source: '虎扑',
        })
      }

      const limit = this.config.datasources.hupu?.limit || 20
      return items.slice(0, limit)
    } catch (error) {
      logger.error('Error fetching Hupu hot:', error)
      return []
    }
  }

  /**
   * 凤凰网热点（移植自 newsnow）
   */
  async fetchIfengHot(): Promise<NewsItem[]> {
    logger.info('Fetching Ifeng hot news')
    try {
      const html = await this.client.get('https://www.ifeng.com/', {
        headers: { 'Accept': 'text/html' },
        timeout: 15000,
      }).then(r => typeof r.data === 'string' ? r.data : '')

      const items: NewsItem[] = []
      const regex = /var\s+allData\s*=\s*(\{[\s\S]*?\});/
      const match = regex.exec(html)
      if (match?.[1]) {
        try {
          const realData = JSON.parse(match[1])
          const rawNews = realData.hotNews1 || []
          for (const hotNews of rawNews) {
            if (hotNews.url && hotNews.title) {
              items.push({
                title: hotNews.title,
                url: hotNews.url,
                content: hotNews.title,
                source: '凤凰网',
                publishedAt: hotNews.newsTime || undefined,
              })
            }
          }
        } catch (_) {
          // JSON 解析失败
        }
      }

      const limit = this.config.datasources.ifeng?.limit || 20
      return items.slice(0, limit)
    } catch (error) {
      logger.error('Error fetching Ifeng hot:', error)
      return []
    }
  }

  /**
   * GitHub Trending（移植自 newsnow）
   */
  async fetchGithubTrending(): Promise<NewsItem[]> {
    logger.info('Fetching GitHub Trending')
    try {
      const html = await this.client.get('https://github.com/trending?spoken_language_code=', {
        headers: { 'Accept': 'text/html' },
        timeout: 15000,
      }).then(r => typeof r.data === 'string' ? r.data : '')

      const $ = cheerio.load(html)
      const items: NewsItem[] = []
      const $main = $('main .Box div[data-hpc] > article')

      $main.each((_, el) => {
        const a = $(el).find('>h2 a')
        const title = a.text().replace(/\n+/g, '').trim()
        const urlPath = a.attr('href')
        const star = $(el).find('[href$=stargazers]').text().replace(/\s+/g, '').trim()
        const desc = $(el).find('>p').text().replace(/\n+/g, '').trim()

        if (urlPath && title) {
          items.push({
            title,
            url: `https://github.com${urlPath}`,
            content: desc ? `⭐ ${star} — ${desc}` : `⭐ ${star}`,
            source: 'GitHub',
          })
        }
      })

      const limit = this.config.datasources.github?.limit || 20
      return items.slice(0, limit)
    } catch (error) {
      logger.error('Error fetching GitHub Trending:', error)
      return []
    }
  }

  /**
   * Solidot 最新文章（移植自 newsnow）
   */
  async fetchSolidotHot(): Promise<NewsItem[]> {
    logger.info('Fetching Solidot articles')
    try {
      const html = await this.client.get('https://www.solidot.org', {
        headers: { 'Accept': 'text/html' },
        timeout: 15000,
      }).then(r => typeof r.data === 'string' ? r.data : '')

      const $ = cheerio.load(html)
      const items: NewsItem[] = []

      $('.block_m').each((_, el) => {
        const a = $(el).find('.bg_htit a').last()
        const urlPath = a.attr('href')
        const title = a.text().trim()
        if (urlPath && title) {
          items.push({
            title,
            url: `https://www.solidot.org${urlPath}`,
            content: title,
            source: 'Solidot',
          })
        }
      })

      const limit = this.config.datasources.solidot?.limit || 20
      return items.slice(0, limit)
    } catch (error) {
      logger.error('Error fetching Solidot:', error)
      return []
    }
  }

  /**
   * 华尔街见闻快讯（移植自 newsnow）
   */
  async fetchWallstreetcnHot(): Promise<NewsItem[]> {
    logger.info('Fetching Wallstreetcn live')
    try {
      const response = await this.client.get('https://api-one.wallstcn.com/apiv1/content/lives', {
        params: { channel: 'global-channel', limit: 30 },
        headers: { 'Accept': 'application/json' },
        timeout: 15000,
      })

      const items = response.data?.data?.items || []
      const limit = this.config.datasources.wallstreetcn?.limit || 20

      return items.slice(0, limit).map((k: any) => ({
        title: k.title || k.content_text || '',
        url: k.uri || '',
        content: k.content_text || k.title || '',
        source: '华尔街见闻',
        publishedAt: k.display_time ? new Date(k.display_time * 1000).toISOString() : undefined,
      })).filter((i: NewsItem) => i.title)
    } catch (error) {
      logger.error('Error fetching Wallstreetcn:', error)
      return []
    }
  }

  /**
   * LINUX DO 今日最热（移植自 newsnow）
   */
  async fetchLinuxdoHot(): Promise<NewsItem[]> {
    logger.info('Fetching LinuxDO hot topics')
    try {
      const response = await this.client.get('https://linux.do/top/daily.json', {
        headers: { 'Accept': 'application/json' },
        timeout: 15000,
      })

      const topics = response.data?.topic_list?.topics || []
      const limit = this.config.datasources.linuxdo?.limit || 20

      return topics
        .filter((k: any) => k.visible && !k.archived && !k.pinned)
        .slice(0, limit)
        .map((k: any) => ({
          title: k.title || '',
          url: `https://linux.do/t/topic/${k.id}`,
          content: k.excerpt || k.title || '',
          source: 'LinuxDO',
          publishedAt: k.created_at || undefined,
        }))
        .filter((i: NewsItem) => i.title)
    } catch (error) {
      logger.error('Error fetching LinuxDO:', error)
      return []
    }
  }

  /**
   * FreeBuf 安全资讯（移植自 newsnow）
   */
  async fetchFreebufHot(): Promise<NewsItem[]> {
    logger.info('Fetching FreeBuf articles')
    try {
      const html = await this.client.get('https://www.freebuf.com', {
        headers: {
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
          'Referer': 'https://www.freebuf.com/',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
        },
        timeout: 15000,
      }).then(r => typeof r.data === 'string' ? r.data : '')

      const $ = cheerio.load(html)
      const items: NewsItem[] = []

      $('.article-item').each((_, el) => {
        const titleLink = $(el).find('.title-left .title').parent()
        const title = titleLink.find('.title').text().trim()
        const urlRaw = titleLink.attr('href') || ''
        const description = $(el).find('.item-right .text-line-2').first().text().trim()

        if (title) {
          const url = urlRaw.startsWith('http') ? urlRaw : `https://www.freebuf.com${urlRaw}`
          items.push({
            title,
            url,
            content: description || title,
            source: 'FreeBuf',
          })
        }
      })

      const limit = this.config.datasources.freebuf?.limit || 20
      return items.slice(0, limit)
    } catch (error) {
      logger.error('Error fetching FreeBuf:', error)
      return []
    }
  }

  /**
   * 牛客热搜（移植自 newsnow）
   */
  async fetchNowcoderHot(): Promise<NewsItem[]> {
    logger.info('Fetching Nowcoder hot topics')
    try {
      const timestamp = Date.now()
      const response = await this.client.get('https://gw-c.nowcoder.com/api/sparta/hot-search/top-hot-pc', {
        params: { size: 20, _: timestamp, t: '' },
        headers: { 'Accept': 'application/json' },
        timeout: 15000,
      })

      const result = response.data?.data?.result || []
      const limit = this.config.datasources.nowcoder?.limit || 20

      return result.slice(0, limit).map((k: any) => {
        let url: string
        if (k.type === 74) {
          url = `https://www.nowcoder.com/feed/main/detail/${k.uuid}`
        } else {
          url = `https://www.nowcoder.com/discuss/${k.id}`
        }
        return {
          title: k.title || '',
          url,
          content: k.title || '',
          source: '牛客',
        }
      }).filter((i: NewsItem) => i.title)
    } catch (error) {
      logger.error('Error fetching Nowcoder hot:', error)
      return []
    }
  }
}

export const crawler = new Crawler()
