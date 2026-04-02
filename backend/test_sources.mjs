// 临时测试脚本 - 测试各数据源
import axios from 'axios'
import * as cheerio from 'cheerio'

const client = axios.create({
  timeout: 15000,
  headers: {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/json',
    'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
  },
})

const KW = 'AI'

async function testHackerNews() {
  try {
    const r = await client.get('https://hacker-news.firebaseio.com/v0/topstories.json')
    const ids = r.data.slice(0, 3)
    const stories = await Promise.all(ids.map(id => client.get(`https://hacker-news.firebaseio.com/v0/item/${id}.json`).then(r => r.data).catch(() => null)))
    const valid = stories.filter(Boolean)
    return { ok: valid.length > 0, count: valid.length, sample: valid[0]?.title }
  } catch (e) { return { ok: false, error: e.message } }
}

async function testBing() {
  try {
    const r = await client.get('https://www.bing.com/search', { params: { q: `${KW} news` } })
    const $ = cheerio.load(r.data)
    const titles = []
    $('.b_algo h2 a').each((_, el) => titles.push($(el).text().trim()))
    return { ok: titles.length > 0, count: titles.length, sample: titles[0] }
  } catch (e) { return { ok: false, error: e.message } }
}

async function testDDGApi() {
  try {
    const r = await client.get('https://api.duckduckgo.com/', {
      params: { q: KW, format: 'json', no_html: 1, no_redirect: 1 },
      headers: { Accept: 'application/json' }
    })
    const topics = r.data?.RelatedTopics || []
    const results = r.data?.Results || []
    const all = [...topics, ...results].filter(t => t.FirstURL && t.Text)
    return { ok: all.length > 0, count: all.length, sample: all[0]?.Text?.slice(0, 60) }
  } catch (e) { return { ok: false, error: e.message } }
}

async function testWeiboMobile() {
  try {
    const r = await client.get('https://m.weibo.cn/api/container/getIndex', {
      params: { containerid: `100103type=1&q=${KW}&t=0`, page_type: 'searchall' },
      headers: { Referer: 'https://m.weibo.cn/', 'X-Requested-With': 'XMLHttpRequest' }
    })
    const cards = r.data?.data?.cards || []
    let items = []
    for (const card of cards) {
      if (card.card_type === 9 && card.mblog?.text) {
        items.push(card.mblog.text.replace(/<[^>]+>/g, '').slice(0, 80))
      }
      if (card.card_type === 11 && card.card_group) {
        for (const sub of card.card_group) {
          if (sub.card_type === 9 && sub.mblog?.text) {
            items.push(sub.mblog.text.replace(/<[^>]+>/g, '').slice(0, 80))
          }
        }
      }
    }
    return { ok: items.length > 0, count: items.length, sample: items[0] }
  } catch (e) { return { ok: false, error: e.message } }
}

async function testWeiboHot() {
  try {
    const r = await client.get('https://weibo.com/ajax/side/hotSearch', { headers: { Referer: 'https://weibo.com/' } })
    const list = r.data?.data?.realtime || []
    return { ok: list.length > 0, count: list.length, sample: list[0]?.word }
  } catch (e) { return { ok: false, error: e.message } }
}

async function testBilibiliSearch() {
  try {
    const r = await client.get('https://api.bilibili.com/x/web-interface/search/all/v2', {
      params: { keyword: KW, page: 1, page_size: 5 },
      headers: { Referer: 'https://search.bilibili.com/' }
    })
    const groups = r.data?.data?.result || []
    let videoCount = 0, sample = ''
    for (const g of groups) {
      if (g.result_type === 'video') {
        videoCount = g.data?.length || 0
        sample = (g.data?.[0]?.title || '').replace(/<[^>]+>/g, '')
        break
      }
    }
    return { ok: videoCount > 0, count: videoCount, sample }
  } catch (e) { return { ok: false, error: e.message } }
}

async function testBilibiliHot() {
  try {
    const r = await client.get('https://api.bilibili.com/x/web-interface/popular', {
      params: { ps: 5, pn: 1 },
      headers: { Referer: 'https://www.bilibili.com/' }
    })
    const list = r.data?.data?.list || []
    return { ok: list.length > 0, count: list.length, sample: list[0]?.title }
  } catch (e) { return { ok: false, error: e.message } }
}

async function testSogou() {
  try {
    const r = await client.get('https://weixin.sogou.com/weixin', {
      params: { type: 2, query: KW, ie: 'utf8' },
      headers: { Referer: 'https://weixin.sogou.com/' }
    })
    const $ = cheerio.load(r.data)
    let cnt = $('div.txt-box, ul.news-list li').length
    const sample = $('div.txt-box h3 a, ul.news-list li .tit a').first().text().trim()
    return { ok: cnt > 0, count: cnt, sample }
  } catch (e) { return { ok: false, error: e.message } }
}

