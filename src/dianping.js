import { compactText, toNumber } from './utils.js';

const BASE_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_2 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 dp/com.dianping.dpscope/11.63.13',
  Referer: 'https://m.dianping.com/',
  Origin: 'https://m.dianping.com'
};

const MODE_NAMES = new Map([
  [1, '聚会'],
  [2, 'V聚会'],
  [3, '电子券'],
  [4, '好礼到家'],
  [5, '天天抽奖']
]);

export class HttpError extends Error {
  constructor(message, { status, url, body = '' } = {}) {
    super(message);
    this.name = 'HttpError';
    this.status = status;
    this.url = url;
    this.body = body;
  }
}

export class DianpingClient {
  constructor({ cookie = '', timeoutMs = 15000, logger = null } = {}) {
    this.cookie = cookie;
    this.timeoutMs = timeoutMs;
    this.logger = logger;
  }

  async fetchActivities({ cityId, maxPages = 5 }) {
    const activities = [];
    for (let page = 1; page <= maxPages; page += 1) {
      this.logger?.info(`Fetching activity list page ${page}/${maxPages} for city ${cityId}`);
      const payload = { cityId, mode: '', page, type: 0 };
      const body = await this.requestJson('http://m.dianping.com/activity/static/pc/ajaxList', {
        method: 'POST',
        headers: {
          ...BASE_HEADERS,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      });

      const detail = body?.data?.detail;
      if (!Array.isArray(detail)) {
        throw new Error(`Unexpected activity list response on page ${page}`);
      }

      this.logger?.info(`Activity list page ${page} returned ${detail.length} items, hasNext=${Boolean(body.data.hasNext)}`);
      activities.push(...detail.map(normalizeActivity));
      if (!body.data.hasNext) {
        break;
      }
    }
    return activities;
  }

  async fetchActivityDetail(detailUrl) {
    if (!detailUrl) {
      return {};
    }
    const html = await this.requestText(detailUrl, {
      method: 'GET',
      headers: BASE_HEADERS
    });

    const quota = pickNumber(html, /活动名额：<\/span>\s*<strong class="col-digit">(\d+)<\/strong>/);
    const applicants = pickNumber(html, /<strong>(\d+)<\/strong>人报名/);
    const detail = {
      activityAddress: pickText(html, /活动地址：<\/span>\s*([^<\n\r]+)/),
      applyStartTime: pickText(html, /报名时间：<\/span>\s*(\d+月\d+日)/),
      applyEndTime: pickText(html, /报名时间：<\/span>.*?(\d+月\d+日).*?(\d+月\d+日)/, 2),
      activityStartTime: pickText(html, /活动时间：<\/span>\s*(\d+月\d+日)/),
      activityEndTime: pickText(html, /活动时间：<\/span>.*?(\d+月\d+日).*?(\d+月\d+日)/, 2),
      activityCount: quota,
      applyCount: applicants,
      attentionCount: pickNumber(html, /<strong>(\d+)<\/strong>人关注/),
      passCount: pickText(html, /支持pass卡（剩余(\d+)个）/) || '不支持',
      winningRate: applicants > 0 ? Number(((quota / applicants) * 100).toFixed(2)) : 0
    };
    if (!detail.activityCount && !detail.applyCount && !detail.activityAddress) {
      detail.detailError = '详情页未匹配到活动字段，可能是页面结构变化或风控返回';
    }
    return detail;
  }

  mobileHeaders() {
    return {
      ...BASE_HEADERS,
      Cookie: this.cookie,
      Accept: 'application/json, text/plain, */*'
    };
  }

  async requestJson(url, options) {
    const text = await this.requestText(url, options);
    try {
      return JSON.parse(text);
    } catch (error) {
      throw new Error(`Invalid JSON from ${sanitizeUrl(url)}: ${compactText(text)}`);
    }
  }

  async requestText(url, options) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const response = await fetch(url, {
        ...options,
        signal: controller.signal
      });
      const text = await response.text();
      if (!response.ok) {
        throw new HttpError(`HTTP ${response.status} from ${sanitizeUrl(url)}: ${compactText(text)}`, {
          status: response.status,
          url: sanitizeUrl(url),
          body: text
        });
      }
      return text;
    } finally {
      clearTimeout(timer);
    }
  }
}

export function activityIdFromUrl(detailUrl) {
  const match = String(detailUrl || '').match(/\/event\/([^/?#]+)/);
  return match?.[1] || '';
}

export function normalizeActivity(activity) {
  const modeValue = toNumber(activity.mode, 0);
  return {
    activityTitle: activity.activityTitle || '',
    detailUrl: activity.detailUrl || '',
    mode: MODE_NAMES.get(modeValue) || String(activity.mode || ''),
    regionName: activity.regionName || '',
    raw: activity
  };
}

export function shouldApply(activity, filters) {
  const title = activity.activityTitle || '';
  if (filters.includeKeywords.length > 0 && !filters.includeKeywords.some((word) => title.includes(word))) {
    return false;
  }
  if (filters.excludeKeywords.some((word) => title.includes(word))) {
    return false;
  }
  if (filters.modes.length > 0 && !filters.modes.includes(activity.mode)) {
    return false;
  }
  if (toNumber(activity.winningRate, 0) < filters.minWinningRate) {
    return false;
  }
  return true;
}

function sanitizeUrl(url) {
  try {
    const parsed = new URL(url);
    for (const key of ['token', 'cookie', 'passCardNo']) {
      if (parsed.searchParams.has(key)) {
        parsed.searchParams.set(key, '[REDACTED]');
      }
    }
    return parsed.toString();
  } catch {
    return String(url).replace(/([?&](?:token|cookie|passCardNo)=)[^&\s]+/gi, '$1[REDACTED]');
  }
}

function pickText(html, regexp, group = 1) {
  return compactText(html.match(regexp)?.[group] || '', 120);
}

function pickNumber(html, regexp) {
  return toNumber(html.match(regexp)?.[1], 0);
}
