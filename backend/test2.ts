import axios from 'axios';
import * as cheerio from 'cheerio';

axios.get('https://trends24.in/', {
  headers: {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
  }
}).then(res => {
  const $ = cheerio.load(res.data);
  const trends: any[] = [];
  $('ol.trend-card__list li').each((i, el) => {
    trends.push($(el).find('a').text().trim());
  });
  console.log('Trends24 fetching count:', trends.length);
  console.log(trends.slice(0, 10));
}).catch(console.error);