async function testBaiduSearch() {
  try {
    const r = await client.get('https://www.baidu.com/s', {
      params: { wd: KW, rn: 10, tn: 'news', ie: 'utf-8' },
      headers: { Referer: 'https://www.baidu.com/' }
    })
    const $ = cheerio.load(r.data)
    const titles = []
    $('div.result h3 a, h3.t a, h3 a').each((_, el) => {
      const t = $(el).text().trim()
      const href = $(el).attr('href') || ''
      if (t && href.startsWith('http') && !href.includes('baidu.com')) titles.push(t)
    })
    return { ok: titles.length > 0, count: titles.length, sample: titles[0] }
  } catch (e) { return { ok: false, error: e.message } }
}

async function testBaiduHot() {
  try {
    const r = await client.get('https://top.baidu.com/board', {
      params: { tab: 'realtime' },
      headers: { Referer: 'https://www.baidu.com/', Accept: 'text/html' }
    })
    const $ = cheerio.load(r.data)
    const titles = []
    $('div[class*="item_item"]').each((_, el) => {
      const title = $(el).find('[class*="title_title"]').first().text().trim()
        || $(el).find('a').first().text().trim()
      if (title) titles.push(title)
    })
    return { ok: titles.length > 0, count: titles.length, sample: titles[0] }
  } catch (e) { return { ok: false, error: e.message } }
}

async function testZhihu() {
  try {
    const r = await client.get('https://www.zhihu.com/api/v4/search_v3', {
      params: { t: 'general', q: KW, correction: 1, offset: 0, limit: 5, search_source: 'Normal' },
      headers: {
        Referer: `https://www.zhihu.com/search?q=${KW}`,
        'x-requested-with': 'fetch',
        'x-zse-93': '101_3_3.0',
      }
    })
    const items = r.data?.data || []
    let sample = ''
    for (const item of items) {
      const obj = item.object || {}
      sample = obj.title || obj.question?.title || ''
      if (sample) break
    }
    return { ok: items.length > 0, count: items.length, sample }
  } catch (e) { return { ok: false, error: e.message } }
}

async function testToutiaoHot() {
  try {
    const r = await client.get('https://www.toutiao.com/hot-event/hot-board/', {
      params: { origin: 'toutiao_pc' },
      headers: { Referer: 'https://www.toutiao.com/', Accept: 'application/json' }
    })
    const list = r.data?.data || []
    return { ok: list.length > 0, count: list.length, sample: list[0]?.Title || list[0]?.title }
  } catch (e) { return { ok: false, error: e.message } }
}

async function testRSS(url, name) {
  try {
    const r = await client.get(url, { headers: { Accept: 'application/rss+xml, application/xml, text/xml' } })
    const $ = cheerio.load(r.data, { xmlMode: true })
    const titles = []
    $('item title').each((_, el) => { const t = $(el).text().trim(); if (t) titles.push(t) })
    return { ok: titles.length > 0, count: titles.length, sample: titles[0]?.slice(0, 60) }
  } catch (e) { return { ok: false, error: e.message } }
}

async function testBilibiliUser() {
  try {
    const r = await client.get('https://api.bilibili.com/x/web-interface/search/type', {
      params: { search_type: 'bili_user', keyword: '影视飓风', page: 1 },
      headers: { Referer: 'https://search.bilibili.com/' }
    })
    const users = r.data?.data?.result || []
    return { ok: users.length > 0, count: users.length, sample: `${users[0]?.uname} (mid:${users[0]?.mid})` }
  } catch (e) { return { ok: false, error: e.message } }
}

async function testWeiboUser() {
  try {
    const r = await client.get('https://m.weibo.cn/api/container/getIndex', {
      params: { containerid: `100103type=3&q=人民日报`, page_type: 'searchall' },
      headers: { Referer: 'https://m.weibo.cn/', 'X-Requested-With': 'XMLHttpRequest' }
    })
    const cards = r.data?.data?.cards || []
    let uid = ''
    for (const card of cards) {
      if (card.card_type === 10 && card.user?.id) { uid = String(card.user.id); break }
      if (card.card_group) {
        for (const sub of card.card_group) {
          if (sub.user?.id) { uid = String(sub.user.id); break }
        }
      }
      if (uid) break
    }
    return { ok: !!uid, count: uid ? 1 : 0, sample: uid ? `uid: ${uid}` : '未找到' }
  } catch (e) { return { ok: false, error: e.message } }
}

