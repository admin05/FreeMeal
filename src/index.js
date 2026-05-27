import { loadConfig } from './config.js';
import { DianpingClient, shouldApply } from './dianping.js';
import { notifyBark } from './notifier.js';
import { writeReports } from './report.js';
import { compactText, createLogger } from './utils.js';

const logger = createLogger();

async function main() {
  logger.info('Script started');
  const config = await loadConfig();
  const client = new DianpingClient({ cookie: config.cookie, logger });

  logger.info([
    `Config loaded: city=${config.cityName || config.cityId}`,
    `maxPages=${config.maxPages}`,
    `maxResults=${config.maxResults}`,
    `cookie=${config.cookie ? 'configured' : 'missing'}`,
    `bark=${config.bark ? 'configured' : 'missing'}`
  ].join(', '));

  logger.info(`Fetching activities for city ${config.cityName || config.cityId}`);
  const list = await client.fetchActivities({
    cityId: config.cityId,
    maxPages: config.maxPages
  });
  logger.info(`Fetched ${list.length} activities`);

  const records = [];
  const summary = {
    city: config.cityName || config.cityId,
    total: list.length,
    matched: 0,
    skipped: 0
  };

  for (const [index, activity] of list.entries()) {
    logger.info(`Processing ${index + 1}/${list.length}: ${compactText(activity.activityTitle, 60)}`);
    const detail = await safeFetchDetail(client, activity.detailUrl);
    const record = {
      index: index + 1,
      ...activity,
      ...detail,
      applied: Boolean(activity.applied || detail.applied),
      discoveryStatus: 'skipped',
      discoveryMessage: ''
    };

    if (record.applied) {
      record.discoveryMessage = '已报名，跳过';
      summary.skipped += 1;
      logger.info(`Skipped already applied: ${compactText(record.activityTitle, 60)}`);
      records.push(record);
      continue;
    }

    if (config.excludeActivityIds.includes(String(record.offlineActivityId))) {
      record.discoveryMessage = '已在 FREEMEAL_EXCLUDE_IDS 中手动排除';
      summary.skipped += 1;
      logger.info(`Skipped by exclude ids: ${compactText(record.activityTitle, 60)}`);
      records.push(record);
      continue;
    }

    if (!shouldApply(record, config.filters)) {
      record.discoveryMessage = '过滤规则跳过';
      summary.skipped += 1;
      logger.info(`Skipped by filters: ${compactText(record.activityTitle, 60)}`);
      records.push(record);
      continue;
    }

    if (summary.matched >= config.maxResults) {
      record.discoveryMessage = '超过 maxResults 限制';
      summary.skipped += 1;
      logger.info(`Skipped by maxResults limit: ${compactText(record.activityTitle, 60)}`);
      records.push(record);
      continue;
    }

    summary.matched += 1;
    record.discoveryStatus = 'matched';
    record.discoveryMessage = buildMatchMessage(record);
    logger.info(`Matched: ${compactText(record.activityTitle, 60)} - ${record.discoveryMessage}`);
    records.push(record);
  }

  const paths = await writeReports({ reportDir: config.reportDir, records, summary });
  logger.info(`Reports written: ${paths.csvPath}, ${paths.jsonPath}`);
  const notification = buildNotification(summary, records, paths);
  logger.info(`Run summary:\n${notification.body}`);

  try {
    logger.info('Sending Bark notification');
    await notifyBark({
      bark: config.bark,
      title: notification.title,
      body: notification.body,
      url: notification.url
    });
    logger.info('Bark notification finished');
  } catch (error) {
    logger.error(`Bark notification failed: ${error.message}`);
  }

  logger.info('Script finished');
}

async function safeFetchDetail(client, detailUrl) {
  try {
    return await client.fetchActivityDetail(detailUrl);
  } catch (error) {
    return {
      detailError: error.message,
      winningRate: 0
    };
  }
}

function buildNotification(summary, records, paths) {
  const matchedRecords = records.filter((record) => record.discoveryStatus === 'matched');
  const preview = matchedRecords
    .slice(0, 8)
    .map((record) => {
      const parts = [
        `${record.index}. ${compactText(record.activityTitle, 24)}`,
        record.regionName ? `商圈：${compactText(record.regionName, 12)}` : '',
        record.winningRate ? `中奖率：${record.winningRate}%` : '',
        record.applyCount ? `报名：${record.applyCount}` : '',
        record.appDetailUrl ? `打开：${record.appDetailUrl}` : (record.detailUrl ? `链接：${record.detailUrl}` : '')
      ].filter(Boolean);
      return parts.join(' | ');
    })
    .join('\n');

  const title = summary.matched > 0 ? `大众点评免费试发现 ${summary.matched} 个` : '大众点评免费试无匹配';
  const lines = [
    `城市：${summary.city}`,
    `活动：${summary.total}，匹配：${summary.matched}，跳过：${summary.skipped}`,
    '状态：仅发现和通知，未提交报名',
    preview ? `\n匹配活动：\n${preview}` : '\n本次没有符合过滤条件的活动。',
    `\n报告：${paths.csvPath}`
  ];
  const body = truncate(lines.filter(Boolean).join('\n'), 900);

  return {
    title,
    body,
    url: matchedRecords[0]?.appDetailUrl || matchedRecords[0]?.detailUrl || ''
  };
}

function buildMatchMessage(record) {
  const parts = [
    record.winningRate ? `中奖率 ${record.winningRate}%` : '',
    record.applyCount ? `报名 ${record.applyCount}` : '',
    record.activityCount ? `名额 ${record.activityCount}` : '',
    record.regionName ? `商圈 ${record.regionName}` : ''
  ].filter(Boolean);
  return parts.join('，') || '符合筛选条件';
}

function truncate(text, maxLength) {
  if (text.length <= maxLength) {
    return text;
  }
  return `${text.slice(0, maxLength - 3)}...`;
}

main().catch(async (error) => {
  logger.error(error.stack || error.message);
  try {
    const config = await loadConfig([]);
    await notifyBark({
      bark: config.bark,
      title: '大众点评免费试发现失败',
      body: error.message
    });
  } catch {
    // Keep the original failure as the process result.
  }
  process.exitCode = 1;
});