const tests = [
  ['HackerNews', testHackerNews],
  ['Bing', testBing],
  ['DuckDuckGo (Instant API)', testDDGApi],
  ['微博搜索 (移动端API)', testWeiboMobile],
  ['微博热搜', testWeiboHot],
  ['B站搜索', testBilibiliSearch],
  ['B站热门', testBilibiliHot],
  ['B站UP主查询', testBilibiliUser],
  ['微博用户查询', testWeiboUser],
  ['搜狗微信', testSogou],
  ['百度搜索', testBaiduSearch],
  ['百度热搜榜', testBaiduHot],
  ['知乎搜索', testZhihu],
  ['今日头条热榜', testToutiaoHot],
  ['36氪 RSS', () => testRSS('https://36kr.com/feed', '36氪')],
  ['IT之家 RSS', () => testRSS('https://www.ithome.com/rss/', 'IT之家')],
  ['虎嗅 RSS', () => testRSS('https://www.huxiu.com/rss/0.xml', '虎嗅')],
]

console.log('=== 数据源完整测试 ===\n')
for (const [name, fn] of tests) {
  process.stdout.write(`测试 ${name}... `)
  const r = await fn()
  if (r.ok) {
    console.log(`✅ ${r.count} 条  示例: ${(r.sample || '').slice(0, 60)}`)
  } else {
    console.log(`❌ 失败: ${r.error || '无数据'}`)
  }
}
async function testBaiduHotFixed() {
  try {
    const r = await client.get('https://top.baidu.com/board', {
      params: { tab: 'realtime' },
      headers: { Referer: 'https://www.baidu.com/', Accept: 'text/html' }
    })
    const $ = cheerio.load(r.data)
    const items = []
    $('[class*="content_"] a[href]').each((_, el) => {
      const title = $(el).find('[class*="title_"]').first().text().trim() || $(el).text().trim()
      const url = $(el).attr('href') || ''
      if (title && title.length > 2 && url) items.push(title)
    })
    const seen = new Set()
    const deduped = items.filter(t => { if (seen.has(t)) return false; seen.add(t); return true })
    return { ok: deduped.length > 0, count: deduped.length, sample: deduped[0] }
  } catch (e) { return { ok: false, error: e.message } }
}

async function testZhihuHotFixed() {
  try {
    const r = await client.get('https://www.zhihu.com/billboard', {
      headers: { Referer: 'https://www.zhihu.com/', Accept: 'text/html' }
    })
    const $ = cheerio.load(r.data)
    // 尝试从 __NEXT_DATA__ 提取
    const nextData = $('#__NEXT_DATA__').text()
    if (nextData) {
      try {
        const parsed = JSON.parse(nextData)
        const hotList = parsed?.props?.pageProps?.hotList || []
        if (hotList.length > 0) {
          return { ok: true, count: hotList.length, sample: hotList[0]?.target?.title || hotList[0]?.title }
        }
      } catch(_) {}
    }
    // HTML fallback
    const titles = []
    $('div[class*="HotItem"], .HotItem').each((_, el) => {
      const title = $(el).find('h2, [class*="title"]').first().text().trim()
      if (title) titles.push(title)
    })
    return { ok: titles.length > 0, count: titles.length, sample: titles[0] }
  } catch (e) { return { ok: false, error: e.message } }
}

async function testBiliUserFixed() {
  try {
    const r = await client.get('https://api.bilibili.com/x/web-interface/search/all/v2', {
      params: { keyword: '影视飓风', page: 1, page_size: 10 },
      headers: { Referer: 'https://search.bilibili.com/' }
    })
    const groups = r.data?.data?.result || []
    const userGroup = groups.find(g => g.result_type === 'bili_user')
    const users = userGroup?.data || []
    return { ok: users.length > 0, count: users.length, sample: users[0] ? `${users[0].uname} (mid:${users[0].mid})` : '' }
  } catch (e) { return { ok: false, error: e.message } }
}

console.log('\n=== 修复后验证测试 ===\n')
const fixTests = [
  ['百度热搜榜 (修复)', testBaiduHotFixed],
  ['知乎热榜 (修复)', testZhihuHotFixed],
  ['B站UP主搜索 (修复)', testBiliUserFixed],
]
for (const [name, fn] of fixTests) {
  process.stdout.write(`测试 ${name}... `)
  const r = await fn()
  if (r.ok) {
    console.log(`✅ ${r.count} 条  示例: ${(r.sample || '').toString().slice(0, 60)}`)
  } else {
    console.log(`❌ 失败: ${r.error || '无数据'}`)
  }
}

